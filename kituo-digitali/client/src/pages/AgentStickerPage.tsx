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
const W=1200,H=1500;
const cleanName=(v:string)=>v.trim().replace(/\s+/g," ").toUpperCase();
const cleanNumber=(v:string)=>v.replace(/\D/g,"").slice(0,12);

function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string,stroke?:string,line=1){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.lineWidth=line;ctx.strokeStyle=stroke;ctx.stroke();}
}
function fitText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,max:number,size:number,color:string,weight=900){
  let s=size;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle=color;
  ctx.font=`${weight} ${s}px Arial, Helvetica, sans-serif`;
  while(ctx.measureText(text).width>max&&s>24){s-=3;ctx.font=`${weight} ${s}px Arial, Helvetica, sans-serif`;}
  ctx.fillText(text,x,y,max);
}
function drawBrand(ctx:CanvasRenderingContext2D,network:NetworkKey,p:Palette){
  ctx.save();ctx.textAlign="left";ctx.textBaseline="middle";
  if(network==="airtel"){
    ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(116,125,36,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.base;ctx.beginPath();ctx.arc(116,125,20,0,Math.PI*2);ctx.fill();
    ctx.font="900 104px Arial";ctx.fillStyle="#fff";ctx.fillText("airtel",175,110);
    ctx.font="700 48px Arial";ctx.fillText("money",183,170);
  }else if(network==="vodacom"){
    ctx.strokeStyle="#fff";ctx.lineWidth=22;ctx.beginPath();ctx.arc(116,125,43,.3,Math.PI*1.8);ctx.stroke();
    ctx.font="900 80px Arial";ctx.fillStyle="#fff";ctx.fillText("vodacom",185,115);
    ctx.font="800 48px Arial";ctx.fillText("M-PESA",190,177);
    // Simu ndogo inayoashiria M-Pesa
    rounded(ctx,930,65,72,125,13,"#fff");rounded(ctx,939,77,54,92,5,p.base);
    ctx.fillStyle=p.base;ctx.beginPath();ctx.arc(966,179,5,0,Math.PI*2);ctx.fill();
  }else if(network==="halotel"){
    ctx.fillStyle=p.base;ctx.font="900 98px Arial";ctx.fillText("halopesa",120,130);
    ctx.fillStyle=p.accent;ctx.beginPath();ctx.arc(80,130,26,0,Math.PI*2);ctx.fill();
  }else{
    ctx.fillStyle=p.accent;ctx.beginPath();ctx.moveTo(75,90);ctx.quadraticCurveTo(90,48,150,55);ctx.quadraticCurveTo(210,60,208,115);ctx.quadraticCurveTo(205,170,135,188);ctx.quadraticCurveTo(90,190,75,155);ctx.closePath();ctx.fill();
    ctx.fillStyle=p.ink;ctx.font="900 92px Arial";ctx.fillText("yas",94,128);
    ctx.fillStyle="#fff";ctx.font="800 70px Arial";ctx.fillText("Wakala",300,130);
  }
  ctx.restore();
}
function drawSticker(canvas:HTMLCanvasElement,network:NetworkKey,name:string,number:string){
  const ctx=canvas.getContext("2d");if(!ctx)return;
  canvas.width=W;canvas.height=H;
  const p=NETWORKS[network];
  const grad=ctx.createLinearGradient(0,0,W,H);grad.addColorStop(0,p.base);grad.addColorStop(.58,p.deep);grad.addColorStop(1,p.base);
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  // Premium layered curves and subtle geometric texture
  ctx.save();ctx.globalAlpha=.16;ctx.strokeStyle="#fff";ctx.lineWidth=10;
  for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(1120,360+i*20,270+i*65,Math.PI*.35,Math.PI*1.25);ctx.stroke();}
  ctx.restore();
  if(network==="halotel"){
    ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(W,0);ctx.lineTo(W,330);ctx.quadraticCurveTo(570,210,0,365);ctx.closePath();ctx.fill();
    ctx.fillStyle=p.accent;ctx.beginPath();ctx.moveTo(0,285);ctx.quadraticCurveTo(600,110,W,270);ctx.lineTo(W,355);ctx.quadraticCurveTo(560,220,0,390);ctx.closePath();ctx.fill();
    drawBrand(ctx,network,p);
    fitText(ctx,"NAMBA YA WAKALA",600,440,1020,76,"#fff");
    fitText(ctx,"AGENT CODE",925,505,360,40,"#fff",800);
    // Six-digit ticket-like number cells
    const digits=cleanNumber(number)||"123456";
    const count=Math.max(6,digits.length),boxW=Math.min(170,1000/count),gap=12,total=count*boxW+(count-1)*gap,start=(W-total)/2;
    for(let i=0;i<count;i++){rounded(ctx,start+i*(boxW+gap),565,boxW,150,24,"#fff","#ffd2c8",3);fitText(ctx,digits[i]||"•",start+i*(boxW+gap)+boxW/2,640,boxW-18,108,"#111");}
    fitText(ctx,"Jina la Wakala",600,790,850,54,"#fff");
    rounded(ctx,72,850,1056,145,34,"#fff","#ffd5cf",3);
    fitText(ctx,cleanName(name)||"JINA LA WAKALA",600,923,980,66,"#111");
    fitText(ctx,"*** Hakiki jina la wakala kabla ya kuthibitisha muamala wako.",600,1100,1050,31,"#fff",700);
    ctx.fillStyle="#fff";ctx.font="700 29px Arial";ctx.textAlign="center";ctx.fillText("halotel.co.tz     •     HaloPesa     •     Hotline 100",600,1375);
  }else{
    drawBrand(ctx,network,p);
    if(network==="yas"){
      fitText(ctx,"NAMBA YA WAKALA",600,330,1020,76,"#fff");
      fitText(ctx,"AGENT NUMBER",600,390,800,28,"#d9eaff",800);
    }else{
      fitText(ctx,"NAMBA YA WAKALA",600,335,1050,76,"#fff");
    }
    rounded(ctx,72,405,1056,230,34,"#fff",network==="yas"?"#ffdf00":"#ffdce0",5);
    fitText(ctx,cleanNumber(number)||"0000000",600,520,990,160,network==="yas"?"#082d68":"#080808",950);
    // Number plate lower accent
    rounded(ctx,72,690,1056,12,6,p.accent);
    fitText(ctx,"JINA LA WAKALA",600,790,900,62,"#fff");
    rounded(ctx,72,860,1056,155,32,"#fff",network==="yas"?"#ffdf00":"#ffdce0",4);
    fitText(ctx,cleanName(name)||"JINA LA WAKALA",600,938,980,72,p.ink,950);
    if(network==="airtel"){
      ctx.fillStyle="#fff";ctx.font="italic 700 37px Arial";ctx.textAlign="left";ctx.fillText("Urahisi, Kasi na Usalama",75,1210);
      ctx.textAlign="right";ctx.font="900 70px Arial";ctx.fillText("airtel",1110,1285);
      ctx.font="700 32px Arial";ctx.fillText("money",1110,1330);
    }else if(network==="vodacom"){
      // White/red M-Pesa footer with phone illustration
      ctx.save();ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(0,1190);ctx.quadraticCurveTo(500,1060,W,1160);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();
      rounded(ctx,115,1170,170,250,28,"#111");rounded(ctx,128,1187,144,208,16,p.base);
      ctx.fillStyle="#fff";ctx.font="900 29px Arial";ctx.textAlign="center";ctx.fillText("m-pesa",200,1290);
      ctx.fillStyle=p.base;ctx.font="900 54px Arial";ctx.textAlign="right";ctx.fillText("vodacom",1110,1300);
      ctx.font="800 30px Arial";ctx.fillText("M-PESA",1110,1350);ctx.restore();
    }else{
      ctx.fillStyle="#fff";ctx.font="800 40px Arial";ctx.textAlign="left";ctx.fillText("Lipa  •  Tuma  •  Pokea",80,1210);
      rounded(ctx,930,1110,95,190,18,"#fff");rounded(ctx,942,1125,71,150,10,p.deep);
      ctx.fillStyle=p.accent;ctx.font="900 76px Arial";ctx.textAlign="right";ctx.fillText("yas",1100,1370);
    }
  }
  // Outer keyline
  ctx.strokeStyle=network==="yas"?"#ffdf00":"#ffffffd9";ctx.lineWidth=9;ctx.beginPath();ctx.roundRect(20,20,W-40,H-40,38);ctx.stroke();
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
