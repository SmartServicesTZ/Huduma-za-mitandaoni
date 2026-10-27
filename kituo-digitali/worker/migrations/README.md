# SmartServicesTZ — D1 proof of concept

Status: isolated proof-of-concept only. Firestore remains production source of truth. No production Worker, website, data, billing, or cutover changes are part of this work.

## Target and scope

The PoC binding is `smartservicestz-poc-clean` (Cloudflare D1 UUID `b2b331d9-fb25-416d-890a-269d07346faf`) in `wrangler.poc.toml`. The older `smartservicestz-poc` database was not accessed. The D1 binding is not connected to production handlers.

## Latest verification — 2026-10-27

### Local checks

- `pnpm test`: PASS — 34 passed, 0 failed.
- `pnpm check`: PASS — TypeScript completed with no errors.
- The earlier local D1 migration and `pnpm d1:poc:verify:local` succeeded; synthetic user `poc-user-001` has NIDA/service balances 2/5 and `poc-service-001` was present.

### Remote D1, read-only schema/journal review

- Rechecked the target by exact name and UUID through the authorized Cloudflare integration.
- A read-only `sqlite_master` query returned 19 application tables, D1 system table `_cf_KV`, and 13 named indexes. The table and named-index DDL was reviewed against `migrations/0001_smartservicestz_poc.sql`; expected definitions were present. Synthetic fixtures remained `poc-user-001` (2/5) and `poc-service-001`.
- `SELECT name FROM sqlite_master WHERE type='table' AND name='d1_migrations'` returned no rows. Wrangler CLI `pnpm exec wrangler whoami` reports `You are not authenticated`.
- `wrangler d1 migrations apply` was **not run**. The schema already exists while Wrangler's migration journal is absent. There is no verified, non-destructive Wrangler reconciliation procedure in this task; applying it could repeat an untracked schema migration. No D1 schema or data was changed during this task.
- A prior session submitted the idempotent SQL through Cloudflare's D1 API; the SQL succeeded with no changes because the objects and seeds already existed. That does not create or prove Wrangler migration tracking.
- A prior remote synthetic write/read/idempotency/cleanup test passed; duplicate idempotency key was rejected and temporary rows were verified at zero after cleanup.
- Cloudflare's database-list metadata previously reported `num_tables: 0`, inconsistent with live `sqlite_master`; live D1 query results were used for schema evidence.

## Wrangler authentication needed

Wrangler OAuth is still blocked. To authenticate safely, run `pnpm exec wrangler login` from the `kituo-digitali/worker` directory in the same terminal environment that will run Wrangler, open its generated URL in a browser, and review/approve the Cloudflare OAuth permissions if acceptable. Do not paste a password or API token into chat. Wrangler's OAuth request includes D1 write access and other Cloudflare scopes; inspect the requested permissions before approval. After login, recheck target name/UUID, schema, and migration journal before considering any migration command. Do not delete or alter existing schema to force tracking.

## Safety and implementation boundaries

No production data is copied. Firebase Authentication remains the identity provider; Firestore remains production source of truth. No production configuration, website, billing, or cutover has changed. Future token/payment/license mutations must use transactional batches and unique idempotency keys. D1 production integration, auth-boundary review, backup, backfill, shadow reads, and rollback/cutover work remain out of scope.

## Repository groundwork

`src/d1-poc-repository.ts` contains read-only D1 helpers and `test/d1-poc-repository.test.ts` covers binding and result behavior. The schema is not connected to production handlers. Firebase ID token verification, R2 authorization, backfill, shadow reads, and cutover/rollback controls require a separate review and implementation.
