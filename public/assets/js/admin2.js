/* Marché DZ — admin SPA (part 2): finance review, coupons, shipping, support, content, settings, staff, audit, backups. */
(function () {
  'use strict';
  const M = window.MDZ; const D = window.ADM;
  const { $, $$, esc, t, L, state: S, api, errMsg, money, moneyIn, fmtDate, icon, toast, modal, closeOverlay, confirmBox, busy, formData, reqStatus, tkStatus } = M;
  const { A, on, go, route, view, title, can, isAdmin, qs, setQ, majorStr, toLocalInput, fromLocalInput, opt, sw, empty, pager, bindPager, fileUrl, fileBlock, roleName, catsFlat, catOptions, carriers, act, promptForm, txTable, refreshPending, silent } = D;
  const back = (href, label) => `<a href="${href}" class="small bold" style="color:var(--accent-ink)">${icon(S.lang === 'ar' ? 'right' : 'left')} ${label}</a>`;
  const statusTabs = (list, cur) => `<div class="tabs" id="stabs">${list.map(s => `<button data-st="${s}" class="${(cur || '') === s ? 'on' : ''}">${s ? t('rq_' + s) : t('all')}</button>`).join('')}</div>`;
  const bindTabs = () => $$('#stabs [data-st]').forEach(b => b.addEventListener('click', () => setQ({ status: b.dataset.st })));
  const custCell = x => `<div class="small bold">${esc(x.customer)}</div><div class="tiny muted">${esc(x.email || '')}</div>`;

  // =====================================================================
  // FINANCE — TOP-UPS
  // =====================================================================
  on(/^\/admin\/finance\/topups$/, async ({ q, alive }) => {
    const st = q.status ?? 'pending'; const page = Number(q.page) || 1; const lim = 30;
    const r = await api('GET', '/api/admin/finance/topups' + qs({ status: st, page, limit: lim })); if (!alive()) return;
    title(t('a_topups'));
    view(`<div class="card panel"><div class="sec-title"><h2>${t('a_topups')}</h2></div><div class="msg msg-warn mb">${icon('shield')}<span>${t('a_topup_rule')}</span></div>
      ${statusTabs(['pending', 'needs_info', 'approved', 'rejected', ''], st)}
      ${r.items.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${t('reference')}</th><th>${t('date')}</th><th>${t('a_customer')}</th><th>${t('a_method')}</th><th>${t('requested_amount')}</th><th>${t('sent_amount')}</th><th>${t('transfer_ref')}</th><th>${t('status')}</th></tr></thead><tbody>
        ${r.items.map(x => `<tr class="click" data-tp="${x.id}"><td class="num small bold">${esc(x.ref)}</td><td class="tiny nowrap">${fmtDate(x.created_at)}</td><td>${custCell(x)}</td><td><span class="badge-soft">${x.method.toUpperCase()}</span></td>
          <td class="nowrap small">${moneyIn(x.requested_amount, x.currency)}</td><td class="nowrap bold">${moneyIn(x.sent_amount, x.currency)}</td><td class="num tiny" style="max-width:180px;word-break:break-all">${esc(x.reference)}</td><td>${reqStatus(x.status)}</td></tr>`).join('')}</tbody></table></div>${pager(r.total, page, lim)}` : empty()}</div>`);
    bindTabs(); bindPager($('#view'));
    $$('[data-tp]').forEach(tr => tr.addEventListener('click', () => topupModal(r.items.find(x => x.id === Number(tr.dataset.tp)))));
  }, 'finance');
  function topupModal(x) {
    const open = ['pending', 'needs_info'].includes(x.status);
    const isUsd = x.currency === 'USD';
    const m = modal(`<h3>${t('a_topup')} <span class="num">${esc(x.ref)}</span> ${reqStatus(x.status)}</h3>
      <div class="adm-grid-2 mt"><dl class="kv"><dt>${t('a_customer')}</dt><dd><a href="/admin/customers/${x.user_id}" style="color:var(--accent-ink)">${esc(x.customer)}</a><div class="tiny muted">${esc(x.email)} ${esc(x.phone || '')}</div></dd>
        <dt>${t('a_method')}</dt><dd>${x.method.toUpperCase()}${x.network ? ' • ' + esc(x.network) : ''}</dd><dt>${t('requested_amount')}</dt><dd>${moneyIn(x.requested_amount, x.currency)}</dd>
        <dt>${t('sent_amount')}</dt><dd><b>${moneyIn(x.sent_amount, x.currency)}</b>${isUsd ? `<div class="tiny muted">≈ ${M.moneyTxt(Math.round(x.sent_amount * Number(S.settings.fx_usd_rate_micro || 135000000) / 1e6), 'DZD')}</div>` : ''}</dd>
        <dt>${isUsd ? 'TXID' : t('transfer_ref')}</dt><dd class="num" style="word-break:break-all">${esc(x.reference)}</dd>${x.transfer_date ? `<dt>${t('transfer_date')}</dt><dd class="num">${esc(String(x.transfer_date).slice(0, 10))}</dd>` : ''}
        <dt>${t('date')}</dt><dd>${fmtDate(x.created_at)}</dd>${x.user_note ? `<dt>${t('note')}</dt><dd>${esc(x.user_note)}</dd>` : ''}${x.admin_note ? `<dt>${t('a_admin_note')}</dt><dd>${esc(x.admin_note)}</dd>` : ''}
        ${x.reviewer ? `<dt>${t('a_reviewed_by')}</dt><dd>${esc(x.reviewer)} • ${fmtDate(x.reviewed_at)}</dd>` : ''}${x.credited_dzd ? `<dt>${t('a_credited')}</dt><dd class="amt-pos bold">${money(x.credited_dzd)}</dd>` : ''}</dl>
        <div>${x.receipt_file_id ? fileBlock(x.receipt_file_id) : `<div class="msg msg-info">${icon('info')}<span>${isUsd ? t('a_usdt_verify') : t('a_no_receipt')}</span></div>`}</div></div>
      ${isUsd ? `<div class="msg msg-warn mt">${icon('alert')}<span>${t('legal_usdt')}</span></div>` : ''}
      ${open ? `<form id="tpf" class="stack mt"><div class="form-grid"><label class="field"><span>${t('a_approved_amount')} (${isUsd ? 'USD' : 'DZD'})</span><input class="input" name="amount" inputmode="decimal" value="${majorStr(x.sent_amount)}" required><small class="hint">${t('a_approved_hint')}</small></label>
          <label class="field"><span>${t('a_note_reason')}</span><input class="input" name="note"></label></div>
          <div class="row wrap" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-a="info">${t('a_request_info')}</button><button type="button" class="btn btn-ghost" data-a="reject" style="color:var(--danger)">${t('a_reject')}</button><button type="button" class="btn btn-accent" data-a="approve">${icon('check')} ${t('a_approve_credit')}</button></div></form>` : ''}`, { wide: true });
    M.$$('img[data-fallback]', m).forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
    const f = m.querySelector('#tpf'); if (!f) return;
    f.addEventListener('submit', e => e.preventDefault());
    $$('[data-a]', f).forEach(b => b.addEventListener('click', async () => {
      const a = b.dataset.a; const note = f.note.value.trim();
      if ((a === 'reject' || a === 'info') && note.length < 3) { f.note.setAttribute('aria-invalid', 'true'); f.note.focus(); toast(t('a_reason_needed'), 'err'); return; }
      if (a === 'approve' && !(await confirmBox(t('a_approve_topup_q', { amount: `${f.amount.value} ${isUsd ? 'USD' : 'DZD'}` })))) return;
      const url = `/api/admin/finance/topups/${x.id}/` + (a === 'approve' ? 'approve' : a === 'reject' ? 'reject' : 'request-info');
      const body = a === 'approve' ? { amount: f.amount.value, note } : a === 'reject' ? { reason: note } : { note };
      try { busy(b, true); await api('POST', url, body); closeOverlay(); toast(t('saved')); refreshPending(); route(); } catch (er) { busy(b, false); toast(errMsg(er), 'err'); }
    }));
  }

  // =====================================================================
  // FINANCE — WITHDRAWALS
  // =====================================================================
  on(/^\/admin\/finance\/withdrawals$/, async ({ q, alive }) => {
    const st = q.status ?? 'pending'; const page = Number(q.page) || 1; const lim = 30;
    const r = await api('GET', '/api/admin/finance/withdrawals' + qs({ status: st, page, limit: lim })); if (!alive()) return;
    title(t('a_withdrawals'));
    view(`<div class="card panel"><h2>${t('a_withdrawals')}</h2><div class="msg msg-info mb">${icon('info')}<span>${t('a_withdraw_rule')}</span></div>
      ${statusTabs(['pending', 'approved', 'needs_info', 'paid', 'rejected', 'cancelled', ''], st)}
      ${r.items.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${t('reference')}</th><th>${t('date')}</th><th>${t('a_customer')}</th><th>${t('a_method')}</th><th>${t('amount')}</th><th>${t('fees')}</th><th>${t('net_amount')}</th><th>${t('status')}</th></tr></thead><tbody>
        ${r.items.map(x => `<tr class="click" data-wd="${x.id}"><td class="num small bold">${esc(x.ref)}</td><td class="tiny nowrap">${fmtDate(x.created_at)}</td><td>${custCell(x)}</td><td><span class="badge-soft">${x.method.toUpperCase()}</span></td>
          <td class="nowrap bold">${money(x.amount_dzd)}</td><td class="nowrap small">${money(x.fee_dzd)}</td><td class="nowrap small">${moneyIn(x.net_orig, x.currency)}</td><td>${reqStatus(x.status)}</td></tr>`).join('')}</tbody></table></div>${pager(r.total, page, lim)}` : empty()}</div>`);
    bindTabs(); bindPager($('#view'));
    $$('[data-wd]').forEach(tr => tr.addEventListener('click', () => withdrawModal(r.items.find(x => x.id === Number(tr.dataset.wd)))));
  }, 'finance');
  function withdrawModal(x) {
    const m = modal(`<h3>${t('a_withdrawal')} <span class="num">${esc(x.ref)}</span> ${reqStatus(x.status)}</h3>
      <dl class="kv mt"><dt>${t('a_customer')}</dt><dd><a href="/admin/customers/${x.user_id}" style="color:var(--accent-ink)">${esc(x.customer)}</a> <span class="tiny muted">${esc(x.email)}</span> ${x.email_verified_at ? `<span class="status s-green">${t('verified')}</span>` : `<span class="status s-red">${t('a_unverified')}</span>`}</dd>
        <dt>${t('a_method')}</dt><dd>${x.method.toUpperCase()}${x.network ? ' • ' + esc(x.network) : ''}</dd><dt>${t('a_held_amount')}</dt><dd class="bold">${money(x.amount_dzd)}</dd><dt>${t('fees')}</dt><dd>${money(x.fee_dzd)}</dd>
        <dt>${t('a_pay_out')}</dt><dd class="bold amt-pos">${moneyIn(x.net_orig, x.currency)}${x.currency === 'USD' ? ` <span class="tiny muted">@ ${M.fmtNum(x.fx_rate_micro / 1e6, 2)}</span>` : ''}</dd>
        <dt>${t('beneficiary')}</dt><dd>${esc(x.beneficiary_name)}</dd><dt>${x.method === 'usdt' ? t('usdt_address') : t('ccp_account')}</dt><dd class="num" style="word-break:break-all">${esc(x.account)} <button class="icon-btn" data-copy="${esc(x.account)}" aria-label="${t('copy')}">${icon('copy')}</button></dd>
        ${x.account_key ? `<dt>${t('ccp_key')}</dt><dd class="num">${esc(x.account_key)}</dd>` : ''}<dt>${t('date')}</dt><dd>${fmtDate(x.created_at)}</dd>
        ${x.admin_note ? `<dt>${t('a_admin_note')}</dt><dd>${esc(x.admin_note)}</dd>` : ''}${x.reviewer ? `<dt>${t('a_reviewed_by')}</dt><dd>${esc(x.reviewer)} • ${fmtDate(x.reviewed_at)}</dd>` : ''}
        ${x.payout_reference ? `<dt>${t('payout_ref')}</dt><dd class="num">${esc(x.payout_reference)} • ${esc(x.payer || '')} • ${fmtDate(x.paid_at)}</dd>` : ''}</dl>
      <div class="row wrap mt" style="justify-content:flex-end">
        ${x.status === 'pending' ? `<button class="btn btn-ghost" data-a="info">${t('a_request_info')}</button>` : ''}
        ${['pending', 'needs_info', 'approved'].includes(x.status) ? `<button class="btn btn-ghost" data-a="reject" style="color:var(--danger)">${t('a_reject_release')}</button>` : ''}
        ${['pending', 'needs_info'].includes(x.status) ? `<button class="btn btn-accent" data-a="approve">${icon('check')} ${t('a_approve')}</button>` : ''}
        ${x.status === 'approved' ? `<button class="btn btn-accent" data-a="pay">${icon('send')} ${t('a_mark_paid')}</button>` : ''}</div>`, { wide: true });
    $$('[data-copy]', m).forEach(b => b.addEventListener('click', () => M.copyText(b.dataset.copy)));
    $$('[data-a]', m).forEach(b => b.addEventListener('click', async () => {
      const a = b.dataset.a; let body = {}; let url = `/api/admin/finance/withdrawals/${x.id}/`;
      if (a === 'approve') { if (!(await confirmBox(t('a_approve_wd_q')))) return withdrawModal(x); url += 'approve'; }
      if (a === 'pay') { const v = await promptForm(t('a_mark_paid'), [{ name: 'payout_reference', label: t('payout_ref'), required: true }], { note: t('a_pay_note', { amount: M.moneyTxt(x.net_orig, x.currency === 'USD' ? 'USD' : 'DZD').replace('$', '') + (x.currency === 'USD' ? ' USD' : '') }) }); if (!v) return; body = v; url += 'pay'; }
      if (a === 'reject') { const r = await confirmBox(t('a_reject_wd_q'), { input: true, inputLabel: t('reason'), required: true, danger: true }); if (r == null) return; body = { reason: r }; url += 'reject'; }
      if (a === 'info') { const r = await confirmBox(t('a_request_info'), { input: true, inputLabel: t('a_what_needed'), required: true }); if (r == null) return; body = { note: r }; url += 'request-info'; }
      try { await api('POST', url, body); toast(t('saved')); closeOverlay(); refreshPending(); route(); } catch (er) { toast(errMsg(er), 'err'); }
    }));
  }

  // =====================================================================
  // FINANCE — REFUNDS
  // =====================================================================
  on(/^\/admin\/finance\/refunds$/, async ({ q, alive }) => {
    const st = q.status ?? 'pending';
    const r = await api('GET', '/api/admin/finance/refunds' + qs({ status: st })); if (!alive()) return;
    title(t('a_refunds'));
    view(`<div class="card panel"><h2>${t('a_refunds')}</h2><div class="msg msg-info mb">${icon('info')}<span>${t('a_refund_rule')}</span></div>
      ${statusTabs(['pending', 'needs_info', 'approved', 'rejected', ''], st)}
      ${r.items.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${t('reference')}</th><th>${t('date')}</th><th>${t('a_customer')}</th><th>${t('order')}</th><th>${t('refund_reason')}</th><th>${t('a_requested')}</th><th>${t('a_paid')}</th><th>${t('status')}</th></tr></thead><tbody>
        ${r.items.map(x => `<tr class="click" data-rf="${x.id}"><td class="num small bold">${esc(x.ref)}</td><td class="tiny nowrap">${fmtDate(x.created_at)}</td><td>${custCell(x)}</td><td class="num small">${esc(x.number)}<div class="tiny muted">${t(x.payment_method === 'wallet' ? 'pay_wallet' : 'pay_cod')}</div></td>
          <td class="small">${esc(t('rs_' + x.reason))}</td><td class="bold nowrap">${money(x.requested_amount)}</td><td class="small nowrap">${money(x.paid_amount)}${x.refunded_amount ? `<div class="tiny muted">${t('a_refunded')}: ${money(x.refunded_amount)}</div>` : ''}</td><td>${reqStatus(x.status)}</td></tr>`).join('')}</tbody></table></div>` : empty()}</div>`);
    bindTabs();
    $$('[data-rf]').forEach(tr => tr.addEventListener('click', () => refundModal(r.items.find(x => x.id === Number(tr.dataset.rf)))));
  }, 'finance');
  function refundModal(x) {
    const max = x.paid_amount - x.refunded_amount; const open = ['pending', 'needs_info'].includes(x.status);
    const m = modal(`<h3>${t('a_refund')} <span class="num">${esc(x.ref)}</span> ${reqStatus(x.status)}</h3>
      <dl class="kv mt"><dt>${t('a_customer')}</dt><dd>${esc(x.customer)} <span class="tiny muted">${esc(x.email)}</span></dd><dt>${t('order')}</dt><dd><a class="num" href="/admin/orders/${x.order_id}" style="color:var(--accent-ink)">${esc(x.number)}</a> ${M.orderStatus(x.order_status)} ${M.payStatus(x.payment_status)}</dd>
        <dt>${t('total')}</dt><dd>${money(x.total)}</dd><dt>${t('a_paid')}</dt><dd>${money(x.paid_amount)}</dd><dt>${t('a_refunded')}</dt><dd>${money(x.refunded_amount)}</dd><dt>${t('a_max_refund')}</dt><dd class="bold">${money(max)}</dd>
        <dt>${t('refund_reason')}</dt><dd>${esc(t('rs_' + x.reason))}</dd>${x.details ? `<dt>${t('refund_details')}</dt><dd>${esc(x.details)}</dd>` : ''}<dt>${t('a_requested')}</dt><dd class="bold">${money(x.requested_amount)}</dd>
        ${x.approved_amount ? `<dt>${t('a_approved_amount')}</dt><dd class="amt-pos bold">${money(x.approved_amount)}</dd>` : ''}${x.admin_note ? `<dt>${t('a_admin_note')}</dt><dd>${esc(x.admin_note)}</dd>` : ''}</dl>
      ${open && max <= 0 ? `<div class="msg msg-warn mt">${icon('alert')}<span>${t('a_nothing_paid')}</span></div>` : ''}
      ${open ? `<form id="rff" class="stack mt"><div class="form-grid"><label class="field"><span>${t('a_approved_amount')} (DZD)</span><input class="input" name="amount" inputmode="decimal" value="${majorStr(Math.min(x.requested_amount, Math.max(max, 0)))}"><small class="hint">${t('a_partial_hint')}</small></label>
        <label class="field"><span>${t('a_note_reason')}</span><input class="input" name="note"></label></div>
        <div class="row wrap" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-a="info">${t('a_request_info')}</button><button type="button" class="btn btn-ghost" data-a="reject" style="color:var(--danger)">${t('a_reject')}</button><button type="button" class="btn btn-accent" data-a="approve" ${max <= 0 ? 'disabled' : ''}>${icon('check')} ${t('a_approve_refund')}</button></div></form>` : ''}`, { wide: true });
    const f = m.querySelector('#rff'); if (!f) return;
    f.addEventListener('submit', e => e.preventDefault());
    $$('[data-a]', f).forEach(b => b.addEventListener('click', async () => {
      const a = b.dataset.a; const note = f.note.value.trim();
      if ((a === 'reject' || a === 'info') && note.length < 3) { f.note.setAttribute('aria-invalid', 'true'); f.note.focus(); toast(t('a_reason_needed'), 'err'); return; }
      if (a === 'approve' && !(await confirmBox(t('a_approve_refund_q', { amount: f.amount.value })))) return;
      const url = `/api/admin/finance/refunds/${x.id}/` + (a === 'approve' ? 'approve' : a === 'reject' ? 'reject' : 'request-info');
      const body = a === 'approve' ? { amount: f.amount.value, note } : a === 'reject' ? { reason: note } : { note };
      try { busy(b, true); await api('POST', url, body); closeOverlay(); toast(t('saved')); refreshPending(); route(); } catch (er) { busy(b, false); toast(errMsg(er), 'err'); }
    }));
  }

  // =====================================================================
  // FINANCE — LEDGER
  // =====================================================================
  const TX_TYPES = ['topup', 'purchase', 'refund', 'withdraw_hold', 'withdraw_release', 'withdraw_payout', 'order_cancel_refund'];
  on(/^\/admin\/finance\/transactions$/, async ({ q, alive }) => {
    const page = Number(q.page) || 1; const lim = 50;
    const r = await api('GET', '/api/admin/finance/transactions' + qs({ ...q, page, limit: lim })); if (!alive()) return;
    title(t('a_transactions'));
    const csv = '/api/admin/finance/transactions' + qs({ ...q, page: '', format: 'csv' });
    view(`<div class="kpis mb"><div class="kpi"><span class="k">${icon('wallet')} ${t('a_wallet_liability')}</span><span class="v">${money((r.totals.available || 0) + (r.totals.held || 0))}</span></div>
        <div class="kpi"><span class="k">${icon('check')} ${t('available')}</span><span class="v">${money(r.totals.available || 0)}</span></div><div class="kpi"><span class="k">${icon('lock')} ${t('held')}</span><span class="v">${money(r.totals.held || 0)}</span></div></div>
      <div class="card panel"><div class="sec-title"><h2>${t('a_ledger')}</h2><a class="btn btn-ghost btn-sm" href="${esc(csv)}" download target="_blank">${icon('download')} ${t('a_export_csv')}</a></div>
      <form class="toolbar-a" id="txf"><input class="input grow" type="search" name="q" value="${esc(q.q || '')}" placeholder="${t('a_search_tx')}">${q.user ? `<input type="hidden" name="user" value="${esc(q.user)}"><span class="badge-soft">#${esc(q.user)}</span>` : ''}
        <select class="input" name="type">${opt('', t('a_all_types'), q.type)}${TX_TYPES.map(x => opt(x, t('tx_' + x), q.type)).join('')}</select>
        <label class="row small muted" style="gap:6px">${t('a_from')}<input class="input" type="date" name="from" value="${esc(q.from || '')}"></label><label class="row small muted" style="gap:6px">${t('a_to')}<input class="input" type="date" name="to" value="${esc(q.to || '')}"></label>
        <button class="btn btn-sm">${icon('filter')} ${t('apply')}</button></form>
      <p class="hint">${t('a_ledger_note')}</p>
      ${r.items.length ? txTable(r.items) + pager(r.total, page, lim) : empty(t('no_tx'))}</div>`);
    $('#txf').addEventListener('submit', e => { e.preventDefault(); setQ(formData(e.target)); });
    bindPager($('#view'));
  }, 'finance');

  // =====================================================================
  // COUPONS
  // =====================================================================
  on(/^\/admin\/coupons$/, async ({ alive }) => {
    const [rows] = await Promise.all([api('GET', '/api/admin/coupons'), catsFlat()]); if (!alive()) return;
    title(t('a_coupons'));
    const val = c => c.type === 'percent' ? `${c.value}%` : money(c.value);
    view(`<div class="card panel"><div class="sec-title"><h2>${t('a_coupons')}</h2><button class="btn btn-accent btn-sm" id="cpadd">${icon('plus')} ${t('a_new_coupon')}</button></div><p class="hint">${t('a_coupon_hint')}</p>
      ${rows.length ? `<div class="table-wrap mt"><table class="tbl"><thead><tr><th>${t('code')}</th><th>${t('a_value')}</th><th>${t('a_min_order')}</th><th>${t('a_max_discount')}</th><th>${t('a_period')}</th><th>${t('a_uses')}</th><th>${t('a_total_discount')}</th><th>${t('status')}</th><th></th></tr></thead><tbody>
        ${rows.map(c => `<tr><td class="num bold">${esc(c.code)}${c.note ? `<div class="tiny muted">${esc(c.note)}</div>` : ''}</td><td class="bold">${val(c)}</td><td class="small">${c.min_order ? money(c.min_order) : '—'}</td><td class="small">${c.max_discount ? money(c.max_discount) : '—'}</td>
          <td class="tiny">${c.starts_at ? fmtDate(c.starts_at, false) : '∞'} → ${c.ends_at ? fmtDate(c.ends_at, false) : '∞'}</td><td class="small">${c.uses}${c.usage_limit ? ' / ' + c.usage_limit : ''}${c.per_user_limit ? `<div class="tiny muted">${t('a_per_user')}: ${c.per_user_limit}</div>` : ''}</td>
          <td class="small">${money(c.total_discount)}</td><td><span class="status ${c.active ? 's-green' : ''}">${c.active ? t('a_active') : t('a_inactive')}</span></td>
          <td class="nowrap"><button class="icon-btn" data-ced="${c.id}" aria-label="${t('edit')}">${icon('edit')}</button><button class="icon-btn" data-cdel="${c.id}" aria-label="${t('delete')}">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>` : empty()}</div>`);
    $('#cpadd').addEventListener('click', () => couponForm(null));
    $$('[data-ced]').forEach(b => b.addEventListener('click', () => couponForm(rows.find(c => c.id === Number(b.dataset.ced)))));
    $$('[data-cdel]').forEach(b => b.addEventListener('click', async () => {
      if (!(await confirmBox(t('a_coupon_del_q'), { danger: true }))) return;
      try { const r = await api('DELETE', '/api/admin/coupons/' + b.dataset.cdel); toast(r.deactivated ? t('a_deactivated') : t('a_deleted')); route(); } catch (e) { toast(errMsg(e), 'err'); }
    }));
  }, 'coupons');
  function couponForm(c) {
    const isNew = !c; c = c || { type: 'percent', active: 1, product_ids: '[]', category_ids: '[]', user_ids: '[]' };
    const ids = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
    const catSel = ids(c.category_ids).map(String);
    const m = modal(`<h3>${isNew ? t('a_new_coupon') : t('edit') + ' ' + esc(c.code)}</h3><form id="cpf" class="stack mt"><div class="form-grid">
      <label class="field"><span>${t('code')}</span><input class="input num" name="code" required value="${esc(c.code || '')}" style="text-transform:uppercase" pattern="[A-Za-z0-9_\\-]{3,30}"></label>
      <label class="field"><span>${t('a_type')}</span><select class="input" name="type">${opt('percent', t('a_percent'), c.type)}${opt('fixed', t('a_fixed'), c.type)}</select></label>
      <label class="field"><span>${t('a_value')} <small class="muted" id="vunit">(${c.type === 'percent' ? '%' : 'DZD'})</small></span><input class="input" name="value" inputmode="decimal" required value="${c.value ? (c.type === 'percent' ? c.value : majorStr(c.value)) : ''}"></label>
      <label class="field"><span>${t('a_max_discount')} (DZD) <small class="muted">(${t('optional')})</small></span><input class="input" name="max_discount" inputmode="decimal" value="${majorStr(c.max_discount)}"></label>
      <label class="field"><span>${t('a_min_order')} (DZD)</span><input class="input" name="min_order" inputmode="decimal" value="${majorStr(c.min_order || 0)}"></label>
      <label class="field"><span>${t('a_usage_limit')} <small class="muted">(${t('optional')})</small></span><input class="input" name="usage_limit" type="number" min="1" value="${c.usage_limit || ''}"></label>
      <label class="field"><span>${t('a_per_user_limit')} <small class="muted">(${t('optional')})</small></span><input class="input" name="per_user_limit" type="number" min="1" value="${c.per_user_limit || ''}"></label>
      <div></div>
      <label class="field"><span>${t('a_starts')}</span><input class="input" type="datetime-local" name="starts_at" value="${toLocalInput(c.starts_at)}"></label>
      <label class="field"><span>${t('a_ends')}</span><input class="input" type="datetime-local" name="ends_at" value="${toLocalInput(c.ends_at)}"></label>
      <label class="field full"><span>${t('a_limit_categories')} <small class="muted">(${t('a_ctrl_multi')})</small></span><select class="input" name="category_ids" multiple style="height:140px;padding:6px">${catOptions('').replace(/<option value="(\d+)"/g, (s, id) => catSel.includes(id) ? `<option value="${id}" selected` : s)}</select></label>
      <label class="field"><span>${t('a_limit_products')}</span><input class="input num" name="product_ids" value="${ids(c.product_ids).join(', ')}" placeholder="12, 45"></label>
      <label class="field"><span>${t('a_limit_users')}</span><input class="input num" name="user_ids" value="${ids(c.user_ids).join(', ')}" placeholder="3, 9"></label>
      <label class="field full"><span>${t('note')}</span><input class="input" name="note" value="${esc(c.note || '')}"></label>
      <div class="full">${sw('active', c.active, t('a_active'))}</div></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>${t('cancel')}</button><button class="btn btn-accent">${t('save')}</button></div></form>`, { wide: true });
    m.querySelector('[data-close]').addEventListener('click', closeOverlay);
    const f = m.querySelector('#cpf');
    f.type.addEventListener('change', () => { m.querySelector('#vunit').textContent = `(${f.type.value === 'percent' ? '%' : 'DZD'})`; });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const btn = f.querySelector('.btn-accent');
      const list = s => s.split(/[\s,]+/).map(Number).filter(Boolean);
      const body = { code: f.code.value, type: f.type.value, value: f.value.value, max_discount: f.max_discount.value, min_order: f.min_order.value || 0, usage_limit: f.usage_limit.value, per_user_limit: f.per_user_limit.value,
        starts_at: fromLocalInput(f.starts_at.value), ends_at: fromLocalInput(f.ends_at.value), category_ids: [...f.category_ids.selectedOptions].map(o => Number(o.value)), product_ids: list(f.product_ids.value), user_ids: list(f.user_ids.value), note: f.note.value, active: f.active.checked };
      try { busy(btn, true); if (isNew) await api('POST', '/api/admin/coupons', body); else await api('PUT', '/api/admin/coupons/' + c.id, body); closeOverlay(); toast(t('saved')); route(); } catch (er) { busy(btn, false); toast(errMsg(er), 'err'); }
    });
  }

  // =====================================================================
  // SHIPPING — carriers + rate matrix
  // =====================================================================
  on(/^\/admin\/shipping$/, async ({ q, alive }) => {
    const cs = await carriers(true); if (!alive()) return;
    const cid = Number(q.carrier) || cs[0]?.id;
    const [rows, wilayas] = await Promise.all([api('GET', '/api/admin/shipping/matrix?carrier_id=' + cid), api('GET', '/api/wilayas')]); if (!alive()) return;
    title(t('a_shipping'));
    const filled = rows.filter(w => w.home || w.office).length;
    const conn = c => c.connected ? `<span class="conn ok">${icon('check')} ${t('a_connected')}</span>` : c.mode === 'api' && c.has_credentials && c.last_test_at && !c.last_test_ok ? `<span class="conn bad">${icon('alert')} ${t('a_conn_failed')}</span>` : `<span class="conn no">${t('a_not_connected')}</span>`;
    view(`<div class="adm-grid-2">${cs.map(c => `<form class="card panel" data-carrier="${c.id}"><div class="sec-title"><h2>${esc(c.name)}</h2>${conn(c)}</div>
        <div class="form-grid">${`<div class="full row wrap" style="gap:18px">${sw('enabled', c.enabled, t('a_enabled'))}</div>`}
          <label class="field"><span>${t('a_mode')}</span><select class="input" name="mode">${opt('manual', t('a_manual_mode'), c.mode)}${opt('api', 'API', c.mode)}</select></label>
          <label class="field"><span>${t('a_from_wilaya')}</span><select class="input" name="from_wilaya_id">${opt('', '—', c.from_wilaya_id)}${wilayas.map(w => opt(w.id, `${w.code} — ${L(w, 'name')}`, c.from_wilaya_id)).join('')}</select></label>
          <label class="field full"><span>${t('a_api_base')}</span><input class="input num" name="api_base" value="${esc(c.api_base || '')}" dir="ltr"></label>
          <label class="field"><span>${c.code === 'yalidine' ? 'API ID' : 'Token'}</span><input class="input num" name="api_id" value="${esc(c.api_id)}" autocomplete="off" dir="ltr"></label>
          <label class="field"><span>${c.code === 'yalidine' ? 'API Token' : 'Key'}</span><input class="input num" name="api_secret" type="password" value="${esc(c.api_secret)}" autocomplete="new-password" dir="ltr"></label>
          <label class="field full"><span>${t('a_tracking_url')}</span><input class="input num" name="tracking_url" value="${esc(c.tracking_url || '')}" dir="ltr" placeholder="https://…{tracking}"></label></div>
        ${c.last_test_at ? `<p class="hint mt">${t('a_last_test')}: ${fmtDate(c.last_test_at)} — ${esc(c.last_test_msg || '')}</p>` : ''}
        <div class="row wrap mt"><button class="btn btn-sm">${t('save')}</button><button type="button" class="btn btn-ghost btn-sm" data-test="${c.id}" ${c.has_credentials ? '' : 'disabled'}>${icon('wifi')} ${t('a_test_conn')}</button></div></form>`).join('')}</div>
      <div class="msg msg-info mt">${icon('info')}<span>${t('a_carrier_note')}</span></div>
      <div class="card panel mt"><div class="sec-title"><h2>${t('a_rates')}</h2><div class="seg" id="csel">${cs.map(c => `<button data-c="${c.id}" class="${c.id === cid ? 'on' : ''}">${esc(c.name)}</button>`).join('')}</div></div>
        <p class="hint">${t('a_rates_hint', { n: filled })}</p>
        <form id="bulk" class="toolbar-a mt" style="background:var(--soft);padding:12px;border-radius:14px"><b class="small">${t('a_bulk')}</b>
          <select class="input" name="method">${opt('home', t('home_delivery'))}${opt('office', t('office_delivery'))}</select>
          <input class="input" name="price" inputmode="decimal" placeholder="${t('price')} (DZD)" required style="min-width:120px;width:130px"><input class="input" name="days" placeholder="${t('a_days_ph')}" style="min-width:100px;width:110px">
          <input class="input" name="extra_per_kg" inputmode="decimal" placeholder="${t('a_extra_kg')}" style="min-width:130px;width:150px"><label class="check"><input type="checkbox" name="only_empty" checked> ${t('a_only_empty')}</label><button class="btn btn-sm">${t('apply')}</button></form>
        <form id="mx"><div class="table-wrap mt"><table class="tbl compact"><thead><tr><th>#</th><th>${t('wilaya')}</th><th>${t('home_delivery')} (DZD)</th><th>${t('days')}</th><th>${t('office_delivery')} (DZD)</th><th>${t('days')}</th><th>${t('a_commune_rates')}</th><th>${t('a_active')}</th></tr></thead><tbody>
          ${rows.map(w => `<tr data-w="${w.id}"><td class="num tiny">${esc(w.code)}</td><td class="small bold">${esc(L(w, 'name'))}</td>
            <td><input class="input sm rate-in" name="home" inputmode="decimal" value="${majorStr(w.home?.price)}" placeholder="—"></td><td><input class="input sm" name="home_days" value="${esc(w.home?.days || '')}" style="width:76px"></td>
            <td><input class="input sm rate-in" name="office" inputmode="decimal" value="${majorStr(w.office?.price)}" placeholder="—"></td><td><input class="input sm" name="office_days" value="${esc(w.office?.days || '')}" style="width:76px"></td>
            <td><button type="button" class="btn btn-ghost btn-sm" data-comm="${w.id}">${w.overrides ? `<b>${w.overrides}</b> / ` : ''}${w.communes}</button></td><td><label class="switch"><input type="checkbox" data-wact="${w.id}" ${w.active !== 0 ? 'checked' : ''} aria-label="${t('a_active')}"></label></td></tr>`).join('')}</tbody></table></div>
          <div class="row mt" style="justify-content:flex-end;position:sticky;bottom:12px"><button class="btn btn-accent btn-lg" id="mxsave">${icon('check')} ${t('a_save_rates')}</button></div></form></div>`);
    $$('#csel [data-c]').forEach(b => b.addEventListener('click', () => setQ({ carrier: b.dataset.c })));
    $$('[data-carrier]').forEach(f => f.addEventListener('submit', async e => {
      e.preventDefault(); const body = formData(f); body.enabled = f.enabled.checked;
      const ok = await act(f.querySelector('button'), () => api('PUT', '/api/admin/carriers/' + f.dataset.carrier, body)).catch(() => null); if (ok) { A.carriers = null; route(); }
    }));
    $$('[data-test]').forEach(b => b.addEventListener('click', async () => {
      busy(b, true);
      try { const r = await api('POST', `/api/admin/carriers/${b.dataset.test}/test`); toast(r.ok ? t('a_conn_ok') : `${t('a_conn_failed')}: ${r.message || ''}`, r.ok ? 'ok' : 'err'); A.carriers = null; route(); }
      catch (e) { busy(b, false); toast(errMsg(e), 'err'); }
    }));
    const byId = Object.fromEntries(rows.map(w => [w.id, w]));
    $('#bulk').addEventListener('submit', async e => {
      e.preventDefault(); const b = formData(e.target);
      const r = await act(e.target.querySelector('button'), () => api('POST', '/api/admin/shipping/bulk', { carrier_id: cid, method: b.method, price: b.price, days: b.days, extra_per_kg: b.extra_per_kg || 0, only_empty: !!b.only_empty }), false).catch(() => null);
      if (r) { toast(t('a_bulk_done', { n: r.count })); route(); }
    });
    $('#mx').addEventListener('submit', async e => {
      e.preventDefault();
      const out = [];
      $$('#mx tr[data-w]').forEach(tr => {
        const w = byId[tr.dataset.w]; const row = { wilaya_id: w.id }; let changed = false;
        for (const mth of ['home', 'office']) {
          const price = $(`[name=${mth}]`, tr).value.trim(); const days = $(`[name=${mth}_days]`, tr).value.trim(); const cur = w[mth];
          if (price !== majorStr(cur?.price) || days !== (cur?.days || '')) { changed = true; row[mth] = price === '' ? null : { price, days, included_kg: cur?.included_kg ?? 5, extra_per_kg: majorStr(cur?.extra_per_kg || 0) }; }
        }
        if (changed) out.push(row);
      });
      if (!out.length) return toast(t('a_no_changes'), 'info');
      const ok = await act($('#mxsave'), () => api('PUT', '/api/admin/shipping/matrix', { carrier_id: cid, rows: out })).catch(() => null); if (ok) route();
    });
    $$('[data-wact]').forEach(i => i.addEventListener('change', async () => { try { await api('PUT', '/api/admin/wilayas/' + i.dataset.wact, { active: i.checked }); toast(t('saved')); } catch (er) { i.checked = !i.checked; toast(errMsg(er), 'err'); } }));
    $$('[data-comm]').forEach(b => b.addEventListener('click', () => communeModal(cid, byId[b.dataset.comm])));
  }, 'shipping');
  async function communeModal(cid, w) {
    const list = await api('GET', `/api/admin/shipping/communes?carrier_id=${cid}&wilaya_id=${w.id}`);
    const m = modal(`<h3>${esc(L(w, 'name'))} — ${t('a_commune_rates')}</h3><p class="hint">${t('a_commune_hint')}</p>
      <form id="cmf"><div class="table-wrap mt" style="max-height:55vh;overflow:auto"><table class="tbl compact"><thead><tr><th>${t('commune')}</th><th>${t('home_delivery')}</th><th>${t('office_delivery')}</th><th>${t('a_active')}</th></tr></thead><tbody>
        ${list.map(c => `<tr data-c="${c.id}"><td class="small">${esc(L(c, 'name'))}</td><td><input class="input sm rate-in" name="home" inputmode="decimal" value="${majorStr(c.home?.price)}" placeholder="${majorStr(w.home?.price) || '—'}"></td>
          <td><input class="input sm rate-in" name="office" inputmode="decimal" value="${majorStr(c.office?.price)}" placeholder="${majorStr(w.office?.price) || '—'}"></td><td><input type="checkbox" data-cact="${c.id}" ${c.active !== 0 ? 'checked' : ''} aria-label="${t('a_active')}"></td></tr>`).join('')}</tbody></table></div>
      <div class="row wrap mt between"><button type="button" class="btn btn-ghost btn-sm" id="addc">${icon('plus')} ${t('a_add_commune')}</button><button class="btn btn-accent">${t('save')}</button></div></form>`, { wide: true });
    const byC = Object.fromEntries(list.map(c => [c.id, c]));
    m.querySelector('#cmf').addEventListener('submit', async e => {
      e.preventDefault(); const rows = [];
      $$('tr[data-c]', m).forEach(tr => { const c = byC[tr.dataset.c]; const row = { wilaya_id: w.id, commune_id: c.id }; let ch = false;
        for (const mth of ['home', 'office']) { const v = $(`[name=${mth}]`, tr).value.trim(); if (v !== majorStr(c[mth]?.price)) { ch = true; row[mth] = v === '' ? null : { price: v, days: (c[mth] || w[mth])?.days || '' }; } }
        if (ch) rows.push(row); });
      try { if (rows.length) await api('PUT', '/api/admin/shipping/matrix', { carrier_id: cid, rows }); toast(t('saved')); closeOverlay(); route(); } catch (er) { toast(errMsg(er), 'err'); }
    });
    $$('[data-cact]', m).forEach(i => i.addEventListener('change', async () => { try { await api('PUT', '/api/admin/communes/' + i.dataset.cact, { active: i.checked }); } catch (er) { i.checked = !i.checked; toast(errMsg(er), 'err'); } }));
    m.querySelector('#addc').addEventListener('click', async () => {
      const v = await promptForm(t('a_add_commune'), [{ name: 'name_ar', label: t('a_name_ar'), required: true }, { name: 'name_en', label: t('a_name_en'), required: true }]); if (!v) return;
      try { await api('POST', '/api/admin/communes', { ...v, wilaya_id: w.id }); toast(t('saved')); communeModal(cid, w); } catch (er) { toast(errMsg(er), 'err'); }
    });
  }

  // =====================================================================
  // SUPPORT
  // =====================================================================
  on(/^\/admin\/support$/, async ({ q, alive }) => {
    const rows = await api('GET', '/api/admin/tickets' + qs(q)); if (!alive()) return;
    title(t('a_tickets'));
    view(`<div class="card panel"><form class="toolbar-a" id="tkf"><input class="input grow" type="search" name="q" value="${esc(q.q || '')}" placeholder="${t('a_search_tickets')}">
        <select class="input" name="status">${opt('', t('a_open_tickets'), q.status)}${['open', 'customer_reply', 'answered', 'closed'].map(s => opt(s, t('tk_' + s), q.status)).join('')}</select>
        <select class="input" name="priority">${opt('', t('a_all_priorities'), q.priority)}${['urgent', 'high', 'normal', 'low'].map(s => opt(s, t('pr_' + s), q.priority)).join('')}</select><button class="btn btn-sm">${icon('filter')} ${t('apply')}</button></form>
      ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${t('reference')}</th><th>${t('subject')}</th><th>${t('a_customer')}</th><th>${t('ticket_type')}</th><th>${t('order')}</th><th>${t('a_priority')}</th><th>${t('status')}</th><th>${t('a_updated')}</th></tr></thead><tbody>
        ${rows.map(x => `<tr class="click" data-href="/admin/support/${x.id}"><td class="num small bold">${esc(x.ref)}</td><td class="small bold">${esc(x.subject)}</td><td>${custCell(x)}</td><td class="small">${t('tt_' + x.type)}</td><td class="num tiny">${esc(x.order_number || '—')}</td>
          <td><span class="status ${x.priority === 'urgent' ? 's-red' : x.priority === 'high' ? 's-orange' : ''}">${t('pr_' + x.priority)}</span></td><td>${tkStatus(x.status)}</td><td class="tiny nowrap">${fmtDate(x.updated_at)}${x.assignee ? `<div class="muted">${esc(x.assignee)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty(t('no_tickets'))}</div>`);
    $('#tkf').addEventListener('submit', e => { e.preventDefault(); setQ(formData(e.target)); });
  }, 'support');
  on(/^\/admin\/support\/(\d+)$/, async ({ m, alive }) => {
    const tk = await api('GET', '/api/admin/tickets/' + m[1]); if (!alive()) return;
    title(`${tk.ref} — ${tk.subject}`);
    view(`<div class="row between wrap mb">${back('/admin/support', t('a_tickets'))}${tkStatus(tk.status)}</div>
      <div class="adm-grid" style="margin-top:0"><div class="card panel"><h2>${esc(tk.subject)}</h2><div class="thread">${tk.messages.map(x => `<div class="bubble ${x.is_staff ? 'me' : ''}"><div class="meta">${esc(x.author)} • ${fmtDate(x.created_at)}</div><div style="white-space:pre-wrap">${esc(x.body)}</div>
          ${x.file_id ? `<a href="${fileUrl(x.file_id)}" target="_blank" rel="noopener" class="small bold" style="display:inline-flex;gap:6px;margin-top:6px">${icon('clip')} ${t('a_attachment')}</a>` : ''}</div>`).join('')}</div>
        <form id="rpf" class="stack mt"><textarea class="input" name="body" required placeholder="${t('reply_ph')}"></textarea><div class="row wrap between"><input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="small">
          <div class="row"><label class="check"><input type="checkbox" name="close" value="1"> ${t('a_close_after')}</label><button class="btn btn-accent">${icon('send')} ${t('reply')}</button></div></div></form></div>
        <div class="stack gap-lg"><div class="card panel"><h2>${t('details')}</h2><dl class="kv"><dt>${t('a_customer')}</dt><dd><a href="/admin/customers/${tk.user_id}" style="color:var(--accent-ink)">${esc(tk.customer)}</a><div class="tiny muted">${esc(tk.email)} ${esc(tk.phone || '')}</div></dd>
          <dt>${t('ticket_type')}</dt><dd>${t('tt_' + tk.type)}</dd>${tk.order_number ? `<dt>${t('order')}</dt><dd class="num">${can('orders') && tk.order_id ? `<a href="/admin/orders/${tk.order_id}" style="color:var(--accent-ink)">${esc(tk.order_number)}</a>` : esc(tk.order_number)}</dd>` : ''}<dt>${t('date')}</dt><dd>${fmtDate(tk.created_at)}</dd></dl>
          <form id="tmf" class="stack mt"><label class="field"><span>${t('status')}</span><select class="input" name="status">${['open', 'customer_reply', 'answered', 'closed'].map(s => opt(s, t('tk_' + s), tk.status)).join('')}</select></label>
            <label class="field"><span>${t('a_priority')}</span><select class="input" name="priority">${['low', 'normal', 'high', 'urgent'].map(s => opt(s, t('pr_' + s), tk.priority)).join('')}</select></label>
            <label class="field"><span>${t('a_assignee')}</span><select class="input" name="assigned_to">${opt('', '—', tk.assigned_to)}${tk.staff.map(s => opt(s.id, s.name, tk.assigned_to)).join('')}</select></label><button class="btn btn-sm">${t('save')}</button></form></div></div></div>`);
    $('#rpf').addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.target); if (!e.target.file.files[0]) fd.delete('file'); const ok = await act(e.target.querySelector('.btn-accent'), () => api('POST', `/api/admin/tickets/${tk.id}/reply`, fd), t('a_reply_sent')).catch(() => null); if (ok) { refreshPending(); route(); } });
    $('#tmf').addEventListener('submit', async e => { e.preventDefault(); const ok = await act(e.target.querySelector('button'), () => api('PUT', '/api/admin/tickets/' + tk.id, formData(e.target))).catch(() => null); if (ok) route(); });
  }, 'support');

  // =====================================================================
  // CONTENT — pages + FAQ
  // =====================================================================
  const PAGE_SLUGS = ['about', 'shipping', 'returns', 'cancellation', 'payment', 'privacy', 'terms'];
  const FAQ_GROUPS = ['delivery', 'orders', 'payment', 'refunds', 'wallet'];
  on(/^\/admin\/content$/, async ({ q, alive }) => {
    const tab = q.tab || 'pages';
    const [pages, faqs] = await Promise.all([api('GET', '/api/admin/pages'), api('GET', '/api/admin/faqs')]); if (!alive()) return;
    title(t('a_content'));
    const slug = q.slug || 'about'; const pg = pages.find(p => p.slug === slug) || { slug, title_ar: '', title_en: '', body_ar: '', body_en: '' };
    view(`<div class="card panel"><div class="tabs" id="ctabs"><button data-tab="pages" class="${tab === 'pages' ? 'on' : ''}">${t('a_pages')}</button><button data-tab="faq" class="${tab === 'faq' ? 'on' : ''}">${t('faq')}</button></div>
      ${tab === 'pages' ? `<div class="row wrap mb">${PAGE_SLUGS.map(s => `<button class="chip ${s === slug ? 'on' : ''}" data-slug="${s}">${t('pg_' + s)}</button>`).join('')}</div>
        <form id="pgf" class="form-grid"><label class="field"><span>${t('a_title_ar')}</span><input class="input" name="title_ar" dir="rtl" required value="${esc(pg.title_ar)}"></label><label class="field"><span>${t('a_title_en')}</span><input class="input" name="title_en" dir="ltr" required value="${esc(pg.title_en)}"></label>
          <label class="field"><span>${t('a_body_ar')}</span><textarea class="input" name="body_ar" dir="rtl" required style="min-height:340px">${esc(pg.body_ar)}</textarea></label><label class="field"><span>${t('a_body_en')}</span><textarea class="input" name="body_en" dir="ltr" required style="min-height:340px">${esc(pg.body_en)}</textarea></label>
          <div class="full row between"><span class="hint">${t('a_body_hint')}${pg.updated_at ? ' • ' + t('a_updated') + ': ' + fmtDate(pg.updated_at) : ''}</span><div class="row"><a class="btn btn-ghost btn-sm" href="/page/${slug}" target="_blank" rel="noopener">${icon('eye')} ${t('a_preview')}</a><button class="btn btn-accent">${t('save')}</button></div></div></form>`
      : `<div class="sec-title"><span class="hint">${t('a_faq_hint')}</span><button class="btn btn-accent btn-sm" id="fqadd">${icon('plus')} ${t('add')}</button></div>
        ${FAQ_GROUPS.map(g => { const list = faqs.filter(f => f.grp === g); return `<h3 class="mt">${t('faq_' + g)}</h3>${list.length ? `<div class="stack" style="gap:6px">${list.map(f => `<div class="row card" style="padding:10px 14px"><div class="grow"><b class="small">${esc(L(f, 'q'))}</b><div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(L(f, 'a'))}</div></div><span class="badge-soft">${f.sort}</span><button class="icon-btn" data-fq="${f.id}" aria-label="${t('edit')}">${icon('edit')}</button><button class="icon-btn" data-fqdel="${f.id}" aria-label="${t('delete')}">${icon('trash')}</button></div>`).join('')}</div>` : `<p class="muted small">—</p>`}`; }).join('')}`}</div>`);
    $$('#ctabs [data-tab]').forEach(b => b.addEventListener('click', () => setQ({ tab: b.dataset.tab, slug: '' })));
    $$('[data-slug]').forEach(b => b.addEventListener('click', () => setQ({ slug: b.dataset.slug })));
    $('#pgf')?.addEventListener('submit', async e => { e.preventDefault(); await act(e.target.querySelector('.btn-accent'), () => api('PUT', '/api/admin/pages/' + slug, formData(e.target))).catch(() => null); });
    const faqForm = f => {
      f = f || { grp: 'delivery', sort: 0 };
      const mm = modal(`<h3>${f.id ? t('edit') : t('add')} — ${t('faq')}</h3><form id="fqf" class="stack mt"><div class="form-grid">
        <label class="field"><span>${t('a_group')}</span><select class="input" name="grp">${FAQ_GROUPS.map(g => opt(g, t('faq_' + g), f.grp)).join('')}</select></label><label class="field"><span>${t('a_sort')}</span><input class="input" type="number" min="0" name="sort" value="${f.sort || 0}"></label>
        <label class="field"><span>${t('a_q_ar')}</span><input class="input" name="q_ar" dir="rtl" required value="${esc(f.q_ar || '')}"></label><label class="field"><span>${t('a_q_en')}</span><input class="input" name="q_en" dir="ltr" required value="${esc(f.q_en || '')}"></label>
        <label class="field"><span>${t('a_a_ar')}</span><textarea class="input" name="a_ar" dir="rtl" required>${esc(f.a_ar || '')}</textarea></label><label class="field"><span>${t('a_a_en')}</span><textarea class="input" name="a_en" dir="ltr" required>${esc(f.a_en || '')}</textarea></label></div>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>${t('cancel')}</button><button class="btn btn-accent">${t('save')}</button></div></form>`, { wide: true });
      mm.querySelector('[data-close]').addEventListener('click', closeOverlay);
      mm.querySelector('#fqf').addEventListener('submit', async e => { e.preventDefault(); const ok = await act(e.target.querySelector('.btn-accent'), () => api('POST', '/api/admin/faqs', { ...formData(e.target), id: f.id })).catch(() => null); if (ok) { closeOverlay(); route(); } });
    };
    $('#fqadd')?.addEventListener('click', () => faqForm());
    $$('[data-fq]').forEach(b => b.addEventListener('click', () => faqForm(faqs.find(f => f.id === Number(b.dataset.fq)))));
    $$('[data-fqdel]').forEach(b => b.addEventListener('click', async () => { if (!(await confirmBox(t('confirm_delete'), { danger: true }))) return; try { await api('DELETE', '/api/admin/faqs/' + b.dataset.fqdel); route(); } catch (e) { toast(errMsg(e), 'err'); } }));
  }, 'settings');

  // =====================================================================
  // SETTINGS
  // =====================================================================
  const MONEY_KEYS = ['topup_min_dzd', 'topup_max_dzd', 'withdraw_min_dzd', 'withdraw_max_dzd', 'withdraw_fee_fixed_dzd', 'free_shipping_min_dzd'];
  on(/^\/admin\/settings$/, async ({ q, alive }) => {
    const s = await api('GET', '/api/admin/settings'); if (!alive()) return;
    S.settings = s; title(t('a_settings'));
    const tab = q.tab || 'general';
    const val = k => MONEY_KEYS.includes(k) ? majorStr(Number(s[k] || 0)) : (s[k] ?? '');
    const inp = (k, label, { dir, type = 'text', hint, full, inputmode } = {}) => `<label class="field ${full ? 'full' : ''}"><span>${esc(label)}</span><input class="input" name="${k}" type="${type}" ${dir ? `dir="${dir}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''} value="${esc(val(k))}">${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</label>`;
    const ta = (k, label, dir) => `<label class="field"><span>${esc(label)}</span><textarea class="input" name="${k}" dir="${dir}">${esc(s[k] || '')}</textarea></label>`;
    const tog = (k, label) => `<div>${sw(k, s[k] === '1', label)}</div>`;
    const TABS = ['general', 'payments', 'wallet', 'currency', 'orders', 'contact', 'notifications'];
    const body = {
      general: `<div class="form-grid">${inp('store_name_ar', t('a_store_name_ar'), { dir: 'rtl' })}${inp('store_name_en', t('a_store_name_en'), { dir: 'ltr' })}${inp('hero_title_ar', t('a_hero_title_ar'), { dir: 'rtl' })}${inp('hero_title_en', t('a_hero_title_en'), { dir: 'ltr' })}
        ${ta('hero_sub_ar', t('a_hero_sub_ar'), 'rtl')}${ta('hero_sub_en', t('a_hero_sub_en'), 'ltr')}${inp('announcement_ar', t('a_announce_ar'), { dir: 'rtl' })}${inp('announcement_en', t('a_announce_en'), { dir: 'ltr' })}
        <label class="field"><span>${t('a_default_lang')}</span><select class="input" name="default_lang">${opt('ar', 'العربية', s.default_lang)}${opt('en', 'English', s.default_lang)}</select></label><div></div>
        ${['color_accent', 'color_sale', 'color_info'].map(k => `<label class="field"><span>${t('a_' + k)}</span><div class="row"><input type="color" name="${k}" value="${esc(s[k])}" style="width:52px;height:42px;border:0;background:none;padding:0"><span class="num small">${esc(s[k])}</span></div></label>`).join('')}
        <label class="field"><span>${t('a_logo')}</span><div class="row">${s.logo_path ? `<img src="${esc(s.logo_path)}" alt="" style="height:42px;border-radius:8px;border:1px solid var(--line)">` : ''}<input type="file" id="logo" accept="image/png,image/webp,image/jpeg" class="small"></div></label></div>`,
      payments: `<div class="stack">${tog('pay_wallet_enabled', t('a_pay_wallet_on'))}${tog('pay_cod_enabled', t('a_pay_cod_on'))}</div>
        <h3 class="mt-lg">${t('a_ccp_section')}</h3><div class="form-grid">${tog('topup_ccp_enabled', t('a_topup_ccp_on'))}${tog('withdraw_ccp_enabled', t('a_withdraw_ccp_on'))}
          ${inp('ccp_account_name', t('account_holder'))}${inp('ccp_account_number', t('account_number'), { dir: 'ltr' })}${inp('ccp_key', t('account_key'), { dir: 'ltr' })}${inp('ccp_rip', 'RIP', { dir: 'ltr' })}
          ${ta('ccp_instructions_ar', t('a_instr_ar'), 'rtl')}${ta('ccp_instructions_en', t('a_instr_en'), 'ltr')}</div>
        ${!s.ccp_account_number ? `<div class="msg msg-warn mt">${icon('alert')}<span>${t('a_ccp_missing')}</span></div>` : ''}
        <h3 class="mt-lg">USDT</h3><div class="msg msg-warn">${icon('shield')}<span>${t('a_usdt_legal')}</span></div>
        <div class="form-grid mt">${isAdmin() ? `<div class="full">${sw('usdt_legal_ack', s.usdt_legal_ack === '1', t('a_usdt_ack'))}</div>` : `<div class="full hint">${t('a_usdt_ack_admin')}</div>`}
          ${tog('topup_usdt_enabled', t('a_topup_usdt_on'))}${tog('withdraw_usdt_enabled', t('a_withdraw_usdt_on'))}
          <label class="field"><span>${t('network')}</span><select class="input" name="usdt_network">${['TRC20', 'ERC20', 'BEP20'].map(n => opt(n, n, s.usdt_network)).join('')}</select></label>${inp('usdt_address', t('receive_address'), { dir: 'ltr' })}
          ${ta('usdt_instructions_ar', t('a_instr_ar'), 'rtl')}${ta('usdt_instructions_en', t('a_instr_en'), 'ltr')}</div>`,
      wallet: `<div class="form-grid">${inp('topup_min_dzd', t('a_topup_min'), { inputmode: 'decimal' })}${inp('topup_max_dzd', t('a_topup_max'), { inputmode: 'decimal' })}${inp('withdraw_min_dzd', t('a_withdraw_min'), { inputmode: 'decimal' })}${inp('withdraw_max_dzd', t('a_withdraw_max'), { inputmode: 'decimal' })}
        ${inp('withdraw_fee_percent', t('a_withdraw_fee_pct'), { inputmode: 'decimal', hint: '0 – 50' })}${inp('withdraw_fee_fixed_dzd', t('a_withdraw_fee_fixed'), { inputmode: 'decimal' })}</div><p class="hint mt">${t('a_wallet_settings_note')}</p>`,
      currency: `<div class="form-grid"><label class="field"><span>${t('a_fx_rate')}</span><input class="input num" name="fx_usd_rate" inputmode="decimal" value="${(Number(s.fx_usd_rate_micro) / 1e6).toFixed(2)}"><small class="hint">${t('a_fx_updated')}: ${s.fx_updated_at ? fmtDate(s.fx_updated_at) : '—'}</small></label></div>
        <div class="msg msg-info mt">${icon('info')}<span>${t('a_fx_note')}</span></div>`,
      orders: `<div class="form-grid">${inp('pending_order_ttl_hours', t('a_ttl_hours'), { type: 'number', hint: t('a_ttl_hint') })}${inp('return_window_days', t('a_return_days'), { type: 'number' })}${inp('new_days', t('a_new_days'), { type: 'number' })}${inp('low_stock_threshold', t('a_low_stock_th'), { type: 'number' })}
        ${inp('free_shipping_min_dzd', t('a_free_ship_min'), { inputmode: 'decimal', hint: t('a_free_ship_hint') })}</div>`,
      contact: `<div class="form-grid">${inp('contact_phone', t('phone'), { dir: 'ltr' })}${inp('contact_email', t('email'), { dir: 'ltr' })}${inp('contact_address_ar', t('a_address_ar'), { dir: 'rtl' })}${inp('contact_address_en', t('a_address_en'), { dir: 'ltr' })}
        ${['social_facebook', 'social_instagram', 'social_tiktok', 'social_whatsapp'].map(k => inp(k, k.replace('social_', '').replace(/^./, c => c.toUpperCase()), { dir: 'ltr' })).join('')}</div>`,
      notifications: `<div class="stack">${tog('notify_staff_orders', t('a_notify_orders'))}${tog('notify_staff_finance', t('a_notify_finance'))}${tog('notify_staff_support', t('a_notify_support'))}</div>
        <div class="msg ${s.mail_configured ? 'msg-ok' : 'msg-warn'} mt">${icon(s.mail_configured ? 'check-circle' : 'alert')}<span>${s.mail_configured ? t('a_mail_ok') : t('a_mail_missing')}</span></div>`,
    };
    view(`<div class="card panel"><div class="tabs" id="stt">${TABS.map(k => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${t('a_st_' + k)}</button>`).join('')}</div>
      <form id="stf">${body[tab]}<div class="row mt-lg" style="justify-content:flex-end"><button class="btn btn-accent btn-lg">${icon('check')} ${t('save')}</button></div></form></div>`);
    $$('#stt [data-tab]').forEach(b => b.addEventListener('click', () => setQ({ tab: b.dataset.tab })));
    $$('#stf input[type=color]').forEach(i => i.addEventListener('input', () => { i.nextElementSibling.textContent = i.value; }));
    $('#logo')?.addEventListener('change', async e => { const fd = new FormData(); fd.append('logo', e.target.files[0]); try { await api('POST', '/api/admin/settings/logo', fd); toast(t('saved')); route(); } catch (er) { toast(errMsg(er), 'err'); } });
    $('#stf').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target; const out = {};
      $$('input[name],select[name],textarea[name]', f).forEach(el => { out[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
      const ok = await act(f.querySelector('.btn-accent'), () => api('PUT', '/api/admin/settings', out)).catch(() => null); if (ok) route();
    });
  }, 'settings');

  // =====================================================================
  // STAFF
  // =====================================================================
  const ROLES = ['admin', 'manager', 'finance', 'support'];
  on(/^\/admin\/staff$/, async ({ alive }) => {
    const rows = await api('GET', '/api/admin/staff'); if (!alive()) return;
    title(t('a_staff'));
    view(`<div class="card panel"><div class="sec-title"><h2>${t('a_staff')}</h2><button class="btn btn-accent btn-sm" id="stadd">${icon('plus')} ${t('a_add_staff')}</button></div>
      <div class="msg msg-info mb">${icon('info')}<span>${t('a_roles_note')}</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>${t('name')}</th><th>${t('email')}</th><th>${t('a_role')}</th><th>${t('status')}</th><th>${t('a_joined')}</th><th></th></tr></thead><tbody>
      ${rows.map(u => `<tr><td class="bold small">${esc(u.name)}${u.id === A.me.id ? ` <span class="badge-soft">${t('you')}</span>` : ''}</td><td class="small">${esc(u.email)}</td><td><span class="badge-soft">${roleName(u.role)}</span></td><td><span class="status ${u.status === 'active' ? 's-green' : 's-red'}">${t('a_us_' + u.status)}</span></td>
        <td class="tiny">${fmtDate(u.created_at, false)}</td><td>${u.id !== A.me.id ? `<button class="icon-btn" data-sted="${u.id}" aria-label="${t('edit')}">${icon('edit')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`);
    $('#stadd').addEventListener('click', () => {
      const m = modal(`<h3>${t('a_add_staff')}</h3><p class="hint">${t('a_add_staff_hint')}</p><form id="saf" class="stack mt"><div class="form-grid">
        <label class="field"><span>${t('name')}</span><input class="input" name="name" required></label><label class="field"><span>${t('email')}</span><input class="input" name="email" type="email" required></label>
        <label class="field"><span>${t('phone')}</span><input class="input" name="phone" placeholder="05XX XX XX XX"></label><label class="field"><span>${t('a_role')}</span><select class="input" name="role">${ROLES.map(r => opt(r, roleName(r), 'support')).join('')}</select></label>
        <label class="field full"><span>${t('password')}</span><input class="input" name="password" type="password" autocomplete="new-password"><small class="hint">${t('password_hint')}</small></label></div>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>${t('cancel')}</button><button class="btn btn-accent">${t('save')}</button></div></form>`, { wide: true });
      m.querySelector('[data-close]').addEventListener('click', closeOverlay);
      m.querySelector('#saf').addEventListener('submit', async e => { e.preventDefault(); const ok = await act(e.target.querySelector('.btn-accent'), () => api('POST', '/api/admin/staff', formData(e.target))).catch(() => null); if (ok) { closeOverlay(); route(); } });
    });
    $$('[data-sted]').forEach(b => b.addEventListener('click', () => {
      const u = rows.find(x => x.id === Number(b.dataset.sted));
      const m = modal(`<h3>${esc(u.name)}</h3><form id="sef" class="stack mt"><label class="field"><span>${t('a_role')}</span><select class="input" name="role">${[...ROLES, 'customer'].map(r => opt(r, roleName(r), u.role)).join('')}</select></label>
        <label class="field"><span>${t('status')}</span><select class="input" name="status">${opt('active', t('a_us_active'), u.status)}${opt('suspended', t('a_us_suspended'), u.status)}</select></label><p class="hint">${t('a_staff_edit_note')}</p>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>${t('cancel')}</button><button class="btn btn-accent">${t('save')}</button></div></form>`);
      m.querySelector('[data-close]').addEventListener('click', closeOverlay);
      m.querySelector('#sef').addEventListener('submit', async e => { e.preventDefault(); const ok = await act(e.target.querySelector('.btn-accent'), () => api('PUT', '/api/admin/staff/' + u.id, formData(e.target))).catch(() => null); if (ok) { closeOverlay(); route(); } });
    }));
  }, 'staff');

  // =====================================================================
  // AUDIT LOG
  // =====================================================================
  on(/^\/admin\/audit$/, async ({ q, alive }) => {
    const page = Number(q.page) || 1; const lim = 50;
    const r = await api('GET', '/api/admin/audit' + qs({ ...q, page, limit: lim })); if (!alive()) return;
    title(t('a_audit'));
    const js = s => { if (!s) return ''; try { return JSON.stringify(JSON.parse(s), null, 1); } catch { return s; } };
    view(`<div class="card panel"><p class="hint" style="margin-top:0">${t('a_audit_note')}</p><form class="toolbar-a" id="auf"><input class="input" name="action" value="${esc(q.action || '')}" placeholder="${t('a_action_ph')}">
        <select class="input" name="entity">${opt('', t('a_all_entities'), q.entity)}${['order', 'product', 'variant', 'category', 'topup', 'withdrawal', 'refund', 'coupon', 'carrier', 'settings', 'user', 'page', 'faq', 'backup', 'wilaya', 'commune', 'review', 'wallet_transactions'].map(x => opt(x, x, q.entity)).join('')}</select><button class="btn btn-sm">${icon('filter')} ${t('apply')}</button></form>
      ${r.items.length ? `<div class="table-wrap"><table class="tbl compact"><thead><tr><th>${t('date')}</th><th>${t('a_actor')}</th><th>${t('a_action')}</th><th>${t('a_entity')}</th><th>${t('a_before')}</th><th>${t('a_after')}</th><th>IP</th></tr></thead><tbody>
        ${r.items.map(a => `<tr><td class="tiny nowrap">${fmtDate(a.created_at)}</td><td class="small">${esc(a.actor || '—')}<div class="tiny muted">${a.actor_role ? roleName(a.actor_role) : ''}</div></td><td class="num small bold">${esc(a.action)}</td><td class="tiny num">${esc(a.entity || '')} ${esc(a.entity_id || '')}</td>
          <td>${a.before_json ? `<div class="json">${esc(js(a.before_json))}</div>` : ''}</td><td>${a.after_json ? `<div class="json">${esc(js(a.after_json))}</div>` : ''}</td><td class="tiny num">${esc(a.ip || '')}</td></tr>`).join('')}</tbody></table></div>${pager(r.total, page, lim)}` : empty()}</div>`);
    $('#auf').addEventListener('submit', e => { e.preventDefault(); setQ(formData(e.target)); });
    bindPager($('#view'));
  }, 'audit');

  // =====================================================================
  // BACKUPS
  // =====================================================================
  on(/^\/admin\/backups$/, async ({ alive }) => {
    const rows = await api('GET', '/api/admin/backups'); if (!alive()) return;
    title(t('a_backups'));
    view(`<div class="card panel"><div class="sec-title"><h2>${t('a_backups')}</h2>${isAdmin() ? `<button class="btn btn-accent btn-sm" id="bknew">${icon('database')} ${t('a_backup_now')}</button>` : ''}</div>
      <div class="msg msg-info mb">${icon('info')}<span>${t('a_backup_note')}</span></div>
      ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${t('a_file')}</th><th>${t('a_size')}</th><th></th></tr></thead><tbody>${rows.map(b => `<tr><td class="num small">${esc(b.name)}</td><td class="small">${(b.size / 1048576).toFixed(2)} MB</td>
        <td>${isAdmin() ? `<a class="btn btn-ghost btn-sm" href="/api/admin/backups/${encodeURIComponent(b.name)}" download target="_blank">${icon('download')} ${t('a_download')}</a>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty()}</div>`);
    $('#bknew')?.addEventListener('click', async e => { const ok = await act(e.target.closest('button'), () => api('POST', '/api/admin/backups'), t('a_backup_done')).catch(() => null); if (ok) route(); });
  }, 'settings');

  void go; void silent;
})();
