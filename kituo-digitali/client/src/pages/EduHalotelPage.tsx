import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, ImagePlus, PenLine, RotateCcw, GraduationCap, UserRound, Search, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { consumeFirebaseTokens, getServiceTokenConfig } from "@/lib/firebase";
import { triggerDownload } from "@/lib/downloadHistory";
import "./EduHalotelPage.css";

const COLLEGES = ["Maswa Clinical Training Center (CTC)", "Kahama Clinical Training Center", "Sengerema Health Training Institute", "Chuo kingine"];
const COURSES = ["Nursing and Midwifery", "Clinical Medicine", "Medical Laboratory Sciences", "Pharmaceutical Sciences", "Health Records and Information Technology", "Social Work", "Accountancy", "Secretarial Studies"];
const today = () => new Date().toISOString().slice(0, 10);
const collegeCode = (college: string) => college.includes("Maswa") ? "CTC" : college.includes("Kahama") ? "KCT" : college.includes("Sengerema") ? "SHTI" : "EDU";
const makeReg = (college: string, year: string) => `NS/${collegeCode(college)}/${year.slice(-2)}/${String(Date.now() % 10000).padStart(4, "0")}`;
const fmt = (v: string) => v ? new Date(v + "T00:00:00").toLocaleDateString("en-GB") : "—";
const rounded = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(img); img.src = src; });
type Student = { name:string; college:string; customCollege:string; course:string; startYear:string; endYear:string; issueDate:string; regNo:string; photo:string; signature:string; postal:string; email:string; phone:string; website:string };

async function drawFront(canvas: HTMLCanvasElement, s: Student, qr: string) {
  const c=canvas.getContext("2d"); if(!c)return;
  const W=1010,H=640;canvas.width=W;canvas.height=H;
  const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,"#10284b");g.addColorStop(.56,"#145b78");g.addColorStop(1,"#1a9b91");c.fillStyle=g;c.fillRect(0,0,W,H);
  c.globalAlpha=.12;for(let i=0;i<8;i++){c.beginPath();c.arc(850,80,i*62+90,0,Math.PI*2);c.strokeStyle="#fff";c.lineWidth=2;c.stroke()}c.globalAlpha=1;
  c.fillStyle="#ffffff";c.beginPath();c.arc(67,55,26,0,Math.PI*2);c.fill();c.fillStyle="#145b78";c.font="900 15px Arial";c.textAlign="center";c.fillText("EDU",67,60);c.textAlign="left";c.fillStyle="#fff";c.font="900 30px Arial";c.fillText("EDU-HALOTEL",108,54);c.font="700 17px Arial";c.fillText((s.customCollege||s.college||"COLLEGE NAME").toUpperCase(),108,84);c.textAlign="right";c.font="800 18px Arial";c.fillText("STUDENT IDENTITY CARD",968,56);c.textAlign="left";c.fillStyle="#d7f5f2";c.fillRect(42,104,926,3);
  c.fillStyle="#fff";rounded(c,48,140,250,330,22);c.fill();
  if(s.photo){const img=await loadImage(s.photo);if(img.naturalWidth){c.save();rounded(c,60,152,226,286,14);c.clip();const scale=Math.max(226/img.width,286/img.height),dw=img.width*scale,dh=img.height*scale;c.drawImage(img,60+(226-dw)/2,152+(286-dh)/2,dw,dh);c.restore();}}
  else{c.fillStyle="#e7eef4";rounded(c,60,152,226,286,14);c.fill();c.fillStyle="#7890a6";c.beginPath();c.arc(173,250,55,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(173,390,83,92,0,Math.PI,Math.PI*2);c.fill();}
  c.fillStyle="#163a55";c.font="800 15px Arial";c.textAlign="center";c.fillText("STUDENT PHOTO",173,455);c.textAlign="left";
  c.fillStyle="#fff";c.font="900 35px Arial";c.fillText(s.name.trim().toUpperCase()||"FULL STUDENT NAME",340,174,620);
  const lines:[string,string][]=[["COURSE",s.course||"—"],["REGISTRATION NO.",s.regNo||"—"],["ISSUED",fmt(s.issueDate)],["VALID UNTIL",s.endYear?`31/12/${s.endYear}`:"—"],["YEAR OF STUDY",s.startYear&&s.endYear?`${s.startYear} – ${s.endYear}`:"—"]];
  let y=235;for(const [label,value] of lines){c.fillStyle="#b8e7e7";c.font="700 14px Arial";c.fillText(label,340,y);c.fillStyle="#fff";c.font="700 21px Arial";c.fillText(value,340,y+29);y+=70;}
  c.fillStyle="#fff";c.fillRect(340,590,360,2);c.fillStyle="#e8ffff";c.font="italic 15px Arial";c.fillText("Signature of Bearer",340,615);
  if(s.signature){const img=await loadImage(s.signature);if(img.naturalWidth)c.drawImage(img,350,540,190,48);}
  if(qr){const img=await loadImage(qr);if(img.naturalWidth){c.fillStyle="#fff";rounded(c,810,490,150,130,12);c.fill();c.drawImage(img,820,500,110,110);}}
  c.fillStyle="#d8f7f2";c.font="700 12px Arial";c.textAlign="right";c.fillText((s.customCollege||s.college||"COLLEGE").toUpperCase(),968,620);c.textAlign="left";
}
async function drawBack(canvas: HTMLCanvasElement,s:Student,qr:string){
  const c=canvas.getContext("2d");if(!c)return;const W=1010,H=640;canvas.width=W;canvas.height=H;c.fillStyle="#f5f8fc";c.fillRect(0,0,W,H);const g=c.createLinearGradient(0,0,W,0);g.addColorStop(0,"#10284b");g.addColorStop(1,"#168d91");c.fillStyle=g;c.fillRect(0,0,W,112);
  c.fillStyle="#fff";c.font="900 30px Arial";c.fillText("STUDENT CARD AGREEMENT",42,52);c.font="600 15px Arial";c.fillText("EDU-HALOTEL · STUDENT SERVICES",42,82);c.globalAlpha=.055;c.fillStyle="#145b78";c.font="900 120px Arial";c.textAlign="center";c.fillText("EDU",505,390);c.globalAlpha=.12;c.strokeStyle="#168d91";c.lineWidth=2;for(let k=-400;k<1200;k+=28){c.beginPath();c.moveTo(k,112);c.lineTo(k+260,640);c.stroke()}c.globalAlpha=1;c.textAlign="left";
  c.fillStyle="#263b52";c.font="600 19px Arial";c.fillText("This card remains the property of the issuing institution.",48,160);c.font="16px Arial";c.fillText("It must be presented when requested and returned upon completion",48,190);c.fillText("or termination of studies. If found, please return it to the institution.",48,218);
  const boxes:[string,string,string,string][]=[["POSTAL ADDRESS",s.postal,"EMAIL",s.email],["PHONE",s.phone,"WEBSITE",s.website]];let y=270;for(const row of boxes){let x=48;for(let i=0;i<4;i+=2){c.fillStyle="#fff";rounded(c,x,y,430,72,12);c.fill();c.fillStyle="#16858b";c.font="800 12px Arial";c.fillText(row[i],x+18,y+25);c.fillStyle="#1c2d42";c.font="700 17px Arial";c.fillText(row[i+1]||"Not provided",x+18,y+52);x+=450;}y+=90;}
  c.fillStyle="#d6e1ea";c.fillRect(48,470,914,2);const seed=s.regNo||"EDUHALOTEL";let x=50;for(let i=0;i<seed.length*5;i++){const code=seed.charCodeAt(i%seed.length),bw=1+(code*(i+3)%4);c.fillStyle="#12263d";c.fillRect(x,495,bw,72);x+=bw+2;if(x>700)break;}
  c.fillStyle="#182b42";c.font="800 18px monospace";c.fillText(s.regNo||"REGISTRATION NUMBER",50,596);
  if(qr){const img=await loadImage(qr);if(img.naturalWidth){c.fillStyle="#fff";c.fillRect(815,470,145,145);c.drawImage(img,823,478,129,129);}}
  c.fillStyle="#53677c";c.font="italic 13px Arial";c.textAlign="right";c.fillText("Issued in accordance with institutional policy",960,625);c.textAlign="left";
}

export default function EduHalotelPage(){
 const {firebaseUser}=useAuth();
 const [s,setS]=useState<Student>({name:"",college:COLLEGES[0],customCollege:"",course:COURSES[0],startYear:"2026",endYear:"2029",issueDate:today(),regNo:makeReg(COLLEGES[0],"2026"),photo:"",signature:"",postal:"",email:"",phone:"",website:""});
 const [qr,setQr]=useState("");const [busy,setBusy]=useState(false);const [paid,setPaid]=useState(false);
 const front=useRef<HTMLCanvasElement>(null),back=useRef<HTMLCanvasElement>(null),sig=useRef<HTMLCanvasElement>(null),file=useRef<HTMLInputElement>(null),drag=useRef(false),renderReady=useRef<Promise<void>>(Promise.resolve());
 const update=(key:keyof Student,value:string)=>setS(p=>({...p,[key]:value}));
 useEffect(()=>{setPaid(false)},[s]);\n const qrPayload=useMemo(()=>JSON.stringify({name:s.name, college:s.customCollege||s.college, course:s.course, regNo:s.regNo, validUntil:s.endYear}),[s]);
 useEffect(()=>{let ok=true;QRCode.toDataURL(qrPayload,{width:280,margin:1,errorCorrectionLevel:"M"}).then(v=>{if(ok)setQr(v)});return()=>{ok=false}},[qrPayload]);
 useEffect(()=>{renderReady.current=Promise.all([front.current?drawFront(front.current,s,qr):Promise.resolve(),back.current?drawBack(back.current,s,qr):Promise.resolve()]).then(()=>undefined)},[s,qr]);
 const saveSignature=()=>{if(!sig.current)return;update("signature",sig.current.toDataURL("image/png"));toast.success("Saini limehifadhiwa.");};
 const clearSignature=()=>{const c=sig.current?.getContext("2d");if(c&&sig.current){c.clearRect(0,0,sig.current.width,sig.current.height);update("signature","");}};
 const pointer=(e:React.PointerEvent<HTMLCanvasElement>)=>{const c=sig.current;if(!c)return;const r=c.getBoundingClientRect();const x=(e.clientX-r.left)*c.width/r.width,y=(e.clientY-r.top)*c.height/r.height;const ctx=c.getContext("2d");if(!ctx)return;if(e.type==="pointerdown"){drag.current=true;c.setPointerCapture(e.pointerId);ctx.beginPath();ctx.moveTo(x,y)}else if(e.type==="pointermove"&&drag.current){ctx.lineWidth=3;ctx.lineCap="round";ctx.strokeStyle="#163c69";ctx.lineTo(x,y);ctx.stroke()}else if(e.type==="pointerup"||e.type==="pointercancel"){drag.current=false}};
 const choosePhoto=(f?:File)=>{if(!f)return;if(!f.type.startsWith("image/")){toast.error("Chagua picha pekee.");return;}if(f.size>5*1024*1024){toast.error("Picha isizidi 5 MB.");return;}const reader=new FileReader();reader.onload=()=>update("photo",String(reader.result));reader.readAsDataURL(f)};
 const download=async(side:"front"|"back")=>{if(!firebaseUser){toast.error("Ingia kwanza.");return;}if(!s.name.trim()||!s.regNo.trim()||!s.college){toast.error("Jaza jina, chuo na namba ya usajili.");return;}setBusy(true);try{if(!paid){const cfg=await getServiceTokenConfig("edu-halotel");await consumeFirebaseTokens(firebaseUser.uid,{slug:"edu-halotel",name:cfg.name||"EDU-HALOTEL STUDENT ID",tokenCost:cfg.tokenCost,kind:cfg.isFree||cfg.tokenCost===0?"free":"paid",tokenType:"huduma"},crypto.randomUUID());setPaid(true);}await renderReady.current;const canvas=side==="front"?front.current:back.current;if(!canvas)throw new Error("Preview haipo tayari.");const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Imeshindikana kuandaa PNG.")),"image/png"));await triggerDownload(blob,`EDU-HALOTEL-${s.regNo.replace(/[^A-Za-z0-9-]/g,"-")}-${side.toUpperCase()}.png`,"PNG",{source:"edu-halotel"});toast.success(`Pande ya ${side==="front"?"mbele":"nyuma"} imepakuliwa.`);}catch(e:any){toast.error(e?.message||"Imeshindikana kupakua kitambulisho.");}finally{setBusy(false)}};
 return <main className="edu-page">
  <header className="edu-hero"><span className="edu-mark"><GraduationCap size={28}/></span><div><span className="edu-kicker">SMARTSERVICESTZ · EDUCATION TOOLS</span><h1>EDU-HALOTEL</h1><p>Student ID Card Generator · Tengeneza vitambulisho vya wanafunzi vya pande mbili</p></div></header>
  <div className="edu-layout">
   <section className="edu-form-card"><div className="edu-card-heading"><div><span className="edu-step">01 · STUDENT PROFILE</span><h2>Taarifa za mwanafunzi</h2></div><UserRound/></div>
    <label className="edu-upload" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();choosePhoto(e.dataTransfer.files[0])}}><input ref={file} type="file" accept="image/*" hidden onChange={e=>choosePhoto(e.target.files?.[0])}/>{s.photo?<img src={s.photo} alt="Student preview"/>:<span className="edu-upload-icon"><ImagePlus size={27}/></span>}<span><b>{s.photo?"Badilisha picha ya mwanafunzi":"Pakia picha ya mwanafunzi"}</b><small>Buruta picha hapa au bonyeza kuchagua · JPG/PNG · max 5MB</small></span><button type="button" onClick={e=>{e.preventDefault();file.current?.click()}}>Chagua picha</button></label>
    <div className="edu-fields"><label className="edu-field edu-wide"><span>Jina kamili la mwanafunzi</span><input value={s.name} onChange={e=>update("name",e.target.value)} placeholder="Mfano: Amina Juma"/></label>
     <label className="edu-field"><span>Chagua au tafuta chuo</span><input list="edu-colleges" value={s.college==="Chuo kingine"?s.customCollege:s.college} onChange={e=>{const value=e.target.value;const known=COLLEGES.includes(value);update("college",known?value:"Chuo kingine");update("customCollege",known?"":value);update("regNo",makeReg(known?value:"Chuo kingine",s.startYear))}} placeholder="Tafuta jina la chuo"/><datalist id="edu-colleges">{COLLEGES.map(v=><option key={v} value={v}/>)}</datalist></label>
     {s.college==="Chuo kingine"&&!s.customCollege&&<label className="edu-field"><span>Andika jina la chuo</span><input value={s.customCollege} onChange={e=>update("customCollege",e.target.value)} placeholder="Jina kamili la chuo"/></label>}
     <label className="edu-field"><span>Kozi</span><input list="edu-courses" value={s.course} onChange={e=>update("course",e.target.value)} placeholder="Tafuta au chagua kozi"/><datalist id="edu-courses">{COURSES.map(v=><option key={v} value={v}/>)}</datalist></label>
     <label className="edu-field"><span>Mwaka wa kuanza</span><select value={s.startYear} onChange={e=>{update("startYear",e.target.value);update("regNo",makeReg(s.college,e.target.value))}}>{Array.from({length:12},(_,i)=>String(2024+i)).map(v=><option key={v}>{v}</option>)}</select></label>
     <label className="edu-field"><span>Mwaka wa kumaliza</span><select value={s.endYear} onChange={e=>update("endYear",e.target.value)}>{Array.from({length:12},(_,i)=>String(2025+i)).map(v=><option key={v}>{v}</option>)}</select></label>
     <label className="edu-field"><span>Tarehe ya kutolewa</span><input type="date" value={s.issueDate} onChange={e=>update("issueDate",e.target.value)}/></label>
     <label className="edu-field"><span>Namba ya usajili</span><input value={s.regNo} onChange={e=>update("regNo",e.target.value)} /></label>
    </div>
    <div className="edu-sign-title"><PenLine size={17}/><b>Saini ya mwanafunzi</b><small>Chora kwa kidole au mouse</small></div><canvas ref={sig} className="edu-sign-pad" width={720} height={170} onPointerDown={pointer} onPointerMove={pointer} onPointerUp={pointer} onPointerCancel={pointer}/><div className="edu-sign-actions"><button type="button" onClick={clearSignature}><RotateCcw size={15}/> Futa</button><button type="button" onClick={saveSignature}><CheckCircle2 size={15}/> Hifadhi saini</button></div>
    <div className="edu-sign-title"><Search size={17}/><b>Taarifa za chuo kwa upande wa nyuma</b><small>Hiari · jaza zinazopatikana</small></div><div className="edu-fields"><label className="edu-field"><span>Anwani ya posta</span><input value={s.postal} onChange={e=>update("postal",e.target.value)} placeholder="P.O. Box..."/></label><label className="edu-field"><span>Barua pepe</span><input type="email" value={s.email} onChange={e=>update("email",e.target.value)} placeholder="info@college.ac.tz"/></label><label className="edu-field"><span>Namba ya simu</span><input value={s.phone} onChange={e=>update("phone",e.target.value)} placeholder="+255..."/></label><label className="edu-field"><span>Tovuti</span><input value={s.website} onChange={e=>update("website",e.target.value)} placeholder="www.college.ac.tz"/></label></div>
   </section>
   <section className="edu-preview-card"><div className="edu-card-heading"><div><span className="edu-step">02 · LIVE PREVIEW</span><h2>Hakikisho la kitambulisho</h2></div><span className="edu-live"><i/> LIVE</span></div><div className="edu-side-label">UPANDE WA MBELE</div><canvas ref={front} className="edu-id-canvas"/><div className="edu-side-label">UPANDE WA NYUMA</div><canvas ref={back} className="edu-id-canvas"/><div className="edu-downloads"><button type="button" disabled={busy} onClick={()=>void download("front")}><Download size={17}/> {busy?"Inatengeneza...":"Pakua upande wa mbele"}</button><button type="button" disabled={busy} onClick={()=>void download("back")}><Download size={17}/> Pakua upande wa nyuma</button></div><p className="edu-disclaimer">QR code na barcode ni za utambuzi wa taarifa ulizoweka. Taarifa za chuo na mamlaka ya kutoa kitambulisho lazima zithibitishwe na taasisi husika. Muundo huu si kitambulisho rasmi mpaka chuo kiidhinishe.</p></section>
  </div>
 </main>;
}
