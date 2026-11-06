import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { adminLookupPrivateFimipayPayment, checkPrivateFimipayOrder, createPrivateFimipayOrder } from "@/lib/firebase";

export default function PrivatePaymentsPage() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(String(user?.phone ?? ""));
  const [orderId, setOrderId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const savedOrder = localStorage.getItem("smartservicestz-private-payment-order");
    if (!savedOrder) return;
    setOrderId(savedOrder);
    void checkPrivateFimipayOrder(savedOrder).then((result) => {
      if (result.paid && result.confirmation_code) setCode(result.confirmation_code);
    }).catch(() => undefined);
  }, []);
  const start = async () => {
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value < 200 || value > 20000000) { toast.error("Kiasi kiwe TSh 200 hadi 20,000,000."); return; }
    setBusy(true); setMessage("");
    try { const result = await createPrivateFimipayOrder({ amount: value, phone }); setOrderId(result.order_id); localStorage.setItem("smartservicestz-private-payment-order", result.order_id); setMessage("Ombi limetumwa. Kamilisha malipo kwenye simu kisha bonyeza KAGUA MALIPO."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Malipo hayakuanzishwa."); }
    finally { setBusy(false); }
  };
  const check = async () => { setBusy(true); try { const result = await checkPrivateFimipayOrder(orderId); if (result.paid && result.confirmation_code) { setCode(result.confirmation_code); setMessage("Malipo yamethibitishwa."); } else setMessage("FimiPay bado haijathibitisha malipo."); } catch (e) { setMessage(e instanceof Error ? e.message : "Imeshindikana kukagua."); } finally { setBusy(false); } };
  const page: React.CSSProperties = {maxWidth:700,margin:"0 auto",padding:"24px 16px 48px"};
  const hero: React.CSSProperties = {borderRadius:24,overflow:"hidden",background:"linear-gradient(135deg,#102c50,#126b73)",color:"#fff",boxShadow:"0 16px 40px rgba(12,44,70,.18)"};
  const field: React.CSSProperties = {display:"block",width:"100%",boxSizing:"border-box",marginTop:8,padding:"15px",borderRadius:13,border:"1px solid #d7e2ec",background:"#f7fafc",fontSize:18,color:"#16334b"};
  const action: React.CSSProperties = {width:"100%",marginTop:20,padding:16,border:0,borderRadius:13,background:"linear-gradient(90deg,#0ba879,#087e72)",color:"#fff",fontWeight:800,fontSize:15};
  if (!isAuthenticated) return <main className="portal-main" style={page}><section style={{...hero,padding:26}}><h1>Fanya Malipo</h1><p>Ingia kwanza ili kuendelea na malipo salama kupitia FimiPay.</p><button style={action} onClick={() => window.dispatchEvent(new CustomEvent("smartservicestz-open-auth"))}>INGIA</button></section></main>;
  return <main className="portal-main" style={page}>
    <button type="button" onClick={() => navigate("/")} style={{border:0,background:"transparent",padding:"8px 0 18px",color:"#23617a",fontWeight:700}}>← Rudi mwanzo</button>
    <section style={hero}>
      <div style={{padding:"28px 25px 24px"}}>
        <div style={{fontSize:12,fontWeight:800,letterSpacing:1,color:"#b9f4e3"}}>🔒 MALIPO SALAMA · FIMIPAY</div>
        <h1 style={{fontSize:30,margin:"13px 0 8px"}}>Fanya Malipo</h1>
        <p style={{color:"#e0f1f5",lineHeight:1.6,margin:0}}>Lipa kiasi unachohitaji. Namba ya utambulisho itatolewa baada tu ya FimiPay kuthibitisha malipo.</p>
        <div style={{display:"flex",gap:9,flexWrap:"wrap",marginTop:18}}><span style={{background:"#ffffff20",padding:"8px 11px",borderRadius:9,fontSize:12}}>✓ Uthibitisho wa malipo</span><span style={{background:"#ffffff20",padding:"8px 11px",borderRadius:9,fontSize:12}}>✓ Hakuna tokeni</span></div>
      </div>
      <div style={{background:"#fff",color:"#17344b",padding:"24px 22px"}}>
      {!orderId && <>
        <div style={{fontSize:12,fontWeight:800,color:"#098d72",letterSpacing:1}}>WEKA TAARIFA ZA MALIPO</div>
        <label style={{display:"block",fontWeight:750,marginTop:18}}>Kiasi cha malipo (TSh)<input style={{...field,fontSize:23,fontWeight:800}} value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))} inputMode="numeric" placeholder="Mfano 5,000"/></label>
        <div style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:12,color:"#6d8090",marginTop:8}}><span>Kiasi cha chini: TSh 200</span><span>Juu: TSh 20,000,000</span></div>
        <label style={{display:"block",fontWeight:750,marginTop:19}}>Namba ya simu<input style={field} value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" placeholder="07XXXXXXXX"/></label>
        <button style={{...action,opacity:busy?.65:1}} disabled={busy} onClick={()=>void start()}>{busy?"INATUMA OMBI...":"ENDELEA NA MALIPO →"}</button>
        <p style={{fontSize:12,color:"#718294",textAlign:"center",lineHeight:1.6}}>Kamilisha ombi litakalotumwa kwenye simu yako, kisha kagua malipo.</p>
      </>}
      {orderId && <>
        <div style={{textAlign:"center",padding:"8px 0 16px"}}><div style={{fontSize:32}}>{code?"✓":"⌛"}</div><h2>{code?"Malipo yamethibitishwa":"Subiri uthibitisho"}</h2><p style={{color:"#687e90",lineHeight:1.5}}>{code?"Hifadhi namba yako na umkabidhi msimamizi.":"Kamilisha malipo kwenye simu, kisha bonyeza hapa kukagua."}</p></div>
        <div style={{padding:13,background:"#f1f6f9",borderRadius:12,fontSize:13,wordBreak:"break-all"}}>Namba ya oda: <b>{orderId}</b></div>
        {!code && <button style={action} disabled={busy} onClick={()=>void check()}>{busy?"INAKAGUA...":"KAGUA MALIPO"}</button>}
        {code && <div style={{marginTop:16,padding:18,textAlign:"center",background:"#edfaf3",border:"1px solid #b5e7cc",borderRadius:14}}><div style={{fontSize:12,fontWeight:800,color:"#168157"}}>NAMBA YAKO YA UTAMBULISHO</div><div style={{fontSize:26,fontWeight:900,color:"#126343",margin:"10px 0"}}>{code}</div><button style={{...action,marginTop:4,background:"#e2f0e9",color:"#155a40"}} onClick={()=>{void navigator.clipboard?.writeText(code);toast.success("Namba imenakiliwa.");}}>NAKILI NAMBA</button><button style={{...action,marginTop:10,background:"#edf1f5",color:"#29445a"}} onClick={()=>{localStorage.removeItem("smartservicestz-private-payment-order");setOrderId("");setCode("");setAmount("");setMessage("");}}>ANZISHA MALIPO MAPYA</button></div>}
      </>}
      {message && <p role="status" style={{padding:12,borderRadius:10,background:"#fff7e8",color:"#79591e",fontSize:13}}>{message}</p>}
      </div>
    </section>
    <p style={{textAlign:"center",fontSize:12,color:"#7a8b99",marginTop:16}}>Malipo hayaongezi tokeni. Namba hutolewa baada ya uthibitisho halisi wa FimiPay.</p>
  </main>;
}

export function PrivatePaymentsAdminPage() {
 const {isAuthenticated}=useAuth(); const [code,setCode]=useState(""); const [result,setResult]=useState<any>(null); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
 const lookup=async()=>{setBusy(true);setMessage("");try{const r=await adminLookupPrivateFimipayPayment(code);setResult(r);if(!r.found)setMessage("Namba haijapatikana.");}catch(e){setMessage(e instanceof Error?e.message:"Imeshindikana.");}finally{setBusy(false);}};
 if(!isAuthenticated)return <main className="portal-main">Ingia kwanza.</main>;
 return <main className="portal-main" style={{maxWidth:650,margin:"0 auto"}}><h1>Malipo Binafsi</h1><p>Thibitisha namba ya utambulisho ya mteja.</p><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="SSP-XXXXXXXXXX"/><button className="button button--green" disabled={busy||!code} onClick={()=>void lookup()}>{busy?"INATAFUTA...":"THIBITISHA"}</button>{message&&<p>{message}</p>}{result?.found&&<section className="license-form-card"><h2>Malipo yamethibitishwa</h2><p>Namba: {result.confirmation_code}</p><p>Kiasi: TSh {Number(result.amount).toLocaleString("en-US")}</p><p>Simu: {result.buyer_phone}</p><p>FimiPay Order: {result.order_id}</p><p>Muamala: {result.provider_transaction_id||"—"}</p><b>HAKUNA TOKENI ZILIZOTOLEWA</b></section>}</main>;
}
