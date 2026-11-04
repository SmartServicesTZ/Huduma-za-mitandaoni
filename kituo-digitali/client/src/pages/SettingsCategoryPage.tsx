import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bell, Eye, Palette, ShieldCheck, SlidersHorizontal, WalletCards, Volume2, RefreshCw, CheckCircle2, Wifi } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";

type Category = "appearance" | "privacy" | "experience";
const titles: Record<Category,string> = { appearance:"Muonekano wa App", privacy:"Arifa na faragha", experience:"Uzoefu wa matumizi" };

export default function SettingsCategoryPage({ category }: { category: Category }) {
  const { profile, updateProfile } = useAuth();
  const { setPreference } = useTheme();
  const [theme,setTheme]=useState<"system"|"light"|"dark">("light");
  const [accent,setAccent]=useState("green");
  const [notifications,setNotifications]=useState(true);
  const [showBalance,setShowBalance]=useState(true);
  const [showOnlineStatus,setShowOnlineStatus]=useState(true);
  const [compactMode,setCompactMode]=useState(false);
  const [reduceMotion,setReduceMotion]=useState(false);
  const [sounds,setSounds]=useState(true);
  const [autoRefresh,setAutoRefresh]=useState(true);
  const [confirmActions,setConfirmActions]=useState(true);
  const [dataSaver,setDataSaver]=useState(false);

  useEffect(()=>{
    const s=profile?.settings??{};
    const t=(s.theme==="light"||s.theme==="system"||s.theme==="dark")?s.theme:"light";
    setTheme(t); setPreference(t); setAccent(String(s.accent??"green"));
    setNotifications(s.notifications!==false); setShowBalance(s.showBalance!==false);
    setShowOnlineStatus(s.showOnlineStatus!==false); setCompactMode(s.compactMode===true);
    setReduceMotion(s.reduceMotion===true); setSounds(s.sounds!==false);
    setAutoRefresh(s.autoRefresh!==false); setConfirmActions(s.confirmActions!==false); setDataSaver(s.dataSaver===true);
  },[profile?.uid,profile?.settings,setPreference]);

  const save=async(patch:Record<string,unknown>)=>{
    if(!profile){return;}
    try{await updateProfile({settings:{...(profile.settings??{}),...patch}} as any);}
    catch{ /* keep the selected value visible; the next save can retry */ }
  };
  const toggle=(label:string,value:boolean,change:(v:boolean)=>void,key:string)=>{
    change(!value); void save({[key]:!value});
  };
  const row=(label:string,icon:React.ReactNode,value:boolean,key:string,change:(v:boolean)=>void)=> <div className="profile-setting-row" key={key}><span>{icon}{label}</span><button type="button" aria-label={label} aria-pressed={value} className={value?"setting-toggle on":"setting-toggle"} onClick={()=>toggle(label,value,change,key)}><i/></button></div>;

  return <main className="portal-main settings-category-page">
    <header className="page-heading"><Link className="settings-back" href="/settings">← Rudi kwenye Settings</Link><span className="overline">SETTINGS</span><h1>{titles[category]}</h1><p>{category==="appearance"?"Chagua mandhari na mwonekano unaokufaa.":category==="privacy"?"Dhibiti arifa na taarifa zinazoonekana kwenye akaunti yako.":"Dhibiti namna app inavyofanya kazi kwenye simu yako."}</p></header>
    <section className="profile-main-card settings-category-content">
      {category==="appearance" ? <>
        <label className="settings-select"><span><Palette size={17}/> Mandhari</span><select value={theme} onChange={e=>{const v=e.target.value as typeof theme;setTheme(v);setPreference(v);void save({theme:v});}}><option value="dark">Dark — usiku</option><option value="light">Light — mchana</option><option value="system">Fuata simu (System)</option></select></label>
        <label className="settings-select"><span>Rangi ya app</span><select value={accent} onChange={e=>{setAccent(e.target.value);void save({accent:e.target.value});}}><option value="green">Green</option><option value="blue">Blue</option><option value="purple">Purple</option></select></label>
        {row("Muonekano compact",<SlidersHorizontal size={16}/>,compactMode,"compactMode",setCompactMode)}
        {row("Punguza miondoko",<Eye size={16}/>,reduceMotion,"reduceMotion",setReduceMotion)}
      </>:null}
      {category==="privacy" ? <>
        {row("Arifa za akaunti",<Bell size={16}/>,notifications,"notifications",setNotifications)}
        {row("Onyesha salio la tokeni",<WalletCards size={16}/>,showBalance,"showBalance",setShowBalance)}
        {row("Onyesha hali ya online",<ShieldCheck size={16}/>,showOnlineStatus,"showOnlineStatus",setShowOnlineStatus)}
        <p className="profile-muted">Soma pia <Link href="/privacy">Sera ya Faragha</Link>.</p>
      </>:null}
      {category==="experience" ? <>
        {row("Sauti za app",<Volume2 size={16}/>,sounds,"sounds",setSounds)}
        {row("Refresh ya moja kwa moja",<RefreshCw size={16}/>,autoRefresh,"autoRefresh",setAutoRefresh)}
        {row("Thibitisha vitendo muhimu",<CheckCircle2 size={16}/>,confirmActions,"confirmActions",setConfirmActions)}
        {row("Data saver",<Wifi size={16}/>,dataSaver,"dataSaver",setDataSaver)}
      </>:null}
      <p className="profile-muted">Mipangilio huhifadhiwa kwenye akaunti yako pale unapobadilisha chaguo.</p>
    </section>
  </main>;
}
