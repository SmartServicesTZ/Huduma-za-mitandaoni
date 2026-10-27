-- Expand users.role to the five roles observed in Firestore source code.
-- Preserve all user-related rows while rebuilding only the users table. The
-- temporary staging tables are ordinary tables dropped before the migration
-- completes; Wrangler rolls back the migration if any statement fails.
-- This is isolated PoC schema work.

CREATE TABLE __role_mig_user_permissions AS SELECT * FROM user_permissions;
CREATE TABLE __role_mig_token_balances AS SELECT * FROM token_balances;
CREATE TABLE __role_mig_token_ledger AS SELECT * FROM token_ledger;
CREATE TABLE __role_mig_payment_orders AS SELECT * FROM payment_orders;
CREATE TABLE __role_mig_nida_requests AS SELECT * FROM nida_requests;
CREATE TABLE __role_mig_service_applications AS SELECT * FROM service_applications;
CREATE TABLE __role_mig_lipa_applications AS SELECT * FROM lipa_applications;
CREATE TABLE __role_mig_licenses AS SELECT * FROM licenses;
CREATE TABLE __role_mig_file_objects AS SELECT * FROM file_objects;
CREATE TABLE __role_mig_admin_actions AS SELECT * FROM admin_actions;

-- Remove dependent rows in FK-safe order while their exact values remain in
-- the staging copies above. This avoids disabling foreign-key enforcement.
DELETE FROM nida_requests;
DELETE FROM service_applications;
DELETE FROM lipa_applications;
DELETE FROM licenses;
DELETE FROM file_objects;
DELETE FROM admin_actions;
DELETE FROM payment_orders;
DELETE FROM token_balances;
DELETE FROM token_ledger;
DELETE FROM user_permissions;

CREATE TABLE users_role_migration_v2 (
  uid TEXT PRIMARY KEY,
  phone TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','moderator','support','super_admin')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users_role_migration_v2 (uid, phone, display_name, role, active, created_at, updated_at)
SELECT uid, phone, display_name, role, active, created_at, updated_at FROM users;

DROP TABLE users;
ALTER TABLE users_role_migration_v2 RENAME TO users;
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, active);

-- Restore every preserved row after the new users table exists. token_ledger
-- precedes NIDA requests because the latter can reference a charged ledger row.
INSERT INTO user_permissions SELECT * FROM __role_mig_user_permissions;
INSERT INTO token_ledger SELECT * FROM __role_mig_token_ledger;
INSERT INTO token_balances SELECT * FROM __role_mig_token_balances;
INSERT INTO payment_orders SELECT * FROM __role_mig_payment_orders;
INSERT INTO nida_requests SELECT * FROM __role_mig_nida_requests;
INSERT INTO service_applications SELECT * FROM __role_mig_service_applications;
INSERT INTO lipa_applications SELECT * FROM __role_mig_lipa_applications;
INSERT INTO licenses SELECT * FROM __role_mig_licenses;
INSERT INTO file_objects SELECT * FROM __role_mig_file_objects;
INSERT INTO admin_actions SELECT * FROM __role_mig_admin_actions;

DROP TABLE __role_mig_user_permissions;
DROP TABLE __role_mig_token_balances;
DROP TABLE __role_mig_token_ledger;
DROP TABLE __role_mig_payment_orders;
DROP TABLE __role_mig_nida_requests;
DROP TABLE __role_mig_service_applications;
DROP TABLE __role_mig_lipa_applications;
DROP TABLE __role_mig_licenses;
DROP TABLE __role_mig_file_objects;
DROP TABLE __role_mig_admin_actions;
