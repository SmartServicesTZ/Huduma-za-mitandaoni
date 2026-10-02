# Cloudflare Worker API

This Worker is the server-side API for privileged application operations and FimiPay payments. The browser sends a Firebase Authentication ID token over HTTPS; the Worker verifies its signature and derives the UID from the signed `sub` claim. It then performs Firestore reads and transactions using a server-only Google service-account credential, enforcing the existing ownership, account-status, token-balance, and admin-permission checks in `src/handlers.ts`.

**Never put FimiPay secret keys, the Firebase service-account JSON, or webhook secrets in frontend variables, GitHub source, or chat.** FimiPay's official integration guide explicitly prohibits exposing `sk_` secrets in browser code. The client-visible Firebase web config and Worker URL are public configuration; they are not substitutes for the server secrets.

## Cloudflare Worker secrets and configuration

Set these as encrypted Worker secrets in the Cloudflare Dashboard or with `wrangler secret put`:

- `FIREBASE_SERVICE_ACCOUNT_JSON` — service-account JSON for project `huduma-za-mtandaoni-b1c0c`. Grant only the IAM permissions required for Firestore datastore access. The Worker uses privileged REST access, so its code—not Firestore Rules—must enforce authorization. A Cloud Storage object role is needed only if the legacy Storage-backed attachment operations are retained on Blaze; it is not needed for license PDFs.
- `FIMIPAY_SECRET_KEY` — the correct test or live FimiPay API secret; used only for Worker-to-FimiPay requests.
- `FIMIPAY_WEBHOOK_SECRET` — used to verify the exact raw webhook body with HMAC-SHA256.

`FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, and `ALLOWED_ORIGINS` are non-secret Worker variables configured in `wrangler.toml`. Keep the allowed origins restricted to the production site and approved local development origins.

## GitHub deployment

For the GitHub Actions deployment, configure repository secrets `CLOUDFLARE_API_TOKEN` (scoped to deploy/edit this Worker) and `CLOUDFLARE_ACCOUNT_ID`. Configure the three Worker runtime secrets above directly in Cloudflare before enabling automated deployment. Set repository variable `VITE_CLOUDFLARE_WORKER_URL` to the Worker URL and `DEPLOY_CLOUDFLARE_WORKER=true` to allow the main-branch workflow to deploy the Worker and then GitHub Pages. The Pages deployment is deliberately gated on Worker deployment so a frontend that depends on a missing API is not published.

Set the FimiPay webhook URL to `https://<worker-host>/webhooks/fimipay`. Test the API in FimiPay's test environment and verify webhook idempotency before changing production secrets/webhook settings.

Removing the retired backend source from this repository does not delete any endpoints that were already deployed in Firebase, and it does not change the FimiPay dashboard's existing webhook URL. Retire old deployed endpoints only after the Worker is configured and verified; switch the provider webhook during the approved production cutover.

## Spark-compatible business-license PDF

The license PDF and QR code are rendered in the user's browser. The Worker allocates the license number, validates service/account eligibility, checks the service lock, deducts two tokens exactly once, and records the application, ledger, usage, and audit data transactionally in Firestore. The PDF is downloaded locally; its bytes are not uploaded to Firebase Storage.

This avoids Firebase Storage for license PDFs and does not require Firebase Blaze for Firestore or Cloudflare Workers Free usage. Firebase's official policy now requires Blaze to maintain access to Firebase Storage buckets (effective February 3, 2026). Existing profile-image and application-attachment flows still use Firebase Storage and therefore remain unavailable on Spark unless separately moved to an object store such as Cloudflare R2.

Cloudflare Workers Free currently allows 100,000 requests per day and 10 ms CPU time per invocation. The PDF/QR rendering work has been moved out of the Worker, but live API performance and Firebase quota usage still need staging verification before production traffic is switched.

## Local verification

From `kituo-digitali/`:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm worker:check
pnpm worker:test
pnpm worker:build
pnpm build
```

`worker:build` runs Wrangler's dry-run bundler and does not publish anything. For local API testing, use non-production test secrets in `worker/.dev.vars` (ignored by Git); do not point mutation tests at production.

## References

- [FimiPay API documentation](https://docs.fimipay.com/docs/#create-payment)
- [FimiPay integration brief](https://docs.fimipay.com/docs/downloads/fimipay-ai-integration-brief.md)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Firebase Storage billing-plan changes](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
