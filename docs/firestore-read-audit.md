# SmartServicesTZ Firestore Read Audit

## Scope

This audit is isolated to branch `audit/firestore-read-optimization`. It does not change the production Worker, production website deployment, Firebase project configuration, rules, billing, or Firestore data.

## Changes applied

- Added bounded read windows for admin-side Firebase collections: agents, token transactions, health reports, videos, messages, licenses, audit actions, service applications, Lipa applications, and token purchase orders.
- Bounded admin service and agent reads in the browser.
- Bounded the Worker responses for admin users, service applications, and Lipa applications to 500 records per request instead of unbounded/1000-record reads.
- Bounded Chat public/private/group message listeners to the latest 200 messages and preserved oldest-to-newest display order.
- Bounded conversation and group lists to 100 records, public groups and join requests to 100 records, call history to 50 records, and ICE candidates to 200 records.
- Reduced Chat unread-listener fan-out to the 20 most recent conversations instead of opening a message listener for every conversation.
- Updated the admin Website Health Monitor so its five-minute GitHub polling pauses while the tab is hidden and refreshes when the tab returns to the foreground.

## Verification evidence

- `kituo-digitali`: `pnpm check` passed.
- `kituo-digitali`: `pnpm build` passed.
- `kituo-digitali/worker`: `pnpm build` dry-run passed.
- `kituo-digitali/worker`: `pnpm test` passed: 34 tests, 0 failures.
- `git diff --check` passed.

The active production routes reviewed include `AdminDashboard.tsx`, `Chat.tsx`, `Home.tsx`, `NidaRequestsPanel.tsx`, `firebase.ts`, and the Worker `handlers.ts`. Firestore rules were also reviewed: ordinary users are scoped to their own users, applications, token records, messages, conversations, and call documents; admin reads remain permission-gated.

## Deliberate limitations

The bounded list endpoints are not pagination yet. Records above the configured window are not loaded by the current admin screens. A follow-up should add cursor-based pagination (or server-side date/status filters) before the relevant collections approach their limits. This is preferable to silently reading the entire collection on every refresh.

No production deployment was performed from this audit branch. The changes should be reviewed and tested against a staging Firebase dataset before merging.
