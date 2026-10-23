// Admin API — every route requires a staff session + a specific permission. All money-moving actions are
// transactional, idempotent (conditional status updates + unique ledger keys) and audited.
const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, DATA_DIR, DB_PATH } = require('../db');
const L = require('../lib');
const H = require('../http');
const { adapterFor } = require('../carriers');
const { categoryTree } = require('./store');
const { V, wrap, requireStaff, requirePerm: P } = H;
const { fail, audit } = L;

const r = express.Router();
r.use(requireStaff);
const id = req => V.int(req.params.id, { min: 1, field: 'id' });
const page = (q, def = 30) => { const lim = Math.min(200, parseInt(q.limit, 10) || def); const pg = Math.max(1, parseInt(q.page, 10) || 1); return { lim, off: (pg - 1) * lim, pg }; };

r.get('/me', (req, res) => res.json({ id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role, perms: L.ROLE_PERMS[req.user.role] }));

// ---------- dashboard ----------
r.get('/dashboard', P('dashboard'), wrap((req, res) => {
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const since = `-${days} days`;
  const c = s => db.prepare(`SELECT COUNT(*) n FROM orders WHERE status IN (${s.map(() => '?').join(',')})`).get(...s).n;
  const finance = L.can(req.user, 'finance') || req.user.role === 'admin' || req.user.role === 'manager';
  const sum = (sql, ...p) => db.prepare(sql).get(...p).s || 0;
  res.json({
    days,
    orders: { total: db.prepare('SELECT COUNT(*) n FROM orders').get().n, new: c(['pending']), processing: c(['confirmed', 'processing', 'ready', 'shipment_created']), shipping: c(['shipping']),
      delivered: c(['delivered']), cancelled: c(['cancelled']), returned: c(['returned', 'refund_pending', 'refunded']) },
    sales: db.prepare(`SELECT date(created_at) d, COUNT(*) n, SUM(total) s FROM orders WHERE status<>'cancelled' AND created_at >= datetime('now', ?) GROUP BY d ORDER BY d`).all(since),
    top: db.prepare(`SELECT oi.product_id, oi.name_ar, oi.name_en, SUM(oi.qty) qty, SUM(oi.line_total) revenue, MAX(oi.image) image FROM order_items oi JOIN orders o ON o.id=oi.order_id
      WHERE o.status<>'cancelled' AND o.created_at >= datetime('now', ?) GROUP BY oi.product_id ORDER BY qty DESC LIMIT 8`).all(since),
    low_stock: db.prepare(`SELECT v.id, v.product_id, v.color, v.size, v.stock, p.name_ar, p.name_en FROM variants v JOIN products p ON p.id=v.product_id WHERE v.active=1 AND p.status='published' AND v.stock <= ? ORDER BY v.stock LIMIT 15`).all(L.SI('low_stock_threshold') || 5),
    pending: {
      topups: db.prepare(`SELECT COUNT(*) n FROM topup_requests WHERE status IN ('pending')`).get().n,
      withdrawals: db.prepare(`SELECT COUNT(*) n FROM withdrawal_requests WHERE status IN ('pending','approved')`).get().n,
      refunds: db.prepare(`SELECT COUNT(*) n FROM refund_requests WHERE status IN ('pending')`).get().n,
      tickets: db.prepare(`SELECT COUNT(*) n FROM tickets WHERE status IN ('open','customer_reply')`).get().n,
    },
    finance: finance ? {
      // all figures computed from real ledger / payment rows
      gross_orders: sum(`SELECT SUM(total) s FROM orders WHERE status<>'cancelled' AND created_at >= datetime('now', ?)`, since),
      collected_cod: sum(`SELECT SUM(amount) s FROM payments WHERE method='cod' AND kind='charge' AND created_at >= datetime('now', ?)`, since),
      wallet_sales: sum(`SELECT SUM(-delta_available) s FROM wallet_transactions WHERE type='purchase' AND created_at >= datetime('now', ?)`, since),
      topups: sum(`SELECT SUM(delta_available) s FROM wallet_transactions WHERE type='topup' AND created_at >= datetime('now', ?)`, since),
      payouts: sum(`SELECT SUM(-delta_held) s FROM wallet_transactions WHERE type='withdraw_payout' AND created_at >= datetime('now', ?)`, since),
      refunds: sum(`SELECT SUM(delta_available) s FROM wallet_transactions WHERE type IN ('refund','order_cancel_refund') AND created_at >= datetime('now', ?)`, since),
      wallet_liability: sum('SELECT SUM(available + held) s FROM wallets'),
      wallet_held: sum('SELECT SUM(held) s FROM wallets'),
    } : null,
  });
}));

// staff notifications
const staffNotifWhere = req => { const perms = L.ROLE_PERMS[req.user.role]; return { sql: `audience='staff' AND perm IN (${perms.map(() => '?').join(',')})`, p: perms }; };
r.get('/notifications', wrap((req, res) => {
  const w = staffNotifWhere(req);
  res.json({ items: db.prepare(`SELECT * FROM notifications WHERE ${w.sql} ORDER BY id DESC LIMIT 60`).all(...w.p), unread: db.prepare(`SELECT COUNT(*) n FROM notifications WHERE ${w.sql} AND read_at IS NULL`).get(...w.p).n });
}));
r.post('/notifications/read', wrap((req, res) => { const w = staffNotifWhere(req); db.prepare(`UPDATE notifications SET read_at=datetime('now') WHERE ${w.sql} AND read_at IS NULL`).run(...w.p); res.json({ ok: true }); }));

// ---------- products ----------
const EFF = `CASE WHEN p.sale_price IS NOT NULL AND p.sale_price < p.price AND (p.sale_start IS NULL OR p.sale_start <= datetime('now')) AND (p.sale_end IS NULL OR p.sale_end >= datetime('now')) THEN p.sale_price ELSE p.price END`;
r.get('/products', P('products'), wrap((req, res) => {
  const { lim, off } = page(req.query); const w = []; const p = [];
  if (req.query.q) { w.push('(p.search_text LIKE ? OR p.slug LIKE ? OR p.id = ?)'); p.push(`%${L.normalize(req.query.q)}%`, `%${req.query.q}%`, Number(req.query.q) || -1); }
  if (req.query.status) { w.push('p.status = ?'); p.push(req.query.status); } else w.push(`p.status <> 'archived'`);
  if (req.query.cat) { const ids = L.categoryDescendants(Number(req.query.cat)); w.push(`p.category_id IN (${ids.map(() => '?').join(',') || 'NULL'})`); p.push(...ids); }
  if (req.query.low === '1') { w.push(`(SELECT COALESCE(SUM(stock),0) FROM variants v WHERE v.product_id=p.id AND v.active=1) <= ?`); p.push(L.SI('low_stock_threshold') || 5); }
  const W = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM products p ${W}`).get(...p).n;
  const items = db.prepare(`SELECT p.id, p.slug, p.name_ar, p.name_en, p.brand, p.price, p.sale_price, ${EFF} eff, p.status, p.featured, p.is_deal, p.sold_count, p.updated_at,
    c.name_ar cat_ar, c.name_en cat_en, (SELECT COALESCE(SUM(stock),0) FROM variants v WHERE v.product_id=p.id AND v.active=1) stock,
    (SELECT thumb FROM product_images i WHERE i.product_id=p.id ORDER BY is_main DESC, sort LIMIT 1) thumb
    FROM products p LEFT JOIN categories c ON c.id=p.category_id ${W} ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(...p, lim, off);
  res.json({ items, total });
}));
r.get('/products/:id', P('products'), wrap((req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(id(req)); if (!p) fail(404, 'not_found');
  res.json({ ...p, specs: JSON.parse(p.specs || '[]'), images: db.prepare('SELECT * FROM product_images WHERE product_id=? ORDER BY is_main DESC, sort').all(p.id),
    variants: db.prepare('SELECT * FROM variants WHERE product_id=? ORDER BY id').all(p.id),
    movements: db.prepare('SELECT m.*, v.color, v.size FROM inventory_movements m JOIN variants v ON v.id=m.variant_id WHERE v.product_id=? ORDER BY m.id DESC LIMIT 50').all(p.id) });
}));
function readProduct(b, existing) {
  const o = {
    name_ar: V.str(b.name_ar, { min: 2, max: 200, field: 'name_ar' }), name_en: V.str(b.name_en || b.name_ar, { min: 2, max: 200, field: 'name_en' }),
    desc_ar: V.str(b.desc_ar, { optional: true, max: 8000 }), desc_en: V.str(b.desc_en, { optional: true, max: 8000 }),
    brand: V.str(b.brand, { optional: true, max: 80 }), category_id: V.int(b.category_id, { min: 1, field: 'category_id' }),
    price: V.money(b.price, { field: 'price', min: 1 }), sale_price: V.money(b.sale_price, { field: 'sale_price', optional: true }),
    sale_start: V.date(b.sale_start), sale_end: V.date(b.sale_end),
    status: V.oneOf(b.status || 'hidden', ['published', 'hidden', 'archived'], 'status'),
    featured: b.featured ? 1 : 0, is_deal: b.is_deal ? 1 : 0, returnable: b.returnable === false || b.returnable === 0 ? 0 : 1,
    weight_g: V.int(b.weight_g ?? 500, { min: 0, max: 200000, field: 'weight_g' }),
    warranty_ar: V.str(b.warranty_ar, { optional: true, max: 200 }), warranty_en: V.str(b.warranty_en, { optional: true, max: 200 }),
    specs: JSON.stringify((Array.isArray(b.specs) ? b.specs : []).slice(0, 40).map(s => ({ k_ar: String(s.k_ar || '').slice(0, 80), k_en: String(s.k_en || s.k_ar || '').slice(0, 80), v_ar: String(s.v_ar || '').slice(0, 300), v_en: String(s.v_en || s.v_ar || '').slice(0, 300) })).filter(s => s.k_ar && s.v_ar)),
  };
  if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(o.category_id)) fail(400, 'invalid_category');
  if (o.sale_price != null && o.sale_price >= o.price) fail(400, 'sale_price_must_be_lower');
  if (o.sale_start && o.sale_end && o.sale_end <= o.sale_start) fail(400, 'sale_dates_invalid');
  let slug = String(b.slug || o.name_en).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'product';
  const clash = db.prepare('SELECT id FROM products WHERE slug=?').get(slug);
  if (clash && (!existing || clash.id !== existing.id)) slug = `${slug}-${L.rand(4).toLowerCase()}`;
  o.slug = slug;
  return o;
}
function saveVariants(req, pid, variants) {
  if (!Array.isArray(variants) || !variants.length) fail(400, 'variants_required');
  const keep = new Set();
  for (const v of variants.slice(0, 100)) {
    const color = V.str(v.color, { optional: true, max: 40 }); const size = V.str(v.size, { optional: true, max: 20 });
    const stock = V.int(v.stock, { min: 0, max: 1000000, field: 'stock' }); const delta = V.money(v.price_delta || 0, { field: 'price_delta' });
    const sku = V.str(v.sku, { optional: true, max: 60 }); const active = v.active === false ? 0 : 1;
    if (v.id) {
      const cur = db.prepare('SELECT * FROM variants WHERE id=? AND product_id=?').get(Number(v.id), pid); if (!cur) fail(400, 'invalid_variant');
      db.prepare('UPDATE variants SET color=?, size=?, sku=?, price_delta=?, active=? WHERE id=?').run(color, size, sku, delta, active, cur.id);
      if (stock !== cur.stock) { L.moveStock(cur.id, stock - cur.stock, 'adjust', 'admin', req.user.id, req.user.id, 'manual stock edit'); audit(req, 'stock.adjust', 'variant', cur.id, { stock: cur.stock }, { stock }); }
      keep.add(cur.id);
    } else {
      const vid = db.prepare('INSERT INTO variants(product_id,color,size,sku,price_delta,stock,active) VALUES (?,?,?,?,?,0,?)').run(pid, color, size, sku, delta, active).lastInsertRowid;
      if (stock > 0) L.moveStock(vid, stock, 'initial', 'admin', req.user.id, req.user.id, 'new variant');
      keep.add(vid);
    }
  }
  for (const v of db.prepare('SELECT id FROM variants WHERE product_id=?').all(pid)) if (!keep.has(v.id)) db.prepare('UPDATE variants SET active=0 WHERE id=?').run(v.id);
  if (!db.prepare('SELECT 1 FROM variants WHERE product_id=? AND active=1').get(pid)) fail(400, 'variants_required');
}
function assertPublishable(pid, status) {
  if (status !== 'published') return;
  if (!db.prepare('SELECT 1 FROM product_images WHERE product_id=?').get(pid)) fail(400, 'publish_requires_image');
}
r.post('/products', P('products'), wrap((req, res) => {
  const o = readProduct(req.body);
  const pid = db.transaction(() => {
    const pid = db.prepare(`INSERT INTO products(slug,category_id,brand,name_ar,name_en,desc_ar,desc_en,specs,price,sale_price,sale_start,sale_end,status,featured,is_deal,weight_g,warranty_ar,warranty_en,returnable)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(o.slug, o.category_id, o.brand, o.name_ar, o.name_en, o.desc_ar, o.desc_en, o.specs, o.price, o.sale_price, o.sale_start, o.sale_end,
      o.status === 'published' ? 'hidden' : o.status, o.featured, o.is_deal, o.weight_g, o.warranty_ar, o.warranty_en, o.returnable).lastInsertRowid;
    saveVariants(req, pid, req.body.variants || [{ stock: 0 }]);
    db.prepare('UPDATE products SET search_text=? WHERE id=?').run(L.productSearchText(o, o.category_id), pid);
    audit(req, 'product.create', 'product', pid, null, { ...o, specs: undefined });
    return pid;
  })();
  L.resetVocab();
  res.json({ ok: true, id: pid });
}));
r.put('/products/:id', P('products'), wrap((req, res) => {
  const cur = db.prepare('SELECT * FROM products WHERE id=?').get(id(req)); if (!cur) fail(404, 'not_found');
  const o = readProduct(req.body, cur);
  db.transaction(() => {
    db.prepare(`UPDATE products SET slug=?,category_id=?,brand=?,name_ar=?,name_en=?,desc_ar=?,desc_en=?,specs=?,price=?,sale_price=?,sale_start=?,sale_end=?,status=?,featured=?,is_deal=?,weight_g=?,warranty_ar=?,warranty_en=?,returnable=?,updated_at=datetime('now') WHERE id=?`)
      .run(o.slug, o.category_id, o.brand, o.name_ar, o.name_en, o.desc_ar, o.desc_en, o.specs, o.price, o.sale_price, o.sale_start, o.sale_end, o.status, o.featured, o.is_deal, o.weight_g, o.warranty_ar, o.warranty_en, o.returnable, cur.id);
    if (req.body.variants) saveVariants(req, cur.id, req.body.variants);
    assertPublishable(cur.id, o.status);
    db.prepare('UPDATE products SET search_text=? WHERE id=?').run(L.productSearchText(o, o.category_id), cur.id);
    const pick = x => ({ price: x.price, sale_price: x.sale_price, sale_start: x.sale_start, sale_end: x.sale_end, status: x.status });
    audit(req, 'product.update', 'product', cur.id, pick(cur), pick(o));
  })();
  L.resetVocab();
  res.json({ ok: true });
}));
r.delete('/products/:id', P('products'), wrap((req, res) => {
  const pid = id(req); const used = db.prepare('SELECT 1 FROM order_items WHERE product_id=? LIMIT 1').get(pid);
  if (used || req.query.mode !== 'delete') { db.prepare(`UPDATE products SET status='archived', updated_at=datetime('now') WHERE id=?`).run(pid); audit(req, 'product.archive', 'product', pid); return res.json({ ok: true, archived: true }); }
  db.prepare('DELETE FROM products WHERE id=?').run(pid); audit(req, 'product.delete', 'product', pid);
  res.json({ ok: true, deleted: true });
}));
r.post('/products/:id/images', P('products'), H.upload.array('images', 10), wrap(async (req, res) => {
  const pid = id(req); if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(pid)) fail(404, 'not_found');
  if (!req.files?.length) fail(400, 'no_files');
  const hasMain = db.prepare('SELECT 1 FROM product_images WHERE product_id=? AND is_main=1').get(pid);
  let sort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM product_images WHERE product_id=?').get(pid).m;
  for (const [i, f] of req.files.entries()) {
    const img = await H.savePublicImage(f);
    db.prepare('INSERT INTO product_images(product_id,path,thumb,sort,is_main) VALUES (?,?,?,?,?)').run(pid, img.path, img.thumb, ++sort, !hasMain && i === 0 ? 1 : 0);
  }
  audit(req, 'product.images_add', 'product', pid, null, { count: req.files.length });
  res.json({ ok: true, images: db.prepare('SELECT * FROM product_images WHERE product_id=? ORDER BY is_main DESC, sort').all(pid) });
}));
r.post('/images/:id/main', P('products'), wrap((req, res) => {
  const img = db.prepare('SELECT * FROM product_images WHERE id=?').get(id(req)); if (!img) fail(404, 'not_found');
  db.transaction(() => { db.prepare('UPDATE product_images SET is_main=0 WHERE product_id=?').run(img.product_id); db.prepare('UPDATE product_images SET is_main=1 WHERE id=?').run(img.id); })();
  res.json({ ok: true });
}));
r.delete('/images/:id', P('products'), wrap((req, res) => {
  const img = db.prepare('SELECT * FROM product_images WHERE id=?').get(id(req)); if (!img) fail(404, 'not_found');
  const p = db.prepare('SELECT status FROM products WHERE id=?').get(img.product_id);
  const count = db.prepare('SELECT COUNT(*) n FROM product_images WHERE product_id=?').get(img.product_id).n;
  if (p.status === 'published' && count <= 1) fail(400, 'publish_requires_image');
  db.transaction(() => {
    db.prepare('DELETE FROM product_images WHERE id=?').run(img.id);
    if (img.is_main) db.prepare('UPDATE product_images SET is_main=1 WHERE id=(SELECT id FROM product_images WHERE product_id=? ORDER BY sort LIMIT 1)').run(img.product_id);
  })();
  if (!img.path.includes('/demo-')) for (const f of [img.path, img.thumb]) fs.rm(path.join(H.PUBLIC_UPLOADS, String(f).replace(/^\/uploads\//, '')), () => { });
  res.json({ ok: true });
}));

// reviews moderation
r.get('/reviews', P('products'), wrap((req, res) => res.json(db.prepare('SELECT r.*, p.name_ar, p.name_en FROM reviews r JOIN products p ON p.id=r.product_id ORDER BY r.id DESC LIMIT 200').all())));
r.put('/reviews/:id', P('products'), wrap((req, res) => {
  const rv = db.prepare('SELECT * FROM reviews WHERE id=?').get(id(req)); if (!rv) fail(404, 'not_found');
  db.transaction(() => {
    db.prepare('UPDATE reviews SET visible=? WHERE id=?').run(req.body.visible ? 1 : 0, rv.id);
    const s = db.prepare('SELECT AVG(rating) a, COUNT(*) n FROM reviews WHERE product_id=? AND visible=1').get(rv.product_id);
    db.prepare('UPDATE products SET rating_avg=?, rating_count=? WHERE id=?').run(Math.round((s.a || 0) * 10) / 10, s.n, rv.product_id);
  })();
  audit(req, 'review.visibility', 'review', rv.id, { visible: rv.visible }, { visible: req.body.visible ? 1 : 0 });
  res.json({ ok: true });
}));

// ---------- categories ----------
r.get('/categories', P('categories'), wrap((req, res) => res.json(categoryTree(true))));
r.get('/categories/flat', wrap((req, res) => res.json(db.prepare('SELECT id, parent_id, slug, name_ar, name_en, visible, sort FROM categories ORDER BY sort, id').all())));
function readCategory(b, curId) {
  const o = { name_ar: V.str(b.name_ar, { min: 2, max: 100, field: 'name_ar' }), name_en: V.str(b.name_en || b.name_ar, { min: 2, max: 100, field: 'name_en' }),
    icon: V.str(b.icon, { optional: true, max: 30 }), parent_id: b.parent_id ? V.int(b.parent_id, { min: 1 }) : null,
    visible: b.visible === false || b.visible === 0 ? 0 : 1, sort: V.int(b.sort ?? 0, { min: 0, max: 10000 }) };
  if (o.parent_id && !db.prepare('SELECT 1 FROM categories WHERE id=?').get(o.parent_id)) fail(400, 'invalid_parent');
  if (curId && o.parent_id && L.categoryDescendants(curId).includes(o.parent_id)) fail(400, 'category_cycle');
  let slug = String(b.slug || o.name_en).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'category';
  const c = db.prepare('SELECT id FROM categories WHERE slug=?').get(slug); if (c && c.id !== curId) slug += '-' + L.rand(3).toLowerCase();
  o.slug = slug; return o;
}
r.post('/categories', P('categories'), wrap((req, res) => {
  const o = readCategory(req.body);
  const cid = db.prepare('INSERT INTO categories(parent_id,slug,name_ar,name_en,icon,sort,visible) VALUES (?,?,?,?,?,?,?)').run(o.parent_id, o.slug, o.name_ar, o.name_en, o.icon, o.sort, o.visible).lastInsertRowid;
  audit(req, 'category.create', 'category', cid, null, o); res.json({ ok: true, id: cid });
}));
r.put('/categories/:id', P('categories'), wrap((req, res) => {
  const cid = id(req); const cur = db.prepare('SELECT * FROM categories WHERE id=?').get(cid); if (!cur) fail(404, 'not_found');
  const o = readCategory(req.body, cid);
  db.prepare('UPDATE categories SET parent_id=?,slug=?,name_ar=?,name_en=?,icon=?,sort=?,visible=? WHERE id=?').run(o.parent_id, o.slug, o.name_ar, o.name_en, o.icon, o.sort, o.visible, cid);
  audit(req, 'category.update', 'category', cid, cur, o); res.json({ ok: true });
}));
r.post('/categories/reorder', P('categories'), wrap((req, res) => {
  db.transaction(() => { for (const x of (req.body.items || []).slice(0, 500)) db.prepare('UPDATE categories SET sort=? WHERE id=?').run(V.int(x.sort, { min: 0 }), V.int(x.id, { min: 1 })); })();
  audit(req, 'category.reorder', 'category', null); res.json({ ok: true });
}));
r.delete('/categories/:id', P('categories'), wrap((req, res) => {
  const cid = id(req);
  if (db.prepare('SELECT 1 FROM categories WHERE parent_id=?').get(cid)) fail(400, 'category_has_children');
  if (db.prepare('SELECT 1 FROM products WHERE category_id=?').get(cid)) fail(400, 'category_has_products');
  db.prepare('DELETE FROM categories WHERE id=?').run(cid); audit(req, 'category.delete', 'category', cid); res.json({ ok: true });
}));
r.post('/categories/:id/image', P('categories'), H.upload.single('image'), wrap(async (req, res) => {
  const cid = id(req); if (!req.file) fail(400, 'no_files');
  const img = await H.savePublicImage(req.file, 'products', 600);
  db.prepare('UPDATE categories SET image=? WHERE id=?').run(img.thumb, cid); res.json({ ok: true, image: img.thumb });
}));

// ---------- orders ----------
r.get('/orders', P('orders'), wrap((req, res) => {
  const { lim, off } = page(req.query); const w = []; const p = [];
  if (req.query.status) { w.push('o.status = ?'); p.push(req.query.status); }
  if (req.query.payment) { w.push('o.payment_method = ?'); p.push(req.query.payment); }
  if (req.query.pstatus) { w.push('o.payment_status = ?'); p.push(req.query.pstatus); }
  if (req.query.from) { w.push('date(o.created_at) >= date(?)'); p.push(req.query.from); }
  if (req.query.to) { w.push('date(o.created_at) <= date(?)'); p.push(req.query.to); }
  if (req.query.q) { w.push('(o.number LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR o.ship_phone LIKE ? OR u.phone LIKE ?)'); const q = `%${req.query.q}%`; p.push(q, q, q, q, q); }
  if (req.query.user) { w.push('o.user_id = ?'); p.push(Number(req.query.user)); }
  const W = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM orders o JOIN users u ON u.id=o.user_id ${W}`).get(...p).n;
  const items = db.prepare(`SELECT o.id,o.number,o.status,o.payment_method,o.payment_status,o.total,o.created_at,o.ship_wilaya,o.delivery_method,u.name customer,u.email,
    (SELECT SUM(qty) FROM order_items WHERE order_id=o.id) qty, c.name carrier FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN carriers c ON c.id=o.carrier_id ${W} ORDER BY o.id DESC LIMIT ? OFFSET ?`).all(...p, lim, off);
  res.json({ items, total });
}));
function orderFull(oid) {
  const o = db.prepare(`SELECT o.*, u.name customer, u.email, u.phone customer_phone, c.name carrier_name, c.code carrier_code, c.mode carrier_mode, c.last_test_ok carrier_ok
    FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN carriers c ON c.id=o.carrier_id WHERE o.id=?`).get(oid);
  if (!o) fail(404, 'not_found');
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(oid);
  o.history = db.prepare('SELECT h.*, u.name actor FROM order_history h LEFT JOIN users u ON u.id=h.actor_id WHERE order_id=? ORDER BY h.id').all(oid);
  o.payments = db.prepare('SELECT * FROM payments WHERE order_id=? ORDER BY id').all(oid);
  o.shipment = db.prepare('SELECT * FROM shipments WHERE order_id=?').get(oid) || null;
  o.refunds = db.prepare('SELECT * FROM refund_requests WHERE order_id=? ORDER BY id DESC').all(oid);
  o.next = L.ORDER_FLOW[o.status] || [];
  o.refundable = o.paid_amount - o.refunded_amount;
  delete o.idempotency_key;
  return o;
}
r.get('/orders/:id', P('orders'), wrap((req, res) => res.json(orderFull(id(req)))));
r.post('/orders/:id/status', P('orders'), wrap((req, res) => {
  const to = V.str(req.body.to, { field: 'to' }); const note = V.str(req.body.note, { optional: true, max: 500 });
  if (to === 'cancelled' && !note) fail(400, 'reason_required');
  db.transaction(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id(req)); if (!o) fail(404, 'not_found');
    L.changeOrderStatus(o, to, { note, actorId: req.user.id, restock: req.body.restock !== false });
    audit(req, 'order.status', 'order', o.id, { status: o.status }, { status: to, note });
  })();
  res.json(orderFull(id(req)));
}));
r.post('/orders/:id/collect', P('orders'), wrap((req, res) => {
  db.transaction(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id(req)); if (!o) fail(404, 'not_found');
    if (o.payment_method !== 'cod') fail(400, 'not_cod');
    if (o.status !== 'delivered') fail(400, 'collect_requires_delivered');
    const u = db.prepare(`UPDATE orders SET payment_status='paid', paid_amount=total, paid_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND payment_status='unpaid'`).run(o.id);
    if (!u.changes) fail(409, 'already_processed');
    db.prepare(`INSERT INTO payments(order_id,method,kind,amount,reference,actor_id) VALUES (?,?,?,?,?,?)`).run(o.id, 'cod', 'charge', o.total, V.str(req.body.reference, { optional: true, max: 120 }), req.user.id);
    L.addHistory(o.id, o.status, o.status, `COD collected: ${L.fmtDZD(o.total)}`, req.user.id, 'admin');
    audit(req, 'order.cod_collected', 'order', o.id, { payment_status: 'unpaid' }, { payment_status: 'paid', amount: o.total });
  })();
  res.json(orderFull(id(req)));
}));
r.post('/orders/:id/notes', P('orders'), wrap((req, res) => {
  const note = V.str(req.body.note, { min: 1, max: 2000, field: 'note' }); const oid = id(req);
  db.prepare(`UPDATE orders SET admin_notes = COALESCE(admin_notes || char(10), '') || ? WHERE id=?`).run(`[${L.now()} ${req.user.name}] ${note}`, oid);
  audit(req, 'order.note', 'order', oid, null, { note }); res.json(orderFull(oid));
}));
r.post('/orders/:id/shipment', P('orders'), wrap(async (req, res) => {
  const oid = id(req); const o = orderFull(oid);
  if (o.shipment) fail(400, 'shipment_exists');
  if (!['ready', 'processing', 'confirmed'].includes(o.status)) fail(400, 'invalid_transition', { from: o.status, to: 'shipment_created' });
  const carrierId = V.int(req.body.carrier_id || o.carrier_id, { min: 1, field: 'carrier_id' });
  const carrier = db.prepare('SELECT * FROM carriers WHERE id=?').get(carrierId); if (!carrier) fail(400, 'invalid_carrier');
  let ship;
  if (req.body.mode === 'api') {
    if (carrier.mode !== 'api' || !carrier.last_test_ok || !carrier.api_id || !carrier.api_secret) fail(400, 'carrier_not_connected');
    const ad = adapterFor(carrier); if (!ad) fail(400, 'carrier_not_supported');
    const w = db.prepare('SELECT w.name_en we, c.name_en ce FROM wilayas w JOIN communes c ON c.wilaya_id=w.id WHERE w.id=? AND c.id=?').get(o.wilaya_id, o.commune_id);
    const from = carrier.from_wilaya_id ? db.prepare('SELECT name_en FROM wilayas WHERE id=?').get(carrier.from_wilaya_id)?.name_en : '';
    try { ship = await ad.create(carrier, { ...o, wilaya_en: w.we, commune_en: w.ce }, o.items, { stopdeskId: req.body.stopdesk_id, fromWilaya: from }); }
    catch (e) { audit(req, 'shipment.api_error', 'order', oid, null, { carrier: carrier.code, error: String(e.message).slice(0, 300) }); fail(502, 'carrier_error', { message: String(e.message).slice(0, 300) }); }
    ship.source = 'api';
  } else {
    ship = { tracking: V.str(req.body.tracking, { min: 3, max: 80, field: 'tracking' }), label_url: null, raw: null, source: 'manual' };
  }
  db.transaction(() => {
    const cur = db.prepare('SELECT * FROM orders WHERE id=?').get(oid);
    if (cur.status !== 'ready') { // walk the flow so history stays explicit
      for (const step of ['processing', 'ready']) { const c2 = db.prepare('SELECT * FROM orders WHERE id=?').get(oid); if ((L.ORDER_FLOW[c2.status] || []).includes(step)) L.changeOrderStatus(c2, step, { actorId: req.user.id, note: 'auto (shipment)' }); }
    }
    db.prepare('INSERT INTO shipments(order_id,carrier_id,tracking,source,status,label_url,stopdesk_id,raw) VALUES (?,?,?,?,?,?,?,?)')
      .run(oid, carrierId, ship.tracking, ship.source, V.str(req.body.status_text, { optional: true, max: 80 }) || 'created', ship.label_url, req.body.stopdesk_id || null, ship.raw ? JSON.stringify(ship.raw).slice(0, 4000) : null);
    db.prepare('UPDATE orders SET carrier_id=? WHERE id=?').run(carrierId, oid);
    L.changeOrderStatus(db.prepare('SELECT * FROM orders WHERE id=?').get(oid), 'shipment_created', { actorId: req.user.id, note: `${carrier.name} • ${ship.tracking}` });
    L.notify(o.user_id, 'shipment_update', { number: o.number, tracking: ship.tracking }, `/account/orders/${o.number}`);
    audit(req, 'shipment.create', 'order', oid, null, { carrier: carrier.code, tracking: ship.tracking, source: ship.source });
  })();
  res.json(orderFull(oid));
}));
r.put('/orders/:id/shipment', P('orders'), wrap((req, res) => {
  const oid = id(req); const s = db.prepare('SELECT * FROM shipments WHERE order_id=?').get(oid); if (!s) fail(404, 'not_found');
  const tracking = V.str(req.body.tracking, { min: 3, max: 80, field: 'tracking' }); const status = V.str(req.body.status_text, { optional: true, max: 80 });
  db.prepare(`UPDATE shipments SET tracking=?, status=COALESCE(?,status), updated_at=datetime('now') WHERE id=?`).run(tracking, status, s.id);
  audit(req, 'shipment.update', 'order', oid, { tracking: s.tracking, status: s.status }, { tracking, status });
  res.json(orderFull(oid));
}));
async function syncShipment(s, req) {
  const carrier = db.prepare('SELECT * FROM carriers WHERE id=?').get(s.carrier_id);
  if (!carrier || s.source !== 'api' || carrier.mode !== 'api' || !carrier.last_test_ok) fail(400, 'carrier_not_connected');
  const ad = adapterFor(carrier);
  const st = await ad.status(carrier, s.tracking);
  db.prepare(`UPDATE shipments SET status=?, raw=?, last_sync_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(st.status, JSON.stringify(st.raw).slice(0, 4000), s.id);
  const mapped = ad.mapStatus(st.status);
  if (mapped) db.transaction(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(s.order_id);
    if ((L.ORDER_FLOW[o.status] || []).includes(mapped)) L.changeOrderStatus(o, mapped, { actorId: req?.user?.id, actorType: 'carrier', note: `${carrier.name}: ${st.status}` });
  })();
  return st;
}
r.post('/orders/:id/shipment/sync', P('orders'), wrap(async (req, res) => {
  const oid = id(req); const s = db.prepare('SELECT * FROM shipments WHERE order_id=?').get(oid); if (!s) fail(404, 'not_found');
  try { await syncShipment(s, req); } catch (e) { if (e instanceof L.AppError) throw e; fail(502, 'carrier_error', { message: String(e.message).slice(0, 200) }); }
  res.json(orderFull(oid));
}));
r.post('/orders/:id/refund', P('finance'), wrap((req, res) => {
  const oid = id(req); const amount = V.money(req.body.amount, { min: 1 }); const note = V.str(req.body.note, { min: 3, max: 500, field: 'note' });
  db.transaction(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(oid); if (!o) fail(404, 'not_found');
    if (db.prepare(`SELECT 1 FROM refund_requests WHERE order_id=? AND status IN ('pending','needs_info')`).get(oid)) fail(400, 'refund_request_open');
    const rid = db.prepare('INSERT INTO refund_requests(ref,order_id,user_id,reason,details,requested_amount,order_prev_status) VALUES (?,?,?,?,?,?,?)')
      .run(L.makeRef('RFD'), oid, o.user_id, 'admin', note, amount, o.status).lastInsertRowid;
    L.approveRefund(rid, amount, req.user.id, note);
    audit(req, 'refund.admin_initiated', 'order', oid, null, { amount, note });
  })();
  res.json(orderFull(oid));
}));

// ---------- customers ----------
r.get('/customers', P('customers'), wrap((req, res) => {
  const { lim, off } = page(req.query); const w = [`u.role='customer'`]; const p = [];
  if (req.query.q) { w.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)'); const q = `%${req.query.q}%`; p.push(q, q, q); }
  if (req.query.status) { w.push('u.status=?'); p.push(req.query.status); }
  const W = 'WHERE ' + w.join(' AND ');
  res.json({ total: db.prepare(`SELECT COUNT(*) n FROM users u ${W}`).get(...p).n,
    items: db.prepare(`SELECT u.id,u.name,u.email,u.phone,u.status,u.email_verified_at,u.created_at, COALESCE(w.available,0) available, COALESCE(w.held,0) held,
      (SELECT COUNT(*) FROM orders WHERE user_id=u.id) orders, (SELECT COALESCE(SUM(total),0) FROM orders WHERE user_id=u.id AND status<>'cancelled') spent
      FROM users u LEFT JOIN wallets w ON w.user_id=u.id ${W} ORDER BY u.id DESC LIMIT ? OFFSET ?`).all(...p, lim, off) });
}));
r.get('/customers/:id', P('customers'), wrap((req, res) => {
  const u = db.prepare('SELECT id,name,email,phone,role,status,email_verified_at,lang,currency,created_at FROM users WHERE id=?').get(id(req)); if (!u) fail(404, 'not_found');
  const fin = L.can(req.user, 'finance');
  res.json({ ...u,
    wallet: db.prepare('SELECT available, held FROM wallets WHERE user_id=?').get(u.id) || { available: 0, held: 0 },
    addresses: db.prepare(`SELECT a.*, w.name_ar w_ar, c.name_ar c_ar FROM addresses a JOIN wilayas w ON w.id=a.wilaya_id JOIN communes c ON c.id=a.commune_id WHERE user_id=?`).all(u.id),
    orders: db.prepare('SELECT id,number,status,payment_method,payment_status,total,created_at FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 100').all(u.id),
    transactions: fin ? db.prepare('SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 200').all(u.id) : null,
    topups: fin ? db.prepare('SELECT * FROM topup_requests WHERE user_id=? ORDER BY id DESC').all(u.id) : null,
    withdrawals: fin ? db.prepare('SELECT * FROM withdrawal_requests WHERE user_id=? ORDER BY id DESC').all(u.id) : null,
    tickets: db.prepare('SELECT id,ref,subject,status,created_at FROM tickets WHERE user_id=? ORDER BY id DESC').all(u.id) });
}));
r.post('/customers/:id/status', P('customers'), wrap((req, res) => {
  if (!['admin', 'manager'].includes(req.user.role)) fail(403, 'forbidden');
  const uid = id(req); const status = V.oneOf(req.body.status, ['active', 'suspended'], 'status'); const reason = V.str(req.body.reason, { min: 3, max: 300, field: 'reason' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(uid); if (!u || u.role !== 'customer') fail(404, 'not_found');
  db.prepare('UPDATE users SET status=? WHERE id=?').run(status, uid);
  if (status === 'suspended') db.prepare('DELETE FROM sessions WHERE user_id=?').run(uid);
  audit(req, 'customer.status', 'user', uid, { status: u.status }, { status, reason }); res.json({ ok: true });
}));

// ---------- finance ----------
const userJoin = 'JOIN users u ON u.id=x.user_id';
r.get('/finance/topups', P('finance'), wrap((req, res) => {
  const st = req.query.status; const { lim, off } = page(req.query);
  const W = st ? 'WHERE x.status=?' : ''; const p = st ? [st] : [];
  res.json({ total: db.prepare(`SELECT COUNT(*) n FROM topup_requests x ${W}`).get(...p).n,
    items: db.prepare(`SELECT x.*, u.name customer, u.email, u.phone, r.name reviewer FROM topup_requests x ${userJoin} LEFT JOIN users r ON r.id=x.reviewed_by ${W} ORDER BY CASE x.status WHEN 'pending' THEN 0 WHEN 'needs_info' THEN 1 ELSE 2 END, x.id DESC LIMIT ? OFFSET ?`).all(...p, lim, off) });
}));
r.post('/finance/topups/:id/approve', P('finance'), wrap((req, res) => {
  const tid = id(req); const note = V.str(req.body.note, { optional: true, max: 500 });
  const out = db.transaction(() => {
    const t = db.prepare('SELECT * FROM topup_requests WHERE id=?').get(tid); if (!t) fail(404, 'not_found');
    const approved = req.body.amount != null && req.body.amount !== '' ? V.money(req.body.amount, { min: 1 }) : t.sent_amount;
    const rm = L.rateMicro();
    const dzd = t.currency === 'USD' ? L.usdToDzd(approved, rm) : approved;
    const u = db.prepare(`UPDATE topup_requests SET status='approved', approved_amount=?, credited_dzd=?, fx_rate_micro=?, admin_note=COALESCE(?,admin_note), reviewed_by=?, reviewed_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND status IN ('pending','needs_info')`).run(approved, dzd, t.currency === 'USD' ? rm : null, note, req.user.id, tid);
    if (!u.changes) fail(409, 'already_processed');
    const tx = L.walletApply({ userId: t.user_id, type: 'topup', dAvail: dzd, origCurrency: t.currency, origAmount: approved, fx: t.currency === 'USD' ? rm : null, sourceType: 'topup', sourceId: t.id, note: `${t.method.toUpperCase()} ${t.ref}`, actorId: req.user.id });
    L.notify(t.user_id, 'topup_approved', { ref: t.ref, amount: L.fmtDZD(dzd) }, '/account/wallet');
    audit(req, 'topup.approve', 'topup', t.id, { status: t.status }, { status: 'approved', approved, credited_dzd: dzd, tx: tx.ref });
    return tx;
  })();
  res.json({ ok: true, tx: out.ref });
}));
r.post('/finance/topups/:id/reject', P('finance'), wrap((req, res) => {
  const reason = V.str(req.body.reason, { min: 3, max: 500, field: 'reason' }); const tid = id(req);
  db.transaction(() => {
    const t = db.prepare('SELECT * FROM topup_requests WHERE id=?').get(tid); if (!t) fail(404, 'not_found');
    const u = db.prepare(`UPDATE topup_requests SET status='rejected', admin_note=?, reviewed_by=?, reviewed_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status IN ('pending','needs_info')`).run(reason, req.user.id, tid);
    if (!u.changes) fail(409, 'already_processed');
    L.notify(t.user_id, 'topup_rejected', { ref: t.ref, reason }, '/account/wallet');
    audit(req, 'topup.reject', 'topup', t.id, { status: t.status }, { status: 'rejected', reason });
  })();
  res.json({ ok: true });
}));
r.post('/finance/topups/:id/request-info', P('finance'), wrap((req, res) => {
  const note = V.str(req.body.note, { min: 3, max: 500, field: 'note' }); const tid = id(req);
  const t = db.prepare('SELECT * FROM topup_requests WHERE id=?').get(tid); if (!t) fail(404, 'not_found');
  const u = db.prepare(`UPDATE topup_requests SET status='needs_info', admin_note=?, reviewed_by=?, updated_at=datetime('now') WHERE id=? AND status='pending'`).run(note, req.user.id, tid);
  if (!u.changes) fail(409, 'already_processed');
  L.notify(t.user_id, 'topup_info', { ref: t.ref, reason: note }, '/account/wallet');
  audit(req, 'topup.request_info', 'topup', t.id, null, { note }); res.json({ ok: true });
}));
r.get('/finance/withdrawals', P('finance'), wrap((req, res) => {
  const st = req.query.status; const { lim, off } = page(req.query); const W = st ? 'WHERE x.status=?' : ''; const p = st ? [st] : [];
  res.json({ total: db.prepare(`SELECT COUNT(*) n FROM withdrawal_requests x ${W}`).get(...p).n,
    items: db.prepare(`SELECT x.*, u.name customer, u.email, u.phone, u.email_verified_at, r.name reviewer, pb.name payer FROM withdrawal_requests x ${userJoin} LEFT JOIN users r ON r.id=x.reviewed_by LEFT JOIN users pb ON pb.id=x.paid_by ${W}
      ORDER BY CASE x.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'needs_info' THEN 2 ELSE 3 END, x.id DESC LIMIT ? OFFSET ?`).all(...p, lim, off) });
}));
r.post('/finance/withdrawals/:id/approve', P('finance'), wrap((req, res) => {
  const wid = id(req); const note = V.str(req.body.note, { optional: true, max: 500 });
  const w = db.prepare('SELECT * FROM withdrawal_requests WHERE id=?').get(wid); if (!w) fail(404, 'not_found');
  const u = db.prepare(`UPDATE withdrawal_requests SET status='approved', admin_note=COALESCE(?,admin_note), reviewed_by=?, reviewed_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status IN ('pending','needs_info')`).run(note, req.user.id, wid);
  if (!u.changes) fail(409, 'already_processed');
  L.notify(w.user_id, 'withdraw_approved', { ref: w.ref }, '/account/wallet');
  audit(req, 'withdrawal.approve', 'withdrawal', wid, { status: w.status }, { status: 'approved' }); res.json({ ok: true });
}));
r.post('/finance/withdrawals/:id/pay', P('finance'), wrap((req, res) => {
  const wid = id(req); const payout = V.str(req.body.payout_reference, { min: 3, max: 120, field: 'payout_reference' });
  db.transaction(() => {
    const w = db.prepare('SELECT * FROM withdrawal_requests WHERE id=?').get(wid); if (!w) fail(404, 'not_found');
    const u = db.prepare(`UPDATE withdrawal_requests SET status='paid', payout_reference=?, paid_by=?, paid_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status='approved'`).run(payout, req.user.id, wid);
    if (!u.changes) fail(409, 'already_processed');
    L.walletApply({ userId: w.user_id, type: 'withdraw_payout', dHeld: -w.amount_dzd, origCurrency: w.currency, origAmount: w.net_orig, fx: w.fx_rate_micro, sourceType: 'withdrawal', sourceId: w.id, note: `Payout ${payout}`, actorId: req.user.id });
    L.notify(w.user_id, 'withdraw_paid', { ref: w.ref, payout }, '/account/wallet');
    audit(req, 'withdrawal.pay', 'withdrawal', wid, { status: 'approved' }, { status: 'paid', payout_reference: payout, amount_dzd: w.amount_dzd });
  })();
  res.json({ ok: true });
}));
r.post('/finance/withdrawals/:id/reject', P('finance'), wrap((req, res) => {
  const wid = id(req); const reason = V.str(req.body.reason, { min: 3, max: 500, field: 'reason' });
  db.transaction(() => {
    const w = db.prepare('SELECT * FROM withdrawal_requests WHERE id=?').get(wid); if (!w) fail(404, 'not_found');
    const u = db.prepare(`UPDATE withdrawal_requests SET status='rejected', admin_note=?, reviewed_by=?, reviewed_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status IN ('pending','needs_info','approved')`).run(reason, req.user.id, wid);
    if (!u.changes) fail(409, 'already_processed');
    L.walletApply({ userId: w.user_id, type: 'withdraw_release', dAvail: w.amount_dzd, dHeld: -w.amount_dzd, origCurrency: w.currency, origAmount: w.orig_amount, fx: w.fx_rate_micro, sourceType: 'withdrawal', sourceId: w.id, note: `Rejected: ${reason}`, actorId: req.user.id });
    L.notify(w.user_id, 'withdraw_rejected', { ref: w.ref, reason }, '/account/wallet');
    audit(req, 'withdrawal.reject', 'withdrawal', wid, { status: w.status }, { status: 'rejected', reason });
  })();
  res.json({ ok: true });
}));
r.post('/finance/withdrawals/:id/request-info', P('finance'), wrap((req, res) => {
  const wid = id(req); const note = V.str(req.body.note, { min: 3, max: 500, field: 'note' });
  const w = db.prepare('SELECT * FROM withdrawal_requests WHERE id=?').get(wid); if (!w) fail(404, 'not_found');
  const u = db.prepare(`UPDATE withdrawal_requests SET status='needs_info', admin_note=?, reviewed_by=?, updated_at=datetime('now') WHERE id=? AND status='pending'`).run(note, req.user.id, wid);
  if (!u.changes) fail(409, 'already_processed');
  L.notify(w.user_id, 'withdraw_info', { ref: w.ref, reason: note }, '/account/wallet');
  audit(req, 'withdrawal.request_info', 'withdrawal', wid, null, { note }); res.json({ ok: true });
}));
r.get('/finance/refunds', P('finance'), wrap((req, res) => {
  const st = req.query.status; const W = st ? 'WHERE x.status=?' : ''; const p = st ? [st] : [];
  res.json({ items: db.prepare(`SELECT x.*, u.name customer, u.email, o.number, o.total, o.paid_amount, o.refunded_amount, o.payment_method, o.payment_status, o.status order_status
    FROM refund_requests x ${userJoin} JOIN orders o ON o.id=x.order_id ${W} ORDER BY CASE x.status WHEN 'pending' THEN 0 WHEN 'needs_info' THEN 1 ELSE 2 END, x.id DESC LIMIT 200`).all(...p) });
}));
r.post('/finance/refunds/:id/approve', P('finance'), wrap((req, res) => {
  const rid = id(req); const amount = V.money(req.body.amount, { min: 1 }); const note = V.str(req.body.note, { optional: true, max: 500 });
  db.transaction(() => { const tx = L.approveRefund(rid, amount, req.user.id, note); audit(req, 'refund.approve', 'refund', rid, null, { amount, tx: tx.ref }); })();
  res.json({ ok: true });
}));
r.post('/finance/refunds/:id/reject', P('finance'), wrap((req, res) => {
  const rid = id(req); const reason = V.str(req.body.reason, { min: 3, max: 500, field: 'reason' });
  db.transaction(() => {
    const rr = db.prepare('SELECT * FROM refund_requests WHERE id=?').get(rid); if (!rr) fail(404, 'not_found');
    const u = db.prepare(`UPDATE refund_requests SET status='rejected', admin_note=?, reviewed_by=?, reviewed_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status IN ('pending','needs_info')`).run(reason, req.user.id, rid);
    if (!u.changes) fail(409, 'already_processed');
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(rr.order_id);
    if (o.status === 'refund_pending' && rr.order_prev_status) { db.prepare('UPDATE orders SET status=? WHERE id=?').run(rr.order_prev_status, o.id); L.addHistory(o.id, o.status, rr.order_prev_status, `Refund ${rr.ref} rejected`, req.user.id, 'admin'); }
    L.notify(rr.user_id, 'refund_rejected', { ref: rr.ref, reason }, `/account/orders/${o.number}`);
    audit(req, 'refund.reject', 'refund', rid, null, { reason });
  })();
  res.json({ ok: true });
}));
r.post('/finance/refunds/:id/request-info', P('finance'), wrap((req, res) => {
  const rid = id(req); const note = V.str(req.body.note, { min: 3, max: 500, field: 'note' });
  const rr = db.prepare('SELECT * FROM refund_requests WHERE id=?').get(rid); if (!rr) fail(404, 'not_found');
  const u = db.prepare(`UPDATE refund_requests SET status='needs_info', admin_note=?, updated_at=datetime('now') WHERE id=? AND status='pending'`).run(note, rid);
  if (!u.changes) fail(409, 'already_processed');
  L.notify(rr.user_id, 'refund_info', { ref: rr.ref, reason: note }, '/account/wallet');
  audit(req, 'refund.request_info', 'refund', rid, null, { note }); res.json({ ok: true });
}));
r.get('/finance/transactions', P('finance'), wrap((req, res) => {
  const w = []; const p = [];
  if (req.query.user) { w.push('x.user_id=?'); p.push(Number(req.query.user)); }
  if (req.query.type) { w.push('x.type=?'); p.push(req.query.type); }
  if (req.query.from) { w.push('date(x.created_at) >= date(?)'); p.push(req.query.from); }
  if (req.query.to) { w.push('date(x.created_at) <= date(?)'); p.push(req.query.to); }
  if (req.query.q) { w.push('(x.ref LIKE ? OR u.email LIKE ? OR u.name LIKE ?)'); const q = `%${req.query.q}%`; p.push(q, q, q); }
  const W = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const sql = `SELECT x.*, u.name customer, u.email, a.name actor FROM wallet_transactions x ${userJoin} LEFT JOIN users a ON a.id=x.actor_id ${W} ORDER BY x.id DESC`;
  if (req.query.format === 'csv') {
    const rows = db.prepare(sql + ' LIMIT 50000').all(...p);
    const cols = ['ref', 'created_at', 'customer', 'email', 'type', 'delta_available', 'delta_held', 'available_after', 'held_after', 'orig_currency', 'orig_amount', 'fx_rate_micro', 'source_type', 'source_id', 'note', 'actor'];
    const esc = v => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) && isNaN(Number(s)) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
    audit(req, 'report.export', 'wallet_transactions', null, null, { filters: req.query });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="transactions-${Date.now()}.csv"`);
    return res.send('\uFEFF' + [cols.join(','), ...rows.map(r0 => cols.map(c => esc(c.startsWith('delta') || c.endsWith('_after') ? (r0[c] / 100).toFixed(2) : r0[c])).join(','))].join('\n'));
  }
  const { lim, off } = page(req.query, 50);
  res.json({ total: db.prepare(`SELECT COUNT(*) n FROM wallet_transactions x ${userJoin} ${W}`).get(...p).n, items: db.prepare(sql + ' LIMIT ? OFFSET ?').all(...p, lim, off),
    totals: db.prepare('SELECT SUM(available) available, SUM(held) held FROM wallets').get() });
}));

// ---------- coupons ----------
r.get('/coupons', P('coupons'), wrap((req, res) => res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM coupon_usages WHERE coupon_id=c.id AND active=1) uses, (SELECT COALESCE(SUM(discount),0) FROM coupon_usages WHERE coupon_id=c.id AND active=1) total_discount FROM coupons c ORDER BY id DESC`).all())));
function readCoupon(b) {
  const type = V.oneOf(b.type, ['percent', 'fixed'], 'type');
  const o = { code: V.str(b.code, { min: 3, max: 30, field: 'code' }).toUpperCase().replace(/\s/g, ''), type,
    value: type === 'percent' ? V.int(b.value, { min: 1, max: 100, field: 'value' }) : V.money(b.value, { min: 1, field: 'value' }),
    starts_at: V.date(b.starts_at), ends_at: V.date(b.ends_at), min_order: V.money(b.min_order || 0, { field: 'min_order' }),
    max_discount: V.money(b.max_discount, { optional: true, field: 'max_discount' }), usage_limit: V.int(b.usage_limit, { optional: true, min: 1 }), per_user_limit: V.int(b.per_user_limit, { optional: true, min: 1 }),
    product_ids: JSON.stringify((b.product_ids || []).map(Number).filter(Boolean).slice(0, 500)), category_ids: JSON.stringify((b.category_ids || []).map(Number).filter(Boolean).slice(0, 200)),
    user_ids: JSON.stringify((b.user_ids || []).map(Number).filter(Boolean).slice(0, 500)), active: b.active === false || b.active === 0 ? 0 : 1, note: V.str(b.note, { optional: true, max: 300 }) };
  if (!/^[A-Z0-9_-]+$/.test(o.code)) fail(400, 'invalid_code');
  if (o.starts_at && o.ends_at && o.ends_at <= o.starts_at) fail(400, 'dates_invalid');
  return o;
}
r.post('/coupons', P('coupons'), wrap((req, res) => {
  const o = readCoupon(req.body);
  const cid = db.prepare(`INSERT INTO coupons(code,type,value,starts_at,ends_at,min_order,max_discount,usage_limit,per_user_limit,product_ids,category_ids,user_ids,active,note) VALUES (@code,@type,@value,@starts_at,@ends_at,@min_order,@max_discount,@usage_limit,@per_user_limit,@product_ids,@category_ids,@user_ids,@active,@note)`).run(o).lastInsertRowid;
  audit(req, 'coupon.create', 'coupon', cid, null, o); res.json({ ok: true, id: cid });
}));
r.put('/coupons/:id', P('coupons'), wrap((req, res) => {
  const cid = id(req); const cur = db.prepare('SELECT * FROM coupons WHERE id=?').get(cid); if (!cur) fail(404, 'not_found');
  const o = readCoupon(req.body);
  db.prepare(`UPDATE coupons SET code=@code,type=@type,value=@value,starts_at=@starts_at,ends_at=@ends_at,min_order=@min_order,max_discount=@max_discount,usage_limit=@usage_limit,per_user_limit=@per_user_limit,product_ids=@product_ids,category_ids=@category_ids,user_ids=@user_ids,active=@active,note=@note WHERE id=@id`).run({ ...o, id: cid });
  audit(req, 'coupon.update', 'coupon', cid, cur, o); res.json({ ok: true });
}));
r.delete('/coupons/:id', P('coupons'), wrap((req, res) => {
  const cid = id(req);
  if (db.prepare('SELECT 1 FROM coupon_usages WHERE coupon_id=?').get(cid)) { db.prepare('UPDATE coupons SET active=0 WHERE id=?').run(cid); audit(req, 'coupon.deactivate', 'coupon', cid); return res.json({ ok: true, deactivated: true }); }
  db.prepare('DELETE FROM coupons WHERE id=?').run(cid); audit(req, 'coupon.delete', 'coupon', cid); res.json({ ok: true });
}));

// ---------- shipping ----------
r.get('/shipping/matrix', P('shipping'), wrap((req, res) => {
  const cid = V.int(req.query.carrier_id, { min: 1, field: 'carrier_id' });
  const ws = db.prepare('SELECT * FROM wilayas ORDER BY id').all();
  const rates = db.prepare('SELECT * FROM shipping_rates WHERE carrier_id=? AND commune_id=0').all(cid);
  const overrides = db.prepare('SELECT wilaya_id, COUNT(*) n FROM shipping_rates WHERE carrier_id=? AND commune_id<>0 GROUP BY wilaya_id').all(cid);
  res.json(ws.map(w => ({ ...w, home: rates.find(x => x.wilaya_id === w.id && x.method === 'home') || null, office: rates.find(x => x.wilaya_id === w.id && x.method === 'office') || null,
    overrides: overrides.find(o => o.wilaya_id === w.id)?.n || 0, communes: db.prepare('SELECT COUNT(*) n FROM communes WHERE wilaya_id=?').get(w.id).n })));
}));
function upsertRate(cid, wid, comm, method, row) {
  if (row == null || row.price === '' || row.price == null) { db.prepare('DELETE FROM shipping_rates WHERE carrier_id=? AND wilaya_id=? AND commune_id=? AND method=?').run(cid, wid, comm, method); return; }
  const price = V.money(row.price, { field: 'price' }); const extra = V.money(row.extra_per_kg || 0, { field: 'extra_per_kg' });
  const inc = V.int(row.included_kg ?? 5, { min: 0, max: 1000 }); const days = V.str(row.days, { optional: true, max: 20 });
  db.prepare(`INSERT INTO shipping_rates(carrier_id,wilaya_id,commune_id,method,price,included_kg,extra_per_kg,days,active,updated_at) VALUES (?,?,?,?,?,?,?,?,1,datetime('now'))
    ON CONFLICT(carrier_id,wilaya_id,commune_id,method) DO UPDATE SET price=excluded.price, included_kg=excluded.included_kg, extra_per_kg=excluded.extra_per_kg, days=excluded.days, active=1, updated_at=excluded.updated_at`)
    .run(cid, wid, comm, method, price, inc, extra, days);
}
r.put('/shipping/matrix', P('shipping'), wrap((req, res) => {
  const cid = V.int(req.body.carrier_id, { min: 1 }); const rows = (req.body.rows || []).slice(0, 2000);
  db.transaction(() => { for (const x of rows) { const wid = V.int(x.wilaya_id, { min: 1 }); const comm = V.int(x.commune_id || 0, { min: 0 }); for (const m of ['home', 'office']) if (m in x) upsertRate(cid, wid, comm, m, x[m]); } })();
  audit(req, 'shipping.rates_update', 'carrier', cid, null, { rows: rows.length }); res.json({ ok: true });
}));
r.post('/shipping/bulk', P('shipping'), wrap((req, res) => {
  const cid = V.int(req.body.carrier_id, { min: 1 }); const method = V.oneOf(req.body.method, ['home', 'office']); const onlyEmpty = !!req.body.only_empty;
  const ids = Array.isArray(req.body.wilaya_ids) && req.body.wilaya_ids.length ? req.body.wilaya_ids.map(Number) : db.prepare('SELECT id FROM wilayas').all().map(w => w.id);
  let n = 0;
  db.transaction(() => { for (const wid of ids) { if (onlyEmpty && db.prepare('SELECT 1 FROM shipping_rates WHERE carrier_id=? AND wilaya_id=? AND commune_id=0 AND method=?').get(cid, wid, method)) continue; upsertRate(cid, wid, 0, method, req.body); n++; } })();
  audit(req, 'shipping.bulk', 'carrier', cid, null, { method, price: req.body.price, count: n }); res.json({ ok: true, count: n });
}));
r.get('/shipping/communes', P('shipping'), wrap((req, res) => {
  const cid = V.int(req.query.carrier_id, { min: 1 }); const wid = V.int(req.query.wilaya_id, { min: 1 });
  const rates = db.prepare('SELECT * FROM shipping_rates WHERE carrier_id=? AND wilaya_id=? AND commune_id<>0').all(cid, wid);
  res.json(db.prepare('SELECT * FROM communes WHERE wilaya_id=? ORDER BY name_en').all(wid).map(c => ({ ...c, home: rates.find(r0 => r0.commune_id === c.id && r0.method === 'home') || null, office: rates.find(r0 => r0.commune_id === c.id && r0.method === 'office') || null })));
}));
r.put('/wilayas/:id', P('shipping'), wrap((req, res) => {
  const wid = id(req); const cur = db.prepare('SELECT * FROM wilayas WHERE id=?').get(wid); if (!cur) fail(404, 'not_found');
  db.prepare('UPDATE wilayas SET name_ar=?, name_en=?, active=? WHERE id=?').run(V.str(req.body.name_ar ?? cur.name_ar, { min: 2, max: 60 }), V.str(req.body.name_en ?? cur.name_en, { min: 2, max: 60 }), req.body.active === false || req.body.active === 0 ? 0 : 1, wid);
  audit(req, 'wilaya.update', 'wilaya', wid, cur, req.body); res.json({ ok: true });
}));
r.post('/wilayas', P('shipping'), wrap((req, res) => {
  const wid = V.int(req.body.id, { min: 1, max: 200, field: 'id' });
  db.prepare('INSERT INTO wilayas(id,code,name_ar,name_en) VALUES (?,?,?,?)').run(wid, String(wid).padStart(2, '0'), V.str(req.body.name_ar, { min: 2, max: 60 }), V.str(req.body.name_en, { min: 2, max: 60 }));
  audit(req, 'wilaya.create', 'wilaya', wid, null, req.body); res.json({ ok: true });
}));
r.post('/communes', P('shipping'), wrap((req, res) => {
  const wid = V.int(req.body.wilaya_id, { min: 1 }); if (!db.prepare('SELECT 1 FROM wilayas WHERE id=?').get(wid)) fail(400, 'invalid_wilaya');
  const cid = db.prepare('INSERT INTO communes(wilaya_id,name_ar,name_en,daira_ar,daira_en) VALUES (?,?,?,?,?)').run(wid, V.str(req.body.name_ar, { min: 2, max: 80 }), V.str(req.body.name_en, { min: 2, max: 80 }), V.str(req.body.daira_ar, { optional: true, max: 80 }), V.str(req.body.daira_en, { optional: true, max: 80 })).lastInsertRowid;
  audit(req, 'commune.create', 'commune', cid, null, req.body); res.json({ ok: true, id: cid });
}));
r.put('/communes/:id', P('shipping'), wrap((req, res) => {
  const cid = id(req); const cur = db.prepare('SELECT * FROM communes WHERE id=?').get(cid); if (!cur) fail(404, 'not_found');
  db.prepare('UPDATE communes SET name_ar=?, name_en=?, active=? WHERE id=?').run(V.str(req.body.name_ar ?? cur.name_ar, { min: 2, max: 80 }), V.str(req.body.name_en ?? cur.name_en, { min: 2, max: 80 }), req.body.active === false || req.body.active === 0 ? 0 : 1, cid);
  audit(req, 'commune.update', 'commune', cid, cur, req.body); res.json({ ok: true });
}));

// carriers — secrets never leave the server (masked)
const maskCarrier = c => ({ ...c, api_id: c.api_id ? '••••' + String(c.api_id).slice(-4) : '', api_secret: c.api_secret ? '••••••••' : '', has_credentials: !!(c.api_id && c.api_secret),
  connected: c.mode === 'api' && !!c.last_test_ok && !!c.api_id && !!c.api_secret });
r.get('/carriers', wrap((req, res) => res.json(db.prepare('SELECT * FROM carriers ORDER BY id').all().map(maskCarrier))));
r.put('/carriers/:id', P('shipping'), wrap((req, res) => {
  const cid = id(req); const cur = db.prepare('SELECT * FROM carriers WHERE id=?').get(cid); if (!cur) fail(404, 'not_found');
  const b = req.body; const upd = { enabled: b.enabled ? 1 : 0, mode: V.oneOf(b.mode || 'manual', ['manual', 'api'], 'mode'), api_base: V.str(b.api_base, { optional: true, max: 200 }) || cur.api_base,
    from_wilaya_id: b.from_wilaya_id ? V.int(b.from_wilaya_id, { min: 1 }) : null, tracking_url: V.str(b.tracking_url, { optional: true, max: 300 }) };
  if (upd.api_base && !/^https:\/\//.test(upd.api_base)) fail(400, 'https_required');
  const credsChanged = (b.api_id && !String(b.api_id).startsWith('••••')) || (b.api_secret && !String(b.api_secret).startsWith('••••'));
  db.prepare(`UPDATE carriers SET enabled=?, mode=?, api_base=?, from_wilaya_id=?, tracking_url=? ${credsChanged ? ', api_id=?, api_secret=?, last_test_ok=0, last_test_msg=NULL' : ''} WHERE id=?`)
    .run(upd.enabled, upd.mode, upd.api_base, upd.from_wilaya_id, upd.tracking_url, ...(credsChanged ? [b.api_id && !String(b.api_id).startsWith('••••') ? String(b.api_id).trim() : cur.api_id, b.api_secret && !String(b.api_secret).startsWith('••••') ? String(b.api_secret).trim() : cur.api_secret] : []), cid);
  if (upd.api_base !== cur.api_base) db.prepare('UPDATE carriers SET last_test_ok=0 WHERE id=?').run(cid);
  audit(req, 'carrier.update', 'carrier', cid, { enabled: cur.enabled, mode: cur.mode, api_base: cur.api_base }, { ...upd, credentials_changed: !!credsChanged });
  res.json(maskCarrier(db.prepare('SELECT * FROM carriers WHERE id=?').get(cid)));
}));
r.post('/carriers/:id/test', P('shipping'), wrap(async (req, res) => {
  const c = db.prepare('SELECT * FROM carriers WHERE id=?').get(id(req)); if (!c) fail(404, 'not_found');
  if (!c.api_id || !c.api_secret) fail(400, 'missing_credentials');
  const ad = adapterFor(c); if (!ad) fail(400, 'carrier_not_supported');
  let result; try { result = await ad.test(c); } catch (e) { result = { ok: false, message: String(e.message).slice(0, 200) }; }
  db.prepare(`UPDATE carriers SET last_test_at=datetime('now'), last_test_ok=?, last_test_msg=? WHERE id=?`).run(result.ok ? 1 : 0, result.message, c.id);
  audit(req, 'carrier.test', 'carrier', c.id, null, result);
  res.json({ ...result, carrier: maskCarrier(db.prepare('SELECT * FROM carriers WHERE id=?').get(c.id)) });
}));
r.get('/carriers/:id/centers', P('orders'), wrap(async (req, res) => {
  const c = db.prepare('SELECT * FROM carriers WHERE id=?').get(id(req)); if (!c || c.mode !== 'api' || !c.last_test_ok) fail(400, 'carrier_not_connected');
  try { res.json(await adapterFor(c).centers(c, Number(req.query.wilaya_id))); } catch (e) { fail(502, 'carrier_error', { message: String(e.message).slice(0, 200) }); }
}));

// ---------- support ----------
r.get('/tickets', P('support'), wrap((req, res) => {
  const w = []; const p = [];
  if (req.query.status) { w.push('t.status=?'); p.push(req.query.status); } else w.push(`t.status<>'closed'`);
  if (req.query.priority) { w.push('t.priority=?'); p.push(req.query.priority); }
  if (req.query.q) { w.push('(t.ref LIKE ? OR t.subject LIKE ? OR u.email LIKE ?)'); const q = `%${req.query.q}%`; p.push(q, q, q); }
  res.json(db.prepare(`SELECT t.*, u.name customer, u.email, o.number order_number, a.name assignee FROM tickets t JOIN users u ON u.id=t.user_id LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN users a ON a.id=t.assigned_to
    WHERE ${w.join(' AND ')} ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.updated_at DESC LIMIT 300`).all(...p));
}));
r.get('/tickets/:id', P('support'), wrap((req, res) => {
  const t = db.prepare('SELECT t.*, u.name customer, u.email, u.phone, o.number order_number FROM tickets t JOIN users u ON u.id=t.user_id LEFT JOIN orders o ON o.id=t.order_id WHERE t.id=?').get(id(req));
  if (!t) fail(404, 'not_found');
  res.json({ ...t, messages: db.prepare('SELECT m.*, u.name author FROM ticket_messages m JOIN users u ON u.id=m.author_id WHERE ticket_id=? ORDER BY m.id').all(t.id),
    staff: db.prepare(`SELECT id, name FROM users WHERE role IN ('admin','manager','support')`).all() });
}));
r.post('/tickets/:id/reply', P('support'), H.upload.single('file'), wrap(async (req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(id(req)); if (!t) fail(404, 'not_found');
  const body = V.str(req.body.body, { min: 1, max: 4000, field: 'body' });
  const fileId = req.file ? await H.savePrivateFile(req.file, req.user.id, 'ticket') : null;
  db.transaction(() => {
    db.prepare('INSERT INTO ticket_messages(ticket_id,author_id,is_staff,body,file_id) VALUES (?,?,1,?,?)').run(t.id, req.user.id, body, fileId);
    db.prepare(`UPDATE tickets SET status=?, assigned_to=COALESCE(assigned_to, ?), updated_at=datetime('now') WHERE id=?`).run(req.body.close === '1' ? 'closed' : 'answered', req.user.id, t.id);
    L.notify(t.user_id, 'ticket_reply', { ref: t.ref, subject: t.subject }, `/support/${t.ref}`);
  })();
  res.json({ ok: true });
}));
r.put('/tickets/:id', P('support'), wrap((req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(id(req)); if (!t) fail(404, 'not_found');
  const status = V.oneOf(req.body.status || t.status, ['open', 'answered', 'customer_reply', 'closed'], 'status'); const priority = V.oneOf(req.body.priority || t.priority, ['low', 'normal', 'high', 'urgent'], 'priority');
  db.prepare(`UPDATE tickets SET status=?, priority=?, assigned_to=?, updated_at=datetime('now') WHERE id=?`).run(status, priority, req.body.assigned_to ? Number(req.body.assigned_to) : t.assigned_to, t.id);
  if (status !== t.status) L.notify(t.user_id, 'ticket_status', { ref: t.ref, subject: t.subject }, `/support/${t.ref}`);
  res.json({ ok: true });
}));

// ---------- settings ----------
const SETTING_RULES = {
  hex: ['color_accent', 'color_sale', 'color_info'],
  text: ['store_name_ar', 'store_name_en', 'hero_title_ar', 'hero_title_en', 'hero_sub_ar', 'hero_sub_en', 'announcement_ar', 'announcement_en', 'ccp_account_name', 'ccp_account_number', 'ccp_key', 'ccp_rip',
    'ccp_instructions_ar', 'ccp_instructions_en', 'usdt_network', 'usdt_address', 'usdt_instructions_ar', 'usdt_instructions_en', 'contact_phone', 'contact_email', 'contact_address_ar', 'contact_address_en',
    'social_facebook', 'social_instagram', 'social_tiktok', 'social_whatsapp', 'default_lang'],
  bool: ['pay_wallet_enabled', 'pay_cod_enabled', 'topup_ccp_enabled', 'topup_usdt_enabled', 'withdraw_ccp_enabled', 'withdraw_usdt_enabled', 'usdt_legal_ack', 'notify_staff_orders', 'notify_staff_finance', 'notify_staff_support'],
  money: ['topup_min_dzd', 'topup_max_dzd', 'withdraw_min_dzd', 'withdraw_max_dzd', 'withdraw_fee_fixed_dzd', 'free_shipping_min_dzd'],
  int: ['pending_order_ttl_hours', 'return_window_days', 'new_days', 'low_stock_threshold'],
  decimal: ['withdraw_fee_percent'],
};
r.get('/settings', P('settings'), wrap((req, res) => res.json({ ...L.settings(), mail_configured: require('../mailer').configured() })));
r.put('/settings', P('settings'), wrap((req, res) => {
  const b = req.body || {}; const before = {}; const after = {};
  const s = L.settings();
  db.transaction(() => {
    for (const [k, v] of Object.entries(b)) {
      let val;
      if (SETTING_RULES.hex.includes(k)) { if (!/^#[0-9a-fA-F]{6}$/.test(v)) fail(400, 'invalid_color', { field: k }); val = v; }
      else if (SETTING_RULES.text.includes(k)) val = String(v ?? '').slice(0, 2000).trim();
      else if (SETTING_RULES.bool.includes(k)) { val = v === true || v === '1' || v === 1 ? '1' : '0'; if (k === 'usdt_legal_ack' && req.user.role !== 'admin') fail(403, 'forbidden'); }
      else if (SETTING_RULES.money.includes(k)) val = String(V.money(v, { field: k }));
      else if (SETTING_RULES.int.includes(k)) val = String(V.int(v, { min: 0, max: 100000, field: k }));
      else if (SETTING_RULES.decimal.includes(k)) { const n = Number(v); if (!(n >= 0 && n <= 50)) fail(400, 'invalid_number', { field: k }); val = String(n); }
      else if (k === 'fx_usd_rate') { // human rate like 135.50 → micro units
        const sv = String(v).trim(); if (!/^\d{1,4}(\.\d{1,6})?$/.test(sv) || Number(sv) <= 0) fail(400, 'invalid_rate');
        const [a, d = ''] = sv.split('.'); const micro = parseInt(a, 10) * 1000000 + parseInt((d + '000000').slice(0, 6), 10);
        if (String(micro) !== s.fx_usd_rate_micro) { before.fx_usd_rate_micro = s.fx_usd_rate_micro; after.fx_usd_rate_micro = String(micro); L.setSetting('fx_usd_rate_micro', micro); L.setSetting('fx_updated_at', L.now()); }
        continue;
      } else continue; // unknown keys ignored
      if (val === 'undefined') continue;
      if (s[k] !== val) { before[k] = s[k]; after[k] = val; L.setSetting(k, val); }
    }
    if (Object.keys(after).length) audit(req, 'settings.update', 'settings', null, before, after);
  })();
  res.json({ ok: true, changed: Object.keys(after) });
}));
r.post('/settings/logo', P('settings'), H.upload.single('logo'), wrap(async (req, res) => {
  if (!req.file) fail(400, 'no_files'); const img = await H.savePublicImage(req.file, 'products', 400);
  L.setSetting('logo_path', img.path); audit(req, 'settings.logo', 'settings', null, null, { logo: img.path }); res.json({ ok: true, logo: img.path });
}));
r.get('/pages', P('settings'), wrap((req, res) => res.json(db.prepare('SELECT * FROM pages ORDER BY slug').all())));
r.put('/pages/:slug', P('settings'), wrap((req, res) => {
  const slug = String(req.params.slug).replace(/[^a-z0-9-]/g, '').slice(0, 40);
  const o = [V.str(req.body.title_ar, { min: 2, max: 120 }), V.str(req.body.title_en, { min: 2, max: 120 }), V.str(req.body.body_ar, { min: 2, max: 20000 }), V.str(req.body.body_en, { min: 2, max: 20000 })];
  db.prepare(`INSERT INTO pages(slug,title_ar,title_en,body_ar,body_en) VALUES (?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET title_ar=excluded.title_ar,title_en=excluded.title_en,body_ar=excluded.body_ar,body_en=excluded.body_en,updated_at=datetime('now')`).run(slug, ...o);
  audit(req, 'page.update', 'page', slug); res.json({ ok: true });
}));
r.get('/faqs', P('settings'), wrap((req, res) => res.json(db.prepare('SELECT * FROM faqs ORDER BY grp, sort').all())));
r.post('/faqs', P('settings'), wrap((req, res) => {
  const b = req.body; const vals = [V.oneOf(b.grp, ['payment', 'delivery', 'orders', 'wallet', 'refunds'], 'grp'), V.str(b.q_ar, { min: 3, max: 300 }), V.str(b.q_en, { min: 3, max: 300 }), V.str(b.a_ar, { min: 3, max: 3000 }), V.str(b.a_en, { min: 3, max: 3000 }), V.int(b.sort || 0, { min: 0 })];
  if (b.id) db.prepare('UPDATE faqs SET grp=?,q_ar=?,q_en=?,a_ar=?,a_en=?,sort=? WHERE id=?').run(...vals, Number(b.id)); else db.prepare('INSERT INTO faqs(grp,q_ar,q_en,a_ar,a_en,sort) VALUES (?,?,?,?,?,?)').run(...vals);
  audit(req, 'faq.save', 'faq', b.id || null); res.json({ ok: true });
}));
r.delete('/faqs/:id', P('settings'), wrap((req, res) => { db.prepare('DELETE FROM faqs WHERE id=?').run(id(req)); audit(req, 'faq.delete', 'faq', req.params.id); res.json({ ok: true }); }));

// ---------- staff ----------
r.get('/staff', P('staff'), wrap((req, res) => res.json(db.prepare(`SELECT id,name,email,phone,role,status,created_at FROM users WHERE role<>'customer' ORDER BY id`).all())));
r.post('/staff', P('staff'), wrap(async (req, res) => {
  const role = V.oneOf(req.body.role, ['support', 'finance', 'manager', 'admin'], 'role');
  const email = V.email(req.body.email);
  const existing = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (existing) { db.prepare('UPDATE users SET role=? WHERE id=?').run(role, existing.id); audit(req, 'staff.promote', 'user', existing.id, { role: existing.role }, { role }); return res.json({ ok: true, id: existing.id }); }
  const uid = db.prepare(`INSERT INTO users(name,email,phone,password_hash,role,email_verified_at) VALUES (?,?,?,?,?,datetime('now'))`)
    .run(V.str(req.body.name, { min: 2, max: 80 }), email, String(req.body.phone || '').trim() ? V.phone(req.body.phone) : null, await bcrypt.hash(V.password(req.body.password), 11), role).lastInsertRowid;
  audit(req, 'staff.create', 'user', uid, null, { email, role }); res.json({ ok: true, id: uid });
}));
r.put('/staff/:id', P('staff'), wrap((req, res) => {
  const uid = id(req); if (uid === req.user.id) fail(400, 'cannot_change_self');
  const role = V.oneOf(req.body.role, ['customer', 'support', 'finance', 'manager', 'admin'], 'role'); const status = V.oneOf(req.body.status || 'active', ['active', 'suspended'], 'status');
  const cur = db.prepare('SELECT role, status FROM users WHERE id=?').get(uid); if (!cur) fail(404, 'not_found');
  db.prepare('UPDATE users SET role=?, status=? WHERE id=?').run(role, status, uid);
  if (status === 'suspended' || role !== cur.role) db.prepare('DELETE FROM sessions WHERE user_id=?').run(uid);
  audit(req, 'staff.update', 'user', uid, cur, { role, status }); res.json({ ok: true });
}));

// ---------- audit & backups ----------
r.get('/audit', P('audit'), wrap((req, res) => {
  const w = []; const p = [];
  if (req.query.entity) { w.push('a.entity=?'); p.push(req.query.entity); }
  if (req.query.action) { w.push('a.action LIKE ?'); p.push(`%${req.query.action}%`); }
  const { lim, off } = page(req.query, 50); const W = w.length ? 'WHERE ' + w.join(' AND ') : '';
  res.json({ total: db.prepare(`SELECT COUNT(*) n FROM audit_log a ${W}`).get(...p).n, items: db.prepare(`SELECT a.*, u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ${W} ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(...p, lim, off) });
}));
const BACKUP_DIR = path.join(DATA_DIR, 'backups'); fs.mkdirSync(BACKUP_DIR, { recursive: true });
r.get('/backups', P('settings'), wrap((req, res) => res.json(fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort().reverse().map(f => ({ name: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size })))));
r.post('/backups', P('settings'), wrap(async (req, res) => {
  if (req.user.role !== 'admin') fail(403, 'forbidden');
  const name = `marche-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  await db.backup(path.join(BACKUP_DIR, name));
  audit(req, 'backup.create', 'backup', name); res.json({ ok: true, name });
}));
r.get('/backups/:name', P('settings'), wrap((req, res) => {
  if (req.user.role !== 'admin') fail(403, 'forbidden');
  const name = path.basename(req.params.name); const f = path.join(BACKUP_DIR, name);
  if (!/^marche-[\w-]+\.db$/.test(name) || !fs.existsSync(f)) fail(404, 'not_found');
  audit(req, 'backup.download', 'backup', name); res.download(f);
}));

module.exports = { router: r, syncShipment };
