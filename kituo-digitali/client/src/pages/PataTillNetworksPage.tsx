import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { createServiceApplication, uploadServiceDocument, subscribeUserServiceApplications, type ServiceApplication } from "@/lib/firebase";
import halotelLogo from "../../../Halotel.png";
import airtelLogo from "../../../Airtel.png";
import vodacomLogo from "../../../Vodacom.png";

type Network = "HALOTEL" | "AIRTEL" | "VODACOM";
const price: Record<Network, string> = { HALOTEL: "BURE", AIRTEL: "TSh 5,000", VODACOM: "TSh 40,000" };
const networkDetails: Record<Network, string[]> = {
  HALOTEL: ["Laini ya Halotel iwe na float/salio la angalau TSh 100,000.", "Mteja asiwe na Lipa Namba tayari.", "TIN namba inahitajika.", "Pakia picha ya kitambulisho cha taifa, mpiga kura au leseni ya udereva.", "Asiye na kitambulisho cha taifa aweke namba ya NIDA."],
  AIRTEL: ["Lazima uwe na laini ya Airtel.", "Namba ya NIDA inahitajika.", "Huduma hii inahitaji malipo ya TSh 5,000 kabla ya kukamilishwa.", "Baada ya kutuma ombi, wasiliana na Admin kwa OTP."],
  VODACOM: ["Usisajili laini kabla ya kupata maelekezo.", "Mteja awe na namba ya NIDA.", "Hakikisha una scanner au Famoco yenye scanner.", "Malipo ya TSh 40,000 yafanyike kwanza; kisha utapewa user ya kuwasha Till.", "Taarifa nyingine zitakamilishwa na Admin."],
};
const logos: Record<Network, string> = { HALOTEL: halotelLogo, AIRTEL: airtelLogo, VODACOM: vodacomLogo };
const textInput: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: "1px solid #334155", background: "#0b1220", color: "#f8fafc", fontSize: 15 };
const labelStyle: React.CSSProperties = { display: "grid", gap: 7, color: "#dbeafe", fontWeight: 650, fontSize: 13 };
const panelStyle: React.CSSProperties = { border: "1px solid #26364e", borderRadius: 18, padding: 18, background: "linear-gradient(145deg,#121d30,#0c1423)", minWidth: 0 };
function newId() { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `till-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function dateLabel(value: unknown) { const date = value ? new Date(String(value)) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("sw-TZ") : "—"; }

export default function PataTillNetworksPage() {
  const { firebaseUser } = useAuth();
  const [, navigate] = useLocation();
  const [network, setNetwork] = useState<Network | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [identityFile, setIdentityFile] = useState<File | null>(null);
  const [businessFile, setBusinessFile] = useState<File | null>(null);
  const [floatConfirmed, setFloatConfirmed] = useState(false);
  const [paidConfirmed, setPaidConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  const [reference, setReference] = useState("");
  const [applications, setApplications] = useState<ServiceApplication[]>([]);
  const applicationId = useMemo(() => newId(), [network]);
  useEffect(() => {
    if (!firebaseUser?.uid) { setApplications([]); return; }
    return subscribeUserServiceApplications(firebaseUser.uid, rows => setApplications(rows.filter(row => row.serviceSlug === "pata-till-mitandao-yote")));
  }, [firebaseUser?.uid]);
  const set = (key: string, value: string) => setValues(current => ({ ...current, [key]: value }));
  const resetForm = () => { setValues({}); setIdentityFile(null); setBusinessFile(null); setFloatConfirmed(false); setPaidConfirmed(false); setReference(""); };
  const upload = async (field: string, file: File | null) => {
    if (!file || !firebaseUser?.uid) return "";
    setUploading(field);
    try { return await uploadServiceDocument(firebaseUser.uid, applicationId, field, file, 5, ["image/jpeg", "image/png", "image/webp", "application/pdf"]); }
    finally { setUploading(""); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!firebaseUser?.uid || !network) { toast.error("Ingia kwanza kisha chagua mtandao."); return; }
    const phone = String(values.tillPhone ?? values.airtelPhone ?? "").replace(/\s/g, "");
    if (network === "HALOTEL") {
      if (!values.fullName?.trim() || !/^0[67]\d{8}$/.test(values.tillPhone ?? "") || !/^0[67]\d{8}$/.test(values.contactPhone ?? "") || !/^\d{3}-\d{3}-\d{3}$/.test(values.tinNumber ?? "") || !values.idType || !values.idNumber?.trim()) { toast.error("Jaza taarifa zote za lazima na hakiki muundo wa namba."); return; }
      if (!identityFile) { toast.error("Pakia picha ya kitambulisho kinachokubalika."); return; }
      if (!floatConfirmed) { toast.error("Thibitisha kwanza kuwa float ya TSh 100,000 ipo kwenye laini."); return; }
    }
    if (network === "AIRTEL" && (!/^0[67]\d{8}$/.test(values.airtelPhone ?? "") || !/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(values.nidaNumber ?? ""))) { toast.error("Weka namba ya Airtel na NIDA kwa muundo sahihi."); return; }
    if (network === "VODACOM" && !/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(values.nidaNumber ?? "")) { toast.error("Namba ya NIDA inahitajika kwa muundo sahihi."); return; }
    if (network !== "HALOTEL" && !paidConfirmed) { toast.error("Thibitisha kuwa uko tayari kufanya malipo kabla ya huduma kukamilishwa."); return; }
    setBusy(true);
    try {
      const identityPath = identityFile ? await upload("identityDocument", identityFile) : "";
      const businessPath = businessFile ? await upload("businessEvidence", businessFile) : "";
      const payload = {
        network, serviceType: "TILL / UWAKALA", price: price[network], ...values,
        identityDocument: identityPath, businessEvidence: businessPath,
        floatConfirmed, paidConfirmed, otpRequired: network === "AIRTEL",
        adminInstructions: network === "AIRTEL" ? "Mteja anahitaji OTP; wasiliana naye kupitia WhatsApp." : network === "VODACOM" ? "Thibitisha malipo kabla ya kumpa user ya kuwasha Till." : "Hakiki float ya TSh 100,000, TIN na nyaraka.",
        status: "PENDING",
      };
      const result = await createServiceApplication(applicationId, "pata-till-mitandao-yote", payload);
      setReference(String(result.reference ?? result.applicationId ?? applicationId));
      toast.success("Ombi limetumwa kwa Admin.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Imeshindikana kutuma ombi. Jaribu tena."); }
    finally { setBusy(false); }
  };
  return <main className="portal-main" style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 110px", color: "#f8fafc" }}>
    <button onClick={() => network ? (setNetwork(null), resetForm()) : navigate("/")} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: 0, background: "transparent", color: "#bfdbfe", padding: "8px 0", cursor: "pointer", marginBottom: 14 }}><ArrowLeft size={18}/> {network ? "Rudi kwenye mitandao" : "Rudi Dashboard"}</button>
    <header style={{ ...panelStyle, padding: 24, marginBottom: 20, background: "radial-gradient(circle at top right,#1d4ed855,transparent 45%),linear-gradient(135deg,#111c32,#0b1220)" }}>
      <div style={{ color: "#93c5fd", fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>SMARTSERVICESTZ · HUDUMA ZA WAKALA</div>
      <h1 style={{ fontSize: "clamp(25px,4vw,38px)", margin: "9px 0", lineHeight: 1.15 }}>PATA TILL MITANDAO YOTE</h1>
      <p style={{ color: "#b6c4d8", margin: 0, lineHeight: 1.6 }}>Chagua mtandao, soma vigezo na tuma ombi lako. Maombi yako yataonekana kwa Admin kwa ajili ya uhakiki na hatua zinazofuata.</p>
    </header>
    {!network ? <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,250px),1fr))", gap: 14 }}>
      {(["HALOTEL","AIRTEL","VODACOM"] as Network[]).map(item => <button key={item} onClick={() => { setNetwork(item); resetForm(); }} style={{ ...panelStyle, textAlign: "left", cursor: "pointer", color: "white", display: "flex", flexDirection: "column", gap: 16, transition: "transform .2s,border-color .2s" }}>
        <div style={{ height: 100, display: "grid", placeItems: "center", background: "#fff", borderRadius: 14, padding: 10 }}><img src={logos[item]} alt={item + " logo"} style={{ maxWidth: "80%", maxHeight: 78, objectFit: "contain" }}/></div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><strong style={{ fontSize: 19 }}>{item}</strong><span style={{ fontWeight: 850, color: item === "HALOTEL" ? "#86efac" : "#fcd34d" }}>{price[item]}</span></div>
        <span style={{ color: "#b6c4d8", fontSize: 13 }}>Angalia vigezo na tuma ombi <span aria-hidden="true">→</span></span>
      </button>)}
    </section> : <section style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}><img src={logos[network]} alt={network} style={{ width: 74, height: 54, objectFit: "contain", background: "white", borderRadius: 10, padding: 5 }}/><div><h2 style={{ margin: 0 }}>Tuma Maombi ya Till (Uwakala)</h2><strong style={{ color: network === "HALOTEL" ? "#86efac" : "#fcd34d" }}>{network} · {price[network]}</strong></div></div>
      {network === "HALOTEL" && <div role="alert" style={{ background: "#422006", color: "#fde68a", border: "1px solid #f59e0b", padding: 14, borderRadius: 12, marginBottom: 16, lineHeight: 1.55 }}>⚠️ <b>Tahadhari:</b> Bila kuwa na float ya TSh 100,000 kwenye laini ya mteja, ombi la Till linaweza kukataliwa (REJECTED).</div>}
      <div style={{ background: "#101d30", borderRadius: 12, padding: 14, marginBottom: 18 }}><b>Vigezo vya {network}</b><ul style={{ marginBottom: 0, paddingLeft: 20, color: "#d1dced", lineHeight: 1.8 }}>{networkDetails[network].map(item => <li key={item}>{item}</li>)}</ul></div>
      <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 14 }}>
        {network === "HALOTEL" && <>
          <label style={labelStyle}>Majina kamili ya mteja *<input style={textInput} value={values.fullName ?? ""} onChange={e=>set("fullName",e.target.value)} required placeholder="Majina kama yalivyo kwenye kitambulisho"/></label>
          <label style={labelStyle}>Namba ya simu ya Till *<input style={textInput} value={values.tillPhone ?? ""} onChange={e=>set("tillPhone",e.target.value)} required inputMode="numeric" maxLength={10} placeholder="06XXXXXXXX au 07XXXXXXXX"/><small style={{color:"#94a3b8"}}>Lazima ianze na 06 au 07, namba 10 tu.</small></label>
          <label style={labelStyle}>Namba ya simu ya mawasiliano *<input style={textInput} value={values.contactPhone ?? ""} onChange={e=>set("contactPhone",e.target.value)} required inputMode="numeric" maxLength={10} placeholder="06XXXXXXXX au 07XXXXXXXX"/><small style={{color:"#94a3b8"}}>Lazima ianze na 06 au 07.</small></label>
          <label style={labelStyle}>Namba ya TIN *<input style={textInput} value={values.tinNumber ?? ""} onChange={e=>set("tinNumber",e.target.value)} required placeholder="123-123-123" pattern="[0-9]{3}-[0-9]{3}-[0-9]{3}"/></label>
          <label style={labelStyle}>Aina ya kitambulisho *<select style={textInput} value={values.idType ?? ""} onChange={e=>set("idType",e.target.value)} required><option value="">Chagua aina ya kitambulisho</option><option>NIDA</option><option>Kitambulisho cha mpiga kura</option><option>Leseni ya udereva</option></select></label>
          <label style={labelStyle}>Namba ya kitambulisho *<input style={textInput} value={values.idNumber ?? ""} onChange={e=>set("idNumber",e.target.value)} required placeholder="20000909-59418-00001-22"/></label>
          <label style={labelStyle}>Jina la biashara (hiari)<input style={textInput} value={values.businessName ?? ""} onChange={e=>set("businessName",e.target.value)} placeholder="Kwa wateja wenye vigezo tu"/><small style={{color:"#94a3b8"}}>Hii ni kwa wateja walio na vigezo tu.</small></label>
          <label style={{...labelStyle,gridColumn:"1 / -1"}}>VIAMBATANISHO — picha ya kitambulisho *<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setIdentityFile(e.target.files?.[0] ?? null)} required style={{...textInput,background:"#7c2d12",borderColor:"#ea580c"}}/><small style={{color:"#cbd5e1"}}>JPG, PNG, WebP au PDF; kiwango cha juu MB 5.</small></label>
          <label style={{...labelStyle,gridColumn:"1 / -1",background:"#2a1b0a",padding:12,borderRadius:12,border:"1px solid #b45309"}}>Msisitizo kuhusu jina la biashara: Sehemu hii si lazima na ni kwa wateja wenye vigezo vya kutosha tu. Bila vigezo vya kutosha ombi linaweza kukataliwa. Kwa maelezo zaidi, wasiliana na wakala mkuu.</label>
          <label style={{display:"flex",gap:10,alignItems:"flex-start",gridColumn:"1 / -1",lineHeight:1.5}}><input type="checkbox" checked={floatConfirmed} onChange={e=>setFloatConfirmed(e.target.checked)} required style={{marginTop:4}}/><span>Thibitisha: mteja ameweka float ya TSh 100,000 kwenye laini yake. Nimehakiki float ya 100,000 imewekwa kwenye laini ya mteja.</span></label>
        </>}
        {network === "AIRTEL" && <>
          <label style={labelStyle}>Namba ya Airtel *<input style={textInput} value={values.airtelPhone ?? ""} onChange={e=>set("airtelPhone",e.target.value)} required inputMode="numeric" maxLength={10} placeholder="06XXXXXXXX au 07XXXXXXXX"/></label>
          <label style={labelStyle}>Namba ya NIDA *<input style={textInput} value={values.nidaNumber ?? ""} onChange={e=>set("nidaNumber",e.target.value)} required placeholder="20000909-59418-00001-22" pattern="[0-9]{8}-[0-9]{5}-[0-9]{5}-[0-9]{2}"/></label>
          <div style={{gridColumn:"1 / -1",background:"#422006",padding:14,borderRadius:12,color:"#fde68a"}}>⚠️ Huduma hii inahitaji malipo ya TSh 5,000 kabla ya kukamilishwa. Baada ya kutuma ombi, gusa kitufe cha WhatsApp ili kuwasiliana na Admin kwa ajili ya OTP.</div>
        </>}
        {network === "VODACOM" && <>
          <label style={labelStyle}>Namba ya NIDA *<input style={textInput} value={values.nidaNumber ?? ""} onChange={e=>set("nidaNumber",e.target.value)} required placeholder="20000909-59418-00001-22" pattern="[0-9]{8}-[0-9]{5}-[0-9]{5}-[0-9]{2}"/></label>
          <label style={labelStyle}>Namba ya mawasiliano *<input style={textInput} value={values.contactPhone ?? ""} onChange={e=>set("contactPhone",e.target.value)} required inputMode="tel" placeholder="06XXXXXXXX"/></label>
          <label style={{...labelStyle,gridColumn:"1 / -1"}}>Picha ya kitambulisho (hiari)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setIdentityFile(e.target.files?.[0] ?? null)} style={textInput}/></label>
          <div style={{gridColumn:"1 / -1",background:"#422006",padding:14,borderRadius:12,color:"#fde68a"}}>⚠️ Usisajili laini kwanza. Hakikisha una scanner au Famoco yenye scanner na uko tayari kulipa TSh 40,000 kabla ya kupewa user ya kuwasha Till.</div>
        </>}
        {network !== "HALOTEL" && <label style={{display:"flex",gap:10,alignItems:"flex-start",gridColumn:"1 / -1"}}><input type="checkbox" checked={paidConfirmed} onChange={e=>setPaidConfirmed(e.target.checked)} required/><span>Nimeelewa kuwa huduma hii inahitaji malipo ya {price[network]} kabla ya kukamilishwa.</span></label>}
        <div style={{gridColumn:"1 / -1",display:"flex",gap:10,flexWrap:"wrap",marginTop:4}}>
          <button type="submit" disabled={busy || !!uploading} style={{border:0,borderRadius:12,padding:"14px 20px",fontWeight:850,color:"#fff",background:busy?"#475569":"linear-gradient(110deg,#ea580c,#dc2626)",cursor:busy?"wait":"pointer",flex:"1 1 230px"}}>{busy ? (uploading ? "Inapakia kiambatisho..." : "Inatuma ombi...") : "✓ Thibitisha & Tuma Maombi"}</button>
          <button type="button" onClick={()=>navigate("/")} style={{border:"1px solid #475569",borderRadius:12,padding:"14px 20px",fontWeight:750,color:"#e2e8f0",background:"#172033",cursor:"pointer"}}>Rudi Dashboard</button>
        </div>
      </form>
      {reference && <div style={{marginTop:18,padding:16,borderRadius:14,border:"1px solid #16a34a",background:"#052e1a"}}><CheckCircle2 size={22} style={{verticalAlign:"middle",marginRight:8}}/><b>Ombi limetumwa kwa Admin.</b><p style={{marginBottom:8}}>Rejea: {reference}. Hifadhi rejea hii kwa ufuatiliaji.</p>{network==="AIRTEL" && <a href="https://wa.me/255698232313?text=Habari%20Admin%2C%20nimetuma%20ombi%20la%20Airtel%20Till%20na%20nahitaji%20OTP.%20Rejea%3A%20"+encodeURIComponent(reference)} target="_blank" rel="noreferrer" style={{display:"inline-block",background:"#16a34a",color:"white",padding:"11px 15px",borderRadius:10,textDecoration:"none",fontWeight:800}}>WASILIANA NA ADMIN KUPATA OTP</a>}</div>}
    </section>}
    <section style={{marginTop:26,...panelStyle}}>
      <h2 style={{marginTop:0,display:"flex",alignItems:"center",gap:9}}><Clock3 size={20}/> Maombi Yangu</h2>
      {applications.length === 0 ? <p style={{color:"#94a3b8"}}>Bado hujatuma maombi ya Till kupitia kipengele hiki.</p> : <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:620}}><thead><tr>{["Mteja","Mtandao","Till / Lipa","Hali","Malipo","Tarehe"].map(x=><th key={x} style={{textAlign:"left",padding:10,borderBottom:"1px solid #334155"}}>{x}</th>)}</tr></thead><tbody>{applications.map(app=><tr key={app.id}>{[String(app.fullName??app.airtelPhone??app.nidaNumber??"—"),String(app.network??"—"),String(app.tillPhone??app.airtelPhone??"—"),String(app.status??"PENDING"),String(app.price??"—"),dateLabel(app.submittedAt??app.createdAt)].map((v,i)=><td key={i} style={{padding:10,borderBottom:"1px solid #243247",color:i===3&&v==="APPROVED"?"#86efac":"#dbeafe"}}>{v}</td>)}</tr>)}</tbody></table></div>}
      <p style={{color:"#94a3b8",fontSize:12,marginBottom:0}}>Maombi yote yanaonekana kwa Admin kwenye paneli ya maombi ya huduma. Mkataba/nyaraka za ndani ya Admin hazionyeshwi kwa watumiaji.</p>
    </section>
  </main>;
}
