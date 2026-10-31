import { useMemo, useState } from "react";
import { ArrowLeft, Download, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

const ASSET_BASE_URL = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

const CARD_DESIGN = {
  lines: [
    "JAMHURI YA MUUNGANO WA TANZANIA",
    "KITAMBULISHO CHA TAIFA",
    "THE UNITED REPUBLIC OF TANZANIA",
    "CITIZEN IDENTITY CARD"
  ],
  colors: {
    backgroundStart: "#d4edda",
    backgroundMid: "#bee5eb",
    backgroundEnd: "#78c6d7",
    border: "#477e77",
  },
  assets: {
    ngao: `${ASSET_BASE_URL}images/ngao.png`,
    bendera: `${ASSET_BASE_URL}images/bendera.png`,
  }
};

function loadCardImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Imeshindikana kupakia picha ya kitambulisho: ${src}`));
    image.src = src;
  });
}

function containImageRect(image: HTMLImageElement, x: number, y: number, maxWidth: number, maxHeight: number) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: x + (maxWidth - width) / 2, y: y + (maxHeight - height) / 2, width, height };
}

export default function SoftCopyNidaDemoPage() {
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("Awadhi");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("Kibanje");
  const [idNumber, setIdNumber] = useState("19961006218020000128");
  const [dobInput, setDobInput] = useState("1996-10-06");
  const [gender, setGender] = useState("M");
  const [photo, setPhoto] = useState("");
  const [signature, setSignature] = useState("A. Kibanje");

  const fullName = useMemo(
    () => [firstName, middleName, lastName].filter(Boolean).join(" ").toUpperCase(),
    [firstName, middleName, lastName]
  );

  const formattedDob = useMemo(() => {
    if (!dobInput) return "06 OCT 1996";
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

  const formattedNidaNumber = useMemo(() => {
    const raw = idNumber.replace(/\D/g, "");
    if (raw.length >= 20) {
      return `${raw.slice(0,8)}-${raw.slice(8,13)}-${raw.slice(13,18)}-${raw.slice(18,20)}`;
    }
    return idNumber.toUpperCase() || "19961006-21802-00001-28";
  }, [idNumber]);

  function readImage(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function downloadCard() {
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

    // 2. Taswira ya Mlima kwa nyuma
    ctx.fillStyle = "rgba(160, 60, 40, 0.10)";
    ctx.beginPath();
    ctx.moveTo(250, 750);
    ctx.lineTo(450, 380);
    ctx.lineTo(580, 500);
    ctx.lineTo(750, 280);
    ctx.lineTo(950, 750);
    ctx.closePath();
    ctx.fill();

    const finalizeCanvas = () => {
      // Ukingo wa nje
      ctx.strokeStyle = CARD_DESIGN.colors.border;
      ctx.lineWidth = 10;
      ctx.strokeRect(16, 16, 1568, 968);

      // Mistari 4 ya Juu
      ctx.textAlign = "center";
      ctx.fillStyle = "#1b2a4a";
      ctx.font = "bold 22px Arial";
      ctx.fillText(CARD_DESIGN.lines[0], 800, 55);

      ctx.font = "bold 38px Arial";
      ctx.fillText(CARD_DESIGN.lines[1], 800, 98);

      ctx.font = "bold 16px Arial";
      ctx.fillStyle = "#333333";
      ctx.fillText(CARD_DESIGN.lines[2], 800, 126);

      ctx.font = "bold 18px Arial";
      ctx.fillStyle = "#1b2a4a";
      ctx.fillText(CARD_DESIGN.lines[3], 800, 153);

      // Namba ya Kitambulisho
      ctx.textAlign = "left";
      ctx.fillStyle = "#101d24";
      ctx.font = "bold 44px Arial";
      ctx.fillText(formattedNidaNumber, 75, 230);

      // Taarifa za Kushoto
      const drawFieldExact = (labelKiswahili: string, labelEnglish: string, value: string, y: number) => {
        ctx.font = "bold 18px Arial";
        ctx.fillStyle = "#1f3a34";
        ctx.fillText(labelKiswahili, 75, y);

        ctx.font = "14px Arial";
        ctx.fillStyle = "#555555";
        ctx.fillText(labelEnglish, 75, y + 20);

        ctx.font = "bold 32px Arial";
        ctx.fillStyle = "#112222";
        ctx.fillText(value || "—", 380, y + 10);
      };

      drawFieldExact("JINA", "Given Name", (firstName + " " + middleName).trim().toUpperCase(), 320);
      drawFieldExact("JINA LA MWISHO", "Last Name", lastName.toUpperCase(), 430);
      drawFieldExact("TAREHE YA KUZALIWA", "Date of Birth", formattedDob, 540);
      drawFieldExact("JINSI", "Sex", gender.toUpperCase(), 650);

      // Sahihi
      ctx.font = "bold 18px Arial";
      ctx.fillStyle = "#1f3a34";
      ctx.fillText("SAINI", 75, 760);
      ctx.font = "14px Arial";
      ctx.fillStyle = "#555555";
      ctx.fillText("Signature", 75, 782);

      ctx.font = "italic 36px cursive";
      ctx.fillStyle = "#0a192f";
      ctx.fillText(signature || fullName, 190, 775);

      // Picha ya Mtumiaji
      const pX = 1120, pY = 270, pW = 390, pH = 480;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(pX, pY, pW, pH);
      ctx.strokeStyle = CARD_DESIGN.colors.border;
      ctx.lineWidth = 6;
      ctx.strokeRect(pX, pY, pW, pH);

      const triggerDownload = () => {
        const link = document.createElement("a");
        link.download = "national-identity-card.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
      };

      if (photo) {
        const userImg = new Image();
        userImg.onload = () => {
          ctx.drawImage(userImg, pX + 10, pY + 10, pW - 20, pH - 20);
          triggerDownload();
        };
        userImg.onerror = triggerDownload;
        userImg.src = photo;
      } else {
        triggerDownload();
      }
    };

    try {
      const [ngaoImg, benderaImg] = await Promise.all([
        loadCardImage(CARD_DESIGN.assets.ngao),
        loadCardImage(CARD_DESIGN.assets.bendera),
      ]);

      // Draw into bounded boxes while preserving each source image's aspect ratio.
      // The boxes stay clear of the four centered header lines.
      const ngaoRect = containImageRect(ngaoImg, 55, 22, 170, 125);
      ctx.drawImage(ngaoImg, ngaoRect.x, ngaoRect.y, ngaoRect.width, ngaoRect.height);
      const benderaRect = containImageRect(benderaImg, 1375, 30, 170, 105);
      ctx.drawImage(benderaImg, benderaRect.x, benderaRect.y, benderaRect.width, benderaRect.height);

      finalizeCanvas();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Imeshindikana kupakia nembo ya kitambulisho.");
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
            <h1 style={{ margin: 0 }}>KITAMBULISHO CHA TAIFA</h1>
            <p style={{ margin: "4px 0 0" }}>Jaza taarifa na uone muonekano sahihi hapa chini.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 15 }}>
          <label>Jina la kwanza<input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Awadhi" /></label>
          <label>Jina la kati<input className="input" value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="" /></label>
          <label>Jina la mwisho<input className="input" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Kibanje" /></label>
          <label>Namba ya Kitambulisho<input className="input" value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="19961006218020000128" /></label>
          <label>Tarehe ya kuzaliwa<input className="input" type="date" value={dobInput} onChange={e => setDobInput(e.target.value)} /></label>
          <label>Jinsia<select className="input" value={gender} onChange={e => setGender(e.target.value)}><option value="M">M</option><option value="F">F</option></select></label>
          <label>Sahihi (andika jina)<input className="input" value={signature} onChange={e => setSignature(e.target.value)} placeholder="A. Kibanje" /></label>
          <label style={{ gridColumn: "1 / -1" }}>Picha (hiari)<input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => readImage(e.target.files?.[0])} /></label>
        </div>

        <div style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>PREVIEW YA KITAMBULISHO</h2>
          <div style={{
            position: "relative", overflow: "hidden", aspectRatio: "1.6 / 1",
            width: "100%", borderRadius: 16, border: `2px solid ${CARD_DESIGN.colors.border}`,
            padding: "clamp(12px,3vw,28px)", boxSizing: "border-box",
            background: "linear-gradient(125deg, #d4edda 0%, #bee5eb 50%, #78c6d7 100%)",
            color: "#112222", boxShadow: "0 8px 24px rgba(0,0,0,.16)"
          }}>
            {/* Mlima wa nyuma kwenye Preview */}
            <div style={{ position: "absolute", inset: 0, opacity: 0.12, pointerEvents: "none", overflow: "hidden" }}>
              <svg width="100%" height="100%" viewBox="0 0 1000 625" preserveAspectRatio="none">
                <polygon points="150,500 320,240 420,380 580,180 780,500" fill="#a03c28" />
              </svg>
            </div>

            {/* Ngao halisi (Kushoto) kwenye Preview */}
            <img src={CARD_DESIGN.assets.ngao} alt="Ngao" style={{ position: "absolute", left: "3%", top: "2%", width: "12%", height: "18%", objectFit: "contain", objectPosition: "center", display: "block" }} />
            
            {/* Bendera halisi (Kulia) kwenye Preview */}
            <img src={CARD_DESIGN.assets.bendera} alt="Bendera" style={{ position: "absolute", right: "3%", top: "3%", width: "14%", height: "13%", objectFit: "contain", objectPosition: "center", display: "block" }} />

            {/* Mistari 4 ya Juu */}
            <div style={{ position: "relative", textAlign: "center", lineHeight: 1.15 }}>
              <div style={{ fontWeight: 900, fontSize: "clamp(8px,1.6vw,15px)", color: "#1b2a4a" }}>{CARD_DESIGN.lines[0]}</div>
              <div style={{ fontWeight: 900, fontSize: "clamp(11px,2.5vw,25px)", color: "#1b2a4a" }}>{CARD_DESIGN.lines[1]}</div>
              <div style={{ fontWeight: 700, fontSize: "clamp(6px,1.1vw,11px)", color: "#333333" }}>{CARD_DESIGN.lines[2]}</div>
              <div style={{ fontWeight: 800, fontSize: "clamp(7px,1.3vw,13px)", color: "#1b2a4a" }}>{CARD_DESIGN.lines[3]}</div>
            </div>

            <div style={{ position: "relative", display: "flex", gap: 12, height: "70%", marginTop: 6 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-around" }}>
                <div style={{ fontWeight: 900, fontSize: "clamp(10px,2vw,21px)", overflowWrap: "anywhere", color: "#101d24", letterSpacing: "1px" }}>{formattedNidaNumber}</div>
                
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 15 }}>
                    <div style={{ width: "160px" }}>
                      <div style={{ fontSize: "clamp(6px,1vw,10px)", fontWeight: 800, color: "#1f3a34" }}>JINA</div>
                      <div style={{ fontSize: "clamp(4px,0.7vw,7px)", color: "#555" }}>Given Name</div>
                    </div>
                    <div style={{ fontSize: "clamp(8px,1.5vw,15px)", fontWeight: 900, color: "#112222" }}>{ (firstName + " " + middleName).trim().toUpperCase() || "AWADHI" }</div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 15 }}>
                    <div style={{ width: "160px" }}>
                      <div style={{ fontSize: "clamp(6px,1vw,10px)", fontWeight: 800, color: "#1f3a34" }}>JINA LA MWISHO</div>
                      <div style={{ fontSize: "clamp(4px,0.7vw,7px)", color: "#555" }}>Last Name</div>
                    </div>
                    <div style={{ fontSize: "clamp(8px,1.5vw,15px)", fontWeight: 900, color: "#112222" }}>{ lastName.toUpperCase() || "KIBANJE" }</div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 15 }}>
                    <div style={{ width: "160px" }}>
                      <div style={{ fontSize: "clamp(6px,1vw,10px)", fontWeight: 800, color: "#1f3a34" }}>TAREHE YA KUZALIWA</div>
                      <div style={{ fontSize: "clamp(4px,0.7vw,7px)", color: "#555" }}>Date of Birth</div>
                    </div>
                    <div style={{ fontSize: "clamp(8px,1.5vw,15px)", fontWeight: 900, color: "#112222" }}>{ formattedDob }</div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 15 }}>
                    <div style={{ width: "160px" }}>
                      <div style={{ fontSize: "clamp(6px,1vw,10px)", fontWeight: 800, color: "#1f3a34" }}>JINSI</div>
                      <div style={{ fontSize: "clamp(4px,0.7vw,7px)", color: "#555" }}>Sex</div>
                    </div>
                    <div style={{ fontSize: "clamp(8px,1.5vw,15px)", fontWeight: 900, color: "#112222" }}>{ gender.toUpperCase() }</div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 15 }}>
                    <div style={{ width: "160px" }}>
                      <div style={{ fontSize: "clamp(6px,1vw,10px)", fontWeight: 800, color: "#1f3a34" }}>SAINI</div>
                      <div style={{ fontSize: "clamp(4px,0.7vw,7px)", color: "#555" }}>Signature</div>
                    </div>
                    <div style={{ fontFamily: "cursive", fontStyle: "italic", fontSize: "clamp(8px,1.6vw,15px)", color: "#0a192f" }}>{signature || fullName}</div>
                  </div>
                </div>
              </div>

              {/* Boksi la picha */}
              <div style={{
                width: "27%", minWidth: "22%", height: "82%", alignSelf: "center",
                border: `2px solid ${CARD_DESIGN.colors.border}`,
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
