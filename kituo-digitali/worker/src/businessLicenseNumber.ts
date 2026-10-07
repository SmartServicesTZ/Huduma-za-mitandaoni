export const BUSINESS_LICENSE_PREFIX = "BL01699682026-270000";

export function generateRandomBusinessLicenseNumber() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return `${BUSINESS_LICENSE_PREFIX}${String(values[0] % 100000).padStart(5, "0")}`;
}
