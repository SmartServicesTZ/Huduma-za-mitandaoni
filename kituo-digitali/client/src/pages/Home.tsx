import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  BadgeCheck, Baby, Eye, EyeOff, ArrowLeft, Bell, CarFront, ChevronRight, CircleAlert, CircleDollarSign, Contact, Copy, CreditCard, ExternalLink, FileBadge, FileWarning, HeartHandshake, History, Image, Landmark, LayoutGrid, LoaderCircle, LockKeyhole, LogIn, Menu, MessageCircle, Music2, Palette, Plane, PlayCircle, QrCode, Radio, Search, ScanFace, Settings2, ShieldCheck, Smartphone, Sparkles, Star, Store, Ticket, Trophy, Tv, UserRound, UserRoundPen, Users, Vote, WalletCards, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { adminAdjustTokens, adminDeleteAnnouncement, adminDeleteService, adminListCollection, adminListServices, adminListTransactions, adminListUsers, adminSaveAnnouncement, adminSaveService, adminUpdateUser, completeRequiredPasswordChange, consumeFirebaseTokens, createServiceRequest, ensureDefaultServiceCatalog, firebaseAuth, registerFirebaseUser, signInWithPhonePassword, subscribeToCollection, subscribeToTokenHistory, claimDailyTokenBonus, listMyNidaRequests, submitNidaRequest, type NidaRequest } from "@/lib/firebase";
import { announcementText, mergeServiceCatalogDefaults, serviceCatalog, specialServices, tutorials, whatsappUrl, type ServiceCatalogItem } from "../../../shared/catalog";
import { normalizeTanzaniaPhone } from "../../../shared/tanzaniaPhone";
import { resolveAccountAccessMode, accountRestrictionActionLabels, accountRestrictionActions } from "../../../shared/accountAccess";
import { completeOrder, defaultHomepageSectionOrder, isServiceLocked, orderByIds, type HomepageSectionId } from "../../../shared/serviceOrdering";
import { clearDownloadHistory, downloadFromHistory, getDownloadHistory, removeDownload, type DownloadHistoryItem } from "@/lib/downloadHistory";
const AdminDashboard = lazy(() => import("./AdminDashboard"));
const BusinessLicensePage = lazy(() => import("./BusinessLicensePage"));
const LipaNumberPage = lazy(() => import("./LipaNumberPage"));
const TINCertificatePage = lazy(() => import("./TINCertificatePage"));
const VerifyTinPage = lazy(() => import("./VerifyTinPage"));
const AirtelSmeContractPage = lazy(() => import("./AirtelSmeContractPage"));
const ContractMakerPage = lazy(() => import("./ContractMakerPage"));
const AgentStickerPage = lazy(() => import("./AgentStickerPage"));
const AgentIdPage = lazy(() => import("./AgentIdPage"));
const AccessLipaNumberPage = lazy(() => import("./AccessLipaNumberPage"));
const DynamicServicePage = lazy(() => import("./DynamicServicePage"));
const ChatPage = lazy(() => import("./Chat"));
const AccountSettingsPage = lazy(() => import("./AccountPage"));

const appEnglish: Record<string, string> = {
  "Mwanzo":"Home","Huduma zote":"All services","Chat":"Chat","Tokeni":"Tokens","Historia":"History","Settings":"Settings","Paneli ya Admin":"Admin panel",
  "Akaunti yangu":"My account","Ingia kuanza":"Sign in to start","Huduma salama":"Secure services","Ujumbe na mazungumzo":"Messages & chats",
  "Ujumbe":"Messages","Jumuiya":"Community","Binafsi":"Private","Magroup":"Groups","Usimamizi":"Moderation","Public chat":"Public chat",
  "Anzisha mazungumzo":"Start conversation","Tafuta mazungumzo":"Search conversations","Namba ya simu":"Phone number","Tafuta mtumiaji":"Find user",
  "Tengeneza group":"+ Create group","Chagua group":"Choose a group","Hakuna ujumbe bado":"No messages yet","Tuma ujumbe":"Send message",
  "SETTINGS":"SETTINGS","Settings za App":"App Settings","Account / Wasifu wangu":"Account / My profile","Hifadhi wasifu":"Save profile",
  "Jina la kwanza":"First name","Jina la mwisho":"Last name","Kuhusu mimi":"About me","Lugha ya matumizi":"Language",
  "Kiswahili":"Swahili","English":"English","Salio la tokeni":"Token balance","Uthibitisho":"Verification","Imeidhinishwa":"Verified","Inasubiri":"Pending",
  "Badilisha password":"Change password","Password mpya":"New password","Hifadhi password mpya":"Save new password","Toka kwenye akaunti":"Sign out",
  "Theme":"Theme","Accent color":"Accent color","Arifa za akaunti":"Account notifications","Onyesha salio la tokeni":"Show token balance",
  "Compact mode":"Compact mode","Reduce motion":"Reduce motion","Sauti za app":"App sounds","Refresh ya moja kwa moja":"Automatic refresh",
  "Onyesha hali ya online":"Show online status","Thibitisha vitendo muhimu":"Confirm important actions","Data saver":"Data saver",
  "Historia ya shughuli":"Activity history","Chat na Magroup":"Chat & Groups","ONGEZA TOKENI":"ADD TOKENS","CHEKI NIDA":"CHECK NIDA",
  "HUDUMA NYINGINE":"OTHER SERVICES","Huduma hii inafanyiwa maboresho kwa sasa. Jaribu tena baadaye.":"This service is under maintenance. Please try again later.",
  "Bure":"Free","IMEFUNGWA":"CLOSED","Huduma kuu":"Main services"
};
function applyAppLanguage(language: "sw" | "en") {
  document.documentElement.lang = language;
  const root = document.querySelector(".portal-shell") ?? document.body;
  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (el.children.length > 0) return;
    const current = el.textContent?.trim();
    if (!current) return;
    const original = el.dataset.swText || current;
    el.dataset.swText = original;
    if (language === "en" && appEnglish[original]) el.textContent = appEnglish[original];
    if (language === "sw" && el.dataset.swText) el.textContent = el.dataset.swText;
  });
}
const icons: Record<string, React.ElementType> = { "file-badge": FileBadge, "badge-check": BadgeCheck, contact: Contact, "qr-code": QrCode, vote: Vote, store: Store, ticket: Ticket, copy: Copy, "car-front": CarFront, search: Search, landmark: Landmark, baby: Baby, plane: Plane, "heart-handshake": HeartHandshake, "file-warning": FileWarning, "music-2": Music2, "image-search": Image, smartphone: Smartphone, "scan-face": ScanFace, "user-round-pen": UserRoundPen, palette: Palette, radio: Radio, trophy: Trophy, star: Star, tv: Tv };

function Icon({ name, size = 22 }: { name: string; size?: number }) { const Component = icons[name] ?? Sparkles; return <Component size={size} strokeWidth={1.9} />; }

function Notice({ children, tone = "warning" }: { children: React.ReactNode; tone?: "warning" | "success" | "info" }) { return <div className={`notice notice--${tone}`}><CircleAlert size={17} /> <span>{children}</span></div>; }

function explainAuthError(error: any, mode: "login" | "register") {
  const code = String(error?.code ?? "").replace(/^auth\//, "");
  const messages: Record<string, { title: string; detail: string }> = {
    "invalid-credential": { title: "Namba au password si sahihi", detail: "Kagua namba ya simu na password yako, kisha jaribu tena." },
    "user-not-found": { title: "Akaunti haijapatikana", detail: "Namba hii haijasajiliwa bado. Tumia Jisajili kutengeneza akaunti." },
    "wrong-password": { title: "Password si sahihi", detail: "Kagua password yako. Usishiriki password yako na mtu mwingine." },
    "email-already-in-use": { title: "Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako.", detail: "Tumia namba hiyo hiyo kuingia." },
    "phone/already-registered": { title: "Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako.", detail: "Tumia namba hiyo hiyo kuingia." },
    "already-exists": { title: "Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako.", detail: "Tumia namba hiyo hiyo kuingia." },
    "profile/setup-failed": { title: "Akaunti imetengenezwa; wasifu unasubiri", detail: "Usijisajili tena. Ingia kwenye akaunti yako; wasifu utajaribu kusawazishwa tena." },
    "phone/invalid": { title: "Namba ya simu si sahihi", detail: "Weka namba halali ya simu ya Tanzania." },
    "weak-password": { title: "Password ni dhaifu", detail: "Tumia password yenye angalau herufi 6." },
    "too-many-requests": { title: "Majaribio yamezidi", detail: "Subiri muda kidogo kabla ya kujaribu tena." },
    "operation-not-allowed": { title: "Usajili haujawashwa", detail: "Admin akague Firebase Authentication > Sign-in method." },
    "unauthorized-domain": { title: "Domain ya website haijaidhinishwa", detail: "Admin aongeze steward-tz.github.io kwenye Firebase Authentication > Settings > Authorized domains." },
    "invalid-api-key": { title: "Firebase API key si sahihi", detail: "Configuration ya Firebase inahitaji kusahihishwa na admin wa mfumo." },
    "network-request-failed": { title: "Mtandao haupatikani", detail: "Kagua internet yako kisha jaribu tena." },
    "permission-denied": { title: "Ruhusa imekataliwa", detail: "Firebase imekataa kuhifadhi profile. Admin akague Firestore Rules." },
  };
  const known = messages[code];
  return { title: known?.title ?? `Imeshindikana ${mode === "login" ? "kuingia" : "kusajili"}`, detail: known?.detail ?? String(error?.message ?? "Firebase imerudisha hitilafu isiyojulikana."), code: code || "unknown" };
}

function PasswordChangeGate() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (password.length < 6) { toast.error("Password mpya iwe na angalau herufi 6."); return; }
    if (password !== confirm) { toast.error("Password hazifanani."); return; }
    setBusy(true);
    try {
      await completeRequiredPasswordChange(password);
      setPassword(""); setConfirm("");
      toast.success("Password mpya imewekwa. Akaunti yako iko tayari kutumia.");
    } catch (error: any) {
      toast.error(error?.message ?? "Imeshindikana kubadilisha password. Jaribu tena.");
    } finally { setBusy(false); }
  };
  return <div className="admin-modal-backdrop password-gate-backdrop">
    <div className="admin-modal password-gate" onClick={(event) => event.stopPropagation()}>
      <span className="admin-kicker">USALAMA WA AKAUNTI</span><h2>Weka password yako mpya</h2>
      <p>Admin amekuwekea password ya muda. Kwa usalama, unatakiwa kuiweka password yako binafsi kabla ya kuendelea.</p>
      <form onSubmit={submit}>
        <label className="control-field"><span>Password mpya</span><input type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="control-field"><span>Rudia password mpya</span><input type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
        <label className="check-inline"><input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} /> Onyesha password</label>
        <button type="submit" className="admin-primary" disabled={busy}>{busy ? "Inahifadhi..." : "Weka password mpya"}</button>
      </form>
    </div>
  </div>;
}

function AccountRestrictionGate({ reason, message, onLogout }: { reason?: string; message?: string; onLogout: () => Promise<void> }) {
  return <div className="admin-modal-backdrop password-gate-backdrop">
    <section className="admin-modal password-gate account-restriction-gate" role="alertdialog" aria-modal="true" aria-labelledby="account-restriction-title">
      <span className="admin-kicker">TAARIFA YA AKAUNTI</span>
      <h2 id="account-restriction-title">Ufikiaji wa akaunti umezuiwa</h2>
      <p className="restriction-custom-message">{message?.trim() || "Huwezi kutumia huduma za mfumo kwa sasa."}</p>
      <p><strong>Sababu:</strong> {reason?.trim() || "Admin hajaweka sababu maalum."}</p>
      <p>Wasiliana na admin kwa msaada: <a href="tel:0698232313">0698232313</a></p>
      <button className="admin-primary" onClick={() => void onLogout()}>Toka kwenye akaunti</button>
    </section>
  </div>;
}

function VerifiedTick({ verified }: { verified?: boolean }) {
  return verified ? <span className="verified-tick" title="Akaunti imethibitishwa na admin" aria-label="Verified">✓</span> : null;
}

function PasswordField({ value, visible, autoComplete, placeholder, onChange, onToggle }: { value: string; visible: boolean; autoComplete: string; placeholder: string; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; onToggle: () => void }) {
  return <div className="password-field"><input required type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={onChange} placeholder={placeholder} /><button type="button" aria-label={visible ? "Ficha password" : "Onesha password"} onClick={onToggle}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>;
}

function LocalAuthModal({ onClose }: { onClose: () => void }) {
  const [, navigate] = useLocation();
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
    if (!normalizeTanzaniaPhone(form.phone)) { setAuthError({ title: "Namba ya simu si sahihi", detail: "Tumia namba ya Tanzania, mfano 0698232313 au +255698232313.", code: "form/invalid-phone" }); return; }
    if (mode === "register" && form.password !== form.confirmPassword) { setAuthError({ title: "Password hazifanani", detail: "Andika password ileile kwenye sehemu zote mbili.", code: "form/password-mismatch" }); return; }
    if (mode === "register" && form.password.length < 6) { setAuthError({ title: "Password ni fupi", detail: "Password iwe na angalau herufi 6.", code: "form/weak-password" }); return; }
    setPending(true);
    try {
      if (mode === "login") await signInWithPhonePassword(form.phone.trim(), form.password);
      else await registerFirebaseUser({ password: form.password, firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim() });
      toast.success(mode === "login" ? "Umeingia kwa mafanikio." : "Akaunti imeundwa kwa mafanikio.");
      onClose();
      navigate("/");
    } catch (error: any) {
      const code = String(error?.code ?? "").replace(/^auth\//, "");
      const messages: Record<string, { title: string; detail: string }> = {
        "invalid-credential": { title: "Namba au password si sahihi", detail: "Kagua namba ya simu na password yako, kisha jaribu tena." },
        "user-not-found": { title: "Akaunti haijapatikana", detail: "Namba hii haijasajiliwa bado. Tumia Jisajili kutengeneza akaunti." },
        "wrong-password": { title: "Password si sahihi", detail: "Kagua password yako kisha jaribu tena." },
        "email-already-in-use": { title: "Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako.", detail: "Tumia namba hiyo hiyo kuingia." },
        "phone/already-registered": { title: "Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako.", detail: "Tumia namba hiyo hiyo kuingia." },
        "already-exists": { title: "Namba hii tayari imesajiliwa. Tafadhali ingia kwenye akaunti yako.", detail: "Tumia namba hiyo hiyo kuingia." },
        "phone/invalid": { title: "Namba ya simu si sahihi", detail: "Tumia namba halali ya Tanzania, mfano 0698232313 au +255698232313." },
        "weak-password": { title: "Password ni dhaifu", detail: "Password iwe na angalau herufi 6." },
        "too-many-requests": { title: "Majaribio yamezidi", detail: "Subiri muda kidogo kabla ya kujaribu tena." },
        "operation-not-allowed": { title: "Mfumo wa usajili haujawashwa", detail: "Admin akague njia ya Firebase Authentication iliyowashwa." },
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
  return <div className="portal-modal-backdrop" onClick={onClose}><div className="portal-modal auth-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={19} /></button><span className="overline">Akaunti salama</span><h3>{mode === "login" ? "INGIA KWENYE AKAUNTI" : "JISAJILI AKAUNTI"}</h3><div className="auth-switch"><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setAuthError(null); }}>Ingia</button><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setAuthError(null); }}>Jisajili</button></div>{authError && <div className="auth-error-alert" role="alert"><div className="auth-error-alert__icon"><CircleAlert size={20} /></div><div><strong>{authError.title}</strong><p>{authError.detail}</p><code>{authError.code}</code></div></div>}<form onSubmit={(event) => { event.preventDefault(); void submit(); }}>{mode === "register" && <div className="auth-fields auth-fields--two"><label>Jina la kwanza<input required autoComplete="given-name" value={form.firstName} onChange={update("firstName")} /></label><label>Jina la mwisho<input required autoComplete="family-name" value={form.lastName} onChange={update("lastName")} /></label></div>}<div className="auth-fields"><label>Namba ya simu<input required inputMode="tel" autoComplete="tel" placeholder="0698232313" value={form.phone} onChange={update("phone")} /></label><label>{mode === "login" ? "Nenosiri" : "Nenosiri"}<PasswordField value={form.password} visible={showPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Password" onChange={update("password")} onToggle={() => setShowPassword((value) => !value)} /></label>{mode === "register" && <label>Nenosiri la Thibitisha<PasswordField value={form.confirmPassword} visible={showConfirmPassword} autoComplete="new-password" placeholder="Thibitisha password" onChange={update("confirmPassword")} onToggle={() => setShowConfirmPassword((value) => !value)} /></label>}</div>{mode === "login" && <button type="button" className="button button--green button--small" disabled={pending} onClick={resetPassword}>Umesahau Nenosiri → WhatsApp</button>}<button type="submit" className="button button--green button--wide" disabled={pending}>{pending ? "INASUBIRI..." : mode === "login" ? "INGIA" : "TENGENEZA AKAUNTI"}</button></form></div></div>;
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
      <button type="button" className="header-back-button" onClick={() => window.history.length > 1 ? window.history.back() : navigate("/")} aria-label="Rudi hatua moja nyuma"><ArrowLeft size={20}/><span>Back</span></button>
      <button className="mobile-menu" onClick={onMenu} aria-label="Fungua menyu"><Menu size={24} /></button>
      <Link href="/" className="portal-brand"><span className="portal-logo" aria-label="SmartServicesTZ logo"><i>S</i><b>S</b></span><span><b>SmartServicesTZ</b><small className="brand-subtitle">HUDUMA ZA MTANDAONI</small></span></Link>
      <label className="global-search"><Search size={18} /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tafuta huduma, akaunti au sehemu..." aria-label="Tafuta huduma" /><kbd>Ctrl/⌘ K</kbd></label>
      <div className="header-actions"><a className="header-support" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="Wasiliana na support kupitia WhatsApp"><MessageCircle size={17} /><span>WhatsApp</span></a><button type="button" className="header-icon" onClick={() => { if (isAuthenticated) { navigate("/account"); toast("Fungua sehemu ya akaunti kuona ujumbe na mipangilio ya arifa."); } else { setAuthOpen(true); toast("Ingia ili kuona taarifa za akaunti yako."); } }} aria-label="Fungua arifa na ujumbe" title="Arifa na ujumbe"><Bell size={19} /><i /></button>{isAuthenticated ? <span className="header-user">{user?.name ?? "Mwanachama"} <VerifiedTick verified={user?.verificationStatus === "approved"} /></span> : <button className="button button--green button--small" onClick={() => setAuthOpen(true)}><LogIn size={15} /> Ingia / Jisajili</button>}</div>
    </header>{authOpen && <LocalAuthModal onClose={() => setAuthOpen(false)} />}
  </>;
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const items = [{ href: "/", label: "Mwanzo", icon: LayoutGrid }, { href: "/services", label: "Huduma zote", icon: Zap }, { href: "/chat", label: "Chat", icon: MessageCircle }, { href: "/tokens", label: "Tokeni", icon: CircleDollarSign }, { href: "/history", label: "Historia", icon: History }, { href: "/account", label: "Settings", icon: Settings2 }];
  return <aside className="sidebar-portal"><div className="sidebar-brand"><Link href="/" onClick={onClose}><b>SmartServicesTZ</b><small className="brand-subtitle">DIGITAL SERVICE HUB</small></Link><button className="sidebar-close" onClick={onClose}><X size={20} /></button></div><div className="sidebar-user"><div className="user-avatar">{user?.profileImageUrl ? <img src={user.profileImageUrl} alt="" /> : (user?.name?.slice(0, 2).toUpperCase() ?? "HM")}</div><div><strong>{user?.name ?? "Mgeni"} <VerifiedTick verified={user?.verificationStatus === "approved"} /></strong><small>{user ? "Akaunti yangu" : "Ingia kuanza"}</small></div></div><nav>{items.map(({ href, label, icon: ItemIcon }) => <Link key={href} href={href} onClick={onClose} className={`portal-nav-item ${href === "/" ? location === "/" : location.startsWith(href) ? "active" : ""}`}><ItemIcon size={19} /><span>{label}</span></Link>)}</nav>{["super_admin", "admin", "moderator", "support"].includes(user?.role ?? "") && <><Link href="/admin" className={`portal-nav-item admin-link ${location === "/admin" ? "active" : ""}`}><Settings2 size={19} /><span>Paneli ya Admin</span></Link><Link href="/admin/nida" className={`portal-nav-item admin-link ${location.startsWith("/admin/nida") ? "active" : ""}`}><Search size={19} /><span>Maombi ya NIDA</span></Link></>}<div className="sidebar-foot"><ShieldCheck size={17} /><span>Huduma salama<br /><small>Tokeni zako zinalindwa.</small></span></div></aside>;
}

function TokenCard({ compact = false }: { compact?: boolean }) {
  const { isAuthenticated, profile } = useAuth();
  const [tokenChoiceOpen, setTokenChoiceOpen] = useState(false);

  const nidaBalance = profile?.tokenBalanceNida ?? 0;
  const otherBalance = profile?.tokenBalanceOther ?? profile?.tokenBalance ?? 0;
  const status = profile?.verificationStatus ?? "pending";
  const openWhatsApp = (tokenType: "nida" | "huduma") => {
    const label = tokenType === "nida" ? "CHEKI NIDA" : "HUDUMA NYINGINE";
    const price = tokenType === "nida" ? 100 : 500;
    const phone = profile?.phone ? "\nNamba ya simu: " + profile.phone : "";
    const message = "Habari SmartServicesTZ, naomba kuongeza tokeni.\n\nAina ya tokeni: " + label + "\nBei: TZS " + price.toLocaleString("en-US") + " kwa tokeni" + phone;
    window.location.href = "https://wa.me/255698232313?text=" + encodeURIComponent(message);
    setTokenChoiceOpen(false);
  };

  return <section className={`token-card ${compact ? "token-card--compact" : ""}`}>
    <div className="token-card__top"><div className="token-icon"><WalletCards size={26} /></div><div><span className="overline">WALLET YA TOKENI</span><strong>{isAuthenticated ? nidaBalance + otherBalance : 0}</strong><span className="token-label">tokeni zote</span></div><span className="token-live-pill">● LIVE</span></div><div className="token-balances"><div><span>Tokeni za NIDA</span><strong>{isAuthenticated ? nidaBalance : 0}</strong></div><div><span>Tokeni zingine</span><strong>{isAuthenticated ? otherBalance : 0}</strong></div></div>
    <div className="token-card__meta"><div className="token-account-identity"><strong className="token-account-name">{profile?.name ?? "Mwanachama"}</strong><div className="token-phone-line"><span>{profile?.phone ?? "—"}</span><span className={`token-verification-status ${status === "approved" ? "is-verified" : "is-pending"}`}>{status === "approved" ? <><BadgeCheck size={16} aria-hidden="true"/> Verified</> : "Haijathibitishwa"}</span></div></div></div>
    {status !== "approved" && isAuthenticated && <div className="account-warning">Akaunti yako haijathibitishwa na admin. Huduma zitaanza baada ya admin kuidhinisha akaunti.</div>}
    <button className="button button--green token-add-button" disabled={!isAuthenticated} onClick={() => setTokenChoiceOpen(true)}><span className="token-add-plus">＋</span><span><b>ONGEZA TOKENI</b><small>Chagua aina ya tokeni unayotaka</small></span><ChevronRight size={18}/></button>
    {!isAuthenticated && <small className="token-note">Ingia au jisajili ili kuongeza tokeni.</small>}
    {tokenChoiceOpen && <div className="token-choice-modal" role="dialog" aria-modal="true">
      <div className="token-choice-card">
        <div className="token-choice-head"><div><span className="overline">ONGEZA TOKENI</span><h3>Tokeni ni za nini?</h3></div><button type="button" onClick={() => setTokenChoiceOpen(false)} aria-label="Funga">×</button></div>
        <button type="button" className="token-choice-option" onClick={() => openWhatsApp("nida")}><strong>CHEKI NIDA</strong><span>Tokeni 1 = TZS 100</span></button>
        <button type="button" className="token-choice-option" onClick={() => openWhatsApp("huduma")}><strong>HUDUMA NYINGINE</strong><span>Tokeni 1 = TZS 500</span></button>
        <p className="token-choice-help">Ukichagua, utafunguliwa WhatsApp moja kwa moja kuwasiliana nasi.</p>
      </div>
    </div>}
  </section>;
}
function ServiceCard({ service, onUse }: { service: ServiceCatalogItem; onUse: (service: ServiceCatalogItem) => void }) {
  const locked = service.kind === "locked";
  const external = Boolean(service.actionUrl);
  const [favorite, setFavorite] = useState(() => {
    try { return (JSON.parse(localStorage.getItem("steward-tz-favorite-services-v1") || "[]") as string[]).includes(service.slug); }
    catch { return false; }
  });
  const toggleFavorite = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    let favorites: string[] = [];
    try { favorites = JSON.parse(localStorage.getItem("steward-tz-favorite-services-v1") || "[]"); } catch { favorites = []; }
    favorites = favorite ? favorites.filter((slug) => slug !== service.slug) : [...new Set([...favorites, service.slug])];
    try { localStorage.setItem("steward-tz-favorite-services-v1", JSON.stringify(favorites)); } catch { toast.error("Imeshindikana kuhifadhi huduma uipendayo kwenye simu hii."); return; }
    setFavorite(!favorite);
    window.dispatchEvent(new CustomEvent("smartservicestz-favorites-changed", { detail: favorites }));
    toast.success(favorite ? "Huduma imeondolewa kwenye unazopenda." : "Huduma imehifadhiwa kwenye unazopenda.");
  };
  const palette = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#db2777", "#4f46e5", "#0d9488"];
  const colorIndex = [...service.slug].reduce((sum, character) => sum + character.charCodeAt(0), 0) % palette.length;
  const accent = locked ? "#dc2626" : palette[colorIndex];
  return <div className="portal-service-card-wrap">
    <button className={`portal-service-card service-${service.kind} ${external ? "service-external" : ""}`} onClick={() => onUse(service)} style={{ background: `linear-gradient(145deg, ${accent}18 0%, #ffffff 78%)`, borderColor: `${accent}55`, boxShadow: `0 5px 18px ${accent}12` }}>
      <div className="service-card-icon" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)`, color: "#ffffff", boxShadow: `0 5px 12px ${accent}35` }}><Icon name={service.icon} /></div>
      <div className="service-card-copy"><strong>{service.name}</strong><span>{locked ? (service.maintenanceMessage || "Huduma hii inafanyiwa maboresho kwa sasa. Jaribu tena baadaye.") : service.description}</span></div>
      <div className="service-card-foot">{locked ? <span className="locked-label"><LockKeyhole size={14} /> IMEFUNGWA</span> : service.kind === "free" ? <span className="free-label">Bure</span> : <span className="paid-label"><CreditCard size={14} /> Tokeni {service.tokenCost}</span>}{external ? <span className="external-label"><ExternalLink size={13} /> FUNGUA</span> : <ChevronRight size={17} />}</div>
    </button>
    <button type="button" className={`service-favorite-toggle ${favorite ? "is-favorite" : ""}`} onClick={toggleFavorite} aria-label={favorite ? `Ondoa ${service.name} kwenye huduma unazopenda` : `Hifadhi ${service.name} kwenye huduma unazopenda`} aria-pressed={favorite}><Star size={16} fill={favorite ? "currentColor" : "none"} /></button>
  </div>;
}

function ServiceGrid({ title, services, onUse }: { title: string; services: ServiceCatalogItem[]; onUse: (service: ServiceCatalogItem) => void }) { const arrangedServices = [...services].sort((a, b) => Number(a.kind === "locked") - Number(b.kind === "locked") || a.name.localeCompare(b.name, "sw")); const openCount = arrangedServices.filter((service) => service.kind !== "locked").length; return <section className="portal-section"><div className="section-title"><div><span className="overline">Mkusanyiko wa huduma</span><h2>{title}</h2><p className="service-order-hint">{openCount} wazi · {arrangedServices.length - openCount} zimefungwa</p></div><span className="section-count">{services.length}</span></div><div className="portal-service-grid">{arrangedServices.map((service) => <ServiceCard key={service.slug} service={service} onUse={onUse} />)}</div></section>; }

function SpecialSection() {
  const open = (item: typeof specialServices[number]) => {
    if ("url" in item && item.url) { window.open(item.url, "_blank", "noopener,noreferrer"); return; }
    if (item.action === "whatsapp") { window.open(whatsappUrl, "_blank", "noopener,noreferrer"); return; }
    toast("Tuma ujumbe WhatsApp kupata maelezo ya malipo.", { action: { label: "WhatsApp", onClick: () => window.open(whatsappUrl, "_blank") } });
  };
  return <div className="special-grid">{specialServices.map((item) => <button key={item.slug} className={`special-card special-card--${item.tone}`} onClick={() => open(item)}><div><strong>{item.name}</strong><small>{"url" in item ? (item.url.includes("chat.whatsapp.com") ? "Fungua WhatsApp Group" : "Fungua huduma") : item.action === "whatsapp" ? "Fungua WhatsApp" : "Wasiliana nasi kwa malipo"}</small></div><ExternalLink size={18} /></button>)}</div>;
}

function TopQuickServices({ services, onUse }: { services: ServiceCatalogItem[]; onUse: (service: ServiceCatalogItem) => void }) {
  const items = ["access-lipa-number", "pata-lipa-namba"].map((slug) => services.find((service) => service.slug === slug)).filter(Boolean) as ServiceCatalogItem[];
  if (!items.length) return null;
  return <section className="top-quick-services" aria-label="Huduma za haraka">
    {items.map((service) => <button key={service.slug} type="button" className="top-quick-service" onClick={() => onUse(service)}>
      <span className="top-quick-service__icon"><Icon name={service.icon} size={16} /></span>
      <span className="top-quick-service__text"><strong>{service.name}</strong><small>{service.slug === "pata-lipa-namba" ? "Haraka • BURE" : "Lipa & Usajili"}</small></span>
      <ChevronRight size={14} />
    </button>)}
  </section>;
}

function TutorialsSection() {
  const [selected, setSelected] = useState<typeof tutorials[number] | null>(null);
  return <section className="portal-section"><div className="section-title"><div><span className="overline">Jifunze kwa hatua</span><h2>VIDEO ZA MAFUNZO</h2></div></div><div className="tutorial-grid">{tutorials.map((item) => <button className="tutorial-card" key={item.slug} onClick={() => setSelected(item)}><span className="play-circle"><PlayCircle size={25} /></span><strong>{item.title}</strong><small>{item.description}</small><span className="paid-label"><CreditCard size={13} /> Tokeni {item.tokenCost}</span></button>)}</div>{selected && <div className="portal-modal-backdrop" onClick={() => setSelected(null)}><div className="portal-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)}><X size={19} /></button><PlayCircle size={42} className="modal-symbol" /><h3>{selected.title}</h3>{selected.videoUrl ? <video src={selected.videoUrl} controls /> : <Notice tone="info">Video itaongezwa na admin hivi karibuni. Hakuna kiungo bandia kilichowekwa.</Notice>}<button className="button button--green button--wide" onClick={() => setSelected(null)}>Funga</button></div></div>}</section>;
}

function HistoryPage() {
  const { firebaseUser } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [downloads, setDownloads] = useState<DownloadHistoryItem[]>([]);

  const refreshDownloads = () => setDownloads(getDownloadHistory());

  useEffect(() => {
    if (!firebaseUser) { setRows([]); return; }
    return subscribeToTokenHistory(firebaseUser.uid, setRows);
  }, [firebaseUser]);

  useEffect(() => {
    refreshDownloads();
    const onChange = () => refreshDownloads();
    window.addEventListener("smartservicestz-download-added", onChange);
    window.addEventListener("smartservicestz-download-changed", onChange);
    const timer = window.setInterval(refreshDownloads, 60 * 1000);
    return () => {
      window.removeEventListener("smartservicestz-download-added", onChange);
      window.removeEventListener("smartservicestz-download-changed", onChange);
      window.clearInterval(timer);
    };
  }, []);

  const timeLeft = (expiresAt: number) => {
    const minutes = Math.max(0, Math.ceil((expiresAt - Date.now()) / (60 * 1000)));
    return minutes <= 1 ? "Inaisha ndani ya dakika 1" : `Inaisha ndani ya dakika ${minutes}`;
  };

  return <main className="portal-main">
    <div className="page-heading">
      <div><span className="overline">Rekodi zako</span><h1>HISTORIA</h1><p>Tokeni zako na vitu ulivyopakua vinaonekana hapa.</p></div>
    </div>

    <section className="account-panel" style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div><span className="overline">DOWNLOADS</span><h2 style={{margin:"4px 0"}}>VITU NILIVYOPAKUA</h2><p style={{margin:0,color:"#64748b"}}>Rekodi za vipakuliwa huonekana kwa dakika 30 tu, kisha huondolewa moja kwa moja.</p></div>
        {downloads.length > 0 && <button type="button" className="button button--small" onClick={() => { clearDownloadHistory(); refreshDownloads(); }}>Futa zote</button>}
      </div>
      <div style={{display:"grid",gap:10,marginTop:16}}>
        {downloads.length === 0 ? <div className="notice notice--info"><FileBadge size={17}/><span>Hakuna hati iliyopakuliwa ndani ya dakika 30 zilizopita.</span></div> :
          downloads.map((item) => <div key={item.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"12px 14px",border:"1px solid #e2e8f0",borderRadius:12,background:"#f8fafc"}}>
            <div style={{minWidth:0}}><strong style={{display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</strong><small style={{color:"#64748b"}}>{item.type} • {item.dataUrl ? (() => { const bytes = Math.max(0, Math.floor((item.dataUrl!.length - (item.dataUrl!.indexOf(",") + 1)) * 3 / 4)); return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; })() : "Ukubwa haujulikani"} • {new Date(item.downloadedAt).toLocaleString("sw-TZ")} • {timeLeft(item.expiresAt)}</small></div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              {item.dataUrl && <button type="button" className="button button--green button--small" onClick={() => downloadFromHistory(item)}>Download tena</button>}
              <button type="button" className="button button--small" onClick={() => { removeDownload(item.id); refreshDownloads(); }}>×</button>
            </div>
          </div>)
        }
      </div>
    </section>

    <section>
      <div className="page-heading" style={{marginBottom:10}}><div><span className="overline">Tokeni</span><h2>HISTORIA YA TOKENI</h2></div></div>
      {firebaseUser ? <><div className="history-table"><div className="history-head"><span>Tarehe</span><span>Huduma</span><span>Tokeni</span><span>Salio</span><span>Rejea</span></div>{rows.map((row) => <div className="history-row" key={row.reference ?? row.id}><span>{row.createdAt?.toDate ? row.createdAt.toDate().toLocaleString("sw-TZ") : "—"}</span><strong>{row.description ?? row.reason ?? row.serviceName ?? "Miamala ya tokeni"}</strong><span className={row.amount < 0 ? "amount-negative" : "amount-positive"}>{row.amount > 0 ? "+" : ""}{row.amount}</span><span>{row.balanceAfter}</span><code>{row.reference ?? row.id}</code></div>)}</div><Notice tone="info">Historia ya matumizi na ununuzi wa tokeni itaonekana hapa mara tu shughuli zitakapotokea.</Notice></> : <Notice tone="info">Ingia kwenye akaunti yako ili kuona historia yako ya tokeni.</Notice>}
    </section>
  </main>;
}
function AdminPage() { return <AdminDashboard />; }
function AccountPage() { return <AccountSettingsPage />; }

function QuickNidaSearch({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [phone, setPhone] = useState("");
  const [requests, setRequests] = useState<NidaRequest[]>([]);
  const [activeRequestId, setActiveRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedResults, setCopiedResults] = useState<Record<string, boolean>>({});
  const hideTimers = useRef<Record<string, number>>({});
  const notFoundTimers = useRef<Record<string, number>>({});
  const formatPhone = (value: string) => value.replace(/\D/g, "").slice(0, 10);

  useEffect(() => {
    const active = requests.find((item) => (item.id === activeRequestId || item.requestId === activeRequestId) && item.status === "REJECTED" && String(item.rejectionReason || "").toUpperCase().includes("NIN NOT FOUND"));
    if (!active || notFoundTimers.current[active.id]) return;
    notFoundTimers.current[active.id] = window.setTimeout(() => {
      setActiveRequestId((current) => current === active.id || current === active.requestId ? "" : current);
      delete notFoundTimers.current[active.id];
    }, 90 * 1000);
  }, [requests, activeRequestId]);

  useEffect(() => () => {
    Object.values(notFoundTimers.current).forEach((timer) => window.clearTimeout(timer));
    Object.values(hideTimers.current).forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { setRequests([]); return; }
    let stopped = false;
    const load = async () => {
      try {
        const rows = await listMyNidaRequests();
        if (!stopped) {
          setRequests(rows);
          setActiveRequestId((current) => current || rows[0]?.requestId || rows[0]?.id || "");
        }
      } catch {
        if (!stopped) setRequests([]);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [isAuthenticated]);

  useEffect(() => {
    for (const item of requests) {
      if (item.status !== "APPROVED" || !item.nidaNumber || hideTimers.current[item.id]) continue;
      let expiresAt = 0;
      try { expiresAt = Number(window.sessionStorage.getItem(`smartservices-nida-hide-${item.id}`) ?? 0); } catch { /* session storage may be unavailable */ }
      if (!expiresAt) continue;
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setCopiedResults((old) => ({ ...old, [item.id]: true }));
        continue;
      }
      hideTimers.current[item.id] = window.setTimeout(() => {
        setCopiedResults((old) => ({ ...old, [item.id]: true }));
        delete hideTimers.current[item.id];
      }, remaining);
    }
  }, [requests]);

  useEffect(() => () => {
    Object.values(hideTimers.current).forEach((timer) => window.clearTimeout(timer));
  }, []);

  const run = async () => {
    if (!isAuthenticated) { toast.error("Ingia kwenye akaunti yako kabla ya kutuma ombi la NIDA."); return; }
    if (!/^\d{9,10}$/.test(phone)) { toast.error("Weka namba ya simu yenye tarakimu 9 au 10."); return; }
    setBusy(true);
    try {
      const submitted = await submitNidaRequest(phone);
      setPhone("");
      setActiveRequestId(submitted.requestId);
      const rows = await listMyNidaRequests();
      setRequests(rows);
      setActiveRequestId(submitted.requestId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Imeshindikana kutuma ombi. Jaribu tena.");
    } finally { setBusy(false); }
  };
  const copyResult = async (requestId: string, result: string) => {
    try {
      await navigator.clipboard.writeText(result);
      setCopiedResults((old) => ({ ...old, [requestId]: false }));
      if (hideTimers.current[requestId]) window.clearTimeout(hideTimers.current[requestId]);
      const expiresAt = Date.now() + 10 * 60 * 1000;
      try { window.sessionStorage.setItem(`smartservices-nida-hide-${requestId}`, String(expiresAt)); } catch { /* timer still works for this page */ }
      hideTimers.current[requestId] = window.setTimeout(() => {
        setCopiedResults((old) => ({ ...old, [requestId]: true }));
        delete hideTimers.current[requestId];
      }, 10 * 60 * 1000);
      toast.success("Namba ya NIDA imenakiliwa. Itaondolewa kwenye mwonekano baada ya dakika 10.");
    } catch { toast.error("Imeshindikana kunakili namba ya NIDA."); }
  };
  const statusText: Record<string, string> = { PENDING: "INATAFUTA NIDA...", PROCESSING: "INAFANYIWA KAZI", APPROVED: "NIDA IMEPATIKANA", REJECTED: "NIN NOT FOUND" };

  return <section className="quick-nida-panel">
    <div className="quick-nida-panel__head">
      <div className="quick-nida-search__icon"><Search size={20}/></div>
      <div><span className="overline">HUDUMA KUU • NIDA</span><h3>TAFUTA NAMBA YA NIDA</h3></div>
    </div>
    <div className="quick-nida-form">
      <label className="quick-nida-phone-field"><span>Namba ya simu</span><input inputMode="numeric" autoComplete="tel" maxLength={10} value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="Ingiza tarakimu 9 au 10" aria-label="Namba ya simu ya mteja"/></label>
      <button type="button" className="button button--green" onClick={() => void run()} disabled={busy}><Search size={16}/> {busy ? "Inatuma..." : "Tafuta NIDA"}</button>
    </div>
    {!isAuthenticated && <div className="notice notice--info"><LogIn size={16}/><span>Ingia kwenye akaunti yako ili kutuma ombi na kuona matokeo.</span></div>}
    {isAuthenticated && requests.some((item) => item.id === activeRequestId || item.requestId === activeRequestId) && <div className="quick-nida-request-list">
      {requests.filter((item) => item.id === activeRequestId || item.requestId === activeRequestId).map((item) => <article key={item.id} className={`quick-nida-request ${item.status === "APPROVED" ? "quick-nida-request--success" : item.status === "REJECTED" ? "quick-nida-request--error" : ""}`}>
        <div className="quick-nida-request__details">
          <div className="quick-nida-request__labels"><span>Namba</span><strong>{item.phone}</strong></div>
          <div className="quick-nida-request__status"><strong>{(item.status === "PENDING" || item.status === "PROCESSING") && <LoaderCircle size={15} className="quick-nida-spinner" aria-label="Inatafuta NIDA"/>} {item.status === "REJECTED" && !String(item.rejectionReason || "").toUpperCase().includes("NIN NOT FOUND") ? "HAIJAWEZA KUKAMILIKA" : (statusText[item.status] ?? item.status)}</strong>
            {item.status === "PENDING" && <span>Subiri kidogo, mfumo unatafuta taarifa za NIDA...</span>}
            {item.status === "PROCESSING" && <span>Mfumo unaendelea kutafuta taarifa za NIDA. Matokeo yataonekana hapa.</span>}
            {item.status === "REJECTED" && <span>{String(item.rejectionReason || "NIN NOT FOUND").toUpperCase().includes("NIN NOT FOUND") ? "NIN NOT FOUND" : item.rejectionReason}</span>}
          </div>
          {item.status === "APPROVED" && item.nidaNumber && <div className="quick-nida-result">
            <span>NIDA</span>
            {copiedResults[item.id] ? <p className="quick-nida-expired">Namba ya NIDA imefichwa baada ya muda wake.</p> : <>
              <code>{item.nidaNumber}</code>
              <button type="button" className="button button--green button--small" onClick={() => void copyResult(item.id, item.nidaNumber!)}><Copy size={15}/> Nakili NIDA</button>
            </>}
          </div>}
        </div>
      </article>)}
    </div>}
    <style>{`.quick-nida-spinner{display:inline-block;vertical-align:middle;animation:quickNidaSpin 1s linear infinite;color:#2563eb;flex-shrink:0}@keyframes quickNidaSpin{to{transform:rotate(360deg)}}.quick-nida-panel{display:grid;gap:7px;padding:9px;border:1px solid #dbeafe;border-radius:20px;background:linear-gradient(145deg,#fff 0%,#f5f8ff 100%);box-shadow:0 12px 32px rgba(15,23,42,.07)}.quick-nida-panel__head{display:flex;align-items:center;gap:10px}.quick-nida-search__icon{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:10px;background:#e0eaff;color:#1d4ed8}.quick-nida-panel__head h3{margin:2px 0 0;color:#0f172a;font-size:1.1rem;font-weight:900}.quick-nida-panel__head p{display:none}.quick-nida-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.quick-nida-phone-field{display:grid;gap:6px;color:#334155;font-size:.8rem;font-weight:800}.quick-nida-phone-field input{width:100%;min-width:0;padding:8px 10px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#0f172a;font-size:1rem;outline:none}.quick-nida-phone-field input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}.quick-nida-form .button{min-height:36px;padding:8px 10px;white-space:nowrap}.quick-nida-request-list{display:grid;gap:6px}.quick-nida-request{padding:7px 9px;border:1px solid #dbe3ee;border-radius:13px;background:#fff}.quick-nida-request--success{border-color:#86efac;background:#f0fdf4}.quick-nida-request--error{border-color:#fca5a5;background:#fff1f2}.quick-nida-request__details{display:grid;gap:4px}.quick-nida-request__labels{display:grid;gap:3px}.quick-nida-request__labels span,.quick-nida-result>span{font-size:.75rem;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.quick-nida-request__labels strong{color:#0f172a;font-size:1rem}.quick-nida-request__status{display:grid;gap:4px}.quick-nida-request__status strong{color:#1d4ed8;font-size:.84rem;font-weight:900}.quick-nida-request--success .quick-nida-request__status strong{color:#15803d}.quick-nida-request--error .quick-nida-request__status strong{color:#b91c1c}.quick-nida-request__status span{font-size:.84rem;color:#475569;overflow-wrap:anywhere}.quick-nida-result{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 7px;align-items:center;padding-top:6px;border-top:1px solid #bbf7d0}.quick-nida-result>span{grid-column:1/-1;color:#166534}.quick-nida-result code{color:#166534;font-size:1.05rem;font-weight:900;overflow-wrap:anywhere}.quick-nida-expired{grid-column:1/-1;margin:0;color:#64748b;font-size:.84rem}.quick-nida-request--error .quick-nida-request__status span{color:#b91c1c;font-weight:800}@media(max-width:560px){.quick-nida-form{grid-template-columns:1fr}.quick-nida-form .button{width:100%;justify-content:center}.quick-nida-result{grid-template-columns:1fr}.quick-nida-result .button{width:100%;justify-content:center}}`}</style>
  </section>;
}
function PortalHome({ search, onUse, services, userName, isAuthenticated, allServicesPage }: { search: string; onUse: (service: ServiceCatalogItem) => void; services: ServiceCatalogItem[]; userName?: string; isAuthenticated: boolean; allServicesPage: boolean }) {
  const [category, setCategory] = useState("Zote");
  const [favoriteSlugs, setFavoriteSlugs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("steward-tz-favorite-services-v1") || "[]"); } catch { return []; }
  });
  const [announcements, setAnnouncements] = useState<any[]>([]);
  useEffect(() => {
    const onFavoritesChanged = (event: Event) => {
      const detail = (event as CustomEvent<string[]>).detail;
      if (Array.isArray(detail)) setFavoriteSlugs(detail);
    };
    window.addEventListener("smartservicestz-favorites-changed", onFavoritesChanged);
    return () => window.removeEventListener("smartservicestz-favorites-changed", onFavoritesChanged);
  }, []);
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
    if (isServiceLocked(service.slug, override, service.kind === "locked")) return { ...service, kind: "locked" as const, description: service.maintenanceMessage || "Huduma hii inafanyiwa maboresho kwa sasa. Jaribu tena baadaye." };
    // Heshimu lock ya admin. Usigeuze huduma iliyofungwa kuwa paid hapa:
    // serviceLocks ndiyo chanzo cha mwisho cha hali ya kufungwa/kufunguliwa.
    return service;
  }), serviceOrder);
  const lower = search.toLowerCase();
  const categories = ["Zote", "Zilizohifadhiwa", ...Array.from(new Set(displayedServices.map((service) => service.category).filter(Boolean)))];
  const matches = displayedServices.filter((service) => (category === "Zote" || (category === "Zilizohifadhiwa" ? favoriteSlugs.includes(service.slug) : service.category === category)) && `${service.name} ${service.description} ${service.category}`.toLowerCase().includes(lower));
  const mainBase = matches.filter((service) => service.category === "HUDUMA ZA WAKALA" && service.slug !== "utafutaji-nida");
  const tinCertificate = mainBase.find((service) => service.slug === "cheti-tin") ?? services.find((service) => service.slug === "cheti-tin") ?? serviceCatalog.find((service) => service.slug === "cheti-tin");
  const main = [
    mainBase.find((service) => service.slug === "leseni-biashara"),
    tinCertificate,
    ...mainBase.filter((service) => service.slug !== "leseni-biashara" && service.slug !== "cheti-tin"),
  ].filter(Boolean) as ServiceCatalogItem[];
  const other = matches.filter((service) => service.category === "HUDUMA ZINGINE");
  const sections: Record<HomepageSectionId, React.ReactNode> = {
    services: <ServiceGrid title="HUDUMA ZA WAKALA" services={main} onUse={onUse} />,
    locked: null,
    special: null,
    tools: (category === "Zote" || category === "HUDUMA ZINGINE") ? <section className="portal-section"><div className="section-title"><div><span className="overline">Mkusanyiko wa huduma</span><h2>HUDUMA ZINGINE</h2></div><span className="section-count">{other.length + specialServices.length}</span></div><div className="portal-service-grid">{other.map((service) => <ServiceCard key={service.slug} service={service} onUse={onUse} />)}</div><SpecialSection /></section> : null,
    tutorials: <TutorialsSection />,
  };
  const orderedSections = completeOrder([...defaultHomepageSectionOrder], homepageSectionOrder);
  const freeCount = displayedServices.filter((service) => service.kind === "free").length;
  const paidCount = displayedServices.filter((service) => service.kind === "paid").length;
  const lockedCount = displayedServices.filter((service) => service.kind === "locked").length;
  const layoutStyle = { "--home-cols": layout.homeColumns, "--home-tablet-cols": layout.homeTabletColumns, "--home-mobile-cols": layout.homeMobileColumns, "--section-gap": `${layout.sectionGap}px`, "--card-gap": `${layout.cardGap}px`, "--card-radius": `${layout.cardRadius}px`, "--card-padding": `${layout.cardPadding}px`, "--hero-radius": `${layout.heroRadius}px`, "--hero-padding": `${layout.heroPadding}px`, "--content-max": `${layout.contentMaxWidth}px` } as React.CSSProperties;
  return <main className={`portal-main ${layout.compactCards ? "layout-compact" : ""}`} style={layoutStyle}>
    {/* Mwanzo sasa unaanza moja kwa moja na Wallet ya Tokeni kama ilivyoombwa. */}
    <TokenCard />
    <QuickNidaSearch isAuthenticated={isAuthenticated} />
    <section className="service-discovery"><div><span className="overline">{allServicesPage ? "TAFUTA NA CHUJA" : "SMART SERVICES"}</span><h2>{allServicesPage ? "HUDUMA ZOTE" : "Chagua huduma"}</h2><p>{allServicesPage ? `${matches.length} kati ya ${displayedServices.length} huduma zinaonekana. Tumia utafutaji au makundi kuchuja.` : "Anza hapa — huduma zako zote sehemu moja."}</p></div><div className="service-chips" role="tablist" aria-label="Makundi ya huduma">{categories.map((item)=><button key={item} className={category===item?"active":""} onClick={()=>setCategory(item)}>{item}</button>)}</div></section>
    {matches.length ? orderedSections.map((section) => <Fragment key={section}>{sections[section]}</Fragment>) : <section className="empty-service-state"><div className="empty-service-state__icon"><Search size={24}/></div><div><span className="overline">HAKUNA MATOKEO</span><h3>Huduma haijapatikana</h3><p>Jaribu neno jingine au chagua kundi la huduma tofauti.</p></div><button type="button" onClick={() => setCategory("Zote")}>Onesha zote</button></section>}
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

function BottomNav() {
  const [location] = useLocation();
  const items = [
    { href: "/", label: "Mwanzo", icon: LayoutGrid },
    { href: "/services", label: "Huduma", icon: Zap },
    { href: "/chat", label: "Chat", icon: MessageCircle },
    { href: "/history", label: "Historia", icon: History },
    { href: "/account", label: "Akaunti", icon: UserRound },
  ];
  return <nav className="bottom-nav" aria-label="Menyu kuu ya simu">
    {items.map(({ href, label, icon: ItemIcon }) => {
      const active = href === "/" ? location === "/" : location === href || location.startsWith(href + "/");
      return <Link href={href} key={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
        <span className="bottom-nav-icon"><ItemIcon size={20} strokeWidth={active ? 2.35 : 1.8} /></span>
        <span className="bottom-nav-label">{label}</span>
        {active && <span className="bottom-nav-dot" aria-hidden="true" />}
      </Link>;
    })}
  </nav>;
}

export default function Home() {
  const [location, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { isAuthenticated, firebaseUser, user, profile, logout } = useAuth();
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [catalogInitialized, setCatalogInitialized] = useState(false);
  // Closing the mobile drawer on route changes prevents a stuck drawer after navigation/refresh.
  useEffect(() => { setMenuOpen(false); }, [location]);
  useEffect(() => { if (!isAuthenticated || !firebaseUser) return; void claimDailyTokenBonus().catch(() => undefined); }, [isAuthenticated, firebaseUser?.uid]);
  useEffect(() => subscribeToCollection("services", (rows) => {
    setServices(rows.map((item) => ({ slug: ["thibitisha-tin", "verify-tin"].includes(String(item.slug ?? item.id)) ? "verify-tin" : String(item.slug ?? item.id) === "nakala-nida-2" ? "sme-airtel-mkataba" : (item.slug ?? item.id), name: String(String(item.slug ?? item.id) === "thibitisha-tin" || String(item.slug ?? item.id) === "verify-tin" ? "VERIFY TIN" : String(item.slug ?? item.id) === "nakala-nida-2" || String(item.slug ?? item.id) === "sme-airtel-mkataba" ? "SME AIRTEL MKATABA" : item.name ?? "Huduma"), description: String(String(item.slug ?? item.id) === "nakala-nida-2" || String(item.slug ?? item.id) === "sme-airtel-mkataba" ? "Jaza na hakiki mkataba wa SME wa Airtel." : item.description ?? ""), icon: String(item.icon ?? "sparkles"), tokenCost: Number(item.tokenCost ?? 0), tokenType: item.tokenType === "nida" ? "nida" : "huduma", category: String(item.category ?? "Huduma kuu"), kind: (item.isLocked ? "locked" : item.isFree || Number(item.tokenCost ?? 0) <= 0 ? "free" : "paid") as ServiceCatalogItem["kind"], actionUrl: typeof item.actionUrl === "string" ? item.actionUrl : undefined, order: Number(item.order ?? 9999), fields: Array.isArray(item.fields) ? item.fields : undefined, active: item.active !== false, isVisible: item.isVisible !== false, isLocked: item.isLocked === true, maintenanceMessage: typeof item.maintenanceMessage === "string" ? item.maintenanceMessage : undefined })));
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
  const appTheme = profile?.settings?.theme ?? "dark";
  const appAccent = profile?.settings?.accent ?? "green";
  const compactMode = profile?.settings?.compactMode === true;
  const useService = { mutate: async (service: ServiceCatalogItem) => { if (!firebaseUser) return; const requestId = tokenOperationKeys.current.get(service.slug) ?? crypto.randomUUID(); tokenOperationKeys.current.set(service.slug, requestId); try { const result = await consumeFirebaseTokens(firebaseUser.uid, service, requestId); toast.success(`${service.name} imefunguliwa.`, { description: `Rejea: ${result.reference}` }); if (service.actionUrl) window.location.href = service.actionUrl; else navigate(`/service/${service.slug}`); } catch (error: any) { toast.error(error?.message ?? "Imeshindikana kutumia huduma."); } finally { tokenOperationKeys.current.delete(service.slug); } } };
  const handleUse = (service: ServiceCatalogItem) => { if (service.kind === "locked") { toast.error("Huduma hii imefungwa kwa sasa."); return; } if (!isAuthenticated) { toast("Ingia kwanza ili kutumia huduma kwa kutumia kitufe cha Ingia / Jisajili."); return; } if (["leseni-biashara", "pata-lipa-namba", "access-lipa-number", "tengeneza-mkataba"].includes(service.slug) || !service.actionUrl) { navigate(`/service/${service.slug}`); return; } if (!tokenOperationKeys.current.has(service.slug)) useService.mutate(service); };
  const serviceSlug = location.startsWith("/service/") ? location.slice("/service/".length) : "";
  const effectiveServices = mergeServiceCatalogDefaults(services, catalogInitialized);
  const selectedService = effectiveServices.find((item) => item.slug === serviceSlug && item.active !== false && item.isVisible !== false);
  const serviceFields = Array.isArray(selectedService?.fields) ? selectedService.fields : [];
  const page = location.startsWith("/admin") ? <AdminPage /> : serviceSlug === "kitambulisho-wakala" ? <AgentIdPage /> : serviceSlug === "leseni-biashara" ? <BusinessLicensePage /> : serviceSlug === "pata-lipa-namba" ? <LipaNumberPage /> : serviceSlug === "access-lipa-number" ? <AccessLipaNumberPage /> : serviceSlug === "cheti-tin" ? <TINCertificatePage /> : serviceSlug === "verify-tin" ? <VerifyTinPage /> : serviceSlug === "sme-airtel-mkataba" ? <AirtelSmeContractPage /> : serviceSlug === "tengeneza-mkataba" ? <ContractMakerPage /> : ["stika-mawakala", "sticker-za-wakala", "sticker-wakala", "sticker-wakala-1"].includes(serviceSlug ?? "") ? <AgentStickerPage /> : serviceSlug && servicesLoading ? <main className="portal-main"><Notice tone="info">Inapakia huduma kutoka Firestore…</Notice></main> : selectedService ? serviceFields.length ? <DynamicServicePage service={selectedService as any} /> : <ServiceWorkspace service={selectedService} /> : location === "/chat" ? <ChatPage /> : location === "/history" ? <HistoryPage /> : location === "/account" ? <AccountPage /> : location === "/tokens" ? <main className="portal-main"><TokenCard /><Notice tone="info">Ununuzi wa tokeni kupitia FimiPay umesitishwa kwa muda. Kwa taarifa kuhusu salio lililopo, wasiliana na support kupitia WhatsApp +255 698 232 313.</Notice></main> : <PortalHome search={search} onUse={handleUse} services={effectiveServices} userName={user?.name} isAuthenticated={isAuthenticated} allServicesPage={location === "/services"} />;
  const accessMode = resolveAccountAccessMode(user);
  const fullAccessBlocked = isAuthenticated && accessMode === "denied";
  const restrictionNotice = accessMode === "read_only"
    ? "Akaunti yako iko kwenye hali ya kusoma tu. Huwezi kutuma, kuhariri au kufanya maombi kwa sasa."
    : accessMode === "limited"
      ? `Akaunti yako imewekewa ruhusa maalum: ${accountRestrictionActions.filter((action) => user?.allowedActions?.includes(action)).map((action) => accountRestrictionActionLabels[action]).join(", ") || "hakuna kitendo kilichoruhusiwa"}.`
      : null;
  return <div className={`portal-shell ${compactMode ? "app-compact-mode" : ""}`} data-theme={appTheme} data-accent={appAccent} style={{ "--navy": "#071a36", "--green": appAccent === "blue" ? "#3b82f6" : appAccent === "purple" ? "#8b5cf6" : "#18b969", "--navy-2": "#0b2447" } as React.CSSProperties}>

    {fullAccessBlocked ? <AccountRestrictionGate reason={user?.restrictionReason} message={user?.restrictionMessage} onLogout={logout} /> : <>
      <div className={`portal-overlay ${menuOpen ? "show" : ""}`} onClick={() => setMenuOpen(false)} />
      <div className={`portal-sidebar-wrap ${menuOpen ? "open" : ""}`}><Sidebar onClose={() => setMenuOpen(false)} /></div>
      <div className="portal-content">
        <AppHeader onMenu={() => setMenuOpen(true)} search={search} setSearch={setSearch} />
        {restrictionNotice && <div className="portal-main"><Notice tone="info">{restrictionNotice}{user?.restrictionMessage?.trim() && <><br /><strong>{user.restrictionMessage}</strong></>}</Notice></div>}
        <Suspense fallback={<main className="portal-main page-loading-state"><span className="loading-orbit" aria-hidden="true"></span><strong>Inapakia sehemu hii...</strong><small>Subiri kidogo, tafadhali.</small></main>}>{page}</Suspense>
        <footer className="portal-footer">SmartServicesTZ — Huduma za Mtandaoni <span>© Haki zote zimehifadhiwa 2026</span></footer>
      </div>
      <BottomNav />
      {isAuthenticated && firebaseUser && user?.mustChangePassword === true ? <PasswordChangeGate /> : null}
    </>}
  </div>;
}
