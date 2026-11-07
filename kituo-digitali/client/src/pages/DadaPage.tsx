import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Eraser, BadgeCheck, ClipboardList, UserRound, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import JsBarcode from "jsbarcode";
import { removePhotoBackground } from "../lib/removePhotoBackground";
import { useAuth } from "@/_core/hooks/useAuth";
import { consumeFirebaseTokens, getServiceTokenConfig } from "@/lib/firebase";

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

export default function DadaPage() {
  const [, navigate] = useLocation();
  const { firebaseUser } = useAuth();
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
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
  const [nida, setNida] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "">("");
  const [message, setMessage] = useState("");
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const cleanNida = nida.replace(/\D/g, "").slice(0, 20);
  const formattedNida = useMemo(() => formatNida(cleanNida), [cleanNida]);
  const calculatedBirthDate = useMemo(() => parseDateFromNida(cleanNida), [cleanNida]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([loadImage(TEMPLATE_URLS.front), loadImage(TEMPLATE_URLS.back)]).then(([front, back]) => {
      if (!active) return;
      if (front.status === "fulfilled") setFrontTemplate(front.value);
      if (back.status === "fulfilled") setBackTemplate(back.value);
      setMessage(front.status === "fulfilled" && back.status === "fulfilled"
        ? ""
        : "Imeshindikana kupakia id-mbele.png au id-nyuma.png kutoka folda ya public.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setPaid(false);
    setRequestId(crypto.randomUUID());
  }, [firstNameMiddle, lastName, nida, gender, portraitImage, signatureImage]);

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

  // Kupakia picha na kuondoa background moja kwa moja kwa kutumia AI background removal
  async function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const originalUrl = URL.createObjectURL(file);
    setIsRemovingBg(true);
    setMessage("Inaondoa background... subiri kidogo.");

    try {
      const blob = await removePhotoBackground(file);
      const bgRemovedUrl = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        setPortraitImage(img);
        setIsRemovingBg(false);
        setMessage("Background imeondolewa kikamilifu!");
      };
      img.src = bgRemovedUrl;
    } catch (err) {
      console.error(err);
      setIsRemovingBg(false);
      setMessage("Imeshindikana kuondoa background. Inatumia picha ya kawaida.");
      
      // Fallback: Tumia picha ya kawaida kama background removal ikisumbua
      const img = new Image();
      img.onload = () => setPortraitImage(img);
      img.src = originalUrl;
    }
  }

  function draw(canvas: HTMLCanvasElement | null, template: HTMLImageElement | null, side: Side) {
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    if (!template) return;

    context.drawImage(template, 0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#000000";

    if (side === "front") {
      if (formattedNida) {
        context.font = "bold 44px monospace";
        context.fillText(formattedNida, 70, 215, 900);
      }

      if (firstNameMiddle) {
        context.font = "bold 28px Arial";
        context.fillText(firstNameMiddle.toUpperCase(), 190, 272, 700);
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

      // Ukubwa sahihi wa picha ya pasipoti (Bust shot) kwenye kadi
      const photoBox = { x: 585, y: 260, width: 330, height: 320 };
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

    // Watermark huongezwa kwenye soft copy baada tu ya malipo kuthibitishwa.
    if (paid) {
      context.save();
      context.globalAlpha = 0.24;
      context.fillStyle = "#1e3a8a";
      context.font = "bold 46px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.translate(WIDTH / 2, HEIGHT / 2);
      context.rotate(-Math.PI / 7);
      context.fillText("SMART SERVICES TZ", 0, 0);
      context.restore();
    }
  }

  useEffect(() => {
    draw(frontCanvas.current, frontTemplate, "front");
    draw(backCanvas.current, backTemplate, "back");
  }, [frontTemplate, backTemplate, firstNameMiddle, lastName, formattedNida, calculatedBirthDate, gender, portraitImage, signatureImage, paid]);

  async function ensurePaid() {
    if (paid) return;
    if (!firebaseUser?.uid) throw new Error("Ingia kwanza ili kutumia NIDA SOFT COPY.");
    const config = await getServiceTokenConfig("nakala-nida");
    if (!Number.isSafeInteger(config.tokenCost) || config.tokenCost <= 0) {
      throw new Error("Gharama ya NIDA SOFT COPY haijawekwa. Admin aweke tokeni 3 kwenye Dashboard.");
    }
    await consumeFirebaseTokens(firebaseUser.uid, {
      slug: "nakala-nida",
      name: config.name || "NIDA SOFT COPY",
      tokenCost: config.tokenCost,
      kind: "paid",
      tokenType: "nida",
    }, requestId);
    setPaid(true);
    setMessage(`Tokeni ${config.tokenCost} zimekatwa. Unaweza kupakua pande zote mbili za kitambulisho.`);
  }

  async function download(side: Side) {
    if (busy) return;
    const canvas = side === "front" ? frontCanvas.current : backCanvas.current;
    const template = side === "front" ? frontTemplate : backTemplate;
    if (!canvas || !template) {
      setMessage("Picha ya kitambulisho bado haijapakiwa. Subiri kidogo kisha jaribu tena.");
      return;
    }
    setBusy(true);
    try {
      await ensurePaid();
      const link = document.createElement("a");
      link.download = side === "front" ? "kitambulisho_mbele.png" : "kitambulisho_nyuma.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      setMessage(paid ? "Upakuaji umeanza. Tokeni za kitambulisho hiki zimeshatumika." : "Upakuaji umeanza. Tokeni zimekatwa kwa kitambulisho hiki.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Imeshindikana kulipia au kupakua NIDA SOFT COPY.");
    } finally {
      setBusy(false);
    }
  }

  const field: React.CSSProperties = { display: "grid", gap: 6, fontSize: 13, fontWeight: 750, color: "#26364b" };
  const input: React.CSSProperties = { width: "100%", minHeight: 42, border: "1px solid #d8e1ec", borderRadius: 10, padding: "10px 12px", background: "#fff", color: "#172033", fontSize: 14, outlineColor: "#2563eb", boxSizing: "border-box" };
  const panel: React.CSSProperties = { background: "#fff", border: "1px solid #e4eaf2", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 4px 16px rgba(15,23,42,.03)" };
  const heading: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", fontSize: 16, fontWeight: 800, color: "#172b4d" };

  const nidaDigits = cleanNida.length;

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "16px 12px 36px", color: "#172033" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: 13 }}>
        <ArrowLeft size={15} /> Rudi kwenye huduma
      </button>

      <header style={{ borderRadius: 16, padding: "18px 20px", marginBottom: 14, color: "#fff", background: "linear-gradient(120deg,#123c70,#2563eb 62%,#4f46e5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: 1.2, opacity: .9 }}><ClipboardList size={16}/> FOMU YA NIDA</div>
        <h1 style={{ margin: "6px 0 4px", fontSize: "clamp(22px,4vw,28px)", letterSpacing: "-.5px" }}>JENERETA YA KITAMBULISHO</h1>
      </header>

      {/* FOMU YA KUJAZA */}
      <section style={panel}>
        <h2 style={heading}><UserRound size={17} color="#2563eb"/> Taarifa za Msingi</h2>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12}}>
          <label style={field}>Jina la Kwanza na la Kati *<input style={input} value={firstNameMiddle} onChange={e=>setFirstNameMiddle(e.target.value)} placeholder="Mfano: JOSEPH BAKARI" required /></label>
          <label style={field}>Jina la Mwisho / Ukoo *<input style={input} value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Mfano: JUMA" required /></label>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12, marginTop: 12}}>
          <label style={field}>Namba ya NIDA (NIN) *
            <input style={{...input, fontVariantNumeric: "tabular-nums", letterSpacing: 1}} inputMode="numeric" value={formattedNida} onChange={e=>setNida(e.target.value)} placeholder="20050501-41210-00001-80" maxLength={23} required />
            <span style={{fontSize:11, color:nidaDigits===20?"#15803d":"#64748b"}}>{nidaDigits}/20 tarakimu (Tarehe: {calculatedBirthDate || "—"})</span>
          </label>

          <label style={field}>Jinsia *
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}>
              {(["M","F"] as const).map(value=><button key={value} type="button" onClick={()=>setGender(value)} aria-pressed={gender===value} style={{minHeight:42,borderRadius:10,border:gender===value?"2px solid #2563eb":"1px solid #d8e1ec",background:gender===value?"#eff6ff":"#fff",color:gender===value?"#1d4ed8":"#334155",fontSize:14,fontWeight:800,cursor:"pointer"}}>{value==="M"?"ME (M)":"KE (F)"}</button>)}
            </div>
          </label>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12, marginTop: 12}}>
          <label style={field}>
            <span>Picha ya Uso (Inaondoa background yenyewe)</span>
            <div style={{display: "flex", gap: 8, alignItems: "center"}}>
              <input style={{...input, padding: "6px", flex: 1}} type="file" accept="image/*" onChange={handlePhotoUpload} />
              {isRemovingBg && <span style={{fontSize: 12, color: "#2563eb", display: "flex", alignItems: "center", gap: 4}}><Sparkles size={14} /> Inasafisha...</span>}
            </div>
          </label>
          
          <div style={field}>
            <span>Saini ya Mtu (Digital Signature)</span>
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
      </section>

      {message && <p role="status" style={{padding: 10, borderRadius: 10, background: "#fff7ed", color: "#9a3412", fontSize: 12, marginBottom: 12}}>{message}</p>}

      {/* LIVE PREVIEW YA KADI */}
      <section style={{...panel, borderColor: "#cbd5e1", background: "#f8fafc"}}>
        <h2 style={{...heading, color: "#1e293b"}}><BadgeCheck size={17} color="#059669"/> Muonekano wa Kitambulisho (Live Preview)</h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
              <b>Upande wa Mbele</b>
              <button className="button button--green" type="button" disabled={!frontTemplate || busy} onClick={() => download("front")} style={{padding: "6px 10px", fontSize: 12}}><Download size={13} /> {busy ? "Inalipia..." : "Pakua Mbele"}</button>
            </div>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1000 / 630", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden" }}>
              <canvas ref={frontCanvas} width={WIDTH} height={HEIGHT} style={{ display: "block", width: "100%", height: "100%" }} />
              {!frontTemplate && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#64748b", fontSize: 12 }}>Inapakia...</span>}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
              <b>Upande wa Nyuma</b>
              <button className="button button--green" type="button" disabled={!backTemplate || busy} onClick={() => download("back")} style={{padding: "6px 10px", fontSize: 12}}><Download size={13} /> {busy ? "Inalipia..." : "Pakua Nyuma"}</button>
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
