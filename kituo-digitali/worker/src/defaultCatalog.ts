type ServiceFormField = { fieldName: string; label: string; type: string; placeholder?: string; required?: boolean; validation?: string; helpText?: string; options?: string[]; order?: number; maxSizeMb?: number; accept?: string[] };

type DefaultService = { slug: string; name: string; description: string; category: string; icon: string; isVisible: boolean; active: boolean; isLocked: boolean; isFree: boolean; tokenCost: number; tokenType?: string; reward?: number; instructions: string; buttonText: string; adminWorkflow: boolean; statusOptions: string[]; fields: ServiceFormField[]; order: number };

const paid = (slug: string, name: string, description: string, icon: string, category: string, order: number): DefaultService => ({ slug, name, description, icon, category, tokenCost: 2, isVisible: true, active: true, isFree: false, isLocked: false, order, fields: [{ fieldName: "details", label: "Maelezo ya ombi", type: "TEXTAREA", required: true, helpText: "Andika taarifa zinazohitajika kwa huduma hii.", order: 0 }], instructions: "Jaza taarifa zako kwa usahihi. Admin atakagua ombi lako.", buttonText: "TUMA OMBI", statusOptions: ["PENDING", "PROCESSING", "APPROVED", "REJECTED"], adminWorkflow: true });
const free = (slug: string, name: string, description: string, icon: string, category: string, order: number): DefaultService => ({ ...paid(slug, name, description, icon, category, order), tokenCost: 0, isFree: true });
const locked = (slug: string, name: string, description: string, icon: string, order: number): DefaultService => ({ ...paid(slug, name, description, icon, "Huduma zilizofungwa", order), tokenCost: 0, isLocked: true, isFree: false });

export const defaultServices: DefaultService[] = [
  paid("cheti-tin", "TIN NUMBER CERTIFICATE", "Pata cheti cha TIN kwa hatua rahisi.", "file-badge", "Huduma kuu", 0),
  paid("thibitisha-tin", "THIBITISHA TIN", "Thibitisha taarifa za TIN yako.", "badge-check", "Huduma kuu", 1),
  paid("nakala-nida", "NAKALA LAINI YA NIDA", "Omba nakala laini ya kitambulisho cha NIDA.", "contact", "Huduma kuu", 2),
  paid("stika-lipa", "STIKA ZA LIPA", "Pata stika za LIPA kwa matumizi yako.", "qr-code", "Huduma kuu", 3),
  paid("mpiga-kura", "MPIGA KURA", "Huduma na taarifa za mpiga kura.", "vote", "Huduma kuu", 4),
  paid("leseni-biashara", "LESENI YA BIASHARA", "Anza mchakato wa leseni ya biashara.", "store", "Huduma kuu", 5),
  free("pata-lipa-namba", "PATA LIPA NAMBA", "Omba Lipa Namba ya mtandao unaotumia.", "landmark", "Huduma kuu", 6),
  free("access-lipa-number", "MAOMBI YA ACCESS LIPA NAMBA", "Omba access ya kutengeneza Lipa Namba kupitia Airtel, Yas, Vodacom au Halotel.", "wallet-cards", "Huduma kuu", 7),
  {
    ...free("pata-till-mitandao-yote", "PATA TILL MITANDAO YOTE", "Omba Till ya Halotel, Airtel au Vodacom. Halotel bure; Airtel TSh 5,000; Vodacom TSh 40,000.", "store", "Huduma kuu", 8),
    fields: [
      { fieldName: "network", label: "Mtandao", type: "TEXT", required: true, order: 0 },
      { fieldName: "serviceType", label: "Aina ya huduma", type: "TEXT", required: false, order: 1 },
      { fieldName: "fullName", label: "Majina kamili ya mteja", type: "TEXT", required: false, order: 2 },
      { fieldName: "tillPhone", label: "Namba ya simu ya Till", type: "PHONE", required: false, order: 3 },
      { fieldName: "contactPhone", label: "Namba ya mawasiliano", type: "PHONE", required: false, order: 4 },
      { fieldName: "tinNumber", label: "Namba ya TIN", type: "TEXT", required: false, order: 5 },
      { fieldName: "idType", label: "Aina ya kitambulisho", type: "TEXT", required: false, order: 6 },
      { fieldName: "idNumber", label: "Namba ya kitambulisho", type: "TEXT", required: false, order: 7 },
      { fieldName: "businessName", label: "Jina la biashara", type: "TEXT", required: false, order: 8 },
      { fieldName: "identityDocument", label: "Picha ya kitambulisho", type: "IMAGE_UPLOAD", required: false, maxSizeMb: 5, accept: ["image/jpeg", "image/png", "image/webp", "application/pdf"], order: 9 },
      { fieldName: "airtelPhone", label: "Namba ya Airtel", type: "PHONE", required: false, order: 10 },
      { fieldName: "nidaNumber", label: "Namba ya NIDA", type: "NIDA", required: false, order: 11 },
      { fieldName: "businessEvidence", label: "Ushahidi wa biashara", type: "IMAGE_UPLOAD", required: false, maxSizeMb: 5, accept: ["image/jpeg", "image/png", "image/webp", "application/pdf"], order: 12 },
      { fieldName: "floatConfirmed", label: "Float ya TSh 100,000 imethibitishwa", type: "TEXT", required: false, order: 13 },
      { fieldName: "noExistingLipa", label: "Mteja hana Lipa Namba tayari", type: "TEXT", required: false, order: 13.5 },
      { fieldName: "paidConfirmed", label: "Utayari wa malipo umethibitishwa", type: "TEXT", required: false, order: 14 },
      { fieldName: "otpRequired", label: "OTP inahitajika", type: "TEXT", required: false, order: 15 },
      { fieldName: "adminInstructions", label: "Maelekezo ya Admin", type: "TEXTAREA", required: false, order: 16 },
      { fieldName: "price", label: "Bei ya huduma", type: "TEXT", required: false, order: 17 },
      { fieldName: "status", label: "Hali", type: "TEXT", required: false, order: 18 },
    ],
  },
  paid("stika-mawakala", "STIKA ZA MAWAKALA", "Pata stika za mawakala.", "ticket", "Huduma kuu", 8),
  free("kitambulisho-wakala", "KITAMBULISHO CHA WAKALA", "Tengeneza kitambulisho cha wakala cha pande mbili kwa Airtel, Vodacom, Yas au Halotel.", "badge-check", "Huduma kuu", 9),
  { ...paid("kitambulisho-wakala-airtel", "KITAMBULISHO CHA WAKALA — AIRTEL", "Pakua kitambulisho cha wakala cha Airtel.", "badge-check", "Bei za Kitambulisho cha Wakala", 90), tokenCost: 5 },
  { ...paid("kitambulisho-wakala-halotel", "KITAMBULISHO CHA WAKALA — HALOTEL", "Pakua kitambulisho cha wakala cha Halotel.", "badge-check", "Bei za Kitambulisho cha Wakala", 91), tokenCost: 5 },
  { ...paid("kitambulisho-wakala-yas", "KITAMBULISHO CHA WAKALA — YAS", "Pakua kitambulisho cha wakala cha Yas.", "badge-check", "Bei za Kitambulisho cha Wakala", 92), tokenCost: 5 },
  { ...paid("kitambulisho-wakala-vodacom", "KITAMBULISHO CHA WAKALA — VODACOM", "Pakua kitambulisho cha wakala cha Vodacom.", "badge-check", "Bei za Kitambulisho cha Wakala", 93), tokenCost: 5 },
  { ...paid("kitambulisho-wakala-mbeya", "KITAMBULISHO CHA WAKALA — MBEYA ONE", "Pakua kitambulisho cha wakala cha Mbeya One Company Limited.", "badge-check", "Bei za Kitambulisho cha Wakala", 94), tokenCost: 5 },
  paid("sme-airtel-mkataba", "SME AIRTEL MKATABA", "Jaza na hakiki mkataba wa SME wa Airtel.", "copy", "Huduma kuu", 10),
  {
    slug: "sme-vodacom",
    name: "SME VODACOM",
    description: "Omba kuunganishwa SME Vodacom na uchague Data Plan au Combo Plan.",
    category: "Huduma kuu",
    icon: "smartphone",
    isVisible: true,
    active: true,
    isLocked: false,
    isFree: true,
    tokenCost: 0,
    instructions: "Jaza taarifa sahihi. Namba ya Vodacom ya SME itatumwa kwa muundo unaoanza na 255.",
    buttonText: "Tuma ombi",
    adminWorkflow: true,
    statusOptions: ["PENDING", "PROCESSING", "APPROVED", "REJECTED"],
    order: 10,
    fields: [
      { fieldName: "fullName", label: "Majina kamili", type: "TEXT", required: true, order: 1 },
      { fieldName: "nidaNumber", label: "Namba ya NIDA", type: "NIDA", required: true, order: 2 },
      { fieldName: "smePhone", label: "Namba ya Vodacom ya SME (255...)", type: "PHONE", required: true, order: 3 },
      { fieldName: "alternativePhone", label: "Namba mbadala ya mawasiliano", type: "PHONE", required: true, order: 4 },
      { fieldName: "hasTin", label: "Je, una TIN?", type: "TEXT", required: true, order: 5 },
      { fieldName: "tinNumber", label: "Namba ya TIN (133-231-251)", type: "TEXT", required: false, order: 6 },
      { fieldName: "voucherAmount", label: "Kiasi cha vocha", type: "NUMBER", required: true, order: 7 },
      { fieldName: "planType", label: "Aina ya kifurushi", type: "TEXT", required: true, order: 8 },
      { fieldName: "selectedPlan", label: "Kifurushi kilichochaguliwa", type: "TEXT", required: true, order: 9 },
    ],
  },
  paid("leseni-udereva", "LESENI YA UDEREVA", "Msaada wa huduma za leseni ya udereva.", "car-front", "Huduma kuu", 11),
  free("utafutaji-nida", "UTAFUTAJI WA NIDA", "Tafuta taarifa za NIDA bila tokeni.", "search", "Huduma za bure", 11),
  free("qr-mitandao", "MSIMBO WA QR MITANDAO YOTE", "Tengeneza msimbo wa QR wa mitandao yako.", "qr-code", "Huduma za bure", 12),
  paid("brela", "BRELA", "Msaada wa huduma za BRELA.", "landmark", "Huduma kuu", 13),
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
  paid("yanga-africans", "YANGA SC WHATSAPP GROUP", "Jiunge na group la mashabiki wa Yanga kwa tokeni 6 au uthibitishe ushabiki kwa maswali.", "star", "HUDUMA ZINGINE", 25),
  paid("azam-tv", "AZAM TV", "Fungua huduma ya Azam TV.", "tv", "Zana za ziada", 26),
];


const accessFields = {
  airtel: [
    { fieldName: "network", label: "Mtandao", type: "TEXT", required: true, order: 0 },
    { fieldName: "phone", label: "Namba ya simu", type: "PHONE", required: true, order: 1 },
    { fieldName: "fullName", label: "Majina 2 au 3 kama yalivyo kwenye NIDA", type: "TEXT", required: true, order: 2 },
    { fieldName: "contact", label: "Namba ya mawasiliano Normal / WhatsApp", type: "PHONE", required: true, order: 3 },
  ] as ServiceFormField[],
  yas: [
    { fieldName: "network", label: "Mtandao", type: "TEXT", required: true, order: 0 },
    { fieldName: "phone", label: "Namba ya simu", type: "PHONE", required: true, order: 1 },
    { fieldName: "nidaNumber", label: "Namba ya NIDA", type: "NIDA", required: true, order: 2 },
    { fieldName: "passportPhoto", label: "Picha ya Passport Size", type: "IMAGE_UPLOAD", required: true, maxSizeMb: 5, accept: ["image/jpeg", "image/png", "image/webp"], order: 3 },
    { fieldName: "contact", label: "Namba ya mawasiliano Normal / WhatsApp", type: "PHONE", required: true, order: 4 },
  ] as ServiceFormField[],
  vodacom: [
    { fieldName: "network", label: "Mtandao", type: "TEXT", required: true, order: 0 },
    { fieldName: "phone", label: "Namba ya simu", type: "PHONE", required: true, order: 1 },
    { fieldName: "fullName", label: "Majina 3", type: "TEXT", required: true, order: 2 },
    { fieldName: "email", label: "Email", type: "TEXT", required: true, order: 3 },
    { fieldName: "contact", label: "Namba ya mawasiliano", type: "PHONE", required: true, order: 4 },
  ] as ServiceFormField[],
  halotel: [
    { fieldName: "network", label: "Mtandao", type: "TEXT", required: true, order: 0 },
  ] as ServiceFormField[],
};

const accessBackend = (slug: string, name: string, fields: ServiceFormField[], order: number): DefaultService => ({
  slug,
  name,
  description: `Ombi la access Lipa Namba — ${name}.`,
  icon: "wallet-cards",
  category: "Maombi ya Access Lipa Namba",
  tokenCost: 0,
  isVisible: true,
  active: true,
  isFree: true,
  isLocked: false,
  order,
  fields,
  instructions: "Ombi linatumwa kwa admin kwa ajili ya kukaguliwa na kufanyiwa kazi.",
  buttonText: "TUMA OMBI",
  statusOptions: ["PENDING", "PROCESSING", "APPROVED", "REJECTED"],
  adminWorkflow: true,
});

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

export const defaultAccessLipaServices = [
  accessBackend("access-lipa-airtel", "ACCESS LIPA NAMBA — AIRTEL", accessFields.airtel, 100),
  accessBackend("access-lipa-yas", "ACCESS LIPA NAMBA — YAS", accessFields.yas, 101),
  accessBackend("access-lipa-vodacom", "ACCESS LIPA NAMBA — VODACOM", accessFields.vodacom, 102),
  accessBackend("access-lipa-halotel", "ACCESS LIPA NAMBA — HALOTEL", accessFields.halotel, 103),
];

export const defaultLipaServices = [
  network("airtel", "Airtel", "AIRTEL — PATA LIPA NAMBA", 500, "Ndugu Agent, utajipatia sh 500 kwa Lipa Namba itakayotengenezwa hapa.", "Ifanye miamala jumla isiyopungua sh 10,000.", [commonPhone]),
  network("vodacom", "Vodacom", "VODACOM — PATA LIPA NAMBA", 5000, "Ndugu Agent, utajipatia TSh 5,000 kwa Lipa Namba itakayotengenezwa hapa baada ya kuthibitisha vigezo.", "Angalau miamala 3 ndani ya mwezi husika; miamala yote lazima iwe ya Vodacom pekee; jumla ya thamani isiwe chini ya TSh 70,000. Miamala ya mitandao mingine haitahesabika.", [...names, { fieldName: "businessName", label: "Majina ya Biashara", type: "TEXT", required: false, order: 3 }, { ...commonPhone, order: 4 }, { ...commonNida, order: 5 }, { ...commonTin, order: 6 }, identityImage]),
  network("yas-tigo", "Yas / Tigo", "YAS / TIGO — PATA LIPA NAMBA", 0, "Karibu ujipatie huduma ya Lipa Namba.", "", [commonPhone, commonNida, commonTin, { fieldName: "businessLicense", label: "Leseni ya Biashara", type: "TEXTAREA", required: false, order: 4 }]),
  network("halotel", "Halotel", "HALOTEL — PATA LIPA NAMBA", 0, "Karibu ujipatie huduma ya Lipa Namba.", "", [commonPhone, commonNida, commonTin, identityType, identityImage]),
];
