import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BadgeCheck, Baby, Eye, EyeOff, Bell, CarFront, ChevronRight, CircleAlert, CircleDollarSign, Contact, Copy, CreditCard, ExternalLink, FileBadge, FileWarning, HeartHandshake, History, Image, Landmark, LayoutGrid, LockKeyhole, LogIn, Menu, MessageCircle, Music2, Palette, Plane, PlayCircle, QrCode, Radio, Search, ScanFace, Settings2, ShieldCheck, Smartphone, Sparkles, Star, Store, Ticket, Trophy, Tv, UserRound, UserRoundPen, Users, Vote, WalletCards, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { adminAdjustTokens, adminDeleteAnnouncement, adminDeleteService, adminListCollection, adminListServices, adminListTransactions, adminListUsers, adminSaveAnnouncement, adminSaveService, adminUpdateUser, consumeFirebaseTokens, createServiceRequest, createTokenPurchaseOrder, ensureDefaultServiceCatalog, firebaseAuth, registerFirebaseUser, sendPasswordReset, signInWithPhonePassword, subscribeToCollection, subscribeToTokenHistory, subscribeToTokenPurchaseOrders, subscribeUserMessages, updatePassword, uploadProfileImage, type TokenPurchaseOrder } from "@/lib/firebase";
import { announcementText, mergeServiceCatalogDefaults, specialServices, tutorials, whatsappUrl, type ServiceCatalogItem } from "../../../shared/catalog";
import { completeOrder, defaultHomepageSectionOrder, isServiceLocked, orderByIds, type HomepageSectionId } from "../../../shared/serviceOrdering";
import AdminDashboard from "./AdminDashboard";
import BusinessLicensePage from "./BusinessLicensePage";
import LipaNumberPage from "./LipaNumberPage";
import TINCertificatePage from "./TINCertificatePage";
import AirtelSmeContractPage from "./AirtelSmeContractPage";
import AgentStickerPage from "./AgentStickerPage";
import DynamicServicePage from "./DynamicServicePage";

const icons: Record<string, React.ElementType> = { "file-badge": FileBadge, "badge-check": BadgeCheck, contact: Contact, "qr-code": QrCode, vote: Vote, store: Store, ticket: Ticket, copy: Copy, "car-front": CarFront, search: Search, landmark: Landmark, baby: Baby, plane: Plane, "heart-handshake": HeartHandshake, "file-warning": FileWarning, "music-2": Music2, "image-search": Image, smartphone: Smartphone, "scan-face": ScanFace, "user-round-pen": UserRoundPen, palette: Palette, radio: Radio, trophy: Trophy, star: Star, tv: Tv };

function Icon({ name, size = 22 }: { name: string; size?: number }) { const Component = icons[name] ?? Sparkles; return <Component size={size} strokeWidth={1.9} />; }

function Notice({ children, tone = "warning" }: { children: React.ReactNode; tone?: "warning" | "success" | "info" }) { return <div className={`notice notice--${tone}`}><CircleAlert size={17} /> <span>{children}</span></div>; }

function explainAuthError(error: any, mode: "login" | "register") {
  const code = String(error?.code ?? "").replace(/^auth\//, "");
  const messages: Record<string, { title: string; detail: string }> = {
    "invalid-credential": { title: "Email au password si sahihi", detail: "Kagua email na password yako, kisha jaribu tena." },
    "user-not-found": { title: "Akaunti haijapatikana", detail: "Email hii haijasajiliwa bado. Tumia Jisajili kutengeneza akaunti." },
    "wrong-password": { title: "Password si sahihi", detail: "Kagua password yako. Usishiriki password yako na mtu mwingine." },
    "email-already-in-use": { title: "Email hii tayari imesajiliwa", detail: "Tumia Ingia, au tumia email nyingine kwa akaunti mpya." },
    "profile/setup-failed": { title: "Akaunti imetengenezwa; profile haikukamilika", detail: "Usijisajili tena kwa email hii. Tumia Ingia; baada ya Firestore kurekebishwa mfumo utajaribu kukamilisha profile yako." },
    "invalid-email": { title: "Email si sahihi", detail: "Andika email yenye muundo sahihi, mfano jina@example.com." },
    "weak-password": { title: "Password ni dhaifu", detail: "Tumia password yenye angalau herufi 6." },
    "too-many-requests": { title: "Majaribio yamezidi", detail: "Subiri muda kidogo kabla ya kujaribu tena." },
    "operation-not-allowed": { title: "Usajili wa email haujawashwa", detail: "Admin awashe Email/Password kwenye Firebase Authentication > Sign-in method." },
    "unauthorized-domain": { title: "Domain ya website haijaidhinishwa", detail: "Admin aongeze steward-tz.github.io kwenye Firebase Authentication > Settings > Authorized domains." },
    "invalid-api-key": { title: "Firebase API key si sahihi", detail: "Configuration ya Firebase inahitaji kusahihishwa na admin wa mfumo." },
    "network-request-failed": { title: "Mtandao haupatikani", detail: "Kagua internet yako kisha jaribu tena." },
    "permission-denied": { title: "Ruhusa imekataliwa", detail: "Firebase imekataa kuhifadhi profile. Admin akague Firestore Rules." },
  };
  const known = messages[code];
  return { title: known?.title ?? `Imeshindikana ${mode === "login" ? "kuingia" : "kusajili"}`, detail: known?.detail ?? String(error?.message ?? "Firebase imerudisha hitilafu isiyojulikana."), code: code || "unknown" };
}

function PasswordChangeGate({ firebaseUser, saveProfile }: { firebaseUser: import("firebase/auth").User; saveProfile: (values: any) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const submit = async () => {
    if (password.length < 6) { toast.error("Password mpya iwe na angalau herufi 6."); return; }
    if (password !== confirm) { toast.error("Password hazifanani."); return; }
    setBusy(true);
    try {
      await updatePassword(firebaseUser, password);
      await saveProfile({ mustChangePassword: false });
      setPassword(""); setConfirm("");
      toast.success("Password mpya imewekwa. Akaunti yako iko tayari kutumia.");
    } catch (error: any) {
      toast.error(error?.message ?? "Imeshindikana kubadilisha password. Jaribu tena.");
    } finally { setBusy(false); }
  };
  return <div className="admin-modal-backdrop password-gate-backdrop"><div className="admin-modal password-gate" onClick={(event) => event.stopPropagation()}>
    <span className="admin-kicker">USALAMA WA AKAUNTI</span><h2>Weka password yako mpya</h2>
    <p>Admin amekuwekea password ya muda. Kwa usalama, unatakiwa kuiweka password yako binafsi kabla ya kuendelea.</p>
    <label className="control-field"><span>Password mpya</span><input type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <label className="control-field"><span>Rudia password mpya</span><input type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
    <label className="check-inline"><input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} /> Onyesha password</label>
    <button className="admin-primary" disabled={busy} onClick={submit}>{busy ? "Inahifadhi..." : "Weka password mpya"}</button>
  </div></div>;
}

function VerifiedTick({ verified }: { verified?: boolean }) {
  return verified ? <span className="verified-tick" title="Akaunti imethibitishwa na admin" aria-label="Verified">✓</span> : null;
}

function LocalAuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", password: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [authError, setAuthError] = useState<{ title: string; detail: string; code: string } | null>(null);
  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((previous) => ({ ...previous, [key]: event.target.value }));
  const submit = async () => {
    setAuthError(null);
    if (!form.phone.trim() || !form.password) { setAuthError({ title: "Taarifa hazijakamilika", detail: "Weka namba ya simu na password kabla ya kuendelea.", code: "form/incomplete" }); return; }
    if (mode === "register" && (!form.firstName.trim() || !form.lastName.trim())) { setAuthError({ title: "Taarifa za usajili hazijakamilika", detail: "Jaza jina la kwanza na jina la mwisho.", code: "form/profile-required" }); return; }
    if (mode === "register" && !/^0\d{9}$/.test(form.phone.replace(/[\s()-]/g, ""))) { setAuthError({ title: "Namba ya simu si sahihi", detail: "Tumia namba ya Tanzania ya tarakimu 10, mfano 0698232313.", code: "form/invalid-phone" }); return; }
    if (mode === "register" && form.password !== form.confirmPassword) { setAuthError({ title: "Password hazifanani", detail: "Andika password ileile kwenye sehemu zote mbili.", code: "form/password-mismatch" }); return; }
    if (mode === "register" && form.password.length < 6) { setAuthError({ title: "Password ni fupi", detail: "Password iwe na angalau herufi 6.", code: "form/weak-password" }); return; }
    setPending(true);
    try {
      if (mode === "login") await signInWithPhonePassword(form.phone.trim(), form.password);
      else await registerFirebaseUser({ password: form.password, firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim() });
      toast.success(mode === "login" ? "Umeingia kwa mafanikio." : "Akaunti imeundwa kwa mafanikio.");
      onClose();
    } catch (error: any) {
      const code = String(error?.code ?? "").replace(/^auth\//, "");
      const messages: Record<string, { title: string; detail: string }> = {
        "invalid-credential": { title: "Namba au password si sahihi", detail: "Kagua namba ya simu na password yako, kisha jaribu tena." },
        "user-not-found": { title: "Akaunti haijapatikana", detail: "Namba hii haijasajiliwa bado. Tumia Jisajili kutengeneza akaunti." },
        "wrong-password": { title: "Password si sahihi", detail: "Kagua password yako kisha jaribu tena." },
        "email-already-in-use": { title: "Namba hii tayari imesajiliwa", detail: "Tumia Ingia kwa kutumia namba hiyo." },
        "weak-password": { title: "Password ni dhaifu", detail: "Password iwe na angalau herufi 6." },
        "too-many-requests": { title: "Majaribio yamezidi", detail: "Subiri muda kidogo kabla ya kujaribu tena." },
        "operation-not-allowed": { title: "Mfumo wa usajili haujawashwa", detail: "Admin akague Firebase Authentication > Email/Password." },
        "unauthorized-domain": { title: "Domain ya website haijaidhinishwa", detail: "Admin aongeze domain ya website kwenye Firebase Authentication." },
        "network-request-failed": { title: "Mtandao haupatikani", detail: "Kagua internet yako kisha jaribu tena." },
        "permission-denied": { title: "Ruhusa imekataliwa", detail: "Firebase imekataa kuhifadhi profile. Kagua Firestore Rules." },
      };
      const known = messages[code];
      const explanation = { title: known?.title ?? "Imeshindikana", detail: known?.detail ?? String(error?.message ?? "Jaribu tena."), code: code || "unknown" };
      setAuthError(explanation);
      toast.error(explanation.title);
    } finally { setPending(false); }
  };
  const resetPassword = () => {
    const phone = "255698232313";
    const message = "Habari, nimesahau password ya akaunti yangu ya Huduma za Mtandaoni. Namba yangu ya simu ni: " + (form.phone.trim() || "sijaweka");
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
  };
  const PasswordField = ({ confirm = false }: { confirm?: boolean }) => {
    const value = confirm ? form.confirmPassword : form.password;
    const visible = confirm ? showConfirmPassword : showPassword;
    const setVisible = confirm ? setShowConfirmPassword : setShowPassword;
    return <div className="password-field"><input required type={visible ? "text" : "password"} autoComplete={confirm ? "new-password" : mode === "login" ? "current-password" : "new-password"} value={value} onChange={update(confirm ? "confirmPassword" : "password")} placeholder={confirm ? "Thibitisha password" : "Password"} /><button type="button" aria-label={visible ? "Ficha password" : "Onesha password"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>;
  };
  return <div className="portal-modal-backdrop" onClick={onClose}><div className="portal-modal auth-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={19} /></button><span className="overline">Akaunti salama</span><h3>{mode === "login" ? "INGIA KWENYE AKAUNTI" : "JISAJILI AKAUNTI"}</h3><div className="auth-switch"><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setAuthError(null); }}>Ingia</button><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setAuthError(null); }}>Jisajili</button></div>{authError && <div className="auth-error-alert" role="alert"><div className="auth-error-alert__icon"><CircleAlert size={20} /></div><div><strong>{authError.title}</strong><p>{authError.detail}</p><code>{authError.code}</code></div></div>}<form onSubmit={(event) => { event.preventDefault(); void submit(); }}>{mode === "register" && <div className="auth-fields auth-fields--two"><label>Jina la kwanza<input required autoComplete="given-name" value={form.firstName} onChange={update("firstName")} /></label><label>Jina la mwisho<input required autoComplete="family-name" value={form.lastName} onChange={update("lastName")} /></label></div>}<div className="auth-fields"><label>Namba ya simu<input required inputMode="tel" autoComplete="tel" placeholder="0698232313" value={form.phone} onChange={update("phone")} /></label><label>{mode === "login" ? "Nenosiri" : "Nenosiri"}<PasswordField /></label>{mode === "register" && <label>Nenosiri la Thibitisha<PasswordField confirm /></label>}</div>{mode === "login" && <button type="button" className="button button--green button--small" disabled={pending} onClick={resetPassword}>Umesahau Nenosiri → WhatsApp</button>}<button type="submit" className="button button--green button--wide" disabled={pending}>{pending ? "INASUBIRI..." : mode === "login" ? "INGIA" : "TENGENEZA AKAUNTI"}</button></form></div></div>;
}

function AppHeader({ onMenu, search, setSearch }: { onMenu: () => void; search: string; setSearch: (value: string) => void }) {
  const { isAuthenticated, user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === "Escape" && document.activeElement === searchRef.current) searchRef.current?.blur();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return <>
    <div className="announcement"><Bell size={17} /> <strong>{announcementText}</strong></div>
    <header className="app-header">
      <button className="mobile-menu" onClick={onMenu} aria-label="Fungua menyu"><Menu size={24} /></button>
      <Link href="/" className="portal-brand"><span className="portal-logo"><Zap size={20} /></span><span><b>$TEWARD TZ</b><small className="brand-subtitle">HUDUMA ZA MTANDAONI</small></span></Link>
      <label className="global-search"><Search size={18} /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tafuta huduma, akaunti au sehemu..." aria-label="Tafuta huduma" /><kbd>Ctrl/⌘ K</kbd></label>
      <div className="header-actions"><a className="header-support" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="Wasiliana na support kupitia WhatsApp"><MessageCircle size={17} /><span>WhatsApp</span></a><button className="header-icon" onClick={() => toast("Hakuna arifa mpya kwa sasa.")} aria-label="Arifa"><Bell size={19} /><i /></button>{isAuthenticated ? <span className="header-user">{user?.name ?? "Mwanachama"} <VerifiedTick verified={user?.verificationStatus === "approved"} /></span> : <button className="button button--green button--small" onClick={() => setAuthOpen(true)}><LogIn size={15} /> Ingia / Jisajili</button>}</div>
    </header>{authOpen && <LocalAuthModal onClose={() => setAuthOpen(false)} />}
  </>;
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const items = [{ href: "/", label: "Mwanzo", icon: LayoutGrid }, { href: "/services", label: "Huduma zote", icon: Zap }, { href: "/tokens", label: "Tokeni", icon: CircleDollarSign }, { href: "/history", label: "Historia", icon: History }, { href: "/account", label: "Akaunti", icon: UserRound }];
  return <aside className="sidebar-portal"><div className="sidebar-brand"><Link href="/" onClick={onClose}><b>$TEWARD TZ</b><small className="brand-subtitle">HUDUMA ZA MTANDAONI</small></Link><button className="sidebar-close" onClick={onClose}><X size={20} /></button></div><div className="sidebar-user"><div className="user-avatar">{user?.name?.slice(0, 2).toUpperCase() ?? "HM"}</div><div><strong>{user?.name ?? "Mgeni"} <VerifiedTick verified={user?.verificationStatus === "approved"} /></strong><small>{user ? "Akaunti yangu" : "Ingia kuanza"}</small></div></div><nav>{items.map(({ href, label, icon: ItemIcon }) => <Link key={href} href={href} onClick={onClose} className={`portal-nav-item ${href === "/" ? location === "/" : location.startsWith(href) ? "active" : ""}`}><ItemIcon size={19} /><span>{label}</span></Link>)}</nav>{["super_admin", "admin", "moderator", "support"].includes(user?.role ?? "") && <Link href="/admin" className={`portal-nav-item admin-link ${location.startsWith("/admin") ? "active" : ""}`}><Settings2 size={19} /><span>Paneli ya Admin</span></Link>}<div className="sidebar-foot"><ShieldCheck size={17} /><span>Huduma salama<br /><small>Tokeni zako zinalindwa.</small></span></div></aside>;
}

function TokenCard({ compact = false }: { compact?: boolean }) {
  const { isAuthenticated, profile, firebaseUser } = useAuth();
  const [orders, setOrders] = useState<TokenPurchaseOrder[]>([]);
  const [busyAmount, setBusyAmount] = useState<number | null>(null);
  
  const balance = profile?.tokenBalance ?? 0;
  const status = profile?.verificationStatus ?? "pending";
  const paymentsPaused = String(import.meta.env.VITE_PAYMENT_FLOWS_ENABLED ?? "").trim().toLowerCase() !== "true";
  useEffect(() => {
    if (!firebaseUser) { setOrders([]); return; }
    return subscribeToTokenPurchaseOrders(firebaseUser.uid, setOrders, () => toast.error("Imeshindikana kupakia hali ya malipo."));
  }, [firebaseUser]);
  const startPurchase = async (amount: number) => {
    if (!firebaseUser) { toast.error("Ingia kwenye akaunti yako kabla ya kununua tokeni."); return; }
    setBusyAmount(amount);
    try {
      const result = await createTokenPurchaseOrder(amount);
      if (result.status === "PAID") toast.success("Malipo tayari yamethibitishwa.");
      else toast.success("Ombi la malipo limetumwa. Thibitisha ujumbe wa USSD kwenye simu yako.");
    } catch (error: any) {
      toast.error(error?.message ?? "Imeshindikana kuanzisha malipo.");
    } finally { setBusyAmount(null); }
  };
  const statusLabel = (value: string) => value === "PAID" ? "Imelipwa — tokeni zimeongezwa" : ["PENDING", "CREATING", "CREATE_UNKNOWN", "INPROGRESS"].includes(value) ? "Ombi la awali linasubiri ukaguzi; ununuzi mpya umesitishwa" : value === "NEEDS_REVIEW" ? "Malipo yanasubiri ukaguzi wa msaada" : value === "CREATE_FAILED" ? "Malipo hayakuanzishwa; jaribu tena baadaye" : `Hali ya malipo: ${value}`;
  const packages = [{ amount: 2000, credits: 40 }, { amount: 5000, credits: 100 }, { amount: 10000, credits: 200 }];
  const hasOpenOrder = orders.some((order) => ["CREATING", "CREATE_UNKNOWN", "PENDING", "INPROGRESS"].includes(order.status));
  return <section className={`token-card ${compact ? "token-card--compact" : ""}`}>
    <div className="token-card__top"><div className="token-icon"><WalletCards size={26} /></div><div><span className="overline">Tokeni zako</span><strong>{isAuthenticated ? balance : 0}</strong><span className="token-label">tokeni</span></div></div>
    <div className="token-card__meta"><span>Simu: <b>{profile?.phone ?? "—"}</b></span><span className={`verification verification--${status}`}>{status === "approved" ? "✓ Imeidhinishwa" : "Inasubiri idhini ya admin"}</span></div>
    {status !== "approved" && isAuthenticated && <div className="account-warning">Akaunti yako haijathibitishwa na admin. Huduma zitaanza baada ya admin kuidhinisha akaunti.</div>}
    
    {paymentsPaused ? <div className="account-warning" role="status">Ununuzi wa tokeni kupitia FimiPay umesitishwa kwa muda. Salio lililopo limehifadhiwa; hakuna tokeni za bure zinazotolewa.</div> : <div className="token-package-grid">{packages.map(({ amount, credits }) => <button key={amount} className="button button--green token-package-button" disabled={!isAuthenticated || !profile?.phone || busyAmount !== null || hasOpenOrder} onClick={() => void startPurchase(amount)}>{busyAmount === amount ? "Inatuma ombi..." : <>TZS {amount.toLocaleString("en-US")}<small>{credits} tokeni</small></>}</button>)}</div>}
    {!paymentsPaused && isAuthenticated && !profile?.phone && <div className="account-warning">Weka namba yako ya simu kwenye sehemu ya Akaunti kabla ya kununua tokeni.</div>}
    {hasOpenOrder && <small className="token-note">Ombi la awali la malipo bado linaonekana hapa chini. Ununuzi mpya umesitishwa kwa muda.</small>}
    {!isAuthenticated && <small className="token-note">Ingia au jisajili ili kuona salio la tokeni na huduma zako.</small>}
    {orders.length > 0 && <div className="token-purchase-status"><strong>Malipo yako ya karibuni</strong>{orders.slice(0, 3).map((order) => <div key={order.id}><span>TZS {Number(order.amount).toLocaleString("en-US")} — {Number(order.tokenAmount)} tokeni</span><small>{statusLabel(order.status)}</small></div>)}</div>}
    <small className="token-note">Salio na historia ya tokeni za awali havijabadilishwa.</small>
  </section>;
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
  const { firebaseUser } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { if (!firebaseUser) { setRows([]); return; } return subscribeToTokenHistory(firebaseUser.uid, setRows); }, [firebaseUser]);
  return <main className="portal-main"><div className="page-heading"><div><span className="overline">Rekodi zako</span><h1>HISTORIA YA TOKENI</h1><p>Angalia tokeni zilizotumika, zilizoongezwa na salio lako.</p></div></div>{firebaseUser ? <><div className="history-table"><div className="history-head"><span>Tarehe</span><span>Huduma</span><span>Tokeni</span><span>Salio</span><span>Rejea</span></div>{rows.map((row) => <div className="history-row" key={row.reference ?? row.id}><span>{row.createdAt?.toDate ? row.createdAt.toDate().toLocaleString("sw-TZ") : "—"}</span><strong>{row.description ?? row.reason ?? row.serviceName ?? "Miamala ya tokeni"}</strong><span className={row.amount < 0 ? "amount-negative" : "amount-positive"}>{row.amount > 0 ? "+" : ""}{row.amount}</span><span>{row.balanceAfter}</span><code>{row.reference ?? row.id}</code></div>)}</div><Notice tone="info">Historia ya matumizi na ununuzi wa tokeni itaonekana hapa mara tu shughuli zitakapotokea.</Notice></> : <Notice tone="info">Ingia kwenye akaunti yako ili kuona historia yako ya tokeni.</Notice>}</main>;
}

function AdminPage() { return <AdminDashboard />; }
function AccountPage() {
  const { isAuthenticated, user, profile, firebaseUser, logout, updateProfile: saveProfile } = useAuth();
  const [names, setNames] = useState({ firstName: "", lastName: "", phone: "" });
  const [newPassword, setNewPassword] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [messages, setMessages] = useState<Array<Record<string, unknown> & { id: string }>>([]);
  useEffect(() => { if (!firebaseUser) { setMessages([]); return; } return subscribeUserMessages(firebaseUser.uid, setMessages, () => toast.error("Imeshindikana kupakia ujumbe.")); }, [firebaseUser]);
  const chooseProfileImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !firebaseUser) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error("Chagua picha ya JPG, PNG au WebP."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Picha isizidi MB 2."); return; }
    setImageBusy(true); void uploadProfileImage(firebaseUser.uid, file).then(() => toast.success("Picha ya profile imehifadhiwa kwenye Storage.")).catch((error: any) => toast.error(error?.message ?? "Imeshindikana kuhifadhi picha.")).finally(() => setImageBusy(false));
  };
  const saveNames = async () => { try { await saveProfile({ firstName: names.firstName || profile?.firstName, lastName: names.lastName || profile?.lastName, phone: names.phone || profile?.phone, name: `${names.firstName || profile?.firstName || ""} ${names.lastName || profile?.lastName || ""}`.trim() }); toast.success("Taarifa zimehifadhiwa."); } catch { toast.error("Imeshindikana kuhifadhi taarifa."); } };
  const saveNewPassword = async () => { if (!firebaseUser || newPassword.length < 6) { toast.error("Password iwe na angalau herufi 6."); return; } try { await updatePassword(firebaseUser, newPassword); setNewPassword(""); toast.success("Password imebadilishwa kwa usalama."); } catch { toast.error("Kwa usalama, ingia tena kabla ya kubadilisha password."); } };
  return <main className="portal-main"><div className="page-heading"><div><span className="overline">Wasifu na usalama</span><h1>AKAUNTI</h1><p>Simamia taarifa za akaunti, lugha na taarifa zako.</p></div></div>{!isAuthenticated ? <section className="account-panel"><Notice>Ingia ili kuona akaunti yako binafsi.</Notice><button className="button button--green" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Tumia kitufe cha Ingia / Jisajili juu</button></section> : <div className="account-grid"><section className="account-panel"><div className="large-avatar">{profile?.profileImageUrl ? <img src={profile.profileImageUrl} alt="Picha ya profile" /> : user?.name?.slice(0, 2).toUpperCase() ?? "HM"}</div><label className="profile-image-picker">{imageBusy ? "Inapakia picha..." : "Weka au badilisha picha"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProfileImage} disabled={imageBusy} /></label><small className="profile-image-help">JPG, PNG au WebP — hadi MB 2.</small><h2>{profile?.name ?? "Mwanachama"} <VerifiedTick verified={profile?.verificationStatus === "approved"} /></h2><p>Namba ya simu: {profile?.phone ?? "—"}</p><Notice tone="success">Akaunti yako inalindwa na Firebase Authentication.</Notice><div className="auth-fields auth-fields--two"><label>Jina la kwanza<input value={names.firstName || profile?.firstName || ""} onChange={(event) => setNames({ ...names, firstName: event.target.value })} /></label><label>Jina la mwisho<input value={names.lastName || profile?.lastName || ""} onChange={(event) => setNames({ ...names, lastName: event.target.value })} /></label><label>Namba ya simu<input type="tel" inputMode="tel" autoComplete="tel" placeholder="0712345678" value={names.phone || profile?.phone || ""} onChange={(event) => setNames({ ...names, phone: event.target.value })} /></label></div><button className="button button--green" onClick={saveNames}>Hifadhi taarifa</button><hr /><h3>Badilisha password</h3><div className="auth-fields"><input type="password" placeholder="Password mpya" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></div><button className="button button--dark" onClick={saveNewPassword}>Badilisha password</button><button className="button button--dark" onClick={() => logout()}>Toka kwenye akaunti</button></section><section className="account-side"><div className="account-panel"><h3>Tokeni</h3><p>Salio lako: <strong>{profile?.tokenBalance ?? 0} tokeni</strong></p><p>Hali ya akaunti: {profile?.verificationStatus === "approved" ? "Imeidhinishwa" : "Inasubiri uthibitisho"}</p></div><div className="account-panel"><div className="admin-card-heading"><h3>Ujumbe na hali ya maombi</h3><Link href="/service/pata-lipa-namba">Maombi ya Lipa Namba</Link></div>{messages.length ? messages.map((item) => <div className="account-notification" key={item.id}><strong>{String(item.subject ?? "Ujumbe")}</strong><p>{String(item.body ?? "")}</p><small>{String(item.createdAt ?? "")}</small></div>) : <Notice tone="info">Hakuna ujumbe bado. Mabadiliko ya maombi yataonekana hapa.</Notice>}</div></section></div>}</main>;
}

function PortalHome({ search, onUse, services }: { search: string; onUse: (service: ServiceCatalogItem) => void; services: ServiceCatalogItem[] }) {
  const [category, setCategory] = useState("Zote");
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [serviceOrder, setServiceOrder] = useState<string[]>([]);
  const [serviceLockOverrides, setServiceLockOverrides] = useState<Record<string, boolean>>({});
  const [homepageSectionOrder, setHomepageSectionOrder] = useState<string[]>(defaultHomepageSectionOrder);
  const [layout, setLayout] = useState({ homeColumns: 4, homeTabletColumns: 2, homeMobileColumns: 1, sectionGap: 34, cardGap: 12, cardRadius: 14, cardPadding: 15, heroRadius: 18, heroPadding: 35, contentMaxWidth: 1420, showMetrics: true, showHero: true, compactCards: false });
  useEffect(() => {
    const stopAnnouncements = subscribeToCollection("announcements", (rows) => setAnnouncements(rows.filter((item) => item.enabled !== false)));
    const stopSettings = subscribeToCollection("siteSettings", (rows) => {
      const settings = rows.find((item) => item.id === "public");
      if (Array.isArray(settings?.serviceOrder)) setServiceOrder(settings.serviceOrder.filter((id: unknown): id is string => typeof id === "string"));
      if (Array.isArray(settings?.homepageSectionOrder)) setHomepageSectionOrder(settings.homepageSectionOrder.filter((id: unknown): id is string => typeof id === "string"));
      setLayout((current) => ({ ...current, ...Object.fromEntries(Object.keys(current).map((key) => [key, settings?.[key] ?? current[key as keyof typeof current]])) }));
    });
    const stopLocks = subscribeToCollection("serviceLocks", (rows) => setServiceLockOverrides(Object.fromEntries(rows.map((item) => [String(item.slug ?? item.id), item.isLocked === true]))));
    return () => { stopAnnouncements(); stopSettings(); stopLocks(); };
  }, []);
  const displayedServices = orderByIds(services.filter((service) => service.active !== false && service.isVisible !== false).sort((a: any, b: any) => Number(a.order ?? 9999) - Number(b.order ?? 9999)).map((service) => {
    const override = serviceLockOverrides[service.slug];
    if (isServiceLocked(service.slug, override, service.kind === "locked")) return { ...service, kind: "locked" as const };
    if (service.kind === "locked" || service.category === "Huduma zilizofungwa") return { ...service, kind: "paid" as const, tokenCost: service.tokenCost || 2, category: "Huduma kuu" };
    return service;
  }), serviceOrder);
  const lower = search.toLowerCase();
  const categories = ["Zote", ...Array.from(new Set(displayedServices.map((service) => service.category).filter(Boolean)))].slice(0, 8);
  const matches = displayedServices.filter((service) => (category === "Zote" || service.category === category) && `${service.name} ${service.description} ${service.category}`.toLowerCase().includes(lower));
  const main = matches.filter((service) => service.kind !== "locked" && (service.category === "Huduma kuu" || service.category === "Huduma za bure"));
  const locked = matches.filter((service) => service.kind === "locked");
  const tools = matches.filter((service) => service.kind !== "locked" && service.category === "Zana za ziada");
  const sections: Record<HomepageSectionId, React.ReactNode> = {
    services: <ServiceGrid title="HUDUMA ZOTE" services={main} onUse={onUse} />,
    locked: <ServiceGrid title="HUDUMA ZILIZOFUNGWA" services={locked} onUse={onUse} />,
    special: <SpecialSection />,
    tools: <ServiceGrid title="ZANA ZA ZIADA" services={tools} onUse={onUse} />,
    tutorials: <TutorialsSection />,
  };
  const orderedSections = completeOrder([...defaultHomepageSectionOrder], homepageSectionOrder);
  const freeCount = displayedServices.filter((service) => service.kind === "free").length;
  const paidCount = displayedServices.filter((service) => service.kind === "paid").length;
  const lockedCount = displayedServices.filter((service) => service.kind === "locked").length;
  const layoutStyle = { "--home-cols": layout.homeColumns, "--home-tablet-cols": layout.homeTabletColumns, "--home-mobile-cols": layout.homeMobileColumns, "--section-gap": `${layout.sectionGap}px`, "--card-gap": `${layout.cardGap}px`, "--card-radius": `${layout.cardRadius}px`, "--card-padding": `${layout.cardPadding}px`, "--hero-radius": `${layout.heroRadius}px`, "--hero-padding": `${layout.heroPadding}px`, "--content-max": `${layout.contentMaxWidth}px` } as React.CSSProperties;
  return <main className={`portal-main ${layout.compactCards ? "layout-compact" : ""}`} style={layoutStyle}>
    {layout.showHero && <div className="modern-hero"><div className="modern-hero-copy"><span className="hero-badge"><Sparkles size={13}/> $TEWARD TZ • DIGITAL SERVICE HUB</span><h1>Huduma muhimu.<br/><em>Sehemu moja.</em></h1><p>Fomu, maombi, zana na huduma za kidigitali — zimepangwa kwa urahisi, kasi na usalama.</p><div className="hero-actions"><Link href="/services" className="button button--green"><Zap size={16}/> Anza kutumia</Link><Link href="/account" className="hero-link">Akaunti yangu <ChevronRight size={15}/></Link></div><div className="hero-trust-row" aria-label="Vipengele muhimu"><span><ShieldCheck size={13}/> Salama</span><span><Zap size={13}/> 24/7</span><span><Sparkles size={13}/> Rahisi kutumia</span></div></div><div className="hero-visual"><div className="hero-visual-ring"><Zap size={32}/><strong>{displayedServices.length}</strong><span>HUDUMA</span></div><div className="hero-floating hero-floating--top">24/7<br/><small>ONLINE</small></div><div className="hero-floating hero-floating--bottom"><ShieldCheck size={14}/> SALAMA</div></div></div>}
    {layout.showMetrics && <div className="quick-metrics"><div><span>HUDUMA ZOTE</span><strong>{displayedServices.length}</strong><small>zinazopatikana sasa</small></div><div><span>BURE</span><strong>{freeCount}</strong><small>bila tokeni</small></div><div><span>TOKENI</span><strong>{paidCount}</strong><small>huduma zinazolipiwa</small></div><div><span>USALAMA</span><strong>24/7</strong><small>akaunti inalindwa</small></div></div>}
    {announcements.map((item) => <Notice key={item.id} tone="info"><strong>{item.title}</strong>{item.body ? ` — ${item.body}` : ""}</Notice>)}
    <TokenCard />
    <section className="service-discovery"><div><span className="overline">CHAGUA UNACHOHITAJI</span><h2>Huduma za mtandaoni</h2><p>Tafuta huduma au chagua kundi hapa chini.</p></div><div className="service-chips" role="tablist" aria-label="Makundi ya huduma">{categories.map((item)=><button key={item} className={category===item?"active":""} onClick={()=>setCategory(item)}>{item}</button>)}</div></section>
    {lockedCount > 0 && search === "" ? <div className="portal-mini-note"><LockKeyhole size={15}/><span>Huduma {lockedCount} zinasubiri kufunguliwa na admin.</span></div> : null}{matches.length ? orderedSections.map((section) => <Fragment key={section}>{sections[section]}</Fragment>) : <section className="empty-service-state"><div className="empty-service-state__icon"><Search size={24}/></div><div><span className="overline">HAKUNA MATOKEO</span><h3>Huduma haijapatikana</h3><p>Jaribu neno jingine au chagua kundi la huduma tofauti.</p></div><button type="button" onClick={() => setCategory("Zote")}>Onesha zote</button></section>}
  </main>;
}

function ServiceWorkspace({ service }: { service: ServiceCatalogItem }) {
  const { firebaseUser } = useAuth();
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockOverride, setLockOverride] = useState<boolean | undefined>(undefined);
  const isLocked = isServiceLocked(service.slug, lockOverride, service.kind === "locked");
  useEffect(() => subscribeToCollection("serviceLocks", (rows) => {
    const record = rows.find((item) => String(item.slug ?? item.id) === service.slug);
    setLockOverride(typeof record?.isLocked === "boolean" ? record.isLocked : undefined);
  }), [service.slug]);
  const submit = async () => {
    if (isLocked) { toast.error("Huduma hii imefungwa kwa sasa."); return; }
    if (!firebaseUser || !details.trim()) { toast.error("Andika maelezo ya ombi lako kwanza."); return; }
    setBusy(true);
    try { const reference = await createServiceRequest(firebaseUser.uid, service, details); setDetails(""); toast.success("Ombi limepokelewa.", { description: `Rejea: ${reference}` }); }
    catch (error: any) { toast.error(error?.message ?? "Imeshindikana kutuma ombi."); }
    finally { setBusy(false); }
  };
  return <main className="portal-main"><div className="page-heading"><div><span className="overline">WORKSPACE YA HUDUMA</span><h1>{service.name}</h1><p>{service.description}</p></div><Icon name={service.icon} size={42} /></div><section className="account-panel service-workspace">{isLocked ? <Notice>Huduma hii imefungwa kwa sasa na admin.</Notice> : <><Notice tone="success">Weka taarifa zako hapa ili ombi liende kwa admin.</Notice><label className="control-field"><span>Maelezo ya ombi / taarifa muhimu</span><textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Andika jina, namba ya simu, TIN, au maelezo yanayohitajika..." rows={8} /></label><button className="button button--green" disabled={busy} onClick={submit}>{busy ? "INATUMA..." : "TUMA OMBI LA HUDUMA"}</button></>}</section></main>;
}

function BottomNav() { return <nav className="bottom-nav">{[{ href: "/", label: "Mwanzo", icon: LayoutGrid }, { href: "/services", label: "Huduma", icon: Zap }, { href: "/tokens", label: "Tokeni", icon: CircleDollarSign }, { href: "/history", label: "Historia", icon: History }, { href: "/account", label: "Akaunti", icon: UserRound }].map(({ href, label, icon: ItemIcon }) => <Link href={href} key={href}><ItemIcon size={19} /><span>{label}</span></Link>)}</nav>; }

export default function Home() {
  const [location, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { isAuthenticated, firebaseUser, user, updateProfile: saveProfile } = useAuth();
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [catalogInitialized, setCatalogInitialized] = useState(false);
  // Closing the mobile drawer on route changes prevents a stuck drawer after navigation/refresh.\n  useEffect(() => { setMenuOpen(false); }, [location]);\n  useEffect(() => subscribeToCollection("services", (rows) => {
    setServices(rows.map((item) => ({ slug: String(item.slug ?? item.id), name: String(String(item.slug ?? item.id) === "nakala-nida-2" ? "SME AIRTEL MKATABA" : item.name ?? "Huduma"), description: String(String(item.slug ?? item.id) === "nakala-nida-2" ? "Jaza na hakiki mkataba wa SME wa Airtel." : item.description ?? ""), icon: String(item.icon ?? "sparkles"), tokenCost: Number(item.tokenCost ?? 0), category: String(item.category ?? "Huduma kuu"), kind: (item.isLocked ? "locked" : item.isFree || Number(item.tokenCost ?? 0) <= 0 ? "free" : "paid") as ServiceCatalogItem["kind"], actionUrl: typeof item.actionUrl === "string" ? item.actionUrl : undefined, order: Number(item.order ?? 9999), fields: Array.isArray(item.fields) ? item.fields : undefined, active: item.active !== false, isVisible: item.isVisible !== false, isLocked: item.isLocked === true })));
    setServicesLoading(false);
  }, () => setServicesLoading(false)), []);
  useEffect(() => subscribeToCollection("siteSettings", (rows) => {
    const settings = rows.find((item) => item.id === "public");
    setCatalogInitialized(settings?.catalogInitialized === true);
  }), []);
  const canManageServices = user?.role === "super_admin" || user?.permissions?.manageServices === true;
  useEffect(() => {
    if (!firebaseUser?.uid || !canManageServices) return;
    let cancelled = false;
    void ensureDefaultServiceCatalog().then((result) => {
      if (!cancelled && result.initialized) setCatalogInitialized(true);
    }).catch((error) => console.warn("Default service catalog backfill was not completed:", error));
    return () => { cancelled = true; };
  }, [firebaseUser?.uid, canManageServices]);
  const tokenOperationKeys = useRef(new Map<string, string>());
  const appearance = { data: null as null | { backgroundColor?: string; primaryColor?: string; secondaryColor?: string } };
  const useService = { mutate: async (service: ServiceCatalogItem) => { if (!firebaseUser) return; const requestId = tokenOperationKeys.current.get(service.slug) ?? crypto.randomUUID(); tokenOperationKeys.current.set(service.slug, requestId); try { const result = await consumeFirebaseTokens(firebaseUser.uid, service, requestId); toast.success(`${service.name} imefunguliwa.`, { description: `Rejea: ${result.reference}` }); if (service.actionUrl) window.open(service.actionUrl, "_blank", "noopener,noreferrer"); else navigate(`/service/${service.slug}`); } catch (error: any) { toast.error(error?.message ?? "Imeshindikana kutumia huduma."); } finally { tokenOperationKeys.current.delete(service.slug); } } };
  const handleUse = (service: ServiceCatalogItem) => { if (service.kind === "locked") { toast.error("Huduma hii imefungwa kwa sasa."); return; } if (!isAuthenticated) { toast("Ingia kwanza ili kutumia huduma kwa kutumia kitufe cha Ingia / Jisajili."); return; } if (["leseni-biashara", "pata-lipa-namba"].includes(service.slug) || !service.actionUrl) { navigate(`/service/${service.slug}`); return; } if (!tokenOperationKeys.current.has(service.slug)) useService.mutate(service); };
  const serviceSlug = location.startsWith("/service/") ? location.slice("/service/".length) : "";
  const effectiveServices = mergeServiceCatalogDefaults(services, catalogInitialized);
  const selectedService = effectiveServices.find((item) => item.slug === serviceSlug && item.active !== false && item.isVisible !== false);
  const serviceFields = Array.isArray(selectedService?.fields) ? selectedService.fields : [];
  const page = location.startsWith("/admin") ? <AdminPage /> : serviceSlug === "leseni-biashara" ? <BusinessLicensePage /> : serviceSlug === "pata-lipa-namba" ? <LipaNumberPage /> : serviceSlug === "cheti-tin" ? <TINCertificatePage /> : serviceSlug === "nakala-nida-2" ? <AirtelSmeContractPage /> : ["stika-mawakala", "sticker-za-wakala", "sticker-wakala", "sticker-wakala-1"].includes(serviceSlug ?? "") ? <AgentStickerPage /> : serviceSlug && servicesLoading ? <main className="portal-main"><Notice tone="info">Inapakia huduma kutoka Firestore…</Notice></main> : selectedService ? serviceFields.length ? <DynamicServicePage service={selectedService as any} /> : <ServiceWorkspace service={selectedService} /> : location === "/history" ? <HistoryPage /> : location === "/account" ? <AccountPage /> : location === "/tokens" ? <main className="portal-main"><TokenCard /><Notice tone="info">Ununuzi wa tokeni kupitia FimiPay umesitishwa kwa muda. Kwa taarifa kuhusu salio lililopo, wasiliana na support kupitia WhatsApp +255 698 232 313.</Notice></main> : <PortalHome search={search} onUse={handleUse} services={effectiveServices} />;
  return <div className="portal-shell" style={{ "--navy": appearance.data?.backgroundColor ?? "#071a36", "--green": appearance.data?.primaryColor ?? "#18b969", "--navy-2": appearance.data?.secondaryColor ?? "#0b2447" } as React.CSSProperties}><div className={`portal-overlay ${menuOpen ? "show" : ""}`} onClick={() => setMenuOpen(false)} /><div className={`portal-sidebar-wrap ${menuOpen ? "open" : ""}`}><Sidebar onClose={() => setMenuOpen(false)} /></div><div className="portal-content"><AppHeader onMenu={() => setMenuOpen(true)} search={search} setSearch={setSearch} />{page}<footer className="portal-footer">Programu hii ilitengenezwa na Bw. $teward Tz <span>© Haki zote zimehifadhiwa 2026</span></footer></div><BottomNav />{isAuthenticated && firebaseUser && user?.mustChangePassword === true ? <PasswordChangeGate firebaseUser={firebaseUser} saveProfile={saveProfile} /> : null}</div>;
}
