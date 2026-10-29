import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Info, Printer, ShieldCheck, WalletCards } from "lucide-react";
import * as QRCode from "qrcode";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  buildLipaInfoQrPayload,
  normalizeLipaNumber,
  TANZANIA_LIPA_LOCATIONS,
  validateLipaCard,
  type LipaCardValues,
} from "@shared/lipaQrStudio";
import "./LipaQrStudioPage.css";

type PageMode = "card-only" | "card-and-guide";
type FileFormat = "pdf" | "png";

const A5_WIDTH_PX = 1748;
const A5_WIDTH_MM = 148;
const A5_HEIGHT_MM = 210;

function makeFileStem(name: string, number: string) {
  const safeName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${safeName || "lipa-kadi"}-${number}`;
}

async function captureArtboard(element: HTMLElement) {
  await document.fonts?.ready;
  const { default: html2canvas } = await import("html2canvas");
  const width = element.getBoundingClientRect().width;
  if (!width) throw new Error("Hakikisho halijawa tayari.");
  return html2canvas(element, {
    backgroundColor: "#ffffff",
    logging: false,
    scale: A5_WIDTH_PX / width,
    useCORS: false,
    imageTimeout: 0,
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

const CardArtboard = forwardRef<HTMLElement, { values: LipaCardValues; qrDataUrl: string }>(function CardArtboard({ values, qrDataUrl }, ref) {
  return <article ref={ref} className="lq-artboard lq-card-artboard" data-lipa-export-page="card">
    <header className="lq-card-header">
      <div className="lq-tips-logo" aria-label="TIPS"><strong>TIPS</strong></div>
      <div className="lq-mpesa-logo" aria-label="Vodacom M-Pesa"><span className="lq-vodacom-mark">V</span><span><strong>M-PESA</strong><small>VODACOM</small></span></div>
    </header>
    <div className="lq-card-red">
      <div className="lq-qr-frame">
        <span className="lq-qr-corner lq-qr-tl" /><span className="lq-qr-corner lq-qr-tr" />
        <span className="lq-qr-corner lq-qr-bl" /><span className="lq-qr-corner lq-qr-br" />
        <div className="lq-qr-paper">
          {qrDataUrl ? <img src={qrDataUrl} alt="QR ya taarifa za Lipa namba na biashara" /> : <span className="lq-qr-placeholder">Jaza taarifa<br />kuona QR</span>}
        </div>
      </div>
      <div className="lq-merchant-box">
        <strong className="lq-merchant-number">{values.lipaNumber || "Namba ya Lipa"}</strong>
        <span className="lq-merchant-name">{values.businessName.trim().toUpperCase() || "JINA LA BIASHARA"}</span>
      </div>
      <div className="lq-pay-banner"><strong>Pesa ni M-Pesa</strong><small>Lipa kutoka mitandao yote na benki</small></div>
    </div>
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
          <p>QR kwenye kadi hii ni ya taarifa pekee; haiwezi kuanzisha malipo.</p>
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
  const [pageMode, setPageMode] = useState<PageMode>("card-only");
  const [format, setFormat] = useState<FileFormat>("pdf");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const guideRef = useRef<HTMLElement>(null);
  const errors = useMemo(() => validateLipaCard(values), [values]);
  const isValid = Object.keys(errors).length === 0;
  const qrPayload = useMemo(() => isValid ? buildLipaInfoQrPayload(values) : "", [isValid, values]);

  useEffect(() => {
    let current = true;
    if (!qrPayload) {
      setQrDataUrl("");
      return () => { current = false; };
    }
    void QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "H", margin: 2, width: 520, color: { dark: "#111111", light: "#ffffff" } })
      .then((url) => { if (current) setQrDataUrl(url); })
      .catch(() => { if (current) setQrDataUrl(""); });
    return () => { current = false; };
  }, [qrPayload]);

  const update = (field: keyof LipaCardValues, value: string) => {
    const next = field === "lipaNumber" ? normalizeLipaNumber(value) : field === "postalCode" ? value.replace(/\D/g, "").slice(0, 5) : field === "businessName" ? value.slice(0, 25) : value;
    setValues((previous) => ({ ...previous, [field]: next }));
  };

  const validateBeforeAction = () => {
    setShowErrors(true);
    if (!isValid || !qrDataUrl) {
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
        downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${stem}.pdf`);
      } else {
        const width = Math.max(...canvases.map((canvas) => canvas.width));
        const height = canvases.reduce((sum, canvas) => sum + canvas.height, 0);
        const combined = document.createElement("canvas");
        combined.width = width;
        combined.height = height;
        const context = combined.getContext("2d");
        if (!context) throw new Error("Imeshindikana kutengeneza picha.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        let top = 0;
        for (const canvas of canvases) {
          context.drawImage(canvas, 0, top);
          top += canvas.height;
        }
        const blob = await new Promise<Blob>((resolve, reject) => combined.toBlob((result) => result ? resolve(result) : reject(new Error("Imeshindikana kutengeneza faili la PNG.")), "image/png"));
        downloadBlob(blob, `${stem}.png`);
      }
      toast.success(`Faili la ${format.toUpperCase()} limeandaliwa kwa ubora wa kuchapisha wa A5.`);
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
        <span className="lq-brand-lockup"><span className="lq-brand-icon">L</span><span><strong>Lipa <i>QR Studio</i></strong><small>Tengeneza kadi ya biashara</small></span></span>
      </div>
      <section className="lq-editor-panel">
        <div className="lq-section-heading"><span>TAARIFA ZA DUKA</span><small>JAZA HAPA</small></div>
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
        <label className={`lq-field ${fieldError("location") ? "has-error" : ""}`} htmlFor="lq-location">
          <span>Eneo</span>
          <select id="lq-location" value={values.location} onChange={(event) => update("location", event.target.value)} aria-invalid={Boolean(fieldError("location"))}>
            <option value="">Chagua eneo</option>
            {TANZANIA_LIPA_LOCATIONS.map((location) => <option value={location} key={location}>{location}</option>)}
          </select>
          {fieldError("location") && <small role="alert">{fieldError("location")}</small>}
        </label>
        <label className={`lq-field ${fieldError("postalCode") ? "has-error" : ""}`} htmlFor="lq-postal">
          <span>Namba ya posta</span>
          <input id="lq-postal" inputMode="numeric" maxLength={5} value={values.postalCode} onChange={(event) => update("postalCode", event.target.value)} aria-invalid={Boolean(fieldError("postalCode"))} />
          {fieldError("postalCode") ? <small role="alert">{fieldError("postalCode")}</small> : <small>53000 ni thamani ya mwanzo; hakiki msimbo sahihi wa eneo lako.</small>}
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
        <p className="lq-print-note">Ukubwa wa A5, ubora wa 300 DPI. PNG ya kurasa mbili hutoka kama picha moja ndefu.</p>
      </section>
      <div className="lq-disclaimer"><ShieldCheck size={16} /><p>Zana hii ni huru; haihusiani wala kuidhinishwa na Vodacom Tanzania, M-Pesa au TIPS. QR inayotengenezwa hapa ina taarifa tu, si QR rasmi ya malipo.</p></div>
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
        <CardArtboard ref={cardRef} values={values} qrDataUrl={qrDataUrl} />
        {pageMode === "card-and-guide" && <HowToPayArtboard ref={guideRef} values={values} />}
      </div>
      <div className="lq-preview-footnote"><Info size={14} />QR ni maandishi ya taarifa pekee; thibitisha malipo kwenye menyu rasmi ya mtandao wako.</div>
    </section>

    <div className="lq-mobile-actions">
      <button type="button" className="lq-button lq-button-light" onClick={() => void exportFile()} disabled={!readyToDownload}><Download size={16} />{exporting ? "Inaandaa…" : `Pakua ${format.toUpperCase()}`}</button>
      <button type="button" className="lq-button lq-button-outline" onClick={printCard} disabled={!readyToDownload}><Printer size={16} />Chapisha</button>
    </div>
  </main>;
}
