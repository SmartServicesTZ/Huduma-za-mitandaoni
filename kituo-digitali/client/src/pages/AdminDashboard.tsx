import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowDown, ArrowUp, BarChart3, Bell, Boxes, ChevronRight, ClipboardList, FileKey2, LayoutDashboard, LogOut, Menu, MessageSquare, Palette, PlaySquare, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Trash2, UserCog, Users, WalletCards, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { adminAdjustTokens, adminDeleteCollectionItem, adminGetSiteSettings, adminListCollection, adminListLipaApplications, adminListServiceApplications, adminListServices, adminListTransactions, adminListUsers, adminSaveCollectionItem, adminSaveService, adminSaveSiteSettings, adminSetServiceLock, adminUpdateUser, seedServiceCatalog, setHomepageServiceOrder, type AdminUserRecord, type LipaApplication, type ServiceApplication } from "@/lib/firebase";
import { completeOrder, defaultHomepageSectionOrder, isServiceLocked, moveId } from "../../../shared/serviceOrdering";
import { serviceFieldTypes, type ServiceFormField } from "../../../shared/serviceForms";
import { LipaApplicationsPanel, LipaNetworkConfigPanel } from "./LipaAdminPanels";
import { ServiceApplicationsPanel } from "./ServiceApplicationsPanel";

type Panel = "overview" | "users" | "tokens" | "services" | "applications" | "lipa" | "ordering" | "videos" | "transactions" | "announcements" | "cms" | "security" | "messages" | "licenses";
const nav: Array<[Panel, string, typeof LayoutDashboard]> = [
  ["overview", "Muhtasari", LayoutDashboard], ["users", "Watumiaji", Users], ["tokens", "Tokeni", WalletCards], ["services", "Huduma", Boxes], ["applications", "Maombi ya huduma", ClipboardList], ["lipa", "Pata Lipa Namba", WalletCards], ["ordering", "Mpangilio wa vipengele", SlidersHorizontal], ["videos", "Video", PlaySquare], ["transactions", "Transactions", BarChart3], ["announcements", "Matangazo", Bell], ["cms", "Muonekano & CMS", Palette], ["security", "Usalama", ShieldCheck], ["messages", "Tuma ujumbe", MessageSquare], ["licenses", "Leseni", FileKey2],
];
const emptyService = { id: "", name: "", slug: "", description: "", icon: "sparkles", tokenCost: 2, reward: 0, isFree: false, isVisible: true, active: true, isLocked: false, category: "Huduma kuu", actionUrl: "", instructions: "", buttonText: "TUMA OMBI", statusOptions: ["PENDING", "PROCESSING", "APPROVED", "REJECTED"], adminWorkflow: true, order: 0, fields: [] as ServiceFormField[] };
const emptyVideo = { id: "", title: "", videoUrl: "", category: "Mafunzo", enabled: true, order: 0 };
const emptyAnnouncement = { id: "", title: "", body: "", enabled: true };
const emptyMessage = { subject: "", body: "", recipientId: "" };

function dateText(value: unknown) { if (!value) return "—"; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("sw-TZ"); }
function safeError(error: any) {
  const code = String(error?.code ?? "").replace(/^functions\//, "");
  if (code === "permission-denied") return "Huna ruhusa ya kufanya kitendo hiki. Hakikisha role au permission husika imepewa.";
  if (code === "failed-precondition") return error?.message || "Kitendo hakiwezi kukamilika katika hali ya sasa.";
  if (["internal", "unavailable", "deadline-exceeded"].includes(code)) return "Firebase imerudisha hitilafu ya muda. Angalia salio kabla ya kujaribu tena; ombi la tokeni linalindwa lisihesabiwe mara mbili.";
  return error?.message || "Imeshindikana kupata au kuhifadhi taarifa. Jaribu tena.";
}
function Field({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string }) { return <label className="control-field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
function Empty({ text = "Hakuna data bado" }: { text?: string }) { return <div className="admin-empty">{text}</div>; }

export default function AdminDashboard() {
  const [location] = useLocation();
  const { user, firebaseUser, loading, logout, isAuthenticated } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");
  const [users, setUsers] = useState<(AdminUserRecord & { id: string })[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [serviceLocks, setServiceLocks] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [tokenPurchaseOrders, setTokenPurchaseOrders] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [lipaApplications, setLipaApplications] = useState<LipaApplication[]>([]);
  const [serviceApplications, setServiceApplications] = useState<ServiceApplication[]>([]);
  const [lipaServices, setLipaServices] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<(AdminUserRecord & { id: string }) | null>(null);
  const [tokenForm, setTokenForm] = useState({ userId: "", amount: 10, reason: "" });
  const [service, setService] = useState(emptyService);
  const [serviceOrder, setServiceOrder] = useState<string[]>([]);
  const [homepageSectionOrder, setHomepageSectionOrder] = useState<string[]>(defaultHomepageSectionOrder);
  const [video, setVideo] = useState(emptyVideo);
  const [announcement, setAnnouncement] = useState(emptyAnnouncement);
  const [message, setMessage] = useState(emptyMessage);
  const [cms, setCms] = useState({ systemName: "HUDUMA ZA MTANDAONI", eyebrow: "HUDUMA ZA MTANDAONI", headline: "Huduma zako, sehemu moja.", description: "", searchPlaceholder: "Tafuta huduma...", whatsapp: "255698232313", owner: "", footer: "", primaryColor: "#18b969", accentColor: "#6ea8fe" });
  const permissions = user?.permissions ?? {};
  const isSuper = user?.role === "super_admin";
  const hasPermission = (permission: string) => isSuper || permissions[permission as keyof typeof permissions] === true;
  const canManage = isAuthenticated && (isSuper || Object.values(permissions).some(Boolean));
  const panel = (location.split("/admin/")[1] || "overview") as Panel;
  const visibleNav = nav.filter(([key]) => key === "overview" || (key === "ordering" ? isSuper : !panelPermission[key] || hasPermission(panelPermission[key]!)));

  const refresh = async () => {
    if (!canManage) return;
    setLoadingData(true);
    setDataError("");
    try {
      const results = await Promise.allSettled([
        hasPermission("viewUsers") ? adminListUsers() : Promise.resolve([]), hasPermission("manageServices") ? adminListServices() : Promise.resolve([]), hasPermission("manageReports") ? adminListTransactions() : Promise.resolve([]), hasPermission("manageTokens") ? adminListCollection("tokenPurchaseOrders") : Promise.resolve([]), hasPermission("manageContent") ? adminListCollection("tutorialVideos") : Promise.resolve([]), hasPermission("manageContent") ? adminListCollection("announcements") : Promise.resolve([]), hasPermission("manageMessages") ? adminListCollection("messages") : Promise.resolve([]), hasPermission("manageLicenses") ? adminListCollection("licenseTemplates") : Promise.resolve([]), hasPermission("viewAuditLogs") ? adminListCollection("adminActions") : Promise.resolve([]), hasPermission("manageSettings") ? adminGetSiteSettings() : Promise.resolve(null), hasPermission("manageServices") ? adminListCollection("serviceLocks") : Promise.resolve([]), hasPermission("manageServices") ? adminListCollection("lipaServices") : Promise.resolve([]), hasPermission("manageLipaApplications") ? adminListLipaApplications() : Promise.resolve([]), hasPermission("manageServices") ? adminListServiceApplications() : Promise.resolve([]),
      ]);
      const [u, s, t, paymentOrders, v, a, m, l, logs, settings, locks, networkConfigs, applications, genericApplications] = results;
      if (u.status === "fulfilled") setUsers(u.value); else setDataError("Watumiaji: " + safeError(u.reason));
      if (s.status === "fulfilled") setServices(s.value); else setDataError((current) => current || "Huduma: " + safeError(s.reason));
      if (t.status === "fulfilled") setTransactions(t.value); else setDataError((current) => current || "Transactions: " + safeError(t.reason));
      if (paymentOrders.status === "fulfilled") setTokenPurchaseOrders(paymentOrders.value); else setDataError((current) => current || "Malipo ya tokeni: " + safeError(paymentOrders.reason));
      if (v.status === "fulfilled") setVideos(v.value); else setDataError((current) => current || "Video: " + safeError(v.reason));
      if (a.status === "fulfilled") setAnnouncements(a.value); else setDataError((current) => current || "Matangazo: " + safeError(a.reason));
      if (m.status === "fulfilled") setMessages(m.value); else setDataError((current) => current || "Ujumbe: " + safeError(m.reason));
      if (l.status === "fulfilled") setLicenses(l.value); else setDataError((current) => current || "Leseni: " + safeError(l.reason));
      if (logs.status === "fulfilled") setAudit(logs.value); else setDataError((current) => current || "Audit: " + safeError(logs.reason));
      if (locks.status === "fulfilled") setServiceLocks(locks.value); else setDataError((current) => current || "Locks za huduma: " + safeError(locks.reason));
      if (networkConfigs.status === "fulfilled") setLipaServices(networkConfigs.value); else setDataError((current) => current || "Mipangilio ya Lipa: " + safeError(networkConfigs.reason));
      if (applications.status === "fulfilled") setLipaApplications(applications.value); else setDataError((current) => current || "Maombi ya Lipa: " + safeError(applications.reason));
      if (genericApplications.status === "fulfilled") setServiceApplications(genericApplications.value); else setDataError((current) => current || "Maombi ya huduma: " + safeError(genericApplications.reason));
      if (settings.status === "fulfilled" && settings.value) {
        const saved = settings.value as Record<string, unknown>;
        if (Array.isArray(saved.serviceOrder)) setServiceOrder(saved.serviceOrder.filter((item): item is string => typeof item === "string"));
        if (Array.isArray(saved.homepageSectionOrder)) setHomepageSectionOrder(saved.homepageSectionOrder.filter((item): item is string => typeof item === "string"));
        setCms((current) => ({ ...current, ...Object.fromEntries(Object.keys(current).map((key) => [key, saved[key] ?? current[key as keyof typeof current]])) }));
      }
    } finally { setLoadingData(false); }
  };
  useEffect(() => { void refresh(); }, [canManage]);
  const run = async (action: () => Promise<unknown>, success: string) => { setBusy(true); try { await action(); await refresh(); toast.success(success); return true; } catch (error) { toast.error(safeError(error)); return false; } finally { setBusy(false); } };
  const visibleUsers = useMemo(() => users.filter((item) => `${item.name} ${item.phone} ${item.email} ${item.username}`.toLowerCase().includes(search.toLowerCase())), [users, search]);
  const totalIssued = transactions.filter((item) => Number(item.amount) > 0).reduce((sum, item) => sum + Number(item.amount), 0);
  const totalUsed = Math.abs(transactions.filter((item) => Number(item.amount) < 0).reduce((sum, item) => sum + Number(item.amount), 0));
  const totalRemaining = users.reduce((sum, item) => sum + Number(item.tokenBalance ?? 0), 0);
  const adminCount = users.filter((item) => ["admin", "super_admin"].includes(item.role)).length;
  const stats = [["Watumiaji wote", users.length, Users], ["Active Users", users.filter((item) => item.accountStatus !== "blocked").length, UserCog], ["Pending Users", users.filter((item) => item.verificationStatus === "pending").length, ShieldCheck], ["Admin Users", adminCount, ShieldCheck], ["Tokeni zilizotolewa", totalIssued, WalletCards], ["Tokeni zilizotumika", totalUsed, Zap], ["Tokeni zilizobaki", totalRemaining, WalletCards], ["Matumizi ya huduma", transactions.filter((item) => Number(item.amount) < 0).length, BarChart3]] as const;

  if (loading) return <main className="admin-guard"><RefreshCw className="spin" /> Inakagua ruhusa za admin...</main>;
  if (!canManage) return <main className="admin-guard"><ShieldCheck size={38} /><h2>Ukurasa huu ni wa admin pekee</h2><p>Ingia kwa akaunti yenye role ya admin au super_admin.</p><Link className="admin-primary" href="/">Rudi portal</Link></main>;
  const title = nav.find(([key]) => key === panel)?.[1] ?? "Muhtasari";
  if (panel === "ordering" && !isSuper) return <main className="admin-guard"><ShieldCheck size={38} /><h2>Sehemu hii ni ya Super Admin pekee</h2><p>Mpangilio wa umma unaweza kubadilishwa na akaunti ya Super Admin tu.</p><Link className="admin-primary" href="/admin">Rudi dashboard</Link></main>;
  if (panelPermission[panel] && !hasPermission(panelPermission[panel]!)) return <main className="admin-guard"><ShieldCheck size={38} /><h2>Huna ruhusa ya sehemu hii</h2><p>Wasiliana na Super Admin ili upewe permission husika.</p><Link className="admin-primary" href="/admin">Rudi dashboard</Link></main>;
  return <div className="admin-app">
    <aside className={`admin-sidebar ${drawer ? "open" : ""}`}><div className="admin-brand"><div className="admin-brand-mark">H</div><div><strong>HUDUMA ZA MTANDAONI</strong><small>CONTROL</small></div><button className="admin-close" onClick={() => setDrawer(false)}><X size={18} /></button></div><div className="admin-profile"><div className="admin-avatar">{String(user?.name ?? "AD").slice(0, 2).toUpperCase()}</div><div><strong>{user?.name ?? "Admin"}</strong><small>{String(user?.role ?? "admin").replace("_", " ").toUpperCase()}</small></div></div><nav className="admin-nav">{visibleNav.map(([key, label, Icon]) => <Link key={key} href={key === "overview" ? "/admin" : `/admin/${key}`} className={panel === key ? "active" : ""} onClick={() => setDrawer(false)}><Icon size={17} /><span>{label}</span>{key === "applications" && serviceApplications.filter((app) => app.status === "PENDING").length > 0 && <b className="lipa-admin-nav-badge">{serviceApplications.filter((app) => app.status === "PENDING").length}</b>}{key === "lipa" && lipaApplications.filter((app) => app.status === "PENDING").length > 0 && <b className="lipa-admin-nav-badge">{lipaApplications.filter((app) => app.status === "PENDING").length}</b>}<ChevronRight size={14} /></Link>)}</nav><div className="admin-sidebar-bottom"><Link href="/"><ChevronRight size={15} /> Portal</Link><button onClick={() => void logout()}><LogOut size={15} /> Logout</button></div></aside>
    {drawer && <div className="admin-drawer-backdrop" onClick={() => setDrawer(false)} />}
    <section className="admin-content"><header className="admin-header"><button className="admin-menu" onClick={() => setDrawer(true)}><Menu size={21} /></button><div><span className="admin-kicker">HUDUMA ZA MTANDAONI CONTROL</span><h1>{panel === "overview" ? "Muhtasari wa HUDUMA ZA MTANDAONI" : title}</h1></div><div className="admin-header-actions"><span className="admin-auth-status"><i /> Firebase authenticated</span><button className="admin-icon-button" onClick={() => void refresh()} disabled={loadingData}><RefreshCw size={17} className={loadingData ? "spin" : ""} /></button><Link className="admin-portal-link" href="/">← Portal</Link></div></header>
      {loadingData && <div className="admin-loading">Inapakia data halisi kutoka Firestore...</div>}
      {dataError && <div className="admin-loading admin-loading--error">{dataError} — Hakikisha role ya account hii ipo kwenye users/{firebaseUser?.uid} na rules zimetumwa kwenye project sahihi.</div>}
      {panel === "overview" && <><div className="admin-stat-grid">{stats.map(([label, value, Icon]) => <div className="admin-stat-card" key={label}><div className="admin-stat-icon"><Icon size={18} /></div><span>{label}</span><strong>{value.toLocaleString()}</strong><small>Live Firestore data</small></div>)}</div><div className="admin-two-col"><section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">HATUA ZA HARAKA</span><h2>Simamia mfumo</h2></div><SlidersHorizontal size={19} /></div><div className="quick-actions">{hasPermission("manageTokens") && <Link href="/admin/tokens"><Plus size={17} /> Ongeza tokeni</Link>}{hasPermission("manageServices") && <Link href="/admin/services"><Plus size={17} /> Ongeza huduma</Link>}{hasPermission("manageServices") && <Link href="/admin/applications">Maombi ya huduma {serviceApplications.some((app) => app.status === "PENDING") && <b className="lipa-admin-nav-badge">{serviceApplications.filter((app) => app.status === "PENDING").length} PENDING</b>}</Link>}{hasPermission("manageLipaApplications") && <Link href="/admin/lipa">Pata Lipa Namba {lipaApplications.some((app) => app.status === "PENDING") && <b className="lipa-admin-nav-badge">{lipaApplications.filter((app) => app.status === "PENDING").length} PENDING · NEW</b>}</Link>}{hasPermission("manageContent") && <Link href="/admin/announcements"><Plus size={17} /> Ongeza tangazo</Link>}</div></section><section className="admin-security-card"><div className="admin-card-heading"><div><span className="admin-kicker">USALAMA WA MFUMO</span><h2>Session salama</h2></div><ShieldCheck size={20} /></div><p><strong>{user?.name ?? "Admin"}</strong> · {String(user?.role ?? "admin").replace("_", " ").toUpperCase()}</p><small>Auth: Firebase Authentication · Last login: {dateText((user as any)?.lastLoginAt) !== "—" ? dateText((user as any)?.lastLoginAt) : "Session ya sasa"}</small></section></div><section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">TRANSACTIONS ZA HIVI KARIBUNI</span><h2>Ledger</h2></div><Link href="/admin/transactions">Tazama zote</Link></div><TransactionTable rows={transactions.slice(0, 6)} /></section></>}
      {panel === "users" && <UsersPanel users={visibleUsers} search={search} setSearch={setSearch} onSelect={setSelectedUser} onRefresh={refresh} onRun={run} adminId={firebaseUser!.uid} isSuper={isSuper} canManageUsers={hasPermission("manageUsers")} busy={busy} />}
      {panel === "tokens" && <><TokensPanel users={users} form={tokenForm} setForm={setTokenForm} onRun={run} adminId={firebaseUser!.uid} busy={busy} /><TokenPurchaseReviewPanel orders={tokenPurchaseOrders} users={users} /></>}
      {panel === "services" && <ServicesPanel services={services} serviceLocks={serviceLocks} service={service} setService={setService} onRun={run} adminId={firebaseUser!.uid} busy={busy} isSuper={isSuper} />}
      {panel === "applications" && <ServiceApplicationsPanel applications={serviceApplications} services={services} onRun={run} adminId={firebaseUser!.uid} busy={busy} />}
      {panel === "lipa" && <div className="lipa-admin-layout"><LipaApplicationsPanel applications={lipaApplications} networks={lipaServices} onRun={run} adminId={firebaseUser!.uid} busy={busy} />{isSuper && <LipaNetworkConfigPanel networks={lipaServices} onRun={run} adminId={firebaseUser!.uid} busy={busy} />}</div>}
      {panel === "ordering" && isSuper && <ServiceOrderingPanel services={services} serviceOrder={serviceOrder} setServiceOrder={setServiceOrder} sectionOrder={homepageSectionOrder} setSectionOrder={setHomepageSectionOrder} onSave={() => run(() => setHomepageServiceOrder(serviceOrder, homepageSectionOrder), "Mpangilio wa huduma umehifadhiwa.")} busy={busy} />}
      {panel === "videos" && <CollectionPanel title="Video za Mafunzo" collectionName="tutorialVideos" rows={videos} form={video} setForm={setVideo} fields={[["title", "Title"], ["videoUrl", "Video URL"], ["category", "Category"], ["order", "Order"]]} onRun={run} adminId={firebaseUser!.uid} />}
      {panel === "transactions" && <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">AUDIT LEDGER</span><h2>Transactions</h2></div></div><TransactionTable rows={transactions} /></section>}
      {panel === "announcements" && <CollectionPanel title="Matangazo" collectionName="announcements" rows={announcements} form={announcement} setForm={setAnnouncement} fields={[["title", "Kichwa"], ["body", "Ujumbe"]]} onRun={run} adminId={firebaseUser!.uid} />}
      {panel === "cms" && <><CmsPanel values={cms} setValues={setCms} onRun={run} adminId={firebaseUser!.uid} /><TemplateEditorPanel values={cms} setValues={setCms} onRun={run} adminId={firebaseUser!.uid} /></>}
      {panel === "security" && <SecurityPanel isSuper={isSuper} users={users} audit={audit} />}
      {panel === "messages" && <MessagesPanel users={users} form={message} setForm={setMessage} onRun={run} adminId={firebaseUser!.uid} />}
      {panel === "licenses" && <CollectionPanel title="Usimamizi wa Leseni" collectionName="licenseTemplates" rows={licenses} form={{ id: "", name: "", fileType: "", fileSize: "", status: "disabled" }} setForm={() => undefined} fields={[["name", "Template name"], ["fileType", "File type"], ["fileSize", "File size"]]} onRun={run} adminId={firebaseUser!.uid} readOnly />}
    </section>{selectedUser && <UserModal person={selectedUser} onClose={() => setSelectedUser(null)} />}</div>;
}

const permissionOptions = [
  ["viewUsers", "Users: kuona profiles"],
  ["manageUsers", "Users: approve, block/unblock na profile"],
  ["manageTokens", "Tokeni: kuongeza/kupunguza na ledger"],
  ["manageServices", "Huduma: kuongeza, kuhariri na kufuta"],
  ["manageLipaApplications", "Lipa Namba: kuona na kuchakata maombi"],
  ["manageContent", "Content: announcements na videos"],
  ["manageMessages", "Messages: kutuma ujumbe"],
  ["manageReports", "Reports: kuona ripoti"],
  ["manageSettings", "Settings: kubadilisha mfumo"],
  ["manageLicenses", "Leseni: kusimamia templates"],
  ["viewAuditLogs", "Audit logs: kuona historia ya actions"],
] as const;

const panelPermission: Partial<Record<Panel, string>> = { users: "viewUsers", tokens: "manageTokens", services: "manageServices", applications: "manageServices", lipa: "manageLipaApplications", videos: "manageContent", transactions: "manageReports", announcements: "manageContent", cms: "manageSettings", security: "viewAuditLogs", messages: "manageMessages", licenses: "manageLicenses" };

function UsersPanel({ users, search, setSearch, onSelect, onRun, adminId, isSuper, canManageUsers, busy }: any) {
  const [accessUser, setAccessUser] = useState<any>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const openAccess = (person: any) => { setAccessUser(person); setPermissions({ ...(person.permissions ?? {}) }); };
  const saveAccess = () => {
    if (!accessUser) return;
    onRun(() => adminUpdateUser(adminId, accessUser.id, { role: accessUser.role, permissions }), "Role na permissions zimehifadhiwa.");
    setAccessUser(null);
  };
  return <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">FIRESTORE USERS</span><h2>Watumiaji</h2></div><span className="admin-count">{users.length}</span></div><div className="admin-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tafuta jina, simu au barua pepe..." /></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>MTUMIAJI</th><th>SIMU / EMAIL</th><th>ROLE</th><th>STATUS</th><th>VERIFICATION</th><th>TOKENI</th><th>ACTIONS</th></tr></thead><tbody>{users.map((person: any) => <tr key={person.id}><td><button className="user-cell" onClick={() => onSelect(person)}><span className="table-avatar">{String(person.name ?? "U").slice(0, 2).toUpperCase()}</span><span><strong>{person.name ?? "Bila jina"}</strong><small>{person.id.slice(0, 10)} · {dateText(person.createdAt)}</small></span></button></td><td>{person.phone || "—"}<small>{person.email || "—"}</small></td><td><span className="pill pill-blue">{person.role ?? "user"}</span></td><td><span className={`pill ${person.accountStatus === "blocked" ? "pill-red" : "pill-green"}`}>{person.accountStatus ?? "active"}</span></td><td><span className="pill">{person.verificationStatus ?? "pending"}</span></td><td><strong>{person.tokenBalance ?? 0}</strong><small>Received {person.totalTokensReceived ?? 0}</small></td><td><div className="table-actions">{canManageUsers && <><button disabled={busy} onClick={() => onRun(() => adminUpdateUser(adminId, person.id, { verificationStatus: "approved" }), "User amethibitishwa.")}>Approve</button><button disabled={busy} onClick={() => onRun(() => adminUpdateUser(adminId, person.id, { accountStatus: person.accountStatus === "blocked" ? "active" : "blocked" }), person.accountStatus === "blocked" ? "User amefunguliwa." : "User amezuiwa.")}>{person.accountStatus === "blocked" ? "Fungua" : "Zuia"}</button></>}{isSuper && <button disabled={busy} onClick={() => openAccess(person)}>Access</button>}</div></td></tr>)}</tbody></table>{!users.length && <Empty />}</div>{accessUser && <div className="admin-modal-backdrop" onClick={() => setAccessUser(null)}><div className="admin-modal" onClick={(event) => event.stopPropagation()}><button className="admin-modal-close" onClick={() => setAccessUser(null)}><X size={18} /></button><span className="admin-kicker">SUPER ADMIN ACCESS</span><h2>{accessUser.name ?? accessUser.email}</h2><label className="control-field"><span>Role</span><select value={accessUser.role ?? "user"} onChange={(event) => setAccessUser({ ...accessUser, role: event.target.value })}><option value="user">User</option><option value="admin">Admin</option><option value="super_admin">Super admin</option></select></label><div className="check-grid">{permissionOptions.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(permissions[key])} onChange={(event) => setPermissions({ ...permissions, [key]: event.target.checked })} /> {label}</label>)}</div><div className="form-actions"><button className="admin-primary" disabled={busy} onClick={saveAccess}>Hifadhi access</button><button onClick={() => setAccessUser(null)}>Ghairi</button></div></div></div>}</section>;
}
function TokensPanel({ users, form, setForm, onRun, adminId, busy }: any) {
  const requestIds = useRef(new Map<string, string>());
  const submitAdjustment = (direction: 1 | -1) => {
    const amount = Math.abs(Number(form.amount)) * direction;
    if (!form.userId || !Number.isInteger(amount) || amount === 0) {
      toast.error("Chagua mtumiaji na weka kiasi kamili cha tokeni.");
      return;
    }
    const description = String(form.reason || "Admin adjustment").trim() || "Admin adjustment";
    const requestKey = JSON.stringify([adminId, form.userId, amount, description]);
    let requestId = requestIds.current.get(requestKey);
    if (!requestId) {
      requestId = crypto.randomUUID();
      requestIds.current.set(requestKey, requestId);
      if (requestIds.current.size > 40) requestIds.current.delete(requestIds.current.keys().next().value!);
    }
    const label = direction > 0 ? "Tokeni zimeongezwa." : "Tokeni zimepunguzwa.";
    onRun(async () => {
      const result = await adminAdjustTokens(adminId, form.userId, amount, description, requestId);
      requestIds.current.delete(requestKey);
      return result;
    }, label);
  };
  const invalidAmount = !Number.isInteger(Number(form.amount)) || Number(form.amount) <= 0;
  return <div className="admin-two-col"><section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">TOKEN LEDGER</span><h2>Usimamizi wa Tokeni</h2></div></div><label className="control-field"><span>Chagua mtumiaji</span><select value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })}><option value="">Chagua user — phone — balance</option>{users.map((item: any) => <option key={item.id} value={item.id}>{item.name ?? "Bila jina"} — {item.phone || item.email} — {item.tokenBalance ?? 0}</option>)}</select></label><Field label="Kiasi" type="number" value={form.amount} onChange={(value) => setForm({ ...form, amount: Number(value) })} /><label className="control-field"><span>Maelezo</span><textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Bonus ya usajili" /></label><div className="form-actions"><button className="admin-primary" disabled={busy || !form.userId || invalidAmount} onClick={() => submitAdjustment(1)}>+ Ongeza tokeni</button><button className="admin-danger" disabled={busy || !form.userId || invalidAmount} onClick={() => submitAdjustment(-1)}>− Punguza tokeni</button></div></section><section className="admin-card"><div className="admin-card-heading"><h2>Maelezo ya ledger</h2></div><p>Kila adjustment huhifadhi salio la awali na jipya, admin, sababu na rejea ya kipekee. Jaribio la kurudia ombi lilelile halitaongeza au kupunguza tokeni mara mbili.</p><div className="ledger-note"><WalletCards size={20} /><span>Operations zote zinathibitishwa na Firebase Function salama.</span></div></section></div>;
}
function TokenPurchaseReviewPanel({ orders, users }: { orders: any[]; users: Array<AdminUserRecord & { id: string }> }) {
  const userNames = new Map(users.map((user) => [user.id, user.name || user.email || user.id]));
  const latest = [...orders].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))).slice(0, 25);
  const needsReview = latest.filter((order) => ["NEEDS_REVIEW", "CREATE_FAILED", "CREATE_UNKNOWN"].includes(String(order.status)));
  return <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">FIMIPAY · TZS TOKEN TOP-UPS</span><h2>Malipo ya tokeni</h2></div><span className="admin-count">{needsReview.length} yanahitaji kuangaliwa</span></div><p>Oda za FimiPay zinaunganishwa na akaunti kwa UID; webhook huhakikisha hali kupitia API kabla ya kuongeza tokeni. Kagua malipo yenye hali ya ukaguzi kupitia FimiPay kabla ya kufanya marekebisho ya ledger.</p><div className="admin-list">{latest.map((order) => <div className="admin-list-row" key={order.id}><div><strong>{userNames.get(String(order.userId)) ?? `Akaunti ${String(order.userId ?? "").slice(0, 10)}`} · TZS {Number(order.amount).toLocaleString("en-US")}</strong><small>{Number(order.tokenAmount)} tokeni · {String(order.status)} · {dateText(order.createdAt)} · Oda {String(order.id).slice(0, 20)}{order.reviewReason ? ` · ${String(order.reviewReason)}` : ""}</small></div><span className={`pill ${order.status === "PAID" ? "pill-green" : ["NEEDS_REVIEW", "CREATE_FAILED", "CREATE_UNKNOWN"].includes(String(order.status)) ? "pill-red" : "pill-blue"}`}>{String(order.status)}</span></div>)}{!latest.length && <Empty text="Bado hakuna oda za FimiPay." />}</div></section>;
}
function ServicesPanel({ services, serviceLocks, service, setService, onRun, adminId, busy, isSuper }: any) {
  const lockBySlug = new Map<string, boolean>();
  for (const entry of serviceLocks as any[]) lockBySlug.set(String(entry.slug ?? entry.id), entry.isLocked === true);
  const rows = (services as any[]).map((item) => {
    const slug = String(item.slug ?? item.id);
    const storedLock = lockBySlug.get(slug);
    const isLocked = isServiceLocked(slug, storedLock, item.isLocked === true || item.kind === "locked");
    return { ...item, slug, isLocked };
  }).sort((a, b) => Number(a.order ?? 9999) - Number(b.order ?? 9999) || String(a.name).localeCompare(String(b.name)));
  const saveService = () => {
    const slug = String(service.slug ?? "").trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(slug)) { toast.error("Slug iwe na herufi ndogo, namba, dash au underscore."); return; }
    const { id: _id, ...editable } = service;
    onRun(() => adminSaveService(adminId, { ...editable, slug, fields: service.fields ?? [] }, slug), "Huduma imehifadhiwa kwenye Firestore.");
  };
  const addField = () => setService({ ...service, fields: [...(service.fields ?? []), { fieldName: `field${(service.fields ?? []).length + 1}`, label: "Field mpya", type: "TEXT", required: false, order: (service.fields ?? []).length }] });
  const updateField = (index: number, patch: Partial<ServiceFormField>) => setService({ ...service, fields: (service.fields ?? []).map((field: ServiceFormField, i: number) => i === index ? { ...field, ...patch } : field) });
  const reset = () => setService({ ...emptyService, fields: [] });
  return <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">FIRESTORE SERVICE BUILDER</span><h2>Huduma</h2><p>Orodha ya huduma inasomwa kutoka Firestore; fomu za huduma zinaweza kuundwa hapa bila kubadili code.</p></div><span className="admin-count">{rows.length}</span></div><div className="form-grid"><Field label="Jina la huduma" value={service.name} onChange={(value) => setService({ ...service, name: value })} /><Field label="Slug / ID" value={service.slug} placeholder="pata-lipa-namba" onChange={(value) => setService({ ...service, slug: value.toLowerCase().replace(/\s+/g, "-") })} /><Field label="Icon key" value={service.icon} onChange={(value) => setService({ ...service, icon: value })} /><Field label="Category" value={service.category} onChange={(value) => setService({ ...service, category: value })} /><Field label="Token cost" type="number" value={service.tokenCost} onChange={(value) => setService({ ...service, tokenCost: Number(value), isFree: Number(value) <= 0 })} /><Field label="Reward (taarifa tu)" type="number" value={service.reward ?? 0} onChange={(value) => setService({ ...service, reward: Number(value) })} /><Field label="Order" type="number" value={service.order ?? 0} onChange={(value) => setService({ ...service, order: Number(value) })} /><Field label="Button text" value={service.buttonText ?? ""} onChange={(value) => setService({ ...service, buttonText: value })} /><Field label="Action URL (hiari)" value={service.actionUrl ?? ""} onChange={(value) => setService({ ...service, actionUrl: value })} /></div><label className="control-field"><span>Description</span><textarea value={service.description} onChange={(event) => setService({ ...service, description: event.target.value })} /></label><label className="control-field"><span>Instructions</span><textarea value={service.instructions ?? ""} onChange={(event) => setService({ ...service, instructions: event.target.value })} /></label><label className="control-field"><span>Status options (comma-separated)</span><input value={(service.statusOptions ?? []).join(", ")} onChange={(event) => setService({ ...service, statusOptions: event.target.value.split(",").map((status) => status.trim()).filter(Boolean) })} /></label><div className="check-grid"><label><input type="checkbox" checked={service.isFree} onChange={(event) => setService({ ...service, isFree: event.target.checked, tokenCost: event.target.checked ? 0 : Math.max(1, Number(service.tokenCost)) })} /> Bure / hakuna tokeni</label><label><input type="checkbox" checked={service.active !== false} onChange={(event) => setService({ ...service, active: event.target.checked })} /> ACTIVE</label><label><input type="checkbox" checked={service.isVisible !== false} onChange={(event) => setService({ ...service, isVisible: event.target.checked })} /> Visible kwa users</label><label><input type="checkbox" checked={service.adminWorkflow !== false} onChange={(event) => setService({ ...service, adminWorkflow: event.target.checked })} /> Admin workflow</label></div><section className="lipa-admin-field-editor"><div className="admin-card-heading"><div><h3>Fields za fomu</h3><small>Aina: {serviceFieldTypes.join(", ")}</small></div><button type="button" onClick={addField}><Plus size={15} /> Ongeza field</button></div>{(service.fields ?? []).map((field: ServiceFormField, index: number) => <div className="lipa-admin-field" key={`${field.fieldName}-${index}`}><Field label="fieldName" value={field.fieldName} onChange={(value) => updateField(index, { fieldName: value.replace(/[^A-Za-z0-9_]/g, "") })} /><Field label="Label" value={field.label} onChange={(value) => updateField(index, { label: value })} /><label className="control-field"><span>Type</span><select value={field.type} onChange={(event) => updateField(index, { type: event.target.value as ServiceFormField["type"] })}>{serviceFieldTypes.map((type) => <option key={type}>{type}</option>)}</select></label><Field label="Placeholder" value={field.placeholder ?? ""} onChange={(value) => updateField(index, { placeholder: value })} /><Field label="Help text" value={field.helpText ?? ""} onChange={(value) => updateField(index, { helpText: value })} /><label className="control-field"><span>Options (dropdown, koma)</span><input value={(field.options ?? []).join(", ")} onChange={(event) => updateField(index, { options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label><Field label="Validation regex" value={field.validation ?? ""} onChange={(value) => updateField(index, { validation: value })} /><label><input type="checkbox" checked={field.required === true} onChange={(event) => updateField(index, { required: event.target.checked })} /> Required</label><button type="button" className="admin-danger" onClick={() => setService({ ...service, fields: service.fields.filter((_: ServiceFormField, i: number) => i !== index) })}>Ondoa field</button></div>)}</section><div className="form-actions"><button className="admin-primary" disabled={busy || !String(service.name).trim() || !String(service.slug).trim()} onClick={saveService}>Hifadhi huduma</button><button disabled={busy} onClick={reset}>Anza huduma mpya</button>{isSuper && <button disabled={busy} onClick={() => onRun(() => seedServiceCatalog(), "Huduma za mwanzo zimeongezwa bila kubadilisha zilizopo.")}>Anzisha / ongeza huduma za mwanzo</button>}</div><div className="admin-list">{rows.map((item: any) => <div className="admin-list-row" key={item.id ?? item.slug}><div><strong>{item.name}</strong><small>{item.slug} · {item.category} · {item.active === false ? "DISABLED" : "ACTIVE"} · {item.isFree ? "Bure" : `${item.tokenCost} tokeni`} · Order {item.order ?? 0}{item.isVisible === false ? " · Imefichwa" : ""}</small></div><div className="table-actions"><button disabled={busy} onClick={() => setService({ ...emptyService, ...item, id: item.id ?? item.slug })}>Hariri</button><button disabled={busy} className={item.isLocked ? "admin-unlock" : "admin-lock"} onClick={() => onRun(() => adminSetServiceLock(item.slug ?? item.id, !item.isLocked), item.isLocked ? "Huduma imefunguliwa." : "Huduma imefungwa.")}>{item.isLocked ? "Fungua" : "Fungia"}</button><button disabled={busy} className="admin-danger" onClick={() => onRun(() => adminDeleteCollectionItem(adminId, "services", item.id ?? item.slug), "Huduma imefutwa.")}><Trash2 size={14} /></button></div></div>)}{!rows.length && <Empty text="Bado hakuna huduma kwenye Firestore. Bonyeza ‘Anzisha / ongeza huduma za mwanzo’ ili kuingiza katalogi ya sasa na PATA LIPA NAMBA." />}</div></section>;
}
function CollectionPanel({ title, collectionName, rows, form, setForm, fields, onRun, adminId, readOnly = false }: any) { return <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">FIRESTORE CMS</span><h2>{title}</h2></div></div>{!readOnly && <><div className="form-grid">{fields.map(([key, label]: string[]) => <Field key={key} label={label} value={form[key] ?? ""} onChange={(value) => setForm({ ...form, [key]: key === "order" ? Number(value) : value })} />)}</div><div className="check-grid"><label><input type="checkbox" checked={form.enabled !== false} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> Imewezeshwa</label></div><button className="admin-primary" onClick={() => onRun(() => adminSaveCollectionItem(adminId, collectionName, { ...form, id: undefined }, form.id || undefined), "Imehifadhiwa.")}>Hifadhi</button></>}{<div className="admin-list">{rows.map((item: any) => <div className="admin-list-row" key={item.id}><div><strong>{item.title ?? item.name ?? "Bila kichwa"}</strong><small>{item.body ?? item.videoUrl ?? item.status ?? ""}</small></div>{!readOnly && <div className="table-actions"><button onClick={() => setForm({ ...form, ...item })}>Hariri</button><button onClick={() => onRun(() => adminDeleteCollectionItem(adminId, collectionName, item.id), "Imefutwa.")}><Trash2 size={14} /></button></div>}</div>)}{!rows.length && <Empty />}</div>}</section>; }
function TemplateEditorPanel({ values, setValues, onRun, adminId }: any) {
  const defaults = {
    sticker: { nameX: 50, nameY: 72, nameSize: 3.4, numberX: 50, numberY: 82, numberSize: 3.1 },
    tin: { taxpayer: 480, taxpayerY: 620, taxpayerSize: 23, tinX: 506, tinY: 760, tinSize: 25, effectX: 390, effectY: 835, locationX: 390, locationY: 875, officeX: 390, officeY: 915, physicalX: 390, physicalY: 955, streetX: 390, streetY: 995, commissionerX: 795, commissionerY: 1110 },
    license: { nameX: 50, nameY: 50, nameSize: 3.2, numberX: 50, numberY: 58, numberSize: 3 },
    airtelSme: {
      nameX: 22.5, nameY: 25, nameSize: 3, phoneX: 22.5, phoneY: 28.9, phoneSize: 3,
      tinX: 76, tinY: 28.9, tinSize: 2.8, idTypeX: 24, idTypeY: 32.9, idTypeSize: 2.8,
      idX: 69, idY: 32.9, idSize: 2.4, streetX: 28, streetY: 37, streetSize: 2.8,
      wardX: 75, wardY: 37, wardSize: 2.8, districtX: 31, districtY: 41, districtSize: 2.8,
      regionX: 76, regionY: 41, regionSize: 2.8, emailX: 31, emailY: 45, emailSize: 2.6,
      normalX: 5.8, normalY: 56.2, normalSize: 4.2, deviceX: 29, deviceY: 56, deviceSize: 2.8,
      customerX: 17, customerY: 90, customerSize: 2.6, sign1X: 70, sign1Y: 90, sign1Size: 2.6,
      date1X: 89, date1Y: 90, date1Size: 2.2, salesX: 20, salesY: 93.7, salesSize: 2.6,
      sign2X: 70, sign2Y: 93.7, sign2Size: 2.6, date2X: 89, date2Y: 93.7, date2Size: 2.2
    },
  };
  const current = { ...defaults, ...(values.templateLayouts ?? {}) };
  const set = (service: string, key: string, value: number) => setValues({ ...values, templateLayouts: { ...current, [service]: { ...current[service as keyof typeof current], [key]: value } } });
  const groups = [
    ["sticker", "Stika za Mawakala", [["nameX","Jina X",0,100],["nameY","Jina Y",0,100],["nameSize","Jina size",1,10],["numberX","Namba X",0,100],["numberY","Namba Y",0,100],["numberSize","Namba size",1,10]]],
    ["tin", "Cheti cha TIN", [["taxpayer","Jina",0,1012],["taxpayerY","Jina Y",0,1300],["taxpayerSize","Jina size",8,80],["tinX","TIN X",0,1012],["tinY","TIN Y",0,1300],["tinSize","TIN size",8,80],["effectX","Tarehe X",0,1012],["effectY","Tarehe Y",0,1300],["locationX","Location X",0,1012],["locationY","Location Y",0,1300],["officeX","Office X",0,1012],["officeY","Office Y",0,1300],["physicalX","Physical X",0,1012],["physicalY","Physical Y",0,1300],["streetX","Street X",0,1012],["streetY","Street Y",0,1300],["commissionerX","Commissioner X",0,1012],["commissionerY","Commissioner Y",0,1300]]],
    ["license", "Leseni ya Biashara", [["nameX","Jina X",0,100],["nameY","Jina Y",0,100],["nameSize","Jina size",1,10],["numberX","Namba X",0,100],["numberY","Namba Y",0,100],["numberSize","Namba size",1,10]]],
    ["airtelSme", "SME Airtel Mkataba", [["nameX","Jina X",0,100],["nameY","Jina Y",0,100],["nameSize","Jina size",1,10],["phoneX","Simu X",0,100],["phoneY","Simu Y",0,100],["phoneSize","Simu size",1,10],["tinX","TIN X",0,100],["tinY","TIN Y",0,100],["tinSize","TIN size",1,10],["idTypeX","ID type X",0,100],["idTypeY","ID type Y",0,100],["idTypeSize","ID type size",1,10],["idX","ID X",0,100],["idY","ID Y",0,100],["idSize","ID size",1,10],["streetX","Mtaa X",0,100],["streetY","Mtaa Y",0,100],["streetSize","Mtaa size",1,10],["wardX","Kata X",0,100],["wardY","Kata Y",0,100],["wardSize","Kata size",1,10],["districtX","Wilaya X",0,100],["districtY","Wilaya Y",0,100],["districtSize","Wilaya size",1,10],["regionX","Mkoa X",0,100],["regionY","Mkoa Y",0,100],["regionSize","Mkoa size",1,10],["emailX","Email X",0,100],["emailY","Email Y",0,100],["emailSize","Email size",1,10],["normalX","Checkbox X",0,100],["normalY","Checkbox Y",0,100],["normalSize","Checkbox size",1,10],["deviceX","Device X",0,100],["deviceY","Device Y",0,100],["deviceSize","Device size",1,10],["customerX","Customer X",0,100],["customerY","Customer Y",0,100],["customerSize","Customer size",1,10],["sign1X","Signature 1 X",0,100],["sign1Y","Signature 1 Y",0,100],["sign1Size","Signature 1 size",1,10],["date1X","Date 1 X",0,100],["date1Y","Date 1 Y",0,100],["date1Size","Date 1 size",1,10],["salesX","Sales X",0,100],["salesY","Sales Y",0,100],["salesSize","Sales size",1,10],["sign2X","Signature 2 X",0,100],["sign2Y","Signature 2 Y",0,100],["sign2Size","Signature 2 size",1,10],["date2X","Date 2 X",0,100],["date2Y","Date 2 Y",0,100],["date2Size","Date 2 size",1,10]]],
  ] as const;
  return <section className="admin-card">
    <div className="admin-card-heading"><div><span className="admin-kicker">TEMPLATE CONTROL</span><h2>Template & Live Preview Editor</h2></div><Palette size={19}/></div>
    <p className="admin-ordering-help">Badilisha X/Y na ukubwa wa maandishi wa huduma kuu. Mabadiliko yanahifadhiwa kwenye site settings na yanaweza kutumiwa na Live Preview bila kubadili source code.</p>
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
function MessagesPanel({ users, form, setForm, onRun, adminId }: any) { return <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">MESSAGING</span><h2>Tuma ujumbe</h2></div></div><div className="form-grid"><Field label="Subject" value={form.subject} onChange={(value) => setForm({ ...form, subject: value })} /><label className="control-field"><span>Kwa mtumiaji mmoja</span><select value={form.recipientId} onChange={(event) => setForm({ ...form, recipientId: event.target.value })}><option value="">Kwa wote</option>{users.map((item: any) => <option key={item.id} value={item.id}>{item.name ?? "Bila jina"} — {item.phone || item.email}</option>)}</select></label></div><label className="control-field"><span>Ujumbe</span><textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label><button className="admin-primary" onClick={() => onRun(() => adminSaveCollectionItem(adminId, "messages", { ...form, broadcast: !form.recipientId, sentAt: new Date().toISOString() }), "Ujumbe umetumwa.")}>Tuma ujumbe</button></section>; }
function SecurityPanel({ isSuper, users, audit }: any) { return <div className="admin-two-col"><section className="admin-security-card"><ShieldCheck size={25} /><h2>{isSuper ? "Eneo la siri" : "Usalama wa admin"}</h2><p>{isSuper ? "Una access ya super_admin. Admin management, settings na audit logs zinapatikana." : "Admin wa kawaida hawezi kubadilisha super_admin au system security settings."}</p><div className="security-checks"><span>✓ Firebase Auth</span><span>✓ Role-based access</span><span>✓ Firestore Rules</span><span>✓ No passwords in Firestore</span></div></section><section className="admin-card"><h2>Audit summary</h2><p>Users: {users.length} · Admins: {users.filter((item: any) => ["admin", "super_admin"].includes(item.role)).length}</p><p>Audit actions: {audit.length}</p><small>Kwa custom claims, tumia Firebase Admin SDK katika mazingira ya privileged; frontend haiwezi kujipa role.</small></section></div>; }
function TransactionTable({ rows }: { rows: any[] }) { return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>REFERENCE</th><th>MTUMIAJI</th><th>MAELEZO</th><th>AINA</th><th>KIASI</th><th>BALANCE</th><th>TAREHE</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><code>{item.reference ?? item.id}</code></td><td>{item.userId}</td><td>{item.serviceName ?? item.description ?? "—"}</td><td><span className="pill">{item.type ?? (Number(item.amount) < 0 ? "DEBIT" : "CREDIT")}</span></td><td className={Number(item.amount) < 0 ? "amount-negative" : "amount-positive"}>{item.amount}</td><td>{item.previousBalance ?? "—"} → {item.newBalance ?? item.balanceAfter ?? "—"}</td><td>{dateText(item.createdAt)}</td></tr>)}</tbody></table>{!rows.length && <Empty />}</div>; }
function UserModal({ person, onClose }: { person: any; onClose: () => void }) { return <div className="admin-modal-backdrop" onClick={onClose}><div className="admin-modal" onClick={(event) => event.stopPropagation()}><button className="admin-modal-close" onClick={onClose}><X size={18} /></button><span className="admin-kicker">USER PROFILE</span><h2>{person.name ?? "Bila jina"}</h2><div className="profile-grid">{[["Phone", person.phone], ["Email", person.email], ["Username", person.username], ["Role", person.role], ["Account status", person.accountStatus ?? "active"], ["Verification", person.verificationStatus], ["Token balance", person.tokenBalance ?? 0], ["Total received", person.totalTokensReceived ?? 0], ["Total used", person.totalTokensUsed ?? 0], ["Registration", dateText(person.createdAt)], ["Last login", dateText(person.lastLoginAt)]].map(([label, value]) => <div key={String(label)}><small>{label}</small><strong>{String(value ?? "—")}</strong></div>)}</div><p className="privacy-note">Password za users hazihifadhiwi wala hazionyeshwi kwenye dashboard.</p></div></div>; }


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
