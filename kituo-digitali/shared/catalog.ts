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
  free("access-lipa-number", "MAOMBI YA ACCESS LIPA NAMBA", "Omba access ya kutengeneza Lipa Namba kupitia Airtel, Yas, Vodacom au Halotel.", "wallet-cards", "Huduma kuu"),
  paid("stika-mawakala", "STIKA ZA MAWAKALA", "Pata stika za mawakala.", "ticket", "Huduma kuu"),
  free("kitambulisho-wakala", "KITAMBULISHO CHA LIPA KWA SIMU AIRTEL", "Tengeneza kitambulisho cha kisasa cha wakala wa Lipa kwa Simu Airtel wa Mbeya One Company Limited.", "badge-check", "Huduma kuu"),
  paid("nakala-nida-2", "SME AIRTEL MKATABA", "Jaza na hakiki mkataba wa SME wa Airtel.", "copy", "Huduma kuu"),
  paid("leseni-udereva", "LESENI YA UDEREVA", "Msaada wa huduma za leseni ya udereva.", "car-front", "Huduma kuu"),
  free("utafutaji-nida", "UTAFUTA WA NIDA", "Tafuta taarifa za NIDA bila tokeni.", "search", "Huduma za bure"),
  free("qr-mitandao", "MSIMBO WA QR MITANDAO YOTE", "Tengeneza msimbo wa QR wa mitandao yako.", "qr-code", "Huduma za bure"),
  paid("brela", "BRELA", "Msaada wa huduma za BRELA.", "landmark", "Huduma kuu"),
  locked("cheti-kuzaliwa", "CHETI CHA KUZALIWA", "Huduma hii inasubiri kufunguliwa.", "baby", "Huduma zilizofungwa"),
  locked("visa-pasipoti", "VISA / PASIPOTI", "Huduma hii inasubiri kufunguliwa.", "plane", "Huduma zilizofungwa"),
  locked("cheti-ndoa", "CHETI CHA NDOA", "Huduma hii inasubiri kufunguliwa.", "heart-handshake", "Huduma zilizofungwa"),
  locked("ripoti-hasara", "RIPOTI YA HASARA", "Huduma hii inasubiri kufunguliwa.", "file-warning", "Huduma zilizofungwa"),
  { ...paid("tengeneza-muziki", "TENGENEZA MUZIKI", "Tengeneza wimbo kamili kwa maelezo yako — vocals, lyrics au instrumental.", "music-2", "Zana za ziada"), actionUrl: "https://suno.com/tools/ai-music-generator" },
  { ...paid("tafuta-kvar-picha", "TAFUTA KWA PICHA", "Pakia picha na tafuta inapotokea mtandaoni au matoleo yake mengine.", "image-search", "Zana za ziada"), actionUrl: "https://www.tineye.com/" },
  { ...paid("simu-ya-tafuta", "TAFUTA SIMU ILIYOPOTEA", "Tafuta, piga mlio, funga au futa Android yako kupitia Google Find Hub.", "smartphone", "Zana za ziada"), actionUrl: "https://www.google.com/android/find/" },
  { ...paid("usuli-wa-ondoa", "ONDOA USULI WA PICHA", "Ondoa background ya picha kwa hatua chache.", "scan-face", "Zana za ziada"), actionUrl: "https://www.remove.bg/" },
  { ...paid("wasifu-chonga", "TENGENEZA CV / WASIFU", "Tengeneza CV ya kisasa kwa templates na uipakue PDF.", "user-round-pen", "Zana za ziada"), actionUrl: "https://www.canva.com/create/cv/" },
  { ...paid("nembo-chonga", "TENGENEZA NEMBO", "Chagua template, badili rangi na tengeneza nembo ya biashara.", "palette", "Zana za ziada"), actionUrl: "https://www.canva.com/create/logos/" },
  { ...paid("radio-maria", "RADIO MARIA TANZANIA", "Sikiliza Radio Maria Tanzania mtandaoni.", "radio", "Zana za ziada"), actionUrl: "https://radiomaria.co.tz/" },
  { ...paid("simba-sc", "SIMBA SC", "Fungua taarifa na huduma rasmi za Simba SC.", "trophy", "Zana za ziada"), actionUrl: "https://simbasc.co.tz/" },
  { ...paid("yanga-africans", "YANGA SC", "Fungua taarifa na huduma rasmi za Yanga SC.", "star", "Zana za ziada"), actionUrl: "https://yangasc.co.tz/" },
  { ...paid("azam-tv", "AZAM TV", "Fungua huduma rasmi za Azam TV.", "tv", "Zana za ziada"), actionUrl: "https://www.azamtv.co.tz/" },
  { ...paid("hariri-picha", "HARIRI PICHA ONLINE", "Hariri picha kitaalamu bila kusakinisha programu.", "image", "Zana za ziada"), actionUrl: "https://www.photopea.com/" },
  { ...paid("hariri-video", "HARIRI VIDEO ONLINE", "Kata, ongeza maandishi, muziki, effects na subtitles kwenye video.", "play-circle", "Zana za ziada"), actionUrl: "https://www.capcut.com/tools/online-video-editor" },
  { ...free("pdf-tools", "PDF TOOLS", "Unganisha, gawanya, compress na convert PDF online.", "file-badge", "Zana za ziada"), actionUrl: "https://www.ilovepdf.com/" },
  { ...free("qr-generator", "QR CODE GENERATOR", "Tengeneza QR ya link, Wi-Fi, text, vCard na zaidi.", "qr-code", "Zana za ziada"), actionUrl: "https://www.qr-code-generator.com/" },
];

export const specialServices = [
  { slug: "huduma-kwa-wateja", name: "HUDUMA KWA WATEJA — GROUP LA WOTE", tone: "blue", action: "external", url: "https://chat.whatsapp.com/H1Bvu253n9NK7c4agRgOX4?s=cl&p=a&mlu=4&iam=2" },
  { slug: "tic-tech", name: "JIUNGE NA KIKUNDI CHA SMARTSERVICES TZ", tone: "green", action: "external", url: "https://chat.whatsapp.com/H1Bvu253n9NK7c4agRgOX4?s=cl&p=a&mlu=4&iam=2" },
  { slug: "kikundi-bure", name: "WAZEE WA BETTING TZ", tone: "green", action: "external", url: "https://chat.whatsapp.com/CNhZ2jsVkgw0Lu0zaZHrlJ?s=cl&p=a&mlu=4&iam=2" },
  { slug: "botani-biashara", name: "LIPIA BATANI YA BIASHARA (Programu ya IONEKANE)", tone: "green", action: "contact", url: whatsappUrl },
  { slug: "kikundi-vip", name: "KIKUNDI VIP 5,000 (Kulipia)", tone: "yellow", action: "contact", url: whatsappUrl },
  { slug: "vip-usajili", name: "VIP YA USAJILI (Lipia Mda Mrefu)", tone: "yellow", action: "contact", url: whatsappUrl },
  { slug: "tangazo", name: "LIPIA TANGAZO LAKO (Litangazwe)", tone: "red", action: "contact", url: whatsappUrl },
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
  // Firestore remains the source of truth for existing services. The new
  // Access Lipa Namba entry is kept available while its backend seed is
  // being rolled out, so the public portal does not depend on an admin
  // opening the dashboard first.
  if (initialized) {
    const access = serviceCatalog.find((service) => service.slug === "access-lipa-number");
    if (access && !configured.some((service) => service.slug === access.slug)) return [...configured, access];
    return configured;
  }
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
