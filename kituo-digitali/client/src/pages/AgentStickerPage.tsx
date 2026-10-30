import { useEffect, useRef, useState } from "react";
import { Download, RotateCcw, ShieldCheck } from "lucide-react";
import { triggerDownload } from "@/lib/downloadHistory";

type NetworkKey = "airtel" | "vodacom" | "halotel" | "yas";
type Palette = { label:string; base:string; deep:string; accent:string; ink:string; brand:string; sub:string };
const NETWORKS: Record<NetworkKey,Palette> = {
  airtel:{label:"Airtel Money",base:"#ed101e",deep:"#a90018",accent:"#fff",ink:"#111827",brand:"airtel",sub:"money"},
  vodacom:{label:"Vodacom M-Pesa",base:"#ed1730",deep:"#a90020",accent:"#fff",ink:"#111827",brand:"vodacom",sub:"M-PESA"},
  halotel:{label:"Halotel HaloPesa",base:"#f12618",deep:"#c90013",accent:"#ff8a00",ink:"#151515",brand:"halopesa",sub:""},
  yas:{label:"Yas",base:"#0754b8",deep:"#06265f",accent:"#ffdf00",ink:"#092d63",brand:"yas",sub:"wakala"},
};
const W=1500,H=1050;
const cleanName=(v:string)=>v.trim().replace(/\\s+/g," ").toUpperCase();
const cleanNumber=(v:string)=>v.replace(/\\D/g,"").slice(0,12);

function round(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string,stroke?:string,line=1){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.lineWidth=line;ctx.strokeStyle=stroke;ctx.stroke();}
}
function textFit(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,max:number,size:number,color:string,weight=900){
  let s=size;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle=color;
  ctx.font=`${weight} ${s}px Arial, Helvetica, sans-serif`;
  while(ctx.measureText(value).width>max&&s>22){s-=3;ctx.font=`${weight} ${s}px Arial, Helvetica, sans-serif`;}
  ctx.fillText(value,x,y,max);
}
function brand(ctx:CanvasRenderingContext2D,n:NetworkKey){
  ctx.save();ctx.textAlign="center";ctx.textBaseline="middle";
  if(n==="airtel"){
    // Airtel Money wordmark at top and repeated at the foot, like the supplied reference.
    ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(505,95);ctx.bezierCurveTo(440,10,330,38,335,112);ctx.bezierCurveTo(340,190,430,182,455,127);ctx.bezierCurveTo(410,164,385,135,408,103);ctx.bezierCurveTo(438,65,486,83,505,95);ctx.fill();
    ctx.fillStyle="#fff";ctx.textAlign="left";ctx.font="900 112px Arial";ctx.fillText("airtel",520,100);
    ctx.font="800 62px Arial";ctx.fillText("Money",530,170);
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
function drawSticker(canvas:HTMLCanvasElement,network:NetworkKey,name:string,number:string){
  const ctx=canvas.getContext("2d");if(!ctx)return;
  canvas.width=W;canvas.height=H;
  const p=NETWORKS[network],nm=cleanName(name)||"JINA LA WAKALA",num=cleanNumber(number)||"000000";
  if(network==="halotel"){
    // White upper field and the orange/red sweeping bands from the user's HaloPesa sample.
    ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
    const g=ctx.createLinearGradient(0,180,W,570);g.addColorStop(0,"#ff7a00");g.addColorStop(.45,"#ff3212");g.addColorStop(1,"#e60012");
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,245);ctx.quadraticCurveTo(710,145,1500,245);ctx.lineTo(1500,1050);ctx.lineTo(0,1050);ctx.closePath();ctx.fill();
    ctx.fillStyle="#ff8b00";ctx.beginPath();ctx.moveTo(0,275);ctx.quadraticCurveTo(640,185,1500,285);ctx.lineTo(1500,370);ctx.quadraticCurveTo(730,245,0,390);ctx.closePath();ctx.fill();
    brand(ctx,network);
    textFit(ctx,"Namba ya Wakala",750,345,1260,92,"#fff",900);
    textFit(ctx,"AGENT CODE",1110,420,340,48,"#fff",800);
    const digits=num.split("");const gap=12,boxW=Math.min(205,1320/digits.length),total=digits.length*boxW+(digits.length-1)*gap,left=(W-total)/2;
    digits.forEach((d,i)=>{const x=left+i*(boxW+gap);round(ctx,x,485,boxW,175,24,"#fff","#f4d5d5",3);textFit(ctx,d,x+boxW/2,573,boxW-18,135,"#080808",950);});
    // thin white rules flanking the label, as in the supplied artwork
    ctx.strokeStyle="#fff";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(90,735);ctx.lineTo(510,735);ctx.moveTo(990,735);ctx.lineTo(1410,735);ctx.stroke();
    textFit(ctx,"Jina la Wakala",750,735,440,58,"#fff",900);
    round(ctx,90,780,1320,135,30,"#fff","#f4dddd",3);
    textFit(ctx,nm,750,848,1240,78,"#090909",950);
    textFit(ctx,"*** Hakiki jina la wakala kabla hujathibitisha muamala wako.",750,968,1350,34,"#fff",700);
    ctx.textAlign="center";ctx.font="700 26px Arial";ctx.fillStyle="#fff";ctx.fillText("halotel.co.tz      •      halopesa *150*88#      •      Hotline 100",750,1022);
  }else{
    const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,network==="yas"?"#0878ce":network==="airtel"?"#f20c1b":"#f10b1c");bg.addColorStop(.55,network==="yas"?"#064d9d":network==="airtel"?"#e0001b":"#df0019");bg.addColorStop(1,network==="yas"?"#052b66":"#b90018");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    // Clean solid field and a fine inset outline, matching the rectangular source stickers.
    round(ctx,18,18,W-36,H-36,48,"rgba(0,0,0,0)","#fff",7);
    brand(ctx,network);
    textFit(ctx,"NAMBA YA WAKALA",750,300,1360,104,"#fff",950);
    if(network==="yas")textFit(ctx,"AGENT NUMBER",750,365,1000,35,"#d9edff",800);
    round(ctx,65,380,1370,220,36,"#fff","#e8e8e8",5);
    textFit(ctx,num,750,490,1280,176,network==="yas"?"#073b79":"#050505",950);
    textFit(ctx,network==="airtel"?"JINA":network==="vodacom"?"JINA LA WAKALA":"JINA LA WAKALA",750,685,1150,66,"#fff",900);
    round(ctx,70,735,1360,160,34,"#fff","#e6e6e6",5);
    textFit(ctx,nm,750,815,1280,88,network==="yas"?"#073b79":"#050505",950);
    if(network==="airtel"){
      ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="900 86px Arial";ctx.fillText("airtel",750,975);
      ctx.font="700 40px Arial";ctx.fillText("Money",750,1015);
    }else if(network==="vodacom"){
      ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="900 86px Arial";ctx.fillText("◉ vodacom",750,975);
      ctx.font="800 40px Arial";ctx.fillText("m-pesa",750,1015);
    }else{
      ctx.fillStyle="#ffdf00";ctx.textAlign="center";ctx.font="900 84px Arial";ctx.fillText("yas",750,980);
    }
  }
}

export default function AgentStickerPage(){
  const [network,setNetwork]=useState<NetworkKey>("airtel");
  const [agentName,setAgentName]=useState("");
  const [agentNumber,setAgentNumber]=useState("");
  const [busy,setBusy]=useState(false);
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const valid=cleanName(agentName).split(" ").filter(Boolean).length>=2 && /^\d{5,12}$/.test(cleanNumber(agentNumber));
  useEffect(()=>{if(canvasRef.current)drawSticker(canvasRef.current,network,agentName,agentNumber);},[network,agentName,agentNumber]);
  function downloadSticker(){
    const canvas=canvasRef.current;if(!canvas||!valid||busy)return;setBusy(true);
    canvas.toBlob(blob=>{if(blob){const safe=cleanName(agentName).replace(/\s+/g,"-").toLowerCase();triggerDownload(blob,`stika-wakala-${network}-${safe}-${cleanNumber(agentNumber)}.png`,"PNG");}setBusy(false);},"image/png",1);
  }
  function reset(){setAgentName("");setAgentNumber("");}
  const p=NETWORKS[network];
  return <main className="min-h-screen bg-slate-50 px-3 py-5 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex items-center justify-between gap-3 rounded-2xl px-4 py-4 text-white shadow-sm sm:px-6" style={{background:p.deep}}>
        <div><p className="text-xs font-bold tracking-widest opacity-90">HUDUMA ZA MTANDAONI</p><h1 className="text-xl font-black sm:text-2xl">STIKA ZA WAKALA</h1><p className="mt-1 text-xs opacity-90">Airtel · Vodacom · Halotel · Yas</p></div><ShieldCheck className="h-7 w-7 shrink-0"/>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-black">Taarifa za wakala</h2>
          <label className="mb-4 block"><span className="mb-2 block text-sm font-extrabold">Chagua mtandao</span>
            <select value={network} onChange={e=>setNetwork(e.target.value as NetworkKey)} className="h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-base font-semibold outline-none focus:border-slate-500">
              <option value="airtel">Airtel Money</option><option value="vodacom">Vodacom M-Pesa</option><option value="halotel">Halotel HaloPesa</option><option value="yas">Yas</option>
            </select>
          </label>
          <label className="mb-4 block"><span className="mb-2 block text-sm font-extrabold">Majina ya wakala</span>
            <input value={agentName} onChange={e=>setAgentName(e.target.value.slice(0,40))} maxLength={40} autoComplete="off" placeholder="Andika majina ya wakala" className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-base font-semibold uppercase outline-none focus:border-slate-500"/>
          </label>
          <label className="mb-5 block"><span className="mb-2 block text-sm font-extrabold">Namba ya wakala</span>
            <input value={agentNumber} onChange={e=>setAgentNumber(cleanNumber(e.target.value))} inputMode="numeric" maxLength={12} autoComplete="off" placeholder="Andika namba ya wakala" className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-base font-semibold outline-none focus:border-slate-500"/>
          </label>
          <button type="button" disabled={!valid||busy} onClick={downloadSticker} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-black text-white disabled:cursor-not-allowed disabled:opacity-40" style={{background:p.deep}}><Download className="h-5 w-5"/>{busy?"Inaandaa...":"PAKUA STIKA PNG"}</button>
          <button type="button" onClick={reset} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700"><RotateCcw className="h-4 w-4"/>Futa taarifa</button>
          {!valid&&(agentName||agentNumber)&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">Weka angalau majina mawili na namba yenye tarakimu 5 hadi 12.</p>}
        </section>
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-black">Muonekano wa stika</h2><p className="text-xs text-slate-500">{p.label} · Hakikisho la moja kwa moja</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">LIVE PREVIEW</span></div>
          <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl bg-slate-100 p-2 sm:p-4"><canvas ref={canvasRef} className="block h-auto w-full max-w-3xl shadow-lg" aria-label={`Stika ya wakala ${p.label}`}/></div>
          <p className="mt-3 text-center text-xs text-slate-500">Faili la PNG litakuwa sawa kabisa na muonekano huu.</p>
        </section>
      </div>
    </div>
  </main>;
}
