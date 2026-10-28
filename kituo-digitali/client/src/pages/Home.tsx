import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import {
  BadgeCheck, Baby, BriefcaseBusiness, Eye, FilePen, EyeOff, ArrowLeft, Bell, CarFront, ChevronDown, ChevronRight, ChevronUp, CircleAlert, CircleDollarSign, Contact, Copy, CreditCard, ExternalLink, FileBadge, FileWarning, HeartHandshake, History, Image, Landmark, LayoutGrid, LoaderCircle, LockKeyhole, LogIn, Menu, MessageCircle, Music2, Palette, Plane, QrCode, Radio, Search, ScanFace, Settings2, ShieldCheck, Smartphone, Sparkles, Star, Store, Ticket, Trophy, Tv, UserRound, UserRoundPen, Users, Vote, WalletCards, Wifi, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { adminAdjustTokens, adminDeleteService, adminListServices, adminListTransactions, adminListUsers, adminSaveService, adminUpdateUser, completeRequiredPasswordChange, consumeFirebaseTokens, createServiceRequest, ensureDefaultServiceCatalog, firebaseAuth, registerFirebaseUser, signInWithPhonePassword, getCollectionOnce, subscribeToCollection, subscribeToTokenHistory, subscribeUserServiceApplications, subscribeUserMessages, markUserMessageRead, claimDailyTokenBonus } from "@/lib/firebase";
import { mergeServiceCatalogDefaults, serviceCatalog, specialServices, whatsappUrl, type ServiceCatalogItem } from "../../../shared/catalog";
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
const SmeVodacomPage = lazy(() => import("./SmeVodacomPage"));
const SmeAirtelPage = lazy(() => import("./SmeAirtelPage"));
const ChangeBusinessNameAirtelLipaPage = lazy(() => import("./ChangeBusinessNameAirtelLipaPage"));
const DynamicServicePage = lazy(() => import("./DynamicServicePage"));
const PocketWifiPage = lazy(() => import("./PocketWifiPage"));
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
const icons: Record<string, React.ElementType> = { "file-badge": FileBadge, "badge-check": BadgeCheck, contact: Contact, "qr-code": QrCode, vote: Vote, store: BriefcaseBusiness, ticket: Ticket, copy: Copy, "car-front": CarFront, search: Search, landmark: Landmark, baby: Baby, plane: Plane, "heart-handshake": HeartHandshake, "file-warning": FileWarning, "music-2": Music2, "image-search": Image, smartphone: Smartphone, "wallet-cards": WalletCards, "scan-face": ScanFace, "user-round-pen": UserRoundPen, palette: Palette, radio: Radio, trophy: Trophy, star: Star, tv: Tv, "file-pen": FilePen, "credit-card": CreditCard, "briefcase-business": BriefcaseBusiness, wifi: Wifi };

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
  return <div className="portal-modal-backdrop auth-backdrop" onClick={onClose}><div className={`portal-modal auth-modal auth-modal--${mode}`} onClick={(event) => event.stopPropagation()}><button className="modal-close" aria-label="Funga dirisha" onClick={onClose}><X size={19} /></button><div className="auth-hero"><span className="auth-hero-mark"><Zap size={25} /></span><span className="auth-hero-kicker">SMARTSERVICESTZ · AKAUNTI SALAMA</span><h2>{mode === "login" ? "Karibu tena!" : "Jiunge nasi leo!"}</h2><p>{mode === "login" ? "Ingia kuendelea kutumia huduma zako kwa urahisi." : "Tengeneza akaunti yako kwa hatua chache tu."}</p><span className="auth-hero-note"><ShieldCheck size={15} /> Rahisi · Haraka · Salama</span></div><div className="auth-form-content"><span className="overline">{mode === "login" ? "KARIBU TENA" : "ANZA SASA"}</span><h3>{mode === "login" ? "INGIA KWENYE AKAUNTI" : "JISAJILI AKAUNTI"}</h3><div className="auth-switch"><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setAuthError(null); }}>Ingia</button><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setAuthError(null); }}>Jisajili</button></div>{authError && <div className="auth-error-alert" role="alert"><div className="auth-error-alert__icon"><CircleAlert size={20} /></div><div><strong>{authError.title}</strong><p>{authError.detail}</p><code>{authError.code}</code></div></div>}<form onSubmit={(event) => { event.preventDefault(); void submit(); }}>{mode === "register" && <div className="auth-fields auth-fields--two"><label>Jina la kwanza<input required autoComplete="given-name" value={form.firstName} onChange={update("firstName")} /></label><label>Jina la mwisho<input required autoComplete="family-name" value={form.lastName} onChange={update("lastName")} /></label></div>}<div className="auth-fields"><label>Namba ya simu<input required inputMode="tel" autoComplete="tel" placeholder="0698232313" value={form.phone} onChange={update("phone")} /></label><label>{mode === "login" ? "Nenosiri" : "Nenosiri"}<PasswordField value={form.password} visible={showPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Password" onChange={update("password")} onToggle={() => setShowPassword((value) => !value)} /></label>{mode === "register" && <label>Nenosiri la Thibitisha<PasswordField value={form.confirmPassword} visible={showConfirmPassword} autoComplete="new-password" placeholder="Thibitisha password" onChange={update("confirmPassword")} onToggle={() => setShowConfirmPassword((value) => !value)} /></label>}</div>{mode === "login" && <button type="button" className="button button--green button--small" disabled={pending} onClick={resetPassword}>Umesahau Nenosiri → WhatsApp</button>}<button type="submit" className="button button--green button--wide" disabled={pending}>{pending ? "INASUBIRI..." : mode === "login" ? "INGIA" : "TENGENEZA AKAUNTI"}</button></form></div></div></div>;
}

function AppHeader({ onMenu, search, setSearch }: { onMenu: () => void; search: string; setSearch: (value: string) => void }) {
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<Record<string, unknown> & { id: string }>>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isAuthenticated || !user?.uid) { setNotifications([]); return undefined; }
    return subscribeUserMessages(user.uid, setNotifications, (error) => {
      console.error("Imeshindikana kusoma notification za mtumiaji", error);
      toast.error("Imeshindikana kupakia ujumbe. Tafadhali ingia tena au wasiliana na support.");
    });
  }, [isAuthenticated, user?.uid]);
  const unreadCount = notifications.filter((item) => item.read !== true && !(Array.isArray(item.readBy) && item.readBy.includes(user?.uid ?? ""))).length;
  const openNotification = async (item: Record<string, unknown> & { id: string }) => {
    if (user?.uid && item.read !== true && !(Array.isArray(item.readBy) && item.readBy.includes(user.uid))) {
      try { await markUserMessageRead(item.id, user.uid); setNotifications((rows) => rows.map((row) => row.id === item.id ? { ...row, readBy: [...(Array.isArray(row.readBy) ? row.readBy as string[] : []), user.uid] } : row)); }
      catch { toast.error("Imeshindikana kuweka arifa kuwa imesomwa."); }
    }
    const target = typeof item.targetPath === "string" ? item.targetPath : typeof item.href === "string" ? item.href : String(item.type ?? "").toLowerCase().includes("nida") ? "/#cheki-nida" : "/";
    setNotificationsOpen(false);
    navigate(target);
  };
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
    <header className="app-header">
      <button type="button" className="header-back-button" onClick={() => window.history.length > 1 ? window.history.back() : navigate("/")} aria-label="Rudi hatua moja nyuma"><ArrowLeft size={20}/><span>Back</span></button>
      <button className="mobile-menu" onClick={onMenu} aria-label="Fungua menyu"><Menu size={24} /></button>
      <Link href="/" className="portal-brand"><span className="portal-logo" aria-label="SmartServicesTZ logo"><i>S</i><b>S</b></span><span><b>SmartServicesTZ</b><small className="brand-subtitle">HUDUMA ZA MTANDAONI</small></span></Link>
      <label className="global-search"><Search size={18} /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tafuta huduma, akaunti au sehemu..." aria-label="Tafuta huduma" /><kbd>Ctrl/⌘ K</kbd></label>
      <div className="header-actions"><a className="header-support" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="Wasiliana na support kupitia WhatsApp"><MessageCircle size={17} /><span>WhatsApp</span></a><div className="notification-anchor" style={{ position: "relative" }}><button type="button" className="header-icon" onClick={() => { if (isAuthenticated) setNotificationsOpen((open) => !open); else { setAuthOpen(true); toast("Ingia ili kuona taarifa za akaunti yako."); } }} aria-label="Fungua arifa na ujumbe" title="Arifa na ujumbe"><Bell size={19} />{unreadCount > 0 && <span style={{ position: "absolute", right: "-4px", top: "-5px", minWidth: "17px", height: "17px", borderRadius: "999px", background: "#dc2626", color: "#fff", fontSize: "10px", fontWeight: 800, display: "grid", placeItems: "center", padding: "0 3px" }}>{unreadCount > 99 ? "99+" : unreadCount}</span>}</button>{notificationsOpen && <div role="dialog" aria-label="Notification na ujumbe" style={{ position: "absolute", right: 0, top: "calc(100% + 12px)", zIndex: 100, width: "min(360px, calc(100vw - 28px))", maxHeight: "min(70vh, 520px)", overflowY: "auto", background: "#fff", color: "#172033", border: "1px solid #dce4ec", borderRadius: "14px", boxShadow: "0 18px 48px #0f172a2b", padding: "14px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "10px" }}><strong>Ujumbe na notification</strong><button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Funga notification" style={{ border: 0, background: "transparent", fontSize: "20px", cursor: "pointer" }}>×</button></div>{notifications.length === 0 ? <p style={{ margin: 0, padding: "20px 4px", color: "#68758a", fontSize: "13px" }}>Bado hujapokea ujumbe. Ujumbe wa hali ya maombi utaonekana hapa.</p> : notifications.slice(0, 30).map((item) => <article key={item.id} onClick={() => void openNotification(item)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") void openNotification(item); }} style={{ padding: "11px 2px", borderTop: "1px solid #edf1f5", cursor: "pointer", background: item.read === true || (Array.isArray(item.readBy) && item.readBy.includes(user?.uid ?? "")) ? "#fff" : "#eff6ff" }}><strong style={{ display: "block", fontSize: "13px", lineHeight: 1.4 }}>{String(item.subject ?? "Taarifa mpya")}</strong><p style={{ whiteSpace: "pre-wrap", margin: "5px 0", color: "#465569", fontSize: "12px", lineHeight: 1.55 }}>{String(item.body ?? "")}</p><small style={{ color: "#8793a3", fontSize: "10px" }}>{String(item.createdAt ?? "")}</small></article>)}</div>}</div>{isAuthenticated ? <span className="header-user">{user?.name ?? "Mwanachama"} <VerifiedTick verified={user?.verificationStatus === "approved"} /></span> : <button className="button button--green button--small" onClick={() => setAuthOpen(true)}><LogIn size={15} /> Ingia / Jisajili</button>}</div>
    </header>{authOpen && <LocalAuthModal onClose={() => setAuthOpen(false)} />}
  </>;
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const items = [{ href: "/", label: "Mwanzo", icon: LayoutGrid }, { href: "/services", label: "Huduma zote", icon: Zap }, { href: "/tokens", label: "Tokeni", icon: CircleDollarSign }, { href: "/history", label: "Historia", icon: History }, { href: "/account", label: "Settings", icon: Settings2 }];
  return <aside className="sidebar-portal"><div className="sidebar-brand"><Link href="/" onClick={onClose}><b>SmartServicesTZ</b><small className="brand-subtitle">DIGITAL SERVICE HUB</small></Link><button className="sidebar-close" onClick={onClose}><X size={20} /></button></div><div className="sidebar-user"><div className="user-avatar">{user?.profileImageUrl ? <img src={user.profileImageUrl} alt="" /> : (user?.name?.slice(0, 2).toUpperCase() ?? "HM")}</div><div><strong>{user?.name ?? "Mgeni"} <VerifiedTick verified={user?.verificationStatus === "approved"} /></strong><small>{user ? "Akaunti yangu" : "Ingia kuanza"}</small></div></div><nav>{items.map(({ href, label, icon: ItemIcon }) => <Link key={href} href={href} onClick={onClose} className={`portal-nav-item ${href === "/" ? location === "/" : location.startsWith(href) ? "active" : ""}`}><ItemIcon size={19} /><span>{label}</span></Link>)}</nav>{["super_admin", "admin", "moderator", "support"].includes(user?.role ?? "") && <><Link href="/admin" className={`portal-nav-item admin-link ${location === "/admin" ? "active" : ""}`}><Settings2 size={19} /><span>Paneli ya Admin</span></Link></>}<div className="sidebar-foot"><ShieldCheck size={17} /><span>Huduma salama<br /><small>Tokeni zako zinalindwa.</small></span></div></aside>;
}

function TokenCard({ compact = false }: { compact?: boolean }) {
  const { isAuthenticated, profile } = useAuth();
  const [tokenChoiceOpen, setTokenChoiceOpen] = useState(false);
  const [otherTokens, setOtherTokens] = useState("0");
  const [paidFromPhone, setPaidFromPhone] = useState(profile?.phone ?? "");
  const totalBalance = (profile?.tokenBalanceNida ?? 0) + (profile?.tokenBalanceOther ?? profile?.tokenBalance ?? 0);
  const status = profile?.verificationStatus ?? "pending";
  const otherCount = Math.max(0, Math.floor(Number(otherTokens) || 0));
  const otherAmount = otherCount * 500;
  const totalAmount = otherAmount;
  const paymentPhone = paidFromPhone.trim() || profile?.phone || "";
  const canProceed = totalAmount >= 1000 && otherCount > 0 && paymentPhone.trim().length >= 9;
  const openWhatsAppProof = () => {
    if (!canProceed) return;
    const message = [
      "Habari SmartServicesTZ, nimelipia tokeni na natuma ushahidi wa malipo.",
      "",
      "Jina la akaunti: " + (profile?.name ?? "Halijatajwa"),
      "Namba ya akaunti: " + (profile?.phone ?? "Haipo"),
      "Namba iliyolipia: " + paymentPhone.trim(),
      "Lipa namba: 29126823",
      "Jina la mpokeaji: Steward Tz",
      "Kiasi kilicholipwa: TZS " + totalAmount.toLocaleString("en-US"),
      "Tokeni za huduma: " + otherCount + " (TZS " + otherAmount.toLocaleString("en-US") + ")",
      "",
      "Nimeambatisha ushahidi wa malipo. Tafadhali hakiki na ongeza tokeni kwenye akaunti yangu."
    ].join("\n");
    window.location.href = "https://wa.me/255698232313?text=" + encodeURIComponent(message);
    setTokenChoiceOpen(false);
  };

  return <section className={`token-card ${compact ? "token-card--compact" : ""}`}>
    <div className="token-card__top"><div className="token-icon"><WalletCards size={26} /></div><div><span className="overline">WALLET YA TOKENI</span><strong>{isAuthenticated ? totalBalance : 0}</strong><span className="token-label">salio la tokeni za huduma</span></div></div>
    <div className="token-card__meta"><div className="token-account-identity"><strong className="token-account-name">{profile?.name ?? "Mwanachama"}</strong><div className="token-phone-line"><span>{profile?.phone ?? "—"}</span><span className={`token-verification-status ${status === "approved" ? "is-verified" : "is-pending"}`}>{status === "approved" ? <><BadgeCheck size={16} aria-hidden="true"/> Verified</> : "Haijathibitishwa"}</span></div></div></div>
    {status !== "approved" && isAuthenticated && <div className="account-warning">Akaunti yako haijathibitishwa na admin. Huduma zitaanza baada ya admin kuidhinisha akaunti.</div>}
    <button className="button button--green token-add-button" disabled={!isAuthenticated} onClick={() => setTokenChoiceOpen(true)}><span className="token-add-plus">＋</span><span><b>ONGEZA TOKENI</b><small>Lipa kwanza, kisha tuma ushahidi WhatsApp</small></span><ChevronRight size={18}/></button>
    {!isAuthenticated && <small className="token-note">Ingia au jisajili ili kuongeza tokeni.</small>}
    {tokenChoiceOpen && typeof document !== "undefined" && createPortal(<div className="token-choice-modal" role="dialog" aria-modal="true">
      <div className="token-choice-card">
        <div className="token-choice-head"><div><span className="overline">ONGEZA TOKENI</span><h3>Nunua tokeni za huduma</h3></div><button type="button" onClick={() => setTokenChoiceOpen(false)} aria-label="Funga">×</button></div>
        <div className="token-choice-fields">
          <label><strong>Idadi ya tokeni za huduma</strong><span>Tokeni 1 = TZS 500</span><input aria-label="Idadi ya tokeni za huduma" type="number" min="0" step="1" value={otherTokens} onChange={e=>setOtherTokens(e.target.value)} /></label>
        </div>
        <div className="token-choice-total"><span>Jumla ya kulipa</span><strong>TZS {totalAmount.toLocaleString("en-US")}</strong><small>Kiasi cha chini ni TZS 1,000; unaweza kuongeza tokeni na kulipa zaidi.</small></div>
        <label className="token-choice-phone"><strong>Namba iliyolipia</strong><input type="tel" value={paymentPhone} onChange={e=>setPaidFromPhone(e.target.value)} placeholder="07XXXXXXXX" /></label>
        <div className="token-choice-payto"><div className="token-choice-payto-row"><span>NAMBA YA LIPA</span><strong>29126823</strong></div><div className="token-choice-payto-row"><span>JINA LA MPOKEAJI</span><strong>Steward Tz</strong></div><div className="token-choice-payto-row"><span>HUDUMA</span><strong>Azam Pesa</strong></div></div>
        <button type="button" className="button button--green" style={{width:"100%",marginTop:14,justifyContent:"center"}} disabled={!canProceed} onClick={openWhatsAppProof}>NIMELIPA — TUMA WHATSAPP</button>
        <p className="token-choice-help">Baada ya kulipa, tuma picha ya uthibitisho WhatsApp. Tokeni zitaongezwa baada ya malipo kuhakikiwa.</p>
      </div>
    </div>, document.body)}
  </section>;
}
function ServiceCard({ service, onUse }: { service: ServiceCatalogItem; onUse: (service: ServiceCatalogItem) => void }) {
  const locked = service.kind === "locked";
  const external = Boolean(service.actionUrl);
  // Assign color by service feature (slug), not by icon name. This prevents
  // multiple services that reuse one icon from all appearing blue.
  const serviceColors: Record<string, string> = {
    "leseni-biashara": "#059669",
    "cheti-tin": "#7c3aed",
    "leseni-udereva": "#ea580c",
    "verify-tin": "#16a34a",
    "nakala-nida": "#4f46e5",
    "mpiga-kura": "#0891b2",
    "stika-lipa": "#db2777",
    "stika-mawakala": "#d97706",
    "pata-lipa-namba": "#0d9488",
    "access-lipa-number": "#8b5cf6",
    "kitambulisho-wakala": "#e11d48",
    "sme-airtel-mkataba": "#475569",
    "sme-vodacom": "#e60000",
    "sme-airtel": "#ed1c24",
    "change-business-name-airtel-lipa": "#9333ea",
    "tengeneza-mkataba": "#be185d",
    "brela": "#2563eb",
    "cheti-kuzaliwa": "#ec4899",
    "simba-sc": "#ca8a04",
    "yanga-africans": "#16a34a",
    "azam-tv": "#6366f1",
    "pata-pocket-wifi-mabando": "#0891b2",
  };
  const palette = ["#0f766e", "#c2410c", "#7e22ce", "#be123c", "#047857", "#b45309", "#4338ca", "#0e7490", "#a21caf", "#4d7c0f"];
  const colorIndex = [...service.slug].reduce((sum, character) => sum + character.charCodeAt(0), 0) % palette.length;
  const accent = locked ? "#dc2626" : (serviceColors[service.slug] ?? palette[colorIndex]);
  const serviceIcons: Record<string, string> = { "pata-lipa-namba": "wallet-cards", "access-lipa-number": "smartphone", "nakala-nida": "contact", "cheti-tin": "file-badge", "leseni-biashara": "briefcase-business", "leseni-udereva": "car-front", "stika-lipa": "qr-code", "stika-mawakala": "ticket", "sme-vodacom": "radio", "sme-airtel": "credit-card", "sme-airtel-mkataba": "copy", "change-business-name-airtel-lipa": "file-pen", "brela": "landmark", "mpiga-kura": "vote", "kitambulisho-wakala": "user-round-pen", "cheti-kuzaliwa": "baby", "simba-sc": "trophy", "yanga-africans": "star", "azam-tv": "tv", "pata-pocket-wifi-mabando": "wifi" };
  const iconName = locked ? service.icon : serviceIcons[service.slug] ?? service.icon;
  return <div className="portal-service-card-wrap">
    <button className={`portal-service-card service-${service.kind} ${external ? "service-external" : ""}`} onClick={() => onUse(service)} style={{ background: `linear-gradient(145deg, ${accent}18 0%, #ffffff 78%)`, borderColor: `${accent}55`, boxShadow: `0 5px 18px ${accent}12` }}>
      <div className="service-card-icon" data-service-icon={iconName} style={{ background: `linear-gradient(145deg, #ffffff 12%, ${accent}22 100%)`, color: accent, border: `1px solid ${accent}55`, boxShadow: `0 6px 14px ${accent}22` }}><span className="service-card-icon__ring" aria-hidden="true" /><Icon name={iconName} size={24} /></div>
      <div className="service-card-copy"><strong>{service.name}</strong><span>{locked ? (service.maintenanceMessage || "Huduma hii inafanyiwa maboresho kwa sasa. Jaribu tena baadaye.") : service.description}</span></div>
      <div className="service-card-foot">{locked ? <span className="locked-label"><LockKeyhole size={14} /> IMEFUNGWA</span> : service.slug === "pata-pocket-wifi-mabando" ? <span className="paid-label"><Wifi size={14} /> Vifaa &amp; Mabando</span> : service.kind === "free" ? <span className="free-label">Bure</span> : <span className="paid-label"><CreditCard size={14} /> Tokeni {service.tokenCost}</span>}{external ? <span className="external-label"><ExternalLink size={13} /> FUNGUA</span> : <ChevronRight size={17} />}</div>
    </button>
  </div>;
}

function ServiceGrid({ title, services, onUse }: { title: string; services: ServiceCatalogItem[]; onUse: (service: ServiceCatalogItem) => void }) { const arrangedServices = [...services].sort((a, b) => Number(a.kind === "locked") - Number(b.kind === "locked") || a.name.localeCompare(b.name, "sw")); const openCount = arrangedServices.filter((service) => service.kind !== "locked").length; return <section className="portal-section"><div className="section-title"><div><span className="overline">Mkusanyiko wa huduma</span><h2>{title}</h2><p className="service-order-hint">{openCount} wazi · {arrangedServices.length - openCount} zimefungwa</p></div><span className="section-count">{services.length}</span></div><div className="portal-service-grid">{arrangedServices.map((service) => <ServiceCard key={service.slug} service={service} onUse={onUse} />)}</div></section>; }

function SpecialSection() {
  const open = (item: typeof specialServices[number]) => {
    if ("url" in item && item.url) { window.open(item.url, "_blank", "noopener,noreferrer"); return; }
    const action = (item as unknown as { action?: string }).action;
    if (action === "whatsapp") { window.open(whatsappUrl, "_blank", "noopener,noreferrer"); return; }
    toast("Tuma ujumbe WhatsApp kupata maelezo ya malipo.", { action: { label: "WhatsApp", onClick: () => window.open(whatsappUrl, "_blank") } });
  };
  return <div className="special-grid">{specialServices.map((item) => { const action = (item as unknown as { action?: string }).action; return <button key={item.slug} className={`special-card special-card--${item.tone}`} onClick={() => open(item)}><div><strong>{item.name}</strong><small>{"url" in item ? (item.url.includes("chat.whatsapp.com") ? "Fungua WhatsApp Group" : "Fungua huduma") : action === "whatsapp" ? "Fungua WhatsApp" : "Wasiliana nasi kwa malipo"}</small></div><ExternalLink size={18} /></button>; })}</div>;
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


function HistoryPage() {
  const { firebaseUser } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [serviceApplications, setServiceApplications] = useState<any[]>([]);
  const [downloads, setDownloads] = useState<DownloadHistoryItem[]>([]);

  const refreshDownloads = () => setDownloads(getDownloadHistory());

  useEffect(() => {
    if (!firebaseUser) { setRows([]); return; }
    return subscribeToTokenHistory(firebaseUser.uid, setRows);
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser?.uid) { setServiceApplications([]); return; }
    return subscribeUserServiceApplications(firebaseUser.uid, setServiceApplications, (error) => {
      console.error("Imeshindikana kupakia historia ya maombi ya huduma", error);
      toast.error("Historia ya maombi haijapakiwa. Jaribu kuingia tena.");
    });
  }, [firebaseUser?.uid]);

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

    <section style={{marginBottom:24}}>
      <div className="page-heading" style={{marginBottom:10}}><div><span className="overline">Ufuatiliaji</span><h2>MAOMBI YANGU YA HUDUMA</h2><p>Angalia hali ya maombi yako bila kuwasiliana na support.</p></div></div>
      <div className="account-panel" style={{maxWidth:"none"}}>
        {!firebaseUser ? <Notice tone="info">Ingia kwenye akaunti yako ili kuona maombi yako.</Notice> :
          serviceApplications.length === 0 ? <Notice tone="info">Bado hujatuma ombi la huduma, au hakuna rekodi zinazopatikana.</Notice> :
          <div style={{display:"grid",gap:10}}>
            {serviceApplications.slice().sort((a,b)=>new Date(String(b.updatedAt ?? b.submittedAt ?? 0)).getTime()-new Date(String(a.updatedAt ?? a.submittedAt ?? 0)).getTime()).map((item) => {
              const status = String(item.status ?? "PENDING").toUpperCase();
              const statusLabel = status === "APPROVED" ? "Limekamilika / Limeidhinishwa" : status === "REJECTED" ? "Limekataliwa" : status === "PROCESSING" ? "Linafanyiwa kazi" : status === "PENDING" ? "Linasubiri kushughulikiwa" : status;
              const dateValue = item.updatedAt ?? item.submittedAt;
              let dateLabel = "Tarehe haipo";
              try { const date = dateValue?.toDate ? dateValue.toDate() : new Date(String(dateValue)); if (!Number.isNaN(date.getTime())) dateLabel = date.toLocaleString("sw-TZ"); } catch { /* show fallback */ }
              return <div key={item.id} style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap",padding:"14px",border:"1px solid #e2e8f0",borderRadius:12,background:"#f8fafc"}}>
                <div style={{minWidth:0,flex:"1 1 220px"}}>
                  <strong style={{display:"block",color:"#0f172a"}}>{String(item.serviceName ?? item.serviceSlug ?? "Huduma")}</strong>
                  <small style={{display:"block",marginTop:5,color:"#64748b"}}>Rejea: {String(item.applicationId ?? item.id)} · Iliyosasishwa: {dateLabel}</small>
                  {status === "REJECTED" && item.rejectionReason && <p style={{margin:"7px 0 0",fontSize:12,color:"#b91c1c"}}>Sababu: {String(item.rejectionReason)}</p>}
                  {item.adminNote && <p style={{margin:"7px 0 0",fontSize:12,color:"#475569"}}>Ujumbe: {String(item.adminNote)}</p>}
                </div>
                <span className={status === "APPROVED" ? "verification verification--approved" : status === "REJECTED" ? "verification verification--rejected" : "verification verification--pending"}>{statusLabel}</span>
              </div>;
            })}
          </div>
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


function PortalHome({ search, onUse, services, userName, isAuthenticated, allServicesPage }: { search: string; onUse: (service: ServiceCatalogItem) => void; services: ServiceCatalogItem[]; userName?: string; isAuthenticated: boolean; allServicesPage: boolean }) {
  const [category, setCategory] = useState("Zote");
  const [showAppDownload, setShowAppDownload] = useState(false);
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    const isNativeApp = /SmartServicesTZApp/i.test(navigator.userAgent) || window.matchMedia("(display-mode: standalone)").matches;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem("stz-app-download-dismissed") === "1"; } catch {}
    if (isNativeApp || dismissed) return;
    showTimer = setTimeout(() => setShowAppDownload(true), 3500);
    hideTimer = setTimeout(() => setShowAppDownload(false), 14000);
    return () => { if (showTimer) clearTimeout(showTimer); if (hideTimer) clearTimeout(hideTimer); };
  }, []);
  const [favoriteSlugs, setFavoriteSlugs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("steward-tz-favorite-services-v1") || "[]"); } catch { return []; }
  });
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
    const stopSettings = subscribeToCollection("siteSettings", (rows) => {
      const settings = rows.find((item) => item.id === "public");
      if (Array.isArray(settings?.serviceOrder)) setServiceOrder(settings.serviceOrder.filter((id: unknown): id is string => typeof id === "string"));
      if (Array.isArray(settings?.homepageSectionOrder)) setHomepageSectionOrder(settings.homepageSectionOrder.filter((id: unknown): id is string => typeof id === "string"));
      setLayout((current) => ({ ...current, ...Object.fromEntries(Object.keys(current).map((key) => [key, settings?.[key] ?? current[key as keyof typeof current]])) }));
    });
    const stopLocks = subscribeToCollection("serviceLocks", (rows) => setServiceLockOverrides(Object.fromEntries(rows.map((item) => [String(item.slug ?? item.id), item.isLocked === true]))));
    return () => { stopSettings(); stopLocks(); };
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
    tutorials: null,
  };
  const orderedSections = completeOrder([...defaultHomepageSectionOrder], homepageSectionOrder);
  const freeCount = displayedServices.filter((service) => service.kind === "free").length;
  const paidCount = displayedServices.filter((service) => service.kind === "paid").length;
  const lockedCount = displayedServices.filter((service) => service.kind === "locked").length;
  const layoutStyle = { "--home-cols": layout.homeColumns, "--home-tablet-cols": layout.homeTabletColumns, "--home-mobile-cols": layout.homeMobileColumns, "--section-gap": `${layout.sectionGap}px`, "--card-gap": `${layout.cardGap}px`, "--card-radius": `${layout.cardRadius}px`, "--card-padding": `${layout.cardPadding}px`, "--hero-radius": `${layout.heroRadius}px`, "--hero-padding": `${layout.heroPadding}px`, "--content-max": `${layout.contentMaxWidth}px` } as React.CSSProperties;
  return <main className={`portal-main ${layout.compactCards ? "layout-compact" : ""}`} style={layoutStyle}>
    {/* Mwanzo sasa unaanza moja kwa moja na Wallet ya Tokeni kama ilivyoombwa. */}
    <TokenCard />
    {showAppDownload && <aside role="complementary" aria-label="Pakua SmartServicesTZ App" style={{ position: "fixed", right: 14, bottom: "calc(82px + env(safe-area-inset-bottom))", zIndex: 80, width: "min(330px, calc(100vw - 28px))", padding: "11px 12px", borderRadius: 16, border: "1px solid rgba(59,130,246,.38)", background: "var(--navy, #071a36)", color: "#fff", boxShadow: "0 10px 35px rgba(0,0,0,.28)", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 12, background: "rgba(59,130,246,.18)", color: "#60a5fa", flexShrink: 0 }}><Smartphone size={21} /></span>
      <div style={{ flex: 1, minWidth: 0 }}><strong style={{ display: "block", fontSize: 13 }}>SmartServicesTZ App</strong><a href="https://github.com/SmartServicesTZ/Huduma-za-mitandaoni/releases/download/smartservicestz-latest/SmartServicesTZ.apk" style={{ display: "inline-block", marginTop: 3, color: "#86efac", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>Pakua App <ExternalLink size={12} style={{ display: "inline", verticalAlign: "middle" }} /></a></div>
      <button type="button" aria-label="Funga tangazo la App" onClick={() => { setShowAppDownload(false); try { sessionStorage.setItem("stz-app-download-dismissed", "1"); } catch {} }} style={{ border: 0, background: "transparent", color: "#cbd5e1", padding: 4, cursor: "pointer" }}><X size={17} /></button>
    </aside>}
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
  const [serviceNotice, setServiceNotice] = useState("");
  const { isAuthenticated, firebaseUser, user, profile, logout } = useAuth();
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [catalogInitialized, setCatalogInitialized] = useState(false);
  // Closing the mobile drawer on route changes prevents a stuck drawer after navigation/refresh.
  useEffect(() => { setMenuOpen(false); }, [location]);
  useEffect(() => { if (!isAuthenticated || !firebaseUser) return; void claimDailyTokenBonus().catch(() => undefined); }, [isAuthenticated, firebaseUser?.uid]);
  useEffect(() => {
    let cancelled = false;
    void getCollectionOnce("services").then((rows) => {
    if (cancelled) return;
    setServices(rows.map((item) => ({ slug: ["thibitisha-tin", "verify-tin"].includes(String(item.slug ?? item.id)) ? "verify-tin" : String(item.slug ?? item.id) === "nakala-nida-2" ? "sme-airtel-mkataba" : (item.slug ?? item.id), name: String(String(item.slug ?? item.id) === "thibitisha-tin" || String(item.slug ?? item.id) === "verify-tin" ? "VERIFY TIN" : String(item.slug ?? item.id) === "nakala-nida-2" || String(item.slug ?? item.id) === "sme-airtel-mkataba" ? "SME AIRTEL MKATABA" : item.name ?? "Huduma"), description: String(String(item.slug ?? item.id) === "nakala-nida-2" || String(item.slug ?? item.id) === "sme-airtel-mkataba" ? "Jaza na hakiki mkataba wa SME wa Airtel." : item.description ?? ""), icon: String(item.icon ?? "sparkles"), tokenCost: Number(item.tokenCost ?? 0), tokenType: item.tokenType === "nida" ? "nida" : "huduma", category: String(item.category ?? "Huduma kuu"), kind: (item.isLocked ? "locked" : item.isFree || Number(item.tokenCost ?? 0) <= 0 ? "free" : "paid") as ServiceCatalogItem["kind"], actionUrl: typeof item.actionUrl === "string" ? item.actionUrl : undefined, order: Number(item.order ?? 9999), fields: Array.isArray(item.fields) ? item.fields : undefined, active: item.active !== false, isVisible: item.isVisible !== false, isLocked: item.isLocked === true, maintenanceMessage: typeof item.maintenanceMessage === "string" ? item.maintenanceMessage : undefined })));
    setServicesLoading(false);
    }).catch(() => { if (!cancelled) setServicesLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void getCollectionOnce("siteSettings").then((rows) => {
      if (cancelled) return;
      const settings = rows.find((item) => item.id === "public");
      setCatalogInitialized(settings?.catalogInitialized === true);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
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
  const totalTokenBalance = (profile?.tokenBalanceNida ?? 0) + (profile?.tokenBalanceOther ?? profile?.tokenBalance ?? 0);
  const appTheme = profile?.settings?.theme ?? "dark";
  const appAccent = profile?.settings?.accent ?? "green";
  const compactMode = profile?.settings?.compactMode === true;
  const useService = { mutate: async (service: ServiceCatalogItem) => { if (!firebaseUser) return; const requestId = tokenOperationKeys.current.get(service.slug) ?? crypto.randomUUID(); tokenOperationKeys.current.set(service.slug, requestId); try { const result = await consumeFirebaseTokens(firebaseUser.uid, service, requestId); toast.success(`${service.name} imefunguliwa.`, { description: `Rejea: ${result.reference}` }); if (service.actionUrl) window.location.href = service.actionUrl; else navigate(`/service/${service.slug}`); } catch (error: any) { toast.error(error?.message ?? "Imeshindikana kutumia huduma."); } finally { tokenOperationKeys.current.delete(service.slug); } } };
  const handleUse = (service: ServiceCatalogItem) => { if (service.kind === "locked") { setServiceNotice(`${service.name}: huduma hii imefungwa kwa sasa na msimamizi. Tafadhali chagua huduma nyingine au jaribu tena baadaye.`); return; } if (!isAuthenticated) { toast("Ingia kwanza ili kutumia huduma kwa kutumia kitufe cha Ingia / Jisajili."); return; } if (totalTokenBalance <= 0) { toast.error("Huna tokeni. Ongeza tokeni kwanza ili kufungua huduma yoyote."); navigate("/tokens"); return; } if (["leseni-biashara", "pata-lipa-namba", "access-lipa-number", "tengeneza-mkataba"].includes(service.slug) || !service.actionUrl) { navigate(`/service/${service.slug}`); return; } if (!tokenOperationKeys.current.has(service.slug)) useService.mutate(service); };
  const serviceSlug = location.startsWith("/service/") ? location.slice("/service/".length) : "";
  const effectiveServices = mergeServiceCatalogDefaults(services, catalogInitialized).filter((service) => service.slug !== "utafutaji-nida" && !/\bnida\b/i.test(`${service.name} ${service.slug}`));
  const selectedService = effectiveServices.find((item) => item.slug === serviceSlug && item.active !== false && item.isVisible !== false);
  const serviceFields = Array.isArray(selectedService?.fields) ? selectedService.fields : [];
  const page = serviceSlug && (!isAuthenticated || totalTokenBalance <= 0) ? <main className="portal-main"><section className="license-form-card" style={{ maxWidth: 620, margin: "40px auto", textAlign: "center" }}><div className="token-icon" style={{ margin: "0 auto 16px" }}><WalletCards size={30} /></div><h1>{!isAuthenticated ? "Ingia kwanza" : "Huna tokeni"}</h1><p>{!isAuthenticated ? "Ingia kwenye akaunti yako ili kutumia huduma." : "Huna tokeni zilizobaki. Ongeza tokeni kwanza; huduma hazitafunguka mpaka salio liwe zaidi ya sifuri."}</p><button type="button" className="button button--green" onClick={() => navigate(!isAuthenticated ? "/" : "/tokens")}>{!isAuthenticated ? "RUDI KUINGIA" : "ONGEZA TOKENI"}</button></section></main> : location.startsWith("/admin") ? <AdminPage /> : serviceSlug === "kitambulisho-wakala" ? <AgentIdPage /> : serviceSlug === "leseni-biashara" ? <BusinessLicensePage /> : serviceSlug === "pata-lipa-namba" ? <LipaNumberPage /> : serviceSlug === "pata-pocket-wifi-mabando" ? <PocketWifiPage /> : serviceSlug === "access-lipa-number" ? <AccessLipaNumberPage /> : serviceSlug === "sme-vodacom" ? <SmeVodacomPage /> : serviceSlug === "sme-airtel" ? <SmeAirtelPage /> : serviceSlug === "change-business-name-airtel-lipa" ? <ChangeBusinessNameAirtelLipaPage /> : serviceSlug === "cheti-tin" ? <TINCertificatePage /> : serviceSlug === "verify-tin" ? <VerifyTinPage /> : serviceSlug === "sme-airtel-mkataba" ? <AirtelSmeContractPage /> : serviceSlug === "tengeneza-mkataba" ? <ContractMakerPage /> : ["stika-mawakala", "sticker-za-wakala", "sticker-wakala", "sticker-wakala-1"].includes(serviceSlug ?? "") ? <AgentStickerPage /> : serviceSlug && servicesLoading ? <main className="portal-main"><Notice tone="info">Inapakia huduma kutoka Firestore…</Notice></main> : selectedService ? serviceFields.length ? <DynamicServicePage service={selectedService as any} /> : <ServiceWorkspace service={selectedService} /> : location === "/chat" ? <main className="portal-main"><section className="account-panel" style={{maxWidth:620,margin:"40px auto",textAlign:"center"}}><h1>Chat imezimwa kwa sasa</h1><p>Huduma hii imesitishwa kwa muda ili kupunguza matumizi ya mfumo.</p><button type="button" className="button button--green" onClick={() => navigate("/")}>Rudi Mwanzo</button></section></main> : location === "/history" ? <HistoryPage /> : location === "/account" ? <AccountPage /> : location === "/tokens" ? <main className="portal-main"><TokenCard /><Notice tone="info">Ununuzi wa tokeni kupitia FimiPay umesitishwa kwa muda. Kwa taarifa kuhusu salio lililopo, wasiliana na support kupitia WhatsApp +255 698 232 313.</Notice></main> : <PortalHome search={search} onUse={handleUse} services={effectiveServices} userName={user?.name} isAuthenticated={isAuthenticated} allServicesPage={location === "/services"} />;
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
        {serviceNotice && <div className="portal-main"><Notice>{serviceNotice}</Notice><button type="button" onClick={() => setServiceNotice("")}>Funga ujumbe</button></div>}
        {restrictionNotice && <div className="portal-main"><Notice tone="info">{restrictionNotice}{user?.restrictionMessage?.trim() && <><br /><strong>{user.restrictionMessage}</strong></>}</Notice></div>}
        <Suspense fallback={null}>{page}</Suspense>
        <footer className="portal-footer">SmartServicesTZ — Huduma za Mtandaoni <span>© Haki zote zimehifadhiwa 2026</span></footer>
      </div>
      <BottomNav />
      {isAuthenticated && firebaseUser && user?.mustChangePassword === true ? <PasswordChangeGate /> : null}
    </>}
  </div>;
}

/* Remove the small favorite-star controls from service cards as requested. */
