#!/usr/bin/env bash
set -euo pipefail

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WORKER_DIR"

DATABASE="smartservicestz-poc-clean"
CONFIG="wrangler.poc.toml"
if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [backup-output-directory]" >&2
  exit 2
fi

if [[ $# -eq 1 ]]; then
  OUTPUT_DIR="$(mkdir -p "$1" && cd "$1" && pwd)"
else
  OUTPUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/smartservicestz-d1-poc-backup.XXXXXX")"
fi
BACKUP_FILE="$OUTPUT_DIR/smartservicestz-poc-clean-local-$(date -u +%Y%m%dT%H%M%SZ).sql"
RESTORE_FILE="$OUTPUT_DIR/smartservicestz-poc-clean-local-$(date -u +%Y%m%dT%H%M%SZ)-ordered.sql"
if [[ -e "$BACKUP_FILE" ]]; then
  echo "Refusing to overwrite existing backup: $BACKUP_FILE" >&2
  exit 1
fi
if [[ -e "$RESTORE_FILE" ]]; then
  echo "Refusing to overwrite existing ordered restore file: $RESTORE_FILE" >&2
  exit 1
fi
RESTORE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/smartservicestz-d1-poc-restore.XXXXXX")"
cleanup() { rm -rf "$RESTORE_DIR"; }
trap cleanup EXIT

printf 'Exporting only the local D1 binding (%s) to %s\n' "$DATABASE" "$BACKUP_FILE"
pnpm exec wrangler d1 export "$DATABASE" --local --config "$CONFIG" --output "$BACKUP_FILE"
test -s "$BACKUP_FILE"
python3 scripts/order-d1-sql-for-restore.py "$BACKUP_FILE" "$RESTORE_FILE"
chmod 600 "$BACKUP_FILE" "$RESTORE_FILE"

printf 'Restoring the SQL backup into a fresh temporary local persistence directory\n'
pnpm exec wrangler d1 execute "$DATABASE" --local --persist-to "$RESTORE_DIR" --config "$CONFIG" --file "$RESTORE_FILE"

VERIFY_SQL="SELECT CASE WHEN EXISTS (SELECT 1 FROM users WHERE uid='poc-user-001') AND EXISTS (SELECT 1 FROM token_balances WHERE uid='poc-user-001' AND nida_tokens=2 AND service_tokens=5) AND EXISTS (SELECT 1 FROM services WHERE id='poc-service-001') AND EXISTS (SELECT 1 FROM d1_migrations WHERE name='0001_smartservicestz_poc.sql') AND EXISTS (SELECT 1 FROM d1_migrations WHERE name='0002_expand_user_roles.sql') AND NOT EXISTS (SELECT 1 FROM sqlite_master WHERE name LIKE '__role_mig_%') THEN 'BACKUP_RESTORE_OK' ELSE 'BACKUP_RESTORE_FAILED' END AS verification;"
VERIFY_OUTPUT="$(pnpm exec wrangler d1 execute "$DATABASE" --local --persist-to "$RESTORE_DIR" --config "$CONFIG" --command "$VERIFY_SQL" --json)"
if ! grep -q 'BACKUP_RESTORE_OK' <<< "$VERIFY_OUTPUT"; then
  printf '%s\n' "$VERIFY_OUTPUT" >&2
  echo "Restored local database did not contain the expected synthetic fixtures." >&2
  exit 1
fi

printf 'PASS: local backup restored and synthetic records verified.\n'
sha256sum "$BACKUP_FILE"
printf 'Backup retained at: %s\n' "$BACKUP_FILE"
printf 'No remote D1 database was accessed.\n'
