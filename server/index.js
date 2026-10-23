// Marché DZ — server entry point.
const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = (() => { try { return require('compression'); } catch { return null; } })();
const { db } = require('./db');
const { seed } = require('./seed');
const L = require('./lib');
const H = require('./http');

seed();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(H.securityHeaders);
if (compression) app.use(compression());
app.use(express.json({ limit: '300kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });
app.use(H.sessionMiddleware);

const PUB = path.join(__dirname, '..', 'public');
app.use('/assets', express.static(path.join(PUB, 'assets'), { maxAge: H.PROD ? '7d' : 0 }));
const H_UP = require('./http').PUBLIC_UPLOADS;
if (path.resolve(H_UP) !== path.resolve(PUB, 'uploads')) app.use('/uploads', express.static(H_UP, { maxAge: '30d', immutable: true })); // persistent volume first
app.use('/uploads', express.static(path.join(PUB, 'uploads'), { maxAge: '30d', immutable: true })); // bundled demo images
app.use(['/uploads', '/assets'], (req, res) => res.status(404).end()); // missing files must not fall through to the SPA page
app.get('/favicon.svg', (req, res) => res.sendFile(path.join(PUB, 'favicon.svg')));
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));

app.use('/api', H.csrfProtect);
app.use('/api/admin', require('./routes/admin').router);
app.use('/api', require('./routes/store').router);
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// ---------- SEO: robots, sitemap, server-rendered meta for crawlers ----------
const origin = req => `${req.protocol}://${req.get('host')}`;
app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /checkout\nDisallow: /api/\nSitemap: ${origin(req)}/sitemap.xml\n`));
app.get('/sitemap.xml', (req, res) => {
  const o = origin(req);
  const urls = [`${o}/`, `${o}/faq`, ...['about', 'shipping', 'returns', 'cancellation', 'payment', 'privacy', 'terms'].map(s => `${o}/page/${s}`),
    ...db.prepare('SELECT slug FROM categories WHERE visible=1').all().map(c => `${o}/c/${c.slug}`),
    ...db.prepare(`SELECT slug, updated_at FROM products WHERE status='published'`).all().map(p => `${o}/p/${p.slug}`)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${u}</loc></url>`).join('')}</urlset>`);
});

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TEMPLATE = () => fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
let tplCache = null;
function renderShell(req, res, { title, desc, image, jsonld, ssr, noindex } = {}) {
  if (!tplCache || !H.PROD) tplCache = TEMPLATE();
  const lang = (req.cookies.mdz_lang || req.user?.lang || L.S('default_lang') || 'ar') === 'en' ? 'en' : 'ar';
  const store = lang === 'en' ? L.S('store_name_en') : L.S('store_name_ar');
  const t = title ? `${title} | ${store}` : `${store} — ${lang === 'en' ? L.S('hero_title_en') : L.S('hero_title_ar')}`;
  const d = desc || (lang === 'en' ? L.S('hero_sub_en') : L.S('hero_sub_ar'));
  const html = tplCache
    .replace(/{{LANG}}/g, lang).replace(/{{DIR}}/g, lang === 'ar' ? 'rtl' : 'ltr')
    .replace(/{{TITLE}}/g, esc(t)).replace(/{{DESC}}/g, esc(String(d).slice(0, 300)))
    .replace(/{{CANONICAL}}/g, esc(origin(req) + req.path)).replace(/{{OG_IMAGE}}/g, esc(image ? origin(req) + image : origin(req) + '/favicon.svg'))
    .replace(/{{ROBOTS}}/g, noindex ? 'noindex,nofollow' : 'index,follow')
    .replace(/{{ACCENT}}/g, esc(L.S('color_accent'))).replace(/{{SALE}}/g, esc(L.S('color_sale'))).replace(/{{INFO}}/g, esc(L.S('color_info')))
    .replace('{{JSONLD}}', () => jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : '')
    .replace('{{SSR}}', () => ssr || '');
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(html);
}
app.get('/p/:slug', (req, res) => {
  const p = db.prepare(`SELECT p.*, (SELECT path FROM product_images WHERE product_id=p.id ORDER BY is_main DESC, sort LIMIT 1) img,
    (SELECT COALESCE(SUM(stock),0) FROM variants WHERE product_id=p.id AND active=1) stock FROM products p WHERE slug=? AND status='published'`).get(req.params.slug);
  if (!p) return renderShell(req, res, { noindex: true });
  const lang = (req.cookies.mdz_lang || 'ar') === 'en' ? 'en' : 'ar';
  const name = lang === 'en' ? p.name_en : p.name_ar; const desc = lang === 'en' ? p.desc_en : p.desc_ar;
  const price = L.effectivePrice(p);
  renderShell(req, res, {
    title: name, desc, image: p.img,
    jsonld: { '@context': 'https://schema.org', '@type': 'Product', name, description: desc, image: p.img ? [origin(req) + p.img] : [], brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined,
      offers: { '@type': 'Offer', priceCurrency: 'DZD', price: (price / 100).toFixed(2), availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: origin(req) + req.path },
      aggregateRating: p.rating_count ? { '@type': 'AggregateRating', ratingValue: p.rating_avg, reviewCount: p.rating_count } : undefined },
    ssr: `<article class="ssr"><h1>${esc(name)}</h1><p>${esc(desc)}</p><p>${(price / 100).toLocaleString('en-US')} DZD</p></article>`,
  });
});
app.get('/c/:slug', (req, res) => {
  const c = db.prepare('SELECT * FROM categories WHERE slug=? AND visible=1').get(req.params.slug);
  const lang = (req.cookies.mdz_lang || 'ar') === 'en' ? 'en' : 'ar';
  renderShell(req, res, c ? { title: lang === 'en' ? c.name_en : c.name_ar, image: c.image, ssr: `<h1 class="ssr">${esc(lang === 'en' ? c.name_en : c.name_ar)}</h1>` } : { noindex: true });
});
app.get(['/admin', '/admin/{*rest}'], (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.sendFile(path.join(PUB, 'admin.html')); });
app.get(['/account', '/account/{*rest}', '/checkout', '/cart', '/login', '/register', '/forgot', '/support', '/support/{*rest}'], (req, res) => renderShell(req, res, { noindex: true }));
app.get('/{*splat}', (req, res) => renderShell(req, res));
app.use(H.errorHandler);

// ---------- background jobs ----------
function expirePendingOrders() {
  const hours = L.SI('pending_order_ttl_hours'); if (!hours) return;
  const stale = db.prepare(`SELECT * FROM orders WHERE status='pending' AND created_at < datetime('now', ?)`).all(`-${hours} hours`);
  for (const o of stale) {
    try { db.transaction(() => L.changeOrderStatus(o, 'cancelled', { note: `Auto-cancelled: not confirmed within ${hours}h`, actorType: 'system' }))(); }
    catch (e) { console.warn('[job] expire', o.number, e.code || e.message); }
  }
  if (stale.length) console.log(`[job] auto-cancelled ${stale.length} stale pending orders`);
}
async function syncShipments() {
  const { syncShipment } = require('./routes/admin');
  const rows = db.prepare(`SELECT s.* FROM shipments s JOIN orders o ON o.id=s.order_id JOIN carriers c ON c.id=s.carrier_id
    WHERE s.source='api' AND c.mode='api' AND c.last_test_ok=1 AND o.status IN ('shipment_created','shipping') LIMIT 100`).all();
  for (const s of rows) { try { await syncShipment(s); } catch (e) { console.warn('[job] sync', s.tracking, e.code || e.message); } }
}
setInterval(expirePendingOrders, 10 * 60 * 1000).unref();
setInterval(() => syncShipments().catch(() => { }), 30 * 60 * 1000).unref();
setTimeout(expirePendingOrders, 5000).unref();

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, '0.0.0.0', () => console.log(`Marché DZ running on http://0.0.0.0:${PORT}`));
