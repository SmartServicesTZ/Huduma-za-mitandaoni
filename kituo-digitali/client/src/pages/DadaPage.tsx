import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Eraser } from "lucide-react";
import { useLocation } from "wouter";
import JsBarcode from "jsbarcode";

type Side = "front" | "back";
const WIDTH = 1000;
const HEIGHT = 630;

const TEMPLATE_URLS: Record<Side, string> = {
  front: `${import.meta.env.BASE_URL}id-mbele.png`,
  back: `${import.meta.env.BASE_URL}id-nyuma.png`,
};

function formatNida(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 20);
  return [digits.slice(0, 8), digits.slice(8, 13), digits.slice(13, 18), digits.slice(18, 20)]
    .filter(Boolean).join("-");
}

// Inasoma tarakimu 8 za mwanzo za NIDA na kutengeneza tarehe (Mfano: 01 MAY 2005)
function parseDateFromNida(nidaVal: string): string {
  const clean = nidaVal.replace(/\D/g, "");
  if (clean.length < 8) return "";
  
  const year = clean.slice(0, 4);
  const monthNum = parseInt(clean.slice(4, 6), 10);
  const day = clean.slice(6, 8);

  const months = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const monthStr = months[monthNum] || "JAN";

  return `${day} ${monthStr} ${year}`;
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
  const signatureCanvas = useRef<HTMLCanvasElement>(null);
  const tempBarcodeCanvas = useRef<HTMLCanvasElement>(null);
  
  const [frontTemplate, setFrontTemplate] = useState<HTMLImageElement | null>(null);
  const [backTemplate, setBackTemplate] = useState<HTMLImageElement | null>(null);
  const [portraitImage, setPortraitImage] = useState<HTMLImageElement | null>(null);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  
  const [message, setMessage] = useState("Inapakia template za kitambulisho...");
  const [firstNameMiddle, setFirstNameMiddle] = useState("");
  const [lastName, setLastName] = useState("");
  const [nida, setNida] = useState("");
  const [gender, setGender] = useState("");

  const [isDrawing, setIsDrawing] = useState(false);

  const formattedNida = useMemo(() => formatNida(nida), [nida]);
  const calculatedBirthDate = useMemo(() => parseDateFromNida(nida), [nida]);

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

  // Signature Pad Handlers
  useEffect(() => {
    const canvas = signatureCanvas.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
  }, []);

  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    setIsDrawing(true);
    drawSignature(e);
  }

  function stopDrawing() {
    setIsDrawing(false);
    const canvas = signatureCanvas.current;
    if (canvas) {
      setSignatureImage(canvas.toDataURL("image/png"));
    }
  }

  function drawSignature(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = signatureCanvas.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ("touches" in e ? e.touches[0].clientY : e.clientY) - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function clearSignature() {
    const canvas = signatureCanvas.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    setSignatureImage(null);
  }

  // Kupakia picha ya uso
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

  // Kuchora kwenye Canvas
  function draw(canvas: HTMLCanvasElement | null, template: HTMLImageElement | null, side: Side) {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    if (!template) return;

    context.drawImage(template, 0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#000000";

    if (side === "front") {
      // NIN / Namba ya NIDA Juu
      if (formattedNida) {
        context.font = "bold 44px monospace";
        context.fillText(formattedNida, 70, 215, 900);
      }

      // Jina la Kwanza na la Kati (Sehemu 1)
      if (firstNameMiddle) {
        context.font = "bold 28px Arial";
        context.fillText(firstNameMiddle.toUpperCase(), 190, 272, 700);
      }

      // Jina la Mwisho / Ukoo
      if (lastName) {
        context.font = "bold 28px Arial";
        context.fillText(lastName.toUpperCase(), 290, 326, 600);
      }

      // Tarehe ya Kuzaliwa (Inajaza yenyewe kutoka NIDA)
      if (calculatedBirthDate) {
        context.font = "bold 28px Arial";
        context.fillText(calculatedBirthDate, 430, 394, 400);
      }

      // Jinsia
      if (gender) {
        context.font = "bold 28px Arial";
        context.fillText(gender.toUpperCase(), 170, 452, 100);
      }

      // Picha ya Uso
      const photoBox = { x: 685, y: 290, width: 205, height: 260 };
      if (portraitImage) {
        context.drawImage(portraitImage, photoBox.x, photoBox.y, photoBox.width, photoBox.height);
      }

      // Saini Iliyochorwa
      if (signatureImage) {
        const sigImg = new Image();
        sigImg.onload = () => {
          context.drawImage(sigImg, 220, 505, 180, 65);
        };
        sigImg.src = signatureImage;
      }
    } 

    if (side === "back") {
      const cleanNida = formattedNida.replace(/-/g, "");
      if (cleanNida && tempBarcodeCanvas.current) {
        // Tengeneza Barcode halisi kwa kutumia JsBarcode
        try {
          JsBarcode(tempBarcodeCanvas.current, cleanNida, {
            format: "CODE128",
            width: 3,
            height: 90,
            displayValue: false,
          });
          // Chora Barcode juu ya template upande wa nyuma (sehemu yake sahihi juu)
          context.drawImage(tempBarcodeCanvas.current, 120, 70, 760, 95);
        } catch (e) {
          console.error(e);
        }

        // Chora namba ya NIDA chini ya barcode upande wa nyuma
        context.font = "bold 38px monospace";
        context.textAlign = "center";
        context.fillText(cleanNida, 500, 205); 
      }
    }
  }

  useEffect(() => {
    draw(frontCanvas.current, frontTemplate, "front");
    draw(backCanvas.current, backTemplate, "back");
  }, [frontTemplate, backTemplate, firstNameMiddle, lastName, formattedNida, calculatedBirthDate, gender, portraitImage, signatureImage]);

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
        <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>Jaza taarifa sahihi. Tarehe inajaza yenyewe kutoka kwenye NIDA na unaweza kuchora saini yako.</p>
      </header>

      {/* SEHEMU YA 1: MAJINA */}
      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>1</span><div><h2 style={h2}>Taarifa za Majina</h2><p style={subText}>Jina la kwanza na la kati viwe sehemu moja.</p></div></div>
        <div style={formGrid}>
          <label style={fieldLabel}>Jina la Kwanza & la Kati<input className="input" autoComplete="off" value={firstNameMiddle} onChange={(e) => setFirstNameMiddle(e.target.value)} placeholder="Mfano: JOSEPH BAKARI" /></label>
          <label style={fieldLabel}>Jina la Mwisho / Ukoo<input className="input" autoComplete="off" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Mfano: JUMA" /></label>
        </div>
      </section>

      {/* SEHEMU YA 2: NAMBA YA NIDA */}
      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>2</span><div><h2 style={h2}>Namba ya NIDA (Tarehe Inajaza Yenyewe)</h2><p style={subText}>Weka tarakimu 20. Tarehe itajisoma yenyewe hapa chini.</p></div></div>
        <label style={fieldLabel}>Namba ya Kitambulisho (NIN)
          <input className="input" inputMode="numeric" autoComplete="off" value={formattedNida} maxLength={23}
            onChange={(e) => setNida(e.target.value.replace(/\D/g, "").slice(0, 20))}
            placeholder="20050501-41210-00001-80" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: 1.1 }} />
        </label>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 7, color: "#64748b", fontSize: 12 }}>
          <span>Tarehe Iliyosomwa: <strong style={{ color: "#059669" }}>{calculatedBirthDate || "Weka NIDA yenye tarakimu 8 za mwanzo"}</strong></span>
          <strong style={{ color: nidaDigits === 20 ? "#15803d" : "#64748b" }}>{nidaDigits}/20</strong>
        </div>
      </section>

      {/* SEHEMU YA 3: JINSIA NA PICHA */}
      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>3</span><div><h2 style={h2}>Jinsia na Picha ya Uso</h2><p style={subText}>Weka jinsia na pakia picha ya passport size.</p></div></div>
        <div style={formGrid}>
          <label style={fieldLabel}>Jinsia (Sex)<input className="input" value={gender} onChange={(e) => setGender(e.target.value)} placeholder="Mfano: M au F" /></label>
          <label style={fieldLabel}>Picha ya Uso (Passport Size)<input className="input" type="file" accept="image/*" onChange={handlePhotoUpload} /></label>
        </div>
      </section>

      {/* SEHEMU YA 4: SEHEMU YA KUCHORA SAINI */}
      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>4</span><div><h2 style={h2}>Saini ya Mtu (Digital Signature Pad)</h2><p style={subText}>Chora saini yako ndani ya kisanduku hiki kwa kidole au kipanya.</p></div></div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ position: "relative", border: "2px dashed #cbd5e1", borderRadius: 12, background: "#f8fafc", overflow: "hidden", cursor: "crosshair", width: "100%", maxWidth: 400, height: 130, margin: "0 auto" }}>
            <canvas ref={signatureCanvas} width={400} height={130}
              onMouseDown={startDrawing} onMouseMove={drawSignature} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
              onTouchStart={startDrawing} onTouchMove={drawSignature} onTouchEnd={stopDrawing}
              style={{ display: "block", width: "100%", height: "100%" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button type="button" onClick={clearSignature} className="button button--secondary" style={{ fontSize: 12, padding: "6px 14px", display: "flex", gap: 6, alignItems: "center" }}>
              <Eraser size={14} /> Futa Saini
            </button>
          </div>
        </div>
      </section>

      {message && <p role="status" style={statusBox}>{message}</p>}

      {/* SEHEMU YA 5: PREVIEW NA KUPAKUA */}
      <section style={formPanel}>
        <div style={sectionHeading}><span style={stepBadge}>5</span><div><h2 style={h2}>Muonekano wa Kitambulisho (Preview)</h2><p style={subText}>Angalia matokeo ya mwisho kabla ya kupakua picha.</p></div></div>
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

      {/* Hidden element for generating barcode */}
      <canvas ref={tempBarcodeCanvas} style={{ display: "none" }}></canvas>
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
              
