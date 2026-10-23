// End-to-end API test of the main business flows. Usage: node scripts/e2e.js [baseUrl]
const sharp = require('sharp');
const BASE = process.argv[2] || 'http://127.0.0.1:3000';
let pass = 0, failN = 0;
const ok = (cond, msg, extra) => { if (cond) { pass++; console.log('  ✓', msg); } else { failN++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } };

function client() {
  const jar = {};
  const c = async (method, url, body, { form } = {}) => {
    const headers = { 'x-csrf-token': jar.mdz_csrf || '' };
    headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    let payload;
    if (form) payload = form; else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(BASE + url, { method, headers, body: payload });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const txt = await r.text(); let json; try { json = JSON.parse(txt); } catch { json = txt; }
    return { status: r.status, body: json };
  };
  c.jar = jar; return c;
}

(async () => {
  const png = await sharp({ create: { width: 200, height: 120, channels: 3, background: '#ffcc00' } }).png().toBuffer();
  const admin = client(); const cust = client(); const other = client();
  await admin('GET', '/api/bootstrap'); await cust('GET', '/api/bootstrap'); await other('GET', '/api/bootstrap');

  console.log('# security');
  let r = await cust('POST', '/api/auth/login', { email: 'x', password: 'y' }, {});
  const noCsrf = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  ok(noCsrf.status === 403, 'POST without CSRF token is rejected');
  ok(r.status === 401, 'bad login rejected');

  console.log('# admin setup');
  r = await admin('POST', '/api/auth/login', { email: 'admin@marchedz.dz', password: 'Admin@2026!' }); ok(r.status === 200, 'admin login', r.body);
  r = await admin('PUT', '/api/admin/settings', { ccp_account_name: 'TEST', ccp_account_number: '0012345678', ccp_key: '99', fx_usd_rate: '135.5' }); ok(r.status === 200, 'settings saved', r.body);
  r = await admin('POST', '/api/admin/shipping/bulk', { carrier_id: 1, method: 'home', price: '600', days: '2-4' }); ok(r.body.count === 58, 'bulk home rates', r.body);
  r = await admin('POST', '/api/admin/shipping/bulk', { carrier_id: 1, method: 'office', price: '400', days: '2-4' }); ok(r.body.count === 58, 'bulk office rates');

  console.log('# register + verify');
  const email = `t${Date.now()}@test.dz`;
  r = await cust('POST', '/api/auth/register', { name: 'Test Client', email, phone: '07' + String(Date.now()).slice(-8), password: 'Passw0rd!' }); ok(r.status === 200 && r.body.dev_code, 'register', r.body);
  r = await cust('POST', '/api/auth/verify', { code: '000000' }); ok(r.status === 400, 'wrong code rejected');
  r = await cust('POST', '/api/auth/verify', { code: r.body && (await Promise.resolve()) || '' });
  const re = await cust('POST', '/api/auth/verify/resend'); r = await cust('POST', '/api/auth/verify', { code: re.body.dev_code }); ok(r.status === 200, 'email verified', r.body);
  r = await cust('GET', '/api/admin/orders'); ok(r.status === 403, 'customer cannot access admin API');

  console.log('# catalog/search');
  r = await cust('GET', '/api/products?q=ايفون&facets=1'); ok(r.body.total >= 2, 'arabic search ايفون', r.body.total);
  r = await cust('GET', '/api/products?q=samsng'); ok(r.body.corrected && r.body.total > 0, 'typo correction samsng → ' + r.body.corrected);
  r = await cust('GET', '/api/suggest?q=iphone'); ok(r.body.items.length > 0 && r.body.items[0].thumb, 'suggestions with thumbs');
  r = await cust('GET', '/api/products?cat=fashion&facets=1&sort=price_asc'); ok(r.body.total > 10 && r.body.facets.categories.length, 'category listing with facets', r.body.facets?.categories);
  r = await cust('GET', '/api/products?collection=deals'); ok(r.body.items.every(p => p.eff < p.price), 'deals collection');
  const plist = await cust('GET', '/api/products?q=iphone 13'); const slug = plist.body.items[0].slug;
  const prod = (await cust('GET', '/api/products/' + slug)).body; ok(prod.variants.length === 3, 'product detail with variants');
  const v = prod.variants[0];

  console.log('# cart + quote');
  r = await cust('POST', '/api/cart', { variant_id: v.id, qty: v.stock + 1 }); ok(r.status >= 400, 'cannot exceed stock', r.body);
  r = await cust('POST', '/api/cart', { variant_id: v.id, qty: 1 }); ok(r.status === 200 && r.body.lines.length === 1, 'add to cart');
  const cheap = (await cust('GET', '/api/products?sort=price_asc&limit=1')).body.items[0];
  const addr = { full_name: 'Test Client', phone: '0661223344', wilaya_id: 2, commune_id: (await cust('GET', '/api/wilayas/2/communes')).body[0].id, delivery_method: 'home', address: 'Cité 100 logements, Bt 3' };
  r = await cust('POST', '/api/cart/quote', { source: 'cart', coupon: 'BIENVENUE10', wilaya_id: addr.wilaya_id, commune_id: addr.commune_id, method: 'home' });
  ok(r.body.coupon?.ok && r.body.shipping?.price === 60000, 'quote with coupon + shipping', { c: r.body.coupon, s: r.body.shipping });
  const q1 = r.body;
  ok(q1.total === q1.subtotal - q1.coupon_discount + 60000, 'total computed server-side');

  console.log('# COD order');
  r = await cust('POST', '/api/orders', { payment_method: 'cod', idempotency_key: 'idem-' + Date.now(), address: addr, coupon: 'BIENVENUE10', expected_total: q1.total + 1 }); ok(r.status === 409 && r.body.error === 'price_changed', 'expected_total mismatch rejected');
  const idem = 'idem-cod-' + Date.now();
  r = await cust('POST', '/api/orders', { payment_method: 'cod', idempotency_key: idem, address: addr, coupon: 'BIENVENUE10', expected_total: q1.total }); ok(r.status === 200, 'COD order placed', r.body);
  const codNumber = r.body.number;
  r = await cust('POST', '/api/orders', { payment_method: 'cod', idempotency_key: idem, address: addr }); ok(r.body.duplicate && r.body.number === codNumber, 'idempotent re-submit');
  const after = (await cust('GET', '/api/products/' + slug)).body.variants[0]; ok(after.stock === v.stock - 1, 'stock reserved');
  r = await cust('GET', '/api/orders/' + codNumber); ok(r.body.payment_status === 'unpaid' && r.body.status === 'pending', 'COD order unpaid/pending');
  await other('POST', '/api/auth/login', { email: 'demo@marchedz.dz', password: 'Demo@2026!' });
  r = await other('GET', '/api/orders/' + codNumber); ok(r.status === 404, 'other customer cannot see the order');

  console.log('# wallet top-up (CCP)');
  r = await cust('POST', '/api/wallet/withdrawals', { method: 'ccp', amount: '2000', beneficiary_name: 'Test Client', account: '0012345', account_key: '12', password: 'Passw0rd!' }); ok(r.status === 400 && r.body.error === 'insufficient_balance', 'cannot withdraw unavailable balance', r.body);
  let fd = new FormData(); fd.append('method', 'ccp'); fd.append('requested_amount', '300000'); fd.append('sent_amount', '300000'); fd.append('reference', 'REF-' + Date.now()); fd.append('transfer_date', '2026-10-20');
  r = await cust('POST', '/api/wallet/topups', undefined, { form: fd }); ok(r.status === 400 && r.body.error === 'receipt_required', 'receipt required');
  const ref = 'CCP' + Date.now();
  fd = new FormData(); fd.append('method', 'ccp'); fd.append('requested_amount', '300000'); fd.append('sent_amount', '300000'); fd.append('reference', ref); fd.append('transfer_date', '2026-10-20'); fd.append('receipt', new Blob([png], { type: 'image/png' }), 'r.png');
  r = await cust('POST', '/api/wallet/topups', undefined, { form: fd }); ok(r.status === 200 && r.body.status === 'pending', 'top-up submitted (pending)', r.body);
  r = await cust('GET', '/api/wallet'); ok(r.body.available === 0, 'balance NOT credited before review');
  fd = new FormData(); fd.append('method', 'ccp'); fd.append('requested_amount', '1000'); fd.append('sent_amount', '1000'); fd.append('reference', ref); fd.append('transfer_date', '2026-10-20'); fd.append('receipt', new Blob([png], { type: 'image/png' }), 'r.png');
  r = await other('POST', '/api/wallet/topups', undefined, { form: fd }); ok(r.status === 409, 'same reference cannot be reused by another account', r.body);
  const tops = (await admin('GET', '/api/admin/finance/topups?status=pending')).body.items; const top = tops.find(t => t.reference === ref);
  r = await other('GET', '/api/files/' + top.receipt_file_id); ok(r.status === 403, 'receipt not visible to other customers');
  r = await admin('GET', '/api/files/' + top.receipt_file_id); ok(r.status === 200, 'receipt visible to finance staff');
  r = await admin('POST', `/api/admin/finance/topups/${top.id}/approve`, { amount: '3000' }); ok(r.status === 200, 'admin approves top-up');
  r = await admin('POST', `/api/admin/finance/topups/${top.id}/approve`, { amount: '3000' }); ok(r.status === 409, 'double approval blocked');
  r = await cust('GET', '/api/wallet'); ok(r.body.available === 300000, 'wallet credited 3000 DZD once', r.body.available);

  console.log('# wallet purchase + cancel refund');
  await cust('POST', '/api/cart', { variant_id: cheap.variants[0].id, qty: 1 });
  const q2 = (await cust('POST', '/api/cart/quote', { source: 'cart', wilaya_id: 2, commune_id: addr.commune_id, method: 'office' })).body;
  r = await cust('POST', '/api/orders', { payment_method: 'wallet', idempotency_key: 'w-' + Date.now(), address: { ...addr, delivery_method: 'office' }, expected_total: q2.total });
  ok(r.status === 200, 'wallet order placed', r.body); const wNumber = r.body.number;
  r = await cust('GET', '/api/wallet'); ok(r.body.available === 300000 - q2.total, 'wallet debited exact total');
  r = await cust('GET', '/api/orders/' + wNumber); ok(r.body.payment_status === 'paid', 'wallet order paid');
  r = await cust('POST', `/api/orders/${wNumber}/cancel`, { reason: 'test' }); ok(r.status === 200, 'customer cancels');
  r = await cust('GET', '/api/wallet'); ok(r.body.available === 300000, 'wallet refunded on cancel');
  r = await cust('POST', `/api/orders/${wNumber}/cancel`, {}); ok(r.status === 400, 'cannot cancel twice');

  console.log('# withdrawals');
  r = await cust('POST', '/api/wallet/withdrawals', { method: 'ccp', amount: '1500', beneficiary_name: 'Test Client', account: '0012345', account_key: '12', password: 'bad' }); ok(r.status === 400, 'password re-check');
  r = await cust('POST', '/api/wallet/withdrawals', { method: 'ccp', amount: '1500', beneficiary_name: 'Test Client', account: '0012345', account_key: '12', password: 'Passw0rd!' }); ok(r.status === 200, 'withdrawal requested', r.body);
  r = await cust('GET', '/api/wallet'); ok(r.body.available === 150000 && r.body.held === 150000, 'amount held during review');
  let wd = (await admin('GET', '/api/admin/finance/withdrawals?status=pending')).body.items[0];
  r = await admin('POST', `/api/admin/finance/withdrawals/${wd.id}/reject`, { reason: 'Name mismatch' }); ok(r.status === 200, 'reject withdrawal');
  r = await cust('GET', '/api/wallet'); ok(r.body.available === 300000 && r.body.held === 0, 'held amount released');
  await cust('POST', '/api/wallet/withdrawals', { method: 'ccp', amount: '1000', beneficiary_name: 'Test Client', account: '0012345', account_key: '12', password: 'Passw0rd!' });
  wd = (await admin('GET', '/api/admin/finance/withdrawals?status=pending')).body.items[0];
  r = await admin('POST', `/api/admin/finance/withdrawals/${wd.id}/pay`, { payout_reference: 'X' }); ok(r.status >= 400, 'cannot pay before approval');
  await admin('POST', `/api/admin/finance/withdrawals/${wd.id}/approve`, {});
  r = await admin('POST', `/api/admin/finance/withdrawals/${wd.id}/pay`, { payout_reference: 'CCP-OUT-1' }); ok(r.status === 200, 'payout recorded');
  r = await admin('POST', `/api/admin/finance/withdrawals/${wd.id}/pay`, { payout_reference: 'CCP-OUT-1' }); ok(r.status === 409, 'double payout blocked');
  r = await cust('GET', '/api/wallet'); ok(r.body.available === 200000 && r.body.held === 0, 'balance after payout 2000');

  console.log('# COD lifecycle + refund');
  const ao = (await admin('GET', '/api/admin/orders?q=' + codNumber)).body.items[0];
  r = await admin('POST', `/api/admin/orders/${ao.id}/status`, { to: 'delivered' }); ok(r.status === 400, 'invalid transition blocked');
  for (const to of ['confirmed', 'processing', 'ready']) await admin('POST', `/api/admin/orders/${ao.id}/status`, { to });
  r = await admin('POST', `/api/admin/orders/${ao.id}/shipment`, { mode: 'api', carrier_id: 1 }); ok(r.status === 400 && r.body.error === 'carrier_not_connected', 'API shipment refused when carrier not connected');
  r = await admin('POST', `/api/admin/orders/${ao.id}/shipment`, { mode: 'manual', carrier_id: 1, tracking: 'YAL-TEST-123' }); ok(r.status === 200 && r.body.status === 'shipment_created', 'manual shipment created', r.body);
  r = await admin('POST', `/api/admin/orders/${ao.id}/refund`, { amount: '100', note: 'test' }); ok(r.status === 400 && r.body.error === 'order_not_paid', 'cannot refund unpaid COD order');
  await admin('POST', `/api/admin/orders/${ao.id}/status`, { to: 'shipping' });
  r = await admin('POST', `/api/admin/orders/${ao.id}/collect`, {}); ok(r.status === 400, 'cannot collect before delivery');
  await admin('POST', `/api/admin/orders/${ao.id}/status`, { to: 'delivered' });
  r = await admin('POST', `/api/admin/orders/${ao.id}/collect`, {}); ok(r.status === 200 && r.body.payment_status === 'paid', 'COD collected');
  r = await admin('POST', `/api/admin/orders/${ao.id}/collect`, {}); ok(r.status === 409, 'double collection blocked');
  const od = (await cust('GET', '/api/orders/' + codNumber)).body; ok(od.can_refund, 'customer eligible for refund');
  r = await cust('POST', '/api/refunds', { order_number: codNumber, amount: String((od.paid_amount + 100) / 100), reason: 'defective', details: 'Screen broken' }); ok(r.status === 400, 'refund > paid rejected');
  r = await cust('POST', '/api/refunds', { order_number: codNumber, amount: '1000', reason: 'defective', details: 'Screen broken on arrival' }); ok(r.status === 200, 'refund requested');
  const rr = (await admin('GET', '/api/admin/finance/refunds?status=pending')).body.items[0];
  r = await admin('POST', `/api/admin/finance/refunds/${rr.id}/approve`, { amount: '1000' }); ok(r.status === 200, 'refund approved');
  r = await admin('POST', `/api/admin/finance/refunds/${rr.id}/approve`, { amount: '1000' }); ok(r.status === 409, 'double refund blocked');
  r = await cust('GET', '/api/wallet'); ok(r.body.available === 300000, 'refund credited to wallet (2000+1000)');
  r = await cust('GET', '/api/orders/' + codNumber); ok(r.body.payment_status === 'partially_refunded' && r.body.status === 'delivered', 'order partially refunded', { ps: r.body.payment_status, s: r.body.status });

  console.log('# support + notifications');
  fd = new FormData(); fd.append('type', 'order'); fd.append('subject', 'Where is my order?'); fd.append('body', 'Hello, please check'); fd.append('order_number', codNumber);
  r = await cust('POST', '/api/tickets', undefined, { form: fd }); ok(r.status === 200, 'ticket opened');
  const tk = (await admin('GET', '/api/admin/tickets')).body[0];
  fd = new FormData(); fd.append('body', 'It has been delivered.');
  r = await admin('POST', `/api/admin/tickets/${tk.id}/reply`, undefined, { form: fd }); ok(r.status === 200, 'staff replied');
  r = await cust('GET', '/api/notifications'); ok(r.body.some(n => n.type === 'ticket_reply') && r.body.some(n => n.type === 'topup_approved') && r.body.some(n => n.type === 'refund_done'), 'customer notifications from real events');
  r = await admin('GET', '/api/admin/dashboard'); ok(r.status === 200 && r.body.finance.wallet_liability >= 300000, 'dashboard financials', r.body.finance);
  r = await admin('GET', '/api/admin/carriers'); ok(r.body.every(c => !c.connected), 'carriers not shown as connected');

  console.log(`\n${pass} passed, ${failN} failed`);
  process.exit(failN ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
