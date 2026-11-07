import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Eraser, BadgeCheck, ClipboardList, UserRound, Hash } from "lucide-react";
import { useLocation } from "wouter";
import JsBarcode from "jsbarcode";

type Side = "front" | "back";
const WIDTH = 1000;
const HEIGHT = 630;

// Unganisha na kiungo chako cha GitHub Raw ambapo picha za id-mbele.png na id-nyuma.png zipo
// Mfano: https://raw.githubusercontent.com/steward-tz/wakala-point/main/public/
const GITHUB_TEMPLATE_BASE = "https://raw.githubusercontent.com/steward-tz/wakala-point/main/public/";

const TEMPLATE_URLS: Record<Side, string> = {
  front: `${GITHUB_TEMPLATE_BASE}id-mbele.png`,
  back: `${GITHUB_TEMPLATE_BASE}id-nyuma.png`,
};

function formatNida(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 20);
  return [digits.slice(0, 8), digits.slice(8, 13), digits.slice(13, 18), digits.slice(18, 20)]
    .filter(Boolean).join("-");
}

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
    image.onerror = () => reject(new Error(`Imeshindikana kupakia template: ${src}`));
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

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nida, setNida] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "">("");
  const [phone, setPhone] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState("Inavuta templates kutoka GitHub...");
  const [isDrawing, setIsDrawing] = useState(false);

  const cleanNida = nida.replace(/\D/g, "").slice(0, 20);
  const formattedNida = useMemo(() => formatNida(cleanNida), [cleanNida]);
  const calculatedBirthDate = useMemo(() => parseDateFromNida(cleanNida), [cleanNida]);

  const complete = firstName.trim() && lastName.trim() && cleanNida.length === 20 && gender;

  // Kupakia templates moja kwa moja kutoka GitHub
  useEffect(() => {
    let active = true;
    Promise.allSettled([loadImage(TEMPLATE_URLS.front), loadImage(TEMPLATE_URLS.back)]).then(([front, back]) => {
      if (!active) return;
      if (front.status === "fulfilled") setFrontTemplate(front.value);
      if (back.status === "fulfilled") setBackTemplate(back.value);
      setMessage(front.status === "fulfilled" && back.status === "fulfilled"
        ? ""
        : "Imeshindikana kuvuta id-mbele.png au id-nyuma.png kutoka GitHub. Hakikisha URL na majina ya picha ziko sahihi.");
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

  function draw(canvas: HTMLCanvasElement | null, template: HTMLImageElement | null, side: Side) {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    if (!template) return;

    context.drawImage(template, 0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#000000";

    const fullNameFirstMid = [firstName, middleName].filter(Boolean).join(" ");

    if (side === "front") {
      if (formattedNida) {
        context.font = "bold 44px monospace";
        context.fillText(formattedNida, 70, 215, 900);
      }

      if (fullNameFirstMid) {
        context.font = "bold 28px Arial";
        context.fillText(fullNameFirstMid.toUpperCase(), 190, 272, 700);
      }

      if (lastName) {
        context.font = "bold 28px Arial";
        context.fillText(lastName.toUpperCase(), 290, 326, 600);
      }

      if (calculatedBirthDate) {
        context.font = "bold 28px Arial";
        context.fillText(calculatedBirthDate, 430, 394, 400);
      }

      if (gender) {
        context.font = "bold 28px Arial";
        context.fillText(gender.toUpperCase(), 170, 452, 100);
      }

      const photoBox = { x: 685, y: 290, width: 205, height: 260 };
      if (portraitImage) {
        context.drawImage(portraitImage, photoBox.x, photoBox.y, photoBox.width, photoBox.height);
      }

      if (signatureImage) {
        const sigImg = new Image();
        sigImg.onload = () => {
          context.drawImage(sigImg, 220, 505, 180, 65);
        };
        sigImg.src = signatureImage;
      }
    } 

    if (side === "back") {
      const cleanNidaDigits = formattedNida.replace(/-/g, "");
      if (cleanNidaDigits && tempBarcodeCanvas.current) {
        try {
          JsBarcode(tempBarcodeCanvas.current, cleanNidaDigits, {
            format: "CODE128",
            width: 3,
            height: 90,
            displayValue: false,
            background: "transparent",
            lineColor: "#000000",
          });
          context.drawImage(tempBarcodeCanvas.current, 120, 70, 760, 95);
        } catch (e) {
          console.error(e);
        }

        context.font = "bold 38px monospace";
        context.textAlign = "center";
        context.fillText(cleanNidaDigits, 500, 205); 
      }
    }
  }

  useEffect(() => {
    if (showPreview) {
      draw(frontCanvas.current, frontTemplate, "front");
      draw(backCanvas.current, backTemplate, "back");
    }
  }, [frontTemplate, backTemplate, firstName, middleName, lastName, formattedNida, calculatedBirthDate, gender, portraitImage, signatureImage, showPreview]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    setShowPreview(true);
  }

  function download(side: Side) {
    const canvas = side === "front" ? frontCanvas.current : backCanvas.current;
    const template = side === "front" ? frontTemplate : backTemplate;
    if (!canvas || !template) return;
    const link = document.createElement("a");
    link.download = side === "front" ? "kitambulisho_mbele.png" : "kitambulisho_nyuma.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  const field: React.CSSProperties = { display: "grid", gap: 8, fontSize: 13, fontWeight: 750, color: "#26364b" };
  const input: React.CSSProperties = { width: "100%", minHeight: 48, border: "1px solid #d8e1ec", borderRadius: 12, padding: "12px 14px", background: "#fff", color: "#172033", fontSize: 15, outlineColor: "#2563eb", boxSizing: "border-box" };
  const panel: React.CSSProperties = { background: "#fff", border: "1px solid #e4eaf2", borderRadius: 18, padding: 20, marginBottom: 16, boxShadow: "0 8px 24px rgba(15,23,42,.045)" };
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 16 };
  const heading: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, margin: "0 0 16px", fontSize: 17, fontWeight: 850, color: "#172b4d" };

  const nidaDigits = cleanNida.length;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "18px 14px 40px", color: "#172033" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 18, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <ArrowLeft size={16} /> Rudi kwenye huduma
      </button>

      <header style={{ borderRadius: 22, padding: "24px 22px", marginBottom: 18, color: "#fff", background: "linear-gradient(120deg,#123c70,#2563eb 62%,#4f46e5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 850, letterSpacing: 1.4, opacity: .9 }}><ClipboardList size={18}/> FOMU YA TAARIFA</div>
        <h1 style={{ margin: "10px 0 6px", fontSize: "clamp(25px,5vw,34px)", letterSpacing: "-.7px" }}>JENERETA YA KITAMBULISHO (GITHUB TEMPLATE)</h1>
        <p style={{ margin: 0, lineHeight: 1.6, maxWidth: 600, color: "#e5efff", fontSize: 14 }}>
      
