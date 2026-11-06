import { useState } from "react";
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
  const start = async () => {
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value < 1000 || value > 20000000) { toast.error("Kiasi kiwe TSh 1,000 hadi 20,000,000."); return; }
    setBusy(true); setMessage("");
    try { const result = await createPrivateFimipayOrder({ amount: value, phone }); setOrderId(result.order_id); setMessage("Ombi limetumwa. Kamilisha malipo kwenye simu kisha bonyeza KAGUA MALIPO."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Malipo hayakuanzishwa."); }
    finally { setBusy(false); }
  };
  const check = async () => { setBusy(true); try { const result = await checkPrivateFimipayOrder(orderId); if (result.paid && result.confirmation_code) { setCode(result.confirmation_code); setMessage("Malipo yamethibitishwa."); } else setMessage("FimiPay bado haijathibitisha malipo."); } catch (e) { setMessage(e instanceof Error ? e.message : "Imeshindikana kukagua."); } finally { setBusy(false); } };
  if (!isAuthenticated) return <main className="portal-main"><h1>Fanya Malipo</h1><p>Ingia kwanza.</p><button className="button button--green" onClick={() => window.dispatchEvent(new CustomEvent("smartservicestz-open-auth"))}>INGIA</button></main>;
  return <main className="portal-main" style={{maxWidth:650,margin:"0 auto"}}><button onClick={() => navigate("/")}>← Rudi</button><section className="license-form-card"><h1>Fanya Malipo</h1><p>Lipa kiasi unachotaka kupitia FimiPay. Hakuna tokeni zitakazotolewa.</p>{!orderId && <><label>Kiasi (TSh)<input value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))} inputMode="numeric" placeholder="Mfano 15000"/></label><label>Namba ya simu<input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel"/></label><button className="button button--green" disabled={busy} onClick={()=>void start()}>{busy?"INATUMA...":"ENDELEA NA MALIPO"}</button></>}{orderId && <><p>Oda: <b>{orderId}</b></p>{!code && <button className="button button--green" disabled={busy} onClick={()=>void check()}>{busy?"INAKAGUA...":"KAGUA MALIPO"}</button>}{code && <h2>Namba yako ya utambulisho: {code}</h2>}</>}{message && <p role="status">{message}</p>}</section></main>;
}

export function PrivatePaymentsAdminPage() {
 const {isAuthenticated}=useAuth(); const [code,setCode]=useState(""); const [result,setResult]=useState<any>(null); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
 const lookup=async()=>{setBusy(true);setMessage("");try{const r=await adminLookupPrivateFimipayPayment(code);setResult(r);if(!r.found)setMessage("Namba haijapatikana.");}catch(e){setMessage(e instanceof Error?e.message:"Imeshindikana.");}finally{setBusy(false);}};
 if(!isAuthenticated)return <main className="portal-main">Ingia kwanza.</main>;
 return <main className="portal-main" style={{maxWidth:650,margin:"0 auto"}}><h1>Malipo Binafsi</h1><p>Thibitisha namba ya utambulisho ya mteja.</p><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="SSP-XXXXXXXXXX"/><button className="button button--green" disabled={busy||!code} onClick={()=>void lookup()}>{busy?"INATAFUTA...":"THIBITISHA"}</button>{message&&<p>{message}</p>}{result?.found&&<section className="license-form-card"><h2>Malipo yamethibitishwa</h2><p>Namba: {result.confirmation_code}</p><p>Kiasi: TSh {Number(result.amount).toLocaleString("en-US")}</p><p>Simu: {result.buyer_phone}</p><p>FimiPay Order: {result.order_id}</p><p>Muamala: {result.provider_transaction_id||"—"}</p><b>HAKUNA TOKENI ZILIZOTOLEWA</b></section>}</main>;
}
