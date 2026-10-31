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
    canvas.width = 1016; canvas.height = 638; // Vipimo sahihi vya uwiano wa kitambulisho (ID Card Ratio 1.6:1)
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background gradient ya kitambulisho
    const bg = ctx.createLinearGradient(0, 0, 1016, 638);
    bg.addColorStop(0, "#e4f3d9"); bg.addColorStop(.48, "#bfe7e7"); bg.addColorStop(1, "#72c8d9");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1016, 638);

    // Michoro ya nyuma ya ulinzi (Guilloche pattern lines)
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); ctx.strokeStyle = "rgba(38,132,112,.1)"; ctx.lineWidth = 3;
      ctx.ellipse(508, 320, 100 + i * 50, 60 + i * 25, -.25, 0, Math.PI * 2); ctx.stroke();
    }

    // Ukingo wa nje wa kadi
    ctx.strokeStyle = "#5a8f73"; ctx.lineWidth = 6; ctx.strokeRect(8, 8, 1000, 622);

    // Eneo la kichwa cha habari juu
    ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fillRect(20, 18, 976, 110);

    // Nembo ya Jamhuri upande wa kushoto (Ngao ya Taifa ya Mfano)
    ctx.fillStyle = "#1b4d3e"; ctx.beginPath(); ctx.arc(70, 73, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f5d061"; ctx.beginPath(); ctx.arc(70, 73, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1b4d3e"; ctx.font = "bold 20px Arial"; ctx.textAlign = "center"; ctx.fillText("TZ", 70, 80);

    // Bendera au alama ya taifa upande wa kulia
    ctx.font = "38px Arial"; ctx.fillText("🇹🇿", 945, 78);

    // Maandishi ya vichwa vya habari vya kitambulisho
    ctx.textAlign = "center"; ctx.fillStyle = "#242563"; ctx.font = "bold 18px Arial";
    ctx.fillText("JAMHURI YA MUUNGANO WA TANZANIA", 508, 45);
    ctx.fillStyle = "#2c224d"; ctx.font = "bold 24px Arial";
    ctx.fillText("KITAMBULISHO CHA TAIFA", 508, 72);
    ctx.fillStyle = "#333333"; ctx.font = "bold 13px Arial";
    ctx.fillText("THE UNITED REPUBLIC OF TANZANIA — NATIONAL IDENTITY CARD", 508, 95);

    // Watermark ya DEMO katikati
    ctx.save(); ctx.translate(450, 340); ctx.rotate(-.25); ctx.fillStyle = "rgba(170,25,35,.18)";
    ctx.font = "bold 75px Arial"; ctx.textAlign = "center"; ctx.fillText("DEMO • NOT OFFICIAL", 0, 0); ctx.restore();

    // Namba ya Kitambulisho (DEMO Number)
    ctx.textAlign = "left"; ctx.fillStyle = "#101d24"; ctx.font = "bold 30px Arial";
    ctx.fillText(demoNumber.toUpperCase(), 35, 162);

    // Taarifa za mtumiaji (Labels & Values)
    const rows = [
      ["JINA / Given Name", fullName.split(" ")[0] || "—"],
      ["JINA LA MWISHO / Last Name", fullName.split(" ").slice(1).join(" ") || "—"],
      ["TAREHE YA KUZALIWA / DOB", dob || "—"],
      ["JINSIA / Sex", gender.toUpperCase()],
      ["URAIA / Nationality", nationality.toUpperCase()]
    ];

    rows.forEach((row, i) => {
      const y = 210 + i * 55;
      ctx.fillStyle = "#223b42"; ctx.font = "bold 14px Arial"; ctx.fillText(row[0], 35, y);
      ctx.fillStyle = "#101d24"; ctx.font = "bold 22px Arial"; ctx.fillText(row[1], 35, y + 24);
    });

    // Sehemu ya Sahihi (Signature)
    ctx.fillStyle = "#223b42"; ctx.font = "bold 14px Arial"; ctx.fillText("SAHIHI / Signature:", 35, 505);
    ctx.fillStyle = "#111111"; ctx.font = "italic 32px cursive"; ctx.fillText(signature || fullName, 35, 545);

    // Ujumbe wa onyo chini kabisa
    ctx.fillStyle = "#9c2525"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center";
    ctx.fillText("DEMO ONLY — NOT VALID FOR OFFICIAL IDENTIFICATION", 508, 615);

    const save = () => {
      const link = document.createElement("a"); link.download = "national-identity-card-demo.png";
      link.href = canvas.toDataURL("image/png"); link.click();
    };

    // Upande wa kulia: Kuandaa na kuchora picha ya mtumiaji kwenye Canvas
    const drawPhoto = () => {
      const pX = 740, pY = 155, pW = 230, pH = 280;
      ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(pX, pY, pW, pH);
      ctx.strokeStyle = "#397a7a"; ctx.lineWidth = 4; ctx.strokeRect(pX, pY, pW, pH);

      if (!photo) { 
        ctx.fillStyle = "#315d60"; ctx.font = "bold 18px Arial"; ctx.textAlign = "center"; 
        ctx.fillText("PICHA YAKO", pX + pW / 2, pY + pH / 2); 
        save(); return; 
      }
      const img = new Image(); 
      img.onload = () => { 
        ctx.drawImage(img, pX + 8, pY + 8, pW - 16, pH - 16); 
        save(); 
      };
      img.onerror = save; 
      img.src = photo;
    };
    drawPhoto();
  }

  return <main className="portal-main" style={{maxWidth:1050,margin:"0 auto",padding:"24px 16px"}}>
    <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{marginBottom:18}}><ArrowLeft size={16}/> Rudi kwenye huduma</button>
    <section className="license-form-card">
      <div style={{display:"flex",gap:12,alignItems:"center"}}><ShieldAlert size={28}/><div><h1 style={{margin:0}}>SOFT COPY NIDA DEMO</h1><p style={{margin:"4px 0 0"}}>Tengeneza kadi ya mfano inayofanana na Kitambulisho cha Taifa kwa ajili ya majaribio.</p></div></div>
      <div role="alert" style={{margin:"18px 0",padding:14,border:"2px solid #b45309",borderRadius:12,background:"#fff7ed",color:"#9a3412",fontWeight:800}}>DEMO – NOT OFFICIAL. HIKI SI KITAMBULISHO CHA NIDA WALA HAKITAMBULIKI KAMA KITAMBULISHO RASMI.</div>
      
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
        <label>Jina la kwanza<input className="input" value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Mfano: AWADHI"/></label>
        <label>Jina la kati<input className="input" value={middleName} onChange={e=>setMiddleName(e.target.value)} placeholder="Si lazima"/></label>
        <label>Jina la mwisho<input className="input" value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Mfano: KIBANJE"/></label>
        <label>Namba ya DEMO<input className="input" value={demoNumber} onChange={e=>setDemoNumber(e.target.value)} placeholder="Mfano: 19961006-21802..."/></label>
        <label>Tarehe ya kuzaliwa<input className="input" value={dob} onChange={e=>setDob(e.target.value)} placeholder="06 OCT 1996"/></label>
        <label>Jinsia<select className="input" value={gender} onChange={e=>setGender(e.target.value)}><option>Haijatajwa</option><option>M</option><option>F</option></select></label>
        <label>Uraia<input className="input" value={nationality} onChange={e=>setNationality(e.target.value)}/></label>
        <label>Sahihi (andika jina)<input className="input" value={signature} onChange={e=>setSignature(e.target.value)} placeholder="A. Kibanje"/></label>
        <label style={{gridColumn:"1 / -1"}}>Picha yako<input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>readImage(e.target.files?.[0])}/></label>
      </div>

      {/* Sehemu ya hakiki (Preview) inayofanana kabisa na muundo sahihi */}
      <div style={{marginTop:20,border:"2px solid #6a9f83",borderRadius:12,padding:16,background:"linear-gradient(135deg,#e4f3d9 0%,#bfe7e7 55%,#72c8d9 100%)",position:"relative",overflow:"hidden",color:"#172b31"}}>
        <div style={{background:"rgba(255,255,255,.75)",padding:"10px",textAlign:"center",borderRadius:8,position:"relative"}}>
          <div style={{position:"absolute",left:8,top:6,width:32,height:32,borderRadius:"50%",background:"#1b4d3e",color:"#f5d061",display:"grid",placeItems:"center",fontWeight:900,fontSize:12}}>TZ</div>
          <div style={{position:"absolute",right:8,top:6,fontSize:24}}>🇹🇿</div>
          <div style={{fontSize:11,fontWeight:900,color:"#242563"}}>JAMHURI YA MUUNGANO WA TANZANIA</div>
          <div style={{fontSize:15,fontWeight:900,color:"#2c224d"}}>KITAMBULISHO CHA TAIFA</div>
          <div style={{fontSize:9,fontWeight:700,color:"#333"}}>THE UNITED REPUBLIC OF TANZANIA — NATIONAL IDENTITY CARD</div>
        </div>

        <div style={{position:"absolute",left:"30%",top:"45%",transform:"rotate(-20deg)",fontSize:20,fontWeight:1000,color:"rgba(170,25,35,.18)",pointerEvents:"none"}}>DEMO • NOT OFFICIAL</div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 120px",gap:12,alignItems:"center",marginTop:14}}>
          <div style={{lineHeight:1.5,fontWeight:800,overflowWrap:"anywhere",fontSize:13}}>
            <div style={{fontSize:16,fontWeight:1000,color:"#101d24",marginBottom:6}}>{demoNumber || "19961006-21802-00001-28"}</div>
            <div><span style={{fontSize:10,color:"#555",display:"block"}}>JINA:</span>{firstName.toUpperCase() || "AWADHI"} {middleName.toUpperCase()}</div>
            <div style={{marginTop:4}}><span style={{fontSize:10,color:"#555",display:"block"}}>JINA LA MWISHO:</span>{lastName.toUpperCase() || "KIBANJE"}</div>
            <div style={{marginTop:4}}><span style={{fontSize:10,color:"#555",display:"block"}}>TAREHE YA KUZALIWA:</span>{dob || "06 OCT 1996"}</div>
            <div style={{marginTop:4}}><span style={{fontSize:10,color:"#555",display:"block"}}>JINSIA:</span>{gender.toUpperCase()}</div>
            <div style={{marginTop:6,fontStyle:"italic",fontFamily:"cursive",fontSize:18}}>Sahihi: {signature || fullName || "A. Kibanje"}</div>
          </div>
          {photo ? <img src={photo} alt="Picha ya mfano" style={{width:120,height:145,objectFit:"cover",border:"3px solid #397a7a",borderRadius:4}}/> : <div style={{width:120,height:145,display:"grid",placeItems:"center",background:"rgba(255,255,255,.9)",border:"2px solid #397a7a",borderRadius:4}}><ImagePlus size={28}/></div>}
        </div>
        <div style={{textAlign:"center",fontWeight:1000,color:"#9c2525",fontSize:9,marginTop:10}}>DEMO ONLY — NOT VALID FOR OFFICIAL IDENTIFICATION</div>
      </div>

      <button type="button" className="button button--green" style={{marginTop:18,width:"100%"}} onClick={downloadCard}><Download size={18}/> PAKUA KITAMBULISHO CHA DEMO</button>
      <p style={{fontSize:12,opacity:.75,marginTop:10}}>Picha na taarifa hazitumwi kwenye seva; hutumika kwenye kifaa chako kutengeneza kadi ya mfano.</p>
    </section>
  </main>;
}
