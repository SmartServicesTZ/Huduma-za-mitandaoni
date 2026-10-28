import { useMemo, useState } from "react";
import type { LipaApplication, ServiceApplication } from "@/lib/firebase";
type InboxKind = "ALL" | "SERVICE" | "LIPA";
type InboxStatus = "ALL" | "PENDING" | "PROCESSING" | "APPROVED" | "REJECTED";
type InboxRow = { id:string; kind:Exclude<InboxKind,"ALL">; kindLabel:string; person:string; service:string; phone:string; status:string; dateValue:unknown; dateLabel:string };
function dateValue(value:unknown):number {
  if(!value)return 0;
  try {
    if(typeof value==="object" && value!==null && "toDate" in value && typeof (value as {toDate?:unknown}).toDate==="function") return (value as {toDate:()=>Date}).toDate().getTime();
    const time=new Date(String(value)).getTime(); return Number.isFinite(time)?time:0;
  } catch { return 0; }
}
function dateLabel(value:unknown):string { const time=dateValue(value); return time?new Date(time).toLocaleString("sw-TZ"):"Tarehe haijatajwa"; }
function statusClass(status:string):string {
  const value=status.toLowerCase();
  if(value==="approved")return "unified-inbox-status-approved";
  if(value==="rejected")return "unified-inbox-status-rejected";
  if(value==="processing")return "unified-inbox-status-processing";
  return "unified-inbox-status-pending";
}
export function UnifiedApplicationsInbox({serviceApplications,lipaApplications,services,networks,onSelect}:{
  serviceApplications:ServiceApplication[]; lipaApplications:LipaApplication[]; services:any[]; networks:any[];
  onSelect:(kind:Exclude<InboxKind,"ALL">,id:string)=>void;
}) {
  const [kindFilter,setKindFilter]=useState<InboxKind>("ALL");
  const [statusFilter,setStatusFilter]=useState<InboxStatus>("ALL");
  const rows=useMemo<InboxRow[]>(()=>{
    const serviceRows:InboxRow[]=serviceApplications.map((application)=>{
      const service=services.find((item)=>item.slug===application.serviceSlug||item.id===application.serviceSlug);
      const date=application.submittedAt??application.createdAt;
      return {id:application.applicationId||application.id,kind:"SERVICE",kindLabel:"HUDUMA",person:application.userName||"Jina halijawekwa",service:service?.name??application.serviceName??application.serviceSlug??"Huduma haijatajwa",phone:String((application as any).phone??application.applicantData?.phone??""),status:application.status||"PENDING",dateValue:date,dateLabel:dateLabel(date)};
    });
    const lipaRows:InboxRow[]=lipaApplications.map((application)=>{
      const network=networks.find((item)=>item.id===application.networkId||item.id===application.network||item.name===application.network);
      const date=application.submittedAt??application.createdAt;
      return {id:application.applicationId||application.id,kind:"LIPA",kindLabel:"LIPA NAMBA",person:application.applicantName||application.userName||application.phone||"Jina halijawekwa",service:network?.name??application.network??application.serviceId??"Pata Lipa Namba",phone:application.phone||"",status:application.status||"PENDING",dateValue:date,dateLabel:dateLabel(date)};
    });
    return [...serviceRows,...lipaRows].sort((a,b)=>dateValue(b.dateValue)-dateValue(a.dateValue));
  },[serviceApplications,lipaApplications,services,networks]);
  const visibleRows=rows.filter((row)=>(kindFilter==="ALL"||row.kind===kindFilter)&&(statusFilter==="ALL"||String(row.status).toUpperCase()===statusFilter));
  const counts={ALL:rows.length,PENDING:rows.filter((r)=>String(r.status).toUpperCase()==="PENDING").length,PROCESSING:rows.filter((r)=>String(r.status).toUpperCase()==="PROCESSING").length,APPROVED:rows.filter((r)=>String(r.status).toUpperCase()==="APPROVED").length,REJECTED:rows.filter((r)=>String(r.status).toUpperCase()==="REJECTED").length};
  return <div className="unified-inbox" aria-label="Orodha moja ya maombi yote">
    <style>{`
      .unified-inbox{color:#17251f}.unified-inbox-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:16px 0}
      .unified-inbox-filters label{display:grid;gap:5px;color:#63716a;font-size:.78rem;font-weight:800}
      .unified-inbox-filters select{min-width:175px;max-width:100%;border:1px solid #cbd9d0;border-radius:9px;background:#fff;padding:10px 12px;color:#17251f;font:inherit}
      .unified-inbox-counts{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
      .unified-inbox-count{border:1px solid #e0e8e3;border-radius:10px;background:#f8fbf9;padding:8px 12px;font-size:.78rem;color:#5b6b62}
      .unified-inbox-count strong{color:#17251f;margin-left:5px}
      .unified-inbox-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px}
      .unified-inbox-card{border:1px solid #dce7e0;border-radius:13px;padding:14px;background:#fff;display:flex;flex-direction:column;gap:11px;min-width:0;box-shadow:0 4px 15px #102b5008}
      .unified-inbox-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
      .unified-inbox-card h3{margin:0;font-size:.96rem;line-height:1.4;overflow-wrap:anywhere}
      .unified-inbox-service{margin-top:4px;font-size:.83rem;color:#63716a;overflow-wrap:anywhere}
      .unified-inbox-kind{display:inline-flex;width:max-content;max-width:100%;border-radius:7px;background:#eaf3ff;color:#24558a;padding:4px 7px;font-size:.68rem;font-weight:900;letter-spacing:.025em}
      .unified-inbox-status{display:inline-flex;flex-shrink:0;border-radius:999px;padding:4px 8px;font-size:.67rem;font-weight:900}
      .unified-inbox-status-pending{background:#fff4d6;color:#8a5b00}.unified-inbox-status-processing{background:#e2f0ff;color:#14568f}
      .unified-inbox-status-approved{background:#ddf7e8;color:#13703e}.unified-inbox-status-rejected{background:#ffe4e1;color:#a63329}
      .unified-inbox-meta{display:flex;flex-wrap:wrap;gap:8px 14px;color:#63716a;font-size:.78rem}
      .unified-inbox-open{width:100%;min-height:43px;margin-top:auto;border:0;border-radius:9px;background:linear-gradient(135deg,#1769d2,#168653);color:#fff;font-weight:800;cursor:pointer}
      .unified-inbox-open:focus-visible,.unified-inbox-filters select:focus-visible{outline:3px solid #91c2ff;outline-offset:2px}
      .unified-inbox-empty{border:1px dashed #cbd9d0;border-radius:12px;padding:28px 16px;text-align:center;color:#63716a}
      @media(max-width:520px){.unified-inbox-filters label,.unified-inbox-filters select{width:100%}.unified-inbox-card{padding:12px}}
    `}</style>
    <div className="unified-inbox-counts" aria-label="Muhtasari wa maombi">{(["ALL","PENDING","PROCESSING","APPROVED","REJECTED"] as const).map((status)=><div className="unified-inbox-count" key={status}>{status==="ALL"?"Yote":status}<strong>{counts[status]}</strong></div>)}</div>
    <div className="unified-inbox-filters">
      <label>Aina ya ombi<select value={kindFilter} onChange={(event)=>setKindFilter(event.target.value as InboxKind)}><option value="ALL">Aina zote</option><option value="SERVICE">Huduma za mfumo / SME</option><option value="LIPA">LIPA NAMBA / ACCESS LIPA</option></select></label>
      <label>Hali ya ombi<select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value as InboxStatus)}><option value="ALL">Hali zote</option><option value="PENDING">PENDING</option><option value="PROCESSING">PROCESSING</option><option value="APPROVED">APPROVED</option><option value="REJECTED">REJECTED</option></select></label>
      <span style={{fontSize:".8rem",color:"#63716a"}}>Inaonekana: <strong>{visibleRows.length}</strong> / {rows.length}</span>
    </div>
    {visibleRows.length===0?<div className="unified-inbox-empty">Hakuna maombi yanayolingana na vichujio ulivyochagua.</div>:<div className="unified-inbox-list">{visibleRows.map((row)=><article className="unified-inbox-card" key={row.kind+":"+row.id}>
      <div className="unified-inbox-card-head"><div style={{minWidth:0}}><span className="unified-inbox-kind">{row.kindLabel}</span><h3 style={{marginTop:8}}>{row.person}</h3><div className="unified-inbox-service">{row.service}</div></div><span className={`unified-inbox-status ${statusClass(String(row.status))}`}>{String(row.status).toUpperCase()}</span></div>
      <div className="unified-inbox-meta"><span>{row.dateLabel}</span>{row.phone&&<span>Simu: {row.phone}</span>}</div>
      <button type="button" className="unified-inbox-open" onClick={()=>onSelect(row.kind,row.id)}>Fungua ombi</button>
    </article>)}</div>}
  </div>;
}
