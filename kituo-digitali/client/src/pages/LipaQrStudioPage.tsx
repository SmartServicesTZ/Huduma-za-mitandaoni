import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Download, Info, Printer, ShieldCheck, WalletCards } from "lucide-react";
import * as QRCode from "qrcode";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { consumeFirebaseTokens, getServiceTokenConfig } from "@/lib/firebase";
import {
  createTipsPaymentPayload,
  normalizeLipaNumber,
  validateLipaCard,
  type LipaCardValues,
} from "@shared/lipaQrStudio";
import "./LipaQrStudioPage.css";

type PageMode = "card-only" | "card-and-guide";
type FileFormat = "pdf" | "png";
type LipaNetwork = "voda" | "yas" | "airtel" | "halotel";

const LIPA_NETWORKS: Record<LipaNetwork, { label: string; stickerName: string }> = {
  voda: { label: "Vodacom M-Pesa", stickerName: "Pesa ni M-Pesa" },
  yas: { label: "Yas", stickerName: "Lipa kwa Yas" },
  airtel: { label: "Airtel Money", stickerName: "Lipa kwa Airtel Money" },
  halotel: { label: "Halotel", stickerName: "Lipa kwa Halotel" },
};



const A5_WIDTH_PX = 1748;
const A5_WIDTH_MM = 148;
const A5_HEIGHT_MM = 210;
const LIPA_ASSET_BASE = `${import.meta.env.BASE_URL}lipa-assets/`;

function makeFileStem(name: string, number: string) {
  const safeName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${safeName || "lipa-kadi"}-${number}`;
}

async function captureArtboard(element: HTMLElement) {
  await document.fonts?.ready;
  const width = element.getBoundingClientRect().width;
  if (!width) throw new Error("Hakikisho halijawa tayari.");

  // Wait for the exact logos and generated QR image shown in the live preview.
  await Promise.all(Array.from(element.querySelectorAll("img"), async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }
    if (typeof image.decode === "function") {
      await image.decode().catch(() => undefined);
    }
  }));

  // modern-screenshot uses the browser's SVG foreignObject renderer rather
  // than html2canvas's partial CSS renderer. This preserves gradients,
  // pseudo-elements, container units and the responsive preview styling.
  const { domToCanvas } = await import("modern-screenshot");
  return domToCanvas(element, {
    backgroundColor: "#ffffff",
    scale: A5_WIDTH_PX / width,
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const CardArtboard = forwardRef<HTMLElement, { values: LipaCardValues; qrDataUrl: string; network: LipaNetwork; watermarked: boolean }>(function CardArtboard({ values, qrDataUrl, network, watermarked }, ref) {
  const isYas = network === "yas";
  const isAirtel = network === "airtel";
  return <article ref={ref} className={`lq-artboard lq-card-artboard lq-card-artboard--${network}`} data-lipa-export-page="card" data-network={network}>
    <header className={`lq-card-header lq-card-header--${network}`}>
      <img className="lq-tips-logo-image" src={`${LIPA_ASSET_BASE}tips-logo-reference.png`} alt="TIPS — Tanzania Instant Payment System" />
      <div className={`lq-network-brand lq-network-brand--${network}`} aria-label={LIPA_NETWORKS[network].label}>
        <img src={`${import.meta.env.BASE_URL}${network === "voda" ? "lipa-assets/mpesa-header-reference.png" : network === "yas" ? "yas-logo.png" : network === "airtel" ? "airtel-logo.png" : "halotel-logo.png"}`} alt={LIPA_NETWORKS[network].label} />
      </div>
    </header>
    {isYas ? <section className="lq-yas-body">
      <img className="lq-network-watermark" src={`${import.meta.env.BASE_URL}yas-logo.png`} alt="" aria-hidden="true" />
      <h2>Lipa kwa kuscan</h2>
      <div className="lq-yas-qr">{qrDataUrl ? <img src={qrDataUrl} alt="QR ya TIPS" /> : <span>QR CODE</span>}</div>
      <strong className="lq-yas-number">{values.lipaNumber || "NAMBA YA LIPA"}</strong>
      <strong className="lq-yas-name">{values.businessName.trim().toUpperCase() || "JINA LA BIASHARA"}</strong>
      <p>Lipa kutoka mitandao yote na Benki</p>
      <div className="lq-yas-footer"><img className="lq-yas-official-footer-logo" src={`${import.meta.env.BASE_URL}yas-logo.png`} alt="Yas" /></div>
    </section> : isAirtel ? <section className="lq-airtel-body">
      <img className="lq-network-watermark" src={`${import.meta.env.BASE_URL}airtel-logo.png`} alt="" aria-hidden="true" />
      <h2>LIPA KUPITIA MTANDAO AU BENKI YOYOTE</h2>
      <div className="lq-airtel-qr">{qrDataUrl ? <img src={qrDataUrl} alt="QR ya TIPS" /> : <span>QR CODE</span>}</div>
      <div className="lq-airtel-fields">
        <label>LIPA NAMBA</label><strong className="lq-airtel-number">{values.lipaNumber || "NAMBA YA LIPA"}</strong>
        <label>JINA</label><strong className="lq-airtel-name">{values.businessName.trim().toUpperCase() || "JINA LA BIASHARA"}</strong>
      </div>
      <footer className="lq-airtel-footer">
        <div className="lq-network-logos" aria-label="Mitandao na benki zinazokubaliwa">
          <img src={`${import.meta.env.BASE_URL}vodacom-logo.png`} alt="Vodacom" />
          <img src={`${import.meta.env.BASE_URL}yas-logo.png`} alt="Yas" />
          <img src={`${import.meta.env.BASE_URL}airtel-logo.png`} alt="Airtel Money" />
          <img src={`${import.meta.env.BASE_URL}halotel-logo.png`} alt="Halotel" />
          <span className="lq-bank-mark"><Building2 aria-hidden="true" /> BENKI</span>
        </div>
        <strong>LIPA<small>KWA SIMU</small></strong>
      </footer>
    </section> : <section className={`lq-card-red lq-card-red--${network}`}>
      <img className="lq-network-watermark" src={`${import.meta.env.BASE_URL}${network === "voda" ? "vodacom-logo.png" : "halotel-logo.png"}`} alt="" aria-hidden="true" />
      {watermarked && <img className="lq-card-watermark-image" src={`${import.meta.env.BASE_URL}${network === "voda" ? "vodacom-logo.png" : "halotel-logo.png"}`} alt="" aria-hidden="true" />}
      <div className="lq-qr-frame"><div className="lq-qr-paper">{qrDataUrl ? <img src={qrDataUrl} alt="QR ya taarifa za Lipa namba na biashara" /> : <span className="lq-qr-placeholder">Jaza taarifa<br />kuona QR</span>}</div></div>
      <div className="lq-merchant-box">
        <strong className="lq-merchant-number">{values.lipaNumber || "Namba ya Lipa"}</strong>
        <span className="lq-merchant-name">{values.businessName.trim().toUpperCase() || "JINA LA BIASHARA"}</span>
      </div>
      <div className="lq-pay-banner"><strong>{LIPA_NETWORKS[network].stickerName}</strong></div>
      <p className="lq-card-subtitle">Lipa kutoka mitandao yote na benki</p>
    </section>}
  </article>;
});

const HowToPayArtboard = forwardRef<HTMLElement, { values: LipaCardValues; watermarked: boolean }>(function HowToPayArtboard({ values, watermarked }, ref) {
  return <article ref={ref} className="lq-artboard lq-guide-artboard" data-lipa-export-page="guide">
    <header className="lq-guide-header">
      {watermarked && <div className="lq-guide-watermark" aria-hidden="true" />}
      <span className="lq-guide-eyebrow">MWONGOZO HURU · LIPA NAMBA</span>
      <h2>Jinsi ya kufanya malipo<br />kwa Lipa Namba</h2>
      <div className="lq-guide-merchant-pill"><span>{values.businessName.trim().toUpperCase() || "JINA LA BIASHARA"}</span><b>{values.lipaNumber || "NAMBA YA LIPA"}</b></div>
    </header>
    <section className="lq-guide-main">
      <div className="lq-guide-top-grid">
        <article className="lq-guide-card lq-guide-card--mpesa">
          <span className="lq-guide-number">1</span>
          <div className="lq-network-heading"><strong>Vodacom M-Pesa</strong><span>Piga <b>*150*00#</b></span></div>
          <ol><li>Chagua <b>4</b> — LIPA kwa M-Pesa</li><li>Chagua <b>1</b> — LIPA kwa simu</li><li>Weka namba ya biashara na kiasi</li><li>Hakiki jina, kisha thibitisha</li></ol>
        </article>
        <div className="lq-guide-app-steps">
          <h3>Au tumia app rasmi ya mtandao wako</h3>
          <div className="lq-app-step"><b>A</b><span><strong>Fungua app</strong><small>Chagua huduma ya Lipa kwa biashara.</small></span></div>
          <div className="lq-app-step"><b>B</b><span><strong>Weka namba ya Lipa</strong><small>Hakiki jina na kiasi kabla ya kuthibitisha.</small></span></div>
          <p>QR kwenye kadi hii hutengenezwa moja kwa moja kutokana na taarifa za biashara ulizojaza.</p>
        </div>
      </div>
      <div className="lq-guide-network-grid">
        <article className="lq-guide-card"><span className="lq-guide-number">2</span><div className="lq-network-heading"><strong>Tigo Pesa</strong><span>Piga <b>*150*01#</b></span></div><ol><li>Chagua <b>5</b> — Lipa kwa simu</li><li>Chagua <b>3</b> — Mitandao mingine</li><li>Chagua M-Pesa, weka namba na kiasi</li><li>Hakiki taarifa, kisha weka PIN</li></ol></article>
        <article className="lq-guide-card"><span className="lq-guide-number">3</span><div className="lq-network-heading"><strong>Airtel Money</strong><span>Piga <b>*150*60#</b></span></div><ol><li>Chagua <b>5</b> — Lipia bili</li><li>Chagua <b>1</b> — Lipa kwa simu</li><li>Chagua <b>2</b> — Voda Lipa</li><li>Weka kiasi na namba ya kumbukumbu</li><li>Hakiki, kisha weka PIN</li></ol></article>
        <article className="lq-guide-card"><span className="lq-guide-number">4</span><div className="lq-network-heading"><strong>Mitandao mingine</strong><span>Lipa kwa biashara</span></div><ol><li>Fungua menyu ya huduma ya simu</li><li>Chagua Lipa kwa simu/biashara</li><li>Weka namba ya biashara na kiasi</li><li>Hakiki jina na uthibitishe</li></ol></article>
      </div>
    </section>
    <footer className="lq-guide-footer"><strong>Usimpe mtu PIN yako.</strong><span>Menyu na misimbo zinaweza kubadilika — hakiki na mtoa huduma wako kabla ya kuchapisha.</span></footer>
  </article>;
});

export default function LipaQrStudioPage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [entryStatus, setEntryStatus] = useState<"checking" | "ready" | "paid" | "failed">("checking");
  const [entryMessage, setEntryMessage] = useState("Inafungua huduma...");
  const entryRequestId = useRef(crypto.randomUUID());
  const outputUsed = useRef(false);
  const [values, setValues] = useState<LipaCardValues>({ lipaNumber: "", businessName: "", location: "", postalCode: "53000" });
  const [network, setNetwork] = useState<LipaNetwork>("voda");
  const [pageMode, setPageMode] = useState<PageMode>("card-only");
  const [format, setFormat] = useState<FileFormat>("pdf");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const guideRef = useRef<HTMLElement>(null);
  const errors = useMemo(() => validateLipaCard(values), [values]);
  const isValid = Object.keys(errors).length === 0;
  const paymentPayload = useMemo(() => { if (!isValid || network === "halotel") return ""; return createTipsPaymentPayload(values); }, [isValid, values, network]);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      setEntryStatus("failed");
      setEntryMessage("Ingia kwenye akaunti yako ili kutumia huduma hii.");
      return;
    }
    // Firebase Auth ndiyo sharti pekee la huduma; usisubiri profile ya Firestore.
    // Fungua studio mara moja. Tokeni zitakatwa tu mtumiaji anapoomba kupakua.
    setEntryStatus("ready");
    setEntryMessage("");
  }, [authLoading, firebaseUser]);

  useEffect(() => {
    let current = true;
    if (!paymentPayload) {
      setQrDataUrl("");
      return () => { current = false; };
    }
    void QRCode.toDataURL(paymentPayload, { errorCorrectionLevel: "M", margin: 4, width: 720, color: { dark: "#111111", light: "#ffffff" } })
      .then((url) => { if (current) setQrDataUrl(url); })
      .catch(() => { if (current) setQrDataUrl(""); });
    return () => { current = false; };
  }, [paymentPayload]);

  const update = (field: keyof LipaCardValues, value: string) => {
    const next = field === "lipaNumber" ? normalizeLipaNumber(value) : field === "businessName" ? value.slice(0, 25) : value;
    setValues((previous) => ({ ...previous, [field]: next }));
  };

  const validateBeforeAction = () => {
    setShowErrors(true);
    if (!isValid || !paymentPayload || !qrDataUrl) {
      toast.error("Kamilisha taarifa zote sahihi kabla ya kuendelea.");
      return false;
    }
    return true;
  };

  const exportFile = async () => {
    if (entryStatus !== "ready" || outputUsed.current) { toast.error("Huduma hii imeshatumika. Fungua tena kutengeneza stika nyingine."); return; }
    if (!validateBeforeAction()) return;
    const pages = [cardRef.current, ...(pageMode === "card-and-guide" ? [guideRef.current] : [])].filter((item): item is HTMLElement => Boolean(item));
    if (!pages.length) { toast.error("Hakikisho la kadi halijawa tayari. Jaribu tena."); return; }
    setExporting(true);
    try {
      // Hakikisha faili linaweza kutengenezwa kabla ya kukata tokeni.
      for (const page of pages) await captureArtboard(page);
      if (!firebaseUser) throw new Error("Ingia kwenye akaunti yako ili kupakua.");
      const config = await getServiceTokenConfig("stika-lipa");
      await consumeFirebaseTokens(firebaseUser.uid, {
        slug: "stika-lipa", name: config.name, tokenCost: config.tokenCost,
        kind: config.isFree || config.tokenCost === 0 ? "free" : "paid", tokenType: "huduma",
      }, entryRequestId.current);
      setEntryStatus("paid");
      // Subiri watermark ionekane kwenye preview kabla ya kutengeneza faili la mwisho.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const canvases: HTMLCanvasElement[] = [];
      for (const page of pages) canvases.push(await captureArtboard(page));
      const stem = makeFileStem(values.businessName, values.lipaNumber);
      if (format === "pdf") {
        const { PDFDocument } = await import("pdf-lib");
        const pdf = await PDFDocument.create();
        const pageWidth = 148 * 72 / 25.4;
        const pageHeight = 210 * 72 / 25.4;
        for (const canvas of canvases) {
          const image = await pdf.embedPng(canvas.toDataURL("image/png"));
          const page = pdf.addPage([pageWidth, pageHeight]);
          page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
        }
        const bytes = await pdf.save();
        const pdfBuffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(pdfBuffer).set(bytes);
        downloadBlob(new Blob([pdfBuffer], { type: "application/pdf" }), `${stem}.pdf`);
      } else {
        for (let index = 0; index < canvases.length; index += 1) {
          const canvas = canvases[index];
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Imeshindikana kutengeneza faili la PNG.")), "image/png"));
          const suffix = pageMode === "card-and-guide" ? (index === 0 ? "stika" : "maelekezo") : "stika";
          downloadBlob(blob, `${stem}-${suffix}.png`);
          if (index < canvases.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 450));
        }
      }
      outputUsed.current = true;
      toast.success(config.isFree || config.tokenCost === 0 ? "Faili limepakuliwa. Huduma hii ni bure." : `Faili limepakuliwa na tokeni ${config.tokenCost} zimekatwa.`);
      setLocation("/services");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kupakua faili. Jaribu tena.");
    } finally {
      setExporting(false);
    }
  };

  const printCard = () => {
    if (entryStatus !== "ready" || outputUsed.current) { toast.error("Pakua stika kwanza ili kukamilisha huduma na makato ya tokeni."); return; }
    if (!validateBeforeAction()) return;
    outputUsed.current = true;
    window.print();
    setLocation("/services");
  };

  const fieldError = (field: keyof LipaCardValues) => showErrors ? errors[field] : undefined;
  const readyToDownload = isValid && Boolean(qrDataUrl) && !exporting && entryStatus === "ready" && !outputUsed.current;

  if (entryStatus === "checking") return null;
  if (entryStatus === "failed") return <main className="lq-app"><section className="lq-editor-panel" style={{maxWidth:480,margin:"48px auto"}}><p role="alert">{entryMessage}</p><button type="button" onClick={()=>setLocation("/services")} className="lq-button lq-button-outline" style={{width:"100%",marginTop:18}}>RUDI KWENYE HUDUMA</button></section></main>;
  return <main className="lq-app">
    <aside className="lq-sidebar">
      <div className="lq-sidebar-top">
        <Link href="/services" className="lq-back-link"><ArrowLeft size={16} /> Rudi kwenye huduma</Link>
        <span className="lq-brand-lockup"><span className="lq-brand-icon">L</span><span><strong>STIKA ZA LIPA</strong><small>Tengeneza kadi ya Lipa</small></span></span>
      </div>
      <section className="lq-editor-panel">
        <div className="lq-section-heading"><span>TAARIFA ZA DUKA</span><small>JAZA HAPA</small></div>
        <div className="lq-field" role="group" aria-labelledby="lq-network-label">
          <span id="lq-network-label">Chagua mtandao wa stika</span>
          <div className="lq-network-options">
            <button type="button" className={`lq-network-option lq-network-option--voda ${network === "voda" ? "is-selected" : ""}`} aria-pressed={network === "voda"} onClick={() => setNetwork("voda")}>
              <span className="lq-network-logo lq-network-logo--voda"><img src={`${import.meta.env.BASE_URL}vodacom-logo.png`} alt="" /></span><span className="lq-network-option-copy"><strong>Vodacom</strong><small>M-Pesa</small></span><span className="lq-network-check" aria-hidden="true">✓</span>
            </button>
            <button type="button" className={`lq-network-option lq-network-option--yas ${network === "yas" ? "is-selected" : ""}`} aria-pressed={network === "yas"} onClick={() => setNetwork("yas")}>
              <span className="lq-network-logo lq-network-logo--yas"><img src={`${import.meta.env.BASE_URL}yas-logo.png`} alt="" /></span><span className="lq-network-option-copy"><strong>Yas</strong><small>Mixx by Yas</small></span><span className="lq-network-check" aria-hidden="true">✓</span>
            </button>
            <button type="button" className={`lq-network-option lq-network-option--airtel ${network === "airtel" ? "is-selected" : ""}`} aria-pressed={network === "airtel"} onClick={() => setNetwork("airtel")}>
              <span className="lq-network-logo lq-network-logo--airtel"><img src={`${import.meta.env.BASE_URL}airtel-logo.png`} alt="" /></span><span className="lq-network-option-copy"><strong>Airtel</strong><small>Money</small></span><span className="lq-network-check" aria-hidden="true">✓</span>
            </button>
            <button type="button" className={`lq-network-option lq-network-option--halotel ${network === "halotel" ? "is-selected" : ""}`} aria-pressed={network === "halotel"} onClick={() => setNetwork("halotel")}>
              <span className="lq-network-logo lq-network-logo--halotel"><img src={`${import.meta.env.BASE_URL}halotel-logo.png`} alt="" /></span><span className="lq-network-option-copy"><strong>Halotel</strong><small>HaloPesa</small></span><span className="lq-network-check" aria-hidden="true">✓</span>
            </button>
          </div>
          <small>{network === "halotel" ? "QR ya malipo ya Halotel bado haijawezeshwa." : "Muundo wa stika hubadilika kulingana na mtandao; jaza taarifa zako mwenyewe hapa chini."}</small>
        </div>
        <label className={`lq-field ${fieldError("lipaNumber") ? "has-error" : ""}`} htmlFor="lq-number">
          <span>Namba ya Lipa</span>
          <input id="lq-number" inputMode="numeric" autoComplete="off" maxLength={12} placeholder="Tarakimu 5–12" value={values.lipaNumber} onChange={(event) => update("lipaNumber", event.target.value)} aria-invalid={Boolean(fieldError("lipaNumber"))} />
          {fieldError("lipaNumber") ? <small role="alert">{fieldError("lipaNumber")}</small> : <small>Andika namba ya biashara uliyopewa na mtoa huduma.</small>}
        </label>
        <label className={`lq-field ${fieldError("businessName") ? "has-error" : ""}`} htmlFor="lq-business">
          <span>Jina la biashara <small>{values.businessName.length}/25</small></span>
          <input id="lq-business" maxLength={25} placeholder="Mfano: Duka la Amani" value={values.businessName} onChange={(event) => update("businessName", event.target.value)} aria-invalid={Boolean(fieldError("businessName"))} />
          {fieldError("businessName") && <small role="alert">{fieldError("businessName")}</small>}
        </label>
      </section>

      <section className="lq-editor-panel lq-output-panel">
        <div className="lq-section-heading"><span>MATOKEO</span></div>
        <div className="lq-choice-group" role="group" aria-label="Chagua kurasa za kadi">
          <button type="button" aria-pressed={pageMode === "card-only"} className={pageMode === "card-only" ? "is-active" : ""} onClick={() => setPageMode("card-only")}>Kadi pekee</button>
          <button type="button" aria-pressed={pageMode === "card-and-guide"} className={pageMode === "card-and-guide" ? "is-active" : ""} onClick={() => setPageMode("card-and-guide")}>Kadi + maelekezo</button>
        </div>
        <div className="lq-file-heading"><span>Aina ya faili</span></div>
        <div className="lq-choice-group" role="group" aria-label="Chagua aina ya faili">
          <button type="button" aria-pressed={format === "pdf"} className={format === "pdf" ? "is-active" : ""} onClick={() => setFormat("pdf")}>PDF</button>
          <button type="button" aria-pressed={format === "png"} className={format === "png" ? "is-active" : ""} onClick={() => setFormat("png")}>PNG</button>
        </div>
        <p className="lq-print-note">Ukubwa wa A5, ubora wa 300 DPI. Ukichagua kadi + maelekezo, PNG zitapakuliwa kama picha mbili tofauti.</p>
      </section>
      <div className="lq-disclaimer"><ShieldCheck size={16} /><p>Zana hii ni huru; haihusiani wala kuidhinishwa na Vodacom Tanzania, M-Pesa au TIPS. QR hutengenezwa kwa muundo unaoonekana kwenye mifano ya TIPS iliyotolewa. Hakiki kwa mtoa huduma kuwa taarifa za biashara zimewezeshwa kupokea malipo kwa QR.</p></div>
    </aside>

    <section className="lq-preview">
      <div className="lq-preview-toolbar">
        <div><span className="lq-preview-overline">HAKIKISHO LA MOJA KWA MOJA</span><strong>Muonekano wa kadi</strong><small>A5 · 300 DPI</small></div>
        <div className="lq-toolbar-actions">
          <button type="button" className="lq-button lq-button-light" onClick={() => void exportFile()} disabled={!readyToDownload} aria-label={`Pakua ${format.toUpperCase()}`}><Download size={16} />{exporting ? "Inaandaa…" : `Pakua ${format.toUpperCase()}`}</button>
          <button type="button" className="lq-button lq-button-outline" onClick={printCard} disabled={!readyToDownload}><Printer size={16} />Chapisha</button>
        </div>
      </div>
      <div className="lq-preview-pages lq-print-root">
        <CardArtboard ref={cardRef} values={values} qrDataUrl={qrDataUrl} network={network} watermarked={entryStatus === "paid"} />
        {pageMode === "card-and-guide" && <HowToPayArtboard ref={guideRef} values={values} watermarked={entryStatus === "paid"} />}
      </div>
      <div className="lq-preview-footnote"><Info size={14} />Hakikisha QR inasomwa na inaonyesha jina na namba sahihi kabla ya kuchapisha.</div>
    </section>

    <div className="lq-mobile-actions">
      <button type="button" className="lq-button lq-button-light" onClick={() => void exportFile()} disabled={!readyToDownload}><Download size={16} />{exporting ? "Inaandaa…" : `Pakua ${format.toUpperCase()}`}</button>
      <button type="button" className="lq-button lq-button-outline" onClick={printCard} disabled={!readyToDownload}><Printer size={16} />Chapisha</button>
    </div>
  </main>;
}
