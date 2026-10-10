export const AIRTEL_SME_LAYOUT_DEFAULTS: Record<string, number> = {
  nameX: 22.5, nameY: 25.2, nameSize: 3.2,
  phoneX: 22.5, phoneY: 29.1, phoneSize: 3.2,
  tinX: 76, tinY: 29.1, tinSize: 3,
  idTypeX: 24, idTypeY: 33.1, idTypeSize: 3,
  idX: 69, idY: 33.1, idSize: 2.6,
  streetX: 28, streetY: 37.2, streetSize: 3,
  wardX: 75, wardY: 37.2, wardSize: 3,
  districtX: 31, districtY: 41.2, districtSize: 3,
  regionX: 76, regionY: 41.2, regionSize: 3,
  emailX: 31, emailY: 44, emailSize: 2.8,
  normalX: 5.8, normalY: 58, normalSize: 4.2,
  deviceX: 29, deviceY: 58.3, deviceSize: 3,
  customerX: 17, customerY: 92.6, customerSize: 2.8,
  sign1X: 70, sign1Y: 92.6, sign1Size: 2.6,
  date1X: 71, date1Y: 92.6, date1Size: 2.2,
  salesX: 22, salesY: 96.1, salesSize: 2.8,
  sign2X: 70, sign2Y: 96.1, sign2Size: 2.6,
  date2X: 71, date2Y: 96.1, date2Size: 2.2,
};

// These values were shipped in the old editor defaults. They were not aligned
// with the printed rows (and several footer fields landed in the terms section).
const LEGACY_DEFAULTS: Record<string, number> = {
  nameY: 25,
  phoneY: 28.9,
  tinY: 28.9,
  idTypeY: 32.9,
  idY: 32.9,
  streetY: 37,
  wardY: 37,
  districtY: 41,
  regionY: 41,
  normalY: 56.2,
  deviceY: 56,
  customerY: 90,
  sign1Y: 90,
  date1Y: 90,
  salesY: 93.7,
  sign2Y: 93.7,
  date2Y: 93.7,
};

export function normalizeAirtelSmeLayout(value: unknown): Record<string, number> {
  const saved = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const result = { ...AIRTEL_SME_LAYOUT_DEFAULTS };

  for (const [key, defaultValue] of Object.entries(AIRTEL_SME_LAYOUT_DEFAULTS)) {
    const raw = saved[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const number = Number(raw);
    const isSize = key.endsWith("Size");
    if (!Number.isFinite(number) || (isSize ? number < 1 || number > 10 : number < 0 || number > 100)) continue;

    const legacyValue = LEGACY_DEFAULTS[key];
    if (legacyValue !== undefined && number === legacyValue && legacyValue !== defaultValue) continue;
    result[key] = number;
  }

  return result;
}
