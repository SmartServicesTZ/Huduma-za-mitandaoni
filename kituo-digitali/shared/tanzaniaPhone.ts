/** Normalize common Tanzanian mobile formats to 255XXXXXXXXX (no plus sign). */
export function normalizeTanzaniaPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (/^255[67]\d{8}$/.test(digits)) return digits;
  if (/^0[67]\d{8}$/.test(digits)) return `255${digits.slice(1)}`;
  if (/^[67]\d{8}$/.test(digits)) return `255${digits}`;
  return null;
}

/** Common exact values used by older profiles before phone numbers were canonicalized. */
export function tanzaniaPhoneStoredAliases(value: unknown): string[] {
  const phone = normalizeTanzaniaPhone(value);
  if (!phone) return [];
  const national = phone.slice(3);
  const local = `0${national}`;
  const nationalGroups = `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  const localGroups = `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  return [...new Set([
    phone,
    `+${phone}`,
    local,
    national,
    `255 ${nationalGroups}`,
    `+255 ${nationalGroups}`,
    localGroups,
    localGroups.replaceAll(" ", "-"),
  ])];
}

/** Firebase email/password requires an email-shaped key; this reserved alias is internal only. */
export function phoneAuthAlias(normalizedPhone: string): string {
  return `${normalizedPhone}@login.huduma-za-mtandao.local`;
}
