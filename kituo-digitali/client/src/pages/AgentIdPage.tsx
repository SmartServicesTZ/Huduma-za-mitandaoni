import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import { Download, Upload, RotateCcw, LoaderCircle } from "lucide-react";
import { triggerDownload } from "@/lib/downloadHistory";

type Network = "Airtel" | "Vodacom" | "Yas" | "Halotel" | "Mbeya One Company Limited" | "Huduma za Mtandaoni";
type NetworkCfg = { logo: string; color: string; dark: string; accent: string; slogan: string; footer: string; pattern: string };

const NETWORKS: Record<Network, NetworkCfg> = {
  Airtel: { logo: `${import.meta.env.BASE_URL}airtel-logo.png`, color: "#e60000", dark: "#a90000", accent: "#fff0f0", slogan: "AIRTEL TANZANIA", footer: "This card remains the property of Airtel Tanzania PLC.", pattern: "airtel" },
  Vodacom: { logo: `${import.meta.env.BASE_URL}vodacom-logo.png`, color: "#e60000", dark: "#b00000", accent: "#fff1f1", slogan: "VODACOM TANZANIA", footer: "This card remains the property of Vodacom Tanzania PLC.", pattern: "vodacom" },
  Yas: { logo: `${import.meta.env.BASE_URL}yas-logo.png`, color: "#1261A0", dark: "#082B5C", accent: "#FFF2A8", slogan: "YAS TANZANIA", footer: "This card is issued for authorized agent use only.", pattern: "yas" },
  Halotel: { logo: `${import.meta.env.BASE_URL}halotel-logo.png`, color: "#ff6900", dark: "#d94f00", accent: "#fff3e8", slogan: "HALOTEL TANZANIA", footer: "This card remains the property of Halotel Tanzania.", pattern: "halotel" },
  "Mbeya One Company Limited": { logo: `${import.meta.env.BASE_URL}mbeya-one.png`, color: "#e30613", dark: "#8f0008", accent: "#fff0f1", slogan: "MBEYA ONE COMPANY LIMITED", footer: "LIPA KWA SIMU AIRTEL • AUTHORIZED AGENT", pattern: "mbeya" },
  "Huduma za Mtandaoni": { logo: "", color: "#0e7490", dark: "#123b5d", accent: "#e7f8f6", slogan: "HUDUMA ZA MTANDAONI", footer: "HUDUMA ZA MTANDAONI • AUTHORIZED AGENT", pattern: "huduma" },
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
const landscapeNameSize = (name: string) => { const n = name.trim().length; return n <= 24 ? 16 : n <= 32 ? 14 : n <= 42 ? 12.5 : 11; };
const portraitNameSize = (name: string) => { const n = name.trim().length; return n <= 16 ? 20 : n <= 22 ? 17 : n <= 30 ? 14.5 : n <= 40 ? 12.5 : 11; };

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
    triggerDownload(blob, filename, "PNG");
  } finally {
    host.remove();
  }
}

export default function AgentIdPage() {
  const [network, setNetwork] = useState<Network>("Airtel");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [name, setName] = useState("Steward Jackson Njiwa");
  const [agentId, setAgentId] = useState("T63663");
  const [phone, setPhone] = useState("0698232313");
  const [type, setType] = useState("Freelancer");
  const [region, setRegion] = useState("Manyara");
  const [district, setDistrict] = useState("Kiteto");
  const [area, setArea] = useState("Ndirigishi");
  const [issueDate, setIssueDate] = useState(today());
  const [photo, setPhoto] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const landFrontRef = useRef<HTMLDivElement>(null);
  const landBackRef = useRef<HTMLDivElement>(null);
  const portFrontRef = useRef<HTMLDivElement>(null);
  const portBackRef = useRef<HTMLDivElement>(null);
  const cfg = NETWORKS[network];
  const data: AgentData = { name, agentId, phone, type, region, district, area, issueDate };

  const qrText = useMemo(() => JSON.stringify({ network, name, agentId, phone, type, region, district, area, issueDate, expiryDate: expiry(issueDate) }), [network, name, agentId, phone, type, region, district, area, issueDate]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrText, { width: 420, margin: 4, errorCorrectionLevel: "H", color: { dark: "#111111", light: "#ffffff" } })
      .then((url) => { if (!cancelled) setQr(url); })
      .catch(() => { if (!cancelled) setQr(""); });
    return () => { cancelled = true; };
  }, [qrText]);

  const reset = () => { setName(""); setAgentId(""); setPhone(""); setType("Freelancer"); setRegion(""); setDistrict(""); setArea(""); setIssueDate(today()); setPhoto(""); setNetwork("Airtel"); };

  const onPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const downloadCards = async (side: "front" | "back" | "both") => {
    const land = { size: LAND, label: "kulala", front: landFrontRef.current, back: landBackRef.current };
    const port = { size: PORT, label: "kusimama", front: portFrontRef.current, back: portBackRef.current };
    const sets = side === "both" ? [land, port] : [orientation === "landscape" ? land : port];
    const jobs: { el: HTMLElement; size: { w: number; h: number }; filename: string }[] = [];
    for (const set of sets) {
      if (side !== "back" && set.front) jobs.push({ el: set.front, size: set.size, filename: `kitambulisho-${set.label}-mbele.png` });
      if (side !== "front" && set.back) jobs.push({ el: set.back, size: set.size, filename: `kitambulisho-${set.label}-nyuma.png` });
    }
    if (!jobs.length) { window.alert("Vitambulisho bado havijajiandaa. Subiri kidogo kisha jaribu tena."); return; }
    setBusy(true);
    try {
      for (const job of jobs) await exportCard(job.el, job.size, job.filename);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Imeshindikana kupakua kitambulisho.");
    } finally { setBusy(false); }
  };

  const orientLabel = orientation === "landscape" ? "Kulala" : "Kusimama";

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
        <p className="aid-choice-note">Chagua aina unayotaka kupakua kwa vitufe vya "Mbele" na "Nyuma". Vyote viwili vinaonekana kwenye preview.</p>
        <div className="aid-network">{(Object.keys(NETWORKS).filter((n) => n !== "Huduma za Mtandaoni") as Network[]).map((n) => <button type="button" key={n} className={network === n ? "active" : ""} onClick={() => setNetwork(n)}>{n === "Mbeya One Company Limited" ? "MBEYA ONE" : n}</button>)}</div>
        <label className="aid-field"><span>Picha ya Wakala</span><input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} /></label>
        <label className="aid-field"><span>Jina Kamili</span><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
        <label className="aid-field"><span>Agent ID / Code</span><input value={agentId} maxLength={20} onChange={(e) => setAgentId(e.target.value)} /></label>
        <label className="aid-field"><span>Namba ya Simu</span><input inputMode="tel" value={phone} maxLength={16} onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="aid-field"><span>Agent Type</span><select value={type} onChange={(e) => setType(e.target.value)}><option>Freelancer</option><option>Team Leader</option><option>Supervisor</option><option>Authorized Agent</option></select></label>
        <label className="aid-field"><span>Mkoa</span><input value={region} maxLength={30} onChange={(e) => setRegion(e.target.value)} /></label>
        <label className="aid-field"><span>Wilaya</span><input value={district} maxLength={30} onChange={(e) => setDistrict(e.target.value)} /></label>
        <label className="aid-field"><span>Kata / Eneo</span><input value={area} maxLength={30} onChange={(e) => setArea(e.target.value)} /></label>
        <label className="aid-field"><span>Tarehe ya Kutolewa</span><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
        <div className="aid-buttons"><button type="button" className="button button--green" onClick={() => fileRef.current?.click()}><Upload size={16} /> Picha</button><button type="button" className="button" onClick={reset}><RotateCcw size={16} /> Anza upya</button></div>
        <div className="aid-buttons"><button type="button" className="button button--green" disabled={busy} onClick={() => void downloadCards("front")}>{busy ? <LoaderCircle size={16} className="aid-spin" /> : <Download size={16} />} Pakua Mbele ({orientLabel})</button><button type="button" className="button button--green" disabled={busy} onClick={() => void downloadCards("back")}>{busy ? <LoaderCircle size={16} className="aid-spin" /> : <Download size={16} />} Pakua Nyuma ({orientLabel})</button></div>
        <button type="button" className="button button--green button--wide" style={{ marginTop: 8 }} disabled={busy} onClick={() => void downloadCards("both")}>{busy ? <><LoaderCircle size={16} className="aid-spin" /> Inaandaa picha...</> : <><Download size={16} /> Pakua Vyote (Kulala na Kusimama, PNG)</>}</button>
        <p className="aid-note">Tarehe ya kuisha huwekwa moja kwa moja kuwa mwaka mmoja baada ya tarehe ya kutolewa.</p>
      </section>

      <section className="aid-stage">
        <div className="aid-intro"><span className="overline">MUONEKANO WA VITAMBULISHO VIWILI</span><p>Kushoto: kitambulisho cha kulala. Kulia: kitambulisho cha kusimama. Nembo na rangi hubadilika kulingana na mtandao uliochagua. Picha utakayopakua ina saizi kamili hata ukiwa kwenye simu.</p></div>
        <div className="aid-previews">
          <div className={`aid-col ${orientation === "landscape" ? "is-active" : ""}`}>
            <p className="aid-side">01 · STYLE YA KULALA</p>
            <ScaledCard width={LAND.w} height={LAND.h}><LandscapeFront innerRef={landFrontRef} cfg={cfg} network={network} photo={photo} {...data} /></ScaledCard>
            <p className="aid-side aid-side--back">UPANDE WA NYUMA</p>
            <ScaledCard width={LAND.w} height={LAND.h}><LandscapeBack innerRef={landBackRef} cfg={cfg} network={network} qr={qr} {...data} /></ScaledCard>
          </div>
          <div className={`aid-col ${orientation === "portrait" ? "is-active" : ""}`}>
            <p className="aid-side">02 · STYLE YA KUSIMAMA</p>
            <ScaledCard width={PORT.w} height={PORT.h}><PortraitFront innerRef={portFrontRef} cfg={cfg} network={network} photo={photo} {...data} /></ScaledCard>
            <p className="aid-side aid-side--back">UPANDE WA NYUMA</p>
            <ScaledCard width={PORT.w} height={PORT.h}><PortraitBack innerRef={portBackRef} cfg={cfg} network={network} qr={qr} {...data} /></ScaledCard>
          </div>
        </div>
      </section>
    </div>
  </main>;
}

type FrontProps = AgentData & { cfg: NetworkCfg; network: Network; photo: string; innerRef?: React.Ref<HTMLDivElement> };
type BackProps = AgentData & { cfg: NetworkCfg; network: Network; qr: string; innerRef?: React.Ref<HTMLDivElement> };
const cardVars = (cfg: NetworkCfg) => ({ "--c": cfg.color, "--d": cfg.dark, "--accent": cfg.accent }) as React.CSSProperties;

function PortraitFront({ innerRef, cfg, network, photo, name, agentId, phone, type, region, district, area, issueDate }: FrontProps) {
  const displayName = (name.trim() || "JINA LA WAKALA").toUpperCase();
  return <div ref={innerRef} className={`idp net-${cfg.pattern}`} style={cardVars(cfg)}>
    <div className="idp-head"><div className="idp-brand"><Words text="HUDUMA ZA MTANDAONI" /></div><div className="idp-title"><Words text="KITAMBULISHO CHA WAKALA" /></div><div className="idp-sub"><Words text="AUTHORIZED AGENT CARD" /></div></div>
    <div className="idp-logobar">{cfg.logo ? <img src={cfg.logo} alt={network} /> : <strong className="idl-own-mark">HM</strong>}<span><Words text={COMPANY_LABELS[network]} /></span></div>
    <div className="idp-photo">{photo ? <img src={photo} alt="Wakala" /> : <span><Words text="PICHA YA WAKALA" /></span>}</div>
    <div className="idp-name" style={{ fontSize: portraitNameSize(displayName) }}><div><Words text={displayName} /></div></div>
    <div className="idp-fields">
      <div><b><Words text="AGENT ID" /></b><span><Words text={agentId} fallback="—" /></span></div>
      <div><b>SIMU</b><span><Words text={phone} fallback="—" /></span></div>
      <div><b>AINA</b><span><Words text={type} fallback="—" /></span></div>
      <div><b>MTANDAO</b><span><Words text={network} /></span></div>
      <div><b>MKOA</b><span><Words text={region} fallback="—" /></span></div>
      <div><b><Words text="WILAYA / ENEO" /></b><span><Words text={`${district || "—"} / ${area || "—"}`} /></span></div>
    </div>
    <div className="idp-foot"><span><Words text={`ISSUED: ${fmt(issueDate)}`} /></span><span><Words text={`EXPIRES: ${fmt(expiry(issueDate))}`} /></span></div>
  </div>;
}

function PortraitBack({ innerRef, cfg, network, qr, name, agentId, phone, region, district, area }: BackProps) {
  return <div ref={innerRef} className={`idp net-${cfg.pattern}`} style={cardVars(cfg)}>
    <div className="idp-head"><div className="idp-brand"><Words text="HUDUMA ZA MTANDAONI" /></div><div className="idp-title"><Words text="UTHIBITISHO WA WAKALA" /></div><div className="idp-sub"><Words text={`${COMPANY_LABELS[network]} NETWORK`} /></div></div>
    <div className="idp-back">
      <div className="idp-qr-box">{qr ? <img src={qr} alt="QR Code" /> : <div className="idp-qr-empty" />}<span><Words text="SCAN TO VERIFY" /></span></div>
      <h3><Words text="MASHARTI YA MATUMIZI" /></h3>
      <p>Kitambulisho hiki ni cha matumizi ya wakala aliyeidhinishwa pekee.</p>
      <p>Wakala anatakiwa kufuata sheria na taratibu za mtandao husika.</p>
      <p>Usikopeshe kitambulisho hiki wala kutumia taarifa za mteja kinyume cha sheria.</p>
      <div className="idp-verify"><b><Words text={(name.trim() || "JINA LA WAKALA").toUpperCase()} /></b><span><Words text={`${agentId || "—"} · ${phone || "—"}`} /></span><span><Words text={`${region || "—"} · ${district || "—"} / ${area || "—"}`} /></span></div>
    </div>
    <div className="idp-foot"><span><Words text="HUDUMA ZA MTANDAONI" /></span><span><Words text={COMPANY_LABELS[network]} /></span></div>
  </div>;
}

function LandscapeFront({ innerRef, cfg, network, photo, name, agentId, phone, type, region, district, area, issueDate }: FrontProps) {
  const displayName = (name.trim() || "JINA LA WAKALA").toUpperCase();
  const title = network === "Mbeya One Company Limited" ? "LIPA KWA SIMU AIRTEL" : cfg.pattern === "huduma" ? "AUTHORIZED AGENT ID" : "SIM REGISTRATION AGENT";
  return <div ref={innerRef} className={`idl net-${cfg.pattern}`} style={cardVars(cfg)}>
    {cfg.logo && <img className="idl-wm" src={cfg.logo} alt="" aria-hidden="true" />}
    <div className="idl-top">
      <div><div className="idl-brand"><Words text={`HUDUMA ZA MTANDAONI • ${cfg.slogan}`} /></div><div className="idl-title"><Words text={title} /></div></div>
      <div className="idl-logo-wrap">{cfg.logo ? <img className="idl-logo" src={cfg.logo} alt={network} /> : <strong className="idl-own-mark">HM</strong>}</div>
    </div>
    <div className="idl-body">
      <div className="idl-photo">{photo ? <img src={photo} alt="Wakala" /> : <span><Words text="PICHA YA WAKALA" /></span>}</div>
      <div className="idl-details">
        <div className="idl-name" style={{ fontSize: landscapeNameSize(displayName) }}><Words text={displayName} /></div>
        <div className="idl-row"><b><Words text="AGENT ID" /></b><span><Words text={agentId} fallback="—" /></span></div>
        <div className="idl-row"><b>PHONE</b><span><Words text={phone} fallback="—" /></span></div>
        <div className="idl-row"><b>COMPANY</b><span><Words text={COMPANY_LABELS[network]} /></span></div>
        <div className="idl-row"><b>TYPE</b><span><Words text={type} fallback="—" /></span></div>
        <div className="idl-row"><b>REGION</b><span><Words text={region} fallback="—" /></span></div>
        <div className="idl-row"><b>AREA</b><span><Words text={`${district || "—"} / ${area || "—"}`} /></span></div>
        <div className="idl-row"><b><Words text="VALID UNTIL" /></b><span><Words text={fmt(expiry(issueDate))} /></span></div>
      </div>
    </div>
    <div className="idl-bottom"><div className="idl-sign"><Words text="AGENT SIGNATURE" /></div><div className="idl-sign"><Words text="AUTHORIZED OFFICER" /></div></div>
  </div>;
}

function LandscapeBack({ innerRef, cfg, network, qr, name, agentId, phone, region, district, area, issueDate }: BackProps) {
  const title = network === "Mbeya One Company Limited" ? "KITAMBULISHO CHA LIPA KWA SIMU" : cfg.pattern === "huduma" ? "KITAMBULISHO CHA HUDUMA ZA MTANDAONI" : "KITAMBULISHO CHA WAKALA";
  const footer = network === "Mbeya One Company Limited" ? "MBEYA ONE COMPANY LIMITED • LIPA KWA SIMU AIRTEL • AUTHORIZED AGENT" : cfg.footer;
  return <div ref={innerRef} className={`idl net-${cfg.pattern}`} style={cardVars(cfg)}>
    {cfg.logo && <img className="idl-wm" src={cfg.logo} alt="" aria-hidden="true" />}
    <div className="idl-top idl-back-top">
      <div><div className="idl-brand"><Words text={`HUDUMA ZA MTANDAONI • ${cfg.slogan}`} /></div><div className="idl-title"><Words text={title} /></div></div>
      <div className="idl-logo-wrap">{cfg.logo ? <img className="idl-logo" src={cfg.logo} alt={network} /> : <strong className="idl-own-mark">HM</strong>}</div>
    </div>
    <div className="idl-back-body">
      <div className="idl-rules">
        <h4><Words text="MUHIMU KWA MTUMIAJI WA KITAMBULISHO" /></h4>
        <div className="idl-rule"><i>✓</i><span>Kitambulisho hiki ni mali ya kampuni na kinatumika na wakala aliyeidhinishwa pekee.</span></div>
        <div className="idl-rule"><i>✓</i><span>Wakala anatakiwa kufuata sheria, taratibu na masharti ya mtandao husika.</span></div>
        <div className="idl-rule"><i>!</i><span>Hairuhusiwi kukopesha kitambulisho au kutumia taarifa za mteja kinyume cha sheria.</span></div>
        <div className="idl-rule"><i>i</i><span>Kitambulisho kikionekana kimepotea au kuharibika, wasiliana na uongozi wa kampuni.</span></div>
      </div>
      <div className="idl-qr-wrap">{qr ? <img className="idl-qr" src={qr} alt="QR Code" /> : <div className="idl-qr" />}<div className="idl-qr-label"><Words text="SCAN TO VERIFY" /></div></div>
    </div>
    <div className="idl-info">
      <div className="wide"><b><Words text="JINA LA WAKALA" /></b><Words text={name.trim().toUpperCase()} fallback="—" /></div>
      <div><b><Words text="AGENT CODE" /></b><Words text={agentId} fallback="—" /></div>
      <div><b><Words text="NAMBA YA SIMU" /></b><Words text={phone} fallback="—" /></div>
      <div><b>MKOA</b><Words text={region} fallback="—" /></div>
      <div><b><Words text="WILAYA / ENEO" /></b><Words text={`${district || "—"} / ${area || "—"}`} /></div>
      <div className="wide"><b><Words text="ISSUE / EXPIRY" /></b><Words text={`${fmt(issueDate)} / ${fmt(expiry(issueDate))}`} /></div>
    </div>
    <div className="idl-foot"><Words text={footer} /></div>
  </div>;
}

/* NB: majina ya class za vitambulisho (idl-*, idp-*) yameepuka maneno "card"/"panel"
   kwa makusudi, kwa sababu index.css ina kanuni za [class*="card"] / [class*="panel"]
   (rangi ya mpaka na kivuli) ambazo zingeingia kwenye picha iliyopakuliwa. */
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
.aid-col{min-width:0;padding:12px;border:1px solid #e3eaf2;border-radius:17px;background:#fff;box-shadow:0 10px 26px rgba(23,36,67,.06);transition:border-color .2s,box-shadow .2s}
.aid-col.is-active{border-color:#18b969;box-shadow:0 12px 30px rgba(24,185,105,.16)}
.aid-side{margin:0 0 8px;font-size:10.5px;font-weight:900;letter-spacing:.12em;color:#64748b}
.aid-side--back{margin-top:20px}
.aid-scale{position:relative;width:100%}

/* ===== Kitambulisho cha kulala (560x350) ===== */
.idl{width:560px;height:350px;box-sizing:border-box;position:relative;overflow:hidden;display:flex;flex-direction:column;border-radius:18px;background:linear-gradient(135deg,#ffffff 0%,#f3f7fb 100%);color:#172033;font-family:Arial,Helvetica,sans-serif;border:1px solid rgba(15,23,42,.14);box-shadow:0 14px 36px rgba(15,23,42,.2)}
.idl::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.35;background:radial-gradient(circle at 90% 8%,var(--c) 0 1px,transparent 2px),linear-gradient(135deg,transparent 0 40%,rgba(255,255,255,.7) 40% 41%,transparent 41% 62%,rgba(15,23,42,.04) 62% 63%,transparent 63%);background-size:18px 18px,100% 100%}
.idl>*:not(.idl-wm){position:relative;z-index:1}
.idl-wm{position:absolute;left:73%;top:57%;width:230px;height:230px;transform:translate(-50%,-50%);object-fit:contain;opacity:.1;z-index:0}
.idl-top{flex:0 0 88px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 22px;color:#fff;overflow:hidden}
.idl-top::after{content:"";position:absolute;right:-35px;top:-65px;width:170px;height:170px;border-radius:50%;background:rgba(255,255,255,.12);pointer-events:none}
.idl-back-top{flex-basis:68px}
.idl-brand{font-size:9px;font-weight:800;letter-spacing:.12em;line-height:1.35;opacity:.92}
.idl-title{margin-top:5px;font-size:19px;font-weight:900;line-height:1.15;letter-spacing:.01em}
.idl-back-top .idl-title{font-size:15px}
.idl-logo-wrap{position:relative;z-index:2;flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:128px;height:56px}
.idl-logo{max-width:100%;max-height:100%;object-fit:contain}
.idl-own-mark{display:grid;place-items:center;width:48px;height:48px;border:3px solid #7cf5dc;border-radius:14px;color:#7cf5dc;font-size:17px}
.net-airtel .idl-top{background:linear-gradient(135deg,#b90000,#ef1717)}
.net-vodacom .idl-top{background:linear-gradient(135deg,#b50000,#ef2020)}
.net-yas .idl-top{background:linear-gradient(135deg,#092f63,#1261a0 62%,#f4c400)}
.net-halotel .idl-top{background:linear-gradient(135deg,#d84a00,#ff7800)}
.net-mbeya .idl-top{background:linear-gradient(135deg,#850008,#e30613 65%,#ff3945)}
.net-mbeya .idl-logo-wrap{width:150px;height:56px}
.net-mbeya .idl-logo{padding:4px 9px;border-radius:9px;background:#fff;box-sizing:border-box}
.net-huduma .idl-top{background:linear-gradient(135deg,#123b5d,#0e7490 62%,#22c7a8)}
.idl-body{flex:1;min-height:0;display:grid;grid-template-columns:104px minmax(0,1fr);gap:16px;padding:14px 22px 10px}
.idl-photo{width:104px;height:136px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden;border:3px solid var(--c);border-radius:10px;background:#e9eef4;color:#667085;font-size:9px;font-weight:700;text-align:center;box-shadow:0 6px 16px rgba(0,0,0,.12)}
.idl-photo img{width:100%;height:100%;object-fit:cover}
.idl-details{min-width:0}
.idl-name{margin-bottom:7px;font-weight:900;line-height:1.2;color:var(--d);overflow-wrap:anywhere}
.net-yas .idl-name{color:#0b4f91}
.net-mbeya .idl-name{color:#b1000a}
.net-huduma .idl-name{color:#0e7490}
.idl-row{display:flex;align-items:flex-start;gap:8px;padding:3px 0;border-bottom:1px solid rgba(20,30,45,.1)}
.idl-row b{flex:0 0 78px;font-size:8px;font-weight:800;line-height:1.55;letter-spacing:.05em;color:#667085}
.idl-row span{flex:1;min-width:0;font-size:10.5px;font-weight:800;line-height:1.3;overflow-wrap:anywhere}
.idl-bottom{flex:0 0 38px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 22px;border-top:5px solid var(--c);background:#fff;color:#5b6472}
.net-vodacom .idl-bottom{background:#171717;color:#fff}
.net-yas .idl-bottom{background:#fff8cf}
.net-halotel .idl-bottom{background:#fff0e5}
.net-mbeya .idl-bottom{background:#fff0f1}
.idl-sign{width:150px;max-width:45%;padding-top:3px;border-top:1px solid #667085;text-align:center;font-size:8px;font-weight:700;letter-spacing:.04em}
.idl-back-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 118px;gap:14px;padding:12px 22px 4px}
.idl-rules{font-size:8.5px;line-height:1.3}
.idl-rules h4{margin:0 0 5px;font-size:10px;letter-spacing:.02em}
.idl-rule{display:flex;align-items:flex-start;gap:6px;margin:5px 0}
.idl-rule i{flex:0 0 15px;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--c);color:#fff;font-style:normal;font-size:8px}
.idl-qr-wrap{text-align:center}
.idl-qr{display:block;width:104px;height:104px;margin:0 auto;box-sizing:border-box;object-fit:contain;border:5px solid #fff;background:#fff;box-shadow:0 3px 12px rgba(0,0,0,.16)}
.idl-qr-label{margin-top:4px;font-size:8px;font-weight:800;letter-spacing:.06em}
.idl-info{margin:0 22px 8px;padding:7px 10px;display:grid;grid-template-columns:1fr 1fr;gap:5px 14px;border-radius:9px;background:var(--accent);font-size:8.5px;font-weight:800;line-height:1.25}
.idl-info>div{min-width:0;overflow-wrap:anywhere}
.idl-info .wide{grid-column:1/-1}
.idl-info b{display:block;margin-bottom:1px;font-size:7px;font-weight:800;letter-spacing:.04em;color:#667085}
.idl-foot{flex:0 0 24px;display:flex;align-items:center;justify-content:center;padding:0 12px;background:var(--c);color:#fff;font-size:7.5px;font-weight:800;line-height:1.2;text-align:center}
.net-yas .idl-foot{background:#1261a0}
.net-vodacom .idl-foot{background:#171717}
.net-halotel .idl-foot{background:#e85b00}
.net-mbeya .idl-foot{background:#c9000c}
.net-huduma .idl-foot{background:#123b5d}

/* ===== Kitambulisho cha kusimama (320x520) ===== */
.idp{width:320px;height:520px;box-sizing:border-box;position:relative;overflow:hidden;display:flex;flex-direction:column;border-radius:22px;background:linear-gradient(155deg,#fff 0%,#f2fbff 48%,var(--accent) 100%);color:#123b5d;font-family:Arial,Helvetica,sans-serif;border:1px solid rgba(14,116,144,.24);box-shadow:0 14px 36px rgba(15,23,42,.2)}
.idp-head{position:relative;flex:0 0 100px;box-sizing:border-box;padding:17px 18px;overflow:hidden;color:#fff;background:linear-gradient(135deg,var(--d,#123b5d),var(--c,#0e7490) 70%,#f5c842)}
.idp-head::after{content:"";position:absolute;right:-32px;top:-55px;width:145px;height:145px;border:18px solid rgba(255,255,255,.16);border-radius:50%;pointer-events:none}
.idp-head>*{position:relative;z-index:1}
.idp-brand{font-size:9.5px;font-weight:900;letter-spacing:.12em}
.idp-title{margin-top:13px;font-size:20px;font-weight:900;line-height:1.1}
.idp-sub{margin-top:5px;font-size:8.5px;letter-spacing:.1em;opacity:.88}
.idp-logobar{flex:0 0 44px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 16px;padding:6px 2px 0;border-bottom:2px solid var(--c);color:var(--d);font-size:9.5px;font-weight:900;letter-spacing:.05em}
.idp-logobar img{height:34px;width:90px;object-fit:contain}
.idp-logobar>span{text-align:right}
.idp-photo{flex:0 0 auto;width:128px;height:140px;box-sizing:border-box;margin:12px auto 8px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:4px solid var(--c);border-radius:14px;background:#e7f8f6;color:#0e7490;font-size:9px;font-weight:900;text-align:center;box-shadow:0 7px 18px rgba(18,59,93,.16)}
.idp-photo img{width:100%;height:100%;object-fit:cover}
.idp-name{flex:0 0 46px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:0 16px;text-align:center;font-weight:900;line-height:1.2;color:#123b5d;overflow-wrap:anywhere}
.idp-fields{margin:8px 18px 0;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}
.idp-fields>div{min-width:0;padding-bottom:4px;border-bottom:1px solid #cde9e8}
.idp-fields b{display:block;font-size:7.5px;letter-spacing:.06em;color:#6b8792}
.idp-fields span{display:block;margin-top:2px;font-size:10.5px;font-weight:900;line-height:1.25;overflow-wrap:anywhere}
.idp-foot{margin-top:auto;flex:0 0 32px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 15px;background:linear-gradient(100deg,var(--d,#123b5d),var(--c,#0e7490));color:#fff;font-size:8px;font-weight:900;letter-spacing:.03em}
.idp-back{flex:1;min-height:0;display:flex;flex-direction:column;gap:4px;padding:14px 20px 10px;font-size:9.5px;line-height:1.35}
.idp-qr-box{display:flex;flex-direction:column;align-items:center;gap:5px}
.idp-qr-box img,.idp-qr-empty{width:128px;height:128px;box-sizing:border-box;border:6px solid #fff;background:#fff;box-shadow:0 4px 14px rgba(18,59,93,.15)}
.idp-qr-box>span{font-size:8.5px;font-weight:900;letter-spacing:.1em;color:var(--c)}
.idp-back h3{margin:8px 0 2px;font-size:10px;letter-spacing:.04em;color:var(--c)}
.idp-back p{margin:3px 0}
.idp-verify{margin-top:auto;padding:9px 11px;display:grid;gap:3px;border:1px solid rgba(14,116,144,.15);border-radius:12px;background:rgba(255,255,255,.75)}
.idp-verify b{font-size:11px;line-height:1.25;overflow-wrap:anywhere}
.idp-verify span{font-size:8.5px;font-weight:800;line-height:1.3;overflow-wrap:anywhere}

@media(max-width:1100px){.aid-previews{grid-template-columns:minmax(0,1fr)}}
@media(max-width:900px){.aid-layout{grid-template-columns:minmax(0,1fr)}.aid-form{position:static}}
@media(max-width:520px){.aid-network{grid-template-columns:repeat(3,1fr)}.aid-col{padding:9px}}
/* ===== Premium visual refinement: keep text/data logic unchanged ===== */
.idl{border-radius:16px;border:1px solid rgba(15,23,42,.16);background:#fff;box-shadow:0 10px 24px rgba(15,23,42,.16)}
.idl::before{opacity:.22;background:linear-gradient(135deg,transparent 0 52%,rgba(255,255,255,.72) 52% 53%,transparent 53%),radial-gradient(circle at 94% 10%,var(--c) 0 1px,transparent 2px);background-size:100% 100%,16px 16px}
.idl-top{flex-basis:82px;padding:0 20px 0 22px}
.idl-back-top{flex-basis:68px}
.idl-brand{font-size:8.5px;letter-spacing:.14em}
.idl-title{font-size:18px;letter-spacing:.015em}
.idl-logo-wrap{width:118px;height:52px;padding:5px 8px;box-sizing:border-box;border-radius:10px;background:rgba(255,255,255,.96)}
.net-mbeya .idl-logo-wrap{width:142px;height:52px}
.idl-body{grid-template-columns:108px minmax(0,1fr);gap:17px;padding:13px 20px 9px}
.idl-photo{width:108px;height:136px;border:3px solid #fff;outline:2px solid var(--c);border-radius:9px;box-shadow:0 5px 14px rgba(15,23,42,.16)}
.idl-name{margin:0 0 8px;padding:0 0 6px;border-bottom:2px solid var(--c);line-height:1.16}
.idl-row{gap:10px;padding:3.5px 0;border-bottom:1px solid rgba(100,116,139,.18)}
.idl-row b{flex-basis:76px;font-size:7.5px;letter-spacing:.07em}
.idl-row span{font-size:10.5px;line-height:1.28}
.idl-bottom{flex-basis:36px;border-top:3px solid var(--c)}
.idl-sign{font-size:7.5px;letter-spacing:.08em}
.idl-back-body{grid-template-columns:minmax(0,1fr) 112px;gap:16px;padding:12px 20px 5px}
.idl-rules{font-size:8.2px;line-height:1.35}
.idl-rule{margin:6px 0;gap:7px}
.idl-rule i{background:var(--c);box-shadow:0 2px 4px rgba(15,23,42,.12)}
.idl-qr{width:100px;height:100px;border:4px solid #fff;box-shadow:0 3px 10px rgba(15,23,42,.12)}
.idl-info{margin:0 20px 8px;padding:7px 10px;border-left:3px solid var(--c);border-radius:7px;background:rgba(255,255,255,.88);box-shadow:0 2px 7px rgba(15,23,42,.05)}
.idl-foot{flex-basis:23px;font-size:7.2px;letter-spacing:.045em}
.net-airtel .idl-top{background:linear-gradient(115deg,#a90000 0%,#e60000 62%,#ff3434 100%)}
.net-vodacom .idl-top{background:linear-gradient(115deg,#9d0000 0%,#e60000 62%,#ff4545 100%)}
.net-yas .idl-top{background:linear-gradient(115deg,#082b5c 0%,#1261a0 68%,#e4b900 100%)}
.net-halotel .idl-top{background:linear-gradient(115deg,#c74600 0%,#ff6900 70%,#ff9a45 100%)}
.net-mbeya .idl-top{background:linear-gradient(115deg,#800008 0%,#e30613 70%,#ff4550 100%)}
.net-huduma .idl-top{background:linear-gradient(115deg,#123b5d 0%,#0e7490 68%,#22c7a8 100%)}
.idp{border-radius:18px;background:linear-gradient(160deg,#fff 0%,#f7fbff 58%,var(--accent) 100%);box-shadow:0 12px 28px rgba(15,23,42,.16)}
.idp-head{flex-basis:96px;padding:16px 18px;background:linear-gradient(120deg,var(--d),var(--c) 72%,#f4c842)}
.idp-title{font-size:19px;letter-spacing:-.015em}
.idp-logobar{flex-basis:43px;border-bottom:2px solid var(--c);font-size:9px}
.idp-photo{width:124px;height:136px;margin:12px auto 7px;border:3px solid #fff;outline:2px solid var(--c);border-radius:12px}
.idp-name{flex-basis:48px;padding:0 18px;border-bottom:2px solid var(--c);margin:0 18px}
.idp-fields{margin:10px 18px 0;gap:8px 13px}
.idp-fields>div{padding-bottom:5px;border-bottom:1px solid rgba(100,116,139,.2)}
.idp-fields b{font-size:7px;letter-spacing:.08em}
.idp-fields span{font-size:10px;line-height:1.28}
.idp-foot{flex-basis:31px;font-size:7.5px;letter-spacing:.04em}
.idp-qr-box img,.idp-qr-empty{width:124px;height:124px;border:5px solid #fff;box-shadow:0 3px 12px rgba(15,23,42,.12)}
.idp-verify{border-left:3px solid var(--c);border-radius:8px;background:rgba(255,255,255,.9)}
@media(max-width:520px){.aid-form{padding:14px}.aid-head h1{font-size:25px}.aid-col{padding:8px}}
@media(prefers-reduced-motion:reduce){.aid-spin{animation:none}}
`;
