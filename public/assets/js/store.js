/* Marché DZ — storefront SPA: shell, router, catalog, product, cart, checkout. */
(function () {
  'use strict';
  const M = window.MDZ;
  const { $, $$, esc, t, L, state: S, api, errMsg, money, icon, stars, toast, modal, closeOverlay, busy, debounce, uid, COLOR_HEX, colorName } = M;

  // ---------- extra strings ----------
  Object.assign(I18N.ar, {
    admin_panel: 'لوحة الإدارة', order_placed_d: 'سنؤكد طلبك قريبًا، ويمكنك متابعة حالته من هنا.', all_in: 'كل {name}', continue: 'متابعة',
    free_shipping_from: 'توصيل مجاني للطلبات ابتداءً من {amount}', choose_options_first: 'يرجى اختيار الخيارات أولًا', deliver_to: 'التوصيل إلى',
    review_before: 'راجع التفاصيل جيدًا قبل التأكيد', ordered_on: 'تاريخ الطلب', payment: 'الدفع', delivery_info: 'معلومات التوصيل',
    cancel_confirm: 'هل تريد إلغاء هذا الطلب؟ سيُحرَّر المخزون ويُعاد المبلغ إلى محفظتك إن كان مدفوعًا.', show_results: 'عرض النتائج',
    notif_all: 'كل الإشعارات', select: 'اختر', balance_after: 'الرصيد بعد الدفع', approx: 'ما يعادل {amount}', drop_or_click: 'اسحب الملف هنا أو انقر للاختيار (JPG / PNG / WEBP / PDF حتى 6MB)',
    file_selected: 'الملف: {name}', legal_usdt: 'تنبيه قانوني: يخضع التعامل بالأصول الرقمية في الجزائر لقيود تنظيمية. تحقّق من المتطلبات القانونية والتنظيمية المعمول بها قبل استعمال هذه الطريقة.',
    you_receive: 'ستستلم', reply_ph: 'اكتب ردّك…', attachment: 'مرفق', ticket_closed_note: 'هذه التذكرة مغلقة', last_update: 'آخر تحديث', items_n: '{n} منتج',
    view_order: 'عرض الطلب', my_account: 'حسابي', cod_unpaid_note: 'الدفع عند الاستلام: لا يُعتبر الطلب مدفوعًا إلا بعد تحصيل المبلغ عند التسليم.',
    refundable: 'المبلغ القابل للاسترداد', shop_now: 'تسوق الآن', verify_d: 'أدخل الرمز المكوّن من 6 أرقام المرسل إلى {email}', later: 'لاحقًا', secure_pay: 'دفع آمن',
    original_amount: 'المبلغ الأصلي', rate_used: 'سعر الصرف', type: 'النوع', method: 'الطريقة', admin_note: 'ملاحظة الإدارة', clear: 'مسح', next: 'التالي',
    store_prefs: 'اللغة والعملة', cart_merged: 'تم استرجاع سلة التسوق الخاصة بك', price_from: 'السعر', ship_free: 'مجاني', qty_limited: 'الكمية محدودة بالمخزون المتاح ({n})',
    cat_browse: 'تصفح الأقسام', fav_count: 'المفضلة', cart_count: 'في السلة', unread_n: 'غير مقروءة', see_order: 'تفاصيل الطلب', wallet_short: 'رصيد المحفظة',
    order_progress: 'مراحل الطلب', sub_items: 'المنتجات', no_rate_cart: 'لم يحدّد المتجر سعر توصيل لهذه الوجهة بعد — اختر وجهة أخرى أو تواصل مع الدعم.',
    pay_disabled: 'غير متاح حاليًا', new_badge_title: 'وصل حديثًا', zoom_hint: 'مرّر للتكبير • انقر للعرض الكامل', share: 'مشاركة', delivered_in: 'التوصيل خلال {d} أيام',
    search_hint: 'ابحث عن منتج…', topup_safe: 'لا يُضاف أي رصيد بمجرد رفع الوصل؛ يُضاف المبلغ فقط بعد تحقق الإدارة من التحويل.', ccp_short: 'CCP', usdt_short: 'USDT',
    err_address_not_found: 'العنوان غير موجود', err_order_not_found: 'الطلب غير موجود', err_too_many_addresses: 'لقد بلغت الحد الأقصى للعناوين',
    err_wilaya_unavailable: 'الولاية غير متاحة', err_order_changed: 'تغيّرت حالة الطلب، أعد تحميل الصفحة', err_bad_qty: 'كمية غير صالحة',
  });
  Object.assign(I18N.en, {
    admin_panel: 'Admin panel', order_placed_d: 'We will confirm your order shortly — track its status here.', all_in: 'All {name}', continue: 'Continue',
    free_shipping_from: 'Free delivery on orders from {amount}', choose_options_first: 'Please choose options first', deliver_to: 'Deliver to',
    review_before: 'Please review the details before confirming', ordered_on: 'Order date', payment: 'Payment', delivery_info: 'Delivery details',
    cancel_confirm: 'Cancel this order? Stock will be released and, if paid, the amount returned to your wallet.', show_results: 'Show results',
    notif_all: 'All notifications', select: 'Select', balance_after: 'Balance after payment', approx: '≈ {amount}', drop_or_click: 'Drop the file here or click to choose (JPG / PNG / WEBP / PDF up to 6MB)',
    file_selected: 'File: {name}', legal_usdt: 'Legal notice: dealing in crypto-assets in Algeria is subject to regulatory restrictions. Verify the applicable legal and regulatory requirements before using this method.',
    you_receive: 'You receive', reply_ph: 'Write your reply…', attachment: 'Attachment', ticket_closed_note: 'This ticket is closed', last_update: 'Last update', items_n: '{n} items',
    view_order: 'View order', my_account: 'My account', cod_unpaid_note: 'Cash on delivery: the order is only marked paid once the cash is collected on delivery.',
    refundable: 'Refundable amount', shop_now: 'Shop now', verify_d: 'Enter the 6-digit code sent to {email}', later: 'Later', secure_pay: 'Secure payment',
    original_amount: 'Original amount', rate_used: 'Exchange rate', type: 'Type', method: 'Method', admin_note: 'Admin note', clear: 'Clear', next: 'Next',
    store_prefs: 'Language & currency', cart_merged: 'Your cart has been restored', price_from: 'Price', ship_free: 'Free', qty_limited: 'Quantity limited to available stock ({n})',
    cat_browse: 'Browse categories', fav_count: 'Favorites', cart_count: 'In cart', unread_n: 'Unread', see_order: 'Order details', wallet_short: 'Wallet balance',
    order_progress: 'Order progress', sub_items: 'Items', no_rate_cart: 'The store has not set a delivery price for this destination yet — choose another destination or contact support.',
    pay_disabled: 'Currently unavailable', new_badge_title: 'Just arrived', zoom_hint: 'Hover to zoom • click for full view', share: 'Share', delivered_in: 'Delivery in {d} days',
    search_hint: 'Search for a product…', topup_safe: 'Uploading a receipt never adds funds by itself; the amount is credited only after the admin verifies the transfer.', ccp_short: 'CCP', usdt_short: 'USDT',
    err_address_not_found: 'Address not found', err_order_not_found: 'Order not found', err_too_many_addresses: 'Address limit reached',
    err_wilaya_unavailable: 'Wilaya unavailable', err_order_changed: 'The order changed, please reload', err_bad_qty: 'Invalid quantity',
  });

  const main = $('#main');
  const isRTL = () => S.lang === 'ar';
  S.favs = new Set(); S.cards = new Map(); S.cartCount = 0;

  // ---------- guest cart (localStorage) ----------
  const GC = {
    get() { try { const a = JSON.parse(localStorage.getItem('mdz_cart') || '[]'); return Array.isArray(a) ? a.filter(i => i && i.variant_id > 0 && i.qty > 0) : []; } catch { return []; } },
    set(items) { localStorage.setItem('mdz_cart', JSON.stringify(items)); },
    count() { return GC.get().reduce((s, i) => s + i.qty, 0); },
  };

  const Cart = {
    async add(variantId, qty, stock) {
      if (S.user) { const q = await api('POST', '/api/cart', { variant_id: variantId, qty }); setCartCount(q.lines.reduce((s, l) => s + l.qty, 0)); return; }
      const items = GC.get(); const it = items.find(i => i.variant_id === variantId);
      const target = (it ? it.qty : 0) + qty;
      if (stock != null && target > stock) throw { code: stock ? 'insufficient_stock' : 'out_of_stock' };
      if (it) it.qty = Math.min(99, target); else items.push({ variant_id: variantId, qty: Math.min(99, qty) });
      GC.set(items); setCartCount(GC.count());
    },
    async set(variantId, qty) {
      if (S.user) { const q = await api('POST', '/api/cart', { variant_id: variantId, qty, mode: 'set' }); setCartCount(q.lines.reduce((s, l) => s + l.qty, 0)); return; }
      let items = GC.get(); if (qty <= 0) items = items.filter(i => i.variant_id !== variantId); else { const it = items.find(i => i.variant_id === variantId); if (it) it.qty = qty; }
      GC.set(items); setCartCount(GC.count());
    },
    async quote(extra = {}) {
      const q = await api('POST', '/api/cart/quote', S.user ? { source: 'cart', ...extra } : { items: GC.get(), ...extra });
      setCartCount(q.lines.reduce((s, l) => s + l.qty, 0));
      return q;
    },
    async mergeGuest() {
      const items = GC.get(); if (!items.length) return;
      try { await api('POST', '/api/cart/merge', { items }); GC.set([]); toast(t('cart_merged')); } catch { /* keep local copy */ }
    },
  };

  // ---------- user / chrome ----------
  function setUser(u) {
    S.user = u || null;
    S.favs = new Set(u ? u.fav_ids : []);
    S.cartCount = u ? u.cart_count : GC.count();
  }
  async function refreshMe() { try { const r = await api('GET', '/api/me'); setUser(r.user); updateBadges(); } catch { /* offline */ } }
  M.refreshMe = refreshMe;
  function setCartCount(n) { S.cartCount = n; updateBadges(); }
  function updateBadges() {
    $$('[data-badge=cart]').forEach(el => { el.textContent = S.cartCount > 99 ? '99+' : S.cartCount; el.classList.toggle('hide', !S.cartCount); });
    const un = S.user ? S.user.unread : 0;
    $$('[data-badge=notif]').forEach(el => { el.textContent = un > 99 ? '99+' : un; el.classList.toggle('hide', !un); });
    $$('[data-wallet]').forEach(el => { el.innerHTML = S.user ? money(S.user.wallet.available) : ''; });
  }
  M.updateBadges = updateBadges;

  function setLang(l) {
    if (l === S.lang) return;
    S.lang = l; document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    document.cookie = `mdz_lang=${l}; path=/; max-age=31536000; samesite=lax`;
    if (S.user) api('PUT', '/api/me/prefs', { lang: l, currency: S.currency }).catch(() => {});
    renderChrome(); route(true);
  }
  function setCurrency(c) {
    if (c === S.currency) return;
    S.currency = c; localStorage.setItem('mdz_cur', c);
    if (S.user) api('PUT', '/api/me/prefs', { lang: S.lang, currency: c }).catch(() => {});
    renderChrome(); route(true);
  }
  M.setLang = setLang; M.setCurrency = setCurrency;

  const storeName = () => S.lang === 'ar' ? (S.settings.store_name_ar || 'مارشي ديزاد') : (S.settings.store_name_en || 'Marché DZ');
  const catName = c => L(c, 'name');
  function findCat(pred, list = S.categories, trail = []) {
    for (const c of list) { const tr = [...trail, c]; if (pred(c)) return tr; const r = findCat(pred, c.children || [], tr); if (r) return r; }
    return null;
  }
  const catIcon = c => icon(c.icon || 'box');

  function renderChrome() {
    const s = S.settings; const u = S.user;
    $('#topbar').innerHTML = `<div class="topbar"><div class="container">
      <span class="row" style="gap:8px">${icon('truck', 'sm')} ${esc(L(s, 'announcement') || '')}</span>
      <span class="row tb-links" style="gap:16px">${s.contact_phone ? `<a href="tel:${esc(s.contact_phone)}" class="row" style="gap:6px">${icon('call', 'sm')}<span class="num">${esc(s.contact_phone)}</span></a>` : ''}
        <a href="/faq">${t('faq')}</a><a href="/support">${t('support')}</a>${u && u.role !== 'customer' ? `<a href="/admin" data-ext>${t('admin_panel')}</a>` : ''}</span></div></div>`;
    const roots = S.categories || [];
    $('#header').innerHTML = `<div class="container hdr-main">
      <a class="logo" href="/" aria-label="${esc(storeName())}">${M.logo()}</a>
      <div class="search" id="search"><form role="search" autocomplete="off"><input name="q" type="search" placeholder="${esc(t('search_ph'))}" aria-label="${esc(t('search'))}" enterkeyhint="search" value="${esc(new URLSearchParams(location.search).get('q') || '')}">
        <button type="submit">${icon('search')}<span>${t('search_btn')}</span></button></form><div class="suggest glass hide" id="suggest" role="listbox"></div></div>
      <div class="hdr-actions">
        <div class="pill-switch desk" role="group" aria-label="${t('language')}"><button data-lang="ar" class="${S.lang === 'ar' ? 'on' : ''}">ع</button><button data-lang="en" class="${S.lang === 'en' ? 'on' : ''}">EN</button></div>
        <div class="pill-switch desk" role="group" aria-label="${t('currency')}"><button data-cur="DZD" class="${S.currency === 'DZD' ? 'on' : ''}">DZD</button><button data-cur="USD" class="${S.currency === 'USD' ? 'on' : ''}">USD</button></div>
        <button class="icon-btn mob-only" id="prefs-btn" aria-label="${t('store_prefs')}">${icon('globe')}</button>
        ${u ? `<a class="icon-btn desk" href="/account/favorites" aria-label="${t('favorites')}">${icon('heart')}</a>
          <div style="position:relative"><button class="icon-btn" id="notif-btn" aria-label="${t('notifications')}" aria-haspopup="true">${icon('bell')}<span class="badge-dot hide" data-badge="notif"></span></button><div id="notif-dd"></div></div>` : ''}
        <a class="icon-btn desk" href="/cart" aria-label="${t('cart')}" id="cart-ico">${icon('cart')}<span class="badge-dot hide" data-badge="cart"></span></a>
        ${u ? `<a class="wallet-chip" href="/account/wallet" aria-label="${t('wallet')}"><i>${icon('wallet', 'sm')}</i><span class="wtxt" data-wallet></span></a>
          <a class="avatar" href="/account" aria-label="${t('account')}">${esc((u.name || '?').trim().charAt(0).toUpperCase())}</a>`
        : `<a class="btn btn-sm" href="/login">${icon('user', 'sm')}<span>${t('login')}</span></a>`}
      </div></div>
      <div class="container hdr-nav">
        <button class="cat-btn" id="cat-btn" aria-expanded="false">${icon('menu', 'sm')} ${t('all_categories')}</button>
        <a href="/deals" class="hot">${icon('flame', 'sm')} ${t('deals')}</a><a href="/new">${t('new')}</a><a href="/best">${t('best')}</a>
        ${roots.slice(0, 7).map(c => `<a href="/c/${esc(c.slug)}">${esc(catName(c))}</a>`).join('')}
      </div>
      <div class="mega" id="mega"><div class="mega-in glass"><div class="mega-side">${roots.map((c, i) => `<a href="/c/${esc(c.slug)}" data-mega="${i}" class="${i ? '' : 'on'}"><span class="ic">${catIcon(c)}</span>${esc(catName(c))}</a>`).join('')}</div><div class="mega-body" id="mega-body"></div></div></div>`;
    $('#bnav').innerHTML = [['/', 'home', t('home')], ['/categories', 'grid', t('categories')], ['/search', 'search', t('search')], ['/cart', 'cart', t('cart'), 'cart'], [u ? '/account' : '/login', 'user', t('account')]]
      .map(([h, ic, lb, b]) => `<a href="${h}" data-nav="${h}">${icon(ic)}${b ? '<span class="badge-dot hide" data-badge="cart"></span>' : ''}<span>${esc(lb)}</span></a>`).join('');
    renderFooter();
    bindHeader();
    updateBadges();
    megaShow(0);
  }

  function renderFooter() {
    const s = S.settings;
    const soc = [['facebook', s.social_facebook], ['instagram', s.social_instagram], ['tiktok', s.social_tiktok], ['whatsapp', s.social_whatsapp ? `https://wa.me/${String(s.social_whatsapp).replace(/\D/g, '')}` : '']].filter(x => x[1]);
    $('#footer').innerHTML = `<div class="footer"><div class="container"><div class="cols">
      <div><a class="logo" href="/" style="color:#fff">${M.logo(false)}</a><p style="max-width:380px;margin-top:14px">${esc(t('footer_about'))}</p>
        ${soc.length ? `<div class="social">${soc.map(([n, h]) => `<a href="${esc(h)}" target="_blank" rel="noopener" aria-label="${n}">${icon(n)}</a>`).join('')}</div>` : ''}</div>
      <div><h5>${t('policies')}</h5><ul>${['about', 'shipping', 'returns', 'cancellation', 'payment', 'privacy', 'terms'].map(p => `<li><a href="/page/${p}">${t('pg_' + p)}</a></li>`).join('')}</ul></div>
      <div><h5>${t('help')}</h5><ul><li><a href="/faq">${t('faq')}</a></li><li><a href="/support">${t('support')}</a></li><li><a href="/account/orders">${t('my_orders')}</a></li><li><a href="/account/wallet">${t('wallet')}</a></li><li><a href="/categories">${t('all_categories')}</a></li></ul></div>
      <div><h5>${t('contact')}</h5><ul>${s.contact_phone ? `<li class="row">${icon('call', 'sm')}<span class="num">${esc(s.contact_phone)}</span></li>` : ''}${s.contact_email ? `<li class="row">${icon('mail', 'sm')}<span>${esc(s.contact_email)}</span></li>` : ''}
        <li class="row">${icon('pin', 'sm')}<span>${esc(L(s, 'contact_address') || '')}</span></li></ul>
        <div class="pay-badges mt">${s.pay_cod_enabled === '1' ? `<span>COD</span>` : ''}${s.pay_wallet_enabled === '1' ? `<span>${t('wallet')}</span>` : ''}${s.topup_ccp_enabled === '1' ? '<span>CCP</span><span>BaridiMob</span>' : ''}${s.topup_usdt_enabled === '1' ? '<span>USDT</span>' : ''}</div></div>
    </div><div class="bottom"><span>© ${new Date().getFullYear()} ${esc(storeName())} — ${t('rights')}</span><span class="row" style="gap:6px">${icon('shield', 'sm')} ${t('secure_pay')} • <span class="num">58</span> ${t('stats_wilayas')}</span></div></div></div>`;
  }

  // ---------- header behaviour: search suggestions, mega menu, prefs, notifications ----------
  function megaShow(i) {
    const c = (S.categories || [])[i]; const body = $('#mega-body'); if (!c || !body) return;
    $$('.mega-side a').forEach((a, j) => a.classList.toggle('on', i === j));
    body.innerHTML = `<h4><span class="ic">${catIcon(c)}</span>${esc(catName(c))} <a class="link small" href="/c/${esc(c.slug)}" style="margin-inline-start:auto">${t('see_all')}</a></h4>
      <div class="mega-cols">${(c.children || []).map(g => `<div class="mega-group"><a href="/c/${esc(g.slug)}">${esc(catName(g))}</a>${g.children && g.children.length ? `<ul>${g.children.map(k => `<li><a href="/c/${esc(k.slug)}">${esc(catName(k))}</a></li>`).join('')}</ul>` : ''}</div>`).join('')}</div>`;
  }
  function megaToggle(open) {
    const m = $('#mega'); if (!m) return; const o = open ?? !m.classList.contains('open');
    m.classList.toggle('open', o); $('#cat-btn')?.setAttribute('aria-expanded', String(o));
  }
  function bindHeader() {
    $$('[data-lang]').forEach(b => b.onclick = () => setLang(b.dataset.lang));
    $$('[data-cur]').forEach(b => b.onclick = () => setCurrency(b.dataset.cur));
    const pb = $('#prefs-btn'); if (pb) pb.onclick = prefsModal;
    const cb = $('#cat-btn'); if (cb) cb.onclick = e => { e.stopPropagation(); megaToggle(); };
    $$('[data-mega]').forEach(a => a.addEventListener('mouseenter', () => megaShow(Number(a.dataset.mega))));
    const mega = $('#mega'); if (mega) mega.addEventListener('mouseleave', () => megaToggle(false));
    const nb = $('#notif-btn'); if (nb) nb.onclick = e => { e.stopPropagation(); notifDropdown(); };
    // search
    const form = $('#search form'); const input = form.q; const box = $('#suggest');
    let items = []; let idx = -1; let lastQ = '';
    const hide = () => { box.classList.add('hide'); idx = -1; };
    const run = debounce(async () => {
      const q = input.value.trim(); if (q === lastQ) return; lastQ = q;
      if (q.length < 2) return hide();
      try {
        const r = await api('GET', '/api/suggest?q=' + encodeURIComponent(q));
        if (input.value.trim() !== q) return;
        items = [];
        let h = '';
        if (r.corrected) h += `<div class="msg msg-info small" style="margin:4px">${t('did_you_mean')}: <b>${esc(r.corrected)}</b></div>`;
        if (r.items.length) {
          h += `<h6>${t('products')}</h6>` + r.items.map(p => { items.push('/p/' + p.slug); S.cards.set(p.id, p);
            return `<a class="sg-item" role="option" href="/p/${esc(p.slug)}"><img src="${esc(p.thumb || '/favicon.svg')}" alt="" loading="lazy"><span class="grow"><span style="display:block;font-weight:700;font-size:14px">${esc(L(p, 'name'))}</span>${p.brand ? `<span class="tiny muted">${esc(p.brand)}</span>` : ''}</span><span class="p">${money(p.eff)}${p.eff < p.price ? `<br><s class="tiny muted">${money(p.price)}</s>` : ''}</span></a>`; }).join('');
        }
        if (r.categories.length) h += `<h6>${t('in_categories')}</h6>` + r.categories.map(c => { items.push('/c/' + c.slug); return `<a class="sg-item" role="option" href="/c/${esc(c.slug)}"><span class="icon-btn" style="background:var(--soft)">${catIcon(c)}</span><span class="grow bold">${esc(catName(c))}</span></a>`; }).join('');
        if (!r.items.length && !r.categories.length) h += `<div class="muted center small" style="padding:18px">${t('no_results')}</div>`;
        else { items.push('/search?q=' + encodeURIComponent(q)); h += `<a class="sg-item" role="option" href="/search?q=${encodeURIComponent(q)}" style="justify-content:center;font-weight:800">${t('view_all_results', { n: r.total })} ${icon('arrow', 'sm flip')}</a>`; }
        box.innerHTML = h; box.classList.remove('hide'); idx = -1;
      } catch { hide(); }
    }, 170);
    input.addEventListener('input', run);
    input.addEventListener('focus', () => { if (box.innerHTML && input.value.trim().length >= 2) box.classList.remove('hide'); });
    input.addEventListener('keydown', e => {
      const els = $$('.sg-item', box); if (box.classList.contains('hide') || !els.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length; els.forEach((x, i) => x.classList.toggle('on', i === idx)); els[idx].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); hide(); go(els[idx].getAttribute('href')); }
      else if (e.key === 'Escape') hide();
    });
    form.onsubmit = e => { e.preventDefault(); const q = input.value.trim(); hide(); input.blur(); go(q ? '/search?q=' + encodeURIComponent(q) : '/search'); };
    box.addEventListener('click', () => setTimeout(hide, 0));
    document.addEventListener('click', e => { if (!e.target.closest('#search')) hide(); });
  }
  document.addEventListener('click', e => {
    if (!e.target.closest('#mega') && !e.target.closest('#cat-btn')) megaToggle(false);
    if (!e.target.closest('#notif-dd') && !e.target.closest('#notif-btn')) { const d = $('#notif-dd'); if (d) d.innerHTML = ''; }
  });

  function prefsModal() {
    const m = modal(`<h3>${t('store_prefs')}</h3><div class="stack"><div class="field"><span>${t('language')}</span><div class="seg"><button data-l="ar" class="${S.lang === 'ar' ? 'on' : ''}">العربية</button><button data-l="en" class="${S.lang === 'en' ? 'on' : ''}">English</button></div></div>
      <div class="field"><span>${t('currency')}</span><div class="seg"><button data-c="DZD" class="${S.currency === 'DZD' ? 'on' : ''}">DZD — د.ج</button><button data-c="USD" class="${S.currency === 'USD' ? 'on' : ''}">USD — $</button></div></div>
      <p class="hint">${t('price_note_usd', { rate: M.rateTxt(), date: M.fmtDate(S.settings.fx_updated_at, false) || '—' })}</p></div>`);
    $$('[data-l]', m).forEach(b => b.onclick = () => { closeOverlay(); setLang(b.dataset.l); });
    $$('[data-c]', m).forEach(b => b.onclick = () => { closeOverlay(); setCurrency(b.dataset.c); });
  }

  async function notifDropdown() {
    const dd = $('#notif-dd'); if (dd.innerHTML) { dd.innerHTML = ''; return; }
    dd.innerHTML = `<div class="dropdown glass"><div class="skel" style="height:60px;margin:6px"></div></div>`;
    try {
      const list = (await api('GET', '/api/notifications')).slice(0, 8);
      dd.innerHTML = `<div class="dropdown glass"><div class="row between" style="padding:8px 10px"><b>${t('notifications')}</b><button class="link small" style="border:0;background:none" id="nd-all">${t('mark_all_read')}</button></div>
        ${list.length ? list.map(notifItem).join('') : `<div class="muted center" style="padding:26px">${t('no_notifications')}</div>`}
        <a href="/account/notifications" class="btn btn-soft btn-sm btn-block mt">${t('notif_all')}</a></div>`;
      $('#nd-all').onclick = async () => { await api('POST', '/api/notifications/read', { all: true }); S.user.unread = 0; updateBadges(); dd.innerHTML = ''; };
    } catch (e) { dd.innerHTML = ''; toast(errMsg(e), 'err'); }
  }
  function notifItem(n) {
    return `<a class="notif ${n.read_at ? '' : 'unread'}" href="${esc(n.link || '/account/notifications')}" data-notif="${n.id}"><span class="ic">${icon(/order/.test(n.type) ? 'package' : /wallet|topup|withdraw|refund/.test(n.type) ? 'wallet' : /ticket/.test(n.type) ? 'headset' : 'bell', 'sm')}</span>
      <span class="grow"><b style="display:block;font-size:14px">${esc(L(n, 'title'))}</b><span class="small muted">${esc(L(n, 'body'))}</span><span class="tiny muted" style="display:block;margin-top:4px">${M.fmtDate(n.created_at)}</span></span></a>`;
  }
  M.notifItem = notifItem;
  document.addEventListener('click', e => {
    const n = e.target.closest('[data-notif]'); if (!n || !S.user) return;
    api('POST', '/api/notifications/read', { ids: [Number(n.dataset.notif)] }).then(() => { if (n.classList.contains('unread')) { S.user.unread = Math.max(0, S.user.unread - 1); updateBadges(); } }).catch(() => {});
  });

  // ---------- router ----------
  let RT = 0;
  const routes = [];
  const on = (re, fn, opts = {}) => routes.push({ re, fn, ...opts });
  M.on = on;
  function go(url, { replace = false } = {}) {
    if (url === location.pathname + location.search && !replace) { route(); return; }
    history[replace ? 'replaceState' : 'pushState']({}, '', url); route();
  }
  M.go = go;
  function view(html) { main.innerHTML = html; main.classList.remove('page-enter'); void main.offsetWidth; main.classList.add('page-enter'); }
  M.view = view;
  const loading = () => `<div class="container" style="padding:40px 20px"><div class="grid">${'<div class="skel skel-card"></div>'.repeat(4)}</div></div>`;
  M.setTitle = s => { document.title = s ? `${s} | ${storeName()}` : `${storeName()} — ${S.lang === 'ar' ? 'Marché DZ' : 'مارشي ديزاد'}`; };
  async function route(keepScroll) {
    const my = ++RT; const alive = () => my === RT;
    closeOverlay(); megaToggle(false);
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const q = new URLSearchParams(location.search);
    $$('#bnav a').forEach(a => { const h = a.dataset.nav; a.classList.toggle('on', h === '/' ? path === '/' : path.startsWith(h)); });
    const r = routes.find(x => x.re.test(path));
    if (!keepScroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (!r) return notFound();
    if (r.auth && !S.user) return go('/login?next=' + encodeURIComponent(location.pathname + location.search), { replace: true });
    if (!keepScroll && !r.noSkeleton) view(loading());
    try { await r.fn({ m: path.match(r.re), q, alive, path }); }
    catch (e) { if (!alive()) return; if (e && e.status === 404) return notFound(); if (e && e.status === 401) return go('/login?next=' + encodeURIComponent(location.pathname), { replace: true });
      view(`<div class="container"><div class="empty glass mt-lg"><div class="em-ic">${icon('alert', 'lg')}</div><h3>${esc(errMsg(e))}</h3><a class="btn mt" href="${esc(location.pathname + location.search)}">${icon('refresh', 'sm')} ${t('back')}</a></div></div>`); }
  }
  M.route = route;
  function notFound() {
    M.setTitle(t('not_found'));
    view(`<div class="container"><div class="empty glass mt-lg"><div class="em-ic" style="font:800 26px Inter">404</div><h3>${t('not_found')}</h3><p class="muted">${t('not_found_d')}</p><a class="btn btn-accent mt" href="/">${icon('home', 'sm')} ${t('home')}</a></div></div>`);
  }
  M.notFound = notFound;
  window.addEventListener('popstate', () => route(true));
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]'); if (!a || a.target || a.hasAttribute('download') || a.hasAttribute('data-ext')) return;
    const h = a.getAttribute('href'); if (!h.startsWith('/') || h.startsWith('//') || /^\/(admin|api|uploads)(\/|$)/.test(h)) return;
    e.preventDefault(); go(h);
  });

  // ---------- product card ----------
  const uniq = a => [...new Set(a.filter(Boolean))];
  const swatch = c => COLOR_HEX[String(c).toLowerCase()];
  function pcard(p) {
    S.cards.set(p.id, p);
    const sale = p.eff < p.price; const name = L(p, 'name'); const oos = p.stock <= 0;
    const vs = p.variants || []; const colors = uniq(vs.map(v => v.color)); const sizes = uniq(vs.map(v => v.size));
    const opts = colors.length > 1 || sizes.length > 1 ? `<div class="pc-opts">${colors.slice(0, 5).map(c => swatch(c) ? `<button class="sw" data-o="color" data-v="${esc(c)}" title="${esc(colorName(c))}" style="background:${swatch(c)}" aria-label="${esc(colorName(c))}"></button>` : `<button data-o="color" data-v="${esc(c)}">${esc(colorName(c))}</button>`).join('')}
      ${sizes.slice(0, 5).map(s => `<button data-o="size" data-v="${esc(s)}" ${vs.some(v => v.size === s && v.stock > 0) ? '' : 'disabled'}>${esc(s)}</button>`).join('')}</div>` : '';
    return `<article class="pcard" data-pid="${p.id}">
      <a class="pc-media" href="/p/${esc(p.slug)}" tabindex="-1" aria-hidden="true"><img class="main" src="${esc(p.thumb || '/favicon.svg')}" alt="" loading="lazy" decoding="async" width="300" height="300">${p.thumb2 ? `<img class="alt" src="${esc(p.thumb2)}" alt="" loading="lazy" decoding="async">` : ''}${oos ? `<div class="pc-oos"><span>${t('out_of_stock')}</span></div>` : ''}</a>
      <div class="pc-tags">${sale ? `<span class="tag tag-sale">-${p.discount}%</span>` : ''}${p.is_new ? `<span class="tag tag-new">${t('badge_new')}</span>` : ''}${p.is_best ? `<span class="tag tag-best">${t('badge_best')}</span>` : ''}</div>
      <button class="pc-fav ${S.favs.has(p.id) ? 'on' : ''}" data-fav="${p.id}" aria-label="${t('favorites')}" aria-pressed="${S.favs.has(p.id)}">${icon('heart', 'sm')}</button>
      <div class="pc-body">${p.brand ? `<div class="pc-brand">${esc(p.brand)}</div>` : ''}
        <a class="pc-name" href="/p/${esc(p.slug)}">${esc(name)}</a>
        ${p.rating_count ? `<div class="pc-rating">${stars(p.rating)}<span class="num">${Number(p.rating).toFixed(1)} (${p.rating_count})</span></div>` : ''}
        <div class="price"><span class="now ${sale ? 'sale' : ''}">${money(p.eff)}</span>${sale ? `<span class="was">${money(p.price)}</span>` : ''}</div>
        ${opts}
        <div class="pc-stock ${oos ? '' : p.stock <= 5 ? 'low' : 'ok'}">${oos ? t('out_of_stock') : p.stock <= 5 ? t('only_left', { n: p.stock }) : t('in_stock')}</div>
        <div class="pc-actions"><button class="btn btn-sm" data-buy ${oos ? 'disabled' : ''}>${t('buy_now')}</button><button class="btn add" data-add ${oos ? 'disabled' : ''} aria-label="${t('add_to_cart')}" title="${t('add_to_cart')}">${icon('plus')}</button></div>
      </div></article>`;
  }
  M.pcard = pcard;
  const grid = items => `<div class="grid">${items.map(pcard).join('')}</div>`;
  function scroller(items, id) {
    return `<div class="scroller-wrap"><button class="sc-arrow prev glass" data-sc="-1" aria-label="prev">${icon(isRTL() ? 'right' : 'left')}</button><div class="scroller" id="${id}">${items.map(pcard).join('')}</div><button class="sc-arrow next glass" data-sc="1" aria-label="next">${icon(isRTL() ? 'left' : 'right')}</button></div>`;
  }
  M.scroller = scroller; M.grid = grid;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sc]'); if (!b) return;
    const sc = b.parentElement.querySelector('.scroller'); const d = Number(b.dataset.sc) * (isRTL() ? -1 : 1);
    sc.scrollBy({ left: d * sc.clientWidth * .85, behavior: 'smooth' });
  });
  // subtle 3D glare follows the pointer (fine pointers only)
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    document.addEventListener('pointermove', e => {
      const c = e.target.closest && e.target.closest('.pcard'); if (!c) return;
      const r = c.getBoundingClientRect(); c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  function resolveVariant(p, sel) {
    const vs = p.variants || [];
    if (vs.length === 1) return vs[0];
    const colors = uniq(vs.map(v => v.color)); const sizes = uniq(vs.map(v => v.size));
    if ((colors.length > 1 && !sel.color) || (sizes.length > 1 && !sel.size)) return null;
    return vs.find(v => (colors.length <= 1 || v.color === sel.color) && (sizes.length <= 1 || v.size === sel.size)) || null;
  }
  function flyToCart(img) {
    const target = $('#cart-ico')?.offsetParent ? $('#cart-ico') : $('#bnav a[data-nav="/cart"]');
    if (!img || !target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = img.getBoundingClientRect(); const b = target.getBoundingClientRect();
    const f = document.createElement('img'); f.src = img.src; f.className = 'fly'; f.style.left = a.left + a.width / 2 - 30 + 'px'; f.style.top = a.top + a.height / 2 - 30 + 'px';
    document.body.appendChild(f);
    requestAnimationFrame(() => { f.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.25)`; f.style.opacity = '.3'; });
    setTimeout(() => { f.remove(); target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump'); }, 720);
  }
  async function addToCart(p, v, qty, img, btn) {
    if (!v) return toast(t('choose_options_first'), 'info');
    busy(btn, true);
    try { await Cart.add(v.id, qty, v.stock); flyToCart(img); toast(t('added_to_cart')); if (btn && btn.classList.contains('add')) { btn.classList.add('done'); btn.innerHTML = icon('check'); } }
    catch (e) { toast(e.code === 'insufficient_stock' ? t('qty_limited', { n: e.stock ?? v.stock }) : errMsg(e), 'err'); }
    finally { busy(btn, false); }
  }
  function buyNow(v, qty) {
    if (!v) return toast(t('choose_options_first'), 'info');
    if (v.stock < qty) return toast(t('err_insufficient_stock'), 'err');
    sessionStorage.setItem('mdz_buynow', JSON.stringify([{ variant_id: v.id, qty }]));
    go(S.user ? '/checkout?buynow=1' : '/login?next=' + encodeURIComponent('/checkout?buynow=1'));
  }
  M.addToCart = addToCart; M.buyNow = buyNow;

  async function toggleFav(pid) {
    if (!S.user) { toast(t('login_to_fav'), 'info'); return go('/login?next=' + encodeURIComponent(location.pathname + location.search)); }
    try {
      const r = await api('POST', `/api/favorites/${pid}`);
      if (r.favorite) S.favs.add(pid); else S.favs.delete(pid);
      $$(`[data-fav="${pid}"]`).forEach(b => { b.classList.toggle('on', r.favorite); b.setAttribute('aria-pressed', r.favorite); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); });
      toast(t(r.favorite ? 'favorite_added' : 'favorite_removed'));
    } catch (e) { toast(errMsg(e), 'err'); }
  }
  M.toggleFav = toggleFav;

  document.addEventListener('click', e => {
    const fav = e.target.closest('[data-fav]'); if (fav) { e.preventDefault(); toggleFav(Number(fav.dataset.fav)); return; }
    const card = e.target.closest('.pcard'); if (!card) return;
    const p = S.cards.get(Number(card.dataset.pid)); if (!p) return;
    card._sel = card._sel || {};
    const ob = e.target.closest('.pc-opts button');
    if (ob) { e.preventDefault(); card._sel[ob.dataset.o] = ob.dataset.v; $$(`.pc-opts button[data-o="${ob.dataset.o}"]`, card).forEach(x => x.classList.toggle('on', x === ob)); return; }
    const add = e.target.closest('[data-add]'); const buy = e.target.closest('[data-buy]');
    if (!add && !buy) return;
    e.preventDefault();
    const v = resolveVariant(p, card._sel);
    if (!v) return quickPick(p, buy ? 'buy' : 'add');
    if (buy) buyNow(v, 1); else addToCart(p, v, 1, card.querySelector('.pc-media img'), add);
  });

  // ---------- variant picker (product page + quick pick) ----------
  function variantPicker(box, variants, onChange) {
    const colors = uniq(variants.map(v => v.color)); const sizes = uniq(variants.map(v => v.size));
    const first = variants.find(v => v.stock > 0) || variants[0] || {};
    const sel = { color: first.color || null, size: first.size || null };
    const cur = () => variants.find(v => (v.color || null) === sel.color && (v.size || null) === sel.size) || null;
    function render() {
      let h = '';
      if (colors.length > 1 || (colors.length === 1 && sizes.length <= 1 && variants.length > 1)) {
        h += `<div class="opt-group"><h5>${t('color')}: <span class="muted">${esc(colorName(sel.color))}</span></h5><div class="opt-row">${colors.map(c => {
          const any = variants.some(v => v.color === c && v.stock > 0);
          return swatch(c) ? `<button class="opt sw ${sel.color === c ? 'on' : ''}" data-c="${esc(c)}" style="background:${swatch(c)}" title="${esc(colorName(c))}" aria-label="${esc(colorName(c))}" ${any ? '' : 'disabled'}></button>`
            : `<button class="opt ${sel.color === c ? 'on' : ''}" data-c="${esc(c)}" ${any ? '' : 'disabled'}>${esc(colorName(c))}</button>`; }).join('')}</div></div>`;
      }
      if (sizes.length > 1) {
        h += `<div class="opt-group"><h5>${t('size')}: <span class="muted">${esc(sel.size || '')}</span></h5><div class="opt-row">${sizes.map(s => {
          const v = variants.find(x => x.size === s && (colors.length <= 1 || x.color === sel.color));
          return `<button class="opt ${sel.size === s ? 'on' : ''}" data-s="${esc(s)}" ${v && v.stock > 0 ? '' : 'disabled'}>${esc(s)}</button>`; }).join('')}</div></div>`;
      }
      box.innerHTML = h;
      $$('[data-c]', box).forEach(b => b.onclick = () => { sel.color = b.dataset.c; if (!cur()) { const v = variants.find(x => x.color === sel.color && x.stock > 0) || variants.find(x => x.color === sel.color); sel.size = v ? v.size || null : sel.size; } render(); onChange(cur()); });
      $$('[data-s]', box).forEach(b => b.onclick = () => { sel.size = b.dataset.s; render(); onChange(cur()); });
    }
    render(); onChange(cur());
    return { get: cur };
  }
  function qtyControl(id, max) {
    return `<div class="qty" id="${id}"><button type="button" data-q="-1" aria-label="-">${icon('minus', 'sm')}</button><input type="number" min="1" max="${max}" value="1" inputmode="numeric" aria-label="${t('quantity')}"><button type="button" data-q="1" aria-label="+">${icon('plus', 'sm')}</button></div>`;
  }
  function bindQty(el, getMax, onChange) {
    const inp = el.querySelector('input');
    const clamp = () => { const mx = Math.max(1, Math.min(99, getMax() || 1)); let v = parseInt(inp.value, 10) || 1; v = Math.max(1, Math.min(mx, v)); inp.value = v; inp.max = mx;
      el.querySelector('[data-q="-1"]').disabled = v <= 1; el.querySelector('[data-q="1"]').disabled = v >= mx; onChange && onChange(v); return v; };
    $$('[data-q]', el).forEach(b => b.onclick = () => { inp.value = (parseInt(inp.value, 10) || 1) + Number(b.dataset.q); clamp(); });
    inp.onchange = clamp; clamp();
    return { get: () => parseInt(inp.value, 10) || 1, clamp };
  }
  M.qtyControl = qtyControl; M.bindQty = bindQty;
  function quickPick(p, mode) {
    const m = modal(`<div class="row" style="align-items:flex-start;gap:16px"><img src="${esc(p.thumb || '/favicon.svg')}" alt="" style="width:104px;height:104px;object-fit:contain;border-radius:16px;border:1px solid var(--line);background:#fff">
      <div class="grow"><b style="font-size:16px">${esc(L(p, 'name'))}</b><div class="price mt" id="qp-price"></div><div class="small muted" id="qp-stock"></div></div></div>
      <div id="qp-opts"></div><div class="row mt-lg">${qtyControl('qp-qty', 1)}<button class="btn ${mode === 'buy' ? '' : 'btn-accent'} grow" id="qp-go">${mode === 'buy' ? t('buy_now') : t('add_to_cart')}</button></div>`);
    let v = null; let qc;
    const upd = nv => { v = nv; const eff = v ? p.eff + v.price_delta : p.eff; const was = v ? p.price + v.price_delta : p.price;
      $('#qp-price', m).innerHTML = `<span class="now ${eff < was ? 'sale' : ''}">${money(eff)}</span>${eff < was ? `<span class="was">${money(was)}</span>` : ''}`;
      $('#qp-stock', m).textContent = !v ? '' : v.stock > 0 ? t('stock_qty', { n: v.stock }) : t('out_of_stock'); $('#qp-go', m).disabled = !v || v.stock <= 0; qc && qc.clamp(); };
    variantPicker($('#qp-opts', m), p.variants || [], upd);
    qc = bindQty($('#qp-qty', m), () => v ? v.stock : 1);
    $('#qp-go', m).onclick = async e => { if (mode === 'buy') { closeOverlay(); buyNow(v, qc.get()); } else { await addToCart(p, v, qc.get(), m.querySelector('img'), e.currentTarget); closeOverlay(); } };
  }

  // ---------- wilaya / commune helpers ----------
  let wilayasCache = null; const communesCache = new Map();
  async function wilayas() { if (!wilayasCache) wilayasCache = await api('GET', '/api/wilayas'); return wilayasCache; }
  async function communes(wid) { if (!communesCache.has(wid)) communesCache.set(wid, await api('GET', `/api/wilayas/${wid}/communes`)); return communesCache.get(wid); }
  async function fillWilayas(sel, value) {
    const ws = await wilayas();
    sel.innerHTML = `<option value="">${t('choose_wilaya')}</option>` + ws.map(w => `<option value="${w.id}" ${Number(value) === w.id ? 'selected' : ''}>${esc(w.code)} — ${esc(L(w, 'name'))}</option>`).join('');
  }
  async function fillCommunes(sel, wid, value) {
    if (!wid) { sel.innerHTML = `<option value="">${t('choose_commune')}</option>`; sel.disabled = true; return; }
    sel.disabled = true; const cs = await communes(wid); sel.disabled = false;
    sel.innerHTML = `<option value="">${t('choose_commune')}</option>` + cs.map(c => `<option value="${c.id}" ${Number(value) === c.id ? 'selected' : ''}>${esc(L(c, 'name'))}${c.daira_ar ? ` (${esc(L(c, 'daira'))})` : ''}</option>`).join('');
  }
  M.fillWilayas = fillWilayas; M.fillCommunes = fillCommunes;
  function addrFields(a = {}) {
    return `<div class="grid-2">
      <label class="field"><span>${t('full_name')}</span><input class="input" name="full_name" required minlength="2" maxlength="80" value="${esc(a.full_name || (S.user ? S.user.name : ''))}" autocomplete="name"></label>
      <label class="field"><span>${t('phone')}</span><input class="input" name="phone" required dir="ltr" inputmode="tel" placeholder="05XX XX XX XX" value="${esc(a.phone || (S.user ? S.user.phone || '' : ''))}" autocomplete="tel"></label>
      <label class="field"><span>${t('wilaya')}</span><select class="input" name="wilaya_id" required></select></label>
      <label class="field"><span>${t('commune')}</span><select class="input" name="commune_id" required disabled></select></label></div>
      <label class="field mt"><span>${t('address')}</span><input class="input" name="address" required minlength="4" maxlength="300" placeholder="${esc(t('address_ph'))}" value="${esc(a.address || '')}" autocomplete="street-address"></label>
      <label class="field mt"><span>${t('driver_notes')} <span class="muted">(${t('optional')})</span></span><input class="input" name="notes" maxlength="300" value="${esc(a.notes || '')}"></label>`;
  }
  async function bindAddrFields(root, a = {}, onChange) {
    const w = root.querySelector('[name=wilaya_id]'); const c = root.querySelector('[name=commune_id]');
    await fillWilayas(w, a.wilaya_id); await fillCommunes(c, a.wilaya_id, a.commune_id);
    w.onchange = async () => { await fillCommunes(c, Number(w.value)); onChange && onChange(); };
    c.onchange = () => onChange && onChange();
  }
  M.addrFields = addrFields; M.bindAddrFields = bindAddrFields;

  // ================= PAGES =================
  // ---------- home ----------
  on(/^\/$/, async ({ alive }) => {
    M.setTitle('');
    const u = S.user;
    const reqs = [api('GET', '/api/products?collection=deals&limit=12'), api('GET', '/api/products?collection=best&limit=12'), api('GET', '/api/products?collection=new&limit=10'),
      u ? api('GET', '/api/products?collection=recommended&limit=12') : api('GET', '/api/products?collection=featured&limit=3'), u ? api('GET', '/api/orders') : Promise.resolve([])];
    const [deals, best, fresh, rec, orders] = await Promise.all(reqs);
    if (!alive()) return;
    const s = S.settings; const roots = S.categories || [];
    const title = L(s, 'hero_title'); const words = title.split(' '); const cut = Math.max(1, words.length - 3);
    const totalProducts = roots.reduce((n, c) => n + (c.count || 0), 0);
    let top;
    if (!u) {
      top = `<section class="hero"><div class="container"><div class="hero-card glass">
        <div><span class="hero-badge"><i>${icon('sparkle', 'sm')}</i>${t('hero_badge')}</span>
          <h1>${esc(words.slice(0, cut).join(' '))} <em>${esc(words.slice(cut).join(' '))}</em></h1>
          <p class="lead">${esc(L(s, 'hero_sub'))}</p>
          <div class="row wrap"><a class="btn btn-lg btn-accent" href="/search">${t('hero_cta')} ${icon('arrow', 'sm flip')}</a><a class="btn btn-lg btn-ghost" href="/deals">${icon('flame', 'sm')} ${t('hero_cta2')}</a></div>
          <div class="hero-stats"><div><b class="num">${totalProducts}+</b><span>${t('stats_products')}</span></div><div><b class="num">58</b><span>${t('stats_wilayas')}</span></div><div><b class="num">${roots.reduce((n, c) => n + 1 + (c.children || []).length, 0)}</b><span>${t('stats_cats')}</span></div></div></div>
        <div class="hero-stage" aria-hidden="true">${(rec.items.length ? rec.items : best.items).slice(0, 3).map(p => `<a class="float-card glass" href="/p/${esc(p.slug)}" tabindex="-1"><img src="${esc(p.thumb)}" alt="" width="200" height="200"><div class="fc-t">${esc(L(p, 'name'))}</div><div class="fc-p">${money(p.eff)}</div></a>`).join('')}
          <span class="orb" style="width:120px;height:120px;inset-inline-end:8%;top:6%;background:radial-gradient(circle at 30% 30%,#a7f3d0,#059669)"></span><span class="orb" style="width:70px;height:70px;inset-inline-end:30%;bottom:4%;background:radial-gradient(circle at 30% 30%,#fed7aa,#ea580c)"></span></div>
      </div></div></section>`;
    } else {
      const w = u.wallet; const active = orders.filter(o => !['delivered', 'cancelled', 'refunded', 'returned'].includes(o.status));
      top = `<section class="section"><div class="container">
        ${!u.verified ? `<div class="msg msg-warn mb">${icon('mail', 'sm')}<span class="grow">${t('verify_banner')}</span><a class="link" href="/account/verify">${t('verify')}</a></div>` : ''}
        <div class="two-col" style="padding:0;grid-template-columns:1fr 380px">
          <div class="stack gap-lg"><div class="glass panel" style="border-radius:var(--r-xl)"><div class="row"><span class="avatar" style="width:54px;height:54px;font-size:22px">${esc(u.name.charAt(0).toUpperCase())}</span><div><h1 style="margin:0;font-size:24px">${t('hello')}${S.lang === 'ar' ? '،' : ','} ${esc(u.name)} 👋</h1><div class="muted">${t('welcome_back')}</div></div></div>
            <div class="stat-cards mt"><a class="stat card" href="/account/favorites"><div class="k row">${icon('heart', 'sm')} ${t('fav_count')}</div><div class="v num">${S.favs.size}</div></a>
              <a class="stat card" href="/cart"><div class="k row">${icon('cart', 'sm')} ${t('cart_count')}</div><div class="v num">${S.cartCount}</div></a>
              <a class="stat card" href="/account/notifications"><div class="k row">${icon('bell', 'sm')} ${t('notifications')}</div><div class="v num">${u.unread}</div></a></div></div>
            <div class="glass panel" style="border-radius:var(--r-xl)"><div class="row between mb"><h3 style="margin:0">${t('recent_orders')}</h3><a class="link small" href="/account/orders">${t('see_all')}</a></div>
              ${orders.length ? orders.slice(0, 3).map(o => `<a class="mini-line" href="/account/orders/${esc(o.number)}" style="border-bottom:1px solid var(--line)"><img src="${esc(o.image || '/favicon.svg')}" alt=""><span class="grow"><b class="num">${esc(o.number)}</b><br><span class="tiny muted">${M.fmtDate(o.created_at, false)} • ${t('items_n', { n: o.items })}</span></span><span style="text-align:end">${M.orderStatus(o.status)}<br><b class="small">${money(o.total)}</b></span></a>`).join('')
              : `<p class="muted">${t('no_orders')}</p><a class="btn btn-sm btn-accent" href="/search">${t('shop_now')}</a>`}
              ${active.length ? `<p class="small muted mt">${t('in_progress')}: <b class="num">${active.length}</b></p>` : ''}</div></div>
          <div class="wallet-card"><div class="row between"><span class="sub">${t('your_wallet')}</span>${icon('wallet')}</div><div class="bal">${money(w.available)}</div>
            <div class="sub">${t('held')}: ${money(w.held)}</div><div class="row mt-lg"><a class="btn btn-accent btn-sm" href="/account/wallet/topup">${icon('plus', 'sm')} ${t('topup')}</a><a class="btn btn-ghost btn-sm" href="/account/wallet">${t('transactions')}</a></div></div>
        </div></div></section>`;
    }
    const tiles = `<section class="section" style="padding-top:8px"><div class="container"><div class="sec-head"><h2><span class="ic">${icon('grid', 'sm')}</span>${t('shop_by_cat')}</h2><a class="link small" href="/categories">${t('see_all')}</a></div>
      <div class="cat-tiles">${roots.map(c => `<a class="cat-tile" href="/c/${esc(c.slug)}"><span class="ct-img glass">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : catIcon(c)}</span>${esc(catName(c))}</a>`).join('')}</div></div></section>`;
    const sec = (ic, cls, ttl, sub, href, body) => `<section class="section"><div class="container"><div class="sec-head"><div><h2><span class="ic ${cls}">${icon(ic, 'sm')}</span>${ttl}</h2><p>${sub}</p></div><a class="btn btn-ghost btn-sm" href="${href}">${t('see_all')} ${icon('arrow', 'sm flip')}</a></div>${body}</div></section>`;
    const why = `<section class="section"><div class="container"><div class="sec-head"><h2>${t('why_title')}</h2></div><div class="why">
      ${[['wallet', 'pay', 'var(--accent)'], ['truck', 'ship', 'var(--ink)'], ['refresh', 'return', 'var(--sale)'], ['headset', 'support', 'var(--info)']].map(([ic, k, c]) => `<div class="glass"><div class="ic" style="background:${c}">${icon(ic)}</div><h4>${t('why_' + k)}</h4><p>${t('why_' + k + '_d')}</p></div>`).join('')}</div></div></section>`;
    const about = !u ? `<section class="section"><div class="container"><div class="about-strip glass"><span class="logo-mark" style="width:64px;height:64px">${M.logoMark(40)}</span><div><h3>${t('about_title')}</h3><p>${esc(L(s, 'hero_title'))}… ${esc(t('footer_about'))}</p></div><a class="btn" href="/page/about">${t('discover')}</a></div></div></section>` : '';
    view(top + tiles
      + (deals.items.length ? sec('flame', 'sale', t('deals'), t('deals_sub'), '/deals', scroller(deals.items, 'sc-deals')) : '')
      + (u && rec.items.length ? sec('sparkle', 'info', t('recommended'), t('recommended_sub'), '/search', scroller(rec.items, 'sc-rec')) : '')
      + (best.items.length ? sec('star', '', t('best'), t('best_sub'), '/best', scroller(best.items, 'sc-best')) : '')
      + about
      + (fresh.items.length ? sec('sparkle', 'acc', t('new'), t('new_sub'), '/new', grid(fresh.items)) : '')
      + why);
  });

  // ---------- categories (mobile index) ----------
  on(/^\/categories$/, async () => {
    M.setTitle(t('all_categories'));
    const roots = S.categories || [];
    view(`<div class="container"><div class="page-head"><h1>${t('all_categories')}</h1></div><div class="stack" style="padding-bottom:30px">
      ${roots.map(c => `<details class="faq-item glass"><summary><span class="row"><span class="icon-btn" style="background:var(--soft)">${catIcon(c)}</span>${esc(catName(c))} <span class="tiny muted num">(${c.count})</span></span>${icon('down', 'sm')}</summary>
        <div style="padding:0 18px 16px"><a class="chip" href="/c/${esc(c.slug)}">${t('all_in', { name: catName(c) })}</a><div class="stack mt" style="gap:14px">${(c.children || []).map(g => `<div><a class="bold" href="/c/${esc(g.slug)}">${esc(catName(g))}</a>${g.children && g.children.length ? `<div class="row wrap mt" style="gap:6px">${g.children.map(k => `<a class="chip" href="/c/${esc(k.slug)}">${esc(catName(k))}</a>`).join('')}</div>` : ''}</div>`).join('')}</div></div></details>`).join('')}</div></div>`);
  });

  // ---------- listing (search / category / collections) ----------
  on(/^\/(search|deals|new|best|c\/([^/]+))$/, async ({ m, q, alive }) => {
    const coll = ['deals', 'new', 'best'].includes(m[1]) ? m[1] : null; const slug = m[2] ? decodeURIComponent(m[2]) : null;
    const base = location.pathname;
    const f = Object.fromEntries(['q', 'brand', 'min', 'max', 'instock', 'rating', 'deal', 'sort'].map(k => [k, q.get(k) || '']));
    const qs = new URLSearchParams({ facets: '1', limit: '24' });
    for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v);
    if (slug) qs.set('cat', slug); if (coll) qs.set('collection', coll);
    let page = 1;
    const r = await api('GET', '/api/products?' + qs);
    if (!alive()) return;
    const cat = r.category; const trail = cat ? findCat(c => c.id === cat.id) || [cat] : [];
    const title = cat ? catName(cat) : coll ? t(coll === 'best' ? 'best' : coll) : f.q ? t('results_for', { q: r.corrected || f.q }) : t('products');
    M.setTitle(cat ? catName(cat) : f.q || title);
    const node = trail.length ? trail[trail.length - 1] : null;
    const subs = node && node.children ? node.children : [];
    const fc = r.facets || { brands: [], categories: [], price: {} };
    const setQ = (k, v) => { const p = new URLSearchParams(location.search); if (v === '' || v == null) p.delete(k); else p.set(k, v); const s = p.toString(); go(base + (s ? '?' + s : ''), { replace: true }); };
    const brands = f.brand ? f.brand.split(',') : [];
    const anyFilter = ['brand', 'min', 'max', 'instock', 'rating', 'deal'].some(k => f[k]);
    view(`<div class="container"><div class="page-head">
      <nav class="crumbs" aria-label="breadcrumb"><a href="/">${t('home')}</a>${trail.map(c => `${icon(isRTL() ? 'left' : 'right', 'sm')}<a href="/c/${esc(c.slug)}">${esc(catName(c))}</a>`).join('')}</nav>
      <h1>${esc(title)}</h1><p class="muted small" style="margin:6px 0 0">${t('results_n', { n: r.total })}</p></div>
      ${r.corrected ? `<div class="msg msg-info mb">${icon('info', 'sm')}<span>${t('showing_for', { q: r.corrected })} — <span class="muted">${esc(f.q)}</span></span></div>` : ''}
      ${subs.length ? `<div class="subcats">${subs.map(c => `<a class="chip" href="/c/${esc(c.slug)}">${esc(catName(c))}</a>`).join('')}</div>` : ''}
      <div class="listing">
        <aside class="filters glass" id="filters" aria-label="${t('filters')}">
          <div class="row between mob-only-flex" style="margin-bottom:6px"><h3 style="margin:0">${t('filters')}</h3><button class="icon-btn" id="f-close" aria-label="${t('close')}">${icon('x')}</button></div>
          ${fc.categories.length ? `<div class="f-group"><h5>${t('categories')}</h5><div class="list">${fc.categories.map(c => `<a class="row between small" href="/c/${esc(c.slug)}${f.q ? '?q=' + encodeURIComponent(f.q) : ''}"><span>${esc(catName(c))}</span><span class="muted num">${c.n}</span></a>`).join('')}</div></div>` : ''}
          <div class="f-group"><h5>${t('price')} <span class="muted small">(د.ج / DZD)</span></h5><div class="row"><input class="input" id="f-min" type="number" min="0" dir="ltr" placeholder="${fc.price && fc.price.min != null ? Math.floor(fc.price.min / 100) : t('min')}" aria-label="${t('min')}" value="${esc(f.min)}" style="height:40px"><span>–</span><input class="input" id="f-max" type="number" min="0" dir="ltr" placeholder="${fc.price && fc.price.max != null ? Math.ceil(fc.price.max / 100) : t('max')}" aria-label="${t('max')}" value="${esc(f.max)}" style="height:40px"></div><button class="btn btn-soft btn-sm btn-block mt" id="f-price">${t('apply')}</button></div>
          ${fc.brands.length ? `<div class="f-group"><h5>${t('brand')}</h5><div class="list">${fc.brands.map(b => `<label class="check"><input type="checkbox" data-brand="${esc(b.brand)}" ${brands.includes(b.brand) ? 'checked' : ''}><span class="grow">${esc(b.brand)}</span><span class="muted small num">${b.n}</span></label>`).join('')}</div></div>` : ''}
          <div class="f-group"><h5>${t('availability')}</h5><label class="check"><input type="checkbox" id="f-stock" ${f.instock === '1' ? 'checked' : ''}>${t('in_stock_only')}</label><label class="check mt"><input type="checkbox" id="f-deal" ${f.deal === '1' || coll === 'deals' ? 'checked' : ''} ${coll === 'deals' ? 'disabled' : ''}>${t('deals_only')}</label></div>
          <div class="f-group"><h5>${t('rating')}</h5><div class="list">${[4, 3, 2].map(n => `<label class="check"><input type="radio" name="f-rating" value="${n}" ${f.rating === String(n) ? 'checked' : ''}>${stars(n)}<span class="small">${t('and_up')}</span></label>`).join('')}<label class="check"><input type="radio" name="f-rating" value="" ${!f.rating ? 'checked' : ''}>${t('all')}</label></div></div>
          ${anyFilter ? `<button class="btn btn-ghost btn-sm btn-block mt" id="f-clear">${icon('x', 'sm')} ${t('clear_filters')}</button>` : ''}
          <button class="btn btn-accent btn-block mt mob-only-flex" id="f-done">${t('show_results')} (${r.total})</button>
        </aside>
        <div><div class="toolbar"><button class="btn btn-ghost btn-sm mob-only-flex" id="f-open">${icon('filter', 'sm')} ${t('filters')}${anyFilter ? ' •' : ''}</button>
            <span class="muted small desk-only">${t('results_n', { n: r.total })}</span>
            <label class="row small"><span class="muted">${t('sort')}</span><select class="input" id="f-sort" style="height:40px;width:auto">${['', 'newest', 'price_asc', 'price_desc', 'best', 'rating', 'discount'].map(s => `<option value="${s}" ${f.sort === s ? 'selected' : ''}>${t('sort_' + (s || 'relevance'))}</option>`).join('')}</select></label></div>
          ${r.items.length ? `<div class="grid" id="lst">${r.items.map(pcard).join('')}</div>${r.pages > 1 ? `<div class="center mt-lg"><button class="btn btn-ghost" id="more">${t('load_more')}</button></div>` : ''}`
            : `<div class="empty glass"><div class="em-ic">${icon('search', 'lg')}</div><h3>${t('no_results')}</h3><p class="muted">${t('no_results_d')}</p>${anyFilter ? `<button class="btn mt" id="f-clear2">${t('clear_filters')}</button>` : `<a class="btn mt" href="/">${t('home')}</a>`}</div>`}
        </div></div></div>`);
    const fl = $('#filters');
    const openF = o => { fl.classList.toggle('mobile-open', o); document.body.style.overflow = o ? 'hidden' : ''; };
    $('#f-open') && ($('#f-open').onclick = () => openF(true)); $('#f-close').onclick = () => openF(false); $('#f-done').onclick = () => openF(false);
    $('#f-sort').onchange = e => setQ('sort', e.target.value);
    $('#f-price').onclick = () => { const p = new URLSearchParams(location.search); const mn = $('#f-min').value; const mx = $('#f-max').value; mn ? p.set('min', mn) : p.delete('min'); mx ? p.set('max', mx) : p.delete('max'); document.body.style.overflow = ''; go(base + '?' + p, { replace: true }); };
    $$('[data-brand]').forEach(c => c.onchange = () => { const sel = $$('[data-brand]:checked').map(x => x.dataset.brand); document.body.style.overflow = ''; setQ('brand', sel.join(',')); });
    $('#f-stock').onchange = e => { document.body.style.overflow = ''; setQ('instock', e.target.checked ? '1' : ''); };
    $('#f-deal').onchange = e => { document.body.style.overflow = ''; setQ('deal', e.target.checked ? '1' : ''); };
    $$('[name=f-rating]').forEach(x => x.onchange = () => { document.body.style.overflow = ''; setQ('rating', x.value); });
    const clear = () => { document.body.style.overflow = ''; go(base + (f.q ? '?q=' + encodeURIComponent(f.q) : ''), { replace: true }); };
    $('#f-clear') && ($('#f-clear').onclick = clear); $('#f-clear2') && ($('#f-clear2').onclick = clear);
    const more = $('#more');
    if (more) more.onclick = async () => {
      busy(more, true); page++; qs.set('page', page); qs.delete('facets');
      try { const n = await api('GET', '/api/products?' + qs); $('#lst').insertAdjacentHTML('beforeend', n.items.map(pcard).join('')); if (page >= n.pages) more.remove(); }
      catch (e) { toast(errMsg(e), 'err'); } finally { busy(more, false); }
    };
  });

  // ---------- product page ----------
  on(/^\/p\/([^/]+)$/, async ({ m, alive }) => {
    const p = await api('GET', '/api/products/' + encodeURIComponent(decodeURIComponent(m[1])));
    if (!alive()) return;
    S.cards.set(p.id, p);
    const name = L(p, 'name'); M.setTitle(name);
    const imgs = p.images.length ? p.images : [{ path: '/favicon.svg', thumb: '/favicon.svg' }];
    const specs = p.specs || [];
    const total = p.dist.reduce((s, d) => s + d.n, 0);
    const retDays = S.settings.return_window_days || 7;
    view(`<div class="container"><div class="page-head" style="padding-bottom:4px"><nav class="crumbs"><a href="/">${t('home')}</a>${p.crumbs.map(c => `${icon(isRTL() ? 'left' : 'right', 'sm')}<a href="/c/${esc(c.slug)}">${esc(catName(c))}</a>`).join('')}</nav></div>
      <div class="pdp">
        <div class="gallery"><div class="g-thumbs">${imgs.map((im, i) => `<button class="${i ? '' : 'on'}" data-gi="${i}" aria-label="${i + 1}"><img src="${esc(im.thumb || im.path)}" alt="" loading="lazy"></button>`).join('')}</div>
          <div class="g-main" id="gmain" title="${esc(t('zoom_hint'))}"><img src="${esc(imgs[0].path)}" alt="${esc(name)}" id="gimg" fetchpriority="high"><div class="pc-tags">${p.discount ? `<span class="tag tag-sale">-${p.discount}%</span>` : ''}${p.is_new ? `<span class="tag tag-new">${t('badge_new')}</span>` : ''}${p.is_best ? `<span class="tag tag-best">${t('badge_best')}</span>` : ''}</div></div></div>
        <div class="pdp-info">
          ${p.brand ? `<a class="pc-brand" href="/search?q=${encodeURIComponent(p.brand)}">${esc(p.brand)}</a>` : ''}
          <h1>${esc(name)}</h1>
          <div class="row wrap small">${p.rating_count ? `${stars(p.rating)}<b class="num">${Number(p.rating).toFixed(1)}</b><a class="link" href="#tabs" data-tab-go="reviews">${t('reviews_n', { n: p.rating_count })}</a>` : `<span class="muted">${t('no_reviews')}</span>`}<span class="muted">•</span><span class="muted">${S.lang === 'ar' ? 'رمز المنتج' : 'SKU'}: <span class="num" id="sku">—</span></span></div>
          <div class="price-box glass"><div class="row wrap" style="align-items:baseline;gap:12px"><span class="now" id="pnow"></span><s class="muted" id="pwas"></s><span class="save" id="psave"></span></div>
            ${p.sale_end ? `<div class="small mt" style="color:var(--sale)">${icon('clock', 'sm')} ${t('sale_ends')}: ${M.fmtDate(p.sale_end)}</div>` : ''}
            ${S.currency === 'USD' ? `<div class="hint mt">${t('price_note_usd', { rate: M.rateTxt(), date: M.fmtDate(S.settings.fx_updated_at, false) || '—' })}</div>` : ''}</div>
          <div id="vopts"></div>
          <div class="small bold" id="pstock"></div>
          <div class="buy-row">${qtyControl('pqty', 1)}<button class="btn btn-accent" id="padd">${icon('cart', 'sm')} ${t('add_to_cart')}</button><button class="btn" id="pbuy">${t('buy_now')}</button>
            <button class="icon-btn pc-fav ${S.favs.has(p.id) ? 'on' : ''}" data-fav="${p.id}" style="position:static;width:52px;height:52px" aria-label="${t('favorites')}">${icon('heart')}</button></div>
          <div class="trust"><div>${icon('truck')}<span>${t('why_ship_d')}</span></div><div>${icon('refresh')}<span>${p.returnable ? t('returnable', { n: retDays }) : t('not_returnable')}</span></div><div>${icon('shield')}<span>${t('why_pay_d')}</span></div></div>
          <div class="ship-est glass"><b class="row">${icon('truck', 'sm')} ${t('ship_estimate')}</b>
            <div class="grid-2 mt"><select class="input" id="se-w" aria-label="${t('wilaya')}"></select><select class="input" id="se-c" aria-label="${t('commune')}" disabled></select></div>
            <div class="rate-list" id="se-out"></div></div>
        </div></div>
      <section class="section" id="tabs"><div class="tabs" role="tablist">${[['desc', t('description')], ['specs', t('specs')], ['reviews', `${t('reviews')} (${p.rating_count})`], ['ret', t('returns_warranty')]].map(([k, l], i) => `<button role="tab" data-tab="${k}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</div>
        <div data-pane="desc" class="prose">${esc(L(p, 'desc'))}</div>
        <div data-pane="specs" class="hide"><div class="card" style="overflow:hidden;max-width:820px"><table class="spec-table">${specs.map(s => `<tr><td>${esc(L(s, 'k') || s.k || '')}</td><td>${esc(L(s, 'v') || s.v || '')}</td></tr>`).join('')}</table></div></div>
        <div data-pane="reviews" class="hide"><div class="two-col" style="padding:0;grid-template-columns:300px 1fr">
          <div class="glass panel"><div style="font:800 44px Inter">${Number(p.rating || 0).toFixed(1)}</div>${stars(p.rating || 0)}<div class="muted small mb">${t('reviews_n', { n: total })}</div>
            <div class="dist">${p.dist.map(d => `<div><span class="num">${d.s}★</span><span class="bar"><i style="width:${total ? Math.round(d.n * 100 / total) : 0}%"></i></span><span class="num muted">${d.n}</span></div>`).join('')}</div>
            ${p.can_review ? `<button class="btn btn-accent btn-block mt" id="rv-open">${icon('edit', 'sm')} ${t('write_review')}</button>` : ''}</div>
          <div>${p.reviews.length ? p.reviews.map(r => `<div class="review"><div class="row between"><b>${esc(r.name)}</b><span class="tiny muted">${M.fmtDate(r.created_at, false)}</span></div><div class="row small">${stars(r.rating)}${r.verified ? `<span class="tag" style="background:var(--accent-soft);color:var(--accent-ink)">${icon('check', 'sm')} ${t('verified_purchase')}</span>` : ''}</div>${r.comment ? `<p style="margin:8px 0 0">${esc(r.comment)}</p>` : ''}</div>`).join('') : `<div class="empty"><p class="muted">${t('no_reviews')}</p></div>`}</div></div></div>
        <div data-pane="ret" class="hide prose">${p.returnable ? esc(t('returnable', { n: retDays })) : esc(t('not_returnable'))}${L(p, 'warranty') ? `\n\n<b>${t('warranty')}:</b> ${esc(L(p, 'warranty'))}` : ''}\n\n<a class="link" href="/page/returns">${t('pg_returns')}</a></div>
      </section>
      ${p.similar.length ? `<section class="section"><div class="sec-head"><h2><span class="ic">${icon('layers', 'sm')}</span>${t('similar')}</h2></div>${scroller(p.similar, 'sc-sim')}</section>` : ''}
      <div class="sticky-buy glass"><div class="grow"><b id="sb-price"></b></div><button class="btn btn-accent btn-sm" id="sb-add">${icon('cart', 'sm')}</button><button class="btn btn-sm" id="sb-buy">${t('buy_now')}</button></div>
    </div>`);
    // gallery
    const gimg = $('#gimg'); const gm = $('#gmain'); let gi = 0;
    $$('[data-gi]').forEach(b => b.onclick = () => { gi = Number(b.dataset.gi); gimg.src = imgs[gi].path; $$('[data-gi]').forEach(x => x.classList.toggle('on', x === b)); });
    if (matchMedia('(hover:hover)').matches) {
      gm.addEventListener('mousemove', e => { const r = gm.getBoundingClientRect(); gm.style.setProperty('--zx', ((e.clientX - r.left) / r.width * 100) + '%'); gm.style.setProperty('--zy', ((e.clientY - r.top) / r.height * 100) + '%'); gm.classList.add('zoom'); });
      gm.addEventListener('mouseleave', () => gm.classList.remove('zoom'));
    }
    gm.onclick = () => lightbox(imgs.map(i => i.path), gi);
    // variants, qty, price
    let v = null; let qc;
    const upd = nv => {
      v = nv; const eff = p.eff + (v ? v.price_delta : 0); const was = p.price + (v ? v.price_delta : 0);
      $('#pnow').innerHTML = money(eff); $('#pnow').style.color = eff < was ? 'var(--sale)' : '';
      $('#pwas').innerHTML = eff < was ? money(was) : ''; $('#psave').innerHTML = eff < was ? `${icon('tag', 'sm')} -${Math.round((was - eff) * 100 / was)}%` : '';
      $('#sb-price').innerHTML = money(eff); $('#sku').textContent = v && v.sku ? v.sku : '—';
      const st = v ? v.stock : 0;
      $('#pstock').innerHTML = !v ? `<span class="muted">${t('choose_options_first')}</span>` : st <= 0 ? `<span style="color:var(--danger)">${t('out_of_stock')}</span>` : st <= 5 ? `<span style="color:var(--sale)">${t('only_left', { n: st })}</span>` : `<span style="color:var(--accent-ink)">${icon('check-circle', 'sm')} ${t('in_stock')} — ${t('stock_qty', { n: st })}</span>`;
      ['#padd', '#pbuy', '#sb-add', '#sb-buy'].forEach(s => { $(s).disabled = !v || st <= 0; });
      qc && qc.clamp();
    };
    variantPicker($('#vopts'), p.variants, upd);
    qc = bindQty($('#pqty'), () => v ? v.stock : 1);
    $('#padd').onclick = e => addToCart(p, v, qc.get(), gimg, e.currentTarget);
    $('#sb-add').onclick = e => addToCart(p, v, qc.get(), gimg, e.currentTarget);
    $('#pbuy').onclick = () => buyNow(v, qc.get()); $('#sb-buy').onclick = () => buyNow(v, qc.get());
    // tabs
    const showTab = k => { $$('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === k)); $$('[data-pane]').forEach(x => x.classList.toggle('hide', x.dataset.pane !== k)); };
    $$('[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
    $$('[data-tab-go]').forEach(a => a.onclick = e => { e.preventDefault(); showTab(a.dataset.tabGo); $('#tabs').scrollIntoView({ behavior: 'smooth' }); });
    // review
    const rv = $('#rv-open');
    if (rv) rv.onclick = () => {
      let rating = 5;
      const md = modal(`<h3>${t('write_review')}</h3><div class="field"><span>${t('your_rating')}</span><div class="star-input">${[1, 2, 3, 4, 5].map(i => `<button data-r="${i}" class="on" aria-label="${i}"><svg viewBox="0 0 24 24"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg></button>`).join('')}</div></div>
        <label class="field mt"><span>${t('your_comment')}</span><textarea class="input" id="rv-c" maxlength="1000"></textarea></label><button class="btn btn-accent btn-block mt" id="rv-s">${t('submit')}</button>`);
      $$('[data-r]', md).forEach(b => b.onclick = () => { rating = Number(b.dataset.r); $$('[data-r]', md).forEach(x => x.classList.toggle('on', Number(x.dataset.r) <= rating)); });
      $('#rv-s', md).onclick = async e => { busy(e.currentTarget, true); try { await api('POST', `/api/products/${p.id}/reviews`, { rating, comment: $('#rv-c', md).value }); closeOverlay(); toast(t('review_thanks')); route(true); } catch (er) { toast(errMsg(er), 'err'); busy(e.currentTarget, false); } };
    };
    // shipping estimator
    const sw = $('#se-w'); const sc = $('#se-c'); const out = $('#se-out');
    const remembered = JSON.parse(localStorage.getItem('mdz_dest') || '{}');
    await fillWilayas(sw, remembered.w); if (remembered.w) await fillCommunes(sc, remembered.w, remembered.c); else await fillCommunes(sc, 0);
    const est = async () => {
      const w = Number(sw.value); const c = Number(sc.value) || 0; localStorage.setItem('mdz_dest', JSON.stringify({ w, c }));
      if (!w) { out.innerHTML = ''; return; }
      out.innerHTML = '<div class="skel" style="height:44px"></div>';
      try {
        const r = await api('POST', '/api/shipping/estimate', { wilaya_id: w, commune_id: c, weight_g: (p.weight_g || 0) * (qc ? qc.get() : 1) });
        const row = (lbl, list) => list.length ? list.map(o => `<div><span>${lbl} • ${esc(o.carrier_name)}${o.days ? ` <span class="muted small">(${esc(o.days)} ${t('days')})</span>` : ''}</span><b>${money(o.price)}</b></div>`).join('') : `<div><span>${lbl}</span><span class="muted small">${t('no_rate')}</span></div>`;
        out.innerHTML = row(t('home_delivery'), r.home) + row(t('office_delivery'), r.office);
      } catch (e) { out.innerHTML = `<div class="msg msg-err">${esc(errMsg(e))}</div>`; }
    };
    sw.onchange = async () => { await fillCommunes(sc, Number(sw.value)); est(); }; sc.onchange = est; if (remembered.w) est();
  });

  function lightbox(list, i) {
    const o = $('#overlay');
    const draw = () => { o.innerHTML = `<div class="lightbox" role="dialog" aria-modal="true"><img src="${esc(list[i])}" alt=""><button class="icon-btn" data-lb="x" style="position:fixed;top:16px;inset-inline-end:16px;background:#fff">${icon('x')}</button>${list.length > 1 ? `<button class="icon-btn" data-lb="-1" style="position:fixed;top:50%;inset-inline-start:16px;background:#fff">${icon(isRTL() ? 'right' : 'left')}</button><button class="icon-btn" data-lb="1" style="position:fixed;top:50%;inset-inline-end:16px;background:#fff">${icon(isRTL() ? 'left' : 'right')}</button>` : ''}</div>`;
      $$('[data-lb]', o).forEach(b => b.onclick = e => { e.stopPropagation(); if (b.dataset.lb === 'x') return closeOverlay(); i = (i + Number(b.dataset.lb) + list.length) % list.length; draw(); });
      o.querySelector('.lightbox').onclick = e => { if (e.target.classList.contains('lightbox')) closeOverlay(); }; };
    draw(); const k = e => { if (e.key === 'Escape') { closeOverlay(); document.removeEventListener('keydown', k); } }; document.addEventListener('keydown', k);
  }

  // ---------- cart ----------
  function summaryRows(q, { withShipping } = {}) {
    return `<div class="sum-row"><span>${t('subtotal')} <span class="muted small">(${t('items_n', { n: q.lines.reduce((s, l) => s + l.qty, 0) })})</span></span><b>${money(q.items_original)}</b></div>
      ${q.items_discount ? `<div class="sum-row discount"><span>${t('items_discount')}</span><b>−${money(q.items_discount)}</b></div>` : ''}
      ${q.coupon_discount ? `<div class="sum-row discount"><span>${t('coupon')} <span class="num">${esc(q.coupon.code)}</span></span><b>−${money(q.coupon_discount)}</b></div>` : ''}
      <div class="sum-row"><span>${t('shipping')}</span><b>${withShipping && q.shipping ? (q.shipping.price ? money(q.shipping.price) : `<span style="color:var(--accent-ink)">${t('free')}</span>`) : `<span class="muted small">${t('shipping_at_checkout')}</span>`}</b></div>
      <div class="sum-row total"><span>${withShipping ? t('grand_total') : t('total')}</span><span>${money(q.total, 'DZD')}</span></div>
      ${S.currency === 'USD' ? `<div class="hint" style="text-align:end">${t('approx', { amount: M.moneyTxt(q.total, 'USD') })}</div>` : ''}`;
  }
  M.summaryRows = summaryRows;
  function couponBox(q, coupon) {
    return `<form class="coupon-row" id="cp-form"><input class="input" name="code" placeholder="${esc(t('coupon_ph'))}" value="${esc(coupon || '')}" dir="ltr" style="text-transform:uppercase" aria-label="${t('coupon')}">${coupon ? `<button type="button" class="btn btn-ghost btn-sm" id="cp-rm">${t('remove')}</button>` : `<button class="btn btn-sm">${t('apply')}</button>`}</form>
      ${q.coupon ? (q.coupon.ok ? `<div class="msg msg-ok">${icon('check-circle', 'sm')} ${t('coupon_applied', { code: esc(q.coupon.code) })}</div>` : `<div class="msg msg-err">${icon('alert', 'sm')} ${esc(t('err_' + q.coupon.reason))}</div>`) : ''}`;
  }
  M.couponBox = couponBox;
  const issueText = is => is.code === 'insufficient_stock' ? t('qty_limited', { n: is.stock }) : t('err_' + is.code);

  on(/^\/cart$/, async ({ alive }) => {
    M.setTitle(t('cart'));
    let coupon = sessionStorage.getItem('mdz_coupon') || '';
    const draw = async () => {
      const q = await Cart.quote(coupon ? { coupon } : {});
      if (!alive()) return;
      if (!q.lines.length) {
        return view(`<div class="container"><div class="empty glass mt-lg"><div class="em-ic">${icon('cart', 'lg')}</div><h3>${t('cart_empty')}</h3><p class="muted">${t('cart_empty_d')}</p><a class="btn btn-accent mt" href="/">${t('continue_shopping')}</a></div></div>`);
      }
      const issues = new Map(q.issues.map(i => [i.variant_id, i]));
      const free = Number(S.settings.free_shipping_min_dzd) || 0;
      view(`<div class="container"><div class="page-head"><h1>${t('cart')} <span class="muted num" style="font-size:18px">(${q.lines.reduce((s, l) => s + l.qty, 0)})</span></h1></div>
        <div class="two-col"><div class="stack">
          ${free ? `<div class="msg msg-info">${icon('truck', 'sm')} ${t('free_shipping_from', { amount: M.moneyTxt(free) })}</div>` : ''}
          ${q.issues.length ? `<div class="msg msg-err">${icon('alert', 'sm')} ${t('err_cart_issues')}</div>` : ''}
          ${q.lines.map(l => `<div class="cart-line glass" data-vid="${l.variant_id}"><a href="/p/${esc(l.slug)}"><img src="${esc(l.image || '/favicon.svg')}" alt="" loading="lazy"></a>
            <div><a class="bold" href="/p/${esc(l.slug)}">${esc(L(l, 'name'))}</a><div class="meta">${[l.color && `${t('color')}: ${esc(colorName(l.color))}`, l.size && `${t('size')}: ${esc(l.size)}`].filter(Boolean).join(' • ')}</div>
              <div class="price mt" style="gap:6px"><span class="now" style="font-size:15px">${money(l.unit_price)}</span>${l.unit_price < l.original_price ? `<span class="was">${money(l.original_price)}</span>` : ''}</div>
              ${issues.has(l.variant_id) ? `<div class="issue">${esc(issueText(issues.get(l.variant_id)))}</div>` : l.stock <= 5 ? `<div class="pc-stock low">${t('only_left', { n: l.stock })}</div>` : ''}</div>
            <div class="end" style="display:grid;gap:10px;justify-items:end"><b>${money(l.line_total)}</b>
              <div class="qty sm" data-qty><button data-d="-1" ${l.qty <= 1 ? 'disabled' : ''} aria-label="-">${icon('minus', 'sm')}</button><input value="${l.qty}" inputmode="numeric" aria-label="${t('quantity')}" readonly><button data-d="1" ${l.qty >= l.stock ? 'disabled' : ''} aria-label="+">${icon('plus', 'sm')}</button></div>
              <button class="link small" data-rm style="border:0;background:none;color:var(--danger)">${icon('trash', 'sm')} ${t('remove')}</button></div></div>`).join('')}
          <a class="link" href="/">${icon('arrow', 'sm flip')} ${t('continue_shopping')}</a></div>
        <aside class="summary glass"><h3>${t('order_summary')}</h3>${couponBox(q, coupon)}${summaryRows(q)}
          <button class="btn btn-lg btn-accent btn-block mt" id="to-checkout" ${q.issues.length ? 'disabled' : ''}>${S.user ? t('checkout') : t('login_to_checkout')} ${icon('arrow', 'sm flip')}</button>
          <div class="row mt small muted" style="justify-content:center">${icon('lock', 'sm')} ${t('secure_pay')}</div></aside></div></div>`);
      $$('.cart-line').forEach(el => {
        const vid = Number(el.dataset.vid); const l = q.lines.find(x => x.variant_id === vid);
        $$('[data-d]', el).forEach(b => b.onclick = async () => { busy(b, true); try { await Cart.set(vid, Math.min(l.stock, l.qty + Number(b.dataset.d))); await draw(); } catch (e) { toast(errMsg(e), 'err'); busy(b, false); } });
        $('[data-rm]', el).onclick = async () => { try { await Cart.set(vid, 0); await draw(); } catch (e) { toast(errMsg(e), 'err'); } };
      });
      $('#cp-form').onsubmit = e => { e.preventDefault(); coupon = e.target.code.value.trim().toUpperCase(); if (coupon) sessionStorage.setItem('mdz_coupon', coupon); draw(); };
      const rm = $('#cp-rm'); if (rm) rm.onclick = () => { coupon = ''; sessionStorage.removeItem('mdz_coupon'); draw(); };
      $('#to-checkout').onclick = () => go(S.user ? '/checkout' : '/login?next=/checkout');
    };
    await draw();
  });

  // ---------- checkout ----------
  on(/^\/checkout$/, async ({ q: params, alive }) => {
    M.setTitle(t('checkout'));
    const buynow = params.get('buynow') === '1';
    const bnItems = buynow ? JSON.parse(sessionStorage.getItem('mdz_buynow') || '[]') : null;
    if (buynow && !bnItems.length) return go('/cart', { replace: true });
    const st = { coupon: sessionStorage.getItem('mdz_coupon') || '', addressId: null, method: 'home', carrierId: null, pay: null, idem: uid(), quote: null };
    const [addrs, me] = await Promise.all([api('GET', '/api/addresses'), api('GET', '/api/me')]);
    if (!alive()) return;
    S.user = me.user || S.user;
    const def = addrs.find(a => a.is_default) || addrs[0];
    if (def) { st.addressId = def.id; st.method = def.delivery_method; }
    const s = S.settings; const walletOn = s.pay_wallet_enabled === '1'; const codOn = s.pay_cod_enabled === '1';
    st.pay = codOn ? 'cod' : walletOn ? 'wallet' : null;
    const base = () => buynow ? { items: bnItems } : { source: 'cart' };
    view(`<div class="container"><div class="page-head"><nav class="crumbs"><a href="/cart">${t('cart')}</a>${icon(isRTL() ? 'left' : 'right', 'sm')}<span>${t('checkout')}</span></nav><h1>${t('checkout')}</h1></div>
      <div class="two-col"><div>
        <section class="step glass"><h3><span class="n">1</span>${t('ship_address')}</h3>
          <div class="stack" id="addr-list">${addrs.map(a => `<label class="choice"><input type="radio" name="addr" value="${a.id}" ${a.id === st.addressId ? 'checked' : ''}><span class="grow"><b>${esc(a.label || a.full_name)}</b> ${a.is_default ? `<span class="tag" style="background:var(--soft)">${t('default')}</span>` : ''}<br><span class="small muted">${esc(a.full_name)} • <span class="num">${esc(a.phone)}</span><br>${esc(L({ n_ar: a.w_ar, n_en: a.w_en }, 'n'))} — ${esc(L({ n_ar: a.c_ar, n_en: a.c_en }, 'n'))} • ${esc(a.address)}</span></span></label>`).join('')}
            <label class="choice"><input type="radio" name="addr" value="new" ${addrs.length ? '' : 'checked'}><span class="grow"><b>${icon('plus', 'sm')} ${t('new_address')}</b></span></label></div>
          <form id="new-addr" class="mt ${addrs.length ? 'hide' : ''}">${addrFields()}<label class="check mt"><input type="checkbox" name="save" checked> ${t('save_address')}</label></form>
          <div class="field mt"><span>${t('delivery_method')}</span><div class="seg" id="dm"><button data-m="home">${icon('home', 'sm')} ${t('home_delivery')}</button><button data-m="office">${icon('package', 'sm')} ${t('office_delivery')}</button></div></div>
        </section>
        <section class="step glass"><h3><span class="n">2</span>${t('carrier')}</h3><div id="carriers" class="stack"></div></section>
        <section class="step glass"><h3><span class="n">3</span>${t('payment_method')}</h3><div class="stack" id="pay"></div>
          <label class="field mt"><span>${t('driver_notes')} <span class="muted">(${t('optional')})</span></span><input class="input" id="order-notes" maxlength="300"></label></section>
      </div>
      <aside class="summary glass" id="sum"><div class="skel" style="height:260px"></div></aside></div></div>`);
    const newForm = $('#new-addr'); newForm.onsubmit = e => e.preventDefault();
    await bindAddrFields(newForm, {}, () => requote());
    const isNew = () => ($('[name=addr]:checked') || {}).value === 'new';
    const dest = () => {
      if (isNew()) return { wilaya_id: Number(newForm.wilaya_id.value) || null, commune_id: Number(newForm.commune_id.value) || null };
      const a = addrs.find(x => x.id === st.addressId); return a ? { wilaya_id: a.wilaya_id, commune_id: a.commune_id } : {};
    };
    $$('[name=addr]').forEach(r => r.onchange = () => {
      newForm.classList.toggle('hide', r.value !== 'new');
      if (r.value !== 'new') { st.addressId = Number(r.value); const a = addrs.find(x => x.id === st.addressId); if (a) st.method = a.delivery_method; } else st.addressId = null;
      drawMethod(); requote();
    });
    const drawMethod = () => $$('#dm button').forEach(b => b.classList.toggle('on', b.dataset.m === st.method));
    $$('#dm button').forEach(b => b.onclick = () => { st.method = b.dataset.m; drawMethod(); requote(); });
    drawMethod();

    function drawCarriers(q) {
      const box = $('#carriers'); const d = dest();
      if (!d.wilaya_id || !d.commune_id) { box.innerHTML = `<p class="muted small">${t('choose_wilaya')} / ${t('choose_commune')}</p>`; return; }
      if (q.shipping_issue) { box.innerHTML = `<div class="msg msg-warn">${icon('alert', 'sm')} ${t(q.shipping_issue === 'no_shipping_rate' ? 'no_rate_cart' : 'err_' + q.shipping_issue)}</div>`; return; }
      box.innerHTML = q.shipping_options.map(o => `<label class="choice"><input type="radio" name="carrier" value="${o.carrier_id}" ${q.shipping && q.shipping.carrier_id === o.carrier_id ? 'checked' : ''}><span class="grow row between"><span><b>${esc(o.carrier_name)}</b>${o.days ? `<br><span class="small muted">${t('delivered_in', { d: esc(o.days) })}</span>` : ''}</span><b>${q.shipping && q.shipping.free ? `<s class="muted small">${money(o.price)}</s> ${t('free')}` : money(o.price)}</b></span></label>`).join('');
      $$('[name=carrier]').forEach(r => r.onchange = () => { st.carrierId = Number(r.value); requote(); });
    }
    function drawPay(q) {
      const bal = S.user ? S.user.wallet.available : 0; const enough = bal >= q.total;
      if (st.pay === 'wallet' && !enough && codOn) st.pay = 'cod';
      $('#pay').innerHTML = `${walletOn ? `<label class="choice ${enough ? '' : 'disabled'}"><input type="radio" name="pay" value="wallet" ${st.pay === 'wallet' ? 'checked' : ''} ${enough ? '' : 'disabled'}><span class="grow"><b class="row">${icon('wallet', 'sm')} ${t('pay_wallet')}</b><span class="small muted">${t('pay_wallet_d')}</span><br><span class="small">${t('balance')}: <b>${money(bal, 'DZD')}</b>${enough ? ` • ${t('balance_after')}: <b>${money(bal - q.total, 'DZD')}</b>` : ''}</span>
          ${enough ? '' : `<div class="msg msg-warn mt">${icon('alert', 'sm')}<span class="grow">${t('insufficient')}</span><a class="link" href="/account/wallet/topup">${t('topup_now')}</a></div>`}</span></label>` : ''}
        ${codOn ? `<label class="choice"><input type="radio" name="pay" value="cod" ${st.pay === 'cod' ? 'checked' : ''}><span class="grow"><b class="row">${icon('truck', 'sm')} ${t('pay_cod')}</b><span class="small muted">${t('pay_cod_d')}</span></span></label>` : ''}
        ${!walletOn && !codOn ? `<div class="msg msg-err">${t('methods_none')}</div>` : ''}`;
      $$('[name=pay]').forEach(r => r.onchange = () => { st.pay = r.value; });
    }
    function drawSummary(q, msg) {
      const issues = new Map(q.issues.map(i => [i.variant_id, i]));
      $('#sum').innerHTML = `<h3>${t('order_summary')}</h3>${msg || ''}
        <div style="max-height:260px;overflow:auto">${q.lines.map(l => `<div class="mini-line"><img src="${esc(l.image || '/favicon.svg')}" alt=""><span class="grow">${esc(L(l, 'name'))}<br><span class="tiny muted">${[l.color && colorName(l.color), l.size].filter(Boolean).map(esc).join(' • ')} × <span class="num">${l.qty}</span></span>${issues.has(l.variant_id) ? `<br><span class="tiny" style="color:var(--danger)">${esc(issueText(issues.get(l.variant_id)))}</span>` : ''}</span><b class="small">${money(l.line_total)}</b></div>`).join('')}</div>
        ${couponBox(q, st.coupon)}${summaryRows(q, { withShipping: true })}
        <button class="btn btn-lg btn-accent btn-block mt" id="place" ${q.issues.length || !q.shipping || !st.pay ? 'disabled' : ''}>${icon('lock', 'sm')} ${t('place_order')}</button>
        ${st.pay === 'cod' ? `<p class="hint mt">${t('cod_unpaid_note')}</p>` : ''}`;
      $('#cp-form').onsubmit = e => { e.preventDefault(); st.coupon = e.target.code.value.trim().toUpperCase(); if (st.coupon) sessionStorage.setItem('mdz_coupon', st.coupon); requote(); };
      const rm = $('#cp-rm'); if (rm) rm.onclick = () => { st.coupon = ''; sessionStorage.removeItem('mdz_coupon'); requote(); };
      $('#place').onclick = confirmPlace;
    }
    let qTok = 0;
    async function requote(msg) {
      const my = ++qTok; const d = dest();
      try {
        const q = await api('POST', '/api/cart/quote', { ...base(), coupon: st.coupon || undefined, ...d, method: st.method, carrier_id: st.carrierId });
        if (my !== qTok || !alive()) return;
        if (!q.lines.length) return go('/cart', { replace: true });
        st.quote = q; if (q.shipping) st.carrierId = q.shipping.carrier_id;
        drawCarriers(q); drawPay(q); drawSummary(q, msg);
        $$('[name=pay]').forEach(r => r.addEventListener('change', () => drawSummary(st.quote, msg)));
      } catch (e) { toast(errMsg(e), 'err'); }
    }
    async function confirmPlace() {
      const q = st.quote; if (!q) return;
      let addrText;
      if (isNew()) {
        if (!newForm.reportValidity()) return;
        const w = newForm.wilaya_id; const c = newForm.commune_id;
        addrText = `${esc(newForm.full_name.value)} • <span class="num">${esc(newForm.phone.value)}</span><br>${esc(w.options[w.selectedIndex].text)} — ${esc(c.options[c.selectedIndex].text)}<br>${esc(newForm.address.value)}`;
      } else { const a = addrs.find(x => x.id === st.addressId); addrText = `${esc(a.full_name)} • <span class="num">${esc(a.phone)}</span><br>${esc(L({ n_ar: a.w_ar, n_en: a.w_en }, 'n'))} — ${esc(L({ n_ar: a.c_ar, n_en: a.c_en }, 'n'))}<br>${esc(a.address)}`; }
      const totalTxt = M.moneyTxt(q.total, 'DZD');
      const md = modal(`<h3>${t('confirm_order_title')}</h3><p class="muted small">${t('review_before')}</p>
        <div class="stack"><div class="card panel" style="padding:14px"><b class="small muted">${t('deliver_to')}</b><div class="small mt">${addrText}</div><div class="small mt">${icon(st.method === 'home' ? 'home' : 'package', 'sm')} ${t(st.method === 'home' ? 'home_delivery' : 'office_delivery')} • ${esc(q.shipping.carrier_name)}</div></div>
          <div class="card panel" style="padding:14px"><b class="small muted">${t('payment_method')}</b><div class="mt">${st.pay === 'wallet' ? `${icon('wallet', 'sm')} ${t('pay_wallet')}` : `${icon('truck', 'sm')} ${t('pay_cod')}`}</div></div>
          <div class="card panel" style="padding:14px">${q.lines.map(l => `<div class="row between small"><span>${esc(L(l, 'name'))} × <span class="num">${l.qty}</span></span><b>${money(l.line_total, 'DZD')}</b></div>`).join('')}<hr style="border:0;border-top:1px dashed var(--line-2)">${summaryRows(q, { withShipping: true })}</div>
          <div class="msg ${st.pay === 'wallet' ? 'msg-info' : 'msg-warn'}">${icon('info', 'sm')} ${t(st.pay === 'wallet' ? 'confirm_order_wallet' : 'confirm_order_cod', { total: totalTxt })}</div></div>
        <div class="row mt-lg" style="justify-content:flex-end"><button class="btn btn-ghost" data-close>${t('back')}</button><button class="btn btn-accent" id="do-place">${icon('check', 'sm')} ${t('confirm')}</button></div>`, { wide: false });
      $$('[data-close]', md).forEach(b => b.onclick = closeOverlay);
      $('#do-place', md).onclick = async e => {
        const btn = e.currentTarget; busy(btn, true);
        try {
          const body = { payment_method: st.pay, idempotency_key: st.idem, delivery_method: st.method, carrier_id: st.carrierId, coupon: st.coupon || undefined, expected_total: q.total, currency: S.currency, notes: $('#order-notes').value || undefined,
            ...(buynow ? { source: 'buynow', items: bnItems } : { source: 'cart' }) };
          if (isNew()) {
            const a = M.formData(newForm); a.delivery_method = st.method;
            if (newForm.save.checked) { const r = await api('POST', '/api/addresses', a); body.address_id = r.id; } else body.address = a;
          } else body.address_id = st.addressId;
          const r = await api('POST', '/api/orders', body);
          closeOverlay(); sessionStorage.removeItem('mdz_coupon'); if (buynow) sessionStorage.removeItem('mdz_buynow');
          await refreshMe();
          go(`/account/orders/${encodeURIComponent(r.number)}?placed=1`, { replace: true });
        } catch (er) {
          busy(btn, false); closeOverlay();
          if (er.code === 'price_changed' || er.code === 'cart_issues') return requote(`<div class="msg msg-warn mb">${icon('alert', 'sm')} ${t(er.code === 'price_changed' ? 'price_changed' : 'err_cart_issues')}</div>`);
          if (er.code === 'insufficient_balance') { toast(t('insufficient'), 'err'); await refreshMe(); return requote(); }
          toast(errMsg(er), 'err'); requote();
        }
      };
    }
    await requote();
  }, { auth: true });

  // ---------- boot ----------
  async function boot() {
    try {
      const b = await api('GET', '/api/bootstrap');
      S.settings = b.settings; S.categories = b.categories; S.mailConfigured = b.mail_configured;
      setUser(b.user);
    } catch (e) { S.settings = S.settings || {}; S.categories = S.categories || []; }
    renderChrome();
    route(true);
    setInterval(() => { if (S.user && document.visibilityState === 'visible') refreshMe(); }, 60000);
  }
  M.Cart = Cart; M.GC = GC; M.setUser = setUser; M.renderChrome = renderChrome; M.findCat = findCat;
  // account.js registers its routes synchronously after this file; boot on DOMContentLoaded so all routes exist
  document.addEventListener('DOMContentLoaded', boot);
})();
