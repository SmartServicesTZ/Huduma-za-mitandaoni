import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { adminLookupPrivateFimipayPayment, checkPrivateFimipayOrder, createPrivateFimipayOrder } from "@/lib/firebase";

type SavedPayment = { orderId: string; amount?: number; phone?: string; code?: string; status: "PENDING" | "PAID" | "FAILED"; savedAt: number };
const HISTORY_KEY = "smartservicestz-private-payment-history-v1";
const LEGACY_KEY = "smartservicestz-private-payment-order";
function readHistory(): SavedPayment[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (Array.isArray(parsed)) return parsed.filter((x) => x && typeof x.orderId === "string").slice(0, 50);
    return [];
  } catch { return []; }
}
function writeHistory(rows: SavedPayment[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(rows.slice(0, 50)));
    if (rows[0]?.orderId) localStorage.setItem(LEGACY_KEY, rows[0].orderId);
  } catch { toast.error("Kifaa hakina nafasi ya kutosha kuhifadhi historia ya malipo."); }
}
function upsertPayment(row: SavedPayment) {
  const rows = readHistory();
  const index = rows.findIndex((x) => x.orderId === row.orderId);
  if (index >= 0) rows[index] = { ...rows[index], ...row };
  else rows.unshift(row);
  writeHistory(rows.sort((a, b) => b.savedAt - a.savedAt));
}

export default function PrivatePaymentsPage() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState(String(user?.phone ?? ""));
  const [orderId, setOrderId] = useState("");
  const [code, setCode] = useState("");
  const [history, setHistory] = useState<SavedPayment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const rows = readHistory();
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!rows.length && legacy) rows.push({ orderId: legacy, status: "PENDING", savedAt: Date.now() });
    setHistory(rows);
    if (rows[0]) { setOrderId(rows[0].orderId); setCode(rows[0].code || ""); }
    // Recheck every saved pending order when the customer returns to this page.
    void (async () => {
      const refreshed: SavedPayment[] = [];
      for (const item of rows) {
        if (item.status !== "PENDING") { refreshed.push(item); continue; }
        try {
          const result = await checkPrivateFimipayOrder(item.orderId);
          const next = result.paid && result.confirmation_code
            ? { ...item, status: "PAID" as const, code: result.confirmation_code }
            : item;
          refreshed.push(next);
          if (next.status === "PAID") upsertPayment(next);
        } catch { refreshed.push(item); }
      }
      setHistory(refreshed);
      if (refreshed.length) writeHistory(refreshed);
      const active = refreshed.find((x) => x.orderId === (rows[0]?.orderId || legacy));
      if (active?.status === "PAID" && active.code) { setOrderId(active.orderId); setCode(active.code); }
    })();
  }, []);

  const start = async () => {
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value < 200 || value > 20000000) { toast.error("Kiasi kiwe TSh 200 hadi 20,000,000."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await createPrivateFimipayOrder({ amount: value, phone });
      const saved: SavedPayment = { orderId: result.order_id, amount: value, phone, status: "PENDING", savedAt: Date.now() };
      upsertPayment(saved); setHistory(readHistory()); setOrderId(result.order_id); setCode("");
      setMessage("Ombi limetumwa. Kamilisha malipo kwenye simu. Oda imehifadhiwa kwenye kifaa hiki; ukirudi ukurasa huu utaikagua tena.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Malipo hayakuanzishwa."); }
    finally { setBusy(false); }
  };

  const check = async (id = orderId) => {
    if (!id) return;
    setBusy(true);
    try {
      const result = await checkPrivateFimipayOrder(id);
      if (result.paid && result.confirmation_code) {
        const saved = readHistory().find((x) => x.orderId === id);
        const next: SavedPayment = { orderId: id, amount: result.amount ?? saved?.amount, phone: result.buyer_phone ?? saved?.phone, status: "PAID", code: result.confirmation_code, savedAt: saved?.savedAt ?? Date.now() };
        upsertPayment(next); setHistory(readHistory());
        if (id === orderId) setCode(result.confirmation_code);
        setMessage("Malipo yamethibitishwa. Namba yako imehifadhiwa kwenye historia ya kifaa hiki.");
      } else setMessage("Malipo bado hayajathibitishwa. Subiri kidogo kisha kagua tena.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Imeshindikana kukagua."); }
    finally { setBusy(false); }
  };

  const page: React.CSSProperties = {maxWidth:760,margin:"0 auto",padding:"24px 16px 48px"};
  const hero: React.CSSProperties = {borderRadius:24,overflow:"hidden",background:"linear-gradient(135deg,#102c50,#126b73)",color:"#fff",boxShadow:"0 16px 40px rgba(12,44,70,.18)"};
  const field: React.CSSProperties = {display:"block",width:"100%",boxSizing:"border-box",marginTop:8,padding:"15px",borderRadius:13,border:"1px solid #d7e2ec",background:"#f7fafc",fontSize:18,color:"#16334b"};
  const action: React.CSSProperties = {width:"100%",marginTop:20,padding:16,border:0,borderRadius:13,background:"linear-gradient(90deg,#0ba879,#087e72)",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer"};
  if (!isAuthenticated) return <main className="portal-main" style={page}><section style={{...hero,padding:26}}><h1>Fanya Malipo</h1><p>Ingia kwanza ili kuendelea na malipo.</p><button style={action} onClick={() => window.dispatchEvent(new CustomEvent("smartservicestz-open-auth"))}>INGIA</button></section></main>;
  const active = history.find((x) => x.orderId === orderId);
  return <main className="portal-main" style={page}>
    <button type="button" onClick={() => navigate("/")} style={{border:0,background:"transparent",padding:"8px 0 18px",color:"#23617a",fontWeight:700}}>← Rudi mwanzo</button>
    <section style={hero}>
      <div style={{padding:"28px 25px 24px"}}>
        <div style={{fontSize:12,fontWeight:800,letterSpacing:1,color:"#b9f4e3"}}>🔒 MALIPO SALAMA</div>
        <h1 style={{fontSize:30,margin:"13px 0 8px"}}>Fanya Malipo</h1>
        <p style={{color:"#e0f1f5",lineHeight:1.6,margin:0}}>Baada ya kufanya malipo, utapokea namba ya utambulisho wa muamala wako. Ihifadhi kisha uilete kwetu. Tutaingiza namba hiyo kwenye dashboard ya Admin ili kuthibitisha malipo na kuona taarifa za muamala wako.</p>
      </div>
      <div style={{background:"#fff",color:"#17344b",padding:"24px 22px"}}>
        <div style={{fontSize:12,fontWeight:800,color:"#098d72",letterSpacing:1}}>ANZISHA MALIPO MAPYA</div>
        <label style={{display:"block",fontWeight:750,marginTop:18}}>Kiasi (TSh)<input style={{...field,fontSize:23,fontWeight:800}} value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))} inputMode="numeric" placeholder="Mfano 5,000"/></label>
        <div style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:12,color:"#6d8090",marginTop:8}}><span>Kiasi cha chini: TSh 200</span><span>Juu: TSh 20,000,000</span></div>
        <label style={{display:"block",fontWeight:750,marginTop:19}}>Namba ya simu<input style={field} value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" placeholder="07XXXXXXXX"/></label>
        <button style={{...action,opacity:busy?.65:1}} disabled={busy} onClick={()=>void start()}>{busy?"INATUMA OMBI...":"ENDELEA NA MALIPO →"}</button>
        {orderId && <div style={{marginTop:22,padding:17,background:"#f1f6f9",borderRadius:15}}>
          <div style={{fontWeight:850,fontSize:15,color:"#17344b"}}>{code ? "MALIPO YAMETHIBITISHWA" : "HALI YA MALIPO"}</div>
          <p style={{fontSize:13,color:"#64798b",lineHeight:1.5}}>Namba ya oda: <b style={{wordBreak:"break-all"}}>{orderId}</b></p>
          {code ? <div style={{padding:16,textAlign:"center",background:"#edfaf3",border:"1px solid #b5e7cc",borderRadius:13}}>
            <div style={{fontSize:12,fontWeight:800,color:"#168157"}}>NAMBA YAKO YA UTAMBULISHO</div><div style={{fontSize:25,fontWeight:900,color:"#126343",margin:"10px 0",letterSpacing:1}}>{code}</div>
            <button style={{...action,marginTop:4,background:"#e2f0e9",color:"#155a40"}} onClick={()=>{void navigator.clipboard?.writeText(code);toast.success("Namba imenakiliwa.");}}>NAKILI NAMBA</button>
          </div> : <button style={action} disabled={busy} onClick={()=>void check()}>{busy?"INAKAGUA...":"KAGUA MALIPO"}</button>}
        </div>}
        {message && <p role="status" style={{padding:12,borderRadius:10,background:"#fff7e8",color:"#79591e",fontSize:13}}>{message}</p>}
      </div>
    </section>
    <section style={{marginTop:26,background:"#fff",border:"1px solid #e1eaf0",borderRadius:20,padding:20,boxShadow:"0 8px 25px rgba(20,50,70,.06)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><h2 style={{margin:0,fontSize:20,color:"#17344b"}}>Historia ya Malipo Yangu</h2><span style={{fontSize:12,color:"#718294"}}>{history.length} muamala</span></div>
      <p style={{fontSize:13,color:"#718294",lineHeight:1.5}}>Miamala yako huhifadhiwa kwenye localStorage ya browser/kifaa hiki. Ukirudi kwa kutumia browser hii, utaweza kuiona tena na kukagua malipo yanayosubiri.</p>
      {!history.length ? <div style={{padding:22,textAlign:"center",color:"#8293a1",background:"#f7fafc",borderRadius:13}}>Bado huna historia ya malipo kwenye kifaa hiki.</div> : <div style={{display:"grid",gap:12}}>
        {history.map((item) => <article key={item.orderId} style={{border:"1px solid #e5edf2",borderRadius:14,padding:15,display:"grid",gap:8}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap",alignItems:"center"}}><b style={{color:"#17344b"}}>{item.amount ? "TSh "+item.amount.toLocaleString("en-US") : "Malipo"}</b><span style={{fontSize:11,fontWeight:850,color:item.status==="PAID"?"#168157":item.status==="FAILED"?"#b42318":"#9a6b13",background:item.status==="PAID"?"#e9f8ef":item.status==="FAILED"?"#fff0ef":"#fff7e5",padding:"6px 9px",borderRadius:20}}>{item.status==="PAID"?"IMETHIBITISHWA":item.status==="FAILED"?"IMESHINDWA":"INASUBIRI"}</span></div>
          {item.code ? <div style={{fontSize:18,fontWeight:900,letterSpacing:1,color:"#126343"}}>{item.code}</div> : <div style={{fontSize:12,color:"#718294",wordBreak:"break-all"}}>Oda: {item.orderId}</div>}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>{setOrderId(item.orderId);setCode(item.code||"");setMessage("");window.scrollTo({top:0,behavior:"smooth"});}} style={{border:"1px solid #cbd9e3",background:"#f7fafc",color:"#24445b",padding:"9px 12px",borderRadius:9,fontWeight:750}}>FUNGUA</button>
            {item.status==="PENDING" && <button disabled={busy} onClick={()=>void check(item.orderId)} style={{border:0,background:"#e7f4ef",color:"#087e62",padding:"9px 12px",borderRadius:9,fontWeight:800}}>KAGUA TENA</button>}
            {item.code && <button onClick={()=>{void navigator.clipboard?.writeText(item.code!);toast.success("Namba imenakiliwa.");}} style={{border:0,background:"#e7f4ef",color:"#087e62",padding:"9px 12px",borderRadius:9,fontWeight:800}}>NAKILI NAMBA</button>}
          </div>
        </article>)}
      </div>}
    </section>
    <p style={{textAlign:"center",fontSize:12,color:"#7a8b99",marginTop:16}}>Muhimu: Usifute data za browser wala kubadilisha kifaa kabla ya kuhifadhi namba yako. localStorage haihamishwi kwenda kifaa kingine.</p>
  </main>;
}

export function PrivatePaymentsAdminPage() {
 const {isAuthenticated}=useAuth();
 const [code,setCode]=useState("");
 const [result,setResult]=useState<any>(null);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const lookup=async()=>{setBusy(true);setMessage("");setResult(null);try{const r=await adminLookupPrivateFimipayPayment(code.trim().toUpperCase());setResult(r);if(!r.found)setMessage("Namba hii haijapatikana. Hakiki herufi na tarakimu ulizoingiza.");}catch(e){setMessage(e instanceof Error?e.message:"Imeshindikana kufanya ukaguzi.");}finally{setBusy(false);}};
 if(!isAuthenticated)return <main className="portal-main" style={{maxWidth:900,margin:"30px auto",padding:20}}>Ingia kwanza.</main>;
 const panel: React.CSSProperties={background:"#fff",border:"1px solid #e1eaf0",borderRadius:20,padding:22,boxShadow:"0 12px 35px rgba(20,50,70,.07)"};
 const input: React.CSSProperties={width:"100%",boxSizing:"border-box",padding:"16px",border:"1px solid #cbd9e3",borderRadius:12,fontSize:18,letterSpacing:1,textTransform:"uppercase",color:"#17344b",background:"#f8fbfd"};
 return <main className="portal-main" style={{maxWidth:980,margin:"0 auto",padding:"28px 16px 55px",color:"#17344b"}}>
   <header style={{background:"linear-gradient(130deg,#102c50,#126b73)",color:"#fff",padding:"28px",borderRadius:22,marginBottom:22,boxShadow:"0 16px 38px rgba(12,44,70,.16)"}}>
     <div style={{fontSize:11,fontWeight:900,letterSpacing:1.5,color:"#b9f4e3"}}>SMARTSERVICESTZ · ADMIN CONTROL</div>
     <h1 style={{fontSize:29,margin:"10px 0 7px"}}>Uthibitishaji wa Malipo</h1>
     <p style={{margin:0,color:"#dcecf2",lineHeight:1.6}}>Tafuta namba ya utambulisho aliyopewa mteja baada ya malipo kuthibitishwa. Hakiki taarifa kabla ya kuendelea na huduma.</p>
   </header>
   <section style={panel}>
     <div style={{fontSize:12,fontWeight:900,color:"#098d72",letterSpacing:1}}>TAFUTA MUAMALA</div>
     <label style={{display:"block",fontWeight:800,margin:"12px 0 8px"}}>Namba ya utambulisho (SSP)</label>
     <input value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/\s/g,""))} onKeyDown={e=>{if(e.key==="Enter"&&code.trim())void lookup();}} placeholder="SSP-XXXXXXXXXX" style={input}/>
     <button className="button button--green" style={{width:"100%",marginTop:14,minHeight:48,fontWeight:900}} disabled={busy||!code.trim()} onClick={()=>void lookup()}>{busy?"INATAFUTA MUAMALA...":"TAFUTA NA THIBITISHA"}</button>
     {message&&<div role="alert" style={{marginTop:16,padding:14,borderRadius:12,background:"#fff4e5",color:"#895b13",fontWeight:700}}>{message}</div>}
   </section>
   {result?.found&&<section style={{...panel,marginTop:20,border:"1px solid #a8dfbf"}}>
     <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
       <div><div style={{fontSize:11,fontWeight:900,color:"#168157",letterSpacing:1}}>MUAMALA UMEPATIKANA</div><h2 style={{margin:"6px 0",fontSize:23}}>Taarifa za Malipo</h2></div>
       <span style={{padding:"8px 12px",borderRadius:30,background:"#e8f8ee",color:"#147747",fontSize:12,fontWeight:900}}>✓ IMETHIBITISHWA</span>
     </div>
     <div style={{marginTop:16,padding:16,background:"#f0faf4",borderRadius:14,textAlign:"center"}}>
       <div style={{fontSize:11,color:"#168157",fontWeight:900}}>NAMBA YA UTAMBULISHO</div><div style={{fontSize:25,fontWeight:950,letterSpacing:1,color:"#126343",marginTop:8,wordBreak:"break-all"}}>{result.confirmation_code}</div>
     </div>
     <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12,marginTop:16}}>
       {[["Kiasi kilicholipwa","TSh "+Number(result.amount).toLocaleString("en-US")],["Namba ya simu",result.buyer_phone||"—"],["Rejea ya malipo",result.order_id||"—"],["Namba ya muamala wa mtoa huduma",result.provider_transaction_id||"—"],["Muda wa malipo",result.paid_at||"—"],["Hali ya malipo","YAMETHIBITISHWA"]].map(([label,value])=><div key={label} style={{padding:14,border:"1px solid #e4edf1",borderRadius:12,background:"#fbfdfe"}}><div style={{fontSize:11,color:"#718294",fontWeight:800}}>{label}</div><div style={{marginTop:7,fontSize:14,fontWeight:850,color:"#17344b",overflowWrap:"anywhere"}}>{value}</div></div>)}
     </div>
     <div style={{marginTop:16,padding:13,borderRadius:11,background:"#f4f6f8",color:"#536879",fontSize:12,lineHeight:1.6}}>Muamala huu umethibitishwa na mfumo. Taarifa zake zinaweza kutumika kuendelea na huduma husika.</div>
   </section>}
 </main>;
}
