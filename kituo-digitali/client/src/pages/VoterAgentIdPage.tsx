import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, ImagePlus, RotateCcw, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import PassportPhotoMaker from "./PassportPhotoMaker";

type CardFields = {
  fullName: string;
  party: string;
  phone: string;
  station: string;
  ward: string;
  constituency: string;
  region: string;
};

const initialFields: CardFields = {
  fullName: "",
  party: "",
  phone: "",
  station: "",
  ward: "",
  constituency: "",
  region: "",
};

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 760;

export default function VoterAgentIdPage() {
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fields, setFields] = useState<CardFields>(initialFields);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoImage, setPhotoImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reference = useMemo(() => `SS-VAK-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, []);

  const update = (key: keyof CardFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const uploadPhoto = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Tumia picha ya JPG, PNG au WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Picha isizidi MB 5.");
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(url);
      setPhotoImage(image);
      setError("");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Imeshindikana kusoma picha uliyochagua.");
    };
    image.src = url;
  };

  const drawCard = () => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Canvas haijapatikana.");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Imeshindikana kuandaa picha.");
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const bg = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    bg.addColorStop(0, "#102a43");
    bg.addColorStop(0.58, "#164e63");
    bg.addColorStop(1, "#0f766e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(28, 28, CARD_WIDTH - 56, CARD_HEIGHT - 56);
    ctx.fillStyle = "#123b52";
    ctx.fillRect(28, 28, CARD_WIDTH - 56, 142);

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 43px Arial";
    ctx.fillText("KITAMBULISHO CHA WAKALA WA CHAMA", 70, 92, 1040);
    ctx.font = "700 23px Arial";
    ctx.fillStyle = "#c9f4ed";
    ctx.fillText("TAARIFA ZA UTAMBULISHO WA NDANI", 72, 132);

    ctx.fillStyle = "#fff1c2";
    ctx.fillRect(70, 190, 1060, 62);
    ctx.fillStyle = "#7c2d12";
    ctx.font = "900 29px Arial";
    ctx.textAlign = "center";
    ctx.fillText("MFANO — SI KITAMBULISHO RASMI CHA TUME", CARD_WIDTH / 2, 230);
    ctx.textAlign = "left";

    const photoX = 850;
    const photoY = 290;
    const photoW = 250;
    const photoH = 300;
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(photoX, photoY, photoW, photoH);
    if (photoImage) {
      const scale = Math.max(photoW / photoImage.width, photoH / photoImage.height);
      const sw = photoW / scale;
      const sh = photoH / scale;
      const sx = (photoImage.width - sw) / 2;
      const sy = (photoImage.height - sh) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(photoX, photoY, photoW, photoH);
      ctx.clip();
      ctx.drawImage(photoImage, sx, sy, sw, sh, photoX, photoY, photoW, photoH);
      ctx.restore();
    } else {
      ctx.fillStyle = "#64748b";
      ctx.font = "700 24px Arial";
      ctx.textAlign = "center";
      ctx.fillText("PICHA YA WAKALA", photoX + photoW / 2, photoY + photoH / 2);
      ctx.textAlign = "left";
    }

    const rows: Array<[string, string]> = [
      ["JINA KAMILI", fields.fullName],
      ["CHAMA / TAASISI", fields.party],
      ["KITUO CHA KUPIGIA KURA", fields.station],
      ["KATA", fields.ward],
      ["JIMBO", fields.constituency],
      ["MKOA", fields.region],
      ["SIMU", fields.phone],
      ["NAMBARI YA REJEA", reference],
    ];
    let y = 315;
    for (const [label, value] of rows) {
      ctx.fillStyle = "#64748b";
      ctx.font = "700 18px Arial";
      ctx.fillText(label, 85, y);
      ctx.fillStyle = "#102a43";
      ctx.font = "800 28px Arial";
      ctx.fillText(value.trim() || "—", 85, y + 34, 710);
      y += 76;
    }

    ctx.fillStyle = "#0f766e";
    ctx.fillRect(28, 655, CARD_WIDTH - 56, 105);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 20px Arial";
    ctx.fillText("HATI HII NI MFANO WA UTAMBULISHO WA NDANI TU.", 72, 700);
    ctx.font = "500 17px Arial";
    ctx.fillText("Haithibitishi uteuzi, idhini, au kibali cha Tume ya Uchaguzi.", 72, 733);
    ctx.textAlign = "right";
    ctx.font = "600 18px Arial";
    ctx.fillText(new Date().toLocaleDateString("sw-TZ"), 1110, 733);
    ctx.textAlign = "left";

    ctx.save();
    ctx.translate(CARD_WIDTH / 2, CARD_HEIGHT / 2);
    ctx.rotate(-0.35);
    ctx.globalAlpha = 0.075;
    ctx.fillStyle = "#b91c1c";
    ctx.font = "900 100px Arial";
    ctx.textAlign = "center";
    ctx.fillText("MFANO TU", 0, 0);
    ctx.restore();
  };

  useEffect(() => {
    drawCard();
  }, [fields, photoImage, reference]);

  const downloadPng = async () => {
    if (!fields.fullName.trim() || !fields.party.trim() || !fields.station.trim() || !fields.ward.trim() || !fields.constituency.trim() || !fields.region.trim() || !fields.phone.trim() || !photoImage) {
      setError("Jaza taarifa zote na pakia picha ya wakala kabla ya kutengeneza PNG.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      drawCard();
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Picha haijaandaliwa.");
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Imeshindikana kutengeneza PNG.")), "image/png"));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mfano-kitambulisho-wakala-${reference.toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Imeshindikana kutengeneza PNG.");
    } finally {
      setBusy(false);
    }
  };

  const fieldStyle: React.CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 750, color: "#26364b" };
  const inputStyle: React.CSSProperties = { width: "100%", minHeight: 44, border: "1px solid #d8e1ec", borderRadius: 10, padding: "10px 12px", background: "#fff", color: "#172033", fontSize: 14, boxSizing: "border-box" };

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "18px 14px 40px", color: "#172033" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 7 }}>
        <ArrowLeft size={16} /> Rudi kwenye huduma
      </button>
      <header style={{ borderRadius: 18, padding: "22px", color: "#fff", background: "linear-gradient(120deg,#102a43,#0f766e)", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: 1 }}><ImagePlus size={17} /> MPIGA KURA</div>
        <h1 style={{ margin: "8px 0 6px", fontSize: "clamp(22px,4vw,30px)" }}>Tengeneza Mfano wa Kitambulisho cha Wakala</h1>
        <p style={{ margin: 0, color: "#d8f3ee", fontSize: 13 }}>Jaza taarifa za wakala na pakua muundo wa PNG kwa matumizi ya ndani ya chama/taasisi.</p>
      </header>
      <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 12, padding: 13, display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
        <ShieldAlert size={20} color="#c2410c" />
        <p style={{ margin: 0, fontSize: 13, color: "#7c2d12" }}>Huu ni mfano wa utambulisho wa ndani tu. Hauwezi kuchukua nafasi ya kibali au kitambulisho rasmi kinachotolewa na chama au Tume ya Uchaguzi. Muundo una alama ya MFANO isiyoweza kufichwa.</p>
      </div>
      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 17 }}>Taarifa za wakala</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,250px),1fr))", gap: 12 }}>
          {([
            ["fullName", "Jina kamili la wakala", "Mfano: Juma Abdallah"],
            ["party", "Jina la chama / taasisi", "Andika jina la chama/taasisi"],
            ["phone", "Namba ya simu", "07XXXXXXXX"],
            ["station", "Kituo cha kupigia kura", "Jina la kituo"],
            ["ward", "Kata", "Jina la kata"],
            ["constituency", "Jimbo", "Jina la jimbo"],
            ["region", "Mkoa", "Jina la mkoa"],
          ] as Array<[keyof CardFields, string, string]>).map(([key, label, placeholder]) => (
            <label key={key} style={fieldStyle}>{label}
              <input style={inputStyle} value={fields[key]} onChange={(event) => update(key, event.target.value)} placeholder={placeholder} maxLength={100} />
            </label>
          ))}
          <label style={fieldStyle}>Picha ya wakala (JPG, PNG au WebP; hadi MB 5)
            <input style={{ ...inputStyle, padding: 8 }} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadPhoto(event.target.files?.[0])} />
          </label>
        </div>
        {photoUrl && <img src={photoUrl} alt="Picha ya wakala" style={{ width: 104, height: 124, objectFit: "cover", borderRadius: 10, marginTop: 12, border: "1px solid #cbd5e1" }} />}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <button type="button" className="button button--green" onClick={() => void downloadPng()} disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Download size={16} /> {busy ? "Inatengeneza PNG..." : "TENGENEZA NA PAKUA PNG"}
          </button>
          <button type="button" className="button button--secondary" onClick={() => { setFields(initialFields); setPhotoUrl(""); setPhotoImage(null); setError(""); }} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <RotateCcw size={15} /> Futa taarifa
          </button>
        </div>
        {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 13, marginBottom: 0 }}>{error}</p>}
      </section>
      <PassportPhotoMaker />
      <section style={{ background: "#fff", border: "1px solid #dbe4ee", borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Live Preview — Kitambulisho cha Wakala</h2>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#0f766e", background: "#ccfbf1", borderRadius: 20, padding: "5px 9px" }}>HUBADILIKA MOJA KWA MOJA</span>
        </div>
        <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 12 }}>Muonekano huu unasasishwa unapoandika taarifa au kubadilisha picha.</p>
        <canvas ref={canvasRef} width={CARD_WIDTH} height={CARD_HEIGHT} aria-label="Live preview ya mfano wa kitambulisho cha wakala" style={{ display: "block", width: "100%", height: "auto", borderRadius: 10, border: "1px solid #cbd5e1", background: "#f1f5f9" }} />
      </section>
    </main>
  );
}
