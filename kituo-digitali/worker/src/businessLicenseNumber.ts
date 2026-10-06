import { randomInt } from "node:crypto";

export function generateRandomBusinessLicenseNumber() {
  return Array.from({ length: 7 }, () => String(randomInt(0, 1000)).padStart(3, "0")).join("-");
}
