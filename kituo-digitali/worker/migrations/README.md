# SmartServicesTZ — D1 proof of concept

Status: isolated proof-of-concept only. No production data is copied and no production Worker configuration is changed.

## Files
- `migrations/0001_smartservicestz_poc.sql`: normalized D1 schema plus synthetic test records.
- Applied test database: `smartservicestz-poc-clean` (Cloudflare D1 UUID: `b2b331d9-fb25-416d-890a-269d07346faf`).
- The earlier `smartservicestz-poc` database already contained a different schema, so it was left unchanged apart from its prior synthetic smoke-test row.

## Validation completed
- Applied the migration successfully to the clean isolated database.
- Confirmed 20 application tables and synthetic user, token-balance, and service rows.
- Confirmed token ledger idempotency key uniqueness: duplicate key was rejected.
- Confirmed license number uniqueness: duplicate number was rejected.
- Confirmed failed constraint batches rolled back; no failed test rows remained.
- Confirmed token ledger, payment orders, NIDA requests, service applications, Lipa applications, and file objects have no copied production records.

## Safety boundaries
- Firebase Authentication remains the identity provider.
- Firestore remains production source of truth during this POC.
- No production secrets, users, token balances, payments, NIDA results, Lipa applications, license records, or files are copied.
- Do not bind this database to the production Worker until repository methods, security review, backup, and explicit cutover approval.
- Token/payment/license mutations must use D1 transactional batches with unique idempotency keys before production use.

## Repository groundwork added
- `src/d1-poc-repository.ts` provides read-only helpers for user lookup, visible service listing, and token balance lookup. It uses bound parameters and is intentionally not wired into production handlers.
- `test/d1-poc-repository.test.ts` contains unit tests for parameter binding, empty UID rejection, visible-service filtering/order, and read-only token balance access. These tests still need to be run in CI/local build before the helpers are considered validated.

## Not implemented yet
This schema does not switch application handlers to D1 and is not a production migration. Firebase ID token verification, D1 repository methods, R2 authorization, backfill, shadow reads, and cutover/rollback flags require separate implementation and tests. Firestore has not been migrated or disabled.
