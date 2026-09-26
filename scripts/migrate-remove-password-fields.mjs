#!/usr/bin/env node
/**
 * Remove legacy credential fields from Firestore users/{uid} profiles.
 *
 * Safety:
 *   - Dry-run is the default.
 *   - Use --apply only after reviewing the listed documents.
 *   - Uses Application Default Credentials / GOOGLE_APPLICATION_CREDENTIALS.
 *   - Never logs password values or exports user data.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const verifyOnly = process.argv.includes("--verify");

if (!getApps().length) initializeApp();
const db = getFirestore();
const users = await db.collection("users").get();
const credentialFields = ["password", "pin", "pinHash"];
const affected = users.docs.filter((snapshot) => {
  const data = snapshot.data();
  return credentialFields.some((field) => data[field] !== undefined);
});

console.log(`Scanned ${users.size} user profiles.`);
console.log(`Profiles containing legacy credential fields: ${affected.length}.`);

if (verifyOnly) {
  if (affected.length) {
    console.error("Verification failed: legacy credential fields remain in user profiles.");
    process.exitCode = 1;
  } else {
    console.log("Verification passed: no legacy credential fields found.");
  }
  process.exit();
}

if (!apply) {
  for (const snapshot of affected) console.log(`Would clean users/${snapshot.id}`);
  console.log("Dry-run only. Re-run with --apply after review to remove fields.");
  process.exit();
}

for (const snapshot of affected) {
  await snapshot.ref.update({
    password: FieldValue.delete(),
    pin: FieldValue.delete(),
    pinHash: FieldValue.delete(),
  });
  console.log(`Cleaned users/${snapshot.id}`);
}

const remaining = (await db.collection("users").get()).docs.filter((snapshot) => {
  const data = snapshot.data();
  return credentialFields.some((field) => data[field] !== undefined);
});
if (remaining.length) {
  console.error(`Post-migration verification failed: ${remaining.length} profiles still contain legacy credential fields.`);
  process.exitCode = 1;
} else {
  console.log("Post-migration verification passed.");
}
