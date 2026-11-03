import { useEffect, useRef, useState } from "react";
import { Download, RotateCcw, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { consumeFirebaseTokens, getServiceTokenConfig } from "@/lib/firebase";
import { triggerDownload } from "@/lib/downloadHistory";

type NetworkKey = "airtel" | "vodacom" | "halotel" | "yas";
type Palette = { label:string; base:string; deep:string; accent:string; ink:string; brand:string; sub:string };
const NETWORKS: Record<NetworkKey,Palette> = {
  airtel:{label:"Airtel Money",base:"#ed101e",deep:"#a90018",accent:"#fff",ink:"#111827",brand:"airtel",sub:"money"},
  vodacom:{label:"Vodacom M-Pesa",base:"#ed1730",deep:"#a90020",accent:"#fff",ink:"#111827",brand:"vodacom",sub:"M-PESA"},
  halotel:{label:"Halotel HaloPesa",base:"#facc15",deep:"#a16207",accent:"#fff4b8",ink:"#422006",brand:"halotel",sub:"HaloPesa"},
  yas:{label:"Yas",base:"#0754b8",deep:"#06265f",accent:"#ffdf00",ink:"#092d63",brand:"yas",sub:"wakala"},
};
const W=1500,H=1050;
const cleanName=(v:string)=>v.trim().replace(/\s+/g," ").toUpperCase();
const cleanNumber=(v:string)=>v.replace(/\D/g,"").slice(0,12);
const asset=(name:string)=>import.meta.env.BASE_URL+name;
function loadImage(src:string){
  return new Promise<HTMLImageElement>((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Asset haikupatikana: ${src}`));image.src=src;
  });
}

function round(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string,stroke?:string,line=1){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.lineWidth=line;ctx.strokeStyle=stroke;ctx.stroke();}
}
function raisedRound(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string,stroke="#e0e0e0"){
  ctx.save();
  ctx.shadowColor="rgba(0,0,0,.30)";
  ctx.shadowBlur=10;
  ctx.shadowOffsetY=6;
  round(ctx,x,y,w,h,r,fill,stroke,2);
  ctx.restore();
}
function drawStickerFrame(ctx:CanvasRenderingContext2D,w:number,h:number){
  ctx.save();
  ctx.beginPath();ctx.roundRect(8,8,w-16,h-16,Math.min(44,w*.055,h*.08));
  ctx.strokeStyle="rgba(0,0,0,.28)";ctx.lineWidth=Math.max(12,Math.min(w,h)*.025);ctx.stroke();
  ctx.beginPath();ctx.roundRect(13,13,w-26,h-26,Math.min(40,w*.05,h*.075));
  ctx.strokeStyle="#fff";ctx.lineWidth=Math.max(4,Math.min(w,h)*.009);ctx.stroke();
  ctx.restore();
}
function textFit(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,max:number,size:number,color:string,weight=900,shadow=false,extraBlack=false){
  let s=size;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle=color;
  ctx.font=`${weight} ${s}px Arial Black, Arial, Helvetica, sans-serif`;
  while(ctx.measureText(value).width>max&&s>22){s-=3;ctx.font=`${weight} ${s}px Arial, Helvetica, sans-serif`;}
  if(shadow){ctx.shadowColor="rgba(255,255,255,.42)";ctx.shadowBlur=3;ctx.shadowOffsetY=2;}
  if(extraBlack){ctx.lineWidth=2.5;ctx.strokeStyle=color;ctx.strokeText(value,x,y,max);}
  ctx.fillText(value,x,y,max);
  ctx.shadowColor="transparent";ctx.shadowBlur=0;ctx.shadowOffsetY=0;
}
function brand(ctx:CanvasRenderingContext2D,n:NetworkKey){
  ctx.save();ctx.textAlign="center";ctx.textBaseline="middle";
  if(n==="airtel"){
    // Airtel is rendered from airtel-logo-white.png in drawSticker().
  }else if(n==="vodacom"){
    // Vodacom round mark and M-Pesa wordmark in a centered top lockup.
    ctx.strokeStyle="#fff";ctx.lineWidth=24;ctx.beginPath();ctx.arc(405,112,48,.25,Math.PI*1.8);ctx.stroke();
    ctx.fillStyle="#fff";ctx.textAlign="left";ctx.font="900 108px Arial";ctx.fillText("vodacom",485,105);
    ctx.font="800 60px Arial";ctx.fillText("m-pesa",510,175);
  }else if(n==="halotel"){
    ctx.fillStyle="#ed1018";ctx.textAlign="center";ctx.font="900 145px Arial";ctx.fillText("halopesa",750,100);
    ctx.fillStyle="#ed1018";ctx.beginPath();ctx.arc(260,100,39,0,Math.PI*2);ctx.fill();
  }else{
    ctx.fillStyle="#ffdf00";ctx.font="900 125px Arial";ctx.fillText("yas",750,110);
    ctx.fillStyle="#fff";ctx.font="700 48px Arial";ctx.fillText("WAKALA",750,175);
  }
  ctx.restore();
}
async function drawSticker(canvas:HTMLCanvasElement,network:NetworkKey,name:string,number:string){
  const ctx=canvas.getContext("2d");if(!ctx)return;
  canvas.width=W;canvas.height=H;
  const p=NETWORKS[network],nm=cleanName(name)||"JINA LA WAKALA",num=cleanNumber(number)||"000000";
  if(network==="halotel"){
    const reference=await loadImage(asset("halotel-agent-reference-clean.png"));
    canvas.width=reference.naturalWidth;canvas.height=reference.naturalHeight;
    ctx.drawImage(reference,0,0,canvas.width,canvas.height);
    // Clear the editable panels defensively so an older cached template can never
    // reintroduce the sample code or sample agent name.
    const codeBoxes=[[92,498,301,675],[313,498,520,675],[531,498,739,675],[751,498,958,675],[970,498,1177,675],[1189,498,1389,675]];
    codeBoxes.forEach(([x,y,w,h])=>round(ctx,x,y,w-x,h-y,28,"#fff"));
    round(ctx,91,764,1298,127,30,"#fff");
    const centers=[.133,.282,.431,.578,.727,.875];
    const enteredNumber=cleanNumber(number),enteredName=cleanName(name);
    enteredNumber.slice(0,6).split("").forEach((digit,index)=>textFit(ctx,digit,canvas.width*centers[index],canvas.height*.551,canvas.width*.115,canvas.height*.145,"#050505",950,false,true));
    if(enteredName)textFit(ctx,enteredName,canvas.width*.5,canvas.height*.776,canvas.width*.76,canvas.height*.105,"#050505",950,false,true);
    return;
  }
  if(network==="yas"){
    canvas.width=W;canvas.height=H;
    const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,"#0d6bb8");bg.addColorStop(.52,"#064b91");bg.addColorStop(1,"#061e4a");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalAlpha=.13;ctx.strokeStyle="#ffffff";ctx.lineWidth=5;
    for(let x=-H;x<W;x+=110){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+H,H);ctx.stroke();}
    ctx.restore();
    const logo=await loadImage(asset("yas-logo.png"));
    ctx.save();ctx.fillStyle="#fff";ctx.globalAlpha=.96;ctx.beginPath();ctx.roundRect((W-446)/2,45,446,256,34);ctx.fill();ctx.restore();
    ctx.drawImage(logo,(W-410)/2,58,410,230);drawStickerFrame(ctx,W,H);
    textFit(ctx,num,W/2,565,W*.78,150,"#ffffff",950,true,true);
    textFit(ctx,nm,W/2,790,W*.82,88,"#ffffff",950,true,true);
    textFit(ctx,"YAS WAKALA",W/2,930,W*.75,48,"#ffdf00",900,false);
    return;
  }
  if(network!=="airtel"){
    const templates:Record<Exclude<NetworkKey,"airtel">,string>={vodacom:"Vodacom.png",halotel:"Halotel.png",yas:"Yas.png"};
    const template=await loadImage(asset(templates[network]));
    canvas.width=template.naturalWidth;canvas.height=template.naturalHeight;
    ctx.save();ctx.beginPath();ctx.roundRect(0,0,canvas.width,canvas.height,42);ctx.clip();
    ctx.drawImage(template,0,0,canvas.width,canvas.height);ctx.restore();
    if(network==="vodacom"){
      textFit(ctx,num,canvas.width*.5,canvas.height*.435,canvas.width*.76,canvas.height*.17,"#050505",950,false,true);
      textFit(ctx,nm,canvas.width*.5,canvas.height*.73,canvas.width*.78,canvas.height*.095,"#050505",950,false,true);
    }else if(network==="halotel"){
      const digits=num.split("");
      const left=canvas.width*.105, right=canvas.width*.895, span=right-left;
      const step=digits.length>1?span/(digits.length-1):0;
      digits.forEach((digit,index)=>textFit(ctx,digit,left+step*index,canvas.height*.615,canvas.width*.105,canvas.height*.15,"#080808",950,false,true));
      textFit(ctx,nm,canvas.width*.5,canvas.height*.82,canvas.width*.78,canvas.height*.09,"#090909",950,false,true);
      // Make the USSD instruction in the original footer easy to read without hiding the artwork.
      const footerY=canvas.height*.965;
      ctx.save();
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.font=`900 ${Math.max(30,canvas.height*.038)}px Arial, Helvetica, sans-serif`;
      ctx.lineWidth=5;ctx.strokeStyle="rgba(145,20,0,.8)";
      ctx.strokeText("*150*88#",canvas.width*.445,footerY);
      ctx.fillStyle="#fff";ctx.fillText("*150*88#",canvas.width*.445,footerY);
      ctx.restore();
    }else if(network==="yas"){
      textFit(ctx,num,canvas.width*.5,canvas.height*.445,canvas.width*.66,canvas.height*.13,"#101010",950,false,true);
      textFit(ctx,nm,canvas.width*.5,canvas.height*.735,canvas.width*.72,canvas.height*.12,"#101010",950,false,true);
    }
    drawStickerFrame(ctx,canvas.width,canvas.height);
    return;
  }
  const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,"#e30613");bg.addColorStop(.55,"#e30613");bg.addColorStop(1,"#e30613");
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  round(ctx,18,18,W-36,H-36,48,"rgba(0,0,0,0)","#fff",9);
  try{
    const logo=await loadImage(asset("airtel-logo-horizontal-white.png"));
    ctx.drawImage(logo,510,42,480,150);
  }catch{ /* keep the sticker usable if the asset is unavailable */ }
  textFit(ctx,"NAMBA YA WAKALA",750,300,1360,112,"#fff",950,true);
  raisedRound(ctx,65,380,1370,220,36,"#fff");
  textFit(ctx,num,750,490,1280,176,"#050505",950,false,true);
  textFit(ctx,"JINA",750,685,1150,72,"#fff",950,true);
  raisedRound(ctx,70,735,1360,160,34,"#fff");
  textFit(ctx,nm,750,815,1280,96,"#050505",950,false,true);
  try{
    const logo=await loadImage(asset("airtel-logo-horizontal-white.png"));
    ctx.drawImage(logo,590,885,320,100);
  }catch{ /* keep the sticker usable if the asset is unavailable */ }
  drawStickerFrame(ctx,W,H);
}

export default function AgentStickerPage(){
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [entryStatus,setEntryStatus]=useState<"checking"|"pending"|"charging"|"paid"|"failed">("checking");
  const [entryMessage,setEntryMessage]=useState("Inasoma gharama ya huduma kutoka Dashboard ya Admin...");
  const [serviceCost,setServiceCost]=useState<number|null>(null);
  const [serviceName,setServiceName]=useState("STIKA ZA WAKALA");
  const entryRequestId=useRef(crypto.randomUUID());
  const outputUsed=useRef(false);
  const [network,setNetwork]=useState<NetworkKey>("airtel");
  const [agentName,setAgentName]=useState("");
  const [agentNumber,setAgentNumber]=useState("");
  const [busy,setBusy]=useState(false);
  const [previewReady,setPreviewReady]=useState(false);
  const [previewError,setPreviewError]=useState("");
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const valid=cleanName(agentName).split(" ").filter(Boolean).length>=2 && /^\d{5,12}$/.test(cleanNumber(agentNumber));
  useEffect(()=>{
    let active=true;
    if(authLoading)return;
    if(!firebaseUser){setEntryStatus("failed");setEntryMessage("Ingia kwenye akaunti yako ili kutumia huduma hii.");return;}
    if(!profile)return;
    setEntryStatus("checking");setEntryMessage("Inasoma gharama ya huduma kutoka Dashboard ya Admin...");
    void getServiceTokenConfig("stika-mawakala").then(config=>{
      if(!active)return;
      setServiceCost(config.tokenCost);setServiceName(config.name);
      setEntryStatus("pending");
      setEntryMessage("");
    }).catch(error=>{
      if(!active)return;
      setEntryStatus("failed");setEntryMessage(error instanceof Error?error.message:"Imeshindikana kusoma gharama ya huduma.");
    });
    return ()=>{active=false;};
  },[authLoading,firebaseUser,profile]);
  useEffect(()=>{
    let active=true;
    setPreviewReady(false);setPreviewError("");
    if(canvasRef.current){
      void drawSticker(canvasRef.current,network,agentName,agentNumber)
        .then(()=>{if(active)setPreviewReady(true);})
        .catch(()=>{if(active){setPreviewError("Picha ya mtandao haikuweza kupakiwa. Jaribu tena.");setPreviewReady(false);}});
    }
    return ()=>{active=false;};
  },[network,agentName,agentNumber]);
  async function downloadSticker(){
    const canvas=canvasRef.current;
    if(!canvas||!valid||busy||!previewReady||entryStatus!=="pending"||outputUsed.current)return;
    if(!firebaseUser||serviceCost===null)return;
    setBusy(true);
    setEntryStatus("charging");
    try {
      await consumeFirebaseTokens(firebaseUser.uid,{slug:"stika-mawakala",name:serviceName,tokenCost:serviceCost,kind:serviceCost===0?"free":"paid",tokenType:"huduma"},entryRequestId.current);
      setEntryStatus("paid");
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png",1));
      if(!blob)throw new Error("Imeshindikana kuandaa stika. Jaribu tena.");
      const safe=cleanName(agentName).replace(/\\s+/g,"-").toLowerCase();
      triggerDownload(blob,`stika-wakala-${network}-${safe}-${cleanNumber(agentNumber)}.png`,"PNG");
      outputUsed.current=true;
      toast.success("Stika limepakuliwa kikamilifu.");
    } catch(error) {
      setEntryStatus("pending");
      toast.error(error instanceof Error?error.message:"Imeshindikana kupakua stika.");
    } finally { setBusy(false); }
  }
  function reset(){setAgentName("");setAgentNumber("");}
  const p=NETWORKS[network];
  if(entryStatus==="checking"||entryStatus==="failed") return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900"><section className="mx-auto mt-12 max-w-xl rounded-2xl border border-amber-300 bg-white p-6 shadow-xl"><div className="mb-4 text-center text-4xl">🔐</div><h1 className="text-center text-2xl font-black">STIKA ZA WAKALA</h1><p role="alert" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold leading-relaxed text-amber-950">{entryMessage || "Huduma haijafunguliwa."}</p>{entryStatus==="checking"?<p className="mt-4 text-center text-sm font-bold text-slate-600">Tafadhali subiri...</p>:<button type="button" onClick={()=>setLocation("/services")} className="mt-5 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold">Rudi kwenye huduma</button>}</section></main>;
  return <main className="min-h-screen bg-slate-50 px-3 py-5 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-center justify-between gap-3 rounded-2xl px-4 py-4 text-white shadow-sm sm:px-6" style={{background:p.deep}}>
        <div><p className="text-xs font-bold tracking-widest opacity-90">HUDUMA ZA MTANDAONI</p><h1 className="text-xl font-black sm:text-2xl">STIKA ZA WAKALA</h1><p className="mt-1 text-xs opacity-90">Airtel · Vodacom · Halotel · Yas</p></div><ShieldCheck className="h-7 w-7 shrink-0"/>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div role="status" className="mb-4 rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm leading-relaxed text-sky-950">
            <strong className="font-black">TAARIFA KUHUSU WATERMARK</strong>
            <p className="mt-1 text-xs font-semibold">Watermark huonekana kwenye hakikisho ili kulinda stika. Itatoweka moja kwa moja baada ya tokeni {serviceCost===null?"":serviceCost} kukatwa. Stika utakayopakua itakuwa safi bila watermark.</p>
          </div>
          <h2 className="mb-4 text-lg font-black">Taarifa za wakala</h2>
          <div className="mb-5">
            <span className="mb-2 block text-sm font-extrabold">Chagua mtandao</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                {id:"airtel",label:"Airtel",logo:"airtel-logo.png"},
                {id:"vodacom",label:"Vodacom",logo:"vodacom-logo.png"},
                {id:"halotel",label:"Halotel",logo:"halotel-logo.png"},
                {id:"yas",label:"Yas",logo:"yas-logo.png"},
              ] as const).map(item=>(
                <button key={item.id} type="button" onClick={()=>setNetwork(item.id)} aria-pressed={network===item.id}
                  className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 bg-white p-2 shadow-sm transition"
                  style={{borderColor:network===item.id?"#0284c7":"#e2e8f0",background:network===item.id?"#f0f9ff":"#fff"}}>
                  <img src={asset(item.logo)} alt={item.label} className="h-10 w-full max-w-[105px] object-contain" />
                  <span className="text-xs font-extrabold text-slate-800">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="mb-4 block"><span className="mb-2 block text-sm font-extrabold">Majina ya wakala</span>
            <input value={agentName} onChange={e=>setAgentName(e.target.value.slice(0,40))} maxLength={40} autoComplete="off" placeholder="Andika majina ya wakala" className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-base font-semibold uppercase outline-none focus:border-slate-500"/>
          </label>
          <label className="mb-5 block"><span className="mb-2 block text-sm font-extrabold">Namba ya wakala</span>
            <input value={agentNumber} onChange={e=>setAgentNumber(cleanNumber(e.target.value))} inputMode="numeric" maxLength={12} autoComplete="off" placeholder="Andika namba ya wakala" className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-base font-semibold outline-none focus:border-slate-500"/>
          </label>
          <button type="button" disabled={!valid||busy||!previewReady||entryStatus!=="pending"||outputUsed.current} onClick={downloadSticker} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-black text-white disabled:cursor-not-allowed disabled:opacity-40" style={{background:p.deep}}><Download className="h-5 w-5"/>{entryStatus==="charging"?"Inathibitisha tokeni...":busy?"Inaandaa...":!previewReady?"Subiri preview...":"PAKUA STIKA PNG"}</button>
          <button type="button" onClick={reset} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700"><RotateCcw className="h-4 w-4"/>Futa taarifa</button>
          {!valid&&(agentName||agentNumber)&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">Weka angalau majina mawili na namba yenye tarakimu 5 hadi 12.</p>}
        </section>
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-black">Muonekano wa stika</h2><p className="text-xs text-slate-500">{p.label} · Hakikisho la moja kwa moja</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">LIVE PREVIEW</span></div>
          <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-xl bg-slate-100 p-2 sm:p-4"><canvas ref={canvasRef} className="block h-auto w-full max-w-3xl shadow-lg" aria-label={`Stika ya wakala ${p.label}`}/>{entryStatus!=="paid"&&<div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            <span className="-rotate-[22deg] select-none whitespace-nowrap text-center text-[clamp(22px,4vw,52px)] font-black tracking-[.14em] text-white/65" style={{WebkitTextStroke:"1.5px rgba(15,23,42,.72)",textShadow:"0 2px 5px rgba(0,0,0,.55)"}}>SMARTSERVICESTZ</span>
          </div>}</div>
          <p className="mt-3 text-center text-xs text-slate-500">{previewError||(!previewReady?"Inapakia muundo wa stika...":"PNG itapakuliwa kwa mwonekano huu huu.")}</p>
        </section>
      </div>
    </div>
  </main>;
}
