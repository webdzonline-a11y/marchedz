/* Marché DZ — storefront: auth, customer account, wallet, support, content pages. */
(function () {
  'use strict';
  const M = window.MDZ;
  const { $, $$, esc, t, L, state: S, api, errMsg, money, moneyIn, icon, toast, modal, closeOverlay, confirmBox, busy, on, go, view } = M;
  const safeNext = n => (n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/api')) ? n : null;
  const field = (name, label, attrs = '', val = '') => `<label class="field"><span>${label}</span><input class="input" name="${name}" ${attrs} value="${esc(val)}"></label>`;
  const showErr = (box, e) => { box.innerHTML = `<div class="msg msg-err">${icon('alert', 'sm')} <span>${esc(errMsg(e))}${e.min != null && e.max != null ? ` (${M.moneyTxt(e.min, 'DZD')} – ${M.moneyTxt(e.max, 'DZD')})` : ''}${e.max != null && e.min == null ? ` (${t('refund_max', { max: M.moneyTxt(e.max, 'DZD') })})` : ''}</span></div>`; };
  const devMsg = code => code ? `<div class="msg msg-info mt">${icon('info', 'sm')} ${esc(t('dev_code', { code }))}</div>` : '';

  async function afterAuth(next) {
    const r = await api('GET', '/api/me'); M.setUser(r.user);
    await M.Cart.mergeGuest(); await M.refreshMe();
    M.renderChrome(); go(next || '/', { replace: true });
  }

  // ---------- auth ----------
  function authCard(inner) { return `<div class="auth-wrap"><div class="auth-card glass"><div class="center mb"><span class="logo-mark" style="margin:0 auto 10px;width:54px;height:54px">${M.logoMark(34)}</span></div>${inner}</div></div>`; }
  on(/^\/login$/, async ({ q }) => {
    if (S.user) return go(safeNext(q.get('next')) || '/account', { replace: true });
    M.setTitle(t('login'));
    view(authCard(`<h1 class="center">${t('login_title')}</h1><p class="muted center small">${esc(t('store'))}</p>
      <form id="f" class="stack mt" novalidate>${field('email', t('email_or_phone'), 'required autocomplete="username" dir="ltr" inputmode="email"')}
        <label class="field"><span class="row between">${t('password')}<a class="link small" href="/forgot">${t('forgot')}</a></span><input class="input" name="password" type="password" required autocomplete="current-password" dir="ltr"></label>
        <div id="err"></div><button class="btn btn-lg btn-accent btn-block">${t('login')}</button></form>
      <p class="center small mt">${t('no_account')} <a class="link" href="/register${q.get('next') ? '?next=' + encodeURIComponent(q.get('next')) : ''}">${t('register')}</a></p>`));
    $('#f').onsubmit = async e => {
      e.preventDefault(); const b = e.submitter || $('#f button'); busy(b, true); $('#err').innerHTML = '';
      try { await api('POST', '/api/auth/login', M.formData(e.target)); await afterAuth(safeNext(q.get('next'))); }
      catch (er) { showErr($('#err'), er); busy(b, false); }
    };
  }, { noSkeleton: true });

  on(/^\/register$/, async ({ q }) => {
    if (S.user) return go('/account', { replace: true });
    M.setTitle(t('register'));
    view(authCard(`<h1 class="center">${t('register_title')}</h1>
      <form id="f" class="stack mt">${field('name', t('full_name'), 'required minlength="2" maxlength="80" autocomplete="name"')}
        ${field('email', t('email'), 'type="email" required autocomplete="email" dir="ltr"')}${field('phone', t('phone'), 'required inputmode="tel" autocomplete="tel" dir="ltr" placeholder="05XX XX XX XX"')}
        <label class="field"><span>${t('password')}</span><input class="input" name="password" type="password" required minlength="8" autocomplete="new-password" dir="ltr"><span class="hint">${t('password_hint')}</span></label>
        <div id="err"></div><button class="btn btn-lg btn-accent btn-block">${t('register')}</button><p class="hint center">${t('terms_accept')}</p></form>
      <p class="center small">${t('have_account')} <a class="link" href="/login">${t('login')}</a></p>`));
    $('#f').onsubmit = async e => {
      e.preventDefault(); const b = $('#f button'); busy(b, true); $('#err').innerHTML = '';
      try {
        const r = await api('POST', '/api/auth/register', { ...M.formData(e.target), lang: S.lang });
        if (r.dev_code) sessionStorage.setItem('mdz_dev_code', r.dev_code);
        const next = safeNext(q.get('next'));
        await afterAuth('/account/verify' + (next ? '?next=' + encodeURIComponent(next) : ''));
      } catch (er) { showErr($('#err'), er); busy(b, false); }
    };
  }, { noSkeleton: true });

  on(/^\/forgot$/, async () => {
    M.setTitle(t('forgot'));
    view(authCard(`<h1 class="center">${t('reset_password')}</h1><form id="f1" class="stack mt">${field('email', t('email'), 'type="email" required dir="ltr" autocomplete="email"')}<div id="err1"></div><button class="btn btn-lg btn-block">${t('send_code')}</button></form>
      <form id="f2" class="stack mt hide"><div id="sent"></div>${field('code', t('code'), 'required inputmode="numeric" maxlength="6" dir="ltr" autocomplete="one-time-code"')}
        <label class="field"><span>${t('new_password')}</span><input class="input" name="password" type="password" required minlength="8" dir="ltr" autocomplete="new-password"><span class="hint">${t('password_hint')}</span></label><div id="err2"></div><button class="btn btn-lg btn-accent btn-block">${t('reset_password')}</button></form>
      <p class="center small mt"><a class="link" href="/login">${t('login')}</a></p>`));
    let email = '';
    $('#f1').onsubmit = async e => {
      e.preventDefault(); const b = $('#f1 button'); busy(b, true);
      try { email = e.target.email.value.trim(); const r = await api('POST', '/api/auth/forgot', { email }); $('#f1').classList.add('hide'); $('#f2').classList.remove('hide'); $('#sent').innerHTML = `<div class="msg msg-ok">${icon('mail', 'sm')} ${t('code_sent')}</div>${devMsg(r.dev_code)}`; }
      catch (er) { showErr($('#err1'), er); } finally { busy(b, false); }
    };
    $('#f2').onsubmit = async e => {
      e.preventDefault(); const b = $('#f2 button'); busy(b, true);
      try { await api('POST', '/api/auth/reset', { email, ...M.formData(e.target) }); toast(t('password_changed')); go('/login', { replace: true }); }
      catch (er) { showErr($('#err2'), er); busy(b, false); }
    };
  }, { noSkeleton: true });

  on(/^\/account\/verify$/, async ({ q }) => {
    M.setTitle(t('verify_email'));
    if (S.user.verified) return go(safeNext(q.get('next')) || '/account', { replace: true });
    const dev = sessionStorage.getItem('mdz_dev_code'); sessionStorage.removeItem('mdz_dev_code');
    view(authCard(`<h1 class="center">${t('verify_email')}</h1><p class="muted center small">${esc(t('verify_d', { email: S.user.email }))}</p><div id="dev">${devMsg(dev)}</div>
      <form id="f" class="stack mt"><input class="input center" name="code" required inputmode="numeric" maxlength="6" dir="ltr" autocomplete="one-time-code" style="font:800 24px Inter;letter-spacing:8px;height:58px" aria-label="${t('code')}"><div id="err"></div><button class="btn btn-lg btn-accent btn-block">${t('verify')}</button></form>
      <div class="row mt" style="justify-content:space-between"><button class="link small" id="resend" style="border:0;background:none">${t('resend')}</button><a class="link small" href="${esc(safeNext(q.get('next')) || '/')}">${t('later')}</a></div>`));
    $('#f').onsubmit = async e => {
      e.preventDefault(); const b = $('#f button'); busy(b, true);
      try { await api('POST', '/api/auth/verify', { code: e.target.code.value.trim() }); await M.refreshMe(); toast(t('verified')); go(safeNext(q.get('next')) || '/account', { replace: true }); }
      catch (er) { showErr($('#err'), er); busy(b, false); }
    };
    $('#resend').onclick = async e => { busy(e.currentTarget, true); try { const r = await api('POST', '/api/auth/verify/resend'); $('#dev').innerHTML = `<div class="msg msg-ok mt">${t('code_sent')}</div>${devMsg(r.dev_code)}`; } catch (er) { toast(errMsg(er), 'err'); } finally { busy(e.currentTarget, false); } };
  }, { auth: true, noSkeleton: true });

  // ---------- account layout ----------
  function acct(active, inner, title) {
    const u = S.user;
    const items = [['/account', 'dashboard', 'grid'], ['/account/orders', 'my_orders', 'package'], ['/account/wallet', 'wallet', 'wallet'], ['/account/addresses', 'addresses', 'pin'],
      ['/account/favorites', 'favorites', 'heart'], ['/account/notifications', 'notifications', 'bell', u.unread], ['/support', 'support', 'headset'], ['/account/profile', 'profile', 'user']];
    return `<div class="container"><div class="acct"><nav class="acct-nav glass" aria-label="${t('account')}">
      <div class="acct-user"><span class="avatar">${esc(u.name.charAt(0).toUpperCase())}</span><div style="min-width:0"><b style="display:block">${esc(u.name)}</b><span class="tiny muted" style="word-break:break-all">${esc(u.email)}</span></div></div>
      ${items.map(([h, k, ic, c]) => `<a href="${h}" class="${active === h ? 'on' : ''}">${icon(ic, 'sm')}${t(k)}${c ? `<span class="cnt">${c}</span>` : ''}</a>`).join('')}
      ${u.role !== 'customer' ? `<a href="/admin" data-ext>${icon('settings', 'sm')}${t('admin_panel')}</a>` : ''}
      <button class="nav" id="logout">${icon('logout', 'sm')}${t('logout')}</button></nav>
      <div style="min-width:0">${title ? `<h2 class="title">${title}</h2>` : ''}${inner}</div></div></div>`;
  }
  document.addEventListener('click', async e => {
    if (!e.target.closest('#logout')) return;
    try { await api('POST', '/api/auth/logout'); } catch { /* ignore */ }
    M.setUser(null); M.renderChrome(); go('/', { replace: true });
  });
  const verifyBanner = () => S.user.verified ? '' : `<div class="msg msg-warn mb">${icon('mail', 'sm')}<span class="grow">${t('verify_banner')}</span><a class="link" href="/account/verify">${t('verify')}</a></div>`;
  const walletCard = (w, full) => `<div class="wallet-card"><div class="row between"><span class="sub">${t('available')}</span>${icon('wallet')}</div><div class="bal">${money(w.available, 'DZD')}</div>
    ${S.currency === 'USD' ? `<div class="sub">${t('approx', { amount: M.moneyTxt(w.available, 'USD') })}</div>` : ''}
    <div class="sub mt">${t('held')}: <b>${money(w.held, 'DZD')}</b>${full ? ` <span class="tiny">— ${t('held_d')}</span>` : ''}</div>
    <div class="row wrap mt-lg"><a class="btn btn-accent btn-sm" href="/account/wallet/topup">${icon('plus', 'sm')} ${t('topup')}</a><a class="btn btn-ghost btn-sm" href="/account/wallet/withdraw">${icon('download', 'sm')} ${t('withdraw')}</a>${full ? '' : `<a class="btn btn-ghost btn-sm" href="/account/wallet">${t('transactions')}</a>`}</div></div>`;
  const ordersTable = list => list.length ? `<div class="table-wrap card"><table class="tbl"><thead><tr><th>${t('order')}</th><th>${t('date')}</th><th>${t('total')}</th><th>${t('status')}</th><th>${t('payment')}</th></tr></thead><tbody>
    ${list.map(o => `<tr class="click" data-href="/account/orders/${esc(o.number)}"><td><div class="row"><img src="${esc(o.image || '/favicon.svg')}" alt="" style="width:40px;height:40px;object-fit:contain;border-radius:10px;border:1px solid var(--line);background:#fff"><div><a class="bold num" href="/account/orders/${esc(o.number)}">${esc(o.number)}</a><div class="tiny muted">${t('items_n', { n: o.items })}</div></div></div></td>
      <td class="small">${M.fmtDate(o.created_at)}</td><td><b>${money(o.total, 'DZD')}</b></td><td>${M.orderStatus(o.status)}</td><td><span class="small">${t(o.payment_method === 'wallet' ? 'pay_wallet' : 'pay_cod')}</span><br>${M.payStatus(o.payment_status)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty glass"><div class="em-ic">${icon('package', 'lg')}</div><h3>${t('no_orders')}</h3><a class="btn btn-accent mt" href="/">${t('shop_now')}</a></div>`;
  document.addEventListener('click', e => { const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a,button')) go(tr.dataset.href); });

  on(/^\/account$/, async ({ alive }) => {
    M.setTitle(t('my_account'));
    const orders = await api('GET', '/api/orders'); if (!alive()) return;
    const u = S.user; const active = orders.filter(o => !['delivered', 'cancelled', 'refunded', 'returned'].includes(o.status)).length;
    view(acct('/account', `${verifyBanner()}<div class="two-col" style="padding:0;grid-template-columns:1fr 1fr">${walletCard(u.wallet)}
      <div class="stat-cards" style="grid-template-columns:1fr 1fr">${[['package', 'my_orders', orders.length, '/account/orders'], ['clock', 'in_progress', active, '/account/orders'], ['heart', 'favorites', S.favs.size, '/account/favorites'], ['bell', 'unread_n', u.unread, '/account/notifications']]
        .map(([ic, k, v, h]) => `<a class="stat glass" href="${h}"><div class="k row">${icon(ic, 'sm')} ${t(k)}</div><div class="v num">${v}</div></a>`).join('')}</div></div>
      <div class="row between mt-lg mb"><h3 style="margin:0">${t('recent_orders')}</h3><a class="link small" href="/account/orders">${t('see_all')}</a></div>${ordersTable(orders.slice(0, 5))}`, `${t('hello')}${S.lang === 'ar' ? '،' : ','} ${esc(u.name)}`));
  }, { auth: true });

  on(/^\/account\/orders$/, async ({ alive }) => {
    M.setTitle(t('my_orders'));
    const orders = await api('GET', '/api/orders'); if (!alive()) return;
    view(acct('/account/orders', ordersTable(orders), t('my_orders')));
  }, { auth: true });

  const RANK = { pending: 0, confirmed: 1, processing: 2, ready: 2, shipment_created: 3, shipping: 3, delivered: 4 };
  on(/^\/account\/orders\/([^/]+)$/, async ({ m, q, alive }) => {
    const o = await api('GET', '/api/orders/' + encodeURIComponent(decodeURIComponent(m[1]))); if (!alive()) return;
    M.setTitle(`${t('order')} ${o.number}`);
    const rank = RANK[o.status];
    const steps = ['pending', 'confirmed', 'processing', 'shipping', 'delivered'];
    view(acct('/account/orders', `
      ${q.get('placed') ? `<div class="msg msg-ok mb" style="padding:16px">${icon('check-circle')}<div><b style="font-size:16px">${t('order_placed')}</b><div>${t('order_placed_d')}</div></div></div>` : ''}
      <div class="glass panel mb"><div class="row between wrap"><div><div class="muted small">${t('order_number')}</div><div class="row"><b class="num" style="font-size:20px">${esc(o.number)}</b><button class="icon-btn" data-copy="${esc(o.number)}" aria-label="${t('copy')}">${icon('copy', 'sm')}</button></div><div class="small muted">${t('ordered_on')}: ${M.fmtDate(o.created_at)}</div></div>
        <div class="row wrap">${M.orderStatus(o.status)}${M.payStatus(o.payment_status)}</div></div>
        ${rank != null ? `<div class="progress-steps mt" aria-label="${t('order_progress')}">${steps.map((s, i) => `<div class="${i <= rank ? 'on' : ''}"><i></i>${t('st_' + s)}</div>`).join('')}</div>` : ''}
        ${o.status === 'cancelled' && o.cancel_reason ? `<div class="msg msg-err mt">${t('reason')}: ${esc(o.cancel_reason)}</div>` : ''}
        <div class="row wrap mt">${o.can_cancel ? `<button class="btn btn-ghost btn-sm" id="cancel" style="color:var(--danger)">${icon('x', 'sm')} ${t('cancel_order')}</button>` : ''}${o.can_refund ? `<button class="btn btn-sm btn-sale" id="refund">${icon('refresh', 'sm')} ${t('request_refund')}</button>` : ''}
          <a class="btn btn-ghost btn-sm" href="/support/new?order=${encodeURIComponent(o.number)}">${icon('headset', 'sm')} ${t('open_ticket')}</a></div></div>
      <div class="two-col" style="padding:0;grid-template-columns:1fr 340px"><div class="stack">
        <div class="glass panel"><h3 style="margin-top:0">${t('sub_items')}</h3>${o.items.map(i => `<div class="mini-line" style="border-bottom:1px solid var(--line)"><img src="${esc(i.image || '/favicon.svg')}" alt=""><span class="grow">${i.slug ? `<a class="bold" href="/p/${esc(i.slug)}">${esc(L(i, 'name'))}</a>` : `<b>${esc(L(i, 'name'))}</b>`}<br><span class="tiny muted">${[i.color && M.colorName(i.color), i.size].filter(Boolean).map(esc).join(' • ')} ${money(i.unit_price, 'DZD')} × <span class="num">${i.qty}</span></span></span><b>${money(i.line_total, 'DZD')}</b></div>`).join('')}
          <div class="mt"><div class="sum-row"><span>${t('subtotal')}</span><b>${money(o.subtotal + o.items_discount, 'DZD')}</b></div>${o.items_discount ? `<div class="sum-row discount"><span>${t('items_discount')}</span><b>−${money(o.items_discount, 'DZD')}</b></div>` : ''}
            ${o.coupon_discount ? `<div class="sum-row discount"><span>${t('coupon')} <span class="num">${esc(o.coupon_code)}</span></span><b>−${money(o.coupon_discount, 'DZD')}</b></div>` : ''}<div class="sum-row"><span>${t('shipping')}</span><b>${o.shipping_fee ? money(o.shipping_fee, 'DZD') : t('free')}</b></div>
            <div class="sum-row total"><span>${t('grand_total')}</span><span>${money(o.total, 'DZD')}</span></div>${o.display_currency === 'USD' ? `<div class="hint" style="text-align:end">${t('rate_used')}: 1 USD = ${(o.fx_rate_micro / 1e6).toFixed(2)} DZD</div>` : ''}</div></div>
        <div class="glass panel"><h3 style="margin-top:0">${t('history')}</h3><div class="timeline">${o.history.map((h, i) => `<div class="tl-item ${i === o.history.length - 1 ? 'on' : ''}"><span class="tl-dot">${icon('check', 'sm')}</span><div><b>${t('st_' + h.to_status)}</b><div class="tiny muted">${M.fmtDate(h.created_at)}</div>${h.note ? `<div class="small">${esc(h.note)}</div>` : ''}</div></div>`).join('')}</div></div>
        ${o.refunds.length ? `<div class="glass panel"><h3 style="margin-top:0">${t('refunds')}</h3>${o.refunds.map(r => `<div class="row between wrap" style="padding:10px 0;border-bottom:1px solid var(--line)"><div><b class="num">${esc(r.ref)}</b> ${M.reqStatus(r.status)}<div class="tiny muted">${t('rs_' + r.reason)} • ${M.fmtDate(r.created_at)}</div>${r.admin_note ? `<div class="small">${t('admin_note')}: ${esc(r.admin_note)}</div>` : ''}</div><div style="text-align:end"><b>${money(r.requested_amount, 'DZD')}</b>${r.approved_amount != null ? `<div class="small amt-pos">${t('rq_approved')}: ${money(r.approved_amount, 'DZD')}</div>` : ''}${r.status === 'needs_info' ? `<button class="btn btn-sm btn-soft mt" data-rinfo="${esc(r.ref)}">${t('add_info')}</button>` : ''}</div></div>`).join('')}</div>` : ''}
      </div><div class="stack">
        <div class="glass panel"><h3 style="margin-top:0">${t('delivery_info')}</h3><div class="small stack" style="gap:6px"><b>${esc(o.ship_name)}</b><span class="num">${esc(o.ship_phone)}</span><span>${esc(pickLang(o.ship_wilaya))} — ${esc(pickLang(o.ship_commune))}</span><span>${esc(o.ship_address)}</span>
          <span>${icon(o.delivery_method === 'home' ? 'home' : 'package', 'sm')} ${t(o.delivery_method === 'home' ? 'home_delivery' : 'office_delivery')}${o.carrier ? ` • ${esc(o.carrier)}` : ''}</span>${o.ship_notes ? `<span class="muted">${esc(o.ship_notes)}</span>` : ''}</div>
          ${o.shipment && o.shipment.tracking ? `<div class="copy-row mt"><span class="small">${t('tracking')}</span><b>${esc(o.shipment.tracking)}</b>${o.shipment.tracking_url ? `<a class="link small" target="_blank" rel="noopener" href="${esc(o.shipment.tracking_url.replace('{tracking}', encodeURIComponent(o.shipment.tracking)))}">${t('track')}</a>` : ''}</div>` : ''}</div>
        <div class="glass panel"><h3 style="margin-top:0">${t('payment')}</h3><div class="small">${t(o.payment_method === 'wallet' ? 'pay_wallet' : 'pay_cod')}</div><div class="mt">${M.payStatus(o.payment_status)}</div>
          ${o.paid_amount ? `<div class="sum-row small"><span>${t('ps_paid')}</span><b>${money(o.paid_amount, 'DZD')}</b></div>` : ''}${o.refunded_amount ? `<div class="sum-row small"><span>${t('ps_refunded')}</span><b class="amt-pos">${money(o.refunded_amount, 'DZD')}</b></div>` : ''}
          ${o.payment_method === 'cod' && o.payment_status === 'unpaid' ? `<p class="hint">${t('cod_unpaid_note')}</p>` : ''}</div></div></div>`));
    $$('[data-copy]').forEach(b => b.onclick = () => M.copyText(b.dataset.copy));
    const c = $('#cancel');
    if (c) c.onclick = async () => {
      const reason = await confirmBox(t('cancel_confirm'), { danger: true, okText: t('cancel_order'), input: true, inputLabel: t('cancel_reason') });
      if (reason === null) return;
      try { await api('POST', `/api/orders/${encodeURIComponent(o.number)}/cancel`, { reason: reason || undefined }); toast(t('order_cancelled')); await M.refreshMe(); M.route(true); } catch (e) { toast(errMsg(e), 'err'); }
    };
    const rf = $('#refund');
    if (rf) rf.onclick = () => {
      const md = modal(`<h3>${t('request_refund')}</h3><form id="rf" class="stack"><label class="field"><span>${t('refund_reason')}</span><select class="input" name="reason" required>${['defective', 'not_as_described', 'wrong_item', 'missing_parts', 'returned', 'other'].map(r => `<option value="${r}">${t('rs_' + r)}</option>`).join('')}</select></label>
        <label class="field"><span>${t('refund_amount')} (DZD)</span><input class="input" name="amount" type="number" step="0.01" min="1" max="${o.refundable / 100}" value="${o.refundable / 100}" dir="ltr" required><span class="hint">${t('refund_max', { max: M.moneyTxt(o.refundable, 'DZD') })}</span></label>
        <label class="field"><span>${t('refund_details')}</span><textarea class="input" name="details" required minlength="5" maxlength="1500"></textarea></label><div id="rf-err"></div><button class="btn btn-sale btn-block">${t('submit')}</button></form>`);
      $('#rf', md).onsubmit = async e => { e.preventDefault(); const b = $('#rf button', md); busy(b, true);
        try { await api('POST', '/api/refunds', { order_number: o.number, ...M.formData(e.target) }); closeOverlay(); toast(t('refund_sent')); M.route(true); } catch (er) { showErr($('#rf-err', md), er); busy(b, false); } };
    };
    $$('[data-rinfo]').forEach(b => b.onclick = () => infoModal(`/api/refunds/${encodeURIComponent(b.dataset.rinfo)}/info`, false));
  }, { auth: true });
  const pickLang = s => { const parts = String(s || '').split(' / '); return parts.length === 2 ? (S.lang === 'ar' ? parts[0] : parts[1]) : s; };

  function infoModal(url, withFile) {
    const md = modal(`<h3>${t('add_info')}</h3><form id="inf" class="stack"><label class="field"><span>${t('message')}</span><textarea class="input" name="note" required minlength="2" maxlength="500"></textarea></label>
      ${withFile ? fileDrop('receipt', false) : ''}<div id="inf-err"></div><button class="btn btn-accent btn-block">${t('submit')}</button></form>`);
    if (withFile) bindFileDrop(md);
    $('#inf', md).onsubmit = async e => { e.preventDefault(); const b = $('#inf button', md); busy(b, true);
      try { const body = withFile ? new FormData(e.target) : M.formData(e.target); await api('POST', url, body); closeOverlay(); toast(t('saved')); M.route(true); } catch (er) { showErr($('#inf-err', md), er); busy(b, false); } };
  }
  function fileDrop(name, required, label) {
    return `<label class="file-drop" data-fd><input type="file" name="${name}" accept="image/jpeg,image/png,image/webp,application/pdf" ${required ? 'required' : ''} class="sr-only">
      <div class="row" style="justify-content:center">${icon('upload')} <b>${label || t('upload_receipt')}</b>${required ? ` <span style="color:var(--danger)">*</span>` : ''}</div><div class="hint mt">${t('drop_or_click')}</div><div data-prev></div></label>`;
  }
  function bindFileDrop(root) {
    $$('[data-fd]', root).forEach(fd => {
      const inp = fd.querySelector('input'); const prev = fd.querySelector('[data-prev]');
      const show = () => { const f = inp.files[0]; if (!f) { prev.innerHTML = ''; return; }
        if (f.size > 6 * 1024 * 1024) { toast(t('err_file_too_large'), 'err'); inp.value = ''; prev.innerHTML = ''; return; }
        prev.innerHTML = f.type.startsWith('image/') ? `<img src="${URL.createObjectURL(f)}" alt="">` : `<div class="msg msg-info mt">${icon('receipt', 'sm')} ${esc(t('file_selected', { name: f.name }))}</div>`; };
      inp.onchange = show;
      ['dragenter', 'dragover'].forEach(ev => fd.addEventListener(ev, e => { e.preventDefault(); fd.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach(ev => fd.addEventListener(ev, e => { e.preventDefault(); fd.classList.remove('drag'); }));
      fd.addEventListener('drop', e => { if (e.dataTransfer.files.length) { inp.files = e.dataTransfer.files; show(); } });
    });
  }

  // ---------- wallet ----------
  on(/^\/account\/wallet$/, async ({ q, alive }) => {
    M.setTitle(t('wallet'));
    const w = await api('GET', '/api/wallet'); if (!alive()) return;
    S.user.wallet = { available: w.available, held: w.held }; M.updateBadges();
    const tab = q.get('tab') || 'tx';
    const amtCell = x => { const parts = []; if (x.delta_available) parts.push(`<span class="${x.delta_available > 0 ? 'amt-pos' : 'amt-neg'}">${x.delta_available > 0 ? '+' : '−'}${money(Math.abs(x.delta_available), 'DZD')}</span>`);
      if (x.delta_held) parts.push(`<span class="amt-hold small">${t('held')}: ${x.delta_held > 0 ? '+' : '−'}${money(Math.abs(x.delta_held), 'DZD')}</span>`); return parts.join('<br>'); };
    const tables = {
      tx: w.transactions.length ? `<table class="tbl"><thead><tr><th>${t('date')}</th><th>${t('type')}</th><th>${t('reference')}</th><th>${t('amount')}</th><th>${t('available')}</th></tr></thead><tbody>${w.transactions.map(x => `<tr><td class="small">${M.fmtDate(x.created_at)}</td><td><b class="small">${esc(t('tx_' + x.type))}</b>${x.note ? `<div class="tiny muted">${esc(x.note)}</div>` : ''}</td><td class="num tiny">${esc(x.ref)}</td>
        <td>${amtCell(x)}${x.orig_currency === 'USD' ? `<div class="tiny muted">${t('original_amount')}: $${(x.orig_amount / 100).toFixed(2)} • ${t('rate_used')} ${(x.fx_rate_micro / 1e6).toFixed(2)}</div>` : ''}</td><td class="small">${money(x.available_after, 'DZD')}</td></tr>`).join('')}</tbody></table>` : '',
      topups: w.topups.length ? `<table class="tbl"><thead><tr><th>${t('reference')}</th><th>${t('method')}</th><th>${t('amount')}</th><th>${t('status')}</th><th>${t('date')}</th><th></th></tr></thead><tbody>${w.topups.map(x => `<tr><td class="num tiny">${esc(x.ref)}<div class="muted">${esc(x.reference)}</div></td><td>${x.method.toUpperCase()}${x.network ? ` <span class="tiny muted">${esc(x.network)}</span>` : ''}</td>
        <td>${moneyIn(x.requested_amount, x.currency)}<div class="tiny muted">${t('sent_amount')}: ${moneyIn(x.sent_amount, x.currency)}</div>${x.credited_dzd ? `<div class="tiny amt-pos">+${money(x.credited_dzd, 'DZD')}</div>` : ''}</td><td>${M.reqStatus(x.status)}${x.admin_note ? `<div class="tiny muted" style="max-width:220px">${esc(x.admin_note)}</div>` : ''}</td><td class="small">${M.fmtDate(x.created_at)}</td>
        <td>${x.status === 'needs_info' ? `<button class="btn btn-sm btn-soft" data-tinfo="${esc(x.ref)}">${t('add_info')}</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '',
      withdrawals: w.withdrawals.length ? `<table class="tbl"><thead><tr><th>${t('reference')}</th><th>${t('method')}</th><th>${t('amount')}</th><th>${t('net_amount')}</th><th>${t('status')}</th><th></th></tr></thead><tbody>${w.withdrawals.map(x => `<tr><td class="num tiny">${esc(x.ref)}<div class="muted">${M.fmtDate(x.created_at)}</div></td><td>${x.method.toUpperCase()}<div class="tiny muted ltr">${esc(x.account)}</div></td>
        <td>${moneyIn(x.orig_amount, x.currency)}<div class="tiny muted">${t('fees')}: ${money(x.fee_dzd, 'DZD')}</div></td><td><b>${moneyIn(x.net_orig, x.currency)}</b></td><td>${M.reqStatus(x.status)}${x.payout_reference ? `<div class="tiny">${t('payout_ref')}: <span class="num">${esc(x.payout_reference)}</span></div>` : ''}${x.admin_note ? `<div class="tiny muted" style="max-width:220px;white-space:pre-wrap">${esc(x.admin_note)}</div>` : ''}</td>
        <td class="row">${['pending', 'needs_info'].includes(x.status) ? `<button class="btn btn-sm btn-ghost" data-wcancel="${esc(x.ref)}">${t('cancel_request')}</button>` : ''}${x.status === 'needs_info' ? `<button class="btn btn-sm btn-soft" data-winfo="${esc(x.ref)}">${t('add_info')}</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '',
      refunds: w.refunds.length ? `<table class="tbl"><thead><tr><th>${t('reference')}</th><th>${t('order')}</th><th>${t('amount')}</th><th>${t('status')}</th></tr></thead><tbody>${w.refunds.map(x => `<tr><td class="num tiny">${esc(x.ref)}<div class="muted">${M.fmtDate(x.created_at)}</div></td><td><a class="link num" href="/account/orders/${esc(x.number)}">${esc(x.number)}</a></td><td>${money(x.requested_amount, 'DZD')}${x.approved_amount != null ? `<div class="tiny amt-pos">${t('rq_approved')}: ${money(x.approved_amount, 'DZD')}</div>` : ''}</td><td>${M.reqStatus(x.status)}${x.admin_note ? `<div class="tiny muted">${esc(x.admin_note)}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : '',
    };
    view(acct('/account/wallet', `${walletCard(w, true)}
      <p class="hint mt">${icon('info', 'sm')} ${t('fx_info', { rate: (w.fx_rate_micro / 1e6).toFixed(2), date: M.fmtDate(w.fx_updated_at, false) || '—' })}</p>
      <div class="tabs mt">${[['tx', 'transactions'], ['topups', 'topups'], ['withdrawals', 'withdrawals'], ['refunds', 'refunds']].map(([k, l]) => `<button data-wt="${k}" class="${tab === k ? 'on' : ''}">${t(l)}</button>`).join('')}</div>
      ${Object.entries(tables).map(([k, h]) => `<div data-wp="${k}" class="${tab === k ? '' : 'hide'}"><div class="table-wrap card">${h || `<div class="empty"><div class="em-ic">${icon('receipt', 'lg')}</div><p class="muted">${t('no_tx')}</p></div>`}</div></div>`).join('')}`, t('wallet')));
    $$('[data-wt]').forEach(b => b.onclick = () => { $$('[data-wt]').forEach(x => x.classList.toggle('on', x === b)); $$('[data-wp]').forEach(x => x.classList.toggle('hide', x.dataset.wp !== b.dataset.wt)); history.replaceState({}, '', '/account/wallet?tab=' + b.dataset.wt); });
    $$('[data-tinfo]').forEach(b => b.onclick = () => infoModal(`/api/wallet/topups/${encodeURIComponent(b.dataset.tinfo)}/info`, true));
    $$('[data-winfo]').forEach(b => b.onclick = () => infoModal(`/api/wallet/withdrawals/${encodeURIComponent(b.dataset.winfo)}/info`, false));
    $$('[data-wcancel]').forEach(b => b.onclick = async () => { if (!(await confirmBox(t('cancel_request') + '?', { danger: true }))) return;
      try { await api('POST', `/api/wallet/withdrawals/${encodeURIComponent(b.dataset.wcancel)}/cancel`); toast(t('saved')); await M.refreshMe(); M.route(true); } catch (e) { toast(errMsg(e), 'err'); } });
  }, { auth: true });

  const CCP_LOGO = `<span class="method-logo" style="background:#fde047;color:#1e3a8a;font:800 15px Inter">CCP</span>`;
  const USDT_LOGO = `<span class="method-logo" style="background:#26a17b;color:#fff;font:800 22px Inter">₮</span>`;
  const copyRow = (label, val) => val ? `<div class="copy-row"><span class="small muted">${label}</span><b class="grow" style="text-align:end">${esc(val)}</b><button type="button" class="icon-btn" data-copy="${esc(val)}" aria-label="${t('copy')}">${icon('copy', 'sm')}</button></div>` : '';

  on(/^\/account\/wallet\/topup$/, async () => {
    M.setTitle(t('topup_title'));
    const s = S.settings; const ccpOn = s.topup_ccp_enabled === '1'; const usdt = s.usdt;
    let method = ccpOn ? 'ccp' : usdt ? 'usdt' : null;
    const draw = () => {
      const lim = t('limits', { min: M.moneyTxt(Number(s.topup_min_dzd), 'DZD'), max: M.moneyTxt(Number(s.topup_max_dzd), 'DZD') });
      let form = '';
      if (method === 'ccp') {
        form = !s.ccp.number ? `<div class="msg msg-warn">${icon('alert', 'sm')} ${t('ccp_missing')}</div>` : `
          <div class="glass panel"><h4 style="margin-top:0">${t('receiving_account')}</h4><div class="stack" style="gap:8px">${copyRow(t('account_holder'), s.ccp.name)}${copyRow(t('account_number'), s.ccp.number)}${copyRow(t('account_key'), s.ccp.key)}${copyRow(t('rip'), s.ccp.rip)}</div>
            <p class="small mt">${icon('info', 'sm')} ${esc(L(s.ccp, 'instr'))}</p></div>
          <form id="tf" class="glass panel stack mt"><input type="hidden" name="method" value="ccp">
            <div class="grid-2">${field('requested_amount', t('requested_amount') + ' (DZD)', 'type="number" step="0.01" min="1" required dir="ltr"')}${field('sent_amount', t('sent_amount') + ' (DZD)', 'type="number" step="0.01" min="1" required dir="ltr"')}
            ${field('reference', t('transfer_ref'), 'required minlength="4" maxlength="120" dir="ltr"')}${field('transfer_date', t('transfer_date'), `type="date" required max="${new Date().toISOString().slice(0, 10)}"`)}</div>
            ${fileDrop('receipt', true, t('receipt'))}
            <label class="field"><span>${t('note')} <span class="muted">(${t('optional')})</span></span><textarea class="input" name="note" maxlength="500" style="min-height:70px"></textarea></label>
            <p class="hint">${lim}</p><div id="err"></div><button class="btn btn-lg btn-accent btn-block">${icon('send', 'sm')} ${t('send_topup')}</button></form>`;
      } else if (method === 'usdt') {
        form = `<div class="msg msg-warn">${icon('alert', 'sm')} <span>${t('legal_usdt')}</span></div>
          <div class="glass panel mt"><h4 style="margin-top:0">${t('receive_address')}</h4><div class="stack" style="gap:8px">${copyRow(t('network'), usdt.network)}${copyRow(t('receive_address'), usdt.address)}</div>
            <div class="msg msg-info mt">${icon('info', 'sm')} ${t('usdt_warning', { net: esc(usdt.network) })}</div><p class="small">${esc(L(usdt, 'instr'))}</p></div>
          <form id="tf" class="glass panel stack mt"><input type="hidden" name="method" value="usdt">
            <div class="grid-2">${field('requested_amount', t('requested_amount') + ' (USD)', 'type="number" step="0.01" min="1" required dir="ltr"')}${field('sent_amount', t('sent_amount') + ' (USDT)', 'type="number" step="0.01" min="1" required dir="ltr"')}</div>
            ${field('reference', t('txid'), 'required minlength="20" maxlength="120" dir="ltr" spellcheck="false"')}
            ${fileDrop('receipt', false, t('attach') + ` (${t('optional')})`)}
            <p class="hint">${lim} • 1 USD = ${M.rateTxt()} DZD</p><div id="err"></div><button class="btn btn-lg btn-accent btn-block">${icon('send', 'sm')} ${t('send_topup')}</button></form>`;
      } else form = `<div class="msg msg-warn">${t('methods_none')}</div>`;
      view(acct('/account/wallet', `<a class="link small" href="/account/wallet">${icon('arrow', 'sm')} ${t('wallet')}</a><h2 class="title mt">${t('topup_title')}</h2>
        <p class="muted small">${t('topup_choose')}</p><div class="grid-2 mb">
          ${ccpOn ? `<button class="method-card ${method === 'ccp' ? 'on' : ''}" data-m="ccp">${CCP_LOGO}<span style="text-align:start"><b>${t('ccp')}</b><br><span class="small muted">${t('ccp_d')}</span></span></button>` : ''}
          ${usdt ? `<button class="method-card ${method === 'usdt' ? 'on' : ''}" data-m="usdt">${USDT_LOGO}<span style="text-align:start"><b>${t('usdt')}</b><br><span class="small muted">${t('usdt_d', { net: esc(usdt.network) })}</span></span></button>` : ''}</div>${form}
        <div class="msg msg-info mt">${icon('shield', 'sm')} ${t('topup_safe')}</div>`));
      $$('[data-m]').forEach(b => b.onclick = () => { method = b.dataset.m; draw(); });
      $$('[data-copy]').forEach(b => b.onclick = () => M.copyText(b.dataset.copy));
      const tf = $('#tf'); if (!tf) return;
      bindFileDrop(tf);
      tf.onsubmit = async e => {
        e.preventDefault(); if (!tf.reportValidity()) return; const b = $('#tf button[class*=btn-lg]'); busy(b, true); $('#err').innerHTML = '';
        try { const r = await api('POST', '/api/wallet/topups', new FormData(tf));
          view(acct('/account/wallet', `<div class="empty glass"><div class="em-ic" style="background:var(--accent-soft);color:var(--accent-ink)">${icon('clock', 'lg')}</div><h3>${t('rq_pending')}</h3><p>${t('topup_sent')}</p><div class="copy-row" style="max-width:360px;margin:12px auto"><span class="small">${t('reference')}</span><b>${esc(r.ref)}</b></div><a class="btn mt" href="/account/wallet?tab=topups">${t('topups')}</a></div>`));
        } catch (er) { showErr($('#err'), er); busy(b, false); }
      };
    };
    draw();
  }, { auth: true, noSkeleton: true });

  on(/^\/account\/wallet\/withdraw$/, async ({ alive }) => {
    M.setTitle(t('withdraw_title'));
    await M.refreshMe(); if (!alive()) return;
    const s = S.settings; const opts = []; if (s.withdraw_ccp_enabled === '1') opts.push('ccp'); if (s.withdraw_usdt_enabled === '1') opts.push('usdt');
    let method = opts[0] || null;
    const rm = Number(s.fx_usd_rate_micro); const pct = Number(s.withdraw_fee_percent) || 0; const fixed = Number(s.withdraw_fee_fixed_dzd) || 0;
    const draw = () => {
      const cur = method === 'usdt' ? 'USD' : 'DZD'; const net = (s.usdt && s.usdt.network) || 'TRC20';
      view(acct('/account/wallet', `<a class="link small" href="/account/wallet">${icon('arrow', 'sm')} ${t('wallet')}</a><h2 class="title mt">${t('withdraw_title')}</h2>${verifyBanner()}
        <div class="stat glass mb"><div class="k">${t('available')}</div><div class="v">${money(S.user.wallet.available, 'DZD')}</div><div class="hint">${t('limits', { min: M.moneyTxt(Number(s.withdraw_min_dzd), 'DZD'), max: M.moneyTxt(Number(s.withdraw_max_dzd), 'DZD') })}${pct || fixed ? ` • ${t('fees')}: ${pct ? pct + '%' : ''}${pct && fixed ? ' + ' : ''}${fixed ? M.moneyTxt(fixed, 'DZD') : ''}` : ''}</div></div>
        ${opts.length ? `<div class="grid-2 mb">${opts.map(o => `<button class="method-card ${method === o ? 'on' : ''}" data-m="${o}">${o === 'ccp' ? CCP_LOGO : USDT_LOGO}<span style="text-align:start"><b>${t(o)}</b><br><span class="small muted">${o === 'ccp' ? t('ccp_d') : t('usdt_d', { net })}</span></span></button>`).join('')}</div>
        ${method === 'usdt' ? `<div class="msg msg-warn mb">${icon('alert', 'sm')} ${t('legal_usdt')}</div>` : ''}
        <form id="wf" class="glass panel stack"><input type="hidden" name="method" value="${method}">
          ${field('amount', `${t('amount')} (${cur})`, 'type="number" step="0.01" min="1" required dir="ltr"')}
          ${field('beneficiary_name', t('beneficiary'), 'required minlength="3" maxlength="80"', S.user.name)}
          ${method === 'ccp' ? `<div class="grid-2">${field('account', t('ccp_account'), 'required inputmode="numeric" pattern="[0-9 ]{6,14}" dir="ltr"')}${field('account_key', t('ccp_key'), 'required inputmode="numeric" pattern="[0-9]{2}" maxlength="2" dir="ltr"')}</div>`
            : `${field('account', `${t('usdt_address')} (${net})`, 'required dir="ltr" spellcheck="false"')}`}
          <div class="card panel" style="padding:14px" id="calc"></div><div id="err"></div><button class="btn btn-lg btn-accent btn-block" ${S.user.verified ? '' : 'disabled'}>${t('continue')}</button></form>` : `<div class="msg msg-warn">${t('methods_none')}</div>`}`));
      $$('[data-m]').forEach(b => b.onclick = () => { method = b.dataset.m; draw(); });
      const wf = $('#wf'); if (!wf) return;
      const calc = () => {
        const a = Math.round((Number(wf.amount.value) || 0) * 100);
        const dzd = cur === 'USD' ? Math.round(a * rm / 1e6) : a; const fee = Math.floor(dzd * pct / 100) + fixed; const netDzd = Math.max(0, dzd - fee);
        const netCur = cur === 'USD' ? Math.round(netDzd * 1e6 / rm) : netDzd;
        $('#calc').innerHTML = `<div class="sum-row"><span>${t('amount')}</span><b>${money(dzd, 'DZD')}</b></div><div class="sum-row"><span>${t('fees')}</span><b>${money(fee, 'DZD')}</b></div><div class="sum-row total"><span>${t('you_receive')}</span><span>${moneyIn(netCur, cur)}</span></div>${cur === 'USD' ? `<div class="hint">1 USD = ${M.rateTxt()} DZD</div>` : ''}`;
        return { dzd, fee, netCur };
      };
      wf.amount.oninput = calc; calc();
      wf.onsubmit = async e => {
        e.preventDefault(); if (!wf.reportValidity()) return; const c = calc(); const data = M.formData(wf);
        const md = modal(`<h3>${t('confirm_withdraw')}</h3><div class="card panel" style="padding:14px"><div class="sum-row"><span>${t('method')}</span><b>${t(method)}</b></div><div class="sum-row"><span>${t('beneficiary')}</span><b>${esc(data.beneficiary_name)}</b></div><div class="sum-row"><span>${t('account_number')}</span><b class="ltr">${esc(data.account)}${data.account_key ? ' / ' + esc(data.account_key) : ''}</b></div>
          <div class="sum-row"><span>${t('amount')}</span><b>${money(c.dzd, 'DZD')}</b></div><div class="sum-row"><span>${t('fees')}</span><b>${money(c.fee, 'DZD')}</b></div><div class="sum-row total"><span>${t('net_amount')}</span><span>${moneyIn(c.netCur, cur)}</span></div></div>
          <div class="msg msg-info mt">${icon('info', 'sm')} ${t('withdraw_sent')}</div>
          <form id="pw" class="stack mt"><label class="field"><span>${t('confirm_password')}</span><input class="input" type="password" name="password" required autocomplete="current-password" dir="ltr"></label><div id="pw-err"></div><button class="btn btn-accent btn-block">${t('confirm_withdraw')}</button></form>`);
        $('#pw', md).onsubmit = async ev => { ev.preventDefault(); const b = $('#pw button', md); busy(b, true);
          try { await api('POST', '/api/wallet/withdrawals', { ...data, password: ev.target.password.value }); closeOverlay(); toast(t('withdraw_sent')); await M.refreshMe(); go('/account/wallet?tab=withdrawals', { replace: true }); }
          catch (er) { showErr($('#pw-err', md), er); busy(b, false); } };
      };
    };
    draw();
  }, { auth: true });

  // ---------- addresses ----------
  on(/^\/account\/addresses$/, async ({ alive }) => {
    M.setTitle(t('addresses'));
    const list = await api('GET', '/api/addresses'); if (!alive()) return;
    view(acct('/account/addresses', `<div class="row between mb"><span></span><button class="btn btn-accent btn-sm" id="add">${icon('plus', 'sm')} ${t('add_address')}</button></div>
      ${list.length ? `<div class="grid-2">${list.map(a => `<div class="glass panel"><div class="row between"><b>${esc(a.label || a.full_name)}</b>${a.is_default ? `<span class="status s-green">${t('default')}</span>` : ''}</div>
        <div class="small mt stack" style="gap:4px"><span>${esc(a.full_name)} • <span class="num">${esc(a.phone)}</span></span><span>${esc(L({ n_ar: a.w_ar, n_en: a.w_en }, 'n'))} — ${esc(L({ n_ar: a.c_ar, n_en: a.c_en }, 'n'))}</span><span>${esc(a.address)}</span><span class="muted">${t(a.delivery_method === 'home' ? 'home_delivery' : 'office_delivery')}</span></div>
        <div class="row wrap mt"><button class="btn btn-ghost btn-sm" data-edit="${a.id}">${icon('edit', 'sm')} ${t('edit')}</button>${a.is_default ? '' : `<button class="btn btn-soft btn-sm" data-def="${a.id}">${t('set_default')}</button>`}<button class="btn btn-ghost btn-sm" data-del="${a.id}" style="color:var(--danger)">${icon('trash', 'sm')}</button></div></div>`).join('')}</div>`
      : `<div class="empty glass"><div class="em-ic">${icon('pin', 'lg')}</div><h3>${t('no_addresses')}</h3></div>`}`, t('addresses')));
    const form = a => {
      let method = a.delivery_method || 'home';
      const md = modal(`<h3>${a.id ? t('edit') : t('add_address')}</h3><form id="af" class="stack">${field('label', t('address_label'), 'maxlength="40"', a.label || '')}${M.addrFields(a)}
        <div class="field"><span>${t('delivery_method')}</span><div class="seg" id="adm"><button type="button" data-m="home">${t('home_delivery')}</button><button type="button" data-m="office">${t('office_delivery')}</button></div></div>
        <label class="check"><input type="checkbox" name="is_default" ${a.is_default ? 'checked' : ''}> ${t('set_default')}</label><div id="af-err"></div><button class="btn btn-accent btn-block">${t('save')}</button></form>`, { wide: true });
      const drawM = () => $$('#adm button', md).forEach(b => b.classList.toggle('on', b.dataset.m === method)); drawM();
      $$('#adm button', md).forEach(b => b.onclick = () => { method = b.dataset.m; drawM(); });
      M.bindAddrFields($('#af', md), a);
      $('#af', md).onsubmit = async e => { e.preventDefault(); const b = $('#af > button', md); busy(b, true);
        const d = M.formData(e.target); d.delivery_method = method; d.is_default = e.target.is_default.checked;
        try { await api(a.id ? 'PUT' : 'POST', a.id ? `/api/addresses/${a.id}` : '/api/addresses', d); closeOverlay(); toast(t('saved')); M.route(true); } catch (er) { showErr($('#af-err', md), er); busy(b, false); } };
    };
    $('#add').onclick = () => form({});
    $$('[data-edit]').forEach(b => b.onclick = () => form(list.find(a => a.id === Number(b.dataset.edit))));
    $$('[data-def]').forEach(b => b.onclick = async () => { try { await api('POST', `/api/addresses/${b.dataset.def}/default`); M.route(true); } catch (e) { toast(errMsg(e), 'err'); } });
    $$('[data-del]').forEach(b => b.onclick = async () => { if (!(await confirmBox(t('confirm_delete'), { danger: true, okText: t('delete') }))) return; try { await api('DELETE', `/api/addresses/${b.dataset.del}`); M.route(true); } catch (e) { toast(errMsg(e), 'err'); } });
  }, { auth: true });

  on(/^\/account\/favorites$/, async ({ alive }) => {
    M.setTitle(t('favorites'));
    const list = await api('GET', '/api/favorites'); if (!alive()) return;
    view(acct('/account/favorites', list.length ? M.grid(list) : `<div class="empty glass"><div class="em-ic">${icon('heart', 'lg')}</div><h3>${t('no_favorites')}</h3><a class="btn btn-accent mt" href="/">${t('shop_now')}</a></div>`, t('favorites')));
  }, { auth: true });

  on(/^\/account\/notifications$/, async ({ alive }) => {
    M.setTitle(t('notifications'));
    const list = await api('GET', '/api/notifications'); if (!alive()) return;
    view(acct('/account/notifications', `<div class="row between mb"><span></span>${list.some(n => !n.read_at) ? `<button class="btn btn-ghost btn-sm" id="all">${icon('check', 'sm')} ${t('mark_all_read')}</button>` : ''}</div>
      <div class="glass panel stack" style="gap:6px">${list.length ? list.map(M.notifItem).join('') : `<div class="empty"><div class="em-ic">${icon('bell', 'lg')}</div><p class="muted">${t('no_notifications')}</p></div>`}</div>`, t('notifications')));
    const a = $('#all'); if (a) a.onclick = async () => { await api('POST', '/api/notifications/read', { all: true }); S.user.unread = 0; M.updateBadges(); M.route(true); };
  }, { auth: true });

  on(/^\/account\/profile$/, async () => {
    M.setTitle(t('profile'));
    const u = S.user;
    view(acct('/account/profile', `<div class="grid-2" style="align-items:start"><form id="pf" class="glass panel stack"><h3 style="margin:0">${t('profile')}</h3>
        ${field('name', t('full_name'), 'required minlength="2" maxlength="80"', u.name)}${field('phone', t('phone'), 'required dir="ltr" inputmode="tel"', u.phone || '')}
        <label class="field"><span>${t('email')} ${u.verified ? `<span class="status s-green">${t('verified')}</span>` : `<a class="link small" href="/account/verify">${t('verify')}</a>`}</span><input class="input" value="${esc(u.email)}" disabled dir="ltr"></label>
        <div class="grid-2"><label class="field"><span>${t('language')}</span><select class="input" name="lang"><option value="ar" ${S.lang === 'ar' ? 'selected' : ''}>العربية</option><option value="en" ${S.lang === 'en' ? 'selected' : ''}>English</option></select></label>
          <label class="field"><span>${t('currency')}</span><select class="input" name="currency"><option value="DZD" ${S.currency === 'DZD' ? 'selected' : ''}>DZD</option><option value="USD" ${S.currency === 'USD' ? 'selected' : ''}>USD</option></select></label></div>
        <div id="pf-err"></div><button class="btn btn-accent">${t('save')}</button></form>
      <form id="pw" class="glass panel stack"><h3 style="margin:0">${t('change_password')}</h3>
        <label class="field"><span>${t('current_password')}</span><input class="input" type="password" name="current" required autocomplete="current-password" dir="ltr"></label>
        <label class="field"><span>${t('new_password')}</span><input class="input" type="password" name="password" required minlength="8" autocomplete="new-password" dir="ltr"><span class="hint">${t('password_hint')}</span></label>
        <div id="pw-err"></div><button class="btn">${t('change_password')}</button></form></div>`, t('profile')));
    $('#pf').onsubmit = async e => { e.preventDefault(); const b = $('#pf button'); busy(b, true); const d = M.formData(e.target);
      try { await api('PUT', '/api/me', d); await M.refreshMe(); toast(t('saved')); busy(b, false);
        if (d.currency !== S.currency) { S.currency = d.currency; localStorage.setItem('mdz_cur', d.currency); }
        if (d.lang !== S.lang) M.setLang(d.lang); else { M.renderChrome(); M.route(true); } }
      catch (er) { showErr($('#pf-err'), er); busy(b, false); } };
    $('#pw').onsubmit = async e => { e.preventDefault(); const b = $('#pw button'); busy(b, true);
      try { await api('PUT', '/api/me/password', M.formData(e.target)); toast(t('password_changed')); e.target.reset(); } catch (er) { showErr($('#pw-err'), er); } finally { busy(b, false); } };
  }, { auth: true, noSkeleton: true });

  // ---------- support ----------
  const TT = ['order', 'payment', 'wallet', 'delivery', 'refund', 'account', 'product', 'other'];
  on(/^\/support$/, async ({ alive }) => {
    M.setTitle(t('support'));
    if (!S.user) {
      return view(`<div class="container"><div class="empty glass mt-lg"><div class="em-ic">${icon('headset', 'lg')}</div><h3>${t('support')}</h3><p class="muted">${t('err_auth_required')}</p><div class="row" style="justify-content:center"><a class="btn btn-accent" href="/login?next=/support">${t('login')}</a><a class="btn btn-ghost" href="/faq">${t('faq')}</a></div></div></div>`);
    }
    const list = await api('GET', '/api/tickets'); if (!alive()) return;
    view(acct('/support', `<div class="row between mb"><a class="link small" href="/faq">${icon('info', 'sm')} ${t('faq')}</a><a class="btn btn-accent btn-sm" href="/support/new">${icon('plus', 'sm')} ${t('new_ticket')}</a></div>
      ${list.length ? `<div class="table-wrap card"><table class="tbl"><thead><tr><th>${t('reference')}</th><th>${t('subject')}</th><th>${t('ticket_type')}</th><th>${t('status')}</th><th>${t('last_update')}</th></tr></thead><tbody>
        ${list.map(x => `<tr class="click" data-href="/support/${esc(x.ref)}"><td class="num small"><a href="/support/${esc(x.ref)}">${esc(x.ref)}</a></td><td><b>${esc(x.subject)}</b>${x.order_number ? `<div class="tiny muted num">${esc(x.order_number)}</div>` : ''}</td><td class="small">${t('tt_' + x.type)}</td><td>${M.tkStatus(x.status)}</td><td class="small">${M.fmtDate(x.updated_at)}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty glass"><div class="em-ic">${icon('headset', 'lg')}</div><h3>${t('no_tickets')}</h3></div>`}`, t('support')));
  });
  on(/^\/support\/new$/, async ({ q, alive }) => {
    M.setTitle(t('new_ticket'));
    const orders = await api('GET', '/api/orders'); if (!alive()) return;
    const pre = q.get('order') || '';
    view(acct('/support', `<a class="link small" href="/support">${icon('arrow', 'sm')} ${t('support')}</a><h2 class="title mt">${t('new_ticket')}</h2>
      <form id="tf" class="glass panel stack"><div class="grid-2"><label class="field"><span>${t('ticket_type')}</span><select class="input" name="type" required>${TT.map(x => `<option value="${x}" ${(q.get('type') || (pre ? 'order' : '')) === x ? 'selected' : ''}>${t('tt_' + x)}</option>`).join('')}</select></label>
        <label class="field"><span>${t('related_order')} <span class="muted">(${t('optional')})</span></span><select class="input" name="order_number"><option value="">—</option>${orders.map(o => `<option value="${esc(o.number)}" ${o.number === pre ? 'selected' : ''}>${esc(o.number)} — ${M.moneyTxt(o.total, 'DZD')}</option>`).join('')}</select></label></div>
        ${field('subject', t('subject'), 'required minlength="3" maxlength="120"')}<label class="field"><span>${t('message')}</span><textarea class="input" name="body" required minlength="5" maxlength="4000"></textarea></label>
        ${fileDrop('file', false, t('attach'))}<div id="err"></div><button class="btn btn-accent btn-lg">${icon('send', 'sm')} ${t('submit')}</button></form>`));
    bindFileDrop($('#tf'));
    $('#tf').onsubmit = async e => { e.preventDefault(); const b = $('#tf > button'); busy(b, true);
      try { const r = await api('POST', '/api/tickets', new FormData(e.target)); toast(t('ticket_sent')); go('/support/' + encodeURIComponent(r.ref), { replace: true }); } catch (er) { showErr($('#err'), er); busy(b, false); } };
  }, { auth: true });
  on(/^\/support\/([^/]+)$/, async ({ m, alive }) => {
    const tk = await api('GET', '/api/tickets/' + encodeURIComponent(decodeURIComponent(m[1]))); if (!alive()) return;
    M.setTitle(tk.subject);
    view(acct('/support', `<a class="link small" href="/support">${icon('arrow', 'sm')} ${t('support')}</a>
      <div class="glass panel mt mb"><div class="row between wrap"><div><h2 style="margin:0 0 4px;font-size:20px">${esc(tk.subject)}</h2><div class="small muted"><span class="num">${esc(tk.ref)}</span> • ${t('tt_' + tk.type)}${tk.order_number ? ` • <a class="link num" href="/account/orders/${esc(tk.order_number)}">${esc(tk.order_number)}</a>` : ''}</div></div>
        <div class="row">${M.tkStatus(tk.status)}${tk.status !== 'closed' ? `<button class="btn btn-ghost btn-sm" id="close">${t('close_ticket')}</button>` : ''}</div></div></div>
      <div class="thread">${tk.messages.map(x => `<div class="bubble ${x.is_staff ? '' : 'me'}"><div class="tiny" style="opacity:.75;margin-bottom:4px;font-weight:800">${x.is_staff ? t('support_team') : t('you')}</div>${esc(x.body)}${x.file_id ? `<div class="mt"><a href="/api/files/${x.file_id}" target="_blank" rel="noopener" class="row small" style="text-decoration:underline">${icon('clip', 'sm')} ${t('attachment')}</a></div>` : ''}<div class="meta">${M.fmtDate(x.created_at)}</div></div>`).join('')}</div>
      ${tk.status === 'closed' ? `<div class="msg msg-info mt">${t('ticket_closed_note')}</div>` : `<form id="rf" class="glass panel stack mt"><textarea class="input" name="body" required maxlength="4000" placeholder="${esc(t('reply_ph'))}" aria-label="${t('reply')}"></textarea>${fileDrop('file', false, t('attach'))}<div id="err"></div><button class="btn btn-accent">${icon('send', 'sm')} ${t('reply')}</button></form>`}`));
    const c = $('#close'); if (c) c.onclick = async () => { if (!(await confirmBox(t('close_ticket') + '?'))) return; try { await api('POST', `/api/tickets/${encodeURIComponent(tk.ref)}/close`); M.route(true); } catch (e) { toast(errMsg(e), 'err'); } };
    const rf = $('#rf'); if (rf) { bindFileDrop(rf); rf.onsubmit = async e => { e.preventDefault(); const b = $('#rf > button'); busy(b, true);
      try { await api('POST', `/api/tickets/${encodeURIComponent(tk.ref)}/messages`, new FormData(e.target)); M.route(true); } catch (er) { showErr($('#err'), er); busy(b, false); } }; }
  }, { auth: true });

  // ---------- content ----------
  on(/^\/faq$/, async ({ alive }) => {
    M.setTitle(t('faq'));
    const list = await api('GET', '/api/faqs'); if (!alive()) return;
    const groups = [...new Set(list.map(f => f.grp))];
    view(`<div class="container" style="max-width:900px"><div class="page-head"><h1>${t('faq')}</h1></div>
      ${groups.map(g => `<h3 class="mt-lg">${esc(t('faq_' + g) === 'faq_' + g ? g : t('faq_' + g))}</h3>${list.filter(f => f.grp === g).map(f => `<details class="faq-item glass"><summary>${esc(L(f, 'q'))}${icon('down', 'sm')}</summary><p>${esc(L(f, 'a'))}</p></details>`).join('')}`).join('')}
      <div class="about-strip glass mt-lg" style="grid-template-columns:auto 1fr auto"><span class="icon-btn" style="background:var(--soft)">${icon('headset')}</span><div><h3>${t('support')}</h3><p class="muted">${t('why_support_d')}</p></div><a class="btn" href="/support/new">${t('open_ticket')}</a></div></div>`);
  });
  // tiny, safe formatter for admin-written pages: text is escaped first; supports "## " headings, "- " lists and paragraphs
  function miniMd(src) {
    return String(src || '').replace(/\r/g, '').split(/\n{2,}/).map(block => {
      const lines = block.split('\n');
      if (lines.every(l => /^\s*-\s+/.test(l))) return `<ul>${lines.map(l => `<li>${esc(l.replace(/^\s*-\s+/, ''))}</li>`).join('')}</ul>`;
      if (/^#{2,3}\s+/.test(lines[0])) return `<h3>${esc(lines[0].replace(/^#+\s+/, ''))}</h3>${lines.length > 1 ? `<p>${lines.slice(1).map(esc).join('<br>')}</p>` : ''}`;
      return `<p>${lines.map(esc).join('<br>')}</p>`;
    }).join('');
  }
  on(/^\/page\/([^/]+)$/, async ({ m, alive }) => {
    const p = await api('GET', '/api/pages/' + encodeURIComponent(m[1])); if (!alive()) return;
    M.setTitle(L(p, 'title'));
    view(`<div class="container"><div class="page-head"><nav class="crumbs"><a href="/">${t('home')}</a></nav><h1>${esc(L(p, 'title'))}</h1></div><div class="glass panel" style="border-radius:var(--r-xl);margin-bottom:30px"><div class="prose">${miniMd(L(p, 'body'))}</div></div></div>`);
  });
})();
