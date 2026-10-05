import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, FileBadge, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { renderTinCertificateCanvas, type TinCertificateForm } from "@/lib/tinCertificateCanvas";
import { getPublicSiteSettings } from "@/lib/firebase";

type FieldProps = { label: string; english?: string; children: React.ReactNode };

function Field({ label, english, children }: FieldProps) {
  return <div className="license-field">
    <label><strong>{label}</strong>{english ? <small>{english}</small> : null}</label>
    {children}
  </div>;
}

export default function TINCertificatePage() {
  const [form, setForm] = useState<TinCertificateForm>({ name:"", tin:"", effectDate:"", traLocation:"", taxOffice:"", physicalLocation:"", streetArea:"", commissioner:"" });
  const [busy, setBusy] = useState(false);
  const [layout, setLayout] = useState<Record<string, {x:number;y:number;fontSize:number}>>({
    taxpayer:{x:480,y:620,fontSize:23}, tinValue:{x:506,y:760,fontSize:25}, effectValue:{x:390,y:835,fontSize:15}, locationValue:{x:390,y:875,fontSize:15}, officeValue:{x:390,y:915,fontSize:15}, physicalValue:{x:390,y:955,fontSize:15}, streetValue:{x:390,y:995,fontSize:15}, commissioner:{x:795,y:1110,fontSize:16}
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    void getPublicSiteSettings().then((settings) => {
      if (cancelled) return;
      const saved = (settings as any)?.templateLayouts?.tin;
      if (!saved || typeof saved !== "object") return;
      setLayout((current) => ({
        ...current,
        taxpayer: { ...current.taxpayer, x: Number(saved.taxpayer ?? current.taxpayer.x), y: Number(saved.taxpayerY ?? current.taxpayer.y), fontSize: Number(saved.taxpayerSize ?? current.taxpayer.fontSize) },
        tinValue: { ...current.tinValue, x: Number(saved.tinX ?? current.tinValue.x), y: Number(saved.tinY ?? current.tinValue.y), fontSize: Number(saved.tinSize ?? current.tinValue.fontSize) },
        effectValue: { ...current.effectValue, x: Number(saved.effectX ?? current.effectValue.x), y: Number(saved.effectY ?? current.effectValue.y) },
        locationValue: { ...current.locationValue, x: Number(saved.locationX ?? current.locationValue.x), y: Number(saved.locationY ?? current.locationValue.y) },
        officeValue: { ...current.officeValue, x: Number(saved.officeX ?? current.officeValue.x), y: Number(saved.officeY ?? current.officeValue.y) },
        physicalValue: { ...current.physicalValue, x: Number(saved.physicalX ?? current.physicalValue.x), y: Number(saved.physicalY ?? current.physicalValue.y) },
        streetValue: { ...current.streetValue, x: Number(saved.streetX ?? current.streetValue.x), y: Number(saved.streetY ?? current.streetValue.y) },
        commissioner: { ...current.commissioner, x: Number(saved.commissionerX ?? current.commissioner.x), y: Number(saved.commissionerY ?? current.commissioner.y) },
      }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const output = document.createElement("canvas");
        await renderTinCertificateCanvas(form, output, layout);
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
  }, [form, layout]);

  const set = (key: keyof TinCertificateForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const output = document.createElement("canvas");
      await renderTinCertificateCanvas(form, output, layout);
      const link = document.createElement("a");
      link.download = "tin-preview.png";
      link.href = output.toDataURL("image/png");
      link.click();
      toast.success("PNG imepakuliwa.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kutengeneza PNG.");
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
          <Field label="Namba ya TIN" english="TIN Number — 9 digits"><input inputMode="numeric" maxLength={11} value={form.tin} onChange={(e) => { const digits = e.target.value.replace(/\D/g, "").slice(0, 9); set("tin", digits.replace(/(\d{3})(?=\d)/g, "$1-")); }} placeholder="123-456-789" /><small>Format: 123-456-789</small></Field>
          <Field label="Tarehe ya Kuanza" english="With Effect From"><input type="date" value={form.effectDate} onChange={(e) => set("effectDate", e.target.value)} /></Field>
        </div></div>

        <div className="license-form-section"><h3>2. Taarifa za TRA</h3><div className="license-form-grid">
          <Field label="TRA Location" english="TRA Location"><input value={form.traLocation} onChange={(e) => set("traLocation", e.target.value.toUpperCase())} /></Field>
          <Field label="Tax Office" english="Tax Office"><input value={form.taxOffice} onChange={(e) => set("taxOffice", e.target.value.toUpperCase())} /></Field>
          <Field label="Physical Location" english="Physical Location"><input value={form.physicalLocation} onChange={(e) => set("physicalLocation", e.target.value.toUpperCase())} /></Field>
          <Field label="Street / Area" english="Street / Area"><input value={form.streetArea} onChange={(e) => set("streetArea", e.target.value.toUpperCase())} /></Field>
          <Field label="Commissioner" english="Commissioner General"><input value={form.commissioner} onChange={(e) => set("commissioner", e.target.value.toUpperCase())} /></Field>
        </div></div>

        <div className="tin-actions">
          <button className="button button--green" disabled={busy} onClick={() => void download()}><Download size={16} /> {busy ? "INATENGENEZA..." : "PAKUA PNG"}</button>
        </div>
      </section>

      <section className="license-preview-card">
        <div className="license-card-title"><FileBadge size={21} /><div><h2>LIVE PREVIEW</h2><p>Preview ya cheti</p></div></div>
        <div className="license-preview-wrap">
          <canvas ref={canvasRef} className="license-preview-canvas" />
        </div>
      </section>
    </div>
  </main>;
}
