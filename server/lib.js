// Core domain logic shared by routes: settings, money/FX, auth helpers, audit, notifications,
// wallet ledger, inventory, pricing, coupons, shipping quotes and the order state machine.
const crypto = require('crypto');
const { db } = require('./db');

class AppError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; }
}
const fail = (status, code, extra) => { throw new AppError(status, code, extra); };

// ---------- settings ----------
const DEFAULT_SETTINGS = {
  store_name_ar: 'مارشي ديزاد', store_name_en: 'Marché DZ',
  logo_path: '',
  color_accent: '#059669', color_sale: '#ea580c', color_info: '#6366f1',
  hero_title_ar: 'اكتشف عالم التسوق في مكان واحد', hero_title_en: 'Discover a whole world of shopping in one place',
  hero_sub_ar: 'من الأزياء والإلكترونيات إلى مستلزمات منزلك، مع تجربة تسوق سهلة وتوصيل إلى جميع ولايات الجزائر.',
  hero_sub_en: 'From fashion and electronics to everything for your home — easy shopping with delivery to all 58 wilayas of Algeria.',
  announcement_ar: 'توصيل إلى 58 ولاية • الدفع عند الاستلام • محفظة آمنة', announcement_en: 'Delivery to 58 wilayas • Cash on delivery • Secure wallet',
  default_lang: 'ar', enabled_langs: '["ar","en"]',
  currencies: '["DZD","USD"]',
  fx_usd_rate_micro: '135000000', fx_updated_at: '', fx_source: 'manual',
  pay_wallet_enabled: '1', pay_cod_enabled: '1',
  topup_ccp_enabled: '1', topup_usdt_enabled: '0',
  ccp_account_name: '', ccp_account_number: '', ccp_key: '', ccp_rip: '',
  ccp_instructions_ar: 'حوّل المبلغ إلى حساب CCP أدناه عبر بريد الجزائر أو تطبيق BaridiMob، ثم ارفع صورة واضحة للوصل مع رقم المرجع.',
  ccp_instructions_en: 'Transfer the amount to the CCP account below (Algérie Poste or BaridiMob), then upload a clear photo of the receipt with its reference number.',
  usdt_network: 'TRC20', usdt_address: '', usdt_legal_ack: '0',
  usdt_instructions_ar: 'أرسل USDT على الشبكة المحددة فقط. الإرسال على شبكة مختلفة قد يؤدي إلى فقدان الأموال.',
  usdt_instructions_en: 'Send USDT on the specified network only. Sending on another network may result in loss of funds.',
  topup_min_dzd: '50000', topup_max_dzd: '50000000',
  withdraw_ccp_enabled: '1', withdraw_usdt_enabled: '0',
  withdraw_min_dzd: '100000', withdraw_max_dzd: '10000000',
  withdraw_fee_percent: '0', withdraw_fee_fixed_dzd: '0',
  pending_order_ttl_hours: '72', return_window_days: '7', new_days: '30', low_stock_threshold: '5',
  free_shipping_min_dzd: '0',
  contact_phone: '', contact_email: '', contact_address_ar: 'الجزائر', contact_address_en: 'Algeria',
  social_facebook: '', social_instagram: '', social_tiktok: '', social_whatsapp: '',
  notify_staff_orders: '1', notify_staff_finance: '1', notify_staff_support: '1',
};
const PUBLIC_SETTINGS = ['store_name_ar', 'store_name_en', 'logo_path', 'color_accent', 'color_sale', 'color_info', 'hero_title_ar', 'hero_title_en',
  'hero_sub_ar', 'hero_sub_en', 'announcement_ar', 'announcement_en', 'default_lang', 'enabled_langs', 'currencies', 'fx_usd_rate_micro', 'fx_updated_at', 'fx_source',
  'pay_wallet_enabled', 'pay_cod_enabled', 'topup_ccp_enabled', 'topup_usdt_enabled', 'withdraw_ccp_enabled', 'withdraw_usdt_enabled',
  'topup_min_dzd', 'topup_max_dzd', 'withdraw_min_dzd', 'withdraw_max_dzd', 'withdraw_fee_percent', 'withdraw_fee_fixed_dzd', 'return_window_days', 'new_days',
  'free_shipping_min_dzd', 'contact_phone', 'contact_email', 'contact_address_ar', 'contact_address_en', 'social_facebook', 'social_instagram', 'social_tiktok', 'social_whatsapp'];
let settingsCache = null;
function settings() {
  if (!settingsCache) {
    settingsCache = { ...DEFAULT_SETTINGS };
    for (const r of db.prepare('SELECT key, value FROM settings').all()) settingsCache[r.key] = r.value;
  }
  return settingsCache;
}
const S = k => settings()[k];
const SI = k => parseInt(settings()[k] || '0', 10) || 0;
function setSetting(key, value) {
  db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(key, String(value ?? ''));
  settingsCache = null;
}
function publicSettings() {
  const s = settings(); const o = {};
  for (const k of PUBLIC_SETTINGS) o[k] = s[k];
  // CCP / USDT receiving details are public on purpose (customers need them to pay)
  o.ccp = { name: s.ccp_account_name, number: s.ccp_account_number, key: s.ccp_key, rip: s.ccp_rip, instr_ar: s.ccp_instructions_ar, instr_en: s.ccp_instructions_en };
  o.usdt = s.topup_usdt_enabled === '1' && s.usdt_legal_ack === '1' ? { network: s.usdt_network, address: s.usdt_address, instr_ar: s.usdt_instructions_ar, instr_en: s.usdt_instructions_en } : null;
  return o;
}

// ---------- money & FX (all integer math) ----------
const rateMicro = () => SI('fx_usd_rate_micro') || 135000000;
const usdToDzd = (usdCents, rm = rateMicro()) => Number((BigInt(usdCents) * BigInt(rm) + 500000n) / 1000000n);
const dzdToUsd = (dzdCentimes, rm = rateMicro()) => Number((BigInt(dzdCentimes) * 1000000n + BigInt(rm) / 2n) / BigInt(rm));
const toMinor = v => { const n = Number(v); if (!Number.isFinite(n)) return NaN; return Math.round(n * 100); };

// ---------- ids ----------
const rand = (n = 6) => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const b = crypto.randomBytes(n); for (let i = 0; i < n; i++) s += a[b[i] % a.length]; return s; };
const ymd = () => new Date().toISOString().slice(2, 10).replace(/-/g, '');
const makeRef = p => `${p}-${ymd()}-${rand(6)}`;
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ---------- permissions ----------
const ROLE_PERMS = {
  admin: ['dashboard', 'products', 'categories', 'orders', 'customers', 'finance', 'coupons', 'shipping', 'support', 'settings', 'audit', 'staff', 'reports'],
  manager: ['dashboard', 'products', 'categories', 'orders', 'customers', 'coupons', 'shipping', 'support', 'reports'],
  finance: ['dashboard', 'finance', 'orders', 'customers', 'reports'],
  support: ['dashboard', 'support', 'orders', 'customers'],
  customer: [],
};
const can = (user, perm) => !!user && (ROLE_PERMS[user.role] || []).includes(perm);
const isStaff = user => !!user && user.role !== 'customer';

// ---------- audit ----------
function audit(req, action, entity, entityId, before, after) {
  db.prepare(`INSERT INTO audit_log(actor_id, actor_role, action, entity, entity_id, before_json, after_json, ip) VALUES (?,?,?,?,?,?,?,?)`)
    .run(req?.user?.id || null, req?.user?.role || 'system', action, entity, entityId == null ? null : String(entityId),
      before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), req?.ip || null);
}

// ---------- notifications ----------
const NT = {
  order_created: ['تم استلام طلبك {number}', 'Order {number} received', 'طلبك قيد المراجعة وسنؤكده قريبًا. الإجمالي: {total}', 'We are reviewing your order. Total: {total}'],
  order_status: ['تحديث الطلب {number}', 'Order {number} updated', 'الحالة الجديدة: {status_ar}', 'New status: {status_en}'],
  order_delivered: ['تم تسليم طلبك {number}', 'Order {number} delivered', 'نتمنى أن تنال المشتريات رضاك. يمكنك تقييم المنتجات الآن.', 'We hope you love it. You can now review your products.'],
  order_cancelled: ['تم إلغاء الطلب {number}', 'Order {number} cancelled', '{reason}', '{reason}'],
  shipment_update: ['تحديث الشحنة للطلب {number}', 'Shipment update for {number}', 'رقم التتبع: {tracking}', 'Tracking: {tracking}'],
  topup_received: ['تم استلام طلب شحن المحفظة {ref}', 'Top-up request {ref} received', 'طلبك قيد المراجعة. لن يُضاف الرصيد إلا بعد التحقق من التحويل.', 'Your request is under review. Funds are added only after the transfer is verified.'],
  topup_approved: ['تم شحن محفظتك', 'Wallet topped up', 'أضيف {amount} إلى رصيدك (الطلب {ref}).', '{amount} was added to your balance (request {ref}).'],
  topup_rejected: ['تم رفض طلب الشحن {ref}', 'Top-up {ref} rejected', 'السبب: {reason}', 'Reason: {reason}'],
  topup_info: ['معلومات إضافية مطلوبة للطلب {ref}', 'More info needed for {ref}', '{reason}', '{reason}'],
  withdraw_received: ['تم استلام طلب السحب {ref}', 'Withdrawal {ref} received', 'تم حجز {amount} من رصيدك أثناء المراجعة.', '{amount} has been held from your balance during review.'],
  withdraw_approved: ['تمت الموافقة على السحب {ref}', 'Withdrawal {ref} approved', 'سيتم تنفيذ التحويل وتسجيل مرجعه قريبًا.', 'The payout will be executed and its reference recorded shortly.'],
  withdraw_paid: ['تم تنفيذ السحب {ref}', 'Withdrawal {ref} paid', 'مرجع التحويل: {payout}', 'Payout reference: {payout}'],
  withdraw_rejected: ['تم رفض طلب السحب {ref}', 'Withdrawal {ref} rejected', 'أعيد المبلغ إلى رصيدك المتاح. السبب: {reason}', 'The amount was returned to your available balance. Reason: {reason}'],
  withdraw_info: ['معلومات إضافية مطلوبة للسحب {ref}', 'More info needed for {ref}', '{reason}', '{reason}'],
  refund_received: ['تم استلام طلب الاسترداد {ref}', 'Refund request {ref} received', 'سنراجع طلبك ونبلغك بالنتيجة.', 'We will review your request and let you know.'],
  refund_done: ['تم الاسترداد {ref}', 'Refund {ref} completed', 'أضيف {amount} إلى محفظتك.', '{amount} was credited to your wallet.'],
  refund_rejected: ['تم رفض طلب الاسترداد {ref}', 'Refund {ref} rejected', 'السبب: {reason}', 'Reason: {reason}'],
  refund_info: ['معلومات إضافية مطلوبة للاسترداد {ref}', 'More info needed for refund {ref}', '{reason}', '{reason}'],
  ticket_reply: ['رد جديد على تذكرتك {ref}', 'New reply on ticket {ref}', '{subject}', '{subject}'],
  ticket_status: ['تحديث التذكرة {ref}', 'Ticket {ref} updated', '{subject}', '{subject}'],
  // staff
  staff_new_order: ['طلب جديد {number}', 'New order {number}', '{customer} • {total} • {method}', '{customer} • {total} • {method}'],
  staff_topup: ['طلب شحن محفظة جديد {ref}', 'New wallet top-up {ref}', '{customer} • {amount} • {method}', '{customer} • {amount} • {method}'],
  staff_withdraw: ['طلب سحب جديد {ref}', 'New withdrawal {ref}', '{customer} • {amount}', '{customer} • {amount}'],
  staff_refund: ['طلب استرداد جديد {ref}', 'New refund request {ref}', '{customer} • {amount}', '{customer} • {amount}'],
  staff_ticket: ['تذكرة دعم جديدة/رد {ref}', 'Support ticket activity {ref}', '{subject}', '{subject}'],
};
const fill = (s, p) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ''));
function notify(userId, type, params = {}, link = null) {
  const t = NT[type] || [type, type, '', ''];
  db.prepare(`INSERT INTO notifications(user_id,audience,type,title_ar,title_en,body_ar,body_en,link) VALUES (?,?,?,?,?,?,?,?)`)
    .run(userId, 'user', type, fill(t[0], params), fill(t[1], params), fill(t[2], params), fill(t[3], params), link);
}
function notifyStaff(perm, type, params = {}, link = null) {
  const key = perm === 'finance' ? 'notify_staff_finance' : perm === 'support' ? 'notify_staff_support' : 'notify_staff_orders';
  if (S(key) !== '1') return;
  const t = NT[type] || [type, type, '', ''];
  db.prepare(`INSERT INTO notifications(user_id,audience,perm,type,title_ar,title_en,body_ar,body_en,link) VALUES (NULL,'staff',?,?,?,?,?,?,?)`)
    .run(perm, type, fill(t[0], params), fill(t[1], params), fill(t[2], params), fill(t[3], params), link);
}
const fmtDZD = c => `${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} DZD`;

// ---------- wallet ledger ----------
function ensureWallet(userId) { db.prepare('INSERT OR IGNORE INTO wallets(user_id) VALUES (?)').run(userId); }
/** Applies a balance change atomically and writes one immutable ledger row. Must run inside db.transaction. */
function walletApply({ userId, type, dAvail = 0, dHeld = 0, origCurrency = 'DZD', origAmount, fx = null, sourceType, sourceId, note = null, actorId = null }) {
  ensureWallet(userId);
  const r = db.prepare(`UPDATE wallets SET available = available + ?, held = held + ?, updated_at = datetime('now')
    WHERE user_id = ? AND available + ? >= 0 AND held + ? >= 0`).run(dAvail, dHeld, userId, dAvail, dHeld);
  if (r.changes !== 1) fail(400, 'insufficient_balance');
  const w = db.prepare('SELECT available, held FROM wallets WHERE user_id = ?').get(userId);
  const ref = makeRef('TX');
  try {
    db.prepare(`INSERT INTO wallet_transactions(ref,user_id,type,delta_available,delta_held,available_after,held_after,orig_currency,orig_amount,fx_rate_micro,source_type,source_id,note,actor_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(ref, userId, type, dAvail, dHeld, w.available, w.held, origCurrency,
      origAmount ?? Math.abs(dAvail || dHeld), fx, sourceType, sourceId, note, actorId);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) fail(409, 'already_processed');
    throw e;
  }
  return { ref, ...w };
}

// ---------- inventory ----------
function moveStock(variantId, delta, reason, refType, refId, actorId = null, note = null) {
  const r = delta < 0
    ? db.prepare('UPDATE variants SET stock = stock + ? WHERE id = ? AND stock >= ?').run(delta, variantId, -delta)
    : db.prepare('UPDATE variants SET stock = stock + ? WHERE id = ?').run(delta, variantId);
  if (r.changes !== 1) fail(409, 'out_of_stock', { variant_id: variantId });
  const { stock } = db.prepare('SELECT stock FROM variants WHERE id = ?').get(variantId);
  db.prepare('INSERT INTO inventory_movements(variant_id,delta,stock_after,reason,ref_type,ref_id,actor_id,note) VALUES (?,?,?,?,?,?,?,?)')
    .run(variantId, delta, stock, reason, refType, refId, actorId, note);
  return stock;
}

// ---------- pricing ----------
function effectivePrice(p, at = now()) {
  const onSale = p.sale_price != null && p.sale_price < p.price && (!p.sale_start || p.sale_start <= at) && (!p.sale_end || p.sale_end >= at);
  return onSale ? p.sale_price : p.price;
}
const discountPct = (orig, eff) => orig > 0 && eff < orig ? Math.round((orig - eff) * 100 / orig) : 0;

function categoryAncestors(catId) {
  if (!catId) return [];
  return db.prepare(`WITH RECURSIVE a(id,parent_id) AS (SELECT id,parent_id FROM categories WHERE id=? UNION ALL SELECT c.id,c.parent_id FROM categories c JOIN a ON c.id=a.parent_id) SELECT id FROM a`).all(catId).map(r => r.id);
}
function categoryDescendants(catId) {
  return db.prepare(`WITH RECURSIVE d(id) AS (SELECT id FROM categories WHERE id=? UNION ALL SELECT c.id FROM categories c JOIN d ON c.parent_id=d.id) SELECT id FROM d`).all(catId).map(r => r.id);
}

/** Builds priced lines from [{variant_id, qty}] using live DB data (never trusts client prices). */
function priceLines(items) {
  const lines = []; const issues = [];
  for (const it of items) {
    const qty = parseInt(it.qty, 10);
    const v = db.prepare(`SELECT v.*, p.name_ar, p.name_en, p.slug, p.price, p.sale_price, p.sale_start, p.sale_end, p.status, p.category_id, p.weight_g, p.id AS pid,
      (SELECT thumb FROM product_images i WHERE i.product_id=p.id ORDER BY is_main DESC, sort LIMIT 1) AS image
      FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`).get(it.variant_id);
    if (!v || v.status !== 'published' || !v.active) { issues.push({ variant_id: it.variant_id, code: 'unavailable' }); continue; }
    if (!Number.isInteger(qty) || qty < 1) { issues.push({ variant_id: v.id, code: 'bad_qty' }); continue; }
    const unit = effectivePrice(v) + v.price_delta; const orig = v.price + v.price_delta;
    if (qty > v.stock) issues.push({ variant_id: v.id, code: v.stock === 0 ? 'out_of_stock' : 'insufficient_stock', stock: v.stock });
    lines.push({ variant_id: v.id, product_id: v.pid, slug: v.slug, name_ar: v.name_ar, name_en: v.name_en, color: v.color, size: v.size, image: v.image,
      qty, stock: v.stock, unit_price: unit, original_price: orig, line_total: unit * qty, line_original: orig * qty, category_id: v.category_id, weight_g: v.weight_g * qty });
  }
  return { lines, issues };
}

// ---------- coupons ----------
function evaluateCoupon(code, userId, lines) {
  if (!code) return null;
  const c = db.prepare('SELECT * FROM coupons WHERE code = ?').get(String(code).trim());
  const no = reason => ({ ok: false, code: String(code).trim().toUpperCase(), reason });
  if (!c || !c.active) return no('coupon_invalid');
  const t = now();
  if (c.starts_at && c.starts_at > t) return no('coupon_not_started');
  if (c.ends_at && c.ends_at < t) return no('coupon_expired');
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return no('coupon_exhausted');
  const userIds = JSON.parse(c.user_ids || '[]');
  if (userIds.length && (!userId || !userIds.includes(userId))) return no('coupon_not_for_you');
  if (c.per_user_limit != null) {
    if (!userId) return no('coupon_login_required');
    const used = db.prepare('SELECT COUNT(*) n FROM coupon_usages WHERE coupon_id=? AND user_id=? AND active=1').get(c.id, userId).n;
    if (used >= c.per_user_limit) return no('coupon_user_limit');
  }
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  if (subtotal < c.min_order) return { ...no('coupon_min_order'), min_order: c.min_order };
  const pids = JSON.parse(c.product_ids || '[]'); const cids = JSON.parse(c.category_ids || '[]');
  const eligible = lines.filter(l => {
    if (!pids.length && !cids.length) return true;
    if (pids.includes(l.product_id)) return true;
    return categoryAncestors(l.category_id).some(id => cids.includes(id));
  });
  const base = eligible.reduce((s, l) => s + l.line_total, 0);
  if (base <= 0) return no('coupon_not_applicable');
  let discount = c.type === 'percent' ? Math.floor(base * Math.min(c.value, 100) / 100) : Math.min(c.value, base);
  if (c.max_discount != null) discount = Math.min(discount, c.max_discount);
  return { ok: true, id: c.id, code: c.code.toUpperCase(), type: c.type, value: c.value, discount };
}

// ---------- shipping ----------
function shippingOptions(wilayaId, communeId, method, weightG = 0) {
  const rows = db.prepare(`SELECT r.*, c.name AS carrier_name, c.code AS carrier_code FROM shipping_rates r JOIN carriers c ON c.id = r.carrier_id
    WHERE c.enabled = 1 AND r.active = 1 AND r.wilaya_id = ? AND r.method = ? AND (r.commune_id = 0 OR r.commune_id = ?)
    ORDER BY r.commune_id DESC`).all(wilayaId, method, communeId || 0);
  const seen = new Set(); const out = [];
  for (const r of rows) {
    if (seen.has(r.carrier_id)) continue; // commune-specific rate wins over wilaya-level rate
    seen.add(r.carrier_id);
    const kg = Math.ceil(weightG / 1000);
    const extra = kg > r.included_kg ? (kg - r.included_kg) * r.extra_per_kg : 0;
    out.push({ carrier_id: r.carrier_id, carrier_name: r.carrier_name, carrier_code: r.carrier_code, price: r.price + extra, days: r.days, specific: r.commune_id !== 0 });
  }
  return out.sort((a, b) => a.price - b.price);
}

/** Full server-side quote. Used for cart display, checkout preview AND final order creation. */
function quote({ items, userId, couponCode, wilayaId, communeId, method, carrierId }) {
  const { lines, issues } = priceLines(items);
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  const itemsOriginal = lines.reduce((s, l) => s + l.line_original, 0);
  const coupon = couponCode ? evaluateCoupon(couponCode, userId, lines) : null;
  const couponDiscount = coupon?.ok ? coupon.discount : 0;
  const weight = lines.reduce((s, l) => s + l.weight_g, 0);
  let shipping = null; let shippingOptionsList = []; let shippingIssue = null;
  if (wilayaId && method) {
    const w = db.prepare('SELECT * FROM wilayas WHERE id = ? AND active = 1').get(wilayaId);
    const c = communeId ? db.prepare('SELECT * FROM communes WHERE id = ? AND wilaya_id = ? AND active = 1').get(communeId, wilayaId) : null;
    if (!w) shippingIssue = 'wilaya_unavailable';
    else if (communeId && !c) shippingIssue = 'commune_unavailable';
    else {
      shippingOptionsList = shippingOptions(wilayaId, communeId, method, weight);
      if (!shippingOptionsList.length) shippingIssue = 'no_shipping_rate';
      else {
        const opt = shippingOptionsList.find(o => o.carrier_id === Number(carrierId)) || shippingOptionsList[0];
        const freeMin = SI('free_shipping_min_dzd');
        shipping = { ...opt, price: freeMin > 0 && subtotal - couponDiscount >= freeMin ? 0 : opt.price, free: freeMin > 0 && subtotal - couponDiscount >= freeMin };
      }
    }
  }
  const total = Math.max(0, subtotal - couponDiscount) + (shipping ? shipping.price : 0);
  return { lines, issues, subtotal, items_original: itemsOriginal, items_discount: itemsOriginal - subtotal, coupon, coupon_discount: couponDiscount,
    weight_g: weight, shipping, shipping_options: shippingOptionsList, shipping_issue: shippingIssue, total, fx_rate_micro: rateMicro() };
}

// ---------- order state machine ----------
const ORDER_FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['ready', 'cancelled'],
  ready: ['shipment_created', 'shipping', 'cancelled'],
  shipment_created: ['shipping', 'returned', 'cancelled'],
  shipping: ['delivered', 'returned'],
  delivered: ['returned'],
  returned: [],
  refund_pending: [],
  cancelled: [],
  refunded: [],
};
const STATUS_LABELS = {
  pending: ['بانتظار التأكيد', 'Awaiting confirmation'], confirmed: ['مؤكد', 'Confirmed'], processing: ['قيد التحضير', 'Processing'],
  ready: ['جاهز للشحن', 'Ready to ship'], shipment_created: ['تم إنشاء الشحنة', 'Shipment created'], shipping: ['قيد التوصيل', 'Out for delivery'],
  delivered: ['تم التسليم', 'Delivered'], cancelled: ['طلب ملغى', 'Cancelled'], returned: ['طلب مرتجع', 'Returned'],
  refund_pending: ['استرداد قيد المعالجة', 'Refund in progress'], refunded: ['تم الاسترداد', 'Refunded'],
};

function addHistory(orderId, from, to, note, actorId, actorType) {
  db.prepare('INSERT INTO order_history(order_id,from_status,to_status,note,actor_id,actor_type) VALUES (?,?,?,?,?,?)').run(orderId, from, to, note || null, actorId || null, actorType || 'system');
}

/** Changes status with side effects. Must run inside db.transaction. */
function changeOrderStatus(order, to, { note, actorId, actorType = 'admin', restock = true, force = false } = {}) {
  const from = order.status;
  if (!force && !(ORDER_FLOW[from] || []).includes(to)) fail(400, 'invalid_transition', { from, to });
  const upd = db.prepare(`UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=? AND status=?`).run(to, order.id, from);
  if (upd.changes !== 1) fail(409, 'order_changed');
  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
  if (to === 'cancelled') {
    for (const it of items) if (it.variant_id) {
      moveStock(it.variant_id, it.qty, 'release', 'order', order.id, actorId, 'order cancelled');
      db.prepare('UPDATE products SET sold_count = MAX(0, sold_count - ?) WHERE id=?').run(it.qty, it.product_id);
    }
    const cu = db.prepare('UPDATE coupon_usages SET active=0 WHERE order_id=? AND active=1').run(order.id);
    if (cu.changes) db.prepare('UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE id=?').run(order.coupon_id);
    db.prepare('UPDATE orders SET cancel_reason=? WHERE id=?').run(note || null, order.id);
    // Wallet-paid order: return funds once (ledger UNIQUE prevents double refunds)
    const refundable = order.paid_amount - order.refunded_amount;
    if (order.payment_method === 'wallet' && order.payment_status !== 'unpaid' && refundable > 0) {
      const tx = walletApply({ userId: order.user_id, type: 'order_cancel_refund', dAvail: refundable, origAmount: refundable, sourceType: 'order', sourceId: order.id, note: `Cancel ${order.number}`, actorId });
      db.prepare(`INSERT INTO payments(order_id,method,kind,amount,reference,actor_id) VALUES (?,?,?,?,?,?)`).run(order.id, 'wallet', 'refund', refundable, tx.ref, actorId);
      db.prepare(`UPDATE orders SET refunded_amount = refunded_amount + ?, payment_status='refunded' WHERE id=?`).run(refundable, order.id);
    }
    notify(order.user_id, 'order_cancelled', { number: order.number, reason: note || '' }, `/account/orders/${order.number}`);
  } else if (to === 'returned') {
    if (restock) for (const it of items) if (it.variant_id) moveStock(it.variant_id, it.qty, 'return', 'order', order.id, actorId, 'returned to stock');
    notify(order.user_id, 'order_status', { number: order.number, status_ar: STATUS_LABELS[to][0], status_en: STATUS_LABELS[to][1] }, `/account/orders/${order.number}`);
  } else if (to === 'delivered') {
    db.prepare(`UPDATE orders SET delivered_at=datetime('now') WHERE id=?`).run(order.id);
    notify(order.user_id, 'order_delivered', { number: order.number }, `/account/orders/${order.number}`);
  } else {
    notify(order.user_id, 'order_status', { number: order.number, status_ar: STATUS_LABELS[to][0], status_en: STATUS_LABELS[to][1] }, `/account/orders/${order.number}`);
  }
  addHistory(order.id, from, to, note, actorId, actorType);
}

/** Approve a refund (from a request). Credits wallet exactly once and never above paid amount. Inside transaction. */
function approveRefund(refundId, amount, actorId, note) {
  const rr = db.prepare('SELECT * FROM refund_requests WHERE id=?').get(refundId);
  if (!rr) fail(404, 'not_found');
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(rr.order_id);
  if (!['paid', 'partially_refunded'].includes(order.payment_status)) fail(400, 'order_not_paid');
  const max = order.paid_amount - order.refunded_amount;
  if (!Number.isInteger(amount) || amount <= 0 || amount > max) fail(400, 'refund_amount_invalid', { max });
  const u = db.prepare(`UPDATE refund_requests SET status='approved', approved_amount=?, admin_note=?, reviewed_by=?, reviewed_at=datetime('now'), updated_at=datetime('now')
    WHERE id=? AND status IN ('pending','needs_info')`).run(amount, note || null, actorId, refundId);
  if (u.changes !== 1) fail(409, 'already_processed');
  const tx = walletApply({ userId: order.user_id, type: 'refund', dAvail: amount, origAmount: amount, sourceType: 'refund', sourceId: rr.id, note: `Refund ${rr.ref} / ${order.number}`, actorId });
  db.prepare(`INSERT INTO payments(order_id,method,kind,amount,reference,actor_id) VALUES (?,?,?,?,?,?)`).run(order.id, 'wallet', 'refund', amount, tx.ref, actorId);
  const newRefunded = order.refunded_amount + amount;
  const full = newRefunded >= order.paid_amount;
  db.prepare(`UPDATE orders SET refunded_amount=?, payment_status=?, updated_at=datetime('now') WHERE id=?`).run(newRefunded, full ? 'refunded' : 'partially_refunded', order.id);
  const back = full ? 'refunded' : (rr.order_prev_status || order.status);
  if (order.status !== back) {
    db.prepare(`UPDATE orders SET status=? WHERE id=?`).run(back, order.id);
    addHistory(order.id, order.status, back, `Refund ${rr.ref}: ${fmtDZD(amount)}`, actorId, 'admin');
  }
  notify(order.user_id, 'refund_done', { ref: rr.ref, amount: fmtDZD(amount) }, '/account/wallet');
  return tx;
}

// ---------- search helpers ----------
function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/گ/g, 'ك').replace(/ڤ/g, 'ف')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
const SYNONYMS = { iphone: 'ايفون', ايفون: 'iphone', samsung: 'سامسونغ', سامسونج: 'سامسونغ', سامسونغ: 'samsung', telephone: 'هاتف', phone: 'هاتف', تلفون: 'هاتف', laptop: 'حاسوب', pc: 'حاسوب', كمبيوتر: 'حاسوب', parfum: 'عطر', perfume: 'عطر', عطور: 'عطر', chaussure: 'حذاء', shoes: 'حذاء', صباط: 'حذاء', montre: 'ساعه', watch: 'ساعه', sac: 'حقيبه', bag: 'حقيبه', robe: 'فستان', dress: 'فستان', كاسك: 'سماعات', ecouteur: 'سماعات' };
function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return dp[b.length];
}
let vocab = null;
function vocabulary() {
  if (!vocab) {
    const set = new Set();
    for (const r of db.prepare(`SELECT search_text FROM products WHERE status='published'`).all()) for (const w of (r.search_text || '').split(' ')) if (w.length > 2) set.add(w);
    vocab = [...set];
  }
  return vocab;
}
const resetVocab = () => { vocab = null; };
function correctToken(tok) {
  if (tok.length < 3) return tok;
  const v = vocabulary(); if (v.includes(tok)) return tok;
  let best = tok, bd = tok.length <= 4 ? 1 : 2;
  for (const w of v) { const d = levenshtein(tok, w); if (d < bd || (d === bd && best === tok && d <= bd)) { if (d <= (tok.length <= 4 ? 1 : 2)) { best = w; bd = d; } } }
  return best;
}
function productSearchText(p, catId) {
  const cats = categoryAncestors(catId).map(id => db.prepare('SELECT name_ar,name_en FROM categories WHERE id=?').get(id)).filter(Boolean);
  return normalize([p.name_ar, p.name_en, p.brand, ...cats.flatMap(c => [c.name_ar, c.name_en])].join(' '));
}

module.exports = {
  AppError, fail, settings, S, SI, setSetting, publicSettings, DEFAULT_SETTINGS, rateMicro, usdToDzd, dzdToUsd, toMinor,
  rand, makeRef, sha256, now, ROLE_PERMS, can, isStaff, audit, notify, notifyStaff, fmtDZD, walletApply, ensureWallet, moveStock,
  effectivePrice, discountPct, categoryAncestors, categoryDescendants, priceLines, evaluateCoupon, shippingOptions, quote,
  ORDER_FLOW, STATUS_LABELS, changeOrderStatus, addHistory, approveRefund, normalize, SYNONYMS, correctToken, resetVocab, productSearchText,
};
