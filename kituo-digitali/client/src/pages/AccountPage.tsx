import { useEffect, useState } from "react";
import { Link } from "wouter";
import { BadgeCheck, Camera, CheckCircle2, Globe2, ImagePlus, LockKeyhole, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { subscribeUserMessages, updatePassword, uploadProfileImage } from "@/lib/firebase";

export default function AccountPage() {
  const { isAuthenticated, user, profile, firebaseUser, logout, updateProfile: saveProfile } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [language, setLanguage] = useState<"sw" | "en">("sw");
  const [newPassword, setNewPassword] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [messages, setMessages] = useState<Array<Record<string, unknown> & { id: string }>>([]);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setBio(profile.bio ?? "");
    setLanguage(profile.language ?? "sw");
  }, [profile?.uid, profile?.firstName, profile?.lastName, profile?.bio, profile?.language]);
  useEffect(() => {
    if (!firebaseUser) { setMessages([]); return; }
    return subscribeUserMessages(firebaseUser.uid, setMessages, () => toast.error("Imeshindikana kupakia ujumbe."));
  }, [firebaseUser]);

  const chooseProfileImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !firebaseUser) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast.error("Chagua picha ya JPG, PNG au WebP."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Picha isizidi MB 2."); return; }
    setImageBusy(true);
    void uploadProfileImage(firebaseUser.uid, file)
      .then(() => toast.success("Picha ya wasifu imehifadhiwa."))
      .catch((error: any) => toast.error(error?.message ?? "Imeshindikana kuhifadhi picha."))
      .finally(() => { setImageBusy(false); event.target.value = ""; });
  };
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
  const saveNewPassword = async () => {
    if (!firebaseUser || newPassword.length < 6) { toast.error("Password iwe na angalau herufi 6."); return; }
    try { await updatePassword(firebaseUser, newPassword); setNewPassword(""); toast.success("Password imebadilishwa kwa usalama."); }
    catch { toast.error("Kwa usalama, ingia tena kabla ya kubadilisha password."); }
  };
  const completion = [Boolean(firstName.trim() && lastName.trim()), Boolean(profile?.profileImageUrl), Boolean(bio.trim()), Boolean(profile?.phone)].filter(Boolean).length * 25;

  if (!isAuthenticated || !firebaseUser) return <main className="portal-main"><div className="page-heading"><div><span className="overline">Wasifu na usalama</span><h1>Akaunti yangu</h1><p>Ingia ili kuona taarifa za akaunti yako binafsi.</p></div></div><section className="profile-login-card"><span className="profile-icon"><UserRound size={22}/></span><strong>Akaunti yako iko tayari</strong><p>Tumia kitufe cha Ingia / Jisajili juu ili kufungua wasifu wako.</p><Link className="button button--green" href="/">Rudi mwanzo</Link></section></main>;

  return <main className="portal-main profile-page">
    <header className="page-heading profile-page-heading"><div><span className="overline">WASIFU NA USALAMA</span><h1>Akaunti yangu</h1><p>Simamia taarifa zako, picha ya wasifu na mipangilio ya akaunti.</p></div><span className="profile-secure-tag"><ShieldCheck size={15}/> Firebase Auth salama</span></header>
    <div className="profile-layout">
      <section className="profile-main-card">
        <div className="profile-card-heading"><div><span className="profile-icon"><UserRound size={20}/></span><div><h2>Wasifu wangu</h2><p>Simu yako ndiyo utambulisho wa akaunti; haiwezi kubadilishwa hapa.</p></div></div></div>
        <div className="profile-summary"><div className="profile-avatar">{profile?.profileImageUrl ? <img src={profile.profileImageUrl} alt="Picha ya wasifu"/> : <span>{(user?.name ?? "M").slice(0, 1).toUpperCase()}</span>}</div><div className="profile-summary-copy"><strong>{profile?.name ?? user?.name ?? "Mwanachama"} {profile?.verificationStatus === "approved" && <BadgeCheck size={16}/>}</strong><span>Namba iliyosajiliwa: <b>{profile?.phone ?? "—"}</b></span><label className="profile-image-picker"><Camera size={15}/>{imageBusy ? "Inapakia picha…" : "Badilisha picha"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProfileImage} disabled={imageBusy || !profile}/></label></div></div>
        <form onSubmit={save} className="profile-form">
          <div className="profile-field-grid"><label>Jina la kwanza<input autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={60} disabled={!profile || profileBusy}/></label><label>Jina la mwisho<input autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={60} disabled={!profile || profileBusy}/></label></div>
          <label className="profile-field">Namba ya simu<input type="tel" value={profile?.phone ?? ""} readOnly aria-readonly="true" disabled={!profile}/><small>Inatumika kuingia na haiwezi kubadilishwa ili kuzuia kupoteza utambulisho wa akaunti.</small></label>
          <label className="profile-field">Kuhusu mimi <span className="profile-char-count">{bio.length}/160</span><textarea value={bio} onChange={(event) => setBio(event.target.value.slice(0, 160))} maxLength={160} rows={3} placeholder="Andika maelezo mafupi kuhusu wewe…" disabled={!profile || profileBusy}/></label>
          <label className="profile-field">Lugha ya matumizi<select value={language} onChange={(event) => setLanguage(event.target.value as "sw" | "en")} disabled={!profile || profileBusy}><option value="sw">Kiswahili</option><option value="en">English</option></select><small>Hili huhifadhi upendeleo wako wa lugha kwenye wasifu.</small></label>
          {!profile && <p className="profile-load-note">Inapakia taarifa za wasifu…</p>}
          <button className="button button--green profile-save-button" type="submit" disabled={!profile || profileBusy}>{profileBusy ? "Inahifadhi…" : <><CheckCircle2 size={16}/> Hifadhi wasifu</>}</button>
        </form>
        <div className="profile-privacy"><LockKeyhole size={16}/><span><strong>Faragha ya akaunti</strong>Password yako huhifadhiwa kwenye Firebase Authentication pekee; haionyeshwi au kuhifadhiwa kwenye wasifu.</span></div>
      </section>
      <aside className="profile-side">
        <section className="profile-side-card profile-progress-card"><div className="profile-side-title"><span className="profile-icon"><CheckCircle2 size={18}/></span><div><h3>Ukamilifu wa wasifu</h3><p>Wasifu ulio kamili husaidia watu kukutambua.</p></div></div><div className="profile-progress-value"><strong>{completion}%</strong><span>imekamilika</span></div><div className="profile-progress-track"><i style={{ width: `${completion}%` }}/></div><ul><li className={firstName && lastName ? "done" : ""}>Majina yamejazwa</li><li className={profile?.profileImageUrl ? "done" : ""}>Picha ya wasifu</li><li className={bio ? "done" : ""}>Maelezo mafupi</li></ul></section>
        <section className="profile-side-card"><div className="profile-side-title"><span className="profile-icon"><Globe2 size={18}/></span><div><h3>Akaunti</h3><p>Hali na salio lako la sasa.</p></div></div><div className="profile-stat-row"><span>Salio la tokeni</span><strong>{profile?.tokenBalance ?? 0}</strong></div><div className="profile-stat-row"><span>Uthibitisho</span><strong>{profile?.verificationStatus === "approved" ? "Imeidhinishwa" : "Inasubiri"}</strong></div><Link className="profile-side-link" href="/tokens">Angalia maelezo ya tokeni</Link></section>
        <section className="profile-side-card"><div className="profile-side-title"><span className="profile-icon"><LockKeyhole size={18}/></span><div><h3>Badilisha password</h3><p>Password huenda Firebase Authentication pekee.</p></div></div><label className="profile-field">Password mpya<input type="password" autoComplete="new-password" placeholder="Angalau herufi 6" value={newPassword} onChange={(event) => setNewPassword(event.target.value)}/></label><button className="profile-secondary-button" type="button" onClick={() => void saveNewPassword()}>Hifadhi password mpya</button></section>
        <section className="profile-side-card profile-notifications"><div className="profile-side-title"><span className="profile-icon"><ImagePlus size={18}/></span><div><h3>Ujumbe na taarifa</h3><p>Updates za akaunti na maombi yako.</p></div></div>{messages.length ? messages.slice(0, 4).map((item) => <article className="account-notification" key={item.id}><strong>{String(item.subject ?? "Taarifa")}</strong><p>{String(item.body ?? "")}</p><small>{String(item.createdAt ?? "")}</small></article>) : <p className="profile-muted">Bado hakuna taarifa mpya.</p>}<Link className="profile-side-link" href="/service/pata-lipa-namba">Maombi ya Lipa Namba</Link></section>
        <button className="profile-logout-button" type="button" onClick={() => void logout()}><LogOut size={16}/> Toka kwenye akaunti</button>
      </aside>
    </div>
  </main>;
}
