import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Info, Printer, ShieldCheck, WalletCards } from "lucide-react";
import * as QRCode from "qrcode";
import { Link } from "wouter";
import { toast } from "sonner";
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

const CardArtboard = forwardRef<HTMLElement, { values: LipaCardValues; qrDataUrl: string; network: LipaNetwork }>(function CardArtboard({ values, qrDataUrl, network }, ref) {
  const isYas = network === "yas";
  const isAirtel = network === "airtel";
  return <article ref={ref} className={`lq-artboard lq-card-artboard lq-card-artboard--${network}`} data-lipa-export-page="card" data-network={network}>
    <header className={`lq-card-header lq-card-header--${network}`}>
      <img className="lq-tips-logo-image" src={`${LIPA_ASSET_BASE}tips-logo-reference.png`} alt="TIPS — Tanzania Instant Payment System" />
      <div className={`lq-network-brand lq-network-brand--${network}`} aria-label={LIPA_NETWORKS[network].label}>
        {isAirtel ? <><span className="lq-airtel-symbol">◉</span><span className="lq-airtel-wordmark"><b>airtel</b><small>money</small></span></> : isYas ? <span className="lq-mixx-wordmark"><b>mixx</b><small>By <i>yas</i></small></span> : network === "voda" ? <span className="lq-voda-lockup"><b className="lq-voda-symbol">◉</b><span><strong>vodacom</strong><small>M-PESA</small></span><b className="lq-voda-phone">▯</b></span> : <span>HALOTEL</span>}
      </div>
    </header>
    {isYas ? <section className="lq-yas-body">
      <h2>Lipa kwa kuscan</h2>
      <div className="lq-yas-qr">{qrDataUrl ? <img src={qrDataUrl} alt="QR ya TIPS" /> : <span>QR CODE</span>}</div>
      <strong className="lq-yas-number">{values.lipaNumber || "NAMBA YA LIPA"}</strong>
      <strong className="lq-yas-name">{values.businessName.trim().toUpperCase() || "JINA LA BIASHARA"}</strong>
      <p>Lipa kutoka mitandao yote na Benki</p>
      <div className="lq-yas-footer"><span className="lq-yas-yellow-shape"><b>Lipa</b><small>KWA SIMU</small></span></div>
    </section> : isAirtel ? <section className="lq-airtel-body">
      <h2>LIPA KUPITIA MTANDAO AU BENKI YOYOTE</h2>
      <div className="lq-airtel-qr">{qrDataUrl ? <img src={qrDataUrl} alt="QR ya TIPS" /> : <span>QR CODE</span>}</div>
      <div className="lq-airtel-fields">
        <label>LIPA NAMBA</label><strong className="lq-airtel-number">{values.lipaNumber || "NAMBA YA LIPA"}</strong>
        <label>JINA</label><strong className="lq-airtel-name">{values.businessName.trim().toUpperCase() || "JINA LA BIASHARA"}</strong>
      </div>
      <footer className="lq-airtel-footer">
        <div className="lq-network-logos"><b>mixx</b><b className="vodacom">◉</b><b className="halotel">halotel</b><b className="airtel-mini">◉</b></div>
        <strong>LIPA<small>KWA SIMU</small></strong>
      </footer>
    </section> : <section className="lq-card-red">
      <div className="lq-card-watermark" aria-hidden="true" />
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

const HowToPayArtboard = forwardRef<HTMLElement, { values: LipaCardValues }>(function HowToPayArtboard({ values }, ref) {
  return <article ref={ref} className="lq-artboard lq-guide-artboard" data-lipa-export-page="guide">
    <header className="lq-guide-header">
      <div className="lq-guide-watermark" aria-hidden="true" />
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
    if (!validateBeforeAction()) return;
    const pages = [cardRef.current, ...(pageMode === "card-and-guide" ? [guideRef.current] : [])].filter((item): item is HTMLElement => Boolean(item));
    if (!pages.length) {
      toast.error("Hakikisho la kadi halijawa tayari. Jaribu tena.");
      return;
    }
    setExporting(true);
    try {
      const canvases: HTMLCanvasElement[] = [];
      for (const page of pages) canvases.push(await captureArtboard(page));
      const stem = makeFileStem(values.businessName, values.lipaNumber);
      if (format === "pdf") {
        const { PDFDocument } = await import("pdf-lib");
        const pdf = await PDFDocument.create();
        const pageWidth = 148 * 72 / 25.4;
        const pageHeight = 210 * 72 / 25.4;
        for (const canvas of canvases) {
          const page = pdf.addPage([pageWidth, pageHeight]);
          const png = await pdf.embedPng(canvas.toDataURL("image/png"));
          page.drawImage(png, { x: 0, y: 0, width: pageWidth, height: pageHeight });
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
      toast.success(format === "png" && pageMode === "card-and-guide" ? "Picha mbili tofauti zimeandaliwa: stika na maelekezo." : `Faili la ${format.toUpperCase()} limeandaliwa kwa ubora wa kuchapisha wa A5.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kuandaa faili. Jaribu tena.");
    } finally {
      setExporting(false);
    }
  };

  const printCard = () => {
    if (!validateBeforeAction()) return;
    window.print();
  };

  const fieldError = (field: keyof LipaCardValues) => showErrors ? errors[field] : undefined;
  const readyToDownload = isValid && Boolean(qrDataUrl) && !exporting;

  return <main className="lq-app">
    <aside className="lq-sidebar">
      <div className="lq-sidebar-top">
        <Link href="/services" className="lq-back-link"><ArrowLeft size={16} /> Rudi kwenye huduma</Link>
        <span className="lq-brand-lockup"><span className="lq-brand-icon">L</span><span><strong>STIKA ZA LIPA</strong><small>Tengeneza kadi ya Lipa</small></span></span>
      </div>
      <section className="lq-editor-panel">
        <div className="lq-section-heading"><span>TAARIFA ZA DUKA</span><small>JAZA HAPA</small></div>
        <label className="lq-field" htmlFor="lq-network"><span>Chagua mtandao wa stika</span>
          <select id="lq-network" value={network} onChange={(event) => setNetwork(event.target.value as LipaNetwork)}>
            <option value="voda">Vodacom M-Pesa</option>
            <option value="yas">Yas</option>
            <option value="airtel">Airtel Money</option>
            <option value="halotel">Halotel</option>
          </select>
          <small>{network === "halotel" ? "QR ya malipo ya Halotel bado haijawezeshwa." : "Muundo wa stika hubadilika kulingana na mtandao; jaza taarifa zako mwenyewe hapa chini."}</small>
        </label>
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
        <CardArtboard ref={cardRef} values={values} qrDataUrl={qrDataUrl} network={network} />
        {pageMode === "card-and-guide" && <HowToPayArtboard ref={guideRef} values={values} />}
      </div>
      <div className="lq-preview-footnote"><Info size={14} />Hakikisha QR inasomwa na inaonyesha jina na namba sahihi kabla ya kuchapisha.</div>
    </section>

    <div className="lq-mobile-actions">
      <button type="button" className="lq-button lq-button-light" onClick={() => void exportFile()} disabled={!readyToDownload}><Download size={16} />{exporting ? "Inaandaa…" : `Pakua ${format.toUpperCase()}`}</button>
      <button type="button" className="lq-button lq-button-outline" onClick={printCard} disabled={!readyToDownload}><Printer size={16} />Chapisha</button>
    </div>
  </main>;
}
