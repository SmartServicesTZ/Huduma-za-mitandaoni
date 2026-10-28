import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, FileBadge, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { renderTinCertificateCanvas, type TinCertificateForm } from "@/lib/tinCertificateCanvas";
import { PDFDocument } from "pdf-lib";
import { triggerDownload } from "@/lib/downloadHistory";
import { useAuth } from "@/_core/hooks/useAuth";
import { consumeFirebaseTokens } from "@/lib/firebase";
import { serviceCatalog } from "../../../shared/catalog";

type FieldProps = { label: string; english?: string; children: React.ReactNode };

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const titleCase = (value: string) => value.toLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

function Field({ label, english, children }: FieldProps) {
  return <div className="license-field">
    <label><strong>{label}</strong>{english ? <small>{english}</small> : null}</label>
    {children}
  </div>;
}

export default function TINCertificatePage() {
  const { firebaseUser } = useAuth();
  const [paid, setPaid] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState<TinCertificateForm>({ name:"", tin:"", effectDate:localToday(), traLocation:"MANYARA", taxOffice:"BABATI TAX OFFICE", physicalLocation:"MAGUGU, BABATI DC", streetArea:"NGARENARO", commissioner:"Alfred T. Mregi" });
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const output = document.createElement("canvas");
        await renderTinCertificateCanvas(form, output);
        if (cancelled || !canvasRef.current) return;
        canvasRef.current.width = output.width;
        canvasRef.current.height = output.height;
        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, output.width, output.height);
        ctx.drawImage(output, 0, 0);
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Imeshindikana kuonyesha template.");
      }
    };
    void render();
    return () => { cancelled = true; };
  }, [form]);

  const set = (key: keyof TinCertificateForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setPaid(false);
    setRequestId(crypto.randomUUID());
  };

  const ensurePaid = async () => {
    if (paid) return;
    if (!firebaseUser?.uid) throw new Error("Ingia kwanza ili kulipia na kupakua cheti.");
    const service = serviceCatalog.find((item) => item.slug === "cheti-tin") ?? {
      slug: "cheti-tin", name: "TIN NUMBER CERTIFICATE", tokenCost: 2, kind: "paid" as const,
    };
    await consumeFirebaseTokens(firebaseUser.uid, service, requestId);
    setPaid(true);
  };

  const prepareDownloadCanvas = async () => {
    const output = document.createElement("canvas");
    await renderTinCertificateCanvas(form, output);

    // Usikate template ya TRA: border ya juu/chini na watermark ni sehemu ya cheti.
    // Toleo la zamani lilitumia cropY/cropBottom, jambo lililokata sehemu ya juu.
    return output;
  };

  const downloadPng = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const cropped = await prepareDownloadCanvas();
      await ensurePaid();
      const blob = await new Promise<Blob>((resolve, reject) => cropped.toBlob((value) => value ? resolve(value) : reject(new Error("Imeshindikana kutengeneza PNG.")), "image/png"));
      triggerDownload(blob, "tin-certificate.png", "PNG");
      toast.success("PNG imeandaliwa kupakuliwa. Angalia Downloads au Historia ndani ya dakika 30.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kutengeneza PNG.");
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const cropped = await prepareDownloadCanvas();
      await ensurePaid();
      const pngDataUrl = cropped.toDataURL("image/png");
      const pdf = await PDFDocument.create();
      const image = await pdf.embedPng(pngDataUrl);
      const page = pdf.addPage([cropped.width, cropped.height]);
      page.drawImage(image, { x: 0, y: 0, width: cropped.width, height: cropped.height });
      const bytes = await pdf.save({ useObjectStreams: true });
      const pdfBytes = new Uint8Array(bytes.byteLength);
      pdfBytes.set(bytes);
      const blob = new Blob([pdfBytes.buffer], { type: "application/pdf" });
      triggerDownload(blob, "tin-certificate.pdf", "PDF");
      toast.success("PDF imeandaliwa kupakuliwa. Angalia Downloads au Historia ndani ya dakika 30.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kutengeneza PDF.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="portal-main tin-page">
    <div className="license-topbar">
      <Link href="/" className="license-back"><ArrowLeft size={17} /> Rudi kwenye huduma</Link>
      <span className="license-security"><ShieldCheck size={16} /> PREVIEW</span>
    </div>

    <div className="page-heading">
      <span className="overline">HUDUMA YA TIN</span>
      <h1>CHETI CHA TIN</h1>
      <p>Jaza taarifa na uone Live Preview</p>
    </div>

    <div className="tin-layout">
      <section className="license-form-card">
        <div className="license-card-title"><FileBadge size={21} /><div><h2>Fomu ya Cheti cha TIN</h2><p>Badilisha taarifa uone Live Preview</p></div></div>

        <div className="license-form-section"><h3>1. Taarifa za Mlipakodi</h3><div className="license-form-grid">
          <Field label="Jina la Mlipakodi" english="Taxpayer Name"><input value={form.name} onChange={(e) => set("name", e.target.value.toUpperCase())} /></Field>
          <Field label="Namba ya TIN" english="TIN Number — 9 digits"><input inputMode="numeric" maxLength={11} value={form.tin} onChange={(e) => { const digits = e.target.value.replace(/\D/g, "").slice(0, 9); set("tin", digits.replace(/(\d{3})(?=\d)/g, "$1-")); }} placeholder="Ingiza TIN yako" /><small>Ingiza tarakimu 9 za TIN yako.</small></Field>
          <Field label="Tarehe ya Kuanza" english="With Effect From"><input type="date" value={form.effectDate} onChange={(e) => set("effectDate", e.target.value)} /></Field>
        </div></div>

        <div className="license-form-section"><h3>2. Taarifa za TRA</h3><div className="license-form-grid">
          <Field label="TRA Location" english="TRA Location"><input value={form.traLocation} onChange={(e) => set("traLocation", e.target.value.toUpperCase())} /></Field>
          <Field label="Tax Office" english="Tax Office"><input value={form.taxOffice} onChange={(e) => set("taxOffice", e.target.value.toUpperCase())} /></Field>
          <Field label="Physical Location" english="Physical Location"><input value={form.physicalLocation} onChange={(e) => set("physicalLocation", e.target.value.toUpperCase())} /></Field>
          <Field label="Street / Area" english="Street / Area"><input value={form.streetArea} onChange={(e) => set("streetArea", e.target.value.toUpperCase())} /></Field>
          <Field label="Commissioner" english="Commissioner General"><input value={form.commissioner} onChange={(e) => set("commissioner", titleCase(e.target.value))} /></Field>
        </div></div>

        <div className="tin-actions">
          <button className="button button--green" disabled={busy} onClick={() => void downloadPng()}><Download size={16} /> {busy ? "INATENGENEZA..." : "PAKUA PNG"}</button>
          <button className="button button--green" disabled={busy} onClick={() => void downloadPdf()}><Download size={16} /> {busy ? "INATENGENEZA..." : "PAKUA PDF"}</button>
        </div>
      </section>

      <section className="license-preview-card">
        <div className="license-card-title"><FileBadge size={21} /><div><h2>LIVE PREVIEW</h2><p>Preview ya cheti</p></div></div>
        <div className="license-preview-wrap" style={{ position: "relative" }}>
          <canvas ref={canvasRef} className="license-preview-canvas" />
          {!paid && <div aria-label="Watermark ya cheti cha TIN ambacho hakijalipiwa" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", overflow: "hidden", pointerEvents: "none", zIndex: 2 }}>
            <div style={{ transform: "rotate(-30deg)", border: "1px solid rgba(185,28,28,.65)", color: "rgba(185,28,28,.72)", background: "rgba(255,255,255,.12)", padding: "4px 8px", fontSize: "clamp(10px, 1.8vw, 18px)", fontWeight: 900, letterSpacing: "1px", textAlign: "center", lineHeight: 1.4, maxWidth: "95%" }}>BAADA YA DOWNLOAD NA KUKATWA TOKENI, MAELEZO HAYA YATAPOTEA</div>
          </div>}
        </div>
      </section>
    </div>
  </main>;
}
