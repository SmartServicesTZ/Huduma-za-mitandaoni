import { useMemo, useState } from "react";
import { ArrowLeft, Download, ImagePlus, RefreshCw, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";

export default function SoftCopyNidaDemoPage() {
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [demoNumber, setDemoNumber] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("Haijatajwa");
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
      window.alert("Jaza jina la kwanza, jina la mwisho, namba ya DEMO na tarehe ya kuzaliwa.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1600; canvas.height = 1000;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bg = ctx.createLinearGradient(0, 0, 1500, 1000);
    bg.addColorStop(0, "#e4f3d9"); bg.addColorStop(.48, "#bfe7e7"); bg.addColorStop(1, "#72c8d9");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1600, 1000);
    for (let i = 0; i < 11; i++) {
      ctx.beginPath(); ctx.strokeStyle = "rgba(38,132,112,.12)"; ctx.lineWidth = 5;
      ctx.ellipse(800, 540, 180 + i * 72, 100 + i * 39, -.25, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = "#6a9f83"; ctx.lineWidth = 12; ctx.strokeRect(14, 14, 1572, 972);
    ctx.fillStyle = "rgba(255,255,255,.65)"; ctx.fillRect(35, 28, 1530, 205);
    ctx.textAlign = "center"; ctx.fillStyle = "#244d63"; ctx.font = "bold 36px Arial";
    ctx.fillText("KITAMBULISHO CHA MFANO", 800, 76);
    ctx.fillStyle = "#46336f"; ctx.font = "bold 58px Arial"; ctx.fillText("PERSONAL IDENTITY CARD", 800, 142);
    ctx.fillStyle = "#285a67"; ctx.font = "bold 30px Arial"; ctx.fillText("SAMPLE • NOT A GOVERNMENT DOCUMENT", 800, 190);
    // Fictional decorative emblem and giraffe motif; no official state insignia or flag.
    ctx.fillStyle = "#287a5b"; ctx.beginPath(); ctx.arc(110, 125, 55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f2d56b"; ctx.beginPath(); ctx.arc(110, 125, 37, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#28566b"; ctx.font = "bold 38px Arial"; ctx.fillText("S", 110, 139);
    ctx.font = "64px Arial"; ctx.fillText("🦒", 1460, 150);
    ctx.save(); ctx.translate(790, 625); ctx.rotate(-.30); ctx.fillStyle = "rgba(170,25,35,.24)";
    ctx.font = "bold 120px Arial"; ctx.fillText("DEMO • NOT OFFICIAL", 0, 0); ctx.restore();
    ctx.textAlign = "left"; ctx.fillStyle = "#101d24"; ctx.font = "bold 52px Arial";
    ctx.fillText(demoNumber.toUpperCase(), 78, 300);
    const rows = [["JINA", fullName], ["TAREHE YA KUZALIWA", dob], ["JINSIA", gender.toUpperCase()], ["URAIA", nationality.toUpperCase()]];
    rows.forEach((row, i) => {
      const y = 390 + i * 118; ctx.fillStyle = "#172b31"; ctx.font = "bold 29px Arial"; ctx.fillText(row[0] + " :", 78, y);
      ctx.font = "bold 38px Arial"; ctx.fillText(row[1] || "—", 390, y);
    });
    ctx.fillStyle = "#172b31"; ctx.font = "bold 28px Arial"; ctx.fillText("SAHIHI / SIGNATURE:", 78, 850);
    ctx.font = "italic 52px cursive"; ctx.fillText(signature || fullName, 370, 865);
    const save = () => {
      ctx.fillStyle = "#9c2525"; ctx.font = "bold 25px Arial"; ctx.textAlign = "center";
      ctx.fillText("DEMO ONLY — NOT VALID FOR IDENTIFICATION", 800, 960);
      const link = document.createElement("a"); link.download = "personal-identity-demo.png";
      link.href = canvas.toDataURL("image/png"); link.click();
    };
    const drawPhoto = () => {
      ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.fillRect(1090, 350, 420, 490);
      ctx.strokeStyle = "#397a7a"; ctx.lineWidth = 8; ctx.strokeRect(1090, 350, 420, 490);
      if (!photo) { ctx.fillStyle = "#315d60"; ctx.font = "bold 30px Arial"; ctx.textAlign = "center"; ctx.fillText("PICHA YA MFANO", 1300, 600); save(); return; }
      const img = new Image(); img.onload = () => { ctx.drawImage(img, 1105, 365, 390, 460); save(); };
      img.onerror = save; img.src = photo;
    };
    drawPhoto();
  }

  return <main className="portal-main" style={{maxWidth:1050,margin:"0 auto",padding:"24px 16px"}}>
    <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{marginBottom:18}}><ArrowLeft size={16}/> Rudi kwenye huduma</button>
    <section className="license-form-card">
      <div style={{display:"flex",gap:12,alignItems:"center"}}><ShieldAlert size={28}/><div><h1 style={{margin:0}}>SOFT COPY NIDA</h1><p style={{margin:"4px 0 0"}}>Tengeneza kadi binafsi ya mfano kwa taarifa zako mwenyewe.</p></div></div>
      <div role="alert" style={{margin:"18px 0",padding:14,border:"2px solid #b45309",borderRadius:12,background:"#fff7ed",color:"#9a3412",fontWeight:800}}>DEMO – NOT OFFICIAL. HIKI SI KITAMBULISHO CHA NIDA WALA HAKITAMBULIKI KAMA KITAMBULISHO RASMI.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
        <label>Jina la kwanza<input className="input" value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Jina la kwanza"/></label>
        <label>Jina la kati<input className="input" value={middleName} onChange={e=>setMiddleName(e.target.value)} placeholder="Si lazima"/></label>
        <label>Jina la mwisho<input className="input" value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Jina la mwisho"/></label>
        <label>Namba ya DEMO<input className="input" value={demoNumber} onChange={e=>setDemoNumber(e.target.value)} placeholder="Mfano: DEMO-000123"/></label>
        <label>Tarehe ya kuzaliwa<input className="input" type="date" value={dob} onChange={e=>setDob(e.target.value)}/></label>
        <label>Jinsia<select className="input" value={gender} onChange={e=>setGender(e.target.value)}><option>Haijatajwa</option><option>Mwanaume</option><option>Mwanamke</option></select></label>
        <label>Uraia<input className="input" value={nationality} onChange={e=>setNationality(e.target.value)}/></label>
        <label>Sahihi (andika jina)<input className="input" value={signature} onChange={e=>setSignature(e.target.value)} placeholder="Sahihi ya mfano"/></label>
        <label style={{gridColumn:"1 / -1"}}>Picha yako<input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>readImage(e.target.files?.[0])}/></label>
      </div>
      <div style={{marginTop:20,border:"2px solid #6a9f83",borderRadius:12,padding:16,background:"linear-gradient(135deg,#e4f3d9 0%,#bfe7e7 55%,#72c8d9 100%)",position:"relative",overflow:"hidden",color:"#172b31"}}>
        <div style={{background:"rgba(255,255,255,.65)",padding:"14px 10px",textAlign:"center",borderRadius:8,position:"relative"}}>
          <div style={{position:"absolute",left:10,top:8,width:42,height:42,borderRadius:"50%",background:"#287a5b",color:"#f2d56b",display:"grid",placeItems:"center",fontWeight:900}}>S</div>
          <div style={{position:"absolute",right:10,top:0,fontSize:34}}>🦒</div>
          <div style={{fontWeight:900,color:"#244d63"}}>KITAMBULISHO CHA MFANO</div>
          <div style={{fontSize:22,fontWeight:900,color:"#46336f"}}>PERSONAL IDENTITY CARD</div>
          <div style={{fontSize:11,fontWeight:900,color:"#285a67"}}>SAMPLE • NOT A GOVERNMENT DOCUMENT</div>
        </div>
        <div style={{position:"absolute",left:"12%",top:"48%",transform:"rotate(-20deg)",fontSize:24,fontWeight:1000,color:"rgba(170,25,35,.24)",pointerEvents:"none"}}>DEMO • NOT OFFICIAL</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 130px",gap:12,alignItems:"center",marginTop:18}}>
          <div style={{lineHeight:2,fontWeight:800,overflowWrap:"anywhere"}}>
            <div style={{fontSize:18,fontWeight:1000}}>{demoNumber || "DEMO-000000"}</div>
            <div>JINA: {fullName || "MAJINA YAKO"}</div>
            <div>TAREHE YA KUZALIWA: {dob || "—"}</div>
            <div>JINSIA: {gender}</div>
            <div>URAIA: {nationality || "—"}</div>
            <div style={{marginTop:12}}>SAHIHI: {signature || fullName || "—"}</div>
          </div>
          {photo ? <img src={photo} alt="Picha ya mfano" style={{width:130,height:155,objectFit:"cover",border:"3px solid #397a7a",borderRadius:4}}/> : <div style={{width:130,height:155,display:"grid",placeItems:"center",background:"#d4e5df",border:"2px solid #397a7a",borderRadius:4}}><ImagePlus size={32}/></div>}
        </div>
        <div style={{textAlign:"center",fontWeight:1000,color:"#9c2525",fontSize:12,marginTop:12}}>DEMO ONLY — NOT VALID FOR IDENTIFICATION</div>
      </div>
      <button type="button" className="button button--green" style={{marginTop:18,width:"100%"}} onClick={downloadCard}><Download size={18}/> PAKUA KADI YA DEMO</button>
      <p style={{fontSize:12,opacity:.75,marginTop:10}}>Picha na taarifa hazitumwi kwenye seva; hutumika kwenye kifaa chako kutengeneza kadi ya mfano.</p>
    </section>
  </main>;
}
