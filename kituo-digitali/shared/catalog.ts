export type ServiceKind = "paid" | "free" | "locked";

export type ServiceCatalogItem = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  tokenCost: number;
  reward?: number;
  tokenType?: "nida" | "huduma";
  kind: ServiceKind;
  category: string;
  actionUrl?: string;
  order?: number;
  fields?: Array<Record<string, unknown>>;
  active?: boolean;
  isVisible?: boolean;
  isLocked?: boolean;
  maintenanceMessage?: string;
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
export const whatsappUrl = "https://wa.me/255692287767?text=Habari%20HUDUMA%20ZA%20MTANDAONI%2C%20nahitaji%20msaada.";

const portalServiceNameOverrides: Record<string, string> = {
  "cheti-tin": "TIN CERTIFICATE",
  "pata-lipa-namba": "PATA LIPA NAMBA",
  "access-lipa-number": "PATA ACCESS YA LIPA & USAJILI",
  "pata-pocket-wifi-mabando": "PATA POCKET WIFI & BANDO",
};

export function getPortalServiceName(slug: string, fallbackName = "Huduma") {
  return portalServiceNameOverrides[slug] ?? fallbackName;
}

const paid = (slug: string, name: string, description: string, icon: string, category: string): ServiceCatalogItem => ({ slug, name, description, icon, category, tokenCost: 2, kind: "paid" });
const free = (slug: string, name: string, description: string, icon: string, category: string): ServiceCatalogItem => ({ slug, name, description, icon, category, tokenCost: 0, kind: "free" });
const locked = (slug: string, name: string, description: string, icon: string, category: string): ServiceCatalogItem => ({ slug, name, description, icon, category, tokenCost: 0, kind: "locked" });

export const serviceCatalog: ServiceCatalogItem[] = [
  paid("leseni-biashara", "LESENI YA BIASHARA", "Anza mchakato wa leseni ya biashara.", "store", "HUDUMA ZA WAKALA"),
  paid("cheti-tin", "TIN CERTIFICATE", "Pata cheti cha TIN kwa hatua rahisi.", "file-badge", "HUDUMA ZA WAKALA"),
  paid("leseni-udereva", "LESENI YA UDEREVA", "Msaada wa huduma za leseni ya udereva.", "car-front", "HUDUMA ZA WAKALA"),
  paid("verify-tin", "VERIFY TIN", "Jaza na hakiki taarifa za TIN yako.", "badge-check", "HUDUMA ZA WAKALA"),
  paid("mpiga-kura", "SOFT COPY YA MPIGA KURA", "Huduma na taarifa za mpiga kura.", "vote", "HUDUMA ZA WAKALA"),
  paid("stika-lipa", "STIKA ZA LIPA", "Pata stika za LIPA kwa matumizi yako.", "qr-code", "HUDUMA ZA WAKALA"),
  paid("stika-mawakala", "STIKA ZA MAWAKALA", "Pata stika za mawakala.", "ticket", "HUDUMA ZA WAKALA"),
  free("pata-lipa-namba", "PATA LIPA NAMBA", "Omba Lipa Namba ya mtandao unaotumia bila malipo.", "landmark", "HUDUMA ZA WAKALA"),
  free("access-lipa-number", "PATA ACCESS YA LIPA & USAJILI", "Omba access ya kutengeneza Lipa Namba kupitia Airtel, Yas, Vodacom au Halotel.", "wallet-cards", "HUDUMA ZA WAKALA"),
  paid("kitambulisho-wakala", "KITAMBULISHO CHA WAKALA USAJILI & LIPA", "Tengeneza kitambulisho cha kisasa cha wakala wa usajili na Lipa.", "badge-check", "HUDUMA ZA WAKALA"),
  paid("sme-airtel-mkataba", "SME AIRTEL MKATABA", "Jaza na hakiki mkataba wa SME wa Airtel.", "copy", "HUDUMA ZA WAKALA"),
  free("sme-vodacom", "SME VODACOM", "Omba kuunganishwa SME Vodacom na uwasilishe cheti cha TIN.", "smartphone", "HUDUMA ZA WAKALA"),
  free("pata-pocket-wifi-mabando", "PATA POCKET WIFI & BANDO", "Chagua router na bando la Vodacom Unlimited M2M, kisha tuma oda yako.", "wifi", "HUDUMA ZA WAKALA"),
  { ...free("sme-airtel", "SME AIRTEL", "Sajili laini mpya au ya zamani kwenye SME Airtel. Vocha kuanzia TSh 10,000; zawadi ya TSh 2,000 kwa SME iliyothibitishwa.", "smartphone", "HUDUMA ZA WAKALA"), reward: 2000 },
  free("change-business-name-airtel-lipa", "CHANGE BUSINESS NAME AIRTEL LIPA", "Jaza fomu rasmi ya kubadili jina la biashara kwenye Airtel Lipa bila kuondoka kwenye website au app.", "file-pen", "HUDUMA ZA WAKALA"),
  free("tengeneza-mkataba", "TENGENEZA MKATABA", "Tengeneza mkataba unaoweza kuhariri, kuona na kuhifadhi kama PDF.", "file-badge", "HUDUMA ZA WAKALA"),
  paid("brela", "BRELA", "Msaada wa huduma za BRELA.", "landmark", "HUDUMA ZA WAKALA"),
  locked("cheti-kuzaliwa", "CHETI CHA KUZALIWA", "Huduma hii inasubiri kufunguliwa.", "baby", "HUDUMA ZA WAKALA"),
  locked("simba-sc", "SIMBA SC WHATSAPP GROUP", "Kipengele kimefungwa kwa muda; group bado halijaandaliwa.", "trophy", "HUDUMA ZINGINE"),
  paid("yanga-africans", "YANGA SC WHATSAPP GROUP", "Jiunge na group la mashabiki wa Yanga baada ya kusoma na kukubali sheria.", "star", "HUDUMA ZINGINE"),
  paid("azam-tv", "AZAM TV", "Fungua huduma rasmi za Azam TV.", "tv", "HUDUMA ZINGINE"),
];
export const specialServices = [
  { slug: "tic-tech", name: "JIUNGE NA KIKUNDI CHA SMARTSERVICES TZ", tone: "green", action: "external", url: "https://chat.whatsapp.com/H1Bvu253n9NK7c4agRgOX4?s=cl&p=a&mlu=4&iam=2" },
  { slug: "kikundi-bure", name: "WAZEE WA BETTING TZ", tone: "green", action: "external", url: "https://chat.whatsapp.com/CNhZ2jsVkgw0Lu0zaZHrlJ?s=cl&p=a&mlu=4&iam=2" },
] as const;;

export const tutorials: TutorialItem[] = [
  { slug: "lipa-vodacom", title: "KUSAJILI LIPA NAMBA VODACOM", description: "Jifunze hatua za kusajili Lipa Namba Vodacom.", tokenCost: 2 },
  { slug: "download-tin", title: "JINSI YA KUDOWNLOAD TIN", description: "Mwongozo wa kupakua cheti cha TIN.", tokenCost: 2 },
  { slug: "tin-mteja-mpya", title: "KUOMBA TIN MTEJA MPYA", description: "Jinsi ya kumsaidia mteja mpya kuomba TIN.", tokenCost: 2 },
];

export const activitySeed: ActivityItem[] = [
  { service: "TIN NUMBER CERTIFICATE", type: "Matumizi ya huduma", credits: 2, status: "Imekamilika", reference: "HM-81A2", createdAt: "2026-09-09T16:25:00.000Z" },
];

export function mergeServiceCatalogDefaults(configured: ServiceCatalogItem[], initialized: boolean): ServiceCatalogItem[] {
  const defaults = new Map(serviceCatalog.map((service) => [service.slug, service]));
  // Before the Firestore catalog is initialized, keep the local catalog as a
  // safe fallback. Once initialization is complete, Firestore is authoritative
  // so deleted defaults must not be resurrected on the user portal.
  const merged = new Map<string, ServiceCatalogItem>(initialized ? [] : serviceCatalog.map((service) => [service.slug, service]));
  configured.forEach((service) => {
    const fallback = defaults.get(service.slug);
    // Keep newly configured Firestore services even when they do not exist in
    // the legacy local fallback catalog.
    if (!fallback) {
      merged.set(service.slug, service);
      return;
    }
    // Preserve admin configuration while restoring defaults missing from older seeds.
    merged.set(service.slug, fallback?.actionUrl
      ? { ...fallback, ...service, kind: service.isLocked === true ? "locked" : fallback.kind, actionUrl: service.actionUrl || fallback.actionUrl, name: service.name || fallback.name, description: service.description || fallback.description, category: service.category || fallback.category }
      : { ...fallback, ...service });
  });
  if (initialized) {
    const alwaysAvailableDefaults = ["access-lipa-number", "pata-pocket-wifi-mabando"];
    alwaysAvailableDefaults.forEach((slug) => {
      const fallback = defaults.get(slug);
      if (fallback && !configured.some((service) => service.slug === slug)) merged.set(slug, fallback);
    });
  }
  return Array.from(merged.values());
}

export function findService(slug: string) {
  return serviceCatalog.find((service) => service.slug === slug);
}

export function formatCatalogDate(value: string | Date) {
  return new Date(value).toLocaleDateString("sw-TZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}
