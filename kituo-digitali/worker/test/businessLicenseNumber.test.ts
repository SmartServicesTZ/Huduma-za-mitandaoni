import assert from "node:assert/strict";
import test from "node:test";
import { BUSINESS_LICENSE_PREFIX, generateRandomBusinessLicenseNumber } from "../src/businessLicenseNumber.js";

test("business license numbers keep the original prefix and use three random final digits", () => {
  const generated = Array.from({ length: 20 }, () => generateRandomBusinessLicenseNumber());
  assert.ok(generated.every((number) => number.startsWith(BUSINESS_LICENSE_PREFIX)));
  assert.ok(generated.every((number) => new RegExp("^" + BUSINESS_LICENSE_PREFIX + "\\d{3}$").test(number)));
});

test("business license numbers use a three-digit suffix from 000 through 999", () => {
  const generated = Array.from({ length: 50 }, () => generateRandomBusinessLicenseNumber());
  for (const number of generated) {
    const suffix = Number(number.slice(-3));
    assert.ok(suffix >= 0 && suffix <= 999);
    assert.equal(number.slice(-3).length, 3);
  }
});
