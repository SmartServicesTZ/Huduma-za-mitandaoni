import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import { Download, Upload, RotateCcw, LoaderCircle } from "lucide-react";
import { triggerDownload } from "@/lib/downloadHistory";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { consumeFirebaseTokens, createAgentRecord, getServiceTokenConfig } from "@/lib/firebase";
import tanzaniaLocations from "@/data/tanzaniaLocations.json";

type Network = "Airtel" | "Vodacom" | "Yas" | "Halotel" | "Mbeya One Company Limited" | "Huduma za Mtandaoni";
const NETWORK_SERVICE_SLUG: Record<Network, string> = { Airtel: "kitambulisho-wakala-airtel", Halotel: "kitambulisho-wakala-halotel", Yas: "kitambulisho-wakala-yas", Vodacom: "kitambulisho-wakala-vodacom", "Mbeya One Company Limited": "kitambulisho-wakala-mbeya", "Huduma za Mtandaoni": "kitambulisho-wakala-mbeya" };
/** color/dark = rangi kuu na ya giza, hl = rangi ya mwangaza (highlight), accent = rangi nyepesi ya mandharinyuma ya chips. */
type NetworkCfg = { logo: string; color: string; dark: string; hl: string; accent: string; slogan: string; footer: string; pattern: string };

const NETWORKS: Record<Network, NetworkCfg> = {
  Airtel: { logo: `${import.meta.env.BASE_URL}airtel-logo.png`, color: "#e60000", dark: "#8f0010", hl: "#ff7a59", accent: "#ffecec", slogan: "AIRTEL TANZANIA", footer: "This card remains the property of Airtel Tanzania PLC.", pattern: "airtel" },
  Vodacom: { logo: `${import.meta.env.BASE_URL}vodacom-logo.png`, color: "#e60000", dark: "#7a0009", hl: "#ff8a8a", accent: "#ffecec", slogan: "VODACOM TANZANIA", footer: "This card remains the property of Vodacom Tanzania PLC.", pattern: "vodacom" },
  Yas: { logo: `${import.meta.env.BASE_URL}yas-logo.png`, color: "#1261A0", dark: "#071f45", hl: "#f4c400", accent: "#fff6c9", slogan: "YAS TANZANIA", footer: "This card is issued for authorized agent use only.", pattern: "yas" },
  Halotel: { logo: `${import.meta.env.BASE_URL}halotel-logo.png`, color: "#ff6900", dark: "#b53c00", hl: "#ffc15a", accent: "#fff1e3", slogan: "HALOTEL TANZANIA", footer: "This card remains the property of Halotel Tanzania.", pattern: "halotel" },
  "Mbeya One Company Limited": { logo: `${import.meta.env.BASE_URL}mbeya-one.png`, color: "#e30613", dark: "#6d0007", hl: "#ff5d6a", accent: "#ffecee", slogan: "MBEYA ONE COMPANY LIMITED", footer: "LIPA KWA SIMU AIRTEL • AUTHORIZED AGENT", pattern: "mbeya" },
  "Huduma za Mtandaoni": { logo: "", color: "#0e7490", dark: "#0b2f4a", hl: "#22c7a8", accent: "#e2f7f4", slogan: "HUDUMA ZA MTANDAONI", footer: "HUDUMA ZA MTANDAONI • AUTHORIZED AGENT", pattern: "huduma" },
};

const COMPANY_LABELS: Record<Network, string> = {
  Airtel: "AIRTEL TANZANIA",
  Vodacom: "VODACOM TANZANIA",
  Yas: "YAS TANZANIA",
  Halotel: "HALOTEL TANZANIA",
  "Mbeya One Company Limited": "MBEYA ONE COMPANY LIMITED",
  "Huduma za Mtandaoni": "HUDUMA ZA MTANDAONI",
};

const LAND = { w: 560, h: 350 };
const PORT = { w: 320, h: 520 };

type AgentData = { name: string; agentId: string; phone: string; type: string; region: string; district: string; area: string; issueDate: string };

const regionCodes: Record<string, string> = { "dar es salaam": "DSM", "dodoma": "DOM", "arusha": "ARU", "mwanza": "MWZ", "mbeya": "MBY", "morogoro": "MOR", "tanga": "TNG", "kilimanjaro": "KLM", "iringa": "IRG", "tabora": "TBR", "singida": "SNG", "kigoma": "KGM", "ruvuma": "RVM", "mtwara": "MTW", "lindi": "LND", "pwani": "PWN", "kagera": "KGR", "mara": "MRA", "shinyanga": "SHY", "geita": "GET", "simiyu": "SMY", "njombe": "NJB", "rukwa": "RKW", "katavi": "KTV", "songwe": "SGW", "manyara": "MNY", "zanzibar": "ZNZ" };
const networkCode: Record<Network, string> = { Airtel: "AIR", Vodacom: "VOD", Yas: "YAS", Halotel: "HAL", "Mbeya One Company Limited": "MBC", "Huduma za Mtandaoni": "HMT" };
const roleCode: Record<string, string> = { Freelancer: "FR", "Team Leader": "TL", Supervisor: "SV", "Authorized Agent": "AA" };
const agentIdTokenCost = (agentType: string) => agentType === "Freelancer" ? 5 : agentType === "Team Leader" || agentType === "Supervisor" || agentType === "Authorized Agent" ? 10 : 0;
const locationData = tanzaniaLocations as unknown as { regions: Record<string, { districts: Record<string, string[]> }> };
const tanzaniaRegions = Object.keys(locationData.regions).sort((a, b) => a.localeCompare(b));
const districtsForRegion = (selectedRegion: string) => Object.keys(locationData.regions[selectedRegion]?.districts ?? {}).sort((a, b) => a.localeCompare(b));
const regionCodeFor = (value: string) => { const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); return regionCodes[normalized] ?? normalized.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X"); };
const makeAgentId = (network: Network, region: string, _district: string, type: string) =>
  `T-${regionCodeFor(region)}-${networkCode[network]}-${roleCode[type] ?? "AG"}-000`;

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const expiry = (value: string) => { if (!value) return ""; const parts = value.split("-").map(Number); if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return ""; const d = new Date(parts[0], parts[1] - 1, parts[2]); d.setFullYear(d.getFullYear() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmt = (value: string) => { if (!value) return "—"; const parts = value.split("-"); return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value; };

/**
 * Kila neno linakuwa kipande chake (inline-block) chenye nafasi ya CSS kati yake.
 * Hii inazuia nafasi kupotea kwenye picha iliyopakuliwa (html2canvas hupoteza/hubana
 * herufi za nafasi kwenye maandishi madogo au yenye letter-spacing), mfano
 * "Airtel Tanzania" -> "Airteltanzania". Maneno marefu huvunjika mstari kwa usahihi.
 */
function Words({ text, fallback = "" }: { text?: string; fallback?: string }) {
  const words = ((text ?? "").trim() || fallback).split(/\s+/).filter(Boolean);
  return <>{words.map((word, index) => (
    <Fragment key={`${word}-${index}`}>
      <span style={{ display: "inline-block", marginRight: index === words.length - 1 ? 0 : "0.3em" }}>{word}</span>
      {index < words.length - 1 && <wbr />}
    </Fragment>
  ))}</>;
}

/** Ukubwa wa jina hupungua taratibu jina likiwa refu, ili lisibane wala kukatwa. */
const landscapeNameSize = (name: string) => { const n = name.trim().length; return n <= 18 ? 22 : n <= 24 ? 19 : n <= 32 ? 16.5 : n <= 44 ? 14 : 12; };
const portraitNameSize = (name: string) => { const n = name.trim().length; return n <= 14 ? 24 : n <= 18 ? 21 : n <= 22 ? 18 : n <= 30 ? 15.5 : n <= 40 ? 13.5 : 12; };

/** Mistari ya barcode ya mapambo; inatokana na Agent ID, kwa hiyo kila wakala ana muundo wake. */
function Barcode({ seed }: { seed: string }) {
  const text = (seed || "SMARTSERVICES").toUpperCase();
  const bars = Array.from({ length: 38 }, (_, i) => {
    const code = text.charCodeAt(i % text.length);
    return 1 + ((code * (i + 3) + i * 7) % 3);
  });
  return <div className="idx-barcode" aria-hidden="true">{bars.map((w, i) => <i key={i} style={{ width: w }} />)}</div>;
}

/** Picha mbadala ya mtu (silhouette) kabla wakala hajapakia picha yake. */
function PhotoPlaceholder() {
  return <div className="idx-ph" aria-hidden="true"><i className="idx-ph-head" /><i className="idx-ph-body" /><span><Words text="PICHA YA WAKALA" /></span></div>;
}

/** Preview hupunguzwa kwa transform (si media-query), kwa hiyo kitambulisho chenyewe hubaki saizi kamili. */
function ScaledCard({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => setScale(Math.max(0.3, Math.min(1, el.clientWidth / width)));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);
  return <div ref={outer} className="aid-scale" style={{ height: height * scale }}>
    <div style={{ position: "absolute", left: 0, top: 0, width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
  </div>;
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Imeshindikana kuandaa picha ya kitambulisho."));
  reader.onerror = () => reject(new Error("Imeshindikana kuandaa picha ya kitambulisho."));
  reader.readAsDataURL(blob);
});

async function toSameOriginDataUrl(src: string) {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return src;
  const resolved = new URL(src, document.baseURI);
  const response = await fetch(resolved.href, {
    mode: "cors",
    credentials: resolved.origin === window.location.origin ? "same-origin" : "omit",
    cache: "force-cache",
  });
  if (!response.ok) throw new Error("Imeshindikana kupakia nembo au picha ya kitambulisho. Hakikisha picha inafunguka kisha jaribu tena.");
  return blobToDataUrl(await response.blob());
}

/**
 * Picha hupigwa kutoka kwenye nakala (clone) iliyowekwa nje ya skrini kwa saizi kamili
 * (560x350 au 320x520), bila transform wala media-query za simu. Kwa hiyo picha ni ileile
 * kwenye simu na kompyuta, na ubora ni mara 3.
 */
async function exportCard(source: HTMLElement, size: { w: number; h: number }, filename: string) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${size.w}px;height:${size.h}px;pointer-events:none;z-index:-1;overflow:visible;`;
  const clone = source.cloneNode(true) as HTMLElement;
  // Watermark inadhibitiwa na hali ya malipo (paid); usiiondoe kwa lazima wakati wa export.
  clone.style.transform = "none";
  clone.style.margin = "0";
  clone.style.width = `${size.w}px`;
  clone.style.height = `${size.h}px`;
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    const images = Array.from(clone.querySelectorAll<HTMLImageElement>("img"));
    await Promise.all(images.map(async (image) => {
      const src = image.getAttribute("src");
      if (!src) return;
      image.setAttribute("src", await toSameOriginDataUrl(new URL(src, document.baseURI).href));
      image.removeAttribute("srcset");
      image.removeAttribute("crossorigin");
    }));
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(images.map((image) => typeof image.decode === "function" ? image.decode().catch(() => undefined) : Promise.resolve()));
    const canvas = await html2canvas(clone, {
      backgroundColor: null,
      scale: 3,
      useCORS: false,
      allowTaint: false,
      logging: false,
      imageTimeout: 15000,
      width: size.w,
      height: size.h,
      windowWidth: Math.max(size.w, document.documentElement.clientWidth),
    });
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Imeshindikana kuhifadhi picha ya kitambulisho.")), "image/png"));
    return blob;
  } finally {
    host.remove();
  }
}

export default function AgentIdPage() {
  const { firebaseUser } = useAuth();
  const [paid, setPaid] = useState(false);
  const [downloadedSides, setDownloadedSides] = useState<("front" | "back")[]>([]);
  const [tokenCost, setTokenCost] = useState<number | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [network, setNetwork] = useState<Network>("Airtel");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState(() => makeAgentId("Airtel", "", "", "Freelancer"));
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("Freelancer");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [area, setArea] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [photo, setPhoto] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedRecordId, setSavedRecordId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const landFrontRef = useRef<HTMLDivElement>(null);
  const landBackRef = useRef<HTMLDivElement>(null);
  const portFrontRef = useRef<HTMLDivElement>(null);
  const portBackRef = useRef<HTMLDivElement>(null);
  const cfg = NETWORKS[network];
  const data: AgentData = { name, agentId, phone, type, region, district, area, issueDate };

  const qrText = useMemo(() => JSON.stringify({ v: 1, id: agentId, n: name.trim(), p: phone.trim(), net: network, role: type, r: region, d: district, a: area, exp: expiry(issueDate) }), [network, name, agentId, phone, type, region, district, area, issueDate]);

  useEffect(() => {
    setPaid(false);
    setDownloadedSides([]);
    setRequestId(crypto.randomUUID());
  }, [network, orientation, name, phone, type, region, district, area, issueDate, photo]);

  useEffect(() => {
    let active = true;
    setTokenCost(null);
    void getServiceTokenConfig(NETWORK_SERVICE_SLUG[network]).then(() => {
      if (active) setTokenCost(agentIdTokenCost(type));
    }).catch((error) => {
      if (active) { setTokenCost(null); toast.error(error instanceof Error ? error.message : "Imeshindikana kusoma bei ya mtandao."); }
    });
    return () => { active = false; };
  }, [network, type]);

  useEffect(() => { setSavedRecordId(""); }, [network, name, phone, type, region, district, area, issueDate]);

  useEffect(() => {
    setAgentId(makeAgentId(network, region, district, type));
  }, [network, region, district, type]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrText, { width: 512, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => { if (!cancelled) setQr(url); })
      .catch(() => { if (!cancelled) setQr(""); });
    return () => { cancelled = true; };
  }, [qrText]);

  const reset = () => { setName(""); setPhone(""); setType("Freelancer"); setRegion(""); setDistrict(""); setArea(""); setIssueDate(today()); setPhoto(""); setNetwork("Airtel"); setAgentId(makeAgentId("Airtel", "", "", "Freelancer")); };

  const onPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const downloadCards = async (side: "front" | "back") => {
    if (downloadedSides.includes(side)) { toast.info("Upande huu wa kitambulisho tayari umepakuliwa. Badilisha taarifa au anza upya kwa kitambulisho kipya."); return; }
    const set = orientation === "landscape"
      ? { size: LAND, label: "mlalo", front: landFrontRef.current, back: landBackRef.current }
      : { size: PORT, label: "wima", front: portFrontRef.current, back: portBackRef.current };
    const jobs: { el: HTMLElement; size: { w: number; h: number }; filename: string }[] = [];
    if (side === "front" && set.front) jobs.push({ el: set.front, size: set.size, filename: `kitambulisho-${set.label}-mbele.png` });
    if (side === "back" && set.back) jobs.push({ el: set.back, size: set.size, filename: `kitambulisho-${set.label}-nyuma.png` });
    if (!jobs.length) { window.alert("Vitambulisho bado havijajiandaa. Subiri kidogo kisha jaribu tena."); return; }
    if (!firebaseUser?.uid) { window.alert("Ingia kwanza ili kulipia na kupakua kitambulisho."); return; }
    if (!photo.trim() || !name.trim() || !phone.trim() || !region.trim() || !district.trim() || !area.trim() || !issueDate.trim() || !type.trim()) {
      window.alert("Jaza taarifa zote na pakia picha ya wakala kabla ya kupakua kitambulisho.");
      return;
    }
    if (!locationData.regions[region] || !locationData.regions[region].districts[district]) {
      window.alert("Chagua mkoa na wilaya sahihi kutoka kwenye orodha.");
      return;
    }
    setBusy(true);
    try {
      if (!savedRecordId) {
        const saved = await createAgentRecord({
          userId: firebaseUser.uid, name: name.trim(), phone: phone.trim(), network, type,
          region: region.trim(), district: district.trim(), area: area.trim(), issueDate,
          expiryDate: expiry(issueDate)
        });
        setSavedRecordId(saved.id);
        setAgentId(saved.agentId);
        toast.success(`Taarifa zimehifadhiwa: ${saved.agentId}`);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }
      if (!paid) {
        const slug = NETWORK_SERVICE_SLUG[network];
        const config = await getServiceTokenConfig(slug);
        const roleCost = agentIdTokenCost(type);
        if (!Number.isSafeInteger(roleCost) || roleCost <= 0) throw new Error("Aina ya wakala haijatambuliwa. Chagua aina sahihi.");
        const accepted = window.confirm(`Unakaribia kupakua ${config.name} (${type}). Gharama ni tokeni ${roleCost}. Tokeni zitakatwa mara moja kwa kitambulisho hiki (mbele na nyuma). Endelea?`);
        if (!accepted) return;
        await consumeFirebaseTokens(firebaseUser.uid, { slug, name: config.name, tokenCost: roleCost, kind: "paid", tokenType: "huduma", agentType: type }, requestId);
        setTokenCost(roleCost);
        setPaid(true);
        toast.success(`Tokeni ${roleCost} zimekatwa kwa ${type}. Unaweza kupakua mbele na nyuma bila kukatwa tena.`);
      }
      // Tengeneza faili tofauti kwa kila upande, kisha pakua mbele na nyuma kila moja kivyake.
      const blobs = await Promise.all(jobs.map((job) => exportCard(job.el, job.size, job.filename)));
      for (let index = 0; index < blobs.length; index++) {
        triggerDownload(blobs[index], jobs[index].filename, "PNG");
        if (index < blobs.length - 1) await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
      }
      setDownloadedSides((current) => current.includes(side) ? current : [...current, side]);
      toast.success(`Download ya ${network} (${side === "front" ? "mbele" : "nyuma"}) imekamilika. Taarifa ya tokeni imehifadhiwa kwenye historia.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Imeshindikana kupakua kitambulisho.");
    } finally { setBusy(false); }
  };

  const orientLabel = orientation === "landscape" ? "Kulala" : "Kusimama";
  const formComplete = Boolean(photo.trim() && name.trim() && phone.trim() && region.trim() && district.trim() && area.trim() && issueDate.trim() && type.trim());

  return <main className="portal-main aid-page">
    <style>{AGENT_ID_CSS}</style>
    <div className="aid-head"><div><span className="overline">HUDUMA YA KITAMBULISHO</span><h1>KITAMBULISHO CHA WAKALA</h1><p>Chagua mtandao kwa kitambulisho cha usajili wa laini, au <b>MBEYA ONE</b> kwa kitambulisho cha <b>LIPA KWA SIMU AIRTEL</b>.</p></div></div>
    <div className="aid-layout">
      <section className="aid-form">
        <h3>Taarifa za Kitambulisho</h3>
        <div className="aid-choice" role="group" aria-label="Chagua aina ya kitambulisho">
          <button type="button" className={orientation === "landscape" ? "active" : ""} aria-pressed={orientation === "landscape"} onClick={() => setOrientation("landscape")}>KULALA (MLALO)</button>
          <button type="button" className={orientation === "portrait" ? "active" : ""} aria-pressed={orientation === "portrait"} onClick={() => setOrientation("portrait")}>KUSIMAMA (WIMA)</button>
        </div>
        <p className="aid-choice-note">Chagua mkao, kisha pakua mbele na nyuma kivyake. Kila kitambulisho cha mtandao kina gharama yake; makato hufanyika mara moja kwa kitambulisho chote (mbele na nyuma).</p>
        <div className="aid-choice-note" role="status">{tokenCost === null ? "Inasoma gharama ya tokeni..." : tokenCost === 0 ? "Gharama ya mtandao huu: BURE" : `Gharama ya ${network === "Mbeya One Company Limited" ? "MBEYA ONE" : network}: tokeni ${tokenCost}`}</div>
        <div className="aid-network">{(Object.keys(NETWORKS).filter((n) => n !== "Huduma za Mtandaoni") as Network[]).map((n) => <button type="button" key={n} className={network === n ? "active" : ""} onClick={() => setNetwork(n)}><span className="aid-network-logo" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:34,height:28,background:"#fff",borderRadius:6,padding:3,flexShrink:0}}>{NETWORKS[n].logo ? <img src={NETWORKS[n].logo} alt="" style={{display:"block",width:"auto",height:"auto",maxWidth:"100%",maxHeight:"100%",objectFit:"contain",flex:"0 0 auto"}} /> : <strong>HM</strong>}</span><span>{n === "Mbeya One Company Limited" ? "MBEYA ONE" : n}</span></button>)}</div>
        <label className="aid-field"><span>Picha ya Wakala</span><input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} /></label>
        <label className="aid-field"><span>Jina Kamili</span><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
        <label className="aid-field"><span>Agent ID</span><input value={agentId} readOnly aria-readonly="true" /></label>
        <label className="aid-field"><span>Simu</span><input inputMode="tel" value={phone} maxLength={16} onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="aid-field"><span>Agent Type</span><select value={type} onChange={(e) => setType(e.target.value)}><option>Freelancer</option><option>Team Leader</option><option>Supervisor</option><option>Authorized Agent</option></select></label>
        <label className="aid-field"><span>Mkoa</span><select value={region} onChange={(e) => { setRegion(e.target.value); setDistrict(""); }} required><option value="">Chagua mkoa</option>{tanzaniaRegions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="aid-field"><span>Wilaya</span><select value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!region} required><option value="">Chagua wilaya</option>{districtsForRegion(region).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="aid-field"><span>Kata / Eneo</span><input value={area} maxLength={30} onChange={(e) => setArea(e.target.value)} /></label>
        <label className="aid-field"><span>Tarehe ya Kutolewa</span><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
        <div className="aid-buttons"><button type="button" className="button button--green" onClick={() => fileRef.current?.click()}><Upload size={16} /> Picha</button><button type="button" className="button" onClick={reset}><RotateCcw size={16} /> Anza upya</button></div>
        <div className="aid-download-sections" aria-label="Pakua kitambulisho mbele au nyuma">
          <button type="button" className="aid-download-front" disabled={busy || !formComplete || tokenCost === null || downloadedSides.includes("front")} title={!formComplete ? "Jaza taarifa zote na pakia picha kwanza" : downloadedSides.includes("front") ? "Upande huu tayari umepakuliwa" : "Pakua upande wa mbele"} onClick={() => void downloadCards("front")}><Download size={17} /> <span><b>{busy ? "Inaandaa..." : "Pakua Mbele"}</b><small>{orientLabel} · PNG · {paid ? "IMESHALIPIWA" : tokenCost === null ? "Bei inasomwa" : `${tokenCost} TOKENI`}</small></span></button>
          <button type="button" className="aid-download-back" disabled={busy || !formComplete || tokenCost === null || downloadedSides.includes("back")} title={!formComplete ? "Jaza taarifa zote na pakia picha kwanza" : downloadedSides.includes("back") ? "Upande huu tayari umepakuliwa" : "Pakua upande wa nyuma"} onClick={() => void downloadCards("back")}><Download size={17} /> <span><b>{busy ? "Inaandaa..." : "Pakua Nyuma"}</b><small>{orientLabel} · PNG · {paid ? "IMESHALIPIWA" : tokenCost === null ? "Bei inasomwa" : `${tokenCost} TOKENI`}</small></span></button>
        </div>
        <p className="aid-note">Tarehe ya kuisha huwekwa moja kwa moja kuwa mwaka mmoja baada ya tarehe ya kutolewa.</p>
      </section>

      <section className="aid-stage">
        <div className="aid-intro"><span className="overline">MUONEKANO WA VITAMBULISHO VIWILI</span><p>Kushoto: kitambulisho cha kulala. Kulia: kitambulisho cha kusimama. Nembo na rangi hubadilika kulingana na mtandao uliochagua. Picha utakayopakua ina saizi kamili hata ukiwa kwenye simu.</p></div>
        <div className="aid-previews" style={{ position: "relative" }}>
          <div className={`aid-col ${orientation === "landscape" ? "is-active" : ""}`}>
            <p className="aid-side">01 · STYLE YA KULALA</p>
            <ScaledCard width={LAND.w} height={LAND.h}><LandscapeFront innerRef={landFrontRef} cfg={cfg} network={network} photo={photo} paid={paid} {...data} /></ScaledCard>
            <p className="aid-side aid-side--back">UPANDE WA NYUMA</p>
            <ScaledCard width={LAND.w} height={LAND.h}><LandscapeBack innerRef={landBackRef} cfg={cfg} network={network} qr={qr} paid={paid} {...data} /></ScaledCard>
          </div>
          <div className={`aid-col ${orientation === "portrait" ? "is-active" : ""}`}>
            <p className="aid-side">02 · STYLE YA KUSIMAMA</p>
            <ScaledCard width={PORT.w} height={PORT.h}><PortraitFront innerRef={portFrontRef} cfg={cfg} network={network} photo={photo} paid={paid} {...data} /></ScaledCard>
            <p className="aid-side aid-side--back">UPANDE WA NYUMA</p>
            <ScaledCard width={PORT.w} height={PORT.h}><PortraitBack innerRef={portBackRef} cfg={cfg} network={network} qr={qr} paid={paid} {...data} /></ScaledCard>
          </div>
        </div>
      </section>
    </div>
  </main>;
}

type FrontProps = AgentData & { cfg: NetworkCfg; network: Network; photo: string; paid: boolean; innerRef?: React.Ref<HTMLDivElement> };
type BackProps = AgentData & { cfg: NetworkCfg; network: Network; qr: string; paid: boolean; innerRef?: React.Ref<HTMLDivElement> };
const cardVars = (cfg: NetworkCfg) => ({ "--c": cfg.color, "--d": cfg.dark, "--h": cfg.hl, "--accent": cfg.accent }) as React.CSSProperties;

/** Nembo ndani ya kisanduku cheupe, ili ionekane vizuri juu ya rangi yoyote ya mtandao. */
function LogoChip({ cfg, network, className = "" }: { cfg: NetworkCfg; network: Network; className?: string }) {
  return <div className={`idx-logochip ${className}`} style={{ position: "relative", zIndex: 5, opacity: 1, background: "#fff", isolation: "isolate" }}>{cfg.logo ? <img src={cfg.logo} alt={network} /> : <strong>HM</strong>}</div>;
}

function CardWatermark({ paid }: { paid: boolean }) {
  if (paid) return null;
  return <div aria-label="Watermark ya kitambulisho ambacho hakijalipiwa" style={{ position: "absolute", inset: 0, zIndex: 10, display: "grid", placeItems: "center", overflow: "hidden", pointerEvents: "none" }}>
    <span style={{ transform: "rotate(-28deg)", border: "1px solid rgba(185,28,28,.7)", color: "rgba(185,28,28,.78)", background: "rgba(255,255,255,.25)", padding: "4px 7px", fontSize: "clamp(8px, 2.1vw, 13px)", fontWeight: 900, letterSpacing: ".4px", lineHeight: 1.3, textAlign: "center", maxWidth: "92%" }}>BAADA YA DOWNLOAD NA KUKATWA TOKENI, MAELEZO HAYA YATAPOTEA</span>
  </div>;
}

/* ============================ KULALA · MBELE ============================ */
function LandscapeFront({ innerRef, cfg, network, photo, name, agentId, phone, type, region, district, area, issueDate, paid }: FrontProps) {
  const displayName = name.trim().toUpperCase();
  const role = network === "Mbeya One Company Limited" ? "LIPA KWA SIMU AIRTEL" : cfg.pattern === "huduma" ? "AUTHORIZED AGENT ID" : "SIM REGISTRATION AGENT";
  return <div ref={innerRef} className={`idl idl-f net-${cfg.pattern}`} style={{ ...cardVars(cfg), position: "relative" }}>
    {network === "Mbeya One Company Limited" && cfg.logo && <img className="idl-bg-logo" src={cfg.logo} alt="" aria-hidden="true" />}
    <div className="idl-side">
      <LogoChip cfg={cfg} network={network} />
      <div className="idl-photo">{photo ? <img src={photo} alt="Wakala" /> : <PhotoPlaceholder />}</div>
      <div className="idl-idtag"><small><Words text="AGENT ID" /></small><b><Words text={agentId} fallback="—" /></b></div>
    </div>
    <div className="idl-main">
      {cfg.logo && <img className="idl-wm" src={cfg.logo} alt="" aria-hidden="true" />}
      <div className="idl-kicker"><span><Words text="HUDUMA ZA MTANDAONI" /></span><em>✓ <Words text="VERIFIED AGENT" /></em></div>
      <div className="idl-role"><Words text={role} /></div>
      <div className="idl-name" style={{ fontSize: landscapeNameSize(displayName) }}><Words text={displayName} fallback="—" /></div>
      <div className="idl-rule-line" />
      <div className="idl-grid">
        <div><small>PHONE</small><b><Words text={phone} fallback="—" /></b></div>
        <div><small>TYPE</small><b><Words text={type} fallback="—" /></b></div>
        <div><small>REGION</small><b><Words text={region} fallback="—" /></b></div>
        <div><small>AREA</small><b><Words text={`${district || "—"} / ${area || "—"}`} /></b></div>
        <div className="wide"><small>COMPANY</small><b><Words text={COMPANY_LABELS[network]} /></b></div>
      </div>
      <div className="idl-bar">
        <div className="idl-valid"><small><Words text="VALID UNTIL" /></small><b><Words text={fmt(expiry(issueDate))} /></b></div>
        <Barcode seed={agentId} />
        <div className="idl-sign"><i /><small><Words text="AUTHORIZED OFFICER" /></small></div>
      </div>
    </div>
    <div className="idl-strip" />
  </div>;
}

/* ============================ KULALA · NYUMA ============================ */
function LandscapeBack({ innerRef, cfg, network, qr, name, agentId, phone, region, district, area, issueDate, paid }: BackProps) {
  const title = network === "Mbeya One Company Limited" ? "KITAMBULISHO CHA LIPA KWA SIMU" : cfg.pattern === "huduma" ? "KITAMBULISHO CHA HUDUMA ZA MTANDAONI" : "KITAMBULISHO CHA WAKALA";
  const footer = network === "Mbeya One Company Limited" ? "MBEYA ONE COMPANY LIMITED • LIPA KWA SIMU AIRTEL • AUTHORIZED AGENT" : cfg.footer;
  return <div ref={innerRef} className={`idl idl-b net-${cfg.pattern}`} style={{ ...cardVars(cfg), position: "relative" }}>
    <CardWatermark paid={paid} />
    {network === "Mbeya One Company Limited" && cfg.logo && <img className="idl-bg-logo" src={cfg.logo} alt="" aria-hidden="true" />}
    <div className="idl-head">
      <div><div className="idl-brand"><Words text={`HUDUMA ZA MTANDAONI • ${cfg.slogan}`} /></div><div className="idl-title"><Words text={title} /></div></div>
      <LogoChip cfg={cfg} network={network} />
    </div>
    <div className="idl-bbody">
      {cfg.logo && <img className="idl-wm" src={cfg.logo} alt="" aria-hidden="true" />}
      <div className="idl-rules">
        <h4><Words text="MUHIMU KWA MTUMIAJI WA KITAMBULISHO" /></h4>
        <div className="idl-rl"><i>✓</i><span>Kitambulisho hiki ni mali ya kampuni na kinatumika na wakala aliyeidhinishwa pekee.</span></div>
        <div className="idl-rl"><i>✓</i><span>Wakala anatakiwa kufuata sheria, taratibu na masharti ya mtandao husika.</span></div>
        <div className="idl-rl"><i>!</i><span>Hairuhusiwi kukopesha kitambulisho au kutumia taarifa za mteja kinyume cha sheria.</span></div>
        <div className="idl-rl"><i>i</i><span>Kitambulisho kikionekana kimepotea au kuharibika, wasiliana na uongozi wa kampuni.</span></div>
      </div>
      <div className="idl-qr-wrap">
        <div className="idl-qr-tile">{qr ? <img src={qr} alt="QR Code" /> : <div className="idl-qr-empty" />}</div>
        <div className="idl-qr-label"><Words text="SCAN TO VERIFY" /></div>
      </div>
    </div>
    <div className="idl-info">
      <div className="c2"><small><Words text="JINA LA WAKALA" /></small><b><Words text={name.trim().toUpperCase()} fallback="—" /></b></div>
      <div><small><Words text="AGENT CODE" /></small><b><Words text={agentId} fallback="—" /></b></div>
      <div><small><Words text="NAMBA YA SIMU" /></small><b><Words text={phone} fallback="—" /></b></div>
      <div><small>MKOA</small><b><Words text={region} fallback="—" /></b></div>
      <div><small><Words text="WILAYA / ENEO" /></small><b><Words text={`${district || "—"} / ${area || "—"}`} /></b></div>
      <div className="c2"><small><Words text="ISSUE / EXPIRY" /></small><b><Words text={`${fmt(issueDate)} / ${fmt(expiry(issueDate))}`} /></b></div>
    </div>
    <div className="idl-foot"><Words text={footer} /></div>
  </div>;
}

/* ============================ KUSIMAMA · MBELE ============================ */
function PortraitFront({ innerRef, cfg, network, photo, name, agentId, phone, type, region, district, area, issueDate, paid }: FrontProps) {
  const displayName = name.trim().toUpperCase();
  return <div ref={innerRef} className={`idp idp-f net-${cfg.pattern}`} style={{ ...cardVars(cfg), position: "relative" }}>
    {cfg.logo && <img className="idp-bg-logo" src={cfg.logo} alt="" aria-hidden="true" />}
    <div className="idp-hero">
      <div className="idp-ring" />
      <div className="idp-top">
        <div className="idp-brand"><Words text="HUDUMA ZA MTANDAONI" /></div>
        <LogoChip cfg={cfg} network={network} />
      </div>
      <div className="idp-title"><Words text="KITAMBULISHO CHA WAKALA" /></div>
      <div className="idp-sub"><Words text="AUTHORIZED AGENT CARD" /></div>
      <div className="idp-curve" />
    </div>
    <div className="idp-photo">{photo ? <img src={photo} alt="Wakala" /> : <PhotoPlaceholder />}</div>
    <div className="idp-name" style={{ fontSize: portraitNameSize(displayName) }}><div><Words text={displayName} /></div></div>
    <div className="idp-pillrow"><span className="idp-pill">✓ <Words text={(type || "AGENT").toUpperCase()} /></span></div>
    <div className="idp-grid">
      <div><small><Words text="AGENT ID" /></small><b><Words text={agentId} fallback="—" /></b></div>
      <div><small>SIMU</small><b><Words text={phone} fallback="—" /></b></div>
      <div><small>MKOA</small><b><Words text={region} fallback="—" /></b></div>
      <div><small><Words text="WILAYA / ENEO" /></small><b><Words text={`${district || "—"} / ${area || "—"}`} /></b></div>
      <div className="wide"><small>MTANDAO</small><b><Words text={COMPANY_LABELS[network]} /></b></div>
    </div>
    <div className="idp-foot">
      <div className="idp-dates">
        <div><small>ISSUED</small><b><Words text={fmt(issueDate)} /></b></div>
        <div><small>EXPIRES</small><b><Words text={fmt(expiry(issueDate))} /></b></div>
      </div>
      <Barcode seed={agentId} />
    </div>
    <div className="idp-strip" />
  </div>;
}

/* ============================ KUSIMAMA · NYUMA ============================ */
function PortraitBack({ innerRef, cfg, network, qr, name, agentId, phone, region, district, area, paid }: BackProps) {
  return <div ref={innerRef} className={`idp idp-b net-${cfg.pattern}`} style={{ ...cardVars(cfg), position: "relative" }}>
    <CardWatermark paid={paid} />
    {cfg.logo && <img className="idp-bg-logo" src={cfg.logo} alt="" aria-hidden="true" />}
    <div className="idp-hero idp-hero--sm">
      <div className="idp-ring" />
      <div className="idp-top">
        <div className="idp-brand"><Words text="HUDUMA ZA MTANDAONI" /></div>
        <LogoChip cfg={cfg} network={network} />
      </div>
      <div className="idp-title"><Words text="UTHIBITISHO WA WAKALA" /></div>
      <div className="idp-sub"><Words text={`${COMPANY_LABELS[network]} NETWORK`} /></div>
      <div className="idp-curve" />
    </div>
    <div className="idp-qr-tile">{qr ? <img src={qr} alt="QR Code" /> : <div className="idp-qr-empty" />}</div>
    <div className="idp-qr-label"><Words text="SCAN TO VERIFY" /></div>
    <div className="idp-back">
      <h3><Words text="MASHARTI YA MATUMIZI" /></h3>
      <div className="idp-rl"><i>1</i><span>Kitambulisho hiki ni cha matumizi ya wakala aliyeidhinishwa pekee.</span></div>
      <div className="idp-rl"><i>2</i><span>Wakala anatakiwa kufuata sheria na taratibu za mtandao husika.</span></div>
      <div className="idp-rl"><i>3</i><span>Usikopeshe kitambulisho hiki wala kutumia taarifa za mteja kinyume cha sheria.</span></div>
      <div className="idp-verify"><b><Words text={(name.trim() || "JINA LA WAKALA").toUpperCase()} /></b><span><Words text={`${agentId || "—"} · ${phone || "—"}`} /></span><span><Words text={`${region || "—"} · ${district || "—"} / ${area || "—"}`} /></span></div>
    </div>
    <div className="idp-foot idp-foot--back"><span><Words text="HUDUMA ZA MTANDAONI" /></span><span><Words text={COMPANY_LABELS[network]} /></span></div>
    <div className="idp-strip" />
  </div>;
}

/* NB: majina ya class za vitambulisho (idl-*, idp-*, idx-*) yameepuka maneno "card"/"panel"
   kwa makusudi, kwa sababu index.css ina kanuni za [class*="card"] / [class*="panel"]
   (rangi ya mpaka na kivuli) ambazo zingeingia kwenye picha iliyopakuliwa.
   Pia nimeepuka CSS ambayo html2canvas haiungi mkono (backdrop-filter, mix-blend-mode, filter, clip-path). */
const AGENT_ID_CSS = `
.aid-page{max-width:1500px;margin:0 auto}
.aid-head{margin-bottom:22px}
.aid-head h1{margin:4px 0 6px;font-size:clamp(25px,4vw,38px);color:#172443;letter-spacing:-.03em}
.aid-head p{margin:0;color:#64748b;font-size:13px;line-height:1.6}
.aid-layout{display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);gap:22px;align-items:start}
.aid-form{position:sticky;top:15px;padding:18px;border:1px solid #e3eaf2;border-radius:18px;background:#fff;color:#172443;box-shadow:0 12px 30px rgba(23,36,67,.07)}
.aid-form h3{margin:0 0 14px;font-size:16px}
.aid-field{display:grid;gap:6px;margin-bottom:11px}
.aid-field span{font-size:12px;font-weight:700;color:#334155}
.aid-field input,.aid-field select{width:100%;box-sizing:border-box;border-radius:10px;padding:10px 11px;background:#f8fbff;color:#172443;font-size:13px}
.aid-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.aid-download-sections{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}.aid-download-sections button{display:flex;align-items:center;justify-content:center;gap:9px;min-height:64px;padding:10px;border:0;border-radius:12px;color:#fff;font-weight:800;cursor:pointer;box-shadow:0 6px 14px rgba(15,23,42,.12)}.aid-download-sections button:disabled{opacity:.65;cursor:wait}.aid-download-sections span{display:flex;flex-direction:column;align-items:flex-start;gap:3px}.aid-download-sections b{font-size:12px}.aid-download-sections small{font-size:10px;opacity:.85}.aid-download-front{background:linear-gradient(135deg,#087f5b,#16a36a)}.aid-download-back{background:linear-gradient(135deg,#5b35b5,#8b5cf6)}
.aid-choice{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px}
.aid-choice button{border:1px solid #d6e0ec;border-radius:10px;background:#f4f7fb;color:#334155;padding:10px 7px;font-size:10px;font-weight:900;cursor:pointer;transition:background .18s,color .18s,border-color .18s}
.aid-choice button.active{background:#18b969;border-color:#18b969;color:#fff}
.aid-choice-note{margin:0 0 12px;font-size:11px;line-height:1.5;color:#64748b}
.aid-network{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:14px}
.aid-network button{border:1px solid #d6e0ec;border-radius:10px;background:#f4f7fb;color:#334155;padding:9px 3px;font-size:10px;font-weight:800;cursor:pointer;transition:background .18s,color .18s}
.aid-network button.active{background:#172443;border-color:#172443;color:#fff}
.aid-note{margin:14px 0 0;font-size:11px;line-height:1.5;color:#64748b}
.aid-spin{animation:aid-spin 1s linear infinite}@keyframes aid-spin{to{transform:rotate(360deg)}}
.aid-intro{margin:0 0 14px;padding:13px 15px;border:1px solid #dbe5f1;border-radius:14px;background:linear-gradient(120deg,#eef6ff,#f4f0ff)}
.aid-intro p{margin:5px 0 0;font-size:12px;line-height:1.55;color:#52657a}
.aid-previews{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(0,1fr);gap:18px;align-items:start}
.aid-col{min-width:0;padding:14px;border:1px solid #e3eaf2;border-radius:18px;background:linear-gradient(160deg,#f6f8fc,#eef2f9);box-shadow:0 10px 26px rgba(23,36,67,.06);transition:border-color .2s,box-shadow .2s}
.aid-col.is-active{border-color:#18b969;box-shadow:0 12px 30px rgba(24,185,105,.16)}
.aid-side{margin:0 0 8px;font-size:10.5px;font-weight:900;letter-spacing:.12em;color:#64748b}
.aid-side--back{margin-top:20px}
.aid-scale{position:relative;width:100%}

/* ===== Vipande vya pamoja ===== */
.idx-logochip{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:118px;height:42px;padding:6px 12px;border-radius:12px;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.16)}
.idx-logochip img{display:block;width:auto!important;height:auto!important;max-width:100%;max-height:100%;object-fit:contain;aspect-ratio:auto;flex:0 0 auto;filter:contrast(1.2) saturate(1.35)}
.idx-logochip strong{font-size:16px;font-weight:900;color:var(--c);letter-spacing:-.04em}
.idx-ph{position:relative;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;box-sizing:border-box;background:linear-gradient(170deg,#eef2f7,#d9e1ec);overflow:hidden}
.idx-ph-head{display:block;width:34%;height:0;padding-bottom:34%;border-radius:50%;background:#b6c2d2;margin-bottom:5px}
.idx-ph-body{display:block;width:70%;height:30%;border-radius:999px 999px 0 0;background:#b6c2d2}
.idx-ph span{position:absolute;left:0;right:0;top:8px;text-align:center;font-size:7px;font-weight:800;letter-spacing:.08em;color:#7b8aa0}
.idx-barcode{display:flex;align-items:stretch;gap:1.5px;height:26px}
.idx-barcode i{display:block;background:#0f172a;border-radius:.5px}

/* ===== KITAMBULISHO CHA KULALA (560x350) ===== */
.idl{width:560px;height:350px;box-sizing:border-box;position:relative;overflow:hidden;border-radius:22px;background:#fff;color:#0f172a;font-family:Arial,Helvetica,sans-serif;box-shadow:0 18px 40px rgba(15,23,42,.22)}
.idl small{display:block;font-size:7.5px;font-weight:800;letter-spacing:.09em;color:#94a3b8;text-transform:uppercase}
.idl-wm{position:absolute;right:-28px;bottom:34px;width:190px;height:190px;object-fit:contain;opacity:.32;filter:contrast(1.3) saturate(1.45)}
.idl-bg-logo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.32;z-index:0;pointer-events:none}
.idl>.idl-side,.idl>.idl-main,.idl>.idl-head,.idl>.idl-bbody,.idl>.idl-info,.idl>.idl-foot{z-index:1}
.idl-strip{position:absolute;left:0;right:0;bottom:0;height:6px;background:linear-gradient(90deg,var(--d),var(--c) 55%,var(--h))}

/* mbele: safu mbili */
.idl-f{display:flex;flex-direction:row}
.idl-side{position:relative;flex:0 0 178px;display:flex;flex-direction:column;align-items:center;box-sizing:border-box;padding:18px 0 20px;overflow:hidden;background:linear-gradient(165deg,var(--c) 0%,var(--d) 100%)}
.idl-side::before{content:"";position:absolute;right:-60px;top:-60px;width:170px;height:170px;border-radius:50%;background:rgba(255,255,255,.12)}
.idl-side::after{content:"";position:absolute;left:-90px;bottom:-100px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.08)}
.idl-side>*{position:relative;z-index:1}
.idl-side .idx-logochip{width:128px;height:42px}
.idl-photo{width:120px;height:146px;box-sizing:border-box;margin-top:16px;overflow:hidden;border:4px solid #fff;border-radius:18px;background:#e9eef4;box-shadow:0 10px 24px rgba(0,0,0,.28)}
.idl-photo img{display:block;width:100%;height:100%;object-fit:cover}
.idl-idtag{margin-top:13px;min-width:112px;box-sizing:border-box;padding:6px 14px 7px;text-align:center;border:1px solid rgba(255,255,255,.38);border-radius:12px;background:rgba(255,255,255,.16)}
.idl-idtag small{color:rgba(255,255,255,.78);font-size:7px}
.idl-idtag b{display:block;margin-top:1px;color:#fff;font-size:15px;font-weight:900;letter-spacing:.08em}
.idl-main{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;box-sizing:border-box;padding:18px 24px 6px 24px;overflow:hidden;background:linear-gradient(135deg,#fff 0%,#f6f9fd 100%)}
.idl-main>*:not(.idl-wm){position:relative;z-index:1}
.idl-kicker{display:flex;align-items:center;justify-content:space-between;gap:8px}
.idl-kicker span{font-size:8px;font-weight:900;letter-spacing:.16em;color:var(--c)}
.idl-kicker em{font-style:normal;font-size:7.5px;font-weight:900;letter-spacing:.06em;color:var(--d);background:var(--accent);padding:4px 9px;border-radius:999px;white-space:nowrap}
.idl-role{margin-top:5px;font-size:9.5px;font-weight:800;letter-spacing:.12em;color:#64748b}
.idl-name{margin-top:7px;font-weight:900;line-height:1.14;color:#0f172a;letter-spacing:-.01em}
.idl-rule-line{width:46px;height:4px;margin:11px 0 14px;border-radius:2px;background:linear-gradient(90deg,var(--c),var(--h))}
.idl-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px 14px}
.idl-grid>div{min-width:0}
.idl-grid .wide{grid-column:1/-1}
.idl-grid b{display:block;margin-top:3px;font-size:13px;font-weight:800;line-height:1.25;color:#0f172a;overflow-wrap:anywhere}
.idl-bar{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:8px 0 12px;border-top:1px dashed #d5deea}
.idl-valid b{display:block;margin-top:2px;font-size:13px;font-weight:900;color:var(--d)}
.idl-sign{width:128px;text-align:center}
.idl-bar .idx-barcode{height:24px;opacity:.85}
.idl-sign i{display:block;height:1px;margin-bottom:4px;background:#94a3b8}

/* nyuma: safu moja */
.idl-b{display:flex;flex-direction:column}
.idl-head{position:relative;flex:0 0 66px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box;padding:0 22px;overflow:hidden;color:#fff;background:linear-gradient(120deg,var(--d) 0%,var(--c) 100%)}
.idl-head::after{content:"";position:absolute;right:120px;top:-70px;width:170px;height:170px;border-radius:50%;background:rgba(255,255,255,.1)}
.idl-head>*{position:relative;z-index:1}
.idl-brand{font-size:8px;font-weight:800;letter-spacing:.14em;line-height:1.35;opacity:.9}
.idl-title{margin-top:4px;font-size:15px;font-weight:900;line-height:1.15}
.idl-bbody{position:relative;flex:1;min-height:0;display:flex;gap:16px;box-sizing:border-box;padding:14px 22px 6px;overflow:hidden}
.idl-bbody .idl-wm{right:130px;bottom:-30px;opacity:.40;filter:contrast(1.35) saturate(1.4)}
/* Nembo kubwa zikae katikati ya sehemu kuu ya mbele kwa Airtel, Vodacom, Halotel na Yas. */
.net-airtel .idl-main>.idl-wm,.net-vodacom .idl-main>.idl-wm,.net-halotel .idl-main>.idl-wm,.net-yas .idl-main>.idl-wm{left:50%;right:auto;top:50%;bottom:auto;transform:translate(-50%,-50%);opacity:.32;filter:contrast(1.22) saturate(1.3)}
/* Mbeya One: nembo kubwa katikati, kama background ya kitambulisho chote. */
.net-mbeya .idl-wm{opacity:.32;filter:contrast(1.25) saturate(1.4)}
.net-mbeya .idl-bg-logo{object-fit:cover;object-position:center;opacity:.32;transform:scale(1.04);filter:contrast(1.18) saturate(1.3)}
/* Nembo kubwa za kampuni kwenye vitambulisho vya kusimama, mbele na nyuma. */
/* Mtindo mpya wa vitambulisho vya kusimama: nembo ya kampuni kama watermark ya kadi nzima. */
.idp-bg-logo{position:absolute;z-index:1;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;opacity:.32;filter:contrast(1.2) saturate(1.35);pointer-events:none}
.idp>*:not(.idp-bg-logo):not(.idp-strip){position:relative;z-index:2}
.idp-hero{flex-basis:154px;padding-top:16px;background:linear-gradient(145deg,var(--d) 0%,var(--c) 58%,var(--h) 100%)}
.idp-hero--sm{flex-basis:142px}
.idp-ring{right:-35px;top:14px;width:128px;height:128px;border-width:13px;border-color:rgba(255,255,255,.16)}
.idp-photo{width:116px;height:130px;margin-top:-48px;border-radius:18px;border-width:4px}
.idp-name{margin-top:6px;min-height:38px;padding:0 14px}
.idp-grid{margin:8px 16px 0;gap:6px}
.idp-grid>div{background:rgba(248,250,252,.94);border:1px solid rgba(148,163,184,.18);border-left:3px solid var(--c);border-radius:9px}
.idp-qr-tile{width:112px;height:112px;margin-top:-24px;border-radius:16px}
.idp-back{padding:9px 18px 9px}
.idp-verify{background:rgba(255,255,255,.9);box-shadow:0 5px 16px rgba(15,23,42,.08)}
/* Sogeza watermark za Airtel, Vodacom na Halotel ndani ya kadi ili nembo zisionekane zimekatika. */
.net-airtel .idl-main>.idl-wm,.net-vodacom .idl-main>.idl-wm,.net-halotel .idl-main>.idl-wm{right:0}
.net-airtel .idl-bbody .idl-wm,.net-vodacom .idl-bbody .idl-wm,.net-halotel .idl-bbody .idl-wm{right:150px}
.idl-rules{position:relative;flex:1;min-width:0}
.idl-rules h4{margin:2px 0 10px;font-size:10px;font-weight:900;letter-spacing:.04em;color:var(--d)}
.idl-rl{display:flex;align-items:flex-start;gap:8px;margin:0 0 9px;font-size:9.4px;line-height:1.38;color:#475569}
.idl-rl i{flex:0 0 17px;width:17px;height:17px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--c);color:#fff;font-style:normal;font-size:8px;font-weight:900}
.idl-qr-wrap{position:relative;flex:0 0 132px;text-align:center}
.idl-qr-tile{width:126px;height:126px;box-sizing:border-box;margin:0 auto;padding:7px;border-radius:16px;background:#fff;box-shadow:0 6px 18px rgba(15,23,42,.18);border:1px solid #e5eaf2}
.idl-qr-tile img,.idl-qr-empty{display:block;width:100%;height:100%;object-fit:contain;background:#fff}
.idl-qr-label{margin-top:6px;font-size:8px;font-weight:900;letter-spacing:.1em;color:var(--d)}
.idl-info{margin:0 22px 9px;padding:8px 12px;display:grid;grid-template-columns:1.1fr 1fr 1fr 1fr;gap:6px 12px;border-radius:12px;background:var(--accent)}
.idl-info>div{min-width:0}
.idl-info .c2{grid-column:span 2}
.idl-info small{font-size:6.8px;color:#6b7a90}
.idl-info b{display:block;margin-top:1px;font-size:9px;font-weight:800;line-height:1.25;color:#0f172a;overflow-wrap:anywhere}
.idl-foot{flex:0 0 26px;display:flex;align-items:center;justify-content:center;padding:0 14px;background:linear-gradient(90deg,var(--d),var(--c) 60%,var(--d));color:#fff;font-size:7.5px;font-weight:800;line-height:1.2;letter-spacing:.04em;text-align:center}

/* ===== KITAMBULISHO CHA KUSIMAMA (320x520) ===== */
.idp{width:320px;height:520px;box-sizing:border-box;position:relative;overflow:hidden;display:flex;flex-direction:column;border:1px solid rgba(148,163,184,.35);border-radius:24px;background:linear-gradient(160deg,#fff 0%,#f4f7fb 58%,#fff 100%);color:#0f172a;font-family:Arial,Helvetica,sans-serif;box-shadow:0 20px 44px rgba(15,23,42,.24)}
.idp small{display:block;font-size:7px;font-weight:800;letter-spacing:.09em;color:#94a3b8;text-transform:uppercase}
.idp-strip{position:absolute;left:0;right:0;bottom:0;height:6px;background:linear-gradient(90deg,var(--d),var(--c) 55%,var(--h))}
.idp-hero{position:relative;flex:0 0 146px;box-sizing:border-box;padding:15px 16px 0;overflow:hidden;color:#fff;background:linear-gradient(135deg,var(--d) 0%,var(--c) 62%,var(--h) 100%);border-bottom:5px solid var(--h)}
.idp-hero--sm{flex-basis:146px}
.idp-hero::before{content:"";position:absolute;left:-70px;top:-80px;width:190px;height:190px;border-radius:50%;background:rgba(255,255,255,.1)}
.idp-ring{position:absolute;right:-46px;top:30px;width:150px;height:150px;box-sizing:border-box;border-radius:50%;border:18px solid rgba(255,255,255,.1)}
.idp-hero>*:not(.idp-ring):not(.idp-curve){position:relative;z-index:2}
.idp-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.idp-brand{font-size:8.5px;font-weight:900;letter-spacing:.14em;line-height:1.3;max-width:110px}
.idp-top .idx-logochip{width:104px;height:38px}
.idp-title{margin-top:20px;font-size:19px;font-weight:900;line-height:1.12}
.idp-hero--sm .idp-title{margin-top:18px;font-size:17px}
.idp-sub{margin-top:6px;font-size:8px;font-weight:700;letter-spacing:.14em;opacity:.88}
.idp-curve{position:absolute;left:-20px;top:100%;margin-top:-22px;width:360px;height:360px;border-radius:50%;background:#fff;z-index:1}

/* mbele */
.idp-photo{position:relative;z-index:3;flex:0 0 auto;width:108px;height:120px;box-sizing:border-box;margin:-42px auto 0;overflow:hidden;border:4px solid #fff;border-radius:18px;background:#e9eef4;box-shadow:0 10px 22px rgba(15,23,42,.22)}
.idp-photo img{display:block;width:100%;height:100%;object-fit:cover}
.idp-name{flex:0 0 auto;display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:36px;margin-top:6px;padding:0 12px;text-align:center;font-weight:900;line-height:1.12;color:#0f172a;letter-spacing:-.01em}
.idp-pillrow{display:flex;justify-content:center;margin-top:4px}
.idp-pill{display:inline-block;padding:5px 14px;border-radius:999px;background:var(--accent);color:var(--d);font-size:9px;font-weight:900;letter-spacing:.1em}
.idp-grid{margin:7px 14px 0;display:grid;grid-template-columns:1fr 1fr;gap:5px}
.idp-grid>div{min-width:0;box-sizing:border-box;padding:6px 8px 6px;border-radius:9px;border:1px solid rgba(148,163,184,.24);border-left:3px solid var(--c);background:rgba(255,255,255,.94);box-shadow:0 3px 8px rgba(15,23,42,.04)}
.idp-grid .wide{grid-column:1/-1}
.idp-grid b{display:block;margin-top:2px;font-size:11px;font-weight:800;line-height:1.25;overflow-wrap:anywhere}
.idp-foot{margin-top:auto;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box;padding:8px 20px 14px}
.idp-dates{display:flex;gap:16px}
.idp-dates b{display:block;margin-top:2px;font-size:10.5px;font-weight:900;color:var(--d)}

/* nyuma */
.idp-qr-tile{position:relative;z-index:3;flex:0 0 auto;width:126px;height:126px;box-sizing:border-box;margin:-32px auto 0;padding:8px;border-radius:22px;background:#fff;border:1px solid #e5eaf2;box-shadow:0 12px 26px rgba(15,23,42,.22)}
.idp-qr-tile img,.idp-qr-empty{display:block;width:100%;height:100%;object-fit:contain;background:#fff}
.idp-qr-label{margin-top:7px;text-align:center;font-size:8.5px;font-weight:900;letter-spacing:.14em;color:var(--d)}
.idp-back{flex:1;min-height:0;display:flex;flex-direction:column;box-sizing:border-box;padding:10px 22px 10px}
.idp-back h3{margin:0 0 7px;font-size:9.5px;font-weight:900;letter-spacing:.08em;color:var(--c)}
.idp-rl{display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;font-size:8.8px;line-height:1.35;color:#475569}
.idp-rl i{flex:0 0 16px;width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--c);color:#fff;font-style:normal;font-size:8.5px;font-weight:900}
.idp-verify{margin-top:auto;padding:11px 12px;display:grid;gap:4px;border-radius:12px;border:1px solid rgba(148,163,184,.2);border-left:4px solid var(--c);background:rgba(255,255,255,.96);box-shadow:0 6px 16px rgba(15,23,42,.06)}
.idp-verify b{font-size:11px;line-height:1.25;overflow-wrap:anywhere}
.idp-verify span{font-size:8.5px;font-weight:800;line-height:1.3;color:#475569;overflow-wrap:anywhere}
.idp-foot--back{flex:0 0 auto;margin-top:0;padding:9px 20px 14px;background:linear-gradient(90deg,var(--d),var(--c));color:#fff;font-size:8px;font-weight:900;letter-spacing:.05em}

@media(max-width:1100px){.aid-previews{grid-template-columns:minmax(0,1fr)}}
@media(max-width:900px){.aid-layout{grid-template-columns:minmax(0,1fr)}.aid-form{position:static}}
@media(max-width:520px){.aid-network{grid-template-columns:repeat(3,1fr)}.aid-col{padding:9px}}
@media(prefers-reduced-motion:reduce){.aid-spin{animation:none}}
`;
