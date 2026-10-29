import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import "./HomeRefresh.css";
import {
  BadgeCheck, Baby, BriefcaseBusiness, Eye, FilePen, EyeOff, ArrowLeft, Bell, CarFront, ChevronDown, ChevronRight, ChevronUp, CircleAlert, CircleDollarSign, Contact, Copy, CreditCard, ExternalLink, FileBadge, FileWarning, HeartHandshake, History, Image, Landmark, LayoutGrid, LoaderCircle, LockKeyhole, LogIn, Menu, MessageCircle, Music2, Palette, Plane, QrCode, Radio, Search, ScanFace, Settings2, ShieldCheck, Smartphone, Sparkles, Star, Store, Ticket, Trophy, Tv, UserRound, UserRoundPen, Users, Vote, WalletCards, Wifi, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { adminAdjustTokens, adminDeleteService, adminListServices, adminListTransactions, adminListUsers, adminSaveService, adminUpdateUser, completeRequiredPasswordChange, consumeFirebaseTokens, createServiceRequest, ensureDefaultServiceCatalog, firebaseAuth, registerFirebaseUser, signInWithPhonePassword, getCollectionOnce, getPublicSiteSettingsOnce, subscribeToCollection, subscribeToTokenHistory, subscribeUserServiceApplications, subscribeUserLipaApplications, subscribeUserMessages, markUserMessageRead, claimDailyTokenBonus } from "@/lib/firebase";
import { getPortalServiceName, mergeServiceCatalogDefaults, serviceCatalog, specialServices, whatsappUrl, type ServiceCatalogItem } from "../../../shared/catalog";
import { normalizeTanzaniaPhone } from "../../../shared/tanzaniaPhone";
import { resolveAccountAccessMode, accountRestrictionActionLabels, accountRestrictionActions } from "../../../shared/accountAccess";
import { completeOrder, defaultHomepageSectionOrder, isServiceLocked, orderByIds, preferredHomepageServiceSlugs, prioritizeHomepageServices, type HomepageSectionId } from "../../../shared/serviceOrdering";
import { clearDownloadHistory, downloadFromHistory, getDownloadHistory, removeDownload, type DownloadHistoryItem } from "@/lib/downloadHistory";
const AdminDashboard = lazy(() => import("./AdminDashboard"));
const BusinessLicensePage = lazy(() => import("./BusinessLicensePage"));
const LipaNumberPage = lazy(() => import("./LipaNumberPage"));
const TINCertificatePage = lazy(() => import("./TINCertificatePage"));
const VerifyTinPage = lazy(() => import("./VerifyTinPage"));
const AirtelSmeContractPage = lazy(() => import("./AirtelSmeContractPage"));
const ContractMakerPage = lazy(() => import("./ContractMakerPage"));
const AgentStickerPage = lazy(() => import("./AgentStickerPage"));
const LipaQrStudioPage = lazy(() => import("./LipaQrStudioPage"));
const AgentIdPage = lazy(() => import("./AgentIdPage"));
const AccessLipaNumberPage = lazy(() => import("./AccessLipaNumberPage"));
const PataTillNetworksPage = lazy(() => import("./PataTillNetworksPage"));
const SmeVodacomPage = lazy(() => import("./SmeVodacomPage"));
const SmeAirtelPage = lazy(() => import("./SmeAirtelPage"));
const ChangeBusinessNameAirtelLipaPage = lazy(() => import("./ChangeBusinessNameAirtelLipaPage"));
const DynamicServicePage = lazy(() => import("./DynamicServicePage"));
const PocketWifiPage = lazy(() => import("./PocketWifiPage"));
const AccountSettingsPage = lazy(() => import("./AccountPage"));

const appEnglish: Record<string, string> = {
  "Mwanzo":"Home","Huduma zote":"All services","Tokeni":"Tokens","Historia":"History","Settings":"Settings","Paneli ya Admin":"Admin panel",
  "Akaunti yangu":"My account","Ingia kuanza":"Sign in to start","Huduma salama":"Secure services",
  "Ujumbe":"Messages",
  "SETTINGS":"SETTINGS","Settings za App":"App Settings","Account / Wasifu wangu":"Account / My profile","Hifadhi wasifu":"Save profile",
  "Jina la kwanza":"First name","Jina la mwisho":"Last name","Kuhusu mimi":"About me","Lugha ya matumizi":"Language",
  "Kiswahili":"Swahili","English":"English","Salio la tokeni":"Token balance","Uthibitisho":"Verification","Imeidhinishwa":"Verified","Inasubiri":"Pending",
  "Badilisha password":"Change password","Password mpya":"New password","Hifadhi password mpya":"Save new password","Toka kwenye akaunti":"Sign out",
  "Theme":"Theme","Accent color":"Accent color","Arifa za akaunti":"Account notifications","Onyesha salio la tokeni":"Show token balance",
  "Compact mode":"Compact mode","Reduce motion":"Reduce motion","Sauti za app":"App sounds","Refresh ya moja kwa moja":"Automatic refresh",
  "Onyesha hali ya online":"Show online status","Thibitisha vitendo muhimu":"Confirm important actions","Data saver":"Data saver",
  "Historia ya shughuli":"Activity history","ONGEZA TOKENI":"ADD TOKENS",
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

function shuffleYangaArray<T>(items: T[]): T[] { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }

function Notice({ children, tone = "warning" }: { children: React.ReactNode; tone?: "warning" | "success" | "info" }) { return <div className={`notice notice--${tone}`}><CircleAlert size={17} /> <span>{children}</span></div>; }

function isRetiredNidaRecord(item: any) { return /nida|nin|kitambulisho cha taifa/i.test([item?.serviceName, item?.serviceSlug, item?.slug, item?.description, item?.reason, item?.name, item?.type, item?.title].filter(Boolean).join(" ")); }

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
      <p>Wasiliana na admin kwa msaada: <a href="https://wa.me/255692287767?text=Habari%2C%20nahitaji%20msaada%20wa%20akaunti." target="_blank" rel="noreferrer">WhatsApp: 0692287767</a></p>
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
    if (!normalizeTanzaniaPhone(form.phone)) { setAuthError({ title: "Namba ya simu si sahihi", detail: "Tumia namba ya Tanzania, mfano 0712345678 au +255712345678.", code: "form/invalid-phone" }); return; }
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
        "phone/invalid": { title: "Namba ya simu si sahihi", detail: "Tumia namba halali ya Tanzania, mfano 0712345678 au +255712345678." },
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
    const phone = "255692287767";
    const message = "Habari, nimesahau password ya akaunti yangu ya Huduma za Mtandaoni. Namba yangu ya simu ni: " + (form.phone.trim() || "sijaweka");
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
  };
  return <div className="portal-modal-backdrop auth-backdrop" onClick={onClose}><div className={`portal-modal auth-modal auth-modal--${mode}`} onClick={(event) => event.stopPropagation()}><button className="modal-close" aria-label="Funga dirisha" onClick={onClose}><X size={19} /></button><div className="auth-hero"><span className="auth-hero-mark"><Zap size={25} /></span><span className="auth-hero-kicker">SMARTSERVICESTZ · AKAUNTI SALAMA</span><h2>{mode === "login" ? "Karibu tena!" : "Jiunge nasi leo!"}</h2><p>{mode === "login" ? "Ingia kuendelea kutumia huduma zako kwa urahisi." : "Tengeneza akaunti yako kwa hatua chache tu."}</p><span className="auth-hero-note"><ShieldCheck size={15} /> Rahisi · Haraka · Salama</span></div><div className="auth-form-content"><span className="overline">{mode === "login" ? "KARIBU TENA" : "ANZA SASA"}</span><h3>{mode === "login" ? "INGIA KWENYE AKAUNTI" : "JISAJILI AKAUNTI"}</h3><div className="auth-switch"><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setAuthError(null); }}>Ingia</button><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setAuthError(null); }}>Jisajili</button></div>{authError && <div className="auth-error-alert" role="alert"><div className="auth-error-alert__icon"><CircleAlert size={20} /></div><div><strong>{authError.title}</strong><p>{authError.detail}</p><code>{authError.code}</code></div></div>}<form onSubmit={(event) => { event.preventDefault(); void submit(); }}>{mode === "register" && <div className="auth-fields auth-fields--two"><label>Jina la kwanza<input required autoComplete="given-name" value={form.firstName} onChange={update("firstName")} /></label><label>Jina la mwisho<input required autoComplete="family-name" value={form.lastName} onChange={update("lastName")} /></label></div>}<div className="auth-fields"><label>Namba ya simu<input required inputMode="tel" autoComplete="tel" placeholder="0712345678" value={form.phone} onChange={update("phone")} /></label><label>{mode === "login" ? "Nenosiri" : "Nenosiri"}<PasswordField value={form.password} visible={showPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Password" onChange={update("password")} onToggle={() => setShowPassword((value) => !value)} /></label>{mode === "register" && <label>Nenosiri la Thibitisha<PasswordField value={form.confirmPassword} visible={showConfirmPassword} autoComplete="new-password" placeholder="Thibitisha password" onChange={update("confirmPassword")} onToggle={() => setShowConfirmPassword((value) => !value)} /></label>}</div>{mode === "login" && <button type="button" className="button button--green button--small" disabled={pending} onClick={resetPassword}>Umesahau Nenosiri → WhatsApp</button>}<button type="submit" className="button button--green button--wide" disabled={pending}>{pending ? "INASUBIRI..." : mode === "login" ? "INGIA" : "TENGENEZA AKAUNTI"}</button></form></div></div></div>;
}

function AppHeader({ onMenu, search, setSearch }: { onMenu: () => void; search: string; setSearch: (value: string) => void }) {
  const [location, navigate] = useLocation();
  const internalRouteHistory = useRef<string[]>([]);
  const previousRoute = useRef(location);
  const skipHistoryPush = useRef(false);
  useEffect(() => {
    const markBrowserBack = () => { skipHistoryPush.current = true; };
    window.addEventListener("popstate", markBrowserBack);
    return () => window.removeEventListener("popstate", markBrowserBack);
  }, []);
  useEffect(() => {
    if (previousRoute.current === location) return;
    if (skipHistoryPush.current) skipHistoryPush.current = false;
    else {
      const stack = internalRouteHistory.current;
      if (stack[stack.length - 1] !== previousRoute.current) stack.push(previousRoute.current);
      if (stack.length > 60) stack.shift();
    }
    previousRoute.current = location;
  }, [location]);
  const goBackWithinSite = () => {
    const previous = internalRouteHistory.current.pop();
    if (previous) {
      skipHistoryPush.current = true;
      navigate(previous);
    } else {
      navigate(location.startsWith("/service/") ? "/services" : "/");
    }
  };
  const { isAuthenticated, user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  useEffect(() => { const openAuth = () => setAuthOpen(true); window.addEventListener("smartservicestz-open-auth", openAuth); return () => window.removeEventListener("smartservicestz-open-auth", openAuth); }, []);
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
    const target = typeof item.targetPath === "string" ? item.targetPath : typeof item.href === "string" ? item.href : "/";
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
      <button type="button" className="header-back-button" onClick={goBackWithinSite} aria-label="Rudi hatua moja nyuma"><ArrowLeft size={20}/><span>Back</span></button>
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
  const items = [{ href: "/", label: "Mwanzo", icon: LayoutGrid }, { href: "/services", label: "Huduma zote", icon: Zap }, { href: "/my-applications", label: "Maombi Yangu", icon: FileBadge }, { href: "/tokens", label: "Tokeni", icon: CircleDollarSign }, { href: "/history", label: "Historia", icon: History }, { href: "/account", label: "Settings", icon: Settings2 }, { href: "#support", label: "Saport", icon: HeartHandshake }];
  return <aside className="sidebar-portal"><div className="sidebar-brand"><Link href="/" onClick={onClose}><b>SmartServicesTZ</b><small className="brand-subtitle">DIGITAL SERVICE HUB</small></Link><button className="sidebar-close" onClick={onClose}><X size={20} /></button></div><div className="sidebar-user"><div className="user-avatar">{(user?.name?.trim()?.slice(0, 1).toUpperCase() ?? "S")}</div><div><strong>{user?.name ?? "Mgeni"} <VerifiedTick verified={user?.verificationStatus === "approved"} /></strong><small>{user ? "Akaunti yangu" : "Ingia kuanza"}</small></div></div>{!user && <button type="button" className="sidebar-auth-cta" onClick={() => { window.dispatchEvent(new CustomEvent("smartservicestz-open-auth")); onClose?.(); }}><LogIn size={17} /><span>INGIA / JISAJILI</span></button>}<nav>{items.map(({ href, label, icon: ItemIcon }) => href === "#support" ? <button key={href} type="button" onClick={() => { window.dispatchEvent(new CustomEvent("smartservicestz-open-ai-support")); onClose?.(); }} className="portal-nav-item" style={{ width: "100%", border: 0, background: "transparent", cursor: "pointer", textAlign: "left", font: "inherit" }}><ItemIcon size={19} /><span>{label} · AI</span></button> : <Link key={href} href={href} onClick={onClose} className={`portal-nav-item ${href === "/" ? location === "/" : location.startsWith(href) ? "active" : ""}`}><ItemIcon size={19} /><span>{label}</span></Link>)}</nav>{["super_admin", "admin", "moderator", "support"].includes(user?.role ?? "") && <><Link href="/admin" onClick={onClose} className={`portal-nav-item admin-link ${location === "/admin" ? "active" : ""}`} style={{margin:"8px 10px",borderRadius:12,border:"1px solid #c4b5fd",background:"linear-gradient(135deg,#f5f3ff,#eef2ff)",color:"#4c1d95",fontWeight:800}}><Settings2 size={19} /><span>Paneli ya Admin</span><ChevronRight size={16}/></Link></>}<a href="https://wa.me/255692287767?text=Habari%20SmartServicesTZ%2C%20nahitaji%20msaada." target="_blank" rel="noreferrer" className="sidebar-support-contact" style={{display:"flex",alignItems:"center",gap:10,margin:"8px 10px",padding:10,borderRadius:12,background:"#e7f9ef",color:"#075e36",textDecoration:"none",fontSize:12,fontWeight:700,flexShrink:0}}><MessageCircle size={18}/><span>WhatsApp: 0692287767<small style={{display:"block",fontWeight:500,marginTop:3}}>WhatsApp tu · si simu ya kawaida</small></span></a><div className="sidebar-foot"><ShieldCheck size={17} /><span>Huduma salama<br /><small>Tokeni zako zinalindwa.</small></span></div></aside>;
}

function TokenCard({ compact = false }: { compact?: boolean }) {
  const { isAuthenticated, profile } = useAuth();
  const [tokenChoiceOpen, setTokenChoiceOpen] = useState(false);
  const [otherTokens, setOtherTokens] = useState("0");
  const [paidFromPhone, setPaidFromPhone] = useState(profile?.phone ?? "");
  const totalBalance = profile?.tokenBalanceOther ?? profile?.tokenBalance ?? 0;
  const status = profile?.verificationStatus ?? "pending";
  const otherCount = Math.max(0, Math.floor(Number(otherTokens) || 0));
  const totalAmount = Math.ceil(otherCount / 3) * 500;
  const otherAmount = totalAmount;
  const paymentPhone = paidFromPhone.trim() || profile?.phone || "";
  const canProceed = totalAmount >= 500 && otherCount >= 3 && otherCount % 3 === 0 && paymentPhone.trim().length >= 9;
  const copyLipaNumber = async () => {
    try {
      await navigator.clipboard.writeText("29126823");
      toast.success("Lipa Namba imenakiliwa.");
    } catch {
      const field = document.createElement("textarea");
      field.value = "29126823";
      field.setAttribute("readonly", "true");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (copied) toast.success("Lipa Namba imenakiliwa.");
      else toast.error("Imeshindikana kunakili. Shikilia namba uinakili mwenyewe.");
    }
  };
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
    window.location.href = "https://wa.me/255692287767?text=" + encodeURIComponent(message);
    setTokenChoiceOpen(false);
  };

  return <section className={`token-card ${compact ? "token-card--compact" : ""}`}>
    <div className="wallet-fashion-head"><div className="wallet-fashion-brand"><span className="wallet-fashion-mark"><WalletCards size={22}/></span><span><small>SMARTSERVICESTZ</small><strong>WALLET YA TOKENI</strong></span></div><span className="wallet-fashion-chip"><span/> {isAuthenticated ? "AKAUNTI YAKO" : "KARIBU"}</span></div>
    <div className="wallet-fashion-balance"><div><span className="wallet-fashion-caption">SALIO LILILOKO</span><div className="wallet-fashion-amount">{isAuthenticated ? totalBalance : 0}<span>TK</span></div><p>Tokeni za kutumia huduma zako</p></div><div className="wallet-fashion-orbit" aria-hidden="true"><span/><span/><span/></div></div>
    <div className="wallet-fashion-account"><div className="wallet-fashion-avatar">{(profile?.name?.trim()?.slice(0,1) ?? "S").toUpperCase()}</div><div className="wallet-fashion-account-copy"><small>AKAUNTI</small><strong className="token-account-name">{profile?.name ?? "Mwanachama"} <VerifiedTick verified={status === "approved"} /></strong><span className="wallet-fashion-phone">{profile?.phone ?? "Ingia ili kuona taarifa zako"}</span></div><span className={"wallet-fashion-status " + (status === "approved" ? "is-verified" : "is-pending")}>{status === "approved" ? "IMETHIBITISHWA" : "INASUBIRI"}</span></div>
    {status !== "approved" && isAuthenticated && <div className="account-warning">Akaunti yako haijathibitishwa na admin. Huduma zitaanza baada ya admin kuidhinisha akaunti.</div>}
    <button className="button button--green token-add-button" disabled={!isAuthenticated} onClick={() => setTokenChoiceOpen(true)}><span className="token-add-plus">＋</span><span><b>ONGEZA TOKENI</b><small>Lipa kwanza, kisha tuma ushahidi WhatsApp</small></span><ChevronRight size={18}/></button>
    {!isAuthenticated && <small className="token-note">Ingia au jisajili ili kuongeza tokeni.</small>}
    {tokenChoiceOpen && typeof document !== "undefined" && createPortal(<div className="token-choice-modal" role="dialog" aria-modal="true">
      <div className="token-choice-card">
        <div className="token-choice-head"><div><span className="overline">ONGEZA TOKENI</span><h3>Nunua tokeni za huduma</h3></div><button type="button" onClick={() => setTokenChoiceOpen(false)} aria-label="Funga">×</button></div>
        <div className="token-choice-fields">
          <label><strong>Idadi ya tokeni za huduma</strong><span>Tokeni 3 = TZS 500 • Tokeni 6 = TZS 1,000</span><input aria-label="Idadi ya tokeni za huduma" type="number" min="0" step="3" value={otherTokens} onChange={e=>setOtherTokens(e.target.value)} /></label>
        </div>
        <div className="token-choice-total"><span>Jumla ya kulipa</span><strong>TZS {totalAmount.toLocaleString("en-US")}</strong><small>Bei: tokeni 3 = TZS 500, tokeni 6 = TZS 1,000; kila tokeni 3 za ziada ni TZS 500.</small></div>
        <label className="token-choice-phone"><strong>Namba iliyolipia</strong><input type="tel" value={paymentPhone} onChange={e=>setPaidFromPhone(e.target.value)} placeholder="07XXXXXXXX" /></label>
        <div className="token-choice-payto" style={{display:"grid",gap:10,padding:16,border:"1px solid #dbeafe",borderRadius:16,background:"linear-gradient(145deg,#eff6ff 0%,#ffffff 85%)",marginTop:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div><span style={{display:"block",fontSize:11,fontWeight:800,letterSpacing:".08em",color:"#64748b"}}>NAMBA YA LIPA</span><strong style={{display:"block",fontSize:26,letterSpacing:".04em",color:"#0f172a"}}>29126823</strong></div>
            <button type="button" className="button button--small" onClick={copyLipaNumber} style={{display:"inline-flex",alignItems:"center",gap:7,justifyContent:"center"}}><Copy size={15}/> Nakili namba</button>
          </div>
          <div className="token-choice-payto-row"><span>JINA LA MPOKEAJI</span><strong>Steward Tz</strong></div>
          <div className="token-choice-payto-row"><span>MTANDAO</span><strong>Azam Pesa</strong></div>
          <p style={{margin:0,fontSize:12,lineHeight:1.55,color:"#475569"}}>Lipa kiasi kilichoonyeshwa hapo juu, kisha bonyeza kitufe cha kutuma uthibitisho WhatsApp.</p>
        </div>
        <button type="button" className="button button--green" style={{width:"100%",marginTop:14,justifyContent:"center"}} disabled={!canProceed} onClick={openWhatsAppProof}>NIMELIPA — TUMA WHATSAPP</button>
        {otherCount > 0 && otherCount % 3 !== 0 && <p style={{margin:"8px 0 0",fontSize:12,color:"#b45309"}}>Chagua idadi inayogawanyika kwa 3, mfano tokeni 3, 6 au 9.</p>}
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
    "mpiga-kura": "#0891b2",
    "stika-lipa": "#db2777",
    "stika-mawakala": "#d97706",
    "pata-lipa-namba": "#0d9488",
    "access-lipa-number": "#2563eb",
    "kitambulisho-wakala": "#db2777",
    "sme-airtel-mkataba": "#f59e0b",
    "sme-vodacom": "#7f1d1d",
    "sme-airtel": "#ed1c24",
    "change-business-name-airtel-lipa": "#4338ca",
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
  const accent = serviceColors[service.slug] ?? palette[colorIndex];
  const serviceIcons: Record<string, string> = { "pata-lipa-namba": "wallet-cards", "access-lipa-number": "smartphone", "cheti-tin": "file-badge", "leseni-biashara": "briefcase-business", "leseni-udereva": "car-front", "stika-lipa": "qr-code", "stika-mawakala": "ticket", "sme-vodacom": "radio", "sme-airtel": "credit-card", "sme-airtel-mkataba": "copy", "change-business-name-airtel-lipa": "file-pen", "brela": "landmark", "mpiga-kura": "vote", "kitambulisho-wakala": "user-round-pen", "cheti-kuzaliwa": "baby", "simba-sc": "trophy", "yanga-africans": "star", "azam-tv": "tv", "pata-pocket-wifi-mabando": "wifi" };
  const iconName = serviceIcons[service.slug] ?? service.icon;
  const priorityNumber = preferredHomepageServiceSlugs.indexOf(service.slug as (typeof preferredHomepageServiceSlugs)[number]);
  const cardStyle = {
    "--service-icon-bg": `linear-gradient(145deg, ${accent}, ${accent}d9)`,
    background: `linear-gradient(145deg, ${accent}18 0%, #ffffff 78%)`,
    borderColor: `${accent}55`,
    boxShadow: `0 5px 18px ${accent}12`,
  } as React.CSSProperties;
  return <div className="portal-service-card-wrap">
    <button className={`portal-service-card service-${service.kind} ${external ? "service-external" : ""}`} onClick={() => onUse(service)} style={cardStyle}>
      {priorityNumber >= 0 && <span className="service-card-index" aria-hidden="true">{String(priorityNumber + 1).padStart(2, "0")}</span>}
      <div className="service-card-icon" data-service-icon={iconName} aria-hidden="true" style={{ background: `linear-gradient(145deg, ${accent}, ${accent}d9)`, color: "#fff", border: `1px solid ${accent}`, boxShadow: `0 8px 18px ${accent}48` }}><span className="service-card-icon__ring" aria-hidden="true" /><Icon name={iconName} size={24} /></div>
      <div className="service-card-copy"><strong>{service.name}</strong><span>{locked ? (service.maintenanceMessage || "Huduma hii inafanyiwa maboresho kwa sasa. Jaribu tena baadaye.") : service.description}</span></div>
      <div className="service-card-foot">{locked ? <span className="locked-label">IMEFUNGWA</span> : service.slug === "pata-pocket-wifi-mabando" ? <span className="paid-label"><Wifi size={14} /> Vifaa &amp; Mabando</span> : service.kind === "free" ? <span className="free-label">Bure</span> : <span className="paid-label"><CreditCard size={14} /> Tokeni {service.tokenCost}</span>}{external ? <span className="external-label"><ExternalLink size={13} /> FUNGUA</span> : <ChevronRight size={17} />}</div>
    </button>
  </div>;
}

function ServiceGrid({ title, services, onUse }: { title: string; services: ServiceCatalogItem[]; onUse: (service: ServiceCatalogItem) => void }) {
  const arrangedServices = prioritizeHomepageServices(services);
  const openCount = arrangedServices.filter((service) => service.kind !== "locked").length;
  return <section className="portal-section">
    <div className="section-title"><div><span className="overline">Mkusanyiko wa huduma</span><h2>{title}</h2><p className="service-order-hint">{openCount} wazi · {arrangedServices.length - openCount} zimefungwa</p></div><span className="section-count">{services.length}</span></div>
    <div className="portal-service-grid portal-service-grid--ordered">{arrangedServices.map((service) => <ServiceCard key={service.slug} service={service} onUse={onUse} />)}</div>
  </section>;
}

function SpecialSection() {
  const open = (item: typeof specialServices[number]) => {
    if ("url" in item && item.url) { const inviteUrl = item.url; if (/SmartServicesTZApp/i.test(navigator.userAgent)) { window.location.href = inviteUrl; } else { window.open(inviteUrl, "_blank", "noopener,noreferrer"); } return; }
    const action = (item as unknown as { action?: string }).action;
    if (action === "whatsapp") { window.open(whatsappUrl, "_blank", "noopener,noreferrer"); return; }
    toast("Tuma ujumbe WhatsApp kupata maelezo ya malipo.", { action: { label: "WhatsApp", onClick: () => window.open(whatsappUrl, "_blank") } });
  };
  return <div className="special-grid">{specialServices.map((item) => { const action = (item as unknown as { action?: string }).action; const isWhatsAppGroup = "url" in item && item.url.includes("chat.whatsapp.com"); const isAppDownload = (item as unknown as { slug: string }).slug === "download-app"; return <button key={item.slug} className={`special-card special-card--${item.tone}`} onClick={() => open(item)}><div><strong>{item.name}</strong><small>{isAppDownload ? "Pakua SmartServicesTZ App (APK)" : isWhatsAppGroup ? <><MessageCircle size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "middle", marginRight: 5, color: "#25D366" }} />Fungua WhatsApp Group</> : "url" in item ? "Fungua huduma" : action === "whatsapp" ? <><MessageCircle size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "middle", marginRight: 5, color: "#25D366" }} />Fungua WhatsApp</> : "Wasiliana nasi kwa malipo"}</small></div>{isWhatsAppGroup ? <MessageCircle size={20} aria-label="WhatsApp" color="#25D366" /> : isAppDownload ? <Smartphone size={20} aria-label="Download App" /> : <ExternalLink size={18} />}</button>; })}</div>;
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

  const refreshDownloads = () => setDownloads(getDownloadHistory().filter((item: any) => !isRetiredNidaRecord(item)));

  useEffect(() => {
    if (!firebaseUser) { setRows([]); return; }
    return subscribeToTokenHistory(firebaseUser.uid, (items) => setRows(items.filter((item) => !isRetiredNidaRecord(item))));
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser?.uid) { setServiceApplications([]); return; }
    return subscribeUserServiceApplications(firebaseUser.uid, (items) => setServiceApplications(items.filter((item) => !isRetiredNidaRecord(item))), (error) => {
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
function MyApplicationsPage() {
  const { firebaseUser } = useAuth();
  const [selectedApplication, setSelectedApplication] = useState<any | null>(null);
  const [serviceApplications, setServiceApplications] = useState<any[]>([]);
  const [lipaApplications, setLipaApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) {
      setServiceApplications([]);
      setLipaApplications([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const stopServices = subscribeUserServiceApplications(uid, (items) => {
      setServiceApplications(items);
      setLoading(false);
    }, (error) => {
      console.error("Imeshindikana kupakia maombi ya huduma", error);
      toast.error("Baadhi ya maombi ya huduma hayajapakiwa. Jaribu tena.");
      setLoading(false);
    });
    const stopLipa = subscribeUserLipaApplications(uid, (items) => {
      setLipaApplications(items);
      setLoading(false);
    }, (error) => {
      console.error("Imeshindikana kupakia maombi ya Lipa Namba", error);
      toast.error("Maombi ya Lipa Namba hayajapakiwa. Jaribu tena.");
      setLoading(false);
    });
    return () => { stopServices(); stopLipa(); };
  }, [firebaseUser?.uid]);

  const dateMillis = (value: any) => {
    try {
      const date = value?.toDate ? value.toDate() : new Date(String(value ?? ""));
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    } catch { return 0; }
  };
  const rows = [
    ...serviceApplications.map((item) => ({
      id: String(item.applicationId || item.id),
      title: String(item.serviceName || item.serviceSlug || "Ombi la huduma"),
      category: "Huduma",
      status: String(item.status || "PENDING").toUpperCase(),
      reference: String(item.applicationId || item.id),
      phone: String(item.phone ?? item.applicantData?.phone ?? ""),
      date: item.updatedAt ?? item.submittedAt ?? item.createdAt,
      reason: String(item.rejectionReason ?? ""),
      message: String(item.adminReply ?? item.adminNote ?? item.additionalInfoRequest ?? ""),
      raw: item,
    })),
    ...lipaApplications.map((item) => ({
      id: String(item.applicationId || item.id),
      title: `Lipa Namba — ${String(item.network || item.networkId || "Mtandao")}`,
      category: "Lipa Namba",
      status: String(item.status || "PENDING").toUpperCase(),
      reference: String(item.applicationId || item.id),
      phone: String(item.phone ?? ""),
      date: item.updatedAt ?? item.submittedAt,
      reason: String(item.rejectionReason ?? ""),
      message: String(item.adminReply ?? item.additionalInfoRequest ?? item.rewardNote ?? ""),
      raw: item,
    })),
  ].sort((a, b) => dateMillis(b.date) - dateMillis(a.date));
  const statusLabel = (status: string) => status === "APPROVED" ? "LIMEIDHINISHWA" : status === "REJECTED" ? "LIMEKATALIWA" : status === "PROCESSING" ? "LINAFANYIWA KAZI" : status === "PENDING" ? "LINASUBIRI" : status;
  const statusStyle = (status: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 900,
    background: status === "APPROVED" ? "#dcfce7" : status === "REJECTED" ? "#fee2e2" : status === "PROCESSING" ? "#dbeafe" : "#fef3c7",
    color: status === "APPROVED" ? "#166534" : status === "REJECTED" ? "#991b1b" : status === "PROCESSING" ? "#1d4ed8" : "#92400e",
    border: `1px solid ${status === "APPROVED" ? "#86efac" : status === "REJECTED" ? "#fca5a5" : status === "PROCESSING" ? "#93c5fd" : "#fcd34d"}`,
  });

  return <main className="portal-main">
    <div className="page-heading">
      <div><span className="overline">Ufuatiliaji wa huduma</span><h1>MAOMBI YANGU</h1><p>Maombi yote uliyotuma yanaonekana hapa — Lipa Namba, Access, leseni na huduma nyingine.</p></div>
      <FileBadge size={36} />
    </div>
    {!firebaseUser ? <section className="account-panel"><Notice tone="info">Ingia kwenye akaunti yako ili kuona na kufuatilia maombi yako.</Notice><button type="button" className="button button--green" onClick={() => window.dispatchEvent(new CustomEvent("smartservicestz-open-auth"))}>INGIA / JISAJILI</button></section>
    : <section className="account-panel" style={{maxWidth:"none"}}>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
        <div className="notice notice--info" style={{margin:0,flex:"1 1 140px"}}><strong>{rows.length}</strong> maombi yote</div>
        <div className="notice notice--info" style={{margin:0,flex:"1 1 140px"}}><strong>{rows.filter((r)=>r.status==="PENDING"||r.status==="PROCESSING").length}</strong> yanasubiri / yanafanyiwa kazi</div>
      </div>
      {loading ? <Notice tone="info">Inapakia maombi yako yote...</Notice> : rows.length === 0 ? <div style={{textAlign:"center",padding:"28px 12px"}}><FileBadge size={34}/><h2>Bado huna maombi</h2><p>Tuma ombi la huduma; utaliona hapa na kufuatilia hali yake.</p><Link className="button button--green" href="/services">TAZAMA HUDUMA</Link></div> :
        <div style={{display:"grid",gap:12}}>
          {rows.map((item) => {
            const date = dateMillis(item.date);
            return <article key={item.category + ":" + item.id} style={{border:"1px solid #dbe5df",borderLeft:`5px solid ${item.status==="APPROVED"?"#16a34a":item.status==="REJECTED"?"#dc2626":item.status==="PROCESSING"?"#2563eb":"#d97706"}`,borderRadius:13,padding:15,background:"#fff",display:"grid",gap:9}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
                <div style={{minWidth:0,flex:"1 1 220px"}}><span style={{fontSize:10,fontWeight:900,letterSpacing:".08em",color:"#64748b"}}>{item.category.toUpperCase()}</span><h3 style={{margin:"4px 0",fontSize:16,overflowWrap:"anywhere"}}>{item.title}</h3></div>
                <span style={statusStyle(item.status)}>{statusLabel(item.status)}</span>
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12,color:"#475569"}}>
                <span>Rejea: <strong>{item.reference}</strong></span>
                {item.phone && <span>Simu: {item.phone}</span>}
                <span>{date ? new Date(date).toLocaleString("sw-TZ") : "Tarehe haijatajwa"}</span>
              </div>
              {item.reason && <div style={{padding:10,borderRadius:9,background:"#fef2f2",color:"#991b1b",fontSize:13}}><strong>Sababu ya kukataliwa:</strong> {item.reason}</div>}
              {item.message && <div style={{padding:10,borderRadius:9,background:"#eff6ff",color:"#1e3a8a",fontSize:13}}><strong>Ujumbe wa Admin:</strong> {item.message}</div>}
              <button type="button" onClick={() => setSelectedApplication(item)} style={{justifySelf:"start",display:"inline-flex",alignItems:"center",gap:7,padding:"8px 12px",border:0,borderRadius:9,background:"#e0e7ff",color:"#3730a3",fontSize:12,fontWeight:800,cursor:"pointer"}}><Eye size={14}/> Fungua ombi uone taarifa zote</button>
            </article>;
          })}
        </div>}
      <p style={{fontSize:12,color:"#64748b",marginTop:16}}>Ikiwa hali bado ni “LINASUBIRI” au “LINAFANYIWA KAZI”, hutahitaji kutuma ombi lilelile tena. Fungua ombi hili kufuatilia rejea yake au wasiliana na support.</p>
    </section>}
    {selectedApplication && <div role="presentation" onClick={() => setSelectedApplication(null)} style={{position:"fixed",inset:0,zIndex:10000,display:"grid",placeItems:"center",padding:14,background:"rgba(2,6,23,.72)",backdropFilter:"blur(5px)"}}>
      <section role="dialog" aria-modal="true" aria-labelledby="my-application-detail-title" onClick={(event) => event.stopPropagation()} style={{width:"min(100%,680px)",maxHeight:"88dvh",overflowY:"auto",padding:20,borderRadius:18,background:"#fff",color:"#0f172a",boxShadow:"0 24px 70px rgba(0,0,0,.3)"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
          <div><span style={{fontSize:10,fontWeight:900,letterSpacing:".08em",color:"#64748b"}}>{selectedApplication.category.toUpperCase()}</span><h2 id="my-application-detail-title" style={{margin:"4px 0 10px",fontSize:20}}>{selectedApplication.title}</h2><span style={statusStyle(selectedApplication.status)}>{statusLabel(selectedApplication.status)}</span></div>
          <button type="button" aria-label="Funga taarifa za ombi" onClick={() => setSelectedApplication(null)} style={{width:34,height:34,border:0,borderRadius:9,background:"#f1f5f9",fontSize:20,cursor:"pointer"}}>×</button>
        </div>
        <div style={{display:"grid",gap:10,marginTop:18}}>
          <div style={{padding:12,borderRadius:10,background:"#f8fafc"}}><strong>Rejea ya ombi</strong><p style={{margin:"4px 0 0",overflowWrap:"anywhere"}}>{selectedApplication.reference}</p></div>
          {selectedApplication.phone && <div style={{padding:12,borderRadius:10,background:"#f8fafc"}}><strong>Namba ya simu</strong><p style={{margin:"4px 0 0"}}>{selectedApplication.phone}</p></div>}
          {selectedApplication.reason && <div style={{padding:12,borderRadius:10,background:"#fef2f2",color:"#991b1b"}}><strong>Sababu ya kukataliwa</strong><p style={{margin:"4px 0 0"}}>{selectedApplication.reason}</p></div>}
          {selectedApplication.message && <div style={{padding:12,borderRadius:10,background:"#eff6ff",color:"#1e3a8a"}}><strong>Ujumbe / maelekezo ya Admin</strong><p style={{margin:"4px 0 0",whiteSpace:"pre-wrap"}}>{selectedApplication.message}</p></div>}
          {Object.entries((selectedApplication.raw?.applicantData ?? selectedApplication.raw?.formData ?? {}) as Record<string, unknown>).filter(([,value]) => value !== null && value !== undefined && value !== "").map(([key,value]) => <div key={key} style={{padding:12,border:"1px solid #e2e8f0",borderRadius:10}}><strong style={{display:"block",fontSize:12,color:"#475569"}}>{key.replace(/([A-Z])/g," $1").replace(/[_-]/g," ")}</strong><p style={{margin:"5px 0 0",whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:13}}>{typeof value === "object" ? JSON.stringify(value) : String(value)}</p></div>)}
          <div style={{padding:12,borderRadius:10,background:"#f8fafc"}}><strong>Tarehe ya mwisho kusasishwa</strong><p style={{margin:"4px 0 0"}}>{selectedApplication.date ? new Date(dateMillis(selectedApplication.date)).toLocaleString("sw-TZ") : "Haijatajwa"}</p></div>
        </div>
      </section>
    </div>}
  </main>;
}

function AdminPage() { return <AdminDashboard />; }
function AccountPage() { return <AccountSettingsPage />; }


function PortalHome({ search, onUse, services, userName, isAuthenticated, allServicesPage }: { search: string; onUse: (service: ServiceCatalogItem) => void; services: ServiceCatalogItem[]; userName?: string; isAuthenticated: boolean; allServicesPage: boolean }) {
  const [category, setCategory] = useState("Zote");
  const [showAppDownload, setShowAppDownload] = useState(false);
  useEffect(() => {
    const isNativeApp = /SmartServicesTZApp|; wv\)|SmartServicesTZ/i.test(navigator.userAgent)
      || window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isNativeApp) { setShowAppDownload(false); return; }
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let cycleTimer: ReturnType<typeof setInterval> | undefined;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem("stz-app-download-dismissed") === "1"; } catch {}
    if (dismissed) return;
    const cycle = () => {
      setShowAppDownload(true);
      hideTimer = setTimeout(() => setShowAppDownload(false), 7000);
    };
    showTimer = setTimeout(() => {
      cycle();
      cycleTimer = setInterval(cycle, 22000);
    }, 3500);
    return () => {
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
      if (cycleTimer) clearInterval(cycleTimer);
    };
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
    let active = true;
    const applySettings = (settings: Record<string, unknown> | null) => {
      if (!active) return;
      if (Array.isArray(settings?.serviceOrder)) setServiceOrder(settings.serviceOrder.filter((id: unknown): id is string => typeof id === "string"));
      if (Array.isArray(settings?.homepageSectionOrder)) setHomepageSectionOrder(settings.homepageSectionOrder.filter((id: unknown): id is string => typeof id === "string"));
      setLayout((current) => ({ ...current, ...Object.fromEntries(Object.keys(current).map((key) => [key, settings?.[key] ?? current[key as keyof typeof current]])) }));
    };
    void getPublicSiteSettingsOnce().then((settings) => applySettings(settings as Record<string, unknown> | null)).catch(() => undefined);
    const refreshTimer = window.setInterval(() => { void getPublicSiteSettingsOnce({ force: true }).then((settings) => applySettings(settings as Record<string, unknown> | null)).catch(() => undefined); }, 45_000);
    const stopLocks = subscribeToCollection("serviceLocks", (rows) => setServiceLockOverrides({ ...Object.fromEntries(rows.map((item) => [String(item.slug ?? item.id), item.isLocked === true])), "cheti-tin": false }));
    return () => { active = false; window.clearInterval(refreshTimer); stopLocks(); };
  }, []);
  const displayedServices = orderByIds(services.filter((service) => service.active !== false && service.isVisible !== false).sort((a: any, b: any) => Number(a.order ?? 9999) - Number(b.order ?? 9999)).map((service) => {
    const override = serviceLockOverrides[service.slug];
    if (isServiceLocked(service.slug, override, service.kind === "locked")) return { ...service, kind: "locked" as const, description: service.maintenanceMessage || "Huduma hii inafanyiwa maboresho kwa sasa. Jaribu tena baadaye." };
    // Admin akifungua huduma, override=false lazima iondoe pia kind="locked"
    // iliyobaki kwenye catalog ya zamani; vinginevyo kadi huendelea kuonekana imefungwa.
    if (override === false && service.kind === "locked") return { ...service, kind: Number(service.tokenCost ?? 0) <= 0 ? "free" as const : "paid" as const };
    return service;
  }), serviceOrder);
  const lower = search.toLowerCase();
  const categories = ["Zote", "Zilizohifadhiwa", ...Array.from(new Set(displayedServices.map((service) => service.category).filter(Boolean)))];
  const matches = displayedServices.filter((service) => (category === "Zote" || (category === "Zilizohifadhiwa" ? favoriteSlugs.includes(service.slug) : service.category === category)) && `${service.name} ${service.description} ${service.category}`.toLowerCase().includes(lower));
  const mainBase = matches.filter((service) => service.category === "HUDUMA ZA WAKALA" && !/nida|\bnin\b/i.test(`${service.name} ${service.slug}`));
  const configuredTin = services.find((service) => service.slug === "cheti-tin");
  const tinFallback = mainBase.find((service) => service.slug === "cheti-tin") ?? (
    category === "Zote" && (!lower || "tin certificate cheti tin pata cheti cha tin kwa hatua rahisi huduma za wakala".includes(lower))
      ? configuredTin
        ? configuredTin.active !== false && configuredTin.isVisible !== false ? configuredTin : undefined
        : serviceCatalog.find((service) => service.slug === "cheti-tin")
      : undefined
  );
  const tinCertificate = tinFallback ? { ...tinFallback, kind: tinFallback.kind === "locked" ? (Number(tinFallback.tokenCost ?? 0) <= 0 ? "free" as const : "paid" as const) : tinFallback.kind } : undefined;
  const main = tinCertificate
    ? [tinCertificate, mainBase.find((service) => service.slug === "leseni-biashara"), ...mainBase.filter((service) => service.slug !== "leseni-biashara" && service.slug !== "cheti-tin")].filter(Boolean) as ServiceCatalogItem[]
    : mainBase;
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
  const lockedCount = displayedServices.filter((service) => service.kind === "locked").length;
  const openCount = displayedServices.length - lockedCount;
  const layoutStyle = { "--home-cols": layout.homeColumns, "--home-tablet-cols": layout.homeTabletColumns, "--home-mobile-cols": layout.homeMobileColumns, "--section-gap": `${layout.sectionGap}px`, "--card-gap": `${layout.cardGap}px`, "--card-radius": `${layout.cardRadius}px`, "--card-padding": `${layout.cardPadding}px`, "--hero-radius": `${layout.heroRadius}px`, "--hero-padding": `${layout.heroPadding}px`, "--content-max": `${layout.contentMaxWidth}px` } as React.CSSProperties;
  return <main className={`portal-main ${layout.compactCards ? "layout-compact" : ""}`} style={layoutStyle}>
    {/* Mwanzo sasa unaanza moja kwa moja na Wallet ya Tokeni kama ilivyoombwa. */}
    <TokenCard />

    {showAppDownload && <a role="complementary" aria-label="Pakua SmartServicesTZ App" className="stz-app-float-button" href="https://github.com/SmartServicesTZ/Huduma-za-mitandaoni/releases/latest/download/SmartServicesTZ.apk"><Smartphone size={16} aria-hidden="true" /><span>Pakua App</span></a>}
    <section className={`service-discovery ${allServicesPage ? "service-discovery--all" : ""}`}>
      <div className="service-discovery__intro">
        <div className="service-discovery__copy">
          <span className="service-discovery__eyebrow"><Sparkles size={14} aria-hidden="true" /> {allServicesPage ? "ORODHA YA HUDUMA" : "SMARTSERVICESTZ · DIGITAL SERVICE HUB"}</span>
          <h2>{allServicesPage ? "HUDUMA ZOTE" : <>Huduma kwa biashara,<span> sehemu moja.</span></>}</h2>
          <p>{allServicesPage ? `${matches.length} kati ya ${displayedServices.length} huduma zinaonekana. Tumia utafutaji au makundi kuchuja.` : "Pata leseni, TIN, Lipa, usajili na mawasiliano ya biashara kwa urahisi."}</p>
        </div>
        <div className="service-discovery__stats" aria-label="Muhtasari wa huduma">
          <div className="service-discovery__stat"><span className="service-discovery__stat-icon service-discovery__stat-icon--open"><BriefcaseBusiness size={17} aria-hidden="true" /></span><span><strong>{openCount}</strong><small>Huduma zilizo wazi</small></span></div>
          <div className="service-discovery__stat"><span className="service-discovery__stat-icon service-discovery__stat-icon--free"><Zap size={17} aria-hidden="true" /></span><span><strong>{freeCount}</strong><small>Huduma za bure</small></span></div>
        </div>
      </div>
      <div className="service-discovery__filters"><span>CHUJA HUDUMA</span><div className="service-chips" role="tablist" aria-label="Makundi ya huduma">{categories.map((item) => <button key={item} type="button" className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
    </section>
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
    { href: "/my-applications", label: "Maombi", icon: FileBadge },
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
  const [showYangaRules, setShowYangaRules] = useState(false);
  const [yangaRulesAccepted, setYangaRulesAccepted] = useState(false);
  const [yangaQuizPassed, setYangaQuizPassed] = useState(false);
  const [yangaEntryStep, setYangaEntryStep] = useState<"choice" | "quiz" | "review" | "rules">("choice");
  const [yangaReviewResults, setYangaReviewResults] = useState<Array<{ question: string; selected: string; correct: string; isCorrect: boolean }>>([]);
  const [yangaPlayersReview, setYangaPlayersReview] = useState<{ selected: string[]; correct: string[]; isCorrect: boolean } | null>(null);
  const [yangaPaymentBusy, setYangaPaymentBusy] = useState(false);
  const [yangaFanConfirm, setYangaFanConfirm] = useState("");
  const [yangaLoveConfirm, setYangaLoveConfirm] = useState("");
  const [yangaAnswers, setYangaAnswers] = useState<Record<number, string>>({});
  const [yangaPlayers, setYangaPlayers] = useState<string[]>([]);
  const [yangaQuizError, setYangaQuizError] = useState("");
  const yangaQuestionPool = [
    { q: "Yanga SC ilianzishwa mwaka gani?", options: ["1935", "1938", "1945", "1961"], answer: "1935" },
    { q: "Rangi zinazotambulisha Yanga ni zipi?", options: ["Nyekundu na nyeupe", "Kijani na njano", "Bluu na nyeupe", "Nyeusi na njano"], answer: "Kijani na njano" },
    { q: "Jina maarufu la mashabiki wa Yanga ni lipi?", options: ["Wananchi", "Wekundu wa Msimbazi", "Azam Family", "Mabingwa wa Jangwani"], answer: "Wananchi" },
    { q: "Kauli mbiu maarufu ya Yanga ni ipi?", options: ["Nguvu moja", "Daima mbele, nyuma mwiko", "Simba nguvu moja", "Pamoja tunaweza"], answer: "Daima mbele, nyuma mwiko" },
    { q: "Yanga ina makao yake ya kihistoria eneo gani la Dar es Salaam?", options: ["Msimbazi", "Jangwani", "Chamazi", "Ubungo"], answer: "Jangwani" },
    { q: "Raqibu mkubwa wa jadi wa Yanga ni timu ipi?", options: ["Azam FC", "Coastal Union", "Simba SC", "Namungo FC"], answer: "Simba SC" },
    { q: "Yanga ilitwaa taji la Ligi Kuu Tanzania msimu wa 2025/26?", options: ["Ndiyo", "Hapana", "Haikushiriki", "Msimu haukuchezwa"], answer: "Ndiyo" },
    { q: "Yanga ilifika fainali ya Kombe la Shirikisho la CAF mwaka gani?", options: ["2018", "2020", "2023", "2025"], answer: "2023" },
    { q: "Jina kamili la Yanga SC ni lipi?", options: ["Young Africans Sports Club", "Youth Africa Simba Club", "Young Athletic Society", "Yellow Africans Club"], answer: "Young Africans Sports Club" },
    { q: "Yanga SC imetwaa mataji mangapi ya Ligi Kuu Tanzania hadi msimu wa 2025/26?", options: ["22", "27", "32", "35"], answer: "32" },
    { q: "Yanga ni klabu ya nchi gani?", options: ["Kenya", "Tanzania", "Uganda", "Rwanda"], answer: "Tanzania" },
    { q: "Yanga inashiriki ligi kuu ya nchi gani?", options: ["Tanzania", "Kenya", "Zambia", "Malawi"], answer: "Tanzania" },
    { q: "Mashabiki wa Yanga mara nyingi huitwa nini?", options: ["Wananchi", "Mnyama", "Wanalambalamba", "Jangwani Boys"], answer: "Wananchi" },
    { q: "Ni klabu ipi ya Yanga inayotambulika kwa rangi ya kijani na njano?", options: ["Yanga SC", "Simba SC", "Azam FC", "KMC FC"], answer: "Yanga SC" },
    { q: "Mechi kubwa ya jadi kati ya Yanga na Simba hujulikana kama nini?", options: ["Dar Derby", "Zanzibar Derby", "Kariakoo Derby", "Jangwani Cup"], answer: "Kariakoo Derby" },
    { q: "Yanga SC ni aina gani ya taasisi ya michezo?", options: ["Klabu ya mpira wa miguu", "Chama cha riadha pekee", "Klabu ya kriketi", "Timu ya taifa"], answer: "Klabu ya mpira wa miguu" },
    { q: "Mpinzani wa jadi wa Yanga katika soka la Tanzania ni nani?", options: ["Simba SC", "Arsenal", "Gor Mahia", "Al Ahly"], answer: "Simba SC" },
    { q: "Mashabiki wa Yanga hujivunia kauli mbiu ipi?", options: ["Daima mbele, nyuma mwiko", "Mnyama mkali", "Nguvu ya wananchi wote", "Mbele kwa mbele tu"], answer: "Daima mbele, nyuma mwiko" },
    { q: "Yanga ilicheza fainali ya CAF Confederation Cup mwaka 2023 dhidi ya klabu ipi?", options: ["USM Alger", "Al Ahly", "Wydad Casablanca", "TP Mazembe"], answer: "USM Alger" },
    { q: "Yanga ilipoteza fainali ya CAF Confederation Cup 2023 kwa sheria ipi?", options: ["Mikwaju ya penalti", "Bao la dhahabu", "Bao la ugenini", "Mechi haikuchezwa"], answer: "Bao la ugenini" },
    { q: "Klabu ya Yanga inatoka mji gani?", options: ["Dar es Salaam", "Arusha", "Mwanza", "Dodoma"], answer: "Dar es Salaam" },
    { q: "Ni mchezo gani unaohusishwa zaidi na Yanga SC?", options: ["Mpira wa miguu", "Rugby", "Hockey", "Volleyball"], answer: "Mpira wa miguu" },
    { q: "Jina fupi linalotumika kwa Young Africans Sports Club ni lipi?", options: ["Yanga SC", "YSC United", "Young Simba", "African Stars FC"], answer: "Yanga SC" },
    { q: "Yanga na Simba ni wapinzani wa jadi katika nchi gani?", options: ["Tanzania", "Uganda", "Burundi", "Ethiopia"], answer: "Tanzania" },
    { q: "Yanga ilicheza fainali ya Kombe la Shirikisho la CAF la bara gani mwaka 2023?", options: ["Afrika", "Ulaya", "Asia", "Amerika Kusini"], answer: "Afrika" },
    { q: "Yanga ilitwaa ubingwa wa CAF Champions League mwaka 2023?", options: ["Ndiyo", "Hapana", "Haikushiriki mashindano yoyote", "Mashindano hayakuwepo"], answer: "Hapana" },
    { q: "Ni klabu ipi ya Tanzania ilicheza na Yanga katika Kariakoo Derby?", options: ["Simba SC", "Gor Mahia", "APR FC", "Zamalek"], answer: "Simba SC" },
    { q: "Je, Yanga SC ni klabu ya Tanzania?", options: ["Ndiyo", "Hapana", "Ni ya Kenya", "Ni ya Uganda"], answer: "Ndiyo" },
    { q: "Rangi ya njano ni sehemu ya utambulisho wa klabu ipi ya Yanga?", options: ["Yanga SC", "Simba SC", "Kagera Sugar", "Singida Black Stars"], answer: "Yanga SC" },
    { q: "Msimu wa 2025/26, Yanga iliendeleza mfululizo wa ubingwa wa ligi kuu kwa mara ya tano mfululizo?", options: ["Ndiyo", "Hapana", "Kwa mara ya kwanza", "Haikushiriki"], answer: "Ndiyo" },
    { q: "Neno 'Wananchi' linahusishwa na mashabiki wa klabu ipi?", options: ["Yanga SC", "Simba SC", "Azam FC", "Dodoma Jiji"], answer: "Yanga SC" },
    { q: "Ni jina lipi linalomaanisha Young Africans Sports Club?", options: ["Yanga SC", "Simba SC", "Azam FC", "Coastal Union"], answer: "Yanga SC" },
    { q: "Kariakoo Derby ni mechi inayohusisha klabu zipi?", options: ["Yanga na Simba", "Yanga na Azam", "Simba na KMC", "Azam na Coastal Union"], answer: "Yanga na Simba" },
    { q: "Yanga SC ina rangi zipi katika utambulisho wake wa kawaida?", options: ["Kijani na njano", "Nyekundu na nyeupe", "Bluu na nyeusi", "Zambarau na nyeupe"], answer: "Kijani na njano" },
    { q: "Yanga ilifika fainali ya mashindano gani ya CAF mwaka 2023?", options: ["CAF Confederation Cup", "CAF Champions League", "CAF Super Cup", "CHAN"], answer: "CAF Confederation Cup" },
    { q: "Je, Yanga ni timu ya taifa ya Tanzania?", options: ["Hapana, ni klabu", "Ndiyo, ni timu ya taifa", "Ni timu ya shule", "Ni timu ya mkoa pekee"], answer: "Hapana, ni klabu" },
    { q: "Klabu pinzani ya Yanga yenye jina la Simba inajulikana kama nini?", options: ["Simba SC", "Simba Queens pekee", "Simba Stars FC", "Simba United"], answer: "Simba SC" },
    { q: "Mchezo wa soka wa Yanga dhidi ya Simba mara nyingi huvuta hisia za mashabiki wa mji gani?", options: ["Dar es Salaam", "Kigali", "Nairobi", "Kampala"], answer: "Dar es Salaam" },
    { q: "Yanga ilishiriki mashindano gani ya klabu za Afrika ilipofika fainali mwaka 2023?", options: ["CAF Confederation Cup", "Premier League", "La Liga", "Bundesliga"], answer: "CAF Confederation Cup" },
    { q: "Yanga SC ina jina la 'Young Africans' katika jina lake rasmi?", options: ["Ndiyo", "Hapana", "Ina 'Young Simba'", "Ina 'African Lions'"], answer: "Ndiyo" },
    { q: "Yanga SC ilianzishwa mwaka gani?", options: ["1935","1938","1945","1961"], answer: "1935" },
    { q: "Rangi kuu za Yanga ni zipi?", options: ["Kijani na njano","Nyekundu na nyeupe","Bluu na nyeupe","Nyeusi na njano"], answer: "Kijani na njano" },
    { q: "Mashabiki wa Yanga huitwaje?", options: ["Wananchi","Wekundu wa Msimbazi","Mnyama","Gunners"], answer: "Wananchi" },
    { q: "Yanga inatoka mji gani?", options: ["Dar es Salaam","Arusha","Mwanza","Dodoma"], answer: "Dar es Salaam" },
    { q: "Jina kamili la Yanga SC ni lipi?", options: ["Young Africans Sports Club","Youth Africa Simba Club","Young Athletic Society","Yellow Africans Club"], answer: "Young Africans Sports Club" },
    { q: "Mpinzani wa jadi wa Yanga ni klabu ipi?", options: ["Simba SC","Azam FC","Coastal Union","Namungo FC"], answer: "Simba SC" },
    { q: "Yanga ilifika fainali ya CAF Confederation Cup mwaka gani?", options: ["2023","2018","2020","2025"], answer: "2023" },
    { q: "Yanga ilicheza fainali ya CAF Confederation Cup 2023 dhidi ya nani?", options: ["USM Alger","Al Ahly","Wydad Casablanca","TP Mazembe"], answer: "USM Alger" },
    { q: "Eneo gani linahusishwa kihistoria na Yanga?", options: ["Jangwani","Chamazi","Msimbazi","Ubungo"], answer: "Jangwani" },
    { q: "Yanga ni klabu ya nchi gani?", options: ["Tanzania","Kenya","Uganda","Rwanda"], answer: "Tanzania" },
    { q: "Mechi ya jadi ya Yanga na Simba huitwaje?", options: ["Kariakoo Derby","Zanzibar Derby","Cairo Derby","Jangwani Cup"], answer: "Kariakoo Derby" },
    { q: "Yanga ni klabu ya aina gani?", options: ["Klabu ya mpira wa miguu","Timu ya taifa","Klabu ya kriketi","Klabu ya rugby"], answer: "Klabu ya mpira wa miguu" },
    { q: "Neno SC katika jina Yanga SC linamaanisha nini?", options: ["Sports Club","Supporters Club","Soccer Cup","Senior Champions"], answer: "Sports Club" },
    { q: "Yanga inashiriki ligi kuu ya nchi gani?", options: ["Tanzania","Kenya","Zambia","Malawi"], answer: "Tanzania" },
    { q: "Yanga ilicheza fainali ya mashindano gani ya CAF mwaka 2023?", options: ["CAF Confederation Cup","CAF Champions League","CAF Super Cup","CHAN"], answer: "CAF Confederation Cup" },
    { q: "USM Alger, mpinzani wa Yanga kwenye fainali ya 2023, ni klabu ya nchi gani?", options: ["Algeria","Morocco","Tunisia","Misri"], answer: "Algeria" },
    { q: "Yanga ilipoteza fainali ya CAF Confederation Cup 2023 kwa sheria ipi?", options: ["Bao la ugenini","Mikwaju ya penalti","Bao la dhahabu","Mechi haikuchezwa"], answer: "Bao la ugenini" },
    { q: "Jina la utani la mashabiki wa Yanga ni lipi?", options: ["Wananchi","Mnyama","Wekundu wa Msimbazi","The Blues"], answer: "Wananchi" },
    { q: "Ni klabu ipi inayojulikana kama Young Africans Sports Club?", options: ["Yanga SC","Simba SC","Azam FC","KMC FC"], answer: "Yanga SC" },
    { q: "Yanga na Simba zinashiriki soka la nchi gani?", options: ["Tanzania","Uganda","Kenya","Rwanda"], answer: "Tanzania" },
    { q: "Yanga SC ilianzishwa mwaka ipi?", options: ["1935","1938","1945","1961"], answer: "1935" },
    { q: "Rangi kuu za Yanga ni zipi?", options: ["Kijani na njano","Nyekundu na nyeupe","Bluu na nyeupe","Nyeusi na njano"], answer: "Kijani na njano" },
    { q: "Mashabiki wa Yanga huitwaje?", options: ["Wananchi","Wekundu wa Msimbazi","Mnyama","Gunners"], answer: "Wananchi" },
    { q: "Yanga inatoka mji ipi?", options: ["Dar es Salaam","Arusha","Mwanza","Dodoma"], answer: "Dar es Salaam" },
    { q: "Jina kamili la Yanga SC ni lipi?", options: ["Young Africans Sports Club","Youth Africa Simba Club","Young Athletic Society","Yellow Africans Club"], answer: "Young Africans Sports Club" },
    { q: "Mpinzani wa jadi wa Yanga ni klabu ipi?", options: ["Simba SC","Azam FC","Coastal Union","Namungo FC"], answer: "Simba SC" },
    { q: "Yanga ilifika fainali ya CAF Confederation Cup mwaka ipi?", options: ["2023","2018","2020","2025"], answer: "2023" },
    { q: "Yanga ilicheza fainali ya CAF Confederation Cup 2023 dhidi ya nani?", options: ["USM Alger","Al Ahly","Wydad Casablanca","TP Mazembe"], answer: "USM Alger" },
    { q: "Eneo gani linahusishwa kihistoria na Yanga?", options: ["Jangwani","Chamazi","Msimbazi","Ubungo"], answer: "Jangwani" },
    { q: "Yanga ni klabu ya nchi ipi?", options: ["Tanzania","Kenya","Uganda","Rwanda"], answer: "Tanzania" },
    { q: "Mechi ya jadi ya Yanga na Simba huitwaje?", options: ["Kariakoo Derby","Zanzibar Derby","Cairo Derby","Jangwani Cup"], answer: "Kariakoo Derby" },
    { q: "Yanga ni klabu ya aina ipi?", options: ["Klabu ya mpira wa miguu","Timu ya taifa","Klabu ya kriketi","Klabu ya rugby"], answer: "Klabu ya mpira wa miguu" },
    { q: "Neno SC katika jina Yanga SC linamaanisha nini?", options: ["Sports Club","Supporters Club","Soccer Cup","Senior Champions"], answer: "Sports Club" },
    { q: "Yanga inashiriki ligi kuu ya nchi ipi?", options: ["Tanzania","Kenya","Zambia","Malawi"], answer: "Tanzania" },
    { q: "Yanga ilicheza fainali ya mashindano gani ya CAF mwaka 2023?", options: ["CAF Confederation Cup","CAF Champions League","CAF Super Cup","CHAN"], answer: "CAF Confederation Cup" },
    { q: "USM Alger, mpinzani wa Yanga kwenye fainali ya 2023, ni klabu ya nchi ipi?", options: ["Algeria","Morocco","Tunisia","Misri"], answer: "Algeria" },
    { q: "Yanga ilipoteza fainali ya CAF Confederation Cup 2023 kwa sheria ipi?", options: ["Bao la ugenini","Mikwaju ya penalti","Bao la dhahabu","Mechi haikuchezwa"], answer: "Bao la ugenini" },
    { q: "Jina la utani la mashabiki wa Yanga ni lipi?", options: ["Wananchi","Mnyama","Wekundu wa Msimbazi","The Blues"], answer: "Wananchi" },
    { q: "Ni klabu ipi inayojulikana kama Young Africans Sports Club?", options: ["Yanga SC","Simba SC","Azam FC","KMC FC"], answer: "Yanga SC" },
    { q: "Yanga na Simba zinashiriki soka la nchi ipi?", options: ["Tanzania","Uganda","Kenya","Rwanda"], answer: "Tanzania" },
    { q: "klabu ya Yanga SC ilianzishwa mwaka gani?", options: ["1935","1938","1945","1961"], answer: "1935" },
    { q: "Rangi kuu za Yanga SC ni zipi?", options: ["Kijani na njano","Nyekundu na nyeupe","Bluu na nyeupe","Nyeusi na njano"], answer: "Kijani na njano" },
    { q: "Mashabiki wa Yanga SC huitwaje?", options: ["Wananchi","Wekundu wa Msimbazi","Mnyama","Gunners"], answer: "Wananchi" },
    { q: "Yanga SC inatoka mji gani?", options: ["Dar es Salaam","Arusha","Mwanza","Dodoma"], answer: "Dar es Salaam" },
    { q: "Jina kamili la klabu ya Yanga SC ni lipi?", options: ["Young Africans Sports Club","Youth Africa Simba Club","Young Athletic Society","Yellow Africans Club"], answer: "Young Africans Sports Club" },
    { q: "Mpinzani wa jadi wa Yanga SC ni klabu ipi?", options: ["Simba SC","Azam FC","Coastal Union","Namungo FC"], answer: "Simba SC" },
    { q: "Yanga SC ilifika fainali ya CAF Confederation Cup mwaka gani?", options: ["2023","2018","2020","2025"], answer: "2023" },
    { q: "Yanga SC ilicheza fainali ya CAF Confederation Cup 2023 dhidi ya nani?", options: ["USM Alger","Al Ahly","Wydad Casablanca","TP Mazembe"], answer: "USM Alger" },
    { q: "Eneo gani linahusishwa kihistoria na Yanga SC?", options: ["Jangwani","Chamazi","Msimbazi","Ubungo"], answer: "Jangwani" },
    { q: "Yanga SC ni klabu ya nchi gani?", options: ["Tanzania","Kenya","Uganda","Rwanda"], answer: "Tanzania" },
    { q: "Mechi ya jadi ya Yanga SC na Simba huitwaje?", options: ["Kariakoo Derby","Zanzibar Derby","Cairo Derby","Jangwani Cup"], answer: "Kariakoo Derby" },
    { q: "Yanga SC ni klabu ya aina gani?", options: ["Klabu ya mpira wa miguu","Timu ya taifa","Klabu ya kriketi","Klabu ya rugby"], answer: "Klabu ya mpira wa miguu" },
    { q: "Neno SC katika jina klabu ya Yanga SC linamaanisha nini?", options: ["Sports Club","Supporters Club","Soccer Cup","Senior Champions"], answer: "Sports Club" },
    { q: "Yanga SC inashiriki ligi kuu ya nchi gani?", options: ["Tanzania","Kenya","Zambia","Malawi"], answer: "Tanzania" },
    { q: "Yanga SC ilicheza fainali ya mashindano gani ya CAF mwaka 2023?", options: ["CAF Confederation Cup","CAF Champions League","CAF Super Cup","CHAN"], answer: "CAF Confederation Cup" },
    { q: "USM Alger, mpinzani wa Yanga SC kwenye fainali ya 2023, ni klabu ya nchi gani?", options: ["Algeria","Morocco","Tunisia","Misri"], answer: "Algeria" },
    { q: "Yanga SC ilipoteza fainali ya CAF Confederation Cup 2023 kwa sheria ipi?", options: ["Bao la ugenini","Mikwaju ya penalti","Bao la dhahabu","Mechi haikuchezwa"], answer: "Bao la ugenini" },
    { q: "Jina la utani la mashabiki wa Yanga SC ni lipi?", options: ["Wananchi","Mnyama","Wekundu wa Msimbazi","The Blues"], answer: "Wananchi" },
    { q: "Ni klabu ipi inayojulikana kama Young Africans Sports Club?", options: ["Yanga SC","Simba SC","Azam FC","KMC FC"], answer: "Yanga SC" },
    { q: "Yanga SC na Simba zinashiriki soka la nchi gani?", options: ["Tanzania","Uganda","Kenya","Rwanda"], answer: "Tanzania" },
    { q: "Klabu ya Yanga SC ilianzishwa mwaka gani?", options: ["1935","1938","1945","1961"], answer: "1935" },
    { q: "Rangi kuu za Yanga ni zipi?", options: ["Kijani na njano","Nyekundu na nyeupe","Bluu na nyeupe","Nyeusi na njano"], answer: "Kijani na njano" },
    { q: "Mashabiki wa Yanga huitwaje?", options: ["Wananchi","Wekundu wa Msimbazi","Mnyama","Gunners"], answer: "Wananchi" },
    { q: "Klabu ya Yanga inatoka mji gani?", options: ["Dar es Salaam","Arusha","Mwanza","Dodoma"], answer: "Dar es Salaam" },
    { q: "Jina kamili la Yanga SC ni lipi?", options: ["Young Africans Sports Club","Youth Africa Simba Club","Young Athletic Society","Yellow Africans Club"], answer: "Young Africans Sports Club" },
    { q: "Mpinzani wa jadi wa Yanga ni klabu ipi?", options: ["Simba SC","Azam FC","Coastal Union","Namungo FC"], answer: "Simba SC" },
    { q: "Klabu ya Yanga ilifika fainali ya CAF Confederation Cup mwaka gani?", options: ["2023","2018","2020","2025"], answer: "2023" },
    { q: "Klabu ya Yanga ilicheza fainali ya CAF Confederation Cup 2023 dhidi ya nani?", options: ["USM Alger","Al Ahly","Wydad Casablanca","TP Mazembe"], answer: "USM Alger" },
    { q: "Eneo gani linahusishwa kihistoria na Yanga?", options: ["Jangwani","Chamazi","Msimbazi","Ubungo"], answer: "Jangwani" },
    { q: "Klabu ya Yanga ni klabu ya nchi gani?", options: ["Tanzania","Kenya","Uganda","Rwanda"], answer: "Tanzania" },
    { q: "Mechi ya jadi ya Yanga na Simba huitwaje?", options: ["Kariakoo Derby","Zanzibar Derby","Cairo Derby","Jangwani Cup"], answer: "Kariakoo Derby" },
    { q: "Klabu ya Yanga ni klabu ya aina gani?", options: ["Klabu ya mpira wa miguu","Timu ya taifa","Klabu ya kriketi","Klabu ya rugby"], answer: "Klabu ya mpira wa miguu" },
    { q: "Neno SC katika jina Yanga SC linamaanisha nini?", options: ["Sports Club","Supporters Club","Soccer Cup","Senior Champions"], answer: "Sports Club" },
    { q: "Klabu ya Yanga inashiriki ligi kuu ya nchi gani?", options: ["Tanzania","Kenya","Zambia","Malawi"], answer: "Tanzania" },
    { q: "Klabu ya Yanga ilicheza fainali ya mashindano gani ya CAF mwaka 2023?", options: ["CAF Confederation Cup","CAF Champions League","CAF Super Cup","CHAN"], answer: "CAF Confederation Cup" },
    { q: "USM Alger, mpinzani wa Yanga kwenye fainali ya 2023, ni klabu ya nchi gani?", options: ["Algeria","Morocco","Tunisia","Misri"], answer: "Algeria" },
    { q: "Klabu ya Yanga ilipoteza fainali ya CAF Confederation Cup 2023 kwa sheria ipi?", options: ["Bao la ugenini","Mikwaju ya penalti","Bao la dhahabu","Mechi haikuchezwa"], answer: "Bao la ugenini" },
    { q: "Jina la utani la mashabiki wa Yanga ni lipi?", options: ["Wananchi","Mnyama","Wekundu wa Msimbazi","The Blues"], answer: "Wananchi" },
    { q: "Ni klabu ipi inayojulikana kama Young Africans Sports Club?", options: ["Yanga SC","Simba SC","Azam FC","KMC FC"], answer: "Yanga SC" },
    { q: "Klabu ya Yanga na Simba zinashiriki soka la nchi gani?", options: ["Tanzania","Uganda","Kenya","Rwanda"], answer: "Tanzania" },
    { q: "Yanga SC ilianzishwa mwaka gani?", options: ["1935","1938","1945","1961"], answer: "1935" },
    { q: "Rangi kuu za Yanga ni zipi?", options: ["Kijani na njano","Nyekundu na nyeupe","Bluu na nyeupe","Nyeusi na njano"], answer: "Kijani na njano" },
    { q: "Mashabiki wa Yanga huitwaje?", options: ["Wananchi","Wekundu wa Msimbazi","Mnyama","Gunners"], answer: "Wananchi" },
    { q: "Yanga inatoka mji gani?", options: ["Dar es Salaam","Arusha","Mwanza","Dodoma"], answer: "Dar es Salaam" },
    { q: "Jina kamili la Yanga SC ni lipi?", options: ["Young Africans Sports Club","Youth Africa Simba Club","Young Athletic Society","Yellow Africans Club"], answer: "Young Africans Sports Club" },
    { q: "Mpinzani wa jadi wa Yanga ni klabu ipi?", options: ["Simba SC","Azam FC","Coastal Union","Namungo FC"], answer: "Simba SC" },
    { q: "Yanga ilifika fainali ya CAF Confederation Cup mwaka gani?", options: ["2023","2018","2020","2025"], answer: "2023" },
    { q: "Yanga ilicheza fainali ya CAF Confederation Cup 2023 dhidi ya nani?", options: ["USM Alger","Al Ahly","Wydad Casablanca","TP Mazembe"], answer: "USM Alger" },
    { q: "Eneo gani linahusishwa kihistoria na Yanga?", options: ["Jangwani","Chamazi","Msimbazi","Ubungo"], answer: "Jangwani" },
    { q: "Yanga ni klabu ya nchi gani?", options: ["Tanzania","Kenya","Uganda","Rwanda"], answer: "Tanzania" },
    { q: "Mechi ya jadi ya Yanga na Simba huitwaje?", options: ["Kariakoo Derby","Zanzibar Derby","Cairo Derby","Jangwani Cup"], answer: "Kariakoo Derby" },
    { q: "Yanga ni klabu ya aina gani?", options: ["Klabu ya mpira wa miguu","Timu ya taifa","Klabu ya kriketi","Klabu ya rugby"], answer: "Klabu ya mpira wa miguu" },
    { q: "Neno SC katika jina Yanga SC linamaanisha nini?", options: ["Sports Club","Supporters Club","Soccer Cup","Senior Champions"], answer: "Sports Club" },
    { q: "Yanga inashiriki ligi kuu ya nchi gani?", options: ["Tanzania","Kenya","Zambia","Malawi"], answer: "Tanzania" },
    { q: "Yanga ilicheza fainali ya mashindano gani ya CAF mwaka 2023?", options: ["CAF Confederation Cup","CAF Champions League","CAF Super Cup","CHAN"], answer: "CAF Confederation Cup" },
    { q: "USM Alger, mpinzani wa Yanga kwenye fainali ya 2023, ni klabu ya nchi gani?", options: ["Algeria","Morocco","Tunisia","Misri"], answer: "Algeria" },
    { q: "Yanga ilipoteza fainali ya CAF Confederation Cup 2023 kwa sheria ipi?", options: ["Bao la ugenini","Mikwaju ya penalti","Bao la dhahabu","Mechi haikuchezwa"], answer: "Bao la ugenini" },
    { q: "Jina la utani la mashabiki wa Yanga ni lipi?", options: ["Wananchi","Mnyama","Wekundu wa Msimbazi","The Blues"], answer: "Wananchi" },
    { q: "Ni klabu ipi inayojulikana kama Young Africans Sports Club?", options: ["Yanga SC","Simba SC","Azam FC","KMC FC"], answer: "Yanga SC" },
    { q: "Yanga na Simba zinashiriki soka la nchi gani?", options: ["Tanzania","Uganda","Kenya","Rwanda"], answer: "Tanzania" }
  ];
  const [yangaQuizQuestions, setYangaQuizQuestions] = useState<typeof yangaQuestionPool>([]);
  const yangaPlayerChoices = [
    { name: "Djigui Diarra", team: "YANGA" },
    { name: "Abdul Juma Mshery", team: "YANGA" },
    { name: "Dickson Job", team: "YANGA" },
    { name: "Bakari Mwamnyeto", team: "YANGA" },
    { name: "Kouassi Attohoula", team: "YANGA" },
    { name: "Mudathir Yahya", team: "YANGA" },
    { name: "Pacôme Zouzoua", team: "YANGA" },
    { name: "Allan Okello", team: "YANGA" },
    { name: "Maxi Nzengeli", team: "YANGA" },
    { name: "Clement Mzize", team: "YANGA" },
    { name: "Prince Dube", team: "YANGA" },
    { name: "Aishi Manula", team: "SIMBA" },
    { name: "Shomari Kapombe", team: "SIMBA" },
    { name: "Mohamed Hussein", team: "SIMBA" },
    { name: "Clatous Chama", team: "SIMBA" },
    { name: "Kibu Denis", team: "SIMBA" },
    { name: "Mohamed Salah", team: "LIVERPOOL" },
    { name: "Erling Haaland", team: "MANCHESTER CITY" },
    { name: "Kylian Mbappé", team: "REAL MADRID" },
    { name: "Vinícius Júnior", team: "REAL MADRID" },
    { name: "Lionel Messi", team: "INTER MIAMI" },
    { name: "Cristiano Ronaldo", team: "AL NASSR" },
    { name: "Harry Kane", team: "BAYERN MUNICH" },
    { name: "Bukayo Saka", team: "ARSENAL" },
    { name: "Kevin De Bruyne", team: "NAPOLI" },
    { name: "Lamine Yamal", team: "BARCELONA" },
    { name: "Son Heung-min", team: "LAFC" },
    { name: "Sadio Mané", team: "AL NASSR" },
    { name: "Percy Tau", team: "AL AHLY" },
    { name: "Achraf Hakimi", team: "PSG" }
  ];
  const submitYangaQuiz = () => {
    if (yangaFanConfirm !== "Ndiyo" || yangaLoveConfirm !== "Ndiyo") { setYangaQuizError("Lazima uthibitishe kuwa wewe ni shabiki wa Yanga na unaipenda Yanga ili kuendelea."); return; }
    if (!yangaQuizQuestions.every((_, i) => Boolean(yangaAnswers[i]))) { setYangaQuizError("Jibu maswali yote 10 kwanza."); return; }
    if (yangaPlayers.length !== 11) { setYangaQuizError("Chagua majina 11 tu kwenye orodha ya wachezaji 30."); return; }
    const correctPlayers = yangaPlayerChoices.filter((p) => p.team === "YANGA").map((p) => p.name);
    const selectedPlayers = [...yangaPlayers];
    const playersCorrect = selectedPlayers.length === 11 && selectedPlayers.every((name) => correctPlayers.includes(name)) && correctPlayers.every((name) => selectedPlayers.includes(name));
    const results = yangaQuizQuestions.map((question, i) => ({ question: question.q, selected: yangaAnswers[i] ?? "Hujajibu", correct: question.answer, isCorrect: yangaAnswers[i] === question.answer }));
    if (!results.every((result) => result.isCorrect) || !playersCorrect) {
      setYangaReviewResults(results);
      setYangaPlayersReview({ selected: selectedPlayers, correct: correctPlayers, isCorrect: playersCorrect });
      setYangaQuizError("");
      setYangaEntryStep("review");
      return;
    }
    setYangaReviewResults([]); setYangaPlayersReview(null); setYangaQuizError("");
    setYangaQuizPassed(true); setYangaEntryStep("rules");
  };
  const retryYangaQuiz = () => {
    setYangaAnswers({}); setYangaPlayers([]); setYangaReviewResults([]); setYangaPlayersReview(null); setYangaQuizError("");
    setYangaQuizQuestions(shuffleYangaArray(yangaQuestionPool).slice(0, 10).map((q) => ({ ...q, options: shuffleYangaArray(q.options) })));
    setYangaEntryStep("quiz");
  };
  const payYangaEntry = async () => {
    if (!firebaseUser) { window.dispatchEvent(new CustomEvent("smartservicestz-open-auth")); return; }
    setYangaPaymentBusy(true);
    try {
      const result = await consumeFirebaseTokens(firebaseUser.uid, { slug: "yanga-africans", name: "YANGA SC WHATSAPP GROUP", tokenCost: 6, kind: "paid", tokenType: "huduma" }, crypto.randomUUID());
      setYangaQuizPassed(true); setYangaEntryStep("rules"); setYangaQuizError("");
      toast.success("Tokeni 6 zimekatwa. Soma sheria za group ili kuendelea.", { description: `Rejea: ${result.reference}` });
    } catch (error: any) {
      toast.error(error?.message ?? "Imeshindikana kutumia tokeni 6.");
    } finally { setYangaPaymentBusy(false); }
  };
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
    setServices(rows.map((item) => {
      const rawSlug = String(item.slug ?? item.id);
      const slug = ["thibitisha-tin", "verify-tin"].includes(rawSlug) ? "verify-tin" : rawSlug;
      const fallbackName = slug === "verify-tin" ? "VERIFY TIN" : slug === "sme-airtel-mkataba" ? "SME AIRTEL MKATABA" : String(item.name ?? "Huduma");
      return {
        slug,
        name: getPortalServiceName(slug, fallbackName),
        description: String(slug === "sme-airtel-mkataba" ? "Jaza na hakiki mkataba wa SME wa Airtel." : item.description ?? ""),
        icon: String(item.icon ?? "sparkles"),
        tokenCost: Number(item.tokenCost ?? 0),
        tokenType: item.tokenType === "nida" ? "nida" : "huduma",
        category: String(item.category ?? "Huduma kuu"),
        kind: (item.isLocked ? "locked" : item.isFree || Number(item.tokenCost ?? 0) <= 0 ? "free" : "paid") as ServiceCatalogItem["kind"],
        actionUrl: typeof item.actionUrl === "string" ? item.actionUrl : undefined,
        order: Number(item.order ?? 9999),
        fields: Array.isArray(item.fields) ? item.fields : undefined,
        active: item.active !== false,
        isVisible: item.isVisible !== false,
        isLocked: item.isLocked === true,
        maintenanceMessage: typeof item.maintenanceMessage === "string" ? item.maintenanceMessage : undefined,
      };
    }));
    setServicesLoading(false);
    }).catch(() => { if (!cancelled) setServicesLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void getPublicSiteSettingsOnce().then((settings) => {
      if (cancelled) return;
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
  const totalTokenBalance = profile?.tokenBalanceOther ?? profile?.tokenBalance ?? 0;
  const appTheme = profile?.settings?.theme ?? "dark";
  const appAccent = profile?.settings?.accent ?? "green";
  const compactMode = profile?.settings?.compactMode === true;
  const useService = { mutate: async (service: ServiceCatalogItem) => { if (!firebaseUser) return; const requestId = tokenOperationKeys.current.get(service.slug) ?? crypto.randomUUID(); tokenOperationKeys.current.set(service.slug, requestId); try { const result = await consumeFirebaseTokens(firebaseUser.uid, service, requestId); toast.success(`${service.name} imefunguliwa.`, { description: `Rejea: ${result.reference}` }); if (service.actionUrl) window.location.href = service.actionUrl; else navigate(`/service/${service.slug}`); } catch (error: any) { toast.error(error?.message ?? "Imeshindikana kutumia huduma."); } finally { tokenOperationKeys.current.delete(service.slug); } } };
  const handleUse = (service: ServiceCatalogItem) => { if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("smartservicestz-open-auth")); toast("Jisajili au ingia kwanza ili kuendelea kutumia huduma."); return; } if (service.slug === "simba-sc") { setServiceNotice("SIMBA SC WHATSAPP GROUP bado haijaandaliwa. Kipengele hiki kimefungwa kwa muda hadi kiungo rasmi cha WhatsApp na maudhui yake yatakapowekwa."); return; } if (service.slug === "yanga-africans") { setYangaRulesAccepted(false); setYangaQuizPassed(false); setYangaEntryStep("choice"); setYangaFanConfirm(""); setYangaLoveConfirm(""); setYangaAnswers({}); setYangaPlayers([]); setYangaReviewResults([]); setYangaPlayersReview(null); setYangaQuizError(""); setYangaQuizQuestions(shuffleYangaArray(yangaQuestionPool).slice(0, 10).map((q) => ({ ...q, options: shuffleYangaArray(q.options) }))); setShowYangaRules(true); return; } if (service.kind === "locked") { setServiceNotice(`${service.name}: huduma hii imefungwa kwa sasa na msimamizi. Tafadhali chagua huduma nyingine au jaribu tena baadaye.`); return; } if (service.slug === "pata-till-mitandao-yote") { navigate(`/service/${service.slug}`); return; } if (totalTokenBalance <= 0) { toast.error("Huna tokeni. Ongeza tokeni kwanza ili kufungua huduma yoyote."); navigate("/tokens"); return; } if (["leseni-biashara", "pata-lipa-namba", "access-lipa-number", "tengeneza-mkataba"].includes(service.slug) || !service.actionUrl) { navigate(`/service/${service.slug}`); return; } if (!tokenOperationKeys.current.has(service.slug)) useService.mutate(service); };
  const serviceSlug = location.startsWith("/service/") ? location.slice("/service/".length) : "";
  const effectiveServices = mergeServiceCatalogDefaults(services, catalogInitialized).filter((service) => !/nida|\bnin\b/i.test(`${service.name} ${service.slug}`));
  const selectedService = effectiveServices.find((item) => item.slug === serviceSlug && item.active !== false && item.isVisible !== false);
  const serviceFields = Array.isArray(selectedService?.fields) ? selectedService.fields : [];
  const page = serviceSlug && (!isAuthenticated || (totalTokenBalance <= 0 && serviceSlug !== "pata-till-mitandao-yote")) ? <main className="portal-main"><section className="license-form-card" style={{ maxWidth: 620, margin: "40px auto", textAlign: "center" }}><div className="token-icon" style={{ margin: "0 auto 16px" }}><WalletCards size={30} /></div><h1>{!isAuthenticated ? "Ingia kwanza" : "Huna tokeni"}</h1><p>{!isAuthenticated ? "Ingia kwenye akaunti yako ili kutumia huduma." : "Huna tokeni zilizobaki. Ongeza tokeni kwanza; huduma hazitafunguka mpaka salio liwe zaidi ya sifuri."}</p><button type="button" className="button button--green" onClick={() => { if (!isAuthenticated) window.dispatchEvent(new CustomEvent("smartservicestz-open-auth")); else navigate("/tokens"); }}>{!isAuthenticated ? "INGIA / JISAJILI SASA" : "ONGEZA TOKENI"}</button></section></main> : location.startsWith("/admin") ? <AdminPage /> : serviceSlug === "kitambulisho-wakala" ? <AgentIdPage /> : serviceSlug === "stika-lipa" ? <LipaQrStudioPage /> : serviceSlug === "leseni-biashara" ? <BusinessLicensePage /> : serviceSlug === "pata-lipa-namba" ? <LipaNumberPage /> : serviceSlug === "pata-pocket-wifi-mabando" ? <PocketWifiPage /> : serviceSlug === "access-lipa-number" ? <AccessLipaNumberPage /> : serviceSlug === "pata-till-mitandao-yote" ? <PataTillNetworksPage /> : serviceSlug === "sme-vodacom" ? <SmeVodacomPage /> : serviceSlug === "sme-airtel" ? <SmeAirtelPage /> : serviceSlug === "change-business-name-airtel-lipa" ? <ChangeBusinessNameAirtelLipaPage /> : serviceSlug === "cheti-tin" ? <TINCertificatePage /> : serviceSlug === "verify-tin" ? <VerifyTinPage /> : serviceSlug === "sme-airtel-mkataba" ? <AirtelSmeContractPage /> : serviceSlug === "tengeneza-mkataba" ? <ContractMakerPage /> : ["stika-mawakala", "sticker-za-wakala", "sticker-wakala", "sticker-wakala-1"].includes(serviceSlug ?? "") ? <AgentStickerPage /> : serviceSlug && servicesLoading ? <main className="portal-main"><Notice tone="info">Inapakia huduma kutoka Firestore…</Notice></main> : selectedService ? serviceFields.length ? <DynamicServicePage service={selectedService as any} /> : <ServiceWorkspace service={selectedService} /> : location === "/my-applications" ? <MyApplicationsPage /> : location === "/history" ? <HistoryPage /> : location === "/account" ? <AccountPage /> : location === "/tokens" ? <main className="portal-main"><TokenCard /><Notice tone="info">Ununuzi wa tokeni kupitia FimiPay umesitishwa kwa muda. Kwa msaada kuhusu salio, wasiliana nasi WhatsApp 0692287767 (WhatsApp tu).</Notice></main> : <PortalHome search={search} onUse={handleUse} services={effectiveServices} userName={user?.name} isAuthenticated={isAuthenticated} allServicesPage={location === "/services"} />;
  const accessMode = resolveAccountAccessMode(user);
  const fullAccessBlocked = isAuthenticated && accessMode === "denied";
  const restrictionNotice = accessMode === "read_only"
    ? "Akaunti yako iko kwenye hali ya kusoma tu. Huwezi kutuma, kuhariri au kufanya maombi kwa sasa."
    : accessMode === "limited"
      ? `Akaunti yako imewekewa ruhusa maalum: ${accountRestrictionActions.filter((action) => user?.allowedActions?.includes(action)).map((action) => accountRestrictionActionLabels[action]).join(", ") || "hakuna kitendo kilichoruhusiwa"}.`
      : null;
  return <div className={`portal-shell ${compactMode ? "app-compact-mode" : ""}`} data-theme={appTheme} data-accent={appAccent} style={{ "--navy": "#071a36", "--green": appAccent === "blue" ? "#3b82f6" : appAccent === "purple" ? "#8b5cf6" : "#18b969", "--navy-2": "#0b2447" } as React.CSSProperties}>


    {showYangaRules && <div className="yanga-rules-backdrop" role="presentation" onClick={() => setShowYangaRules(false)}>
      <section className="yanga-rules-modal" role="dialog" aria-modal="true" aria-labelledby="yanga-rules-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="yanga-rules-close" aria-label="Funga dirisha" onClick={() => setShowYangaRules(false)}><X size={20} /></button>
        <div className="yanga-rules-kicker">💚💛 YANGA SC WHATSAPP GROUP</div>
        {yangaEntryStep === "choice" ? <>
          <h2 id="yanga-rules-title">Chagua namna ya kujiunga</h2>
          <p className="yanga-rules-motto">Unaweza kutumia tokeni 6 au kuthibitisha ushabiki wako kwa kujibu maswali bure.</p>
          <div className="yanga-entry-options">
            <button type="button" className="yanga-rules-join" disabled={yangaPaymentBusy} onClick={() => void payYangaEntry()}><WalletCards size={18} /> {yangaPaymentBusy ? "Inakata tokeni..." : "LIPIA TOKENI 6 KUJIUNGA"}</button>
            <button type="button" className="yanga-rules-join yanga-entry-free" onClick={() => { setYangaEntryStep("quiz"); setYangaQuizError(""); setYangaQuizQuestions(shuffleYangaArray(yangaQuestionPool).slice(0, 10).map((q) => ({ ...q, options: shuffleYangaArray(q.options) }))); }}>JIBU MASWALI KUJIUNGA BURE</button>
          </div>
          <p className="yanga-entry-hint">Njia ya bure inahitaji majibu yote sahihi na kuchagua wachezaji 11 wa Yanga.</p>
        </> : yangaEntryStep === "quiz" ? <>
          <h2 id="yanga-rules-title">Thibitisha kuwa shabiki wa Yanga</h2>
          <p className="yanga-rules-motto">Maswali 10 huchaguliwa kwa bahati nasibu kutoka kwenye hifadhi ya maswali zaidi ya 100. Kila jaribio linaweza kuwa tofauti.</p>
          <div className="yanga-fan-confirm">
            <label>Je, wewe ni mshabiki wa Yanga?
              <select value={yangaFanConfirm} onChange={(event) => setYangaFanConfirm(event.target.value)}><option value="">Chagua jibu</option><option>Ndiyo</option><option>Hapana</option></select>
            </label>
            <label>Je, unaipenda Yanga?
              <select value={yangaLoveConfirm} onChange={(event) => setYangaLoveConfirm(event.target.value)}><option value="">Chagua jibu</option><option>Ndiyo</option><option>Hapana</option></select>
            </label>
          </div>
          <div className="yanga-quiz-content">
            <div className="yanga-quiz-questions">
              {yangaQuizQuestions.map((question, i) => <fieldset className="yanga-quiz-question" key={i}>
                <legend><strong>Swali {i + 1}:</strong> {question.q}</legend>
                {question.options.map((option) => <label className="yanga-quiz-option" key={option}><input type="radio" name={`yanga-question-${i}`} checked={yangaAnswers[i] === option} onChange={() => setYangaAnswers((prev) => ({ ...prev, [i]: option }))} /><span>{option}</span></label>)}
              </fieldset>)}
            </div>
            <div className="yanga-player-picker">
              <h3>Chagua wachezaji 11 wa Yanga ({yangaPlayers.length}/11)</h3>
              <p>Orodha ina majina 30 kutoka klabu mbalimbali duniani. Chagua wachezaji 11 wa Yanga pekee; majina hayajawekewa lebo za timu.</p>
              <div className="yanga-player-grid">{yangaPlayerChoices.map((player) => <label className="yanga-player-option" key={player.name}><input type="checkbox" checked={yangaPlayers.includes(player.name)} onChange={(event) => { setYangaPlayers((prev) => event.target.checked ? (prev.length < 11 ? [...prev, player.name] : prev) : prev.filter((name) => name !== player.name)); setYangaQuizError(""); }} /><span>{player.name}</span></label>)}</div>
            </div>
          </div>
          {yangaQuizError && <p className="yanga-quiz-error" role="alert">{yangaQuizError}</p>}
          <button type="button" className="yanga-rules-join" onClick={submitYangaQuiz}>THIBITISHA MAJIBU NA UENDELEE</button>
        </> : yangaEntryStep === "review" ? <>
          <h2 id="yanga-rules-title">Matokeo ya majibu yako</h2>
          <p className="yanga-rules-motto">Kagua majibu uliyokosea na jibu sahihi. Jaribio linalofuata litakuwa na maswali mapya.</p>
          <div className="yanga-quiz-review-list">
            {yangaReviewResults.map((result, i) => <div className={result.isCorrect ? "yanga-quiz-review-item correct" : "yanga-quiz-review-item incorrect"} key={i}>
              <strong>{i + 1}. {result.question}</strong>
              <p>Jibu lako: <b>{result.selected}</b> {result.isCorrect ? "✓ Sahihi" : "✗ Si sahihi"}</p>
              {!result.isCorrect && <p>Jibu sahihi: <b>{result.correct}</b></p>}
            </div>)}
          </div>
          {yangaPlayersReview && <div className={yangaPlayersReview.isCorrect ? "yanga-quiz-review-item correct" : "yanga-quiz-review-item incorrect"}>
            <strong>Uchaguzi wa wachezaji</strong>
            <p>{yangaPlayersReview.isCorrect ? "Umechagua wachezaji 11 sahihi wa Yanga." : "Umechagua majina yasiyo sahihi au umeacha baadhi ya wachezaji wa Yanga."}</p>
            {!yangaPlayersReview.isCorrect && <p>Majina 11 sahihi: <b>{yangaPlayersReview.correct.join(", ")}</b></p>}
          </div>}
          <button type="button" className="yanga-rules-join" onClick={retryYangaQuiz}>MASWALI MAPYA, JARIBU TENA</button>
        </> : <>
          <h2 id="yanga-rules-title">💚 SHERIA ZA GROUP LA WANANCHI 💚</h2>
          <p className="yanga-rules-motto">Daima Mbele, Nyuma Mwiko! 💪💚💛</p>
          <ol className="yanga-rules-list">
            <li><strong>Sheria 1:</strong> Heshimu kila mwanachama wa group bila kujali umri, jinsia au nafasi yake.</li>
            <li><strong>Sheria 2:</strong> Matusi, lugha za kejeli, uchochezi, ubaguzi na ugomvi haviruhusiwi.</li>
            <li><strong>Sheria 3:</strong> Taarifa zote zinazotumwa ziwe za uhakika na zihusiane na Yanga au shughuli za group.</li>
            <li><strong>Sheria 4:</strong> Hairuhusiwi kutuma link, matangazo au kufanya biashara yoyote bila ruhusa ya Admin.</li>
            <li><strong>Sheria 5:</strong> Hairuhusiwi kutuma picha, video au maudhui yoyote yasiyo na maadili.</li>
            <li><strong>Sheria 6:</strong> Hairuhusiwi kumfuata mwanachama inbox bila ridhaa yake.</li>
            <li><strong>Sheria 7:</strong> Mambo ya inbox hayaruhusiwi kuletwa au kujadiliwa kwenye group. Toa taarifa kwa Admin endapo kuna tatizo.</li>
            <li><strong>Sheria 8:</strong> Voice note haziruhusiwi isipokuwa kwa ruhusa maalum ya Admin.</li>
            <li><strong>Sheria 9:</strong> Sticker, picha na video zinazotumwa ziheshimu maadili na zisiwe za kuudhi.</li>
            <li><strong>Sheria 10:</strong> Epuka siasa, dini na mijadala inayoweza kuleta mgawanyiko ndani ya group.</li>
            <li><strong>Sheria 11:</strong> Wakati wa mechi, tuzingatie mjadala wa mechi na tuepuke spam zisizo na umuhimu.</li>
            <li><strong>Sheria 12:</strong> Maamuzi ya Admin yaheshimiwe. Malalamiko yote yawasilishwe kwa Admin kwa utaratibu.</li>
            <li><strong>Sheria 13:</strong> Yeyote atakayekiuka sheria za group ataonywa au kuondolewa kulingana na uzito wa kosa.</li>
            <li><strong>Sheria 14:</strong> Ukijiunga kwenye group, tafadhali jitambulishe kwa jina lako na eneo unapotokea.</li>
          </ol>
          <p className="yanga-rules-closing">💚 Sisi ni familia moja ya Wananchi.<br />💛 Tuidumishe umoja, heshima na upendo ndani ya group letu.<br /><strong>💚 DAIMA MBELE, NYUMA MWIKO! 💚💛</strong></p>
          <label className="yanga-rules-accept"><input type="checkbox" checked={yangaRulesAccepted} onChange={(event) => setYangaRulesAccepted(event.target.checked)} /><span>Nimesoma na kukubali sheria zote za group la mashabiki wa Yanga.</span></label>
          <button type="button" className="yanga-rules-join" disabled={!yangaRulesAccepted} onClick={() => { window.open("https://chat.whatsapp.com/In0wFjXWfVO516H9J9wah3?s=cl&p=a&iam=2", "_blank", "noopener,noreferrer"); setShowYangaRules(false); }}> <MessageCircle size={18} /> Jiunge na YANGA SC WhatsApp Group </button>
        </>}
      </section>
    </div>}
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
