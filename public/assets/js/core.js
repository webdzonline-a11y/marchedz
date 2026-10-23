/* Marché DZ — shared front-end core (store + admin): i18n, API client, money, icons, UI primitives. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cookie = n => (document.cookie.split('; ').find(x => x.startsWith(n + '=')) || '').split('=')[1] || '';

  const state = {
    lang: document.documentElement.lang === 'en' ? 'en' : 'ar',
    currency: localStorage.getItem('mdz_cur') === 'USD' ? 'USD' : 'DZD',
    settings: {}, user: null, categories: [],
  };
  const t = (k, p) => { let s = (I18N[state.lang] && I18N[state.lang][k]) ?? I18N.ar[k] ?? k; if (p) s = s.replace(/\{(\w+)\}/g, (_, x) => p[x] ?? ''); return s; };
  const L = (o, base) => o ? (state.lang === 'en' ? (o[base + '_en'] || o[base + '_ar']) : (o[base + '_ar'] || o[base + '_en'])) : '';

  // ---------- money (minor units = DZD centimes) ----------
  const rate = () => Number(state.settings.fx_usd_rate_micro || 135000000);
  const toUsdCents = c => Math.round(c * 1e6 / rate());
  function fmtNum(n, dec) { return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
  function money(minor, cur = state.currency) {
    if (minor == null || isNaN(minor)) return '—';
    if (cur === 'USD') { const u = toUsdCents(minor) / 100; return `<span class="num">$${fmtNum(u, 2)}</span>`; }
    const d = minor / 100; const dec = Number.isInteger(d) ? 0 : 2;
    return state.lang === 'ar' ? `<span class="num">${fmtNum(d, dec)}</span> د.ج` : `<span class="num">${fmtNum(d, dec)} DZD</span>`;
  }
  const moneyTxt = (minor, cur) => money(minor, cur).replace(/<[^>]+>/g, '');
  const moneyIn = (minor, cur) => cur === 'USD' ? `<span class="num">$${fmtNum(minor / 100, 2)}</span>` : money(minor, 'DZD'); // amount already in that currency
  const rateTxt = () => fmtNum(rate() / 1e6, 2);
  const fmtDate = (s, withTime = true) => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') || String(s).includes('+') ? '' : 'Z'));
    return d.toLocaleString(state.lang === 'ar' ? 'ar-DZ-u-nu-latn' : 'en-GB', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }); };

  // ---------- API ----------
  async function api(method, url, body) {
    const opts = { method, credentials: 'same-origin', headers: { 'x-csrf-token': decodeURIComponent(cookie('mdz_csrf')) } };
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let r;
    try { r = await fetch(url, opts); } catch { throw { code: 'network' }; }
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw { status: r.status, code: (data && data.error) || 'generic', ...(typeof data === 'object' ? data : {}) };
    return data;
  }
  const errMsg = e => { const k = 'err_' + (e && e.code); const m = t(k); return m === k ? t('err_generic') : m + (e && e.message && e.code === 'carrier_error' ? ` — ${e.message}` : ''); };

  // ---------- icons ----------
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.6l2.4 11.2a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.5L21.5 7H6"/>',
    bag: '<path d="M6 7h12l1 13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M9 7V6a3 3 0 0 1 6 0v1"/>', heart: '<path d="M19.5 12.6 12 20l-7.5-7.4A4.9 4.9 0 0 1 12 6.1a4.9 4.9 0 0 1 7.5 6.5z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    down: '<path d="m6 9 6 6 6-6"/>', right: '<path d="m9 6 6 6-6 6"/>', left: '<path d="m15 6-6 6 6 6"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/>',
    truck: '<path d="M10 17h4V5H2v12h3"/><path d="M14 8h4l4 4v5h-3"/><circle cx="7.5" cy="17.5" r="2"/><circle cx="16.5" cy="17.5" r="2"/>',
    shield: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/>',
    headset: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z"/><path d="M19 17v1a3 3 0 0 1-3 3h-3"/>',
    package: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>', box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    check: '<path d="m5 12 5 5 9-10"/>', 'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>', edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l5-5-5-5M15 12H3"/>', pin: '<path d="M12 22s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>', flame: '<path d="M12 22c4 0 7-2.7 7-7 0-4-3-6-4-9-1 2-2 3-3.5 3.5C11 7 11 4 9 2c0 4-4 6.5-4 11.5C5 19 8 22 12 22z"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/>', call: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v7h4v-7h3l1-4h-4V8a1 1 0 0 1 1-1z"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5v.01"/>', tiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 3 2.5 5 6 5"/>',
    whatsapp: '<path d="M3 21l1.7-5A9 9 0 1 1 8 19.3z"/><path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 1a4 4 0 0 1-2.5-2.5l1-1-1-2z"/>',
    receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>', send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    clip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>', chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    ticket: '<path d="M3 8a2 2 0 0 0 0 4 2 2 0 0 1 0 4v2a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>', database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>', download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>', lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    shirt: '<path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>', dress: '<path d="M9 2v4l-2 4 2 1-4 11h14l-4-11 2-1-2-4V2"/><path d="M9 6h6"/>',
    baby: '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 0 0 5 0"/>', shoe: '<path d="M3 16V8l5 1 3 4 7 1.5a3 3 0 0 1 3 3V19H3z"/><path d="M3 16h18"/>',
    glasses: '<circle cx="6.5" cy="15" r="3.5"/><circle cx="17.5" cy="15" r="3.5"/><path d="M10 15h4M3 15l2-8h2M21 15l-2-8h-2"/>',
    watch: '<circle cx="12" cy="12" r="6"/><path d="M12 9v3l2 1M9 6.5 9.5 2h5l.5 4.5M9 17.5 9.5 22h5l.5-4.5"/>', gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21 8 9l4-6 4 6z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z"/>',
    pot: '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M2 10h20M9 6h6M12 6V4"/>', utensils: '<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 21V3c-2 0-4 2-4 6v5h4"/>',
    cup: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2v3M12 2v3"/>', coffee: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2v3M12 2v3"/>',
    lamp: '<path d="M8 2h8l3 9H5z"/><path d="M12 11v8M8 21h8"/>', drop: '<path d="M12 2.7s7 7.3 7 12.3a7 7 0 0 1-14 0c0-5 7-12.3 7-12.3z"/>',
    bed: '<path d="M2 20V6M2 12h20v8M22 16H2M6 12V9a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"/>', plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/>',
    blender: '<path d="M7 2h10l-2 12H9z"/><path d="M8 14h8l1 7H7z"/>', iron: '<path d="M3 18h18v-3a7 7 0 0 0-7-7H9"/><path d="M6 8h3a3 3 0 0 1 3 3"/>',
    snow: '<path d="M12 2v20M4 6l16 12M20 6 4 18"/>', phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>', tablet: '<rect x="4" y="2" width="16" height="20" rx="2.5"/><path d="M11 18h2"/>',
    battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M6 10v4M10 10v4"/>', headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
    laptop: '<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20l-1-4H3z"/>', keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>', gamepad: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7A4 4 0 0 0 2.8 8.4L2 15a3 3 0 0 0 5.3 2.2L9 15h6l1.7 2.2A3 3 0 0 0 22 15l-.8-6.6A4 4 0 0 0 17.3 5z"/>',
    camera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>', wifi: '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>', printer: '<path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="8" rx="2"/><path d="M6 14h12v8H6z"/>',
    perfume: '<rect x="5" y="9" width="14" height="13" rx="3"/><path d="M9 9V6h6v3M10 3h4v3h-4z"/>', lipstick: '<path d="M9 22h6V12H9zM8 12h8M10 12V6l4-3v9"/>', razor: '<path d="M4 4h16v5H4zM12 9v13M9 22h6"/>',
    puzzle: '<path d="M4 7h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H4v-4a2 2 0 1 0 0-4z"/>', ball: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>',
    car: '<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><path d="M3 12h18"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>', wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L22 9a6 6 0 0 1-8 8l-6 6-4-4 6-6a6 6 0 0 1 8-8z"/>',
    pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', plane: '<path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2 3 8l6 3.5L6 15H3l-1 1 4 2 2 4 1-1v-3l3.5-3L16 21z"/>',
    paw: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="4" cy="8" r="2"/><path d="M8 14c0-2 2-4 4-4s4 2 4 4c1.5 1 2.5 3 1 5-1.5 1.5-3.5 0-5 0s-3.5 1.5-5 0c-1.5-2-.5-4 1-5z"/>',
  };
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || P.box}</svg>`;
  const stars = r => `<span class="stars" aria-label="${r}/5">${[1, 2, 3, 4, 5].map(i => `<svg viewBox="0 0 24 24" class="${r >= i - .25 ? '' : 'off'}">${P.star}</svg>`).join('')}</span>`;
  const logoMark = (s = 26) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lga" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#059669"/></linearGradient></defs><path d="M23 25v-3a9 9 0 0 1 18 0v3" fill="none" stroke="url(#lga)" stroke-width="4.5" stroke-linecap="round"/><path d="M15 25h34l-3 25a4 4 0 0 1-4 3.5H22A4 4 0 0 1 18 50z" fill="#fff"/><path d="M24 45V33l8 7 8-7v12" fill="none" stroke="#0b0b0f" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const logo = (sub = true) => `<span class="logo-mark">${logoMark(28)}</span><span class="logo-word"><b>Marché<span>DZ</span></b>${sub ? `<small>${state.lang === 'ar' ? 'مارشي ديزاد' : 'Shop Algeria'}</small>` : ''}</span>`;

  const COLOR_HEX = { black: '#111', white: '#f8f8f8', silver: '#c0c4cc', blue: '#2563eb', red: '#dc2626', green: '#16a34a', gold: '#d4a017', grey: '#6b7280', gray: '#6b7280', pink: '#ec4899', brown: '#7c4a1e', beige: '#e8d9bf' };
  const colorName = c => { if (!c) return ''; const k = 'c_' + c.toLowerCase(); const v = t(k); return v === k ? c : v; };

  // ---------- statuses ----------
  const ORDER_CLS = { pending: 's-orange', confirmed: 's-blue', processing: 's-blue', ready: 's-blue', shipment_created: 's-blue', shipping: 's-blue', delivered: 's-green', cancelled: 's-red', returned: 's-gray', refund_pending: 's-orange', refunded: 's-gray' };
  const REQ_CLS = { pending: 's-orange', needs_info: 's-blue', approved: 's-green', paid: 's-green', rejected: 's-red', cancelled: 's-gray', completed: 's-green', open: 's-orange', answered: 's-green', customer_reply: 's-blue', closed: 's-gray', unpaid: 's-orange', partially_refunded: 's-blue', refunded: 's-gray' };
  const orderStatus = s => `<span class="status ${ORDER_CLS[s] || ''}">${esc(t('st_' + s))}</span>`;
  const payStatus = s => `<span class="status ${REQ_CLS[s] || ''}">${esc(t('ps_' + s))}</span>`;
  const reqStatus = s => `<span class="status ${REQ_CLS[s] || ''}">${esc(t('rq_' + s))}</span>`;
  const tkStatus = s => `<span class="status ${REQ_CLS[s] || ''}">${esc(t('tk_' + s))}</span>`;

  // ---------- UI primitives ----------
  function toast(msg, type = 'ok') {
    const el = document.createElement('div'); el.className = `toast ${type}`;
    el.innerHTML = `${icon(type === 'ok' ? 'check-circle' : type === 'err' ? 'alert' : 'info')}<span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3200);
  }
  function closeOverlay() { const o = $('#overlay'); o.innerHTML = ''; document.body.style.overflow = ''; document.removeEventListener('keydown', escClose); }
  function escClose(e) { if (e.key === 'Escape') closeOverlay(); }
  function modal(html, { onMount, wide } = {}) {
    const o = $('#overlay');
    o.innerHTML = `<div class="backdrop" data-close></div><div class="modal glass" role="dialog" aria-modal="true" style="${wide ? 'width:min(860px,calc(100vw - 28px))' : ''}"><button class="icon-btn" data-close style="position:absolute;top:12px;inset-inline-end:12px" aria-label="${t('close')}">${icon('x')}</button>${html}</div>`;
    document.body.style.overflow = 'hidden';
    o.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeOverlay));
    document.addEventListener('keydown', escClose);
    const m = o.querySelector('.modal'); const f = m.querySelector('input,select,textarea,button:not([data-close])'); if (f) setTimeout(() => f.focus(), 50);
    onMount && onMount(m);
    return m;
  }
  function confirmBox(text, { okText, danger, input, inputLabel, required } = {}) {
    return new Promise(res => {
      const m = modal(`<h3>${esc(t('confirm'))}</h3><p>${esc(text)}</p>${input ? `<label class="field mt"><span>${esc(inputLabel || '')}</span><textarea class="input" id="cb-in" ${required ? 'required' : ''}></textarea></label>` : ''}
        <div class="row mt-lg" style="justify-content:flex-end"><button class="btn btn-ghost" id="cb-no">${t('cancel')}</button><button class="btn ${danger ? 'btn-danger' : 'btn-accent'}" id="cb-ok">${esc(okText || t('confirm'))}</button></div>`);
      m.querySelector('#cb-no').onclick = () => { closeOverlay(); res(null); };
      m.querySelector('#cb-ok').onclick = () => { const v = input ? m.querySelector('#cb-in').value.trim() : true; if (input && required && !v) { m.querySelector('#cb-in').setAttribute('aria-invalid', 'true'); return; } closeOverlay(); res(v); };
    });
  }
  async function copyText(s) { try { await navigator.clipboard.writeText(s); } catch { const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } toast(t('copied')); }
  function busy(btn, on) { if (!btn) return; btn.classList.toggle('is-loading', on); btn.disabled = on; }
  const formData = form => Object.fromEntries(new FormData(form).entries());
  const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
  const minorStr = m => (m / 100).toFixed(2).replace(/\.00$/, '');

  window.MDZ = { $, $$, esc, t, L, state, api, errMsg, money, moneyTxt, moneyIn, rateTxt, toUsdCents, fmtDate, icon, stars, logo, logoMark, COLOR_HEX, colorName,
    orderStatus, payStatus, reqStatus, tkStatus, toast, modal, closeOverlay, confirmBox, copyText, busy, formData, debounce, uid, minorStr, fmtNum };
})();
