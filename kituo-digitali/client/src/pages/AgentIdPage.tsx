import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import { Download, Upload, RotateCcw } from "lucide-react";
import { triggerDownload } from "@/lib/downloadHistory";

type Network = "Airtel" | "Vodacom" | "Yas" | "Halotel" | "Mbeya One Company Limited" | "Huduma za Mtandaoni";
const NETWORKS: Record<Network, {
  logo: string; color: string; dark: string; accent: string; slogan: string; footer: string; pattern: string;
}> = {
  Airtel: { logo: `${import.meta.env.BASE_URL}airtel-logo.png`, color: "#e60000", dark: "#a90000", accent: "#fff0f0", slogan: "AIRTEL TANZANIA", footer: "This card remains the property of Airtel Tanzania PLC.", pattern: "airtel" },
  Vodacom: { logo: `${import.meta.env.BASE_URL}vodacom-logo.png`, color: "#e60000", dark: "#b00000", accent: "#fff1f1", slogan: "VODACOM TANZANIA", footer: "This card remains the property of Vodacom Tanzania PLC.", pattern: "vodacom" },
  Yas: { logo: `${import.meta.env.BASE_URL}yas-logo.png`, color: "#1261A0", dark: "#082B5C", accent: "#FFF2A8", slogan: "YAS TANZANIA", footer: "This card is issued for authorized agent use only.", pattern: "yas" },
  Halotel: { logo: `${import.meta.env.BASE_URL}halotel-logo.png`, color: "#ff6900", dark: "#d94f00", accent: "#fff3e8", slogan: "HALOTEL TANZANIA", footer: "This card remains the property of Halotel Tanzania.", pattern: "halotel" },
  "Mbeya One Company Limited": { logo: `${import.meta.env.BASE_URL}mbeya-one.png`, color: "#e30613", dark: "#8f0008", accent: "#fff0f1", slogan: "MBEYA ONE COMPANY LIMITED", footer: "LIPA KWA SIMU AIRTEL • AUTHORIZED AGENT", pattern: "mbeya" },
  "Huduma za Mtandaoni": { logo: "", color: "#0e7490", dark: "#123b5d", accent: "#e7f8f6", slogan: "HUDUMA ZA MTANDAONI", footer: "HUDUMA ZA MTANDAONI • AUTHORIZED AGENT", pattern: "huduma" },
};

const today = () => new Date().toISOString().slice(0, 10);
const expiry = (value: string) => { const d = new Date(value); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };
const fmt = (value: string) => value ? new Date(value + "T00:00:00").toLocaleDateString("sw-TZ", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export default function AgentIdPage() {
  const [network, setNetwork] = useState<Network>("Airtel");
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("Freelancer");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [area, setArea] = useState("");
  const [issueDate, setIssueDate] = useState(today());
  const [photo, setPhoto] = useState("");
  const [qr, setQr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const selectedNetworkCfg = NETWORKS[network];
  const cfg = { ...selectedNetworkCfg, slogan: `HUDUMA ZA MTANDAONI • ${selectedNetworkCfg.slogan}`, footer: `HUDUMA ZA MTANDAONI • AUTHORIZED ${network.toUpperCase()}` };

  const qrText = useMemo(() => JSON.stringify({ network, name, agentId, phone, type, region, district, area, issueDate, expiryDate: expiry(issueDate) }), [network, name, agentId, phone, type, region, district, area, issueDate]);

  useEffect(() => {
    QRCode.toDataURL(qrText, { width: 420, margin: 4, errorCorrectionLevel: "H", color: { dark: "#111111", light: "#ffffff" } }).then(setQr).catch(() => setQr(""));
  }, [qrText]);

  const reset = () => { setName(""); setAgentId(""); setPhone(""); setType("Freelancer"); setRegion(""); setDistrict(""); setArea(""); setIssueDate(today()); setPhoto(""); setNetwork("Airtel"); };

  const downloadCardImage = async (element: HTMLElement, filename: string) => {
    const clone = element.cloneNode(true) as HTMLElement;
    const toDataUrl = async (blob: Blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Imeshindikana kuandaa picha ya kitambulisho."));
      reader.onerror = () => reject(new Error("Imeshindikana kuandaa picha ya kitambulisho."));
      reader.readAsDataURL(blob);
    });
    const toSameOriginDataUrl = async (src: string) => {
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) return src;
      const resolved = new URL(src, document.baseURI);
      const response = await fetch(resolved.href, {
        mode: "cors",
        credentials: resolved.origin === window.location.origin ? "same-origin" : "omit",
        cache: "force-cache",
      });
      if (!response.ok) throw new Error("Imeshindikana kupakia nembo au picha ya kitambulisho. Hakikisha picha inafunguka kisha jaribu tena.");
      return toDataUrl(await response.blob());
    };

    // Keep the clone inside the live document so all local CSS is available, but
    // replace every image with a data URL before html2canvas sees it. This avoids
    // foreignObject SVG exports and prevents cross-origin images from tainting canvas.
    const sourceImages = Array.from(element.querySelectorAll<HTMLImageElement>("img"));
    const clonedImages = Array.from(clone.querySelectorAll<HTMLImageElement>("img"));
    await Promise.all(clonedImages.map(async (image, index) => {
      const source = sourceImages[index];
      const src = source?.currentSrc || source?.src || image.getAttribute("src") || "";
      if (!src) return;
      image.setAttribute("src", await toSameOriginDataUrl(src));
      image.removeAttribute("srcset");
      image.removeAttribute("crossorigin");
    }));

    const width = Math.max(1, element.getBoundingClientRect().width);
    const height = Math.max(1, element.getBoundingClientRect().height);
    clone.style.position = "fixed";
    clone.style.left = "-100000px";
    clone.style.top = "0";
    clone.style.margin = "0";
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.maxWidth = "none";
    clone.style.transform = "none";
    clone.style.scale = "1";
    clone.setAttribute("aria-hidden", "true");
    document.body.appendChild(clone);
    try {
      await Promise.all(Array.from(clone.querySelectorAll<HTMLImageElement>("img")).map((image) => {
        if (typeof image.decode === "function") return image.decode().catch(() => undefined);
        return Promise.resolve();
      }));
      const canvas = await html2canvas(clone, {
        backgroundColor: null,
        scale: 2,
        width,
        height,
        useCORS: false,
        allowTaint: false,
        logging: false,
        imageTimeout: 15000,
      });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Imeshindikana kuhifadhi picha ya kitambulisho.")), "image/png"));
      triggerDownload(blob, filename, "PNG");
    } finally {
      clone.remove();
    }
  };
  const downloadCards = async (side: "front" | "back" | "both") => {
    const columns = Array.from(document.querySelectorAll<HTMLElement>(".agent-preview-column"));
    const pairs = columns.map((column) => Array.from(column.querySelectorAll<HTMLElement>(".agent-card, .agent-portrait-card")));
    const selected = side === "both" ? pairs.flat() : pairs.map((pair) => pair[side === "front" ? 0 : 1]).filter((card): card is HTMLElement => Boolean(card));
    if (!selected.length) { window.alert("Vitambulisho bado havijajiandaa. Subiri kidogo kisha jaribu tena."); return; }
    try {
      for (const card of selected) {
        const orientation = card.classList.contains("agent-portrait-card") ? "kusimama" : "kulala";
        const face = card.classList.contains("portrait-back") || card.classList.contains("agent-back-card") || card.classList.contains("agent-back") ? "nyuma" : (card.classList.contains("agent-portrait-card") ? (card.parentElement?.querySelectorAll(".agent-portrait-card")[1] === card ? "nyuma" : "mbele") : (card.parentElement?.querySelectorAll(".agent-card")[1] === card ? "nyuma" : "mbele"));
        await downloadCardImage(card, "kitambulisho-" + orientation + "-" + face + ".png");
      }
    } catch (error) { window.alert(error instanceof Error ? error.message : "Imeshindikana kupakua kitambulisho."); }
  };

  return <main className="portal-main agent-id-page">
    <style>{`
.agent-id-page{--card-w:560px;max-width:1500px;margin:auto}.agent-id-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px}.agent-id-head h1{margin:4px 0 6px;font-size:clamp(25px,4vw,38px)}.agent-id-layout{display:grid;grid-template-columns:minmax(300px,380px) 1fr;gap:22px;align-items:start}.agent-id-form{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:18px;position:sticky;top:15px}.agent-field{display:grid;gap:6px;margin-bottom:11px}.agent-field span{font-size:12px;font-weight:700}.agent-field input,.agent-field select{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);color:inherit;border-radius:10px;padding:10px 11px}.agent-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.agent-template-choice{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px}.agent-template-choice button{border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(255,255,255,.05);color:inherit;padding:10px 7px;font-size:10px;font-weight:900;cursor:pointer}.agent-template-choice button.active{background:#22c7a8;color:#082b3c;border-color:#22c7a8}.agent-choice-note{font-size:11px;opacity:.72;margin:0 0 10px}.agent-network{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-bottom:14px}.agent-network.is-disabled{opacity:.42;pointer-events:none}.agent-network button{border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.04);color:inherit;padding:9px 4px;font-size:11px;font-weight:800;cursor:pointer}.agent-network button.active{background:#fff;color:#111}.agent-network button{border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.04);color:inherit;padding:9px 4px;font-size:11px;font-weight:800;cursor:pointer}.agent-network button.active{background:#fff;color:#111}.agent-previews{display:grid;grid-template-columns:repeat(auto-fit,minmax(500px,1fr));gap:20px;overflow:auto}.agent-side-title{font-size:11px;font-weight:800;letter-spacing:.12em;opacity:.65;margin:0 0 7px}.agent-template-choice{align-items:stretch}.agent-template-chip{display:flex;align-items:center;justify-content:center;text-align:center;border:1px solid rgba(131,246,177,.35);border-radius:10px;background:rgba(34,199,168,.12);color:#a8ffe8;padding:10px 7px;font-size:10px;font-weight:900}.agent-template-chip--portrait{background:rgba(59,130,246,.14);border-color:rgba(96,165,250,.35);color:#b9d7ff}.agent-preview-intro{margin:0 0 14px;padding:13px 15px;border:1px solid rgba(148,163,184,.2);border-radius:14px;background:linear-gradient(120deg,rgba(14,116,144,.16),rgba(30,64,175,.12))}.agent-preview-intro p{margin:5px 0 0;font-size:12px;line-height:1.5;color:#b9cbe0}.agent-dual-previews{grid-template-columns:minmax(0,560px) minmax(0,320px);gap:20px;align-items:start;overflow:visible}.agent-preview-column{min-width:0;padding:12px;border:1px solid rgba(148,163,184,.18);border-radius:17px;background:linear-gradient(160deg,rgba(255,255,255,.055),rgba(255,255,255,.018));box-shadow:0 12px 30px rgba(0,0,0,.12)}.agent-preview-column--portrait{background:linear-gradient(160deg,rgba(14,116,144,.12),rgba(59,130,246,.05))}.agent-preview-column .agent-card{width:560px;max-width:100%;height:350px}.agent-preview-column .agent-portrait-card{width:320px;max-width:100%;height:520px}.agent-back-label{margin-top:22px!important}.agent-card:before{opacity:.34;background:radial-gradient(circle at 88% 12%,var(--c) 0 2px,transparent 3px),radial-gradient(circle at 12% 90%,var(--c) 0 1px,transparent 2px),linear-gradient(135deg,transparent 0 38%,rgba(255,255,255,.24) 38% 39%,transparent 39% 60%,rgba(0,0,0,.05) 60% 61%,transparent 61%);background-size:17px 17px,13px 13px,100% 100%}.agent-watermark-logo{left:69%;top:54%;width:250px;height:250px;opacity:.15;filter:grayscale(0) saturate(1.15)}.agent-portrait-card{background:linear-gradient(155deg,#fff 0%,#f2fbff 48%,var(--accent,#dff8f4) 100%)}.agent-portrait-card:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.14;background:radial-gradient(circle at 100% 0%,var(--c) 0 1px,transparent 2px),linear-gradient(145deg,transparent 0 54%,var(--c) 54% 55%,transparent 55%);background-size:14px 14px,100% 100%}.agent-portrait-card>*{position:relative;z-index:1}.agent-portrait-card .portrait-header{position:relative;overflow:hidden;background:linear-gradient(135deg,var(--d,#123b5d),var(--c,#0e7490) 70%,#f5c842)}.agent-portrait-card .portrait-header:after{content:"";position:absolute;right:-32px;top:-55px;width:145px;height:145px;border:18px solid rgba(255,255,255,.16);border-radius:50%;pointer-events:none}.agent-portrait-card .portrait-logo-box{position:relative;margin:0 12px;padding:10px 8px 0;border-bottom:2px solid var(--c)}.agent-portrait-card .portrait-logo-box img{filter:drop-shadow(0 2px 3px rgba(0,0,0,.13));max-width:46%;}.agent-portrait-card .portrait-photo{box-shadow:0 7px 18px rgba(18,59,93,.16);border-color:var(--c)}.agent-portrait-card .portrait-footer{background:linear-gradient(100deg,var(--d,#123b5d),var(--c,#0e7490));}@media(max-width:1050px){.agent-dual-previews{grid-template-columns:minmax(0,1fr) minmax(260px,.7fr);gap:12px}.agent-preview-column{padding:9px}.agent-preview-column .agent-card{height:300px}.agent-preview-column .agent-card .agent-top{height:72px;padding:10px 12px}.agent-preview-column .agent-card .agent-title{font-size:14px}.agent-preview-column .agent-card .agent-body{grid-template-columns:95px minmax(0,1fr);gap:10px;padding:12px}.agent-preview-column .agent-card .agent-photo{width:88px;height:110px}.agent-preview-column .agent-card .agent-name{font-size:15px}.agent-preview-column .agent-card .agent-row{padding:2px 0;gap:4px}.agent-preview-column .agent-card .agent-row b{width:63px;font-size:6px}.agent-preview-column .agent-card .agent-row span{font-size:8px}.agent-preview-column .agent-card .agent-bottom{height:31px}.agent-preview-column .agent-portrait-card{width:100%;height:480px}.agent-preview-column .agent-portrait-card .portrait-header{height:100px;padding:14px 12px}.agent-preview-column .agent-portrait-card .portrait-title{font-size:16px;margin-top:12px}.agent-preview-column .agent-portrait-card .portrait-photo{width:105px;height:120px;margin:10px auto 7px}.agent-preview-column .agent-portrait-card .portrait-name{font-size:15px}.agent-preview-column .agent-portrait-card .portrait-fields{margin:10px 12px 0;gap:6px}.agent-preview-column .agent-portrait-card .portrait-fields span{font-size:8px}}@media(max-width:700px){.agent-dual-previews{grid-template-columns:minmax(0,1fr)}.agent-preview-column--landscape .agent-card{width:560px;max-width:100%;height:auto;aspect-ratio:1.6}.agent-preview-column--landscape .agent-card .agent-top{height:25%;padding:3% 4%}.agent-preview-column--landscape .agent-card .agent-top img{max-width:26%;height:100%}.agent-preview-column--landscape .agent-card .agent-title{font-size:clamp(10px,3vw,18px)}.agent-preview-column--landscape .agent-card .agent-body{grid-template-columns:23% minmax(0,1fr);gap:3%;padding:3.5%}.agent-preview-column--landscape .agent-card .agent-photo{width:100%;height:auto;aspect-ratio:0.82}.agent-preview-column--landscape .agent-card .agent-name{font-size:clamp(11px,3.8vw,21px)}.agent-preview-column--landscape .agent-card .agent-row{padding:1.5px 0}.agent-preview-column--landscape .agent-card .agent-row b{width:24%;font-size:clamp(5px,1.6vw,7px)}.agent-preview-column--landscape .agent-card .agent-row span{font-size:clamp(6px,1.8vw,10px)}.agent-preview-column--landscape .agent-card .agent-bottom{height:11%;padding:0 3%}.agent-preview-column--portrait .agent-portrait-card{width:min(320px,100%);margin:0 auto}}
.agent-card{width:var(--card-w);height:350px;max-width:100%;box-sizing:border-box;position:relative;overflow:hidden;border-radius:18px;background:#f8fafc;color:#172033;box-shadow:0 18px 45px rgba(0,0,0,.28);font-family:Arial,Helvetica,sans-serif;border:1px solid rgba(0,0,0,.12)}.agent-card:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.18;background:radial-gradient(circle at 90% 10%,var(--c) 0 1px,transparent 2px),linear-gradient(135deg,transparent 0 45%,rgba(0,0,0,.035) 45% 46%,transparent 46%);background-size:18px 18px,100% 100%}.agent-watermark-logo{position:absolute;z-index:0;left:78%;top:55%;width:235px;height:235px;transform:translate(-50%,-50%);object-fit:contain;opacity:.09;filter:grayscale(5%)}.agent-card>*:not(.agent-watermark-logo){z-index:1}
.agent-top{position:relative;height:88px;padding:14px 20px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;color:#fff;overflow:hidden}.agent-top:after{content:"";position:absolute;right:-35px;top:-65px;width:170px;height:170px;border-radius:50%;background:rgba(255,255,255,.12)}.agent-top img{width:116px;height:52px;object-fit:contain;background:transparent!important;border-radius:0;padding:0;box-sizing:border-box;position:relative;z-index:2}.agent-brand{font-size:8px;font-weight:800;letter-spacing:.18em;opacity:.88}.agent-title{font-size:18px;font-weight:900;margin-top:6px;letter-spacing:.02em}.agent-logo-wrap{display:flex;align-items:center;justify-content:center;width:132px;height:58px;position:relative;z-index:2}.agent-own-mark{display:grid;place-items:center;width:48px;height:48px;border:3px solid #7cf5dc;border-radius:14px;color:#7cf5dc;font-size:17px;letter-spacing:-.08em}.network-huduma .agent-back-top>.agent-own-mark{margin-right:18px}.network-airtel .agent-top{background:linear-gradient(135deg,#b90000,#ef1717)}.network-vodacom .agent-top{background:linear-gradient(135deg,#b50000,#ef2020)}.network-yas .agent-top{background:linear-gradient(135deg,#092f63,#1261a0 62%,#f4c400)}.network-halotel .agent-top{background:linear-gradient(135deg,#d84a00,#ff7800)}.network-mbeya .agent-top{background:linear-gradient(135deg,#850008,#e30613 65%,#ff3945)}.network-mbeya .agent-top img{width:150px;height:58px;mix-blend-mode:multiply;filter:contrast(1.15)}
.agent-body{position:relative;display:grid;grid-template-columns:126px 1fr;gap:18px;padding:20px 20px 12px}.agent-photo{width:116px;height:142px;border-radius:10px;overflow:hidden;background:#e9eef4;border:3px solid var(--c);display:flex;align-items:center;justify-content:center;font-size:9px;color:#667085;box-shadow:0 6px 16px rgba(0,0,0,.12)}.agent-photo img{width:100%;height:100%;object-fit:cover}.agent-details{font-size:10px;padding-top:2px}.agent-name{font-size:21px;font-weight:900;text-transform:uppercase;line-height:1.05;margin-bottom:9px;color:var(--d)}.agent-row{display:flex;border-bottom:1px solid rgba(20,30,45,.1);padding:4px 0;gap:8px}.agent-row b{width:86px;font-size:7px;text-transform:uppercase;color:#667085;letter-spacing:.04em}.agent-row span{font-weight:800;flex:1}.network-yas .agent-name{color:#0b4f91}.network-mbeya .agent-name{color:#b1000a}.agent-portrait-card{width:320px;height:520px;max-width:100%;box-sizing:border-box;position:relative;overflow:hidden;border-radius:22px;background:#f7fbfc;color:#123b5d;box-shadow:0 18px 45px rgba(0,0,0,.28);font-family:Arial,Helvetica,sans-serif;border:1px solid rgba(14,116,144,.24)}.portrait-header{height:112px;padding:20px 18px;background:linear-gradient(145deg,#123b5d,#0e7490 65%,#22c7a8);color:#fff}.portrait-brand{font-size:10px;font-weight:900;letter-spacing:.16em}.portrait-title{font-size:21px;font-weight:950;margin-top:18px}.portrait-subtitle{font-size:9px;letter-spacing:.12em;margin-top:5px;opacity:.82}.portrait-logo-box{display:flex;align-items:center;justify-content:space-between;padding:15px 18px 0;color:#0e7490;font-weight:950;font-size:10px;letter-spacing:.08em}.portrait-logo-box img{height:38px;width:92px;object-fit:contain}.portrait-photo{width:132px;height:154px;margin:14px auto 10px;border:4px solid #22c7a8;border-radius:14px;background:#e7f8f6;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#0e7490;font-size:9px;text-align:center;font-weight:900}.portrait-photo img{width:100%;height:100%;object-fit:cover}.portrait-name{text-align:center;color:#123b5d;font-size:19px;font-weight:950;text-transform:uppercase;padding:0 14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.portrait-fields{margin:16px 18px 0;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}.portrait-fields div{border-bottom:1px solid #cde9e8;padding-bottom:5px;min-width:0}.portrait-fields b{display:block;font-size:7px;color:#6b8792;letter-spacing:.08em}.portrait-fields span{display:block;font-size:10px;font-weight:900;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.portrait-footer{position:absolute;bottom:0;left:0;right:0;background:#123b5d;color:#fff;padding:10px 15px;display:flex;justify-content:space-between;font-size:7px;font-weight:900;letter-spacing:.04em}.portrait-back-content{padding:22px 20px;font-size:11px;line-height:1.4}.portrait-back-content h3{font-size:12px;color:#0e7490;margin:22px 0 8px}.portrait-back-content p{margin:8px 0}.portrait-qr-box{display:flex;flex-direction:column;align-items:center;gap:6px}.portrait-qr-box img{width:150px;height:150px;border:9px solid #fff;box-shadow:0 4px 14px #123b5d24}.portrait-qr-box span{font-size:9px;font-weight:900;letter-spacing:.12em;color:#0e7490}.portrait-verify{margin-top:20px;padding:12px;border-radius:12px;background:#e7f8f6;display:grid;gap:4px}.portrait-verify b{font-size:12px}.portrait-verify span{font-size:9px;font-weight:800}@media print{.agent-portrait-card{width:54mm!important;height:88mm!important;box-shadow:none!important}.portrait-header{height:19mm}.portrait-title{font-size:11pt;margin-top:4mm}.portrait-logo-box{padding-top:3mm}.portrait-photo{width:24mm;height:29mm;margin-top:3mm}.portrait-name{font-size:10pt}.portrait-fields{margin-top:3mm}.portrait-fields span{font-size:6pt}.portrait-footer{font-size:5pt}}.network-huduma .agent-top{background:linear-gradient(135deg,#123b5d,#0e7490 62%,#22c7a8)}.network-huduma .agent-name{color:#0e7490}.network-huduma .agent-footer{background:#123b5d}.agent-bottom{position:absolute;left:0;right:0;bottom:0;height:39px;padding:0 18px;font-size:7px;display:flex;justify-content:space-between;align-items:center;background:#fff;color:#5b6472;border-top:5px solid var(--c)}.agent-sign{border-top:1px solid #667085;padding-top:3px;text-align:center;width:135px;font-size:6px}.network-vodacom .agent-bottom{background:#171717;color:#fff}.network-yas .agent-bottom{background:#fff8cf}.network-halotel .agent-bottom{background:#fff0e5}.network-mbeya .agent-bottom{background:#fff0f1}
.agent-back-top{height:78px}.agent-back-body{position:relative;padding:14px 18px 8px;display:grid;grid-template-columns:1fr 116px;gap:14px}.agent-rules{font-size:8px;line-height:1.25}.agent-rules h4{margin:0 0 7px;font-size:11px}.agent-rule{display:flex;gap:6px;margin:6px 0}.agent-rule i{width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--c);color:#fff;font-style:normal;font-size:8px;flex:0 0 15px}.agent-qr{width:104px;height:104px;object-fit:contain;background:#fff;border:5px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,.16)}.agent-back-info{margin:0 18px 0;background:var(--accent);border-radius:9px;padding:8px;display:grid;grid-template-columns:1fr 1fr;gap:5px 12px;font-size:7px}.agent-back-info b{display:block;color:#667085;font-size:6px;text-transform:uppercase;margin-bottom:2px}.agent-footer{position:absolute;bottom:0;left:0;right:0;background:var(--c);color:#fff;text-align:center;font-size:7px;font-weight:800;padding:6px}.network-yas .agent-footer{background:#1261A0}.network-vodacom .agent-footer{background:#171717}.network-halotel .agent-footer{background:#e85b00}.network-mbeya .agent-footer{background:#c9000c}.agent-note{margin-top:14px;font-size:12px;opacity:.7}
@media(max-width:900px){.agent-id-layout{grid-template-columns:1fr}.agent-id-form{position:static}.agent-previews{grid-template-columns:minmax(320px,1fr)}.agent-card{transform-origin:top left;scale:.82;margin-bottom:-60px}}@media print{body *{visibility:hidden!important}.agent-id-page,.agent-id-page *{visibility:visible!important}.agent-id-page{position:absolute!important;left:0!important;top:0!important;width:100%!important;max-width:none!important}.agent-id-head,.agent-id-form,.agent-note,.agent-side-title{display:none!important}.agent-previews{display:flex!important;gap:12mm!important;overflow:visible!important}.agent-card{width:85.6mm!important;height:53.98mm!important;box-shadow:none!important;transform:none!important;scale:1!important}.agent-previews>div{display:block!important}}
`}</style>
    <div className="agent-id-head"><div><span className="overline">HUDUMA YA KITAMBULISHO</span><h1>KITAMBULISHO CHA WAKALA</h1><p>Chagua mtandao kwa kitambulisho cha usajili wa laini, au <b>MBEYA ONE</b> kwa kitambulisho cha <b>LIPA KWA SIMU AIRTEL</b>.</p></div></div>
    <div className="agent-id-layout">
      <section className="agent-id-form">
        <h3>Taarifa za Kitambulisho</h3>
        <div className="agent-template-choice" role="group" aria-label="Aina ya kitambulisho"><span className="agent-template-chip">KITAMBULISHO CHA MTANDAO</span><span className="agent-template-chip agent-template-chip--portrait">KITAMBULISHO CHA HUDUMA</span></div><p className="agent-choice-note">Jaza taarifa mara moja; miundo yote miwili inasasishwa pamoja.</p><div className="agent-network">{(Object.keys(NETWORKS).filter((n) => n !== "Huduma za Mtandaoni") as Network[]).map((n)=><button type="button" key={n} className={network===n?"active":""} onClick={()=>setNetwork(n)}>{n==="Mbeya One Company Limited"?"MBEYA ONE":n}</button>)}</div>
        <label className="agent-field"><span>Picha ya Wakala</span><input ref={fileRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>setPhoto(String(r.result));r.readAsDataURL(f)}}/></label>
        <label className="agent-field"><span>Jina Kamili</span><input value={name} onChange={e=>setName(e.target.value)} /></label>
        <label className="agent-field"><span>Agent ID / Code</span><input value={agentId} onChange={e=>setAgentId(e.target.value)} /></label>
        <label className="agent-field"><span>Namba ya Simu</span><input inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} /></label>
        <label className="agent-field"><span>Agent Type</span><select value={type} onChange={e=>setType(e.target.value)}><option>Freelancer</option><option>Team Leader</option><option>Supervisor</option><option>Authorized Agent</option></select></label>
        <label className="agent-field"><span>Mkoa</span><input value={region} onChange={e=>setRegion(e.target.value)} /></label>
        <label className="agent-field"><span>Wilaya</span><input value={district} onChange={e=>setDistrict(e.target.value)} /></label>
        <label className="agent-field"><span>Kata / Eneo</span><input value={area} onChange={e=>setArea(e.target.value)} /></label>
        <label className="agent-field"><span>Tarehe ya Kutolewa</span><input type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)} /></label>
        <div className="agent-buttons"><button className="button button--green" onClick={()=>fileRef.current?.click()}><Upload size={16}/> Picha</button><button className="button" onClick={reset}><RotateCcw size={16}/> Anza upya</button></div>
        <div className="agent-buttons"><button className="button button--green" onClick={()=>void downloadCards("front")}><Download size={16}/> Pakua Mbele (PNG)</button><button className="button button--green" onClick={()=>void downloadCards("back")}><Download size={16}/> Pakua Nyuma (PNG)</button></div>
        <button className="button button--green button--wide" style={{marginTop:8}} onClick={()=>void downloadCards("both")}><Download size={16}/> Pakua Vitambulisho Vyote (PNG)</button>
        <p className="agent-note">Tarehe ya kuisha huwekwa moja kwa moja kuwa mwaka mmoja baada ya tarehe ya kutolewa.</p>
      </section>

      <section className="agent-preview-stage">
        <div className="agent-preview-intro"><span className="overline">MUONEKANO WA VITAMBULISHO VIWILI</span><p>Kushoto: kitambulisho cha kulala. Kulia: kitambulisho cha kusimama. Nembo na rangi hubadilika kulingana na mtandao uliochagua.</p></div>
        <div className="agent-previews agent-dual-previews">
          <div className="agent-preview-column agent-preview-column--landscape"><p className="agent-side-title">01 · STYLE YA KULALA</p><FrontCard cfg={selectedNetworkCfg} network={network} photo={photo} name={name} agentId={agentId} phone={phone} type={type} region={region} district={district} area={area} issueDate={issueDate}/><p className="agent-side-title agent-back-label">UPANDE WA NYUMA</p><BackCard cfg={selectedNetworkCfg} network={network} qr={qr} name={name} agentId={agentId} phone={phone} region={region} district={district} area={area} issueDate={issueDate}/></div>
          <div className="agent-preview-column agent-preview-column--portrait"><p className="agent-side-title">02 · STYLE YA KUSIMAMA</p><PortraitFrontCard cfg={cfg} network={network} photo={photo} name={name} agentId={agentId} phone={phone} type={type} region={region} district={district} area={area} issueDate={issueDate}/><p className="agent-side-title agent-back-label">UPANDE WA NYUMA</p><PortraitBackCard cfg={cfg} network={network} qr={qr} name={name} agentId={agentId} phone={phone} region={region} district={district} area={area} issueDate={issueDate}/></div>
        </div>
      </section>
    </div>
  </main>;
}

function PortraitFrontCard({ cfg, network, photo, name, agentId, phone, type, region, district, area, issueDate }: any) {
  return <div className="agent-portrait-card" style={{"--c":cfg.color,"--d":cfg.dark} as React.CSSProperties}>
    <div className="portrait-header"><div className="portrait-brand">HUDUMA ZA MTANDAONI</div><div className="portrait-title">KITAMBULISHO CHA WAKALA</div><div className="portrait-subtitle">AUTHORIZED AGENT CARD</div></div>
    <div className="portrait-logo-box">{cfg.logo ? <img src={cfg.logo} alt={network}/> : <strong className="agent-own-mark">HM</strong>}<span>{network.toUpperCase()}</span></div>
    <div className="portrait-photo">{photo ? <img src={photo} alt="Wakala"/> : <span>PICHA YA WAKALA</span>}</div>
    <div className="portrait-name">{name || "JINA LA WAKALA"}</div>
    <div className="portrait-fields"><div><b>AGENT ID</b><span>{agentId || "—"}</span></div><div><b>SIMU</b><span>{phone || "—"}</span></div><div><b>AINA</b><span>{type}</span></div><div><b>MTANDAO</b><span>{network}</span></div><div><b>MKOA</b><span>{region}</span></div><div><b>WILAYA / ENEO</b><span>{district} / {area}</span></div></div>
    <div className="portrait-footer"><span>ISSUED: {fmt(issueDate)}</span><span>EXPIRES: {fmt(expiry(issueDate))}</span></div>
  </div>;
}
function PortraitBackCard({ cfg, network, qr, name, agentId, phone, region, district, area, issueDate }: any) {
  return <div className="agent-portrait-card portrait-back" style={{"--c":cfg.color,"--d":cfg.dark} as React.CSSProperties}>
    <div className="portrait-header"><div className="portrait-brand">HUDUMA ZA MTANDAONI</div><div className="portrait-title">UTHIBITISHO WA WAKALA</div><div className="portrait-subtitle">{network.toUpperCase()} NETWORK</div></div>
    <div className="portrait-back-content"><div className="portrait-qr-box"><img src={qr} alt="QR Code"/><span>SCAN TO VERIFY</span></div><h3>MASHARTI YA MATUMIZI</h3><p>Kitambulisho hiki ni cha matumizi ya wakala aliyeidhinishwa pekee.</p><p>Wakala anatakiwa kufuata sheria na taratibu za mtandao husika.</p><p>Usikopeshe kitambulisho hiki wala kutumia taarifa za mteja kinyume cha sheria.</p><div className="portrait-verify"><b>{name || "JINA LA WAKALA"}</b><span>{agentId || "—"} · {phone || "—"}</span><span>{region || "—"} · {district || "—"} / {area || "—"}</span></div></div>
    <div className="portrait-footer"><span>HUDUMA ZA MTANDAONI</span><span>{network.toUpperCase()}</span></div>
  </div>;
}
function FrontCard({ cfg, network, photo, name, agentId, phone, type, region, district, area, issueDate }: any) {
  return <div className={`agent-card network-${cfg.pattern}`} style={{"--c":cfg.color,"--d":cfg.dark} as React.CSSProperties}>
    {cfg.logo && <img className="agent-watermark-logo" src={cfg.logo} alt="" aria-hidden="true"/>}
    <div className="agent-top">
      <div><div className="agent-brand">{cfg.slogan}</div><div className="agent-title">{network==="Mbeya One Company Limited"?"LIPA KWA SIMU AIRTEL":cfg.pattern === "huduma" ? "AUTHORIZED AGENT ID" : "SIM REGISTRATION AGENT"}</div></div>
      <div className="agent-logo-wrap">{cfg.logo ? <img src={cfg.logo} alt={network}/> : <strong className="agent-own-mark">HM</strong>}</div>
    </div>
    <div className="agent-body">
      <div className="agent-photo">{photo?<img src={photo} alt="Wakala"/>:<span>PICHA YA WAKALA</span>}</div>
      <div className="agent-details">
        <div className="agent-name">{name||"JINA LA WAKALA"}</div>
        <div className="agent-row"><b>Agent ID</b><span>{agentId||"—"}</span></div>
        <div className="agent-row"><b>Phone</b><span>{phone||"—"}</span></div>
        <div className="agent-row"><b>Company</b><span>{network==="Mbeya One Company Limited"?"Mbeya One Company Limited":cfg.slogan}</span></div>
        <div className="agent-row"><b>Type</b><span>{type}</span></div>
        <div className="agent-row"><b>Region</b><span>{region}</span></div>
        <div className="agent-row"><b>Area</b><span>{district} / {area}</span></div>
        <div className="agent-row"><b>Valid until</b><span>{fmt(expiry(issueDate))}</span></div>
      </div>
    </div>
    <div className="agent-bottom"><div className="agent-sign">AGENT SIGNATURE</div><div className="agent-sign">AUTHORIZED OFFICER</div></div>
  </div>;
}

function BackCard({ cfg, network, qr, name, agentId, phone, region, district, area, issueDate }: any) {
  return <div className={`agent-card network-${cfg.pattern}`} style={{"--c":cfg.color,"--d":cfg.dark,"--accent":cfg.accent} as React.CSSProperties}>
    {cfg.logo && <img className="agent-watermark-logo" src={cfg.logo} alt="" aria-hidden="true"/>}
    <div className="agent-top agent-back-top">
      <div><div className="agent-brand">{cfg.slogan}</div><div className="agent-title">{network==="Mbeya One Company Limited"?"KITAMBULISHO CHA LIPA KWA SIMU":cfg.pattern === "huduma" ? "KITAMBULISHO CHA HUDUMA ZA MTANDAONI" : "KITAMBULISHO CHA WAKALA"}</div></div>
      {cfg.logo ? <img src={cfg.logo} alt={network}/> : <strong className="agent-own-mark">HM</strong>}
    </div>
    <div className="agent-back-body">
      <div className="agent-rules">
        <h4>MUHIMU KWA MTUMIAJI WA KITAMBULISHO</h4>
        <div className="agent-rule"><i>✓</i><span>Kitambulisho hiki ni mali ya kampuni na kinatumika na wakala aliyeidhinishwa pekee.</span></div>
        <div className="agent-rule"><i>✓</i><span>Wakala anatakiwa kufuata sheria, taratibu na masharti ya mtandao husika.</span></div>
        <div className="agent-rule"><i>!</i><span>Hairuhusiwi kukopesha kitambulisho au kutumia taarifa za mteja kinyume cha sheria.</span></div>
        <div className="agent-rule"><i>i</i><span>Kitambulisho kikionekana kimepotea au kuharibika, wasiliana na uongozi wa kampuni.</span></div>
      </div>
      <div><img className="agent-qr" src={qr} alt="QR Code"/><div style={{fontSize:7,textAlign:"center",marginTop:3}}>SCAN TO VERIFY</div></div>
    </div>
    <div className="agent-back-info">
      <div><b>Jina la Wakala</b>{name||"—"}</div><div><b>Agent Code</b>{agentId||"—"}</div>
      <div><b>Namba ya Simu</b>{phone||"—"}</div><div><b>Mkoa</b>{region||"—"}</div>
      <div><b>Wilaya / Eneo</b>{district} / {area}</div><div><b>Issue / Expiry</b>{fmt(issueDate)} / {fmt(expiry(issueDate))}</div>
    </div>
    <div className="agent-footer">{network==="Mbeya One Company Limited"?"MBEYA ONE COMPANY LIMITED • LIPA KWA SIMU AIRTEL • AUTHORIZED AGENT":cfg.footer}</div>
  </div>;
}
