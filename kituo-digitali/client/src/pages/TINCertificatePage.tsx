import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Code2, Download, FileBadge, RotateCcw, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { renderTinCertificateCanvas, type TinCertificateForm } from "@/lib/tinCertificateCanvas";
import { getPublicSiteSettings } from "@/lib/firebase";

const DEMO: TinCertificateForm = {
  name: "STAWARD JACKSON NJIWA",
  tin: "180-110-186",
  effectDate: "2026-10-04",
  traLocation: "NDIRGISHI",
  taxOffice: "MBALIZI TAX CENTRE",
  physicalLocation: "SWAYA",
  streetArea: "IBOWOLA",
  commissioner: "DEMO COMMISSIONER",
};

export default function TINCertificatePage() {
  const [form, setForm] = useState<TinCertificateForm>({ ...DEMO });
  const [busy, setBusy] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [layout, setLayout] = useState<Record<string, {x:number;y:number;fontSize:number}>>({
    taxpayer:{x:480,y:620,fontSize:23}, tinValue:{x:506,y:760,fontSize:25}, effectValue:{x:390,y:835,fontSize:15}, locationValue:{x:390,y:875,fontSize:15}, officeValue:{x:390,y:915,fontSize:15}, physicalValue:{x:390,y:955,fontSize:15}, streetValue:{x:390,y:995,fontSize:15}
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      link.download = "tin-demo-preview.png";
      link.href = output.toDataURL("image/png");
      link.click();
      toast.success("PNG ya demo imepakuliwa.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kutengeneza PNG.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="portal-main tin-page">
    <div className="license-topbar">
      <Link href="/" className="license-back"><ArrowLeft size={17} /> Rudi kwenye huduma</Link>
      <span className="license-security"><ShieldCheck size={16} /> DEMO / SAMPLE</span>
    </div>

    <div className="page-heading">
      <span className="overline">HUDUMA YA TIN</span>
      <h1>CHETI CHA TIN</h1>
      <p>Editable template + Live Preview</p>
      <small>Template, X/Y na font size hudhibitiwa na Admin kupitia Template Control; mabadiliko yaliyohifadhiwa hutumika hapa moja kwa moja.</small>
    </div>

    <div className="tin-demo-banner"><strong>DEMO ONLY</strong> — Hii ni preview ya interface; si cheti rasmi cha TRA.</div>

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
          <Field label="Commissioner" english="Demo name"><input value={form.commissioner} onChange={(e) => set("commissioner", e.target.value)} /></Field>
        </div></div>
        <div className="tin-layout-editor" style={{marginTop:18,padding:16,border:"1px solid #e5e7eb",borderRadius:14,background:"#f8fafc"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><strong>🎛️ DEMO TEMPLATE — X / Y CONTROL</strong><small>Badilisha kisha Live Preview ita-update</small></div>
          {Object.entries(layout).map(([key,v]) => <div key={key} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 90px",gap:8,alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:12,fontWeight:700}}>{key}</span>
            <input type="number" value={v.x} title="X" onChange={e=>setLayout(l=>({...l,[key]:{...l[key],x:Number(e.target.value)}}))}/>
            <input type="number" value={v.y} title="Y" onChange={e=>setLayout(l=>({...l,[key]:{...l[key],y:Number(e.target.value)}}))}/>
            <input type="number" value={v.fontSize} title="Font" onChange={e=>setLayout(l=>({...l,[key]:{...l[key],fontSize:Number(e.target.value)}}))}/>
          </div>)}
          <small>X = kushoto/kulia • Y = juu/chini • Font = ukubwa wa maandishi. Admin akihifadhi Template Control, Live Preview hii itatumia settings hizo.</small>
        </div>

        <div className="tin-actions">
          <button className="button button--dark" onClick={() => { setForm({ ...DEMO }); toast.success("Demo imewekwa."); }}><RotateCcw size={16} /> WEKA DEMO</button>
          <button className="button button--green" disabled={busy} onClick={() => void download()}><Download size={16} /> {busy ? "INATENGENEZA..." : "PAKUA PNG YA DEMO"}</button>
        </div>

        <div className="tin-code-hint"><Code2 size={18} /><div><strong>Unataka kubadilisha template?</strong><span>Hariri <code>client/src/lib/tinCertificateCanvas.ts</code>. Sehemu ya <code>TIN_TEMPLATE</code> ina X/Y, font size, weight na alignment.</span></div></div>
      </section>

      <section className="license-preview-card tin-preview-card">
        <div className="license-preview-heading"><div><span className="overline">LIVE PREVIEW</span><h2>Muonekano wa Template</h2></div><span className="license-draft-badge">DEMO</span></div>
        <div className="tin-paper"><canvas ref={canvasRef} className="tin-template-canvas" aria-label="TIN demo live preview" /></div>
        <p className="license-template-hint">Watermark ya DEMO / NOT OFFICIAL imefungwa kwenye renderer na itaendelea kwenye preview na PNG.</p>
      </section>
    </div>
  </main>;
}

function Field({ label, english, children }: { label: string; english: string; children: React.ReactNode }) {
  return <label className="license-field"><span><b>{label}</b><small>{english}</small></span>{children}</label>;
}
