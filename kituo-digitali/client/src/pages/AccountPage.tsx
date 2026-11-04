import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { Link } from "wouter";
import { BadgeCheck, CheckCircle2, Globe2, ImagePlus, LockKeyhole, LogOut, ShieldCheck, UserRound, Bell, MessageCircle, Palette, SlidersHorizontal, Eye, History, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { subscribeUserMessages, updatePassword } from "@/lib/firebase";

export default function AccountPage() {
  const { isAuthenticated, user, profile, firebaseUser, logout, updateProfile: saveProfile } = useAuth();
  const { setPreference: applyThemePreference } = useTheme();
  const [settingsPage, setSettingsPage] = useState<"home" | "appearance" | "privacy" | "experience" | "account">("home");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [language, setLanguage] = useState<"sw" | "en">("sw");
  const [newPassword, setNewPassword] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [notifications, setNotifications] = useState(true); const [compactMode, setCompactMode] = useState(false); const [showBalance, setShowBalance] = useState(true); const [theme, setTheme] = useState<"system" | "light" | "dark">("light"); const [accent, setAccent] = useState<"green" | "blue" | "purple">("green"); const [reduceMotion, setReduceMotion] = useState(false); const [sounds, setSounds] = useState(true); const [autoRefresh, setAutoRefresh] = useState(true); const [showOnlineStatus, setShowOnlineStatus] = useState(true); const [confirmActions, setConfirmActions] = useState(true); const [dataSaver, setDataSaver] = useState(false); const [messages, setMessages] = useState<Array<Record<string, unknown> & { id: string }>>([]);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setBio(profile.bio ?? "");
    setLanguage(profile.language ?? "sw"); document.documentElement.lang = profile.language ?? "sw";
    setNotifications(profile.settings?.notifications !== false);
    setCompactMode(profile.settings?.compactMode === true);
    setShowBalance(profile.settings?.showBalance !== false);
    setTheme(profile.settings?.theme ?? "light");
    applyThemePreference(profile.settings?.theme === "light" || profile.settings?.theme === "system" || profile.settings?.theme === "dark" ? profile.settings.theme : "light");
    setAccent(profile.settings?.accent ?? "green");
    setReduceMotion(profile.settings?.reduceMotion === true); setSounds(profile.settings?.sounds !== false); setAutoRefresh(profile.settings?.autoRefresh !== false); setShowOnlineStatus(profile.settings?.showOnlineStatus !== false); setConfirmActions(profile.settings?.confirmActions !== false); setDataSaver(profile.settings?.dataSaver === true);
  }, [profile?.uid, profile?.firstName, profile?.lastName, profile?.bio, profile?.language, profile?.settings, applyThemePreference]);
  useEffect(() => {
    if (!firebaseUser) { setMessages([]); return; }
    return subscribeUserMessages(firebaseUser.uid, setMessages, () => toast.error("Imeshindikana kupakia ujumbe."));
  }, [firebaseUser]);


  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim()) { toast.error("Jaza jina la kwanza na la mwisho."); return; }
    setProfileBusy(true);
    try {
      await saveProfile({ firstName: firstName.trim(), lastName: lastName.trim(), name: `${firstName.trim()} ${lastName.trim()}`, bio: bio.trim().slice(0, 160), language });
      toast.success("Wasifu wako umehifadhiwa.");
    } catch { toast.error("Imeshindikana kuhifadhi wasifu. Jaribu tena."); }
    finally { setProfileBusy(false); }
  };
  const saveSetting = async (patch: Record<string, unknown>) => {
    if (!profile) return;
    try {
      await saveProfile({ settings: { ...(profile.settings ?? {}), notifications, compactMode, showBalance, theme, accent, reduceMotion, ...patch } } as any);
      toast.success("Setting imehifadhiwa.");
    } catch { toast.error("Imeshindikana kuhifadhi setting."); }
  };
  const saveNewPassword = async () => {
    if (!firebaseUser || newPassword.length < 6) { toast.error("Password iwe na angalau herufi 6."); return; }
    try { await updatePassword(firebaseUser, newPassword); setNewPassword(""); toast.success("Password imebadilishwa kwa usalama."); }
    catch { toast.error("Kwa usalama, ingia tena kabla ya kubadilisha password."); }
  };
  const completion = [Boolean(firstName.trim() && lastName.trim()), Boolean(bio.trim()), Boolean(profile?.phone)].filter(Boolean).length * 25;

  if (!isAuthenticated || !firebaseUser) return <main className="portal-main"><div className="page-heading"><div><span className="overline">Wasifu na usalama</span><h1>Akaunti yangu</h1><p>Ingia ili kuona taarifa za akaunti yako binafsi.</p></div></div><section className="profile-login-card"><span className="profile-icon"><UserRound size={22}/></span><strong>Akaunti yako iko tayari</strong><p>Tumia kitufe cha Ingia / Jisajili juu ili kufungua wasifu wako.</p><Link className="button button--green" href="/">Rudi mwanzo</Link></section></main>;

  return <main className="portal-main profile-page">
    <header className="page-heading profile-page-heading"><div><Link className="settings-back" href="/settings">← Rudi kwenye Settings</Link><span className="overline">MY ACCOUNT</span><h1>My Account</h1><p>Taarifa zako binafsi, wasifu na usalama wa akaunti yako.</p></div><span className="profile-secure-tag"><ShieldCheck size={15}/> Firebase Auth salama</span></header>
    <section aria-label="Mawasiliano ya msaada" style={{margin:"0 0 22px",padding:"20px",borderRadius:18,border:"2px solid #22c55e",background:"linear-gradient(135deg,rgba(34,197,94,.13),rgba(20,184,166,.08))",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,minWidth:0}}>
        <span style={{width:54,height:54,borderRadius:16,display:"grid",placeItems:"center",background:"#16a34a",color:"#fff",flexShrink:0}}><MessageCircle size={28}/></span>
        <div><strong style={{display:"block",fontSize:18}}>Unahitaji msaada wa moja kwa moja?</strong><p style={{margin:"5px 0",lineHeight:1.5}}>Wasiliana na msimamizi wa SmartServicesTZ kupitia WhatsApp.</p><strong style={{fontSize:16}}>0698232313 <span style={{fontSize:12,color:"#15803d"}}>· WhatsApp tu</span></strong><p style={{margin:"4px 0 0",fontSize:12}}>Namba hii haipokei simu za kawaida wala SMS.</p></div>
      </div>
      <a href="https://wa.me/255698232313?text=Habari%2C%20nahitaji%20msaada%20wa%20SmartServicesTZ." target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:9,padding:"13px 20px",borderRadius:12,background:"#16a34a",color:"#fff",fontWeight:800,textDecoration:"none",minHeight:48,boxShadow:"0 5px 16px rgba(22,163,74,.25)"}}><MessageCircle size={19}/> Fungua WhatsApp</a>
    </section>
    <div className="profile-layout">
      <section className="profile-main-card">
        <div className="profile-card-heading"><div><span className="profile-icon"><UserRound size={20}/></span><div><h2>Account / Wasifu wangu</h2><p>Simu yako ndiyo utambulisho wa akaunti; haiwezi kubadilishwa hapa.</p></div></div></div>
        <div className="profile-summary"><div className="profile-avatar"><span>{(profile?.name ?? user?.name ?? "M").trim().slice(0, 1).toUpperCase()}</span></div><div className="profile-summary-copy"><strong>{profile?.name ?? user?.name ?? "Mwanachama"} {profile?.verificationStatus === "approved" && <BadgeCheck size={16}/>}</strong><span>Namba iliyosajiliwa: <b>{profile?.phone ?? "—"}</b></span>{profile?.verificationStatus === "approved" ? <span className="profile-verified-badge"><BadgeCheck size={15}/> Verified</span> : <span className="profile-unverified-badge">Verification pending</span>}<span className="profile-muted">Avatar ya herufi hutengenezwa moja kwa moja. Haitumii picha, Firebase Storage wala reads za ziada.</span></div></div>
        <form onSubmit={save} className="profile-form">
          <div className="profile-field-grid"><label>Jina la kwanza<input autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={60} disabled={!profile || profileBusy}/></label><label>Jina la mwisho<input autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={60} disabled={!profile || profileBusy}/></label></div>
          <label className="profile-field">Namba ya simu<input type="tel" value={profile?.phone ?? ""} readOnly aria-readonly="true" disabled={!profile}/><small>Inatumika kuingia na haiwezi kubadilishwa ili kuzuia kupoteza utambulisho wa akaunti.</small></label>
          <label className="profile-field">Kuhusu mimi <span className="profile-char-count">{bio.length}/160</span><textarea value={bio} onChange={(event) => setBio(event.target.value.slice(0, 160))} maxLength={160} rows={3} placeholder="Andika maelezo mafupi kuhusu wewe…" disabled={!profile || profileBusy}/></label>
          <label className="profile-field">Lugha ya matumizi<select value={language} onChange={(event) => { const value = event.target.value as "sw" | "en"; setLanguage(value); document.documentElement.lang = value; void saveProfile({ language: value }); }} disabled={!profile || profileBusy}><option value="sw">Kiswahili</option><option value="en">English</option></select><small>Hili huhifadhi upendeleo wako wa lugha kwenye wasifu.</small></label>
          {!profile && <p className="profile-load-note">Inapakia taarifa za wasifu…</p>}
          <button className="button button--green profile-save-button" type="submit" disabled={!profile || profileBusy}>{profileBusy ? "Inahifadhi…" : <><CheckCircle2 size={16}/> Hifadhi wasifu</>}</button>
        </form>
        <div className="profile-privacy"><LockKeyhole size={16}/><span><strong>Faragha ya akaunti</strong>Password yako huhifadhiwa kwenye Firebase Authentication pekee; haionyeshwi au kuhifadhiwa kwenye wasifu.</span></div>
      </section>
      <aside className="profile-side">
        <section className="profile-side-card profile-progress-card"><div className="profile-side-title"><span className="profile-icon"><CheckCircle2 size={18}/></span><div><h3>Ukamilifu wa wasifu</h3><p>Wasifu ulio kamili husaidia watu kukutambua.</p></div></div><div className="profile-progress-value"><strong>{completion}%</strong><span>imekamilika</span></div><div className="profile-progress-track"><i style={{ width: `${completion}%` }}/></div><ul><li className={firstName && lastName ? "done" : ""}>Majina yamejazwa</li><li className={profile?.profileImageUrl ? "done" : ""}>Picha ya wasifu</li><li className={bio ? "done" : ""}>Maelezo mafupi</li></ul></section>
        <section className="profile-side-card"><div className="profile-side-title"><span className="profile-icon"><Globe2 size={18}/></span><div><h3>Akaunti</h3><p>Hali na salio lako la sasa.</p></div></div><div className="profile-stat-row"><span>Salio la tokeni</span><strong>{showBalance ? (profile?.tokenBalance ?? 0) : "•••"}</strong></div><div className="profile-stat-row"><span>Uthibitisho</span><strong>{profile?.verificationStatus === "approved" ? "Imeidhinishwa" : "Inasubiri"}</strong></div><Link className="profile-side-link" href="/tokens">Angalia maelezo ya tokeni</Link></section>
        <section className="profile-side-card"><div className="profile-side-title"><span className="profile-icon"><LockKeyhole size={18}/></span><div><h3>Badilisha password</h3><p>Password huenda Firebase Authentication pekee.</p></div></div><label className="profile-field">Password mpya<input type="password" autoComplete="new-password" placeholder="Angalau herufi 6" value={newPassword} onChange={(event) => setNewPassword(event.target.value)}/></label><button className="profile-secondary-button" type="button" onClick={() => void saveNewPassword()}>Hifadhi password mpya</button></section>
        <section className="profile-side-card profile-notifications"><div className="profile-side-title"><span className="profile-icon"><ImagePlus size={18}/></span><div><h3>Ujumbe na taarifa</h3><p>Updates za akaunti na maombi yako.</p></div></div>{messages.length ? messages.slice(0, 4).map((item) => <article className="account-notification" key={item.id}><strong>{String(item.subject ?? "Taarifa")}</strong><p>{String(item.body ?? "")}</p><small>{String(item.createdAt ?? "")}</small></article>) : <p className="profile-muted">Bado hakuna taarifa mpya.</p>}<Link className="profile-side-link" href="/service/pata-lipa-namba">Maombi ya Lipa Namba</Link></section>
        <section className="profile-side-card">
          <div className="profile-side-title"><span className="profile-icon"><Globe2 size={18}/></span><div><h3>Kuhusu SmartServicesTZ</h3><p>Taarifa za app na njia za haraka.</p></div></div>
          <div className="profile-stat-row"><span>Jina la app</span><strong>SmartServicesTZ</strong></div>
          <div className="profile-stat-row"><span>Aina</span><strong>Huduma za mtandaoni</strong></div>
          <div style={{display:"grid",gap:9,marginTop:12}}>
            <a className="profile-side-link" href="https://chat.whatsapp.com/H1Bvu253n9NK7c4agRgOX4?s=cl&p=a&iam=2" target="_blank" rel="noreferrer"><MessageCircle size={16}/> Jiunge na Group la WhatsApp</a>
            <button className="profile-side-link" type="button" onClick={() => window.location.reload()} style={{width:"100%",textAlign:"left",cursor:"pointer",font:"inherit"}}>↻ Refresh / Pakia upya app</button>
            <Link className="profile-side-link" href="/history"><History size={16}/> Historia ya shughuli</Link>
            <Link className="profile-side-link" href="/tokens"><WalletCards size={16}/> Wallet ya tokeni</Link>
          </div>
          <p className="profile-muted" style={{marginTop:10}}>Usalama: usimpe mtu password yako wala kutuma taarifa za siri kwenye mazungumzo.</p>
        </section><section className="profile-side-card"><div className="profile-side-title"><span className="profile-icon"><Eye size={18}/></span><div><h3>Faragha na usalama</h3><p>Simamia usalama na historia ya akaunti.</p></div></div><Link className="profile-side-link" href="/history"><History size={15}/> Angalia historia ya shughuli</Link></section>
        <button className="profile-logout-button" type="button" onClick={() => void logout()}><LogOut size={16}/> Toka kwenye akaunti</button>
      </aside>
    </div>
  </main>;
}
