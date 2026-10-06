import assert from "node:assert/strict";
import test from "node:test";
import { BUSINESS_LICENSE_PREFIX, FIRST_BUSINESS_LICENSE_SUFFIX, formatBusinessLicenseNumber } from "../src/businessLicenseNumber.js";

test("business license numbers keep the exact base and format a changing four-digit suffix", () => {
  assert.equal(BUSINESS_LICENSE_PREFIX, "BL01699682026-270000");
  assert.equal(formatBusinessLicenseNumber(349), "BL01699682026-2700000349");
  assert.equal(formatBusinessLicenseNumber(580), "BL01699682026-2700000580");
  assert.equal(formatBusinessLicenseNumber(9839), "BL01699682026-2700009839");
  assert.equal(formatBusinessLicenseNumber(8403), "BL01699682026-2700008403");
});

test("business license suffixes are four digits and consecutive reservations are distinct", () => {
  assert.equal(FIRST_BUSINESS_LICENSE_SUFFIX, 349);
  const generated = Array.from({ length: 20 }, (_, offset) => formatBusinessLicenseNumber(FIRST_BUSINESS_LICENSE_SUFFIX + offset));
  assert.equal(new Set(generated).size, generated.length);
  assert.ok(generated.every((number) => /^BL01699682026-270000\d{4}$/.test(number)));
});

test("business license formatter rejects values outside the four-digit range", () => {
  for (const invalid of [-1, 10_000, 1.5, Number.NaN]) {
    assert.throws(() => formatBusinessLicenseNumber(invalid), RangeError);
  }
});
