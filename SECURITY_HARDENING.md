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

## Implemented in Phase 3

- Added server-only callable Cloud Functions for token consumption, token adjustments, user access, account status, and verification.
- Sensitive token, admin-access, CMS, service, message, license, and settings calls in the browser now call those Functions instead of writing directly.
- Added optional browser Firebase App Check initialization using `VITE_FIREBASE_APPCHECK_SITE_KEY` and automatic token refresh.
- Added restrictive Storage rules for `users/{uid}/profile/*`: owner-only access, image MIME validation, and a 2 MB limit.
- Profile pictures now upload to Firebase Storage; Firestore stores only the resulting `photoURL`.
- Added `firebase.json`, `storage.rules`, and a separate Functions package so Admin SDK code cannot enter the browser bundle.

### Phase 3 deployment boundary

Functions, App Check enforcement, Firestore rules, and Storage rules have **not** been deployed from this session. Configure and test them in a staging Firebase project first. Enable App Check enforcement only after legitimate login, callable functions, Firestore, Storage, and profile upload flows pass staging tests.

## Not deployed by this change

- Firestore rules have not been deployed.
- No production data was read or modified.
- App Check enforcement, backups, restore drills, and monitoring still require Firebase-console/server configuration and a separate verification phase.

## Next phase

1. Deploy Functions, Firestore rules, and Storage rules to a staging Firebase project.
2. Configure reCAPTCHA Enterprise App Check and test before enabling enforcement.
3. Add Firebase Emulator tests for negative balances, duplicate requests, concurrent requests, role escalation, and direct-request bypass attempts.
4. Run backup/restore drills and add operational monitoring.
