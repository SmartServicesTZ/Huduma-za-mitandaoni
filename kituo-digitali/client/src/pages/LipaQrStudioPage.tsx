import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Printer, ShieldCheck } from "lucide-react";
import * as QRCode from "qrcode";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  buildLipaInfoQrPayload,
  normalizeLipaNumber,
  validateLipaCard,
  type LipaCardValues,
} from "@shared/lipaQrStudio";
import "./LipaQrStudioPage.css";

type FileFormat = "pdf" | "png";

const A5_WIDTH_PX = 1748;
const A5_WIDTH_MM = 148;
const A5_HEIGHT_MM = 210;

function asset(path: string) {
  return `${import.meta.env.BASE_URL}${path}`;
}

function makeFileStem(name: string, number: string) {
  const safeName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${safeName || "stika-yas"}-${number}`;
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
  const name = values.businessName.trim().toUpperCase() || "JINA LA BIASHARA";
  const nameFontSize = `${Math.max(2.8, Math.min(3.9, 96 / Math.max(name.length, 1)))}cqw`;

  return <article ref={ref} className="lq-artboard lq-sticker-artboard" data-lipa-export-page="sticker">
    <header className="lq-sticker-header">
      <img className="lq-tips-logo" src={asset("stika-yas/tips-logo.png")} alt="TIPS — Tanzania Instant Payments System" />
      <img className="lq-mixx-logo" src={asset("stika-yas/mixx-yas-logo.png")} alt="Mixx by Yas" />
    </header>
    <section className="lq-sticker-main">
      <h1 className="lq-sticker-title">Lipa kwa kuscan</h1>
      <div className="lq-sticker-qr-paper">
        {qrDataUrl ? <img src={qrDataUrl} alt="QR ya taarifa za biashara pekee, si QR ya malipo" /> : <span>Jaza namba na jina<br />kuona QR ya taarifa</span>}
      </div>
      <div className="lq-sticker-number">{values.lipaNumber || "NAMBA YA LIPA"}</div>
      <div className="lq-sticker-name" style={{ fontSize: nameFontSize }}>{name}</div>
      <p className="lq-sticker-subtitle">Lipa kutoka mitandao yote na Benki</p>
      <p className="lq-sticker-qr-notice">QR YA TAARIFA TU · SI QR YA MALIPO</p>
      <div className="lq-sticker-yellow-sweep" aria-hidden="true" />
      <img className="lq-lipa-logo" src={asset("stika-yas/lipa-kwasimu-logo.png")} alt="Lipa kwa simu" />
    </section>
  </article>;
});

export default function LipaQrStudioPage() {
  const [values, setValues] = useState<LipaCardValues>({ lipaNumber: "", businessName: "" });
  const [format, setFormat] = useState<FileFormat>("pdf");
  const [qrResult, setQrResult] = useState<{ payload: string; dataUrl: string } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const errors = useMemo(() => validateLipaCard(values), [values]);
  const isValid = Object.keys(errors).length === 0;
  const qrPayload = useMemo(() => isValid ? buildLipaInfoQrPayload(values) : "", [isValid, values]);
  const qrDataUrl = qrResult?.payload === qrPayload ? qrResult.dataUrl : "";

  useEffect(() => {
    let current = true;
    setQrResult(null);
    if (!qrPayload) {
      return () => { current = false; };
    }
    void QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "H", margin: 2, width: 520, color: { dark: "#111111", light: "#ffffff" } })
      .then((url) => { if (current) setQrResult({ payload: qrPayload, dataUrl: url }); })
      .catch(() => { if (current) setQrResult(null); });
    return () => { current = false; };
  }, [qrPayload]);

  const update = (field: keyof LipaCardValues, value: string) => {
    const next = field === "lipaNumber" ? normalizeLipaNumber(value) : value.slice(0, 32);
    setValues((previous) => ({ ...previous, [field]: next }));
  };

  const validateBeforeAction = () => {
    setShowErrors(true);
    if (!isValid || !qrDataUrl) {
      toast.error("Kamilisha namba na jina sahihi kabla ya kuendelea.");
      return false;
    }
    return true;
  };

  const exportFile = async () => {
    if (!validateBeforeAction()) return;
    const card = cardRef.current;
    if (!card) {
      toast.error("Hakikisho la stika halijawa tayari. Jaribu tena.");
      return;
    }
    setExporting(true);
    try {
      const canvas = await captureArtboard(card);
      const stem = makeFileStem(values.businessName, values.lipaNumber);
      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5", compress: true });
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, A5_WIDTH_MM, A5_HEIGHT_MM, undefined, "FAST");
        pdf.save(`${stem}.pdf`);
      } else {
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Imeshindikana kutengeneza faili la PNG.")), "image/png"));
        downloadBlob(blob, `${stem}.png`);
      }
      toast.success(`Stika ya A5 imeandaliwa kama ${format.toUpperCase()} yenye ubora wa kuchapisha.`);
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
        <span className="lq-brand-lockup"><span className="lq-brand-icon">L</span><span><strong>STIKA ZA <i>LIPA</i></strong><small>YAS · Hakikisho la moja kwa moja</small></span></span>
      </div>
      <section className="lq-editor-panel">
        <div className="lq-section-heading"><span>TAARIFA ZA STIKA</span><small>JAZA HAPA</small></div>
        <label className={`lq-field ${fieldError("lipaNumber") ? "has-error" : ""}`} htmlFor="lq-number">
          <span>Namba ya Lipa</span>
          <input id="lq-number" inputMode="numeric" autoComplete="off" maxLength={12} placeholder="Tarakimu 5–12" value={values.lipaNumber} onChange={(event) => update("lipaNumber", event.target.value)} aria-invalid={Boolean(fieldError("lipaNumber"))} />
          {fieldError("lipaNumber") ? <small role="alert">{fieldError("lipaNumber")}</small> : <small>Andika namba ya biashara yako ya Yas.</small>}
        </label>
        <label className={`lq-field ${fieldError("businessName") ? "has-error" : ""}`} htmlFor="lq-business">
          <span>Jina kwenye stika <small>{values.businessName.length}/32</small></span>
          <input id="lq-business" maxLength={32} placeholder="Mfano: JUMANNE HAJI FUNDI" value={values.businessName} onChange={(event) => update("businessName", event.target.value)} aria-invalid={Boolean(fieldError("businessName"))} />
          {fieldError("businessName") && <small role="alert">{fieldError("businessName")}</small>}
        </label>
      </section>
      <section className="lq-editor-panel lq-output-panel">
        <div className="lq-section-heading"><span>PAKUA AU CHAPISHA</span></div>
        <div className="lq-choice-group" role="group" aria-label="Chagua aina ya faili">
          <button type="button" aria-pressed={format === "pdf"} className={format === "pdf" ? "is-active" : ""} onClick={() => setFormat("pdf")}>PDF · A5</button>
          <button type="button" aria-pressed={format === "png"} className={format === "png" ? "is-active" : ""} onClick={() => setFormat("png")}>PNG · A5</button>
        </div>
        <p className="lq-print-note">Faili ni A5, takriban 300 DPI. QR ndani ya stika hubeba jina na namba tu; haiwezi kupokea malipo.</p>
      </section>
      <div className="lq-disclaimer"><ShieldCheck size={16} /><p>Stika hii si hati rasmi ya TIPS au Yas. QR yake ni ya taarifa tu, si QR rasmi ya malipo.</p></div>
    </aside>

    <section className="lq-preview">
      <div className="lq-preview-toolbar">
        <div><span className="lq-preview-overline">HAKIKISHO LA MOJA KWA MOJA</span><strong>Muonekano wa stika</strong><small>A5 · 300 DPI</small></div>
        <div className="lq-toolbar-actions">
          <button type="button" className="lq-button lq-button-light" onClick={() => void exportFile()} disabled={!readyToDownload} aria-label={`Pakua ${format.toUpperCase()}`}><Download size={16} />{exporting ? "Inaandaa…" : `Pakua ${format.toUpperCase()}`}</button>
          <button type="button" className="lq-button lq-button-outline" onClick={printCard} disabled={!readyToDownload}><Printer size={16} />Chapisha</button>
        </div>
      </div>
      <div className="lq-preview-pages lq-print-root">
        <CardArtboard ref={cardRef} values={values} qrDataUrl={qrDataUrl} />
      </div>
      <div className="lq-preview-footnote"><ShieldCheck size={14} />QR ni ya taarifa tu, si ya malipo. Thibitisha malipo kwenye menyu rasmi ya Yas.</div>
    </section>

    <div className="lq-mobile-actions">
      <button type="button" className="lq-button lq-button-light" onClick={() => void exportFile()} disabled={!readyToDownload}><Download size={16} />{exporting ? "Inaandaa…" : `Pakua ${format.toUpperCase()}`}</button>
      <button type="button" className="lq-button lq-button-outline" onClick={printCard} disabled={!readyToDownload}><Printer size={16} />Chapisha</button>
    </div>
  </main>;
}
