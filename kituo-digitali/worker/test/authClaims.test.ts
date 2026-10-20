import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthRole } from "../src/authClaims.js";

test("only the configured authenticated UID is promoted to Super Admin", () => {
  assert.deepEqual(resolveAuthRole("user", "firebase-uid-owner", "firebase-uid-owner"), {
    role: "super_admin",
    isConfiguredSuperAdmin: true,
    shouldPromote: true,
    shouldDemote: false,
  });
});

test("a matching phone number or an empty UID configuration cannot grant Super Admin", () => {
  assert.equal(resolveAuthRole("user", "firebase-uid-attacker", "firebase-uid-owner").role, "user");
  assert.equal(resolveAuthRole("super_admin", "firebase-uid-attacker", "firebase-uid-owner").role, "user");
  assert.equal(resolveAuthRole("user", "firebase-uid-owner", "").role, "user");
});

test("ordinary privileged roles remain unchanged for other authenticated UIDs", () => {
  assert.equal(resolveAuthRole("admin", "firebase-uid-other", "firebase-uid-owner").role, "admin");
  assert.equal(resolveAuthRole(undefined, "firebase-uid-other", "").role, "user");
});
