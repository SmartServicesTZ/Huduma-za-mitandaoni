export type TanzaniaKnowledgeEntry = {
  id: string;
  jurisdiction: "TZ";
  topic: string;
  matchAny: string[][];
  directAnswerSw: string;
  directAnswerEn: string;
  sourceTitle: string;
  sourceUrl: string;
  relatedSources?: Array<{ title: string; url: string; verifiedAt: string }>;
  verifiedAt: string;
  refreshAfterDays: number;
};

// Maintain this small, reviewed corpus in Git. Add an entry only after checking
// the operator/regulator source; update verifiedAt when re-checked. The Worker
// bundles it at deploy time, so matching uses no Firestore, search, or vector DB reads.
export const tanzaniaServiceKnowledge: TanzaniaKnowledgeEntry[] = [
  {
    id: "airtel-tz-airtel-money-wallet-balance",
    jurisdiction: "TZ",
    topic: "Airtel Money Tanzania wallet balance via USSD",
    matchAny: [
      ["airtel", "salio"],
      ["airtel", "balance"],
      ["airtel money", "balance"],
      ["airtel", "saldo"],
      ["airtel", "ussd"],
      ["airtel", "*150*60#"],
    ],
    directAnswerSw: "Kwa Airtel Money Tanzania, piga *150*60# kisha fuata menyu rasmi ya Airtel Money hadi sehemu ya akaunti/salio (My Account au Check Balance). Namba za chaguo zinaweza kubadilika, kwa hiyo fuata majina yanayoonekana kwenye menyu. Chanzo rasmi nilichokagua hakielezi SMS ya kutuma BAL/BALANCE kama njia ya kuangalia salio—siwezi kuthibitisha kuwa SMS hiyo inafanya kazi. Ukikwama, piga huduma kwa wateja wa Airtel kupitia 100. Kama unamaanisha salio la akiba la Timiza Akiba, hilo ni akaunti tofauti na lina menyu yake.",
    directAnswerEn: "For Airtel Money Tanzania, dial *150*60# and follow the official Airtel Money menu to the account/balance section (My Account or Check Balance). Menu option numbers can change, so follow the labels currently shown. The official source I checked does not document sending BAL/BALANCE by SMS as a balance-check method, so I cannot verify that SMS method. If it does not work, call Airtel customer care on 100. Timiza Akiba savings balance is a separate account with its own menu.",
    sourceTitle: "Airtel Tanzania — Lipa kwa Simu Mitandao Yote",
    sourceUrl: "https://www.airtel.co.tz/LIPA-KWA-SIMU-MITANDAO-YOTE",
    relatedSources: [
      { title: "Airtel Tanzania — Contact Us", url: "https://www.airtel.co.tz/contact-us", verifiedAt: "2026-10-28" },
      { title: "Airtel Tanzania — Timiza Akiba", url: "https://www.airtel.co.tz/timiza_akiba", verifiedAt: "2026-10-28" },
    ],
    verifiedAt: "2026-10-28",
    refreshAfterDays: 90,
  },
  {
    id: "airtel-tz-airtel-money-cash-out",
    jurisdiction: "TZ",
    topic: "Airtel Money Tanzania cash-out at a dealer",
    matchAny: [
      ["airtel", "kutoa pesa"],
      ["airtel", "kutoa hela"],
      ["airtel", "kutoa fedha"],
      ["airtel", "toa pesa"],
      ["airtel", "toa hela"],
      ["airtel", "withdraw"],
      ["airtel", "cash out"],
      ["airtel", "cash-out"],
      ["airtel", "cashout"],
      ["airtel", "wakala", "toa"],
      ["airtel", "agent", "withdraw"],
      ["airtel", "dealer", "withdraw"],
    ],
    directAnswerSw: "Kama unamaanisha kutoa pesa kwa wakala, masharti rasmi ya Airtel Money yanathibitisha cash-out kwa kubadilisha salio la akaunti kuwa fedha taslimu kutoka kwa dealer (wakala) wa Airtel Money. Sijapata chanzo rasmi kinachothibitisha namba ya USSD au hatua za menyu kwa akaunti ya kawaida ya mteja; hatua zilizochapishwa kwenye ukurasa wa Lipa Kwa Simu ni za akaunti ya merchant, si utaratibu wa kawaida wa cash-out. Kwa hiyo sitabuni code wala kutumia hatua za kutuma pesa. Thibitisha utaratibu wa sasa kwa 100 (Kiswahili) au 101 (English). Ushahidi huu unahusu kutoa kwa wakala tu; sijaweza kuthibitisha utaratibu wa ATM au benki.",
    directAnswerEn: "If you mean withdrawing through an agent, Airtel Money's official terms confirm cash-out as redeeming value in your account for cash from an Airtel Money dealer (agent). I could not verify an official USSD code or menu sequence for an ordinary customer's cash-out; the steps published on Airtel's Lipa Kwa Simu page are for merchant accounts, not the ordinary wallet cash-out flow. I will not invent a code or substitute send-money steps. Confirm the current process with Airtel on 101 (English) or 100 (Swahili). This evidence covers agent cash-out only; I could not verify an ATM or bank withdrawal procedure.",
    sourceTitle: "Airtel Tanzania — Airtel Money Customer Terms Of Use",
    sourceUrl: "https://www.airtel.co.tz/airtelMoneyTandC",
    relatedSources: [
      { title: "Airtel Tanzania — Contact Us", url: "https://www.airtel.co.tz/contact-us", verifiedAt: "2026-10-28" },
      { title: "Airtel Tanzania — Lipa Kwa Simu Mitandao Yote", url: "https://www.airtel.co.tz/LIPA-KWA-SIMU-MITANDAO-YOTE", verifiedAt: "2026-10-28" },
    ],
    verifiedAt: "2026-10-28",
    refreshAfterDays: 90,
  },
  {
    id: "airtel-tz-customer-care",
    jurisdiction: "TZ",
    topic: "Official Airtel Tanzania prepaid support contact",
    matchAny: [
      ["airtel", "msaada"],
      ["airtel", "customer care"],
      ["airtel", "huduma kwa wateja"],
      ["airtel", "100"],
    ],
    directAnswerSw: "Ukurasa rasmi wa Airtel Tanzania unaorodhesha 100 kwa wateja wa Prepaid. Tumia namba hiyo kuthibitisha menyu au utaratibu wa sasa. Airtel pia huweka taarifa za mawasiliano kwenye tovuti yake rasmi.",
    directAnswerEn: "Airtel Tanzania's official contact page lists 100 for Prepaid customers. Use that number to verify the current menu or procedure. Airtel also publishes contact details on its official website.",
    sourceTitle: "Airtel Tanzania — Contact Us",
    sourceUrl: "https://www.airtel.co.tz/contact-us",
    verifiedAt: "2026-10-28",
    refreshAfterDays: 90,
  },
];

const foreignCountryTerms = [
  "kenya", "uganda", "india", "nigeria", "zambia", "malawi", "rwanda", "burundi", "congo", "drc", "south africa",
];
const operatorTerms = ["airtel", "vodacom", "tigo", "yas", "halotel", "ttcl", "zantel", "mixx", "mpesa", "m-pesa", "tigopesa", "halo pesa", "halopesa", "tpesa", "t-pesa"];
const tanzaniaServiceTerms = ["nida", "brela", "tra", "nhif", "nssf", "crdb", "nmb", "tanesco", "selcom", "neec", "tanroads"];
const withdrawalTerms = ["withdraw", "cash out", "cash-out", "cashout", "kutoa pesa", "kutoa hela", "kutoa fedha", "toa pesa", "toa hela", "toa fedha"];
const sendMoneyTerms = ["send money", "sending money", "transfer money", "money transfer", "kutuma pesa", "kutuma hela", "kutuma fedha", "tuma pesa", "tuma hela", "tuma fedha"];
const changeableServiceTerms = [
  "ussd", "salio", "saldo", "balance", "sms", "ada", "gharama", "fee", "fees", "tariff", "kifurushi", "bundle", "menu", "huduma kwa wateja", "customer care", "utaratibu", "limit", "kikomo", "commission",
];

export function normalizeKnowledgeQuery(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9*+#\s-]/g, " ").replace(/\s+/g, " ").trim();
}

export function mentionsForeignCountry(query: string) {
  const normalized = normalizeKnowledgeQuery(query);
  return foreignCountryTerms.some((country) => normalized.includes(country));
}

export function isEnglishQuestion(query: string) {
  const normalized = normalizeKnowledgeQuery(query);
  const markers = normalized.match(/\b(how|what|where|can|does|is|are|please|help|tell|show|my|the|do|your|you|i|to)\b/g) ?? [];
  return markers.length >= 2 || /^(how|what|where|can|please|help|tell|show)\b/.test(normalized);
}

export function detectMoneyMovementIntent(query: string): "withdraw" | "send" | null {
  const normalized = normalizeKnowledgeQuery(query);
  const hasWithdrawalVerb = withdrawalTerms.some((term) => normalized.includes(normalizeKnowledgeQuery(term)));
  const mentionsAgent = ["wakala", "agent", "dealer"].some((term) => normalized.includes(term));
  const mentionsMoney = ["pesa", "hela", "fedha", "money", "cash"].some((term) => normalized.includes(term));
  if (hasWithdrawalVerb || mentionsAgent && mentionsMoney && /\b(toa|kutoa|withdraw|cashout|cash-out)\b/.test(normalized)) return "withdraw";
  const hasSendVerb = ["send", "sending", "transfer", "transferring", "kutuma", "tuma", "hamisha"].some((term) => normalized.includes(term));
  if (sendMoneyTerms.some((term) => normalized.includes(normalizeKnowledgeQuery(term))) || hasSendVerb && mentionsMoney) return "send";
  return null;
}

export function needsVerifiedTanzaniaSource(query: string) {
  const normalized = normalizeKnowledgeQuery(query);
  const mentionsOperator = operatorTerms.some((term) => normalized.includes(term));
  const mentionsTanzaniaService = tanzaniaServiceTerms.some((term) => normalized.includes(term));
  const asksForChangingFact = changeableServiceTerms.some((term) => normalized.includes(term));
  const asksForUssd = normalized.includes("ussd") || /\*[0-9*]{2,}#/.test(normalized);
  const asksForSmsBalance = normalized.includes("sms") && /\b(bal|balance|salio|saldo)\b/.test(normalized);
  return mentionsOperator || mentionsTanzaniaService || normalized.includes("tanzania") && asksForChangingFact || asksForUssd || asksForSmsBalance || detectMoneyMovementIntent(query) !== null;
}

function isFresh(entry: TanzaniaKnowledgeEntry, now: number) {
  const verifiedAt = Date.parse(`${entry.verifiedAt}T00:00:00.000Z`);
  if (!Number.isFinite(verifiedAt) || !Number.isInteger(entry.refreshAfterDays) || entry.refreshAfterDays < 1) return false;
  const age = now - verifiedAt;
  return age >= -24 * 60 * 60 * 1000 && age <= entry.refreshAfterDays * 24 * 60 * 60 * 1000;
}

export function findTanzaniaKnowledge(query: string, now = Date.now()) {
  if (mentionsForeignCountry(query)) return [];
  const normalized = normalizeKnowledgeQuery(query);
  return tanzaniaServiceKnowledge.filter((entry) => entry.jurisdiction === "TZ" && isFresh(entry, now)
    && (entry.id !== "airtel-tz-airtel-money-cash-out" || detectMoneyMovementIntent(query) === "withdraw")
    && entry.matchAny.some((group) => group.every((term) => normalized.includes(normalizeKnowledgeQuery(term)))));
}

export function findVerificationSources(query: string, now = Date.now()) {
  const normalized = normalizeKnowledgeQuery(query);
  if (mentionsForeignCountry(query) || !normalized.includes("airtel")) return [];
  return tanzaniaServiceKnowledge.filter((entry) => entry.id === "airtel-tz-customer-care" && isFresh(entry, now));
}

export function localInfoFallback(query: string) {
  const english = isEnglishQuestion(query);
  if (mentionsForeignCountry(query)) {
    return english
      ? "You are asking about another country, so I will not apply Tanzania's codes or procedures. I do not have a verified official source for that country's procedure here; please check the relevant provider's official website or support service."
      : "Unaulizia nchi nyingine, hivyo sitatumia misimbo au taratibu za Tanzania. Sina chanzo rasmi kilichothibitishwa cha nchi hiyo kwa swali hili; tafadhali thibitisha kupitia tovuti au huduma rasmi ya mtoa huduma wa nchi husika.";
  }
  return english
    ? "I do not have a current, verified official Tanzania source for that detail, so I will not invent a code, fee, phone number, or procedure. Please verify it on the provider's official website or through its customer support."
    : "Sina chanzo rasmi cha Tanzania kilichosasishwa na kuthibitishwa kwa taarifa hiyo, kwa hiyo sitabuni msimbo, ada, namba au utaratibu. Tafadhali thibitisha kwenye tovuti rasmi ya mtoa huduma au piga huduma yake kwa wateja.";
}

export function renderKnowledgeContext(entries: TanzaniaKnowledgeEntry[]) {
  return entries.map((entry) => [
    `Jurisdiction: Tanzania (${entry.jurisdiction})`,
    `Topic: ${entry.topic}`,
    `Reviewed: ${entry.verifiedAt}; refresh after ${entry.refreshAfterDays} days`,
    `Approved guidance (Swahili): ${entry.directAnswerSw}`,
    `Approved guidance (English): ${entry.directAnswerEn}`,
    `Source: ${entry.sourceTitle} — ${entry.sourceUrl}`,
  ].join("\n")).join("\n\n");
}
