export const BUSINESS_LICENSE_PREFIX = "BL01699682026-270000";
export const BUSINESS_LICENSE_COUNTER_ID = BUSINESS_LICENSE_PREFIX;
export const FIRST_BUSINESS_LICENSE_SUFFIX = 349;

export function formatBusinessLicenseNumber(suffix: number) {
  if (!Number.isInteger(suffix) || suffix < 0 || suffix > 9999) {
    throw new RangeError("Business license suffix must be an integer from 0000 to 9999.");
  }
  return `${BUSINESS_LICENSE_PREFIX}${String(suffix).padStart(4, "0")}`;
}
