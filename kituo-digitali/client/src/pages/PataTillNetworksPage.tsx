import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Clock3 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { createServiceApplication, updateServiceApplication, uploadServiceDocument, subscribeUserServiceApplications, createTillFimipayOrder, checkTillFimipayOrder, type ServiceApplication } from "@/lib/firebase";
import { formatNida } from "../../../shared/serviceForms";
import halotelLogo from "../../public/halotel-logo.png";
import airtelLogo from "../../public/airtel-logo.png";
import vodacomLogo from "../../public/vodacom-logo.png";

type Network = "HALOTEL" | "AIRTEL" | "VODACOM";
const price: Record<Network, string> = { HALOTEL: "BURE", AIRTEL: "TSh 200", VODACOM: "TSh 200" };
const priceBadge: Record<Network, { color: string; background: string; border: string }> = {
  HALOTEL: { color: "#166534", background: "#dcfce7", border: "#86efac" },
  AIRTEL: { color: "#1d4ed8", background: "#dbeafe", border: "#93c5fd" },
  VODACOM: { color: "#6d28d9", background: "#ede9fe", border: "#c4b5fd" },
};
const networkDetails: Record<Network, string[]> = {
  HALOTEL: ["Laini ya Halotel iwe na float/salio la angalau TSh 100,000.", "Mteja asiwe na Lipa Namba tayari.", "TIN namba inahitajika.", "Pakia picha ya kitambulisho cha taifa, mpiga kura au leseni ya udereva.", "Asiye na kitambulisho cha taifa aweke namba ya NIDA."],
  AIRTEL: ["Lazima uwe na laini ya Airtel.", "Namba ya NIDA inahitajika.", "Huduma hii inahitaji malipo ya majaribio ya TSh 200 kabla ya kukamilishwa.", "Baada ya kutuma ombi, wasiliana na Admin kwa OTP."],
  VODACOM: ["Usisajili laini kabla ya kupata maelekezo.", "Mteja awe na namba ya NIDA.", "Hakikisha una scanner au Famoco yenye scanner.", "Malipo ya majaribio ya TSh 200 yafanyike kwanza; kisha utapewa user ya kuwasha Till.", "Taarifa nyingine zitakamilishwa na Admin."],
};
const logos: Record<Network, string> = { HALOTEL: halotelLogo, AIRTEL: airtelLogo, VODACOM: vodacomLogo };
const themes: Record<Network, { accent: string; soft: string; border: string; text: string; gradient: string; warning: string }> = {
  HALOTEL: { accent: "#facc15", soft: "#422006", border: "#eab308", text: "#fef08a", gradient: "linear-gradient(120deg,#854d0e,#ca8a04)", warning: "#422006" },
  AIRTEL: { accent: "#ef4444", soft: "#450a0a", border: "#dc2626", text: "#fecaca", gradient: "linear-gradient(120deg,#991b1b,#ef4444)", warning: "#450a0a" },
  VODACOM: { accent: "#f43f5e", soft: "#4c0519", border: "#be123c", text: "#fecdd3", gradient: "linear-gradient(120deg,#881337,#be123c)", warning: "#4c0519" },
};
const textInput: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: "1px solid #334155", background: "#0b1220", color: "#f8fafc", fontSize: 15 };
const panelStyle: CSSProperties = { border: "1px solid #26364e", borderRadius: 18, padding: 18, background: "linear-gradient(145deg,#121d30,#0c1423)", minWidth: 0 };
function newId() { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `till-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function dateLabel(value: unknown) { const date = value ? new Date(String(value)) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("sw-TZ") : "—"; }

export default function PataTillNetworksPage() {
  const { firebaseUser, user: accountUser } = useAuth();
  const [, navigate] = useLocation();
  const [network, setNetwork] = useState<Network | null>(null);
  const activeTheme = network ? themes[network] : themes.HALOTEL;
  const [values, setValues] = useState<Record<string, string>>({});
  const [identityFile, setIdentityFile] = useState<File | null>(null);
  const [floatConfirmed, setFloatConfirmed] = useState(false);
  const [noExistingLipa, setNoExistingLipa] = useState(false);
  const [paidConfirmed, setPaidConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  const [reference, setReference] = useState("");
  const [requestNonce, setRequestNonce] = useState(0);
  const [applications, setApplications] = useState<ServiceApplication[]>([]);
  const [paymentApplication, setPaymentApplication] = useState<ServiceApplication | null>(null);
  const [submittedPaymentApplication, setSubmittedPaymentApplication] = useState<ServiceApplication | null>(null);
  const [paymentOrderId, setPaymentOrderId] = useState("");
  const [paymentPhone, setPaymentPhone] = useState(String(accountUser?.phone ?? ""));
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState("");
  const [editingApplicationId, setEditingApplicationId] = useState<string | null>(null);
  const applicationId = useMemo(() => editingApplicationId ?? newId(), [network, requestNonce, editingApplicationId]);
  useEffect(() => {
    if (!firebaseUser?.uid) { setApplications([]); return; }
    return subscribeUserServiceApplications(firebaseUser.uid, rows => setApplications(rows.filter(row => row.serviceSlug === "pata-till-mitandao-yote")));
  }, [firebaseUser?.uid]);
  const set = (key: string, value: string) => setValues(current => ({ ...current, [key]: value }));
  const resetForm = () => { setEditingApplicationId(null); setValues({}); setIdentityFile(null); setFloatConfirmed(false); setNoExistingLipa(false); setPaidConfirmed(false); setReference(""); setSubmittedPaymentApplication(null); setPaymentOrderId(""); setPaymentStatusMessage(""); setRequestNonce((value) => value + 1); };
  const editRejectedApplication = (app: ServiceApplication) => {
    const data = app.applicantData ?? {};
    const nextNetwork = String(data.network ?? "").toUpperCase() as Network;
    if (!["HALOTEL", "AIRTEL", "VODACOM"].includes(nextNetwork)) { toast.error("Mtandao wa ombi haujatambulika."); return; }
    setNetwork(nextNetwork);
    setEditingApplicationId(app.applicationId || app.id);
    setValues(Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => [key, String(value)])));
    setIdentityFile(null);
    setFloatConfirmed(data.floatConfirmed === true || data.floatConfirmed === "true");
    setNoExistingLipa(data.noExistingLipa === true || data.noExistingLipa === "true");
    setPaidConfirmed(true);
    setReference("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info("Rekebisha taarifa za ombi lililokataliwa kisha litume tena.");
  };
  const upload = async (field: string, file: File | null) => {
    if (!file || !firebaseUser?.uid) return "";
    setUploading(field);
    try { return await uploadServiceDocument(firebaseUser.uid, applicationId, field, file, 5, ["image/jpeg", "image/png", "image/webp", "application/pdf"]); }
    finally { setUploading(""); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!firebaseUser?.uid || !network) { toast.error("Ingia kwanza kisha chagua mtandao."); return; }
    const phone = String(values.tillPhone ?? values.airtelPhone ?? "").replace(/\s/g, "");
    if (network === "HALOTEL") {
      if (!values.fullName?.trim() || !/^0[67]\d{8}$/.test(values.tillPhone ?? "") || !/^0[67]\d{8}$/.test(values.contactPhone ?? "") || !/^\d{3}-\d{3}-\d{3}$/.test(values.tinNumber ?? "") || !values.idType || !values.idNumber?.trim()) { toast.error("Jaza taarifa zote za lazima na hakiki muundo wa namba."); return; }
      if (values.idType === "NIDA" && !/^\d{20}$/.test(String(values.idNumber).replace(/\D/g, ""))) { toast.error("Namba ya NIDA lazima iwe na tarakimu 20."); return; }
      if (!identityFile) { toast.error("Pakia picha ya kitambulisho kinachokubalika."); return; }
      if (!floatConfirmed) { toast.error("Thibitisha kwanza kuwa float ya TSh 100,000 ipo kwenye laini."); return; }
      if (!noExistingLipa) { toast.error("Thibitisha kuwa mteja hana Lipa Namba tayari."); return; }
    }
    if (network === "AIRTEL" && (!/^0[67]\d{8}$/.test(values.airtelPhone ?? "") || !/^\d{20}$/.test(String(values.nidaNumber ?? "").replace(/\D/g, "")))) { toast.error("Weka namba ya Airtel na NIDA yenye tarakimu 20."); return; }
    if (network === "VODACOM" && (!values.fullName?.trim() || !/^\d{20}$/.test(String(values.nidaNumber ?? "").replace(/\D/g, "")))) { toast.error("Namba ya NIDA lazima iwe na tarakimu 20."); return; }
    setBusy(true);
    try {
      const identityPath = identityFile ? await upload("identityDocument", identityFile) : String(values.identityDocument ?? "");
      const payload = {
        network, serviceType: "TILL / UWAKALA", price: price[network],
        ...(network === "AIRTEL" ? { airtelPhone: String(values.airtelPhone ?? "").trim(), nidaNumber: formatNida(values.nidaNumber ?? "") } : values),
        ...(network !== "AIRTEL" && values.nidaNumber ? { nidaNumber: formatNida(values.nidaNumber) } : {}),
        ...(values.idType === "NIDA" && values.idNumber ? { idNumber: formatNida(values.idNumber) } : {}),
        identityDocument: identityPath,
        floatConfirmed: String(floatConfirmed), noExistingLipa: String(noExistingLipa), paidConfirmed: String(paidConfirmed), otpRequired: String(network === "AIRTEL"),
        adminInstructions: network === "AIRTEL" ? "Hali ya awali: PENDING / HALIJAANZA KUSHUGHULIKIWA. Thibitisha malipo ya majaribio ya TSh 200 kwanza; mteja atawasiliana WhatsApp 0698232313. Baada ya uthibitisho, toa maelekezo ya OTP." : network === "VODACOM" ? "Hali ya awali: PENDING / HALIJAANZA KUSHUGHULIKIWA. Thibitisha malipo ya majaribio ya TSh 200 kabla ya kuanza kushughulikia au kumpa user ya kuwasha Till." : "Hakiki float ya TSh 100,000, TIN na nyaraka.",
        status: "PENDING",
      };
      const result = editingApplicationId
        ? await updateServiceApplication(editingApplicationId, payload)
        : await createServiceApplication(applicationId, "pata-till-mitandao-yote", payload);
      const savedReference = String(("reference" in result ? result.reference : result.applicationId) ?? applicationId);
      setReference(savedReference);
      if (!editingApplicationId) {
        const savedApplicationId = String("applicationId" in result ? result.applicationId : applicationId);
        const existingApplication = applications.find((app) => app.id === savedApplicationId || app.applicationId === savedApplicationId);
        setSubmittedPaymentApplication({
          id: savedApplicationId, applicationId: savedApplicationId, userId: firebaseUser.uid,
          serviceSlug: "pata-till-mitandao-yote", serviceName: "PATA TILL MITANDAO YOTE",
          applicantData: existingApplication?.applicantData ?? { ...payload, paymentStatus: network === "HALOTEL" ? "NOT_REQUIRED" : "UNPAID" },
          status: existingApplication?.status ?? result.status ?? (network === "HALOTEL" ? "PENDING" : "AWAITING_PAYMENT"),
        } as ServiceApplication);
      }
      setPaymentOrderId(""); setPaymentStatusMessage("");
      toast.success("TAARIFA ZIMEWASILISHWA", { description: editingApplicationId ? "Marekebisho yamehifadhiwa." : "Ombi lako limepokelewa. Linasubiri malipo na hatua za Admin." });
      setEditingApplicationId(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Imeshindikana kutuma ombi. Jaribu tena."); }
    finally { setBusy(false); }
  };
  const fieldStyle: CSSProperties = { width: "100%", boxSizing: "border-box", minHeight: 48, padding: "12px 14px", borderRadius: 10, border: "1px solid #d7dee8", background: "#fff", color: "#182230", fontSize: 15, outlineColor: activeTheme.accent };
  const labelStyle: CSSProperties = { display: "grid", gap: 8, color: "#263244", fontWeight: 700, fontSize: 13 };
  const cardStyle: CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18, boxShadow: "0 8px 28px rgba(15,23,42,.045)" };
  return <main className="portal-main" style={{ maxWidth: 1060, margin: "0 auto", padding: "22px 16px 110px", color: "#172033", ["--till-accent" as string]: activeTheme.accent }}>
    <button type="button" onClick={() => network ? (setNetwork(null), resetForm()) : navigate("/")} style={{ display: "inline-flex", alignItems: "center", gap: 9, border: "1px solid #d6deea", background: "#fff", color: "#243247", padding: "11px 15px", borderRadius: 10, cursor: "pointer", marginBottom: 18, fontSize: 14, fontWeight: 800, minHeight: 44 }}><ArrowLeft size={18}/> {network ? "RUDI KWENYE MITANDAO" : "RUDI DASHBOARD"}</button>
    <header style={{ ...cardStyle, position: "relative", overflow: "hidden", padding: "clamp(22px,4vw,36px)", marginBottom: 22, borderTop: `4px solid ${activeTheme.accent}`, background: "linear-gradient(135deg,#fff 0%,#f8fafc 100%)" }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.8, color: "#64748b" }}>SMARTSERVICESTZ <span style={{color:activeTheme.accent}}> / HUDUMA ZA WAKALA</span></div>
      <h1 style={{ fontSize: "clamp(27px,4.5vw,40px)", margin: "12px 0 10px", lineHeight: 1.12, letterSpacing: "-.8px", color: "#101827" }}>PATA TILL MITANDAO YOTE</h1>
      <p style={{ maxWidth: 720, color: "#596579", margin: 0, lineHeight: 1.75, fontSize: 15 }}>Chagua mtandao unaohitaji, kagua gharama na vigezo, kisha jaza fomu. Taarifa zako zitatumwa kwa Admin kwa ajili ya uhakiki.</p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:18 }}>
        <span style={{padding:"7px 10px",borderRadius:8,background:"#f1f5f9",color:"#475569",fontSize:12,fontWeight:750}}>✓ Fomu salama</span>
        <span style={{padding:"7px 10px",borderRadius:8,background:"#f1f5f9",color:"#475569",fontSize:12,fontWeight:750}}>✓ Ufuatiliaji wa ombi</span>
        <span style={{padding:"7px 10px",borderRadius:8,background:"#f1f5f9",color:"#475569",fontSize:12,fontWeight:750}}>✓ Usaidizi wa Admin</span>
      </div>
    </header>
    {!network ? <section>
      <div style={{marginBottom:13}}><h2 style={{fontSize:20,margin:"0 0 5px",color:"#172033"}}>Chagua mtandao</h2><p style={{margin:0,color:"#64748b",fontSize:14}}>Bei na masharti hutofautiana kulingana na mtandao.</p></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,245px),1fr))",gap:15}}>
        {(["HALOTEL","AIRTEL","VODACOM"] as Network[]).map(item => <button key={item} type="button" onClick={() => { setNetwork(item); resetForm(); }} style={{background:"#fff",border:`1px solid ${themes[item].border}`,borderRadius:16,padding:16,textAlign:"left",cursor:"pointer",color:"#172033",display:"flex",flexDirection:"column",gap:16,boxShadow:"0 7px 24px rgba(15,23,42,.055)",minHeight:220,transition:"transform .15s,box-shadow .15s"}}>
          <div style={{height:105,width:"100%",display:"grid",placeItems:"center",background:"#fff",border:"1px solid #edf0f5",borderRadius:11,padding:12,boxSizing:"border-box"}}><img src={logos[item]} alt={item+" logo"} style={{maxWidth:"80%",maxHeight:78,objectFit:"contain"}}/></div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,width:"100%"}}><strong style={{fontSize:17,letterSpacing:".2px"}}>{item}</strong><span style={{fontSize:14,fontWeight:900,color:priceBadge[item].color,background:priceBadge[item].background,border:`1px solid ${priceBadge[item].border}`,padding:"8px 10px",borderRadius:9}}>{price[item]}</span></div>
          <span style={{fontSize:13,color:"#64748b",fontWeight:650}}>Angalia vigezo na endelea <span style={{color:themes[item].accent}}>→</span></span>
        </button>)}
      </div>
    </section> : <section style={{...cardStyle,padding:"clamp(16px,3vw,28px)",borderTop:`4px solid ${activeTheme.accent}`}}>
      <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",paddingBottom:20,borderBottom:"1px solid #e9edf3",marginBottom:20}}>
        <div style={{width:92,height:68,display:"grid",placeItems:"center",background:"#fff",border:"1px solid #e5eaf1",borderRadius:12,padding:8,boxSizing:"border-box"}}><img src={logos[network]} alt={network+" logo"} style={{maxWidth:"100%",maxHeight:52,objectFit:"contain"}}/></div>
        <div style={{flex:"1 1 180px"}}><div style={{fontSize:11,fontWeight:900,letterSpacing:1.2,color:"#64748b"}}>FOMU YA MAOMBI</div><h2 style={{margin:"5px 0",fontSize:23,color:"#172033"}}>{network} Till / Uwakala</h2><span style={{display:"inline-block",fontSize:14,fontWeight:900,color:priceBadge[network].color,background:priceBadge[network].background,border:`1px solid ${priceBadge[network].border}`,padding:"7px 11px",borderRadius:8}}>{price[network]}</span></div>
      </div>
      <div style={{background:network==="HALOTEL"?"#fffbeb":"#fff7f8",border:`1px solid ${activeTheme.border}`,borderRadius:12,padding:16,marginBottom:22}}>
        <h3 style={{margin:"0 0 10px",fontSize:15,color:"#172033"}}>Kabla ya kuanza — vigezo vya {network}</h3>
        <ul style={{margin:0,paddingLeft:21,color:"#475569",lineHeight:1.8,fontSize:14}}>{networkDetails[network].map(item=><li key={item} style={{paddingLeft:3,marginBottom:3}}>{item}</li>)}</ul>
      </div>
      {reference ? <div role="status" aria-live="polite" style={{display:"grid",gap:12,padding:20,border:"1.5px solid #86efac",borderRadius:16,background:"#ecfdf3",color:"#14532d"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{display:"grid",placeItems:"center",width:42,height:42,borderRadius:"50%",background:"#16a34a",color:"#fff"}}><CheckCircle2 size={24}/></span><div><strong style={{fontSize:17}}>TAARIFA ZIMEWASILISHWA</strong><p style={{margin:"4px 0 0",fontSize:13}}>Ombi lako limepokelewa kikamilifu.</p></div></div>
        <p style={{margin:0,fontSize:13}}>Namba ya kumbukumbu: <strong>{reference}</strong>. Unaweza kufuatilia hali yake kwenye sehemu ya Maombi yangu hapa chini.</p>
        <p style={{margin:0,fontSize:13}}>Ombi litasubiri uthibitisho wa malipo na hatua za Admin kama zilivyoelekezwa.</p>
        {network !== "HALOTEL" && submittedPaymentApplication && String(submittedPaymentApplication.applicantData?.paymentStatus).toUpperCase() !== "PAID"
          ? <button type="button" onClick={() => { setPaymentApplication(submittedPaymentApplication); setPaymentPhone(String(accountUser?.phone ?? "")); setPaymentOrderId(""); setPaymentStatusMessage(""); }} style={{border:0,borderRadius:10,padding:"13px 18px",fontWeight:900,color:"#fff",background:activeTheme.gradient,cursor:"pointer",minHeight:48}}>FANYA MALIPO</button>
          : <button type="button" onClick={resetForm} style={{border:0,borderRadius:10,padding:"13px 18px",fontWeight:900,color:"#fff",background:activeTheme.gradient,cursor:"pointer",minHeight:48}}>TUMA OMBI JINGINE</button>}
      </div> : <form onSubmit={submit} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,260px),1fr))",gap:17}}>
        {network==="HALOTEL" && <>
          <label style={labelStyle}>Majina kamili ya mteja *<input style={fieldStyle} value={values.fullName??""} onChange={e=>set("fullName",e.target.value)} required placeholder="Majina kama yalivyo kwenye kitambulisho"/></label>
          <label style={labelStyle}>Namba ya simu ya Till *<input style={fieldStyle} value={values.tillPhone??""} onChange={e=>set("tillPhone",e.target.value)} required inputMode="numeric" maxLength={10} placeholder="06XXXXXXXX au 07XXXXXXXX"/><small style={{color:"#64748b",fontWeight:500}}>Namba 10, ianze na 06 au 07.</small></label>
          <label style={labelStyle}>Namba ya simu ya mawasiliano *<input style={fieldStyle} value={values.contactPhone??""} onChange={e=>set("contactPhone",e.target.value)} required inputMode="numeric" maxLength={10} placeholder="06XXXXXXXX au 07XXXXXXXX"/></label>
          <label style={labelStyle}>Namba ya TIN *<input style={fieldStyle} value={values.tinNumber??""} onChange={e=>set("tinNumber",e.target.value)} required placeholder="123-123-123" pattern="[0-9]{3}-[0-9]{3}-[0-9]{3}"/></label>
          <label style={labelStyle}>Aina ya kitambulisho *<select style={fieldStyle} value={values.idType??""} onChange={e=>set("idType",e.target.value)} required><option value="">Chagua aina ya kitambulisho</option><option>NIDA</option><option>Kitambulisho cha mpiga kura</option><option>Leseni ya udereva</option></select></label>
          <label style={labelStyle}>Namba ya kitambulisho *<input style={fieldStyle} value={values.idNumber??""} onChange={e=>set("idNumber",values.idType==="NIDA"?e.target.value.replace(/\D/g,"").slice(0,20):e.target.value)} required inputMode={values.idType==="NIDA"?"numeric":"text"} maxLength={values.idType==="NIDA"?20:undefined} placeholder={values.idType==="NIDA"?"Tarakimu 20 za NIDA":"Weka namba ya kitambulisho"}/>{values.idType==="NIDA"&&<small style={{color:"#64748b",fontWeight:500}}>Weka tarakimu 20 bila alama au nafasi.</small>}</label>
          <label style={labelStyle}>Jina la biashara (hiari)<input style={fieldStyle} value={values.businessName??""} onChange={e=>set("businessName",e.target.value)} placeholder="Jina la biashara"/><small style={{color:"#64748b",fontWeight:500}}>Jaza kama linahusika na ombi lako.</small></label>
          <label style={{...labelStyle,gridColumn:"1 / -1"}}>Picha ya kitambulisho *<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setIdentityFile(e.target.files?.[0]??null)} required style={{...fieldStyle,padding:9}}/><small style={{color:"#64748b",fontWeight:500}}>JPG, PNG, WebP au PDF; ukubwa usizidi MB 5.</small></label>
          <div style={{gridColumn:"1 / -1",padding:13,borderRadius:10,background:"#f8fafc",border:"1px solid #e2e8f0",color:"#475569",fontSize:13,lineHeight:1.65}}>Jina la biashara ni la hiari na linategemea vigezo vya mteja. Hakikisha taarifa zote zinafanana na nyaraka zako.</div>
          <label style={{display:"flex",gap:11,alignItems:"flex-start",gridColumn:"1 / -1",padding:14,border:"1px solid #e2e8f0",borderRadius:11,color:"#334155",lineHeight:1.6,fontSize:14}}><input type="checkbox" checked={noExistingLipa} onChange={e=>setNoExistingLipa(e.target.checked)} required style={{marginTop:4,accentColor:activeTheme.accent,width:17,height:17,flexShrink:0}}/><span>Thibitisha kuwa mteja hana Lipa Namba tayari.</span></label>
          <label style={{display:"flex",gap:11,alignItems:"flex-start",gridColumn:"1 / -1",padding:14,border:"1px solid #e2e8f0",borderRadius:11,color:"#334155",lineHeight:1.6,fontSize:14}}><input type="checkbox" checked={floatConfirmed} onChange={e=>setFloatConfirmed(e.target.checked)} required style={{marginTop:4,accentColor:activeTheme.accent,width:17,height:17,flexShrink:0}}/><span>Thibitisha kuwa umehakiki float ya angalau TSh 100,000 kwenye laini ya mteja.</span></label>
        </>}
        {network==="AIRTEL" && <>
          <label style={labelStyle}>Namba *<input style={fieldStyle} value={values.airtelPhone??""} onChange={e=>set("airtelPhone",e.target.value.replace(/\D/g,"").slice(0,10))} required inputMode="numeric" maxLength={10} placeholder="06XXXXXXXX au 07XXXXXXXX"/></label>
          <label style={labelStyle}>NIDA *<input style={fieldStyle} value={values.nidaNumber??""} onChange={e=>set("nidaNumber",e.target.value.replace(/\D/g,"").slice(0,20))} required inputMode="numeric" maxLength={20} placeholder="Tarakimu 20 za NIDA"/><small style={{color:"#64748b",fontWeight:500}}>Weka tarakimu 20 bila alama au nafasi.</small></label>
          <div style={{gridColumn:"1 / -1",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:11,padding:15,color:"#1e40af",fontSize:14,lineHeight:1.7}}>Ada ya majaribio ya huduma ni <b>TSh 200</b>. Baada ya kutuma ombi, gusa Fanya malipo ili uthibitishe kupitia FimiPay.</div>
        </>}
        {network==="VODACOM" && <>
          <label style={labelStyle}>Majina kamili ya mteja *<input style={fieldStyle} value={values.fullName??""} onChange={e=>set("fullName",e.target.value)} required placeholder="Majina kama yalivyo kwenye NIDA"/></label>
          <label style={labelStyle}>Namba ya NIDA *<input style={fieldStyle} value={values.nidaNumber??""} onChange={e=>set("nidaNumber",e.target.value.replace(/\D/g,"").slice(0,20))} required inputMode="numeric" maxLength={20} placeholder="Tarakimu 20 za NIDA"/><small style={{color:"#64748b",fontWeight:500}}>Weka tarakimu 20 bila alama au nafasi.</small></label>
          <label style={labelStyle}>Namba ya mawasiliano *<input style={fieldStyle} value={values.contactPhone??""} onChange={e=>set("contactPhone",e.target.value)} required inputMode="tel" placeholder="06XXXXXXXX au 07XXXXXXXX"/></label>
          <div style={{gridColumn:"1 / -1",background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:11,padding:15,color:"#5b21b6",fontSize:14,lineHeight:1.7}}>Usisajili laini kabla ya kupata maelekezo. Hakikisha una scanner au Famoco yenye scanner. Gharama ya majaribio ya huduma ni <b>TSh 200</b>.</div>
        </>}
        {network!=="HALOTEL" && <label style={{display:"flex",gap:11,alignItems:"flex-start",gridColumn:"1 / -1",padding:14,border:"1px solid #e2e8f0",borderRadius:11,color:"#334155",lineHeight:1.6,fontSize:14}}><input type="checkbox" checked={paidConfirmed} onChange={e=>setPaidConfirmed(e.target.checked)} required style={{marginTop:4,accentColor:activeTheme.accent,width:17,height:17,flexShrink:0}}/><span>Nimeelewa kuwa gharama ya huduma ni {price[network]} na nitafuata maelekezo ya malipo yaliyothibitishwa na Admin.</span></label>}
        <div style={{gridColumn:"1 / -1",display:"flex",gap:10,flexWrap:"wrap",marginTop:4,paddingTop:16,borderTop:"1px solid #e9edf3"}}>
          <button type="submit" disabled={busy||!!uploading} style={{border:0,borderRadius:10,padding:"14px 20px",fontWeight:850,color:"#fff",background:busy?"#94a3b8":activeTheme.gradient,cursor:busy?"wait":"pointer",flex:"1 1 230px",minHeight:49,fontSize:14,boxShadow:`0 5px 14px ${activeTheme.accent}2b`}}>{busy?(uploading?"Inapakia kiambatisho...":"Inatuma ombi..."):"TUMA OMBI LA TILL  →"}</button>
          <button type="button" onClick={()=>navigate("/")} style={{border:"1px solid #d6deea",borderRadius:10,padding:"13px 18px",fontWeight:800,color:"#334155",background:"#fff",cursor:"pointer",minHeight:49}}>RUDI DASHBOARD</button>
        </div>
      </form>}
    </section>}
    <section style={{...cardStyle,marginTop:20,padding:16,minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <div style={{width:34,height:34,borderRadius:9,background:"#f1f5f9",display:"grid",placeItems:"center",color:"#475569",flexShrink:0}}><Clock3 size={18}/></div>
        <div><h2 style={{margin:0,fontSize:18,color:"#172033"}}>Maombi yangu</h2><p style={{margin:"3px 0 0",fontSize:12,color:"#64748b"}}>Hali na malipo ya maombi yako ya Till.</p></div>
      </div>
      {applications.length===0?<p style={{color:"#64748b",fontSize:13,marginBottom:0}}>Bado hakuna ombi la Till.</p>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,285px),1fr))",gap:10,minWidth:0}}>
        {applications.map(app=>{
          const data=app.applicantData??{};
          const networkName=String(data.network??"").toUpperCase();
          const paymentPending=["AIRTEL","VODACOM"].includes(networkName)&&String(data.paymentStatus??"UNPAID").toUpperCase()!=="PAID";
          const status=paymentPending?"MALIPO HAYAJATHIBITISHWA":String(app.status??"PENDING");
          const customer=String(data.fullName??data.airtelPhone??data.nidaNumber??"—");
          const till=String(data.tillPhone??data.airtelPhone??"—");
          const cell=(label:string,value:string)=><div style={{minWidth:0}}><small style={{display:"block",fontSize:10,color:"#64748b",fontWeight:750,marginBottom:3}}>{label}</small><strong style={{display:"block",fontSize:12,color:"#243247",overflowWrap:"anywhere"}}>{value}</strong></div>;
          return <article key={app.id} style={{border:"1px solid #e2e8f0",borderRadius:12,padding:12,background:"#fff",minWidth:0,display:"grid",gap:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}><strong style={{fontSize:13,color:"#172033",overflowWrap:"anywhere"}}>{customer}</strong><span style={{fontSize:10,fontWeight:850,color:paymentPending?"#92400e":status==="APPROVED"?"#166534":"#475569",background:paymentPending?"#fef3c7":status==="APPROVED"?"#dcfce7":"#f1f5f9",padding:"5px 7px",borderRadius:7,textAlign:"center"}}>{status}</span></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:"9px 12px"}}>
              {cell("MTANDAO",networkName||"—")}{cell("TILL / LIPA",till)}{cell("KIASI",String(data.price??"—"))}{cell("TAREHE",dateLabel(app.submittedAt??app.updatedAt))}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {paymentPending&&<button type="button" onClick={()=>{setPaymentApplication(app);setPaymentPhone(String(accountUser?.phone??""));setPaymentOrderId("");setPaymentStatusMessage("");}} style={{border:0,borderRadius:8,padding:"9px 11px",background:"#15803d",color:"#fff",fontSize:11,fontWeight:850,cursor:"pointer"}}>FANYA MALIPO</button>}
              {String(app.status).toUpperCase()==="REJECTED"&&<button type="button" onClick={()=>editRejectedApplication(app)} style={{border:0,borderRadius:8,padding:"9px 11px",background:"#1d4ed8",color:"#fff",fontSize:11,fontWeight:850,cursor:"pointer"}}>REKEBISHA OMBI</button>}
            </div>
          </article>;
        })}
      </div>}
    </section>

    {paymentApplication && (() => {
      const data = paymentApplication.applicantData ?? {};
      const networkName = String(data.network ?? "").toUpperCase();
      const amount = networkName === "AIRTEL" ? "TSh 5,000" : "TSh 40,000";
      const startPayment = async () => {
        if (!paymentApplication.applicationId) return;
        if (!/^\+?\d[\d ()-]{7,18}$/.test(paymentPhone.trim())) { setPaymentStatusMessage("Weka namba sahihi ya simu ya kulipia."); toast.error("Weka namba sahihi ya simu ya kulipia."); return; }
        setPaymentBusy(true); setPaymentStatusMessage("");
        try {
          const order = await createTillFimipayOrder({ application_id: paymentApplication.applicationId, phone: paymentPhone.trim() });
          setPaymentOrderId(order.order_id);
          setPaymentStatusMessage("Ombi la malipo limetumwa kwenye simu. Kamilisha maelekezo ya malipo kisha gusa Hakiki malipo.");
          toast.success("Oda ya FimiPay imeanzishwa.");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Imeshindikana kuanzisha malipo.";
          setPaymentStatusMessage(message); toast.error(message);
        } finally { setPaymentBusy(false); }
      };
      const verifyPayment = async () => {
        if (!paymentOrderId) return;
        setPaymentBusy(true);
        try {
          const result = await checkTillFimipayOrder(paymentOrderId);
          if (result.paid) {
            setPaymentStatusMessage("Malipo yamethibitishwa. Ombi lako sasa linasubiri hatua za Admin.");
            toast.success("Malipo yamethibitishwa; ombi limewekwa PENDING.");
            setSubmittedPaymentApplication((current) => current ? { ...current, status: "PENDING", applicantData: { ...current.applicantData, paymentStatus: "PAID", paymentOrderId } } : current);
            setPaymentApplication(null);
          } else setPaymentStatusMessage("Hali ya malipo: " + String(result.payment_status || "PENDING") + ". Ikiwa umekamilisha malipo, subiri kidogo kisha hakiki tena.");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Imeshindikana kuhakiki malipo.";
          setPaymentStatusMessage(message); toast.error(message);
        } finally { setPaymentBusy(false); }
      };
      return <div role="dialog" aria-modal="true" aria-label="Malipo ya FimiPay" style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,.65)",display:"grid",placeItems:"center",padding:16}}>
        <div style={{width:"min(100%,480px)",background:"#fff",borderRadius:18,padding:22,boxShadow:"0 20px 60px rgba(0,0,0,.25)",color:"#172033"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><h3 style={{margin:0,fontSize:21}}>FANYA MALIPO</h3><button type="button" onClick={()=>setPaymentApplication(null)} aria-label="Funga" style={{border:0,background:"#f1f5f9",borderRadius:9,padding:"7px 12px",fontSize:20,cursor:"pointer"}}>×</button></div>
          <p style={{color:"#64748b",fontSize:14,lineHeight:1.6}}>Lipa kupitia mfumo salama wa FimiPay. Hakuna Lipa Namba ya Azam inayohitajika.</p>
          <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:13,padding:16,display:"grid",gap:9}}>
            <div><small style={{color:"#64748b"}}>MTANDAO</small><div style={{fontSize:18,fontWeight:900}}>{networkName}</div></div>
            <div><small style={{color:"#64748b"}}>KIASI CHA KULIPA</small><div style={{fontSize:22,fontWeight:900,color:"#15803d"}}>{amount}</div></div>
            <label style={{display:"grid",gap:7,color:"#475569",fontSize:13,fontWeight:750}}>Namba ya simu ya kulipia<input type="tel" inputMode="tel" autoComplete="tel" value={paymentPhone} onChange={e=>setPaymentPhone(e.target.value)} placeholder="Mfano 0712345678" maxLength={16} style={{width:"100%",boxSizing:"border-box",padding:"13px 14px",border:"1px solid #cbd5e1",borderRadius:10,fontSize:16,color:"#172033",background:"#fff"}}/><small style={{fontWeight:500,color:"#64748b"}}>Unaweza kubadilisha namba hii kabla ya kuanzisha malipo.</small></label>
            {paymentOrderId && <div><small style={{color:"#64748b"}}>Namba ya oda ya malipo</small><div style={{fontSize:13,fontWeight:800,overflowWrap:"anywhere"}}>{paymentOrderId}</div></div>}
          </div>
          {paymentStatusMessage && <p role="status" style={{fontSize:13,lineHeight:1.6,color:"#334155",background:"#eff6ff",padding:12,borderRadius:10,marginTop:12}}>{paymentStatusMessage}</p>}
          {!paymentOrderId
            ? <button type="button" disabled={paymentBusy} onClick={startPayment} style={{width:"100%",marginTop:16,border:0,borderRadius:11,padding:15,background:"#15803d",color:"#fff",fontSize:15,fontWeight:900,cursor:paymentBusy?"wait":"pointer"}}>{paymentBusy?"INAANZISHA...":"ANZA MALIPO KWA SIMU"}</button>
            : <button type="button" disabled={paymentBusy} onClick={verifyPayment} style={{width:"100%",marginTop:16,border:0,borderRadius:11,padding:15,background:"#15803d",color:"#fff",fontSize:15,fontWeight:900,cursor:paymentBusy?"wait":"pointer"}}>{paymentBusy?"INAHakIKI...":"HAKIKI MALIPO"}</button>}
          <p style={{fontSize:12,color:"#64748b",lineHeight:1.5,marginBottom:0}}>Ombi lako litawekwa PENDING baada tu ya FimiPay kuthibitisha malipo halisi.</p>
        </div>
      </div>;
    })()}
  </main>;
}
