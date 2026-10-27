# SmartServicesTZ — Cloudflare D1 proof of concept

## Safety status

- Isolated database: `smartservicestz-poc`.
- Sample schema only; no production records copied.
- Production Worker, Firebase Authentication, Firestore, payments, and R2 production bucket are unchanged.
- Do not point production traffic at this database until migration and security tests are complete.

## Why this first step

The Worker code currently imports `getFirestore()` throughout `worker/src/handlers.ts` and uses Firestore transactions for token and application operations. This PR introduces a D1 schema as an isolated foundation only; it does not replace the Firestore adapter or alter live request routing.

## Tables in the proof of concept

- `users`, `services`, `service_locks`, `site_settings`, `announcements`, `tutorial_videos`
- `token_balances`, `token_ledger`, `idempotency_keys`
- `applications` for NIDA/service/Lipa/business-license request metadata
- `licenses` with unique license number, verification code, and application constraints
- `file_objects` for R2 object metadata
- `admin_audit` for administrative audit records

The schema deliberately uses unique constraints and non-negative balance checks. These constraints alone do not complete a safe token/payment transaction; the application layer must use D1 batch/transaction semantics, atomically write the ledger and balance, and enforce idempotency on every retry.

## Apply locally

From `kituo-digitali/worker` after installing Wrangler:

```sh
pnpm exec wrangler d1 execute smartservicestz-poc --local --file=migrations/0001_poc_schema.sql
pnpm exec wrangler d1 execute smartservicestz-poc --local --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

The remote PoC database was created separately in Cloudflare and is empty until the migration is applied. Apply remotely only after reviewing the SQL:

```sh
pnpm exec wrangler d1 execute smartservicestz-poc --remote --file=migrations/0001_poc_schema.sql
```

Do not add the D1 binding to the production Worker yet. When a later PR introduces the binding, it must be opt-in and use a separate PoC Worker or environment.

## Required tests before any production cutover

1. Firebase ID token verification and uid-to-profile lookup.
2. Admin permissions checked server-side on every privileged operation.
3. Concurrent token deductions cannot make balances negative.
4. Repeated request with the same idempotency key cannot double-charge or double-credit.
5. Duplicate license numbers and verification codes are rejected by unique constraints.
6. Application status/rejection/admin reply fields round-trip without loss.
7. R2 file authorization checks owner/admin permissions before issuing access.
8. Pagination and indexed query plans are verified against expected volumes.
9. Backup/export and rollback are rehearsed.
10. Compare counts/checksums from a non-production export before considering live migration.

## Rollback

No production writes are routed to D1 in this phase. Rollback is simply to leave the PoC unused; Firestore remains the only live business database.
