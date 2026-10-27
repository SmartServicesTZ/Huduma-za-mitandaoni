# SmartServicesTZ — D1 proof of concept

Status: isolated proof-of-concept only. No production data is copied and no production Worker configuration is changed.

## Files
- `migrations/0001_smartservicestz_poc.sql`: normalized D1 schema plus synthetic test records.
- Test-only D1 binding: `smartservicestz-poc-clean` (Cloudflare D1 UUID: `b2b331d9-fb25-416d-890a-269d07346faf`) in `wrangler.poc.toml`. The production `wrangler.toml` does not reference this database.
- The earlier `smartservicestz-poc` database already contained a different schema, so it was left unchanged apart from its prior synthetic smoke-test row.

## Validation completed
- Applied the migration successfully to the local D1 emulator: Wrangler reported `37 commands executed successfully`.
- Local verification listed the expected application tables and indexes, and returned the synthetic user `poc-user-001` with token balances `2`/`5` plus `poc-service-001`.
- A synthetic local write/read/delete test created a temporary user, balance, and token-ledger row, read back `3`/`4` balances and a `+2` ledger entry, then removed them; cleanup queries returned zero remaining temporary rows.
- The duplicate token-ledger idempotency-key test was rejected by SQLite with `UNIQUE constraint failed`, and temporary rows were cleaned up.
- Worker test suite passed `34/34` tests, including the D1 repository tests.
- Remote Cloudflare D1 application has not been performed in this session because Wrangler has no Cloudflare authentication. Do not treat local verification as proof that the remote database is populated.

## Safety boundaries
- Firebase Authentication remains the identity provider.
- Firestore remains production source of truth during this POC.
- No production secrets, users, token balances, payments, NIDA results, Lipa applications, license records, or files are copied.
- Do not bind this database to the production Worker until repository methods, security review, backup, and explicit cutover approval.
- Token/payment/license mutations must use D1 transactional batches with unique idempotency keys before production use.

## Repository groundwork added
- `src/d1-poc-repository.ts` provides read-only helpers for user lookup, visible service listing, token balance, user permissions, and bounded token-ledger lookup. It uses bound parameters and is intentionally not wired into production handlers.
- `test/d1-poc-repository.test.ts` covers parameter binding, empty UID rejection, visible-service filtering/order, token balance access, permission lookup, and ledger page bounds.
- From the `worker` directory, use `pnpm d1:poc:migrate:local` and `pnpm d1:poc:verify:local` for local checks. A remote run must explicitly use `--config wrangler.poc.toml --remote` after Cloudflare authentication.

## Not implemented yet
This schema does not switch application handlers to D1 and is not a production migration. Firebase ID token verification, D1 repository methods, R2 authorization, backfill, shadow reads, and cutover/rollback flags require separate implementation and tests. Firestore has not been migrated or disabled.
