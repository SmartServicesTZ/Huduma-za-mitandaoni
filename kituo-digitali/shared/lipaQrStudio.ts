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
  else if (businessName.length > 25) errors.businessName = "Jina lisizidi herufi 25.";
  return errors;
}

function field(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

function crc16(value: string): string {
  let crc = 0xffff;
  for (let i = 0; i < value.length; i += 1) {
    crc ^= value.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function createTipsPaymentPayload(values: LipaCardValues): string {
  const number = normalizeLipaNumber(values.lipaNumber);
  const name = values.businessName.trim().toUpperCase();
  if (!/^\\d{5,12}$/.test(number)) throw new Error("Namba ya Lipa si sahihi.");
  if (!name || name.length > 25) throw new Error("Jina la biashara liwe na herufi 1 hadi 25.");

  const merchantAccount = field("00", "tz.go.bot.tips") +
    field("01", "02501") + field("02", number);
  const payload = [
    field("00", "01"),
    field("01", "12"),
    field("26", merchantAccount),
    field("52", "4131"),
    field("53", "834"),
    field("58", "TZ"),
    field("59", name),
    field("60", "KIBAHA CBD"),
    field("61", "61104"),
    field("62", "030822715143070511002"),
    "6304",
  ].join("");
  return payload + crc16(payload);
}

export const buildLipaInfoQrPayload = createTipsPaymentPayload;
