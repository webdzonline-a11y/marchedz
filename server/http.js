// HTTP plumbing: cookies, sessions, CSRF (double-submit), rate limiting, validation, uploads.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { db, DATA_DIR } = require('./db');
const { fail, sha256, can, isStaff, AppError } = require('./lib');

const PROD = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 30;
const PRIVATE_DIR = path.join(DATA_DIR, 'private'); fs.mkdirSync(PRIVATE_DIR, { recursive: true });
// uploaded product/category/logo images; set UPLOADS_DIR to a persistent volume in production (bundled demo images stay in public/uploads)
const PUBLIC_UPLOADS = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(__dirname, '..', 'public', 'uploads'); fs.mkdirSync(path.join(PUBLIC_UPLOADS, 'products'), { recursive: true });

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { } } });
  return out;
}
function setCookie(res, name, value, { maxAge, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');
  if (PROD) parts.push('Secure');
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  const prev = res.getHeader('Set-Cookie'); const arr = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader('Set-Cookie', [...arr, parts.join('; ')]);
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

function sessionMiddleware(req, res, next) {
  req.cookies = parseCookies(req);
  if (!req.cookies.mdz_csrf) { req.cookies.mdz_csrf = crypto.randomBytes(24).toString('hex'); setCookie(res, 'mdz_csrf', req.cookies.mdz_csrf, { httpOnly: false, maxAge: 60 * 60 * 24 * 365 }); }
  const tok = req.cookies.mdz_sid;
  if (tok) {
    const row = db.prepare(`SELECT u.*, s.id AS session_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > datetime('now')`).get(sha256(tok));
    if (row && row.status === 'active') { delete row.password_hash; req.user = row; }
  }
  next();
}
function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO sessions(token_hash,user_id,ip,ua,expires_at) VALUES (?,?,?,?, datetime('now', '+${SESSION_DAYS} days'))`).run(sha256(token), userId, req.ip, String(req.headers['user-agent'] || '').slice(0, 200));
  setCookie(res, 'mdz_sid', token, { maxAge: SESSION_DAYS * 86400 });
  // rotate CSRF token on login
  const csrf = crypto.randomBytes(24).toString('hex'); setCookie(res, 'mdz_csrf', csrf, { httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
}
function destroySession(req, res) {
  if (req.cookies.mdz_sid) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(req.cookies.mdz_sid));
  setCookie(res, 'mdz_sid', '', { maxAge: 0 });
}

function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const h = req.headers['x-csrf-token'];
  if (!h || !req.cookies.mdz_csrf || h.length !== req.cookies.mdz_csrf.length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(req.cookies.mdz_csrf))) {
    return res.status(403).json({ error: 'csrf_failed' });
  }
  next();
}

// in-memory sliding window limiter (per process)
const buckets = new Map();
function hit(key, max, windowMs) {
  const t = Date.now(); const arr = (buckets.get(key) || []).filter(x => t - x < windowMs);
  arr.push(t); buckets.set(key, arr);
  return arr.length <= max;
}
setInterval(() => { const t = Date.now(); for (const [k, a] of buckets) if (!a.length || t - a[a.length - 1] > 3600000) buckets.delete(k); }, 600000).unref();
const limit = (name, max, windowMs, keyFn) => (req, res, next) => {
  const key = `${name}:${keyFn ? keyFn(req) : (req.user?.id || req.ip)}`;
  if (!hit(key, max, windowMs)) return res.status(429).json({ error: 'rate_limited' });
  next();
};

const requireAuth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'auth_required' });
const requireStaff = (req, res, next) => isStaff(req.user) ? next() : res.status(req.user ? 403 : 401).json({ error: req.user ? 'forbidden' : 'auth_required' });
const requirePerm = perm => (req, res, next) => can(req.user, perm) ? next() : res.status(403).json({ error: 'forbidden' });

// async wrapper + error handler
const wrap = fn => (req, res, next) => { try { const r = fn(req, res, next); if (r && r.catch) r.catch(next); } catch (e) { next(e); } };
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.code, ...(err.extra || {}) });
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'file_too_large' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
  if (err && /SQLITE_CONSTRAINT/.test(err.code || '')) {
    console.warn('[constraint]', err.message);
    return res.status(409).json({ error: String(err.message).includes('UNIQUE') ? 'duplicate' : 'constraint_failed' });
  }
  console.error('[error]', req.method, req.originalUrl, err);
  res.status(500).json({ error: 'server_error' }); // never leak internals
}

// ---------- validation ----------
const V = {
  str(v, { min = 0, max = 500, field = 'field', optional = false } = {}) {
    if (v == null || v === '') { if (optional) return null; fail(400, 'required', { field }); }
    const s = String(v).trim();
    if (s.length < min || s.length > max) fail(400, 'invalid_length', { field, min, max });
    return s;
  },
  int(v, { min = -Infinity, max = Infinity, field = 'field', optional = false } = {}) {
    if (v == null || v === '') { if (optional) return null; fail(400, 'required', { field }); }
    const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) fail(400, 'invalid_number', { field });
    return n;
  },
  money(v, { field = 'amount', optional = false, min = 0 } = {}) { // decimal string/number → minor units
    if (v == null || v === '') { if (optional) return null; fail(400, 'required', { field }); }
    const s = String(v).replace(',', '.').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(s)) fail(400, 'invalid_amount', { field });
    const [a, b = ''] = s.split('.'); const m = parseInt(a, 10) * 100 + parseInt((b + '00').slice(0, 2), 10);
    if (m < min) fail(400, 'invalid_amount', { field });
    return m;
  },
  email(v) { const s = V.str(v, { max: 160, field: 'email' }).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) fail(400, 'invalid_email'); return s; },
  phone(v, field = 'phone') { const s = String(v || '').replace(/[\s.-]/g, ''); if (!/^(\+213|00213|0)(5|6|7)\d{8}$/.test(s) && !/^(\+213|0)(2|3|4)\d{7}$/.test(s)) fail(400, 'invalid_phone', { field }); return s.replace(/^(\+213|00213)/, '0'); },
  password(v) { const s = String(v || ''); if (s.length < 8 || s.length > 128 || !/[A-Za-z]/.test(s) || !/\d/.test(s)) fail(400, 'weak_password'); return s; },
  oneOf(v, list, field = 'field') { if (!list.includes(v)) fail(400, 'invalid_value', { field }); return v; },
  date(v, { optional = true, field = 'date' } = {}) {
    if (v == null || v === '') { if (optional) return null; fail(400, 'required', { field }); }
    const d = new Date(v); if (isNaN(d)) fail(400, 'invalid_date', { field });
    return d.toISOString().replace('T', ' ').slice(0, 19);
  },
};

// ---------- uploads ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 10 } });
const isPdf = buf => buf.slice(0, 5).toString() === '%PDF-';
/** Stores a private file (receipt / ticket attachment). Images are re-encoded (strips metadata & payloads). */
async function savePrivateFile(file, ownerId, purpose) {
  if (!file) return null;
  let buf, mime, ext;
  if (isPdf(file.buffer)) { buf = file.buffer; mime = 'application/pdf'; ext = 'pdf'; }
  else {
    try { buf = await sharp(file.buffer).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(); }
    catch { fail(400, 'invalid_file_type'); }
    mime = 'image/jpeg'; ext = 'jpg';
  }
  const name = `${purpose}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(PRIVATE_DIR, name), buf);
  return db.prepare('INSERT INTO files(owner_id,purpose,path,mime,size,original_name) VALUES (?,?,?,?,?,?)')
    .run(ownerId, purpose, name, mime, buf.length, String(file.originalname || '').slice(0, 120)).lastInsertRowid;
}
async function savePublicImage(file, folder = 'products', size = 1000) {
  const base = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  try {
    const img = sharp(file.buffer).rotate().flatten({ background: '#ffffff' });
    await img.clone().resize(size, size, { fit: 'contain', background: '#ffffff' }).webp({ quality: 84 }).toFile(path.join(PUBLIC_UPLOADS, base + '.webp'));
    await img.clone().resize(400, 400, { fit: 'contain', background: '#ffffff' }).webp({ quality: 78 }).toFile(path.join(PUBLIC_UPLOADS, base + '-t.webp'));
  } catch { fail(400, 'invalid_image'); }
  return { path: `/uploads/${base}.webp`, thumb: `/uploads/${base}-t.webp` };
}

module.exports = { PROD, PRIVATE_DIR, PUBLIC_UPLOADS, parseCookies, setCookie, securityHeaders, sessionMiddleware, createSession, destroySession, csrfProtect, limit, hit,
  requireAuth, requireStaff, requirePerm, wrap, errorHandler, V, upload, savePrivateFile, savePublicImage };
