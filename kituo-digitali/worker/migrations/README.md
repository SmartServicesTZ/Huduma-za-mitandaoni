# SmartServicesTZ — D1 proof of concept

Status: isolated proof-of-concept only. No production data is copied and no production Worker configuration is changed.

## Files
- `migrations/0001_smartservicestz_poc.sql`: initial normalized D1 schema plus synthetic test records.
- Target database: `smartservicestz-poc` (empty at start of this POC).

## Safety boundaries
- Firebase Authentication remains the identity provider.
- Firestore remains production source of truth during this POC.
- No production secrets, users, token balances, payments, NIDA results, Lipa applications, license records, or files are copied.
- Do not bind this database to the production Worker until tests, backup, security review, and explicit cutover approval.
- Token/payment/license mutations must be implemented as D1 transactional batches with unique idempotency keys before any production use.

## Verification checklist
1. Apply the SQL migration only to the isolated POC database.
2. Confirm expected tables and synthetic rows.
3. Test duplicate idempotency key rejection and unique license number constraint.
4. Test transactional rollback on a deliberate constraint failure.
5. Keep all production routes on Firestore until a separately reviewed PR enables an explicitly named D1 binding.

## Not implemented yet
This schema does not switch application handlers to D1 and is not a production migration. Firebase ID token verification, D1 repository methods, R2 authorization, backfill, shadow reads, and cutover/rollback flags require separate implementation and tests.
