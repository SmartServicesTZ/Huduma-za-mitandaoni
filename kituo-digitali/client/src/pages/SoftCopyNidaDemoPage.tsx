import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import { formatDemoBirthDate, formatDemoIdNumber, getNidaDemoAssetPaths, NIDA_DEMO_CARD_HEIGHT, NIDA_DEMO_CARD_WIDTH, NIDA_DEMO_WATERMARK } from "../../../shared/nidaDemoCard";

const CARD_ASSETS = getNidaDemoAssetPaths(import.meta.env.BASE_URL);
const HEADER_LINES = [
  "JAMHURI YA MUUNGANO WA TANZANIA",
  "KITAMBULISHO CHA TAIFA",
  "THE UNITED REPUBLIC OF TANZANIA",
  "CITIZEN IDENTITY CARD",
];

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
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Imeshindikana kupakia picha: ${src}`));
    image.src = src;
  });
}

function containImageRect(image: HTMLImageElement, x: number, y: number, maxWidth: number, maxHeight: number) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: x + (maxWidth - width) / 2, y: y + (maxHeight - height) / 2, width, height };
}

function drawCoverImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const targetRatio = width / height;
  const sourceRatio = sourceWidth / sourceHeight;
  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    sourceX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetRatio;
    sourceY = (sourceHeight - cropHeight) / 2;
  }
  ctx.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height);
}

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    ctx.fillText("—", x, y, maxWidth);
    return;
  }
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight, maxWidth));
}

function drawPortraitPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.save();
  ctx.fillStyle = "#e7eef0";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#81969b";
  ctx.beginPath();
  ctx.ellipse(x + width * 0.5, y + height * 0.34, width * 0.18, height * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + width * 0.5, y + height * 0.91, width * 0.34, height * 0.38, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#253e43";
  ctx.font = "bold 21px Arial";
  ctx.textAlign = "center";
  ctx.fillText("SAMPLE PHOTO", x + width / 2, y + height - 22);
  ctx.restore();
}

function drawCard(ctx: CanvasRenderingContext2D, values: CardValues, crest: HTMLImageElement, flag: HTMLImageElement, portrait: HTMLImageElement | null) {
  const width = NIDA_DEMO_CARD_WIDTH;
  const height = NIDA_DEMO_CARD_HEIGHT;
  ctx.clearRect(0, 0, width, height);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#d8eddf");
  background.addColorStop(0.52, "#c9e5e7");
  background.addColorStop(1, "#8bc5d1");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  // Subtle guilloche-like lines add texture without introducing official seals or claims.
  ctx.save();
  ctx.strokeStyle = "rgba(31, 90, 95, 0.08)";
  ctx.lineWidth = 2;
  for (let x = 40; x < width; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 210);
    ctx.bezierCurveTo(x - 25, 430, x + 36, 620, x, 875);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = "#347d80";
  ctx.lineWidth = 12;
  ctx.strokeRect(18, 18, width - 36, height - 36);
  ctx.strokeStyle = "rgba(255,255,255,.72)";
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, width - 68, height - 68);

  const crestRect = containImageRect(crest, 60, 48, 150, 132);
  ctx.drawImage(crest, crestRect.x, crestRect.y, crestRect.width, crestRect.height);
  const flagRect = containImageRect(flag, 1380, 62, 150, 94);
  ctx.drawImage(flag, flagRect.x, flagRect.y, flagRect.width, flagRect.height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#183943";
  ctx.font = "700 29px Arial";
  ctx.fillText(HEADER_LINES[0], width / 2, 74, 1030);
  ctx.font = "800 43px Arial";
  ctx.fillText(HEADER_LINES[1], width / 2, 120, 940);
  ctx.fillStyle = "#324f54";
  ctx.font = "600 22px Arial";
  ctx.fillText(HEADER_LINES[2], width / 2, 158, 1020);
  ctx.font = "700 25px Arial";
  ctx.fillText(HEADER_LINES[3], width / 2, 194, 900);

  // Draw the safety marking into the same bitmap used by both preview and download.
  ctx.save();
  ctx.translate(width / 2, 556);
  ctx.rotate(-0.16);
  ctx.textAlign = "center";
  ctx.font = "900 108px Arial";
  ctx.fillStyle = "rgba(160, 30, 35, .20)";
  ctx.fillText("DEMO", 0, 0);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.fillStyle = "#193b40";
  ctx.font = "800 34px Arial";
  ctx.fillText("ID NUMBER", 78, 256);
  ctx.fillStyle = "#102c32";
  ctx.font = "700 43px Arial";
  ctx.fillText(formatDemoIdNumber(values.idNumber), 78, 309, 950);

  const details = [
    { sw: "JINA", en: "Given Name", value: [values.firstName, values.middleName].filter(Boolean).join(" ").toUpperCase() },
    { sw: "JINA LA MWISHO", en: "Last Name", value: values.lastName.toUpperCase() },
    { sw: "TAREHE YA KUZALIWA", en: "Date of Birth", value: formatDemoBirthDate(values.dateOfBirth) },
    { sw: "JINSI", en: "Sex", value: values.gender.toUpperCase() },
    { sw: "SAINI", en: "Signature", value: values.signature || "—" },
  ];
  const rowYs = [397, 510, 623, 736, 849];
  details.forEach((field, index) => {
    const y = rowYs[index];
    ctx.textAlign = "left";
    ctx.fillStyle = "#244f4f";
    ctx.font = "800 23px Arial";
    ctx.fillText(field.sw, 80, y);
    ctx.fillStyle = "#52666a";
    ctx.font = "18px Arial";
    ctx.fillText(field.en, 80, y + 26);
    ctx.fillStyle = index === 4 ? "#173c52" : "#173238";
    ctx.font = index === 4 ? "italic 34px cursive" : "700 32px Arial";
    drawWrappedText(ctx, field.value, 400, y + 12, 700, 38);
  });

  const photoBox = { x: 1160, y: 310, width: 360, height: 470 };
  ctx.fillStyle = "rgba(255,255,255,.94)";
  ctx.fillRect(photoBox.x, photoBox.y, photoBox.width, photoBox.height);
  if (portrait) drawCoverImage(ctx, portrait, photoBox.x + 10, photoBox.y + 10, photoBox.width - 20, photoBox.height - 20);
  else drawPortraitPlaceholder(ctx, photoBox.x + 10, photoBox.y + 10, photoBox.width - 20, photoBox.height - 20);
  ctx.strokeStyle = "#347d80";
  ctx.lineWidth = 5;
  ctx.strokeRect(photoBox.x, photoBox.y, photoBox.width, photoBox.height);

  ctx.fillStyle = "rgba(255, 244, 224, .94)";
  ctx.fillRect(55, 956, width - 110, 54);
  ctx.strokeStyle = "#a12b31";
  ctx.lineWidth = 3;
  ctx.strokeRect(55, 956, width - 110, 54);
  ctx.textAlign = "center";
  ctx.fillStyle = "#8c1f27";
  ctx.font = "900 28px Arial";
  ctx.fillText(NIDA_DEMO_WATERMARK, width / 2, 992);
}

export default function SoftCopyNidaDemoPage() {
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [firstName, setFirstName] = useState("DEMO");
  const [middleName, setMiddleName] = useState("SAMPLE");
  const [lastName, setLastName] = useState("PERSON");
  const [idNumber, setIdNumber] = useState("00000000000000000000");
  const [dateOfBirth, setDateOfBirth] = useState("2000-01-01");
  const [gender, setGender] = useState("M");
  const [signature, setSignature] = useState("DEMO ONLY");
  const [photo, setPhoto] = useState("");
  const [assets, setAssets] = useState<{ crest: HTMLImageElement; flag: HTMLImageElement } | null>(null);
  const [assetError, setAssetError] = useState("");
  const [photoImage, setPhotoImage] = useState<HTMLImageElement | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const values = useMemo<CardValues>(() => ({ firstName, middleName, lastName, idNumber, dateOfBirth, gender, signature }), [firstName, middleName, lastName, idNumber, dateOfBirth, gender, signature]);

  useEffect(() => {
    let active = true;
    Promise.all([loadCardImage(CARD_ASSETS.ngao), loadCardImage(CARD_ASSETS.bendera)])
      .then(([crest, flag]) => { if (active) { setAssets({ crest, flag }); setAssetError(""); } })
      .catch((error: unknown) => { if (active) setAssetError(error instanceof Error ? error.message : "Nembo au bendera haikupatikana. Hakikisha picha za demo zipo."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!photo) { setPhotoImage(null); setPhotoError(""); return () => { active = false; }; }
    loadCardImage(photo)
      .then((image) => { if (active) { setPhotoImage(image); setPhotoError(""); } })
      .catch(() => { if (active) { setPhotoImage(null); setPhotoError("Picha uliyochagua haikuweza kufunguliwa. Jaribu PNG, JPG au WebP nyingine."); } });
    return () => { active = false; };
  }, [photo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !assets) return;
    drawCard(ctx, values, assets.crest, assets.flag, photoImage);
  }, [assets, values, photoImage]);

  function onChoosePhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setPhotoError("Chagua faili la picha la PNG, JPG au WebP."); return; }
    if (file.size > 8 * 1024 * 1024) { setPhotoError("Picha iwe chini ya 8 MB."); return; }
    const reader = new FileReader();
    reader.onerror = () => setPhotoError("Imeshindikana kusoma picha. Jaribu faili jingine.");
    reader.onload = () => { setPhoto(String(reader.result || "")); setPhotoError(""); };
    reader.readAsDataURL(file);
  }

  async function downloadCard() {
    if (!firstName.trim() || !lastName.trim() || !idNumber.trim() || !dateOfBirth) {
      window.alert("Tafadhali jaza jina la kwanza, jina la mwisho, namba ya mfano na tarehe ya kuzaliwa.");
      return;
    }
    if (!assets) { setAssetError("Subiri nembo na bendera za demo zipakie kabla ya kupakua."); return; }
    if (photo && !photoImage) { setPhotoError("Subiri picha ikamilishe kupakiwa au iondoe kabla ya kupakua."); return; }
    const canvas = canvasRef.current;
    if (!canvas) { setAssetError("Preview ya demo haiko tayari. Onyesha upya ukurasa ujaribu tena."); return; }
    setDownloading(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Imeshindikana kutengeneza PNG ya demo.")), "image/png"));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "nida-demo-not-official.png";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "Imeshindikana kupakua picha ya demo.");
    } finally { setDownloading(false); }
  }

  return (
    <main className="portal-main" style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(16px, 4vw, 32px) 16px" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 18 }}>
        <ArrowLeft size={16} /> Rudi kwenye huduma
      </button>

      <section className="license-form-card" style={{ display: "grid", gap: 18, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <ShieldAlert size={28} aria-hidden="true" />
          <div>
            <h1 style={{ margin: 0 }}>DEMO YA KADI YA UTAMBULISHO</h1>
            <p style={{ margin: "4px 0 0" }}>Tumia taarifa za kubuni. Hii ni sampuli ya muundo tu, si kitambulisho rasmi.</p>
          </div>
        </div>

        <div style={{ padding: "10px 12px", border: "2px solid #9b2730", borderRadius: 8, background: "#fff5f2", color: "#74202a", fontWeight: 800 }} role="note">
          DEMO — NOT AN OFFICIAL ID. Usitumie taarifa halisi za mtu.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 14 }}>
          <label>Jina la kwanza<input className="input" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="off" /></label>
          <label>Jina la kati<input className="input" value={middleName} onChange={(event) => setMiddleName(event.target.value)} autoComplete="off" /></label>
          <label>Jina la mwisho<input className="input" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="off" /></label>
          <label>Namba ya mfano<input className="input" value={idNumber} onChange={(event) => setIdNumber(event.target.value)} inputMode="numeric" autoComplete="off" /></label>
          <label>Tarehe ya kuzaliwa<input className="input" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} /></label>
          <label>Jinsia ya mfano<select className="input" value={gender} onChange={(event) => setGender(event.target.value)}><option value="M">M</option><option value="F">F</option><option value="X">X</option></select></label>
          <label>Sahihi ya mfano<input className="input" value={signature} onChange={(event) => setSignature(event.target.value)} autoComplete="off" /></label>
          <label style={{ gridColumn: "1 / -1" }}>Picha (hiari)<input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onChoosePhoto(event.target.files?.[0])} /></label>
        </div>
        {photoError && <p role="alert" style={{ margin: 0, color: "#a1222b" }}>{photoError}</p>}

        <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>PREVIEW YA DEMO</h2>
          <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box", aspectRatio: `${NIDA_DEMO_CARD_WIDTH} / ${NIDA_DEMO_CARD_HEIGHT}`, overflow: "hidden", borderRadius: 12, border: "1px solid #347d80", background: "#d8eddf", boxShadow: "0 8px 24px rgba(0,0,0,.16)" }}>
            <canvas ref={canvasRef} width={NIDA_DEMO_CARD_WIDTH} height={NIDA_DEMO_CARD_HEIGHT} role="img" aria-label={NIDA_DEMO_WATERMARK} style={{ display: "block", width: "100%", height: "100%" }} />
          </div>
          {!assets && !assetError && <p role="status" style={{ margin: 0 }}>Inapakia picha za demo…</p>}
          {assetError && <p role="alert" style={{ margin: 0, color: "#a1222b" }}>{assetError}</p>}
          <p style={{ margin: 0, color: "#7b2027", fontSize: 13, fontWeight: 700 }}>Watermark ya DEMO itaonekana pia kwenye PNG iliyopakuliwa.</p>
        </div>

        <button type="button" className="button button--green" style={{ marginTop: 4, width: "100%" }} onClick={downloadCard} disabled={!assets || downloading}>
          <Download size={18} /> {downloading ? "INAANDAA PNG…" : "PAKUA PNG YA DEMO"}
        </button>
      </section>
    </main>
  );
}
