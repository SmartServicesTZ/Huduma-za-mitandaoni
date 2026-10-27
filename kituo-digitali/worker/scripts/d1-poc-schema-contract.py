#!/usr/bin/env python3
"""Validate the isolated D1 PoC schema and repository SQL using synthetic data only."""
from pathlib import Path
import re
import sqlite3

WORKER_DIR = Path(__file__).resolve().parents[1]
MIGRATION_FILE = WORKER_DIR / "migrations/0001_smartservicestz_poc.sql"
REPOSITORY_FILE = WORKER_DIR / "src/d1-poc-repository.ts"
CHECKPOINT_FILE = WORKER_DIR / "src/d1-migration-checkpoints.ts"

migration_sql = MIGRATION_FILE.read_text(encoding="utf-8")
repository_source = REPOSITORY_FILE.read_text(encoding="utf-8")
checkpoint_source = CHECKPOINT_FILE.read_text(encoding="utf-8")
connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys = ON")
connection.executescript(migration_sql)

expected_tables = set(re.findall(r"CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)", migration_sql, re.IGNORECASE))
actual_tables = {
    row[0]
    for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
}
assert expected_tables == actual_tables, f"table mismatch: declared={expected_tables ^ actual_tables}"
assert len(actual_tables) == 19, f"expected 19 PoC tables, found {len(actual_tables)}"

expected_indexes = set(re.findall(r"CREATE INDEX IF NOT EXISTS\s+([A-Za-z0-9_]+)", migration_sql, re.IGNORECASE))
actual_indexes = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")}
assert expected_indexes == actual_indexes, f"index mismatch: declared={expected_indexes ^ actual_indexes}"
assert len(actual_indexes) == 14, f"expected 14 explicit PoC indexes, found {len(actual_indexes)}"

required_columns = {
    "users": {"uid", "phone", "display_name", "role", "active", "created_at", "updated_at"},
    "user_permissions": {"uid", "permission", "granted_by", "created_at"},
    "services": {"id", "title", "category", "description", "price_tzs", "visible", "sort_order", "payload_json", "updated_at"},
    "site_settings": {"key", "value_json", "updated_by", "updated_at"},
    "announcements": {"id", "title", "body", "visible", "starts_at", "ends_at", "created_at"},
    "tutorial_videos": {"id", "title", "url", "visible", "sort_order", "created_at"},
    "service_locks": {"service_id", "locked", "reason", "updated_by", "updated_at"},
    "license_templates": {"id", "name", "r2_object_key", "mime_type", "metadata_json", "updated_at"},
    "token_balances": {"uid", "nida_tokens", "service_tokens", "updated_at"},
    "token_ledger": {"id", "uid", "token_type", "delta", "reason", "reference_id", "idempotency_key", "actor_uid", "created_at"},
    "payment_orders": {"id", "uid", "provider", "provider_reference", "status", "amount_tzs", "idempotency_key", "metadata_json", "created_at", "updated_at"},
    "nida_requests": {"id", "uid", "status", "request_hash", "result_hash", "charged_ledger_id", "created_at", "updated_at"},
    "service_applications": {"id", "uid", "service_id", "status", "rejection_reason", "admin_reply", "viewed_by_admin", "file_object_key", "metadata_json", "created_at", "updated_at"},
    "lipa_applications": {"id", "uid", "status", "rejection_reason", "admin_reply", "viewed_by_admin", "file_object_key", "metadata_json", "created_at", "updated_at"},
    "licenses": {"id", "uid", "application_id", "license_number", "status", "expires_at", "pdf_object_key", "qr_payload", "metadata_json", "created_at", "updated_at"},
    "file_objects": {"object_key", "owner_uid", "application_id", "mime_type", "byte_size", "sha256", "status", "created_at"},
    "admin_actions": {"id", "actor_uid", "action", "entity_type", "entity_id", "details_json", "created_at"},
    "idempotency_keys": {"key", "operation", "uid", "result_json", "created_at", "expires_at"},
    "migration_checkpoints": {"migration_id", "status", "source_count", "target_count", "checksum", "notes", "updated_at"},
}
for table, expected in required_columns.items():
    actual = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
    assert expected <= actual, f"{table} is missing columns: {expected - actual}"


def expect_integrity_error(sql: str, values: tuple[object, ...], label: str) -> None:
    try:
        connection.execute(sql, values)
    except sqlite3.IntegrityError:
        connection.rollback()
        return
    connection.rollback()
    raise AssertionError(f"expected SQLite constraint rejection: {label}")


user_uid = "poc-user-001"
supported_roles = ("user", "admin", "moderator", "support", "super_admin")
for role in supported_roles:
    connection.execute("INSERT INTO users(uid, role) VALUES (?, ?)", (f"contract-role-{role}", role))
connection.commit()
expect_integrity_error("INSERT INTO users(uid, role) VALUES (?, ?)", ("contract-role-invalid", "viewer"), "D1 role CHECK")
expect_integrity_error("INSERT INTO users(uid, active) VALUES (?, ?)", ("contract-active-invalid", 2), "D1 active CHECK")
connection.execute("INSERT INTO users(uid) VALUES (?)", ("contract-check-user",))
connection.commit()
expect_integrity_error("INSERT INTO token_balances(uid, nida_tokens) VALUES (?, ?)", ("contract-check-user", -1), "token balance nonnegative CHECK")
expect_integrity_error(
    "INSERT INTO token_ledger(id, uid, token_type, delta, reason, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)",
    ("contract-ledger-invalid-type", user_uid, "bonus", 1, "synthetic", "contract-ledger-invalid-type"),
    "token type CHECK",
)
expect_integrity_error(
    "INSERT INTO token_ledger(id, uid, token_type, delta, reason, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)",
    ("contract-ledger-zero", user_uid, "service", 0, "synthetic", "contract-ledger-zero"),
    "nonzero ledger delta CHECK",
)
expect_integrity_error(
    "INSERT INTO payment_orders(id, uid, status, amount_tzs, idempotency_key) VALUES (?, ?, ?, ?, ?)",
    ("contract-order-invalid", user_uid, "refunded", 0, "contract-order-invalid"),
    "payment status CHECK",
)
expect_integrity_error(
    "INSERT INTO file_objects(object_key, owner_uid, mime_type, byte_size) VALUES (?, ?, ?, ?)",
    ("contract-file-invalid", user_uid, "application/octet-stream", -1),
    "file size CHECK",
)
expect_integrity_error(
    "INSERT INTO migration_checkpoints(migration_id, status) VALUES (?, ?)",
    ("contract-checkpoint-invalid", "complete"),
    "checkpoint status CHECK",
)

# Execute the exact read-only SELECT strings from the repository against the synthetic schema.
repository_queries = re.findall(r"\.prepare\(\s*\"([^\"]+)\"\s*,?\s*\)", repository_source, re.DOTALL)
assert len(repository_queries) == 5, f"expected five D1 repository queries, found {len(repository_queries)}"
for query in repository_queries:
    assert query.lstrip().upper().startswith("SELECT"), f"non-read-only D1 repository query: {query}"
    assert not re.search(r"\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER)\b", query, re.IGNORECASE)
    if "FROM token_ledger" in query:
        parameters: tuple[object, ...] = (user_uid, 50)
    else:
        parameters = tuple(user_uid for _ in range(query.count("?")))
    connection.execute(query, parameters).fetchall()

# Execute the exact checkpoint upsert/read SQL strings from the TypeScript repository.
checkpoint_queries = re.findall(r"\.prepare\(\s*`(.*?)`\s*,?\s*\)", checkpoint_source, re.DOTALL)
assert len(checkpoint_queries) == 2, f"expected checkpoint upsert/read SQL, found {len(checkpoint_queries)} statements"
upsert_sql = checkpoint_queries[0]
select_sql = checkpoint_queries[1]
checkpoint_values = ("contract-users-v1", "started", 3, 3, "sha256:synthetic", "synthetic contract only")
connection.execute(upsert_sql, checkpoint_values)
connection.execute("UPDATE migration_checkpoints SET updated_at = ? WHERE migration_id = ?", ("2000-01-01 00:00:00", "contract-users-v1"))
connection.execute(upsert_sql, checkpoint_values)
row = connection.execute(select_sql, ("contract-users-v1",)).fetchone()
assert row is not None and row[1] == "started" and row[2:5] == (3, 3, "sha256:synthetic")
assert row[6] == "2000-01-01 00:00:00", "repeating identical checkpoint input should not update its timestamp"
connection.execute(upsert_sql, ("contract-users-v1", "verified", 3, 3, "sha256:synthetic", "synthetic contract only"))
assert connection.execute(select_sql, ("contract-users-v1",)).fetchone()[1] == "verified"

# These absent tables identify modeled workflow gaps; their absence is not silently treated as coverage.
absent_domain_tables = {"audit_logs", "messages", "fcm_tokens", "lipa_rewards", "nida_results"}
assert not (absent_domain_tables & actual_tables), "review expected absent domain tables before changing this contract"

worker_entry = (WORKER_DIR / "src/index.ts").read_text(encoding="utf-8")
assert "d1-poc-repository" not in worker_entry and "d1-migration-checkpoints" not in worker_entry, "PoC repository must stay isolated from the production Worker entrypoint"

print(f"PASS: {len(actual_tables)} tables, {len(actual_indexes)} explicit indexes, documented checks, {len(repository_queries)} read-only repository SELECTs and checkpoint upsert/read SQL validated with synthetic data.")
print("Known absent workflow tables: " + ", ".join(sorted(absent_domain_tables)))
print("No Firestore, network, Cloudflare API, remote D1, or production Worker was accessed.")
