import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { useLocation } from "wouter";

type Side = "front" | "back";
type Field = "name1" | "name2" | "name3" | "nida" | "birthDate" | "gender";
type Position = { x: number; y: number; size: number };

const WIDTH = 1000;
const HEIGHT = 630;

// Inachukua templates kutoka kwenye public folda au repo yako
const TEMPLATE_URLS: Record<Side, string> = {
  front: `${import.meta.env.BASE_URL}id-mbele.png`,
  back: `${import.meta.env.BASE_URL}id-nyuma.png`,
};

// Nafasi na ukubwa wa maandishi kwenye canvas kwa kila upande
const TEXT_POSITIONS: Record<Side, Partial<Record<Field, Position>>> = {
  front: {
    name1: { x: 190, y: 272, size: 28 },
    name2: { x: 190, y: 326, size: 28 },
    name3: { x: 290, y: 326, size: 28 },
    nida: { x: 70, y: 215, size: 44 },
    birthDate: { x: 430, y: 394, size: 28 },
    gender: { x: 170, y: 452, size: 28 },
  },
  back: {
    nida: { x: 500, y: 200, size: 38 }, // Sehemu ya namba nyuma ya kadi kama ipo kwenye template
  },
};

const FIELD_LABELS: Record<Field, string> = {
  name1: "Jina la Kwanza",
  name2: "Jina la Kati",
  name3: "Jina la Mwisho",
  nida: "Namba ya NIDA",
  birthDate: "Tarehe ya Kuzaliwa",
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

export default function NidaTemplatePage() {
  const [, navigate] = useLocation();
  const frontCanvas = useRef<HTMLCanvasElement>(null);
  const backCanvas = useRef<HTMLCanvasElement>(null);
  
  const [frontTemplate, setFrontTemplate] = useState<HTMLImageElement | null>(null);
  const [backTemplate, setBackTemplate] = useState<HTMLImageElement | null>(null);
  const [portraitImage, setPortraitImage] = useState<HTMLImageElement | null>(null);
  
  const [message, setMessage] = useState("Inapakia template za kitambulisho...");
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
    birthDate: birthDate ? birthDate.toUpperCase() : "",
    gender: gender.toUpperCase(),
  }), [name1, name2, name3, nida, birthDate, gender]);

  // Kupakia templates za id-mbele.png na id-nyuma.png
  useEffect(() => {
    let active = true;
    Promise.allSettled([loadImage(TEMPLATE_URLS.front), loadImage(TEMPLATE_URLS.back)]).then(([front, back]) => {
      if (!active) return;
      if (front.status === "fulfilled") setFrontTemplate(front.value);
      if (back.status === "fulfilled") setBackTemplate(back.value);
      setMessage(front.status === "fulfilled" && back.status === "fulfilled"
        ? ""
        : "Templates hazikupatikana. Hakikisha id-mbele.png na id-nyuma.png zipo kwenye public folda.");
    });
    return () => { active = false; };
  }, []);

  // Kupakia picha ya uso (Passport size)
  function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => setPortraitImage(img);
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  // Kuchora taarifa kwenye Canvas kutumia template halisi
  function draw(canvas: HTMLCanvasElement | null, template: HTMLImageElement | null, side: Side) {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    if (!template) return;

    // 1. Chora template tupu kama msingi
    context.drawImage(template, 0, 0, WIDTH, HEIGHT);

    // 2. Chora maandishi ya fomu kwenye upande wa mbele
    if (side === "front") {
      context.fillStyle = "#000000";
      
      (Object.keys(FIELD_LABELS) as Field[]).forEach((field) => {
        const position = TEXT_POSITIONS.front[field];
        const value = values[field];
        if (!position || !value) return;
        
        context.font = `bold ${position.size}px Arial`;
        context.fillText(value, position.x, position.y, 700);
      });

      // Chora Picha ya Uso kwenye eneo lake maalum upande wa mbele
      const photoBox = { x: 685, y: 290, width: 205, height: 260 };
      if (portraitImage) {
        context.drawImage(portraitImage, photoBox.x, photoBox.y, photoBox.width, photoBox.height);
      }
    } 
    
    // 3. Chora upande wa nyuma kama kuna taarifa husika
    if (side === "back") {
      const nidaVal = values["nida"];
      if (nidaVal) {
        context.fillStyle = "#000000";
        context.font = "bold 38px monospace";
        context.textAlign = "center";
        context.fillText(nidaVal.replace(/-/g, ""), 500, 200);
      }
    }
  }

  useEffect(() => {
    draw(frontCanvas.current, frontTemplate, "front");
    draw(backCanvas.current, backTemplate, "back");
  }, [frontTemplate, backTemplate, values, portraitImage]);

  function download(side: Side) {
    const canvas = side === "front" ? frontCanvas.current : backCanvas.current;
    const template = side === "front" ? frontTemplate : backTemplate;
    if (!canvas || !template) {
      setMessage("Subiri template ipakie kwanza.");
      return;
    }
    const link = document.createElement("a");
    link.download = side === "front" ? "kitambulisho_mbele.png" : "kitambulisho_nyuma.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  const nidaDigits = nida.replace(/\D/g, "").length;

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "20px 16px 36px", color: "var(--foreground, #172033)" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 18 }}>
        <ArrowLeft size={16} /> Rudi kwenye huduma
      </button>

      <header style={{ marginBottom: 22 }}>
        <span style={{ color: "#059669", fontSize: 11, fontWeight: 900, letterSpacing: 1.8 }}>WAKALA POINT • JENERETA YA VITAMBULISHO</span>
        <h1 style={{ margin: "6px 0", fontSize: 30 }}>Kitambulisho cha Taifa (NIDA)</h1>
        <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>Jaza taarifa sahihi kwenye fomu ili zijae moja kwa moja kwenye templates za id-mbele.png na id-nyuma.png.</p>
      </header>

      {/* SEHEMU YA 1: MAJINA */}
      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>1</span><div><h2 style={h2}>Taarifa za Majina</h2><p style={subText}>Jaza majina kulingana na maelezo ya kitambulisho.</p></div></div>
        <div style={formGrid}>
          <label style={fieldLabel}>Jina la Kwanza<input className="input" autoComplete="off" value={name1} onChange={(e) => setName1(e.target.value)} placeholder="Mfano: JOSEPH" /></label>
          <label style={fieldLabel}>Jina la Kati<input className="input" autoComplete="off" value={name2} onChange={(e) => setName2(e.target.value)} placeholder="Mfano: BAKARI" /></label>
          <label style={fieldLabel}>Jina la Mwisho<input className="input" autoComplete="off" value={name3} onChange={(e) => setName3(e.target.value)} placeholder="Mfano: JUMA" /></label>
        </div>
      </section>

      {/* SEHEMU YA 2: NAMBA YA NIDA */}
      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>2</span><div><h2 style={h2}>Namba ya NIDA</h2><p style={subText}>Weka tarakimu 20 za namba ya kitambulisho.</p></div></div>
        <label style={fieldLabel}>Namba ya Kitambulisho (NIN)
          <input className="input" inputMode="numeric" autoComplete="off" value={formatNida(nida)} maxLength={23}
            onChange={(e) => setNida(e.target.value.replace(/\D/g, "").slice(0, 20))}
            placeholder="20000506-27520-00001-11" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: 1.1 }} />
        </label>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 7, color: "#64748b", fontSize: 12 }}>
          <span>Muundo: 8-5-5-2</span><strong style={{ color: nidaDigits === 20 ? "#15803d" : "#64748b" }}>{nidaDigits}/20</strong>
        </div>
      </section>

      {/* SEHEMU YA 3: TAREHE, JINSIA NA PICHA */}
      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>3</span><div><h2 style={h2}>Taarifa za Ziada & Picha</h2><p style={subText}>Weka tarehe ya kuzaliwa, jinsia, na pakia picha ya uso.</p></div></div>
        <div style={formGrid}>
          <label style={fieldLabel}>Tarehe ya Kuzaliwa<input className="input" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} placeholder="Mfano: 05 JUN 2000" /></label>
          <label style={fieldLabel}>Jinsia (Sex)<input className="input" value={gender} onChange={(e) => setGender(e.target.value)} placeholder="Mfano: M au F" /></label>
          <label style={fieldLabel}>Picha ya Uso (Passport Size)<input className="input" type="file" accept="image/*" onChange={handlePhotoUpload} /></label>
        </div>
      </section>

      {message && <p role="status" style={statusBox}>{message}</p>}

      {/* SEHEMU YA 4: PREVIEW NA KUPAKUA */}
      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>4</span><div><h2 style={h2}>Muonekano wa Kitambulisho (Preview)</h2><p style={subText}>Angalia jinsi kinavyosomeka kwenye template kabla ya kupakua.</p></div></div>
        <div style={previewGrid}>
          <div>
            <div style={previewHeader}><b>Template ya Mbele (id-mbele.png)</b><button className="button button--green" type="button" disabled={!frontTemplate} onClick={() => download("front")}><Download size={15} /> Pakua Mbele</button></div>
            <div style={previewBox}><canvas ref={frontCanvas} width={WIDTH} height={HEIGHT} style={canvasStyle} />{!frontTemplate && <span style={emptyText}>Inapakia id-mbele.png...</span>}</div>
          </div>
          <div>
            <div style={previewHeader}><b>Template ya Nyuma (id-nyuma.png)</b><button className="button button--green" type="button" disabled={!backTemplate} onClick={() => download("back")}><Download size={15} /> Pakua Nyuma</button></div>
            <div style={previewBox}><canvas ref={backCanvas} width={WIDTH} height={HEIGHT} style={canvasStyle} />{!backTemplate && <span style={emptyText}>Inapakia id-nyuma.png...</span>}</div>
          </div>
        </div>
      </section>
    </main>
  );
}

const formPanel: React.CSSProperties = { padding: 18, border: "1px solid #e2e8f0", borderRadius: 18, marginBottom: 15, background: "var(--card, #fff)", boxShadow: "0 5px 20px rgba(15,23,42,.04)" };
const sectionHeading: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 };
const stepBadge: React.CSSProperties = { width: 34, height: 34, borderRadius: 12, display: "grid", placeItems: "center", flexShrink: 0, color: "#fff", background: "linear-gradient(135deg,#059669,#10b981)", fontWeight: 900 };
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
