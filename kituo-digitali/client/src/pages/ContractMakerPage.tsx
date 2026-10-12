import { useState } from "react";
import { ArrowLeft, FileText, Printer, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";

type LetterData = {
  studentName:string; nida:string; idNumber:string; authorizer:string;
  position:string; authorizationDate:string; directorName:string;
  institution:string; directorDate:string;
};
const initial:LetterData={
  studentName:"JOYCE SEBASTIAN",nida:"1990122722100000119",idNumber:"OUT-MAN-0040-2025",
  authorizer:"ABDALLAH JUMA",position:"ADMINISTRATOR",authorizationDate:"2026-10-12",
  directorName:"PAUL HASSAN",institution:"OPEN UNIVERSITY — MANYARA BRANCH",directorDate:"2026-10-12"
};
const fields:{key:keyof LetterData;label:string;type?:string}[]=[
 {key:"studentName",label:"Jina kamili la mwanafunzi"},
 {key:"nida",label:"Namba ya NIDA"},
 {key:"idNumber",label:"Namba ya kitambulisho"},
 {key:"authorizer",label:"Jina la mtoa idhini"},
 {key:"position",label:"Cheo"},
 {key:"authorizationDate",label:"Tarehe ya mtoa idhini",type:"date"},
 {key:"directorName",label:"Jina la Branch Director"},
 {key:"institution",label:"Taasisi / tawi"},
 {key:"directorDate",label:"Tarehe ya uthibitisho",type:"date"}
];
const fmt=(v:string)=>v?new Date(v+"T12:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}):"...............";
export default function ContractMakerPage(){
 const [,navigate]=useLocation();const [data,setData]=useState(initial);
 const update=(key:keyof LetterData,value:string)=>setData(old=>({...old,[key]:value}));
 return <main className="student-letter-overlay">
  <header className="slo-top no-print"><button onClick={()=>navigate("/")}><ArrowLeft size={17}/> Rudi mwanzo</button><div><small>SMARTSERVICESTZ • KIELELEZO CHA KUJAZA</small><h1><FileText/> Tengeneza Barua ya Uthibitisho</h1><p>Maandishi yanawekwa kwenye nafasi zinazolingana na barua ya mfano.</p></div></header>
  <div className="slo-warning no-print"><b>KIELELEZO TU.</b> Taarifa za mfano zimewekwa kwa ajili ya preview. Barua rasmi, saini na muhuri lazima vithibitishwe na chuo.</div>
  <div className="slo-layout">
   <section className="slo-form no-print"><div className="slo-form-head"><h2>Taarifa za kujaza</h2><button onClick={()=>setData(initial)}><RotateCcw size={14}/> Rudisha mfano</button></div>
    <div className="slo-fields">{fields.map(f=><label key={f.key}><span>{f.label}</span><input type={f.type??"text"} value={data[f.key]} onChange={e=>update(f.key,e.target.value)}/></label>)}</div>
    <button className="slo-print" onClick={()=>window.print()}><Printer size={17}/> Pakua PDF / Chapisha</button><p>Chagua “Save as PDF”. Angalia mpangilio kabla ya kuchapisha.</p>
   </section>
   <section className="slo-preview"><div className="slo-label no-print">LIVE PREVIEW • A4</div>
    <article className="slo-paper">
     <div className="slo-head"><div className="slo-logo"><b>OUT</b><small>THE OPEN UNIVERSITY<br/>OF TANZANIA</small></div><div className="slo-address"><div>THE OPEN UNIVERSITY OF TANZANIA</div><div>MANYARA REGIONAL CENTER</div><div>PO.BOX 271 BABATI-MANYARA</div></div></div>
     <div className="slo-recipient"><div>Manager,</div><div>Halotel Manyara Branch,</div><div>Manyara.</div></div>
     <h2>REF: STUDENT CONFIRMATION LETTER</h2>
     <p>Reference is made to the above heading.</p>
     <p className="slo-student-line">I wish to confirm that <span className="slo-write student">{data.studentName||"...................................."}</span> with nida<br className="slo-linebreak"/> number <span className="slo-write nida">{data.nida||"........................................"}</span> and ID number <span className="slo-write idnum">{data.idNumber||"........................................"}</span><br/> is a student at our institution who not yet received physical ID card.</p>
     <p>Kindly assist HIM/HER to register new Halotel EDUCATION sim card from your team and become one of the students who will be receiving monthly communication support.</p>
     <p>For student’s government</p>
     <div className="slo-auth">
      <div>Name of authorizer <span className="slo-write">{data.authorizer||"........................................"}</span></div>
      <div>Position <span className="slo-write">{data.position||"........................................"}</span></div>
      <div>Signature <span className="slo-sign-line"></span></div>
      <div>Date <span className="slo-write">{fmt(data.authorizationDate)}</span></div>
     </div>
     <div className="slo-seal"><b>THE OPEN UNIVERSITY OF TANZANIA</b><span>MANYARA REGIONAL CENTRE</span><small>PO BOX 271 • BABATI-MANYARA</small><i>KIELELEZO TU</i></div>
     <h3>Branch Directors Confirmation</h3>
     <p className="slo-director">I <span className="slo-write">{data.directorName||"..................................."}</span> director of <span className="slo-write">{data.institution||"..................................."}</span> confirm that, I have received this students introduction letter from the management of <span className="slo-write">{data.institution||"..................................."}</span> to be used for registration of students who have received their official IDs from the University/College. In case of any fake introduction to be submitted by my channel for this University/College, I will be responsible to the company.</p>
     <div className="slo-final-sign"><span>Signature <i>________________</i></span><span>Name <i>{data.directorName||"________________"}</i></span><span>Date <i>{fmt(data.directorDate)}</i></span></div>
     <div className="slo-sample-mark">KIELELEZO • SAMPLE</div>
     <footer>Muundo wa mfano kwa ajili ya kujaza taarifa. Tumia barua iliyoidhinishwa na taasisi husika pekee.</footer>
    </article>
   </section>
  </div>
  <style>{`
.student-letter-overlay{min-height:100vh;padding:24px clamp(12px,3vw,34px);background:#0b1120;color:#e8eefb;font-family:Inter,system-ui,sans-serif}.slo-top{display:flex;gap:16px;align-items:flex-start;max-width:1500px;margin:0 auto 18px}.slo-top button,.slo-form-head button{display:flex;align-items:center;gap:7px;background:#172238;color:#eef3ff;border:1px solid #34435c;border-radius:9px;padding:10px;cursor:pointer}.slo-top small{font-size:10px;letter-spacing:1.2px;color:#93c5fd;font-weight:800}.slo-top h1{display:flex;gap:9px;align-items:center;margin:5px 0;font-size:clamp(22px,3vw,32px)}.slo-top p{margin:0;color:#aab9cf;font-size:13px}.slo-warning{max-width:1500px;margin:0 auto 18px;padding:12px 14px;border:1px solid #8c6333;background:#2a2116;color:#ffdfa8;border-radius:10px;font-size:12px;line-height:1.5}.slo-layout{max-width:1500px;margin:auto;display:grid;grid-template-columns:minmax(270px,350px) minmax(0,1fr);gap:22px;align-items:start}.slo-form{background:#111c30;border:1px solid #263650;border-radius:15px;padding:16px}.slo-form-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px}.slo-form-head h2{font-size:17px;margin:0}.slo-form-head button{font-size:11px;padding:8px}.slo-fields{display:grid;grid-template-columns:1fr;gap:10px}.slo-fields label{display:flex;flex-direction:column;gap:5px}.slo-fields label span{font-size:11px;color:#b6c5db}.slo-fields input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #354761;border-radius:8px;background:#0a1323;color:#f1f5ff;font:inherit;font-size:12px}.slo-print{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:15px;padding:13px;border:0;border-radius:10px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-weight:800}.slo-form>p{color:#9aabc3;font-size:11px}.slo-label{font-size:10px;letter-spacing:1.2px;font-weight:800;color:#9db0cb;margin:2px 2px 10px}.slo-paper{position:relative;isolation:isolate;overflow:hidden;width:100%;max-width:850px;min-height:1050px;box-sizing:border-box;margin:auto;background:#fff;color:#252525;padding:36px 38px 24px;box-shadow:0 20px 55px #0004;font:14px/1.42 'Times New Roman',serif}.slo-head{display:grid;grid-template-columns:34% 66%;align-items:center;min-height:120px}.slo-logo{width:145px;height:105px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;color:#245a9b;border:3px solid #426eac;border-radius:50%;box-sizing:border-box;transform:scale(.88)}.slo-logo b{font:bold 24px Georgia,serif}.slo-logo small{font:7px Arial,sans-serif;line-height:1.3}.slo-address{display:flex;flex-direction:column;gap:10px;text-align:center;font-size:15px;white-space:nowrap}.slo-recipient{margin-top:23px;margin-bottom:20px;line-height:2}.slo-paper h2{text-align:center;text-decoration:underline;font-size:16px;margin:16px 0 15px}.slo-paper p{margin:12px 0;text-align:justify}.slo-write{display:inline-block;position:relative;font-weight:600;color:#174ca3;letter-spacing:.15px;overflow-wrap:anywhere}.slo-student-line{line-height:1.45}.slo-student-line .student{min-width:190px}.slo-student-line .nida{min-width:190px}.slo-student-line .idnum{min-width:190px}.slo-auth{margin-top:18px;line-height:2.5}.slo-auth>div{display:flex;align-items:baseline;gap:6px;white-space:nowrap}.slo-auth .slo-write{min-width:210px;border-bottom:1px dotted #777}.slo-sign-line{display:inline-block;width:230px;border-bottom:1px dotted #777;height:20px}.slo-seal{position:absolute;right:9%;top:57%;transform:rotate(-36deg);border:3px double #214f9d;border-radius:50%;width:200px;height:85px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#214f9d;opacity:.85;gap:3px;background:#fff0;pointer-events:none}.slo-seal b,.slo-seal span,.slo-seal small{font:800 9px Arial,sans-serif;letter-spacing:.5px}.slo-seal i{font:bold 8px Arial,sans-serif;border:1px solid #214f9d;padding:1px 6px;font-style:normal}.slo-paper h3{font-size:14px;font-weight:normal;margin:16px 0 8px}.slo-director{line-height:1.42}.slo-final-sign{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:20px;font-size:12px;white-space:nowrap}.slo-final-sign i{display:inline-block;font-style:normal;color:#174ca3;border-bottom:1px dotted #777;min-width:70px}.slo-sample-mark{position:absolute;left:50%;top:49%;transform:translate(-50%,-50%) rotate(-30deg);font:bold 35px Arial,sans-serif;color:#9aa4b2;opacity:.12;white-space:nowrap;pointer-events:none}.slo-paper footer{border-top:1px solid #ddd;padding-top:8px;text-align:center;font:9px Arial,sans-serif;color:#777;margin-top:20px}.slo-linebreak{display:none}@media(max-width:900px){.slo-layout{grid-template-columns:1fr}.slo-paper{padding:28px 24px;min-height:0}.slo-top{gap:9px}.slo-top>button{font-size:0}.slo-top>button svg{width:20px;height:20px}}@media(max-width:520px){.slo-paper{padding:20px 13px;font-size:11px}.slo-head{grid-template-columns:30% 70%;min-height:90px}.slo-logo{width:88px;height:75px;transform:none}.slo-logo b{font-size:17px}.slo-logo small{font-size:6px}.slo-address{font-size:10px;gap:6px}.slo-recipient{margin-top:14px;margin-bottom:12px}.slo-paper h2{font-size:12px}.slo-student-line .student,.slo-student-line .nida,.slo-student-line .idnum{min-width:0}.slo-auth .slo-write{min-width:120px}.slo-sign-line{width:125px}.slo-seal{width:145px;height:65px;right:2%;top:56%}.slo-seal b,.slo-seal span,.slo-seal small{font-size:6px}.slo-final-sign{font-size:9px;gap:4px;white-space:normal}.slo-sample-mark{font-size:23px}}@media print{@page{size:A4;margin:0}.student-letter-overlay{padding:0!important;background:white!important;color:#111!important}.no-print,.slo-form,.slo-top,.slo-warning,.slo-label{display:none!important}.slo-layout{display:block!important}.slo-paper{width:210mm;max-width:none;height:297mm;min-height:0;box-sizing:border-box;padding:16mm 17mm 10mm;box-shadow:none!important;font-size:11pt;print-color-adjust:exact;-webkit-print-color-adjust:exact}.slo-head{min-height:31mm}.slo-logo{width:39mm;height:29mm}.slo-address{font-size:12pt}.slo-recipient{margin-top:5mm;margin-bottom:4mm}.slo-paper h2{font-size:12pt}.slo-auth{margin-top:4mm}.slo-seal{top:56%;right:9%}.slo-sample-mark{font-size:36pt}.slo-paper footer{font-size:7pt}}
  `}</style>
 </main>;
}
