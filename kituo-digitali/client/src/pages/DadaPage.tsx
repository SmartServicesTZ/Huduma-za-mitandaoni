import { useState } from "react";
import { ArrowLeft, BadgeCheck, ClipboardList, UserRound, Hash, CalendarDays } from "lucide-react";
import { useLocation } from "wouter";

export default function NidaTemplatePage() {
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nida, setNida] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const cleanNida = nida.replace(/\\D/g, "").slice(0, 20);
  const complete = firstName.trim() && lastName.trim() && cleanNida.length === 20 && gender && birthDate;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    setShowPreview(true);
  }

  const field: React.CSSProperties = { display: "grid", gap: 8, fontSize: 13, fontWeight: 750, color: "#26364b" };
  const input: React.CSSProperties = { width: "100%", minHeight: 48, border: "1px solid #d8e1ec", borderRadius: 12, padding: "12px 14px", background: "#fff", color: "#172033", fontSize: 15, outlineColor: "#2563eb", boxSizing: "border-box" };
  const panel: React.CSSProperties = { background: "#fff", border: "1px solid #e4eaf2", borderRadius: 18, padding: 20, marginBottom: 16, boxShadow: "0 8px 24px rgba(15,23,42,.045)" };
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 16 };
  const heading: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, margin: "0 0 16px", fontSize: 17, fontWeight: 850, color: "#172b4d" };

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "18px 14px 40px", color: "#172033" }}>
      <button type="button" onClick={() => navigate("/services")} className="button button--secondary" style={{ marginBottom: 18, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <ArrowLeft size={16} /> Rudi kwenye huduma
      </button>

      <header style={{ borderRadius: 22, padding: "24px 22px", marginBottom: 18, color: "#fff", background: "linear-gradient(120deg,#123c70,#2563eb 62%,#4f46e5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 850, letterSpacing: 1.4, opacity: .9 }}><ClipboardList size={18}/> FOMU YA TAARIFA</div>
        <h1 style={{ margin: "10px 0 6px", fontSize: "clamp(25px,5vw,34px)", letterSpacing: "-.7px" }}>NIDA SOFT COPY</h1>
        <p style={{ margin: 0, lineHeight: 1.6, maxWidth: 600, color: "#e5efff", fontSize: 14 }}>Jaza taarifa zako kwa usahihi. Chagua jinsia kwa kubonyeza M au F; sehemu zenye alama * zinahitajika.</p>
      </header>

      <form onSubmit={submit}>
        <section style={panel}>
          <h2 style={heading}><UserRound size={19} color="#2563eb"/> Taarifa za majina</h2>
          <div style={grid}>
            <label style={field}>Jina la kwanza *<input style={input} value={firstName} onChange={e=>{setFirstName(e.target.value);setShowPreview(false)}} placeholder="Andika jina la kwanza" required /></label>
            <label style={field}>Jina la kati<input style={input} value={middleName} onChange={e=>{setMiddleName(e.target.value);setShowPreview(false)}} placeholder="Andika jina la kati (si lazima)" /></label>
            <label style={field}>Jina la mwisho / ukoo *<input style={input} value={lastName} onChange={e=>{setLastName(e.target.value);setShowPreview(false)}} placeholder="Andika jina la ukoo" required /></label>
          </div>
        </section>

        <section style={panel}>
          <h2 style={heading}><Hash size={19} color="#2563eb"/> Taarifa za kitambulisho</h2>
          <div style={grid}>
            <label style={field}>Namba ya NIDA (NIN) *<input style={input} inputMode="numeric" value={cleanNida} onChange={e=>{setNida(e.target.value.replace(/\\D/g,"").slice(0,20));setShowPreview(false)}} placeholder="Weka tarakimu 20" maxLength={20} required aria-describedby="nin-count" /><span id="nin-count" style={{fontSize:12,color:cleanNida.length===20?"#15803d":"#64748b"}}>{cleanNida.length}/20 tarakimu</span></label>
            <label style={field}>Tarehe ya kuzaliwa *<input style={input} type="date" value={birthDate} onChange={e=>{setBirthDate(e.target.value);setShowPreview(false)}} required /></label>
            <label style={field}>Namba ya simu<input style={input} type="tel" inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Mfano: 07XXXXXXXX" /></label>
          </div>
          <div style={{marginTop:18}}>
            <div style={{fontSize:13,fontWeight:750,marginBottom:10,color:"#26364b"}}>Jinsia *</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
              {(["M","F"] as const).map(value=><button key={value} type="button" onClick={()=>{setGender(value);setShowPreview(false)}} aria-pressed={gender===value} style={{minHeight:58,borderRadius:13,border:gender===value?"2px solid #2563eb":"1px solid #d8e1ec",background:gender===value?"#eff6ff":"#fff",color:gender===value?"#1d4ed8":"#334155",fontSize:15,fontWeight:850,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:9}}><span style={{width:25,height:25,borderRadius:8,display:"grid",placeItems:"center",background:gender===value?"#2563eb":"#eef2f7",color:gender===value?"#fff":"#475569"}}>{value}</span>{value==="M"?"ME":"KE"}</button>)}
            </div>
          </div>
        </section>

        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          <button className="button button--green" type="submit" disabled={!complete} style={{minHeight:48,padding:"0 22px",borderRadius:12,display:"inline-flex",alignItems:"center",gap:9,opacity:complete?1:.5}}><BadgeCheck size={17}/> Hakiki taarifa</button>
          <button className="button button--secondary" type="reset" onClick={()=>{setFirstName("");setMiddleName("");setLastName("");setNida("");setGender("");setBirthDate("");setPhone("");setShowPreview(false)}} style={{minHeight:48,borderRadius:12}}>Futa taarifa</button>
        </div>
      </form>

      {showPreview && <section style={{...panel,marginTop:18,borderColor:"#bbf7d0",background:"#f0fdf4"}} aria-live="polite">
        <h2 style={{...heading,color:"#166534"}}><BadgeCheck size={19}/> Taarifa zimehakikiwa</h2>
        <div style={grid}>
          <div><small style={{color:"#64748b"}}>Majina kamili</small><div style={{fontWeight:800}}>{[firstName,middleName,lastName].filter(Boolean).join(" ")}</div></div>
          <div><small style={{color:"#64748b"}}>NIN</small><div style={{fontWeight:800,overflowWrap:"anywhere"}}>{cleanNida}</div></div>
          <div><small style={{color:"#64748b"}}>Jinsia</small><div style={{fontWeight:800}}>{gender==="M"?"ME":"KE"}</div></div>
          <div><small style={{color:"#64748b"}}>Tarehe ya kuzaliwa</small><div style={{fontWeight:800}}>{birthDate}</div></div>
          {phone && <div><small style={{color:"#64748b"}}>Simu</small><div style={{fontWeight:800}}>{phone}</div></div>}
        </div>
      </section>}

      <p style={{fontSize:12,lineHeight:1.6,color:"#64748b",marginTop:18}}>Faragha: taarifa unazoandika zinatumika kuonyesha uhakiki kwenye ukurasa huu pekee. Fomu hii haitumi wala kuhifadhi taarifa kwenye seva.</p>
    </main>
  );
}
