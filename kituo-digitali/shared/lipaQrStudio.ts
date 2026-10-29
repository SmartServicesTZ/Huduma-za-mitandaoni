export const TANZANIA_LIPA_LOCATIONS = [
  "ARUSHA", "ARUSHA CBD", "BABATI", "BABATI CBD", "BAGAMOYO", "BAHI", "BARIADI", "BIHARAMULO", "BUKOBA", "BUKOBA CBD", "BUKOMBE", "BUNDA", "BUSEGA", "CBD", "CHAKECHAKE", "CHAMWINO", "CHATO", "CHEMBA", "DAR ES SALAAM", "DODOMA", "DODOMA CBD", "GAIRO", "GEITA", "HAI", "IGUNGA", "ILALA", "ILALA CBD", "ILEMELA", "IRAMBA", "IRINGA", "IRINGA CBD", "ITILIMA", "KAGERA", "KAHAMA", "KARAGWE", "KASKAZINI A", "KASKAZINI B", "KASKAZINI PEMBA", "KASKAZINI UNGUJA", "KATAVI", "KATI", "KIBAHA", "KIBAHA CBD", "KIBONDO", "KIGOMA", "KILIMANJARO", "KILOLO", "KILOMBERO", "KILOSA", "KILWA", "KINONDONI", "KISARAWE", "KISHAPU", "KITETO", "KONDOA", "KONGWA", "KOROGWE", "KUSINI", "KUSINI PEMBA", "KUSINI UNGUJA", "LINDI", "LINDI CBD", "LUSHOTO", "MAFIA", "MAGHARIBI", "MAGU", "MAKETE", "MANYARA", "MANYONI", "MARA", "MASASI", "MASWA", "MBEYA", "MBEYA CBD", "MBINGA", "MBOGWE", "MBULU", "MEATU", "MICHEWENI", "MISENYI", "MISUNGWI", "MJINI", "MJINI MAGHARIBI", "MKINGA", "MKOANI", "MKURANGA", "MOROGORO", "MOROGORO CBD", "MOSHI", "MOSHI CBD", "MPANDA", "MPWAPWA", "MTWARA", "MTWARA CBD", "MUFINDI", "MUHEZA", "MULEBA", "MUSOMA CBD", "MWANGA", "MWANZA", "NACHINGWEA", "NAMTUMBO", "NANYUMBU", "NEWALA", "NGARA", "NJOMBE", "NJOMBE CBD", "NKASI", "NYAMAGANA", "NYANG'HWALE", "NYASA", "NZEGA", "PANGANI", "PWANI", "ROMBO", "RORYA", "RUFIJI", "RUKWA", "RUVUMA", "SAME", "SENGEREMA", "SERENGETI", "SHINYANGA", "SHINYANGA CBD", "SIHA", "SIKONGE", "SIMANJIRO", "SIMIYU", "SINGIDA", "SINGIDA CBD", "SONGEA", "SONGEA CBD", "SUMBAWANGA", "TABORA", "TABORA CBD", "TANDAHIMBA", "TANGA", "TANGA CBD", "TARIME", "TEMEKE", "TUNDURU", "UKEREWE", "ULANGA", "URAMBO", "UYUI", "WANGING'OMBE", "WETE",
] as const;

export type LipaCardValues = {
  lipaNumber: string;
  businessName: string;
  location: string;
  postalCode: string;
};

export type LipaCardErrors = Partial<Record<keyof LipaCardValues, string>>;

export function normalizeLipaNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 12);
}

export function validateLipaCard(values: LipaCardValues): LipaCardErrors {
  const errors: LipaCardErrors = {};
  if (!/^\d{5,12}$/.test(values.lipaNumber)) errors.lipaNumber = "Namba ya Lipa iwe na tarakimu 5 hadi 12.";
  const businessName = values.businessName.trim();
  if (!businessName) errors.businessName = "Weka jina la biashara.";
  else if (businessName.length > 25) errors.businessName = "Jina la biashara lisizidi herufi 25.";
  return errors;
}

/** CRC-16/CCITT-FALSE used by the supplied EMV/TIPS examples. */
export function tipsCrc16(value: string): string {
  let crc = 0xffff;
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Generate the same TIPS TLV layout found in the five merchant samples. */
export function createTipsPaymentPayload(values: Pick<LipaCardValues, "lipaNumber" | "businessName" | "location" | "postalCode">): string {
  const lipa = normalizeLipaNumber(values.lipaNumber);
  const name = values.businessName.trim().toUpperCase();
  const merchantAccount = `0014tz.go.bot.tips01050250302${String(lipa.length).padStart(2, "0")}${lipa}`;
  const merchantAccountField = `26${String(merchantAccount.length).padStart(2, "0")}${merchantAccount}`;
  const nameField = `59${String(name.length).padStart(2, "0")}${name}`;
  // Location and postal code are not collected, so do not add guessed values to the QR.
  const body = `000201010211${merchantAccountField}5204000053038345802TZ${nameField}62210308001123490705110026304`;
  return body + tipsCrc16(body);
}

export function isValidTipsPaymentPayload(value: string): boolean {
  const payload = value.trim();
  if (!/^000201[\s\\S]*6304[0-9A-Fa-f]{4}$/.test(payload)) return false;
  return tipsCrc16(payload.slice(0, -4)) === payload.slice(-4).toUpperCase();
}
