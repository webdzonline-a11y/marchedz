# Marché DZ — مارشي ديزاد

متجر إلكتروني جزائري حقيقي ومتكامل: كتالوج، سلة محفوظة في قاعدة البيانات، طلبات، محفظة (CCP / USDT)، سحوبات، كوبونات، شحن لـ58 ولاية، استرجاعات، دعم فني، وإشعارات، مع لوحة تحكم منفصلة محمية بالأدوار. الواجهة بالعربية (افتراضي، RTL) والإنجليزية (LTR).

A real, fully connected Algerian e‑commerce store. Arabic (default, RTL) + English (LTR). All prices, stock, balances and payment states are computed and validated **on the server only**.

---

## 1. التشغيل السريع / Quick start

```bash
npm install
npm run dev          # development, auto-restart on server/ changes → http://localhost:3000
npm start            # production mode (NODE_ENV=production)
npm test             # end-to-end API test suite (needs the server running; writes test data!)
```

On first start the database `data/marche.db` is created and seeded automatically:
133 categories, 118 demo products with images, 58 wilayas + 1,541 communes, carriers Yalidine & ZR Express (manual mode), legal pages & FAQ.

| | URL |
|---|---|
| Storefront | `/` |
| Admin panel | `/admin` |

### Seeded accounts — **change them immediately**

| Role | Email | Password |
|---|---|---|
| Admin (all permissions) | `admin@marchedz.dz` | `Admin@2026!` |
| Demo customer | `demo@marchedz.dz` | `Demo@2026!` |

Demo coupon: `BIENVENUE10`. Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` **before the first start** to seed your own admin instead.

### Before accepting real orders (nothing is pre-filled on purpose)
1. **Shipping › Delivery rates** — enter your real prices per wilaya / commune / method (home / stop‑desk). Wilayas without a price cannot be ordered to; no “guessed” defaults exist.
2. **Settings › Payments, CCP & USDT** — your CCP account (name, number, key, RIP) and instructions. CCP top‑ups stay hidden until a number is entered.
3. **Settings › Currency** — the USD rate (DZD per 1 USD). Every transaction stores the rate it used.
4. **Settings › General / Contact / Policies (Pages & FAQ)** — store name, logo, colours, hero text, contact info, policy texts.
5. **Staff** — create staff accounts with the least role they need.

---

## 2. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port (binds 0.0.0.0) |
| `NODE_ENV` | — | `production` enables `Secure` cookies + HSTS and hides dev verification codes |
| `DATA_DIR` | `./data` | DB, private uploads (receipts, ticket files), backups |
| `DB_PATH` | `$DATA_DIR/marche.db` | SQLite file |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | see above | first admin (seed only) |
| `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (`1` for 465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | — | email for verification & password‑reset codes |

**Without SMTP** codes are printed to the server log, and — only when `NODE_ENV` is not `production` — returned to the browser to make local testing possible. **In production you must configure SMTP**, otherwise users cannot verify email or reset passwords.

---

## 3. Production checklist

> **Hosting:** this is a stateful Node.js server (SQLite + uploads + background jobs). It does **not** run on Vercel/Netlify static hosting. Use the included `Dockerfile` on Railway, Render, Fly.io or a VPS with a persistent volume mounted at `/data` — step-by-step guide in **DEPLOY.md**.


- **HTTPS is mandatory.** Run behind a reverse proxy (Nginx / Caddy / Cloudflare) that terminates TLS; the app already trusts one proxy hop (`trust proxy = 1`) and sets `Secure` cookies + HSTS in production.
- Change the admin password (and remove or change the demo customer).
- Configure SMTP (see above).
- **Backups:** Admin › Backups creates a consistent online snapshot in `data/backups/`. Also copy the whole `data/` folder (DB + `private/` receipts) to off‑site storage daily. `public/uploads/` holds product/category images.
- Keep `data/` outside any public web root; receipts in `data/private` are only served through `/api/files/:id` to their owner or staff with the finance/support permission.
- Run with a process manager (systemd / pm2) and `npm start`.
- Demo product images and texts come from dummyjson.com (test data) — replace them with your own catalogue.

### Carriers (Yalidine / ZR Express)
Both are seeded in **manual mode**: you type tracking numbers yourself. To enable the API, open Admin › Shipping, enter your API ID/token (stored server‑side and never sent back unmasked), then press **Test connection**. A carrier is shown as *connected* only after a real successful test. API base URLs are editable — **verify endpoints and field names against the documentation of your own carrier account**, since providers change them. On any API failure you can always fall back to manual entry.

### ⚠️ USDT / crypto — legal note
Accepting or paying out crypto‑assets (USDT) may be restricted or prohibited in Algeria (see the 2018 Finance Law, art. 117, and any later texts and Bank of Algeria regulations). USDT top‑ups and withdrawals are **disabled by default** and the admin must explicitly acknowledge this note before enabling them. **Consult a lawyer / verify the current Algerian legal and regulatory requirements before enabling them.** The store never credits USDT automatically: an admin must verify each TXID on the blockchain (TXIDs are unique across all accounts).

---

## 4. Money & business rules (summary)
- All amounts are stored as integer **centimes** (DZD × 100). USD is display‑only, converted with the admin rate; order totals are frozen at order time.
- Wallet balance = ledger. Every change is a transaction with a unique reference, before/after balances, currency, original amount and rate. No direct balance edits exist anywhere.
- **CCP top‑up:** receipt upload is required, status *under review*; funds are credited **only** after an admin approves (once, atomically, with approving admin + time). Admin can reject with a reason or request more information.
- **Withdrawals:** amount is held on request, released on rejection, debited on payout with a payout reference; min/max limits and fees from settings.
- **COD orders** are never marked paid until the admin records the collection.
- **Refunds** are credited to the wallet once and can never exceed what was actually paid.
- Stock is reserved when an order is placed and released on cancellation or when an unpaid pending order expires (`pending_order_ttl_hours`).
- Order statuses: pending → confirmed → processing → ready → shipment created → in delivery → delivered (+ cancelled / returned / refund processing / refunded), each transition logged.

## 5. Security
bcrypt password hashing, HttpOnly session cookies, double‑submit CSRF tokens, strict CSP (no inline scripts), parameterised SQL everywhere, rate limiting on auth / orders / finance endpoints, account lockout after repeated failures, role‑based admin permissions (admin / manager / finance / support), full audit log with before/after values and IP, private file access checks, and generic error messages.

## 6. Project layout
```
server/index.js        Express app, SSR meta, static files
server/db.js           SQLite schema (better-sqlite3, WAL)
server/lib.js          settings, FX, wallet ledger, stock, coupons, shipping quotes, order flow, refunds
server/http.js         sessions, CSRF, security headers, rate limits, validators, uploads
server/routes/store.js public + customer API (/api)
server/routes/admin.js admin API (/api/admin)
server/carriers.js     Yalidine / ZR Express adapters
server/mailer.js       SMTP (nodemailer) with dev fallback
server/seed*.js        initial data
public/                storefront SPA (index.html) + admin SPA (admin.html), assets, uploads
scripts/e2e.js         end-to-end test suite (70 checks)
```

Resetting the dev database: stop the server, delete `data/marche.db*`, start again (it reseeds).
