import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Eraser, BadgeCheck, ClipboardList, UserRound, Hash } from "lucide-react";
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

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nida, setNida] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "">("");
  const [phone, setPhone] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState("Inapakia templates za kitambulisho...");
  const [isDrawing, setIsDrawing] = useState(false);

  const cleanNida = nida.replace(/\D/g, "").slice(0, 20);
  const formattedNida = useMemo(() => formatNida(cleanNida), [cleanNida]);
  const calculatedBirthDate = useMemo(() => parseDateFromNida(cleanNida), [cleanNida]);

  const complete = firstName.trim() && lastName.trim() && cleanNida.length === 20 && gender;

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
        <h1 style={{ margin: "10px 0 6px", fontSize: "clamp(25px,5vw,34px)", letterSpacing: "-.7px" }}>JENERETA YA KITAMBULISHO CHA TAIFA (NIDA)</h1>
        <p style={{ margin: 0, lineHeight: 1.6, maxWidth: 600, color: "#e5efff", fontSize: 14 }}>Jaza taarifa zako. Tarehe ya kuzaliwa itajisoma yenyewe kupitia namba yako ya NIDA.</p>
      </header>

      <form onSubmit={submit}>
        <section style={panel}>
          <h2 style={heading}><UserRound size={19} color="#2563eb"/> Taarifa za majina</h2>
          <div style={grid}>
            <label style={field}>Jina la kwanza *<input style={input} value={firstName} onChange={e=>{setFirstName(e.target.value);setShowPreview(false)}} placeholder="Andika jina la kwanza" required /></label>
            <label style={field}>Jina la kati<input style={input} value={middleName} onChange={e=>{setMiddleName(e.target.value);setShowPreview(false)}} placeholder="Andika jina la kati (si lazima)" /></label>
            <label style={field}>Jina la mwisho / ukoo *<input style={input} value={lastName} onChange={e=>{setLastName(e.target.value);setShowPreview(false)}} placeholder="Andika jina la ukoo" required /></label>
          </div>
        </section>

        <section style={panel}>
          <h2 style={heading}><Hash size={19} color="#2563eb"/> Namba ya NIDA na Ziada</h2>
          <div style={grid}>
            <label style={field}>Namba ya NIDA (NIN) *
              <input style={{...input, fontVariantNumeric: "tabular-nums", letterSpacing: 1.1}} inputMode="numeric" value={formattedNida} onChange={e=>{setNida(e.target.value);setShowPreview(false)}} placeholder="20050501-41210-00001-80" maxLength={23} required />
              <span style={{fontSize:12, color:nidaDigits===20?"#15803d":"#64748b"}}>{nidaDigits}/20 tarakimu</span>
            </label>
            
            <label style={field}>Tarehe ya kuzaliwa (Inajaza yenyewe)
              <input style={{...input, background: "#f8fafc", color: "#475569"}} value={calculatedBirthDate || "Weka NIDA yenye tarakimu 8 za kwanza"} readOnly />
            </label>

            <label style={field}>Namba ya simu
              <input style={input} type="tel" inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Mfano: 07XXXXXXXX" />
            </label>
          </div>

          <div style={{marginTop:16}}>
            <label style={field}>Picha ya Uso (Passport Size)</label>
            <input style={{...input, padding: "10px"}} type="file" accept="image/*" onChange={handlePhotoUpload} />
          </div>

          <div style={{marginTop:18}}>
            <div style={{fontSize:13,fontWeight:750,marginBottom:10,color:"#26364b"}}>Jinsia *</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
              {(["M","F"] as const).map(value=><button key={value} type="button" onClick={()=>{setGender(value);setShowPreview(false)}} aria-pressed={gender===value} style={{minHeight:58,borderRadius:13,border:gender===value?"2px solid #2563eb":"1px solid #d8e1ec",background:gender===value?"#eff6ff":"#fff",color:gender===value?"#1d4ed8":"#334155",fontSize:15,fontWeight:850,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:9}}><span style={{width:25,height:25,borderRadius:8,display:"grid",placeItems:"center",background:gender===value?"#2563eb":"#eef2f7",color:gender===value?"#fff":"#475569"}}>{value}</span>{value==="M"?"ME (M)":"KE (F)"}</button>)}
            </div>
          </div>
        </section>

        {/* SEHEMU YA SAINI */}
        <section style={panel}>
          <h2 style={heading}><ClipboardList size={19} color="#2563eb"/> Saini ya Mtu (Digital Signature Pad)</h2>
          <p style={{fontSize: 12, color: "#64748b", marginBottom: 12}}>Chora saini yako kwenye kisanduku hapa chini kwa kidole au kipanya:</p>
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

        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center", marginBottom: 20}}>
          <button className="button button--green" type="submit" disabled={!complete} style={{minHeight:48,padding:"0 22px",borderRadius:12,display:"inline-flex",alignItems:"center",gap:9,opacity:complete?1:.5}}><BadgeCheck size={17}/> Hakiki na Onyesha Kitambulisho</button>
          <button className="button button--secondary" type="reset" onClick={()=>{setFirstName("");setMiddleName("");setLastName("");setNida("");setGender("");setPhone("");setShowPreview(false);clearSignature()}} style={{minHeight:48,borderRadius:12}}>Futa taarifa</button>
        </div>
      </form>

      {message && <p role="status" style={{padding: 12, borderRadius: 12, background: "#fff7ed", color: "#9a3412", fontSize: 13, marginBottom: 16}}>{message}</p>}

      {showPreview && (
        <section style={{...panel, borderColor: "#bbf7d0", background: "#f0fdf4"}} aria-live="polite">
          <h2 style={{...heading, color: "#166534"}}><BadgeCheck size={19}/> Muonekano wa Kitambulisho (Preview)</h2>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 18, marginTop: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                <b>Template ya Mbele</b>
                <button className="button button--green" type="button" disabled={!frontTemplate} onClick={() => download("front")}><Download size={15} /> Pakua Mbele</button>
              </div>
              <div style={{ position: "relative", width: "100%", aspectRatio: "1000 / 630", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 13, overflow: "hidden" }}>
                <canvas ref={frontCanvas} width={WIDTH} height={HEIGHT} style={{ display: "block", width: "100%", height: "100%" }} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                <b>Template ya Nyuma</b>
                <button className="button button--green" type="button" disabled={!backTemplate} onClick={() => download("back")}><Download size={15} /> Pakua Nyuma</button>
              </div>
              <div style={{ position: "relative", width: "100%", aspectRatio: "1000 / 630", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 13, overflow: "hidden" }}>
                <canvas ref={backCanvas} width={WIDTH} height={HEIGHT} style={{ display: "block", width: "100%", height: "100%" }} />
              </div>
            </div>
          </div>
        </section>
      )}

      <canvas ref={tempBarcodeCanvas} style={{ display: "none" }}></canvas>
    </main>
  );
               }
                            
