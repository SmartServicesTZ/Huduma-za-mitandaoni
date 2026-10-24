import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Download, Edit3, ExternalLink, Eye, FileText, Image as ImageIcon, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { adminDeleteCollectionItem, adminSaveCollectionItem, getLipaApplicationDocument, markLipaApplicationViewed, replyToLipaApplication, seedServiceCatalog, setLipaApplicationStatus, updateLipaRewardTracking, type LipaApplication, type LipaNetworkConfig } from "@/lib/firebase";
import { serviceFieldTypes, type ServiceFormField } from "../../../shared/serviceForms";

type RunAction = (action: () => Promise<unknown>, successMessage: string) => void | boolean | Promise<void | boolean>;
type NetworkCollection = LipaNetworkConfig[] | Record<string, LipaNetworkConfig>;
type ApplicationStatus = LipaApplication["status"];
type RewardFilter = "ALL" | "PENDING_CHECK" | "WAITING_PAYMENT" | "PAID" | "NOT_ELIGIBLE";
type SortKey = "network" | "applicantName" | "phone" | "nidaNumber" | "tinNumber" | "businessName" | "submittedAt" | "status" | "assignedAdmin" | "lipaNumber" | "rewardStatus";

type DocumentPreview = { url: string; label: string; image: boolean };

function networkList(networks: NetworkCollection): LipaNetworkConfig[] {
  return Array.isArray(networks) ? networks : Object.values(networks);
}

function networkMap(networks: NetworkCollection): Record<string, LipaNetworkConfig> {
  return Object.fromEntries(networkList(networks).map((network) => [network.id, network]));
}

function fieldsForApplication(application: LipaApplication, network?: LipaNetworkConfig): ServiceFormField[] {
  const configured = network?.fields ?? [];
  const byName = new Map(configured.map((field) => [field.fieldName, field]));
  const data = application.applicantData ?? {};
  for (const [fieldName, value] of Object.entries(data)) {
    if (byName.has(fieldName)) continue;
    const isUpload = typeof value === "string" && /^(lipaUploads|lipaApplications)\//.test(value);
    byName.set(fieldName, {
      fieldName,
      label: fieldName.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").replace(/^./, (letter) => letter.toUpperCase()),
      type: isUpload ? "IMAGE_UPLOAD" : fieldName.toLowerCase().includes("note") || fieldName.toLowerCase().includes("maelezo") ? "TEXTAREA" : "TEXT",
      required: false,
      order: 999,
    });
  }
  return [...byName.values()].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
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
    .lipa-admin-mobile-list { display:none; }
    .lipa-admin-mobile-card { background:#fff; border:1px solid #e2e9e4; border-radius:12px; padding:13px; }
    .lipa-admin-mobile-card + .lipa-admin-mobile-card { margin-top:10px; }
    .lipa-admin-mobile-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
    .lipa-admin-mobile-card h3 { margin:0 0 4px; font-size:.95rem; overflow-wrap:anywhere; }
    .lipa-admin-mobile-card p { margin:0; color:#68746e; font-size:.8rem; overflow-wrap:anywhere; }
    .lipa-admin-mobile-card-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:13px 0; }
    .lipa-admin-mobile-card-grid span { display:block; color:#68746e; font-size:.7rem; }
    .lipa-admin-mobile-card-grid strong { display:block; font-size:.82rem; overflow-wrap:anywhere; margin-top:3px; }
    .lipa-admin-mobile-open { width:100%; min-height:42px; background:#168653; color:#fff; border:0; border-radius:9px; font-weight:800; cursor:pointer; }
    .lipa-admin-mobile-open:disabled { opacity:.55; }

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
    .lipa-admin-detail-banner { background: linear-gradient(135deg,#0f172a,#243b63); border-radius: 13px; color:#fff; padding:15px; margin-bottom:16px; }
    @media (max-width:760px) { .lipa-admin-table-wrap { display:none; } .lipa-admin-mobile-list { display:block; } .lipa-admin-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } .lipa-admin-tabs { overflow-x:auto; flex-wrap:nowrap; padding-bottom:4px; } .lipa-admin-tab { flex:none; } .lipa-admin-action-bar { flex-direction:column; } .lipa-admin-action-bar .lipa-admin-button { width:100%; flex-basis:auto; min-height:42px; } }
    .lipa-admin-detail-banner-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-top:12px; }
    .lipa-admin-detail-banner-item { background:#ffffff12; border:1px solid #ffffff1c; border-radius:9px; padding:9px 10px; }
    .lipa-admin-detail-banner-item span { display:block; color:#b9c8dc; font-size:.68rem; }
    .lipa-admin-detail-banner-item strong { display:block; margin-top:3px; font-size:.84rem; overflow-wrap:anywhere; }
    .lipa-admin-action-bar { display:flex; flex-wrap:wrap; gap:8px; padding:12px; margin:0 0 16px; border:1px solid #dce7df; border-radius:11px; background:#f7faf8; }
    .lipa-admin-action-bar .lipa-admin-button { flex:1 1 150px; }
    @media (max-width:620px) { .lipa-admin-detail-banner-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
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
    .lipa-admin-panel { color:#152238; }
    .lipa-admin-heading { align-items:center; background:linear-gradient(120deg,#f7f9ff,#eef7ff); border:1px solid #dce7f7; border-radius:16px; padding:18px; }
    .lipa-admin-heading h2 { color:#142b50; letter-spacing:-.035em; }
    .lipa-admin-heading p { max-width:620px; line-height:1.55; }
    .lipa-admin-stat { border-radius:14px; box-shadow:0 5px 16px #102b5010; }
    .lipa-admin-card { border-color:#dce5f1; border-radius:15px; box-shadow:0 8px 24px #102b500a; }
    .lipa-admin-modal { max-width:1000px; border:1px solid #dce5f1; border-radius:20px; padding:clamp(17px,3vw,28px); }
    .lipa-admin-modal-header { padding-bottom:14px; border-bottom:1px solid #e6edf7; }
    .lipa-admin-modal-header h3 { color:#132b50; font-size:clamp(1.1rem,2.6vw,1.45rem); letter-spacing:-.03em; }
    .lipa-admin-detail-banner { border-radius:15px; }
    .lipa-admin-detail-grid { gap:8px 18px; }
    .lipa-admin-detail-item { min-width:0; padding:10px 0; }
    .lipa-admin-detail-item dt { font-size:.75rem; }
    .lipa-admin-detail-item dd { font-size:.9rem; line-height:1.5; overflow-wrap:anywhere; }
    .lipa-admin-action-bar { display:flex; flex-wrap:wrap; gap:9px; padding:12px; margin:14px 0; border:1px solid #dce7f7; border-radius:13px; background:#f6f9ff; }
    .lipa-admin-action-bar .lipa-admin-button { min-height:42px; }
    .lipa-admin-modal .lipa-admin-card { padding:16px !important; background:#f9fbff; }
    .lipa-admin-modal .lipa-admin-field label { display:block; margin-bottom:6px; font-size:.82rem; font-weight:800; color:#243a5a; }
    .lipa-admin-modal .lipa-admin-field input, .lipa-admin-modal .lipa-admin-field textarea, .lipa-admin-modal .lipa-admin-field select { width:100%; max-width:100%; min-height:43px; padding:10px 12px; border:1px solid #cbd8ea; border-radius:10px; background:#fff; color:#152238; font:inherit; }
    .lipa-admin-modal .lipa-admin-field textarea { min-height:105px; resize:vertical; }
    .lipa-admin-modal .lipa-admin-actions .lipa-admin-button { min-height:43px; }
    .lipa-admin-file { align-items:center; flex-wrap:wrap; }
    .lipa-admin-file-actions { flex-wrap:wrap; }
    .lipa-admin-button { min-height:38px; border-radius:10px; }
    .lipa-admin-mobile-card { border-radius:15px; box-shadow:0 6px 20px #102b5008; }
    .lipa-admin-mobile-open { min-height:45px; border-radius:11px; }
    @media (max-width: 900px) { .lipa-admin-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 620px) { .lipa-admin-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .lipa-admin-detail-grid, .lipa-admin-form-grid { grid-template-columns: 1fr; } .lipa-admin-field-wide { grid-column: auto; } .lipa-admin-modal { padding: 17px; } .lipa-admin-network-item { align-items: flex-start; flex-direction: column; } .lipa-admin-network-actions { width: 100%; } .lipa-admin-network-actions .lipa-admin-button { flex: 1; } }

    /* Mobile-first Lipa application review: keep applicant identity and actions visible. */
    @media (max-width: 760px) {
      .lipa-admin-overlay { align-items:stretch; padding:0; }
      .lipa-admin-modal { width:100%; max-width:none; height:100dvh; max-height:100dvh; border-radius:0; padding:14px 14px calc(18px + env(safe-area-inset-bottom)); overflow-x:hidden; overflow-y:auto; }
      .lipa-admin-modal-header { position:sticky; top:-14px; z-index:5; margin: -14px -14px 14px; padding:14px; background:#fff; box-shadow:0 5px 12px #102b5010; }
      .lipa-admin-modal-header > div { min-width:0; }
      .lipa-admin-modal-header h3 { overflow-wrap:anywhere; }
      .lipa-admin-action-bar { position:sticky; top:64px; z-index:4; display:grid; grid-template-columns:1fr; background:#f6f9ff; box-shadow:0 5px 12px #102b500d; }
      .lipa-admin-action-bar .lipa-admin-button { width:100%; min-height:46px; }
      .lipa-admin-detail-banner-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .lipa-admin-detail-grid { grid-template-columns:minmax(0,1fr); }
      .lipa-admin-file { align-items:stretch; flex-direction:column; }
      .lipa-admin-file-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
      .lipa-admin-file-actions button { min-width:0; white-space:normal; }
      .lipa-admin-actions { display:grid; grid-template-columns:1fr; }
      .lipa-admin-actions .lipa-admin-button { width:100%; min-height:46px; white-space:normal; }
    }
    @media (max-width: 380px) {
      .lipa-admin-mobile-card-grid { grid-template-columns:minmax(0,1fr); }
      .lipa-admin-detail-banner-grid { grid-template-columns:minmax(0,1fr); }
      .lipa-admin-file-actions { grid-template-columns:minmax(0,1fr); }
    }
    /* Responsive application cards are the primary layout on desktop and mobile. */
    .lipa-admin-table-wrap { display:none !important; }
    .lipa-admin-mobile-list { display:grid !important; grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr)); gap:14px; align-items:stretch; }
    .lipa-admin-mobile-card { border:1px solid #dce6f4; border-radius:16px; padding:17px; box-shadow:0 8px 24px #142d5010; display:flex; flex-direction:column; min-width:0; }
    .lipa-admin-mobile-card-head { padding-bottom:13px; border-bottom:1px solid #e9eef7; }
    .lipa-admin-mobile-card h3 { color:#142b4b; font-size:1rem; line-height:1.35; }
    .lipa-admin-mobile-card p { font-size:.84rem; line-height:1.5; }
    .lipa-admin-mobile-card-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .lipa-admin-mobile-card-grid > div { background:#f7f9fd; border-radius:10px; padding:9px; min-width:0; }
    .lipa-admin-mobile-card-grid span { font-size:.72rem; }
    .lipa-admin-mobile-card-grid strong { font-size:.86rem; line-height:1.4; }
    .lipa-admin-mobile-open { margin-top:auto; min-height:46px; background:linear-gradient(135deg,#155eef,#087e8b); }
    .lipa-admin-heading { align-items:center; padding:18px; border-radius:16px; background:linear-gradient(120deg,#f0f6ff,#f5fbff); border:1px solid #dbe8fa; }
    .lipa-admin-stats { grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); }
    .lipa-admin-stat { box-shadow:0 4px 16px #142d5008; }
    .lipa-admin-tabs { gap:8px; padding-bottom:5px; }
    .lipa-admin-tab { border-radius:10px 10px 4px 4px; background:#f6f8fc; white-space:normal; }
    .lipa-admin-modal { max-width:1040px; border:1px solid #dce6f4; }
    .lipa-admin-detail-item { background:#f8faff; border:1px solid #e7edf7; border-radius:10px; padding:12px; min-width:0; }
    .lipa-admin-detail-item dd { overflow-wrap:anywhere; line-height:1.5; }
    .lipa-admin-field select, .lipa-admin-field textarea { width:100%; max-width:100%; }
    .lipa-admin-field select { min-height:44px; border:1px solid #cbd7e8; border-radius:10px; padding:10px; background:#fff; }
    .lipa-admin-action-bar { display:flex; flex-wrap:wrap; gap:10px; margin:14px 0 18px; }
    .lipa-admin-action-bar .lipa-admin-button { min-height:44px; }
    @media (min-width:761px) {
      .lipa-admin-mobile-list { grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); }
      .lipa-admin-modal { max-height:90vh; }
    }
    @media (max-width:760px) {
      .lipa-admin-heading { display:block; padding:15px; }
      .lipa-admin-heading .lipa-admin-status { margin-top:12px; }
      .lipa-admin-stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .lipa-admin-tabs { align-items:stretch; }
      .lipa-admin-tab { flex:1 1 auto; }
      .lipa-admin-mobile-list { grid-template-columns:minmax(0,1fr); }
      .lipa-admin-mobile-card { padding:14px; }
      .lipa-admin-mobile-card-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .lipa-admin-modal { width:100%; max-width:none; height:100dvh; max-height:100dvh; border-radius:0; padding:14px 14px calc(18px + env(safe-area-inset-bottom)); overflow-x:hidden; overflow-y:auto; }
      .lipa-admin-modal-header { position:sticky; top:-14px; z-index:5; margin:-14px -14px 14px; padding:14px; background:#fff; box-shadow:0 5px 12px #102b5010; }
      .lipa-admin-action-bar { position:sticky; top:64px; z-index:4; display:grid; grid-template-columns:1fr; background:#f6f9ff; padding:8px; border-radius:12px; }
      .lipa-admin-action-bar .lipa-admin-button, .lipa-admin-actions .lipa-admin-button { width:100%; min-height:46px; }
      .lipa-admin-detail-grid { grid-template-columns:minmax(0,1fr); }
      .lipa-admin-file { align-items:stretch; flex-direction:column; }
      .lipa-admin-file-actions, .lipa-admin-actions { display:grid; grid-template-columns:1fr; }
    }
    @media (max-width:380px) {
      .lipa-admin-mobile-card-grid, .lipa-admin-detail-banner-grid { grid-template-columns:minmax(0,1fr); }
    }
  `}</style>;
}

export function LipaApplicationsPanel({ applications, networks, onRun, adminId, busy }: { applications: LipaApplication[]; networks: NetworkCollection; onRun: RunAction; adminId: string; busy: boolean }) {
  const [tab, setTab] = useState<"ALL" | ApplicationStatus>("ALL");
  const [rewardFilter, setRewardFilter] = useState<RewardFilter>("ALL");
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
    const statusFiltered = tab === "ALL" ? [...applications] : applications.filter((application) => application.status === tab);
    const filtered = statusFiltered.filter((application) => rewardFilter === "ALL" || (rewardFilter === "PENDING_CHECK" && application.qualificationStatus === "PENDING_CHECK") || (rewardFilter === "WAITING_PAYMENT" && application.qualificationStatus === "QUALIFIED" && application.rewardStatus === "UNPAID") || (rewardFilter === "PAID" && application.rewardStatus === "PAID") || (rewardFilter === "NOT_ELIGIBLE" && application.rewardStatus === "NOT_ELIGIBLE"));
    return filtered.sort((a, b) => {
      const left = sortKey === "network" ? (byNetwork[a.networkId]?.name ?? a.network) : sortKey === "submittedAt" ? dateText(a.submittedAt) : String((a as unknown as Record<string, unknown>)[sortKey] ?? "");
      const right = sortKey === "network" ? (byNetwork[b.networkId]?.name ?? b.network) : sortKey === "submittedAt" ? dateText(b.submittedAt) : String((b as unknown as Record<string, unknown>)[sortKey] ?? "");
      const comparison = left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
      return descending ? -comparison : comparison;
    });
  }, [applications, byNetwork, descending, rewardFilter, sortKey, tab]);

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
    const succeeded = await onRun(() => setLipaApplicationStatus(selected.applicationId || selected.id, status, reason), status === "PROCESSING" ? "Ombi limehamishwa PROCESSING." : status === "APPROVED" ? "Ombi limeidhinishwa." : "Ombi limekataliwa.");
    if (succeeded === false) return;
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
    if (!selected || selected.status !== "APPROVED") return;
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
  const columns: Array<[SortKey, string]> = [["applicantName", "Jina la mwombaji"], ["network", "Huduma / mtandao"], ["phone", "Simu"], ["nidaNumber", "NIDA"], ["tinNumber", "TIN"], ["businessName", "Biashara"], ["submittedAt", "Tarehe ya ombi"], ["status", "Hali"], ["assignedAdmin", "Msimamizi"], ["lipaNumber", "Lipa namba"], ["rewardStatus", "Malipo / zawadi"]];

  return <section className="lipa-admin-panel" aria-labelledby="lipa-applications-heading">
    <PanelStyles />
    <div className="lipa-admin-heading"><div><h2 id="lipa-applications-heading">Maombi ya Pata Lipa Namba</h2><p>Fungua ombi, kagua huduma iliyochaguliwa, taarifa na picha za mwombaji, kisha mjibu hapa.</p></div><span className="lipa-admin-status lipa-admin-status-pending" aria-label={`${pendingCount} maombi yanasubiri`}>{pendingCount} YANASUBIRI</span></div>
    <div className="lipa-admin-stats">{(["ALL", "PENDING", "PROCESSING", "APPROVED", "REJECTED"] as const).map((status) => <div className="lipa-admin-stat" key={status}><span>{status === "ALL" ? "All applications" : status}</span><strong>{counts[status]}</strong></div>)}</div>
    <div className="lipa-admin-tabs" role="tablist" aria-label="Application status filter">{(["ALL", "PENDING", "PROCESSING", "APPROVED", "REJECTED"] as const).map((status) => <button key={status} type="button" role="tab" aria-selected={tab === status} className={`lipa-admin-tab ${tab === status ? "lipa-admin-tab-active" : ""}`} onClick={() => setTab(status)}>{status}<span className="lipa-admin-count">{counts[status]}</span></button>)}</div>
    <div className="lipa-admin-tabs" role="tablist" aria-label="Reward tracking filter">
      {([
        ["ALL", "ZOTE"],
        ["PENDING_CHECK", "ZINASUBIRI UCHUNGUZI"],
        ["WAITING_PAYMENT", "ZINASUBIRI MALIPO"],
        ["PAID", "ZIMELIPWA"],
        ["NOT_ELIGIBLE", "HAZISTAHILI"],
      ] as const).map(([filter, label]) => {
        const count = filter === "ALL" ? applications.length : filter === "PENDING_CHECK" ? applications.filter((item) => item.qualificationStatus === "PENDING_CHECK").length : filter === "WAITING_PAYMENT" ? applications.filter((item) => item.qualificationStatus === "QUALIFIED" && item.rewardStatus === "UNPAID").length : filter === "PAID" ? applications.filter((item) => item.rewardStatus === "PAID").length : applications.filter((item) => item.rewardStatus === "NOT_ELIGIBLE").length;
        return <button key={filter} type="button" role="tab" aria-selected={rewardFilter === filter} className={`lipa-admin-tab ${rewardFilter === filter ? "lipa-admin-tab-active" : ""}`} onClick={() => setRewardFilter(filter)}>{label}<span className="lipa-admin-count">{count}</span></button>;
      })}
    </div>
    <div className="lipa-admin-card lipa-admin-table-wrap"><table className="lipa-admin-table"><caption className="lipa-admin-muted">Maombi ya Pata Lipa Namba — kichujio: {tab}</caption><thead><tr>{columns.map(([key, label]) => <th key={key} scope="col"><button type="button" className="lipa-admin-sort" onClick={() => changeSort(key)}>{label}{sortKey === key ? (descending ? <ArrowDown size={13} aria-label="descending" /> : <ArrowUp size={13} aria-label="ascending" />) : null}</button></th>)}<th scope="col">Action</th></tr></thead><tbody>{visibleApplications.length === 0 ? <tr><td colSpan={columns.length + 1}><div className="lipa-admin-empty">Hakuna maombi kwenye kichupo hiki.</div></td></tr> : visibleApplications.map((application) => <tr key={application.id || application.applicationId}><td>{application.applicantName || application.userName || "Jina halijawekwa"}</td><td>{byNetwork[application.networkId]?.name ?? application.network ?? application.serviceId ?? "Huduma haijaainishwa"}</td><td>{application.phone || "—"}</td><td>{application.nidaNumber || "—"}</td><td>{application.tinNumber || "—"}</td><td>{application.businessName || "—"}</td><td>{dateText(application.submittedAt)}</td><td><StatusBadge status={application.status} /></td><td>{application.assignedAdmin || "—"}</td><td>{application.lipaNumber || "—"}</td><td>{application.rewardStatus === "PAID" ? "AMELIPWA" : application.rewardStatus === "NOT_ELIGIBLE" ? "HASTAHILI" : application.rewardStatus === "UNPAID" ? "BADO" : "INASUBIRI"}<small>{Number(application.reward ?? 0) > 0 ? ` · TZS ${Number(application.reward).toLocaleString()}` : ""}</small></td><td><button type="button" className="lipa-admin-row-action" onClick={() => openApplication(application)}><Eye size={15} /> VIEW DETAILS</button></td></tr>)}</tbody></table></div>
    <div className="lipa-admin-mobile-list" aria-label="Maombi ya Lipa Namba">
      {visibleApplications.length === 0 ? <div className="lipa-admin-empty">Hakuna maombi kwenye kichupo hiki.</div> : visibleApplications.map((application) => <article className="lipa-admin-mobile-card" key={application.id || application.applicationId}>
        <div className="lipa-admin-mobile-card-head"><div><h3>{application.applicantName || application.userName || "Mwombaji"}</h3><p>{byNetwork[application.networkId]?.name ?? application.network ?? "Mtandao haujaainishwa"} · {application.phone || "Simu haipo"}</p></div><StatusBadge status={application.status} /></div>
        <div className="lipa-admin-mobile-card-grid">
          <div><span>Tarehe ya ombi</span><strong>{dateText(application.submittedAt)}</strong></div>
          <div><span>NIDA</span><strong>{application.nidaNumber || "—"}</strong></div>
          <div><span>TIN</span><strong>{application.tinNumber || "—"}</strong></div>
          <div><span>Biashara</span><strong>{application.businessName || "—"}</strong></div>
          <div><span>Lipa namba</span><strong>{application.lipaNumber || "Bado haijawekwa"}</strong></div>
          <div><span>Zawadi</span><strong>{application.rewardStatus === "PAID" ? "AMELIPWA" : application.rewardStatus === "NOT_ELIGIBLE" ? "HASTAHILI" : application.rewardStatus === "UNPAID" ? "BADO" : "INASUBIRI"}{Number(application.reward ?? 0) > 0 ? ` · TZS ${Number(application.reward).toLocaleString()}` : ""}</strong></div>
        </div>
        <button type="button" className="lipa-admin-mobile-open" disabled={busy} onClick={() => openApplication(application)}>FUNGUA OMBI / CHUKUA HATUA</button>
      </article>)}
    </div>
    {selected && <div className="lipa-admin-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><div className="lipa-admin-modal" role="dialog" aria-modal="true" aria-labelledby="lipa-application-detail-heading"><div className="lipa-admin-modal-header"><div><h3 id="lipa-application-detail-heading">{selected.applicantName || selected.userName || "Ombi la mtumiaji"}</h3><p>{byNetwork[selected.networkId]?.name ?? selected.network ?? selected.serviceId ?? "Huduma haijaainishwa"} · <StatusBadge status={selected.status} /></p></div><button type="button" className="lipa-admin-close" aria-label="Close application details" onClick={() => setSelected(null)}><X size={19} /></button></div>
      <div className="lipa-admin-detail-banner">
        <strong style={{fontSize:"1rem"}}>TAARIFA KAMILI YA OMBI</strong>
        <div className="lipa-admin-detail-banner-grid">
          <div className="lipa-admin-detail-banner-item"><span>STATUS</span><strong>{selected.status}</strong></div>
          <div className="lipa-admin-detail-banner-item"><span>MTANDAO</span><strong>{byNetwork[selected.networkId]?.name ?? selected.network ?? "—"}</strong></div>
          <div className="lipa-admin-detail-banner-item"><span>SIMU</span><strong>{selected.phone || "—"}</strong></div>
          <div className="lipa-admin-detail-banner-item"><span>LIPA NAMBA</span><strong>{selected.lipaNumber || "Bado haijawekwa"}</strong></div>
        </div>
      </div>
      <div className="lipa-admin-action-bar">
        {selected.status === "PENDING" && <button type="button" className="lipa-admin-button" disabled={busy} onClick={() => void runStatus("PROCESSING")}><Check size={15} /> ANZA KUFANYA KAZI</button>}
        {(selected.status === "PENDING" || selected.status === "PROCESSING") && <button type="button" className="lipa-admin-button" disabled={busy} onClick={() => void runStatus("APPROVED")}><Check size={15} /> APPROVE</button>}
        {(selected.status === "PENDING" || selected.status === "PROCESSING") && <button type="button" className="lipa-admin-button lipa-admin-button-danger" disabled={busy} onClick={() => setRejecting(true)}><X size={15} /> REJECT</button>}
      </div>
      <dl className="lipa-admin-detail-grid"><div className="lipa-admin-detail-item"><dt>Jina la aliyetuma ombi</dt><dd>{selected.applicantName || selected.userName || "Jina halijawekwa"}</dd></div><div className="lipa-admin-detail-item"><dt>Huduma iliyochaguliwa</dt><dd>{byNetwork[selected.networkId]?.name ?? selected.network ?? selected.serviceId ?? "Huduma haijaainishwa"}</dd></div><div className="lipa-admin-detail-item"><dt>Namba ya mawasiliano</dt><dd>{selected.phone || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>NIDA</dt><dd>{selected.nidaNumber || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>TIN</dt><dd>{selected.tinNumber || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>Business name</dt><dd>{selected.businessName || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>Submitted</dt><dd>{dateText(selected.submittedAt)}</dd></div><div className="lipa-admin-detail-item"><dt>Updated</dt><dd>{dateText(selected.updatedAt)}</dd></div><div className="lipa-admin-detail-item"><dt>Assigned admin</dt><dd>{selected.assignedAdmin || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>Rejection reason</dt><dd>{selected.rejectionReason || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>Maelezo ya ziada</dt><dd>{selected.additionalNotes || "—"}</dd></div><div className="lipa-admin-detail-item"><dt>Zawadi</dt><dd>TZS {Number(selected.reward ?? 0).toLocaleString()} · {selected.rewardStatus || "UNPAID"}</dd></div><div className="lipa-admin-detail-item"><dt>Namba ya Lipa</dt><dd>{selected.lipaNumber || "Bado haijawekwa"}</dd></div><div className="lipa-admin-detail-item"><dt>Miamala iliyothibitishwa</dt><dd>{Number(selected.verifiedTransactions ?? 0).toLocaleString()}</dd></div></dl>
       <section className="lipa-admin-card" style={{marginTop:18,padding:16}}>
         <h4 className="lipa-admin-section-title" style={{marginTop:0}}>Mawasiliano na mwombaji</h4>
         <p className="lipa-admin-muted">Jibu ombi au mwombe mtumiaji taarifa za ziada. Ujumbe utatumwa moja kwa moja kwenye mfumo wake.</p>
         <div className="lipa-admin-field" style={{marginTop:12}}><label>Jibu la Admin</label><textarea value={replyForm.reply} onChange={(e) => setReplyForm((v) => ({...v, reply:e.target.value}))} placeholder="Andika jibu kwa mwombaji..." /></div>
         <div className="lipa-admin-field" style={{marginTop:12}}><label>Taarifa za ziada zinazohitajika</label><textarea value={replyForm.infoRequest} onChange={(e) => setReplyForm((v) => ({...v, infoRequest:e.target.value}))} placeholder="Mfano: Tafadhali tuma picha iliyo wazi ya NIDA..." /></div>
         <div className="lipa-admin-actions"><button type="button" className="lipa-admin-button" disabled={replySaving || (!replyForm.reply.trim() && !replyForm.infoRequest.trim())} onClick={() => void saveAdminReply()}>{replySaving ? "Inatuma..." : "TUMA JIBU / OMBI LA TAARIFA"}</button></div>
       </section>
      <h4 className="lipa-admin-section-title">Historia ya mabadiliko ya hali</h4><dl className="lipa-admin-detail-grid">{(["PENDING", "PROCESSING", "APPROVED", "REJECTED"] as const).map((status) => <div className="lipa-admin-detail-item" key={status}><dt>{status}</dt><dd>{dateText(applicationStatusTimestamp(selected, status))}</dd></div>)}</dl>
      {selected.status === "APPROVED" && <section className="lipa-admin-card" style={{marginTop:18,padding:16}}>
        <h4 className="lipa-admin-section-title" style={{marginTop:0}}>Lipa Namba, Zawadi & Ufuatiliaji</h4>
        <p className="lipa-admin-muted">Hapa utaweka Lipa Namba iliyotolewa, idadi ya miamala kutoka report ya kesho, kisha utatenganisha waliohitimu, ambao hawajafuzu na waliolipwa.</p>
        <div className="lipa-admin-form-grid" style={{marginTop:12}}>
          <div className="lipa-admin-field"><label>Lipa Namba iliyotolewa</label><input value={rewardForm.lipaNumber} onChange={(e) => setRewardForm((v) => ({...v,lipaNumber:e.target.value}))} placeholder="Mfano 123456" /></div>
          <div className="lipa-admin-field"><label>Miamala iliyothibitishwa</label><input type="number" min="0" value={rewardForm.verifiedTransactions} onChange={(e) => setRewardForm((v) => ({...v,verifiedTransactions:Number(e.target.value)||0}))} /></div>
          <div className="lipa-admin-field"><label>Qualification</label><select value={rewardForm.qualificationStatus} onChange={(e) => setRewardForm((v) => ({...v,qualificationStatus:e.target.value as typeof v.qualificationStatus}))}><option value="PENDING_CHECK">Bado inafuatiliwa</option><option value="QUALIFIED">Amefikia vigezo</option><option value="NOT_QUALIFIED">Hajafikia vigezo</option></select></div>
          <div className="lipa-admin-field"><label>Hali ya zawadi</label><select value={rewardForm.rewardStatus} onChange={(e) => setRewardForm((v) => ({...v,rewardStatus:e.target.value as typeof v.rewardStatus}))}><option value="UNPAID">Bado hajalipwa</option><option value="PAID">Amelipwa</option><option value="NOT_ELIGIBLE">Hastahili</option></select></div>
          <div className="lipa-admin-field lipa-admin-field-wide"><label>Reference ya malipo</label><input value={rewardForm.rewardPaymentReference} onChange={(e) => setRewardForm((v) => ({...v,rewardPaymentReference:e.target.value}))} placeholder="Mfano TXN/MPESA reference ya TZS 500" /></div>
          <div className="lipa-admin-field lipa-admin-field-wide"><label>Maelezo ya ufuatiliaji</label><textarea value={rewardForm.rewardNote} onChange={(e) => setRewardForm((v) => ({...v,rewardNote:e.target.value}))} placeholder="Mfano report ya 08/10/2026, Lipa ilifikisha miamala 12..." /></div>
        </div>
               <div className="lipa-admin-actions"><button type="button" className="lipa-admin-button" disabled={rewardSaving} onClick={() => void saveRewardTracking()}>{rewardSaving ? "Inahifadhi..." : "HIFADHI TAARIFA ZA ZAWADI"}</button></div>
      </section>}
      <h4 className="lipa-admin-section-title">Taarifa zote alizotuma mwombaji</h4><div className="lipa-admin-detail-grid">{fieldsForApplication(selected, byNetwork[selected.networkId]).map((field) => { const value = selected.applicantData?.[field.fieldName]; const isFile = field.type === "IMAGE_UPLOAD" || field.type === "FILE_UPLOAD" || (typeof value === "string" && /^(lipaUploads|lipaApplications)\//.test(value)); return <div className="lipa-admin-detail-item" key={field.fieldName}><dt>{field.label || field.fieldName}</dt><dd>{isFile && value ? <div className="lipa-admin-file"><span className="lipa-admin-file-label">{field.type === "IMAGE_UPLOAD" ? <ImageIcon size={15} /> : <FileText size={15} />}<span>{field.type === "IMAGE_UPLOAD" ? "Picha / kitambulisho kilichotumwa" : "Faili lililotumwa"}</span></span><span className="lipa-admin-file-actions"><button type="button" className="lipa-admin-row-action" disabled={documentBusy === field.fieldName} onClick={() => void loadDocument(field, "preview")}>{field.type === "IMAGE_UPLOAD" ? <><Eye size={14} /> Tazama picha</> : <><ExternalLink size={14} /> Fungua faili</>}</button><button type="button" className="lipa-admin-row-action" disabled={documentBusy === field.fieldName} onClick={() => void loadDocument(field, "download")}><Download size={14} /> Pakua</button></span></div> : <span>{displayValue(value)}</span>}</dd></div>; })}</div>
      {documentError && <div className="lipa-admin-error" role="alert">{documentError}</div>}
      <div className="lipa-admin-actions"><button type="button" className="lipa-admin-button lipa-admin-button-secondary" onClick={() => setSelected(null)}>Funga Details</button></div>
    </div></div>}
    {documentPreview && <div className="lipa-admin-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDocumentPreview(null); }}><div className="lipa-admin-modal modal-small lipa-admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="lipa-document-preview-heading"><div className="lipa-admin-modal-header"><div><h3 id="lipa-document-preview-heading">{documentPreview.label}</h3><p>Signed private preview</p></div><button type="button" className="lipa-admin-close" aria-label="Close document preview" onClick={() => setDocumentPreview(null)}><X size={19} /></button></div><img className="lipa-admin-preview" src={documentPreview.url} alt={`${documentPreview.label} preview`} /></div></div>}
    {rejecting && <div className="lipa-admin-overlay" role="presentation"><div className="lipa-admin-modal lipa-admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="lipa-reject-heading"><div className="lipa-admin-modal-header"><div><h3 id="lipa-reject-heading">Reject application</h3><p>Reason is required and will be saved with the trusted status action.</p></div><button type="button" className="lipa-admin-close" aria-label="Close rejection dialog" onClick={() => setRejecting(false)}><X size={19} /></button></div><div className="lipa-admin-field"><label htmlFor="lipa-rejection-preset">Chagua sababu ya kukataa</label><select id="lipa-rejection-preset" value={!rejectReason ? "" : (["NIDA ya mhusika tayari imetumika kutengeneza Lipa Namba nyingine.","Namba ya simu si sahihi.","Taarifa zilizowasilishwa si sahihi.","Picha ya NIDA/kitambulisho haisomeki.","Taarifa hazijakamilika."].includes(rejectReason) ? rejectReason : "__custom__")} onChange={(event) => setRejectReason(event.target.value === "__custom__" ? "" : event.target.value)}><option value="">Chagua sababu...</option><option value="NIDA ya mhusika tayari imetumika kutengeneza Lipa Namba nyingine.">NIDA tayari imetumika kutengeneza Lipa Namba nyingine</option><option value="Namba ya simu si sahihi.">Namba ya simu si sahihi</option><option value="Taarifa zilizowasilishwa si sahihi.">Taarifa si sahihi</option><option value="Picha ya NIDA/kitambulisho haisomeki.">Picha ya kitambulisho haisomeki</option><option value="Taarifa hazijakamilika.">Taarifa hazijakamilika</option><option value="__custom__">Sababu nyingine (andika mwenyewe)</option></select><label htmlFor="lipa-rejection-reason" style={{display:"block",marginTop:12}}>Sababu / maelezo ya ziada</label><textarea id="lipa-rejection-reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} autoFocus required placeholder="Chagua sababu hapo juu au andika sababu yako..." /></div><div className="lipa-admin-actions"><button type="button" className="lipa-admin-button lipa-admin-button-secondary" onClick={() => setRejecting(false)}>Cancel</button><button type="button" className="lipa-admin-button lipa-admin-button-danger" disabled={busy || !rejectReason.trim()} onClick={() => void runStatus("REJECTED", rejectReason.trim())}><X size={15} /> Confirm reject</button></div></div></div>}
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
