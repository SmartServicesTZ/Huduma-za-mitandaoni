import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Image as ImageIcon, Printer, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import {
  DEMO_NOTICE,
  DEMO_REFERENCE,
  VOTER_DEMO_HEIGHT,
  VOTER_DEMO_WIDTH,
  formatVoterDemoDate,
} from "../lib/voterCardDemo";

type Side = "front" | "back";
type ExportFormat = "png" | "jpg";

const DESIGN_WIDTH = 1000;
const DESIGN_HEIGHT = 625;
const SCALE = VOTER_DEMO_WIDTH / DESIGN_WIDTH;

interface CardData {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  ward: string;
  street: string;
  centre: string;
  portrait: HTMLImageElement | null;
}

function drawLabelValue(
  context: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
) {
  context.textAlign = "left";
  context.fillStyle = "#475569";
  context.font = "600 13px Arial, sans-serif";
  context.fillText(label.toUpperCase(), x, y);

  const safeValue = value.trim() || "SAMPLE DATA";
  let fontSize = 25;
  context.font = `700 ${fontSize}px Arial, sans-serif`;
  while (context.measureText(safeValue).width > maxWidth && fontSize > 15) {
    fontSize -= 1;
    context.font = `700 ${fontSize}px Arial, sans-serif`;
  }
  context.fillStyle = "#111827";
  context.fillText(safeValue, x, y + 31, maxWidth);
}

function drawWatermark(context: CanvasRenderingContext2D) {
  context.save();
  context.translate(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2);
  context.rotate(-Math.PI / 7);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "900 66px Arial, sans-serif";
  context.fillStyle = "rgba(185, 28, 28, 0.24)";
  context.fillText("DEMO • SI RASMI", 0, 0);
  context.restore();

  context.fillStyle = "#991b1b";
  context.fillRect(0, DESIGN_HEIGHT - 48, DESIGN_WIDTH, 48);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "800 18px Arial, sans-serif";
  context.fillText(DEMO_NOTICE, DESIGN_WIDTH / 2, DESIGN_HEIGHT - 24);
}

function drawFrame(context: CanvasRenderingContext2D) {
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  context.strokeStyle = "#1e3a5f";
  context.lineWidth = 5;
  context.strokeRect(4, 4, DESIGN_WIDTH - 8, DESIGN_HEIGHT - 8);
  context.strokeStyle = "#93c5fd";
  context.lineWidth = 2;
  context.strokeRect(13, 13, DESIGN_WIDTH - 26, DESIGN_HEIGHT - 26);
  context.fillStyle = "#123b63";
  context.fillRect(18, 18, DESIGN_WIDTH - 36, 88);
  context.fillStyle = "#f59e0b";
  context.fillRect(18, 106, DESIGN_WIDTH - 36, 6);
}

function drawFront(context: CanvasRenderingContext2D, data: CardData) {
  drawFrame(context);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";
  context.font = "800 27px Arial, sans-serif";
  context.fillText("SOFT COPY YA MPIGA KURA", 42, 58);
  context.fillStyle = "#dbeafe";
  context.font = "700 14px Arial, sans-serif";
  context.fillText("SAMPLE CARD • HAITAMBULISHI MPIGA KURA", 43, 84);

  const photo = { x: 42, y: 142, width: 274, height: 354 };
  context.fillStyle = "#dbeafe";
  context.fillRect(photo.x, photo.y, photo.width, photo.height);
  if (data.portrait) {
    const image = data.portrait;
    const scale = Math.max(photo.width / image.width, photo.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.save();
    context.beginPath();
    context.rect(photo.x, photo.y, photo.width, photo.height);
    context.clip();
    context.drawImage(image, photo.x + (photo.width - width) / 2, photo.y + (photo.height - height) / 2, width, height);
    context.restore();
  } else {
    context.fillStyle = "#1e3a5f";
    context.textAlign = "center";
    context.font = "700 16px Arial, sans-serif";
    context.fillText("SAMPLE PHOTO", photo.x + photo.width / 2, photo.y + photo.height / 2);
    context.fillStyle = "#475569";
    context.font = "13px Arial, sans-serif";
    context.fillText("Upload a fictional image", photo.x + photo.width / 2, photo.y + photo.height / 2 + 24);
  }
  context.strokeStyle = "#1e3a5f";
  context.lineWidth = 3;
  context.strokeRect(photo.x, photo.y, photo.width, photo.height);

  const x = 352;
  const width = 590;
  drawLabelValue(context, "Jina kamili / Full name", data.fullName, x, 171, width);
  drawLabelValue(context, "Tarehe ya kuzaliwa / Date of birth", formatVoterDemoDate(data.dateOfBirth), x, 246, 340);
  drawLabelValue(context, "Jinsia / Gender", data.gender, 720, 246, 220);
  drawLabelValue(context, "Kata / Ward", data.ward, x, 328, width);
  drawLabelValue(context, "Mtaa / Kijiji / Street / Village", data.street, x, 405, width);
  drawLabelValue(context, "Kituo / Registration centre", data.centre, x, 482, width);

  context.fillStyle = "#e2e8f0";
  context.fillRect(352, 526, 590, 31);
  context.fillStyle = "#334155";
  context.textAlign = "left";
  context.font = "800 15px Arial, sans-serif";
  context.fillText(`DEMO REFERENCE: ${DEMO_REFERENCE}`, 366, 547);
  drawWatermark(context);
}

function drawBack(context: CanvasRenderingContext2D) {
  drawFrame(context);
  context.textAlign = "center";
  context.fillStyle = "#ffffff";
  context.font = "800 27px Arial, sans-serif";
  context.fillText("DEMO CARD — REVERSE SIDE", DESIGN_WIDTH / 2, 58);
  context.fillStyle = "#dbeafe";
  context.font = "700 14px Arial, sans-serif";
  context.fillText("NOT ISSUED BY ANY ELECTION AUTHORITY", DESIGN_WIDTH / 2, 84);

  context.fillStyle = "#ffffff";
  context.strokeStyle = "#cbd5e1";
  context.lineWidth = 2;
  context.fillRect(62, 150, 876, 300);
  context.strokeRect(62, 150, 876, 300);
  context.fillStyle = "#991b1b";
  context.font = "900 32px Arial, sans-serif";
  context.fillText("DEMO • SI KITAMBULISHO RASMI", DESIGN_WIDTH / 2, 220);
  context.fillStyle = "#334155";
  context.font = "600 20px Arial, sans-serif";
  context.fillText("This sample is for layout preview only.", DESIGN_WIDTH / 2, 280);
  context.fillText("No voter number, barcode, or verification QR is generated.", DESIGN_WIDTH / 2, 316);
  context.fillStyle = "#e2e8f0";
  context.fillRect(272, 355, 456, 58);
  context.fillStyle = "#475569";
  context.font = "800 18px Arial, sans-serif";
  context.fillText("CODE DISABLED • SAMPLE ONLY", DESIGN_WIDTH / 2, 390);
  context.fillStyle = "#334155";
  context.font = "700 16px Arial, sans-serif";
  context.fillText(`REFERENCE: ${DEMO_REFERENCE}`, DESIGN_WIDTH / 2, 500);
  drawWatermark(context);
}

function drawCard(canvas: HTMLCanvasElement | null, side: Side, data: CardData) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  context.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  if (side === "front") drawFront(context, data);
  else drawBack(context);
}

export default function VoterIdPage() {
  const [, navigate] = useLocation();
  const frontCanvas = useRef<HTMLCanvasElement>(null);
  const backCanvas = useRef<HTMLCanvasElement>(null);
  const [firstNameMiddle, setFirstNameMiddle] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("SAMPLE");
  const [ward, setWard] = useState("");
  const [street, setStreet] = useState("");
  const [centre, setCentre] = useState("");
  const [portrait, setPortrait] = useState<HTMLImageElement | null>(null);

  const data = useMemo<CardData>(() => ({
    fullName: [firstNameMiddle, lastName].map((part) => part.trim()).filter(Boolean).join(" ").toUpperCase(),
    dateOfBirth,
    gender,
    ward: ward.toUpperCase(),
    street: street.toUpperCase(),
    centre: centre.toUpperCase(),
    portrait,
  }), [firstNameMiddle, lastName, dateOfBirth, gender, ward, street, centre, portrait]);

  useEffect(() => {
    drawCard(frontCanvas.current, "front", data);
    drawCard(backCanvas.current, "back", data);
  }, [data]);

  function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPortrait(null);
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return;
    const reader = new FileReader();
    reader.onload = (result) => {
      const image = new Image();
      image.onload = () => setPortrait(image);
      image.src = String(result.target?.result ?? "");
    };
    reader.readAsDataURL(file);
  }

  function download(side: Side, format: ExportFormat) {
    const canvas = side === "front" ? frontCanvas.current : backCanvas.current;
    if (!canvas) return;
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    const link = document.createElement("a");
    link.download = `mpiga-kura-demo-${side}.${format}`;
    link.href = canvas.toDataURL(mime, format === "jpg" ? 0.94 : undefined);
    link.click();
  }

  function print(side: Side) {
    const canvas = side === "front" ? frontCanvas.current : backCanvas.current;
    if (!canvas) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.opener = null;
    const imageUrl = canvas.toDataURL("image/png");
    win.document.write(`<!doctype html><html><head><title>Demo voter card</title><style>html,body{margin:0;background:#eef2f7}main{padding:18px;text-align:center}img{width:min(100%,1000px);height:auto}</style></head><body><main><img src="${imageUrl}" alt="${DEMO_NOTICE}" /></main><script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  }

  const fieldStyle: React.CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 750, color: "#26364b" };
  const inputStyle: React.CSSProperties = { width: "100%", minHeight: 42, border: "1px solid #d8e1ec", borderRadius: 10, padding: "10px 12px", background: "#fff", color: "#172033", fontSize: 14, boxSizing: "border-box" };

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "16px 12px 36px", color: "#172033" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: 13 }}>
        <ArrowLeft size={15} /> Rudi kwenye huduma
      </button>

      <header style={{ borderRadius: 14, padding: "16px 18px", marginBottom: 14, color: "#fff", background: "#123b63" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2 }}>SOFT COPY YA MPIGA KURA</div>
        <h1 style={{ margin: "6px 0 0", fontSize: "clamp(21px,4vw,28px)" }}>Kadi ya mfano — DEMO</h1>
      </header>

      <div role="alert" style={{ border: "2px solid #b91c1c", borderRadius: 12, padding: 14, marginBottom: 14, color: "#7f1d1d", background: "#fef2f2", fontWeight: 800 }}>
        {DEMO_NOTICE}. Tumia taarifa na picha za kubuniwa pekee. Hakuna namba halisi ya mpiga kura, QR, au barcode inayotengenezwa.
      </div>

      <section style={{ background: "#fff", border: "1px solid #e4eaf2", borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", fontSize: 16, fontWeight: 800, color: "#172b4d" }}><UserRound size={17} /> Taarifa za mfano</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 12 }}>
          <label style={fieldStyle}>Jina la kwanza na la kati<input style={inputStyle} value={firstNameMiddle} onChange={(e) => setFirstNameMiddle(e.target.value)} placeholder="SAMPLE NAME" /></label>
          <label style={fieldStyle}>Jina la mwisho<input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="EXAMPLE" /></label>
          <label style={fieldStyle}>Tarehe ya kuzaliwa<input style={inputStyle} type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></label>
          <label style={fieldStyle}>Jinsia ya mfano<select style={inputStyle} value={gender} onChange={(e) => setGender(e.target.value)}><option value="SAMPLE">SAMPLE</option><option value="MALE">MALE</option><option value="FEMALE">FEMALE</option></select></label>
          <label style={fieldStyle}>Kata<input style={inputStyle} value={ward} onChange={(e) => setWard(e.target.value)} placeholder="SAMPLE WARD" /></label>
          <label style={fieldStyle}>Mtaa / Kijiji<input style={inputStyle} value={street} onChange={(e) => setStreet(e.target.value)} placeholder="SAMPLE STREET" /></label>
          <label style={fieldStyle}>Kituo cha mfano<input style={inputStyle} value={centre} onChange={(e) => setCentre(e.target.value)} placeholder="SAMPLE CENTRE" /></label>
          <label style={fieldStyle}>Picha ya mfano<input style={{ ...inputStyle, padding: 6 }} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} /></label>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#475569" }}>Picha hubaki kwenye kivinjari hiki kwa ajili ya preview; haipelekwi kwenye server na haijahifadhiwa.</p>
      </section>

      <section style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 14, padding: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>Preview ya mfano</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 14 }}>
          {(["front", "back"] as const).map((side) => {
            const canvasRef = side === "front" ? frontCanvas : backCanvas;
            const sideLabel = side === "front" ? "Mbele" : "Nyuma";
            return (
              <div key={side}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
                  <strong>{sideLabel} — DEMO</strong>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    <button type="button" className="button button--green" onClick={() => download(side, "png")}><Download size={14} /> PNG</button>
                    <button type="button" className="button button--secondary" onClick={() => download(side, "jpg")}><ImageIcon size={14} /> JPG</button>
                    <button type="button" className="button button--secondary" onClick={() => print(side)}><Printer size={14} /> Chapisha</button>
                  </div>
                </div>
                <div style={{ width: "100%", aspectRatio: `${VOTER_DEMO_WIDTH} / ${VOTER_DEMO_HEIGHT}`, overflow: "hidden", borderRadius: 10, background: "#e2e8f0", boxShadow: "0 2px 8px rgba(15,23,42,.12)" }}>
                  <canvas ref={canvasRef} width={VOTER_DEMO_WIDTH} height={VOTER_DEMO_HEIGHT} style={{ display: "block", width: "100%", height: "100%" }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
