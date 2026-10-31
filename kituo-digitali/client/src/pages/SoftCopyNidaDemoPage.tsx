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
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context;
    const gradient = ctx.createLinearGradient(0, 0, 1600, 1000);
    gradient.addColorStop(0, "#f7fbff"); gradient.addColorStop(1, "#dcecff");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1600, 1000);
    ctx.strokeStyle = "#174b79"; ctx.lineWidth = 18; ctx.strokeRect(18, 18, 1564, 964);
    ctx.fillStyle = "#123c65"; ctx.fillRect(18, 18, 1564, 160);
    ctx.fillStyle = "#fff"; ctx.font = "bold 58px Arial"; ctx.fillText("SOFT COPY • PERSONAL PROFILE", 70, 90);
    ctx.font = "bold 34px Arial"; ctx.fillStyle = "#ffdc62"; ctx.fillText("DEMO – NOT OFFICIAL", 72, 145);
    ctx.fillStyle = "#173e60"; ctx.font = "bold 38px Arial"; ctx.fillText("SAMPLE IDENTITY CARD", 72, 245);
    if (photo) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 1120, 250, 360, 440); finish(); };
      img.onerror = finish; img.src = photo;
    } else finish();
    function finish() {
      ctx.fillStyle = "#173e60"; ctx.font = "bold 28px Arial";
      const rows = [["FULL NAME", fullName], ["DEMO REFERENCE", demoNumber.toUpperCase()], ["DATE OF BIRTH", dob], ["GENDER", gender.toUpperCase()], ["NATIONALITY", nationality.toUpperCase()]];
      rows.forEach((row, i) => { const y = 340 + i * 112; ctx.fillStyle = "#52718c"; ctx.font = "bold 22px Arial"; ctx.fillText(row[0], 80, y); ctx.fillStyle = "#173e60"; ctx.font = "bold 36px Arial"; ctx.fillText(row[1] || "—", 80, y + 48); });
      if (signature) { ctx.fillStyle = "#173e60"; ctx.font = "italic 32px cursive"; ctx.fillText(signature, 80, 890); }
      ctx.save(); ctx.translate(800, 650); ctx.rotate(-0.38); ctx.fillStyle = "rgba(190,35,35,.17)"; ctx.font = "bold 112px Arial"; ctx.textAlign = "center"; ctx.fillText("DEMO • NOT OFFICIAL", 0, 0); ctx.restore();
      ctx.fillStyle = "#9c2525"; ctx.font = "bold 25px Arial"; ctx.fillText("THIS IS A PERSONAL DESIGN SAMPLE — NOT A GOVERNMENT ID", 80, 950);
      const link = document.createElement("a"); link.download = "soft-copy-nida-demo.png"; link.href = canvas.toDataURL("image/png"); link.click();
    }
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
      <div style={{marginTop:20,border:"1px solid #b8c9d8",borderRadius:16,padding:16,background:"linear-gradient(135deg,#f8fbff,#e2efff)",position:"relative",overflow:"hidden"}}>
        <div style={{fontWeight:900,color:"#16466f",fontSize:20}}>PERSONAL PROFILE CARD</div><div style={{color:"#b45309",fontWeight:900,marginBottom:14}}>DEMO – NOT OFFICIAL</div>
        <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
          {photo ? <img src={photo} alt="Picha ya mfano" style={{width:120,height:145,objectFit:"cover",borderRadius:8,border:"3px solid #16466f"}}/> : <div style={{width:120,height:145,display:"grid",placeItems:"center",background:"#d3e1ef",borderRadius:8}}><ImagePlus size={32}/></div>}
          <div style={{flex:1,minWidth:200,color:"#173e60",lineHeight:2}}><strong>{fullName || "MAJINA YAKO"}</strong><br/>DEMO REF: {demoNumber || "DEMO-000000"}<br/>TAREHE YA KUZALIWA: {dob || "—"}<br/>JINSIA: {gender}<br/>URAIA: {nationality || "—"}<br/>SAHIHI: {signature || "—"}</div>
        </div>
        <div style={{position:"absolute",right:12,bottom:10,color:"#b91c1c",fontWeight:900,opacity:.8}}>DEMO • NOT OFFICIAL</div>
      </div>
      <button type="button" className="button button--green" style={{marginTop:18,width:"100%"}} onClick={downloadCard}><Download size={18}/> PAKUA KADI YA DEMO</button>
      <p style={{fontSize:12,opacity:.75,marginTop:10}}>Picha na taarifa hazitumwi kwenye seva; hutumika kwenye kifaa chako kutengeneza kadi ya mfano.</p>
    </section>
  </main>;
}
