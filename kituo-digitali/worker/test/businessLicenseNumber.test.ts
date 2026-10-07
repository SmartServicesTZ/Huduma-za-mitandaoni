import assert from "node:assert/strict";
import test from "node:test";
import { generateRandomBusinessLicenseNumber } from "../src/businessLicenseNumber.js";

test("business license numbers use seven groups of three digits", () => {
  const generated = Array.from({ length: 20 }, () => generateRandomBusinessLicenseNumber());
  assert.equal(new Set(generated).size, generated.length);
  assert.ok(generated.every((number) => /^\d{3}(?:-\d{3}){6}$/.test(number)));
});

test("business license numbers contain only values from 000 through 999", () => {
  const generated = Array.from({ length: 20 }, () => generateRandomBusinessLicenseNumber());
  for (const number of generated) {
    for (const group of number.split("-")) {
      const value = Number(group);
      assert.ok(value >= 0 && value <= 999);
      assert.equal(group.length, 3);
    }
  }
});
