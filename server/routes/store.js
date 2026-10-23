// Public storefront + customer account API.
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const L = require('../lib');
const H = require('../http');
const mailer = require('../mailer');
const { V, wrap, requireAuth, limit } = H;
const { fail } = L;

const r = express.Router();

// ---------- catalog helpers ----------
const EFF = `CASE WHEN p.sale_price IS NOT NULL AND p.sale_price < p.price AND (p.sale_start IS NULL OR p.sale_start <= datetime('now')) AND (p.sale_end IS NULL OR p.sale_end >= datetime('now')) THEN p.sale_price ELSE p.price END`;
const BASE = `SELECT p.*, ${EFF} AS eff,
  (SELECT COALESCE(SUM(stock),0) FROM variants v WHERE v.product_id=p.id AND v.active=1) AS stock_total,
  (SELECT thumb FROM product_images i WHERE i.product_id=p.id ORDER BY is_main DESC, sort LIMIT 1) AS thumb,
  (SELECT thumb FROM product_images i WHERE i.product_id=p.id ORDER BY is_main DESC, sort LIMIT 1 OFFSET 1) AS thumb2
  FROM products p WHERE p.status='published'`;
let bestCache = { t: 0, ids: new Set() };
function bestIds() {
  if (Date.now() - bestCache.t > 300000) bestCache = { t: Date.now(), ids: new Set(db.prepare(`SELECT id FROM products WHERE status='published' AND sold_count>0 ORDER BY sold_count DESC LIMIT 12`).all().map(x => x.id)) };
  return bestCache.ids;
}
function card(p, withVariants = true) {
  const newDays = L.SI('new_days') || 30;
  const isNew = (Date.now() - new Date(p.created_at.replace(' ', 'T') + 'Z').getTime()) / 86400000 <= newDays;
  const o = {
    id: p.id, slug: p.slug, name_ar: p.name_ar, name_en: p.name_en, brand: p.brand, price: p.price, eff: p.eff,
    discount: L.discountPct(p.price, p.eff), rating: p.rating_avg, rating_count: p.rating_count, stock: p.stock_total,
    thumb: p.thumb, thumb2: p.thumb2, is_new: isNew, is_best: bestIds().has(p.id), sold: p.sold_count, category_id: p.category_id,
  };
  if (withVariants) o.variants = db.prepare('SELECT id,color,size,stock,price_delta FROM variants WHERE product_id=? AND active=1 ORDER BY id').all(p.id);
  return o;
}

function listProducts(qs, user) {
  const where = []; const params = [];
  let corrected = null;
  const q = L.normalize(qs.q || '');
  const buildQ = tokens => {
    const w = []; const pr = [];
    for (const t of tokens) {
      const syn = L.SYNONYMS[t];
      if (syn) { w.push('(search_text LIKE ? OR search_text LIKE ?)'); pr.push(`%${t}%`, `%${syn}%`); }
      else { w.push('search_text LIKE ?'); pr.push(`%${t}%`); }
    }
    return { w, pr };
  };
  let tokens = q ? q.split(' ').filter(Boolean).slice(0, 8) : [];
  if (tokens.length) {
    const cnt = (() => { const { w, pr } = buildQ(tokens); return db.prepare(`SELECT COUNT(*) n FROM products WHERE status='published' AND ${w.join(' AND ')}`).get(...pr).n; })();
    if (!cnt) { const fixed = tokens.map(L.correctToken); if (fixed.join(' ') !== tokens.join(' ')) { corrected = fixed.join(' '); tokens = fixed; } }
    const { w, pr } = buildQ(tokens); where.push(...w); params.push(...pr);
  }
  let category = null;
  if (qs.cat) {
    category = db.prepare('SELECT * FROM categories WHERE slug=? OR id=?').get(String(qs.cat), Number(qs.cat) || -1);
    if (category) { const ids = L.categoryDescendants(category.id); where.push(`category_id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
  }
  const brandWhere = [...where]; const brandParams = [...params];
  if (qs.brand) { const b = String(qs.brand).split(',').filter(Boolean).slice(0, 20); where.push(`brand IN (${b.map(() => '?').join(',')})`); params.push(...b); }
  if (qs.min) { where.push('eff >= ?'); params.push(Math.round(Number(qs.min) * 100) || 0); }
  if (qs.max) { where.push('eff <= ?'); params.push(Math.round(Number(qs.max) * 100) || 0); }
  if (qs.instock === '1') where.push('stock_total > 0');
  if (qs.rating) { where.push('rating_avg >= ?'); params.push(Number(qs.rating) || 0); }
  if (qs.deal === '1' || qs.collection === 'deals') where.push('eff < price');
  if (qs.collection === 'new') { where.push(`created_at >= datetime('now', ?)`); params.push(`-${L.SI('new_days') || 30} days`); }
  if (qs.collection === 'featured') where.push('featured = 1');
  if (qs.collection === 'best') where.push('sold_count > 0');
  if (qs.exclude) { where.push('id <> ?'); params.push(Number(qs.exclude) || 0); }
  let recCats = null;
  if (qs.collection === 'recommended' && user) {
    recCats = db.prepare(`SELECT DISTINCT p.category_id c FROM favorites f JOIN products p ON p.id=f.product_id WHERE f.user_id=?
      UNION SELECT DISTINCT p.category_id FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id WHERE o.user_id=?`).all(user.id, user.id).map(x => x.c).filter(Boolean);
  }
  const sorts = { newest: 'created_at DESC', price_asc: 'eff ASC', price_desc: 'eff DESC', best: 'sold_count DESC', rating: 'rating_avg DESC, rating_count DESC', discount: '(price - eff) * 1.0 / price DESC' };
  let order = sorts[qs.sort] || (qs.collection === 'best' ? sorts.best : qs.collection === 'new' ? sorts.newest : qs.collection === 'deals' ? sorts.discount : 'featured DESC, sold_count DESC, id DESC');
  if (recCats && recCats.length) order = `CASE WHEN category_id IN (${recCats.map(Number).join(',')}) THEN 0 ELSE 1 END, rating_avg DESC, id DESC`;
  else if (qs.collection === 'recommended') order = 'rating_avg * (featured + 1) DESC, id DESC';
  const lim = Math.min(48, Math.max(1, parseInt(qs.limit, 10) || 24));
  const page = Math.max(1, parseInt(qs.page, 10) || 1);
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sub = `SELECT * FROM (${BASE}) ${W}`;
  const total = db.prepare(`SELECT COUNT(*) n FROM (${sub})`).get(...params).n;
  const rows = db.prepare(`${sub} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, lim, (page - 1) * lim);
  let facets = null;
  if (qs.facets === '1') {
    const BW = brandWhere.length ? 'WHERE ' + brandWhere.join(' AND ') : '';
    facets = {
      brands: db.prepare(`SELECT brand, COUNT(*) n FROM (${BASE}) ${BW} ${BW ? 'AND' : 'WHERE'} brand IS NOT NULL GROUP BY brand ORDER BY n DESC LIMIT 30`).all(...brandParams),
      price: db.prepare(`SELECT MIN(eff) min, MAX(eff) max FROM (${BASE}) ${BW}`).get(...brandParams),
      categories: db.prepare(`SELECT c.id, c.slug, c.name_ar, c.name_en, (SELECT COUNT(*) FROM (${BASE}) x ${BW} ${BW ? 'AND' : 'WHERE'} x.category_id IN (WITH RECURSIVE d(id) AS (SELECT c.id UNION ALL SELECT k.id FROM categories k JOIN d ON k.parent_id=d.id) SELECT id FROM d)) n
        FROM categories c WHERE c.visible=1 AND ${category ? 'c.parent_id = ?' : 'c.parent_id IS NULL'} ORDER BY c.sort`).all(...brandParams, ...(category ? [category.id] : [])).filter(c => c.n > 0),
    };
  }
  return { items: rows.map(p => card(p)), total, page, pages: Math.ceil(total / lim), corrected, category, facets };
}

function categoryTree(all = false) {
  const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.status='published') AS direct FROM categories c ${all ? '' : 'WHERE visible=1'} ORDER BY sort, id`).all();
  const map = new Map(rows.map(c => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of map.values()) { if (c.parent_id && map.has(c.parent_id)) map.get(c.parent_id).children.push(c); else if (!c.parent_id) roots.push(c); }
  const count = n => (n.count = n.direct + n.children.reduce((s, c) => s + count(c), 0));
  roots.forEach(count);
  return roots;
}

function meUser(u) {
  if (!u) return null;
  const w = db.prepare('SELECT available, held FROM wallets WHERE user_id=?').get(u.id) || { available: 0, held: 0 };
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, verified: !!u.email_verified_at, lang: u.lang, currency: u.currency, avatar: u.avatar,
    wallet: w, cart_count: db.prepare('SELECT COALESCE(SUM(qty),0) n FROM cart_items WHERE user_id=?').get(u.id).n,
    fav_ids: db.prepare('SELECT product_id FROM favorites WHERE user_id=?').all(u.id).map(x => x.product_id),
    unread: db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL').get(u.id).n };
}

// ---------- public ----------
r.get('/bootstrap', wrap((req, res) => {
  res.json({ settings: L.publicSettings(), categories: categoryTree(), user: meUser(req.user), mail_configured: mailer.configured() });
}));
r.get('/products', wrap((req, res) => res.json(listProducts(req.query, req.user))));
r.get('/suggest', limit('suggest', 120, 60000), wrap((req, res) => {
  const q = String(req.query.q || '').slice(0, 80);
  if (L.normalize(q).length < 2) return res.json({ items: [], categories: [], corrected: null });
  const out = listProducts({ q, limit: 6, sort: 'best' }, null);
  const nq = L.normalize(out.corrected || q);
  const cats = db.prepare(`SELECT id, slug, name_ar, name_en, icon FROM categories WHERE visible=1`).all()
    .filter(c => L.normalize(c.name_ar + ' ' + c.name_en).includes(nq)).slice(0, 4);
  res.json({ items: out.items.map(({ variants, ...x }) => x), categories: cats, corrected: out.corrected, total: out.total });
}));
r.get('/products/:slug', wrap((req, res) => {
  const p = db.prepare(`SELECT * FROM (${BASE}) WHERE slug=?`).get(req.params.slug);
  if (!p) fail(404, 'not_found');
  const images = db.prepare('SELECT id, path, thumb FROM product_images WHERE product_id=? ORDER BY is_main DESC, sort').all(p.id);
  const variants = db.prepare('SELECT id,color,size,stock,price_delta,sku FROM variants WHERE product_id=? AND active=1 ORDER BY id').all(p.id);
  const crumbs = L.categoryAncestors(p.category_id).reverse().map(id => db.prepare('SELECT id,slug,name_ar,name_en FROM categories WHERE id=?').get(id));
  const reviews = db.prepare('SELECT id,name,rating,comment,verified,created_at FROM reviews WHERE product_id=? AND visible=1 ORDER BY created_at DESC, id DESC LIMIT 30').all(p.id);
  const dist = [5, 4, 3, 2, 1].map(s => ({ s, n: db.prepare('SELECT COUNT(*) n FROM reviews WHERE product_id=? AND visible=1 AND rating=?').get(p.id, s).n }));
  const similar = listProducts({ cat: crumbs.length > 1 ? crumbs[crumbs.length - 1].id : p.category_id, exclude: p.id, limit: 10, sort: 'best' }, null).items;
  let canReview = false;
  if (req.user) {
    const bought = db.prepare(`SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.user_id=? AND oi.product_id=? AND o.status IN ('delivered','refunded','returned') LIMIT 1`).get(req.user.id, p.id);
    const reviewed = db.prepare('SELECT 1 FROM reviews WHERE product_id=? AND user_id=?').get(p.id, req.user.id);
    canReview = !!bought && !reviewed;
  }
  res.json({ ...card(p, false), desc_ar: p.desc_ar, desc_en: p.desc_en, specs: JSON.parse(p.specs || '[]'), images, variants, crumbs, reviews, dist,
    similar, warranty_ar: p.warranty_ar, warranty_en: p.warranty_en, returnable: !!p.returnable, weight_g: p.weight_g, can_review: canReview, sale_end: p.eff < p.price ? p.sale_end : null });
}));
r.get('/wilayas', wrap((req, res) => res.json(db.prepare('SELECT id, code, name_ar, name_en FROM wilayas WHERE active=1 ORDER BY id').all())));
r.get('/wilayas/:id/communes', wrap((req, res) => res.json(db.prepare('SELECT id, name_ar, name_en, daira_ar, daira_en FROM communes WHERE wilaya_id=? AND active=1 ORDER BY name_en').all(Number(req.params.id)))));
r.post('/shipping/estimate', wrap((req, res) => {
  const w = V.int(req.body.wilaya_id, { field: 'wilaya_id' }); const c = V.int(req.body.commune_id, { optional: true, field: 'commune_id' }) || 0;
  const weight = Math.max(0, Math.min(1e7, Number(req.body.weight_g) || 0));
  res.json({ home: L.shippingOptions(w, c, 'home', weight), office: L.shippingOptions(w, c, 'office', weight) });
}));
function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 60).map(i => ({ variant_id: Number(i.variant_id), qty: Number(i.qty) })).filter(i => Number.isInteger(i.variant_id) && i.variant_id > 0);
}
const cartItemsOf = uid => db.prepare('SELECT variant_id, qty FROM cart_items WHERE user_id=? ORDER BY added_at').all(uid);
r.post('/cart/quote', limit('quote', 120, 60000), wrap((req, res) => {
  const b = req.body || {};
  const items = b.source === 'cart' && req.user ? cartItemsOf(req.user.id) : cleanItems(b.items);
  res.json(L.quote({ items, userId: req.user?.id, couponCode: b.coupon ? String(b.coupon).slice(0, 40) : null,
    wilayaId: Number(b.wilaya_id) || null, communeId: Number(b.commune_id) || null, method: ['home', 'office'].includes(b.method) ? b.method : null, carrierId: Number(b.carrier_id) || null }));
}));
r.get('/pages/:slug', wrap((req, res) => { const p = db.prepare('SELECT * FROM pages WHERE slug=?').get(req.params.slug); if (!p) fail(404, 'not_found'); res.json(p); }));
r.get('/faqs', wrap((req, res) => res.json(db.prepare('SELECT * FROM faqs ORDER BY grp, sort').all())));

// ---------- auth ----------
const genCode = () => String(crypto.randomInt(100000, 1000000));
async function issueCode(user, purpose) {
  db.prepare(`UPDATE verification_codes SET used_at=datetime('now') WHERE user_id=? AND purpose=? AND used_at IS NULL`).run(user.id, purpose);
  const code = genCode();
  db.prepare(`INSERT INTO verification_codes(user_id,purpose,code_hash,expires_at) VALUES (?,?,?, datetime('now','+20 minutes'))`).run(user.id, purpose, L.sha256(code + ':' + user.id));
  const subj = purpose === 'verify_email' ? 'Marché DZ — رمز تأكيد البريد / Email verification code' : 'Marché DZ — رمز استعادة كلمة المرور / Password reset code';
  await mailer.send(user.email, subj, `رمزك: ${code}\nYour code: ${code}\n(صالح 20 دقيقة / valid for 20 minutes)`);
  return (!H.PROD && !mailer.configured()) ? code : undefined; // dev only: no mail server configured
}
function checkCode(userId, purpose, code) {
  const row = db.prepare(`SELECT * FROM verification_codes WHERE user_id=? AND purpose=? AND used_at IS NULL AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`).get(userId, purpose);
  if (!row) fail(400, 'code_expired');
  if (row.attempts >= 5) fail(429, 'too_many_attempts');
  if (row.code_hash !== L.sha256(String(code || '').trim() + ':' + userId)) { db.prepare('UPDATE verification_codes SET attempts=attempts+1 WHERE id=?').run(row.id); fail(400, 'code_invalid'); }
  db.prepare(`UPDATE verification_codes SET used_at=datetime('now') WHERE id=?`).run(row.id);
}
r.post('/auth/register', limit('register', 6, 3600000, req => req.ip), wrap(async (req, res) => {
  const name = V.str(req.body.name, { min: 2, max: 80, field: 'name' });
  const email = V.email(req.body.email); const phone = V.phone(req.body.phone); const password = V.password(req.body.password);
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) fail(409, 'email_taken');
  if (db.prepare('SELECT 1 FROM users WHERE phone=?').get(phone)) fail(409, 'phone_taken');
  const lang = req.body.lang === 'en' ? 'en' : 'ar';
  const id = db.prepare('INSERT INTO users(name,email,phone,password_hash,lang) VALUES (?,?,?,?,?)').run(name, email, phone, await bcrypt.hash(password, 11), lang).lastInsertRowid;
  L.ensureWallet(id);
  H.createSession(req, res, id);
  const devCode = await issueCode({ id, email }, 'verify_email');
  res.json({ ok: true, dev_code: devCode });
}));
r.post('/auth/login', limit('login-ip', 30, 900000, req => req.ip), wrap(async (req, res) => {
  const id = String(req.body.email || '').trim().toLowerCase();
  if (!H.hit(`login:${id}`, 10, 900000)) fail(429, 'rate_limited');
  const u = db.prepare('SELECT * FROM users WHERE email=? OR phone=?').get(id, id.replace(/[\s.-]/g, ''));
  if (u && u.locked_until && u.locked_until > L.now()) fail(429, 'account_locked');
  const ok = u && await bcrypt.compare(String(req.body.password || ''), u.password_hash);
  if (!ok) {
    if (u) db.prepare(`UPDATE users SET failed_logins=failed_logins+1, locked_until=CASE WHEN failed_logins+1>=8 THEN datetime('now','+15 minutes') ELSE locked_until END WHERE id=?`).run(u.id);
    fail(401, 'invalid_credentials');
  }
  if (u.status !== 'active') fail(403, 'account_suspended');
  db.prepare('UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=?').run(u.id);
  H.createSession(req, res, u.id);
  res.json({ ok: true, role: u.role });
}));
r.post('/auth/logout', wrap((req, res) => { H.destroySession(req, res); res.json({ ok: true }); }));
r.post('/auth/forgot', limit('forgot', 5, 3600000, req => req.ip), wrap(async (req, res) => {
  const email = V.email(req.body.email);
  const u = db.prepare('SELECT id, email FROM users WHERE email=?').get(email);
  let devCode;
  if (u) devCode = await issueCode(u, 'reset_password');
  res.json({ ok: true, dev_code: devCode }); // same response whether or not the account exists
}));
r.post('/auth/reset', limit('reset', 10, 3600000, req => req.ip), wrap(async (req, res) => {
  const email = V.email(req.body.email); const password = V.password(req.body.password);
  const u = db.prepare('SELECT id FROM users WHERE email=?').get(email); if (!u) fail(400, 'code_invalid');
  checkCode(u.id, 'reset_password', req.body.code);
  db.prepare(`UPDATE users SET password_hash=?, failed_logins=0, locked_until=NULL, updated_at=datetime('now') WHERE id=?`).run(await bcrypt.hash(password, 11), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
  res.json({ ok: true });
}));
r.post('/auth/verify', requireAuth, limit('verify', 10, 900000), wrap((req, res) => {
  checkCode(req.user.id, 'verify_email', req.body.code);
  db.prepare(`UPDATE users SET email_verified_at=datetime('now') WHERE id=?`).run(req.user.id);
  res.json({ ok: true });
}));
r.post('/auth/verify/resend', requireAuth, limit('resend', 3, 900000), wrap(async (req, res) => res.json({ ok: true, dev_code: await issueCode(req.user, 'verify_email') })));
r.get('/me', wrap((req, res) => res.json({ user: meUser(req.user) })));

// ---------- account ----------
const A = express.Router(); A.use(requireAuth);
A.put('/me', wrap((req, res) => {
  const name = V.str(req.body.name, { min: 2, max: 80, field: 'name' });
  const phone = V.phone(req.body.phone);
  if (db.prepare('SELECT 1 FROM users WHERE phone=? AND id<>?').get(phone, req.user.id)) fail(409, 'phone_taken');
  db.prepare(`UPDATE users SET name=?, phone=?, lang=?, currency=?, updated_at=datetime('now') WHERE id=?`).run(name, phone, req.body.lang === 'en' ? 'en' : 'ar', req.body.currency === 'USD' ? 'USD' : 'DZD', req.user.id);
  res.json({ ok: true });
}));
A.put('/me/prefs', wrap((req, res) => {
  db.prepare('UPDATE users SET lang=?, currency=? WHERE id=?').run(req.body.lang === 'en' ? 'en' : 'ar', req.body.currency === 'USD' ? 'USD' : 'DZD', req.user.id);
  res.json({ ok: true });
}));
A.put('/me/password', limit('pw', 6, 900000), wrap(async (req, res) => {
  const u = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if (!await bcrypt.compare(String(req.body.current || ''), u.password_hash)) fail(400, 'wrong_password');
  db.prepare(`UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?`).run(await bcrypt.hash(V.password(req.body.password), 11), req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').run(req.user.id, req.user.session_id);
  res.json({ ok: true });
}));

// addresses
function readAddress(b) {
  const wilaya_id = V.int(b.wilaya_id, { field: 'wilaya_id' }); const commune_id = V.int(b.commune_id, { field: 'commune_id' });
  if (!db.prepare('SELECT 1 FROM communes WHERE id=? AND wilaya_id=? AND active=1').get(commune_id, wilaya_id)) fail(400, 'commune_unavailable');
  return { label: V.str(b.label, { optional: true, max: 40 }), full_name: V.str(b.full_name, { min: 2, max: 80, field: 'full_name' }), phone: V.phone(b.phone),
    wilaya_id, commune_id, delivery_method: V.oneOf(b.delivery_method || 'home', ['home', 'office'], 'delivery_method'),
    address: V.str(b.address, { min: 4, max: 300, field: 'address' }), notes: V.str(b.notes, { optional: true, max: 300 }) };
}
const addrSel = `SELECT a.*, w.name_ar w_ar, w.name_en w_en, c.name_ar c_ar, c.name_en c_en FROM addresses a JOIN wilayas w ON w.id=a.wilaya_id JOIN communes c ON c.id=a.commune_id`;
A.get('/addresses', wrap((req, res) => res.json(db.prepare(`${addrSel} WHERE a.user_id=? ORDER BY is_default DESC, id DESC`).all(req.user.id))));
A.post('/addresses', wrap((req, res) => {
  const a = readAddress(req.body);
  if (db.prepare('SELECT COUNT(*) n FROM addresses WHERE user_id=?').get(req.user.id).n >= 20) fail(400, 'too_many_addresses');
  const first = !db.prepare('SELECT 1 FROM addresses WHERE user_id=?').get(req.user.id);
  const id = db.transaction(() => {
    if (req.body.is_default || first) db.prepare('UPDATE addresses SET is_default=0 WHERE user_id=?').run(req.user.id);
    return db.prepare('INSERT INTO addresses(user_id,label,full_name,phone,wilaya_id,commune_id,delivery_method,address,notes,is_default) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(req.user.id, a.label, a.full_name, a.phone, a.wilaya_id, a.commune_id, a.delivery_method, a.address, a.notes, req.body.is_default || first ? 1 : 0).lastInsertRowid;
  })();
  res.json({ ok: true, id });
}));
A.put('/addresses/:id', wrap((req, res) => {
  const a = readAddress(req.body);
  db.transaction(() => {
    if (req.body.is_default) db.prepare('UPDATE addresses SET is_default=0 WHERE user_id=?').run(req.user.id);
    const u = db.prepare(`UPDATE addresses SET label=?,full_name=?,phone=?,wilaya_id=?,commune_id=?,delivery_method=?,address=?,notes=?${req.body.is_default ? ',is_default=1' : ''} WHERE id=? AND user_id=?`)
      .run(a.label, a.full_name, a.phone, a.wilaya_id, a.commune_id, a.delivery_method, a.address, a.notes, Number(req.params.id), req.user.id);
    if (!u.changes) fail(404, 'not_found');
  })();
  res.json({ ok: true });
}));
A.post('/addresses/:id/default', wrap((req, res) => {
  db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM addresses WHERE id=? AND user_id=?').get(Number(req.params.id), req.user.id)) fail(404, 'not_found');
    db.prepare('UPDATE addresses SET is_default=0 WHERE user_id=?').run(req.user.id);
    db.prepare('UPDATE addresses SET is_default=1 WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  })();
  res.json({ ok: true });
}));
A.delete('/addresses/:id', wrap((req, res) => {
  const u = db.prepare('DELETE FROM addresses WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id);
  if (!u.changes) fail(404, 'not_found');
  res.json({ ok: true });
}));

// cart (server-side for signed-in users)
function cartView(uid) { return L.quote({ items: cartItemsOf(uid), userId: uid }); }
A.get('/cart', wrap((req, res) => res.json(cartView(req.user.id))));
A.post('/cart', wrap((req, res) => {
  const vid = V.int(req.body.variant_id, { min: 1, field: 'variant_id' }); const qty = V.int(req.body.qty, { min: 0, max: 99, field: 'qty' });
  const v = db.prepare(`SELECT v.stock FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND v.active=1 AND p.status='published'`).get(vid);
  if (!v) fail(404, 'unavailable');
  const cur = db.prepare('SELECT qty FROM cart_items WHERE user_id=? AND variant_id=?').get(req.user.id, vid)?.qty || 0;
  const target = req.body.mode === 'set' ? qty : cur + qty;
  if (target <= 0) db.prepare('DELETE FROM cart_items WHERE user_id=? AND variant_id=?').run(req.user.id, vid);
  else {
    if (target > v.stock) fail(409, v.stock ? 'insufficient_stock' : 'out_of_stock', { stock: v.stock });
    db.prepare('INSERT INTO cart_items(user_id,variant_id,qty) VALUES (?,?,?) ON CONFLICT(user_id,variant_id) DO UPDATE SET qty=excluded.qty').run(req.user.id, vid, target);
  }
  res.json(cartView(req.user.id));
}));
A.delete('/cart/:vid', wrap((req, res) => { db.prepare('DELETE FROM cart_items WHERE user_id=? AND variant_id=?').run(req.user.id, Number(req.params.vid)); res.json(cartView(req.user.id)); }));
A.post('/cart/merge', wrap((req, res) => {
  const items = cleanItems(req.body.items);
  db.transaction(() => {
    for (const it of items) {
      const v = db.prepare(`SELECT v.stock FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND v.active=1 AND p.status='published'`).get(it.variant_id);
      if (!v || v.stock <= 0 || !(it.qty > 0)) continue;
      const cur = db.prepare('SELECT qty FROM cart_items WHERE user_id=? AND variant_id=?').get(req.user.id, it.variant_id)?.qty || 0;
      const q = Math.min(v.stock, Math.max(cur, Math.min(99, it.qty)));
      db.prepare('INSERT INTO cart_items(user_id,variant_id,qty) VALUES (?,?,?) ON CONFLICT(user_id,variant_id) DO UPDATE SET qty=excluded.qty').run(req.user.id, it.variant_id, q);
    }
  })();
  res.json(cartView(req.user.id));
}));

// favorites
A.get('/favorites', wrap((req, res) => {
  const rows = db.prepare(`SELECT * FROM (${BASE}) WHERE id IN (SELECT product_id FROM favorites WHERE user_id=?)`).all(req.user.id);
  res.json(rows.map(p => card(p)));
}));
A.post('/favorites/:pid', wrap((req, res) => {
  const pid = Number(req.params.pid);
  if (!db.prepare(`SELECT 1 FROM products WHERE id=? AND status='published'`).get(pid)) fail(404, 'not_found');
  const ex = db.prepare('SELECT 1 FROM favorites WHERE user_id=? AND product_id=?').get(req.user.id, pid);
  if (ex) db.prepare('DELETE FROM favorites WHERE user_id=? AND product_id=?').run(req.user.id, pid);
  else db.prepare('INSERT INTO favorites(user_id,product_id) VALUES (?,?)').run(req.user.id, pid);
  res.json({ ok: true, favorite: !ex });
}));

// orders
function newOrderNumber() { for (;;) { const n = `MDZ-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${L.rand(5)}`; if (!db.prepare('SELECT 1 FROM orders WHERE number=?').get(n)) return n; } }
A.post('/orders', limit('orders', 20, 3600000), wrap((req, res) => {
  const b = req.body || {};
  const method = V.oneOf(b.payment_method, ['wallet', 'cod'], 'payment_method');
  if (method === 'wallet' && L.S('pay_wallet_enabled') !== '1') fail(400, 'method_disabled');
  if (method === 'cod' && L.S('pay_cod_enabled') !== '1') fail(400, 'method_disabled');
  const idem = V.str(b.idempotency_key, { min: 8, max: 64, field: 'idempotency_key' });
  const existing = db.prepare('SELECT number FROM orders WHERE idempotency_key=? AND user_id=?').get(idem, req.user.id);
  if (existing) return res.json({ ok: true, number: existing.number, duplicate: true });
  // shipping address (saved address or inline)
  let a;
  if (b.address_id) { a = db.prepare('SELECT * FROM addresses WHERE id=? AND user_id=?').get(Number(b.address_id), req.user.id); if (!a) fail(404, 'address_not_found'); if (b.delivery_method) a.delivery_method = V.oneOf(b.delivery_method, ['home', 'office']); }
  else a = readAddress(b.address || {});
  const source = b.source === 'buynow' ? 'buynow' : 'cart';
  const items = source === 'cart' ? cartItemsOf(req.user.id) : cleanItems(b.items);
  if (!items.length) fail(400, 'cart_empty');

  const result = db.transaction(() => {
    const q = L.quote({ items, userId: req.user.id, couponCode: b.coupon || null, wilayaId: a.wilaya_id, communeId: a.commune_id, method: a.delivery_method, carrierId: b.carrier_id });
    if (q.issues.length) fail(409, 'cart_issues', { issues: q.issues, quote: q });
    if (b.coupon && !q.coupon?.ok) fail(400, q.coupon?.reason || 'coupon_invalid', { quote: q });
    if (!q.shipping) fail(400, q.shipping_issue || 'no_shipping_rate', { quote: q });
    // the customer confirmed a specific total; refuse if anything changed since
    if (b.expected_total != null && Number(b.expected_total) !== q.total) fail(409, 'price_changed', { quote: q });
    const w = db.prepare('SELECT w.name_ar wa, w.name_en we, c.name_ar ca, c.name_en ce FROM wilayas w JOIN communes c ON c.wilaya_id=w.id WHERE w.id=? AND c.id=?').get(a.wilaya_id, a.commune_id);
    const number = newOrderNumber();
    const oid = db.prepare(`INSERT INTO orders(number,user_id,status,payment_method,payment_status,subtotal,items_discount,coupon_id,coupon_code,coupon_discount,shipping_fee,total,
      display_currency,fx_rate_micro,ship_name,ship_phone,wilaya_id,commune_id,ship_wilaya,ship_commune,delivery_method,ship_address,ship_notes,carrier_id,weight_g,idempotency_key)
      VALUES (?,?,'pending',?,'unpaid',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(number, req.user.id, method, q.subtotal, q.items_discount,
      q.coupon?.ok ? q.coupon.id : null, q.coupon?.ok ? q.coupon.code : null, q.coupon_discount, q.shipping.price, q.total,
      b.currency === 'USD' ? 'USD' : 'DZD', q.fx_rate_micro, a.full_name, a.phone, a.wilaya_id, a.commune_id, `${w.wa} / ${w.we}`, `${w.ca} / ${w.ce}`,
      a.delivery_method, a.address, V.str(b.notes, { optional: true, max: 300 }) || a.notes || null, q.shipping.carrier_id, q.weight_g, idem).lastInsertRowid;
    const insItem = db.prepare('INSERT INTO order_items(order_id,product_id,variant_id,name_ar,name_en,color,size,image,unit_price,original_price,qty,line_total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const l of q.lines) {
      insItem.run(oid, l.product_id, l.variant_id, l.name_ar, l.name_en, l.color, l.size, l.image, l.unit_price, l.original_price, l.qty, l.line_total);
      L.moveStock(l.variant_id, -l.qty, 'reserve', 'order', oid, req.user.id, number); // atomic conditional decrement
      db.prepare('UPDATE products SET sold_count = sold_count + ? WHERE id=?').run(l.qty, l.product_id);
    }
    if (q.coupon?.ok) {
      const cu = db.prepare('UPDATE coupons SET used_count=used_count+1 WHERE id=? AND active=1 AND (usage_limit IS NULL OR used_count < usage_limit)').run(q.coupon.id);
      if (!cu.changes) fail(400, 'coupon_exhausted');
      db.prepare('INSERT INTO coupon_usages(coupon_id,user_id,order_id,discount) VALUES (?,?,?,?)').run(q.coupon.id, req.user.id, oid, q.coupon_discount);
    }
    if (method === 'wallet') {
      const tx = L.walletApply({ userId: req.user.id, type: 'purchase', dAvail: -q.total, origAmount: q.total, sourceType: 'order', sourceId: oid, note: `Order ${number}`, actorId: req.user.id });
      db.prepare(`INSERT INTO payments(order_id,method,kind,amount,reference,actor_id) VALUES (?,?,?,?,?,?)`).run(oid, 'wallet', 'charge', q.total, tx.ref, req.user.id);
      db.prepare(`UPDATE orders SET payment_status='paid', paid_amount=?, paid_at=datetime('now') WHERE id=?`).run(q.total, oid);
    }
    L.addHistory(oid, null, 'pending', method === 'wallet' ? 'Paid from wallet' : 'Cash on delivery', req.user.id, 'customer');
    if (source === 'cart') db.prepare('DELETE FROM cart_items WHERE user_id=?').run(req.user.id);
    L.notify(req.user.id, 'order_created', { number, total: L.fmtDZD(q.total) }, `/account/orders/${number}`);
    L.notifyStaff('orders', 'staff_new_order', { number, customer: req.user.name, total: L.fmtDZD(q.total), method: method === 'wallet' ? 'Wallet' : 'COD' }, `/admin/orders/${oid}`);
    return { number };
  })();
  res.json({ ok: true, number: result.number });
}));
A.get('/orders', wrap((req, res) => {
  const rows = db.prepare(`SELECT o.id,o.number,o.status,o.payment_method,o.payment_status,o.total,o.created_at,
    (SELECT COUNT(*) FROM order_items WHERE order_id=o.id) items, (SELECT image FROM order_items WHERE order_id=o.id LIMIT 1) image
    FROM orders o WHERE user_id=? ORDER BY id DESC LIMIT 200`).all(req.user.id);
  res.json(rows);
}));
A.get('/orders/:number', wrap((req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE number=? AND user_id=?').get(req.params.number, req.user.id);
  if (!o) fail(404, 'not_found');
  delete o.admin_notes; delete o.idempotency_key;
  const items = db.prepare('SELECT oi.*, p.slug FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE order_id=?').all(o.id);
  const history = db.prepare('SELECT from_status,to_status,note,actor_type,created_at FROM order_history WHERE order_id=? ORDER BY id').all(o.id)
    .map(h => ({ ...h, note: h.actor_type === 'admin' && h.to_status !== 'cancelled' ? null : h.note }));
  const shipment = db.prepare('SELECT s.tracking, s.status, s.source, c.name carrier, c.tracking_url FROM shipments s LEFT JOIN carriers c ON c.id=s.carrier_id WHERE order_id=?').get(o.id);
  const carrier = o.carrier_id ? db.prepare('SELECT name FROM carriers WHERE id=?').get(o.carrier_id)?.name : null;
  const refunds = db.prepare('SELECT ref,status,requested_amount,approved_amount,reason,admin_note,created_at FROM refund_requests WHERE order_id=? ORDER BY id DESC').all(o.id);
  const windowDays = L.SI('return_window_days') || 7;
  const inWindow = o.delivered_at ? (Date.now() - new Date(o.delivered_at.replace(' ', 'T') + 'Z')) / 86400000 <= windowDays : false;
  const refundable = o.paid_amount - o.refunded_amount;
  res.json({ ...o, items, history, shipment, carrier, refunds,
    can_cancel: ['pending', 'confirmed'].includes(o.status),
    can_refund: ['paid', 'partially_refunded'].includes(o.payment_status) && refundable > 0 && (o.status === 'returned' || (o.status === 'delivered' && inWindow)) && !refunds.some(x => ['pending', 'needs_info'].includes(x.status)),
    refundable });
}));
A.post('/orders/:number/cancel', limit('cancel', 20, 3600000), wrap((req, res) => {
  db.transaction(() => {
    const o = db.prepare('SELECT * FROM orders WHERE number=? AND user_id=?').get(req.params.number, req.user.id);
    if (!o) fail(404, 'not_found');
    if (!['pending', 'confirmed'].includes(o.status)) fail(400, 'cannot_cancel');
    L.changeOrderStatus(o, 'cancelled', { note: V.str(req.body.reason, { optional: true, max: 200 }) || 'Cancelled by customer', actorId: req.user.id, actorType: 'customer' });
  })();
  res.json({ ok: true });
}));

// reviews (verified purchases only)
A.post('/products/:id/reviews', limit('review', 10, 3600000), wrap((req, res) => {
  const pid = Number(req.params.id);
  const rating = V.int(req.body.rating, { min: 1, max: 5, field: 'rating' }); const comment = V.str(req.body.comment, { optional: true, max: 1000 });
  const bought = db.prepare(`SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.user_id=? AND oi.product_id=? AND o.status IN ('delivered','refunded','returned') LIMIT 1`).get(req.user.id, pid);
  if (!bought) fail(403, 'review_not_allowed');
  db.transaction(() => {
    db.prepare('INSERT INTO reviews(product_id,user_id,name,rating,comment,verified) VALUES (?,?,?,?,?,1)').run(pid, req.user.id, req.user.name, rating, comment);
    const s = db.prepare('SELECT AVG(rating) a, COUNT(*) n FROM reviews WHERE product_id=? AND visible=1').get(pid);
    db.prepare('UPDATE products SET rating_avg=?, rating_count=? WHERE id=?').run(Math.round(s.a * 10) / 10, s.n, pid);
  })();
  res.json({ ok: true });
}));

// ---------- wallet ----------
A.get('/wallet', wrap((req, res) => {
  L.ensureWallet(req.user.id);
  const w = db.prepare('SELECT available, held FROM wallets WHERE user_id=?').get(req.user.id);
  res.json({
    ...w, fx_rate_micro: L.rateMicro(), fx_updated_at: L.S('fx_updated_at'),
    transactions: db.prepare('SELECT ref,type,delta_available,delta_held,available_after,held_after,orig_currency,orig_amount,fx_rate_micro,status,source_type,note,created_at FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 300').all(req.user.id),
    topups: db.prepare('SELECT ref,method,currency,requested_amount,sent_amount,reference,network,status,approved_amount,credited_dzd,admin_note,created_at,updated_at FROM topup_requests WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id),
    withdrawals: db.prepare('SELECT ref,method,currency,orig_amount,amount_dzd,fee_dzd,net_orig,beneficiary_name,account,network,status,payout_reference,admin_note,created_at,updated_at FROM withdrawal_requests WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id),
    refunds: db.prepare('SELECT rr.ref, rr.status, rr.requested_amount, rr.approved_amount, rr.reason, rr.admin_note, rr.created_at, o.number FROM refund_requests rr JOIN orders o ON o.id=rr.order_id WHERE rr.user_id=? ORDER BY rr.id DESC').all(req.user.id),
  });
}));
A.post('/wallet/topups', limit('topup', 10, 3600000), H.upload.single('receipt'), wrap(async (req, res) => {
  const b = req.body;
  const method = V.oneOf(b.method, ['ccp', 'usdt'], 'method');
  const s = L.settings();
  if (method === 'ccp') {
    if (s.topup_ccp_enabled !== '1') fail(400, 'method_disabled');
    if (!s.ccp_account_number) fail(400, 'ccp_not_configured');
  } else {
    if (s.topup_usdt_enabled !== '1' || s.usdt_legal_ack !== '1' || !s.usdt_address) fail(400, 'method_disabled');
  }
  const currency = method === 'ccp' ? 'DZD' : 'USD';
  const requested = V.money(b.requested_amount, { field: 'requested_amount', min: 1 });
  const sent = V.money(b.sent_amount, { field: 'sent_amount', min: 1 });
  const reference = V.str(b.reference, { min: method === 'usdt' ? 20 : 4, max: 120, field: 'reference' }).replace(/\s+/g, '');
  if (method === 'usdt' && !/^(0x)?[0-9a-fA-F]{40,80}$/.test(reference)) fail(400, 'invalid_txid');
  const dzdEquivalent = currency === 'USD' ? L.usdToDzd(requested) : requested;
  if (dzdEquivalent < L.SI('topup_min_dzd') || dzdEquivalent > L.SI('topup_max_dzd')) fail(400, 'amount_out_of_range', { min: L.SI('topup_min_dzd'), max: L.SI('topup_max_dzd') });
  if (method === 'ccp' && !req.file) fail(400, 'receipt_required');
  const transferDate = V.date(b.transfer_date, { optional: method === 'usdt' });
  const dup = db.prepare(`SELECT 1 FROM topup_requests WHERE method=? AND reference=? AND status<>'rejected'`).get(method, reference);
  if (dup) fail(409, method === 'usdt' ? 'txid_used' : 'reference_used');
  const fileId = req.file ? await H.savePrivateFile(req.file, req.user.id, 'receipt') : null;
  const ref = L.makeRef('TOP');
  db.transaction(() => {
    db.prepare(`INSERT INTO topup_requests(ref,user_id,method,currency,requested_amount,sent_amount,reference,network,transfer_date,receipt_file_id,user_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ref, req.user.id, method, currency, requested, sent, reference, method === 'usdt' ? s.usdt_network : null, transferDate, fileId, V.str(b.note, { optional: true, max: 500 }));
    L.notify(req.user.id, 'topup_received', { ref }, '/account/wallet');
    L.notifyStaff('finance', 'staff_topup', { ref, customer: req.user.name, amount: currency === 'USD' ? `${(sent / 100).toFixed(2)} USDT` : L.fmtDZD(sent), method: method.toUpperCase() }, '/admin/finance/topups');
  })();
  res.json({ ok: true, ref, status: 'pending' });
}));
A.post('/wallet/topups/:ref/info', limit('topinfo', 10, 3600000), H.upload.single('receipt'), wrap(async (req, res) => {
  const t = db.prepare('SELECT * FROM topup_requests WHERE ref=? AND user_id=?').get(req.params.ref, req.user.id);
  if (!t) fail(404, 'not_found'); if (t.status !== 'needs_info') fail(400, 'not_awaiting_info');
  const note = V.str(req.body.note, { min: 2, max: 500, field: 'note' });
  const fileId = req.file ? await H.savePrivateFile(req.file, req.user.id, 'receipt') : t.receipt_file_id;
  db.prepare(`UPDATE topup_requests SET status='pending', user_note=COALESCE(user_note,'') || char(10) || ?, receipt_file_id=?, updated_at=datetime('now') WHERE id=? AND status='needs_info'`).run(note, fileId, t.id);
  L.notifyStaff('finance', 'staff_topup', { ref: t.ref, customer: req.user.name, amount: '—', method: 'info' }, '/admin/finance/topups');
  res.json({ ok: true });
}));
A.post('/wallet/withdrawals', limit('withdraw', 6, 3600000), wrap(async (req, res) => {
  const b = req.body; const s = L.settings();
  if (!req.user.email_verified_at) fail(403, 'verify_email_first');
  const u = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if (!await bcrypt.compare(String(b.password || ''), u.password_hash)) fail(400, 'wrong_password');
  const method = V.oneOf(b.method, ['ccp', 'usdt'], 'method');
  if (method === 'ccp' && s.withdraw_ccp_enabled !== '1') fail(400, 'method_disabled');
  if (method === 'usdt' && (s.withdraw_usdt_enabled !== '1' || s.usdt_legal_ack !== '1')) fail(400, 'method_disabled');
  const currency = method === 'ccp' ? 'DZD' : 'USD';
  const orig = V.money(b.amount, { min: 1 });
  const rm = L.rateMicro();
  const amountDzd = currency === 'USD' ? L.usdToDzd(orig, rm) : orig;
  if (amountDzd < L.SI('withdraw_min_dzd') || amountDzd > L.SI('withdraw_max_dzd')) fail(400, 'amount_out_of_range', { min: L.SI('withdraw_min_dzd'), max: L.SI('withdraw_max_dzd') });
  const fee = Math.floor(amountDzd * (Number(s.withdraw_fee_percent) || 0) / 100) + L.SI('withdraw_fee_fixed_dzd');
  if (fee >= amountDzd) fail(400, 'amount_too_small');
  const netDzd = amountDzd - fee; const netOrig = currency === 'USD' ? L.dzdToUsd(netDzd, rm) : netDzd;
  const beneficiary = V.str(b.beneficiary_name, { min: 3, max: 80, field: 'beneficiary_name' });
  let account, key = null, network = null;
  if (method === 'ccp') {
    account = String(b.account || '').replace(/\s/g, ''); key = String(b.account_key || '').replace(/\s/g, '');
    if (!/^\d{6,12}$/.test(account)) fail(400, 'invalid_ccp'); if (!/^\d{2}$/.test(key)) fail(400, 'invalid_ccp_key');
  } else {
    account = String(b.account || '').trim(); network = s.usdt_network;
    if (network === 'TRC20' ? !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(account) : !/^0x[0-9a-fA-F]{40}$/.test(account)) fail(400, 'invalid_address');
  }
  const ref = L.makeRef('WDR');
  db.transaction(() => {
    const id = db.prepare(`INSERT INTO withdrawal_requests(ref,user_id,method,currency,orig_amount,amount_dzd,fee_dzd,net_orig,fx_rate_micro,beneficiary_name,account,account_key,network) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ref, req.user.id, method, currency, orig, amountDzd, fee, netOrig, rm, beneficiary, account, key, network).lastInsertRowid;
    // hold funds so they cannot be spent twice during review
    L.walletApply({ userId: req.user.id, type: 'withdraw_hold', dAvail: -amountDzd, dHeld: amountDzd, origCurrency: currency, origAmount: orig, fx: currency === 'USD' ? rm : null, sourceType: 'withdrawal', sourceId: id, note: ref, actorId: req.user.id });
    L.notify(req.user.id, 'withdraw_received', { ref, amount: L.fmtDZD(amountDzd) }, '/account/wallet');
    L.notifyStaff('finance', 'staff_withdraw', { ref, customer: req.user.name, amount: L.fmtDZD(amountDzd) }, '/admin/finance/withdrawals');
  })();
  res.json({ ok: true, ref, status: 'pending' });
}));
A.post('/wallet/withdrawals/:ref/cancel', wrap((req, res) => {
  db.transaction(() => {
    const w = db.prepare('SELECT * FROM withdrawal_requests WHERE ref=? AND user_id=?').get(req.params.ref, req.user.id);
    if (!w) fail(404, 'not_found');
    const u = db.prepare(`UPDATE withdrawal_requests SET status='cancelled', updated_at=datetime('now') WHERE id=? AND status IN ('pending','needs_info')`).run(w.id);
    if (!u.changes) fail(400, 'cannot_cancel');
    L.walletApply({ userId: w.user_id, type: 'withdraw_release', dAvail: w.amount_dzd, dHeld: -w.amount_dzd, origCurrency: w.currency, origAmount: w.orig_amount, fx: w.fx_rate_micro, sourceType: 'withdrawal', sourceId: w.id, note: `Cancelled ${w.ref}`, actorId: req.user.id });
  })();
  res.json({ ok: true });
}));
A.post('/wallet/withdrawals/:ref/info', wrap((req, res) => {
  const w = db.prepare('SELECT * FROM withdrawal_requests WHERE ref=? AND user_id=?').get(req.params.ref, req.user.id);
  if (!w) fail(404, 'not_found'); if (w.status !== 'needs_info') fail(400, 'not_awaiting_info');
  const note = V.str(req.body.note, { min: 2, max: 500, field: 'note' });
  db.prepare(`UPDATE withdrawal_requests SET status='pending', admin_note=COALESCE(admin_note,'') || char(10) || '[customer] ' || ?, updated_at=datetime('now') WHERE id=?`).run(note, w.id);
  L.notifyStaff('finance', 'staff_withdraw', { ref: w.ref, customer: req.user.name, amount: 'info' }, '/admin/finance/withdrawals');
  res.json({ ok: true });
}));

// refunds
A.post('/refunds', limit('refund', 10, 3600000), wrap((req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE number=? AND user_id=?').get(String(req.body.order_number || ''), req.user.id);
  if (!o) fail(404, 'not_found');
  if (!['paid', 'partially_refunded'].includes(o.payment_status)) fail(400, 'order_not_paid');
  const windowDays = L.SI('return_window_days') || 7;
  const inWindow = o.delivered_at && (Date.now() - new Date(o.delivered_at.replace(' ', 'T') + 'Z')) / 86400000 <= windowDays;
  if (!(o.status === 'returned' || (o.status === 'delivered' && inWindow))) fail(400, 'refund_not_eligible');
  const max = o.paid_amount - o.refunded_amount;
  const amount = V.money(req.body.amount, { min: 1 }); if (amount > max) fail(400, 'refund_amount_invalid', { max });
  const reason = V.oneOf(req.body.reason, ['defective', 'not_as_described', 'wrong_item', 'missing_parts', 'returned', 'other'], 'reason');
  const ref = L.makeRef('RFD');
  db.transaction(() => {
    db.prepare('INSERT INTO refund_requests(ref,order_id,user_id,reason,details,requested_amount,order_prev_status) VALUES (?,?,?,?,?,?,?)')
      .run(ref, o.id, req.user.id, reason, V.str(req.body.details, { min: 5, max: 1500, field: 'details' }), amount, o.status);
    db.prepare(`UPDATE orders SET status='refund_pending', updated_at=datetime('now') WHERE id=?`).run(o.id);
    L.addHistory(o.id, o.status, 'refund_pending', `Refund request ${ref}`, req.user.id, 'customer');
    L.notify(req.user.id, 'refund_received', { ref }, `/account/orders/${o.number}`);
    L.notifyStaff('finance', 'staff_refund', { ref, customer: req.user.name, amount: L.fmtDZD(amount) }, '/admin/finance/refunds');
  })();
  res.json({ ok: true, ref });
}));
A.post('/refunds/:ref/info', wrap((req, res) => {
  const rr = db.prepare('SELECT * FROM refund_requests WHERE ref=? AND user_id=?').get(req.params.ref, req.user.id);
  if (!rr) fail(404, 'not_found'); if (rr.status !== 'needs_info') fail(400, 'not_awaiting_info');
  const note = V.str(req.body.note, { min: 2, max: 1000, field: 'note' });
  db.prepare(`UPDATE refund_requests SET status='pending', details=details || char(10) || '— ' || ?, updated_at=datetime('now') WHERE id=?`).run(note, rr.id);
  L.notifyStaff('finance', 'staff_refund', { ref: rr.ref, customer: req.user.name, amount: 'info' }, '/admin/finance/refunds');
  res.json({ ok: true });
}));

// notifications
A.get('/notifications', wrap((req, res) => res.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id))));
A.post('/notifications/read', wrap((req, res) => {
  if (req.body.all) db.prepare(`UPDATE notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL`).run(req.user.id);
  else for (const id of (req.body.ids || []).slice(0, 100)) db.prepare(`UPDATE notifications SET read_at=datetime('now') WHERE id=? AND user_id=?`).run(Number(id), req.user.id);
  res.json({ ok: true });
}));

// support tickets
const TICKET_TYPES = ['order', 'payment', 'wallet', 'delivery', 'refund', 'account', 'product', 'other'];
A.get('/tickets', wrap((req, res) => res.json(db.prepare(`SELECT t.*, o.number order_number FROM tickets t LEFT JOIN orders o ON o.id=t.order_id WHERE t.user_id=? ORDER BY t.updated_at DESC`).all(req.user.id))));
A.post('/tickets', limit('ticket', 10, 3600000), H.upload.single('file'), wrap(async (req, res) => {
  const type = V.oneOf(req.body.type, TICKET_TYPES, 'type');
  const subject = V.str(req.body.subject, { min: 3, max: 120, field: 'subject' }); const body = V.str(req.body.body, { min: 5, max: 4000, field: 'body' });
  let orderId = null;
  if (req.body.order_number) { const o = db.prepare('SELECT id FROM orders WHERE number=? AND user_id=?').get(String(req.body.order_number), req.user.id); if (!o) fail(404, 'order_not_found'); orderId = o.id; }
  const fileId = req.file ? await H.savePrivateFile(req.file, req.user.id, 'ticket') : null;
  const ref = L.makeRef('TKT');
  db.transaction(() => {
    const id = db.prepare('INSERT INTO tickets(ref,user_id,type,subject,order_id) VALUES (?,?,?,?,?)').run(ref, req.user.id, type, subject, orderId).lastInsertRowid;
    db.prepare('INSERT INTO ticket_messages(ticket_id,author_id,is_staff,body,file_id) VALUES (?,?,0,?,?)').run(id, req.user.id, body, fileId);
    L.notifyStaff('support', 'staff_ticket', { ref, subject }, `/admin/support/${id}`);
  })();
  res.json({ ok: true, ref });
}));
A.get('/tickets/:ref', wrap((req, res) => {
  const t = db.prepare('SELECT t.*, o.number order_number FROM tickets t LEFT JOIN orders o ON o.id=t.order_id WHERE t.ref=? AND t.user_id=?').get(req.params.ref, req.user.id);
  if (!t) fail(404, 'not_found');
  const msgs = db.prepare('SELECT m.id, m.is_staff, m.body, m.file_id, m.created_at, CASE WHEN m.is_staff=1 THEN NULL ELSE u.name END author FROM ticket_messages m JOIN users u ON u.id=m.author_id WHERE ticket_id=? ORDER BY m.id').all(t.id);
  res.json({ ...t, messages: msgs });
}));
A.post('/tickets/:ref/messages', limit('ticketmsg', 30, 3600000), H.upload.single('file'), wrap(async (req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE ref=? AND user_id=?').get(req.params.ref, req.user.id);
  if (!t) fail(404, 'not_found'); if (t.status === 'closed') fail(400, 'ticket_closed');
  const body = V.str(req.body.body, { min: 1, max: 4000, field: 'body' });
  const fileId = req.file ? await H.savePrivateFile(req.file, req.user.id, 'ticket') : null;
  db.prepare('INSERT INTO ticket_messages(ticket_id,author_id,is_staff,body,file_id) VALUES (?,?,0,?,?)').run(t.id, req.user.id, body, fileId);
  db.prepare(`UPDATE tickets SET status='customer_reply', updated_at=datetime('now') WHERE id=?`).run(t.id);
  L.notifyStaff('support', 'staff_ticket', { ref: t.ref, subject: t.subject }, `/admin/support/${t.id}`);
  res.json({ ok: true });
}));
A.post('/tickets/:ref/close', wrap((req, res) => {
  const u = db.prepare(`UPDATE tickets SET status='closed', updated_at=datetime('now') WHERE ref=? AND user_id=?`).run(req.params.ref, req.user.id);
  if (!u.changes) fail(404, 'not_found'); res.json({ ok: true });
}));

// private files: owner or authorised staff only
r.get('/files/:id', requireAuth, wrap((req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(Number(req.params.id));
  if (!f) fail(404, 'not_found');
  const staffOk = (f.purpose === 'receipt' && L.can(req.user, 'finance')) || (f.purpose === 'ticket' && L.can(req.user, 'support'));
  if (f.owner_id !== req.user.id && !staffOk) {
    // staff attachments on tickets are visible to the ticket owner
    const ok = f.purpose === 'ticket' && db.prepare('SELECT 1 FROM ticket_messages m JOIN tickets t ON t.id=m.ticket_id WHERE m.file_id=? AND t.user_id=?').get(f.id, req.user.id);
    if (!ok) fail(403, 'forbidden');
  }
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="file-${f.id}.${f.mime === 'application/pdf' ? 'pdf' : 'jpg'}"`);
  fs.createReadStream(path.join(H.PRIVATE_DIR, path.basename(f.path))).pipe(res);
}));

r.use(A);
module.exports = { router: r, listProducts, categoryTree, card, BASE, meUser, cartItemsOf };
