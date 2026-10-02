# Security hardening status

## Implemented in Phase 1

- Firebase Authentication remains the only password store for the Firebase portal.
- New profile writes do not persist password, PIN, or PIN-hash fields.
- Existing Firebase profiles are cleaned opportunistically when touched via `ensureUserProfile`.
- Token deductions use a Firestore transaction and reject insufficient balances before writing.
- Token ledger records now include `transactionId`, `userId`, `actorId`, `type`, `amount`, `balanceBefore`, `balanceAfter`, `reason`, `serviceId`, `serviceName`, `reference`, and `createdAt`.
- Service operations use an idempotency key and a deterministic ledger document ID, so retrying the same request cannot deduct twice.
- Firestore rules reject credential fields in user profile create/update requests and validate user-created deduction ledger entries.
- The UI ignores a second rapid click for the same service while its token operation is in progress.

## Implemented in Phase 2

- Added independent permissions: `viewUsers`, `manageUsers`, `manageTokens`, `manageServices`, `manageContent`, `manageMessages`, `manageReports`, `manageSettings`, `manageLicenses`, and `viewAuditLogs`.
- Admin navigation and direct panel URLs are hidden/blocked when the permission is missing.
- User-management controls and overview quick actions are not rendered for read-only admins.
- Moderator and support roles are recognized as privileged only when their explicit permission is present.
- A Super Admin cannot change their own role or permissions, block themselves, or delete themselves.
- Non-Super Admins cannot assign or modify a Super Admin role.
- `adminActions` is now the standardized append-only audit collection with actor, action, target, before/after, details, and timestamp fields.
- Legacy `auditLogs` is read-only/blocked by rules; existing records are not deleted.
- Admin token adjustments and major admin writes now create structured `adminActions` records.

## Legacy password migration

The migration is deliberately **dry-run by default** and never prints credential values.

```bash
cd kituo-digitali
pnpm exec tsx ../scripts/migrate-remove-password-fields.mjs
pnpm exec tsx ../scripts/migrate-remove-password-fields.mjs --verify
pnpm exec tsx ../scripts/migrate-remove-password-fields.mjs --apply
pnpm exec tsx ../scripts/migrate-remove-password-fields.mjs --verify
```

Run it only from a trusted server environment with Firebase Admin Application Default Credentials. Do not commit a service-account JSON file or put its contents in frontend environment variables.

> Note: `firebase-admin` must be installed in the trusted migration environment. Do not bundle it into the browser build.

## Current architecture and deployment boundary

- Sensitive token, admin-access, CMS, service-application, license, and payment operations now use the authenticated Cloudflare Worker API. The Worker verifies Firebase Authentication ID tokens and applies server-side authorization before using Firestore REST transactions.
- FimiPay API and webhook secrets are Cloudflare Worker secrets; they are never included in browser configuration or the Git repository.
- License PDFs are rendered and downloaded locally in the browser; the Worker still validates eligibility and charges tokens transactionally in Firestore.
- Firebase Authentication and Firestore remain in use. The repository no longer contains the old callable backend package or a Firebase CLI target for it.
- Firebase Storage profile images and application attachments remain a separate legacy path. Firebase's current plan policy requires Blaze for Storage bucket access; those flows are not Spark-compatible until moved to another object store.
- Optional Firebase App Check initialization remains available for Firebase client SDK requests.

This Cloudflare migration is **source-only and not deployed**. No Cloudflare API credentials, Worker runtime secrets, FimiPay webhook changes, or production Worker deployment were made in this session. Removing source files does not delete any previously deployed Firebase endpoints. The GitHub workflow runs checks on pull requests and gates a production Pages release on a successful Worker deployment and readiness check. Configure and test a staging Worker and Firebase service-account permissions before production traffic is switched.
- App Check enforcement, backups, restore drills, and monitoring still require Firebase-console/server configuration and a separate verification phase.

## Next phase

1. Configure a staging Cloudflare Worker, its encrypted secrets, and a least-privilege service account; test against a staging Firebase project or Emulator.
2. Verify FimiPay test-mode order creation and signed webhook delivery without crediting production tokens; use production settings only at an approved cutover.
3. Decide whether legacy profile-image and attachment uploads should move to Cloudflare R2 or remain disabled on Spark.
4. Configure App Check, run backup/restore drills, and add operational monitoring.
