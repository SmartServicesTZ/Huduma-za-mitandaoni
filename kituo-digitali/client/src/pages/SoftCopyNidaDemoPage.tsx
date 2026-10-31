import { useMemo, useState } from "react";
import { ArrowLeft, Download, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

const CARD_DESIGN = {
  title: "JAMHURI YA MUUNGANO WA TANZANIA",
  subtitle: "KITAMBULISHO CHA TAIFA",
  subtext: "THE UNITED REPUBLIC OF TANZANIA — NATIONAL IDENTITY CARD",
  colors: {
    backgroundStart: "#d4edda",
    backgroundMid: "#bee5eb",
    backgroundEnd: "#78c6d7",
    text: "#112222",
    muted: "#315c56",
    border: "#477e77",
  },
  labels: {
    firstName: "JINA LA KWANZA",
    firstNameSub: "Given Name",
    middleName: "JINA LA KATI",
    middleNameSub: "Middle Name",
    lastName: "JINA LA MWISHO",
    lastNameSub: "Last Name",
    dob: "TAREHE YA KUZALIWA",
    dobSub: "Date of Birth",
    gender: "JINSIA",
    genderSub: "Sex",
    signature: "SAHIHI",
    signatureSub: "Signature",
  },
};

export default function SoftCopyNidaDemoPage() {
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("Sophia");
  const [middleName, setMiddleName] = useState("Mjeshi");
  const [lastName, setLastName] = useState("Bakari");
  const [idNumber, setIdNumber] = useState("19950505611050000111");
  const [dob, setDob] = useState("05-05-1995");
  const [gender, setGender] = useState("F");
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

    // 2. Mistari ya nyuma ya duara
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(20,100,90,0.12)";
      ctx.lineWidth = 5;
      ctx.arc(800, 500, 150 + i * 65, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Ukingo wa nje
    ctx.strokeStyle = CARD_DESIGN.colors.border;
    ctx.lineWidth = 10;
    ctx.strokeRect(16, 16, 1568, 968);

    // 4. Vichwa vya habari (Katikati)
    ctx.textAlign = "center";
    ctx.fillStyle = "#1b2a4a";
    ctx.font = "bold 30px Arial";
    ctx.fillText(CARD_DESIGN.title, 800, 70);
    ctx.font = "bold 50px Arial";
    ctx.fillText(CARD_DESIGN.subtitle, 800, 125);
    ctx.font = "bold 20px Arial";
    ctx.fillStyle = "#333333";
    ctx.fillText(CARD_DESIGN.subtext, 800, 160);

    // 5. Namba ya Kitambulisho
    ctx.textAlign = "left";
    ctx.fillStyle = "#101d24";
    ctx.font = "bold 46px Arial";
    ctx.fillText(idNumber.toUpperCase(), 75, 235);

    // 6. Taarifa za Sehemu ya Kushoto
    const drawRow = (label: string, sub: string, val: string, y: number) => {
      ctx.font = "bold 22px Arial";
      ctx.fillStyle = "#112222";
      ctx.fillText(label + " :   " + val, 75, y);
      ctx.font = "16px Arial";
      ctx.fillStyle = "#555555";
      ctx.fillText(sub, 75, y + 24);
    };

    drawRow(CARD_DESIGN.labels.firstName, CARD_DESIGN.labels.firstNameSub, firstName.toUpperCase() || "—", 320);
    drawRow(CARD_DESIGN.labels.middleName, CARD_DESIGN.labels.middleNameSub, middleName.toUpperCase() || "—", 410);
    drawRow(CARD_DESIGN.labels.lastName, CARD_DESIGN.labels.lastNameSub, lastName.toUpperCase() || "—", 500);
    drawRow(CARD_DESIGN.labels.dob, CARD_DESIGN.labels.dobSub, dob || "—", 590);
    drawRow(CARD_DESIGN.labels.gender, CARD_DESIGN.labels.genderSub, gender.toUpperCase(), 680);

    // Sahihi
    ctx.font = "bold 22px Arial";
    ctx.fillStyle = "#112222";
    ctx.fillText(CARD_DESIGN.labels.signature + " :", 75, 770);
    ctx.font = "16px Arial";
    ctx.fillStyle = "#555555";
    ctx.fillText(CARD_DESIGN.labels.signatureSub, 75, 794);

    ctx.font = "italic 42px cursive";
    ctx.fillStyle = "#0a192f";
    ctx.fillText(signature || fullName, 190, 785);

    // 7. Kuchora Picha Upande wa Kulia na Kuhifadhi
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

      // Eneo la picha linaachwa tupu kwa mfano huu.
      triggerDownload(canvas);
    };

    const triggerDownload = (targetCanvas: HTMLCanvasElement) => {
      const link = document.createElement("a");
      link.download = "national-identity-card.png";
      link.href = targetCanvas.toDataURL("image/png");
      link.click();
    };

    // Alama ya DEMO inaweka wazi kuwa huu si kitambulisho rasmi.
    ctx.save();
    ctx.translate(800, 520);
    ctx.rotate(-Math.PI / 7);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(180, 0, 0, 0.20)";
    ctx.font = "bold 104px Arial";
    ctx.fillText("MFANO / DEMO", 0, 0);
    ctx.restore();
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
          <label>Tarehe ya kuzaliwa<input className="input" value={dob} onChange={e => setDob(e.target.value)} placeholder="05-05-1995" /></label>
          <label>Jinsia<select className="input" value={gender} onChange={e => setGender(e.target.value)}><option value="M">M</option><option value="F">F</option></select></label>
          <label>Sahihi (andika jina)<input className="input" value={signature} onChange={e => setSignature(e.target.value)} placeholder="S.tj" /></label>
          <label style={{ gridColumn: "1 / -1" }}>Picha (hiari — imeachwa wazi)<input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => readImage(e.target.files?.[0])} /></label>
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
            <div aria-hidden="true" style={{
              position: "absolute", inset: 0, opacity: .45,
              backgroundImage: `repeating-radial-gradient(circle at 52% 50%, transparent 0 25px, rgba(20,100,90,0.18) 27px 29px, transparent 31px 55px)`
            }} />
            
            <div style={{ position: "absolute", zIndex: 2, left: "50%", top: "52%", transform: "translate(-50%,-50%) rotate(-18deg)", color: "rgba(180,0,0,.22)", fontWeight: 950, fontSize: "clamp(24px,7vw,72px)", whiteSpace: "nowrap", pointerEvents: "none" }}>MFANO / DEMO</div>
            <div style={{ position: "relative", textAlign: "center", lineHeight: 1.2 }}>
              <div style={{ fontWeight: 900, fontSize: "clamp(9px,1.8vw,17px)", color: "#1b2a4a" }}>{CARD_DESIGN.title}</div>
              <div style={{ fontWeight: 900, fontSize: "clamp(12px,2.8vw,28px)", color: "#1b2a4a" }}>{CARD_DESIGN.subtitle}</div>
              <div style={{ color: "#333", fontWeight: 700, fontSize: "clamp(6px,1.4vw,12px)" }}>{CARD_DESIGN.subtext}</div>
            </div>

            <div style={{ position: "relative", display: "flex", gap: 12, height: "72%", marginTop: 8 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-around" }}>
                <div style={{ fontWeight: 900, fontSize: "clamp(11px,2.2vw,23px)", overflowWrap: "anywhere", color: "#101d24" }}>{idNumber || "19950505611050000111"}</div>
                
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: "#112222" }}>JINA LA KWANZA : {firstName.toUpperCase() || "SOPHIA"}</div>
                  <div style={{ fontSize: "clamp(5px,0.9vw,9px)", color: "#555" }}>Given Name</div>
                </div>
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: "#112222" }}>JINA LA KATI : {middleName.toUpperCase() || "MJESHI"}</div>
                  <div style={{ fontSize: "clamp(5px,0.9vw,9px)", color: "#555" }}>Middle Name</div>
                </div>
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: "#112222" }}>JINA LA MWISHO : {lastName.toUpperCase() || "BAKARI"}</div>
                  <div style={{ fontSize: "clamp(5px,0.9vw,9px)", color: "#555" }}>Last Name</div>
                </div>
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: "#112222" }}>TAREHE YA KUZALIWA : {dob || "05-05-1995"}</div>
                  <div style={{ fontSize: "clamp(5px,0.9vw,9px)", color: "#555" }}>Date of Birth</div>
                </div>
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: "#112222" }}>JINSIA : {gender.toUpperCase()}</div>
                  <div style={{ fontSize: "clamp(5px,0.9vw,9px)", color: "#555" }}>Sex</div>
                </div>
                <div>
                  <div style={{ fontSize: "clamp(7px,1.2vw,12px)", fontWeight: 800, color: "#112222" }}>SAHIHI :</div>
                  <div style={{ fontSize: "clamp(5px,0.9vw,9px)", color: "#555" }}>Signature</div>
                  <div style={{ fontFamily: "cursive", fontStyle: "italic", fontSize: "clamp(9px,1.8vw,17px)", marginTop: -10, marginLeft: 50 }}>{signature || fullName}</div>
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
