import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowDown, ArrowUp, BarChart3, Download, Bell, Boxes, ChevronRight, ClipboardList, LayoutDashboard, LogOut, Menu, MessageSquare, Palette, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Trash2, UserCog, Users, WalletCards, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { adminAdjustTokens, adminDeleteUserAccount, adminDeleteCollectionItem, adminGetSiteSettings, adminListCollection, adminListLipaApplications, adminListServiceApplications, adminListServices, adminListTransactions, adminListUsers, adminListAgentRecords, adminSaveCollectionItem, adminSaveService, adminSetServiceLock, adminSaveSiteSettings, adminUpdateUser, adminResetUserPassword, seedServiceCatalog, setHomepageServiceOrder, type AdminUserRecord, type LipaApplication, type ServiceApplication } from "@/lib/firebase";
import { completeOrder, defaultHomepageSectionOrder, isServiceLocked, moveId } from "../../../shared/serviceOrdering";
import { mergeServiceCatalogDefaults } from "../../../shared/catalog";
import { accountRestrictionActionLabels, accountRestrictionActions, resolveAccountAccessMode, type AccountAccessMode, type AccountRestrictionAction } from "../../../shared/accountAccess";
import { serviceFieldTypes, type ServiceFormField } from "../../../shared/serviceForms";
import { AIRTEL_SME_LAYOUT_DEFAULTS, normalizeAirtelSmeLayout } from "../../../shared/airtelSmeLayout";
import { LipaApplicationsPanel, LipaNetworkConfigPanel } from "./LipaAdminPanels";
import { ServiceApplicationsPanel } from "./ServiceApplicationsPanel";
import { UnifiedApplicationsInbox } from "./UnifiedApplicationsInbox";
import { getRecentSecurityLogs } from "@/lib/securityLogs";

type Panel = "overview" | "agentIdPricing" | "users" | "agents" | "tokens" | "services" | "serviceControl" | "applications" | "lipa" | "lipaReport" | "transactions" | "reports" | "security" | "messages" | "cms" | "templates" | "appearance";
const nav: Array<[Panel, string, typeof LayoutDashboard]> = [
  ["overview", "Muhtasari", LayoutDashboard], ["serviceControl", "Funga / Fungua Huduma", ShieldCheck], ["agentIdPricing", "Bei za Kitambulisho", UserCog], ["users", "Watumiaji", Users], ["agents", "MAWAKALA", UserCog], ["tokens", "Tokeni", WalletCards], ["services", "Huduma", Boxes], ["applications", "MAOMBI YA HUDUMA", ClipboardList], ["lipa", "Lipa Namba", WalletCards], ["lipaReport", "Ripoti za Lipa", BarChart3], ["transactions", "Transactions", BarChart3], ["reports", "Ripoti za biashara", BarChart3], ["security", "Usalama", ShieldCheck], ["messages", "Tuma ujumbe", MessageSquare], ["cms", "Muonekano & CMS", Palette], ["templates", "Templates za Nyaraka", ClipboardList], ["appearance", "Mpangilio wa Homepage", SlidersHorizontal],
];
const emptyService = { id: "", name: "", slug: "", description: "", icon: "sparkles", tokenCost: 2, reward: 0, isFree: false, isVisible: true, active: true, isLocked: false, maintenanceMessage: "", category: "Huduma kuu", actionUrl: "", instructions: "", buttonText: "TUMA OMBI", statusOptions: ["PENDING", "PROCESSING", "APPROVED", "REJECTED"], adminWorkflow: true, order: 0, fields: [] as ServiceFormField[] };
const emptyMessage = { subject: "", body: "", recipientId: "" };

function dateText(value: unknown) { if (!value) return "—"; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("sw-TZ"); }
function safeError(error: any) {
  const code = String(error?.code ?? "").replace(/^functions\//, "");
  if (code === "permission-denied") return "Huna ruhusa ya kufanya kitendo hiki. Hakikisha role au permission husika imepewa.";
  if (code === "failed-precondition") return error?.message || "Kitendo hakiwezi kukamilika katika hali ya sasa.";
  if (code === "resource-exhausted" || /quota exceeded|resource_exhausted|kikomo cha matumizi ya firestore/i.test(String(error?.message ?? ""))) return "Kikomo cha matumizi ya Firestore kimefikiwa. Watumiaji hawawezi kupakiwa mpaka quota irejee au iongezwe kwenye Google Cloud/Firebase.";
  if (["internal", "unavailable", "deadline-exceeded"].includes(code)) return "Firebase imerudisha hitilafu ya muda. Angalia salio kabla ya kujaribu tena; ombi la tokeni linalindwa lisihesabiwe mara mbili.";
  return error?.message || "Imeshindikana kupata au kuhifadhi taarifa. Jaribu tena.";
}
function Field({ label, value, onChange, type = "text", placeholder = "", disabled = false }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string; disabled?: boolean }) { return <label className="control-field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>; }
function Empty({ text = "Hakuna data bado" }: { text?: string }) { return <div className="admin-empty">{text}</div>; }


function LipaGlobalReport({ applications }: { applications: LipaApplication[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const dateOf = (value: any): Date | null => {
    try {
      const parsed = value && typeof value.toDate === "function" ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : value ? new Date(value) : null;
      return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    } catch { return null; }
  };
  const createdAt = (app: any) => dateOf(app.submittedAt ?? app.createdAt ?? app.updatedAt);
  const rows = applications.filter((app: any) => {
    const d = createdAt(app);
    if (!d) return !from && !to;
    const day = d.toLocaleDateString("en-CA");
    return (!from || day >= from) && (!to || day <= to);
  });
  const count = (fn: (app: any) => boolean) => rows.filter(fn).length;
  const paid = rows.filter((a: any) => a.rewardStatus === "PAID");
  const unpaid = rows.filter((a: any) => a.qualificationStatus === "QUALIFIED" && (a.rewardStatus ?? "UNPAID") === "UNPAID");
  const rejected = rows.filter((a: any) => a.status === "REJECTED");
  const money = (n: number) => "TSh " + n.toLocaleString("en-US");
  const stamp = (v: any) => { const d = dateOf(v); return d ? d.toLocaleString("sw-TZ") : "—"; };
  const deadline = (app: any) => {
    const created = createdAt(app);
    if (!created) return null;
    const start = new Date(created);
    const daysSinceFriday = (start.getDay() + 2) % 7;
    start.setDate(start.getDate() - daysSinceFriday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 10); // Thursday week end + Friday/Saturday/Sunday grace period
    end.setHours(23, 59, 59, 999);
    return end;
  };
  const remaining = (app: any) => {
    const end = deadline(app);
    if (!end) return "Tarehe haipo";
    const ms = end.getTime() - Date.now();
    if (ms <= 0) return "Muda umeisha";
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    return days ? days + " siku, " + hours + " saa" : hours + " saa";
  };
  const cards = [
    ["Lipa zilizotengenezwa", rows.length],
    ["Zilizoidhinishwa", count((a: any) => a.status === "APPROVED")],
    ["Zilizokataliwa", rejected.length],
    ["Zilizokidhi vigezo", count((a: any) => a.qualificationStatus === "QUALIFIED")],
    ["Bado hazijakidhi", count((a: any) => a.qualificationStatus === "PENDING_CHECK" && a.status === "APPROVED")],
    ["Zilizolipwa", paid.length],
    ["Bado hazijalipwa", unpaid.length],
  ];
  const download = () => {
    const header = ["ID", "Tarehe ya kutengeneza", "Mtandao", "Hali ya ombi", "Sababu ya kukataliwa", "Hali ya vigezo", "Miamala iliyothibitishwa", "Zawadi TSh", "Hali ya malipo", "Tarehe ya malipo", "Reference ya malipo", "Muda uliobaki"];
    const data = rows.map((a: any) => [a.id, stamp(a.submittedAt ?? a.createdAt), a.networkName ?? a.networkId ?? "", a.status ?? "", a.rejectionReason ?? "", a.qualificationStatus ?? "", Number(a.verifiedTransactions ?? 0), Number(a.reward ?? 0), a.rewardStatus ?? "", stamp(a.rewardPaidAt), a.rewardPaymentReference ?? "", a.qualificationStatus === "PENDING_CHECK" ? remaining(a) : ""]);
    const csv = [header, ...data].map(row => row.map(v => '"' + String(v ?? "").replace(/"/g, '""') + '"' ).join(",")).join("\r\n");

    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = "ripoti-za-lipa.csv"; link.click(); URL.revokeObjectURL(url);
  };
  return <section className="admin-card" style={{display:"grid",gap:18}}>
    <div className="admin-card-heading"><div><span className="admin-kicker">LIPA · RIPOTI YA JUMLA</span><h2>Ripoti za Lipa zote</h2><p>Hesabu zinatokana na maombi ya Lipa yaliyopo kwenye mfumo na kichujio cha tarehe.</p></div><BarChart3 size={22}/></div>
    <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"end"}}>
      <label className="control-field"><span>Tarehe kuanzia</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label>
      <label className="control-field"><span>Tarehe hadi</span><input type="date" value={to} min={from || undefined} onChange={e=>setTo(e.target.value)} /></label>
      <button type="button" className="admin-secondary" onClick={()=>{setFrom("");setTo("");}}>Ondoa kichujio</button>
      <button type="button" className="admin-primary" onClick={download}><Download size={16} style={{verticalAlign:"middle"}}/> Pakua CSV</button>
    </div>
    <div className="admin-stat-grid">{cards.map(([label,value])=><div className="admin-stat-card" key={label}><div className="admin-stat-icon"><BarChart3 size={18}/></div><span>{label}</span><strong>{Number(value).toLocaleString()}</strong><small>Data halisi · {from || "mwanzo"} — {to || "leo"}</small></div>)}</div>
    <div className="admin-two-col">
      <section className="admin-card"><h3>Zawadi na malipo</h3><p>Jumla ya zawadi zilizolipwa: <strong>{money(paid.reduce((sum:number,a:any)=>sum+Number(a.reward??0),0))}</strong></p><p>Jumla ya zawadi zinazodaiwa kwa waliofuzu: <strong>{money(unpaid.reduce((sum:number,a:any)=>sum+Number(a.reward??0),0))}</strong></p><p>Tarehe ya malipo inaonekana kwa rekodi zilizohifadhiwa baada ya malipo.</p></section>
      <section className="admin-card"><h3>Sababu za kukataliwa</h3>{rejected.length ? Object.entries(rejected.reduce((acc:Record<string,number>,a:any)=>{const reason=String(a.rejectionReason||"Sababu haijawekwa");acc[reason]=(acc[reason]||0)+1;return acc;},{})).map(([reason,n])=><p key={reason} style={{display:"flex",justifyContent:"space-between",gap:12}}><span>{reason}</span><strong>{n}</strong></p>) : <p>Hakuna Lipa zilizokataliwa kwenye kipindi hiki.</p>}</section>
    </div>
    <section><h3>Maelezo ya kila Lipa ({rows.length})</h3><div style={{overflowX:"auto"}}><table className="admin-table" style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Tarehe","Mtandao","Hali","Sababu ya kukataliwa","Vigezo","Miamala","Zawadi","Malipo","Tarehe ya malipo / muda"].map(x=><th key={x} style={{textAlign:"left",padding:10}}>{x}</th>)}</tr></thead><tbody>{rows.slice().sort((a:any,b:any)=>(createdAt(b)?.getTime()??0)-(createdAt(a)?.getTime()??0)).map((a:any)=><tr key={a.id} style={{borderTop:"1px solid var(--border,#e2e8f0)"}}><td style={{padding:10}}>{stamp(a.submittedAt??a.createdAt)}</td><td style={{padding:10}}>{a.networkName??a.networkId??"—"}</td><td style={{padding:10}}>{a.status??"—"}</td><td style={{padding:10}}>{a.rejectionReason||"—"}</td><td style={{padding:10}}>{a.qualificationStatus??"—"}</td><td style={{padding:10}}>{Number(a.verifiedTransactions??0).toLocaleString()}</td><td style={{padding:10}}>{money(Number(a.reward??0))}</td><td style={{padding:10}}>{a.rewardStatus??"—"}</td><td style={{padding:10}}>{a.rewardStatus==="PAID"?stamp(a.rewardPaidAt):a.qualificationStatus==="PENDING_CHECK"?remaining(a):"—"}</td></tr>)}</tbody></table></div>{rows.length===0&&<Empty text="Hakuna maombi ya Lipa katika kipindi hiki."/>}</section>
    <p style={{fontSize:12,color:"var(--muted,#64748b)"}}>Kumbuka: muda uliobaki unakokotolewa kwa wiki ya Ijumaa–Alhamisi na siku za nyongeza Ijumaa–Jumapili. Rekodi zisizo na tarehe zinaonyeshwa kama tarehe haipo. Ripoti haisababishi malipo ya moja kwa moja.</p>
  </section>;
}

export default function AdminDashboard() {
  const [location, navigate] = useLocation();
  const { user, firebaseUser, loading, logout, isAuthenticated } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");
  const [users, setUsers] = useState<(AdminUserRecord & { id: string })[]>([]);
  const [agentRecords, setAgentRecords] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [serviceLocks, setServiceLocks] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [lipaApplications, setLipaApplications] = useState<LipaApplication[]>([]);
  const [serviceApplications, setServiceApplications] = useState<ServiceApplication[]>([]);
  const [selectedInboxApplication, setSelectedInboxApplication] = useState<{ kind: "SERVICE" | "LIPA"; id: string } | null>(null);
  const [selectedInboxSession, setSelectedInboxSession] = useState(0);
  const [applicationInboxTab, setApplicationInboxTab] = useState<"ALL" | "SERVICES" | "LIPA">("ALL");
  const [lipaServices, setLipaServices] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [auditCollection, setAuditCollection] = useState<"adminActions" | "auditLogs">("adminActions");
  const [auditCursor, setAuditCursor] = useState<any>(null);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const panelReadCache = useRef(new Map<string, { loadedAt: number; value: unknown }>());
  const panelReadPending = useRef(new Map<string, Promise<unknown>>());
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<(AdminUserRecord & { id: string }) | null>(null);
  const [tokenForm, setTokenForm] = useState({ userId: "", amount: 1, tokenType: "huduma", reason: "" });
  const [tokenBonusConfig, setTokenBonusConfig] = useState({ registrationBonus: 12, dailyBonus: 3 });
  const [service, setService] = useState(emptyService);
  const [serviceOrder, setServiceOrder] = useState<string[]>([]);
  const [homepageSectionOrder, setHomepageSectionOrder] = useState<string[]>(defaultHomepageSectionOrder);
  const [message, setMessage] = useState(emptyMessage);
  const [cms, setCms] = useState({ systemName: "HUDUMA ZA MTANDAONI", eyebrow: "HUDUMA ZA MTANDAONI", headline: "Huduma zako, sehemu moja.", description: "", searchPlaceholder: "Tafuta huduma...", whatsapp: "255692287767", owner: "", footer: "", primaryColor: "#18b969", accentColor: "#6ea8fe" });
  const permissions = user?.permissions ?? {};
  const isSuper = user?.role === "super_admin";
  const isAdmin = user?.role === "admin";
  const hasPermission = (permission: string) => isSuper || isAdmin || permissions[permission as keyof typeof permissions] === true;
  const canManageLipaApplications = hasPermission("manageLipaApplications");
  const canManage = isAuthenticated && (isSuper || isAdmin || Object.values(permissions).some(Boolean));
  const rawPanel = location.split("/admin/")[1]?.split("/")[0] || "overview";
  const panel = ((rawPanel === "agentIdPricing" || nav.some(([key]) => key === rawPanel)) ? rawPanel : rawPanel === "settings" ? "cms" : rawPanel === "licenses" ? "templates" : rawPanel === "audit" ? "security" : rawPanel === "analytics" ? "reports" : rawPanel === "videos" || rawPanel === "announcements" || rawPanel === "ads" || rawPanel === "roles" ? "overview" : "overview") as Panel;
  const visibleNav = nav.filter(([key]) => key === "overview" || !panelPermission[key] || hasPermission(panelPermission[key]!));

  // Keep the admin drawer transient on mobile and never let its open state
  // survive navigation, Escape, or switching to the desktop layout.
  useEffect(() => { setDrawer(false); }, [location]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    const closeOnDesktop = () => {
      if (window.innerWidth > 800) setDrawer(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnDesktop);
    closeOnDesktop();
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnDesktop);
    };
  }, []);

  const cachedRead = <T,>(key: string, enabled: boolean, loader: () => Promise<T>, fallback: T, force: boolean) => {
    if (!enabled) return Promise.resolve(fallback);
    const cacheKey = `${firebaseUser?.uid ?? "anonymous"}:${key}`;
    const cached = panelReadCache.current.get(cacheKey);
    if (!force && cached && Date.now() - cached.loadedAt < 30_000) return Promise.resolve(cached.value as T);
    const pending = panelReadPending.current.get(cacheKey);
    if (!force && pending) return pending as Promise<T>;
    const request = loader().then((value) => {
      panelReadCache.current.set(cacheKey, { loadedAt: Date.now(), value });
      return value;
    }).finally(() => {
      if (panelReadPending.current.get(cacheKey) === request) panelReadPending.current.delete(cacheKey);
    });
    panelReadPending.current.set(cacheKey, request);
    return request;
  };
  const refresh = async (force = false) => {
    if (!canManage) return;
    setLoadingData(true);
    setDataError("");
    try {
      // Pakia data ya panel inayotazamwa tu. Hapo awali kila refresh ilisoma
      // makusanyo mengi ya Firestore hata kama admin alikuwa kwenye panel moja tu.
      const needs = (...panels: Panel[]) => panels.includes(panel);
      const results = await Promise.allSettled([
        cachedRead("users", hasPermission("viewUsers") && needs("overview", "users", "tokens", "reports", "security"), adminListUsers, [], force),
        cachedRead("services", hasPermission("manageServices") && needs("services", "serviceControl", "agentIdPricing", "applications", "reports", "appearance"), adminListServices, [], force),
        cachedRead("transactions", hasPermission("manageReports") && needs("overview", "transactions", "reports"), adminListTransactions, [], force),
        cachedRead("messages", hasPermission("manageMessages") && needs("messages"), () => adminListCollection("messages"), [], force),
        cachedRead(`security:${auditCollection}`, hasPermission("viewAuditLogs") && needs("security"), () => getRecentSecurityLogs(auditCollection), { rows: [], cursor: null, hasMore: false }, force),
        cachedRead("siteSettings", (hasPermission("manageSettings") && needs("services", "serviceControl", "cms", "templates", "appearance")) || (hasPermission("manageTokens") && needs("tokens")), adminGetSiteSettings, null, force),
        cachedRead("serviceLocks", hasPermission("manageServices") && needs("services", "serviceControl"), () => adminListCollection("serviceLocks"), [], force),
        cachedRead("lipaServices", canManageLipaApplications && needs("applications", "lipa"), () => adminListCollection("lipaServices"), [], force),
        cachedRead("lipaApplications", canManageLipaApplications && needs("applications", "lipaReport", "lipa"), adminListLipaApplications, [], force),
        cachedRead("serviceApplications", hasPermission("manageServices") && needs("overview", "applications", "reports"), adminListServiceApplications, [], force),
        cachedRead("agentRecords", hasPermission("manageUsers") && needs("agents"), adminListAgentRecords, [], force),
      ]);
      const [u, s, t, m, logs, settings, locks, networkConfigs, applications, genericApplications, agentRows] = results;
      if (u.status === "fulfilled") setUsers(u.value); else setDataError("Watumiaji: " + safeError(u.reason));
      if (s.status === "fulfilled") setServices(s.value); else setDataError((current) => current || "Huduma: " + safeError(s.reason));
      if (t.status === "fulfilled") setTransactions(t.value); else setDataError((current) => current || "Transactions: " + safeError(t.reason));
      if (m.status === "fulfilled") setMessages(m.value); else setDataError((current) => current || "Ujumbe: " + safeError(m.reason));
      if (logs.status === "fulfilled") {
        setAudit(logs.value.rows);
        setAuditCursor(logs.value.cursor);
        setAuditHasMore(logs.value.hasMore);
      } else setDataError((current) => current || "Audit: " + safeError(logs.reason));
      if (locks.status === "fulfilled") setServiceLocks(locks.value); else setDataError((current) => current || "Locks za huduma: " + safeError(locks.reason));
      if (networkConfigs.status === "fulfilled") setLipaServices(networkConfigs.value); else setDataError((current) => current || "Mipangilio ya Lipa: " + safeError(networkConfigs.reason));
      if (applications.status === "fulfilled") setLipaApplications(applications.value); else setDataError((current) => current || "Maombi ya Lipa: " + safeError(applications.reason));
      if (genericApplications.status === "fulfilled") setServiceApplications(genericApplications.value); else setDataError((current) => current || "Maombi ya huduma: " + safeError(genericApplications.reason));
      if (agentRows.status === "fulfilled") setAgentRecords(agentRows.value); else setDataError((current) => current || "Mawakala: " + safeError(agentRows.reason));
      if (settings.status === "fulfilled" && settings.value) {
        const saved = settings.value as Record<string, unknown>;
        if (Array.isArray(saved.serviceOrder)) setServiceOrder(saved.serviceOrder.filter((item): item is string => typeof item === "string"));
        if (Array.isArray(saved.homepageSectionOrder)) setHomepageSectionOrder(saved.homepageSectionOrder.filter((item): item is string => typeof item === "string"));
        setCms((current) => ({ ...current, ...Object.fromEntries(Object.keys(current).map((key) => [key, saved[key] ?? current[key as keyof typeof current]])) }));
        const bonus = saved.tokenBonusConfig as Record<string, unknown> | undefined;
        if (bonus) {
          const normalizedBonus = { registrationBonus: Number(bonus.registrationBonus ?? 12), dailyBonus: 3 };
          setTokenBonusConfig(normalizedBonus);
          // Hamisha mpangilio wa zamani wa bonus 6 kwenda kiwango kipya cha 3.
          if (hasPermission("manageTokens") && needs("tokens") && Number(bonus.dailyBonus ?? 6) !== 3) {
            try { await adminSaveSiteSettings(firebaseUser!.uid, { tokenBonusConfig: normalizedBonus }); }
            catch (error) { setDataError((current) => current || "Bonasi ya kila siku haikuhifadhiwa: " + safeError(error)); }
          }
        } else if (hasPermission("manageTokens") && needs("tokens")) {
          const normalizedBonus = { registrationBonus: 12, dailyBonus: 3 };
          setTokenBonusConfig(normalizedBonus);
          try { await adminSaveSiteSettings(firebaseUser!.uid, { tokenBonusConfig: normalizedBonus }); }
          catch (error) { setDataError((current) => current || "Bonasi ya kila siku haikuhifadhiwa: " + safeError(error)); }
        }
      }
    } finally { setLoadingData(false); }
  };
  useEffect(() => { void refresh(); }, [canManage, panel]);
  useEffect(() => { if (panel !== "applications") setSelectedInboxApplication(null); }, [panel]);

  // Keep the applications badge current even while the admin is viewing another panel.
  // A lightweight inbox refresh runs on entry and every 30 seconds.
  const canViewServiceInbox = hasPermission("manageServices");
  useEffect(() => {
    if (!canManage) return;
    let active = true;
    const updateApplicationCounts = async () => {
      const tasks = await Promise.allSettled([
        canViewServiceInbox ? adminListServiceApplications() : Promise.resolve(null),
        canManageLipaApplications ? adminListLipaApplications() : Promise.resolve(null),
      ]);
      if (!active) return;
      const [serviceRows, lipaRows] = tasks;
      if (serviceRows.status === "fulfilled" && serviceRows.value) setServiceApplications(serviceRows.value);
      if (lipaRows.status === "fulfilled" && lipaRows.value) setLipaApplications(lipaRows.value);
    };
    void updateApplicationCounts();
    const timer = window.setInterval(() => { void updateApplicationCounts(); }, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [canManage, canViewServiceInbox, canManageLipaApplications, firebaseUser?.uid]);
  const loadMoreAudit = async () => {
    if (!auditCursor || !auditHasMore || auditLoadingMore) return;
    setAuditLoadingMore(true);
    try {
      const page = await getRecentSecurityLogs(auditCollection, auditCursor);
      setAudit((current) => [...current, ...page.rows]);
      setAuditCursor(page.cursor);
      setAuditHasMore(page.hasMore);
    } catch (error) {
      setDataError((current) => current || "Audit: " + safeError(error));
    } finally {
      setAuditLoadingMore(false);
    }
  };
  const changeAuditCollection = async (name: "adminActions" | "auditLogs") => {
    if (name === auditCollection) return;
    setAuditCollection(name);
    setAudit([]);
    setAuditCursor(null);
    setAuditHasMore(false);
    setAuditLoadingMore(true);
    try {
      const page = await getRecentSecurityLogs(name);
      setAudit(page.rows);
      setAuditCursor(page.cursor);
      setAuditHasMore(page.hasMore);
    } catch (error) {
      setDataError((current) => current || "Audit: " + safeError(error));
    } finally {
      setAuditLoadingMore(false);
    }
  };
  const run = async (action: () => Promise<unknown>, success: string) => { setBusy(true); try { await action(); await refresh(true); toast.success(success); return true; } catch (error) { toast.error(safeError(error)); return false; } finally { setBusy(false); } };
  const visibleUsers = useMemo(() => users.filter((item) => `${item.name} ${item.phone} ${item.username}`.toLowerCase().includes(search.toLowerCase())), [users, search]);
  const totalIssued = transactions.filter((item) => Number(item.amount) > 0).reduce((sum, item) => sum + Number(item.amount), 0);
  const totalUsed = Math.abs(transactions.filter((item) => Number(item.amount) < 0).reduce((sum, item) => sum + Number(item.amount), 0));
  const totalRemaining = users.reduce((sum, item) => sum + Number(item.tokenBalance ?? 0), 0);
  const adminCount = users.filter((item) => ["admin", "super_admin"].includes(item.role)).length;
  const stats = [["Watumiaji wote", users.length, Users], ["Active Users", users.filter((item) => item.accountStatus !== "blocked").length, UserCog], ["Pending Users", users.filter((item) => item.verificationStatus === "pending").length, ShieldCheck], ["Admin Users", adminCount, ShieldCheck], ["Tokeni zilizotolewa", totalIssued, WalletCards], ["Tokeni zilizotumika", totalUsed, Zap], ["Tokeni zilizobaki", totalRemaining, WalletCards], ["Matumizi ya huduma", transactions.filter((item) => Number(item.amount) < 0).length, BarChart3]] as const;

  if (loading) return <main className="admin-guard"><RefreshCw className="spin" /> Inakagua ruhusa za admin...</main>;
  if (!canManage) return <main className="admin-guard"><ShieldCheck size={38} /><h2>Ukurasa huu ni wa admin pekee</h2><p>Ingia kwa akaunti yenye role ya admin au super_admin.</p><Link className="admin-primary" href="/">Rudi portal</Link></main>;
  const title = panel === "agentIdPricing" ? "Panga Bei za Kitambulisho cha Wakala" : nav.find(([key]) => key === panel)?.[1] ?? "Muhtasari";
  if ((panelPermission[panel] && !hasPermission(panelPermission[panel]!)) || (panel === "appearance" && !isSuper)) return <main className="admin-guard"><ShieldCheck size={38} /><h2>Huna ruhusa ya sehemu hii</h2><p>Wasiliana na Super Admin ili upewe permission husika.</p><Link className="admin-primary" href="/admin">Rudi dashboard</Link></main>;
  return <div className="admin-app">
    <aside className={`admin-sidebar ${drawer ? "open" : ""}`}><div className="admin-brand"><div className="admin-brand-mark">$</div><div><strong>$TEWARD TZ</strong><small>HUDUMA ZA MTANDAONI • CONTROL</small></div><button className="admin-close" onClick={() => setDrawer(false)}><X size={18} /></button></div><div className="admin-profile"><div className="admin-avatar">{String(user?.name ?? "AD").slice(0, 2).toUpperCase()}</div><div><strong>{user?.name ?? "Admin"}</strong><small>{String(user?.role ?? "admin").replace("_", " ").toUpperCase()}</small></div></div><nav className="admin-nav">{visibleNav.map(([key, label, Icon]) => <Link key={key} href={key === "overview" ? "/admin" : `/admin/${key}`} className={panel === key ? "active" : ""} onClick={() => setDrawer(false)}><Icon size={17} /><span>{label}</span>{key === "applications" && serviceApplications.filter((app) => !["APPROVED", "REJECTED", "COMPLETED", "DONE"].includes(String(app.status ?? "PENDING").toUpperCase())).length > 0 && <b className="lipa-admin-nav-badge">{serviceApplications.filter((app) => !["APPROVED", "REJECTED", "COMPLETED", "DONE"].includes(String(app.status ?? "PENDING").toUpperCase())).length}</b>}{key === "lipa" && lipaApplications.filter((app) => !["APPROVED", "REJECTED", "COMPLETED", "DONE"].includes(String(app.status ?? "PENDING").toUpperCase())).length > 0 && <b className="lipa-admin-nav-badge">{lipaApplications.filter((app) => !["APPROVED", "REJECTED", "COMPLETED", "DONE"].includes(String(app.status ?? "PENDING").toUpperCase())).length}</b>}<ChevronRight size={14} /></Link>)}</nav><div className="admin-sidebar-bottom"><Link href="/"><ChevronRight size={15} /> Portal</Link><button onClick={() => void logout()}><LogOut size={15} /> Logout</button></div></aside>
    {drawer && <div className="admin-drawer-backdrop" onClick={() => setDrawer(false)} />}
    <section className="admin-content"><header className="admin-header"><button className="admin-menu" onClick={() => setDrawer(true)}><Menu size={21} /></button><div><span className="admin-kicker">HUDUMA ZA MTANDAONI CONTROL</span><h1>{panel === "overview" ? "Muhtasari wa HUDUMA ZA MTANDAONI" : title}</h1></div><div className="admin-header-actions" style={{position:"relative"}}><button className="admin-icon-button" aria-label="Taarifa mpya" title="Taarifa mpya" onClick={() => setNotificationOpen((value) => !value)}><Bell size={18}/>{(serviceApplications.filter((app) => app.status === "PENDING").length + lipaApplications.filter((app) => !["APPROVED", "REJECTED", "COMPLETED", "DONE"].includes(String(app.status ?? "PENDING").toUpperCase())).length) > 0 && <span style={{position:"absolute",top:-5,right:78,minWidth:18,height:18,padding:"0 4px",borderRadius:99,background:"#dc2626",color:"#fff",fontSize:10,fontWeight:800,display:"grid",placeItems:"center"}}>{serviceApplications.filter((app) => app.status === "PENDING").length + lipaApplications.filter((app) => !["APPROVED", "REJECTED", "COMPLETED", "DONE"].includes(String(app.status ?? "PENDING").toUpperCase())).length}</span>}</button><button className="admin-icon-button" onClick={() => void refresh(true)} disabled={loadingData} aria-label="Refresh"><RefreshCw size={17} className={loadingData ? "spin" : ""} /></button><Link className="admin-portal-link" href="/">← Portal</Link>{notificationOpen && <div style={{position:"absolute",right:0,top:"calc(100% + 10px)",width:"min(340px, calc(100vw - 34px))",maxHeight:360,overflowY:"auto",zIndex:100,background:"#fff",border:"1px solid #dce5df",borderRadius:12,boxShadow:"0 14px 40px rgba(0,0,0,.16)",padding:12,color:"#17251f"}}><strong style={{display:"block",marginBottom:8}}>Taarifa mpya za maombi</strong>{[...serviceApplications.slice(0,5).map((app) => ({id:app.applicationId || app.id,label:app.serviceName || app.serviceSlug || "Ombi la huduma",person:app.userName || "Mtumiaji",date:app.submittedAt,href:"/admin/applications",kind:"Huduma",status:app.status || "PENDING"})),...lipaApplications.slice(0,5).map((app:any) => ({id:app.id,label:"Pata Lipa Namba",person:app.userName || app.phone || "Mtumiaji",date:app.submittedAt || app.createdAt,href:"/admin/applications",kind:"Lipa",status:app.status || "PENDING"}))].slice(0,8).map((item) => <button key={item.kind + item.id} onClick={() => { setNotificationOpen(false); navigate(item.href); }} style={{width:"100%",display:"block",textAlign:"left",padding:"10px 8px",border:0,borderTop:"1px solid #edf1ee",background:"transparent",cursor:"pointer",color:"#17251f"}}><span style={{display:"block",fontSize:11,color:"#168653",fontWeight:800}}>{item.kind} · {item.status}</span><strong style={{display:"block",fontSize:13}}>{item.label}</strong><small>{item.person}</small></button>)}{serviceApplications.length + lipaApplications.length === 0 && <p style={{fontSize:13,color:"#68746e"}}>Hakuna taarifa za maombi bado.</p>}<button onClick={() => {setNotificationOpen(false);navigate("/admin/applications");}} style={{marginTop:8,width:"100%",padding:9,borderRadius:8,border:"1px solid #cbd9d0",background:"#f5faf7",fontWeight:700,color:"#126c44"}}>Angalia maombi yote</button></div>}</div></header>
      {loadingData && <div className="admin-loading">Inapakia data halisi kutoka Firestore...</div>}
      {dataError && <div className="admin-loading admin-loading--error" role="alert">{dataError}{/kikomo cha matumizi ya Firestore/i.test(dataError) ? "" : " — Hakikisha role ya account hii ipo kwenye users/" + (firebaseUser?.uid ?? "") + " na rules zimetumwa kwenye project sahihi."}</div>}
      {panel === "overview" && <><div className="admin-stat-grid">{stats.map(([label, value, Icon]) => <div className="admin-stat-card" key={label}><div className="admin-stat-icon"><Icon size={18} /></div><span>{label}</span><strong>{value.toLocaleString()}</strong></div>)}</div><div className="admin-two-col"><section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">HATUA ZA HARAKA</span><h2>Simamia mfumo</h2></div><SlidersHorizontal size={19} /></div><div className="quick-actions">{hasPermission("manageTokens") && <Link href="/admin/tokens"><Plus size={17} /> Ongeza tokeni</Link>}{hasPermission("manageServices") && <Link href="/admin/services"><Plus size={17} /> Ongeza huduma</Link>}{hasPermission("manageServices") && <Link href="/admin/applications">Maombi ya huduma {serviceApplications.some((app) => app.status === "PENDING") && <b className="lipa-admin-nav-badge">{serviceApplications.filter((app) => app.status === "PENDING").length} PENDING</b>}</Link>}{hasPermission("manageLipaApplications") && <Link href="/admin/applications">Pata Lipa Namba {lipaApplications.some((app) => app.status === "PENDING") && <b className="lipa-admin-nav-badge">{lipaApplications.filter((app) => !["APPROVED", "REJECTED", "COMPLETED", "DONE"].includes(String(app.status ?? "PENDING").toUpperCase())).length} PENDING · NEW</b>}</Link>}</div></section><section className="admin-security-card"><div className="admin-card-heading"><div><span className="admin-kicker">USALAMA WA MFUMO</span><h2>Session salama</h2></div><ShieldCheck size={20} /></div><p><strong>{user?.name ?? "Admin"}</strong> · {String(user?.role ?? "admin").replace("_", " ").toUpperCase()}</p></section></div><section className="admin-overview-strip"><div className="admin-overview-intro"><span className="admin-kicker">MUHTASARI</span><h2>Hali ya mfumo kwa sasa</h2></div><div className="admin-pulse-list"><Link href="/admin/applications"><span><ClipboardList size={16}/> Maombi ya huduma</span><strong>{serviceApplications.filter((app) => app.status === "PENDING").length}</strong></Link><Link href="/admin/applications"><span><WalletCards size={16}/> Lipa Namba pending</span><strong>{lipaApplications.filter((app) => !["APPROVED", "REJECTED", "COMPLETED", "DONE"].includes(String(app.status ?? "PENDING").toUpperCase())).length}</strong></Link><Link href="/admin/users"><span><ShieldCheck size={16}/> Users pending</span><strong>{users.filter((item) => item.verificationStatus === "pending").length}</strong></Link></div></section><section className="admin-card"><div className="admin-card-heading"><div><h2>Miamala ya hivi karibuni</h2></div><Link href="/admin/transactions">Tazama zote</Link></div><TransactionTable rows={transactions.slice(0, 6)} /></section></>}      {panel === "agents" && <AgentRecordsPanel rows={agentRecords} onRefresh={refresh} loading={loadingData} />}
      {panel === "users" && <UsersPanel users={visibleUsers} search={search} setSearch={setSearch} onSelect={setSelectedUser} onRefresh={refresh} onRun={run} adminId={firebaseUser!.uid} isSuper={isSuper} canManageUsers={hasPermission("manageUsers")} busy={busy} />}
      {panel === "tokens" && <TokensPanel users={users} form={tokenForm} setForm={setTokenForm} onRun={run} adminId={firebaseUser!.uid} busy={busy} bonusConfig={tokenBonusConfig} setBonusConfig={setTokenBonusConfig} />}
      {panel === "services" && <ServicesPanel services={services} serviceLocks={serviceLocks} service={service} setService={setService} onRun={run} adminId={firebaseUser!.uid} busy={busy} isSuper={isSuper} />}
      {panel === "agentIdPricing" && <AgentIdPricingPanel services={services} adminId={firebaseUser!.uid} busy={busy} onRun={run} />}
      {panel === "serviceControl" && <ServicesPanel services={services} serviceLocks={serviceLocks} service={service} setService={setService} onRun={run} adminId={firebaseUser!.uid} busy={busy} isSuper={isSuper} controlOnly onEdit={() => navigate("/admin/services")} />}
      {panel === "applications" && <section className="admin-card admin-unified-applications">
        <div className="admin-card-heading"><div><span className="admin-kicker">INBOX KUU</span><h2>MAOMBI YA HUDUMA</h2><p style={{margin:"5px 0 0",color:"var(--muted,#64748b)"}}>Maombi ya huduma na LIPA NAMBA yameunganishwa kwenye list moja. Kila ombi lina aina yake na linafunguka kwa vitendo vyake maalum.</p></div><ClipboardList size={22}/></div>
        <UnifiedApplicationsInbox serviceApplications={serviceApplications} lipaApplications={lipaApplications} services={services} networks={lipaServices} onSelect={(kind, id) => { setSelectedInboxApplication({ kind, id }); setSelectedInboxSession((value) => value + 1); }} />
        {selectedInboxApplication && <div style={{marginTop:16}}>
          <button type="button" className="button button--secondary button--small" onClick={() => { setSelectedInboxApplication(null); setSelectedInboxSession((value) => value + 1); }} style={{marginBottom:12}}>← Rudi kwenye list ya maombi</button>
          {selectedInboxApplication.kind === "SERVICE"
            ? <ServiceApplicationsPanel key={`service-${selectedInboxSession}`} applications={serviceApplications} services={services} onRun={run} adminId={firebaseUser!.uid} busy={busy} hideList initialSelectedId={selectedInboxApplication.id} />
            : <LipaApplicationsPanel key={`lipa-${selectedInboxSession}`} applications={lipaApplications} networks={lipaServices} onRun={run} adminId={firebaseUser!.uid} busy={busy} hideList initialSelectedId={selectedInboxApplication.id} />}
        </div>}
        {hasPermission("manageServices") && <section style={{borderTop:"1px solid #e2e8f0",paddingTop:16,marginTop:16}}><LipaNetworkConfigPanel networks={lipaServices} onRun={run} adminId={firebaseUser!.uid} busy={busy} /></section>}
      </section>}
      {panel === "lipa" && <section className="admin-card admin-unified-applications">
        <div className="admin-card-heading"><div><span className="admin-kicker">LIPA NAMBA · INBOX</span><h2>Maombi ya Lipa Namba</h2><p style={{margin:"5px 0 0",color:"var(--muted,#64748b)"}}>Maombi ya Lipa, Access Lipa na huduma zinazohusiana. Chagua ombi kulifungua na kulichakata.</p></div><WalletCards size={22}/></div>
        <UnifiedApplicationsInbox serviceApplications={[]} lipaApplications={lipaApplications} services={[]} networks={lipaServices} initialKind="LIPA" onSelect={(kind, id) => { setSelectedInboxApplication({ kind, id }); setSelectedInboxSession((value) => value + 1); }} />
        {selectedInboxApplication?.kind === "LIPA" && <div style={{marginTop:16}}>
          <button type="button" className="button button--secondary button--small" onClick={() => { setSelectedInboxApplication(null); setSelectedInboxSession((value) => value + 1); }} style={{marginBottom:12}}>← Rudi kwenye list ya Lipa</button>
          <LipaApplicationsPanel key={`lipa-dedicated-${selectedInboxSession}`} applications={lipaApplications} networks={lipaServices} onRun={run} adminId={firebaseUser!.uid} busy={busy} hideList initialSelectedId={selectedInboxApplication.id} />
        </div>}
        {hasPermission("manageServices") && <section style={{borderTop:"1px solid #e2e8f0",paddingTop:16,marginTop:16}}><LipaNetworkConfigPanel networks={lipaServices} onRun={run} adminId={firebaseUser!.uid} busy={busy} /></section>}
      </section>}
      {panel === "lipaReport" && <LipaGlobalReport applications={lipaApplications} />}
            {panel === "transactions" && <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">AUDIT LEDGER</span><h2>Transactions</h2></div><button type="button" className="button button--green button--small" onClick={() => exportTransactionsCsv(transactions)} disabled={!transactions.length}>Pakua ripoti CSV</button></div><TransactionTable rows={transactions} /></section>}
      {panel === "reports" && <BusinessReport transactions={transactions} users={users} serviceApplications={serviceApplications} lipaApplications={lipaApplications} services={services} />}
      {panel === "security" && <SecurityPanel isSuper={isSuper} users={users} audit={audit} collectionName={auditCollection} onCollectionChange={changeAuditCollection} hasMore={auditHasMore} loadingMore={auditLoadingMore} onLoadMore={loadMoreAudit} />}
      {panel === "cms" && <CmsPanel values={cms} setValues={setCms} onRun={run} adminId={firebaseUser!.uid} />}
      {panel === "templates" && <TemplateEditorPanel values={cms} setValues={setCms} onRun={run} adminId={firebaseUser!.uid} />}
      {panel === "appearance" && <ServiceOrderingPanel services={services} serviceOrder={serviceOrder} setServiceOrder={setServiceOrder} sectionOrder={homepageSectionOrder} setSectionOrder={setHomepageSectionOrder} busy={busy} onSave={() => void run(() => adminSaveSiteSettings(firebaseUser!.uid, { serviceOrder, homepageSectionOrder }), "Mpangilio wa homepage umehifadhiwa.")} />}
      {panel === "messages" && <MessagesPanel users={users} form={message} setForm={setMessage} onRun={run} adminId={firebaseUser!.uid} />}
    </section>{selectedUser && <UserModal person={selectedUser} onClose={() => setSelectedUser(null)} />}</div>;
}

const permissionOptions = [
  ["viewUsers", "Users: kuona profiles"],
  ["manageUsers", "Users: approve, block/unblock na profile"],
  ["manageTokens", "Tokeni: kuongeza/kupunguza na ledger"],
  ["manageServices", "Huduma: kuongeza, kuhariri na kufuta"],
  ["manageLipaApplications", "Lipa Namba: kuona na kuchakata maombi"],
  ["manageContent", "Content: CMS"],
  ["manageMessages", "Messages: kutuma ujumbe"],
  ["manageReports", "Reports: kuona ripoti"],
  ["manageSettings", "Settings: kubadilisha mfumo"],
  ["manageLicenses", "Leseni: kusimamia templates"],
  ["viewAuditLogs", "Audit logs: kuona historia ya actions"],
] as const;

const panelPermission: Partial<Record<Panel, string>> = { agentIdPricing: "manageServices", agents: "manageUsers", lipaReport: "manageLipaApplications", users: "viewUsers", tokens: "manageTokens", services: "manageServices", serviceControl: "manageServices", applications: "manageServices", lipa: "manageLipaApplications", transactions: "manageReports", reports: "manageReports", security: "viewAuditLogs", messages: "manageMessages", cms: "manageSettings", templates: "manageSettings", appearance: "manageSettings" };

function BusinessReport({ transactions, users, serviceApplications, lipaApplications, services }: { transactions: any[]; users: any[]; serviceApplications: ServiceApplication[]; lipaApplications: LipaApplication[]; services: any[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const dateOf = (value: any): Date | null => {
    try {
      const date = value && typeof value.toDate === "function" ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime()) ? date : null;
    } catch { return null; }
  };
  const inRange = (value: any) => {
    const date = dateOf(value);
    if (!date) return !from && !to;
    const day = date.toLocaleDateString("en-CA");
    return (!from || day >= from) && (!to || day <= to);
  };
  const filteredTransactions = transactions.filter((item) => inRange(item.createdAt));
  const filteredServices = serviceApplications.filter((item: any) => inRange(item.submittedAt ?? item.createdAt ?? item.updatedAt));
  const filteredLipa = lipaApplications.filter((item: any) => inRange(item.submittedAt ?? item.createdAt ?? item.updatedAt));
  const credits = filteredTransactions.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
  const debits = filteredTransactions.reduce((sum, item) => sum + Math.abs(Math.min(0, Number(item.amount) || 0)), 0);
  const pendingServices = filteredServices.filter((item: any) => ["PENDING", "PROCESSING"].includes(String(item.status ?? "PENDING").toUpperCase())).length;
  const pendingLipa = filteredLipa.filter((item: any) => ["PENDING", "PROCESSING"].includes(String(item.status ?? "PENDING").toUpperCase())).length;
  const serviceCounts = filteredServices.reduce((acc: Record<string, number>, item: any) => {
    const name = String(item.serviceName ?? item.serviceSlug ?? "Huduma nyingine");
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const topServices = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const cards: Array<[string, number, string]> = [
    ["Miamala ya tokeni", filteredTransactions.length, "Miamala iliyo kwenye kipindi"],
    ["Tokeni zilizoongezwa", credits, "CREDIT; si mapato ya fedha"],
    ["Tokeni zilizotumika", debits, "Jumla ya matumizi ya tokeni"],
    ["Maombi ya huduma", filteredServices.length, "Maombi ndani ya kipindi"],
    ["Maombi yanayosubiri", pendingServices, "Huduma zinazosubiri"],
    ["Pata Lipa Namba", filteredLipa.length, "Maombi ya Lipa ndani ya kipindi"],
  ];
  return <div className="admin-report-page">
    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="admin-kicker">TAKWIMU ZA MFUMO</span><h2>Ripoti za biashara</h2></div><BarChart3 size={22}/></div>
      <p>Chuja kipindi ili kuona matumizi ya tokeni, mwenendo wa maombi na shughuli za huduma. Tokeni si sawa na mapato ya fedha; mapato halisi yatahitaji rekodi za malipo.</p>
      <div className="form-grid"><Field label="Kuanzia tarehe" value={from} type="date" onChange={setFrom}/><Field label="Mpaka tarehe" value={to} type="date" onChange={setTo}/></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
        <button type="button" className="admin-primary" onClick={() => exportTransactionsCsv(filteredTransactions)} disabled={!filteredTransactions.length}>Pakua CSV ya miamala</button>
        <button type="button" className="admin-secondary" onClick={() => {setFrom("");setTo("");}}>Ondoa kichujio</button>
      </div>
    </section>
    <div className="admin-stat-grid">{cards.map(([label,value,note]) => <div className="admin-stat-card" key={label}><div className="admin-stat-icon"><BarChart3 size={18}/></div><span>{label}</span><strong>{Number(value).toLocaleString("sw-TZ")}</strong><small>{note}</small></div>)}</div>
    <div className="admin-two-col">
      <section className="admin-card"><h2>Muhtasari wa huduma</h2><p>Watumiaji wote: <strong>{users.length.toLocaleString("sw-TZ")}</strong></p><p>Huduma zinazopatikana: <strong>{services.filter((item: any) => item.active !== false && item.isVisible !== false).length.toLocaleString("sw-TZ")}</strong></p><p>Maombi ya Lipa yanayosubiri: <strong>{pendingLipa.toLocaleString("sw-TZ")}</strong></p><p>Maombi ya huduma yaliyokamilika: <strong>{filteredServices.filter((item: any) => ["APPROVED", "COMPLETED", "DONE"].includes(String(item.status ?? "").toUpperCase())).length.toLocaleString("sw-TZ")}</strong></p></section>
      <section className="admin-card"><h2>Huduma zinazotumiwa zaidi</h2>{topServices.length ? topServices.map(([name,count]) => <p key={name} style={{display:"flex",justifyContent:"space-between",gap:12,borderBottom:"1px solid var(--border,#e2e8f0)",padding:"8px 0",margin:0}}><span>{name}</span><strong>{count}</strong></p>) : <Empty text="Hakuna maombi kwenye kipindi hiki"/>}</section>
    </div>
  </div>;
}


function UsersPanel({ users, search, setSearch, onSelect, onRun, adminId, isSuper, canManageUsers, busy }: any) {
  const [accessUser, setAccessUser] = useState<any>(null);
  const [restrictionUser, setRestrictionUser] = useState<any>(null);
  const [restrictionMode, setRestrictionMode] = useState<AccountAccessMode>("active");
  const [restrictionReason, setRestrictionReason] = useState("");
  const [restrictionMessage, setRestrictionMessage] = useState("");
  const [restrictionActions, setRestrictionActions] = useState<AccountRestrictionAction[]>([]);
  const [modeFilter, setModeFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("");
  const [resetUser, setResetUser] = useState<any>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const openAccess = (person: any) => { setAccessUser(person); setPermissions({ ...(person.permissions ?? {}) }); };
  const openRestriction = (person: any) => {
    setRestrictionUser(person);
    setRestrictionMode(resolveAccountAccessMode(person));
    setRestrictionReason(String(person.restrictionReason ?? ""));
    setRestrictionMessage(String(person.restrictionMessage ?? ""));
    setRestrictionActions(Array.isArray(person.allowedActions) ? person.allowedActions.filter((action: unknown): action is AccountRestrictionAction => accountRestrictionActions.includes(action as AccountRestrictionAction)) : []);
  };
  const saveAccess = () => {
    if (!accessUser) return;
    onRun(() => adminUpdateUser(adminId, accessUser.id, { role: accessUser.role, permissions }), "Role na permissions zimehifadhiwa.");
    setAccessUser(null);
  };
  const saveRestriction = () => {
    if (!restrictionUser) return;
    const target = restrictionUser;
    const payload = { accessMode: restrictionMode, restrictionReason: restrictionReason.trim(), restrictionMessage: restrictionMessage.trim(), allowedActions: restrictionMode === "limited" ? restrictionActions : [] };
    onRun(() => adminUpdateUser(adminId, target.id, payload), restrictionMode === "active" ? "Vizuizi vimeondolewa; akaunti imeruhusiwa." : "Kizuizi cha akaunti kimehifadhiwa.");
    setRestrictionUser(null);
  };
  const toggleRestrictionAction = (action: AccountRestrictionAction) => setRestrictionActions((current) => current.includes(action) ? current.filter((item) => item !== action) : [...current, action]);
  const modeLabel: Record<AccountAccessMode, string> = { active: "Ruhusiwa", read_only: "Soma tu", limited: "Vitendo maalum", denied: "Amezuiwa" };
  const filteredUsers = users.filter((person: any) => {
    const mode = resolveAccountAccessMode(person);
    const matchesMode = modeFilter === "all" || mode === modeFilter;
    const matchesReason = !reasonFilter.trim() || String(person.restrictionReason ?? "").toLocaleLowerCase().includes(reasonFilter.trim().toLocaleLowerCase());
    return matchesMode && matchesReason;
  });
  return <section className="admin-card">
    <div className="admin-card-heading"><div><span className="admin-kicker">FIRESTORE USERS</span><h2>Watumiaji na vizuizi</h2></div><span className="admin-count">{filteredUsers.length} / {users.length}</span></div>
    <div className="admin-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tafuta jina au simu..." /></div>
    <div className="form-grid restriction-filter-grid">
      <label className="control-field"><span>Chuja kwa aina ya ufikiaji</span><select value={modeFilter} onChange={(event) => setModeFilter(event.target.value)}><option value="all">Aina zote</option><option value="active">Ruhusiwa kikamilifu</option><option value="read_only">Soma tu</option><option value="limited">Vitendo maalum</option><option value="denied">Amezuiwa kabisa</option></select></label>
      <label className="control-field"><span>Chuja kwa sababu</span><input value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)} placeholder="Andika sehemu ya sababu..." /></label>
    </div>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>MTUMIAJI</th><th>SIMU</th><th>ROLE</th><th>UFIKIAJI / SABABU</th><th>UTHIBITISHO</th><th>TOKENI</th><th>VITENDO</th></tr></thead><tbody>{filteredUsers.map((person: any) => {
      const mode = resolveAccountAccessMode(person);
      const pill = mode === "active" ? "pill-green" : mode === "denied" ? "pill-red" : "pill-blue";
      return <tr key={person.id}>
        <td><button className="user-cell" onClick={() => onSelect(person)}><span className="table-avatar">{String(person.name ?? "U").slice(0, 2).toUpperCase()}</span><span><strong>{person.name ?? "Bila jina"}</strong><small>{person.id.slice(0, 10)} · {dateText(person.createdAt)}</small></span></button></td>
        <td>{person.phone || "—"}</td>
        <td><span className="pill pill-blue">{person.role ?? "user"}</span></td>
        <td><span className={`pill ${pill}`}>{modeLabel[mode]}</span>{person.restrictionReason && mode !== "active" ? <small className="restriction-reason-preview" title={person.restrictionReason}>{person.restrictionReason}</small> : null}</td>
        <td>{person.verificationStatus === "approved" ? <span className="pill pill-green">✓ Verified</span> : <span className="pill">{person.verificationStatus ?? "pending"}</span>}</td>
        <td><strong>{person.tokenBalance ?? 0}</strong><small>Received {person.totalTokensReceived ?? 0}</small></td>
        <td><div className="table-actions">{canManageUsers && <><button disabled={busy} onClick={() => onRun(() => adminUpdateUser(adminId, person.id, { verificationStatus: person.verificationStatus === "approved" ? "rejected" : "approved" }), person.verificationStatus === "approved" ? "✓ imeondolewa." : "User amethibitishwa.")}>{person.verificationStatus === "approved" ? "Ondoa ✓" : "Weka ✓"}</button><button disabled={busy} onClick={() => openRestriction(person)}>{mode === "active" ? "Weka zuio" : "Badili zuio"}</button><button disabled={busy} onClick={() => { setResetUser(person); setTemporaryPassword(""); }}>Reset password</button></>}{isSuper && <><button type="button" disabled={busy} style={{color:"#b91c1c",borderColor:"#fecaca"}} onClick={() => { const label = String(person.name ?? person.phone ?? person.id); if (window.confirm("FUTA AKAUNTI KABISA?\
\
"+label+" itaondolewa Firebase Authentication na Firestore, kisha haitajitokeza tena kwenye dashboard. Mtu huyo atahitaji kujisajili upya. Kitendo hiki hakiwezi kurudishwa. Una uhakika?")) void onRun(() => adminDeleteUserAccount(person.id), "Akaunti imefutwa kabisa na imeondolewa kwenye dashboard."); }}>Futa kabisa</button><button disabled={busy} onClick={() => openAccess(person)}>Access</button></>}</div></td>
      </tr>;
    })}</tbody></table>{!filteredUsers.length && <Empty text="Hakuna mtumiaji anayelingana na aina au sababu uliyochagua." />}</div>
    {restrictionUser && <div className="admin-modal-backdrop" onClick={() => setRestrictionUser(null)}><div className="admin-modal" onClick={(event) => event.stopPropagation()}><button className="admin-modal-close" onClick={() => setRestrictionUser(null)}><X size={18} /></button><span className="admin-kicker">USIMAMIZI WA UFIKIAJI</span><h2>{restrictionUser.name ?? restrictionUser.phone ?? "Mtumiaji"}</h2><label className="control-field"><span>Aina ya ufikiaji</span><select value={restrictionMode} onChange={(event) => setRestrictionMode(event.target.value as AccountAccessMode)}><option value="active">Ruhusu kikamilifu</option><option value="read_only">Aingie na kusoma tu; asifanye vitendo</option><option value="limited">Aingie na afanye vitendo vilivyochaguliwa</option><option value="denied">Zuia matumizi yote ya mfumo</option></select></label>{restrictionMode === "limited" && <fieldset className="check-grid restriction-action-list"><legend>Chagua vitendo anavyoruhusiwa kufanya</legend>{accountRestrictionActions.map((action) => <label key={action}><input type="checkbox" checked={restrictionActions.includes(action)} onChange={() => toggleRestrictionAction(action)} /> {accountRestrictionActionLabels[action]}</label>)}</fieldset>}<label className="control-field"><span>Sababu ya kizuizi (si lazima)</span><textarea maxLength={500} rows={3} value={restrictionReason} onChange={(event) => setRestrictionReason(event.target.value)} placeholder="Mfano: Taarifa za akaunti zinahitaji kuhakikiwa." /></label><label className="control-field"><span>Ujumbe maalum wa arifa kwa mtumiaji (si lazima)</span><textarea maxLength={1000} rows={4} value={restrictionMessage} onChange={(event) => setRestrictionMessage(event.target.value)} placeholder="Andika maelekezo au salamu ya kumjulisha mtumiaji." disabled={restrictionMode === "active"} /></label><small>{restrictionReason.length}/500 · {restrictionMessage.length}/1000. Ujumbe utaonekana kwenye taarifa za akaunti na kwenye ukurasa wa kufungiwa; ukiacha wazi, ujumbe wa kawaida utatumika. Hii ni arifa ya ndani ya mfumo, si SMS.</small><div className="form-actions"><button className="admin-primary" disabled={busy || (restrictionMode === "limited" && restrictionActions.length === 0)} onClick={saveRestriction}>Hifadhi kizuizi</button><button disabled={busy} onClick={() => setRestrictionUser(null)}>Ghairi</button></div></div></div>}
    {accessUser && <div className="admin-modal-backdrop" onClick={() => setAccessUser(null)}><div className="admin-modal" onClick={(event) => event.stopPropagation()}><button className="admin-modal-close" onClick={() => setAccessUser(null)}><X size={18} /></button><span className="admin-kicker">SUPER ADMIN ACCESS</span><h2>{accessUser.name ?? accessUser.phone}</h2><label className="control-field"><span>Role</span><select value={accessUser.role ?? "user"} onChange={(event) => setAccessUser({ ...accessUser, role: event.target.value })}><option value="user">User</option><option value="admin">Admin</option><option value="super_admin">Super admin</option></select></label><div className="check-grid">{permissionOptions.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(permissions[key])} onChange={(event) => setPermissions({ ...permissions, [key]: event.target.checked })} /> {label}</label>)}</div><div className="form-actions"><button className="admin-primary" disabled={busy} onClick={saveAccess}>Hifadhi access</button><button onClick={() => setAccessUser(null)}>Ghairi</button></div></div></div>}
    {resetUser && <div className="admin-modal-backdrop" onClick={() => setResetUser(null)}><div className="admin-modal" onClick={(event) => event.stopPropagation()}><button className="admin-modal-close" onClick={() => setResetUser(null)}><X size={18} /></button><span className="admin-kicker">ACCOUNT RECOVERY</span><h2>Reset password</h2><p>Mtumiaji <strong>{resetUser.name ?? resetUser.phone ?? resetUser.id}</strong> atapewa password ya muda na atalazimika kuweka password yake mpya baada ya kuingia.</p><label className="control-field"><span>Password ya muda</span><input type="text" autoComplete="off" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} placeholder="Angalau herufi 8" /></label><div className="form-actions"><button className="admin-primary" disabled={busy || temporaryPassword.length < 8} onClick={() => { const target = resetUser; const temp = temporaryPassword; void onRun(() => adminResetUserPassword(adminId, target.id, temp), "Password ya muda imewekwa."); setResetUser(null); }}>Reset password</button><button onClick={() => setResetUser(null)}>Ghairi</button></div></div></div>}
  </section>;
}
function TokensPanel({ users, form, setForm, onRun, adminId, busy, bonusConfig, setBonusConfig }: any) {
  const [userSearch, setUserSearch] = useState("");
  const filteredUsers = users.filter((item: any) => `${item.name ?? ""} ${item.phone ?? ""} ${item.id ?? ""}`.toLowerCase().includes(userSearch.trim().toLowerCase()));
  const requestIds = useRef(new Map<string, string>());
  const submitAdjustment = (direction: 1 | -1) => {
    const amount = Math.abs(Number(form.amount)) * direction;
    if (!form.userId || !Number.isInteger(amount) || amount === 0) {
      toast.error("Chagua mtumiaji na weka kiasi kamili cha tokeni.");
      return;
    }
    const tokenType = "TOKENI ZA HUDUMA";
    const tokenPrice = 500;
    const customReason = String(form.reason || "").trim();
    const description = (customReason ? customReason + " · " : "") + tokenType + " · TZS " + tokenPrice + " kwa tokeni";
    const requestKey = JSON.stringify([adminId, form.userId, amount, description]);
    let requestId = requestIds.current.get(requestKey);
    if (!requestId) {
      requestId = crypto.randomUUID();
      requestIds.current.set(requestKey, requestId);
      if (requestIds.current.size > 40) requestIds.current.delete(requestIds.current.keys().next().value!);
    }
    const label = direction > 0 ? "Tokeni zimeongezwa." : "Tokeni zimepunguzwa.";
    onRun(async () => {
      const result = await adminAdjustTokens(adminId, form.userId, amount, description, requestId, "huduma");
      requestIds.current.delete(requestKey);
      return result;
    }, label);
  };
  const invalidAmount = !Number.isInteger(Number(form.amount)) || Number(form.amount) <= 0;
  return <div className="admin-two-col"><section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">TOKEN LEDGER</span><h2>Usimamizi wa Tokeni</h2></div></div><label className="control-field"><span>Tafuta mteja kwa jina, namba ya simu au ID</span><input type="search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Andika jina au namba ya simu..." /><small>{filteredUsers.length} kati ya {users.length} akaunti</small></label><label className="control-field"><span>Chagua mtumiaji</span><select value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })}><option value="">Chagua akaunti ya mteja</option>{filteredUsers.map((item: any) => <option key={item.id} value={item.id}>{item.name ?? "Bila jina"} — {item.phone || "—"} — {item.tokenBalance ?? 0}</option>)}</select>{filteredUsers.length === 0 && <small>Hakuna akaunti iliyopatikana kwa utafutaji huo.</small>}</label><Field label="Kiasi cha tokeni" type="number" value={form.amount} onChange={(value) => setForm({ ...form, amount: Number(value) })} /><label className="control-field"><span>Maelezo ya ziada</span><textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Mfano: Malipo yamethibitishwa WhatsApp" /></label><div className="form-actions"><button className="admin-primary" disabled={busy || !form.userId || invalidAmount} onClick={() => submitAdjustment(1)}>+ Ongeza tokeni</button><button className="admin-danger" disabled={busy || !form.userId || invalidAmount} onClick={() => submitAdjustment(-1)}>− Punguza tokeni</button></div></section><section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">TOKEN BONUS CONTROL</span><h2>Bonasi za Tokeni</h2><p>Badilisha kiasi cha bonus ya usajili na bonus ya kila siku.</p></div></div><div className="admin-two-col"><Field label="Bonasi ya usajili mpya — Tokeni za huduma" type="number" value={bonusConfig.registrationBonus} onChange={(value) => setBonusConfig({ ...bonusConfig, registrationBonus: Math.max(0, Number(value) || 0) })} /><Field label="Bonasi ya kila siku — Tokeni za huduma" type="number" value={bonusConfig.dailyBonus} onChange={(value) => setBonusConfig({ ...bonusConfig, dailyBonus: Math.max(0, Number(value) || 0) })} /></div><button className="admin-primary" disabled={busy} onClick={() => onRun(() => adminSaveSiteSettings(adminId, { tokenBonusConfig: { registrationBonus: Math.min(10000, Math.floor(bonusConfig.registrationBonus)), dailyBonus: Math.min(10000, Math.floor(bonusConfig.dailyBonus)) } }), "Mipangilio ya bonasi imehifadhiwa.")}>Hifadhi Bonasi</button></section><section className="admin-card"><div className="admin-card-heading"><h2>Maelezo ya ledger</h2></div><p>Bei ya tokeni za huduma: <strong>tokeni 3 = TZS 500</strong> na <strong>tokeni 6 = TZS 1,000</strong>. Ledger huhifadhi salio la awali na jipya, admin, sababu na rejea ya kipekee.</p><div className="ledger-note"><WalletCards size={20} /><span>Operations zote zinathibitishwa na Firebase Function salama.</span></div></section></div>;
}
function ServicesPanel({ services, serviceLocks, service, setService, onRun, adminId, busy, isSuper, controlOnly = false, onEdit }: any) {
  const toggleLock = (item: any) => { const nextLocked = !item.isLocked; const message = nextLocked ? (window.prompt("Ujumbe ambao mtumiaji ataona wakati huduma imefungwa:", item.maintenanceMessage || "Huduma hii inafanyiwa maboresho kwa sasa. Jaribu tena baadaye.") ?? item.maintenanceMessage ?? "") : ""; onRun(() => adminSaveService(adminId, { ...item, isLocked: nextLocked, maintenanceMessage: message }, item.slug ?? item.id), nextLocked ? "Huduma imefungwa na ujumbe wa maboresho umehifadhiwa." : "Huduma imefunguliwa."); };
  const lockBySlug = new Map<string, boolean>();
  for (const entry of serviceLocks as any[]) lockBySlug.set(String(entry.slug ?? entry.id), entry.isLocked === true);
  // Firestore inaweza kuwa na config chache tu; control panel lazima ionyeshe catalog nzima, pamoja na ZANA ZA ZIADA.
  const configuredServices = mergeServiceCatalogDefaults(services as any[], false).filter((item: any) => String(item.slug ?? item.id) !== "utafutaji-nida" && !/\bnida\b/i.test(`${item.name ?? ""} ${item.slug ?? item.id ?? ""}`));
  // Dedupe kwa slug: TAFUTA NIDA ilikuwa inaonekana mara mbili ndani ya Funga/Fungua Huduma.
  const uniqueServices = new Map<string, any>();
  for (const item of configuredServices) uniqueServices.set(String(item.slug), item);
  const rows = Array.from(uniqueServices.values()).map((item) => {
    const slug = String(item.slug ?? item.id);
    const storedLock = lockBySlug.get(slug);
    const isLocked = isServiceLocked(slug, storedLock, item.isLocked === true || item.kind === "locked");
    return { ...item, slug, isLocked };
  }).sort((a, b) => Number(a.order ?? 9999) - Number(b.order ?? 9999) || String(a.name).localeCompare(String(b.name)));
  // Network price records are managed only through PANGA BEI, not the service lock list.
  const agentIdNetworkSlugs = new Set(["kitambulisho-wakala-airtel", "kitambulisho-wakala-halotel", "kitambulisho-wakala-yas", "kitambulisho-wakala-vodacom", "kitambulisho-wakala-mbeya"]);
  const controlRows = rows.filter((item) => !agentIdNetworkSlugs.has(String(item.slug ?? item.id)));

  const saveService = () => {
    const slug = String(service.slug ?? "").trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(slug)) { toast.error("Slug iwe na herufi ndogo, namba, dash au underscore."); return; }
    const { id: _id, ...editable } = service;
    onRun(() => adminSaveService(adminId, { ...editable, slug, fields: service.fields ?? [] }, slug), "Huduma imehifadhiwa kwenye Firestore.");
  };
  const addField = () => setService({ ...service, fields: [...(service.fields ?? []), { fieldName: `field${(service.fields ?? []).length + 1}`, label: "Field mpya", type: "TEXT", required: false, order: (service.fields ?? []).length }] });
  const updateField = (index: number, patch: Partial<ServiceFormField>) => setService({ ...service, fields: (service.fields ?? []).map((field: ServiceFormField, i: number) => i === index ? { ...field, ...patch } : field) });
  const reset = () => setService({ ...emptyService, fields: [] });
  const setServiceAvailability = (item: any, locked: boolean) => {
    const message = locked
      ? (window.prompt("Andika ujumbe wa maboresho ambao mtumiaji ataona:", item.maintenanceMessage || "Huduma hii inafanyiwa maboresho kwa sasa. Jaribu tena baadaye.") ?? item.maintenanceMessage ?? "Huduma hii inafanyiwa maboresho kwa sasa. Jaribu tena baadaye.")
      : "";
    onRun(
      async () => {
        const slug = String(item.slug ?? item.id);
        await adminSetServiceLock(slug, locked);
        await adminSaveService(adminId, { ...item, isLocked: locked, maintenanceMessage: message }, slug);
      },
      locked ? "Huduma imefungwa." : "Huduma imefunguliwa na inapatikana kwa watumiaji."
    );
  };
  const setServiceBilling = (item: any, free: boolean) => {
    const tokenCost = free ? 0 : Math.max(1, Number(item.tokenCost ?? 2));
    onRun(
      () => adminSaveService(adminId, { ...item, isFree: free, tokenCost }, item.slug ?? item.id),
      free ? "Huduma imewekwa BURE." : "Huduma imewekwa ya TOKENI."
    );
  };
  return <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">{controlOnly ? "HUDUMA CONTROL" : "FIRESTORE SERVICE CONTROL"}</span><h2>{controlOnly ? "🔒 FUNGA / FUNGUA HUDUMA" : "Huduma — Fungua / Funga / Bure / Tokeni"}</h2><p>{controlOnly ? "Chagua huduma yoyote hapa chini kisha bonyeza FUNGIA au FUNGUA. Hii inafanya kazi kwa huduma kuu na ZANA ZA ZIADA." : "Hapa ndipo admin anasimamia huduma zote. Unaweza kufungua au kufunga huduma, kuweka ujumbe wa maboresho, kuifanya BURE au ya TOKENI, kuonyesha/kuficha na kuiwezesha/kuzima."}</p></div><span className="admin-count">{controlRows.length}</span><Link href="/admin/serviceControl" className="admin-primary service-control-top-link">🔒 FUNGA / FUNGUA HUDUMA</Link></div><div className="service-control-banner"><strong>⚙️ CONTROL YA HUDUMA</strong><span>Badilisha hali moja kwa moja hapa chini — si lazima uhariri huduma kwanza.</span></div><div className="service-control-list">{controlRows.map((item: any) => <div className="service-control-row" key={`control-${item.id ?? item.slug}`}><div className="service-control-info"><strong>{item.name}</strong><small>{item.slug} · {item.isLocked ? "🔒 IMEFUNGWA" : "🟢 IMEFUNGULIWA"} · {item.isFree ? "BURE" : `${item.tokenCost ?? 0} TOKENI`} · {item.active === false ? "IMEZIMWA" : "ACTIVE"}</small></div><div className="service-control-actions"><button type="button" disabled={busy} className={item.isLocked ? "admin-unlock" : "admin-lock"} onClick={() => setServiceAvailability(item, !item.isLocked)}>{item.isLocked ? "🔓 FUNGUA" : "🔒 FUNGIA"}</button><TokenCostControl item={item} adminId={adminId} busy={busy} onRun={onRun} />{String(item.slug ?? item.id) === "kitambulisho-wakala" && <Link href="/admin/agentIdPricing" className="admin-secondary">PANGA BEI <ChevronRight size={15}/></Link>}<button type="button" disabled={busy} onClick={() => setServiceBilling(item, !item.isFree)}>{item.isFree ? "💳 WEKA TOKENI" : "🆓 WEKA BURE"}</button><button type="button" disabled={busy} onClick={() => onRun(() => adminSaveService(adminId, { ...item, active: item.active === false ? true : false }, item.slug ?? item.id), item.active === false ? "Huduma imewezeshwa." : "Huduma imezimwa.")}>{item.active === false ? "▶️ WEZESHA" : "⏸ ZIMA"}</button></div></div>)}</div><div className={controlOnly ? "form-grid service-control-editor-hidden" : "form-grid"}><Field label="Jina la huduma" value={service.name} onChange={(value) => setService({ ...service, name: value })} /><Field label="Slug / ID" value={service.slug} placeholder="pata-lipa-namba" onChange={(value) => setService({ ...service, slug: value.toLowerCase().replace(/\s+/g, "-") })} /><Field label="Icon key" value={service.icon} onChange={(value) => setService({ ...service, icon: value })} /><Field label="Category" value={service.category} onChange={(value) => setService({ ...service, category: value })} /><Field label="Token cost" type="number" value={service.tokenCost} onChange={(value) => setService({ ...service, tokenCost: Number(value), isFree: Number(value) <= 0 })} /><Field label="Reward (taarifa tu)" type="number" value={service.reward ?? 0} onChange={(value) => setService({ ...service, reward: Number(value) })} /><Field label="Order" type="number" value={service.order ?? 0} onChange={(value) => setService({ ...service, order: Number(value) })} /><Field label="Button text" value={service.buttonText ?? ""} onChange={(value) => setService({ ...service, buttonText: value })} /><Field label="Action URL (hiari)" value={service.actionUrl ?? ""} onChange={(value) => setService({ ...service, actionUrl: value })} /><Field label="Ujumbe wa maboresho" value={service.maintenanceMessage ?? ""} onChange={(value) => setService({ ...service, maintenanceMessage: value })} /></div><label className="control-field"><span>Description</span><textarea value={service.description} onChange={(event) => setService({ ...service, description: event.target.value })} /></label><label className="control-field"><span>Instructions</span><textarea value={service.instructions ?? ""} onChange={(event) => setService({ ...service, instructions: event.target.value })} /></label><label className="control-field"><span>Status options (comma-separated)</span><input value={(service.statusOptions ?? []).join(", ")} onChange={(event) => setService({ ...service, statusOptions: event.target.value.split(",").map((status) => status.trim()).filter(Boolean) })} /></label><div className="check-grid"><label><input type="checkbox" checked={service.isFree} onChange={(event) => setService({ ...service, isFree: event.target.checked, tokenCost: event.target.checked ? 0 : Math.max(1, Number(service.tokenCost)) })} /> Bure / hakuna tokeni</label><label><input type="checkbox" checked={service.active !== false} onChange={(event) => setService({ ...service, active: event.target.checked })} /> ACTIVE</label><label><input type="checkbox" checked={service.isVisible !== false} onChange={(event) => setService({ ...service, isVisible: event.target.checked })} /> Visible kwa users</label><label><input type="checkbox" checked={service.adminWorkflow !== false} onChange={(event) => setService({ ...service, adminWorkflow: event.target.checked })} /> Admin workflow</label></div><section className="lipa-admin-field-editor"><div className="admin-card-heading"><div><h3>Fields za fomu</h3><small>Aina: {serviceFieldTypes.join(", ")}</small></div><button type="button" onClick={addField}><Plus size={15} /> Ongeza field</button></div>{(service.fields ?? []).map((field: ServiceFormField, index: number) => <div className="lipa-admin-field" key={`${field.fieldName}-${index}`}><Field label="fieldName" value={field.fieldName} onChange={(value) => updateField(index, { fieldName: value.replace(/[^A-Za-z0-9_]/g, "") })} /><Field label="Label" value={field.label} onChange={(value) => updateField(index, { label: value })} /><label className="control-field"><span>Type</span><select value={field.type} onChange={(event) => updateField(index, { type: event.target.value as ServiceFormField["type"] })}>{serviceFieldTypes.map((type) => <option key={type}>{type}</option>)}</select></label><Field label="Placeholder" value={field.placeholder ?? ""} onChange={(value) => updateField(index, { placeholder: value })} /><Field label="Help text" value={field.helpText ?? ""} onChange={(value) => updateField(index, { helpText: value })} /><label className="control-field"><span>Options (dropdown, koma)</span><input value={(field.options ?? []).join(", ")} onChange={(event) => updateField(index, { options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label><Field label="Validation regex" value={field.validation ?? ""} onChange={(value) => updateField(index, { validation: value })} /><label><input type="checkbox" checked={field.required === true} onChange={(event) => updateField(index, { required: event.target.checked })} /> Required</label><button type="button" className="admin-danger" onClick={() => setService({ ...service, fields: service.fields.filter((_: ServiceFormField, i: number) => i !== index) })}>Ondoa field</button></div>)}</section><div className="form-actions"><button className="admin-primary" disabled={busy || !String(service.name).trim() || !String(service.slug).trim()} onClick={saveService}>Hifadhi huduma</button><button disabled={busy} onClick={reset}>Anza huduma mpya</button>{isSuper && <button disabled={busy} onClick={() => onRun(() => seedServiceCatalog(), "Huduma za mwanzo zimeongezwa bila kubadilisha zilizopo.")}>Anzisha / ongeza huduma za mwanzo</button>}</div><div className="admin-list">{rows.map((item: any) => <div className="admin-list-row" key={item.id ?? item.slug}><div><strong>{item.name}</strong><small>{item.slug} · {item.category} · {item.active === false ? "DISABLED" : "ACTIVE"} · {item.isFree ? "Bure" : `${item.tokenCost} tokeni`} · Order {item.order ?? 0}{item.isVisible === false ? " · Imefichwa" : ""}</small></div><div className="table-actions"><button disabled={busy} onClick={() => { setService({ ...emptyService, ...item, id: item.id ?? item.slug }); onEdit?.(); }}>Hariri</button><button disabled={busy} className={item.isLocked ? "admin-unlock" : "admin-lock"} onClick={() => toggleLock(item)}>{item.isLocked ? "Fungua" : "Fungia"}</button><button disabled={busy} className="admin-danger" onClick={() => onRun(() => adminDeleteCollectionItem(adminId, "services", item.id ?? item.slug), "Huduma imefutwa.")}><Trash2 size={14} /></button></div></div>)}{!rows.length && <Empty text="Bado hakuna huduma kwenye Firestore. Bonyeza ‘Anzisha / ongeza huduma za mwanzo’ ili kuingiza katalogi ya sasa na PATA LIPA NAMBA." />}</div></section>;
}

function AgentIdPricingPanel({ services, adminId, busy, onRun }: any) {
  const rows = mergeServiceCatalogDefaults(services as any[], false)
    .filter((item: any) => item.category === "Bei za Kitambulisho cha Wakala")
    .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  return <section className="admin-card">
    <div className="admin-card-heading"><div><span className="admin-kicker">KITAMBULISHO CHA WAKALA · BEI</span><h2>Panga bei kwa kila mtandao</h2><p>Badilisha bei ya tokeni ya kila mtandao kivyake. Mabadiliko yanatumika kwa kitambulisho cha mtandao husika.</p></div><span className="admin-count">{rows.length}/5</span></div>
    <Link href="/admin/services" className="admin-secondary" style={{display:"inline-flex",marginBottom:16}}>← Rudi kwenye Huduma</Link>
    <div className="service-control-list">{rows.map((item: any) => <div className="service-control-row" key={item.slug}><div className="service-control-info"><strong>{item.name}</strong><small>{item.slug} · Bei ya sasa: {item.tokenCost ?? 5} tokeni</small></div><TokenCostControl item={item} adminId={adminId} busy={busy} onRun={onRun}/></div>)}</div>
    {rows.length !== 5 && <p style={{color:"#b45309",fontSize:13}}>Baadhi ya mitandao haijaonekana kwenye katalogi.</p>}
  </section>;
}

function CollectionPanel({ title, collectionName, rows, form, setForm, fields, onRun, adminId, readOnly = false }: any) { return <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">FIRESTORE CMS</span><h2>{title}</h2></div></div>{!readOnly && <><div className="form-grid">{fields.map(([key, label]: string[]) => <Field key={key} label={label} value={form[key] ?? ""} onChange={(value) => setForm({ ...form, [key]: key === "order" ? Number(value) : value })} />)}</div><div className="check-grid"><label><input type="checkbox" checked={form.enabled !== false} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> Imewezeshwa</label></div><button className="admin-primary" onClick={() => onRun(() => adminSaveCollectionItem(adminId, collectionName, { ...form, id: undefined }, form.id || undefined), "Imehifadhiwa.")}>Hifadhi</button></>}{<div className="admin-list">{rows.map((item: any) => <div className="admin-list-row" key={item.id}><div><strong>{item.title ?? item.name ?? "Bila kichwa"}</strong><small>{item.body ?? item.videoUrl ?? item.status ?? ""}</small></div>{!readOnly && <div className="table-actions"><button onClick={() => setForm({ ...form, ...item })}>Hariri</button><button onClick={() => onRun(() => adminDeleteCollectionItem(adminId, collectionName, item.id), "Imefutwa.")}><Trash2 size={14} /></button></div>}</div>)}{!rows.length && <Empty />}</div>}</section>; }
function TemplateEditorPanel({ values, setValues, onRun, adminId }: any) {
  const defaults = {
    sticker: { nameX: 50, nameY: 72, nameSize: 3.4, numberX: 50, numberY: 82, numberSize: 3.1 },
    verifyTin: { tinTopX: 200, tinTopY: 100, tinTopSize: 22, nameX: 200, nameY: 150, nameSize: 22, tinBottomX: 200, tinBottomY: 200, tinBottomSize: 22 },
    tin: { taxpayer: 480, taxpayerY: 620, taxpayerSize: 23, tinX: 506, tinY: 760, tinSize: 25, effectX: 390, effectY: 835, locationX: 390, locationY: 875, officeX: 390, officeY: 915, physicalX: 390, physicalY: 955, streetX: 390, streetY: 995, commissionerX: 795, commissionerY: 1110 },
    license: { nameX: 35.1, nameY: 35.0, nameSize: 14, numberX: 50, numberY: 19.6, numberSize: 18, officeX: 35.1, officeY: 28.5, officeSize: 14, tinX: 35.1, tinY: 31.6, tinSize: 14, businessX: 35.1, businessY: 38.4, businessSize: 14, typeX: 35.1, typeY: 41.8, typeSize: 14, issueX: 35.1, issueY: 45.0, issueSize: 14, expiryX: 35.1, expiryY: 48.35, expirySize: 14, branchX: 35.1, branchY: 51.6, branchSize: 14, regionX: 35.1, regionY: 58.6, regionSize: 14, wardX: 35.1, wardY: 61.65, wardSize: 14, streetX: 35.1, streetY: 65.45, streetSize: 14, amountX: 35.1, amountY: 70.9, amountSize: 14, qrX: 69.17, qrY: 58.46, qrSize: 150 },
    airtelSme: { ...AIRTEL_SME_LAYOUT_DEFAULTS },
  };
  const current = {
    ...defaults,
    ...(values.templateLayouts ?? {}),
    airtelSme: normalizeAirtelSmeLayout(values.templateLayouts?.airtelSme),
  };
  const set = (service: string, key: string, value: number) => setValues({ ...values, templateLayouts: { ...current, [service]: { ...current[service as keyof typeof current], [key]: value } } });
  const groups = [
    ["sticker", "Stika za Mawakala", [["nameX","Jina X",0,100],["nameY","Jina Y",0,100],["nameSize","Jina size",1,10],["numberX","Namba X",0,100],["numberY","Namba Y",0,100],["numberSize","Namba size",1,10]]],
    ["verifyTin", "VERIFY TIN", [["tinTopX","TIN ya juu X",0,900],["tinTopY","TIN ya juu Y",0,1300],["tinTopSize","TIN ya juu size",8,80],["nameX","Jina X",0,900],["nameY","Jina Y",0,1300],["nameSize","Jina size",8,80],["tinBottomX","TIN ya chini X",0,900],["tinBottomY","TIN ya chini Y",0,1300],["tinBottomSize","TIN ya chini size",8,80]]],
    ["license", "Leseni ya Biashara", [["numberX","B.L No X",0,100],["numberY","B.L No Y",0,100],["numberSize","B.L No size",4,50],["officeX","Office X",0,100],["officeY","Office Y",0,100],["officeSize","Office size",4,50],["tinX","TIN X",0,100],["tinY","TIN Y",0,100],["tinSize","TIN size",4,50],["nameX","Jina X",0,100],["nameY","Jina Y",0,100],["nameSize","Jina size",4,50],["businessX","Biashara X",0,100],["businessY","Biashara Y",0,100],["businessSize","Biashara size",4,50],["typeX","Aina X",0,100],["typeY","Aina Y",0,100],["typeSize","Aina size",4,50],["issueX","Issue X",0,100],["issueY","Issue Y",0,100],["issueSize","Issue size",4,50],["expiryX","Expiry X",0,100],["expiryY","Expiry Y",0,100],["expirySize","Expiry size",4,50],["branchX","Branch X",0,100],["branchY","Branch Y",0,100],["branchSize","Branch size",4,50],["regionX","Mkoa X",0,100],["regionY","Mkoa Y",0,100],["regionSize","Mkoa size",4,50],["wardX","Kata X",0,100],["wardY","Kata Y",0,100],["wardSize","Kata size",4,50],["streetX","Mtaa X",0,100],["streetY","Mtaa Y",0,100],["streetSize","Mtaa size",4,50],["amountX","Ada X",0,100],["amountY","Ada Y",0,100],["amountSize","Ada size",4,50],["qrX","QR X",0,100],["qrY","QR Y",0,100],["qrSize","QR size",30,500]]],
    ["airtelSme", "SME Airtel Mkataba", [["nameX","Jina X",0,100],["nameY","Jina Y",0,100],["nameSize","Jina size",1,10],["phoneX","Simu X",0,100],["phoneY","Simu Y",0,100],["phoneSize","Simu size",1,10],["tinX","TIN X",0,100],["tinY","TIN Y",0,100],["tinSize","TIN size",1,10],["idTypeX","ID type X",0,100],["idTypeY","ID type Y",0,100],["idTypeSize","ID type size",1,10],["idX","ID X",0,100],["idY","ID Y",0,100],["idSize","ID size",1,10],["streetX","Mtaa X",0,100],["streetY","Mtaa Y",0,100],["streetSize","Mtaa size",1,10],["wardX","Kata X",0,100],["wardY","Kata Y",0,100],["wardSize","Kata size",1,10],["districtX","Wilaya X",0,100],["districtY","Wilaya Y",0,100],["districtSize","Wilaya size",1,10],["regionX","Mkoa X",0,100],["regionY","Mkoa Y",0,100],["regionSize","Mkoa size",1,10],["emailX","Email X",0,100],["emailY","Email Y",0,100],["emailSize","Email size",1,10],["normalX","Checkbox X",0,100],["normalY","Checkbox Y",0,100],["normalSize","Checkbox size",1,10],["deviceX","Device X",0,100],["deviceY","Device Y",0,100],["deviceSize","Device size",1,10],["customerX","Customer X",0,100],["customerY","Customer Y",0,100],["customerSize","Customer size",1,10],["sign1X","Signature 1 X",0,100],["sign1Y","Signature 1 Y",0,100],["sign1Size","Signature 1 size",1,10],["date1X","Date 1 X",0,100],["date1Y","Date 1 Y",0,100],["date1Size","Date 1 size",1,10],["salesX","Sales X",0,100],["salesY","Sales Y",0,100],["salesSize","Sales size",1,10],["sign2X","Signature 2 X",0,100],["sign2Y","Signature 2 Y",0,100],["sign2Size","Signature 2 size",1,10],["date2X","Date 2 X",0,100],["date2Y","Date 2 Y",0,100],["date2Size","Date 2 size",1,10]]],
  ] as const;
  return <section className="admin-card">
    <div className="admin-card-heading"><div><span className="admin-kicker">TEMPLATE CONTROL</span><h2>Template & Live Preview Editor</h2></div><Palette size={19}/></div>
    <p className="admin-ordering-help">Badilisha X/Y na ukubwa wa maandishi wa kila huduma yenye Live Preview. Mabadiliko yanahifadhiwa kwenye site settings na yanaweza kutumiwa na preview bila kubadili source code.</p>
    {groups.map(([id,title,fields]) => <div key={id} className="admin-subheading"><h3>{title}</h3><span>{id}</span><div className="layout-control-grid" style={{width:"100%"}}>{fields.map(([key,label,min,max]) => <NumberControl key={key} label={label} value={Number((current as any)[id]?.[key] ?? (defaults as any)[id][key])} min={min} max={max} onChange={(v)=>set(id,key,v)} />)}</div></div>)}
    <div className="form-actions"><button type="button" className="admin-secondary" onClick={()=>setValues({...values,templateLayouts:defaults})}>Rudisha defaults</button><button className="admin-primary" onClick={()=>onRun(()=>adminSaveSiteSettings(adminId,{...values,templateLayouts:current}),"Template settings zimehifadhiwa.")}>Hifadhi template settings</button></div>
  </section>;
}

function CmsPanel({ values, setValues, onRun, adminId }: any) {
  const updateLayout = (key: string, value: string | number | boolean) => setValues({ ...values, [key]: value });
  const resetLayout = () => setValues({
    ...values, homeColumns: 4, homeTabletColumns: 2, homeMobileColumns: 1, sectionGap: 34,
    cardGap: 12, cardRadius: 14, cardPadding: 15, heroRadius: 18, heroPadding: 35, contentMaxWidth: 1420,
    showMetrics: true, showHero: true, compactCards: false,
  });
  return <section className="admin-card">
    <div className="admin-card-heading"><div><span className="admin-kicker">PUBLIC SETTINGS · SUPER CONTROL</span><h2>Muonekano, CMS & Layout</h2></div><Palette size={19} /></div>
    <p className="admin-ordering-help">Hapa Super Admin anaweza kubadilisha maandishi, rangi na ukubwa wa vipengele vya homepage bila kugusa code. Namba zote ni pixel isipokuwa columns.</p>
    <div className="admin-subheading"><h3>Maudhui</h3><span>Content</span></div>
    <div className="form-grid">{[["systemName","Jina la mfumo"],["eyebrow","Maneno ya juu"],["headline","Kichwa kikuu"],["searchPlaceholder","Ujumbe wa search"],["whatsapp","WhatsApp bila +"],["owner","Jina la mmiliki"],["primaryColor","Rangi kuu"],["accentColor","Rangi ya accent"]].map(([key,label]) => <Field key={key} label={label} value={values[key] ?? ""} onChange={(value)=>setValues({...values,[key]:value})} />)}</div>
    <label className="control-field"><span>Maelezo</span><textarea value={values.description ?? ""} onChange={(event)=>setValues({...values,description:event.target.value})}/></label>
    <label className="control-field"><span>Footer</span><textarea value={values.footer ?? ""} onChange={(event)=>setValues({...values,footer:event.target.value})}/></label>
    <div className="admin-subheading"><h3>Mpangilio wa Homepage</h3><span>Layout editor</span></div>
    <div className="layout-control-grid">
      <NumberControl label="Columns — desktop" value={values.homeColumns ?? 4} min={1} max={6} onChange={(v)=>updateLayout("homeColumns",v)} />
      <NumberControl label="Columns — tablet" value={values.homeTabletColumns ?? 2} min={1} max={4} onChange={(v)=>updateLayout("homeTabletColumns",v)} />
      <NumberControl label="Columns — mobile" value={values.homeMobileColumns ?? 1} min={1} max={2} onChange={(v)=>updateLayout("homeMobileColumns",v)} />
      <NumberControl label="Nafasi kati ya sections" value={values.sectionGap ?? 34} min={8} max={100} onChange={(v)=>updateLayout("sectionGap",v)} />
      <NumberControl label="Nafasi kati ya cards" value={values.cardGap ?? 12} min={4} max={50} onChange={(v)=>updateLayout("cardGap",v)} />
      <NumberControl label="Mviringo wa cards" value={values.cardRadius ?? 14} min={0} max={40} onChange={(v)=>updateLayout("cardRadius",v)} />
      <NumberControl label="Padding ya card" value={values.cardPadding ?? 15} min={6} max={40} onChange={(v)=>updateLayout("cardPadding",v)} />
      <NumberControl label="Upana wa content" value={values.contentMaxWidth ?? 1420} min={900} max={1800} onChange={(v)=>updateLayout("contentMaxWidth",v)} />
      <NumberControl label="Padding ya Hero" value={values.heroPadding ?? 35} min={12} max={70} onChange={(v)=>updateLayout("heroPadding",v)} />
      <NumberControl label="Mviringo wa Hero" value={values.heroRadius ?? 18} min={0} max={50} onChange={(v)=>updateLayout("heroRadius",v)} />
    </div>
    <div className="check-grid layout-toggles">
      <label><input type="checkbox" checked={values.showHero !== false} onChange={(e)=>updateLayout("showHero",e.target.checked)} /> Onyesha Hero</label>
      <label><input type="checkbox" checked={values.showMetrics !== false} onChange={(e)=>updateLayout("showMetrics",e.target.checked)} /> Onyesha Metrics</label>
      <label><input type="checkbox" checked={values.compactCards === true} onChange={(e)=>updateLayout("compactCards",e.target.checked)} /> Cards compact</label>
    </div>
    <div className="layout-preview-strip"><div className="layout-preview-dots" style={{gridTemplateColumns:`repeat(${values.homeColumns ?? 4},1fr)`}}>{Array.from({length:Math.min(Number(values.homeColumns ?? 4)*2,12)}).map((_,i)=><i key={i}/>)}</div><span>Preview ya columns za desktop</span></div>
    <div className="form-actions"><button type="button" className="admin-secondary" onClick={resetLayout}>Rudisha default</button><button className="admin-primary" onClick={()=>onRun(()=>adminSaveSiteSettings(adminId, values), "Muonekano na layout zimehifadhiwa.")}>Hifadhi mabadiliko</button></div>
  </section>;
}
function NumberControl({ label, value, min, max, onChange }: { label:string; value:number; min:number; max:number; onChange:(value:number)=>void }) {
  return <label className="layout-number-control"><span>{label}</span><div><input type="number" min={min} max={max} value={value} onChange={(e)=>onChange(Math.max(min,Math.min(max,Number(e.target.value)||min)))} /><small>px / units</small></div></label>;
}

function MessagesPanel({ users, form, setForm, onRun, adminId }: any) {
  const broadcast = !form.recipientId;
  return <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">MESSAGING</span><h2>Tuma ujumbe wa akaunti</h2><p>Ujumbe utahifadhiwa kwenye “Ujumbe na taarifa” za watumiaji. Push notifications zimezimwa kwa sasa ili kupunguza matumizi.</p></div></div><div className="form-grid"><Field label="Kichwa cha ujumbe" value={form.subject} onChange={(value) => setForm({ ...form, subject: value })} /><label className="control-field"><span>Wapokeaji</span><select value={form.recipientId} onChange={(event) => setForm({ ...form, recipientId: event.target.value })}><option value="">Watumiaji wote</option>{users.map((item: any) => <option key={item.id} value={item.id}>{item.name ?? "Bila jina"} — {item.phone || "—"}</option>)}</select></label></div><label className="control-field"><span>Ujumbe</span><textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label><button className="admin-primary" disabled={!String(form.subject ?? "").trim() || !String(form.body ?? "").trim()} onClick={() => onRun(() => adminSaveCollectionItem(adminId, "messages", { ...form, broadcast, sentAt: new Date().toISOString() }), broadcast ? "Ujumbe umehifadhiwa kwa watumiaji wote; push zimezimwa." : "Ujumbe umehifadhiwa kwa mtumiaji; push zimezimwa.")}>{broadcast ? "Hifadhi ujumbe kwa wote" : "Hifadhi ujumbe"}</button></section>;
}
function SecurityPanel({ isSuper, users, audit, collectionName, onCollectionChange, hasMore, loadingMore, onLoadMore }: any) {
  return <div className="admin-two-col">
    <section className="admin-security-card"><ShieldCheck size={25} /><h2>{isSuper ? "Eneo la siri" : "Usalama wa admin"}</h2><p>{isSuper ? "Una access ya super_admin. Admin management, settings na audit logs zinapatikana." : "Admin wa kawaida hawezi kubadilisha super_admin au system security settings."}</p><div className="security-checks"><span>✓ Firebase Auth</span><span>✓ Role-based access</span><span>✓ Firestore Rules</span><span>✓ No passwords in Firestore</span></div></section>
    <section className="admin-card">
      <h2>Audit summary</h2>
      <p>Users: {users.length} · Admins: {users.filter((item: any) => ["admin", "super_admin"].includes(item.role)).length}</p>
      <label className="control-field"><span>Chanzo cha audit</span><select value={collectionName} onChange={(event) => void onCollectionChange(event.target.value)}><option value="adminActions">Admin actions</option><option value="auditLogs">Audit logs</option></select></label>
      <p>{collectionName}: {audit.length} loaded</p>
      <small>Matukio yenye tarehe huonyeshwa mapya kwanza; rekodi zisizo na createdAt hupatikana pia kupitia kurasa za legacy kwa ID.</small>
      <div className="admin-table-wrap" style={{marginTop:12}}><table className="admin-table"><thead><tr><th>Tarehe</th><th>Kitendo</th><th>Actor</th><th>Target</th></tr></thead><tbody>{audit.map((item: any) => <tr key={item.id}><td>{item.createdAt?.toDate?.().toLocaleString?.() ?? dateText(item.createdAt)}</td><td>{String(item.action ?? "—")}</td><td>{String(item.actorId ?? "—")}</td><td>{String(item.targetId ?? item.targetUserId ?? "—")}</td></tr>)}</tbody></table>{!audit.length && <Empty text="Hakuna matukio ya audit kwenye ukurasa huu."/>}</div>
      {hasMore && <button type="button" className="admin-secondary" style={{marginTop:12}} onClick={() => void onLoadMore()} disabled={loadingMore}>{loadingMore ? "Inapakia..." : "Pakia matukio 100 ya zamani zaidi"}</button>}
      <small style={{display:"block",marginTop:12}}>Kwa custom claims, tumia Firebase Admin SDK katika mazingira ya privileged; frontend haiwezi kujipa role.</small>
    </section>
  </div>;
}
function exportTransactionsCsv(rows: any[]) {
  if (!rows.length) { toast.error("Hakuna miamala ya kuripoti."); return; }
  const columns: Array<[string, (item: any) => unknown]> = [
    ["Reference", (item) => item.reference ?? item.id],
    ["User ID", (item) => item.userId],
    ["Maelezo", (item) => item.serviceName ?? item.description ?? ""],
    ["Aina", (item) => item.type ?? (Number(item.amount) < 0 ? "DEBIT" : "CREDIT")],
    ["Kiasi", (item) => item.amount],
    ["Balance kabla", (item) => item.previousBalance],
    ["Balance baada", (item) => item.newBalance ?? item.balanceAfter],
    ["Tarehe", (item) => dateText(item.createdAt)],
  ];
  const escapeCell = (value: unknown) => '"' + String(value ?? "").replaceAll('"', '""') + '"' ;
  const csv = "\uFEFF" + [columns.map(([label]) => escapeCell(label)).join(","), ...rows.map((item) => columns.map(([, read]) => escapeCell(read(item))).join(","))].join("\r\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `steward-tz-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  toast.success("Ripoti ya CSV imeandaliwa.");
}

function TransactionTable({ rows }: { rows: any[] }) { return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>REFERENCE</th><th>MTUMIAJI</th><th>MAELEZO</th><th>AINA</th><th>KIASI</th><th>BALANCE</th><th>TAREHE</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><code>{item.reference ?? item.id}</code></td><td>{item.userId}</td><td>{item.serviceName ?? item.description ?? "—"}</td><td><span className="pill">{item.type ?? (Number(item.amount) < 0 ? "DEBIT" : "CREDIT")}</span></td><td className={Number(item.amount) < 0 ? "amount-negative" : "amount-positive"}>{item.amount}</td><td>{item.previousBalance ?? "—"} → {item.newBalance ?? item.balanceAfter ?? "—"}</td><td>{dateText(item.createdAt)}</td></tr>)}</tbody></table>{!rows.length && <Empty />}</div>; }
function UserModal({ person, onClose }: { person: any; onClose: () => void }) {
  const mode = resolveAccountAccessMode(person);
  const modeLabels: Record<AccountAccessMode, string> = { active: "Ruhusiwa kikamilifu", read_only: "Soma tu", limited: "Vitendo maalum", denied: "Amezuiwa kabisa" };
  const actions = Array.isArray(person.allowedActions) ? person.allowedActions.filter((action: unknown): action is AccountRestrictionAction => accountRestrictionActions.includes(action as AccountRestrictionAction)).map((action: AccountRestrictionAction) => accountRestrictionActionLabels[action]).join(", ") : "—";
  return <div className="admin-modal-backdrop" onClick={onClose}><div className="admin-modal" onClick={(event) => event.stopPropagation()}><button className="admin-modal-close" onClick={onClose}><X size={18} /></button><span className="admin-kicker">USER PROFILE</span><h2>{person.name ?? "Bila jina"}</h2><div className="profile-grid">{[["Phone", person.phone], ["Username", person.username], ["Role", person.role], ["Account status", modeLabels[mode]], ["Sababu ya kizuizi", mode === "active" ? "—" : person.restrictionReason || "Haikuwekwa"], ["Vitendo vilivyoruhusiwa", mode === "limited" ? actions : mode === "active" ? "Vyote" : "Hakuna"], ["Restriction updated", dateText(person.restrictionUpdatedAt)], ["Verification", person.verificationStatus], ["Token balance", person.tokenBalance ?? 0], ["Total received", person.totalTokensReceived ?? 0], ["Total used", person.totalTokensUsed ?? 0], ["Registration", dateText(person.createdAt)], ["Last login", dateText(person.lastLoginAt)]].map(([label, value]) => <div key={String(label)}><small>{String(label)}</small><strong>{String(value ?? "—")}</strong></div>)}</div><p className="privacy-note">Password za users hazihifadhiwi wala hazionyeshwi kwenye dashboard.</p></div></div>;
}

function TokenCostControl({ item, adminId, busy, onRun }: { item:any; adminId:string; busy:boolean; onRun:(work:()=>Promise<unknown>, success:string)=>void }) {
  const [cost, setCost] = useState(String(Math.max(0, Number(item.tokenCost ?? 2))));
  useEffect(() => setCost(String(Math.max(0, Number(item.tokenCost ?? 2)))), [item.slug, item.tokenCost]);
  const save = () => {
    const amount = Number(cost);
    if (!Number.isInteger(amount) || amount < 0 || amount > 100000) { toast.error("Weka idadi ya tokeni kuanzia 0 hadi 100000."); return; }
    onRun(() => adminSaveService(adminId, { ...item, tokenCost: amount, isFree: amount === 0 }, item.slug ?? item.id), amount === 0 ? "Huduma imewekwa bure." : `Gharama ya huduma imehifadhiwa: tokeni ${amount}.`);
  };
  return <div className="service-token-cost-editor"><label><span>Tokeni</span><input aria-label={`Tokeni za ${item.name}`} type="number" min={0} max={100000} step={1} value={cost} onChange={(e)=>setCost(e.target.value)} /></label><button type="button" disabled={busy || !cost.trim() || Number(cost) === Number(item.tokenCost ?? 2) && (Number(cost) === 0) === Boolean(item.isFree)} onClick={save}>HIFADHI BEI</button></div>;
}

function ServiceOrderingPanel({ services, serviceOrder, setServiceOrder, sectionOrder, setSectionOrder, onSave, busy }: { services: any[]; serviceOrder: string[]; setServiceOrder: (value: string[] | ((current: string[]) => string[])) => void; sectionOrder: string[]; setSectionOrder: (value: string[] | ((current: string[]) => string[])) => void; onSave: () => void; busy: boolean }) {
  const serviceMap = new Map<string, { slug: string; name: string; category: string; isVisible: boolean }>();
  for (const item of services) {
    const slug = String(item.slug ?? item.id ?? "").trim();
    if (slug) serviceMap.set(slug, { slug, name: String(item.name ?? slug), category: String(item.category ?? "Huduma kuu"), isVisible: item.isVisible !== false });
  }
  const items = Array.from(serviceMap.values());
  const orderedIds = completeOrder(items.map((item) => item.slug), serviceOrder);
  const orderedServices = orderedIds.map((id) => serviceMap.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const sections = [
    { id: "services", label: "Huduma zote (ikiwemo Leseni ya Biashara)" },
    { id: "locked", label: "Huduma zilizofungwa" },
    { id: "special", label: "Huduma maalum" },
    { id: "tools", label: "Zana za ziada" },
    { id: "tutorials", label: "Video za mafunzo" },
  ];
  const orderedSections = completeOrder(sections.map((item) => item.id), sectionOrder);
  const moveService = (slug: string, change: number) => setServiceOrder((current) => {
    const order = completeOrder(items.map((item) => item.slug), current);
    const index = order.indexOf(slug);
    return index < 0 ? order : moveId(order, slug, index + change);
  });
  const moveSection = (id: string, change: number) => setSectionOrder((current) => {
    const order = completeOrder(sections.map((item) => item.id), current);
    const index = order.indexOf(id);
    return index < 0 ? order : moveId(order, id, index + change);
  });
  const makeBusinessLicenseFirst = () => setServiceOrder((current) => {
    const order = completeOrder(items.map((item) => item.slug), current);
    return order.includes("leseni-biashara") ? moveId(order, "leseni-biashara", 0) : order;
  });

  return <div className="admin-ordering">
    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="admin-kicker">SUPER ADMIN · MPANGILIO WA UMMA</span><h2>Panga huduma zinavyoonekana</h2></div><span className="admin-count">{orderedServices.length}</span></div>
      <p className="admin-ordering-help">Mpangilio huu unaonekana kwa wageni na watumiaji wote. Tumia mishale kupanga kadi; nafasi ya juu zaidi itaonekana kwanza ndani ya kundi la huduma yake.</p>
      <button type="button" className="admin-secondary" onClick={makeBusinessLicenseFirst} disabled={!serviceMap.has("leseni-biashara")}>Weka Leseni ya Biashara kwanza</button>
      <div className="admin-order-list">{orderedServices.map((item, index) => <div className="admin-order-row" key={item.slug}>
        <span className="admin-order-rank">{index + 1}</span><div className="admin-order-copy"><strong>{item.name}</strong><small>{item.category}{item.isVisible ? "" : " · Imefichwa kwa sasa"}</small></div>
        <div className="admin-order-actions"><button type="button" aria-label={`Peleka ${item.name} juu`} title="Peleka juu" disabled={busy || index === 0} onClick={() => moveService(item.slug, -1)}><ArrowUp size={16} /></button><button type="button" aria-label={`Peleka ${item.name} chini`} title="Peleka chini" disabled={busy || index === orderedServices.length - 1} onClick={() => moveService(item.slug, 1)}><ArrowDown size={16} /></button></div>
      </div>)}</div>
    </section>
    <section className="admin-card">
      <div className="admin-card-heading"><div><span className="admin-kicker">MPANGILIO WA UKURASA</span><h2>Panga makundi ya ukurasa wa mwanzo</h2></div></div>
      <p className="admin-ordering-help">Badilisha pia mpangilio wa sehemu nzima chini ya kichwa na kadi ya salio la tokeni.</p>
      <div className="admin-order-list">{orderedSections.map((id, index) => {
        const item = sections.find((section) => section.id === id)!;
        return <div className="admin-order-row" key={id}><span className="admin-order-rank">{index + 1}</span><div className="admin-order-copy"><strong>{item.label}</strong></div><div className="admin-order-actions"><button type="button" aria-label={`Peleka ${item.label} juu`} title="Peleka juu" disabled={busy || index === 0} onClick={() => moveSection(id, -1)}><ArrowUp size={16} /></button><button type="button" aria-label={`Peleka ${item.label} chini`} title="Peleka chini" disabled={busy || index === orderedSections.length - 1} onClick={() => moveSection(id, 1)}><ArrowDown size={16} /></button></div></div>;
      })}</div>
      <div className="form-actions"><button type="button" className="admin-primary" disabled={busy} onClick={onSave}>{busy ? "Inahifadhi..." : "Hifadhi mpangilio"}</button></div>
      <p className="admin-ordering-help">Mabadiliko huhifadhiwa salama na yanawekwa kwa watumiaji wote baada ya kubonyeza Hifadhi.</p>
    </section>
  </div>;
}


function AgentRecordsPanel({ rows, onRefresh, loading }: { rows: any[]; onRefresh: () => void; loading: boolean }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const filtered = rows.filter((row) => [row.agentId, row.name, row.phone, row.network, row.type, row.region, row.district, row.area, row.userId].some((value) => String(value ?? "").toLowerCase().includes(search.toLowerCase())));
  return <section className="admin-card">
    <div className="admin-card-heading"><div><span className="admin-kicker">FIRESTORE · AGENT RECORDS</span><h2>Usajili wa Mawakala</h2><p style={{margin:"5px 0 0",color:"var(--muted,#64748b)"}}>Taarifa za kitambulisho huhifadhiwa moja kwa moja wakati wa kuandaa kitambulisho.</p></div><button className="button button--green button--small" onClick={() => void onRefresh()} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""}/> Sasisha</button></div>
    <div className="admin-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tafuta Agent ID, jina, simu, mkoa, mtandao..." /></div>
    <div className="admin-stat-grid" style={{marginBottom:16}}><div className="admin-stat-card"><span>Mawakala wote</span><strong>{rows.length}</strong></div><div className="admin-stat-card"><span>Mikoa tofauti</span><strong>{new Set(rows.map((row) => row.region).filter(Boolean)).size}</strong></div><div className="admin-stat-card"><span>Mitandao tofauti</span><strong>{new Set(rows.map((row) => row.network).filter(Boolean)).size}</strong></div></div>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>AGENT ID</th><th>JINA / SIMU</th><th>MTANDAO / AINA</th><th>MKOA / WILAYA / KATA</th><th>TAREHE</th><th>TAARIFA</th></tr></thead><tbody>
      {filtered.map((row) => <tr key={row.id}><td><strong>{row.agentId || "—"}</strong><small style={{display:"block"}}>{row.status || "created"}</small></td><td><strong>{row.name || "—"}</strong><small style={{display:"block"}}>{row.phone || "—"}</small></td><td>{row.network || "—"}<small style={{display:"block"}}>{row.type || "—"}</small></td><td>{row.region || "—"}<small style={{display:"block"}}>{row.district || "—"} · {row.area || "—"}</small></td><td>{dateText(row.createdAt)}<small style={{display:"block"}}>Huisha: {row.expiryDate || "—"}</small></td><td><button type="button" className="button button--small" onClick={() => setSelected(row)}>Fungua</button></td></tr>)}
    </tbody></table>{!filtered.length && <Empty text={rows.length ? "Hakuna wakala anayelingana na utafutaji." : "Bado hakuna taarifa za wakala zilizohifadhiwa."}/>}</div>
    {selected && <div className="admin-modal-backdrop" onClick={() => setSelected(null)}><div className="admin-modal" onClick={(event) => event.stopPropagation()}><button className="admin-modal-close" onClick={() => setSelected(null)}><X size={18}/></button><span className="admin-kicker">TAARIFA KAMILI ZA WAKALA</span><h2>{selected.agentId}</h2><div className="form-grid">{[["Jina kamili",selected.name],["Simu",selected.phone],["Mtandao",selected.network],["Aina ya wakala",selected.type],["Mkoa",selected.region],["Msimbo wa mkoa",selected.regionCode],["Wilaya",selected.district],["Kata / Eneo",selected.area],["Tarehe ya kutolewa",selected.issueDate],["Tarehe ya kuisha",selected.expiryDate],["User ID",selected.userId],["Hali",selected.status],["Tarehe ya usajili",dateText(selected.createdAt)],["Imesasishwa",dateText(selected.updatedAt)]].map(([label,value]) => <div key={label} className="control-field"><span>{label}</span><strong style={{overflowWrap:"anywhere"}}>{String(value || "—")}</strong></div>)}</div><h3 style={{marginTop:20}}>Historia ya mabadiliko</h3>{Array.isArray(selected.history) && selected.history.length ? <ul>{selected.history.map((entry: any,index: number) => <li key={index}>{entry.action || "Mabadiliko"} · {entry.details || ""} · {entry.at || ""} · {entry.by || ""}</li>)}</ul> : <p>Hakuna historia ya ziada iliyohifadhiwa.</p>}<p style={{fontSize:12,color:"var(--muted,#64748b)"}}>Rekodi hii ni ya usimamizi wa ndani. Taarifa binafsi zionekane kwa watumishi walioidhinishwa pekee.</p></div></div>}
  </section>;
}
