import { useState } from "react";
import { ArrowLeft, FileText, Printer, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";

type LetterData={studentName:string;nida:string;idNumber:string;authorizer:string;position:string;authorizationDate:string;directorName:string;institution:string;directorDate:string};
const initial:LetterData={studentName:"JOYCE SEBASTIAN",nida:"1990122722100000119",idNumber:"OUT-MAN-0040-2025",authorizer:"ABDALLAH JUMA",position:"ADMINISTRATOR",authorizationDate:"2026-10-12",directorName:"PAUL HASSAN",institution:"OPEN UNIVERSITY — MANYARA BRANCH",directorDate:"2026-10-12"};
const fields:{key:keyof LetterData;label:string;type?:string}[]=[
{key:"studentName",label:"Jina kamili la mwanafunzi"},{key:"nida",label:"Namba ya NIDA"},{key:"idNumber",label:"Namba ya kitambulisho"},
{key:"authorizer",label:"Jina la mtoa idhini"},{key:"position",label:"Cheo"},{key:"authorizationDate",label:"Tarehe ya mtoa idhini",type:"date"},
{key:"directorName",label:"Jina la Branch Director"},{key:"institution",label:"Taasisi / tawi"},{key:"directorDate",label:"Tarehe ya uthibitisho",type:"date"}];
const fmt=(v:string)=>v?new Date(v+"T12:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}):"";
export default function ContractMakerPage(){
 const [,navigate]=useLocation();const [data,setData]=useState(initial);
 const update=(key:keyof LetterData,value:string)=>setData(old=>({...old,[key]:value}));
 return <main className="letter-maker">
  <header className="lm-top no-print"><button onClick={()=>navigate("/")}><ArrowLeft size={17}/> Rudi</button><div><small>SMARTSERVICESTZ</small><h1><FileText/> Tengeneza barua</h1><p>Template halisi uliyotuma ndiyo inatumika hapa chini.</p></div></header>
  <div className="lm-note no-print">Taarifa zilizoandikwa ni za mfano wa kuonyesha namna ya kujaza. Hakikisha taarifa na idhini zote ni sahihi kabla ya kutumia barua.</div>
  <div className="lm-layout">
   <section className="lm-form no-print"><div className="lm-form-title"><h2>Taarifa za kujaza</h2><button onClick={()=>setData(initial)}><RotateCcw size={14}/> Mfano</button></div>
    <div className="lm-fields">{fields.map(f=><label key={f.key}><span>{f.label}</span><input type={f.type??"text"} value={data[f.key]} onChange={e=>update(f.key,e.target.value)}/></label>)}</div>
    <button className="lm-print" onClick={()=>window.print()}><Printer size={17}/> Pakua PDF / Chapisha</button><p>Chagua “Save as PDF” kwenye dirisha la uchapishaji.</p>
   </section>
   <section className="lm-preview"><div className="lm-preview-tag no-print">TEMPLATE ULIYOTUMA • LIVE PREVIEW</div>
    <article className="lm-paper">
     <img className="lm-template" src={`${import.meta.env.BASE_URL}Mkataba-halotel.jpg`} alt="Template halisi ya barua ya Student Confirmation Letter" />
     <div className="lm-field lm-student">{data.studentName}</div>
     <div className="lm-field lm-nida">{data.nida}</div>
     <div className="lm-field lm-idnum">{data.idNumber}</div>
     <div className="lm-field lm-authorizer">{data.authorizer}</div>
     <div className="lm-field lm-position">{data.position}</div>
     <div className="lm-field lm-authdate">{fmt(data.authorizationDate)}</div>
     <div className="lm-field lm-director">{data.directorName}</div>
     <div className="lm-field lm-institution">{data.institution}</div>
     <div className="lm-field lm-director-date">{fmt(data.directorDate)}</div>
     <div className="lm-sample no-print">PREVIEW YA MFANO</div>
    </article>
   </section>
  </div>
  <style>{`
.letter-maker{min-height:100vh;padding:18px clamp(10px,2vw,24px);background:#0b1120;color:#e8eefb;font-family:Inter,system-ui,sans-serif}.lm-top{display:flex;gap:12px;align-items:flex-start;max-width:1500px;margin:0 auto 12px}.lm-top button,.lm-form-title button{display:flex;align-items:center;gap:6px;background:#172238;color:#eef3ff;border:1px solid #34435c;border-radius:9px;padding:9px;cursor:pointer}.lm-top small{font-size:10px;letter-spacing:1px;color:#93c5fd;font-weight:800}.lm-top h1{display:flex;gap:8px;align-items:center;margin:3px 0;font-size:clamp(21px,3vw,28px)}.lm-top p{margin:0;color:#aab9cf;font-size:12px}.lm-note{max-width:1500px;margin:0 auto 12px;padding:9px 12px;border:1px solid #66542e;background:#272116;color:#f9dfa8;border-radius:9px;font-size:11px}.lm-layout{max-width:1500px;margin:auto;display:grid;grid-template-columns:minmax(240px,320px) minmax(0,1fr);gap:15px;align-items:start}.lm-form{background:#111c30;border:1px solid #263650;border-radius:13px;padding:13px}.lm-form-title{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}.lm-form-title h2{font-size:15px;margin:0}.lm-form-title button{font-size:10px;padding:7px}.lm-fields{display:grid;grid-template-columns:1fr;gap:8px}.lm-fields label{display:flex;flex-direction:column;gap:4px}.lm-fields label span{font-size:10px;color:#b6c5db}.lm-fields input{box-sizing:border-box;width:100%;padding:9px;border:1px solid #354761;border-radius:7px;background:#0a1323;color:#f1f5ff;font:inherit;font-size:12px}.lm-print{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;margin-top:12px;padding:11px;border:0;border-radius:9px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-weight:800}.lm-form>p{color:#9aabc3;font-size:10px}.lm-preview-tag{font-size:10px;letter-spacing:.7px;font-weight:800;color:#9db0cb;margin:1px 2px 7px}.lm-paper{position:relative;width:min(100%,760px);aspect-ratio:3/4;margin:auto;background:#fff;overflow:hidden;box-shadow:0 14px 36px #0004}.lm-template{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block}.lm-field{position:absolute;z-index:2;color:#1749a0;font:600 clamp(7px,1.05vw,13px)/1.1 'Comic Sans MS','Segoe Print',cursive;overflow-wrap:anywhere;max-height:4.2%;overflow:hidden}.lm-student{left:28%;top:37.7%;width:39%;}.lm-nida{left:14%;top:40.6%;width:40%;}.lm-idnum{left:72%;top:40.6%;width:26%;}.lm-authorizer{left:31%;top:54.9%;width:34%;}.lm-position{left:23%;top:58.9%;width:42%;}.lm-authdate{left:19%;top:65.6%;width:26%;}.lm-director{left:12%;top:75.5%;width:31%;}.lm-institution{left:56%;top:75.5%;width:38%;}.lm-director-date{left:78%;top:85.7%;width:18%;}.lm-sample{position:absolute;z-index:3;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-25deg);border:2px solid #a23a32;color:#a23a32;padding:4px 9px;font:bold clamp(11px,2vw,22px) Arial,sans-serif;letter-spacing:2px;opacity:.55;white-space:nowrap;pointer-events:none}@media(max-width:760px){.lm-layout{grid-template-columns:1fr}.lm-paper{width:min(100%,580px)}.lm-field{font-size:clamp(7px,2.1vw,12px)}.lm-top>button{font-size:0}.lm-top>button svg{width:19px;height:19px}}@media print{@page{size:A4;margin:0}.letter-maker{padding:0!important;background:#fff!important}.no-print,.lm-form,.lm-top,.lm-note,.lm-preview-tag{display:none!important}.lm-layout{display:block!important}.lm-paper{width:210mm;height:280mm;aspect-ratio:3/4;max-width:none;box-shadow:none!important;margin:0 auto;print-color-adjust:exact;-webkit-print-color-adjust:exact}.lm-field{font-size:11pt}.lm-sample{display:none!important}}
  `}</style>
 </main>;
}
