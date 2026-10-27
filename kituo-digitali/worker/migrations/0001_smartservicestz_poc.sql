-- SmartServicesTZ D1 proof-of-concept schema.
-- SAMPLE/EMPTY DATABASE ONLY. Does not migrate or contain production data.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  phone TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','super_admin')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, active);

CREATE TABLE IF NOT EXISTS user_permissions (
  uid TEXT NOT NULL,
  permission TEXT NOT NULL,
  granted_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (uid, permission),
  FOREIGN KEY (uid) REFERENCES users(uid)
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  description TEXT,
  price_tzs INTEGER NOT NULL DEFAULT 0 CHECK (price_tzs >= 0),
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_services_visible_order ON services(visible, sort_order);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_announcements_visible ON announcements(visible, starts_at, ends_at);
CREATE TABLE IF NOT EXISTS tutorial_videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS service_locks (
  service_id TEXT PRIMARY KEY,
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0,1)),
  reason TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS license_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  r2_object_key TEXT,
  mime_type TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS token_balances (
  uid TEXT PRIMARY KEY,
  nida_tokens INTEGER NOT NULL DEFAULT 0 CHECK (nida_tokens >= 0),
  service_tokens INTEGER NOT NULL DEFAULT 0 CHECK (service_tokens >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid)
);
CREATE TABLE IF NOT EXISTS token_ledger (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  token_type TEXT NOT NULL CHECK (token_type IN ('nida','service')),
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL,
  reference_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor_uid TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid)
);
CREATE INDEX IF NOT EXISTS idx_token_ledger_uid_created ON token_ledger(uid, created_at DESC);
CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  provider TEXT,
  provider_reference TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','cancelled','reconciled')),
  amount_tzs INTEGER NOT NULL CHECK (amount_tzs >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid)
);

CREATE TABLE IF NOT EXISTS nida_requests (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  request_hash TEXT,
  result_hash TEXT,
  charged_ledger_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid),
  FOREIGN KEY (charged_ledger_id) REFERENCES token_ledger(id)
);
CREATE INDEX IF NOT EXISTS idx_nida_uid_created ON nida_requests(uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nida_status_created ON nida_requests(status, created_at);

CREATE TABLE IF NOT EXISTS service_applications (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  service_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  admin_reply TEXT,
  viewed_by_admin INTEGER NOT NULL DEFAULT 0 CHECK (viewed_by_admin IN (0,1)),
  file_object_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid),
  FOREIGN KEY (service_id) REFERENCES services(id)
);
CREATE INDEX IF NOT EXISTS idx_service_apps_uid_created ON service_applications(uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_apps_status_created ON service_applications(status, created_at);

CREATE TABLE IF NOT EXISTS lipa_applications (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  admin_reply TEXT,
  viewed_by_admin INTEGER NOT NULL DEFAULT 0 CHECK (viewed_by_admin IN (0,1)),
  file_object_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid)
);
CREATE INDEX IF NOT EXISTS idx_lipa_apps_uid_created ON lipa_applications(uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lipa_apps_status_created ON lipa_applications(status, created_at);

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  application_id TEXT,
  license_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'reserved',
  expires_at TEXT,
  pdf_object_key TEXT,
  qr_payload TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid)
);
CREATE INDEX IF NOT EXISTS idx_licenses_uid_created ON licenses(uid, created_at DESC);
CREATE TABLE IF NOT EXISTS file_objects (
  object_key TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  application_id TEXT,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted','quarantined')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_uid) REFERENCES users(uid)
);
CREATE INDEX IF NOT EXISTS idx_file_objects_owner ON file_objects(owner_uid, created_at DESC);
CREATE TABLE IF NOT EXISTS admin_actions (
  id TEXT PRIMARY KEY,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_uid) REFERENCES users(uid)
);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at DESC);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  uid TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS migration_checkpoints (
  migration_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('started','verified','failed')),
  source_count INTEGER,
  target_count INTEGER,
  checksum TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed only synthetic test records; safe for the isolated POC.
INSERT OR IGNORE INTO users(uid, phone, display_name, role) VALUES ('poc-user-001','255000000001','POC Test User','user');
INSERT OR IGNORE INTO token_balances(uid, nida_tokens, service_tokens) VALUES ('poc-user-001',2,5);
INSERT OR IGNORE INTO services(id, title, category, description, price_tzs, visible, sort_order)
VALUES ('poc-service-001','Huduma ya Majaribio','POC','Synthetic record only',0,1,1);
