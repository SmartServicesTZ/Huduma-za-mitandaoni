#!/usr/bin/env node
/**
 * Audit/backfill legacy users.phone values and server-owned phoneRegistry entries.
 *
 * Safety:
 *   - Default mode is read-only dry-run.
 *   - --verify is read-only and exits non-zero when cleanup is incomplete.
 *   - --apply writes only after a full scan finds no duplicate normalized phones,
 *     registry ownership conflicts, or invalid non-empty phone values.
 *   - Uses Application Default Credentials; never prints full phone numbers.
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const verify = process.argv.includes("--verify");
if (apply && verify) throw new Error("Use either --apply or --verify, not both.");

if (!getApps().length) initializeApp({ credential: applicationDefault() });
const db = getFirestore();

function normalizeTanzaniaPhone(value) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (/^255[67]\d{8}$/.test(digits)) return digits;
  if (/^0[67]\d{8}$/.test(digits)) return `255${digits.slice(1)}`;
  if (/^[67]\d{8}$/.test(digits)) return `255${digits}`;
  return null;
}

function masked(phone) {
  return `…${phone.slice(-4)}`;
}

async function scan() {
  const users = await db.collection("users").get();
  const candidates = [];
  const invalid = [];
  const groups = new Map();
  for (const snapshot of users.docs) {
    const rawPhone = snapshot.get("phone");
    if (typeof rawPhone !== "string" || !rawPhone.trim()) continue;
    const phone = normalizeTanzaniaPhone(rawPhone);
    if (!phone) {
      invalid.push(snapshot.id);
      continue;
    }
    const candidate = { ref: snapshot.ref, uid: snapshot.id, rawPhone, phone };
    candidates.push(candidate);
    const group = groups.get(phone) ?? [];
    group.push(candidate);
    groups.set(phone, group);
  }

  const collisions = [...groups.entries()].filter(([, group]) => new Set(group.map((item) => item.uid)).size > 1);
  const missingRegistry = [];
  const registryConflicts = [];
  for (const [phone, group] of groups) {
    const registry = await db.collection("phoneRegistry").doc(phone).get();
    const owner = registry.exists ? registry.get("uid") : null;
    if (!registry.exists) missingRegistry.push({ phone, group });
    else if (group.length !== 1 || owner !== group[0].uid) registryConflicts.push({ phone, owner, group });
  }
  return { users, candidates, invalid, collisions, missingRegistry, registryConflicts };
}

function printReport(report) {
  const nonCanonical = report.candidates.filter((item) => item.rawPhone !== item.phone);
  console.log(`Scanned ${report.users.size} user profiles.`);
  console.log(`Profiles with valid Tanzania phone numbers: ${report.candidates.length}.`);
  console.log(`Profiles needing canonical phone updates: ${nonCanonical.length}.`);
  console.log(`Phone reservations missing from phoneRegistry: ${report.missingRegistry.length}.`);
  console.log(`Duplicate normalized phone groups: ${report.collisions.length}.`);
  console.log(`Registry ownership conflicts: ${report.registryConflicts.length}.`);
  console.log(`Profiles with invalid non-empty phone values: ${report.invalid.length}.`);
  for (const [phone, group] of report.collisions) {
    console.log(`Collision for ${masked(phone)}; inspect user UIDs: ${group.map((item) => item.uid).join(", ")}`);
  }
  for (const conflict of report.registryConflicts) {
    console.log(`Registry conflict for ${masked(conflict.phone)}; registry owner: ${String(conflict.owner ?? "unknown")}; profile UIDs: ${conflict.group.map((item) => item.uid).join(", ")}`);
  }
  if (report.invalid.length) console.log(`Invalid phone profile UIDs requiring review: ${report.invalid.join(", ")}`);
}

let report = await scan();
printReport(report);
const blocked = report.collisions.length > 0 || report.registryConflicts.length > 0 || report.invalid.length > 0;
if (blocked) {
  console.error("No migration is safe until every collision, registry conflict, and invalid phone value is reviewed.");
  process.exitCode = 1;
} else if (verify) {
  const pending = report.candidates.some((item) => item.rawPhone !== item.phone) || report.missingRegistry.length > 0;
  if (pending) {
    console.error("Verification failed: some valid phone profiles still need canonicalization or registry reservations.");
    process.exitCode = 1;
  } else {
    console.log("Verification passed: valid phone profiles and registry reservations are canonical.");
  }
} else if (!apply) {
  console.log("Dry-run only; no Firestore data was changed. Review the report before running with --apply.");
} else {
  for (const candidate of report.candidates) {
    await db.runTransaction(async (transaction) => {
      const [profileSnapshot, registrySnapshot] = await Promise.all([
        transaction.get(candidate.ref),
        transaction.get(db.collection("phoneRegistry").doc(candidate.phone)),
      ]);
      if (!profileSnapshot.exists || normalizeTanzaniaPhone(profileSnapshot.get("phone")) !== candidate.phone) {
        throw new Error(`Phone changed after audit for user ${candidate.uid}; stop and rerun the dry-run.`);
      }
      if (registrySnapshot.exists && registrySnapshot.get("uid") !== candidate.uid) {
        throw new Error(`Registry ownership changed for phone ending ${candidate.phone.slice(-4)}; stop and review.`);
      }
      if (!registrySnapshot.exists) {
        transaction.create(db.collection("phoneRegistry").doc(candidate.phone), {
          uid: candidate.uid,
          phone: candidate.phone,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      if (candidate.rawPhone !== candidate.phone) {
        transaction.update(candidate.ref, { phone: candidate.phone, updatedAt: FieldValue.serverTimestamp() });
      }
    });
  }
  console.log("Migration writes completed. Running a read-only verification scan.");
  report = await scan();
  printReport(report);
  if (report.collisions.length || report.registryConflicts.length || report.invalid.length || report.candidates.some((item) => item.rawPhone !== item.phone) || report.missingRegistry.length) {
    console.error("Post-migration verification failed; review before accepting registrations.");
    process.exitCode = 1;
  } else {
    console.log("Post-migration verification passed.");
  }
}
