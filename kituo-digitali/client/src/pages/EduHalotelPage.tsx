import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, ImagePlus, PenLine, RotateCcw, GraduationCap, UserRound, Search, CheckCircle2, Printer } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { consumeFirebaseTokens, getServiceTokenConfig } from "@/lib/firebase";
import { triggerDownload } from "@/lib/downloadHistory";
import { EDU_CARD_HEIGHT, EDU_CARD_WIDTH, formatEduDate, makeEduQrPayload } from "@/lib/eduHalotelCard";
import "./EduHalotelPage.css";

type Student = {
  name: string;
  college: string;
  customCollege: string;
  course: string;
  startYear: string;
  endYear: string;
  issueDate: string;
  regNo: string;
  photo: string;
  logo: string;
  signature: string;
  address: string;
  email: string;
  phone: string;
  website: string;
};

const COLLEGES = ["Maswa Clinical Training Center (CTC)", "Kahama Clinical Training Center", "Sengerema Health Training Institute", "Chuo kingine"];
const COURSES = ["Nursing and Midwifery", "Clinical Medicine", "Medical Laboratory Sciences", "Pharmaceutical Sciences", "Health Records and Information Technology", "Social Work", "Accountancy", "Secretarial Studies"];
const DESIGN_WIDTH = 1600;
const DESIGN_HEIGHT = 1000;
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const collegeCode = (college: string) => college.includes("Maswa") ? "CTC" : college.includes("Kahama") ? "KCT" : college.includes("Sengerema") ? "SHTI" : "EDU";
const makeReg = (college: string, year: string) => `NS/${collegeCode(college)}/${year.slice(-2)}/0001`;
const cardCollege = (s: Student) => (s.customCollege || s.college || "COLLEGE NAME").toUpperCase();
const rounded = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
};
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => resolve(image);
  image.src = src;
});
const drawCover = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) => {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const cropX = (image.naturalWidth - cropWidth) / 2;
  const cropY = (image.naturalHeight - cropHeight) / 2;
  ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, x, y, width, height);
};
const drawWrapped = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else line = candidate;
  }
  if (line) ctx.fillText(line, x, y);
};
const drawOuterFrame = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = "#edf1f2";
  ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  ctx.strokeStyle = "#123a60";
  ctx.lineWidth = 9;
  rounded(ctx, 5, 5, DESIGN_WIDTH - 10, DESIGN_HEIGHT - 10, 47);
  ctx.stroke();
  ctx.lineWidth = 3;
  rounded(ctx, 23, 23, DESIGN_WIDTH - 46, DESIGN_HEIGHT - 46, 30);
  ctx.stroke();
};
const drawSpecimenWatermark = (ctx: CanvasRenderingContext2D) => {
  ctx.save();
  ctx.translate(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2);
  ctx.rotate(-Math.PI / 8);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 66px Arial, sans-serif";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.fillStyle = "rgba(156, 32, 32, .40)";
  ctx.strokeText("DEMO — NOT AN OFFICIAL ID", 0, 0, 1450);
  ctx.fillText("DEMO — NOT AN OFFICIAL ID", 0, 0, 1450);
  ctx.restore();
};
const loadQr = async (qr: string) => qr ? loadImage(qr) : null;

async function drawFront(canvas: HTMLCanvasElement, s: Student, qr: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = EDU_CARD_WIDTH;
  canvas.height = EDU_CARD_HEIGHT;
  ctx.scale(EDU_CARD_WIDTH / DESIGN_WIDTH, EDU_CARD_HEIGHT / DESIGN_HEIGHT);
  drawOuterFrame(ctx);

  const logo = s.logo ? await loadImage(s.logo) : null;
  if (logo?.naturalWidth) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(78, 85); ctx.lineTo(218, 85); ctx.quadraticCurveTo(235, 85, 244, 101);
    ctx.lineTo(244, 159); ctx.quadraticCurveTo(235, 175, 218, 175); ctx.lineTo(78, 175);
    ctx.quadraticCurveTo(61, 175, 70, 159); ctx.lineTo(70, 101); ctx.quadraticCurveTo(70, 85, 78, 85); ctx.fill();
    drawCover(ctx, logo, 88, 95, 138, 70);
  } else {
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.ellipse(157, 130, 91, 49, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#123a60"; ctx.font = "700 15px Arial, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("INSTITUTION", 157, 127); ctx.fillText("LOGO", 157, 147); ctx.textAlign = "left";
  }

  ctx.fillStyle = "#101719";
  ctx.textAlign = "center";
  ctx.font = "900 47px Arial, sans-serif";
  ctx.fillText(cardCollege(s), 900, 109, 1260);
  ctx.font = "800 37px Arial, sans-serif";
  ctx.fillText("STUDENT IDENTITY CARD", 900, 174, 1050);
  ctx.textAlign = "left";

  const photoX = 74, photoY = 248, photoW = 448, photoH = 608;
  ctx.fillStyle = "#fff"; ctx.fillRect(photoX - 12, photoY - 12, photoW + 24, photoH + 24);
  ctx.strokeStyle = "#123a60"; ctx.lineWidth = 3; ctx.strokeRect(photoX - 12, photoY - 12, photoW + 24, photoH + 24);
  ctx.strokeStyle = "#8297a7"; ctx.lineWidth = 1.5; ctx.strokeRect(photoX - 6, photoY - 6, photoW + 12, photoH + 12);
  ctx.save(); ctx.beginPath(); ctx.rect(photoX, photoY, photoW, photoH); ctx.clip();
  const photo = s.photo ? await loadImage(s.photo) : null;
  if (photo?.naturalWidth) drawCover(ctx, photo, photoX, photoY, photoW, photoH);
  else {
    ctx.fillStyle = "#e4e9e9"; ctx.fillRect(photoX, photoY, photoW, photoH);
    ctx.fillStyle = "#9eafb7"; ctx.beginPath(); ctx.arc(photoX + photoW / 2, photoY + 205, 83, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(photoX + photoW / 2, photoY + 490, 153, 135, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#364d5b"; ctx.font = "700 20px Arial, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("STUDENT PHOTO", photoX + photoW / 2, photoY + photoH - 27); ctx.textAlign = "left";
  }
  ctx.restore();

  const labelX = 590, valueX = 842;
  const rows: [string, string][] = [
    ["Name:", s.name.trim().toUpperCase() || ""],
    ["Course:", s.course],
    ["Reg No:", s.regNo],
    ["Issue Date:", formatEduDate(s.issueDate)],
    ["Valid Until:", s.endYear ? `31-12-${s.endYear}` : ""],
    ["Year of Study:", s.startYear && s.endYear ? `${s.startYear}–${s.endYear}` : ""],
  ];
  let y = 278;
  for (const [label, value] of rows) {
    ctx.fillStyle = "#111719"; ctx.font = "400 35px Arial, sans-serif"; ctx.fillText(label, labelX, y);
    ctx.font = "800 35px Arial, sans-serif"; ctx.fillText(value, valueX, y, 690);
    y += 59;
  }

  const signatureX = 590, signatureY = 738, signatureW = 540;
  ctx.strokeStyle = "#101719"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(signatureX, signatureY); ctx.lineTo(signatureX + signatureW, signatureY); ctx.stroke();
  ctx.fillStyle = "#111719"; ctx.font = "400 24px Arial, sans-serif"; ctx.textAlign = "center";
  ctx.fillText("Signature of Bearer", signatureX + signatureW / 2, signatureY + 33); ctx.textAlign = "left";
  if (s.signature) {
    const signature = await loadImage(s.signature);
    if (signature.naturalWidth) ctx.drawImage(signature, signatureX + 145, signatureY - 83, 245, 72);
  }
  const qrImage = await loadQr(qr);
  if (qrImage?.naturalWidth) {
    ctx.fillStyle = "#fff"; ctx.fillRect(1350, 606, 176, 176);
    ctx.drawImage(qrImage, 1357, 613, 162, 162);
  }
  drawSpecimenWatermark(ctx);
}

async function drawBack(canvas: HTMLCanvasElement, s: Student, qr: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = EDU_CARD_WIDTH;
  canvas.height = EDU_CARD_HEIGHT;
  ctx.scale(EDU_CARD_WIDTH / DESIGN_WIDTH, EDU_CARD_HEIGHT / DESIGN_HEIGHT);
  drawOuterFrame(ctx);

  ctx.fillStyle = "#123a60"; ctx.textAlign = "center"; ctx.font = "900 44px Arial, sans-serif";
  ctx.fillText("STUDENT CARD AGREEMENT", 800, 112);
  ctx.fillStyle = "#101719"; ctx.textAlign = "left"; ctx.font = "700 29px Arial, sans-serif";
  drawWrapped(ctx, "“This card remains the property of the issuing institution. It must be carried and presented when requested. It is non-transferable.”", 95, 172, 1410, 39);

  const leftX = 95, rightX = 915, topY = 276;
  const drawContact = (x: number, y: number, label: string, value: string, width: number) => {
    ctx.fillStyle = "#101719"; ctx.font = "800 28px Arial, sans-serif"; ctx.fillText(label, x, y);
    ctx.font = "400 27px Arial, sans-serif"; drawWrapped(ctx, value || "", x, y + 35, width, 34);
  };
  ctx.fillStyle = "#101719"; ctx.font = "800 28px Arial, sans-serif"; ctx.fillText("ADDRESS:", leftX, topY);
  ctx.font = "400 26px Arial, sans-serif";
  const addressLines = (s.address || "").split(/\n+/).map(line => line.trim()).filter(Boolean);
  addressLines.forEach((line, index) => ctx.fillText(line, leftX, topY + 36 + index * 34, 650));
  drawContact(leftX, topY + 151, "TELEPHONE:", s.phone, 650);
  drawContact(rightX, topY, "EMAIL:", s.email, 600);
  drawContact(rightX, topY + 75, "WEBSITE:", s.website, 600);

  // Reproducible specimen barcode-like bars; it is not an institutional validation code.
  const seed = `DEMO-${s.regNo || "SAMPLE"}`;
  let barX = 95;
  for (let i = 0; i < seed.length * 7 && barX < 755; i++) {
    const code = seed.charCodeAt(i % seed.length);
    const barWidth = 2 + ((code * (i + 3)) % 5);
    ctx.fillStyle = "#080b0c"; ctx.fillRect(barX, 523, barWidth, 130); barX += barWidth + 3;
  }
  ctx.fillStyle = "#101719"; ctx.font = "700 22px Arial, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(s.regNo || "REGISTRATION NUMBER", 420, 681);

  if (s.logo) {
    const logo = await loadImage(s.logo);
    if (logo.naturalWidth) { ctx.save(); ctx.globalAlpha = 0.15; ctx.drawImage(logo, 695, 365, 220, 235); ctx.restore(); }
  }
  const qrImage = await loadQr(qr);
  if (qrImage?.naturalWidth) { ctx.fillStyle = "#fff"; ctx.fillRect(1350, 522, 176, 176); ctx.drawImage(qrImage, 1357, 529, 162, 162); }
  ctx.fillStyle = "#101719"; ctx.textAlign = "left"; ctx.font = "400 25px Arial, sans-serif";
  ctx.fillText("Valid only for the registered student.", 868, 650);
  ctx.fillText("Report loss immediately.", 868, 684);
  ctx.fillText("Return this card after completion.", 868, 718);
  ctx.textAlign = "center"; ctx.font = "700 26px Arial, sans-serif";
  ctx.fillText("“Issued in accordance with institutional policy.”", 800, 782);
  drawSpecimenWatermark(ctx);
}

export default function EduHalotelPage() {
  const { firebaseUser } = useAuth();
  const [student, setStudent] = useState<Student>({
    name: "", college: COLLEGES[1], customCollege: "", course: "", startYear: "", endYear: "", issueDate: today(),
    regNo: "", photo: "", logo: "", signature: "", address: "", email: "", phone: "", website: "",
  });
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const front = useRef<HTMLCanvasElement>(null);
  const back = useRef<HTMLCanvasElement>(null);
  const signatureCanvas = useRef<HTMLCanvasElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const renderReady = useRef<Promise<void>>(Promise.resolve());
  const update = (key: keyof Student, value: string) => setStudent(previous => ({ ...previous, [key]: value }));

  useEffect(() => setPaid(false), [student]);

  const qrPayload = useMemo(() => makeEduQrPayload({
    name: student.name,
    college: student.customCollege || student.college,
    course: student.course,
    regNo: student.regNo,
    validUntil: student.endYear,
  }), [student.name, student.customCollege, student.college, student.course, student.regNo, student.endYear]);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(qrPayload, { width: 320, margin: 1, errorCorrectionLevel: "M" }).then(value => { if (active) setQr(value); });
    return () => { active = false; };
  }, [qrPayload]);

  useEffect(() => {
    renderReady.current = Promise.all([
      front.current ? drawFront(front.current, student, qr) : Promise.resolve(),
      back.current ? drawBack(back.current, student, qr) : Promise.resolve(),
    ]).then(() => undefined);
  }, [student, qr]);

  const saveSignature = () => {
    if (!signatureCanvas.current) return;
    update("signature", signatureCanvas.current.toDataURL("image/png"));
    toast.success("Saini limehifadhiwa.");
  };
  const clearSignature = () => {
    const ctx = signatureCanvas.current?.getContext("2d");
    if (ctx && signatureCanvas.current) ctx.clearRect(0, 0, signatureCanvas.current.width, signatureCanvas.current.height);
    update("signature", "");
  };
  const onSignaturePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvas.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * canvas.width / bounds.width;
    const y = (event.clientY - bounds.top) * canvas.height / bounds.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (event.type === "pointerdown") { dragging.current = true; canvas.setPointerCapture(event.pointerId); ctx.beginPath(); ctx.moveTo(x, y); }
    else if (event.type === "pointermove" && dragging.current) { ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#123a60"; ctx.lineTo(x, y); ctx.stroke(); }
    else if (event.type === "pointerup" || event.type === "pointercancel") dragging.current = false;
  };
  const chooseImage = (file: File | undefined, key: "photo" | "logo") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Chagua faili la picha."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Picha isizidi 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => update(key, String(reader.result));
    reader.onerror = () => toast.error("Imeshindikana kusoma picha hiyo.");
    reader.readAsDataURL(file);
  };

  const validate = () => {
    if (!student.name.trim() || !student.regNo.trim() || !student.course.trim() || !student.startYear || !student.endYear) {
      toast.error("Jaza jina, kozi, namba ya usajili na miaka ya masomo.");
      return false;
    }
    if (Number(student.endYear) < Number(student.startYear)) { toast.error("Mwaka wa kumaliza hauwezi kuwa kabla ya mwaka wa kuanza."); return false; }
    return true;
  };
  const chargeTokenOnce = async () => {
    if (!firebaseUser) throw new Error("Ingia kwanza ili kutoa kitambulisho.");
    if (paid) return;
    const config = await getServiceTokenConfig("edu-halotel");
    await consumeFirebaseTokens(firebaseUser.uid, {
      slug: "edu-halotel", name: config.name || "EDU-HALOTEL STUDENT ID", tokenCost: config.tokenCost,
      kind: config.isFree || config.tokenCost === 0 ? "free" : "paid", tokenType: "huduma",
    }, crypto.randomUUID());
    setPaid(true);
  };
  const download = async (side: "front" | "back", format: "PNG" | "JPG") => {
    if (!validate()) return;
    if (!firebaseUser) { toast.error("Ingia kwanza."); return; }
    setBusy(true);
    try {
      await chargeTokenOnce();
      await renderReady.current;
      const canvas = side === "front" ? front.current : back.current;
      if (!canvas) throw new Error("Preview haipo tayari.");
      const mime = format === "PNG" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(`Imeshindikana kuandaa ${format}.`)), mime, 0.96));
      const safeRegNo = student.regNo.replace(/[^A-Za-z0-9-]/g, "-");
      await triggerDownload(blob, `EDU-HALOTEL-${safeRegNo}-${side.toUpperCase()}.${format.toLowerCase()}`, format, { source: "edu-halotel" });
      toast.success(`Picha ya ${side === "front" ? "mbele" : "nyuma"} (${format}) imepakuliwa.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Imeshindikana kupakua kitambulisho."); }
    finally { setBusy(false); }
  };
  const printCards = async () => {
    if (!validate()) return;
    if (!firebaseUser) { toast.error("Ingia kwanza."); return; }
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Ruhusu popup ili kuchapisha pande zote mbili."); return; }
    printWindow.opener = null;
    setBusy(true);
    try {
      await chargeTokenOnce();
      await renderReady.current;
      if (!front.current || !back.current) throw new Error("Preview haipo tayari.");
      const frontSrc = front.current.toDataURL("image/png");
      const backSrc = back.current.toDataURL("image/png");
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>EDU-HALOTEL specimen cards</title><style>@page{size:90mm 56.25mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}.card-page{width:90mm;height:56.25mm;display:grid;place-items:center;page-break-after:always;break-after:page}.card-page:last-child{page-break-after:auto;break-after:auto}img{display:block;width:85.6mm;height:53.5mm;object-fit:fill}@media screen{body{padding:10mm}.card-page{margin:0 auto 8mm;border:1px dashed #aaa}}</style></head><body><section class="card-page"><img src="${frontSrc}" alt="Front specimen card"></section><section class="card-page"><img src="${backSrc}" alt="Back specimen card"></section></body></html>`);
      printWindow.document.close();
      printWindow.setTimeout(() => printWindow.print(), 350);
    } catch (error) { printWindow.close(); toast.error(error instanceof Error ? error.message : "Imeshindikana kuchapisha."); }
    finally { setBusy(false); }
  };

  const college = student.customCollege || student.college;
  return <main className="edu-page">
    <header className="edu-hero"><span className="edu-mark"><GraduationCap size={28} /></span><div><span className="edu-kicker">SMARTSERVICESTZ · EDUCATION TOOLS</span><h1>EDU-HALOTEL</h1><p>Kitambulisho cha mwanafunzi · template ya mfano wa mbele na nyuma</p></div></header>
    <div className="edu-layout">
      <section className="edu-form-card">
        <div className="edu-card-heading"><div><span className="edu-step">01 · STUDENT PROFILE</span><h2>Taarifa za mwanafunzi</h2></div><UserRound /></div>
        <label className="edu-upload" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); chooseImage(event.dataTransfer.files[0], "photo"); }}>
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => chooseImage(event.target.files?.[0], "photo")} />
          {student.photo ? <img src={student.photo} alt="Picha ya mwanafunzi" /> : <span className="edu-upload-icon"><ImagePlus size={27} /></span>}
          <span><b>{student.photo ? "Badilisha picha ya mwanafunzi" : "Pakia picha ya mwanafunzi"}</b><small>JPG, PNG au WebP · hadi MB 5</small></span>
          <button type="button" onClick={event => { event.preventDefault(); photoInput.current?.click(); }}>Chagua picha</button>
        </label>
        <label className="edu-upload edu-logo-upload">
          <input ref={logoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => chooseImage(event.target.files?.[0], "logo")} />
          {student.logo ? <img src={student.logo} alt="Nembo ya taasisi" /> : <span className="edu-upload-icon"><ImagePlus size={24} /></span>}
          <span><b>{student.logo ? "Badilisha nembo ya taasisi" : "Pakia nembo rasmi ya taasisi"}</b><small>Nembo itawekwa sehemu ya juu kushoto · hadi MB 5</small></span>
          <button type="button" onClick={event => { event.preventDefault(); logoInput.current?.click(); }}>Chagua nembo</button>
        </label>
        <div className="edu-fields">
          <label className="edu-field edu-wide"><span>Jina kamili la mwanafunzi</span><input value={student.name} onChange={event => update("name", event.target.value)} placeholder="Andika majina yote ya mwanafunzi" autoComplete="name" /></label>
          <label className="edu-field"><span>Chuo / taasisi</span><input list="edu-colleges" value={college === "Chuo kingine" ? student.customCollege : college} onChange={event => { const value = event.target.value; const known = COLLEGES.includes(value); update("college", known ? value : "Chuo kingine"); update("customCollege", known ? "" : value); }} placeholder="Tafuta au andika jina" /><datalist id="edu-colleges">{COLLEGES.map(value => <option key={value} value={value} />)}</datalist></label>
          <label className="edu-field"><span>Kozi</span><select value={student.course} onChange={event => update("course", event.target.value)}><option value="">Chagua kozi</option>{COURSES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="edu-field"><span>Mwaka wa kuanza</span><select value={student.startYear} onChange={event => update("startYear", event.target.value)}><option value="">Chagua</option>{Array.from({ length: 12 }, (_, index) => String(2024 + index)).map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="edu-field"><span>Mwaka wa kumaliza</span><select value={student.endYear} onChange={event => update("endYear", event.target.value)}><option value="">Chagua mwaka</option>{Array.from({ length: 12 }, (_, index) => String(2025 + index)).map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="edu-field"><span>Tarehe ya kutolewa</span><input type="date" value={student.issueDate} onChange={event => update("issueDate", event.target.value)} /></label>
          <label className="edu-field"><span>Namba ya usajili (Reg No.)</span><input value={student.regNo} onChange={event => update("regNo", event.target.value)} placeholder="Mfano: NS/KCT/26/0001" autoComplete="off" /></label>
          <label className="edu-field"><span>Kitambulisho kitakuwa halali hadi</span><input value={student.endYear ? `31-12-${student.endYear}` : ""} placeholder="Hesabiwa kwa mwaka wa kumaliza" readOnly aria-readonly="true" /></label>
        </div>
        <div className="edu-sign-title"><PenLine size={17} /><b>Saini ya mwanafunzi (hiari)</b><small>Chora kwa kidole au mouse</small></div>
        <canvas ref={signatureCanvas} className="edu-sign-pad" width={720} height={170} onPointerDown={onSignaturePointer} onPointerMove={onSignaturePointer} onPointerUp={onSignaturePointer} onPointerCancel={onSignaturePointer} />
        <div className="edu-sign-actions"><button type="button" onClick={clearSignature}><RotateCcw size={15} /> Futa</button><button type="button" onClick={saveSignature}><CheckCircle2 size={15} /> Hifadhi saini</button></div>
        <div className="edu-sign-title"><Search size={17} /><b>Taarifa za taasisi kwa nyuma</b><small>Hiari</small></div>
        <div className="edu-fields">
          <label className="edu-field edu-wide"><span>Anwani (unaweza kuweka mistari kadhaa)</span><textarea value={student.address} onChange={event => update("address", event.target.value)} placeholder={'P.O. Box ...\nWilaya, Mkoa, Tanzania'} rows={3} /></label>
          <label className="edu-field"><span>Barua pepe</span><input type="email" value={student.email} onChange={event => update("email", event.target.value)} placeholder="registrar@chuo.ac.tz" /></label>
          <label className="edu-field"><span>Tovuti</span><input value={student.website} onChange={event => update("website", event.target.value)} placeholder="www.chuo.ac.tz" /></label>
          <label className="edu-field edu-wide"><span>Namba ya simu</span><input value={student.phone} onChange={event => update("phone", event.target.value)} placeholder="+255 ..." /></label>
        </div>
      </section>
      <section className="edu-preview-card">
        <div className="edu-card-heading"><div><span className="edu-step">02 · LIVE PREVIEW</span><h2>Hakikisho la pande zote</h2></div><span className="edu-live"><i /> LIVE · DEMO</span></div>
        <div className="edu-specimen-notice">Picha zote zina watermark ya kudumu: DEMO — NOT AN OFFICIAL ID</div>
        <div className="edu-side-label">UPANDE WA MBELE · {EDU_CARD_WIDTH} × {EDU_CARD_HEIGHT} PX</div><canvas ref={front} className="edu-id-canvas" aria-label="Preview ya mbele ya kitambulisho" />
        <div className="edu-side-label">UPANDE WA NYUMA</div><canvas ref={back} className="edu-id-canvas" aria-label="Preview ya nyuma ya kitambulisho" />
        <div className="edu-download-group"><b>PNG yenye ubora wa juu</b><div className="edu-downloads"><button type="button" disabled={busy} onClick={() => void download("front", "PNG")}><Download size={17} /> Pakua mbele · PNG</button><button type="button" disabled={busy} onClick={() => void download("back", "PNG")}><Download size={17} /> Pakua nyuma · PNG</button></div></div>
        <div className="edu-download-group"><b>JPG</b><div className="edu-downloads"><button type="button" disabled={busy} onClick={() => void download("front", "JPG")}><Download size={17} /> Pakua mbele · JPG</button><button type="button" disabled={busy} onClick={() => void download("back", "JPG")}><Download size={17} /> Pakua nyuma · JPG</button></div></div>
        <button className="edu-print-button" type="button" disabled={busy} onClick={() => void printCards()}><Printer size={18} /> Chapisha pande zote mbili</button>
        <p className="edu-disclaimer">Hii ni specimen/demo ya muundo. Watermark haiwezi kuondolewa. Nembo, namba za usajili, saini na taarifa lazima zithibitishwe na taasisi husika kabla ya matumizi yoyote rasmi.</p>
      </section>
    </div>
  </main>;
}
