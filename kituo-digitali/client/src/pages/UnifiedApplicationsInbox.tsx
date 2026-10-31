import { useMemo, useState } from "react";
import type { LipaApplication, ServiceApplication } from "@/lib/firebase";
type InboxKind = "ALL" | "SERVICE" | "LIPA";
type InboxStatus = "ALL" | "NO_PAYMENT" | "PENDING" | "PROCESSING" | "APPROVED" | "REJECTED";
type InboxRow = { id:string; kind:Exclude<InboxKind,"ALL">; kindLabel:string; person:string; service:string; phone:string; status:string; paymentGated:boolean; dateValue:unknown; dateLabel:string };
function dateValue(value:unknown):number {
  if(!value)return 0;
  try {
    if(typeof value==="object" && value!==null && "toDate" in value && typeof (value as {toDate?:unknown}).toDate==="function") return (value as {toDate:()=>Date}).toDate().getTime();
    const time=new Date(String(value)).getTime(); return Number.isFinite(time)?time:0;
  } catch { return 0; }
}
function dateLabel(value:unknown):string { const time=dateValue(value); return time?new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Dar_es_Salaam",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(time))+" · "+new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Dar_es_Salaam",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(time)):"Tarehe haijatajwa"; }
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
      const date=application.submittedAt??(application as unknown as {createdAt?:unknown}).createdAt;
      const fullName=String(service?.name??application.serviceName??application.serviceSlug??"Ombi");
      const requestName=slug==="pata-till-mitandao-yote"?"TILL":slug.includes("access-lipa")?"ACCESS":fullName;
      const data=(application.applicantData??{}) as Record<string,unknown>;
      const slug=String(application.serviceSlug??"").toLowerCase();
      const network=String(data.network??"").toUpperCase();
      const tillPayment=slug==="pata-till-mitandao-yote" && network!=="HALOTEL" && network!=="";
      const paidService=["access-lipa-yas","access-lipa-airtel","access-lipa-vodacom"].includes(slug)||tillPayment;
      const paymentGated=paidService && String(application.status??"PENDING").toUpperCase()==="PENDING" && String(data.paymentStatus??"UNPAID").toUpperCase()!=="PAID";
      return {id:application.applicationId||application.id,kind:"SERVICE",kindLabel:requestName,person:application.userName||"Jina halijawekwa",service:network,phone:String((application as any).phone??data.phone??""),status:application.status||"PENDING",paymentGated,dateValue:date,dateLabel:dateLabel(date)};
    });
    const lipaRows:InboxRow[]=lipaApplications.map((application)=>{
      const network=networks.find((item)=>item.id===application.networkId||item.id===application.network||item.name===application.network);
      const date=application.submittedAt??(application as unknown as {createdAt?:unknown}).createdAt;
      const serviceId=String((application as any).serviceId??""); const requestName=/access.*lipa|lipa.*access/i.test(serviceId)?"ACCESS":/wifi|wi-fi/i.test(serviceId)?"WIFI":"LIPA NAMBA"; return {id:application.applicationId||application.id,kind:"LIPA",kindLabel:requestName,person:application.applicantName||application.userName||application.phone||"Jina halijawekwa",service:network?.name??application.network??"",phone:application.phone||"",status:application.status||"PENDING",paymentGated:false,dateValue:date,dateLabel:dateLabel(date)};
    });
    const priority:Record<string,number>={PENDING:0,PROCESSING:1,APPROVED:2,REJECTED:3};
    return [...serviceRows,...lipaRows].sort((a,b)=>(priority[String(a.status).toUpperCase()]??4)-(priority[String(b.status).toUpperCase()]??4)||dateValue(b.dateValue)-dateValue(a.dateValue));
  },[serviceApplications,lipaApplications,services,networks]);
  const visibleRows=rows.filter((row)=>(kindFilter==="ALL"||row.kind===kindFilter)&&(statusFilter==="ALL"||(statusFilter==="NO_PAYMENT"?row.paymentGated:!row.paymentGated&&String(row.status).toUpperCase()===statusFilter)));
  const counts={ALL:rows.length,NO_PAYMENT:rows.filter((r)=>r.paymentGated).length,PENDING:rows.filter((r)=>!r.paymentGated&&String(r.status).toUpperCase()==="PENDING").length,PROCESSING:rows.filter((r)=>String(r.status).toUpperCase()==="PROCESSING").length,APPROVED:rows.filter((r)=>String(r.status).toUpperCase()==="APPROVED").length,REJECTED:rows.filter((r)=>String(r.status).toUpperCase()==="REJECTED").length};
  return <div className="unified-inbox" aria-label="Orodha moja ya maombi yote">
    <style>{`
      .unified-inbox{color:#17251f}.unified-inbox-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:16px 0}
      .unified-inbox-filters label{display:grid;gap:5px;color:#63716a;font-size:.78rem;font-weight:800}
      .unified-inbox-filters select{min-width:175px;max-width:100%;border:1px solid #cbd9d0;border-radius:9px;background:#fff;padding:10px 12px;color:#17251f;font:inherit}
      .unified-inbox-counts{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
      .unified-inbox-count{border:2px solid #d5ded8;border-radius:10px;background:#f8fbf9;padding:9px 13px;font-size:.8rem;color:#25352c;font-weight:900}.unified-inbox-count:nth-child(2){background:#ffdf72;border-color:#d49a00;color:#573800}.unified-inbox-count:nth-child(3){background:#9acbff;border-color:#1671c5;color:#063d78}.unified-inbox-count:nth-child(4){background:#91e2a8;border-color:#159447;color:#064c23}.unified-inbox-count:nth-child(5){background:#ff9a91;border-color:#c92525;color:#750d0d}
      .unified-inbox-count strong{color:#17251f;margin-left:5px}.unified-inbox-count-no-payment{background:#fee2e2;border-color:#dc2626;color:#991b1b}.unified-inbox-status-no-payment{background:#dc2626;color:#fff;border:1px solid #991b1b}.status-row-no-payment{background:#ffe1e1!important;border-left:7px solid #dc2626!important}
      .unified-inbox-table-wrap{border:1px solid #e2e9e4;border-radius:12px;overflow-x:auto;background:#fff}
      .unified-inbox-table{border-collapse:collapse;table-layout:fixed;min-width:0;width:100%}.unified-inbox-table th{background:#f7faf8;color:#34443b;font-size:.69rem;letter-spacing:.015em;text-align:left;text-transform:uppercase;white-space:normal;overflow-wrap:anywhere}.unified-inbox-table th:nth-child(1){width:14%}.unified-inbox-table th:nth-child(2){width:12%}.unified-inbox-table th:nth-child(3){width:14%}.unified-inbox-table th:nth-child(4){width:13%}.unified-inbox-table th:nth-child(5){width:16%}.unified-inbox-table th:nth-child(6){width:12%}.unified-inbox-table th:nth-child(7){width:9%}.unified-inbox-table th:nth-child(8){width:10%}
      .unified-inbox-table th,.unified-inbox-table td{border-bottom:1px solid #d9e1dc;padding:10px 7px;vertical-align:top;overflow-wrap:anywhere}.unified-inbox-table tbody tr:last-child td{border-bottom:0}.unified-inbox-table td{font-size:.84rem}
      .unified-inbox-table tbody tr.status-row-pending{background:#fff0a8;border-left:6px solid #d28a00}.unified-inbox-table tbody tr.status-row-processing{background:#c8e3ff;border-left:6px solid #0969c7}.unified-inbox-table tbody tr.status-row-approved{background:#baf2c8;border-left:6px solid #07833c}.unified-inbox-table tbody tr.status-row-rejected{background:#ffc8c4;border-left:6px solid #c51f1a}
      .unified-inbox-person{display:grid;gap:3px}.unified-inbox-person small{color:#68746e}.unified-inbox-kind{display:inline-flex;width:max-content;max-width:230px;border-radius:7px;background:#e9f8ef;color:#126c44;padding:5px 8px;font-size:.72rem;font-weight:900;overflow-wrap:anywhere}
      .unified-inbox-status{display:inline-flex;flex-shrink:0;border-radius:999px;padding:4px 8px;font-size:.67rem;font-weight:900}
      .unified-inbox-status-pending{background:#ffda45;color:#593600;border:1px solid #bd7b00}.unified-inbox-status-processing{background:#1683e8;color:#fff;border:1px solid #0755a1}
      .unified-inbox-status-approved{background:#129447;color:#fff;border:1px solid #08652e}.unified-inbox-status-rejected{background:#d92727;color:#fff;border:1px solid #a10e0e}
      .unified-inbox-open{display:block;width:100%;min-width:0;box-sizing:border-box;border:2px solid #045b2c;border-radius:8px;background:#087c3e;color:#fff;font-weight:900;font-size:.76rem;text-align:center;padding:9px 5px;cursor:pointer;white-space:normal;overflow-wrap:anywhere;line-height:1.2}
      .unified-inbox-mobile-list{display:none}.unified-inbox-mobile-item{border:2px solid #d4ded7;border-left:8px solid #d28a00;border-radius:13px;padding:14px;background:#fff0a8;margin-bottom:14px;box-shadow:0 3px 9px rgba(15,35,25,.12)}.unified-inbox-mobile-item.status-row-pending{background:#fff0a8;border-color:#e0ad24;border-left-color:#c47c00}.unified-inbox-mobile-item.status-row-processing{background:#c8e3ff;border-color:#65a9ee;border-left-color:#0969c7}.unified-inbox-mobile-item.status-row-approved{background:#baf2c8;border-color:#52bd76;border-left-color:#07833c}.unified-inbox-mobile-item.status-row-rejected{background:#ffc8c4;border-color:#ee8179;border-left-color:#c51f1a}.unified-inbox-mobile-item.status-row-no-payment{background:#ffe1e1;border-color:#fca5a5;border-left-color:#dc2626}.unified-inbox-mobile-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.unified-inbox-mobile-item h3{font-size:.92rem;margin:9px 0 4px}.unified-inbox-mobile-meta{display:flex;flex-wrap:wrap;gap:7px 12px;color:#68746e;font-size:.76rem;margin:10px 0}.unified-inbox-mobile-item .unified-inbox-open{width:100%;min-height:46px;background:#087c3e;color:#fff;border:2px solid #045b2c;font-size:.9rem;letter-spacing:.02em}
      .unified-inbox-open:focus-visible,.unified-inbox-filters select:focus-visible{outline:3px solid #91c2ff;outline-offset:2px}
      .unified-inbox-empty{border:1px dashed #cbd9d0;border-radius:12px;padding:28px 16px;text-align:center;color:#63716a}
      @media(max-width:720px){.unified-inbox-counts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.unified-inbox-count{display:flex;justify-content:space-between;gap:8px}.unified-inbox-mobile-top{flex-wrap:wrap}.unified-inbox-mobile-item h3{font-size:1rem;line-height:1.35}.unified-inbox-mobile-meta{color:#263a2d;font-weight:650}}
      @media(max-width:620px){.unified-inbox-table-wrap{display:none}.unified-inbox-mobile-list{display:block}.unified-inbox-filters label,.unified-inbox-filters select{width:100%}}
    `}</style>
    <div className="unified-inbox-counts" aria-label="Muhtasari wa maombi">{(["NO_PAYMENT","PENDING","PROCESSING","APPROVED","REJECTED","ALL"] as const).map((status)=><div className="unified-inbox-count" key={status}>{status==="ALL"?"YOTE":status==="NO_PAYMENT"?"NO PAYMENT":status}<strong>{counts[status]}</strong></div>)}</div>
    <div className="unified-inbox-filters">
      <label>Aina ya ombi<select value={kindFilter} onChange={(event)=>setKindFilter(event.target.value as InboxKind)}><option value="ALL">Aina zote</option><option value="SERVICE">Huduma za mfumo / SME</option><option value="LIPA">LIPA NAMBA / ACCESS LIPA</option></select></label>
      <label>Hali ya ombi<select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value as InboxStatus)}><option value="ALL">Hali zote</option><option value="NO_PAYMENT">NO PAYMENT</option><option value="PENDING">PENDING</option><option value="PROCESSING">PROCESSING</option><option value="APPROVED">APPROVED</option><option value="REJECTED">REJECTED</option></select></label>
      <span style={{fontSize:".8rem",color:"#63716a"}}>Inaonekana: <strong>{visibleRows.length}</strong> / {rows.length}</span>
    </div>
    {visibleRows.length===0?<div className="unified-inbox-empty">Hakuna maombi yanayolingana na vichujio ulivyochagua.</div>:<>
      <div className="unified-inbox-table-wrap"><table className="unified-inbox-table"><thead><tr><th>MWOMBAJI</th><th>AINA YA OMBI</th><th>MTANDAO</th><th>SIMU</th><th>TAREHE YA OMBI</th><th>STATUS</th><th>VITENDO</th></tr></thead><tbody>{visibleRows.map((row)=><tr key={row.kind+":"+row.id} className={"status-row-"+(row.paymentGated?"no-payment":String(row.status).toLowerCase())}>
        <td><div className="unified-inbox-person"><strong>{row.person}</strong><small>{row.kind==="LIPA"?"Maombi ya Lipa":"Maombi ya huduma maalum"}</small></div></td>
        <td><span className="unified-inbox-kind">{row.kindLabel}</span></td>
        <td>{row.service||"—"}</td><td>{row.phone||"—"}</td><td>{row.dateLabel}</td><td><span className={"unified-inbox-status "+(row.paymentGated?"unified-inbox-status-no-payment":statusClass(String(row.status)))}>{row.paymentGated?"NO PAYMENT":String(row.status).toUpperCase()}</span></td>
        <td><button type="button" className="unified-inbox-open" onClick={()=>onSelect(row.kind,row.id)}>Open</button></td>
      </tr>)}</tbody></table></div>
      <div className="unified-inbox-mobile-list">{visibleRows.map((row)=><article className={"unified-inbox-mobile-item status-row-"+(row.paymentGated?"no-payment":String(row.status).toLowerCase())} key={row.kind+":"+row.id}>
        <div className="unified-inbox-mobile-top"><span className="unified-inbox-kind">{row.kindLabel}</span><span className={"unified-inbox-status "+(row.paymentGated?"unified-inbox-status-no-payment":statusClass(String(row.status)))}>{row.paymentGated?"NO PAYMENT":String(row.status).toUpperCase()}</span></div>
        <h3>{row.person}</h3>
        <div className="unified-inbox-mobile-meta"><span>Aina: {row.kindLabel}</span><span>Mtandao: {row.service||"—"}</span>{row.phone&&<span>Simu: {row.phone}</span><span>{row.dateLabel}</span></div>
        <button type="button" className="unified-inbox-open" onClick={()=>onSelect(row.kind,row.id)}>Fungua ombi</button>
      </article>)}</div>
    </>}
  </div>;
}
