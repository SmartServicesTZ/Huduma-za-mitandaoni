import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthRole } from "../src/authClaims.js";

test("the configured Super Admin phone is promoted regardless of input formatting", () => {
  for (const phone of ["0698232313", "0698 232 313", "+255698232313", "255698232313"]) {
    assert.deepEqual(resolveAuthRole("user", phone, "255698232313"), {
      role: "super_admin",
      isConfiguredSuperAdmin: true,
      shouldPromote: true,
      shouldDemote: false,
    });
  }
});

test("a Super Admin profile with a different phone is downgraded", () => {
  assert.deepEqual(resolveAuthRole("super_admin", "255712345678", "255698232313"), {
    role: "user",
    isConfiguredSuperAdmin: false,
    shouldPromote: false,
    shouldDemote: true,
  });
});

test("ordinary privileged roles remain unchanged for other phone numbers", () => {
  assert.equal(resolveAuthRole("admin", "255712345678", "255698232313").role, "admin");
  assert.equal(resolveAuthRole(undefined, "0698232313", "").role, "user");
});
