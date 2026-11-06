import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, ImagePlus, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";

type Side = "front" | "back";
type Field = "firstName" | "middleName" | "lastName" | "reference" | "birthDate" | "gender" | "signature";
type Position = { x: number; y: number; size: number };
const W = 1000, H = 630;
const TEMPLATE_URLS = {
  front: "https://raw.githubusercontent.com/steward-tz/wakala-point/main/public/Dada.png",
  back: "https://raw.githubusercontent.com/steward-tz/wakala-point/main/public/Kaka.png",
};
// BADILISHA HAPA ili kubadilisha nafasi za mwanzo za maandishi.
const DEFAULT_POSITIONS: Record<string, Position> = {
  "front.firstName": { x: 110, y: 205, size: 32 },
  "front.middleName": { x: 110, y: 260, size: 30 },
  "front.lastName": { x: 110, y: 315, size: 30 },
  "front.reference": { x: 110, y: 390, size: 26 },
  "front.birthDate": { x: 110, y: 445, size: 26 },
  "front.gender": { x: 110, y: 500, size: 26 },
  "front.signature": { x: 110, y: 565, size: 28 },
  "back.firstName": { x: 100, y: 210, size: 28 },
  "back.reference": { x: 100, y: 285, size: 26 },
  "back.birthDate": { x: 100, y: 360, size: 26 },
  "back.signature": { x: 100, y: 445, size: 28 },
};
const LABELS: Record<Field, string> = {
  firstName: "Jina la kwanza", middleName: "Jina la kati", lastName: "Jina la mwisho",
  reference: "Namba ya kumbukumbu", birthDate: "Tarehe ya kuzaliwa", gender: "Jinsia", signature: "Sahihi",
};
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Picha haijapatikana"));
    img.src = src;
  });
}

export default function DadaPage() {
  const [, navigate] = useLocation();
  const frontCanvas = useRef<HTMLCanvasElement>(null), backCanvas = useRef<HTMLCanvasElement>(null);
  const [frontTemplate, setFrontTemplate] = useState<HTMLImageElement | null>(null);
  const [backTemplate, setBackTemplate] = useState<HTMLImageElement | null>(null);
  const [message, setMessage] = useState("Subiri Dada.png na Kaka.png zipakiwe kutoka GitHub.");
  const [portrait, setPortrait] = useState<HTMLImageElement | null>(null);
  const [firstName, setFirstName] = useState(""), [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState(""), [reference, setReference] = useState("");
  const [birthDate, setBirthDate] = useState(""), [gender, setGender] = useState("");
  const [signature, setSignature] = useState("");
  const [positions, setPositions] = useState(DEFAULT_POSITIONS);
  const [side, setSide] = useState<Side>("front");
  const [field, setField] = useState<Field>("firstName");

  useEffect(() => {
    let alive = true;
    Promise.allSettled([loadImage(TEMPLATE_URLS.front), loadImage(TEMPLATE_URLS.back)]).then(([a, b]) => {
      if (!alive) return;
      if (a.status === "fulfilled") setFrontTemplate(a.value);
      if (b.status === "fulfilled") setBackTemplate(b.value);
      setMessage(a.status === "fulfilled" && b.status === "fulfilled" ? "" :
        "Template haijaonekana. Weka Dada.png na Kaka.png ndani ya public/ kwenye repository ya wakala-point, kisha refresh.");
    });
    return () => { alive = false; };
  }, []);

  const values = useMemo<Record<Field, string>>(() => ({
    firstName: firstName.toUpperCase(), middleName: middleName.toUpperCase(), lastName: lastName.toUpperCase(),
    reference, birthDate, gender, signature,
  }), [firstName, middleName, lastName, reference, birthDate, gender, signature]);

  function draw(canvas: HTMLCanvasElement | null, template: HTMLImageElement | null, currentSide: Side) {
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (!template) return; // Canvas hubaki tupu mpaka template ipatikane.
    ctx.drawImage(template, 0, 0, W, H);
    const fields: Field[] = currentSide === "front"
      ? ["firstName", "middleName", "lastName", "reference", "birthDate", "gender", "signature"]
      : ["firstName", "reference", "birthDate", "signature"];
    ctx.fillStyle = "#111827"; ctx.textAlign = "left";
    fields.forEach((key) => {
      if (!values[key]) return;
      const p = positions[currentSide + "." + key];
      if (!p) return;
      ctx.font = key === "signature" ? "italic " + p.size + "px cursive" : "600 " + p.size + "px Arial";
      ctx.fillText(values[key], p.x, p.y, 760);
    });
    if (currentSide === "front" && portrait) ctx.drawImage(portrait, 735, 205, 170, 220);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 7);
    ctx.globalAlpha = 0.22; ctx.fillStyle = "#b91c1c"; ctx.font = "bold 48px Arial"; ctx.textAlign = "center";
    ctx.fillText("SAMPLE • SI KITAMBULISHO RASMI", 0, 0); ctx.restore();
  }

  useEffect(() => {
    draw(frontCanvas.current, frontTemplate, "front");
    draw(backCanvas.current, backTemplate, "back");
  }, [frontTemplate, backTemplate, portrait, values, positions]);

  async function chooseTemplate(which: Side, file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMessage("Chagua picha ya PNG au JPG."); return; }
    try {
      const img = await loadImage(URL.createObjectURL(file));
      if (which === "front") setFrontTemplate(img); else setBackTemplate(img);
      setMessage("");
    } catch { setMessage("Imeshindikana kufungua picha hiyo."); }
  }
  async function choosePortrait(file?: File) {
    if (!file) return;
    try { setPortrait(await loadImage(URL.createObjectURL(file))); }
    catch { setMessage("Picha ya mfano haijafunguka."); }
  }
  function updatePosition(patch: Partial<Position>) {
    const key = side + "." + field;
    setPositions((old) => ({ ...old, [key]: { ...old[key], ...patch } }));
  }
  function move(dx: number, dy: number) {
    const key = side + "." + field;
    setPositions((old) => ({ ...old, [key]: {
      ...old[key], x: Math.max(0, Math.min(W, old[key].x + dx)), y: Math.max(20, Math.min(H, old[key].y + dy)),
    } }));
  }
  function download(which: Side) {
    const canvas = which === "front" ? frontCanvas.current : backCanvas.current;
    const template = which === "front" ? frontTemplate : backTemplate;
    if (!canvas || !template) { setMessage("Weka template kwanza kabla ya kupakua."); return; }
    const link = document.createElement("a");
    link.download = which === "front" ? "DADA-mbele-sample.png" : "KAKA-nyuma-sample.png";
    link.href = canvas.toDataURL("image/png"); link.click();
  }

  const fields: Field[] = side === "front"
    ? ["firstName", "middleName", "lastName", "reference", "birthDate", "gender", "signature"]
    : ["firstName", "reference", "birthDate", "signature"];
  const current = positions[side + "." + field];

  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: 18, color: "var(--foreground, #172033)" }}>
    <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 16 }}><ArrowLeft size={16} /> Rudi kwenye huduma</button>
    <header style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: "#64748b" }}>SMARTSERVICESTZ • DESIGN TOOL</div>
      <h1 style={{ margin: "5px 0", fontSize: 30 }}>DADA</h1>
      <p style={{ margin: 0, color: "#64748b" }}>Pakia templates zako, jaza taarifa na rekebisha sehemu ya maandishi.</p>
    </header>

    <section style={grid2}>
      <label style={uploadBox}><ImagePlus size={20} /><b>Template ya mbele — Dada.png</b><small>Itajipakia kutoka GitHub; unaweza pia kuchagua faili hapa.</small>
        <input type="file" accept="image/*" onChange={(e) => chooseTemplate("front", e.target.files?.[0])} /></label>
      <label style={uploadBox}><ImagePlus size={20} /><b>Template ya nyuma — Kaka.png</b><small>Itajipakia kutoka GitHub; unaweza pia kuchagua faili hapa.</small>
        <input type="file" accept="image/*" onChange={(e) => chooseTemplate("back", e.target.files?.[0])} /></label>
    </section>
    {message && <p role="status" style={warning}>{message}</p>}

    <section style={panel}>
      <h2 style={heading}>1. Jaza taarifa</h2>
      <div style={formGrid}>
        <label>Jina la kwanza<input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
        <label>Jina la kati<input className="input" value={middleName} onChange={(e) => setMiddleName(e.target.value)} /></label>
        <label>Jina la mwisho<input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
        <label>Namba ya kumbukumbu<input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
        <label>Tarehe ya kuzaliwa<input className="input" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></label>
        <label>Jinsia<select className="input" value={gender} onChange={(e) => setGender(e.target.value)}><option value="">Chagua</option><option value="ME">ME</option><option value="KE">KE</option></select></label>
        <label>Sahihi<input className="input" value={signature} onChange={(e) => setSignature(e.target.value)} /></label>
        <label>Picha ya mfano<input className="input" type="file" accept="image/*" onChange={(e) => choosePortrait(e.target.files?.[0])} /></label>
      </div>
    </section>

    <section style={panel}>
      <h2 style={heading}>2. Rekebisha sehemu za taarifa</h2>
      <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>Chagua upande na taarifa. X/Y hubadilisha nafasi; mishale husogeza kwa hatua za pointi 5.</p>
      <div style={formGrid}>
        <label>Upande<select className="input" value={side} onChange={(e) => { setSide(e.target.value as Side); setField("firstName"); }}><option value="front">Mbele — Dada.png</option><option value="back">Nyuma — Kaka.png</option></select></label>
        <label>Taarifa<select className="input" value={field} onChange={(e) => setField(e.target.value as Field)}>{fields.map((f) => <option key={f} value={f}>{LABELS[f]}</option>)}</select></label>
        <label>X — kushoto/kulia<input className="input" type="number" value={current.x} onChange={(e) => updatePosition({ x: Number(e.target.value) })} /></label>
        <label>Y — juu/chini<input className="input" type="number" value={current.y} onChange={(e) => updatePosition({ y: Number(e.target.value) })} /></label>
        <label>Ukubwa wa maandishi<input className="input" type="number" min="8" max="100" value={current.size} onChange={(e) => updatePosition({ size: Number(e.target.value) })} /></label>
      </div>
      <div style={buttons}>
        <button className="button button--secondary" type="button" onClick={() => move(-5, 0)}>← Kushoto</button>
        <button className="button button--secondary" type="button" onClick={() => move(5, 0)}>Kulia →</button>
        <button className="button button--secondary" type="button" onClick={() => move(0, -5)}>↑ Juu</button>
        <button className="button button--secondary" type="button" onClick={() => move(0, 5)}>↓ Chini</button>
        <button className="button button--secondary" type="button" onClick={() => setPositions(DEFAULT_POSITIONS)}><RotateCcw size={15} /> Rudisha nafasi</button>
      </div>
    </section>

    <section style={panel}>
      <h2 style={heading}>3. Preview na kupakua</h2>
      <div style={{ display: "grid", gap: 22 }}>
        <div><div style={previewHead}><b>Mbele — Dada.png</b><button className="button button--green" type="button" onClick={() => download("front")} disabled={!frontTemplate}><Download size={16} /> Pakua PNG</button></div>
          <div style={preview}><canvas ref={frontCanvas} width={W} height={H} style={canvasStyle} />{!frontTemplate && <span style={empty}>Dada.png itaonekana hapa baada ya kupakiwa</span>}</div></div>
        <div><div style={previewHead}><b>Nyuma — Kaka.png</b><button className="button button--green" type="button" onClick={() => download("back")} disabled={!backTemplate}><Download size={16} /> Pakua PNG</button></div>
          <div style={preview}><canvas ref={backCanvas} width={W} height={H} style={canvasStyle} />{!backTemplate && <span style={empty}>Kaka.png itaonekana hapa baada ya kupakiwa</span>}</div></div>
      </div>
    </section>
    <p style={{ fontSize: 12, color: "#64748b" }}>Matokeo ni ya mfano tu, si kitambulisho rasmi wala hati ya serikali.</p>
  </main>;
}

const panel: React.CSSProperties = { padding: 16, border: "1px solid #dbe3ee", borderRadius: 16, marginBottom: 16, background: "var(--card, #fff)" };
const heading: React.CSSProperties = { margin: "0 0 14px", fontSize: 18 };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,210px),1fr))", gap: 12 };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 14, marginBottom: 18 };
const uploadBox: React.CSSProperties = { display: "grid", gap: 8, padding: 16, border: "1px dashed #94a3b8", borderRadius: 14, cursor: "pointer", background: "var(--card, #fff)" };
const warning: React.CSSProperties = { padding: 12, borderRadius: 10, background: "#fff7ed", color: "#9a3412" };
const buttons: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
const previewHead: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" };
const preview: React.CSSProperties = { position: "relative", width: "100%", aspectRatio: "1000 / 630", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 12, overflow: "hidden" };
const canvasStyle: React.CSSProperties = { display: "block", width: "100%", height: "100%" };
const empty: React.CSSProperties = { position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#64748b", fontSize: 14, pointerEvents: "none" };
