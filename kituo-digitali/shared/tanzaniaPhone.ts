/** Normalize common Tanzanian mobile formats to 255XXXXXXXXX (no plus sign). */
export function normalizeTanzaniaPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (/^255[67]\d{8}$/.test(digits)) return digits;
  if (/^0[67]\d{8}$/.test(digits)) return `255${digits.slice(1)}`;
  if (/^[67]\d{8}$/.test(digits)) return `255${digits}`;
  return null;
}

/** Firebase email/password requires an email-shaped key; this reserved alias is internal only. */
export function phoneAuthAlias(normalizedPhone: string): string {
  return `${normalizedPhone}@login.huduma-za-mtandao.local`;
}
