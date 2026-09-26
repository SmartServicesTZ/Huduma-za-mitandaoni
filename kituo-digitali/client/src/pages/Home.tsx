import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BadgeCheck, Baby, Bell, CarFront, ChevronRight, CircleAlert, CircleDollarSign, Contact, Copy, CreditCard, ExternalLink, FileBadge, FileWarning, HeartHandshake, History, Image, Landmark, LayoutGrid, LockKeyhole, LogIn, Menu, MessageCircle, Music2, Palette, Plane, PlayCircle, QrCode, Radio, Search, ScanFace, Settings2, ShieldCheck, Smartphone, Sparkles, Star, Store, Ticket, Trophy, Tv, UserRound, UserRoundPen, Users, Vote, WalletCards, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { adminAdjustTokens, adminDeleteAnnouncement, adminDeleteService, adminListCollection, adminListServices, adminListTransactions, adminListUsers, adminSaveAnnouncement, adminSaveService, adminUpdateUser, consumeFirebaseTokens, createServiceRequest, firebaseAuth, registerFirebaseUser, signInWithEmailAndPassword, subscribeToCollection, subscribeToTokenHistory, updatePassword, uploadProfileImage } from "@/lib/firebase";
import { announcementText, activitySeed, serviceCatalog, specialServices, tutorials, whatsappUrl, type ServiceCatalogItem } from "../../../shared/catalog";
import AdminDashboard from "./AdminDashboard";

const icons: Record<string, React.ElementType> = { "file-badge": FileBadge, "badge-check": BadgeCheck, contact: Contact, "qr-code": QrCode, vote: Vote, store: Store, ticket: Ticket, copy: Copy, "car-front": CarFront, search: Search, landmark: Landmark, baby: Baby, plane: Plane, "heart-handshake": HeartHandshake, "file-warning": FileWarning, "music-2": Music2, "image-search": Image, smartphone: Smartphone, "scan-face": ScanFace, "user-round-pen": UserRoundPen, palette: Palette, radio: Radio, trophy: Trophy, star: Star, tv: Tv };

function Icon({ name, size = 22 }: { name: string; size?: number }) { const Component = icons[name] ?? Sparkles; return <Component size={size} strokeWidth={1.9} />; }

function Notice({ children, tone = "warning" }: { children: React.ReactNode; tone?: "warning" | "success" | "info" }) { return <div className={`notice notice--${tone}`}><CircleAlert size={17} /> <span>{children}</span></div>; }

function LocalAuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [pending, setPending] = useState(false);
  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((previous) => ({ ...previous, [key]: event.target.value }));
  const submit = async () => {
    if (!form.email.trim() || !form.password) { toast.error("Weka email na password."); return; }
    if (mode === "register" && form.password !== form.confirmPassword) { toast.error("Passwords hazifanani."); return; }
    if (mode === "register" && form.password.length < 6) { toast.error("Password iwe na angalau herufi 6."); return; }
    setPending(true);
    try {
      if (mode === "login") await signInWithEmailAndPassword(firebaseAuth, form.email.trim(), form.password);
      else await registerFirebaseUser({ email: form.email.trim(), password: form.password, firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim() });
      toast.success(mode === "login" ? "Umeingia kwa mafanikio." : "Akaunti imeundwa kwa mafanikio.");
      onClose();
    } catch (error: any) {
      const messages: Record<string, string> = { "auth/invalid-credential": "Email au password si sahihi.", "auth/email-already-in-use": "Email hiyo tayari imesajiliwa.", "auth/invalid-email": "Weka email sahihi.", "auth/too-many-requests": "Majaribio yamezidi. Jaribu tena baadaye." };
      toast.error(messages[error?.code] ?? "Imeshindikana kuingia. Hakikisha Firebase Authentication imewezeshwa.");
    } finally { setPending(false); }
  };
  return <div className="portal-modal-backdrop" onClick={onClose}><div className="portal-modal auth-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={19} /></button><span className="overline">Akaunti salama</span><h3>{mode === "login" ? "INGIA KWENYE AKAUNTI" : "JISAJILI AKAUNTI"}</h3><div className="auth-switch"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Ingia</button><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Jisajili</button></div>{mode === "register" && <div className="auth-fields auth-fields--two"><label>Jina la kwanza<input value={form.firstName} onChange={update("firstName")} /></label><label>Jina la mwisho<input value={form.lastName} onChange={update("lastName")} /></label></div>}<div className="auth-fields"><label>Email<input type="email" autoComplete="email" placeholder="barua pepe" value={form.email} onChange={update("email")} /></label>{mode === "register" && <label>Namba ya simu<input inputMode="tel" placeholder="07XXXXXXXX" value={form.phone} onChange={update("phone")} /></label>}<label>Password<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChange={update("password")} /></label>{mode === "register" && <label>Thibitisha password<input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={update("confirmPassword")} /></label>}</div><button className="button button--green button--wide" disabled={pending} onClick={submit}>{pending ? "INASUBIRI..." : mode === "login" ? "INGIA" : "TENGENEZA AKAUNTI"}</button></div></div>;
}

function AppHeader({ onMenu, search, setSearch }: { onMenu: () => void; search: string; setSearch: (value: string) => void }) {
  const { isAuthenticated, user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  return <>
    <div className="announcement"><Bell size={17} /> <strong>{announcementText}</strong></div>
    <header className="app-header">
      <button className="mobile-menu" onClick={onMenu} aria-label="Fungua menyu"><Menu size={24} /></button>
      <Link href="/" className="portal-brand"><span className="portal-logo"><Zap size={20} /></span><span>HUDUMA ZA <b>MTANDAONI</b></span></Link>
      <label className="global-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tafuta chochote kwenye Google..." /><kbd>⌘ K</kbd></label>
      <div className="header-actions"><button className="header-icon" onClick={() => toast("Hakuna arifa mpya kwa sasa.")} aria-label="Arifa"><Bell size={19} /><i /></button>{isAuthenticated ? <span className="header-user">{user?.name ?? "Mwanachama"}</span> : <button className="button button--green button--small" onClick={() => setAuthOpen(true)}><LogIn size={15} /> Ingia / Jisajili</button>}</div>
    </header>{authOpen && <LocalAuthModal onClose={() => setAuthOpen(false)} />}
  </>;
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const items = [{ href: "/", label: "Mwanzo", icon: LayoutGrid }, { href: "/services", label: "Huduma zote", icon: Zap }, { href: "/tokens", label: "Tokeni", icon: CircleDollarSign }, { href: "/history", label: "Historia", icon: History }, { href: "/account", label: "Akaunti", icon: UserRound }];
  return <aside className="sidebar-portal"><div className="sidebar-brand"><Link href="/" onClick={onClose}>HUDUMA ZA <b>MTANDAONI</b></Link><button className="sidebar-close" onClick={onClose}><X size={20} /></button></div><div className="sidebar-user"><div className="user-avatar">{user?.name?.slice(0, 2).toUpperCase() ?? "HM"}</div><div><strong>{user?.name ?? "Mgeni"}</strong><small>{user ? "Akaunti yangu" : "Ingia kuanza"}</small></div></div><nav>{items.map(({ href, label, icon: ItemIcon }) => <Link key={href} href={href} onClick={onClose} className={`portal-nav-item ${href === "/" ? location === "/" : location.startsWith(href) ? "active" : ""}`}><ItemIcon size={19} /><span>{label}</span></Link>)}</nav>{["super_admin", "admin", "moderator", "support"].includes(user?.role ?? "") && <Link href="/admin" className={`portal-nav-item admin-link ${location.startsWith("/admin") ? "active" : ""}`}><Settings2 size={19} /><span>Paneli ya Admin</span></Link>}<div className="sidebar-foot"><ShieldCheck size={17} /><span>Huduma salama<br /><small>Tokeni zako zinalindwa.</small></span></div></aside>;
}

function TokenCard({ compact = false }: { compact?: boolean }) {
  const { isAuthenticated, profile } = useAuth();
  const balance = profile?.tokenBalance ?? 0;
  const status = profile?.verificationStatus ?? "pending";
  return <section className={`token-card ${compact ? "token-card--compact" : ""}`}><div className="token-card__top"><div className="token-icon"><WalletCards size={26} /></div><div><span className="overline">Tokeni zako</span><strong>{isAuthenticated ? balance : 0}</strong><span className="token-label">tokeni</span></div></div><div className="token-card__meta"><span>Email: <b>{profile?.email ?? "—"}</b></span><span className={`verification verification--${status}`}>{status === "approved" ? "Imeidhinishwa" : "Haijathibitishwa"}</span></div>{status !== "approved" && isAuthenticated && <div className="account-warning">Akaunti yako haijathibitishwa na admin. Tafadhali wasiliana na admin ili aidhinishe na akupe tokeni.</div>}<a className="button button--green button--wide" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={18} /> NUNUA TOKENI (WHATSAPP)</a><small className="token-note">Kila upakuaji hukata tokeni 2.</small></section>;
}

function ServiceCard({ service, onUse }: { service: ServiceCatalogItem; onUse: (service: ServiceCatalogItem) => void }) {
  const locked = service.kind === "locked";
  return <button className={`portal-service-card service-${service.kind}`} onClick={() => onUse(service)}><div className="service-card-icon"><Icon name={service.icon} /></div><div className="service-card-copy"><strong>{service.name}</strong><span>{service.description}</span></div><div className="service-card-foot">{locked ? <span className="locked-label"><LockKeyhole size={14} /> IMEFUNGWA</span> : service.kind === "free" ? <span className="free-label">Bure</span> : <span className="paid-label"><CreditCard size={14} /> Tokeni {service.tokenCost}</span>}<ChevronRight size={17} /></div></button>;
}

function ServiceGrid({ title, services, onUse }: { title: string; services: ServiceCatalogItem[]; onUse: (service: ServiceCatalogItem) => void }) { return <section className="portal-section"><div className="section-title"><div><span className="overline">Mkusanyiko wa huduma</span><h2>{title}</h2></div><span className="section-count">{services.length}</span></div><div className="portal-service-grid">{services.map((service) => <ServiceCard key={service.slug} service={service} onUse={onUse} />)}</div></section>; }

function SpecialSection() {
  const open = (item: typeof specialServices[number]) => { if (item.action === "whatsapp") window.open(whatsappUrl, "_blank", "noopener,noreferrer"); else toast("Tuma ujumbe WhatsApp kupata maelezo ya malipo.", { action: { label: "WhatsApp", onClick: () => window.open(whatsappUrl, "_blank") } }); };
  return <section className="portal-section"><div className="section-title"><div><span className="overline">Ofa na jumuiya</span><h2>HUDUMA MAALUM</h2></div></div><div className="special-grid">{specialServices.map((item) => <button key={item.slug} className={`special-card special-card--${item.tone}`} onClick={() => open(item)}><div><strong>{item.name}</strong><small>{item.action === "whatsapp" ? "Fungua WhatsApp" : "Wasiliana nasi kwa malipo"}</small></div><ExternalLink size={18} /></button>)}</div></section>;
}

function TutorialsSection() {
  const [selected, setSelected] = useState<typeof tutorials[number] | null>(null);
  return <section className="portal-section"><div className="section-title"><div><span className="overline">Jifunze kwa hatua</span><h2>VIDEO ZA MAFUNZO</h2></div></div><div className="tutorial-grid">{tutorials.map((item) => <button className="tutorial-card" key={item.slug} onClick={() => setSelected(item)}><span className="play-circle"><PlayCircle size={25} /></span><strong>{item.title}</strong><small>{item.description}</small><span className="paid-label"><CreditCard size={13} /> Tokeni {item.tokenCost}</span></button>)}</div>{selected && <div className="portal-modal-backdrop" onClick={() => setSelected(null)}><div className="portal-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)}><X size={19} /></button><PlayCircle size={42} className="modal-symbol" /><h3>{selected.title}</h3>{selected.videoUrl ? <video src={selected.videoUrl} controls /> : <Notice tone="info">Video itaongezwa na admin hivi karibuni. Hakuna kiungo bandia kilichowekwa.</Notice>}<button className="button button--green button--wide" onClick={() => setSelected(null)}>Funga</button></div></div>}</section>;
}

function HistoryPage() {
  const { isAuthenticated, firebaseUser } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { if (!firebaseUser) { setRows([]); return; } return subscribeToTokenHistory(firebaseUser.uid, setRows); }, [firebaseUser]);
  return <main className="portal-main"><div className="page-heading"><div><span className="overline">Rekodi zako</span><h1>HISTORIA YA TOKENI</h1><p>Angalia tokeni zilizotumika, zilizoongezwa na salio lako.</p></div></div><div className="history-table"><div className="history-head"><span>Tarehe</span><span>Huduma</span><span>Tokeni</span><span>Salio</span><span>Rejea</span></div>{rows.length ? rows.map((row) => <div className="history-row" key={row.reference ?? row.id}><span>{row.createdAt?.toDate ? row.createdAt.toDate().toLocaleString("sw-TZ") : "—"}</span><strong>{row.description}</strong><span className={row.amount < 0 ? "amount-negative" : "amount-positive"}>{row.amount > 0 ? "+" : ""}{row.amount}</span><span>{row.balanceAfter}</span><code>{row.reference ?? row.id}</code></div>) : activitySeed.map((row) => <div className="history-row" key={row.reference}><span>{new Date(row.createdAt).toLocaleDateString("sw-TZ")}</span><strong>{row.service}</strong><span className="amount-negative">-{row.credits}</span><span>0</span><code>{row.reference}</code></div>)}</div><Notice tone="info">Historia halisi ya tokeni itaonekana hapa baada ya kutumia huduma.</Notice></main>;
}

function AdminPage() { return <AdminDashboard />; }
function AccountPage() {
  const { isAuthenticated, user, profile, firebaseUser, logout, updateProfile: saveProfile } = useAuth();
  const [names, setNames] = useState({ firstName: "", lastName: "" });
  const [newPassword, setNewPassword] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const chooseProfileImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !firebaseUser) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error("Chagua picha ya JPG, PNG au WebP."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Picha isizidi MB 2."); return; }
    setImageBusy(true); void uploadProfileImage(firebaseUser.uid, file).then(() => toast.success("Picha ya profile imehifadhiwa kwenye Storage.")).catch((error: any) => toast.error(error?.message ?? "Imeshindikana kuhifadhi picha.")).finally(() => setImageBusy(false));
  };
  const saveNames = async () => { try { await saveProfile({ firstName: names.firstName || profile?.firstName, lastName: names.lastName || profile?.lastName, name: `${names.firstName || profile?.firstName || ""} ${names.lastName || profile?.lastName || ""}`.trim() }); toast.success("Taarifa zimehifadhiwa."); } catch { toast.error("Imeshindikana kuhifadhi taarifa."); } };
  const saveNewPassword = async () => { if (!firebaseUser || newPassword.length < 6) { toast.error("Password iwe na angalau herufi 6."); return; } try { await updatePassword(firebaseUser, newPassword); setNewPassword(""); toast.success("Password imebadilishwa kwa usalama."); } catch { toast.error("Kwa usalama, ingia tena kabla ya kubadilisha password."); } };
  return <main className="portal-main"><div className="page-heading"><div><span className="overline">Wasifu na usalama</span><h1>AKAUNTI</h1><p>Simamia taarifa za akaunti, lugha na taarifa zako.</p></div></div>{!isAuthenticated ? <section className="account-panel"><Notice>Ingia ili kuona akaunti yako binafsi.</Notice><button className="button button--green" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Tumia kitufe cha Ingia / Jisajili juu</button></section> : <div className="account-grid"><section className="account-panel"><div className="large-avatar">{profile?.profileImageUrl ? <img src={profile.profileImageUrl} alt="Picha ya profile" /> : user?.name?.slice(0, 2).toUpperCase() ?? "HM"}</div><label className="profile-image-picker">{imageBusy ? "Inapakia picha..." : "Weka au badilisha picha"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProfileImage} disabled={imageBusy} /></label><small className="profile-image-help">JPG, PNG au WebP — hadi MB 2.</small><h2>{profile?.name ?? "Mwanachama"}</h2><p>{profile?.email ?? ""}</p><Notice tone="success">Akaunti yako inalindwa na Firebase Authentication.</Notice><div className="auth-fields auth-fields--two"><label>Jina la kwanza<input value={names.firstName || profile?.firstName || ""} onChange={(event) => setNames({ ...names, firstName: event.target.value })} /></label><label>Jina la mwisho<input value={names.lastName || profile?.lastName || ""} onChange={(event) => setNames({ ...names, lastName: event.target.value })} /></label></div><button className="button button--green" onClick={saveNames}>Hifadhi taarifa</button><hr /><h3>Badilisha password</h3><div className="auth-fields"><input type="password" placeholder="Password mpya" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div><button className="button button--dark" onClick={saveNewPassword}>Badilisha password</button><button className="button button--dark" onClick={() => logout()}>Toka kwenye akaunti</button></section><section className="account-side"><div className="account-panel"><h3>Tokeni</h3><p>Salio lako: <strong>{profile?.tokenBalance ?? 0} tokeni</strong></p><p>Hali ya akaunti: {profile?.verificationStatus === "approved" ? "Imeidhinishwa" : "Inasubiri uthibitisho"}</p></div><div className="account-panel"><h3>Ujumbe</h3><Notice tone="info">Ujumbe wa mfumo utaonekana hapa.</Notice></div></section></div>}</main>;
}

function PortalHome({ search, onUse, services }: { search: string; onUse: (service: ServiceCatalogItem) => void; services: ServiceCatalogItem[] }) {
  const [liveServices, setLiveServices] = useState<ServiceCatalogItem[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  useEffect(() => {
    const stopServices = subscribeToCollection("services", (rows) => setLiveServices(rows.filter((item) => item.isVisible !== false).map((item) => ({ slug: String(item.slug ?? item.id), name: String(item.name ?? ""), description: String(item.description ?? ""), icon: String(item.icon ?? "sparkles"), tokenCost: Number(item.tokenCost ?? 0), category: String(item.category ?? "Huduma kuu"), kind: (item.isLocked ? "locked" : item.isFree ? "free" : "paid") as ServiceCatalogItem["kind"] }))));
    const stopAnnouncements = subscribeToCollection("announcements", (rows) => setAnnouncements(rows.filter((item) => item.enabled !== false)));
    return () => { stopServices(); stopAnnouncements(); };
  }, []);
  const displayedServices = liveServices.length ? liveServices : services;
  const lower = search.toLowerCase();
  const matches = displayedServices.filter((service) => `${service.name} ${service.description} ${service.category}`.toLowerCase().includes(lower));
  const main = matches.filter((service) => service.category === "Huduma kuu" || service.category === "Huduma za bure");
  const locked = matches.filter((service) => service.kind === "locked");
  const tools = matches.filter((service) => service.category === "Zana za ziada");
  return <main className="portal-main"><div className="welcome-strip"><div><span className="overline">Karibu HUDUMA ZA MTANDAONI</span><h1>Huduma zako, sehemu moja.</h1><p>Chagua huduma unayotaka. Tokeni hukatwa kwa usalama kwenye mfumo.</p></div><Sparkles size={44} /></div>{announcements.map((item) => <Notice key={item.id} tone="info"><strong>{item.title}</strong>{item.body ? ` — ${item.body}` : ""}</Notice>)}<TokenCard /><ServiceGrid title="HUDUMA ZOTE" services={main} onUse={onUse} /><ServiceGrid title="HUDUMA ZILIZOFUNGWA" services={locked} onUse={onUse} /><SpecialSection /><ServiceGrid title="ZANA ZA ZIADA" services={tools} onUse={onUse} /><TutorialsSection /></main>;
}

function ServiceWorkspace({ service }: { service: ServiceCatalogItem }) {
  const { firebaseUser } = useAuth();
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!firebaseUser || !details.trim()) { toast.error("Andika maelezo ya ombi lako kwanza."); return; }
    setBusy(true);
    try { const reference = await createServiceRequest(firebaseUser.uid, service, details); setDetails(""); toast.success("Ombi limepokelewa.", { description: `Rejea: ${reference}` }); }
    catch (error: any) { toast.error(error?.message ?? "Imeshindikana kutuma ombi."); }
    finally { setBusy(false); }
  };
  return <main className="portal-main"><div className="page-heading"><div><span className="overline">WORKSPACE YA HUDUMA</span><h1>{service.name}</h1><p>{service.description}</p></div><Icon name={service.icon} size={42} /></div><section className="account-panel service-workspace"><Notice tone="success">Tokeni ya huduma hii imekatwa kwa mafanikio. Weka taarifa zako hapa ili ombi liende kwa admin.</Notice><label className="control-field"><span>Maelezo ya ombi / taarifa muhimu</span><textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Andika jina, namba ya simu, TIN, au maelezo yanayohitajika..." rows={8} /></label><button className="button button--green" disabled={busy} onClick={submit}>{busy ? "INATUMA..." : "TUMA OMBI LA HUDUMA"}</button></section></main>;
}

function BottomNav() { return <nav className="bottom-nav">{[{ href: "/", label: "Mwanzo", icon: LayoutGrid }, { href: "/services", label: "Huduma", icon: Zap }, { href: "/tokens", label: "Tokeni", icon: CircleDollarSign }, { href: "/history", label: "Historia", icon: History }, { href: "/account", label: "Akaunti", icon: UserRound }].map(({ href, label, icon: ItemIcon }) => <Link href={href} key={href}><ItemIcon size={19} /><span>{label}</span></Link>)}</nav>; }

export default function Home() {
  const [location, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { isAuthenticated, firebaseUser } = useAuth();
  const tokenOperationKeys = useRef(new Map<string, string>());
  const appearance = { data: null as null | { backgroundColor?: string; primaryColor?: string; secondaryColor?: string } };
  const servicesQuery = { data: null as null };
  const useService = { mutate: async (service: ServiceCatalogItem) => { if (!firebaseUser) return; const requestId = tokenOperationKeys.current.get(service.slug) ?? crypto.randomUUID(); tokenOperationKeys.current.set(service.slug, requestId); try { const result = await consumeFirebaseTokens(firebaseUser.uid, service, requestId); toast.success(`${service.name} imefunguliwa.`, { description: `Rejea: ${result.reference}` }); if (service.actionUrl) window.open(service.actionUrl, "_blank", "noopener,noreferrer"); else navigate(`/service/${service.slug}`); } catch (error: any) { toast.error(error?.message ?? "Imeshindikana kutumia huduma."); } finally { tokenOperationKeys.current.delete(service.slug); } } };
  const handleUse = (service: ServiceCatalogItem) => { if (service.kind === "locked") { toast.error("Huduma hii imefungwa kwa sasa."); return; } if (!isAuthenticated) { toast("Ingia kwanza ili kutumia huduma kwa kutumia kitufe cha Ingia / Jisajili."); return; } if (!tokenOperationKeys.current.has(service.slug)) useService.mutate(service); };
  const services = servicesQuery.data ? (servicesQuery.data as unknown as Array<Record<string, unknown>>).map((item) => ({ slug: String(item.slug), name: String(item.name), description: String(item.description), icon: String(item.icon), tokenCost: Number(item.tokenCost), category: String(item.category), kind: (item.isLocked ? "locked" : item.isFree ? "free" : "paid") as ServiceCatalogItem["kind"] })) : serviceCatalog;
  const serviceSlug = location.startsWith("/service/") ? location.slice("/service/".length) : "";
  const selectedService = services.find((item) => item.slug === serviceSlug) ?? serviceCatalog.find((item) => item.slug === serviceSlug);
  const page = location.startsWith("/admin") ? <AdminPage /> : selectedService ? <ServiceWorkspace service={selectedService} /> : location === "/history" ? <HistoryPage /> : location === "/account" ? <AccountPage /> : location === "/tokens" ? <main className="portal-main"><TokenCard /><Notice tone="info">Nunua tokeni kupitia WhatsApp ili admin aweze kukuwekea tokeni kwenye akaunti yako.</Notice></main> : <PortalHome search={search} onUse={handleUse} services={services} />;
  return <div className="portal-shell" style={{ "--navy": appearance.data?.backgroundColor ?? "#071a36", "--green": appearance.data?.primaryColor ?? "#18b969", "--navy-2": appearance.data?.secondaryColor ?? "#0b2447" } as React.CSSProperties}><div className={`portal-overlay ${menuOpen ? "show" : ""}`} onClick={() => setMenuOpen(false)} /><div className={`portal-sidebar-wrap ${menuOpen ? "open" : ""}`}><Sidebar onClose={() => setMenuOpen(false)} /></div><div className="portal-content"><AppHeader onMenu={() => setMenuOpen(true)} search={search} setSearch={setSearch} />{page}<footer className="portal-footer">Programu hii ilitengenezwa na Bw. Zoom Cotex Limited <span>© Haki zote zimehifadhiwa 2026</span></footer></div><BottomNav /></div>;
}
