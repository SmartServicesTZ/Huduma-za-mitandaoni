# SmartServicesTZ — D1 proof of concept

Status: isolated proof-of-concept only. No production data is copied and no production Worker configuration is changed.

## Files
- `migrations/0001_smartservicestz_poc.sql`: normalized D1 schema plus synthetic test records.
- Test-only D1 binding: `smartservicestz-poc-clean` (Cloudflare D1 UUID: `b2b331d9-fb25-416d-890a-269d07346faf`) in `wrangler.poc.toml`. The production `wrangler.toml` does not reference this database.
- The earlier `smartservicestz-poc` database already contained a different schema and was not accessed during this task.

## Verification — 2026-10-27

### Local
- Starting branch/commit: `poc/firestore-to-d1-schema` at `77b469f66bdfdf3cb278584592e6d6d167b8a9ec`; working tree was clean before edits.
- Fixed the Worker TypeScript diagnostics by aligning the fallback service type with optional `tokenType`, adding profile fields already read by handlers, using explicit row types for Firestore document spreads, narrowing the untyped callable result in its test, and removing unsupported Firestore REST `orderBy()` usage in `listChatMembers`. The chat list is now sorted in-memory and handles missing profile data safely.
- `pnpm test`: passed, 34 tests passed and 0 failed.
- `pnpm check`: passed, TypeScript reported no errors.
- Earlier local D1 verification remains: `pnpm d1:poc:migrate:local` and `pnpm d1:poc:verify:local` passed; synthetic `poc-user-001` (balances 2/5) and `poc-service-001` were verified.

### Remote D1
- The confirmed target is `smartservicestz-poc-clean` / `b2b331d9-fb25-416d-890a-269d07346faf`. The pre-existing `smartservicestz-poc` database was not accessed.
- A current read-only query again found the expected 19 application tables, D1 system table `_cf_KV`, and expected indexes. The expected synthetic user/balance and service records were present; the checked payment, NIDA, application, license, file, ledger, audit, idempotency, and checkpoint tables had no rows.
- Wrangler journal check: `d1_migrations` does not exist. Wrangler CLI reports `You are not authenticated`. Therefore **do not run `wrangler d1 migrations apply` yet**: existing schema is present but Wrangler's journal state is absent, so applying the migration risks an untracked/repeated schema operation. No remote migration command was run in this task; no schema was changed.
- In the previous verification session, the exact idempotent migration SQL was sent through the D1 API; statements succeeded with no changes because the schema and synthetic fixtures were already present. This is not equivalent to Wrangler migration tracking.
- Previous remote synthetic write/read/idempotency/cleanup test passed; duplicate key rejected and all temporary records were verified at zero after cleanup.
- Cloudflare's database-list metadata previously reported `num_tables: 0`, inconsistent with live `sqlite_master`; live D1 queries are the schema evidence.

## Safety boundaries
- Firebase Authentication remains the identity provider, and Firestore remains production source of truth.
- No production secrets, users, token balances, payments, NIDA results, Lipa applications, license records, or files are copied.
- D1 is not bound to production Worker handlers. No production Worker configuration, website, billing, or cutover was changed.
- Token/payment/license mutations require transactional batches with unique idempotency keys before any production use.

## Repository groundwork
- `src/d1-poc-repository.ts` provides read-only helpers for user lookup, visible service listing, token balance, user permissions, and bounded token-ledger lookup. It uses bound parameters and is intentionally not wired into production handlers.
- `test/d1-poc-repository.test.ts` covers parameter binding, empty UID rejection, visible-service filtering/order, token balance access, permission lookup, and ledger page bounds.
- Remote Wrangler migration tracking requires Wrangler OAuth plus an explicit review of the existing tables/journal before any `wrangler d1 migrations apply smartservicestz-poc-clean --remote --config wrangler.poc.toml` attempt. Do not delete or alter existing schema to force migration.

## Not implemented
This schema does not switch application handlers to D1 and is not a production migration. Firebase ID token verification, D1 repository methods, R2 authorization, backfill, shadow reads, and cutover/rollback flags require separate implementation and tests. Firestore has not been migrated or disabled.
