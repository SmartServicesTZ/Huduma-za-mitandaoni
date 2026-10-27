-- SmartServicesTZ D1 proof-of-concept schema.
-- This migration is for the isolated smartservicestz-poc database only.
-- No production data is imported. Do not bind this database to the live Worker yet.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  phone TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user','admin','moderator','support','super_admin')),
  permissions_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(permissions_json)),
  account_status TEXT NOT NULL DEFAULT 'active',
  access_mode TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, account_status);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  data_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_services_visibility_order ON services(visible, sort_order);

CREATE TABLE IF NOT EXISTS service_locks (
  service_slug TEXT PRIMARY KEY,
  is_locked INTEGER NOT NULL CHECK (is_locked IN (0,1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_announcements_visible_order ON announcements(visible, sort_order);

CREATE TABLE IF NOT EXISTS tutorial_videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_tutorial_videos_visible_order ON tutorial_videos(visible, sort_order);

CREATE TABLE IF NOT EXISTS token_balances (
  uid TEXT PRIMARY KEY REFERENCES users(uid),
  balance_general INTEGER NOT NULL DEFAULT 0 CHECK (balance_general >= 0),
  balance_nida INTEGER NOT NULL DEFAULT 0 CHECK (balance_nida >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS token_ledger (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid),
  token_type TEXT NOT NULL CHECK (token_type IN ('general','nida')),
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor_uid TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_token_ledger_uid_created ON token_ledger(uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_ledger_reference ON token_ledger(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid),
  application_type TEXT NOT NULL CHECK (application_type IN ('nida','service','lipa','business_license')),
  service_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  admin_reply TEXT,
  viewed_by_admin INTEGER NOT NULL DEFAULT 0 CHECK (viewed_by_admin IN (0,1)),
  viewed_by_user INTEGER NOT NULL DEFAULT 0 CHECK (viewed_by_user IN (0,1)),
  request_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(request_json)),
  result_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(result_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_applications_uid_type_created ON applications(uid, application_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_type_status_created ON applications(application_type, status, created_at DESC);

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),
  uid TEXT NOT NULL REFERENCES users(uid),
  license_number TEXT NOT NULL UNIQUE,
  verification_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  document_object_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_licenses_uid_status ON licenses(uid, status);
CREATE INDEX IF NOT EXISTS idx_licenses_expiry ON licenses(expires_at);

CREATE TABLE IF NOT EXISTS file_objects (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  owner_uid TEXT REFERENCES users(uid),
  application_id TEXT REFERENCES applications(id),
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT,
  deletion_status TEXT NOT NULL DEFAULT 'active'
    CHECK (deletion_status IN ('active','pending_delete','deleted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_file_objects_application ON file_objects(application_id);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  uid TEXT NOT NULL,
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency_keys(expires_at);

CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  actor_uid TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit(target_type, target_id, created_at DESC);

INSERT OR IGNORE INTO schema_migrations(version) VALUES ('0001_poc_schema');
