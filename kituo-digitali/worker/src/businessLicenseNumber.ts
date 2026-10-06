export function generateRandomBusinessLicenseNumber() {
  const values = new Uint32Array(7);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => String(value % 1000).padStart(3, "0")).join("-");
}
