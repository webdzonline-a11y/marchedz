// Database layer: SQLite (WAL) via better-sqlite3. All money is stored as INTEGER minor units
// (DZD centimes). Foreign currency amounts are kept alongside with the exchange rate used.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'marche.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','support','finance','manager','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  email_verified_at TEXT,
  avatar TEXT,
  lang TEXT DEFAULT 'ar',
  currency TEXT DEFAULT 'DZD',
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT, ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wilayas (
  id INTEGER PRIMARY KEY,           -- official code 1..58
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS communes (
  id INTEGER PRIMARY KEY,
  wilaya_id INTEGER NOT NULL REFERENCES wilayas(id),
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  daira_ar TEXT, daira_en TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_communes_w ON communes(wilaya_id);

CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,
  full_name TEXT NOT NULL, phone TEXT NOT NULL,
  wilaya_id INTEGER NOT NULL REFERENCES wilayas(id),
  commune_id INTEGER NOT NULL REFERENCES communes(id),
  delivery_method TEXT NOT NULL DEFAULT 'home' CHECK (delivery_method IN ('home','office')),
  address TEXT NOT NULL, notes TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  icon TEXT, image TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  brand TEXT,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  desc_ar TEXT, desc_en TEXT,
  specs TEXT NOT NULL DEFAULT '[]',               -- JSON [{k_ar,k_en,v_ar,v_en}]
  price INTEGER NOT NULL CHECK (price >= 0),       -- DZD centimes
  sale_price INTEGER CHECK (sale_price IS NULL OR sale_price >= 0),
  sale_start TEXT, sale_end TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','archived')),
  featured INTEGER NOT NULL DEFAULT 0,
  is_deal INTEGER NOT NULL DEFAULT 0,
  weight_g INTEGER NOT NULL DEFAULT 500,
  warranty_ar TEXT, warranty_en TEXT,
  returnable INTEGER NOT NULL DEFAULT 1,
  sold_count INTEGER NOT NULL DEFAULT 0,
  rating_avg REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  search_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  path TEXT NOT NULL, thumb TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  is_main INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color TEXT, size TEXT, sku TEXT,
  price_delta INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_variants_p ON variants(product_id);
CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  reason TEXT NOT NULL,       -- reserve | release | restock | adjust | initial | return
  ref_type TEXT, ref_id INTEGER,
  actor_id INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_user ON reviews(product_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id)
);
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL CHECK (qty > 0),
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, variant_id)
);

CREATE TABLE IF NOT EXISTS carriers (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual','api')),
  api_base TEXT,
  api_id TEXT, api_secret TEXT,           -- never sent to the browser
  from_wilaya_id INTEGER,
  last_test_at TEXT, last_test_ok INTEGER NOT NULL DEFAULT 0, last_test_msg TEXT,
  tracking_url TEXT
);
CREATE TABLE IF NOT EXISTS shipping_rates (
  id INTEGER PRIMARY KEY,
  carrier_id INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  wilaya_id INTEGER NOT NULL REFERENCES wilayas(id),
  commune_id INTEGER NOT NULL DEFAULT 0,       -- 0 = whole wilaya
  method TEXT NOT NULL CHECK (method IN ('home','office')),
  price INTEGER NOT NULL CHECK (price >= 0),
  included_kg INTEGER NOT NULL DEFAULT 5,
  extra_per_kg INTEGER NOT NULL DEFAULT 0,
  days TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (carrier_id, wilaya_id, commune_id, method)
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value INTEGER NOT NULL CHECK (value > 0),      -- percent (1..100) or DZD centimes
  starts_at TEXT, ends_at TEXT,
  min_order INTEGER NOT NULL DEFAULT 0,
  max_discount INTEGER,
  usage_limit INTEGER, per_user_limit INTEGER,
  product_ids TEXT NOT NULL DEFAULT '[]', category_ids TEXT NOT NULL DEFAULT '[]', user_ids TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('wallet','cod')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','partially_refunded','refunded')),
  subtotal INTEGER NOT NULL, items_discount INTEGER NOT NULL DEFAULT 0,
  coupon_id INTEGER REFERENCES coupons(id), coupon_code TEXT, coupon_discount INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL CHECK (total >= 0),
  paid_amount INTEGER NOT NULL DEFAULT 0,
  refunded_amount INTEGER NOT NULL DEFAULT 0,
  display_currency TEXT NOT NULL DEFAULT 'DZD', fx_rate_micro INTEGER NOT NULL,
  ship_name TEXT NOT NULL, ship_phone TEXT NOT NULL,
  wilaya_id INTEGER NOT NULL REFERENCES wilayas(id), commune_id INTEGER NOT NULL REFERENCES communes(id),
  ship_wilaya TEXT, ship_commune TEXT,
  delivery_method TEXT NOT NULL CHECK (delivery_method IN ('home','office')),
  ship_address TEXT NOT NULL, ship_notes TEXT,
  carrier_id INTEGER REFERENCES carriers(id),
  weight_g INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  cancel_reason TEXT, admin_notes TEXT,
  paid_at TEXT, delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  variant_id INTEGER REFERENCES variants(id) ON DELETE SET NULL,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  color TEXT, size TEXT, image TEXT,
  unit_price INTEGER NOT NULL, original_price INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  line_total INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_history (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL,
  note TEXT, actor_id INTEGER, actor_type TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  method TEXT NOT NULL,              -- wallet | cod
  kind TEXT NOT NULL DEFAULT 'charge', -- charge | refund
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  reference TEXT, wallet_txn_id INTEGER,
  actor_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_charge ON payments(order_id) WHERE kind = 'charge';
CREATE TABLE IF NOT EXISTS coupon_usages (
  id INTEGER PRIMARY KEY,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  discount INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  carrier_id INTEGER REFERENCES carriers(id),
  tracking TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','api')),
  status TEXT, label_url TEXT, stopdesk_id TEXT,
  raw TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shipment_order ON shipments(order_id);

CREATE TABLE IF NOT EXISTS wallets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  available INTEGER NOT NULL DEFAULT 0 CHECK (available >= 0),
  held INTEGER NOT NULL DEFAULT 0 CHECK (held >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Immutable ledger. Every balance change = exactly one row here.
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('topup','purchase','refund','withdraw_hold','withdraw_release','withdraw_payout','order_cancel_refund')),
  delta_available INTEGER NOT NULL, delta_held INTEGER NOT NULL,
  available_after INTEGER NOT NULL, held_after INTEGER NOT NULL,
  orig_currency TEXT NOT NULL DEFAULT 'DZD', orig_amount INTEGER NOT NULL, fx_rate_micro INTEGER,
  status TEXT NOT NULL DEFAULT 'completed',
  source_type TEXT NOT NULL, source_id INTEGER NOT NULL,
  note TEXT, actor_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_type, source_id, type)
);
CREATE INDEX IF NOT EXISTS idx_wtx_user ON wallet_transactions(user_id);
CREATE TRIGGER IF NOT EXISTS wtx_no_update BEFORE UPDATE ON wallet_transactions BEGIN SELECT RAISE(ABORT, 'ledger is immutable'); END;
CREATE TRIGGER IF NOT EXISTS wtx_no_delete BEFORE DELETE ON wallet_transactions BEGIN SELECT RAISE(ABORT, 'ledger is immutable'); END;

CREATE TABLE IF NOT EXISTS topup_requests (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  method TEXT NOT NULL CHECK (method IN ('ccp','usdt')),
  currency TEXT NOT NULL CHECK (currency IN ('DZD','USD')),
  requested_amount INTEGER NOT NULL CHECK (requested_amount > 0),  -- minor units of currency
  sent_amount INTEGER NOT NULL CHECK (sent_amount > 0),
  reference TEXT NOT NULL,
  network TEXT, transfer_date TEXT,
  receipt_file_id INTEGER,
  user_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','needs_info','approved','rejected')),
  approved_amount INTEGER, credited_dzd INTEGER, fx_rate_micro INTEGER,
  admin_note TEXT,
  reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_topup_reference ON topup_requests(method, reference) WHERE status <> 'rejected';

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  method TEXT NOT NULL CHECK (method IN ('ccp','usdt')),
  currency TEXT NOT NULL CHECK (currency IN ('DZD','USD')),
  orig_amount INTEGER NOT NULL CHECK (orig_amount > 0),
  amount_dzd INTEGER NOT NULL CHECK (amount_dzd > 0),     -- held amount (centimes)
  fee_dzd INTEGER NOT NULL DEFAULT 0,
  net_orig INTEGER NOT NULL,
  fx_rate_micro INTEGER NOT NULL,
  beneficiary_name TEXT NOT NULL,
  account TEXT NOT NULL, account_key TEXT, network TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','needs_info','approved','paid','rejected','cancelled')),
  payout_reference TEXT,
  admin_note TEXT,
  reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT,
  paid_by INTEGER REFERENCES users(id), paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refund_requests (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL, details TEXT,
  requested_amount INTEGER NOT NULL CHECK (requested_amount > 0),
  approved_amount INTEGER,
  order_prev_status TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','needs_info','approved','rejected')),
  admin_note TEXT,
  reviewed_by INTEGER REFERENCES users(id), reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_open ON refund_requests(order_id) WHERE status IN ('pending','needs_info');

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id),
  purpose TEXT NOT NULL,          -- receipt | ticket
  path TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, original_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,   -- NULL = staff notification
  audience TEXT NOT NULL DEFAULT 'user' CHECK (audience IN ('user','staff')),
  perm TEXT,
  type TEXT NOT NULL,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL,
  body_ar TEXT, body_en TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  subject TEXT NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','customer_reply','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  is_staff INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  file_id INTEGER REFERENCES files(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER, actor_role TEXT,
  action TEXT NOT NULL, entity TEXT, entity_id TEXT,
  before_json TEXT, after_json TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;

CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT, secret INTEGER NOT NULL DEFAULT 0, updated_at TEXT DEFAULT (datetime('now')) );
CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY, title_ar TEXT NOT NULL, title_en TEXT NOT NULL, body_ar TEXT NOT NULL, body_en TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY, grp TEXT NOT NULL, q_ar TEXT NOT NULL, q_en TEXT NOT NULL, a_ar TEXT NOT NULL, a_en TEXT NOT NULL, sort INTEGER DEFAULT 0
);
`);

module.exports = { db, DB_PATH, DATA_DIR };
