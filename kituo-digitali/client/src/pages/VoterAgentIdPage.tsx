import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Eraser, BadgeCheck, ClipboardList, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import JsBarcode from "jsbarcode";

type Side = "front" | "back";
const WIDTH = 1000;
const HEIGHT = 630;

const GITHUB_TEMPLATE_BASE = "https://raw.githubusercontent.com/steward-tz/wakala-point/main/public/";

const TEMPLATE_URLS: Record<Side, string> = {
  front: `${GITHUB_TEMPLATE_BASE}kura-mbele.png`,
  back: `${GITHUB_TEMPLATE_BASE}kura-nyuma.png`,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Imeshindikana kupakia template: ${src}`));
    image.src = src;
  });
}

export default function VoterIdPage() {
  const [, navigate] = useLocation();
  const frontCanvas = useRef<HTMLCanvasElement>(null);
  const backCanvas = useRef<HTMLCanvasElement>(null);
  const signatureCanvas = useRef<HTMLCanvasElement>(null);
  const tempBarcodeCanvas = useRef<HTMLCanvasElement>(null);

  const [frontTemplate, setFrontTemplate] = useState<HTMLImageElement | null>(null);
  const [backTemplate, setBackTemplate] = useState<HTMLImageElement | null>(null);
  const [portraitImage, setPortraitImage] = useState<HTMLImageElement | null>(null);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);

  const [firstNameMiddle, setFirstNameMiddle] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("MALE");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [ward, setWard] = useState("");
  const [street, setStreet] = useState("");
  const [centre, setCentre] = useState("");
  const [message, setMessage] = useState("Inavuta templates za Kadi ya Mpiga Kura kutoka GitHub...");
  const [isDrawing, setIsDrawing] = useState(false);

  // Kutengeneza Namba ya Mpiga Kura kiotomatiki
  const voterIdNumber = useMemo(() => {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const middleDigits = Math.floor(1000 + Math.random() * 9000);
    const endDigits = Math.floor(100 + Math.random() * 900);
    return `T-${randomDigits}-${middleDigits}-${endDigits}-0`;
  }, []);

  const formattedDob = useMemo(() => {
    if (!day || !month || !year) return "";
    return `${day} ${month} ${year}`;
  }, [day, month, year]);

  const complete = firstNameMiddle.trim() && lastName.trim() && day && month && year;

  useEffect(() => {
    let active = true;
    Promise.allSettled([loadImage(TEMPLATE_URLS.front), loadImage(TEMPLATE_URLS.back)]).then(([front, back]) => {
      if (!active) return;
      if (front.status === "fulfilled") setFrontTemplate(front.value);
      if (back.status === "fulfilled") setBackTemplate(back.value);
      setMessage(front.status === "fulfilled" && back.status === "fulfilled"
        ? ""
        : "Imeshindikana kuvuta kura-mbele.png au kura-nyuma.png kutoka GitHub.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const canvas = signatureCanvas.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5;
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

    if (side === "front") {
      // Jina Kamili (Jina la Kwanza + Kati & Jina la Mwisho)
      const fullNamesText = [firstNameMiddle, lastName].filter(Boolean).join(" ").toUpperCase();
      if (fullNamesText) {
        context.font = "bold 24px Arial";
        context.fillText(fullNamesText, 310, 242, 650);
      }

      // Tarehe ya Kuzaliwa
      if (formattedDob) {
        context.font = "bold 22px Arial";
        context.fillText(formattedDob, 310, 362, 400);
      }

      // Jinsia
      if (gender) {
        context.font = "bold 22px Arial";
        context.fillText(gender, 500, 424, 200);
      }

      // Kata - Ward
      if (ward) {
        context.font = "bold 22px Arial";
        context.fillText(ward.toUpperCase(), 310, 508, 400);
      }

      // Mtaa / Kijiji
      if (street) {
        context.font = "bold 22px Arial";
        context.fillText(street.toUpperCase(), 310, 610, 400);
      }

      // Kituo cha Kuandikisha
      if (centre) {
        context.font = "bold 22px Arial";
        context.fillText(centre.toUpperCase(), 310, 712, 400);
      }

      // Picha ya Uso (Passport Size upande wa kushoto)
      const photoBox = { x: 30, y: 220, width: 250, height: 350 };
      if (portraitImage) {
        context.drawImage(portraitImage, photoBox.x, photoBox.y, photoBox.width, photoBox.height);
      }

      // Saini ndogo chini kushoto
      if (signatureImage) {
        const sigImg = new Image();
        sigImg.onload = () => {
          context.drawImage(sigImg, 190, 770, 140, 50);
        };
        sigImg.src = signatureImage;
      }
    } 

    if (side === "back") {
      // Barcode chini
      if (voterIdNumber && tempBarcodeCanvas.current) {
        try {
          JsBarcode(tempBarcodeCanvas.current, voterIdNumber, {
            format: "CODE128",
            width: 3,
            height: 80,
            displayValue: false,
            background: "transparent",
            lineColor: "#000000",
          });
          context.drawImage(tempBarcodeCanvas.current, 310, 780, 580, 85);
        } catch (e) {
          console.error(e);
        }

        context.font = "bold 26px monospace";
        context.fillText(voterIdNumber, 310, 900);
      }
    }
  }

  useEffect(() => {
    draw(frontCanvas.current, frontTemplate, "front");
    draw(backCanvas.current, backTemplate, "back");
  }, [frontTemplate, backTemplate, firstNameMiddle, lastName, formattedDob, gender, ward, street, centre, portraitImage, signatureImage, voterIdNumber]);

  function download(side: Side) {
    const canvas = side === "front" ? frontCanvas.current : backCanvas.current;
    const template = side === "front" ? frontTemplate : backTemplate;
    if (!canvas || !template) return;
    const link = document.createElement("a");
    link.download = side === "front" ? "kura_mbele.png" : "kura_nyuma.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  const field: React.CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 750, color: "#26364b" };
  const input: React.CSSProperties = { width: "100%", minHeight: 42, border: "1px solid #d8e1ec", borderRadius: 10, padding: "10px 12px", background: "#fff", color: "#172033", fontSize: 14, outlineColor: "#2563eb", boxSizing: "border-box" };
  const panel: React.CSSProperties = { background: "#fff", border: "1px solid #e4eaf2", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 4px 16px rgba(15,23,42,.03)" };
  const heading: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", fontSize: 16, fontWeight: 800, color: "#172b4d" };

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "16px 12px 36px", color: "#172033" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: 13 }}>
        <ArrowLeft size={15} /> Rudi kwenye huduma
      </button>

      <header style={{ borderRadius: 16, padding: "18px 20px", marginBottom: 14, color: "#fff", background: "linear-gradient(120deg,#123c70,#2563eb 62%,#4f46e5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: 1.2, opacity: .9 }}><ClipboardList size={16}/> FOMU YA UCHAGUZI</div>
        <h1 style={{ margin: "6px 0 4px", fontSize: "clamp(22px,4vw,28px)", letterSpacing: "-.5px" }}>Kadi ya Mpiga Kura</h1>
      </header>

      {/* FOMU YA KUJAZA */}
      <section style={panel}>
        <h2 style={heading}><UserRound size={17} color="#2563eb"/> Taarifa za Mwombaji</h2>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12}}>
          <label style={field}>Jina la Kwanza na la Kati *<input style={input} value={firstNameMiddle} onChange={e=>setFirstNameMiddle(e.target.value)} placeholder="SALIM M." required /></label>
          <label style={field}>Jina la Mwisho / Ukoo *<input style={input} value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="SWALEH" required /></label>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12, marginTop: 12}}>
          <label style={field}>Tarehe ya Kuzaliwa *
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6}}>
              <input style={input} value={day} onChange={e=>setDay(e.target.value)} placeholder="Tarehe" maxLength={2} required />
              <input style={input} value={month} onChange={e=>setMonth(e.target.value)} placeholder="Mwezi" maxLength={3} required />
              <input style={input} value={year} onChange={e=>setYear(e.target.value)} placeholder="Mwaka" maxLength={4} required />
            </div>
          </label>

          <label style={field}>Jinsia *
            <select style={input} value={gender} onChange={e=>setGender(e.target.value)}>
              <option value="MALE">MALE</option>
              <option value="FEMALE">FEMALE</option>
            </select>
          </label>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: 12, marginTop: 12}}>
          <label style={field}>Kata - Ward<input style={input} value={ward} onChange={e=>setWard(e.target.value)} placeholder="UNGA LIMITED" /></label>
          <label style={field}>Mtaa / Kijiji<input style={input} value={street} onChange={e=>setStreet(e.target.value)} placeholder="MAKABURI YA BANIANI" /></label>
          <label style={field}>Kituo cha Kuandikisha<input style={input} value={centre} onChange={e=>setCentre(e.target.value)} placeholder="OFISI YA AFISA MTENDAJI KATA" /></label>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12, marginTop: 12}}>
          <label style={field}>Ambatisha Picha Yako<input style={{...input, padding: "6px"}} type="file" accept="image/*" onChange={handlePhotoUpload} /></label>
          
          <div style={field}>
            <span>Saini Yako (Wino Mweusi)</span>
            <div style={{display: "flex", gap: 8, alignItems: "center"}}>
              <div style={{ position: "relative", border: "1.5px dashed #cbd5e1", borderRadius: 10, background: "#f8fafc", overflow: "hidden", cursor: "crosshair", width: 220, height: 42 }}>
                <canvas ref={signatureCanvas} width={220} height={42}
                  onMouseDown={startDrawing} onMouseMove={drawSignature} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing} onTouchMove={drawSignature} onTouchEnd={stopDrawing}
                  style={{ display: "block", width: "100%", height: "100%" }} />
              </div>
              <button type="button" onClick={clearSignature} className="button button--secondary" style={{ fontSize: 11, padding: "8px 10px", borderRadius: 8, display: "flex", gap: 4, alignItems: "center", height: 42 }}>
                <Eraser size={13} /> Futa
              </button>
            </div>
          </div>
        </div>

        <div style={{marginTop: 12}}>
          <label style={field}>Namba ya Mpiga Kura (Inajitengeneza Yenyewe)
            <input style={{...input, background: "#f8fafc", color: "#475569"}} value={voterIdNumber} readOnly />
          </label>
        </div>
      </section>

      {message && <p role="status" style={{padding: 10, borderRadius: 10, background: "#fff7ed", color: "#9a3412", fontSize: 12, marginBottom: 12}}>{message}</p>}

      {/* LIVE PREVIEW YA KADI */}
      <section style={{...panel, borderColor: "#cbd5e1", background: "#f8fafc"}}>
        <h2 style={{...heading, color: "#1e293b"}}><BadgeCheck size={17} color="#059669"/> Muonekano wa Kadi (Live Preview)</h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
              <b>Upande wa Mbele</b>
              <button className="button button--green" type="button" disabled={!frontTemplate} onClick={() => download("front")} style={{padding: "6px 10px", fontSize: 12}}><Download size={13} /> Pakua Mbele</button>
            </div>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1000 / 630", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden" }}>
              <canvas ref={frontCanvas} width={WIDTH} height={HEIGHT} style={{ display: "block", width: "100%", height: "100%" }} />
              {!frontTemplate && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#64748b", fontSize: 12 }}>Inapakia...</span>}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
              <b>Upande wa Nyuma</b>
              <button className="button button--green" type="button" disabled={!backTemplate} onClick={() => download("back")} style={{padding: "6px 10px", fontSize: 12}}><Download size={13} /> Pakua Nyuma</button>
            </div>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1000 / 630", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden" }}>
              <canvas ref={backCanvas} width={WIDTH} height={HEIGHT} style={{ display: "block", width: "100%", height: "100%" }} />
              {!backTemplate && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#64748b", fontSize: 12 }}>Inapakia...</span>}
            </div>
          </div>
        </div>
      </section>

      <canvas ref={tempBarcodeCanvas} style={{ display: "none" }}></canvas>
    </main>
  );
  }
                                                     
