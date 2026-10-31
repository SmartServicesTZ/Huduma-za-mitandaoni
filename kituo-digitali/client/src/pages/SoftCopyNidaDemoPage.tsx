import { useMemo, useState } from "react";
import { ArrowLeft, Download, ImagePlus, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

export default function SoftCopyNidaDemoPage() {
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [demoNumber, setDemoNumber] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("M");
  const [photo, setPhoto] = useState("");
  const [signature, setSignature] = useState("");
  const fullName = useMemo(
    () => [firstName, middleName, lastName].filter(Boolean).join(" ").toUpperCase(),
    [firstName, middleName, lastName]
  );

  function readImage(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function downloadCard() {
    if (!firstName.trim() || !lastName.trim() || !demoNumber.trim() || !dob) {
      window.alert("Tafadhali jaza jina la kwanza, jina la mwisho, namba ya mfano na tarehe ya kuzaliwa.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 1600, 1000);
    gradient.addColorStop(0, "#e7f4d8");
    gradient.addColorStop(0.52, "#c5e9e5");
    gradient.addColorStop(1, "#78c6d7");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1600, 1000);
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(20,105,94,0.15)";
      ctx.lineWidth = 5;
      ctx.ellipse(800, 500, 180 + i * 80, 100 + i * 42, -0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#174b46";
    ctx.font = "bold 35px Arial";
    ctx.textAlign = "center";
    ctx.fillText("KITAMBULISHO CHA MFANO", 800, 65);
    ctx.font = "bold 54px Arial";
    ctx.fillText("PERSONAL DEMO CARD", 800, 125);
    ctx.font = "bold 25px Arial";
    ctx.fillStyle = "#8d2020";
    ctx.fillText("DEMO ONLY • NOT AN OFFICIAL DOCUMENT", 800, 170);

    ctx.textAlign = "left";
    ctx.fillStyle = "#152b2a";
    ctx.font = "bold 52px Arial";
    ctx.fillText(demoNumber.toUpperCase(), 75, 265);
    const rows = [
      ["JINA LA KWANZA", firstName.toUpperCase()],
      ["JINA LA KATI", middleName.toUpperCase()],
      ["JINA LA MWISHO", lastName.toUpperCase()],
      ["TAREHE YA KUZALIWA", dob],
      ["JINSIA", gender]
    ];
    rows.forEach((row, index) => {
      const y = 365 + index * 105;
      ctx.font = "bold 25px Arial";
      ctx.fillStyle = "#31534e";
      ctx.fillText(row[0], 75, y);
      ctx.font = "bold 37px Arial";
      ctx.fillStyle = "#142b2a";
      ctx.fillText(row[1] || "—", 75, y + 45);
    });
    ctx.font = "italic 38px cursive";
    ctx.fillText(signature || fullName, 85, 900);

    const drawPhotoAndSave = () => {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(1110, 300, 390, 500);
      ctx.strokeStyle = "#31534e";
      ctx.lineWidth = 8;
      ctx.strokeRect(1110, 300, 390, 500);
      ctx.save();
      ctx.translate(800, 560);
      ctx.rotate(-0.28);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(155,25,35,0.25)";
      ctx.font = "bold 105px Arial";
      ctx.fillText("DEMO ONLY", 0, 0);
      ctx.restore();
      ctx.textAlign = "center";
      ctx.fillStyle = "#8d2020";
      ctx.font = "bold 28px Arial";
      ctx.fillText("NOT VALID FOR IDENTIFICATION", 800, 965);
      const link = document.createElement("a");
      link.download = "personal-demo-card.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    };

    if (photo) {
      const image = new Image();
      image.onload = () => {
        ctx.drawImage(image, 1120, 310, 370, 480);
        drawPhotoAndSave();
      };
      image.onerror = drawPhotoAndSave;
      image.src = photo;
    } else {
      ctx.fillStyle = "#31534e";
      ctx.font = "bold 34px Arial";
      ctx.textAlign = "center";
      ctx.fillText("PICHA YAKO", 1305, 555);
      drawPhotoAndSave();
    }
  }

  return (
    <main className="portal-main" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 18 }}>
        <ArrowLeft size={16} /> Rudi kwenye huduma
      </button>
      <section className="license-form-card">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <ShieldAlert size={28} />
          <div>
            <h1 style={{ margin: 0 }}>SOFT COPY NIDA – DEMO</h1>
            <p style={{ margin: "4px 0 0" }}>Jaza taarifa na angalia preview kabla ya kupakua.</p>
          </div>
        </div>
        <div role="alert" style={{ margin: "16px 0", padding: 12, border: "2px solid #b45309", borderRadius: 10, background: "#fff7ed", color: "#9a3412", fontWeight: 800 }}>
          DEMO – NOT OFFICIAL. HII NI KADI YA MFANO TU, SI KITAMBULISHO CHA NIDA AU HATI YA SERIKALI.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 15 }}>
          <label>Jina la kwanza<input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jina la kwanza" /></label>
          <label>Jina la kati<input className="input" value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Jina la kati" /></label>
          <label>Jina la mwisho<input className="input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Jina la mwisho" /></label>
          <label>Namba ya mfano<input className="input" value={demoNumber} onChange={e => setDemoNumber(e.target.value)} placeholder="DEMO-000001" /></label>
          <label>Tarehe ya kuzaliwa<input className="input" value={dob} onChange={e => setDob(e.target.value)} placeholder="DD/MM/YYYY" /></label>
          <label>Jinsia<select className="input" value={gender} onChange={e => setGender(e.target.value)}><option value="M">M</option><option value="F">F</option></select></label>
          <label>Sahihi (andika jina)<input className="input" value={signature} onChange={e => setSignature(e.target.value)} placeholder="Sahihi ya mfano" /></label>
          <label style={{ gridColumn: "1 / -1" }}>Picha yako<input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => readImage(e.target.files?.[0])} /></label>
        </div>

        <div style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>PREVIEW YA KADI</h2>
          <div style={{ position: "relative", overflow: "hidden", aspectRatio: "1.6 / 1", width: "100%", borderRadius: 16, border: "2px solid #477e77", padding: "clamp(12px,3vw,28px)", boxSizing: "border-box", background: "linear-gradient(125deg,#e7f4d8 0%,#c5e9e5 52%,#78c6d7 100%)", color: "#152b2a", boxShadow: "0 8px 24px rgba(0,0,0,.16)" }}>
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, opacity: .22, backgroundImage: "repeating-radial-gradient(ellipse at 52% 55%, transparent 0 28px, #287e70 30px 32px, transparent 34px 55px)" }} />
            <div style={{ position: "relative", textAlign: "center", lineHeight: 1.2 }}>
              <div style={{ fontWeight: 900, fontSize: "clamp(11px,2.3vw,22px)", letterSpacing: 1 }}>KITAMBULISHO CHA MFANO</div>
              <div style={{ fontWeight: 900, fontSize: "clamp(13px,3vw,30px)" }}>PERSONAL DEMO CARD</div>
              <div style={{ color: "#8d2020", fontWeight: 900, fontSize: "clamp(8px,1.5vw,15px)" }}>DEMO ONLY • NOT AN OFFICIAL DOCUMENT</div>
            </div>
            <div style={{ position: "relative", display: "flex", gap: 12, height: "72%", marginTop: 10 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-around" }}>
                <div style={{ fontWeight: 900, fontSize: "clamp(12px,2.4vw,25px)", overflowWrap: "anywhere" }}>{demoNumber || "DEMO-000000"}</div>
                {([["JINA LA KWANZA", firstName], ["JINA LA KATI", middleName], ["JINA LA MWISHO", lastName], ["TAREHE YA KUZALIWA", dob], ["JINSIA", gender]] as const).map(([label, value]) => (
                  <div key={label} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: "#31534e" }}>{label}</div>
                    <div style={{ fontSize: "clamp(9px,1.8vw,18px)", fontWeight: 900, overflowWrap: "anywhere" }}>{value || "—"}</div>
                  </div>
                ))}
                <div style={{ fontFamily: "cursive", fontStyle: "italic", fontSize: "clamp(10px,2vw,20px)" }}>{signature || fullName || "SAHIHI"}</div>
              </div>
              <div style={{ width: "29%", minWidth: "22%", alignSelf: "center", aspectRatio: "0.78", border: "2px solid #31534e", background: "rgba(255,255,255,.7)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {photo ? <img src={photo} alt="Picha ya preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ textAlign: "center", fontSize: "clamp(8px,1.4vw,14px)", fontWeight: 800 }}><ImagePlus size={22} /><br />PICHA YAKO</div>}
              </div>
            </div>
            <div style={{ position: "absolute", left: "15%", top: "48%", transform: "rotate(-24deg)", color: "rgba(155,25,35,.28)", fontWeight: 1000, fontSize: "clamp(18px,5vw,48px)", pointerEvents: "none" }}>DEMO ONLY</div>
            <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", color: "#8d2020", fontWeight: 900, fontSize: "clamp(7px,1.2vw,12px)" }}>NOT VALID FOR IDENTIFICATION</div>
          </div>
        </div>

        <button type="button" className="button button--green" style={{ marginTop: 20, width: "100%" }} onClick={downloadCard}>
          <Download size={18} /> PAKUA KADI YA DEMO
        </button>
      </section>
    </main>
  );
}
