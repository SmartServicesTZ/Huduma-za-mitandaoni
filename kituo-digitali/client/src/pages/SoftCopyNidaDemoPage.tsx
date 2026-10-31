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
  const [nationality, setNationality] = useState("Tanzania");
  const [photo, setPhoto] = useState("");
  const [signature, setSignature] = useState("");
  const fullName = useMemo(() => [firstName, middleName, lastName].filter(Boolean).join(" ").toUpperCase(), [firstName, middleName, lastName]);

  function readImage(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function downloadCard() {
    if (!firstName.trim() || !lastName.trim() || !demoNumber.trim() || !dob) {
      window.alert("Tafadhali jaza taarifa zote muhimu.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1600; canvas.height = 1000;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Rangi ya nyuma ya kitambulisho (Gradient background halisi)
    const bg = ctx.createLinearGradient(0, 0, 1600, 1000);
    bg.addColorStop(0, "#d8f3dc"); bg.addColorStop(0.5, "#b5e2fa"); bg.addColorStop(1, "#90e0ef");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1600, 1000);

    // Michoro ya kiusalama ya nyuma (Guilloche lines / motifs)
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(40, 120, 100, 0.08)";
      ctx.lineWidth = 6;
      ctx.ellipse(800, 500, 200 + i * 60, 100 + i * 35, -0.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ukingo wa nje wa kitambulisho
    ctx.strokeStyle = "#4a7c59"; ctx.lineWidth = 10; ctx.strokeRect(12, 12, 1576, 976);

    // Eneo la Kichwa cha Juu (Header)
    ctx.textAlign = "center"; ctx.fillStyle = "#1b263b";
    ctx.font = "bold 28px Arial"; ctx.fillText("JAMHURI YA MUUNGANO WA TANZANIA", 800, 65);
    ctx.font = "bold 46px Arial"; ctx.fillStyle = "#1d3557"; ctx.fillText("KITAMBULISHO CHA TAIFA", 800, 120);
    ctx.font = "bold 22px Arial"; ctx.fillStyle = "#457b9d"; ctx.fillText("THE UNITED REPUBLIC OF TANZANIA   —   CITIZEN IDENTITY CARD", 800, 160);

    // Namba ya Kitambulisho (DEMO Number)
    ctx.textAlign = "left"; ctx.fillStyle = "#0b090a"; ctx.font = "bold 55px Arial";
    ctx.fillText(demoNumber.toUpperCase(), 75, 250);

    // Taarifa za Mtumiaji (Labels & Values)
    ctx.fillStyle = "#111"; 
    ctx.font = "bold 32px Arial"; ctx.fillText("JINA :   " + (firstName + " " + middleName).trim().toUpperCase(), 75, 350);
    ctx.font = "20px Arial"; ctx.fillStyle = "#555"; ctx.fillText("Given Name", 160, 385);

    ctx.fillStyle = "#111"; ctx.font = "bold 32px Arial"; ctx.fillText("JINA LA MWISHO :   " + lastName.toUpperCase(), 75, 470);
    ctx.font = "20px Arial"; ctx.fillStyle = "#555"; ctx.fillText("Last Name", 270, 505);

    ctx.fillStyle = "#111"; ctx.font = "bold 32px Arial"; ctx.fillText("TAREHE YA KUZALIWA :   " + dob, 75, 590);
    ctx.font = "20px Arial"; ctx.fillStyle = "#555"; ctx.fillText("Date of Birth", 305, 625);

    ctx.fillStyle = "#111"; ctx.font = "bold 32px Arial"; ctx.fillText("JINSIA :   " + gender.toUpperCase(), 75, 710);
    ctx.font = "20px Arial"; ctx.fillStyle = "#555"; ctx.fillText("Sex", 160, 745);

    ctx.fillStyle = "#111"; ctx.font = "bold 32px Arial"; ctx.fillText("SAINI :", 75, 830);
    ctx.font = "20px Arial"; ctx.fillStyle = "#555"; ctx.fillText("Signature", 160, 865);

    // Sahihi (Signature)
    ctx.fillStyle = "#1d3557"; ctx.font = "italic 52px cursive"; 
    ctx.fillText(signature || fullName, 190, 845);

    // Kitendo cha kuhifadhi faili baada ya picha kukamilika
    const saveImage = () => {
      const link = document.createElement("a"); link.download = "nida-identity-card.png";
      link.href = canvas.toDataURL("image/png"); link.click();
    };

    // Kuchora Picha ya Mtu Upande wa Kulia
    const pX = 1070, pY = 380, pW = 440, pH = 520;
    ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fillRect(pX, pY, pW, pH);
    ctx.strokeStyle = "#457b9d"; ctx.lineWidth = 6; ctx.strokeRect(pX, pY, pW, pH);

    if (!photo) {
      ctx.fillStyle = "#457b9d"; ctx.font = "bold 30px Arial"; ctx.textAlign = "center";
      ctx.fillText("WEKA PICHA", pX + pW / 2, pY + pH / 2);
      saveImage();
      return;
    }

    const userImg = new Image();
    userImg.onload = () => {
      ctx.drawImage(userImg, pX + 10, pY + 10, pW - 20, pH - 20);
      saveImage();
    };
    userImg.onerror = saveImage;
    userImg.src = photo;
  }

  return <main className="portal-main" style={{maxWidth:1050,margin:"0 auto",padding:"24px 16px"}}>
    <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{marginBottom:18}}><ArrowLeft size={16}/> Rudi kwenye huduma</button>
    <section className="license-form-card">
      <div style={{display:"flex",gap:12,alignItems:"center"}}><ShieldAlert size={28}/><div><h1 style={{margin:0}}>SOFT COPY NIDA</h1><p style={{margin:"4px 0 0"}}>Tengeneza kitambulisho chenye muonekano sahihi na safi.</p></div></div>
      
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14, marginTop: 15}}>
        <label>Jina la kwanza<input className="input" value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="AWADHI"/></label>
        <label>Jina la kati<input className="input" value={middleName} onChange={e=>setMiddleName(e.target.value)} placeholder="BAKARI"/></label>
        <label>Jina la mwisho<input className="input" value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="KIBANJE"/></label>
        <label>Namba ya Kitambulisho<input className="input" value={demoNumber} onChange={e=>setDemoNumber(e.target.value)} placeholder="19961006-21802-..."/></label>
        <label>Tarehe ya kuzaliwa<input className="input" value={dob} onChange={e=>setDob(e.target.value)} placeholder="06 OCT 1996"/></label>
        <label>Jinsia<select className="input" value={gender} onChange={e=>setGender(e.target.value)}><option>M</option><option>F</option></select></label>
        <label>Sahihi (Andika jina au sahihi)<input className="input" value={signature} onChange={e=>setSignature(e.target.value)} placeholder="A. Kibanje"/></label>
        <label style={{gridColumn:"1 / -1"}}>Picha yako<input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>readImage(e.target.files?.[0])}/></label>
      </div>

      <button type="button" className="button button--green" style={{marginTop:20,width:"100%"}} onClick={downloadCard}><Download size={18}/> PAKUA KITAMBULISHO</button>
    </section>
  </main>;
}
