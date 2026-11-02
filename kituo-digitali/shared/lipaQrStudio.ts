export type LipaCardValues = {
  lipaNumber: string;
  businessName: string;
};

export type LipaCardErrors = Partial<Record<keyof LipaCardValues, string>>;

export function normalizeLipaNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 12);
}

export function validateLipaCard(values: LipaCardValues): LipaCardErrors {
  const errors: LipaCardErrors = {};
  if (!/^\d{5,12}$/.test(values.lipaNumber)) {
    errors.lipaNumber = "Namba ya Lipa iwe na tarakimu 5 hadi 12.";
  }
  const businessName = values.businessName.trim();
  if (!businessName) errors.businessName = "Weka jina la biashara.";
  else if (businessName.length > 32) errors.businessName = "Jina lisizidi herufi 32.";
  return errors;
}

/**
 * QR hii ina maandishi ya taarifa tu; si EMV/TIPS payload wala njia ya kuanzisha malipo.
 */
export function buildLipaInfoQrPayload(values: LipaCardValues): string {
  return [
    "TAARIFA TU — SI QR YA MALIPO",
    `Namba ya Lipa: ${normalizeLipaNumber(values.lipaNumber)}`,
    `Jina: ${values.businessName.trim().toUpperCase().slice(0, 32)}`,
  ].join("\n");
}
