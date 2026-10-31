import { useMemo, useState } from "react";
import { ArrowLeft, Download, ImagePlus, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

const CARD_DESIGN = {
  title: "JAMHURI YA MUUNGANO WA TANZANIA",
  subtitle: "KITAMBULISHO CHA TAIFA",
  subtext: "THE UNITED REPUBLIC OF TANZANIA — NATIONAL IDENTITY CARD",
  colors: {
    background: "linear-gradient(125deg, #e7f4d8 0%, #c5e9e5 52%, #78c6d7 100%)",
    text: "#183b38",
    muted: "#315c56",
    border: "#477e77",
    photoBackground: "rgba(255,255,255,.78)",
    pattern: "rgba(30,115,100,.20)",
  },
  layout: {
    aspectRatio: "1.6 / 1",
    borderRadius: 16,
    photoWidth: "27%",
    photoAspectRatio: "0.78",
  },
  labels: {
    firstName: "JINA LA KWANZA",
    middleName: "JINA LA KATI",
    lastName: "JINA LA MWISHO",
    dob: "TAREHE YA KUZALIWA",
    gender: "JINSIA",
    signature: "SAHIHI",
  },
};

export default function SoftCopyNidaDemoPage() {
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState("");
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
    if (!firstName.trim() || !lastName.trim() || !idNumber.trim() || !dob) {
      window.alert("Tafadhali jaza taarifa zote muhimu.");
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
    ctx.fillText(CARD_DESIGN.title, 800, 65);
    ctx.font = "bold 54px Arial";
    ctx.fillText(CARD_DESIGN.subtitle, 800, 125);
    ctx.font = "bold 22px Arial";
    ctx.fillStyle = "#333333";
    ctx.fillText(CARD_DESIGN.subtext, 800, 165);

    ctx.textAlign = "left";
    ctx.fillStyle = "#152b2a";
    ctx.font = "bold 52px Arial";
    ctx.fillText(idNumber.toUpperCase(), 75, 255);

    const rows = [
      [CARD_DESIGN.labels.firstName, firstName.toUpperCase()],
      [CARD_DESIGN.labels.middleName, middleName.toUpperCase()],
      [CARD_DESIGN.labels.lastName, lastName.toUpperCase()],
      [CARD_DESIGN.labels.dob, dob],
      [CARD_DESIGN.labels.gender, gender],
    ];

    rows.forEach((row, index) => {
      const y = 350 + index * 100;
      ctx.font = "bold 24px Arial";
      ctx.fillStyle = "#31534e";
      ctx.fillText(row[0], 75, y);
      ctx.font = "bold 36px Arial";
      ctx.fillStyle = "#142b2a";
      ctx.fillText(row[1] || "—", 75, y + 40);
    });

    ctx.font = "bold 24px Arial";
    ctx.fillStyle = "#31534e";
    ctx.fillText(CARD_DESIGN.labels.signature, 75, 860);
    ctx.font = "italic 38px cursive";
    ctx.fillStyle = "#152b2a";
    ctx.fillText(signature || fullName, 75, 910);

    const drawPhotoAndSave = () => {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(1110, 280, 390, 520);
      ctx.strokeStyle = "#31534e";
      ctx.lineWidth = 8;
      ctx.strokeRect(1110, 280, 390, 520);

      const link = document.createElement("a");
      link.download = "national-identity-card.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    };

    if (photo) {
      const image = new Image();
      image.onload = () => {
        ctx.drawImage(image, 1120, 290, 370, 500);
        drawPhotoAndSave();
      };
      image.onerror = drawPhotoAndSave;
      image.src = photo;
    } else {
      ctx.fillStyle = "#31534e";
      ctx.font = "bold 34px Arial";
      ctx.textAlign = "center";
      ctx.fillText("PICHA", 1305, 550);
      drawPhotoAndSave();
    }
  }

  const fields = [
    [CARD_DESIGN.labels.firstName, firstName],
    [CARD_DESIGN.labels.middleName, middleName],
    [CARD_DESIGN.labels.lastName, lastName],
    [CARD_DESIGN.labels.dob, dob],
    [CARD_DESIGN.labels.gender, gender],
  ];

  return (
    <main className="portal-main" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 18 }}>
        <ArrowLeft size={16} /> Rudi kwenye huduma
      </button>

      <section className="license-form-card">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <ShieldAlert size={28} />
          <div>
            <h1 style={{ margin: 0 }}>KITAMBULISHO CHA TAIFA</h1>
            <p style={{ margin: "4px 0 0" }}>Jaza taarifa na uone muonekano hapa chini.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 15 }}>
          <label>Jina la kwanza<input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jina la kwanza" /></label>
          <label>Jina la kati<input className="input" value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Jina la kati" /></label>
          <label>Jina la mwisho<input className="input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Jina la mwisho" /></label>
          <label>Namba ya Kitambulisho<input className="input" value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="Namba ya kitambulisho" /></label>
          <label>Tarehe ya kuzaliwa<input className="input" value={dob} onChange={e => setDob(e.target.value)} placeholder="DD/MM/YYYY" /></label>
          <label>Jinsia<select className="input" value={gender} onChange={e => setGender(e.target.value)}><option value="M">M</option><option value="F">F</option></select></label>
          <label>Sahihi (andika jina)<input className="input" value={signature} onChange={e => setSignature(e.target.value)} placeholder="Sahihi yako" /></label>
          <label style={{ gridColumn: "1 / -1" }}>Picha<input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => readImage(e.target.files?.[0])} /></label>
        </div>

        <div style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>PREVIEW YA KITAMBULISHO</h2>
          <div style={{
            position: "relative", overflow: "hidden", aspectRatio: CARD_DESIGN.layout.aspectRatio,
            width: "100%", borderRadius: CARD_DESIGN.layout.borderRadius,
            border: `2px solid ${CARD_DESIGN.colors.border}`, padding: "clamp(12px,3vw,28px)",
            boxSizing: "border-box", background: CARD_DESIGN.colors.background,
            color: CARD_DESIGN.colors.text, boxShadow: "0 8px 24px rgba(0,0,0,.16)"
          }}>
            <div aria-hidden="true" style={{
              position: "absolute", inset: 0, opacity: .55,
              backgroundImage: `repeating-radial-gradient(ellipse at 50% 55%, transparent 0 25px, ${CARD_DESIGN.colors.pattern} 27px 29px, transparent 31px 52px)`
            }} />
            
            <div style={{ position: "relative", textAlign: "center", lineHeight: 1.2 }}>
              <div style={{ fontWeight: 900, fontSize: "clamp(10px,2vw,19px)", letterSpacing: 1 }}>{CARD_DESIGN.title}</div>
              <div style={{ fontWeight: 900, fontSize: "clamp(12px,2.8vw,28px)" }}>{CARD_DESIGN.subtitle}</div>
              <div style={{ color: "#333", fontWeight: 700, fontSize: "clamp(7px,1.4vw,13px)" }}>{CARD_DESIGN.subtext}</div>
            </div>

            <div style={{ position: "relative", display: "flex", gap: 12, height: "69%", marginTop: 10 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-around" }}>
                <div style={{ fontWeight: 900, fontSize: "clamp(12px,2.4vw,25px)", overflowWrap: "anywhere" }}>{idNumber || "00000000-00000-00000-00"}</div>
                {fields.map(([label, value]) => (
                  <div key={label} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: CARD_DESIGN.colors.muted }}>{label}</div>
                    <div style={{ fontSize: "clamp(9px,1.8vw,18px)", fontWeight: 900, overflowWrap: "anywhere" }}>{value || "—"}</div>
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: CARD_DESIGN.colors.muted }}>{CARD_DESIGN.labels.signature}</div>
                  <div style={{ fontFamily: "cursive", fontStyle: "italic", fontSize: "clamp(10px,2vw,20px)" }}>{signature || fullName || "SAHIHI"}</div>
                </div>
              </div>

              <div style={{
                width: CARD_DESIGN.layout.photoWidth, minWidth: "22%", alignSelf: "center",
                aspectRatio: CARD_DESIGN.layout.photoAspectRatio, border: `2px solid ${CARD_DESIGN.colors.border}`,
                background: CARD_DESIGN.colors.photoBackground, display: "flex",
                alignItems: "center", justifyContent: "center", overflow: "hidden"
              }}>
                {photo ? <img src={photo} alt="Picha" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ textAlign: "center", fontSize: "clamp(8px,1.4vw,14px)", fontWeight: 800 }}><ImagePlus size={22} /><br />PICHA</div>}
              </div>
            </div>
          </div>
        </div>

        <button type="button" className="button button--green" style={{ marginTop: 20, width: "100%" }} onClick={downloadCard}>
          <Download size={18} /> PAKUA KITAMBULISHO
        </button>
      </section>
    </main>
  );
}
