# Secure Firebase Functions

These callable functions are the server-side boundary for sensitive operations:

- `consumeTokens`
- `adjustTokens`
- `updateUserAccess`
- `setAccountStatus`
- `verifyUser`
- `adminWrite`
- `adminDelete`

They use Firebase Authentication identity, Firestore transactions, permission checks, and append-only `adminActions` records. No Firebase Admin credentials belong in the browser or repository.

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
6. Only after successful staging verification, enable App Check enforcement in the Firebase console and set the function enforcement policy.

This repository change does not deploy or enforce anything in production.
