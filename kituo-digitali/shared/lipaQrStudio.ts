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
  if (!/^\d{5,12}$/.test(values.lipaNumber)) {
    errors.lipaNumber = "Namba ya Lipa iwe na tarakimu 5 hadi 12.";
  }
  const businessName = values.businessName.trim();
  if (!businessName) errors.businessName = "Weka jina la biashara.";
  else if (businessName.length > 25) errors.businessName = "Jina la biashara lisizidi herufi 25.";
  if (!TANZANIA_LIPA_LOCATIONS.includes(values.location as (typeof TANZANIA_LIPA_LOCATIONS)[number])) {
    errors.location = "Chagua eneo kutoka kwenye orodha.";
  }
  if (!/^\d{5}$/.test(values.postalCode)) {
    errors.postalCode = "Namba ya posta iwe na tarakimu 5.";
  }
  return errors;
}

/**
 * This is deliberately informational text, not an EMV/TIPS payment payload.
 * A real payment QR requires a merchant payload from an authorized provider.
 */
export function buildLipaInfoQrPayload(values: LipaCardValues): string {
  return [
    "TAARIFA ZA LIPA — SI QR YA MALIPO",
    `Namba ya Lipa: ${normalizeLipaNumber(values.lipaNumber)}`,
    `Biashara: ${values.businessName.trim().toUpperCase().slice(0, 25)}`,
    `Eneo: ${values.location}`,
    `Posta: ${values.postalCode}`,
  ].join("\n");
}
