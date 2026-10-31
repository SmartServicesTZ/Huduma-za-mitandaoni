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

    // Mandhari ya DEMO: rangi za kijani/bluu na michoro ya usuli.
    const gradient = ctx.createLinearGradient(0, 0, 1600, 1000);
    gradient.addColorStop(0, "#e4f3d9");
    gradient.addColorStop(0.5, "#bfe7e7");
    gradient.addColorStop(1, "#72c8d9");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1600, 1000);
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(38,132,112,0.12)";
      ctx.lineWidth = 5;
      ctx.ellipse(780, 520, 180 + i * 75, 100 + i * 40, -0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawCardElements(ctx);

  function drawCardElements(ctx: CanvasRenderingContext2D) {
    // Kichwa cha juu (Header text)
    ctx.textAlign = "center"; ctx.fillStyle = "#24104f";
    ctx.font = "bold 26px Arial"; ctx.fillText("KITAMBULISHO CHA MFANO • DEMO", 800, 55);
    ctx.font = "bold 44px Arial"; ctx.fillText("PERSONAL IDENTITY CARD", 800, 105);
    ctx.font = "bold 22px Arial"; ctx.fillStyle = "#333"; 
    ctx.fillText("SAMPLE • NOT A GOVERNMENT DOCUMENT", 800, 145);

    // Namba ya Kitambulisho / Demo Number
    ctx.textAlign = "left"; ctx.fillStyle = "#101d24"; ctx.font = "bold 55px Arial";
    ctx.fillText(demoNumber.toUpperCase(), 75, 230);

    // Taarifa za Mtumiaji (Labels & Values)
    const rows = [
      ["JINA :", firstName.toUpperCase() + (middleName ? " " + middleName.toUpperCase() : "")],
      ["Given Name", ""],
      ["JINA LA MWISHO :", lastName.toUpperCase()],
      ["Last Name", ""],
      ["TAREHE YA KUZALIWA :", dob],
      ["Date of Birth", ""],
      ["JINSIA :", gender.toUpperCase()],
      ["Sex", ""]
    ];

    // Kupanga maandishi kwa mpangilio sahihi kama kwenye NIDA
    ctx.fillStyle = "#111"; 
    ctx.font = "bold 32px Arial"; ctx.fillText("JINA :   " + (firstName + " " + middleName).trim().toUpperCase(), 75, 330);
    ctx.font = "20px Arial"; ctx.fillStyle = "#444"; ctx.fillText("Given Name", 160, 365);

    ctx.fillStyle = "#111"; ctx.font = "bold 32px Arial"; ctx.fillText("JINA LA MWISHO :   " + lastName.toUpperCase(), 75, 450);
    ctx.font = "20px Arial"; ctx.fillStyle = "#444"; ctx.fillText("Last Name", 270, 485);

    ctx.fillStyle = "#111"; ctx.font = "bold 32px Arial"; ctx.fillText("TAREHE YA KUZALIWA :   " + dob, 75, 570);
    ctx.font = "20px Arial"; ctx.fillStyle = "#444"; ctx.fillText("Date of Birth", 305, 605);

    ctx.fillStyle = "#111"; ctx.font = "bold 32px Arial"; ctx.fillText("JINSIA :   " + gender.toUpperCase(), 75, 690);
    ctx.font = "20px Arial"; ctx.fillStyle = "#444"; ctx.fillText("Sex", 160, 725);

    ctx.fillStyle = "#111"; ctx.font = "bold 32px Arial"; ctx.fillText("SAINI :", 75, 810);
    ctx.font = "20px Arial"; ctx.fillStyle = "#444"; ctx.fillText("Signature", 160, 845);

    // Sahihi (Signature)
    ctx.fillStyle = "#0a192f"; ctx.font = "italic 52px cursive"; 
    ctx.fillText(signature || fullName, 190, 825);

    // Hifadhi picha au onyo la Demo
    const saveImage = () => {
      const link = document.createElement("a"); link.download = "personal-identity-demo.png";
      link.href = canvas.toDataURL("image/png"); link.click();
    };

    // Kuchora Picha ya Mtu Upande wa Kulia
    const pX = 1070, pY = 380, pW = 440, pH = 520;
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(pX, pY, pW, pH);
    ctx.strokeStyle = "#444"; ctx.lineWidth = 6; ctx.strokeRect(pX, pY, pW, pH);

    if (!photo) {
      ctx.fillStyle = "#333"; ctx.font = "bold 30px Arial"; ctx.textAlign = "center";
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
      <div style={{display:"flex",gap:12,alignItems:"center"}}><ShieldAlert size={28}/><div><h1 style={{margin:0}}>SOFT COPY NIDA</h1><p style={{margin:"4px 0 0"}}>Tengeneza kadi ya mfano yenye mpangilio wa taarifa na rangi ulizochagua.</p></div></div>
      
      <div role="alert" style={{margin:"16px 0",padding:12,border:"2px solid #b45309",borderRadius:10,background:"#fff7ed",color:"#9a3412",fontWeight:800}}>DEMO – NOT OFFICIAL. HII NI KADI YA MFANO TU, SI KITAMBULISHO CHA NIDA AU HATI YA SERIKALI.</div>\n      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14, marginTop: 15}}>
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
