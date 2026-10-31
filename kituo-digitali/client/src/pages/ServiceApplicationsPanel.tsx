import { useEffect, useMemo, useState } from "react";
import {
  adminSaveCollectionItem,
  getServiceApplicationDocument,
  markServiceApplicationViewed,
  replyToServiceApplication,
  setServiceApplicationStatus,
  type ServiceApplication,
} from "@/lib/firebase";
import type { ServiceFormField } from "../../../shared/serviceForms";

type ServiceConfiguration = {
  id?: string;
  slug: string;
  name: string;
  fields?: ServiceFormField[];
  statusOptions?: string[];
};

type ApplicationStatus = string;
type StatusTab = "ALL" | "MALIPO" | ApplicationStatus;

function isPaymentGated(application: ServiceApplication): boolean {
  const slug = String(application.serviceSlug ?? "").toLowerCase();
  const data = (application.applicantData ?? {}) as Record<string, unknown>;
  const network = String(data.network ?? "").toUpperCase();
  const tillPayment = slug === "pata-till-mitandao-yote" && network !== "HALOTEL" && network !== "";
  const paidService = slug === "access-lipa-yas" || slug === "access-lipa-airtel" || slug === "access-lipa-vodacom" || tillPayment;
  return paidService && application.status === "PENDING" && String(data.paymentStatus ?? "UNPAID").toUpperCase() !== "PAID";
}
type RunAction = (action: () => Promise<unknown>, successMessage: string) => void | boolean | Promise<void | boolean>;
type DocumentAction = "preview" | "open" | "download";
type DocumentPreview = { url: string; label: string; image: boolean };

type ServiceApplicationsPanelProps = {
  applications: ServiceApplication[];
  services: ServiceConfiguration[];
  onRun: RunAction;
  adminId: string;
  busy: boolean;
  hideList?: boolean;
  initialSelectedId?: string | null;
};

const BASE_STATUS_TABS: StatusTab[] = ["ALL", "PENDING", "PROCESSING", "APPROVED", "REJECTED"];
const UPLOAD_FIELD_TYPES = new Set<ServiceFormField["type"]>(["IMAGE_UPLOAD", "FILE_UPLOAD"]);

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

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return String((error as { message?: unknown } | null)?.message ?? "Kitendo kimeshindikana. Jaribu tena.");
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "—";
    }
  }
  return String(value);
}

function statusLabel(status: StatusTab): string {
  return status;
}

function serviceForApplication(application: ServiceApplication, services: ServiceConfiguration[]): ServiceConfiguration | undefined {
  return services.find((service) => service.slug === application.serviceSlug || service.id === application.serviceSlug);
}

function configuredFields(application: ServiceApplication, services: ServiceConfiguration[]): ServiceFormField[] {
  return [...(application.serviceFields ?? serviceForApplication(application, services)?.fields ?? [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

function PanelStyles() {
  return (
    <style>{`
      .service-app-admin-panel { color: #17251f; width: 100%; }
      .service-app-admin-panel *, .service-app-admin-panel *::before, .service-app-admin-panel *::after { box-sizing: border-box; }
      .service-app-admin-heading { align-items: flex-start; display: flex; gap: 16px; justify-content: space-between; margin-bottom: 18px; }
      .service-app-admin-heading h2 { font-size: clamp(1.1rem, 2vw, 1.4rem); margin: 0 0 5px; }
      .service-app-admin-heading p { color: #68746e; margin: 0; }
      .service-app-admin-pending { align-items: center; background: #fff4d6; border: 1px solid #f0d892; border-radius: 999px; color: #8a5b00; display: inline-flex; font-size: .78rem; font-weight: 800; gap: 7px; padding: 7px 11px; white-space: nowrap; }
      .service-app-admin-pending strong { background: #fff; border-radius: 999px; min-width: 22px; padding: 2px 6px; text-align: center; }
      .service-app-admin-stats { display: grid; gap: 9px; grid-template-columns: repeat(5, minmax(0, 1fr)); margin: 0 0 16px; }
      .service-app-admin-stat { background: #fff; border: 1px solid #e2e9e4; border-radius: 10px; min-width: 0; padding: 11px 13px; }
      .service-app-admin-stat span { color: #68746e; display: block; font-size: .72rem; }
      .service-app-admin-stat strong { color: #17251f; display: block; font-size: 1.35rem; margin-top: 3px; }
      .service-app-admin-tabs { align-items: center; border-bottom: 1px solid #dce5df; display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
      .service-app-admin-tab { background: transparent; border: 0; border-bottom: 2px solid transparent; color: #63716a; cursor: pointer; font-size: .82rem; font-weight: 700; padding: 10px 12px; }
      .service-app-admin-tab:hover, .service-app-admin-tab-active { border-bottom-color: #168653; color: #126c44; }
      .service-app-admin-count { background: #edf4ef; border-radius: 999px; color: #126c44; font-size: .72rem; margin-left: 4px; padding: 2px 7px; }
      .service-app-admin-card { background: #fff; border: 1px solid #e2e9e4; border-radius: 14px; overflow: hidden; }
      .service-app-admin-table-wrap { overflow-x: auto; }\n      .service-app-admin-mobile-list { display: none; }\n      .service-app-admin-mobile-item { border-bottom: 1px solid #edf1ee; padding: 13px; }\n      .service-app-admin-mobile-item:last-child { border-bottom: 0; }\n      .service-app-admin-mobile-top { align-items: flex-start; display: flex; gap: 10px; justify-content: space-between; }\n      .service-app-admin-mobile-name { font-size: .92rem; font-weight: 800; overflow-wrap: anywhere; }\n      .service-app-admin-mobile-service { color: #126c44; font-size: .82rem; font-weight: 700; margin-top: 4px; overflow-wrap: anywhere; }\n      .service-app-admin-mobile-meta { color: #68746e; display: flex; flex-wrap: wrap; font-size: .75rem; gap: 6px 12px; margin-top: 9px; }
      .service-app-admin-table { border-collapse: collapse; table-layout: fixed; min-width: 0; width: 100%; }
      .service-app-admin-table th { background: #f7faf8; color: #63716a; font-size: .72rem; letter-spacing: .025em; text-align: left; text-transform: uppercase; white-space: nowrap; }
      .service-app-admin-table th, .service-app-admin-table td { border-bottom: 1px solid #d9e1dc; padding: 10px 7px; vertical-align: top; overflow-wrap: anywhere; }
      .service-app-admin-table th:last-child { width: 115px; }
      .service-app-admin-table th { white-space: normal; }
      .service-app-admin-table tbody tr:last-child td { border-bottom: 0; }
      .service-app-admin-table tbody tr { cursor: pointer; transition: background .15s ease; }
      .service-app-admin-table tbody tr.status-row-pending, .service-app-admin-mobile-item.status-row-pending { background: #fff0a8; border-left: 7px solid #c47c00; }
      .service-app-admin-table tbody tr.status-row-processing, .service-app-admin-mobile-item.status-row-processing { background: #c8e3ff; border-left: 7px solid #0969c7; }
      .service-app-admin-table tbody tr.status-row-approved, .service-app-admin-mobile-item.status-row-approved { background: #baf2c8; border-left: 7px solid #07833c; }
      .service-app-admin-table tbody tr.status-row-rejected, .service-app-admin-mobile-item.status-row-rejected { background: #ffc8c4; border-left: 7px solid #c51f1a; }
      .service-app-admin-table tbody tr:hover, .service-app-admin-table tbody tr:focus-within { background: #f8fcf9; }
      .service-app-admin-table td { font-size: .84rem; }
      .service-app-admin-application { display: grid; gap: 3px; }
      .service-app-admin-application strong { overflow-wrap: anywhere; }
      .service-app-admin-application small, .service-app-admin-muted { color: #68746e; }
      .service-app-admin-status { border-radius: 999px; display: inline-block; font-size: .68rem; font-weight: 800; letter-spacing: .025em; padding: 4px 8px; white-space: nowrap; }
      .service-app-admin-status-pending { background: #fff4d6; color: #8a5b00; }
      .service-app-admin-status-processing { background: #e2f0ff; color: #14568f; }
      .service-app-admin-status-approved { background: #ddf7e8; color: #13703e; }
      .service-app-admin-status-rejected { background: #ffe4e1; color: #a63329; }
      .service-app-admin-open { display:block; width:100%; box-sizing:border-box; background:#087c3e; border:2px solid #045b2c; border-radius:8px; color:#fff; cursor:pointer; font-size:.76rem; font-weight:900; text-align:center; white-space:normal; overflow-wrap:anywhere; line-height:1.2; padding:8px 4px; }
      .service-app-admin-open:hover { filter: brightness(.96); }
      .service-app-admin-empty { color: #68746e; padding: 30px; text-align: center; }
      .service-app-admin-overlay { align-items: center; background: rgba(13, 28, 20, .58); display: flex; inset: 0; justify-content: center; padding: 18px; position: fixed; z-index: 70; }
      .service-app-admin-modal { background: #fff; border-radius: 15px; box-shadow: 0 22px 70px rgba(13, 38, 25, .28); max-height: min(92vh, 920px); max-width: 880px; overflow-y: auto; padding: 23px; position: relative; width: 100%; }
      .service-app-admin-modal-small { max-width: 500px; }
      .service-app-admin-modal-header { align-items: flex-start; display: flex; gap: 14px; justify-content: space-between; margin-bottom: 18px; }
      .service-app-admin-modal-header h3 { margin: 0 0 5px; }
      .service-app-admin-modal-header p { color: #68746e; margin: 0; }
      .service-app-admin-close { align-items: center; background: transparent; border: 0; border-radius: 7px; color: #52625a; cursor: pointer; display: inline-flex; font-size: 1.35rem; line-height: 1; padding: 7px; }
      .service-app-admin-close:hover { background: #f0f5f1; }
      .service-app-admin-detail-grid { display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr); width: 100%; }
      .service-app-admin-detail-item { background: #f8fbf9; border: 1px solid #dfe9e2; border-left: 4px solid #168653; border-radius: 10px; display: block; min-width: 0; padding: 12px 14px; }
      .service-app-admin-detail-item dt { color: #17653f; display: block; font-size: .78rem; font-weight: 800; line-height: 1.45; margin: 0 0 7px; overflow-wrap: anywhere; }
      .service-app-admin-detail-item dd { color: #17251f; display: block; font-size: .94rem; line-height: 1.65; margin: 0; min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; word-break: break-word; }
      .service-app-admin-detail-item dd img { max-width: 100%; }
      .service-app-admin-section-title + .service-app-admin-detail-grid { margin-top: 12px; }
      .service-app-admin-section-title { border-bottom: 1px solid #e6ede8; font-size: .93rem; margin: 22px 0 6px; padding-bottom: 8px; }
      .service-app-admin-file { align-items: center; background: #f7faf8; border: 1px solid #e1ebe4; border-radius: 8px; display: flex; gap: 10px; justify-content: space-between; padding: 10px; }
      .service-app-admin-file-label { display: grid; gap: 3px; min-width: 0; }
      .service-app-admin-file-label strong { overflow-wrap: anywhere; }
      .service-app-admin-file-label span { color: #68746e; font-size: .77rem; }
      .service-app-admin-file-actions, .service-app-admin-actions { display: flex; flex-wrap: wrap; gap: 7px; }
      .service-app-admin-button { align-items: center; background: #168653; border: 1px solid #168653; border-radius: 8px; color: #fff; cursor: pointer; display: inline-flex; font-size: .8rem; font-weight: 700; gap: 6px; justify-content: center; padding: 8px 11px; }
      .service-app-admin-button-secondary { background: #fff; border-color: #cbd9d0; color: #205b40; }
      .service-app-admin-button-danger { background: #fff4f3; border-color: #e6b7b2; color: #a63b30; }
      .service-app-admin-button:disabled, .service-app-admin-open:disabled, .service-app-admin-tab:disabled { cursor: not-allowed; opacity: .55; }
      .service-app-admin-actions { justify-content: flex-end; margin-top: 22px; }
      .service-app-admin-actions-inline { margin-top: 0; }
      .service-app-admin-reply-modes { display: flex; gap: 7px; flex-wrap: wrap; }
      .service-app-admin-mode, .service-app-admin-mode-active { border: 1px solid #cbd9d0; border-radius: 8px; cursor: pointer; font-size: .78rem; font-weight: 800; padding: 8px 11px; }
      .service-app-admin-mode { background: #fff; color: #52625a; }
      .service-app-admin-mode-active { background: #e9f8ef; border-color: #168653; color: #126c44; }
      .service-app-admin-reply-input { background: #fff; border: 1px solid #cad8cf; border-radius: 8px; color: #17251f; font: inherit; padding: 9px 10px; width: 100%; }
      .service-app-admin-error { background: #fff4f3; border: 1px solid #e7bbb6; border-radius: 8px; color: #9d332b; font-size: .84rem; margin-top: 10px; padding: 9px 11px; }
      .service-app-admin-form { display: grid; gap: 13px; }
      .service-app-admin-form label { color: #4e5d55; font-size: .78rem; font-weight: 700; }
      .service-app-admin-form textarea { background: #fff; border: 1px solid #cad8cf; border-radius: 8px; color: #17251f; font: inherit; min-height: 105px; padding: 9px 10px; resize: vertical; width: 100%; }
      .service-app-admin-preview { display: block; max-height: 65vh; max-width: 100%; object-fit: contain; }
      .service-app-admin-preview-frame { border: 0; display: block; height: min(65vh, 680px); width: 100%; }
      .service-app-admin-button:focus-visible, .service-app-admin-open:focus-visible, .service-app-admin-tab:focus-visible, .service-app-admin-close:focus-visible, .service-app-admin-form textarea:focus-visible { outline: 3px solid rgba(24, 137, 83, .24); outline-offset: 2px; }
      @media (max-width: 720px) { .service-app-admin-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 900px) { .service-app-admin-table th, .service-app-admin-table td { padding:8px 5px; font-size:.76rem; } .service-app-admin-open { font-size:.7rem; padding:7px 3px; } }
      @media (max-width: 620px) { .service-app-admin-table-wrap { display: none; } .service-app-admin-mobile-list { display: block; } .service-app-admin-mobile-item { border:2px solid #d2ddd5; border-radius:13px; margin:10px; box-shadow:0 3px 9px rgba(15,35,25,.12); overflow:hidden; } .service-app-admin-heading { flex-direction: column; } .service-app-admin-detail-grid { grid-template-columns: 1fr; } .service-app-admin-modal { padding: 17px; } .service-app-admin-file { align-items: flex-start; flex-direction: column; } .service-app-admin-file-actions { width: 100%; } .service-app-admin-file-actions .service-app-admin-button { flex: 1; } }
    `}</style>
  );
}

function StatusBadge({ status, paymentGated = false }: { status: ApplicationStatus; paymentGated?: boolean }) {
  const displayStatus = paymentGated ? "NO PAYMENT" : status;
  const className = (paymentGated ? "pending" : status).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  return <span className={`service-app-admin-status service-app-admin-status-${className}`}>{displayStatus}</span>;
}

export function ServiceApplicationsPanel({ applications, services, onRun, adminId, busy, hideList = false, initialSelectedId = null }: ServiceApplicationsPanelProps) {
  const [tab, setTab] = useState<StatusTab>("ALL");
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [selected, setSelected] = useState<ServiceApplication | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [allowResubmission, setAllowResubmission] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [replyMode, setReplyMode] = useState<"reply" | "request-info">("reply");
  const [error, setError] = useState("");
  const [documentBusy, setDocumentBusy] = useState<string | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const statusTabs = useMemo(() => Array.from(new Set<StatusTab>([...BASE_STATUS_TABS, "MALIPO", ...services.flatMap((service) => service.statusOptions ?? []), ...applications.map((application) => application.status)])), [services, applications]);

  const counts = useMemo(() => Object.fromEntries(statusTabs.map((status) => [status, status === "ALL" ? applications.length : status === "MALIPO" ? applications.filter(isPaymentGated).length : applications.filter((application) => application.status === status && !isPaymentGated(application)).length])) as Record<string, number>, [applications, statusTabs]);

  const visibleApplications = useMemo(
    () => applications.filter((application) => (tab === "MALIPO" ? isPaymentGated(application) : (tab === "ALL" || application.status === tab) && !isPaymentGated(application)) && (serviceFilter === "ALL" || (serviceFilter === "SME" ? /sme/i.test(String(application.serviceSlug) + " " + String(application.serviceName)) : serviceFilter === "LIPA" ? /lipa/i.test(String(application.serviceSlug) + " " + String(application.serviceName)) : application.serviceSlug === serviceFilter))),
    [applications, tab, serviceFilter],
  );

  const openApplication = (application: ServiceApplication) => {
    void markServiceApplicationViewed(application.applicationId || application.id).catch(() => undefined);
    setSelected(application);
    setRejecting(false);
    setRejectReason(isPaymentGated(application) ? "Ombi lako limekataliwa sababu hujafanya malipo tafadhali fanya malipo kupata huduma" : "");
    setAllowResubmission(false);
    setReplyBody("");
    setReplySubject("");
    setReplyMode("reply");
    setError("");
    setDocumentPreview(null);
  };

  useEffect(() => {
    if (!initialSelectedId) return;
    const application = applications.find((item) => (item.applicationId || item.id) === initialSelectedId);
    if (application) openApplication(application);
  }, [initialSelectedId, applications]);

  const closeApplication = () => {
    setSelected(null);
    setRejecting(false);
    setRejectReason("");
    setError("");
    setDocumentPreview(null);
  };

  useEffect(() => {
    if (!selected && !documentPreview) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (documentPreview) setDocumentPreview(null);
        else closeApplication();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, documentPreview]);

  const runStatus = async (status: string, reason = "", allowRetry = false) => {
    if (!selected) return;
    setError("");
    try {
      const completed = await onRun(
        () => setServiceApplicationStatus(selected.applicationId || selected.id, status, reason, allowRetry),
        status === "PAYMENT_CONFIRMED" ? "Malipo yamethibitishwa; sasa ombi linaweza kuanza kushughulikiwa." : status === "PROCESSING" ? "Ombi limehamishwa PROCESSING." : status === "APPROVED" ? "Ombi limeidhinishwa." : status === "REJECTED" ? "Ombi limekataliwa." : `Hali ya ombi imebadilishwa kuwa ${status}.`,
      );
      if (completed !== false) closeApplication();
      else setError("Mabadiliko hayajahifadhiwa. Kagua ujumbe wa hitilafu na ujaribu tena.");
    } catch (actionError) {
      setError(errorText(actionError));
    }
  };

  const reject = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      setError("Sababu ya kukataa inahitajika.");
      return;
    }
    await runStatus("REJECTED", reason, allowResubmission);
  };

  const sendApplicationMessage = async () => {
    if (!selected) return;
    const body = replyBody.trim();
    if (!body) {
      setError("Andika ujumbe kabla ya kutuma.");
      return;
    }
    const subject = replySubject.trim() || (replyMode === "request-info" ? "Tafadhali ongeza taarifa kwenye ombi lako" : "Majibu kuhusu ombi lako");
    setError("");
    try {
      const result = await onRun(
        () => replyToServiceApplication(selected.applicationId || selected.id, subject, body, replyMode),
        replyMode === "request-info" ? "Ombi la taarifa za ziada limetumwa kwa mtumiaji." : "Jibu limetumwa kwa mtumiaji.",
      );
      if (result !== false) {
        setReplyBody("");
        setReplySubject("");
        setReplyMode("reply");
      } else {
        setError("Ujumbe haukutumwa. Jaribu tena.");
      }
    } catch (messageError) {
      setError(errorText(messageError));
    }
  };

  const loadDocument = async (field: ServiceFormField, action: DocumentAction) => {
    if (!selected) return;
    const key = `${selected.applicationId || selected.id}:${field.fieldName}:${action}`;
    setDocumentBusy(key);
    setError("");
    try {
      const result = await getServiceApplicationDocument(selected.applicationId || selected.id, field.fieldName);
      if (!result?.url) throw new Error("Hati haikupatikana.");
      if (action === "preview") {
        setDocumentPreview({ url: result.url, label: field.label, image: field.type === "IMAGE_UPLOAD" });
      } else if (action === "download") {
        const anchor = document.createElement("a");
        anchor.href = result.url;
        anchor.download = field.label;
        anchor.rel = "noopener noreferrer";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } else {
        window.open(result.url, "_blank", "noopener,noreferrer");
      }
    } catch (documentError) {
      setError(`${field.label}: ${errorText(documentError)}`);
    } finally {
      setDocumentBusy(null);
    }
  };

  const selectedService = selected ? serviceForApplication(selected, services) : undefined;
  const selectedFields = selected ? configuredFields(selected, services) : [];
  const selectedData = selected?.applicantData ?? {};

  return (
    <section className="service-app-admin-panel" data-admin-id={adminId} aria-labelledby="service-app-admin-title">
      <PanelStyles />
      {!hideList && <>
      <div className="service-app-admin-heading">
        <div>
          <h2 id="service-app-admin-title">Maombi ya huduma</h2>
        </div>
        <span className="service-app-admin-pending" aria-label={`${counts.PENDING} pending applications`}>
          Pending <strong>{counts.PENDING}</strong>
        </span>
      </div>

      <div className="service-app-admin-stats" aria-label="Application totals">
        {["ALL", "PENDING", "PROCESSING", "APPROVED", "REJECTED"].map((status) => <div className="service-app-admin-stat" key={status}><span>{status === "ALL" ? "JUMLA" : statusLabel(status)}</span><strong>{counts[status] ?? 0}</strong></div>)}
      </div>

      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}><label style={{display:"grid",gap:4,fontSize:".8rem",fontWeight:700,color:"#63716a"}}>Chuja kwa huduma<select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)} style={{minWidth:190,border:"1px solid #cbd9d0",borderRadius:8,padding:"9px 10px",background:"#fff",color:"#17251f"}}><option value="ALL">Maombi yote</option><option value="LIPA">Maombi yote ya Lipa</option><option value="SME">Maombi yote ya SME</option>{services.filter((service) => !/sme|lipa/i.test(String(service.slug)+" "+String(service.name))).map((service) => <option key={service.slug} value={service.slug}>{service.name}</option>)}</select></label></div>
      <nav className="service-app-admin-tabs" aria-label="Application status filters">
        {statusTabs.map((status) => (
          <button
            className={`service-app-admin-tab${tab === status ? " service-app-admin-tab-active" : ""}`}
            key={status}
            type="button"
            aria-current={tab === status ? "page" : undefined}
            onClick={() => setTab(status)}
          >
            {status === "MALIPO" ? "MALIPO" : statusLabel(status)} <span className="service-app-admin-count">{counts[status] ?? 0}</span>
          </button>
        ))}
      </nav>

      <div className="service-app-admin-card">
        {visibleApplications.length === 0 ? (
          <div className="service-app-admin-empty">Hakuna maombi katika hali hii.</div>
        ) : (
          <>
          <div className="service-app-admin-mobile-list" aria-label="Maombi ya huduma kwenye simu">
            {visibleApplications.map((application) => {
              const service = serviceForApplication(application, services);
              return (
                <article className={"service-app-admin-mobile-item status-row-" + String(application.status || "pending").toLowerCase()} key={application.id || application.applicationId}>
                  <div className="service-app-admin-mobile-top">
                    <div>
                      <div className="service-app-admin-mobile-name">{application.userName || "Jina halijawekwa"}</div>
                      <div className="service-app-admin-mobile-service">{service?.name ?? application.serviceName ?? "Huduma haijatajwa"}</div>
                    </div>
                    <StatusBadge status={application.status} paymentGated={isPaymentGated(application)} />
                  </div>
                  <div className="service-app-admin-mobile-meta"><span>{dateText(application.submittedAt)}</span></div>
                  <div style={{ marginTop: 10 }}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="service-app-admin-open" type="button" onClick={() => openApplication(application)}>FUNGUA OMBI</button>{tab === "MALIPO" && <button className="service-app-admin-open" type="button" disabled={busy} onClick={() => void onRun(() => setServiceApplicationStatus(application.applicationId || application.id, "PAYMENT_CONFIRMED"), "Malipo yamethibitishwa. Ombi limehamishwa kwenye maombi ya kawaida; sasa unaweza kulipeleka PROCESSING.")}>THIBITISHA MALIPO</button>}</div></div>
                </article>
              );
            })}
          </div>
          <div className="service-app-admin-table-wrap">
            <table className="service-app-admin-table">
              <thead>
                <tr>
                  <th scope="col">Mwombaji</th>
                  <th scope="col">Service</th>
                  <th scope="col">Date</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="service-app-admin-muted">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleApplications.map((application) => {
                  const service = serviceForApplication(application, services);
                  return (
                    <tr className={"status-row-" + String(application.status || "pending").toLowerCase()} key={application.id || application.applicationId} onClick={() => openApplication(application)}>
                      <td>{application.userName || "Jina halijawekwa"}</td>
                      <td>{service?.name ?? application.serviceName ?? "—"}</td>
                      <td>{dateText(application.submittedAt)}</td>
                      <td><StatusBadge status={application.status} paymentGated={isPaymentGated(application)} /></td>
                      <td>
                        <button className="service-app-admin-open" type="button" onClick={(event) => { event.stopPropagation(); openApplication(application); }}>
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
      </>}

      {selected && !documentPreview && !rejecting && (
        <div className="service-app-admin-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeApplication(); }}>
          <div className="service-app-admin-modal" role="dialog" aria-modal="true" aria-labelledby="service-app-admin-details-title">
            <div className="service-app-admin-modal-header">
              <div>
                <h3 id="service-app-admin-details-title">Taarifa za ombi</h3>
                <p>{selectedService?.name ?? selected.serviceName ?? "Huduma haijaainishwa"}</p>
              </div>
              <button className="service-app-admin-close" type="button" aria-label="Close details" onClick={closeApplication}>×</button>
            </div>

            <div className="service-app-admin-detail-grid">
              <div className="service-app-admin-detail-item"><dt>Huduma</dt><dd>{selectedService?.name ?? selected.serviceName ?? "—"}</dd></div>
              <div className="service-app-admin-detail-item"><dt>Mwombaji</dt><dd>{selected.userName || "—"}</dd></div>
              <div className="service-app-admin-detail-item"><dt>Tarehe</dt><dd>{dateText(selected.submittedAt)}</dd></div>
              <div className="service-app-admin-detail-item"><dt>Hali ya ombi</dt><dd><StatusBadge status={selected.status} paymentGated={isPaymentGated(selected)} /></dd></div>
            </div>

            <h4 className="service-app-admin-section-title">Taarifa zilizojazwa</h4>
            {selectedFields.length === 0 ? (
              <p className="service-app-admin-muted">Hakuna taarifa za fomu zilizopatikana.</p>
            ) : (
              <div className="service-app-admin-detail-grid">
                {selectedFields.map((field) => {
                  const value = selectedData[field.fieldName];
                  const isDocument = UPLOAD_FIELD_TYPES.has(field.type);
                  return (
                    <div className="service-app-admin-detail-item" key={field.fieldName}>
                      <dt>{field.label}</dt>
                      <dd>{isDocument ? <span className="service-app-admin-muted">Private document — secure access only.</span> : valueText(value)}</dd>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedFields.some((field) => UPLOAD_FIELD_TYPES.has(field.type)) && (
              <>
                <h4 className="service-app-admin-section-title">Picha na nyaraka</h4>
                <div className="service-app-admin-form">
                  {selectedFields.filter((field) => UPLOAD_FIELD_TYPES.has(field.type)).map((field) => {
                    const hasDocument = Boolean(selectedData[field.fieldName]);
                    const busyForField = documentBusy?.startsWith(`${selected.applicationId || selected.id}:${field.fieldName}:`);
                    return (
                      <div className="service-app-admin-file" key={field.fieldName}>
                        <div className="service-app-admin-file-label">
                          <strong>{field.label}</strong>
                          <span>{hasDocument ? "Private document available through a signed action." : "No document submitted."}</span>
                        </div>
                        <div className="service-app-admin-file-actions">
                          <button className="service-app-admin-button service-app-admin-button-secondary" type="button" disabled={!hasDocument || busy || Boolean(busyForField)} onClick={() => void loadDocument(field, "preview")}>Preview</button>
                          <button className="service-app-admin-button service-app-admin-button-secondary" type="button" disabled={!hasDocument || busy || Boolean(busyForField)} onClick={() => void loadDocument(field, "open")}>Open</button>
                          <button className="service-app-admin-button service-app-admin-button-secondary" type="button" disabled={!hasDocument || busy || Boolean(busyForField)} onClick={() => void loadDocument(field, "download")}>Download</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <h4 className="service-app-admin-section-title">Mawasiliano na mwombaji</h4>
            <div className="service-app-admin-form">
              <div className="service-app-admin-reply-modes">
                <button type="button" className={replyMode === "reply" ? "service-app-admin-mode-active" : "service-app-admin-mode"} onClick={() => setReplyMode("reply")}>Jibu ombi</button>
                <button type="button" className={replyMode === "request-info" ? "service-app-admin-mode-active" : "service-app-admin-mode"} onClick={() => setReplyMode("request-info")}>Omba taarifa za ziada</button>
              </div>
              <label htmlFor="service-app-admin-reply-subject">Kichwa cha ujumbe</label>
              <input id="service-app-admin-reply-subject" className="service-app-admin-reply-input" value={replySubject} onChange={(event) => setReplySubject(event.target.value)} placeholder={replyMode === "request-info" ? "Tafadhali kamilisha taarifa za ombi" : "Majibu kuhusu ombi lako"} />
              <label htmlFor="service-app-admin-reply-template">Ujumbe wa haraka (hiari)</label>
              <select id="service-app-admin-reply-template" value="" onChange={(event)=>{if(event.target.value){setReplyBody(event.target.value);setReplyMode("reply");}}}>
                <option value="">Chagua ujumbe wa kutumia...</option>
                {(/vodacom|access-lipa-vodacom/i.test(String(selected.serviceSlug)+" "+String(selected.serviceName))) && <>
                  <option value="Tuwasiliane WhatsApp au kwa simu ya kawaida kupitia namba 0698232313 kwa ajili ya OTP.">Vodacom — Wasiliana kwa OTP</option>
                  <option value="Kwa maelezo zaidi kuhusu ombi lako la Till Vodacom, tafadhali wasiliana nasi WhatsApp au kwa simu ya kawaida kupitia namba 0698232313.">Vodacom — Maelezo ya Till</option>
                </>}
                <option value="Tafadhali wasilisha taarifa au nyaraka zilizokosekana ili tuendelee na ombi lako.">Omba taarifa/nyaraka zaidi</option>
              </select>
              <label htmlFor="service-app-admin-reply-body">{replyMode === "request-info" ? "Taarifa zinazohitajika" : "Ujumbe wa admin"}</label>
              <textarea id="service-app-admin-reply-body" value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder={replyMode === "request-info" ? "Mwambie mtumiaji taarifa gani akamilishe..." : "Andika jibu kwa mtumiaji..."} />
              <div className="service-app-admin-actions service-app-admin-actions-inline">
                <button className="service-app-admin-button" type="button" disabled={busy || !replyBody.trim()} onClick={() => void sendApplicationMessage()}>{replyMode === "request-info" ? "Tuma ombi la taarifa" : "Tuma jibu kwa mtumiaji"}</button>
              </div>
            </div>

            {selected.rejectionReason && <p className="service-app-admin-error"><strong>Rejection reason:</strong> {selected.rejectionReason}</p>}
            {error && <p className="service-app-admin-error" role="alert">{error}</p>}
            <div className="service-app-admin-actions">
              {isPaymentGated(selected) ? <><button className="service-app-admin-button" type="button" disabled={busy} onClick={() => void runStatus("PAYMENT_CONFIRMED")}>THIBITISHA MALIPO</button><button className="service-app-admin-button service-app-admin-button-danger" type="button" disabled={busy} onClick={() => { setRejectReason("Ombi lako limekataliwa sababu hujafanya malipo tafadhali fanya malipo kupata huduma"); setError(""); setRejecting(true); }}>REJECT — HAKUNA MALIPO</button></> : (selected.statusOptions ?? selectedService?.statusOptions ?? ["PENDING", "PROCESSING", "APPROVED", "REJECTED"]).filter((status) => status !== "PENDING" && status !== selected.status).map((status) => status === "REJECTED" ? <button key={status} className="service-app-admin-button service-app-admin-button-danger" type="button" disabled={busy} onClick={() => { setError(""); setRejecting(true); }}>Reject / Badili uamuzi</button> : <button key={status} className="service-app-admin-button" type="button" disabled={busy} onClick={() => void runStatus(status)}>{status === "PROCESSING" ? "Move to processing" : status === "APPROVED" ? "Approve / Badili uamuzi" : `Set ${status}`}</button>)}
            </div>
          </div>
        </div>
      )}

      {selected && rejecting && (
        <div className="service-app-admin-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRejecting(false); }}>
          <div className="service-app-admin-modal service-app-admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="service-app-admin-reject-title">
            <div className="service-app-admin-modal-header">
              <div>
                <h3 id="service-app-admin-reject-title">Kataa ombi</h3>
                <p>Weka sababu itakayoonekana kwa mtumiaji.</p>
              </div>
              <button className="service-app-admin-close" type="button" aria-label="Close rejection dialog" onClick={() => setRejecting(false)}>×</button>
            </div>
            <form className="service-app-admin-form" onSubmit={(event) => { event.preventDefault(); void reject(); }}>
              <label htmlFor="service-app-admin-rejection-template">Chagua sababu ya kukataa</label>
              <select id="service-app-admin-rejection-template" value="" onChange={(event) => { if(event.target.value) setRejectReason(event.target.value); }}>
                <option value="">Chagua sababu iliyo tayari...</option>
                {isPaymentGated(selected) && <option value="Ombi lako limekataliwa sababu hujafanya malipo tafadhali fanya malipo kupata huduma">Hujafanya malipo</option>}
                {(/vodacom|access-lipa-vodacom/i.test(String(selected.serviceSlug)+" "+String(selected.serviceName))) && <>
                  <option value="Laini imewezeshwa account ya M-PESA. Tafadhali sajili laini mpya na usiwezeshe account ya M-PESA.">Laini imewezeshwa account ya M-PESA</option>
                  <option value="NIDA hii tayari ina Lipa Namba. Hivyo basi utawezeshwa Store 2.">NIDA hii tayari ina Lipa Namba (Store 2)</option>
                </>}
                <option value="Taarifa ulizoweka hazilingani na taarifa za NIDA. Tafadhali hakiki na utume tena.">Taarifa hazilingani na NIDA</option>
                <option value="Picha au nyaraka ulizowasilisha hazisomeki. Tafadhali pakia picha iliyo wazi.">Picha/nyaraka hazisomeki</option>
                <option value="Tafadhali wasilisha taarifa zilizokosekana kisha rudia ombi.">Taarifa hazijakamilika</option>
              </select>
              <label htmlFor="service-app-admin-rejection-reason">Sababu / maelezo ya ziada</label>
              <textarea id="service-app-admin-rejection-reason" value={rejectReason} aria-required="true" onChange={(event) => { setRejectReason(event.target.value); setError(""); }} autoFocus />
              <label style={{display:"flex",alignItems:"center",gap:9,fontWeight:700}}>
                <input type="checkbox" checked={allowResubmission} onChange={(event)=>setAllowResubmission(event.target.checked)} />
                Ruhusu mtumiaji kurekebisha taarifa na kurudia ombi hili
              </label>
              {error && <p className="service-app-admin-error" role="alert">{error}</p>}
              <div className="service-app-admin-actions">
                <button className="service-app-admin-button service-app-admin-button-secondary" type="button" disabled={busy} onClick={() => setRejecting(false)}>Cancel</button>
                <button className="service-app-admin-button service-app-admin-button-danger" type="submit" disabled={busy || !rejectReason.trim()}>Reject application</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {documentPreview && (
        <div className="service-app-admin-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDocumentPreview(null); }}>
          <div className="service-app-admin-modal" role="dialog" aria-modal="true" aria-labelledby="service-app-admin-preview-title">
            <div className="service-app-admin-modal-header">
              <div><h3 id="service-app-admin-preview-title">{documentPreview.label}</h3><p>Signed private preview</p></div>
              <button className="service-app-admin-close" type="button" aria-label="Close document preview" onClick={() => setDocumentPreview(null)}>×</button>
            </div>
            {documentPreview.image ? <img className="service-app-admin-preview" src={documentPreview.url} alt={`Preview of ${documentPreview.label}`} /> : <iframe className="service-app-admin-preview-frame" src={documentPreview.url} title={`Preview of ${documentPreview.label}`} />}
          </div>
        </div>
      )}
    </section>
  );
}
