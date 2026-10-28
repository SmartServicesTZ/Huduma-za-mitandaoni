# SmartServicesTZ — D1 proof of concept

Status: isolated proof-of-concept only. Firestore remains production source of truth. No production Worker, website, data, billing, or cutover changes are part of this work.

## Target and scope

The PoC binding is `smartservicestz-poc-clean` (Cloudflare D1 UUID `b2b331d9-fb25-416d-890a-269d07346faf`) in `wrangler.poc.toml`. The older `smartservicestz-poc` database was not accessed. The D1 binding is not connected to production handlers. Current application roles in the PoC schema are `user`, `admin`, `moderator`, `support`, and `super_admin`.

## Latest verification — 2026-10-27

### Local checks

- `pnpm test`: PASS — 34 passed, 0 failed.
- `pnpm check`: PASS — TypeScript completed with no errors.
- The earlier local D1 migration and `pnpm d1:poc:verify:local` succeeded; synthetic user `poc-user-001` has NIDA/service balances 2/5 and `poc-service-001` was present.

### Remote D1, read-only schema/journal review

- Rechecked the target by exact name and UUID through the authorized Cloudflare integration.
- A read-only `sqlite_master` query returned 19 application tables, D1 system table `_cf_KV`, and 14 named indexes. The table and named-index DDL was reviewed against `migrations/0001_smartservicestz_poc.sql`; expected definitions were present. Synthetic fixtures remained `poc-user-001` (2/5) and `poc-service-001`.
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


## Firestore read optimisation — 2026-10-28

The production Firestore adapter now supports an opaque document-ID cursor through `startAfter()` and bounded `limit()` values. Cursor payloads are base64url encoded, validated server-side, and are never accepted as a raw Firestore path. The paginated Worker list handlers return a consistent shape:

```json
{ "items": [], "nextCursor": "...", "hasMore": false }
```

For backwards compatibility, the domain keys remain present (`users`, `applications`, or `requests`) alongside `nextCursor` and `hasMore`. Supported handlers are `listAdminUsers`, `listLipaApplications`, `listServiceApplications`, `listNidaRequests`, and `listMyNidaRequests`. The browser wrappers request at most 50 documents per call and follow cursors sequentially, so the admin views no longer depend on the previous 200/500-document hard limits.

The cursor is based on the Firestore document ID and the adapter applies a deterministic descending document-name order before `startAt`. This avoids offset pagination and prevents a page boundary from changing when earlier records are removed. The client still performs display-only filtering/sorting where legacy screens require it; a future refinement can add indexed `orderBy` fields after production index review.

Verification in this branch must remain local and isolated. Run `pnpm exec tsc --noEmit`, `pnpm test`, and `pnpm run build` from `kituo-digitali/`. Do not run a production migration, copy production Firestore data into D1, or merge this PoC branch into `main`. Remote D1 migration verification still requires Wrangler OAuth and a fresh review of the migration journal.
