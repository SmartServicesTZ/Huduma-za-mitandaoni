# Secure Firebase Functions

These callable functions are the server-side boundary for sensitive operations:

- `consumeTokens`
- `adjustTokens`
- `updateUserAccess`
- `setAccountStatus`
- `verifyUser`
- `adminWrite`
- `adminDelete`
- `generateBusinessLicense` — validates the authenticated profile, renders the supplied certificate template, generates a high-correction QR with the Tausi logo, stores the PDF in private Storage, then atomically deducts 2 tokens and writes `licenseApplications`, `serviceUsage`, `tokenTransactions`, and `adminActions`.
- `createTokenPurchaseOrder` — creates an authenticated, user-bound FimiPay TZS mobile order for one of the fixed token packages.
- `fimipayWebhook` — verifies the raw-body HMAC, confirms successful production status through FimiPay, and credits the token balance exactly once in a Firestore transaction.

They use Firebase Authentication identity, Firestore transactions, permission checks, and append-only `adminActions` records. No Firebase Admin credentials belong in the browser or repository.

## FimiPay token top-ups

Fixed packages are validated server-side: TZS 2,000 → 40 tokens, TZS 5,000 → 100 tokens, and TZS 10,000 → 200 tokens. The browser never sends a user ID or token quantity to FimiPay; the callable gets the Firebase UID from authentication, stores the order before calling FimiPay, and uses the user's saved Tanzania phone number for the mobile-money prompt.

Set these Firebase Functions secrets before deploying the payment functions (never add their values to this repository):

```bash
firebase functions:secrets:set FIMIPAY_SECRET_KEY
firebase functions:secrets:set FIMIPAY_WEBHOOK_SECRET
```

Use the live API secret and live webhook secret from the FimiPay developer/app settings for the intended merchant account. The Merchant ID identifies the account in the dashboard; the official Merchant API authenticates requests with the bearer secret, so the ID is not exposed or sent from the browser. Configure the FimiPay webhook URL to:

```text
https://us-central1-huduma-za-mtandaoni-b1c0c.cloudfunctions.net/fimipayWebhook
```

The production webhook verifies FimiPay's `X-Fimipay-Signature` over the original request bytes and then checks `/payment/order_status`; it does not credit sandbox/test events. Deploy both Functions and Firestore rules only after the secrets and the webhook registration are in place and production activation is explicitly approved.

Reference: [FimiPay Create Payment](https://docs.fimipay.com/docs/#create-payment), [Order Status](https://docs.fimipay.com/docs/#order-status), [Webhooks](https://docs.fimipay.com/docs/#webhooks), and [full integration brief](https://docs.fimipay.com/docs/downloads/fimipay-ai-integration-brief.md).

## Local verification

```bash
npm install
npm run build
```

## Deployment checklist

1. Select the intended Firebase project with the Firebase CLI.
2. Configure the Functions region if it is not `us-central1`.
3. Configure Firebase App Check with reCAPTCHA Enterprise and set the browser `VITE_FIREBASE_APPCHECK_SITE_KEY`.
4. Deploy functions, Firestore rules, and Storage rules from the repository root.
5. Test register/login, token deduction, duplicate request, concurrent requests, admin permissions, role escalation, blocked users, and profile image upload in a staging project.
6. Deploy the `functions/assets/` license template and Tausi logo with the Functions source.
7. Only after successful staging verification, enable App Check enforcement in the Firebase console and set the function enforcement policy.

This repository change does not deploy or enforce anything in production.
