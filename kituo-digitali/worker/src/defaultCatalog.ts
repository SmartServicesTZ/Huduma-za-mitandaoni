type ServiceFormField = { fieldName: string; label: string; type: string; placeholder?: string; required?: boolean; validation?: string; helpText?: string; options?: string[]; order?: number; maxSizeMb?: number; accept?: string[] };

type DefaultService = { slug: string; name: string; description: string; category: string; icon: string; isVisible: boolean; active: boolean; isLocked: boolean; isFree: boolean; tokenCost: number; reward?: number; instructions: string; buttonText: string; adminWorkflow: boolean; statusOptions: string[]; fields: ServiceFormField[]; order: number };

const paid = (slug: string, name: string, description: string, icon: string, category: string, order: number): DefaultService => ({ slug, name, description, icon, category, tokenCost: 2, isVisible: true, active: true, isFree: false, isLocked: false, order, fields: [{ fieldName: "details", label: "Maelezo ya ombi", type: "TEXTAREA", required: true, helpText: "Andika taarifa zinazohitajika kwa huduma hii.", order: 0 }], instructions: "Jaza taarifa zako kwa usahihi. Admin atakagua ombi lako.", buttonText: "TUMA OMBI", statusOptions: ["PENDING", "PROCESSING", "APPROVED", "REJECTED"], adminWorkflow: true });
const free = (slug: string, name: string, description: string, icon: string, category: string, order: number): DefaultService => ({ ...paid(slug, name, description, icon, category, order), tokenCost: 0, isFree: true });
const locked = (slug: string, name: string, description: string, icon: string, order: number): DefaultService => ({ ...paid(slug, name, description, icon, "Huduma zilizofungwa", order), tokenCost: 0, isLocked: true, isFree: false });

export const defaultServices: DefaultService[] = [
  paid("cheti-tin", "CHETI CHA TIN", "Pata cheti cha TIN kwa hatua rahisi.", "file-badge", "Huduma kuu", 0),
  paid("thibitisha-tin", "THIBITISHA TIN", "Thibitisha taarifa za TIN yako.", "badge-check", "Huduma kuu", 1),
  paid("nakala-nida", "NAKALA LAINI YA NIDA", "Omba nakala laini ya kitambulisho cha NIDA.", "contact", "Huduma kuu", 2),
  paid("stika-lipa", "STIKA ZA LIPA", "Pata stika za LIPA kwa matumizi yako.", "qr-code", "Huduma kuu", 3),
  paid("mpiga-kura", "MPIGA KURA", "Huduma na taarifa za mpiga kura.", "vote", "Huduma kuu", 4),
  paid("leseni-biashara", "LESENI YA BIASHARA", "Anza mchakato wa leseni ya biashara.", "store", "Huduma kuu", 5),
  free("pata-lipa-namba", "PATA LIPA NAMBA", "Omba Lipa Namba ya mtandao unaotumia.", "landmark", "Huduma kuu", 6),
  paid("stika-mawakala", "STIKA ZA MAWAKALA", "Pata stika za mawakala.", "ticket", "Huduma kuu", 7),
  paid("nakala-nida-2", "NAKALA LAINI YA NIDA 2", "Nakala nyingine ya taarifa za NIDA.", "copy", "Huduma kuu", 8),
  paid("leseni-udereva", "LESENI YA UDEREVA", "Msaada wa huduma za leseni ya udereva.", "car-front", "Huduma kuu", 9),
  free("utafutaji-nida", "UTAFUTAJI WA NIDA", "Tafuta taarifa za NIDA bila tokeni.", "search", "Huduma za bure", 10),
  free("qr-mitandao", "MSIMBO WA QR MITANDAO YOTE", "Tengeneza msimbo wa QR wa mitandao yako.", "qr-code", "Huduma za bure", 11),
  paid("brela", "BRELA", "Msaada wa huduma za BRELA.", "landmark", "Huduma kuu", 12),
  locked("cheti-kuzaliwa", "CHETI CHA KUZALIWA", "Huduma hii inasubiri kufunguliwa.", "baby", 13),
  locked("visa-pasipoti", "VISA / PASIPOTI", "Huduma hii inasubiri kufunguliwa.", "plane", 14),
  locked("cheti-ndoa", "CHETI CHA NDOA", "Huduma hii inasubiri kufunguliwa.", "heart-handshake", 15),
  locked("ripoti-hasara", "RIPOTI YA HASARA", "Huduma hii inasubiri kufunguliwa.", "file-warning", 16),
  paid("tengeneza-muziki", "TENGENEZA MUZIKI", "Tengeneza wazo la muziki wa kipekee.", "music-2", "Zana za ziada", 17),
  paid("tafuta-kvar-picha", "TAFUTA KVAR PICHA", "Tafuta picha kwa matumizi yako.", "image-search", "Zana za ziada", 18),
  paid("simu-ya-tafuta", "SIMU YA TAFTA", "Pata msaada wa utafutaji wa simu.", "smartphone", "Zana za ziada", 19),
  paid("usuli-wa-ondoa", "USULI WA ONDOA", "Ondoa usuli wa picha.", "scan-face", "Zana za ziada", 20),
  paid("wasifu-chonga", "WASIFU WA CHONGA", "Tengeneza wasifu wa kuvutia.", "user-round-pen", "Zana za ziada", 21),
  paid("nembo-chonga", "NEMBO YA CHONGA", "Tengeneza wazo la nembo.", "palette", "Zana za ziada", 22),
  paid("radio-maria", "RADIO MARIA", "Fungua Radio Maria kwa urahisi.", "radio", "Zana za ziada", 23),
  paid("simba-sc", "SIMBA SC", "Habari na huduma za Simba SC.", "trophy", "Zana za ziada", 24),
  paid("yanga-africans", "YANGA AFRICANS", "Habari na huduma za Yanga Africans.", "star", "Zana za ziada", 25),
  paid("azam-tv", "AZAM TV", "Fungua huduma ya Azam TV.", "tv", "Zana za ziada", 26),
];

const commonNida: ServiceFormField = { fieldName: "nidaNumber", label: "Namba ya NIDA", type: "NIDA", placeholder: "20068517-27520-00001-22", required: true, helpText: "Namba ya tarakimu 20 kama ilivyo kwenye kitambulisho.", order: 2 };
const commonPhone: ServiceFormField = { fieldName: "phone", label: "Namba ya Simu", type: "PHONE", placeholder: "07XXXXXXXX", required: true, helpText: "Hakikisha namba haijafunguliwa Lipa Namba nyingine.", order: 1 };
const commonTin: ServiceFormField = { fieldName: "tinNumber", label: "TIN Number", type: "TIN", placeholder: "123-123-123", required: false, order: 3 };
const identityType: ServiceFormField = { fieldName: "idDocumentType", label: "Aina ya Kitambulisho", type: "DROPDOWN", required: true, options: ["National ID", "Voter ID", "Driving License", "Passport"], order: 4 };
const identityImage: ServiceFormField = { fieldName: "idDocument", label: "Picha ya Kitambulisho", type: "IMAGE_UPLOAD", required: true, helpText: "JPG, PNG au WebP; hadi MB 5. Picha iwe ya mwombaji.", maxSizeMb: 5, accept: ["image/jpeg", "image/png", "image/webp"], order: 5 };
const names: ServiceFormField[] = [
  { fieldName: "firstName", label: "Jina la Kwanza", type: "TEXT", required: true, helpText: "Andika kama lilivyo kwenye kitambulisho.", order: 0 },
  { fieldName: "middleName", label: "Jina la Pili", type: "TEXT", required: true, helpText: "Andika kama lilivyo kwenye kitambulisho.", order: 1 },
  { fieldName: "lastName", label: "Jina la Mwisho", type: "TEXT", required: true, helpText: "Andika kama lilivyo kwenye kitambulisho.", order: 2 },
];
const network = (id: string, name: string, title: string, reward: number, introduction: string, requirements: string, fields: ServiceFormField[]) => ({
  id, name, title, reward, introduction, requirements, paymentInfo: "Malipo hulipwa kwenye namba uliyotumia kufungua account yako.", active: true, fields,
});

export const defaultLipaServices = [
  network("airtel", "Airtel", "AIRTEL — PATA LIPA NAMBA", 500, "Ndugu Agent, utajipatia sh 500 kwa Lipa Namba itakayotengenezwa hapa.", "Ifanye miamala jumla isiyopungua sh 10,000.", [commonPhone]),
  network("vodacom", "Vodacom", "VODACOM — PATA LIPA NAMBA", 5000, "Ndugu Agent, utajipatia sh 5,000 kwa Lipa Namba itakayotengenezwa hapa.", "Ifanye miamala 3 na jumla isiwe chini ya sh 30,000.", [...names, { fieldName: "businessName", label: "Majina ya Biashara", type: "TEXT", required: false, order: 3 }, { ...commonPhone, order: 4 }, { ...commonNida, order: 5 }, { ...commonTin, order: 6 }, identityType, identityImage]),
  network("yas-tigo", "Yas / Tigo", "YAS / TIGO — PATA LIPA NAMBA", 0, "Karibu ujipatie huduma ya Lipa Namba.", "", [commonPhone, commonNida, commonTin, { fieldName: "businessLicense", label: "Leseni ya Biashara", type: "TEXTAREA", required: false, order: 4 }]),
  network("halotel", "Halotel", "HALOTEL — PATA LIPA NAMBA", 0, "Karibu ujipatie huduma ya Lipa Namba.", "", [commonPhone, commonNida, commonTin, identityType, identityImage]),
];
