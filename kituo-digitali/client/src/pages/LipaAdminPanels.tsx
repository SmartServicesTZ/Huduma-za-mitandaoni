import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Download, Edit3, ExternalLink, Eye, FileText, Image as ImageIcon, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { adminDeleteCollectionItem, adminSaveCollectionItem, getLipaApplicationDocument, markLipaApplicationViewed, replyToLipaApplication, seedServiceCatalog, setLipaApplicationStatus, updateLipaRewardTracking, type LipaApplication, type LipaNetworkConfig } from "@/lib/firebase";
import { serviceFieldTypes, type ServiceFormField } from "../../../shared/serviceForms";

type RunAction = (action: () => Promise<unknown>, successMessage: string) => void | boolean | Promise<void | boolean>;
type NetworkCollection = LipaNetworkConfig[] | Record<string, LipaNetworkConfig>;
type ApplicationStatus = LipaApplication["status"];
type SortKey = "applicationId" | "userName" | "network" | "applicantName" | "phone" | "nidaNumber" | "tinNumber" | "businessName" | "submittedAt" | "status" | "assignedAdmin" | "lipaNumber" | "rewardStatus";

type DocumentPreview = { url: string; label: string; image: boolean };

function networkList(networks: NetworkCollection): LipaNetworkConfig[] {
  return Array.isArray(networks) ? networks : Object.values(networks);
}

function networkMap(networks: NetworkCollection): Record<string, LipaNetworkConfig> {
  return Object.fromEntries(networkList(networks).map((network) => [network.id, network]));
}

function dateText(value: unknown): string {
  if (!value) return "—";
  try {
    if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
      return (value as { toDate: () => Date }).toDate().toLocaleString("sw-TZ");
    }
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("sw-TZ");
  } catch {
    return "—";
  }
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "Kitendo kimeshindikana. Jaribu tena.");
}

function applicationStatusTimestamp(application: LipaApplication, status: ApplicationStatus): unknown {
  const row = application as unknown as Record<string, unknown>;
  return row[`${status.toLowerCase()}At`] ?? row[`${status.toLowerCase()}AtUtc`] ?? row[`${status.toLowerCase()}Timestamp`] ?? (status === "PENDING" ? application.submittedAt : application.updatedAt);
}

function statusLabel(status: ApplicationStatus): string {
  return { PENDING: "PENDING", PROCESSING: "PROCESSING", APPROVED: "APPROVED", REJECTED: "REJECTED" }[status];
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <span className={`lipa-admin-status lipa-admin-status-${status.toLowerCase()}`}>{statusLabel(status)}</span>;
}

function PanelStyles() {
  return <style>{`
    .lipa-admin-panel { color: #17251f; width: 100%; }
    .lipa-admin-panel *, .lipa-admin-panel *::before, .lipa-admin-panel *::after { box-sizing: border-box; }
    .lipa-admin-heading { align-items: flex-start; display: flex; gap: 16px; justify-content: space-between; margin-bottom: 18px; }
    .lipa-admin-heading h2 { font-size: clamp(1.1rem, 2vw, 1.4rem); margin: 0 0 5px; }
    .lipa-admin-heading p { color: #68746e; margin: 0; }
    .lipa-admin-stats { display: grid; gap: 10px; grid-template-columns: repeat(5, minmax(0, 1fr)); margin-bottom: 18px; }
    .lipa-admin-stat { background: #fff; border: 1px solid #e2e9e4; border-radius: 12px; padding: 13px 15px; }
    .lipa-admin-stat span { color: #68746e; display: block; font-size: .78rem; }
    .lipa-admin-stat strong { display: block; font-size: 1.45rem; margin-top: 3px; }
    .lipa-admin-tabs { align-items: center; border-bottom: 1px solid #dce5df; display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .lipa-admin-tab { background: transparent; border: 0; border-bottom: 2px solid transparent; color: #63716a; cursor: pointer; font-size: .82rem; font-weight: 700; padding: 10px 12px; }
    .lipa-admin-tab:hover, .lipa-admin-tab-active { border-bottom-color: #168653; color: #126c44; }
    .lipa-admin-count { background: #edf4ef; border-radius: 999px; color: #126c44; font-size: .72rem; margin-left: 4px; padding: 2px 7px; }
    .lipa-admin-card { background: #fff; border: 1px solid #e2e9e4; border-radius: 14px; overflow: hidden; }
    .lipa-admin-table-wrap { overflow-x: auto; }
    .lipa-admin-table { border-collapse: collapse; min-width: 1120px; width: 100%; }
    .lipa-admin-table th { background: #f7faf8; color: #63716a; font-size: .72rem; letter-spacing: .025em; text-align: left; text-transform: uppercase; white-space: nowrap; }
    .lipa-admin-table th, .lipa-admin-table td { border-bottom: 1px solid #edf1ee; padding: 12px 11px; vertical-align: top; }
    .lipa-admin-table td { font-size: .84rem; }
    .lipa-admin-sort { align-items: center; background: transparent; border: 0; color: inherit; cursor: pointer; display: inline-flex; gap: 4px; font: inherit; padding: 0; text-transform: inherit; }
    .lipa-admin-row-action, .lipa-admin-button { align-items: center; border: 1px solid #cbd9d0; border-radius: 8px; cursor: pointer; display: inline-flex; font-size: .8rem; font-weight: 700; gap: 6px; justify-content: center; padding: 8px 11px; }
    .lipa-admin-row-action { background: #f2faf5; color: #126c44; }
    .lipa-admin-button { background: #168653; border-color: #168653; color: #fff; }
    .lipa-admin-button:hover, .lipa-admin-row-action:hover { filter: brightness(.96); }
    .lipa-admin-button-secondary { background: #fff; color: #205b40; }
    .lipa-admin-button-danger { background: #fff4f3; border-color: #e6b7b2; color: #a63b30; }
    .lipa-admin-button:disabled, .lipa-admin-row-action:disabled { cursor: not-allowed; opacity: .55; }
    .lipa-admin-status { border-radius: 999px; display: inline-block; font-size: .68rem; font-weight: 800; letter-spacing: .025em; padding: 4px 8px; white-space: nowrap; }
    .lipa-admin-status-pending { background: #fff4d6; color: #8a5b00; }
    .lipa-admin-status-processing { background: #e2f0ff; color: #14568f; }
    .lipa-admin-status-approved { background: #ddf7e8; color: #13703e; }
    .lipa-admin-status-rejected { background: #ffe4e1; color: #a63329; }
    .lipa-admin-empty { color: #68746e; padding: 30px; text-align: center; }
    .lipa-admin-overlay { align-items: center; background: rgba(13, 28, 20, .58); display: flex; inset: 0; justify-content: center; padding: 18px; position: fixed; z-index: 70; }
    .lipa-admin-modal { background: #fff; border-radius: 15px; box-shadow: 0 22px 70px rgba(13, 38, 25, .28); max-height: min(92vh, 920px); max-width: 880px; overflow-y: auto; padding: 23px; position: relative; width: 100%; }
    .lipa-admin-modal-small { max-width: 500px; }
    .lipa-admin-modal-header { align-items: flex-start; display: flex; gap: 14px; justify-content: space-between; margin-bottom: 18px; }
    .lipa-admin-modal-header h3 { margin: 0 0 5px; }
    .lipa-admin-modal-header p { color: #68746e; margin: 0; }
    .lipa-admin-close { align-items: center; background: transparent; border: 0; border-radius: 7px; color: #52625a; cursor: pointer; display: inline-flex; padding: 7px; }
    .lipa-admin-close:hover { background: #f0f5f1; }
    .lipa-admin-detail-grid { display: grid; gap: 10px 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lipa-admin-detail-item { border-bottom: 1px solid #edf1ee; padding: 8px 0; }
    .lipa-admin-detail-item dt { color: #68746e; font-size: .73rem; margin-bottom: 3px; }
    .lipa-admin-detail-item dd { margin: 0; overflow-wrap: anywhere; }
    .lipa-admin-section-title { border-bottom: 1px solid #e6ede8; font-size: .93rem; margin: 22px 0 6px; padding-bottom: 8px; }
    .lipa-admin-file { align-items: center; background: #f7faf8; border: 1px solid #e1ebe4; border-radius: 8px; display: flex; gap: 8px; justify-content: space-between; padding: 9px; }
    .lipa-admin-file-label { align-items: center; display: inline-flex; gap: 7px; min-width: 0; }
    .lipa-admin-file-label span { overflow-wrap: anywhere; }
    .lipa-admin-file-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .lipa-admin-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 22px; }
    .lipa-admin-error { background: #fff4f3; border: 1px solid #e7bbb6; border-radius: 8px; color: #9d332b; font-size: .84rem; margin-top: 10px; padding: 9px 11px; }
    .lipa-admin-preview { display: block; max-height: 65vh; max-width: 100%; object-fit: contain; }
    .lipa-admin-form { display: grid; gap: 13px; }
    .lipa-admin-form-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lipa-admin-field { display: grid; gap: 5px; }
    .lipa-admin-field-wide { grid-column: 1 / -1; }
    .lipa-admin-field label, .lipa-admin-field > span { color: #4e5d55; font-size: .78rem; font-weight: 700; }
    .lipa-admin-field input, .lipa-admin-field textarea, .lipa-admin-field select { background: #fff; border: 1px solid #cad8cf; border-radius: 8px; color: #17251f; font: inherit; min-height: 38px; padding: 8px 10px; width: 100%; }
    .lipa-admin-field textarea { min-height: 82px; resize: vertical; }
    .lipa-admin-field input:focus, .lipa-admin-field textarea:focus, .lipa-admin-field select:focus, .lipa-admin-button:focus-visible, .lipa-admin-row-action:focus-visible, .lipa-admin-tab:focus-visible, .lipa-admin-close:focus-visible { outline: 3px solid rgba(24, 137, 83, .24); outline-offset: 2px; }
    .lipa-admin-check { align-items: center; display: flex; gap: 8px; }
    .lipa-admin-check input { accent-color: #168653; min-height: auto; width: auto; }
    .lipa-admin-form-heading { align-items: center; display: flex; justify-content: space-between; }
    .lipa-admin-form-heading h3 { font-size: 1rem; margin: 0; }
    .lipa-admin-form-heading span { color: #68746e; font-size: .78rem; }
    .lipa-admin-field-editor { border: 1px solid #dce6df; border-radius: 10px; padding: 12px; }
    .lipa-admin-field-editor + .lipa-admin-field-editor { margin-top: 10px; }
    .lipa-admin-editor-heading { align-items: center; display: flex; justify-content: space-between; margin-bottom: 10px; }
    .lipa-admin-editor-heading strong { font-size: .82rem; }
    .lipa-admin-network-list { display: grid; gap: 10px; margin-bottom: 18px; }
    .lipa-admin-network-item { align-items: center; border: 1px solid #e1e9e3; border-radius: 10px; display: flex; gap: 12px; justify-content: space-between; padding: 12px 14px; }
    .lipa-admin-network-item small { color: #68746e; display: block; margin-top: 3px; }
    .lipa-admin-network-actions { display: flex; flex-wrap: wrap; gap: 7px; }
    .lipa-admin-muted { color: #68746e; font-size: .78rem; }
    .lipa-admin-preview-link { overflow-wrap: anywhere; }
    @media (max-width: 900px) { .lipa-admin-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 620px) { .lipa-admin-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .lipa-admin-detail-grid, .lipa-admin-form-grid { grid-template-columns: 1fr; } .lipa-admin-field-wide { grid-column: auto; } .lipa-admin-modal { padding: 17px; } .lipa-admin-network-item { align-items: flex-start; flex-direction: column; } .lipa-admin-network-actions { width: 100%; } .lipa-admin-network-actions .lipa-admin-button { flex: 1; } }
  `}</style>;
}

export function LipaApplicationsPanel({ applications, networks, onRun, adminId, busy }: { applications: LipaApplication[]; networks: NetworkCollection; onRun: RunAction; adminId: string; busy: boolean }) {
  const [tab, setTab] = useState<"ALL" | ApplicationStatus>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("submittedAt");
  const [descending, setDescending] = useState(true);
  const [selected, setSelected] = useState<LipaApplication | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const [documentBusy, setDocumentBusy] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState("");
  const [rewardSaving, setRewardSaving] = useState(false);
  const [replySaving, setReplySaving] = useState(false);
  const [replyForm, setReplyForm] = useState({ reply: "", infoRequest: "" });
  const [rewardForm, setRewardForm] = useState({
    lipaNumber: "",
    verifiedTransactions: 0,
    qualificationStatus: "PENDING_CHECK" as "PENDING_CHECK" | "QUALIFIED" | "NOT_QUALIFIED",
    rewardStatus: "UNPAID" as "UNPAID" | "PAID" | "NOT_ELIGIBLE",
    rewardPaymentReference: "",
    rewardNote: "",
  });
  const viewedApplications = useRef(new Set<string>());
  const byNetwork = useMemo(() => networkMap(networks), [networks]);
  const pendingCount = applications.filter((application) => application.status === "PENDING").length;
  const counts = useMemo(() => ({ ALL: applications.length, PENDING: pendingCount, PROCESSING: applications.filter((item) => item.status === "PROCESSING").length, APPROVED: applications.filter((item) => item.status === "APPROVED").length, REJECTED: applications.filter((item) => item.status === "REJECTED").length }), [applications, pendingCount]);
  const visibleApplications = useMemo(() => {
    const filtered = tab === "ALL" ? [...applications] : applications.filter((application) => application.status === tab);
    return filtered.sort((a, b) => {
      const left = sortKey === "network" ? (byNetwork[a.networkId]?.name ?? a.network) : sortKey === "submittedAt" ? dateText(a.submittedAt) : String((a as unknown as Record<string, unknown>)[sortKey] ?? "");
      const right = sortKey === "network" ? (byNetwork[b.networkId]?.name ?? b.network) : sortKey === "submittedAt" ? dateText(b.submittedAt) : String((b as unknown as Record<string, unknown>)[sortKey] ?? "");
      const comparison = left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
      return descending ? -comparison : comparison;
    });
  }, [applications, byNetwork, descending, sortKey, tab]);

  const openApplication = (application: LipaApplication) => {
    setSelected(application);
    setRejecting(false);
    setRejectReason("");
    setDocumentPreview(null);
    setDocumentError("");
    setRewardForm({
      lipaNumber: application.lipaNumber ?? "",
      verifiedTransactions: Number(application.verifiedTransactions ?? 0),
      qualificationStatus: application.qualificationStatus ?? "PENDING_CHECK",
      rewardStatus: application.rewardStatus ?? (Number(application.reward ?? 0) > 0 ? "UNPAID" : "NOT_ELIGIBLE"),
      rewardPaymentReference: application.rewardPaymentReference ?? "",
      rewardNote: application.rewardNote ?? "",
    });
    setReplyForm({ reply: application.adminReply ?? "", infoRequest: application.additionalInfoRequest ?? "" });
    const key = application.applicationId || application.id;
    if (!viewedApplications.current.has(key)) {
      viewedApplications.current.add(key);
      void markLipaApplicationViewed(application.applicationId || application.id).catch((error) => toast.error(errorText(error)));
    }
  };

  const runStatus = async (status: "PROCESSING" | "APPROVED" | "REJECTED", reason = "") => {
    if (!selected) return;
    await onRun(() => setLipaApplicationStatus(selected.applicationId || selected.id, status, reason), status === "PROCESSING" ? "Ombi limehamishwa PROCESSING." : status === "APPROVED" ? "Ombi limeidhinishwa." : "Ombi limekataliwa.");
    setSelected(null);
    setRejecting(false);
  };

  const loadDocument = async (field: ServiceFormField, action: "preview" | "download") => {
    if (!selected) return;
    setDocumentBusy(field.fieldName);
    setDocumentError("");
    try {
      const result = await getLipaApplicationDocument(selected.applicationId || selected.id, field.fieldName);
      if (!result?.url) throw new Error("Hati haikupatikana.");
      if (action === "preview" && field.type === "IMAGE_UPLOAD") setDocumentPreview({ url: result.url, label: field.label, image: true });
      else window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setDocumentError(`${field.label}: ${errorText(error)}`);
    } finally {
      setDocumentBusy(null);
    }
  };

  const changeSort = (key: SortKey) => {
    if (key === sortKey) setDescending((value) => !value);
    else { setSortKey(key); setDescending(true); }
  };

  const saveAdminReply = async () => {
    if (!selected || (!replyForm.reply.trim() && !replyForm.infoRequest.trim())) {
      toast.error("Andika jibu au ombi la taarifa za ziada.");
      return;
    }
    setReplySaving(true);
    try {
      await replyToLipaApplication(selected.applicationId || selected.id, replyForm.reply, replyForm.infoRequest);
      toast.success(replyForm.infoRequest.trim() ? "Jibu/ombi la taarifa limetumwa kwa mtumiaji." : "Jibu limetumwa kwa mtumiaji.");
      setSelected((current) => current ? { ...current, adminReply: replyForm.reply.trim(), additionalInfoRequest: replyForm.infoRequest.trim() } : current);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setReplySaving(false);
    }
  };

  const saveRewardTracking = async () => {
    if (!selected || Number(selected.reward ?? 0) <= 0) return;
    setRewardSaving(true);
    try {
      await updateLipaRewardTracking(selected.applicationId || selected.id, rewardForm);
      toast.success("Taarifa za Lipa na zawadi zimehifadhiwa.");
      setSelected((current) => current ? { ...current, ...rewardForm } : current);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setRewardSaving(false);
    }
  };
  const columns: Array<[SortKey, string]> = [["applicationId", "Application ID"], ["userName", "User / account"], ["network", "Network"], ["applicantName", "Applicant"], ["phone", "Phone"], ["nidaNumber", "NIDA"], ["tinNumber", "TIN"], ["businessName", "Business"], ["submittedAt", "Date"], ["status", "Status"], ["assignedAdmin", "Assigned admin"], ["lipaNumber", "Lipa Number"], ["rewardStatus", "Zawadi"]];

  return <section className="lipa-admin-panel" aria-labelledby="lipa-applications-heading">
    <PanelStyles />
    <div className="lipa-admin-heading"><div><h2 id="lipa-applications-heading">Lipa applications</h2><p>Angalia, gawa na chukua hatua kwa maombi ya mitandao.</p></div><span className="lipa-admin-status lipa-admin-status-pending" aria-label={`${pendingCount} pending applications`}>{pendingCount} PENDING</span></div>
    <div className="lipa-admin-stats">{(["ALL", "PENDING", "PROCESSING", "APPROVED", "REJECTED"] as const).map((status) => <div className="lipa-admin-stat" key={status}><span>{status === "ALL" ? "All applications" : status}</span><strong>{counts[status]}</strong></div>)}</div>
    <div className="lipa-admin-tabs" role="tablist" aria-label="Application status filter">{(["ALL", "PENDING", "PROCESSING", "APPROVED", "REJECTED"] as const).map((status) => <button key={status} type="button" role="tab" aria-selected={tab === status} className={`lipa-admin-tab ${tab === status ? "lipa-admin-tab-active" : ""}`} onClick={() => setTab(status)}>{status}<span className="lipa-admin-count">{counts[status]}</span></button>)}</div>
    <div className="lipa-admin-card lipa-admin-table-wrap"><table className="lipa-admin-table"><caption className="lipa-admin-muted">Lipa applications filtered by {tab}</caption><thead><tr>{columns.map(([key, label]) => <th key={key} scope="col"><button type="button" className="lipa-admin-sort" onClick={() => changeSort(key)}>{label}{sortKey === key ? (descending ? <ArrowDown size={13} aria-label="descending" /> : <ArrowUp size={13} aria-label="ascending" />) : null}</button></th>)}<th scope="col">Action</th></tr></thead><tbody>{visibleApplications.length === 0 ? <tr><td colSpan={columns.length + 1}><div className="lipa-admin-empty">Hakuna maombi kwenye kichupo hiki.</div></td></tr> : visibleApplications.map((application) => <tr key={application.id || application.applicationId}><td>{application.applicationId || application.id}</td><td>{application.userName || application.userId || "—"}<small>UID: {application.userId}</small></td><td>{byNetwork[application.networkId]?.name ?? application.network ?? "—"}</td><td>{application.applicantName || "—"}</td><td>{application.phone || "—"}</td><td>{application.nidaNumber || "—"}</td><td>{application.tinNumber || "—"}</td><td>{application.businessName || "—"}</td><td>{dateText(application.submittedAt)}</td><td><StatusBadge status={application.status} /></td><td>{application.assignedAdmin || "—"}</td><td>{application.lipaNumber || "—"}</td><td>{application.rewardStatus === "PAID" ? "AMELIPWA" : application.rewardStatus === "NOT_ELIGIBLE" ? "HASTAHILI" : application.rewardStatus === "UNPAID" ? "BADO" : "INASUBIRI"}<small>{Number(application.reward ?? 0) > 0 ? ` · TZS ${Number(application.reward).toLocaleString()}` : ""}</small></td><td><button type="button" className="lipa-admin-row-action" onClick={() => openApplication(application)}><Eye size={15} /> OPEN</button></td></tr>)}</tbody></table></div>
    {selected && <div className="lipa-admin-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><div className="lipa-admin-modal" role="dialog" aria-modal="true" aria-labelledby="lipa-application-detail-heading"><div className="lipa-admin-modal-header"><div><h3 id="lipa-application-detail-heading">Application {selected.applicationId || selected.id}</h3><p>{byNetwork[selected.networkId]?.name ?? selected.network ?? "Unknown network"} · <StatusBadge status={selected.status} /></p></div><button type="button" className="lipa-admin-close" aria-label="Close application details" onClick={() => setSelected(null)}><X size={19} /></button></div>
      <dl className="lipa-admin-detail-grid"><div className="lipa-admin-detail-item"><dt>Applicant</dt><dd>{selected.applicantName || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>User account</dt><dd>{selected.userName || selected.userId || "—"}<br /></dd></div><div className="lipa-admin-detail-item"><dt>Phone</dt><dd>{selected.phone || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>NIDA</dt><dd>{selected.nidaNumber || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>TIN</dt><dd>{selected.tinNumber || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>Business name</dt><dd>{selected.businessName || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>User ID</dt><dd>{selected.userId || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>Submitted</dt><dd>{dateText(selected.submittedAt)}</dd></div><div className="lipa-admin-detail-item"><dt>Updated</dt><dd>{dateText(selected.updatedAt)}</dd></div><div className="lipa-admin-detail-item"><dt>Assigned admin</dt><dd>{selected.assignedAdmin || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>Rejection reason</dt><dd>{selected.rejectionReason || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>Maelezo ya ziada</dt><dd>{selected.additionalNotes || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>Zawadi</dt><dd>TZS {Number(selected.reward ?? 0).toLocaleString()} · {selected.rewardStatus || "UNPAID"}</dd></div><div className="lipa-admin-detail-item"><dt>Namba ya Lipa</dt><dd>{selected.lipaNumber || "Bado haijawekwa"}</dd></div><div className="lipa-admin-detail-item"><dt>Miamala iliyothibitishwa</dt><dd>{Number(selected.verifiedTransactions ?? 0).toLocaleString()}</dd></div></dl>
       <section className="lipa-admin-card" style={{marginTop:18,padding:16}}>
         <h4 className="lipa-admin-section-title" style={{marginTop:0}}>Mawasiliano na mwombaji</h4>
         <p className="lipa-admin-muted">Jibu ombi au mwombe mtumiaji taarifa za ziada. Ujumbe utatumwa moja kwa moja kwenye mfumo wake.</p>
         <div className="lipa-admin-field" style={{marginTop:12}}><label>Jibu la Admin</label><textarea value={replyForm.reply} onChange={(e) => setReplyForm((v) => ({...v, reply:e.target.value}))} placeholder="Andika jibu kwa mwombaji..." /></div>
         <div className="lipa-admin-field" style={{marginTop:12}}><label>Taarifa za ziada zinazohitajika</label><textarea value={replyForm.infoRequest} onChange={(e) => setReplyForm((v) => ({...v, infoRequest:e.target.value}))} placeholder="Mfano: Tafadhali tuma picha iliyo wazi ya NIDA..." /></div>
         <div className="lipa-admin-actions"><button type="button" className="lipa-admin-button" disabled={replySaving || (!replyForm.reply.trim() && !replyForm.infoRequest.trim())} onClick={() => void saveAdminReply()}>{replySaving ? "Inatuma..." : "TUMA JIBU / OMBI LA TAARIFA"}</button></div>
       </section>
      <h4 className="lipa-admin-section-title">Status timestamps</h4><dl className="lipa-admin-detail-grid">{(["PENDING", "PROCESSING", "APPROVED", "REJECTED"] as const).map((status) => <div className="lipa-admin-detail-item" key={status}><dt>{status}</dt><dd>{dateText(applicationStatusTimestamp(selected, status))}</dd></div>)}</dl>
      {selected.status === "APPROVED" && Number(selected.reward ?? 0) > 0 && <section className="lipa-admin-card" style={{marginTop:18,padding:16}}>
        <h4 className="lipa-admin-section-title" style={{marginTop:0}}>Ufuatiliaji wa Lipa & Zawadi</h4>
        <p className="lipa-admin-muted">Hapa utaweka Lipa Namba iliyotolewa, idadi ya miamala kutoka report ya kesho, kisha utatenganisha waliohitimu, ambao hawajafuzu na waliolipwa.</p>
        <div className="lipa-admin-form-grid" style={{marginTop:12}}>
          <div className="lipa-admin-field"><label>Lipa Namba iliyotolewa</label><input value={rewardForm.lipaNumber} onChange={(e) => setRewardForm((v) => ({...v,lipaNumber:e.target.value}))} placeholder="Mfano 123456" /></div>
          <div className="lipa-admin-field"><label>Miamala iliyothibitishwa</label><input type="number" min="0" value={rewardForm.verifiedTransactions} onChange={(e) => setRewardForm((v) => ({...v,verifiedTransactions:Number(e.target.value)||0}))} /></div>
          <div className="lipa-admin-field"><label>Qualification</label><select value={rewardForm.qualificationStatus} onChange={(e) => setRewardForm((v) => ({...v,qualificationStatus:e.target.value as typeof v.qualificationStatus}))}><option value="PENDING_CHECK">Bado inafuatiliwa</option><option value="QUALIFIED">Amefikia vigezo</option><option value="NOT_QUALIFIED">Hajafikia vigezo</option></select></div>
          <div className="lipa-admin-field"><label>Hali ya zawadi</label><select value={rewardForm.rewardStatus} onChange={(e) => setRewardForm((v) => ({...v,rewardStatus:e.target.value as typeof v.rewardStatus}))}><option value="UNPAID">Bado hajalipwa</option><option value="PAID">Amelipwa</option><option value="NOT_ELIGIBLE">Hastahili</option></select></div>
          <div className="lipa-admin-field lipa-admin-field-wide"><label>Reference ya malipo</label><input value={rewardForm.rewardPaymentReference} onChange={(e) => setRewardForm((v) => ({...v,rewardPaymentReference:e.target.value}))} placeholder="Mfano TXN/MPESA reference ya TZS 500" /></div>
          <div className="lipa-admin-field lipa-admin-field-wide"><label>Maelezo ya ufuatiliaji</label><textarea value={rewardForm.rewardNote} onChange={(e) => setRewardForm((v) => ({...v,rewardNote:e.target.value}))} placeholder="Mfano report ya 08/10/2026, Lipa ilifikisha miamala 12..." /></div>
        </div>
        <section className="lipa-admin-card" style={{marginTop:18,padding:16}}>
         <h4 className="lipa-admin-section-title" style={{marginTop:0}}>Jibu / omba taarifa za ziada</h4>
         <p className="lipa-admin-muted">Mtumiaji ataona ujumbe huu kwenye maelezo ya ombi lake na pia atapokea ujumbe kwenye mfumo.</p>
         {selected.adminReply && <div className="lipa-admin-detail-item"><dt>Jibu la mwisho la Admin</dt><dd>{selected.adminReply}</dd></div>}
         {selected.additionalInfoRequest && <div className="lipa-admin-detail-item"><dt>Taarifa za ziada zinazoombwa</dt><dd>{selected.additionalInfoRequest}</dd></div>}
         <div className="lipa-admin-form-grid" style={{marginTop:12}}>
           <div className="lipa-admin-field lipa-admin-field-wide"><label>Jibu la Admin</label><textarea value={replyForm.reply} onChange={(e) => setReplyForm((v) => ({...v,reply:e.target.value}))} placeholder="Andika jibu, maelekezo au taarifa kwa mtumiaji..." /></div>
           <div className="lipa-admin-field lipa-admin-field-wide"><label>Omba taarifa za ziada</label><textarea value={replyForm.infoRequest} onChange={(e) => setReplyForm((v) => ({...v,infoRequest:e.target.value}))} placeholder="Mfano: Tafadhali tuma picha iliyo wazi ya NIDA na namba ya simu..." /></div>
         </div>
         <div className="lipa-admin-actions"><button type="button" className="lipa-admin-button" disabled={replySaving} onClick={() => void saveAdminReply()}>{replySaving ? "Inatuma..." : "TUMA UJUMBE KWA MTUMIAJI"}</button></div>
       </section>
       <div className="lipa-admin-actions"><button type="button" className="lipa-admin-button" disabled={rewardSaving} onClick={() => void saveRewardTracking()}>{rewardSaving ? "Inahifadhi..." : "HIFADHI TAARIFA ZA ZAWADI"}</button></div>
      </section>}
      <h4 className="lipa-admin-section-title">Applicant data</h4><div className="lipa-admin-detail-grid">{(byNetwork[selected.networkId]?.fields ?? []).map((field) => { const value = selected.applicantData?.[field.fieldName]; const isFile = field.type === "IMAGE_UPLOAD" || field.type === "FILE_UPLOAD"; return <div className="lipa-admin-detail-item" key={field.fieldName}><dt>{field.label || field.fieldName} <span className="lipa-admin-muted">({field.type})</span></dt><dd>{isFile && value ? <div className="lipa-admin-file"><span className="lipa-admin-file-label">{field.type === "IMAGE_UPLOAD" ? <ImageIcon size={15} /> : <FileText size={15} />}<span>Private uploaded document</span></span><span className="lipa-admin-file-actions"><button type="button" className="lipa-admin-row-action" disabled={documentBusy === field.fieldName} onClick={() => void loadDocument(field, "preview")}>{field.type === "IMAGE_UPLOAD" ? <><Eye size={14} /> Preview</> : <><ExternalLink size={14} /> Open</>}</button><button type="button" className="lipa-admin-row-action" disabled={documentBusy === field.fieldName} onClick={() => void loadDocument(field, "download")}><Download size={14} /> Download</button></span></div> : <span>{displayValue(value)}</span>}</dd></div>; })}</div>
      {documentError && <div className="lipa-admin-error" role="alert">{documentError}</div>}
      <div className="lipa-admin-actions">{selected.status === "PENDING" && <button type="button" className="lipa-admin-button" disabled={busy} onClick={() => void runStatus("PROCESSING")}><Check size={15} /> PROCESSING</button>}{selected.status === "PROCESSING" && <><button type="button" className="lipa-admin-button" disabled={busy} onClick={() => void runStatus("APPROVED")}><Check size={15} /> APPROVE</button><button type="button" className="lipa-admin-button lipa-admin-button-danger" disabled={busy} onClick={() => setRejecting(true)}><X size={15} /> REJECT</button></>}</div>
    </div></div>}
    {documentPreview && <div className="lipa-admin-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDocumentPreview(null); }}><div className="lipa-admin-modal modal-small lipa-admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="lipa-document-preview-heading"><div className="lipa-admin-modal-header"><div><h3 id="lipa-document-preview-heading">{documentPreview.label}</h3><p>Signed private preview</p></div><button type="button" className="lipa-admin-close" aria-label="Close document preview" onClick={() => setDocumentPreview(null)}><X size={19} /></button></div><img className="lipa-admin-preview" src={documentPreview.url} alt={`${documentPreview.label} preview`} /></div></div>}
    {rejecting && <div className="lipa-admin-overlay" role="presentation"><div className="lipa-admin-modal lipa-admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="lipa-reject-heading"><div className="lipa-admin-modal-header"><div><h3 id="lipa-reject-heading">Reject application</h3><p>Reason is required and will be saved with the trusted status action.</p></div><button type="button" className="lipa-admin-close" aria-label="Close rejection dialog" onClick={() => setRejecting(false)}><X size={19} /></button></div><div className="lipa-admin-field"><label htmlFor="lipa-rejection-reason">Rejection reason</label><textarea id="lipa-rejection-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} autoFocus required placeholder="Andika sababu ya kukataa ombi..." /></div><div className="lipa-admin-actions"><button type="button" className="lipa-admin-button lipa-admin-button-secondary" onClick={() => setRejecting(false)}>Cancel</button><button type="button" className="lipa-admin-button lipa-admin-button-danger" disabled={busy || !rejectReason.trim()} onClick={() => void runStatus("REJECTED", rejectReason.trim())}><X size={15} /> Confirm reject</button></div></div></div>}
  </section>;
}

export function LipaNetworkConfigPanel({ networks, onRun, adminId, busy }: { networks: NetworkCollection; onRun: RunAction; adminId: string; busy: boolean }) {
  const [editing, setEditing] = useState<LipaNetworkConfig | null>(null);
  const list = useMemo(() => networkList(networks).sort((a, b) => a.name.localeCompare(b.name)), [networks]);
  const startNew = () => setEditing({ id: "", name: "", title: "", introduction: "", requirements: "", paymentInfo: "", reward: 0, active: false, fields: [] });
  const updateConfig = <K extends keyof LipaNetworkConfig>(key: K, value: LipaNetworkConfig[K]) => setEditing((current) => current ? { ...current, [key]: value } : current);
  const updateField = (index: number, patch: Partial<ServiceFormField>) => setEditing((current) => current ? { ...current, fields: current.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field) } : current);
  const save = async () => {
    if (!editing) return;
    const config = { ...editing, id: editing.id.trim(), name: editing.name.trim(), title: editing.title.trim(), introduction: editing.introduction.trim(), requirements: editing.requirements.trim(), paymentInfo: editing.paymentInfo.trim(), fields: editing.fields.map((field, index) => ({ ...field, fieldName: field.fieldName.trim(), label: field.label.trim(), options: field.options?.filter(Boolean), order: index })) };
    if (!config.id || !/^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(config.id)) { toast.error("Weka ID sahihi ya mtandao (herufi, namba, _ au -)."); return; }
    if (!config.name || !config.title) { toast.error("Jina na title ya mtandao vinahitajika."); return; }
    if (config.fields.some((field) => !field.fieldName || !field.label)) { toast.error("Kila field inahitaji name na label."); return; }
    try {
      await onRun(() => adminSaveCollectionItem(adminId, "lipaServices", { ...config, fields: config.fields }, config.id), "Mipangilio ya mtandao imehifadhiwa.");
      setEditing(null);
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  const remove = async (network: LipaNetworkConfig) => {
    if (!window.confirm(`Futa mtandao ${network.name}?`)) return;
    try { await onRun(() => adminDeleteCollectionItem(adminId, "lipaServices", network.id), "Mtandao umefutwa."); } catch (error) { toast.error(errorText(error)); }
  };

  return <section className="lipa-admin-panel" aria-labelledby="lipa-network-heading"><PanelStyles /><div className="lipa-admin-heading"><div><h2 id="lipa-network-heading">Lipa network CMS</h2><p>Ongeza Airtel, Vodacom, Yas/Tigo, Halotel au mtandao mwingine bila kubadilisha code.</p></div><div className="lipa-admin-network-actions"><button type="button" className="lipa-admin-button lipa-admin-button-secondary" onClick={() => onRun(() => seedServiceCatalog(), "Huduma na mitandao ya mwanzo imeanzishwa; mipangilio iliyopo haijabadilishwa.")} disabled={busy}><Plus size={16} /> Anzisha default networks</button><button type="button" className="lipa-admin-button" onClick={startNew} disabled={busy}><Plus size={16} /> Add network</button></div></div>
    <div className="lipa-admin-network-list">{list.length === 0 ? <div className="lipa-admin-card"><div className="lipa-admin-empty">Hakuna mtandao uliosanidiwa.</div></div> : list.map((network) => <div className="lipa-admin-network-item" key={network.id}><div><strong>{network.name}</strong><small>{network.id} · {network.title} · reward {network.reward}</small></div><div className="lipa-admin-network-actions"><span className={`lipa-admin-status ${network.active ? "lipa-admin-status-approved" : "lipa-admin-status-rejected"}`}>{network.active ? "ACTIVE" : "INACTIVE"}</span><button type="button" className="lipa-admin-button lipa-admin-button-secondary" onClick={() => setEditing({ ...network, fields: (network.fields ?? []).map((field) => ({ ...field })) })} disabled={busy}><Edit3 size={14} /> Edit</button><button type="button" className="lipa-admin-button lipa-admin-button-danger" onClick={() => void remove(network)} disabled={busy}><Trash2 size={14} /> Delete</button></div></div>)}</div>
    {editing && <div className="lipa-admin-card" role="region" aria-labelledby="lipa-network-editor-heading"><div className="lipa-admin-modal-header" style={{ padding: "18px 18px 0", marginBottom: 0 }}><div><h3 id="lipa-network-editor-heading">{editing.id ? "Edit network" : "Add network"}</h3><p>Fields are read by the public Lipa form at runtime.</p></div><button type="button" className="lipa-admin-close" aria-label="Close network editor" onClick={() => setEditing(null)}><X size={19} /></button></div><div className="lipa-admin-form" style={{ padding: 18 }}><div className="lipa-admin-form-grid"><div className="lipa-admin-field"><label htmlFor="lipa-network-id">ID</label><input id="lipa-network-id" value={editing.id} onChange={(event) => updateConfig("id", event.target.value)} placeholder="airtel" /></div><div className="lipa-admin-field"><label htmlFor="lipa-network-name">Name</label><input id="lipa-network-name" value={editing.name} onChange={(event) => updateConfig("name", event.target.value)} placeholder="Airtel" /></div><div className="lipa-admin-field lipa-admin-field-wide"><label htmlFor="lipa-network-title">Title</label><input id="lipa-network-title" value={editing.title} onChange={(event) => updateConfig("title", event.target.value)} /></div><div className="lipa-admin-field"><label htmlFor="lipa-network-reward">Reward</label><input id="lipa-network-reward" type="number" min="0" value={editing.reward} onChange={(event) => updateConfig("reward", Number(event.target.value) || 0)} /></div><div className="lipa-admin-field lipa-admin-check"><input id="lipa-network-active" type="checkbox" checked={editing.active} onChange={(event) => updateConfig("active", event.target.checked)} /><label htmlFor="lipa-network-active">Active</label></div><div className="lipa-admin-field lipa-admin-field-wide"><label htmlFor="lipa-network-introduction">Introduction</label><textarea id="lipa-network-introduction" value={editing.introduction} onChange={(event) => updateConfig("introduction", event.target.value)} /></div><div className="lipa-admin-field lipa-admin-field-wide"><label htmlFor="lipa-network-requirements">Requirements</label><textarea id="lipa-network-requirements" value={editing.requirements} onChange={(event) => updateConfig("requirements", event.target.value)} /></div><div className="lipa-admin-field lipa-admin-field-wide"><label htmlFor="lipa-network-payment">Payment info</label><textarea id="lipa-network-payment" value={editing.paymentInfo} onChange={(event) => updateConfig("paymentInfo", event.target.value)} /></div></div>
      <div className="lipa-admin-form-heading"><div><h3>Form fields</h3><span>These fields define applicantData labels, types and validation.</span></div><button type="button" className="lipa-admin-button lipa-admin-button-secondary" onClick={() => updateConfig("fields", [...editing.fields, { fieldName: "", label: "", type: "TEXT", required: false, placeholder: "", helpText: "", options: [] }])}><Plus size={14} /> Add field</button></div>
      <div>{editing.fields.length === 0 ? <p className="lipa-admin-muted">No fields yet. Add the first field above.</p> : editing.fields.map((field, index) => <div className="lipa-admin-field-editor" key={`${index}-${field.fieldName}`}><div className="lipa-admin-editor-heading"><strong>Field {index + 1}</strong><button type="button" className="lipa-admin-button lipa-admin-button-danger" onClick={() => updateConfig("fields", editing.fields.filter((_, fieldIndex) => fieldIndex !== index))}><Trash2 size={14} /> Remove</button></div><div className="lipa-admin-form-grid"><div className="lipa-admin-field"><label htmlFor={`lipa-field-name-${index}`}>Name</label><input id={`lipa-field-name-${index}`} value={field.fieldName} onChange={(event) => updateField(index, { fieldName: event.target.value })} placeholder="businessLocation" /></div><div className="lipa-admin-field"><label htmlFor={`lipa-field-label-${index}`}>Label</label><input id={`lipa-field-label-${index}`} value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} placeholder="Business location" /></div><div className="lipa-admin-field"><label htmlFor={`lipa-field-type-${index}`}>Type</label><select id={`lipa-field-type-${index}`} value={field.type} onChange={(event) => updateField(index, { type: event.target.value as ServiceFormField["type"] })}>{serviceFieldTypes.map((type) => <option value={type} key={type}>{type}</option>)}</select></div><div className="lipa-admin-field lipa-admin-check"><input id={`lipa-field-required-${index}`} type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateField(index, { required: event.target.checked })} /><label htmlFor={`lipa-field-required-${index}`}>Required</label></div><div className="lipa-admin-field"><label htmlFor={`lipa-field-placeholder-${index}`}>Placeholder</label><input id={`lipa-field-placeholder-${index}`} value={field.placeholder ?? ""} onChange={(event) => updateField(index, { placeholder: event.target.value })} /></div><div className="lipa-admin-field"><label htmlFor={`lipa-field-options-${index}`}>Options (comma-separated)</label><input id={`lipa-field-options-${index}`} value={(field.options ?? []).join(", ")} onChange={(event) => updateField(index, { options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean) })} disabled={field.type !== "DROPDOWN"} /></div><div className="lipa-admin-field lipa-admin-field-wide"><label htmlFor={`lipa-field-help-${index}`}>Help text</label><input id={`lipa-field-help-${index}`} value={field.helpText ?? ""} onChange={(event) => updateField(index, { helpText: event.target.value })} /></div></div></div>)}</div>
      <div className="lipa-admin-actions"><button type="button" className="lipa-admin-button lipa-admin-button-secondary" onClick={() => setEditing(null)}>Cancel</button><button type="button" className="lipa-admin-button" disabled={busy} onClick={() => void save()}><Save size={15} /> Save network</button></div></div></div>}
  </section>;
}
