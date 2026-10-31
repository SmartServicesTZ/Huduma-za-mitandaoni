import { useMemo, useState } from "react";
import { ArrowLeft, Download, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

const CARD_DESIGN = {
  title: "JAMHURI YA MUUNGANO WA TANZANIA",
  subtitle: "KITAMBULISHO CHA TAIFA",
  subtext: "THE UNITED REPUBLIC OF TANZANIA — CITIZEN IDENTITY CARD",
  colors: {
    backgroundStart: "#d4edda",
    backgroundMid: "#bee5eb",
    backgroundEnd: "#78c6d7",
    text: "#112222",
    muted: "#315c56",
    border: "#477e77",
  },
};

export default function SoftCopyNidaDemoPage() {
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("Sophia");
  const [middleName, setMiddleName] = useState("Mjeshi");
  const [lastName, setLastName] = useState("Bakari");
  const [idNumber, setIdNumber] = useState("19950505611050000111");
  const [dobInput, setDobInput] = useState("1995-10-05");
  const [gender, setGender] = useState("F");
  const [photo, setPhoto] = useState("");
  const [signature, setSignature] = useState("");

  const fullName = useMemo(
    () => [firstName, middleName, lastName].filter(Boolean).join(" ").toUpperCase(),
    [firstName, middleName, lastName]
  );

  // Kubadilisha tarehe kwenda mfumo wa "05 OCT 1995"
  const formattedDob = useMemo(() => {
    if (!dobInput) return "05 OCT 1995";
    // Kama imeingizwa kama YYYY-MM-DD au DD-MM-YYYY
    const parts = dobInput.split(/[-/]/);
    if (parts.length === 3) {
      let year, monthNum, day;
      if (parts[0].length === 4) {
        year = parts[0]; monthNum = parts[1]; day = parts[2];
      } else {
        day = parts[0]; monthNum = parts[1]; year = parts[2];
      }
      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const mIndex = parseInt(monthNum, 10) - 1;
      const monthStr = months[mIndex] || "OCT";
      return `${day} ${monthStr} ${year}`.toUpperCase();
    }
    return dobInput.toUpperCase();
  }, [dobInput]);

  // Kupanga namba ya NIDA kuwa 12345678-12345-12345-12
  const formattedNidaNumber = useMemo(() => {
    const raw = idNumber.replace(/\D/g, "");
    if (raw.length >= 20) {
      return `${raw.slice(0,8)}-${raw.slice(8,13)}-${raw.slice(13,18)}-${raw.slice(18,20)}`;
    } else if (raw.length > 0) {
      // Kama ni fupi, iweke kwa jinsi ilivyo au ijalizie
      return idNumber.toUpperCase();
    }
    return "19950505-61105-00001-11";
  }, [idNumber]);

  function readImage(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function downloadCard() {
    if (!firstName.trim() || !lastName.trim() || !idNumber.trim() || !dobInput) {
      window.alert("Tafadhali jaza taarifa zote muhimu kabla ya kupakua.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Mandhari ya Gradient
    const gradient = ctx.createLinearGradient(0, 0, 1600, 1000);
    gradient.addColorStop(0, CARD_DESIGN.colors.backgroundStart);
    gradient.addColorStop(0.5, CARD_DESIGN.colors.backgroundMid);
    gradient.addColorStop(1, CARD_DESIGN.colors.backgroundEnd);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1600, 1000);

    // 2. Taswira ya Mlima kwa nyuma (Kama ilivyo kwenye kadi halisi)
    ctx.fillStyle = "rgba(40, 120, 100, 0.12)";
    ctx.beginPath();
    ctx.moveTo(300, 750);
    ctx.lineTo(600, 350);
    ctx.lineTo(850, 550);
    ctx.lineTo(1100, 300);
    ctx.lineTo(1450, 750);
    ctx.closePath();
    ctx.fill();

    // 3. Mistari ya nyuma ya kiusalama
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(20,100,90,0.10)";
      ctx.lineWidth = 4;
      ctx.ellipse(750, 500, 200 + i * 80, 120 + i * 45, -0.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 4. Ukingo wa nje
    ctx.strokeStyle = CARD_DESIGN.colors.border;
    ctx.lineWidth = 10;
    ctx.strokeRect(16, 16, 1568, 968);

    // 5. Vichwa vya habari (Katikati)
    ctx.textAlign = "center";
    ctx.fillStyle = "#1b2a4a";
    ctx.font = "bold 26px Arial";
    ctx.fillText(CARD_DESIGN.title, 800, 75);
    ctx.font = "bold 44px Arial";
    ctx.fillText(CARD_DESIGN.subtitle, 800, 130);
    ctx.font = "bold 18px Arial";
    ctx.fillStyle = "#333333";
    ctx.fillText(CARD_DESIGN.subtext, 800, 165);

    // 6. Namba ya Kitambulisho
    ctx.textAlign = "left";
    ctx.fillStyle = "#101d24";
    ctx.font = "bold 48px Arial";
    ctx.fillText(formattedNidaNumber, 75, 245);

    // 7. Sehemu ya Taarifa (Maswali na Majibu yenye Font tofauti)
    const drawField = (labelKiswahili: string, labelEnglish: string, value: string, y: number) => {
      // Swali / Lebo (Ndogo, Kiswahili juu, Kiingereza chini)
      ctx.font = "bold 19px Arial";
      ctx.fillStyle = "#1f3a34";
      ctx.fillText(labelKiswahili, 75, y);

      ctx.font = "15px Arial";
      ctx.fillStyle = "#555555";
      ctx.fillText(labelEnglish, 75, y + 22);

      // Jibu (Kubwa, Zito, Tofauti na swali)
      ctx.font = "bold 34px Arial";
      ctx.fillStyle = "#112222";
      ctx.fillText(value || "—", 420, y + 15);
    };

    drawField("JINA", "Given Name", (firstName + " " + middleName).trim().toUpperCase(), 340);
    drawField("JINA LA MWISHO", "Last Name", lastName.toUpperCase(), 450);
    drawField("TAREHE YA KUZALIWA", "Date of Birth", formattedDob, 560);
    drawField("JINSI", "Sex", gender.toUpperCase(), 670);

    // Sahihi
    ctx.font = "bold 19px Arial";
    ctx.fillStyle = "#1f3a34";
    ctx.fillText("SAINI", 75, 780);
    ctx.font = "15px Arial";
    ctx.fillStyle = "#555555";
    ctx.fillText("Signature", 75, 802);

    ctx.font = "italic 40px cursive";
    ctx.fillStyle = "#0a192f";
    ctx.fillText(signature || fullName, 220, 795);

    // 8. Kuchora Picha Upande wa Kulia (Inaishia vizuri kulingana na urefu wa kadi)
    const drawPhotoAndSave = () => {
      const pX = 1120, pY = 280, pW = 390, pH = 520;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(pX, pY, pW, pH);
      ctx.strokeStyle = CARD_DESIGN.colors.border;
      ctx.lineWidth = 6;
      ctx.strokeRect(pX, pY, pW, pH);

      if (photo) {
        const image = new Image();
        image.onload = () => {
          ctx.drawImage(image, pX + 10, pY + 10, pW - 20, pH - 20);
          triggerDownload(canvas);
        };
        image.onerror = () => triggerDownload(canvas);
        image.src = photo;
        return;
      }

      triggerDownload(canvas);
    };

    const triggerDownload = (targetCanvas: HTMLCanvasElement) => {
      const link = document.createElement("a");
      link.download = "national-identity-card.png";
      link.href = targetCanvas.toDataURL("image/png");
      link.click();
    };

    drawPhotoAndSave();
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
            <h1 style={{ margin: 0 }}>KITAMBULISHO CHA TAIFA</h1>
            <p style={{ margin: "4px 0 0" }}>Jaza taarifa na uone muonekano sahihi hapa chini.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 15 }}>
          <label>Jina la kwanza<input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Sophia" /></label>
          <label>Jina la kati<input className="input" value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Mjeshi" /></label>
          <label>Jina la mwisho<input className="input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Bakari" /></label>
          <label>Namba ya Kitambulisho<input className="input" value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="19950505611050000111" /></label>
          <label>Tarehe ya kuzaliwa<input className="input" type="date" value={dobInput} onChange={e => setDobInput(e.target.value)} /></label>
          <label>Jinsia<select className="input" value={gender} onChange={e => setGender(e.target.value)}><option value="M">M</option><option value="F">F</option></select></label>
          <label>Sahihi (andika jina)<input className="input" value={signature} onChange={e => setSignature(e.target.value)} placeholder="S.tj" /></label>
          <label style={{ gridColumn: "1 / -1" }}>Picha (hiari)<input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => readImage(e.target.files?.[0])} /></label>
        </div>

        <div style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>PREVIEW YA KITAMBULISHO</h2>
          <div style={{
            position: "relative", overflow: "hidden", aspectRatio: "1.6 / 1",
            width: "100%", borderRadius: 16, border: `2px solid ${CARD_DESIGN.colors.border}`,
            padding: "clamp(12px,3vw,28px)", boxSizing: "border-box",
            background: "linear-gradient(125deg, #d4edda 0%, #bee5eb 50%, #78c6d7 100%)",
            color: CARD_DESIGN.colors.text, boxShadow: "0 8px 24px rgba(0,0,0,.16)"
          }}>
            {/* Taswira ya nyuma ya mlima kwenye Preview */}
            <div style={{ position: "absolute", inset: 0, opacity: 0.15, pointerEvents: "none", overflow: "hidden" }}>
              <svg width="100%" height="100%" viewBox="0 0 1000 625" preserveAspectRatio="none">
                <polygon points="200,500 450,200 650,380 850,150 1100,500" fill="#145a4a" />
              </svg>
            </div>

            <div style={{ position: "relative", textAlign: "center", lineHeight: 1.2 }}>
              <div style={{ fontWeight: 900, fontSize: "clamp(9px,1.8vw,17px)", color: "#1b2a4a" }}>{CARD_DESIGN.title}</div>
              <div style={{ fontWeight: 900, fontSize: "clamp(12px,2.8vw,28px)", color: "#1b2a4a" }}>{CARD_DESIGN.subtitle}</div>
              <div style={{ color: "#333", fontWeight: 700, fontSize: "clamp(6px,1.4vw,12px)" }}>{CARD_DESIGN.subtext}</div>
            </div>

            <div style={{ position: "relative", display: "flex", gap: 12, height: "72%", marginTop: 8 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-around" }}>
                <div style={{ fontWeight: 900, fontSize: "clamp(11px,2.2vw,22px)", overflowWrap: "anywhere", color: "#101d24", letterSpacing: "1px" }}>{formattedNidaNumber}</div>
                
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: "#1f3a34" }}>JINA : { (firstName + " " + middleName).trim().toUpperCase() || "SOPHIA MJESHI" }</div>
                  <div style={{ fontSize: "clamp(5px,0.9vw,9px)", color: "#555" }}>Given Name</div>
                </div>
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: "#1f3a34" }}>JINA LA MWISHO : { lastName.toUpperCase() || "BAKARI" }</div>
                  <div style={{ fontSize: "clamp(5px,0.9vw,9px)", color: "#555" }}>Last Name</div>
                </div>
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: "#1f3a34" }}>TAREHE YA KUZALIWA : { formattedDob }</div>
                  <div style={{ fontSize: "clamp(5px,0.9vw,9px)", color: "#555" }}>Date of Birth</div>
                </div>
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: "#1f3a34" }}>JINSI : { gender.toUpperCase() }</div>
                  <div style={{ fontSize: "clamp(5px,0.9vw,9px)", color: "#555" }}>Sex</div>
                </div>
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: "#1f3a34" }}>SAINI :</div>
                  <div style={{ fontSize: "clamp(5px,0.9vw,9px)", color: "#555" }}>Signature</div>
                  <div style={{ fontFamily: "cursive", fontStyle: "italic", fontSize: "clamp(9px,1.8vw,16px)", marginTop: -8, marginLeft: 45 }}>{signature || fullName}</div>
                </div>
              </div>

              <div style={{
                width: "27%", minWidth: "22%", alignSelf: "center",
                aspectRatio: "0.78", border: `2px solid ${CARD_DESIGN.colors.border}`,
                background: "rgba(255,255,255,0.9)", display: "flex",
                alignItems: "center", justifyContent: "center", overflow: "hidden"
              }}>
                {photo ? <img src={photo} alt="Picha" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
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
