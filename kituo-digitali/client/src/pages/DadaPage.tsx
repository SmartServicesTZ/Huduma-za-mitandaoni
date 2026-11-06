import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { useLocation } from "wouter";

type Side = "front" | "back";
type Field = "name1" | "name2" | "name3" | "nida" | "birthDate" | "gender";
type Position = { x: number; y: number; size: number };
const WIDTH = 1000;
const HEIGHT = 630;

const TEMPLATE_URLS: Record<Side, string> = {
  front: "https://raw.githubusercontent.com/steward-tz/wakala-point/main/public/Dada.png",
  back: "https://raw.githubusercontent.com/steward-tz/wakala-point/main/public/Kaka.png",
};

/*
 * ============================================================
 * SEHEMU YA KUBADILISHA CODE: NAFASI ZA TAARIFA KWENYE PICHA
 * ============================================================
 * x = kushoto/kulia; ongeza x kwenda kulia, punguza x kwenda kushoto.
 * y = juu/chini; ongeza y kwenda chini, punguza y kwenda juu.
 * size = ukubwa wa maandishi.
 * Badilisha namba hapa tu; hakuna setting ya kusogeza kwenye website.
 */
const TEXT_POSITIONS: Record<Side, Partial<Record<Field, Position>>> = {
  front: {
    name1: { x: 110, y: 205, size: 32 },
    name2: { x: 110, y: 260, size: 30 },
    name3: { x: 110, y: 315, size: 30 },
    nida: { x: 110, y: 390, size: 26 },
    birthDate: { x: 110, y: 445, size: 26 },
    gender: { x: 110, y: 500, size: 26 },
  },
  back: {
    name1: { x: 100, y: 210, size: 28 },
    nida: { x: 100, y: 285, size: 26 },
    birthDate: { x: 100, y: 360, size: 26 },
    gender: { x: 100, y: 415, size: 26 },
  },
};

const FIELD_LABELS: Record<Field, string> = {
  name1: "Jina la 1",
  name2: "Jina la 2",
  name3: "Jina la 3",
  nida: "Namba ya NIDA",
  birthDate: "Tarehe ya kuzaliwa",
  gender: "Jinsia",
};

function formatNida(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 20);
  return [digits.slice(0, 8), digits.slice(8, 13), digits.slice(13, 18), digits.slice(18, 20)]
    .filter(Boolean).join("-");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Picha haijapatikana"));
    image.src = src;
  });
}

export default function DadaPage() {
  const [, navigate] = useLocation();
  const frontCanvas = useRef<HTMLCanvasElement>(null);
  const backCanvas = useRef<HTMLCanvasElement>(null);
  const [frontTemplate, setFrontTemplate] = useState<HTMLImageElement | null>(null);
  const [backTemplate, setBackTemplate] = useState<HTMLImageElement | null>(null);
  const [message, setMessage] = useState("Inapakia picha za template...");
  const [name1, setName1] = useState("");
  const [name2, setName2] = useState("");
  const [name3, setName3] = useState("");
  const [nida, setNida] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");

  const values = useMemo<Record<Field, string>>(() => ({
    name1: name1.toUpperCase(),
    name2: name2.toUpperCase(),
    name3: name3.toUpperCase(),
    nida: formatNida(nida),
    birthDate,
    gender,
  }), [name1, name2, name3, nida, birthDate, gender]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([loadImage(TEMPLATE_URLS.front), loadImage(TEMPLATE_URLS.back)]).then(([front, back]) => {
      if (!active) return;
      if (front.status === "fulfilled") setFrontTemplate(front.value);
      if (back.status === "fulfilled") setBackTemplate(back.value);
      setMessage(front.status === "fulfilled" && back.status === "fulfilled"
        ? ""
        : "Picha ya template haijapakia. Hakikisha Dada.png na Kaka.png zipo kwenye repository, kisha refresh.");
    });
    return () => { active = false; };
  }, []);

  function draw(canvas: HTMLCanvasElement | null, template: HTMLImageElement | null, side: Side) {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    if (!template) return;
    context.drawImage(template, 0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#111827";
    context.textAlign = "left";

    (Object.keys(FIELD_LABELS) as Field[]).forEach((field) => {
      const position = TEXT_POSITIONS[side][field];
      const value = values[field];
      if (!position || !value) return;
      context.font = "600 " + position.size + "px Arial";
      context.fillText(value, position.x, position.y, 760);
    });

    // Alama hii hubaki wazi kwenye kila picha ya mfano.
    context.save();
    context.translate(WIDTH / 2, HEIGHT / 2);
    context.rotate(-Math.PI / 7);
    context.globalAlpha = 0.28;
    context.fillStyle = "#b91c1c";
    context.font = "bold 48px Arial";
    context.textAlign = "center";
    context.fillText("SAMPLE • SI KITAMBULISHO RASMI", 0, 0);
    context.restore();
  }

  useEffect(() => {
    draw(frontCanvas.current, frontTemplate, "front");
    draw(backCanvas.current, backTemplate, "back");
  }, [frontTemplate, backTemplate, values]);

  function download(side: Side) {
    const canvas = side === "front" ? frontCanvas.current : backCanvas.current;
    const template = side === "front" ? frontTemplate : backTemplate;
    if (!canvas || !template) {
      setMessage("Subiri template ipakie kwanza.");
      return;
    }
    const link = document.createElement("a");
    link.download = side === "front" ? "DADA-sample-mbele.png" : "DADA-sample-nyuma.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  const nidaDigits = nida.replace(/\D/g, "").length;

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px 36px", color: "var(--foreground, #172033)" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 18 }}>
        <ArrowLeft size={16} /> Rudi kwenye vipengele vingine
      </button>

      <header style={{ marginBottom: 22 }}>
        <span style={{ color: "#7c3aed", fontSize: 11, fontWeight: 900, letterSpacing: 1.8 }}>SMARTSERVICESTZ • ZANA YA PICHA</span>
        <h1 style={{ margin: "6px 0", fontSize: 30 }}>DADA</h1>
        <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>Jaza taarifa kwenye fomu hapa chini. Nafasi za maandishi zinadhibitiwa ndani ya code ya GitHub.</p>
      </header>

      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>1</span><div><h2 style={h2}>Taarifa za majina</h2><p style={subText}>Jaza majina yote matatu.</p></div></div>
        <div style={formGrid}>
          <label style={fieldLabel}>Jina la 1<input className="input" autoComplete="off" value={name1} onChange={(event) => setName1(event.target.value)} placeholder="Andika jina la kwanza" /></label>
          <label style={fieldLabel}>Jina la 2<input className="input" autoComplete="off" value={name2} onChange={(event) => setName2(event.target.value)} placeholder="Andika jina la pili" /></label>
          <label style={fieldLabel}>Jina la 3<input className="input" autoComplete="off" value={name3} onChange={(event) => setName3(event.target.value)} placeholder="Andika jina la tatu" /></label>
        </div>
      </section>

      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>2</span><div><h2 style={h2}>Namba ya NIDA</h2><p style={subText}>Ingiza tarakimu 20. Mfumo utaweka alama za mistari wenyewe.</p></div></div>
        <label style={fieldLabel}>Namba ya NIDA
          <input className="input" inputMode="numeric" autoComplete="off" value={formatNida(nida)} maxLength={23}
            onChange={(event) => setNida(event.target.value.replace(/\D/g, "").slice(0, 20))}
            placeholder="12345678-12345-12345-12" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: 1.1 }} />
        </label>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 7, color: "#64748b", fontSize: 12 }}>
          <span>Muundo: 8-5-5-2</span><strong style={{ color: nidaDigits === 20 ? "#15803d" : "#64748b" }}>{nidaDigits}/20</strong>
        </div>
      </section>

      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>3</span><div><h2 style={h2}>Tarehe na jinsia</h2><p style={subText}>Chagua tarehe kwenye kalenda.</p></div></div>
        <div style={formGrid}>
          <label style={fieldLabel}>Tarehe ya kuzaliwa<input className="input" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></label>
          <label style={fieldLabel}>Jinsia<select className="input" value={gender} onChange={(event) => setGender(event.target.value)}><option value="">Chagua jinsia</option><option value="M">Mke-M</option><option value="F">Mme-F</option></select></label>
        </div>
      </section>

      {message && <p role="status" style={statusBox}>{message}</p>}

      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>4</span><div><h2 style={h2}>Muonekano wa mfano</h2><p style={subText}>Taarifa zinazoonekana hapa zimewekewa alama ya SAMPLE.</p></div></div>
        <div style={previewGrid}>
          <div>
            <div style={previewHeader}><b>Template ya mbele — Dada.png</b><button className="button button--green" type="button" disabled={!frontTemplate} onClick={() => download("front")}><Download size={15} /> Pakua PNG</button></div>
            <div style={previewBox}><canvas ref={frontCanvas} width={WIDTH} height={HEIGHT} style={canvasStyle} />{!frontTemplate && <span style={emptyText}>Template ya mbele itatokea ikipakia</span>}</div>
          </div>
          <div>
            <div style={previewHeader}><b>Template ya nyuma — Kaka.png</b><button className="button button--green" type="button" disabled={!backTemplate} onClick={() => download("back")}><Download size={15} /> Pakua PNG</button></div>
            <div style={previewBox}><canvas ref={backCanvas} width={WIDTH} height={HEIGHT} style={canvasStyle} />{!backTemplate && <span style={emptyText}>Template ya nyuma itatokea ikipakia</span>}</div>
          </div>
        </div>
      </section>
      <p style={{ fontSize: 12, lineHeight: 1.6, color: "#64748b" }}>Picha zinazotengenezwa ni sampuli za majaribio tu, si kitambulisho rasmi wala hati ya serikali.</p>
    </main>
  );
}

const formPanel: React.CSSProperties = { padding: 18, border: "1px solid #e2e8f0", borderRadius: 18, marginBottom: 15, background: "var(--card, #fff)", boxShadow: "0 5px 20px rgba(15,23,42,.04)" };
const sectionHeading: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 };
const stepBadge: React.CSSProperties = { width: 34, height: 34, borderRadius: 12, display: "grid", placeItems: "center", flexShrink: 0, color: "#fff", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", fontWeight: 900 };
const h2: React.CSSProperties = { margin: 0, fontSize: 17, fontWeight: 850 };
const subText: React.CSSProperties = { margin: "3px 0 0", color: "#64748b", fontSize: 12 };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 14 };
const fieldLabel: React.CSSProperties = { display: "grid", gap: 8, fontSize: 13, fontWeight: 750 };
const statusBox: React.CSSProperties = { padding: 12, borderRadius: 12, background: "#fff7ed", color: "#9a3412", fontSize: 13 };
const previewGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 18 };
const previewHeader: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 9, fontSize: 13 };
const previewBox: React.CSSProperties = { position: "relative", width: "100%", aspectRatio: "1000 / 630", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 13, overflow: "hidden" };
const canvasStyle: React.CSSProperties = { display: "block", width: "100%", height: "100%" };
const emptyText: React.CSSProperties = { position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#64748b", fontSize: 13, pointerEvents: "none", textAlign: "center", padding: 12 };
