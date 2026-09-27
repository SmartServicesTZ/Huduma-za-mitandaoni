import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowDown, ArrowUp, BarChart3, Bell, Boxes, ChevronRight, FileKey2, FileText, LayoutDashboard, LogOut, Menu, MessageSquare, Palette, PlaySquare, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Trash2, UserCog, Users, WalletCards, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { adminAdjustTokens, adminDeleteCollectionItem, adminGetSiteSettings, adminListCollection, adminListServices, adminListTransactions, adminListUsers, adminSaveCollectionItem, adminSaveService, adminSaveSiteSettings, adminSetServiceLock, adminUpdateUser, setHomepageServiceOrder, type AdminUserRecord } from "@/lib/firebase";
import { serviceCatalog } from "../../../shared/catalog";
import { completeOrder, defaultHomepageSectionOrder, isServiceLocked, moveId } from "../../../shared/serviceOrdering";

type Panel = "overview" | "users" | "tokens" | "services" | "ordering" | "videos" | "transactions" | "announcements" | "cms" | "security" | "messages" | "licenses";
const nav: Array<[Panel, string, typeof LayoutDashboard]> = [
  ["overview", "Muhtasari", LayoutDashboard], ["users", "Watumiaji", Users], ["tokens", "Tokeni", WalletCards], ["services", "Huduma", Boxes], ["ordering", "Mpangilio wa vipengele", SlidersHorizontal], ["videos", "Video", PlaySquare], ["transactions", "Transactions", BarChart3], ["announcements", "Matangazo", Bell], ["cms", "Muonekano & CMS", Palette], ["security", "Usalama", ShieldCheck], ["messages", "Tuma ujumbe", MessageSquare], ["licenses", "Leseni", FileKey2],
];
const emptyService = { id: "", name: "", slug: "", description: "", icon: "file-badge", tokenCost: 2, isFree: false, isVisible: true, category: "Huduma kuu", actionUrl: "" };
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
  const [videos, setVideos] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<(AdminUserRecord & { id: string }) | null>(null);
  const [tokenForm, setTokenForm] = useState({ userId: "", amount: 10, reason: "" });
  const [service, setService] = useState(emptyService);
  const [serviceOrder, setServiceOrder] = useState<string[]>(serviceCatalog.map((item) => item.slug));
  const [homepageSectionOrder, setHomepageSectionOrder] = useState<string[]>(defaultHomepageSectionOrder);
  const [video, setVideo] = useState(emptyVideo);
  const [announcement, setAnnouncement] = useState(emptyAnnouncement);
  const [message, setMessage] = useState(emptyMessage);
  const [cms, setCms] = useState({ systemName: "$TEWARD TZ", eyebrow: "HUDUMA ZA MTANDAONI", headline: "Huduma zako, sehemu moja.", description: "", searchPlaceholder: "Tafuta huduma...", whatsapp: "", owner: "", footer: "", primaryColor: "#18b969", accentColor: "#6ea8fe" });
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
        hasPermission("viewUsers") ? adminListUsers() : Promise.resolve([]), hasPermission("manageServices") ? adminListServices() : Promise.resolve([]), hasPermission("manageReports") ? adminListTransactions() : Promise.resolve([]), hasPermission("manageContent") ? adminListCollection("tutorialVideos") : Promise.resolve([]), hasPermission("manageContent") ? adminListCollection("announcements") : Promise.resolve([]), hasPermission("manageMessages") ? adminListCollection("messages") : Promise.resolve([]), hasPermission("manageLicenses") ? adminListCollection("licenseTemplates") : Promise.resolve([]), hasPermission("viewAuditLogs") ? adminListCollection("adminActions") : Promise.resolve([]), hasPermission("manageServices") ? adminGetSiteSettings() : Promise.resolve(null), hasPermission("manageServices") ? adminListCollection("serviceLocks") : Promise.resolve([]),
      ]);
      const [u, s, t, v, a, m, l, logs, settings, locks] = results;
      if (u.status === "fulfilled") setUsers(u.value); else setDataError("Watumiaji: " + safeError(u.reason));
      if (s.status === "fulfilled") setServices(s.value); else setDataError((current) => current || "Huduma: " + safeError(s.reason));
      if (t.status === "fulfilled") setTransactions(t.value); else setDataError((current) => current || "Transactions: " + safeError(t.reason));
      if (v.status === "fulfilled") setVideos(v.value); else setDataError((current) => current || "Video: " + safeError(v.reason));
      if (a.status === "fulfilled") setAnnouncements(a.value); else setDataError((current) => current || "Matangazo: " + safeError(a.reason));
      if (m.status === "fulfilled") setMessages(m.value); else setDataError((current) => current || "Ujumbe: " + safeError(m.reason));
      if (l.status === "fulfilled") setLicenses(l.value); else setDataError((current) => current || "Leseni: " + safeError(l.reason));
      if (logs.status === "fulfilled") setAudit(logs.value); else setDataError((current) => current || "Audit: " + safeError(logs.reason));
      if (locks.status === "fulfilled") setServiceLocks(locks.value); else setDataError((current) => current || "Locks za huduma: " + safeError(locks.reason));
      if (settings.status === "fulfilled" && settings.value) {
        const saved = settings.value as Record<string, unknown>;
        if (Array.isArray(saved.serviceOrder)) setServiceOrder(saved.serviceOrder.filter((item): item is string => typeof item === "string"));
        if (Array.isArray(saved.homepageSectionOrder)) setHomepageSectionOrder(saved.homepageSectionOrder.filter((item): item is string => typeof item === "string"));
      }
    } finally { setLoadingData(false); }
  };
  useEffect(() => { void refresh(); }, [canManage]);
  const run = async (action: () => Promise<unknown>, success: string) => { setBusy(true); try { await action(); await refresh(); toast.success(success); } catch (error) { toast.error(safeError(error)); } finally { setBusy(false); } };
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
    <aside className={`admin-sidebar ${drawer ? "open" : ""}`}><div className="admin-brand"><div className="admin-brand-mark">$</div><div><strong>$TEWARD TZ</strong><small>CONTROL</small></div><button className="admin-close" onClick={() => setDrawer(false)}><X size={18} /></button></div><div className="admin-profile"><div className="admin-avatar">{String(user?.name ?? "AD").slice(0, 2).toUpperCase()}</div><div><strong>{user?.name ?? "Admin"}</strong><small>{String(user?.role ?? "admin").replace("_", " ").toUpperCase()}</small></div></div><nav className="admin-nav">{visibleNav.map(([key, label, Icon]) => <Link key={key} href={key === "overview" ? "/admin" : `/admin/${key}`} className={panel === key ? "active" : ""} onClick={() => setDrawer(false)}><Icon size={17} /><span>{label}</span><ChevronRight size={14} /></Link>)}</nav><div className="admin-sidebar-bottom"><Link href="/"><ChevronRight size={15} /> Portal</Link><button onClick={() => void logout()}><LogOut size={15} /> Logout</button></div></aside>
    {drawer && <div className="admin-drawer-backdrop" onClick={() => setDrawer(false)} />}
    <section className="admin-content"><header className="admin-header"><button className="admin-menu" onClick={() => setDrawer(true)}><Menu size={21} /></button><div><span className="admin-kicker">$TEWARD TZ CONTROL</span><h1>{panel === "overview" ? "Muhtasari wa $TEWARD TZ" : title}</h1></div><div className="admin-header-actions"><span className="admin-auth-status"><i /> Firebase authenticated</span><button className="admin-icon-button" onClick={() => void refresh()} disabled={loadingData}><RefreshCw size={17} className={loadingData ? "spin" : ""} /></button><Link className="admin-portal-link" href="/">← Portal</Link></div></header>
      {loadingData && <div className="admin-loading">Inapakia data halisi kutoka Firestore...</div>}
      {dataError && <div className="admin-loading admin-loading--error">{dataError} — Hakikisha role ya account hii ipo kwenye users/{firebaseUser?.uid} na rules zimetumwa kwenye project sahihi.</div>}
      {panel === "overview" && <><div className="admin-stat-grid">{stats.map(([label, value, Icon]) => <div className="admin-stat-card" key={label}><div className="admin-stat-icon"><Icon size={18} /></div><span>{label}</span><strong>{value.toLocaleString()}</strong><small>Live Firestore data</small></div>)}</div><div className="admin-two-col"><section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">HATUA ZA HARAKA</span><h2>Simamia mfumo</h2></div><SlidersHorizontal size={19} /></div><div className="quick-actions">{hasPermission("manageTokens") && <Link href="/admin/tokens"><Plus size={17} /> Ongeza tokeni</Link>}{hasPermission("manageServices") && <Link href="/admin/services"><Plus size={17} /> Ongeza huduma</Link>}{hasPermission("manageContent") && <Link href="/admin/announcements"><Plus size={17} /> Ongeza tangazo</Link>}</div></section><section className="admin-security-card"><div className="admin-card-heading"><div><span className="admin-kicker">USALAMA WA MFUMO</span><h2>Session salama</h2></div><ShieldCheck size={20} /></div><p><strong>{user?.name ?? "Admin"}</strong> · {String(user?.role ?? "admin").replace("_", " ").toUpperCase()}</p><small>Auth: Firebase Authentication · Last login: {dateText((user as any)?.lastLoginAt) !== "—" ? dateText((user as any)?.lastLoginAt) : "Session ya sasa"}</small></section></div><section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">TRANSACTIONS ZA HIVI KARIBUNI</span><h2>Ledger</h2></div><Link href="/admin/transactions">Tazama zote</Link></div><TransactionTable rows={transactions.slice(0, 6)} /></section></>}
      {panel === "users" && <UsersPanel users={visibleUsers} search={search} setSearch={setSearch} onSelect={setSelectedUser} onRefresh={refresh} onRun={run} adminId={firebaseUser!.uid} isSuper={isSuper} canManageUsers={hasPermission("manageUsers")} busy={busy} />}
      {panel === "tokens" && <TokensPanel users={users} form={tokenForm} setForm={setTokenForm} onRun={run} adminId={firebaseUser!.uid} busy={busy} />}
      {panel === "services" && <ServicesPanel services={services} serviceLocks={serviceLocks} service={service} setService={setService} onRun={run} adminId={firebaseUser!.uid} busy={busy} />}
      {panel === "ordering" && isSuper && <ServiceOrderingPanel services={services} serviceOrder={serviceOrder} setServiceOrder={setServiceOrder} sectionOrder={homepageSectionOrder} setSectionOrder={setHomepageSectionOrder} onSave={() => run(() => setHomepageServiceOrder(serviceOrder, homepageSectionOrder), "Mpangilio wa huduma umehifadhiwa.")} busy={busy} />}
      {panel === "videos" && <CollectionPanel title="Video za Mafunzo" collectionName="tutorialVideos" rows={videos} form={video} setForm={setVideo} fields={[["title", "Title"], ["videoUrl", "Video URL"], ["category", "Category"], ["order", "Order"]]} onRun={run} adminId={firebaseUser!.uid} />}
      {panel === "transactions" && <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">AUDIT LEDGER</span><h2>Transactions</h2></div></div><TransactionTable rows={transactions} /></section>}
      {panel === "announcements" && <CollectionPanel title="Matangazo" collectionName="announcements" rows={announcements} form={announcement} setForm={setAnnouncement} fields={[["title", "Kichwa"], ["body", "Ujumbe"]]} onRun={run} adminId={firebaseUser!.uid} />}
      {panel === "cms" && <CmsPanel values={cms} setValues={setCms} onRun={run} adminId={firebaseUser!.uid} />}
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
  ["manageContent", "Content: announcements na videos"],
  ["manageMessages", "Messages: kutuma ujumbe"],
  ["manageReports", "Reports: kuona ripoti"],
  ["manageSettings", "Settings: kubadilisha mfumo"],
  ["manageLicenses", "Leseni: kusimamia templates"],
  ["viewAuditLogs", "Audit logs: kuona historia ya actions"],
] as const;

const panelPermission: Partial<Record<Panel, string>> = { users: "viewUsers", tokens: "manageTokens", services: "manageServices", videos: "manageContent", transactions: "manageReports", announcements: "manageContent", cms: "manageSettings", security: "viewAuditLogs", messages: "manageMessages", licenses: "manageLicenses" };

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
function ServicesPanel({ services, serviceLocks, service, setService, onRun, adminId, busy }: any) {
  const lockBySlug = new Map<string, boolean>();
  for (const entry of serviceLocks as any[]) lockBySlug.set(String(entry.slug ?? entry.id), entry.isLocked === true);
  const serviceBySlug = new Map<string, any>();
  for (const item of serviceCatalog) serviceBySlug.set(item.slug, { ...item, isLocked: item.kind === "locked" });
  for (const item of services as any[]) {
    const slug = String(item.slug ?? item.id ?? "").trim();
    if (slug) serviceBySlug.set(slug, { ...(serviceBySlug.get(slug) ?? {}), ...item, slug, id: item.id });
  }
  const rows = Array.from(serviceBySlug.values()).map((item) => {
    const slug = String(item.slug ?? item.id);
    const storedLock = lockBySlug.get(slug);
    const isLocked = isServiceLocked(slug, storedLock, item.isLocked === true || item.kind === "locked");
    return { ...item, slug, isLocked };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const saveService = () => {
    const { id, isLocked: _isLocked, ...editable } = service;
    onRun(() => adminSaveService(adminId, editable, id || undefined), "Huduma imehifadhiwa.");
  };
  return <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">SERVICE CMS</span><h2>Huduma</h2></div><span className="admin-count">{rows.length}</span></div><div className="form-grid"><Field label="Jina" value={service.name} onChange={(value) => setService({ ...service, name: value })} /><Field label="Slug" value={service.slug} onChange={(value) => setService({ ...service, slug: value })} /><Field label="Icon" value={service.icon} onChange={(value) => setService({ ...service, icon: value })} /><Field label="Kundi" value={service.category} onChange={(value) => setService({ ...service, category: value })} /><Field label="Token cost" type="number" value={service.tokenCost} onChange={(value) => setService({ ...service, tokenCost: Number(value) })} /><Field label="Action URL" value={service.actionUrl} onChange={(value) => setService({ ...service, actionUrl: value })} /></div><label className="control-field"><span>Maelezo</span><textarea value={service.description} onChange={(event) => setService({ ...service, description: event.target.value })} /></label><div className="check-grid"><label><input type="checkbox" checked={service.isFree} onChange={(event) => setService({ ...service, isFree: event.target.checked })} /> Bure</label><label><input type="checkbox" checked={service.isVisible} onChange={(event) => setService({ ...service, isVisible: event.target.checked })} /> Ionyeshe</label></div><button className="admin-primary" disabled={busy || !String(service.name).trim() || !String(service.slug).trim()} onClick={saveService}>Hifadhi taarifa za huduma</button><div className="admin-list">{rows.map((item: any) => <div className="admin-list-row" key={item.slug}><div><strong>{item.name}</strong><small>{item.category} · {item.isFree ? "Bure" : `${item.tokenCost} tokeni`} · {item.isLocked ? "Imefungwa" : "Wazi"}{item.isVisible === false ? " · Imefichwa" : ""}</small></div><div className="table-actions"><button disabled={busy} onClick={() => setService({ ...emptyService, ...item, id: item.id ?? "" })}>Hariri</button><button disabled={busy} className={item.isLocked ? "admin-unlock" : "admin-lock"} onClick={() => onRun(() => adminSetServiceLock(item.slug, !item.isLocked), item.isLocked ? "Huduma imefunguliwa." : "Huduma imefungwa.")}>{item.isLocked ? "Fungua" : "Fungia"}</button>{item.id && <button disabled={busy} className="admin-danger" onClick={() => onRun(() => adminDeleteCollectionItem(adminId, "services", item.id), "Huduma imefutwa.")}><Trash2 size={14} /></button>}</div></div>)}{!rows.length && <Empty text="Hakuna huduma zilizopatikana." />}</div></section>;
}
function CollectionPanel({ title, collectionName, rows, form, setForm, fields, onRun, adminId, readOnly = false }: any) { return <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">FIRESTORE CMS</span><h2>{title}</h2></div></div>{!readOnly && <><div className="form-grid">{fields.map(([key, label]: string[]) => <Field key={key} label={label} value={form[key] ?? ""} onChange={(value) => setForm({ ...form, [key]: key === "order" ? Number(value) : value })} />)}</div><div className="check-grid"><label><input type="checkbox" checked={form.enabled !== false} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> Imewezeshwa</label></div><button className="admin-primary" onClick={() => onRun(() => adminSaveCollectionItem(adminId, collectionName, { ...form, id: undefined }, form.id || undefined), "Imehifadhiwa.")}>Hifadhi</button></>}{<div className="admin-list">{rows.map((item: any) => <div className="admin-list-row" key={item.id}><div><strong>{item.title ?? item.name ?? "Bila kichwa"}</strong><small>{item.body ?? item.videoUrl ?? item.status ?? ""}</small></div>{!readOnly && <div className="table-actions"><button onClick={() => setForm({ ...form, ...item })}>Hariri</button><button onClick={() => onRun(() => adminDeleteCollectionItem(adminId, collectionName, item.id), "Imefutwa.")}><Trash2 size={14} /></button></div>}</div>)}{!rows.length && <Empty />}</div>}</section>; }
function CmsPanel({ values, setValues, onRun, adminId }: any) { return <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">PUBLIC SETTINGS</span><h2>Muonekano & CMS</h2></div></div><div className="form-grid">{[["systemName", "Jina la mfumo"], ["eyebrow", "Maneno ya juu"], ["headline", "Kichwa kikuu"], ["searchPlaceholder", "Ujumbe wa search"], ["whatsapp", "WhatsApp bila +"], ["owner", "Jina la mmiliki"], ["primaryColor", "Rangi kuu"], ["accentColor", "Rangi ya accent"]].map(([key, label]) => <Field key={key} label={label} value={values[key]} onChange={(value) => setValues({ ...values, [key]: value })} />)}</div><label className="control-field"><span>Maelezo</span><textarea value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} /></label><label className="control-field"><span>Footer</span><textarea value={values.footer} onChange={(event) => setValues({ ...values, footer: event.target.value })} /></label><button className="admin-primary" onClick={() => onRun(() => adminSaveSiteSettings(adminId, values), "CMS settings zimehifadhiwa.")}>Hifadhi mabadiliko</button></section>; }
function MessagesPanel({ users, form, setForm, onRun, adminId }: any) { return <section className="admin-card"><div className="admin-card-heading"><div><span className="admin-kicker">MESSAGING</span><h2>Tuma ujumbe</h2></div></div><div className="form-grid"><Field label="Subject" value={form.subject} onChange={(value) => setForm({ ...form, subject: value })} /><label className="control-field"><span>Kwa mtumiaji mmoja</span><select value={form.recipientId} onChange={(event) => setForm({ ...form, recipientId: event.target.value })}><option value="">Kwa wote</option>{users.map((item: any) => <option key={item.id} value={item.id}>{item.name ?? "Bila jina"} — {item.phone || item.email}</option>)}</select></label></div><label className="control-field"><span>Ujumbe</span><textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label><button className="admin-primary" onClick={() => onRun(() => adminSaveCollectionItem(adminId, "messages", { ...form, broadcast: !form.recipientId, sentAt: new Date().toISOString() }), "Ujumbe umetumwa.")}>Tuma ujumbe</button></section>; }
function SecurityPanel({ isSuper, users, audit }: any) { return <div className="admin-two-col"><section className="admin-security-card"><ShieldCheck size={25} /><h2>{isSuper ? "Eneo la siri" : "Usalama wa admin"}</h2><p>{isSuper ? "Una access ya super_admin. Admin management, settings na audit logs zinapatikana." : "Admin wa kawaida hawezi kubadilisha super_admin au system security settings."}</p><div className="security-checks"><span>✓ Firebase Auth</span><span>✓ Role-based access</span><span>✓ Firestore Rules</span><span>✓ No passwords in Firestore</span></div></section><section className="admin-card"><h2>Audit summary</h2><p>Users: {users.length} · Admins: {users.filter((item: any) => ["admin", "super_admin"].includes(item.role)).length}</p><p>Audit actions: {audit.length}</p><small>Kwa custom claims, tumia Firebase Admin SDK katika mazingira ya privileged; frontend haiwezi kujipa role.</small></section></div>; }
function TransactionTable({ rows }: { rows: any[] }) { return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>REFERENCE</th><th>MTUMIAJI</th><th>MAELEZO</th><th>AINA</th><th>KIASI</th><th>BALANCE</th><th>TAREHE</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><code>{item.reference ?? item.id}</code></td><td>{item.userId}</td><td>{item.serviceName ?? item.description ?? "—"}</td><td><span className="pill">{item.type ?? (Number(item.amount) < 0 ? "DEBIT" : "CREDIT")}</span></td><td className={Number(item.amount) < 0 ? "amount-negative" : "amount-positive"}>{item.amount}</td><td>{item.previousBalance ?? "—"} → {item.newBalance ?? item.balanceAfter ?? "—"}</td><td>{dateText(item.createdAt)}</td></tr>)}</tbody></table>{!rows.length && <Empty />}</div>; }
function UserModal({ person, onClose }: { person: any; onClose: () => void }) { return <div className="admin-modal-backdrop" onClick={onClose}><div className="admin-modal" onClick={(event) => event.stopPropagation()}><button className="admin-modal-close" onClick={onClose}><X size={18} /></button><span className="admin-kicker">USER PROFILE</span><h2>{person.name ?? "Bila jina"}</h2><div className="profile-grid">{[["Phone", person.phone], ["Email", person.email], ["Username", person.username], ["Role", person.role], ["Account status", person.accountStatus ?? "active"], ["Verification", person.verificationStatus], ["Token balance", person.tokenBalance ?? 0], ["Total received", person.totalTokensReceived ?? 0], ["Total used", person.totalTokensUsed ?? 0], ["Registration", dateText(person.createdAt)], ["Last login", dateText(person.lastLoginAt)]].map(([label, value]) => <div key={String(label)}><small>{label}</small><strong>{String(value ?? "—")}</strong></div>)}</div><p className="privacy-note">Password za users hazihifadhiwi wala hazionyeshwi kwenye dashboard.</p></div></div>; }


function ServiceOrderingPanel({ services, serviceOrder, setServiceOrder, sectionOrder, setSectionOrder, onSave, busy }: { services: any[]; serviceOrder: string[]; setServiceOrder: (value: string[] | ((current: string[]) => string[])) => void; sectionOrder: string[]; setSectionOrder: (value: string[] | ((current: string[]) => string[])) => void; onSave: () => void; busy: boolean }) {
  const serviceMap = new Map<string, { slug: string; name: string; category: string; isVisible: boolean }>();
  for (const item of serviceCatalog) serviceMap.set(item.slug, { slug: item.slug, name: item.name, category: item.category, isVisible: true });
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
