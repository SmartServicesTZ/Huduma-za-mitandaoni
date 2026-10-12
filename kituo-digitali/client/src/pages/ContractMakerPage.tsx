import { useState } from "react";
import { ArrowLeft, FileText, Printer, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";

type LetterData = {
  studentName: string; nida: string; idNumber: string; authorizer: string;
  position: string; authorizationDate: string; directorName: string;
  institution: string; directorDate: string;
};
const initial: LetterData = {
  studentName: "Amina Joseph Nyerere",
  nida: "19980101-12345-00001-11",
  idNumber: "OUT/MNR/2026/0123",
  authorizer: "Dr. Sample Authorizer",
  position: "Regional Centre Coordinator (SAMPLE)",
  authorizationDate: "2026-10-12",
  directorName: "Sample Branch Director",
  institution: "The Open University of Tanzania — Manyara Regional Centre",
  directorDate: "2026-10-12",
};
const fields: {key:keyof LetterData; label:string; type?:string}[] = [
  {key:"studentName",label:"Jina kamili la mwanafunzi"},
  {key:"nida",label:"Namba ya NIDA"},
  {key:"idNumber",label:"Namba ya kitambulisho / kumbukumbu"},
  {key:"authorizer",label:"Jina la mtoa idhini"},
  {key:"position",label:"Cheo cha mtoa idhini"},
  {key:"authorizationDate",label:"Tarehe ya mtoa idhini",type:"date"},
  {key:"directorName",label:"Jina la Branch Director"},
  {key:"institution",label:"Jina la taasisi"},
  {key:"directorDate",label:"Tarehe ya uthibitisho",type:"date"},
];
const dateText=(v:string)=>v?new Date(v+"T12:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"}):"________________";
export default function ContractMakerPage(){
 const [,navigate]=useLocation();
 const [data,setData]=useState(initial);
 const update=(key:keyof LetterData,value:string)=>setData(old=>({...old,[key]:value}));
 return <main className="student-letter">
  <header className="sl-top no-print"><button onClick={()=>navigate("/")}><ArrowLeft size={17}/> Rudi mwanzo</button><div><small>SMARTSERVICESTZ • KIELELEZO CHA KUJAZA</small><h1><FileText/> Tengeneza Barua ya Uthibitisho</h1><p>Jaza taarifa upande huu; barua itabadilika papo hapo.</p></div></header>
  <div className="sl-warning no-print"><b>KIELELEZO TU — SI BARUA RASMI.</b> Nembo, saini na muhuri rasmi wa chuo havijaigwa. Pata uthibitisho, saini na muhuri halali kutoka chuoni kabla ya kuitumia.</div>
  <div className="sl-layout">
   <section className="sl-form no-print"><div className="sl-form-head"><h2>Taarifa za barua</h2><button onClick={()=>setData(initial)}><RotateCcw size={14}/> Rudisha mfano</button></div>
    <div className="sl-fields">{fields.map(f=><label key={f.key}><span>{f.label}</span><input type={f.type??"text"} value={data[f.key]} onChange={e=>update(f.key,e.target.value)}/></label>)}</div>
    <button className="sl-print" onClick={()=>window.print()}><Printer size={17}/> Pakua PDF / Chapisha</button><p>Katika dirisha la uchapishaji chagua “Save as PDF”. Barua ya mfano ina alama ya KIELELEZO.</p>
   </section>
   <section className="sl-preview"><div className="sl-preview-label no-print">PREVIEW • A4</div><article className="sl-paper"><div className="sl-watermark">KIELELEZO TU</div>
    <header className="sl-letterhead"><div className="sl-logo-placeholder">NEMBO<br/>YA CHUO</div><div className="sl-address"><b>THE OPEN UNIVERSITY OF TANZANIA</b><span>MANYARA REGIONAL CENTRE</span><span>P.O. BOX 271 BABATI-MANYARA</span></div></header>
    <div className="sl-recipient"><p>Manager,</p><p>Halotel Manyara Branch,</p><p>Manyara.</p></div>
    <h2>REF: STUDENT CONFIRMATION LETTER</h2>
    <p>Reference is made to the above heading.</p>
    <p>I wish to confirm that <b>{data.studentName||"................................................"}</b> with nida number <b>{data.nida||"........................................"}</b> and ID number <b>{data.idNumber||"........................................"}</b> is a student at our institution who has not yet received a physical ID card.</p>
    <p>Kindly assist this student to register a new Halotel EDUCATION SIM card, subject to the institution's verification and applicable registration requirements.</p>
    <p>For student's government / institutional confirmation:</p>
    <div className="sl-signoff"><p>Name of authorizer: <b>{data.authorizer||"........................................"}</b></p><p>Position: <b>{data.position||"........................................"}</b></p><p>Signature: <span>________________________________________</span></p><p>Date: <b>{dateText(data.authorizationDate)}</b></p></div>
    <h3>Branch Directors Confirmation</h3>
    <p>I, <b>{data.directorName||"........................................"}</b>, director of <b>Halotel Manyara Branch</b>, confirm that I have received this student's introduction letter from the management of <b>{data.institution}</b> for the purpose of verifying eligibility for student SIM registration. Final approval remains subject to the relevant procedures.</p>
    <div className="sl-director-sign"><span>Signature: __________________</span><span>Name: {data.directorName||"____________________"}</span><span>Date: {dateText(data.directorDate)}</span></div>
    <div className="sl-stamp-placeholder"><b>STAMP / MUHURI</b><span>ITAWEKWA NA TAASISI INAYOHUSIKA</span><small>HAUJAWEKWA — KIELELEZO TU</small></div>
    <footer>Draft generated for layout preview only. Not valid for official use without institutional review, authorized signature and genuine stamp.</footer>
   </article></section>
  </div>
  <style>{`
.student-letter{min-height:100vh;padding:24px clamp(12px,3vw,34px);background:#0b1120;color:#e8eefb;font-family:Inter,system-ui,sans-serif}.sl-top{display:flex;gap:16px;align-items:flex-start;max-width:1500px;margin:0 auto 18px}.sl-top button,.sl-form-head button{display:flex;align-items:center;gap:7px;background:#172238;color:#eef3ff;border:1px solid #34435c;border-radius:9px;padding:10px;cursor:pointer}.sl-top small{font-size:10px;letter-spacing:1.2px;color:#93c5fd;font-weight:800}.sl-top h1{display:flex;gap:9px;align-items:center;margin:5px 0;font-size:clamp(22px,3vw,32px)}.sl-top p{margin:0;color:#aab9cf;font-size:13px}.sl-warning{max-width:1500px;margin:0 auto 18px;padding:12px 14px;border:1px solid #8c6333;background:#2a2116;color:#ffdfa8;border-radius:10px;font-size:12px;line-height:1.5}.sl-layout{max-width:1500px;margin:auto;display:grid;grid-template-columns:minmax(280px,370px) minmax(0,1fr);gap:22px;align-items:start}.sl-form{background:#111c30;border:1px solid #263650;border-radius:15px;padding:16px}.sl-form-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px}.sl-form-head h2{font-size:17px;margin:0}.sl-form-head button{font-size:11px;padding:8px}.sl-fields{display:grid;grid-template-columns:1fr;gap:11px}.sl-fields label{display:flex;flex-direction:column;gap:5px}.sl-fields label span{font-size:11px;color:#b6c5db}.sl-fields input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #354761;border-radius:8px;background:#0a1323;color:#f1f5ff;font:inherit;font-size:12px}.sl-print{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:15px;padding:13px;border:0;border-radius:10px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-weight:800}.sl-form>p{color:#9aabc3;font-size:11px}.sl-preview-label{font-size:10px;letter-spacing:1.2px;font-weight:800;color:#9db0cb;margin:2px 2px 10px}.sl-paper{position:relative;isolation:isolate;overflow:hidden;max-width:850px;margin:auto;background:#fff;color:#222;padding:42px clamp(22px,5vw,56px) 24px;box-shadow:0 20px 55px #0004;font:14px/1.55 'Times New Roman',serif;min-height:1050px}.sl-watermark{position:absolute;z-index:-1;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-32deg);font:900 clamp(40px,7vw,76px) Arial,sans-serif;white-space:nowrap;letter-spacing:4px;color:#d7dde6;opacity:.48;pointer-events:none}.sl-letterhead{display:flex;align-items:center;gap:26px;min-height:115px}.sl-logo-placeholder{width:118px;height:100px;flex:0 0 118px;border:2px dashed #7d91b1;border-radius:50%;display:grid;place-content:center;text-align:center;font:bold 12px Arial,sans-serif;color:#5a6e8d;line-height:1.35}.sl-address{display:flex;flex-direction:column;gap:7px;color:#353535;font-size:15px}.sl-address b{font-weight:normal}.sl-recipient{margin:24px 0 10px}.sl-recipient p{margin:0 0 8px}.sl-paper h2{text-align:center;font-size:16px;text-decoration:underline;margin:16px 0}.sl-paper p{text-align:justify;margin:12px 0}.sl-signoff{margin-top:12px}.sl-signoff p{margin:8px 0}.sl-signoff b{font-weight:normal;border-bottom:1px dotted #666}.sl-signoff span{letter-spacing:1px}.sl-paper h3{font-size:14px;font-weight:normal;margin:16px 0 4px}.sl-director-sign{display:flex;flex-wrap:wrap;gap:12px 22px;margin-top:20px;font-size:12px}.sl-stamp-placeholder{width:190px;min-height:70px;margin:24px 0 14px auto;border:2px dashed #9aa4b3;border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#7c8798;padding:8px;box-sizing:border-box;transform:rotate(-5deg);gap:5px}.sl-stamp-placeholder b{font:800 12px Arial,sans-serif}.sl-stamp-placeholder span,.sl-stamp-placeholder small{font:8px Arial,sans-serif}.sl-paper footer{border-top:1px solid #ddd;padding-top:8px;text-align:center;font:9px Arial,sans-serif;color:#777;margin-top:16px}@media(max-width:900px){.sl-layout{grid-template-columns:1fr}.sl-paper{padding:30px 24px;min-height:0}.sl-top{gap:9px}.sl-top>button{font-size:0}.sl-top>button svg{width:20px;height:20px}}@media(max-width:480px){.sl-paper{padding:24px 17px;font-size:12px}.sl-letterhead{gap:12px}.sl-logo-placeholder{width:78px;height:72px;flex-basis:78px;font-size:9px}.sl-address{font-size:11px;gap:5px}.sl-paper h2{font-size:13px}.sl-director-sign{gap:8px;font-size:10px}}@media print{@page{size:A4;margin:0}body{background:white!important}.student-letter{padding:0!important;background:white!important;color:#111!important}.no-print,.sl-form,.sl-top,.sl-warning,.sl-preview-label{display:none!important}.sl-layout{display:block!important}.sl-paper{width:210mm;max-width:none;min-height:297mm;box-sizing:border-box;padding:17mm 18mm 12mm;box-shadow:none!important;font-size:11pt;print-color-adjust:exact;-webkit-print-color-adjust:exact}.sl-watermark{font-size:60pt}.sl-stamp-placeholder{margin-top:16px}}
  `}</style>
 </main>;
}
