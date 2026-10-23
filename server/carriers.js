// Carrier adapters (Yalidine, ZR Express/Procolis). Credentials live only in the DB/server.
// A carrier is considered "connected" ONLY after a live API test succeeds — never assumed.
const TIMEOUT = 15000;
async function call(url, opts = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { }
    return { ok: r.ok, status: r.status, json, text: text.slice(0, 2000) };
  } finally { clearTimeout(t); }
}

const yalidine = {
  headers: c => ({ 'X-API-ID': c.api_id, 'X-API-TOKEN': c.api_secret, 'Content-Type': 'application/json' }),
  async test(c) {
    const r = await call(`${c.api_base}/wilayas/?page_size=1`, { headers: this.headers(c) });
    return { ok: r.ok && !!r.json, message: r.ok ? 'OK' : `HTTP ${r.status}: ${(r.json && (r.json.error?.message || r.json.message)) || r.text.slice(0, 160)}` };
  },
  async centers(c, wilayaId) {
    const r = await call(`${c.api_base}/centers/?wilaya_id=${encodeURIComponent(wilayaId)}`, { headers: this.headers(c) });
    if (!r.ok || !r.json) throw new Error(`HTTP ${r.status}`);
    return (r.json.data || []).map(x => ({ id: String(x.center_id), name: `${x.name} — ${x.commune_name || ''}` }));
  },
  async create(c, o, items, { stopdeskId, fromWilaya }) {
    const [first, ...rest] = o.ship_name.split(' ');
    const parcel = {
      order_id: o.number, from_wilaya_name: fromWilaya || '', firstname: first || o.ship_name, familyname: rest.join(' ') || first || '-',
      contact_phone: o.ship_phone, address: o.ship_address, to_commune_name: o.commune_en, to_wilaya_name: o.wilaya_en,
      product_list: items.map(i => `${i.name_en} x${i.qty}`).join(', ').slice(0, 250),
      price: o.payment_method === 'cod' ? Math.round(o.total / 100) : 0, do_insurance: false, declared_value: Math.round(o.subtotal / 100),
      height: 10, width: 20, length: 30, weight: Math.max(1, Math.ceil(o.weight_g / 1000)), freeshipping: o.payment_method !== 'cod',
      is_stopdesk: o.delivery_method === 'office', stopdesk_id: o.delivery_method === 'office' ? Number(stopdeskId) || undefined : undefined, has_exchange: false,
    };
    const r = await call(`${c.api_base}/parcels/`, { method: 'POST', headers: this.headers(c), body: JSON.stringify([parcel]) });
    const res = r.json && r.json[o.number];
    if (!r.ok || !res || !res.success || !res.tracking) throw new Error((res && res.message) || `HTTP ${r.status}: ${r.text.slice(0, 200)}`);
    return { tracking: res.tracking, label_url: res.label || null, raw: res };
  },
  async status(c, tracking) {
    const r = await call(`${c.api_base}/parcels/${encodeURIComponent(tracking)}`, { headers: this.headers(c) });
    if (!r.ok || !r.json) throw new Error(`HTTP ${r.status}`);
    const d = (r.json.data && r.json.data[0]) || r.json;
    return { status: d.last_status || d.status || null, raw: d };
  },
  mapStatus(s) {
    s = String(s || '').toLowerCase();
    if (/livr[ée]/.test(s) && !/non/.test(s)) return 'delivered';
    if (/retour/.test(s)) return 'returned';
    if (/(sorti|en livraison|transit|exp[ée]di|centre|vers)/.test(s)) return 'shipping';
    return null;
  },
};

const zrexpress = {
  headers: c => ({ token: c.api_id, key: c.api_secret, 'Content-Type': 'application/json' }),
  async test(c) {
    const r = await call(`${c.api_base}/token`, { method: 'POST', headers: this.headers(c), body: '{}' });
    const ok = r.ok && r.json && !/invalid|erreur|error/i.test(JSON.stringify(r.json).slice(0, 300));
    return { ok, message: ok ? 'OK' : `HTTP ${r.status}: ${r.text.slice(0, 160)}` };
  },
  async centers() { return []; },
  async create(c, o, items) {
    const colis = {
      Tracking: o.number, TypeLivraison: o.delivery_method === 'office' ? '1' : '0', TypeColis: '0', Confrimee: '',
      Client: o.ship_name, MobileA: o.ship_phone, MobileB: '', Adresse: o.ship_address, IDWilaya: String(o.wilaya_id), Commune: o.commune_en,
      Total: o.payment_method === 'cod' ? String(Math.round(o.total / 100)) : '0', Note: (o.ship_notes || '').slice(0, 200),
      TProduit: items.map(i => `${i.name_en} x${i.qty}`).join(', ').slice(0, 250), id_Externe: o.number, Source: 'MarcheDZ',
    };
    const r = await call(`${c.api_base}/add_colis`, { method: 'POST', headers: this.headers(c), body: JSON.stringify({ Colis: [colis] }) });
    const ok = r.ok && r.json && !/erreur|error/i.test(JSON.stringify(r.json));
    if (!ok) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
    const row = (r.json.Colis && r.json.Colis[0]) || {};
    const tracking = row.Tracking || row.tracking || o.number;
    return { tracking, label_url: null, raw: r.json };
  },
  async status(c, tracking) {
    const r = await call(`${c.api_base}/lire`, { method: 'POST', headers: this.headers(c), body: JSON.stringify({ Colis: [{ Tracking: tracking }] }) });
    if (!r.ok || !r.json) throw new Error(`HTTP ${r.status}`);
    const d = (r.json.Colis && r.json.Colis[0]) || {};
    return { status: d.Situation || d.Statut || null, raw: d };
  },
  mapStatus: yalidine.mapStatus,
};

const adapters = { yalidine, zrexpress };
const adapterFor = c => adapters[c.code] || null;
module.exports = { adapterFor };
