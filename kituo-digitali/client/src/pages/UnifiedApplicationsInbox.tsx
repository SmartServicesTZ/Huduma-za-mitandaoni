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
      const requestName=service?.name??application.serviceName??application.serviceSlug??"Ombi"; return {id:application.applicationId||application.id,kind:"SERVICE",kindLabel:requestName,person:application.userName||"Jina halijawekwa",service:"",phone:String((application as any).phone??application.applicantData?.phone??""),status:application.status||"PENDING",dateValue:date,dateLabel:dateLabel(date)};
    });
    const lipaRows:InboxRow[]=lipaApplications.map((application)=>{
      const network=networks.find((item)=>item.id===application.networkId||item.id===application.network||item.name===application.network);
      const date=application.submittedAt??application.createdAt;
      const serviceId=String((application as any).serviceId??""); const requestName=/access.*lipa|lipa.*access/i.test(serviceId)?"ACCESS YA LIPA":/wifi|wi-fi/i.test(serviceId)?"WIFI":"LIPA NAMBA"; return {id:application.applicationId||application.id,kind:"LIPA",kindLabel:requestName,person:application.applicantName||application.userName||application.phone||"Jina halijawekwa",service:network?.name??application.network??"",phone:application.phone||"",status:application.status||"PENDING",dateValue:date,dateLabel:dateLabel(date)};
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
      .unified-inbox-table-wrap{border:1px solid #e2e9e4;border-radius:12px;overflow-x:auto;background:#fff}
      .unified-inbox-table{border-collapse:collapse;min-width:760px;width:100%}.unified-inbox-table th{background:#f7faf8;color:#63716a;font-size:.72rem;letter-spacing:.025em;text-align:left;text-transform:uppercase;white-space:nowrap}
      .unified-inbox-table th,.unified-inbox-table td{border-bottom:1px solid #edf1ee;padding:12px 11px;vertical-align:top}.unified-inbox-table tbody tr:last-child td{border-bottom:0}.unified-inbox-table td{font-size:.84rem}
      .unified-inbox-table tbody tr.status-row-pending{background:#fffaf0;border-left:4px solid #d99b12}.unified-inbox-table tbody tr.status-row-processing{background:#f2f8ff;border-left:4px solid #3182ce}.unified-inbox-table tbody tr.status-row-approved{background:#f0fbf4;border-left:4px solid #16a34a}.unified-inbox-table tbody tr.status-row-rejected{background:#fff4f3;border-left:4px solid #dc2626}
      .unified-inbox-person{display:grid;gap:3px}.unified-inbox-person small{color:#68746e}.unified-inbox-kind{display:inline-flex;width:max-content;max-width:230px;border-radius:7px;background:#e9f8ef;color:#126c44;padding:5px 8px;font-size:.72rem;font-weight:900;overflow-wrap:anywhere}
      .unified-inbox-status{display:inline-flex;flex-shrink:0;border-radius:999px;padding:4px 8px;font-size:.67rem;font-weight:900}
      .unified-inbox-status-pending{background:#fff4d6;color:#8a5b00}.unified-inbox-status-processing{background:#e2f0ff;color:#14568f}
      .unified-inbox-status-approved{background:#ddf7e8;color:#13703e}.unified-inbox-status-rejected{background:#ffe4e1;color:#a63329}
      .unified-inbox-open{border:1px solid #cbd9d0;border-radius:8px;background:#f2faf5;color:#126c44;font-weight:800;padding:8px 11px;cursor:pointer;white-space:nowrap}
      .unified-inbox-mobile-list{display:none}.unified-inbox-mobile-item{border:1px solid #e2e9e4;border-radius:12px;padding:13px;background:#fff;margin-bottom:10px}.unified-inbox-mobile-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.unified-inbox-mobile-item h3{font-size:.92rem;margin:9px 0 4px}.unified-inbox-mobile-meta{display:flex;flex-wrap:wrap;gap:7px 12px;color:#68746e;font-size:.76rem;margin:10px 0}.unified-inbox-mobile-item .unified-inbox-open{width:100%;min-height:42px}
      .unified-inbox-open:focus-visible,.unified-inbox-filters select:focus-visible{outline:3px solid #91c2ff;outline-offset:2px}
      .unified-inbox-empty{border:1px dashed #cbd9d0;border-radius:12px;padding:28px 16px;text-align:center;color:#63716a}
      @media(max-width:720px){.unified-inbox-counts{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:620px){.unified-inbox-table-wrap{display:none}.unified-inbox-mobile-list{display:block}.unified-inbox-filters label,.unified-inbox-filters select{width:100%}}
    `}</style>
    <div className="unified-inbox-counts" aria-label="Muhtasari wa maombi">{(["ALL","PENDING","PROCESSING","APPROVED","REJECTED"] as const).map((status)=><div className="unified-inbox-count" key={status}>{status==="ALL"?"Yote":status}<strong>{counts[status]}</strong></div>)}</div>
    <div className="unified-inbox-filters">
      <label>Aina ya ombi<select value={kindFilter} onChange={(event)=>setKindFilter(event.target.value as InboxKind)}><option value="ALL">Aina zote</option><option value="SERVICE">Huduma za mfumo / SME</option><option value="LIPA">LIPA NAMBA / ACCESS LIPA</option></select></label>
      <label>Hali ya ombi<select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value as InboxStatus)}><option value="ALL">Hali zote</option><option value="PENDING">PENDING</option><option value="PROCESSING">PROCESSING</option><option value="APPROVED">APPROVED</option><option value="REJECTED">REJECTED</option></select></label>
      <span style={{fontSize:".8rem",color:"#63716a"}}>Inaonekana: <strong>{visibleRows.length}</strong> / {rows.length}</span>
    </div>
    {visibleRows.length===0?<div className="unified-inbox-empty">Hakuna maombi yanayolingana na vichujio ulivyochagua.</div>:<>
      <div className="unified-inbox-table-wrap"><table className="unified-inbox-table"><thead><tr><th>MWOMBAJI</th><th>AINA HALISI YA OMBI</th><th>SIMU</th><th>TAREHE YA OMBI</th><th>HALI</th><th>VITENDO</th></tr></thead><tbody>{visibleRows.map((row)=><tr key={row.kind+":"+row.id} className={"status-row-"+String(row.status).toLowerCase()}>
        <td><div className="unified-inbox-person"><strong>{row.person}</strong><small>{row.kind==="LIPA"?"Maombi ya Lipa":"Maombi ya huduma maalum"}</small></div></td>
        <td><span className="unified-inbox-kind">{row.kindLabel}</span>{row.service&&<small style={{display:"block",marginTop:5,color:"#68746e"}}>{row.service}</small>}</td>
        <td>{row.phone||"—"}</td><td>{row.dateLabel}</td><td><span className={"unified-inbox-status "+statusClass(String(row.status))}>{String(row.status).toUpperCase()}</span></td>
        <td><button type="button" className="unified-inbox-open" onClick={()=>onSelect(row.kind,row.id)}>Fungua ombi</button></td>
      </tr>)}</tbody></table></div>
      <div className="unified-inbox-mobile-list">{visibleRows.map((row)=><article className="unified-inbox-mobile-item" key={row.kind+":"+row.id}>
        <div className="unified-inbox-mobile-top"><span className="unified-inbox-kind">{row.kindLabel}</span><span className={"unified-inbox-status "+statusClass(String(row.status))}>{String(row.status).toUpperCase()}</span></div>
        <h3>{row.person}</h3>{row.service&&<p style={{color:"#68746e",fontSize:".8rem",margin:"4px 0"}}>{row.service}</p>}
        <div className="unified-inbox-mobile-meta"><span>{row.dateLabel}</span>{row.phone&&<span>Simu: {row.phone}</span>}</div>
        <button type="button" className="unified-inbox-open" onClick={()=>onSelect(row.kind,row.id)}>Fungua ombi</button>
      </article>)}</div>
    </>}
  </div>;
}
