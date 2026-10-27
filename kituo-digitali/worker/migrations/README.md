# SmartServicesTZ — Firestore to D1 migration work

## Current state and boundaries

Firestore remains the application's source of truth. The D1 schema and repository in this branch are isolated PoC tooling; production handlers remain Firestore-backed. No production data was copied, no production Worker or website was deployed/changed, and no cutover was performed.

The only D1 target authorized for test inspection is `smartservicestz-poc-clean` (`b2b331d9-fb25-416d-890a-269d07346faf`). The older `smartservicestz-poc` database is out of scope. A fresh read-only `sqlite_master` query on 2026-10-27 confirmed the 19 application tables and 14 named indexes from the PoC schema; Cloudflare's internal `_cf_KV` table is not an application migration table. The query response reported `changed_db=false` and `rows_written=0`; `d1_migrations` was absent. Wrangler OAuth is still unauthenticated, so no remote migration command was run.

## Source-to-target mapping and decisions still required

These are recommendations for review, not adopted business rules. Keep Firestore authoritative until each mapping, access policy, and test is explicitly reviewed.

| Domain | Firestore behavior observed | Current D1 PoC coverage | Recommendation and effect; unresolved decision |
|---|---|---|---|
| Users, roles, permissions, restrictions | `users/{uid}` includes profile fields, role, permissions, `accountStatus`, `accessMode`, `allowedActions`, restriction notices and password-reset state. Current role set includes `user`, `admin`, `moderator`, `support`, `super_admin`. | `users` permits only `user`, `admin`, `super_admin`; `user_permissions` stores individual permission rows. D1 user reads are read-only. | Prefer normalized role/permission mapping with a separate role catalogue and explicit restriction fields. Do not silently map `moderator`/`support` to `admin` or discard account restrictions. This may require a schema migration and compatibility layer; without it, access may be broadened or users locked out. |
| Service catalog and CMS | Firestore collections include `services`, `siteSettings`, `announcements`, `tutorialVideos`, `serviceLocks`; catalog defaults and homepage ordering affect client behavior. | D1 has `services`, `site_settings`, `announcements`, `tutorial_videos`, `service_locks`; only a visible-service read helper exists. | Define per-collection field validation and explicit mappings for visibility, lock state, order, form fields, token cost, defaults, and initialization flags. Keep JSON payloads only where their version/validation contract is tested. Otherwise content can disappear, reorder, or behave differently. |
| Token balances and ledger | Firestore uses legacy `tokenBalance` and newer `tokenBalanceOther`/`tokenBalanceNida`; purchase, adjustment, consumption and bonus paths do not all update the same fields identically. | `token_balances(nida_tokens, service_tokens)` and `token_ledger` with unique idempotency key; repository is currently read-only. | First select one canonical balance rule by tracing/reconciling each handler and historical records. Preserve ledger provenance and use one atomic balance+ledger transaction with duplicate-key conflict tests. No balance precedence or conversion is chosen here; guessing could duplicate or erase token value. |
| Payments | FimiPay order creation, webhook verification and settlement use Firestore transactions; payment flows are disabled by default. No refund/reconciliation handler was found in the audited path. | `payment_orders` and unique idempotency columns exist, but there is no D1 settlement implementation or provider-event table. | Keep exact provider verification and transaction idempotency; consider an immutable provider-event/reconciliation record. Refund, chargeback and ambiguous `CREATE_UNKNOWN` handling need business/provider decisions and cannot be inferred from the table schema. No live provider was contacted. |
| NIDA requests/results/refunds | Requests include owner/contact, status, administrative assignment, rejection fields, raw NIDA result, token debit and notifications. The audited rejection path did not show a refund. | `nida_requests` stores hashes and charged-ledger link, not the raw operational fields/result; token tables are generic. No D1 workflow methods exist. | Decide whether raw NIDA results are retained, encrypted or stored separately, who can read them, and retention/deletion period. Separately decide refund/compensation on rejection. Until then, do not copy raw results or issue automatic refunds; each choice affects privacy, UI access and user balances. |
| Lipa applications/rewards | Firestore stores network configuration, submitted fields/files, status, replies, reward qualification/payment tracking, notifications and audit. | `lipa_applications` has generic status and `metadata_json`; no dedicated network, reward, report or open-application model. | Model network/application/reward events explicitly and make retries idempotent. Define network eligibility, verified-transaction criteria, reward amount, duplicate-open policy and paid-state transitions with the business owner first; changing these could cause duplicate or incorrect payouts. |
| Service applications and licenses | Firestore maintains submitted fields, status/replies, open markers, service usage, license applications and separate license-number reservations. | `service_applications`, `licenses` (unique license number), `license_templates`, `service_locks` and generic idempotency table exist; no D1 write flow exists. | Map lifecycle fields and define a reservation/expiry/collision strategy plus an explicit status transition graph. Keep application, token debit, ledger and license issuance atomic where appropriate. The existing five-digit suffix and eligibility rules must not be changed without product approval. |
| Files and retention | Staged/final application documents use Firebase Storage or the R2 adapter; Worker endpoints perform identity/owner checks and short-lived downloads. | `file_objects` records key, owner, application, MIME, size, optional hash and status; no D1 file lifecycle is wired. | Store metadata/references in D1 and bytes in the chosen object store; validate actual content, owner/application linkage, deletion/orphan cleanup and retention. Do not copy file bytes or widen public access. Storage provider, retention, and deletion windows require approval. |
| Audit, messages, push and idempotency | Firestore uses `adminActions`, `auditLogs`, `messages`, nested chat messages and `fcmTokens`; push delivery is an external side effect. | `admin_actions`, `idempotency_keys` and some domain idempotency columns exist; no message/outbox/push-token D1 flow exists. | Preserve immutable audit history and consider a transactional outbox with deduplication and retry state. Delivery guarantees (at-most-once vs retry/at-least-once), chat privacy and token-retention policy require decisions; an outbox alone cannot guarantee exactly-once external delivery. |

## Work completed in this branch

- `src/firebase-auth.ts` extracts the existing Firebase ID-token verifier without changing its RS256, issuer, audience or UID checks; synthetic local-JWKS tests cover acceptance and rejection cases.
- `src/d1-migration-checkpoints.ts` provides bound, state-idempotent checkpoint upsert/read and count/checksum comparison primitives for migration rehearsal. It records metadata only; it does not read Firestore or move application records.
- `scripts/d1-poc-schema-contract.py` validates all 19 migration tables, 14 explicit indexes, documented constraints, the five read-only D1 repository SELECTs, and checkpoint upsert/read SQL against synthetic in-memory SQLite data; it does not access Firestore or remote services.
- `scripts/d1-poc-backup-restore-check.sh` backs up only the local PoC D1 database and restores into a fresh temporary local persistence directory, verifying synthetic fixtures.
- Seven new synthetic-only characterization suites cover current Firestore behavior for users/permissions, token adjustments, payment-pending webhooks, NIDA, Lipa, service applications/licenses, and audit/messages/FCM. They do not wire D1 or choose new business policy.
- `.github/workflows/worker-ci.yml` runs the schema contract, Worker tests, TypeScript, dry-run build, local PoC migration/fixture checks and the local backup/restore rehearsal. It uses read-only GitHub contents permission and no secrets.

## Safe rehearsal procedure

From `kituo-digitali/worker`:

```sh
pnpm test
pnpm check
pnpm d1:poc:schema-contract # in-memory synthetic schema/repository contract test
pnpm build                 # Wrangler dry-run; does not deploy
pnpm d1:poc:migrate:local  # local sandbox only
pnpm d1:poc:verify:local
pnpm d1:poc:backup-restore:local
```

The backup/restore command uses `--local` for both export and restore. It writes a SQL backup (retained at the printed path) and removes only its own temporary restore directory. To select a persistent output directory, run `bash scripts/d1-poc-backup-restore-check.sh /path/to/backup-directory`. It never targets remote D1. A real remote backup/restore drill still requires Wrangler OAuth and a separately reviewed test procedure.

For any future synthetic backfill rehearsal, use stable source document IDs, explicit versioned mapping functions, bounded batches, a checkpoint per domain/batch, and compare both counts and deterministic checksums. The checkpoint helpers are only bookkeeping primitives; no Firestore reader, backfill worker, reconciliation scanner or shadow-read path is implemented yet. Production shadow reads and data migration remain prohibited without separate authorization.

Rollback for the current local rehearsal means discarding its temporary restore directory and using the retained SQL dump to recreate an isolated local copy. This is not a production rollback plan. Before any production change, require a verified backup/restore, tested recovery-point objective, data reconciliation, monitoring, abort criteria, and explicit go/no-go approval.

## Verification notes

Verified locally on 2026-10-27 in this branch: `pnpm test` passed **56/56**, including the new synthetic characterization tests; `pnpm check` passed; `pnpm d1:poc:schema-contract` passed (19 tables, 14 explicit indexes, five read-only repository SELECTs and checkpoint SQL validated with synthetic data); `pnpm build` passed in Wrangler `--dry-run` mode; `pnpm d1:poc:backup-restore:local` passed and restored the synthetic user with balances 2/5 plus the synthetic service into a fresh temporary local persistence directory. Backup SHA-256: `13b1230ee334888e15f049faa7aa1499cfa1f534d7d268acfe13333264cdee9b`.

GitHub Actions runs `40488683002` (pull request) and `40488677111` (push) both succeeded for commit `409f9823877c59260b6fe962aee94bd21a4dd646`. The schema contract, Worker tests, TypeScript, Wrangler dry-run build, local schema/fixture verification and local backup/restore steps passed. CI used only local PoC data; it did not authenticate to Cloudflare or access the remote test database. These checks do not establish remote Wrangler migration tracking or production deployment.
