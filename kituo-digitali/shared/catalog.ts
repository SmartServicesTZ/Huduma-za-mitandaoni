export type ServiceKind = "paid" | "free" | "locked";

export type ServiceCatalogItem = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  tokenCost: number;
  kind: ServiceKind;
  category: string;
  actionUrl?: string;
  order?: number;
  fields?: Array<Record<string, unknown>>;
  active?: boolean;
  isVisible?: boolean;
  isLocked?: boolean;
};

export type ActivityItem = {
  service: string;
  type: string;
  credits: number;
  status: string;
  reference: string;
  createdAt: string | Date;
};

export type TutorialItem = {
  slug: string;
  title: string;
  description: string;
  tokenCost: number;
  videoUrl?: string;
};

export const announcementText = "Msaada na huduma kwa wateja: WhatsApp +255 698 232 313.";
export const whatsappUrl = "https://wa.me/255698232313?text=Habari%20HUDUMA%20ZA%20MTANDAONI%2C%20nahitaji%20msaada.";

const paid = (slug: string, name: string, description: string, icon: string, category: string): ServiceCatalogItem => ({ slug, name, description, icon, category, tokenCost: 2, kind: "paid" });
const free = (slug: string, name: string, description: string, icon: string, category: string): ServiceCatalogItem => ({ slug, name, description, icon, category, tokenCost: 0, kind: "free" });
const locked = (slug: string, name: string, description: string, icon: string, category: string): ServiceCatalogItem => ({ slug, name, description, icon, category, tokenCost: 0, kind: "locked" });

export const serviceCatalog: ServiceCatalogItem[] = [
  paid("cheti-tin", "CHETI CHA TIN", "Pata cheti cha TIN kwa hatua rahisi.", "file-badge", "Huduma kuu"),
  paid("verify-tin", "VERIFY TIN", "Jaza na hakiki taarifa za TIN yako.", "badge-check", "Huduma kuu"),
  paid("nakala-nida", "NAKALA LAINI YA NIDA", "Omba nakala laini ya kitambulisho cha NIDA.", "contact", "Huduma kuu"),
  paid("stika-lipa", "STIKA ZA LIPA", "Pata stika za LIPA kwa matumizi yako.", "qr-code", "Huduma kuu"),
  paid("mpiga-kura", "MPIGA KURA", "Huduma na taarifa za mpiga kura.", "vote", "Huduma kuu"),
  paid("leseni-biashara", "LESENI YA BIASHARA", "Anza mchakato wa leseni ya biashara.", "store", "Huduma kuu"),
  free("pata-lipa-namba", "PATA LIPA NAMBA", "Omba Lipa Namba ya mtandao unaotumia.", "landmark", "Huduma kuu"),
  paid("stika-mawakala", "STIKA ZA MAWAKALA", "Pata stika za mawakala.", "ticket", "Huduma kuu"),
  free("kitambulisho-wakala", "KITAMBULISHO CHA WAKALA", "Tengeneza kitambulisho cha wakala cha pande mbili kwa Airtel, Vodacom, Yas au Halotel.", "badge-check", "Huduma kuu"),
  paid("nakala-nida-2", "SME AIRTEL MKATABA", "Jaza na hakiki mkataba wa SME wa Airtel.", "copy", "Huduma kuu"),
  paid("leseni-udereva", "LESENI YA UDEREVA", "Msaada wa huduma za leseni ya udereva.", "car-front", "Huduma kuu"),
  free("utafutaji-nida", "UTAFUTA WA NIDA", "Tafuta taarifa za NIDA bila tokeni.", "search", "Huduma za bure"),
  free("qr-mitandao", "MSIMBO WA QR MITANDAO YOTE", "Tengeneza msimbo wa QR wa mitandao yako.", "qr-code", "Huduma za bure"),
  paid("brela", "BRELA", "Msaada wa huduma za BRELA.", "landmark", "Huduma kuu"),
  locked("cheti-kuzaliwa", "CHETI CHA KUZALIWA", "Huduma hii inasubiri kufunguliwa.", "baby", "Huduma zilizofungwa"),
  locked("visa-pasipoti", "VISA / PASIPOTI", "Huduma hii inasubiri kufunguliwa.", "plane", "Huduma zilizofungwa"),
  locked("cheti-ndoa", "CHETI CHA NDOA", "Huduma hii inasubiri kufunguliwa.", "heart-handshake", "Huduma zilizofungwa"),
  locked("ripoti-hasara", "RIPOTI YA HASARA", "Huduma hii inasubiri kufunguliwa.", "file-warning", "Huduma zilizofungwa"),
  paid("tengeneza-muziki", "TENGENEZA MUZIKI", "Tengeneza wazo la muziki wa kipekee.", "music-2", "Zana za ziada"),
  paid("tafuta-kvar-picha", "TAFUTA KVAR PICHA", "Tafuta picha kwa matumizi yako.", "image-search", "Zana za ziada"),
  paid("simu-ya-tafuta", "SIMU YA TAFTA", "Pata msaada wa utafutaji wa simu.", "smartphone", "Zana za ziada"),
  paid("usuli-wa-ondoa", "USULI WA ONDOA", "Ondoa usuli wa picha.", "scan-face", "Zana za ziada"),
  paid("wasifu-chonga", "WASIFU WA CHONGA", "Tengeneza wasifu wa kuvutia.", "user-round-pen", "Zana za ziada"),
  paid("nembo-chonga", "NEMBO YA CHONGA", "Tengeneza wazo la nembo.", "palette", "Zana za ziada"),
  paid("radio-maria", "RADIO MARIA", "Fungua Radio Maria kwa urahisi.", "radio", "Zana za ziada"),
  paid("simba-sc", "SIMBA SC", "Habari na huduma za Simba SC.", "trophy", "Zana za ziada"),
  paid("yanga-africans", "YANGA AFRICANS", "Habari na huduma za Yanga Africans.", "star", "Zana za ziada"),
  paid("azam-tv", "AZAM TV", "Fungua huduma ya Azam TV.", "tv", "Zana za ziada"),
];

export const specialServices = [
  { slug: "tic-tech", name: "JIUNGE NA KIKUNDI CHA TIC TECH (WhatsApp)", tone: "green", action: "whatsapp" },
  { slug: "kikundi-bure", name: "KIKUNDI LA BURE (Bure)", tone: "green", action: "whatsapp" },
  { slug: "botani-biashara", name: "LIPIA BATANI YA BIASHARA (Programu ya IONEKANE)", tone: "green", action: "contact" },
  { slug: "kikundi-vip", name: "KIKUNDI VIP 5,000 (Kulipia)", tone: "yellow", action: "contact" },
  { slug: "vip-usajili", name: "VIP YA USAJILI (Lipia Mda Mrefu)", tone: "yellow", action: "contact" },
  { slug: "tangazo", name: "LIPIA TANGAZO LAKO (Litangazwe)", tone: "red", action: "contact" },
] as const;

export const tutorials: TutorialItem[] = [
  { slug: "lipa-vodacom", title: "KUSAJILI LIPA NAMBA VODACOM", description: "Jifunze hatua za kusajili Lipa Namba Vodacom.", tokenCost: 2 },
  { slug: "download-tin", title: "JINSI YA KUDOWNLOAD TIN", description: "Mwongozo wa kupakua cheti cha TIN.", tokenCost: 2 },
  { slug: "tin-mteja-mpya", title: "KUOMBA TIN MTEJA MPYA", description: "Jinsi ya kumsaidia mteja mpya kuomba TIN.", tokenCost: 2 },
];

export const activitySeed: ActivityItem[] = [
  { service: "CHETI CHA TIN", type: "Matumizi ya huduma", credits: 2, status: "Imekamilika", reference: "HM-81A2", createdAt: "2026-09-09T16:25:00.000Z" },
  { service: "NAKALA LAINI YA NIDA", type: "Matumizi ya huduma", credits: 2, status: "Imekamilika", reference: "HM-80F4", createdAt: "2026-09-07T09:10:00.000Z" },
];

export function mergeServiceCatalogDefaults(configured: ServiceCatalogItem[], initialized: boolean): ServiceCatalogItem[] {
  // Once Firestore has been initialized, it is the source of truth.
  // Defaults are only used during the initial bootstrap so deleted services
  // are not silently resurrected on every page load.
  if (initialized) return configured;

  const merged = new Map(serviceCatalog.map((service) => [service.slug, service]));
  configured.forEach((service) => merged.set(service.slug, service));
  return Array.from(merged.values());
}

export function findService(slug: string) {
  return serviceCatalog.find((service) => service.slug === slug);
}

export function formatCatalogDate(value: string | Date) {
  return new Date(value).toLocaleDateString("sw-TZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}
