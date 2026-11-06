import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { formatDemoBirthDate, formatDemoIdNumber, getNidaDemoAssetPaths, NIDA_DEMO_CARD_HEIGHT, NIDA_DEMO_CARD_WIDTH } from "../../../shared/nidaDemoCard";

const CARD_ASSETS = getNidaDemoAssetPaths(import.meta.env.BASE_URL);

interface CardValues {
  firstName: string;
  middleName: string;
  lastName: string;
  idNumber: string;
  dateOfBirth: string;
  gender: string;
  signature: string;
}

function loadCardImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Imeshindikana kupakia picha: ${src}`));
    image.src = src;
  });
}

function drawCard(ctx: CanvasRenderingContext2D, values: CardValues, templateImage: HTMLImageElement, portrait: HTMLImageElement | null) {
  const width = NIDA_DEMO_CARD_WIDTH;
  const height = NIDA_DEMO_CARD_HEIGHT;
  ctx.clearRect(0, 0, width, height);

  // 1. Chora Template halisi ya id-mbele.png kama msingi mzima wa kadi
  ctx.drawImage(templateImage, 0, 0, width, height);

  // 2. Weka Namba ya Kitambulisho juu ya template
  ctx.textAlign = "left";
  ctx.fillStyle = "#000000";
  ctx.font = "bold 44px Arial";
  ctx.fillText(formatDemoIdNumber(values.idNumber), 70, 215, 900);

  // 3. Weka Taarifa za Mtumiaji kwenye sehemu zake husika
  const details = [
    { value: [values.firstName, values.middleName].filter(Boolean).join(" ").toUpperCase(), y: 272 },
    { value: values.lastName.toUpperCase(), y: 326 },
    { value: formatDemoBirthDate(values.dateOfBirth), y: 394 },
    { value: values.gender.toUpperCase(), y: 452 },
    { value: values.signature || "—", y: 555, isSignature: true }
  ];

  details.forEach((field) => {
    ctx.textAlign = "left";
    if (field.isSignature) {
      ctx.fillStyle = "#0f172a";
      ctx.font = "italic bold 32px cursive";
    } else {
      ctx.fillStyle = "#000000";
      ctx.font = "bold 28px Arial";
    }
    ctx.fillText(field.value, 190, field.y, 700);
  });

  // 4. Weka Picha ya Uso kwenye eneo lake la kulia chini ya template
  const photoBox = { x: 685, y: 290, width: 205, height: 260 };
  if (portrait) {
    ctx.drawImage(portrait, photoBox.x, photoBox.y, photoBox.width, photoBox.height);
  } else {
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(photoBox.x, photoBox.y, photoBox.width, photoBox.height);
    ctx.fillStyle = "#475569";
    ctx.font = "18px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PICHA YA USO", photoBox.x + photoBox.width / 2, photoBox.y + photoBox.height / 2);
  }
}

export default function SoftCopyNidaDemoPage() {
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [firstName, setFirstName] = useState("JOSEPH");
  const [middleName, setMiddleName] = useState("BAKARI");
  const [lastName, setLastName] = useState("JUMA");
  const [idNumber, setIdNumber] = useState("20000506275200000111");
  const [dateOfBirth, setDateOfBirth] = useState("2000-06-05");
  const [gender, setGender] = useState("M");
  const [signature, setSignature] = useState("Joseph B.");
  const [photo, setPhoto] = useState("");
  
  // Kutumia asset ya id-mbele
  const [templateImg, setTemplateImg] = useState<HTMLImageElement | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [photoImage, setPhotoImage] = useState<HTMLImageElement | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const values = useMemo<CardValues>(() => ({ firstName, middleName, lastName, idNumber, dateOfBirth, gender, signature }), [firstName, middleName, lastName, idNumber, dateOfBirth, gender, signature]);

  useEffect(() => {
    let active = true;
    // Hapa inachukua faili la template ya mbele (id-mbele.png kupitia mfumo wa assets au unaweza kuelekeza moja kwa moja njia yake)
    loadCardImage(CARD_ASSETS.ngao) // Badilisha kama una variable maalum ya id-mbele kwenye helpers zako
      .then((img) => { if (active) { setTemplateImg(img); setTemplateError(""); } })
      .catch(() => { if (active) setTemplateError("Imeshindikana kupakia template ya id-mbele.png"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!photo) { setPhotoImage(null); setPhotoError(""); return () => { active = false; }; }
    loadCardImage(photo)
      .then((image) => { if (active) { setPhotoImage(image); setPhotoError(""); } })
      .catch(() => { if (active) { setPhotoImage(null); setPhotoError("Picha haikuweza kufunguliwa."); } });
    return () => { active = false; };
  }, [photo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !templateImg) return;
    drawCard(ctx, values, templateImg, photoImage);
  }, [templateImg, values, photoImage]);

  function onChoosePhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setPhotoError("Chagua faili la picha halali."); return; }
    const reader = new FileReader();
    reader.onload = () => { setPhoto(String(reader.result || "")); setPhotoError(""); };
    reader.readAsDataURL(file);
  }

  async function downloadCard() {
    if (!templateImg) { setTemplateError("Subiri template ipakie."); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloading(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Error")), "image/png"));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "id-mbele-imejazwa.png";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setTemplateError("Imeshindikana kupakua.");
    } finally { setDownloading(false); }
  }

  return (
    <main className="portal-main" style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(16px, 4vw, 32px) 16px" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 18 }}>
        <ArrowLeft size={16} /> Rudi kwenye huduma
      </button>

      <section className="license-form-card" style={{ display: "grid", gap: 18, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <ShieldCheck size={28} aria-hidden="true" color="#059669" />
          <div>
            <h1 style={{ margin: 0 }}>JENERETA YA KITAMBULISHO (TEMPLATE)</h1>
            <p style={{ margin: "4px 0 0" }}>Jaza taarifa ili zaijaze kwenye template ya id-mbele.png</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 14 }}>
          <label>Jina la kwanza<input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
          <label>Jina la kati<input className="input" value={middleName} onChange={(e) => setMiddleName(e.target.value)} /></label>
          <label>Jina la mwisho<input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
          <label>Namba ya NIDA<input className="input" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} /></label>
          <label>Tarehe ya kuzaliwa<input className="input" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></label>
          <label>Jinsia<select className="input" value={gender} onChange={(e) => setGender(e.target.value)}><option value="M">M</option><option value="F">F</option></select></label>
          <label>Sahihi<input className="input" value={signature} onChange={(e) => setSignature(e.target.value)} /></label>
          <label style={{ gridColumn: "1 / -1" }}>Picha ya Uso<input className="input" type="file" accept="image/*" onChange={(e) => onChoosePhoto(e.target.files?.[0])} /></label>
        </div>

        <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>HADHARA YA KITAMBULISHO (PREVIEW)</h2>
          <div style={{ width: "100%", aspectRatio: `${NIDA_DEMO_CARD_WIDTH} / ${NIDA_DEMO_CARD_HEIGHT}`, overflow: "hidden", borderRadius: 12, border: "1px solid #347d80", background: "#000" }}>
            <canvas ref={canvasRef} width={NIDA_DEMO_CARD_WIDTH} height={NIDA_DEMO_CARD_HEIGHT} style={{ display: "block", width: "100%", height: "100%" }} />
          </div>
          {templateError && <p style={{ color: "#a1222b" }}>{templateError}</p>}
        </div>

        <button type="button" className="button button--green" style={{ marginTop: 4, width: "100%" }} onClick={downloadCard} disabled={!templateImg || downloading}>
          <Download size={18} /> {downloading ? "INAANDAA..." : "PAKUA KITAMBULISHO KILICHOJAZWA (PNG)"}
        </button>
      </section>
    </main>
  );
}
