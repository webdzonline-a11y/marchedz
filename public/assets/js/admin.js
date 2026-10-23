/* Marché DZ — admin SPA (part 1): shell, router, dashboard, orders, catalog, customers.
   Every action goes through /api/admin/* — the server re-validates permissions, amounts and state transitions. */
(function () {
  'use strict';
  const M = window.MDZ;
  const { $, $$, esc, t, L, state: S, api, errMsg, money, fmtDate, icon, toast, modal, closeOverlay, confirmBox, busy, formData, debounce, orderStatus, payStatus, reqStatus, tkStatus, minorStr, logo } = M;
  S.currency = 'DZD'; // the back-office always works in the base currency

  const A = { me: null, pending: {}, carriers: null, catsFlat: null };
  const routes = [];
  const on = (re, fn, perm) => routes.push({ re, fn, perm });
  const can = p => !!A.me && A.me.perms.includes(p);
  const isAdmin = () => A.me && A.me.role === 'admin';
  const go = (p, replace) => { history[replace ? 'replaceState' : 'pushState']({}, '', p); route(); };

  // ---------- small helpers ----------
  const qs = o => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== '' && v != null && v !== false) u.set(k, v); const s = u.toString(); return s ? '?' + s : ''; };
  const curQ = () => Object.fromEntries(new URLSearchParams(location.search));
  const setQ = patch => { const q = { ...curQ(), ...patch }; if (!('page' in patch)) delete q.page; go(location.pathname + qs(q), true); };
  const majorStr = m => m == null ? '' : minorStr(m);
  const toLocalInput = s => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + 'Z'); if (isNaN(d)) return ''; return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const fromLocalInput = v => v ? new Date(v).toISOString() : '';
  const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(sel) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  const sw = (name, checked, label) => `<label class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  const empty = (txt = t('a_no_data')) => `<div class="empty"><div class="em-ic">${icon('list')}</div><p class="muted">${esc(txt)}</p></div>`;
  const pager = (total, page, lim) => {
    const pages = Math.max(1, Math.ceil(total / lim));
    return `<div class="pager"><span>${t('a_total_n', { n: total })}</span>${pages > 1 ? `<button class="btn btn-ghost btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${icon(S.lang === 'ar' ? 'right' : 'left')}</button>
      <span class="num">${page} / ${pages}</span><button class="btn btn-ghost btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>${icon(S.lang === 'ar' ? 'left' : 'right')}</button>` : ''}</div>`;
  };
  const bindPager = root => $$('[data-page]', root).forEach(b => b.addEventListener('click', () => setQ({ page: b.dataset.page })));
  const fileUrl = id => `/api/files/${id}`;
  const fileBlock = id => id ? `<a href="${fileUrl(id)}" target="_blank" rel="noopener" class="stack" style="gap:6px"><img class="receipt-prev" src="${fileUrl(id)}" alt="" data-fallback><span class="small bold" style="color:var(--accent-ink)">${icon('clip')} ${t('a_open_file')}</span></a>` : `<span class="muted">—</span>`;
  const bindFallback = root => $$('img[data-fallback]', root).forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
  const roleName = r => t('role_' + r);
  const yesNo = v => v ? `<span class="status s-green">${t('yes')}</span>` : `<span class="status">${t('no')}</span>`;
  const catName = id => { const c = (A.catsFlat || []).find(x => x.id === id); return c ? L(c, 'name') : '—'; };
  async function catsFlat(force) { if (!A.catsFlat || force) A.catsFlat = await api('GET', '/api/admin/categories/flat'); return A.catsFlat; }
  function catOptions(sel, { allowEmpty, emptyLabel } = {}) {
    const list = A.catsFlat || []; const kids = new Map();
    list.forEach(c => { const k = c.parent_id || 0; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(c); });
    const out = allowEmpty ? [opt('', emptyLabel || t('all'), sel)] : [];
    const walk = (pid, d) => (kids.get(pid) || []).forEach(c => { out.push(opt(c.id, '— '.repeat(d) + L(c, 'name'), sel)); walk(c.id, d + 1); });
    walk(0, 0); return out.join('');
  }
  async function carriers(force) { if (!A.carriers || force) A.carriers = await api('GET', '/api/admin/carriers'); return A.carriers; }
  async function act(btn, fn, okMsg) {
    busy(btn, true);
    try { const r = await fn(); if (okMsg !== false) toast(okMsg || t('saved')); return r; }
    catch (e) { toast(errMsg(e), 'err'); throw e; }
    finally { busy(btn, false); }
  }
  const silent = p => p.catch(() => {});
  // prompt with optional amount field (used by money-moving review actions)
  function promptForm(title, fields, { okText, danger, note } = {}) {
    return new Promise(res => {
      const m = modal(`<h3>${esc(title)}</h3>${note ? `<div class="msg msg-info mt">${icon('info')}<span>${note}</span></div>` : ''}<form id="pf" class="stack mt">
        ${fields.map(f => `<label class="field"><span>${esc(f.label)}${f.required ? '' : ` <small class="muted">(${t('optional')})</small>`}</span>${f.type === 'textarea'
          ? `<textarea class="input" name="${f.name}" ${f.required ? 'required' : ''}>${esc(f.value || '')}</textarea>`
          : `<input class="input" name="${f.name}" type="${f.type || 'text'}" ${f.inputmode ? `inputmode="${f.inputmode}"` : ''} value="${esc(f.value ?? '')}" ${f.required ? 'required' : ''}>`}${f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ''}</label>`).join('')}
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>${t('cancel')}</button><button class="btn ${danger ? 'btn-danger' : 'btn-accent'}">${esc(okText || t('confirm'))}</button></div></form>`);
      let done = false;
      m.querySelector('[data-close]').addEventListener('click', () => { if (!done) { done = true; res(null); } });
      $('#overlay .backdrop').addEventListener('click', () => { if (!done) { done = true; res(null); } });
      m.querySelector('#pf').addEventListener('submit', e => { e.preventDefault(); done = true; const v = formData(e.target); closeOverlay(); res(v); });
    });
  }

  // ---------- shell ----------
  const NAV = [
    [null, [['/admin', 'dashboard', 'chart', 'a_dashboard']]],
    ['a_g_sales', [['/admin/orders', 'orders', 'package', 'a_orders'], ['/admin/customers', 'customers', 'users', 'a_customers']]],
    ['a_g_catalog', [['/admin/products', 'products', 'box', 'a_products'], ['/admin/categories', 'categories', 'layers', 'a_categories'], ['/admin/reviews', 'products', 'star', 'a_reviews']]],
    ['a_g_finance', [['/admin/finance/topups', 'finance', 'wallet', 'a_topups', 'topups'], ['/admin/finance/withdrawals', 'finance', 'download', 'a_withdrawals', 'withdrawals'],
      ['/admin/finance/refunds', 'finance', 'refresh', 'a_refunds', 'refunds'], ['/admin/finance/transactions', 'finance', 'receipt', 'a_transactions']]],
    ['a_g_ops', [['/admin/coupons', 'coupons', 'percent', 'a_coupons'], ['/admin/shipping', 'shipping', 'truck', 'a_shipping'], ['/admin/support', 'support', 'headset', 'a_tickets', 'tickets']]],
    ['a_g_system', [['/admin/content', 'settings', 'list', 'a_content'], ['/admin/settings', 'settings', 'settings', 'a_settings'], ['/admin/staff', 'staff', 'users', 'a_staff'],
      ['/admin/audit', 'audit', 'history', 'a_audit'], ['/admin/backups', 'settings', 'database', 'a_backups']]],
  ];
  function shell() {
    $('#app').innerHTML = `<div class="adm" id="adm"><div class="adm-scrim" id="scrim"></div>
      <aside class="adm-side" aria-label="${t('a_menu')}"><div class="brand"><a href="/admin" class="logo">${logo(false)}</a><span class="tag">ADMIN</span></div>
        ${NAV.map(([g, items]) => { const vis = items.filter(i => can(i[1])); if (!vis.length) return '';
          return `${g ? `<div class="grp">${t(g)}</div>` : ''}${vis.map(i => `<a class="nav" href="${i[0]}" data-nav="${i[0]}">${icon(i[2])}<span>${t(i[3])}</span>${i[4] ? `<span class="cnt" data-cnt="${i[4]}" hidden></span>` : ''}</a>`).join('')}`; }).join('')}
        <div style="flex:1"></div><a class="nav" href="/" target="_blank" rel="noopener">${icon('home')}<span>${t('a_view_store')}</span></a></aside>
      <div class="adm-main"><header class="adm-top"><button class="icon-btn adm-burger" id="burger" aria-label="${t('a_menu')}">${icon('menu')}</button><h1 id="ptitle"></h1><div class="sp"></div>
        <div class="pill-switch" role="group" aria-label="${t('language')}"><button data-lang="ar" class="${S.lang === 'ar' ? 'on' : ''}">ع</button><button data-lang="en" class="${S.lang === 'en' ? 'on' : ''}">EN</button></div>
        <button class="icon-btn" id="nbell" aria-label="${t('notifications')}">${icon('bell')}<span class="badge-dot" id="nbadge" hidden></span></button>
        <div class="row desk-only" style="gap:8px"><span class="avatar" style="width:34px;height:34px">${esc((A.me.name || '?').trim().charAt(0))}</span><div style="line-height:1.2"><b class="small">${esc(A.me.name)}</b><div class="tiny muted">${roleName(A.me.role)}</div></div></div>
        <button class="icon-btn" id="alogout" aria-label="${t('logout')}" title="${t('logout')}">${icon('logout')}</button></header>
        <div id="ndrop"></div><main class="adm-body" id="view" tabindex="-1"></main></div></div>`;
    $('#burger').addEventListener('click', () => $('#adm').classList.toggle('open'));
    $('#scrim').addEventListener('click', () => $('#adm').classList.remove('open'));
    $$('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
    $('#alogout').addEventListener('click', async () => { await silent(api('POST', '/api/auth/logout')); location.href = '/admin'; });
    $('#nbell').addEventListener('click', toggleNotifs);
    refreshPending();
  }
  function setLang(l) {
    if (l === S.lang) return; S.lang = l;
    document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    document.cookie = `mdz_lang=${l}; path=/; max-age=31536000; samesite=lax`;
    shell(); route();
  }
  async function refreshPending() {
    try {
      const d = await api('GET', '/api/admin/dashboard?days=7'); A.pending = d.pending;
      for (const [k, n] of Object.entries(d.pending)) { const el = $(`[data-cnt="${k}"]`); if (el) { el.hidden = !n; el.textContent = n; } }
      const nr = await api('GET', '/api/admin/notifications'); const b = $('#nbadge'); if (b) { b.hidden = !nr.unread; b.textContent = nr.unread > 9 ? '9+' : nr.unread; }
    } catch { /* non-blocking */ }
  }
  async function toggleNotifs() {
    const d = $('#ndrop'); if (d.innerHTML) { d.innerHTML = ''; return; }
    const r = await api('GET', '/api/admin/notifications');
    d.innerHTML = `<div class="notif-drop"><div class="row between" style="padding:6px 10px"><b>${t('notifications')}</b></div>${r.items.length ? r.items.map(n => `<a href="${esc(n.link || '/admin')}" class="${n.read_at ? '' : 'unread'}"><b>${esc(L(n, 'title'))}</b><div class="small muted">${esc(L(n, 'body') || '')}</div><div class="tiny muted">${fmtDate(n.created_at)}</div></a>`).join('') : `<p class="muted center small">${t('no_notifications')}</p>`}</div>`;
    if (r.unread) { await silent(api('POST', '/api/admin/notifications/read', { all: true })); const b = $('#nbadge'); if (b) b.hidden = true; }
  }
  document.addEventListener('click', e => {
    const d = $('#ndrop'); if (d && d.innerHTML && !e.target.closest('#ndrop') && !e.target.closest('#nbell')) d.innerHTML = '';
    const a = e.target.closest('a[href^="/admin"]');
    if (a && !a.target && !a.hasAttribute('download') && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) { e.preventDefault(); go(a.getAttribute('href')); }
    const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a,button,input,select,label')) go(tr.dataset.href);
  });
  window.addEventListener('popstate', () => route());

  // ---------- router ----------
  let seq = 0;
  function view(html) { const v = $('#view'); v.innerHTML = html; bindFallback(v); return v; }
  function title(s) { $('#ptitle').textContent = s; document.title = `${s} — Marché DZ Admin`; }
  async function route() {
    if (!A.me) return;
    const path = location.pathname.replace(/\/+$/, '') || '/admin';
    const my = ++seq; const alive = () => my === seq;
    $('#adm')?.classList.remove('open'); if ($('#ndrop')) $('#ndrop').innerHTML = '';
    $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === '/admin' ? path === '/admin' : path === a.dataset.nav || path.startsWith(a.dataset.nav + '/')));
    for (const r of routes) {
      const m = path.match(r.re); if (!m) continue;
      if (r.perm && !can(r.perm)) { title(t('a_forbidden')); view(`<div class="card panel">${empty(t('err_forbidden'))}</div>`); return; }
      view(`<div class="card panel center muted" style="padding:60px">${t('loading')}</div>`);
      try { await r.fn({ m, q: curQ(), alive }); } catch (e) {
        if (!alive()) return; if (e && e.status === 401) return boot();
        view(`<div class="card panel"><div class="msg msg-err">${icon('alert')}<span>${esc(errMsg(e))}</span></div></div>`);
      }
      if (alive()) { $('#view').focus({ preventScroll: true }); window.scrollTo(0, 0); }
      if (my % 4 === 0) refreshPending();
      return;
    }
    title(t('not_found')); view(`<div class="card panel">${empty(t('not_found_d'))}</div>`);
  }

  // ---------- login ----------
  function loginView(msg) {
    $('#app').innerHTML = `<div class="adm-login"><div class="card glass"><div class="center"><a class="logo" href="/" style="justify-content:center;display:inline-flex">${logo(true)}</a>
      <h1 style="font-size:22px;margin:16px 0 4px">${t('a_login_title')}</h1><p class="muted small">${t('a_login_sub')}</p></div>
      ${msg ? `<div class="msg msg-err mt">${icon('alert')}<span>${esc(msg)}</span></div>` : ''}
      <form id="alf" class="stack mt"><label class="field"><span>${t('email')}</span><input class="input" name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span>${t('password')}</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn btn-block btn-lg">${icon('lock')} ${t('login')}</button></form>
      <div class="row mt" style="justify-content:center"><div class="pill-switch"><button data-lang="ar" class="${S.lang === 'ar' ? 'on' : ''}">ع</button><button data-lang="en" class="${S.lang === 'en' ? 'on' : ''}">EN</button></div></div></div></div>`;
    $$('[data-lang]').forEach(b => b.addEventListener('click', () => { S.lang = b.dataset.lang; document.documentElement.lang = S.lang; document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr'; document.cookie = `mdz_lang=${S.lang}; path=/; max-age=31536000; samesite=lax`; loginView(); }));
    $('#alf').addEventListener('submit', async e => {
      e.preventDefault(); const btn = e.target.querySelector('button');
      busy(btn, true);
      try { await api('POST', '/api/auth/login', formData(e.target)); await boot(); }
      catch (er) { busy(btn, false); loginView(errMsg(er)); }
    });
  }
  async function boot() {
    try { const bs = await api('GET', '/api/bootstrap'); S.settings = bs.settings || {}; } catch { /* rate falls back to default */ }
    try { A.me = await api('GET', '/api/admin/me'); }
    catch (e) {
      A.me = null;
      if (e.status === 403) { await silent(api('POST', '/api/auth/logout')); return loginView(t('a_not_staff')); }
      return loginView();
    }
    shell(); route();
  }

  // =====================================================================
  // DASHBOARD
  // =====================================================================
  function barChart(rows, days) {
    if (days <= 90) { // fill gaps so each bar is one calendar day
      const map = new Map(rows.map(r => [r.d, r])); const out = []; const now = new Date();
      for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)).toISOString().slice(0, 10); out.push(map.get(d) || { d, n: 0, s: 0 }); }
      rows = out;
    }
    if (!rows.some(r => r.s)) return empty();
    const W = 700, H = 220, pad = 28; const max = Math.max(...rows.map(r => r.s || 0), 1); const bw = (W - pad * 2) / rows.length;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('a_sales')}" style="direction:ltr">${rows.map((r, i) => {
      const h = Math.max(2, ((r.s || 0) / max) * (H - pad * 2)); const x = pad + i * bw + bw * .15;
      return `<rect class="cbar" x="${x.toFixed(1)}" y="${(H - pad - h).toFixed(1)}" width="${(bw * .7).toFixed(1)}" height="${h.toFixed(1)}" rx="4"><title>${r.d}: ${M.moneyTxt(r.s || 0)} (${r.n})</title></rect>
        ${(i % Math.ceil(rows.length / 10) === 0) ? `<text x="${(x + bw * .35).toFixed(1)}" y="${H - 8}" text-anchor="middle">${r.d.slice(5)}</text>` : ''}`; }).join('')}
      <line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="rgba(0,0,0,.12)"/></svg>`;
  }
  on(/^\/admin$/, async ({ q, alive }) => {
    const days = q.days || 30;
    const d = await api('GET', '/api/admin/dashboard?days=' + days); if (!alive()) return;
    title(t('a_dashboard'));
    const k = (label, v, ic, href, cls = '') => `<${href ? `a href="${href}"` : 'div'} class="kpi ${cls}"><span class="k">${icon(ic)} ${label}</span><span class="v">${v}</span></${href ? 'a' : 'div'}>`;
    const f = d.finance;
    view(`<div class="row between wrap mb"><div><h2 style="margin:0">${t('hello')}${S.lang === 'ar' ? '' : ','} ${esc(A.me.name)} 👋</h2><p class="muted small" style="margin:4px 0 0">${t('a_dash_sub')}</p></div>
      <div class="seg" id="days">${[7, 30, 90, 365].map(n => `<button data-d="${n}" class="${Number(days) === n ? 'on' : ''}">${t('a_days_n', { n })}</button>`).join('')}</div></div>
      <div class="kpis">${k(t('a_new_orders'), d.orders.new, 'clock', '/admin/orders?status=pending', d.orders.new ? 'warn' : '')}${k(t('a_processing'), d.orders.processing, 'package', '/admin/orders?status=confirmed')}
        ${k(t('st_shipping'), d.orders.shipping, 'truck', '/admin/orders?status=shipping')}${k(t('st_delivered'), d.orders.delivered, 'check-circle', '/admin/orders?status=delivered', 'ok')}
        ${k(t('st_cancelled'), d.orders.cancelled, 'x', '/admin/orders?status=cancelled')}${k(t('a_returns'), d.orders.returned, 'refresh', '/admin/orders?status=returned')}</div>
      <h3 class="mt-lg">${t('a_pending_work')}</h3>
      <div class="kpis">${can('finance') ? k(t('a_topups'), d.pending.topups, 'wallet', '/admin/finance/topups', d.pending.topups ? 'warn' : '') + k(t('a_withdrawals'), d.pending.withdrawals, 'download', '/admin/finance/withdrawals', d.pending.withdrawals ? 'warn' : '') + k(t('a_refunds'), d.pending.refunds, 'refresh', '/admin/finance/refunds', d.pending.refunds ? 'warn' : '') : ''}
        ${can('support') ? k(t('a_tickets'), d.pending.tickets, 'headset', '/admin/support', d.pending.tickets ? 'warn' : '') : ''}${k(t('a_low_stock'), d.low_stock.length, 'alert', can('products') ? '/admin/products?low=1' : null, d.low_stock.length ? 'warn' : '')}</div>
      ${f ? `<h3 class="mt-lg">${t('a_finance_period', { n: d.days })}</h3><div class="kpis">${k(t('a_gross_orders'), money(f.gross_orders), 'chart')}${k(t('a_cod_collected'), money(f.collected_cod), 'receipt')}${k(t('a_wallet_sales'), money(f.wallet_sales), 'wallet')}
        ${k(t('a_topups_credited'), money(f.topups), 'plus')}${k(t('a_payouts'), money(f.payouts), 'download')}${k(t('a_refunds_paid'), money(f.refunds), 'refresh')}${k(t('a_wallet_liability'), money(f.wallet_liability), 'shield')}${k(t('a_wallet_held'), money(f.wallet_held), 'lock')}</div>
        <p class="hint mt">${t('a_finance_note')}</p>` : ''}
      <div class="adm-grid"><div class="card panel"><h2>${t('a_sales')} <small class="muted">(${t('a_days_n', { n: d.days })})</small></h2>${barChart(d.sales, d.days)}</div>
        <div class="card panel"><h2>${t('a_top_products')}</h2>${d.top.length ? `<div class="stack" style="gap:8px">${d.top.map(p => `<div class="row"><img src="${esc(p.image || '')}" alt="" style="width:40px;height:40px;object-fit:contain;border-radius:10px;border:1px solid var(--line);background:#fff" data-fallback><div class="grow"><div class="small bold" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(L(p, 'name'))}</div><div class="tiny muted">${t('a_sold_n', { n: p.qty })}</div></div><b class="small nowrap">${money(p.revenue)}</b></div>`).join('')}</div>` : empty()}</div></div>
      <div class="card panel mt"><h2>${t('a_low_stock')}</h2>${d.low_stock.length ? `<div class="table-wrap"><table class="tbl compact"><thead><tr><th>${t('a_product')}</th><th>${t('a_variant')}</th><th>${t('a_stock')}</th></tr></thead><tbody>
        ${d.low_stock.map(v => `<tr ${can('products') ? `class="click" data-href="/admin/products/${v.product_id}"` : ''}><td>${esc(L(v, 'name'))}</td><td>${esc([M.colorName(v.color), v.size].filter(Boolean).join(' / ') || '—')}</td><td><b style="color:${v.stock ? 'var(--warn)' : 'var(--danger)'}">${v.stock}</b></td></tr>`).join('')}</tbody></table></div>` : empty(t('a_stock_ok'))}</div>`);
    $$('#days button').forEach(b => b.addEventListener('click', () => setQ({ days: b.dataset.d })));
  }, 'dashboard');

  // =====================================================================
  // ORDERS
  // =====================================================================
  const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'ready', 'shipment_created', 'shipping', 'delivered', 'cancelled', 'returned', 'refund_pending', 'refunded'];
  on(/^\/admin\/orders$/, async ({ q, alive }) => {
    const page = Number(q.page) || 1; const lim = 30;
    const r = await api('GET', '/api/admin/orders' + qs({ ...q, page, limit: lim })); if (!alive()) return;
    title(t('a_orders'));
    view(`<div class="card panel"><form class="toolbar-a" id="of">
        <input class="input grow" name="q" value="${esc(q.q || '')}" placeholder="${t('a_search_orders')}" type="search">
        <select class="input" name="status">${opt('', t('a_all_statuses'), q.status)}${ORDER_STATUSES.map(s => opt(s, t('st_' + s), q.status)).join('')}</select>
        <select class="input" name="payment">${opt('', t('a_all_methods'), q.payment)}${opt('wallet', t('pay_wallet'), q.payment)}${opt('cod', t('pay_cod'), q.payment)}</select>
        <select class="input" name="pstatus">${opt('', t('a_all_payment'), q.pstatus)}${['unpaid', 'paid', 'partially_refunded', 'refunded'].map(s => opt(s, t('ps_' + s), q.pstatus)).join('')}</select>
        <label class="row small muted" style="gap:6px">${t('a_from')}<input class="input" type="date" name="from" value="${esc(q.from || '')}"></label>
        <label class="row small muted" style="gap:6px">${t('a_to')}<input class="input" type="date" name="to" value="${esc(q.to || '')}"></label>
        <button class="btn btn-sm">${icon('filter')} ${t('apply')}</button></form>
      ${r.items.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${t('order_number')}</th><th>${t('date')}</th><th>${t('a_customer')}</th><th>${t('wilaya')}</th><th>${t('payment_method')}</th><th>${t('payment_status')}</th><th>${t('status')}</th><th class="r">${t('total')}</th></tr></thead><tbody>
        ${r.items.map(o => `<tr class="click" data-href="/admin/orders/${o.id}"><td class="num bold nowrap">${esc(o.number)}</td><td class="small nowrap">${fmtDate(o.created_at)}</td><td><div class="small bold">${esc(o.customer)}</div><div class="tiny muted">${esc(o.email)}</div></td>
          <td class="small">${esc(o.ship_wilaya || '')}<div class="tiny muted">${t(o.delivery_method === 'office' ? 'office_delivery' : 'home_delivery')}${o.carrier ? ' • ' + esc(o.carrier) : ''}</div></td><td class="small">${t(o.payment_method === 'wallet' ? 'pay_wallet' : 'pay_cod')}</td>
          <td>${payStatus(o.payment_status)}</td><td>${orderStatus(o.status)}</td><td class="r bold nowrap">${money(o.total)}</td></tr>`).join('')}</tbody></table></div>${pager(r.total, page, lim)}` : empty(t('no_orders'))}</div>`);
    $('#of').addEventListener('submit', e => { e.preventDefault(); setQ(formData(e.target)); });
    bindPager($('#view'));
  }, 'orders');

  on(/^\/admin\/orders\/(\d+)$/, async ({ m, alive }) => {
    const [o, cs] = await Promise.all([api('GET', '/api/admin/orders/' + m[1]), carriers()]); if (!alive()) return;
    renderOrder(o, cs);
  }, 'orders');
  function renderOrder(o, cs) {
    title(`${t('order')} ${o.number}`);
    const nextBtns = o.next.filter(s => s !== 'shipment_created').map(s => `<button class="btn btn-sm ${s === 'cancelled' || s === 'returned' ? 'btn-ghost' : ''}" data-to="${s}" style="${s === 'cancelled' ? 'color:var(--danger)' : ''}">${icon(s === 'cancelled' ? 'x' : 'arrow')} ${t('st_' + s)}</button>`).join('');
    const canShip = !o.shipment && ['confirmed', 'processing', 'ready'].includes(o.status);
    const enabledCarriers = cs.filter(c => c.enabled);
    const sh = o.shipment;
    const trackUrl = sh && sh.tracking && cs.find(c => c.id === sh.carrier_id)?.tracking_url;
    view(`<div class="row between wrap mb"><a href="/admin/orders" class="small bold" style="color:var(--accent-ink)">${icon(S.lang === 'ar' ? 'right' : 'left')} ${t('a_orders')}</a><div class="row wrap">${orderStatus(o.status)}${payStatus(o.payment_status)}</div></div>
      <div class="adm-grid" style="margin-top:0"><div class="stack gap-lg">
        <div class="card panel"><div class="sec-title"><h2>${t('a_actions')}</h2><span class="tiny muted">${t('a_flow_hint')}</span></div>
          <div class="row wrap">${nextBtns || `<span class="muted small">${t('a_no_transitions')}</span>`}
            ${o.payment_method === 'cod' && o.status === 'delivered' && o.payment_status === 'unpaid' ? `<button class="btn btn-sm btn-accent" id="collect">${icon('check')} ${t('a_mark_collected')}</button>` : ''}</div>
          ${o.payment_method === 'cod' && o.payment_status === 'unpaid' ? `<p class="hint mt">${t('a_cod_rule')}</p>` : ''}</div>
        <div class="card panel"><h2>${t('a_shipment')}</h2>
          ${sh ? `<dl class="kv"><dt>${t('carrier')}</dt><dd>${esc(o.carrier_name || '—')}</dd><dt>${t('tracking')}</dt><dd class="num">${trackUrl ? `<a href="${esc(trackUrl.replace('{tracking}', encodeURIComponent(sh.tracking)))}" target="_blank" rel="noopener" style="color:var(--accent-ink)">${esc(sh.tracking)}</a>` : esc(sh.tracking)}</dd>
              <dt>${t('a_source')}</dt><dd>${sh.source === 'api' ? 'API' : t('a_manual')}</dd><dt>${t('status')}</dt><dd>${esc(sh.status || '—')}</dd>${sh.last_sync_at ? `<dt>${t('a_last_sync')}</dt><dd>${fmtDate(sh.last_sync_at)}</dd>` : ''}
              ${sh.label_url ? `<dt>${t('a_label')}</dt><dd><a href="${esc(sh.label_url)}" target="_blank" rel="noopener" style="color:var(--accent-ink)">${t('a_open_file')}</a></dd>` : ''}</dl>
              <div class="row wrap mt"><button class="btn btn-sm btn-ghost" id="sh-edit">${icon('edit')} ${t('edit')}</button>${sh.source === 'api' ? `<button class="btn btn-sm btn-ghost" id="sh-sync">${icon('refresh')} ${t('a_sync')}</button>` : ''}</div>`
            : canShip ? `<form id="shf" class="stack"><div class="form-grid"><label class="field"><span>${t('carrier')}</span><select class="input" name="carrier_id">${enabledCarriers.map(c => opt(c.id, c.name + (c.connected ? ' • API ✓' : ''), o.carrier_id)).join('')}</select></label>
                <label class="field"><span>${t('a_mode')}</span><select class="input" name="mode">${opt('manual', t('a_manual'))}${opt('api', t('a_via_api'))}</select></label>
                <label class="field full" data-manual><span>${t('tracking')}</span><input class="input" name="tracking" minlength="3" placeholder="${t('a_tracking_ph')}"></label>
                <label class="field full" data-api hidden><span>${t('a_stopdesk')}</span><select class="input" name="stopdesk_id"><option value="">—</option></select><small class="hint">${t('a_stopdesk_hint')}</small></label></div>
                <div class="msg msg-info" data-api hidden>${icon('info')}<span>${t('a_api_ship_note')}</span></div>
                <button class="btn btn-accent">${icon('truck')} ${t('a_create_shipment')}</button></form>`
            : `<p class="muted small">${t('a_ship_not_ready')}</p>`}</div>
        <div class="card panel"><h2>${t('products')}</h2><div class="table-wrap"><table class="tbl compact"><tbody>${o.items.map(i => `<tr><td style="width:56px"><img class="thumb" src="${esc(i.image || '')}" alt="" data-fallback></td><td><div class="small bold">${esc(L(i, 'name'))}</div><div class="tiny muted">${esc([M.colorName(i.color), i.size].filter(Boolean).join(' / '))}</div></td>
            <td class="small nowrap">${money(i.unit_price)} × ${i.qty}${i.original_price > i.unit_price ? `<div class="tiny muted" style="text-decoration:line-through">${money(i.original_price)}</div>` : ''}</td><td class="r bold nowrap">${money(i.line_total)}</td></tr>`).join('')}</tbody></table></div>
          <div class="stack mt" style="gap:6px;max-width:380px;margin-inline-start:auto">
            <div class="sum-row"><span>${t('subtotal')}</span><b>${money(o.subtotal)}</b></div>${o.items_discount ? `<div class="sum-row"><span>${t('items_discount')}</span><b style="color:var(--sale)">−${money(o.items_discount)}</b></div>` : ''}
            ${o.coupon_discount ? `<div class="sum-row"><span>${t('coupon')} <span class="badge-soft num">${esc(o.coupon_code)}</span></span><b style="color:var(--sale)">−${money(o.coupon_discount)}</b></div>` : ''}
            <div class="sum-row"><span>${t('shipping')}</span><b>${o.shipping_fee ? money(o.shipping_fee) : t('free')}</b></div><div class="sum-row total"><span>${t('total')}</span><b>${money(o.total)}</b></div>
            <div class="sum-row"><span>${t('a_paid')}</span><b>${money(o.paid_amount)}</b></div>${o.refunded_amount ? `<div class="sum-row"><span>${t('a_refunded')}</span><b>${money(o.refunded_amount)}</b></div>` : ''}
            ${o.display_currency === 'USD' ? `<div class="hint">${t('a_usd_rate_frozen', { rate: M.fmtNum(o.fx_rate_micro / 1e6, 2) })}</div>` : ''}</div></div>
        <div class="card panel"><h2>${t('history')}</h2><div class="timeline">${o.history.map(h => `<div class="tl-item on"><span class="tl-dot"></span><div><b class="small">${h.from_status ? esc(t('st_' + h.from_status)) + ' → ' : ''}${esc(t('st_' + h.to_status))}</b>
            <div class="tiny muted">${fmtDate(h.created_at)} • ${esc(h.actor || t('a_actor_' + h.actor_type) || h.actor_type)}</div>${h.note ? `<div class="small">${esc(h.note)}</div>` : ''}</div></div>`).join('')}</div></div>
      </div><div class="stack gap-lg">
        <div class="card panel"><h2>${t('a_customer')}</h2><dl class="kv"><dt>${t('name')}</dt><dd>${can('customers') ? `<a href="/admin/customers/${o.user_id}" style="color:var(--accent-ink)">${esc(o.customer)}</a>` : esc(o.customer)}</dd><dt>${t('email')}</dt><dd>${esc(o.email)}</dd><dt>${t('phone')}</dt><dd class="num">${esc(o.customer_phone || '—')}</dd></dl></div>
        <div class="card panel"><h2>${t('ship_address')}</h2><dl class="kv"><dt>${t('full_name')}</dt><dd>${esc(o.ship_name)}</dd><dt>${t('phone')}</dt><dd class="num">${esc(o.ship_phone)}</dd><dt>${t('wilaya')}</dt><dd>${esc(o.ship_wilaya)}</dd><dt>${t('commune')}</dt><dd>${esc(o.ship_commune)}</dd>
          <dt>${t('address')}</dt><dd>${esc(o.ship_address)}</dd><dt>${t('delivery_method')}</dt><dd>${t(o.delivery_method === 'office' ? 'office_delivery' : 'home_delivery')}</dd>${o.ship_notes ? `<dt>${t('driver_notes')}</dt><dd>${esc(o.ship_notes)}</dd>` : ''}<dt>${t('a_weight')}</dt><dd class="num">${(o.weight_g / 1000).toFixed(2)} kg</dd></dl></div>
        <div class="card panel"><h2>${t('a_payment')}</h2><dl class="kv"><dt>${t('payment_method')}</dt><dd>${t(o.payment_method === 'wallet' ? 'pay_wallet' : 'pay_cod')}</dd><dt>${t('payment_status')}</dt><dd>${payStatus(o.payment_status)}</dd>${o.paid_at ? `<dt>${t('a_paid_at')}</dt><dd>${fmtDate(o.paid_at)}</dd>` : ''}</dl>
          ${o.payments.length ? `<div class="table-wrap mt"><table class="tbl compact"><tbody>${o.payments.map(p => `<tr><td class="small">${esc(p.kind === 'refund' ? t('a_refund') : t('a_charge'))} • ${esc(p.method)}</td><td class="tiny muted">${fmtDate(p.created_at)}${p.reference ? '<br>' + esc(p.reference) : ''}</td><td class="r bold">${money(p.amount)}</td></tr>`).join('')}</tbody></table></div>` : ''}
          ${can('finance') && o.refundable > 0 && !o.refunds.some(r => ['pending', 'needs_info'].includes(r.status)) ? `<button class="btn btn-sm btn-ghost mt" id="refund">${icon('refresh')} ${t('a_issue_refund')}</button><p class="hint">${t('a_refundable', { amount: M.moneyTxt(o.refundable) })}</p>` : ''}</div>
        ${o.refunds.length ? `<div class="card panel"><h2>${t('refunds')}</h2>${o.refunds.map(r => `<div class="row between small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="num">${esc(r.ref)}</span>${reqStatus(r.status)}<b>${money(r.approved_amount || r.requested_amount)}</b></div>`).join('')}${can('finance') ? `<a href="/admin/finance/refunds" class="small bold mt" style="display:inline-block;color:var(--accent-ink)">${t('a_review_refunds')}</a>` : ''}</div>` : ''}
        ${o.cancel_reason ? `<div class="card panel"><h2>${t('cancel_reason')}</h2><p class="small">${esc(o.cancel_reason)}</p></div>` : ''}
        <div class="card panel"><h2>${t('a_internal_notes')}</h2>${o.admin_notes ? `<pre class="small" style="white-space:pre-wrap;font-family:inherit;margin:0 0 10px">${esc(o.admin_notes)}</pre>` : ''}
          <form id="nf" class="stack"><textarea class="input" name="note" required placeholder="${t('a_note_ph')}" style="min-height:70px"></textarea><button class="btn btn-sm btn-ghost">${t('a_add_note')}</button></form></div>
      </div></div>`);
    const reload = async () => renderOrder(await api('GET', '/api/admin/orders/' + o.id), await carriers());
    $$('[data-to]').forEach(b => b.addEventListener('click', async () => {
      const to = b.dataset.to; let note = null;
      if (to === 'cancelled') { note = await confirmBox(t('a_cancel_order_q'), { input: true, inputLabel: t('cancel_reason'), required: true, danger: true, okText: t('st_cancelled') }); if (note == null) return; }
      else if (!(await confirmBox(t('a_move_to', { s: t('st_' + to) })))) return;
      const nr = await act(b, () => api('POST', `/api/admin/orders/${o.id}/status`, { to, note })).catch(() => null); if (nr) renderOrder(nr, await carriers());
    }));
    $('#collect')?.addEventListener('click', async e => {
      const v = await promptForm(t('a_mark_collected'), [{ name: 'reference', label: t('a_collect_ref') }], { note: t('a_collect_note', { amount: M.moneyTxt(o.total) }) }); if (!v) return;
      const nr = await act(e.target.closest('button'), () => api('POST', `/api/admin/orders/${o.id}/collect`, v)).catch(() => null); if (nr) renderOrder(nr, await carriers());
    });
    $('#refund')?.addEventListener('click', async e => {
      const v = await promptForm(t('a_issue_refund'), [{ name: 'amount', label: t('amount') + ' (DZD)', value: majorStr(o.refundable), inputmode: 'decimal', required: true, hint: t('a_refundable', { amount: M.moneyTxt(o.refundable) }) }, { name: 'note', label: t('note'), type: 'textarea', required: true }], { note: t('a_refund_wallet_note') }); if (!v) return;
      const nr = await act(e.target.closest('button'), () => api('POST', `/api/admin/orders/${o.id}/refund`, v)).catch(() => null); if (nr) renderOrder(nr, await carriers());
    });
    $('#nf').addEventListener('submit', async e => { e.preventDefault(); const nr = await act(e.target.querySelector('button'), () => api('POST', `/api/admin/orders/${o.id}/notes`, formData(e.target))).catch(() => null); if (nr) renderOrder(nr, await carriers()); });
    const shf = $('#shf');
    if (shf) {
      const sync = async () => {
        const c = cs.find(x => String(x.id) === shf.carrier_id.value); const apiOk = c && c.connected;
        shf.mode.querySelector('[value=api]').disabled = !apiOk; if (!apiOk) shf.mode.value = 'manual';
        const isApi = shf.mode.value === 'api';
        $$('[data-manual]', shf).forEach(x => { x.hidden = isApi; }); $$('[data-api]', shf).forEach(x => { x.hidden = !isApi || (x.tagName === 'LABEL' && o.delivery_method !== 'office'); });
        shf.tracking.required = !isApi;
        if (isApi && o.delivery_method === 'office') {
          try { const centers = await api('GET', `/api/admin/carriers/${c.id}/centers?wilaya_id=${o.wilaya_id}`); shf.stopdesk_id.innerHTML = `<option value="">—</option>` + centers.map(x => opt(x.id, x.name)).join(''); } catch { /* centers optional */ }
        }
      };
      shf.carrier_id.addEventListener('change', sync); shf.mode.addEventListener('change', sync); sync();
      shf.addEventListener('submit', async e => { e.preventDefault(); const nr = await act(e.submitter || shf.querySelector('button'), () => api('POST', `/api/admin/orders/${o.id}/shipment`, formData(shf))).catch(() => null); if (nr) renderOrder(nr, await carriers()); });
    }
    $('#sh-edit')?.addEventListener('click', async e => {
      const v = await promptForm(t('a_shipment'), [{ name: 'tracking', label: t('tracking'), value: sh.tracking, required: true }, { name: 'status_text', label: t('a_carrier_status'), value: sh.status || '' }]); if (!v) return;
      const nr = await act(e.target.closest('button'), () => api('PUT', `/api/admin/orders/${o.id}/shipment`, v)).catch(() => null); if (nr) renderOrder(nr, await carriers());
    });
    $('#sh-sync')?.addEventListener('click', async e => { const nr = await act(e.target.closest('button'), () => api('POST', `/api/admin/orders/${o.id}/shipment/sync`), t('a_synced')).catch(() => null); if (nr) renderOrder(nr, await carriers()); });
    void reload;
  }

  // =====================================================================
  // PRODUCTS
  // =====================================================================
  on(/^\/admin\/products$/, async ({ q, alive }) => {
    const page = Number(q.page) || 1; const lim = 30;
    const [r] = await Promise.all([api('GET', '/api/admin/products' + qs({ ...q, page, limit: lim })), catsFlat()]); if (!alive()) return;
    title(t('a_products'));
    view(`<div class="card panel"><div class="sec-title"><h2>${t('a_products')}</h2><a href="/admin/products/new" class="btn btn-accent btn-sm">${icon('plus')} ${t('a_new_product')}</a></div>
      <form class="toolbar-a" id="pf2"><input class="input grow" type="search" name="q" value="${esc(q.q || '')}" placeholder="${t('a_search_products')}">
        <select class="input" name="status">${opt('', t('a_all_active'), q.status)}${['published', 'hidden', 'archived'].map(s => opt(s, t('a_ps_' + s), q.status)).join('')}</select>
        <select class="input" name="cat">${catOptions(q.cat, { allowEmpty: true, emptyLabel: t('a_all_categories') })}</select>
        <label class="check"><input type="checkbox" name="low" value="1" ${q.low === '1' ? 'checked' : ''}> ${t('a_low_stock')}</label><button class="btn btn-sm">${icon('filter')} ${t('apply')}</button></form>
      ${r.items.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th></th><th>${t('a_product')}</th><th>${t('a_category')}</th><th>${t('price')}</th><th>${t('a_stock')}</th><th>${t('a_sold')}</th><th>${t('status')}</th></tr></thead><tbody>
        ${r.items.map(p => `<tr class="click" data-href="/admin/products/${p.id}"><td style="width:56px"><img class="thumb" src="${esc(p.thumb || '')}" alt="" loading="lazy" data-fallback></td>
          <td><div class="small bold">${esc(L(p, 'name'))}</div><div class="tiny muted">#${p.id} • ${esc(p.brand || '')} ${p.featured ? `<span class="badge-soft">★ ${t('a_featured')}</span>` : ''} ${p.is_deal ? `<span class="badge-soft" style="color:var(--sale)">${t('deals')}</span>` : ''}</div></td>
          <td class="small">${esc(L({ name_ar: p.cat_ar, name_en: p.cat_en }, 'name'))}</td><td class="nowrap"><b>${money(p.eff)}</b>${p.eff < p.price ? `<div class="tiny muted" style="text-decoration:line-through">${money(p.price)}</div>` : ''}</td>
          <td><b style="color:${p.stock <= 0 ? 'var(--danger)' : p.stock <= 5 ? 'var(--warn)' : 'inherit'}">${p.stock}</b></td><td>${p.sold_count}</td><td><span class="status ${p.status === 'published' ? 's-green' : p.status === 'hidden' ? 's-orange' : ''}">${t('a_ps_' + p.status)}</span></td></tr>`).join('')}
        </tbody></table></div>${pager(r.total, page, lim)}` : empty()}</div>`);
    $('#pf2').addEventListener('submit', e => { e.preventDefault(); const f = formData(e.target); setQ({ q: f.q, status: f.status, cat: f.cat, low: f.low || '' }); });
    bindPager($('#view'));
  }, 'products');

  on(/^\/admin\/products\/(new|\d+)$/, async ({ m, alive }) => {
    const isNew = m[1] === 'new';
    const [p] = await Promise.all([isNew ? null : api('GET', '/api/admin/products/' + m[1]), catsFlat()]); if (!alive()) return;
    renderProduct(p);
  }, 'products');
  function renderProduct(p) {
    const isNew = !p; p = p || { status: 'hidden', returnable: 1, weight_g: 500, specs: [], variants: [{ stock: 0, active: 1 }], images: [], movements: [] };
    title(isNew ? t('a_new_product') : L(p, 'name'));
    const vrow = v => `<tr data-vid="${v.id || ''}"><td><input class="input sm" name="color" value="${esc(v.color || '')}" placeholder="black"></td><td><input class="input sm" name="size" value="${esc(v.size || '')}" placeholder="M / 42"></td>
      <td><input class="input sm" name="sku" value="${esc(v.sku || '')}"></td><td><input class="input sm" name="price_delta" inputmode="decimal" value="${esc(majorStr(v.price_delta || 0))}"></td><td><input class="input sm" name="stock" type="number" min="0" value="${v.stock ?? 0}" style="width:90px"></td>
      <td><input type="checkbox" name="active" ${v.active !== 0 ? 'checked' : ''} aria-label="${t('a_active')}"></td><td><button type="button" class="icon-btn" data-delv aria-label="${t('delete')}">${icon('trash')}</button></td></tr>`;
    const srow = s => `<tr><td><input class="input sm" name="k_ar" value="${esc(s.k_ar || '')}" dir="rtl"></td><td><input class="input sm" name="k_en" value="${esc(s.k_en || '')}" dir="ltr"></td><td><input class="input sm" name="v_ar" value="${esc(s.v_ar || '')}" dir="rtl"></td><td><input class="input sm" name="v_en" value="${esc(s.v_en || '')}" dir="ltr"></td><td><button type="button" class="icon-btn" data-dels aria-label="${t('delete')}">${icon('trash')}</button></td></tr>`;
    view(`<div class="row between wrap mb"><a href="/admin/products" class="small bold" style="color:var(--accent-ink)">${icon(S.lang === 'ar' ? 'right' : 'left')} ${t('a_products')}</a>
        <div class="row">${!isNew && p.status === 'published' ? `<a class="btn btn-ghost btn-sm" href="/p/${esc(p.slug)}" target="_blank" rel="noopener">${icon('eye')} ${t('a_view_in_store')}</a>` : ''}${!isNew ? `<button class="btn btn-ghost btn-sm" id="parch" style="color:var(--danger)">${icon('trash')} ${t('a_archive')}</button>` : ''}</div></div>
      ${isNew ? `<div class="msg msg-info mb">${icon('info')}<span>${t('a_new_product_note')}</span></div>` : ''}
      <form id="prf" class="adm-grid" style="margin-top:0" novalidate><div class="stack gap-lg">
        <div class="card panel"><h2>${t('a_basic_info')}</h2><div class="form-grid">
          <label class="field"><span>${t('a_name_ar')}</span><input class="input" name="name_ar" dir="rtl" required value="${esc(p.name_ar || '')}"></label>
          <label class="field"><span>${t('a_name_en')}</span><input class="input" name="name_en" dir="ltr" value="${esc(p.name_en || '')}"></label>
          <label class="field"><span>${t('brand')}</span><input class="input" name="brand" value="${esc(p.brand || '')}"></label>
          <label class="field"><span>${t('a_category')}</span><select class="input" name="category_id" required>${catOptions(p.category_id, { allowEmpty: true, emptyLabel: '—' })}</select></label>
          <label class="field full"><span>${t('a_desc_ar')}</span><textarea class="input" name="desc_ar" dir="rtl" style="min-height:120px">${esc(p.desc_ar || '')}</textarea></label>
          <label class="field full"><span>${t('a_desc_en')}</span><textarea class="input" name="desc_en" dir="ltr" style="min-height:120px">${esc(p.desc_en || '')}</textarea></label>
          <label class="field full"><span>${t('a_slug')}</span><input class="input" name="slug" dir="ltr" value="${esc(p.slug || '')}" placeholder="${t('a_slug_auto')}"></label></div></div>
        <div class="card panel"><div class="sec-title"><h2>${t('a_variants')}</h2><button type="button" class="btn btn-ghost btn-sm" id="addv">${icon('plus')} ${t('add')}</button></div>
          <p class="hint" style="margin-top:-6px">${t('a_variants_hint')}</p>
          <div class="table-wrap"><table class="tbl compact vtbl"><thead><tr><th>${t('color')}</th><th>${t('size')}</th><th>SKU</th><th>${t('a_price_delta')}</th><th>${t('a_stock')}</th><th>${t('a_active')}</th><th></th></tr></thead><tbody id="vbody">${p.variants.map(vrow).join('')}</tbody></table></div></div>
        <div class="card panel"><div class="sec-title"><h2>${t('specs')}</h2><button type="button" class="btn btn-ghost btn-sm" id="adds">${icon('plus')} ${t('add')}</button></div>
          <div class="table-wrap"><table class="tbl compact"><thead><tr><th>${t('a_key_ar')}</th><th>${t('a_key_en')}</th><th>${t('a_val_ar')}</th><th>${t('a_val_en')}</th><th></th></tr></thead><tbody id="sbody">${p.specs.map(srow).join('')}</tbody></table></div></div>
        ${!isNew ? `<div class="card panel"><div class="sec-title"><h2>${t('a_images')}</h2><label class="btn btn-ghost btn-sm">${icon('upload')} ${t('a_upload_images')}<input type="file" id="imgs" accept="image/jpeg,image/png,image/webp" multiple hidden></label></div>
          <div class="img-grid" id="igrid">${p.images.map(i => `<div class="img-tile ${i.is_main ? 'main' : ''}"><img src="${esc(i.thumb || i.path)}" alt=""><div class="ops">${i.is_main ? `<button type="button" disabled>${t('a_main')}</button>` : `<button type="button" data-main="${i.id}">${t('a_set_main')}</button>`}<button type="button" data-deli="${i.id}" aria-label="${t('delete')}">✕</button></div></div>`).join('') || `<p class="muted small">${t('a_no_images')}</p>`}</div>
          <p class="hint mt">${t('a_images_hint')}</p></div>` : ''}
        ${!isNew && p.movements.length ? `<div class="card panel"><h2>${t('a_stock_moves')}</h2><div class="table-wrap"><table class="tbl compact"><thead><tr><th>${t('date')}</th><th>${t('a_variant')}</th><th>${t('a_change')}</th><th>${t('a_reason')}</th></tr></thead><tbody>
          ${p.movements.map(mv => `<tr><td class="tiny nowrap">${fmtDate(mv.created_at)}</td><td class="small">${esc([mv.color, mv.size].filter(Boolean).join(' / ') || '—')}</td><td class="num bold" style="color:${mv.delta > 0 ? 'var(--accent-ink)' : 'var(--danger)'}">${mv.delta > 0 ? '+' : ''}${mv.delta}</td><td class="small">${esc(mv.reason || '')} ${mv.ref_type ? `<span class="tiny muted">${esc(mv.ref_type)} ${esc(mv.ref_id || '')}</span>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      </div><div class="stack gap-lg">
        <div class="card panel"><h2>${t('a_publishing')}</h2><div class="stack"><label class="field"><span>${t('status')}</span><select class="input" name="status">${['published', 'hidden', 'archived'].map(s => opt(s, t('a_ps_' + s), p.status)).join('')}</select></label>
          ${sw('featured', p.featured, t('a_featured'))}${sw('is_deal', p.is_deal, t('a_is_deal'))}${sw('returnable', p.returnable !== 0, t('returnable'))}</div></div>
        <div class="card panel"><h2>${t('price')}</h2><div class="stack"><label class="field"><span>${t('a_price_dzd')}</span><input class="input" name="price" inputmode="decimal" required value="${esc(majorStr(p.price))}"></label>
          <label class="field"><span>${t('a_sale_price')} <small class="muted">(${t('optional')})</small></span><input class="input" name="sale_price" inputmode="decimal" value="${esc(majorStr(p.sale_price))}"></label>
          <label class="field"><span>${t('a_sale_start')}</span><input class="input" type="datetime-local" name="sale_start" value="${toLocalInput(p.sale_start)}"></label>
          <label class="field"><span>${t('a_sale_end')}</span><input class="input" type="datetime-local" name="sale_end" value="${toLocalInput(p.sale_end)}"></label><p class="hint">${t('a_sale_hint')}</p></div></div>
        <div class="card panel"><h2>${t('a_shipping_warranty')}</h2><div class="stack"><label class="field"><span>${t('a_weight_g')}</span><input class="input" name="weight_g" type="number" min="0" value="${p.weight_g ?? 500}"></label>
          <label class="field"><span>${t('a_warranty_ar')}</span><input class="input" name="warranty_ar" dir="rtl" value="${esc(p.warranty_ar || '')}"></label><label class="field"><span>${t('a_warranty_en')}</span><input class="input" name="warranty_en" dir="ltr" value="${esc(p.warranty_en || '')}"></label></div></div>
        <button class="btn btn-accent btn-lg btn-block" id="psave">${icon('check')} ${t('save')}</button>
      </div></form>`);
    $('#addv').addEventListener('click', () => $('#vbody').insertAdjacentHTML('beforeend', vrow({ stock: 0, active: 1 })));
    $('#adds').addEventListener('click', () => $('#sbody').insertAdjacentHTML('beforeend', srow({})));
    $('#prf').addEventListener('click', e => { const d = e.target.closest('[data-delv],[data-dels]'); if (d) d.closest('tr').remove(); });
    $('#prf').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target;
      const body = { name_ar: f.name_ar.value, name_en: f.name_en.value, brand: f.brand.value, category_id: f.category_id.value, desc_ar: f.desc_ar.value, desc_en: f.desc_en.value, slug: f.slug.value,
        status: f.status.value, featured: f.featured.checked, is_deal: f.is_deal.checked, returnable: f.returnable.checked, price: f.price.value, sale_price: f.sale_price.value,
        sale_start: fromLocalInput(f.sale_start.value), sale_end: fromLocalInput(f.sale_end.value), weight_g: f.weight_g.value, warranty_ar: f.warranty_ar.value, warranty_en: f.warranty_en.value,
        variants: $$('#vbody tr').map(tr => ({ id: tr.dataset.vid ? Number(tr.dataset.vid) : undefined, color: $('[name=color]', tr).value, size: $('[name=size]', tr).value, sku: $('[name=sku]', tr).value, price_delta: $('[name=price_delta]', tr).value || 0, stock: $('[name=stock]', tr).value || 0, active: $('[name=active]', tr).checked })),
        specs: $$('#sbody tr').map(tr => ({ k_ar: $('[name=k_ar]', tr).value, k_en: $('[name=k_en]', tr).value, v_ar: $('[name=v_ar]', tr).value, v_en: $('[name=v_en]', tr).value })) };
      const r = await act($('#psave'), () => isNew ? api('POST', '/api/admin/products', body) : api('PUT', '/api/admin/products/' + p.id, body)).catch(() => null);
      if (!r) return;
      if (isNew) go('/admin/products/' + r.id, true); else renderProduct(await api('GET', '/api/admin/products/' + p.id));
    });
    $('#parch')?.addEventListener('click', async e => {
      if (!(await confirmBox(t('a_archive_q'), { danger: true, okText: t('a_archive') }))) return;
      const r = await act(e.target.closest('button'), () => api('DELETE', '/api/admin/products/' + p.id), t('a_archived')).catch(() => null); if (r) go('/admin/products');
    });
    $('#imgs')?.addEventListener('change', async e => {
      const fd = new FormData(); [...e.target.files].slice(0, 10).forEach(f => fd.append('images', f)); if (!fd.has('images')) return;
      try { await api('POST', `/api/admin/products/${p.id}/images`, fd); toast(t('saved')); renderProduct(await api('GET', '/api/admin/products/' + p.id)); } catch (er) { toast(errMsg(er), 'err'); }
    });
    $('#igrid')?.addEventListener('click', async e => {
      const mb = e.target.closest('[data-main]'), db = e.target.closest('[data-deli]');
      try {
        if (mb) await api('POST', `/api/admin/images/${mb.dataset.main}/main`);
        else if (db) { if (!(await confirmBox(t('confirm_delete'), { danger: true }))) return; await api('DELETE', `/api/admin/images/${db.dataset.deli}`); }
        else return;
        renderProduct(await api('GET', '/api/admin/products/' + p.id));
      } catch (er) { toast(errMsg(er), 'err'); }
    });
  }

  // =====================================================================
  // CATEGORIES
  // =====================================================================
  const ICONS = ['shirt', 'dress', 'baby', 'shoe', 'bag', 'glasses', 'watch', 'gem', 'gift', 'pot', 'utensils', 'cup', 'lamp', 'drop', 'bed', 'plug', 'blender', 'iron', 'snow', 'phone', 'tablet', 'battery', 'headphones', 'laptop', 'keyboard', 'monitor', 'gamepad', 'camera', 'wifi', 'chip', 'printer', 'perfume', 'lipstick', 'razor', 'puzzle', 'ball', 'car', 'wrench', 'pen', 'plane', 'paw', 'home', 'box', 'tag', 'sparkle'];
  on(/^\/admin\/categories$/, async ({ alive }) => {
    const tree = await api('GET', '/api/admin/categories'); await catsFlat(true); if (!alive()) return;
    title(t('a_categories'));
    const row = (c, d, sibs, i) => `<div class="cat-row ${c.visible ? '' : 'hidden'}" style="padding-inline-start:${10 + d * 26}px"><span class="ic">${c.image ? `<img src="${esc(c.image)}" alt="">` : icon(c.icon || 'box')}</span>
        <div class="grow"><span class="nm">${esc(L(c, 'name'))}</span> <span class="tiny muted">${esc(S.lang === 'ar' ? c.name_en : c.name_ar)} • ${t('a_products_n', { n: c.count })}</span></div>
        <div class="ops"><button class="icon-btn" data-up="${c.id}" ${i === 0 ? 'disabled' : ''} aria-label="${t('a_move_up')}" title="${t('a_move_up')}" style="transform:rotate(180deg)">${icon('down')}</button><button class="icon-btn" data-down="${c.id}" ${i === sibs.length - 1 ? 'disabled' : ''} aria-label="${t('a_move_down')}" title="${t('a_move_down')}">${icon('down')}</button>
          <button class="icon-btn" data-vis="${c.id}" title="${c.visible ? t('a_hide') : t('a_show')}" aria-label="${c.visible ? t('a_hide') : t('a_show')}">${icon(c.visible ? 'eye' : 'lock')}</button>
          <button class="icon-btn" data-child="${c.id}" title="${t('a_add_sub')}" aria-label="${t('a_add_sub')}">${icon('plus')}</button><button class="icon-btn" data-edit="${c.id}" title="${t('edit')}" aria-label="${t('edit')}">${icon('edit')}</button>
          <button class="icon-btn" data-del="${c.id}" title="${t('delete')}" aria-label="${t('delete')}">${icon('trash')}</button></div></div>${c.children.map((k, j) => row(k, d + 1, c.children, j)).join('')}`;
    view(`<div class="card panel"><div class="sec-title"><h2>${t('a_categories')}</h2><button class="btn btn-accent btn-sm" id="cadd">${icon('plus')} ${t('a_new_category')}</button></div>
      <p class="hint">${t('a_categories_hint')}</p><div class="cat-tree mt" id="ctree">${tree.map((c, i) => row(c, 0, tree, i)).join('')}</div></div>`);
    const flat = []; const walk = (arr) => arr.forEach(c => { flat.push(c); walk(c.children); }); walk(tree);
    const find = id => flat.find(c => c.id === Number(id));
    const siblings = c => c.parent_id ? find(c.parent_id).children : tree;
    const reload = () => route();
    $('#cadd').addEventListener('click', () => catForm(null, null, reload));
    $('#ctree').addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return; const ds = b.dataset;
      try {
        if (ds.edit) return catForm(find(ds.edit), null, reload);
        if (ds.child) return catForm(null, Number(ds.child), reload);
        if (ds.vis) { const c = find(ds.vis); await api('PUT', '/api/admin/categories/' + c.id, { ...c, visible: !c.visible }); return reload(); }
        if (ds.del) { if (!(await confirmBox(t('confirm_delete'), { danger: true }))) return; await api('DELETE', '/api/admin/categories/' + ds.del); toast(t('a_deleted')); return reload(); }
        if (ds.up || ds.down) {
          const c = find(ds.up || ds.down); const sib = siblings(c).slice(); const i = sib.indexOf(c); const j = ds.up ? i - 1 : i + 1; if (j < 0 || j >= sib.length) return;
          [sib[i], sib[j]] = [sib[j], sib[i]];
          await api('POST', '/api/admin/categories/reorder', { items: sib.map((x, k) => ({ id: x.id, sort: (k + 1) * 10 })) }); return reload();
        }
      } catch (er) { toast(errMsg(er), 'err'); }
    });
  }, 'categories');
  function catForm(c, parentId, done) {
    const isNew = !c; c = c || { parent_id: parentId, visible: 1, sort: 0, icon: '' };
    const m = modal(`<h3>${isNew ? t('a_new_category') : t('edit')}</h3><form id="cf" class="stack mt"><div class="form-grid">
      <label class="field"><span>${t('a_name_ar')}</span><input class="input" name="name_ar" dir="rtl" required value="${esc(c.name_ar || '')}"></label>
      <label class="field"><span>${t('a_name_en')}</span><input class="input" name="name_en" dir="ltr" value="${esc(c.name_en || '')}"></label>
      <label class="field"><span>${t('a_parent')}</span><select class="input" name="parent_id">${catOptions(c.parent_id || '', { allowEmpty: true, emptyLabel: t('a_root') })}</select></label>
      <label class="field"><span>${t('a_sort')}</span><input class="input" name="sort" type="number" min="0" value="${c.sort || 0}"></label>
      <label class="field"><span>${t('a_icon')}</span><select class="input" name="icon">${opt('', '—', c.icon)}${ICONS.map(i => opt(i, i, c.icon)).join('')}</select></label>
      <label class="field"><span>${t('a_slug')}</span><input class="input" name="slug" dir="ltr" value="${esc(c.slug || '')}" placeholder="${t('a_slug_auto')}"></label>
      <div class="full">${sw('visible', c.visible, t('a_visible'))}</div>
      ${!isNew ? `<label class="field full"><span>${t('a_image')}</span><input type="file" name="image" class="input" accept="image/jpeg,image/png,image/webp" style="padding:10px"></label>` : ''}</div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>${t('cancel')}</button><button class="btn btn-accent">${t('save')}</button></div></form>`, { wide: true });
    m.querySelector('[data-close]').addEventListener('click', closeOverlay);
    m.querySelector('#cf').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target; const btn = f.querySelector('.btn-accent');
      const body = { name_ar: f.name_ar.value, name_en: f.name_en.value, parent_id: f.parent_id.value || null, sort: f.sort.value, icon: f.icon.value, slug: f.slug.value, visible: f.visible.checked };
      try {
        busy(btn, true);
        if (isNew) await api('POST', '/api/admin/categories', body); else await api('PUT', '/api/admin/categories/' + c.id, body);
        if (!isNew && f.image.files[0]) { const fd = new FormData(); fd.append('image', f.image.files[0]); await api('POST', `/api/admin/categories/${c.id}/image`, fd); }
        closeOverlay(); toast(t('saved')); done();
      } catch (er) { busy(btn, false); toast(errMsg(er), 'err'); }
    });
  }

  // =====================================================================
  // REVIEWS
  // =====================================================================
  on(/^\/admin\/reviews$/, async ({ alive }) => {
    const rows = await api('GET', '/api/admin/reviews'); if (!alive()) return;
    title(t('a_reviews'));
    view(`<div class="card panel"><h2>${t('a_reviews')}</h2><p class="hint">${t('a_reviews_hint')}</p>${rows.length ? `<div class="table-wrap mt"><table class="tbl compact"><thead><tr><th>${t('a_product')}</th><th>${t('name')}</th><th>${t('rating')}</th><th>${t('a_comment')}</th><th>${t('date')}</th><th>${t('a_visible')}</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="small"><a href="/admin/products/${r.product_id}" style="color:var(--accent-ink)">${esc(L(r, 'name'))}</a></td><td class="small">${esc(r.name)} ${r.verified ? `<span class="badge-soft">${t('verified_purchase')}</span>` : ''}</td><td>${M.stars(r.rating)}</td>
        <td class="small" style="max-width:380px">${esc(r.comment || '')}</td><td class="tiny nowrap">${fmtDate(r.created_at, false)}</td><td><label class="switch"><input type="checkbox" data-rv="${r.id}" ${r.visible ? 'checked' : ''} aria-label="${t('a_visible')}"></label></td></tr>`).join('')}</tbody></table></div>` : empty()}</div>`);
    $$('[data-rv]').forEach(i => i.addEventListener('change', async () => { try { await api('PUT', '/api/admin/reviews/' + i.dataset.rv, { visible: i.checked }); toast(t('saved')); } catch (e) { i.checked = !i.checked; toast(errMsg(e), 'err'); } }));
  }, 'products');

  // =====================================================================
  // CUSTOMERS
  // =====================================================================
  on(/^\/admin\/customers$/, async ({ q, alive }) => {
    const page = Number(q.page) || 1; const lim = 30;
    const r = await api('GET', '/api/admin/customers' + qs({ ...q, page, limit: lim })); if (!alive()) return;
    title(t('a_customers'));
    view(`<div class="card panel"><form class="toolbar-a" id="cuf"><input class="input grow" type="search" name="q" value="${esc(q.q || '')}" placeholder="${t('a_search_customers')}">
        <select class="input" name="status">${opt('', t('a_all_statuses'), q.status)}${opt('active', t('a_us_active'), q.status)}${opt('suspended', t('a_us_suspended'), q.status)}</select><button class="btn btn-sm">${icon('filter')} ${t('apply')}</button></form>
      ${r.items.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${t('name')}</th><th>${t('phone')}</th><th>${t('a_verified')}</th><th>${t('orders')}</th><th>${t('a_spent')}</th><th>${t('wallet')}</th><th>${t('status')}</th><th>${t('a_joined')}</th></tr></thead><tbody>
        ${r.items.map(u => `<tr class="click" data-href="/admin/customers/${u.id}"><td><div class="small bold">${esc(u.name)}</div><div class="tiny muted">${esc(u.email)}</div></td><td class="num small">${esc(u.phone || '—')}</td><td>${yesNo(u.email_verified_at)}</td><td>${u.orders}</td><td class="nowrap">${money(u.spent)}</td>
          <td class="nowrap small">${money(u.available)}${u.held ? `<div class="tiny muted">${t('held')}: ${money(u.held)}</div>` : ''}</td><td><span class="status ${u.status === 'active' ? 's-green' : 's-red'}">${t('a_us_' + u.status)}</span></td><td class="tiny nowrap">${fmtDate(u.created_at, false)}</td></tr>`).join('')}</tbody></table></div>${pager(r.total, page, lim)}` : empty()}</div>`);
    $('#cuf').addEventListener('submit', e => { e.preventDefault(); setQ(formData(e.target)); });
    bindPager($('#view'));
  }, 'customers');

  on(/^\/admin\/customers\/(\d+)$/, async ({ m, alive }) => {
    const u = await api('GET', '/api/admin/customers/' + m[1]); if (!alive()) return;
    title(u.name);
    const canStatus = ['admin', 'manager'].includes(A.me.role) && u.role === 'customer';
    view(`<div class="row between wrap mb"><a href="/admin/customers" class="small bold" style="color:var(--accent-ink)">${icon(S.lang === 'ar' ? 'right' : 'left')} ${t('a_customers')}</a>
        ${canStatus ? `<button class="btn btn-sm ${u.status === 'active' ? 'btn-ghost' : 'btn-accent'}" id="ustat" style="${u.status === 'active' ? 'color:var(--danger)' : ''}">${u.status === 'active' ? t('a_suspend') : t('a_activate')}</button>` : ''}</div>
      <div class="adm-grid" style="margin-top:0"><div class="stack gap-lg">
        <div class="card panel"><h2>${t('orders')} (${u.orders.length})</h2>${u.orders.length ? `<div class="table-wrap"><table class="tbl compact"><tbody>${u.orders.map(o => `<tr ${can('orders') ? `class="click" data-href="/admin/orders/${o.id}"` : ''}><td class="num bold">${esc(o.number)}</td><td class="tiny">${fmtDate(o.created_at)}</td><td>${orderStatus(o.status)}</td><td>${payStatus(o.payment_status)}</td><td class="r bold">${money(o.total)}</td></tr>`).join('')}</tbody></table></div>` : empty(t('no_orders'))}</div>
        ${u.transactions ? `<div class="card panel"><div class="sec-title"><h2>${t('transactions')}</h2><a class="small bold" style="color:var(--accent-ink)" href="/admin/finance/transactions?user=${u.id}">${t('see_all')}</a></div>${u.transactions.length ? txTable(u.transactions.slice(0, 30), false) : empty(t('no_tx'))}</div>` : ''}
        ${u.topups && u.topups.length ? `<div class="card panel"><h2>${t('topups')}</h2><div class="table-wrap"><table class="tbl compact"><tbody>${u.topups.map(x => `<tr><td class="num small">${esc(x.ref)}</td><td class="tiny">${fmtDate(x.created_at)}</td><td>${x.method.toUpperCase()}</td><td>${M.moneyIn(x.sent_amount, x.currency)}</td><td>${reqStatus(x.status)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
        ${u.withdrawals && u.withdrawals.length ? `<div class="card panel"><h2>${t('withdrawals')}</h2><div class="table-wrap"><table class="tbl compact"><tbody>${u.withdrawals.map(x => `<tr><td class="num small">${esc(x.ref)}</td><td class="tiny">${fmtDate(x.created_at)}</td><td>${x.method.toUpperCase()}</td><td>${money(x.amount_dzd)}</td><td>${reqStatus(x.status)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      </div><div class="stack gap-lg">
        <div class="card panel"><h2>${t('profile')}</h2><dl class="kv"><dt>${t('name')}</dt><dd>${esc(u.name)}</dd><dt>${t('email')}</dt><dd>${esc(u.email)}</dd><dt>${t('phone')}</dt><dd class="num">${esc(u.phone || '—')}</dd>
          <dt>${t('a_verified')}</dt><dd>${yesNo(u.email_verified_at)}</dd><dt>${t('status')}</dt><dd><span class="status ${u.status === 'active' ? 's-green' : 's-red'}">${t('a_us_' + u.status)}</span></dd><dt>${t('a_role')}</dt><dd>${roleName(u.role)}</dd>
          <dt>${t('language')}</dt><dd>${u.lang === 'en' ? 'English' : 'العربية'}</dd><dt>${t('a_joined')}</dt><dd>${fmtDate(u.created_at)}</dd></dl></div>
        <div class="card panel"><h2>${t('wallet')}</h2><dl class="kv"><dt>${t('available')}</dt><dd>${money(u.wallet.available)}</dd><dt>${t('held')}</dt><dd>${money(u.wallet.held)}</dd></dl><p class="hint mt">${t('a_no_direct_edit')}</p></div>
        <div class="card panel"><h2>${t('addresses')}</h2>${u.addresses.length ? u.addresses.map(a => `<div class="small" style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${esc(a.full_name)}</b> ${a.is_default ? `<span class="badge-soft">${t('default')}</span>` : ''}<div class="muted">${esc(a.w_ar)} — ${esc(a.c_ar)} • ${esc(a.address)}</div><div class="num muted">${esc(a.phone)}</div></div>`).join('') : `<p class="muted small">${t('no_addresses')}</p>`}</div>
        ${u.tickets.length ? `<div class="card panel"><h2>${t('a_tickets')}</h2>${u.tickets.map(x => `<a href="/admin/support/${x.id}" class="row between small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(x.subject)}</span>${tkStatus(x.status)}</a>`).join('')}</div>` : ''}
      </div></div>`);
    $('#ustat')?.addEventListener('click', async e => {
      const to = u.status === 'active' ? 'suspended' : 'active';
      const reason = await confirmBox(to === 'suspended' ? t('a_suspend_q') : t('a_activate_q'), { input: true, inputLabel: t('reason'), required: true, danger: to === 'suspended' }); if (reason == null) return;
      const ok = await act(e.target.closest('button'), () => api('POST', `/api/admin/customers/${u.id}/status`, { status: to, reason })).catch(() => null); if (ok) route();
    });
  }, 'customers');

  // shared: wallet transactions table (also used by finance module)
  function txTable(rows, withCustomer = true) {
    const d = v => v ? `<span class="num nowrap ${v > 0 ? 'amt-pos' : 'amt-neg'}">${v > 0 ? '+' : '−'}${M.moneyTxt(Math.abs(v), 'DZD')}</span>` : '<span class="muted">—</span>';
    return `<div class="table-wrap"><table class="tbl compact"><thead><tr><th>${t('reference')}</th><th>${t('date')}</th>${withCustomer ? `<th>${t('a_customer')}</th>` : ''}<th>${t('a_type')}</th><th>${t('a_d_available')}</th><th>${t('a_d_held')}</th><th>${t('a_balance_after')}</th><th>${t('a_original')}</th><th>${t('note')}</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td class="num tiny bold">${esc(x.ref)}</td><td class="tiny nowrap">${fmtDate(x.created_at)}</td>${withCustomer ? `<td class="small"><a href="/admin/customers/${x.user_id}" style="color:var(--accent-ink)">${esc(x.customer)}</a></td>` : ''}<td class="small">${t('tx_' + x.type)}</td>
        <td>${d(x.delta_available)}</td><td>${d(x.delta_held)}</td><td class="tiny nowrap">${M.moneyTxt(x.available_after, 'DZD')} / ${M.moneyTxt(x.held_after, 'DZD')}</td>
        <td class="tiny nowrap">${M.moneyIn(x.orig_amount, x.orig_currency)}${x.fx_rate_micro ? `<div class="muted">@ ${M.fmtNum(x.fx_rate_micro / 1e6, 2)}</div>` : ''}</td><td class="tiny" style="max-width:220px">${esc(x.note || '')}${x.actor ? `<div class="muted">${esc(x.actor)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }

  window.ADM = { A, on, go, route, view, title, can, isAdmin, qs, curQ, setQ, majorStr, toLocalInput, fromLocalInput, opt, sw, empty, pager, bindPager, fileUrl, fileBlock, roleName, yesNo, catsFlat, catOptions, carriers, act, promptForm, txTable, refreshPending, silent };

  // boot after part 2 registered its routes
  document.addEventListener('DOMContentLoaded', () => {
    const l = (document.cookie.match(/(?:^|; )mdz_lang=(ar|en)/) || [])[1] || 'ar';
    S.lang = l; document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    boot();
  });
})();
