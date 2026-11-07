import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Eraser, BadgeCheck, ClipboardList, UserRound, PenTool, X, FileText } from "lucide-react";
import { useLocation } from "wouter";
import JsBarcode from "jsbarcode";

type Side = "front" | "back";
const WIDTH = 1000;
const HEIGHT = 630;

const TEMPLATE_URLS: Record<Side, string> = {
  front: `${import.meta.env.BASE_URL}kura-mbele.png`,
  back: `${import.meta.env.BASE_URL}kura-nyuma.png`,
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
  const modalSignatureCanvas = useRef<HTMLCanvasElement>(null);
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
  
  // Namba ya mpiga kura inaweza kuandikwa au kubadilishwa
  const [voterIdNumber, setVoterIdNumber] = useState("T-1804-3676-092-0");

  const [message, setMessage] = useState("Inapakia templates za Kadi ya Mpiga Kura...");
  
  // Hali ya Modal ya Saini Kubwa
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const formattedDob = useMemo(() => {
    if (!day || !month || !year) return "";
    return `${day} ${month} ${year}`;
  }, [day, month, year]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([loadImage(TEMPLATE_URLS.front), loadImage(TEMPLATE_URLS.back)]).then(([front, back]) => {
      if (!active) return;
      if (front.status === "fulfilled") setFrontTemplate(front.value);
      if (back.status === "fulfilled") setBackTemplate(back.value);
      setMessage(front.status === "fulfilled" && back.status === "fulfilled"
        ? ""
        : "Imeshindikana kupakia kura-mbele.png au kura-nyuma.png kutoka folda ya public.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isSignModalOpen) return;
    const timer = setTimeout(() => {
      const canvas = modalSignatureCanvas.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
    }, 50);
    return () => clearTimeout(timer);
  }, [isSignModalOpen]);

  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    setIsDrawing(true);
    drawSignature(e);
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function drawSignature(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = modalSignatureCanvas.current;
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

  function clearModalSignature() {
    const canvas = modalSignatureCanvas.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
  }

  function saveModalSignature() {
    const canvas = modalSignatureCanvas.current;
    if (!canvas) return;
    setSignatureImage(canvas.toDataURL("image/png"));
    setIsSignModalOpen(false);
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
      const fullNamesText = [firstNameMiddle, lastName].filter(Boolean).join(" ").toUpperCase();
      if (fullNamesText) {
        context.font = "bold 24px Arial";
        context.fillText(fullNamesText, 310, 242, 650);
      }

      if (formattedDob) {
        context.font = "bold 22px Arial";
        context.fillText(formattedDob, 310, 362, 400);
      }

      if (gender) {
        context.font = "bold 22px Arial";
        context.fillText(gender, 500, 424, 200);
      }

      if (ward) {
        context.font = "bold 22px Arial";
        context.fillText(ward.toUpperCase(), 310, 508, 400);
      }

      if (street) {
        context.font = "bold 22px Arial";
        context.fillText(street.toUpperCase(), 310, 610, 400);
      }

      if (centre) {
        context.font = "bold 22px Arial";
        context.fillText(centre.toUpperCase(), 310, 712, 400);
      }

      const photoBox = { x: 30, y: 220, width: 250, height: 350 };
      if (portraitImage) {
        context.drawImage(portraitImage, photoBox.x, photoBox.y, photoBox.width, photoBox.height);
      }

      if (signatureImage) {
        const sigImg = new Image();
        sigImg.onload = () => {
          context.drawImage(sigImg, 190, 770, 140, 50);
        };
        sigImg.src = signatureImage;
      }
    } 

    if (side === "back") {
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

  function download(side: Side, format: "png" | "pdf") {
    const canvas = side === "front" ? frontCanvas.current : backCanvas.current;
    const template = side === "front" ? frontTemplate : backTemplate;
    if (!canvas || !template) return;

    if (format === "png") {
      const link = document.createElement("a");
      link.download = side === "front" ? "kura_mbele.png" : "kura_nyuma.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } else {
      // Pakua kama PDF kupitia print window au image embedding
      const dataUrl = canvas.toDataURL("image/png");
      const win = window.open("");
      if (win) {
        win.document.write(`<html><head><title>Kadi ya Mpiga Kura - ${side.toUpperCase()}</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#000;"><img src="${dataUrl}" style="max-width:100%;height:auto;" onload="window.print();window.close();"/></body></html>`);
        win.document.close();
      }
    }
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
          
          {/* KITUFE CHA KUGUSA ILI KUWEKA SAINI KWENYE DIRISHA KUBWA */}
          <div style={field}>
            <span>Saini Yako (Wino Mweusi)</span>
            <button
              type="button"
              onClick={() => setIsSignModalOpen(true)}
              style={{
                ...input,
                background: signatureImage ? "#f0fdf4" : "#f8fafc",
                color: signatureImage ? "#15803d" : "#64748b",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                fontWeight: 700,
                border: signatureImage ? "1.5px solid #16a34a" : "1px solid #d8e1ec"
              }}
            >
              <span>{signatureImage ? "✓ Saini Imewekwa (Gusa Kubadili)" : "Gusa hapa kuweka saini"}</span>
              <PenTool size={16} />
            </button>
          </div>
        </div>

        <div style={{marginTop: 12}}>
          <label style={field}>Namba ya Mpiga Kura (Unaweza kubadili kama unataka)
            <input style={input} value={voterIdNumber} onChange={e => setVoterIdNumber(e.target.value)} placeholder="T-1804-3676-092-0" />
          </label>
        </div>
      </section>

      {/* MODAL YA KUCHORA SAINI KUBWA */}
      {isSignModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16
        }}>
          <div style={{
            background: "#fff", width: "100%", maxWidth: 500, borderRadius: 20,
            padding: 20, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)"
          }}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14}}>
              <h3 style={{margin: 0, fontSize: 17, fontWeight: 800, color: "#1e293b"}}>Chora Saini Yako</h3>
              <button onClick={() => setIsSignModalOpen(false)} style={{background: "none", border: "none", cursor: "pointer", color: "#64748b"}}>
                <X size={20} />
              </button>
            </div>
            
            <p style={{fontSize: 13, color: "#64748b", marginBottom: 12}}>Tumia kidole au kalamu kuchora saini yako vizuri kwenye eneo hili kubwa:</p>

            <div style={{
              position: "relative", border: "2px dashed #94a3b8", borderRadius: 12,
              background: "#f8fafc", overflow: "hidden", cursor: "crosshair", width: "100%", height: 200
            }}>
              <canvas
                ref={modalSignatureCanvas}
                width={460}
                height={200}
                onMouseDown={startDrawing}
                onMouseMove={drawSignature}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={drawSignature}
                onTouchEnd={stopDrawing}
                style={{ display: "block", width: "100%", height: "100%" }}
              />
            </div>

            <div style={{display: "flex", justifyContent: "space-between", marginTop: 16}}>
              <button
                type="button"
                onClick={clearModalSignature}
                className="button button--secondary"
                style={{fontSize: 13, padding: "8px 14px", borderRadius: 10, display: "flex", gap: 6, alignItems: "center"}}
              >
                <Eraser size={15} /> Futa Yote
              </button>

              <div style={{display: "flex", gap: 8}}>
                <button
                  type="button"
                  onClick={() => setIsSignModalOpen(false)}
                  style={{fontSize: 13, padding: "8px 14px", borderRadius: 10, background: "#e2e8f0", border: "none", fontWeight: 700, cursor: "pointer"}}
                >
                  Ghairi
                </button>
                <button
                  type="button"
                  onClick={saveModalSignature}
                  style={{fontSize: 13, padding: "8px 16px", borderRadius: 10, background: "#2563eb", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer"}}
                >
                  Hifadhi Saini
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {message && <p role="status" style={{padding: 10, borderRadius: 10, background: "#fff7ed", color: "#9a3412", fontSize: 12, marginBottom: 12}}>{message}</p>}

      {/* LIVE PREVIEW YA KADI (KWA PICHA NA PDF) */}
      <section style={{...panel, borderColor: "#cbd5e1", background: "#f8fafc"}}>
        <h2 style={{...heading, color: "#1e293b"}}><BadgeCheck size={17} color="#059669"/> Muonekano wa Kadi (Live Preview)</h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, fontSize: 12, flexWrap: "wrap", gap: 4 }}>
              <b>Upande wa Mbele</b>
              <div style={{display: "flex", gap: 4}}>
                <button className="button button--green" type="button" disabled={!frontTemplate} onClick={() => download("front", "png")} style={{padding: "5px 8px", fontSize: 11}}><Download size={12} /> PNG</button>
                <button className="button button--secondary" type="button" disabled={!frontTemplate} onClick={() => download("front", "pdf")} style={{padding: "5px 8px", fontSize: 11, background: "#dc2626", color: "#fff", border: "none"}}><FileText size={12} /> PDF</button>
              </div>
            </div>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1000 / 630", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden" }}>
              <canvas ref={frontCanvas} width={WIDTH} height={HEIGHT} style={{ display: "block", width: "100%", height: "100%" }} />
              {!frontTemplate && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#64748b", fontSize: 12 }}>Inapakia...</span>}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, fontSize: 12, flexWrap: "wrap", gap: 4 }}>
              <b>Upande wa Nyuma</b>
              <div style={{display: "flex", gap: 4}}>
                <button className="button button--green" type="button" disabled={!backTemplate} onClick={() => download("back", "png")} style={{padding: "5px 8px", fontSize: 11}}><Download size={12} /> PNG</button>
                <button className="button button--secondary" type="button" disabled={!backTemplate} onClick={() => download("back", "pdf")} style={{padding: "5px 8px", fontSize: 11, background: "#dc2626", color: "#fff", border: "none"}}><FileText size={12} /> PDF</button>
              </div>
            </div>
            <div style={{ position: "relative", width: "100%", aspectRatio: "1000 / 630", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden" }}>
              <canvas ref={backCanvas} width={WIDTH} height={HEIGHT} style={{ display: "block", width: "100%", height: "100%" }} />
              {!backTemplate && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#64748b", fontSize: 12 }}>Inapakia...</span>}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
