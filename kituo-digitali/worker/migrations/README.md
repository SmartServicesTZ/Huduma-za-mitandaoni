# SmartServicesTZ — D1 proof of concept

Status: isolated proof-of-concept only. No production data is copied and no production Worker configuration is changed.

## Files
- `migrations/0001_smartservicestz_poc.sql`: normalized D1 schema plus synthetic test records.
- Test-only D1 binding: `smartservicestz-poc-clean` (Cloudflare D1 UUID: `b2b331d9-fb25-416d-890a-269d07346faf`) in `wrangler.poc.toml`. The production `wrangler.toml` does not reference this database.
- The earlier `smartservicestz-poc` database already contained a different schema and was not accessed in this verification.

## Verification performed — 2026-10-27

### Local
- `pnpm d1:poc:migrate:local`: passed; Wrangler reported successful execution of the migration statements.
- `pnpm d1:poc:verify:local`: passed; expected tables/indexes and synthetic `poc-user-001` (NIDA/service balances 2/5) and `poc-service-001` were returned.
- `pnpm test`: passed, 34 tests passed and 0 failed.
- `pnpm check`: failed with 17 TypeScript errors in existing `src/handlers.ts` and `test/handlers.test.ts` (15 and 2 respectively). The D1 repository unit tests passed within the Worker test suite.

### Remote D1
- Cloudflare access was obtained through the connected Cloudflare integration. The target was checked by both exact name and UUID: `smartservicestz-poc-clean` / `b2b331d9-fb25-416d-890a-269d07346faf`.
- Cloudflare's database-list metadata reported `num_tables: 0`, but a live read-only query against `sqlite_master` returned the expected application schema (19 application tables, the D1 system table `_cf_KV`, and expected named indexes). The live query is the schema evidence; the inconsistent list metadata is noted rather than treated as authoritative.
- Before the SQL application attempt, the expected tables and seed rows were already present. Read-only row checks found only the expected synthetic user, token balance, and service; other checked application tables were empty. No production records were found in the checked tables.
- The exact migration statements were submitted to the confirmed target through the Cloudflare D1 query API. They all returned success and were idempotent (`CREATE ... IF NOT EXISTS`, `INSERT OR IGNORE`); the database reported no changes, consistent with the schema and seed records already being present.
- `d1_migrations` was not present. Therefore Wrangler's migration journal/tracking state is **not verified**, and this API execution must not be represented as a successful `wrangler d1 migrations apply` run. Wrangler CLI authentication remained unavailable in this environment.
- Remote synthetic write/read test: passed using a unique `poc-remote-smoke-*` UID. Readback matched the inserted balance and ledger values; a duplicate ledger idempotency key was rejected. Cleanup passed and verification returned zero temporary rows in users, balances, ledger, and idempotency keys.

## Safety boundaries
- Firebase Authentication remains the identity provider.
- Firestore remains production source of truth during this POC.
- No production secrets, users, token balances, payments, NIDA results, Lipa applications, license records, or files are copied.
- Do not bind this database to the production Worker until repository methods, security review, backup, and explicit cutover approval.
- Token/payment/license mutations must use D1 transactional batches with unique idempotency keys before production use.

## Repository groundwork
- `src/d1-poc-repository.ts` provides read-only helpers for user lookup, visible service listing, token balance, user permissions, and bounded token-ledger lookup. It uses bound parameters and is intentionally not wired into production handlers.
- `test/d1-poc-repository.test.ts` covers parameter binding, empty UID rejection, visible-service filtering/order, token balance access, permission lookup, and ledger page bounds.
- From the `worker` directory, use `pnpm d1:poc:migrate:local` and `pnpm d1:poc:verify:local` for local checks. Remote Wrangler migration tracking still requires `wrangler d1 migrations apply smartservicestz-poc-clean --remote --config wrangler.poc.toml` after Wrangler authentication is available, with the existing remote schema/journal state reviewed first.

## Not implemented
This schema does not switch application handlers to D1 and is not a production migration. Firebase ID token verification, D1 repository methods, R2 authorization, backfill, shadow reads, and cutover/rollback flags require separate implementation and tests. Firestore has not been migrated or disabled.
