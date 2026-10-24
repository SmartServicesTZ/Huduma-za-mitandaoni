import { useState } from "react";
import { ArrowLeft, Building2, LoaderCircle, ShieldCheck, Send, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { createServiceApplication } from "@/lib/firebase";

const FORM_URL = "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=JzfHFpyXgk2zp-tqL93-V0QxQ30RRhFApA9nMNcqKjJUMFg0Wkc0Mzg0NEw0VkFPTjhJS1dTTEhQRy4u&embed=true";

export default function ChangeBusinessNameAirtelLipaPage() {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ applicantName: "", contactPhone: "", lipaNumber: "", oldBusinessName: "", newBusinessName: "", reason: "" });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function saveCopy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setSaved(false);
    try {
      const applicationId = globalThis.crypto?.randomUUID?.() ?? `CBNA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await createServiceApplication(applicationId, "change-business-name-airtel-lipa", {
        ...form,
        serviceName: "CHANGE BUSINESS NAME AIRTEL LIPA",
        requestType: "CHANGE BUSINESS NAME AIRTEL LIPA",
        submissionSource: "SmartServicesTZ internal copy",
        note: "Nakala ya kufuatilia ombi. Mtumiaji lazima pia atume fomu rasmi ya Airtel iliyo chini.",
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Imeshindikana kuhifadhi nakala. Hakikisha umeingia kisha jaribu tena.");
    } finally { setSaving(false); }
  }
  return <main className="portal-main change-business-name-page">
    <style>{`
      .change-business-name-page{max-width:1040px;margin:0 auto;padding:20px 14px 44px;color:var(--foreground,#e8edf7)}
      .change-business-name-top{display:flex;align-items:center;gap:12px;margin-bottom:18px}
      .change-business-name-back{display:inline-flex;align-items:center;gap:7px;padding:9px 12px;border:1px solid var(--border,#334155);border-radius:12px;color:inherit;text-decoration:none;background:var(--card,#111827)}
      .change-business-name-hero{padding:22px;border-radius:20px;background:linear-gradient(135deg,#991b1b,#dc2626 58%,#f87171);color:#fff;box-shadow:0 15px 35px #0002}
      .change-business-name-icon{display:inline-flex;width:48px;height:48px;align-items:center;justify-content:center;border-radius:15px;background:#ffffff24;margin-bottom:12px}
      .change-business-name-hero h1{font-size:clamp(1.35rem,4vw,2rem);line-height:1.15;margin:0 0 8px;font-weight:900}
      .change-business-name-hero p{margin:0;max-width:720px;line-height:1.65;color:#fffdfd}
      .change-business-name-safe{display:flex;align-items:flex-start;gap:9px;margin:14px 0;padding:12px 14px;border:1px solid #16a34a55;border-radius:12px;background:#16a34a12;font-size:.9rem;line-height:1.55}
      .change-business-name-copy{padding:18px;margin:18px 0;border:1px solid var(--border,#334155);border-radius:16px;background:var(--card,#111827)}
      .change-business-name-copy h2{font-size:1.12rem;margin:0 0 6px}.change-business-name-copy p{font-size:.88rem;line-height:1.6;color:var(--muted,#94a3b8);margin:0 0 14px}
      .change-business-name-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .change-business-name-grid label{display:grid;gap:6px;font-size:.83rem;font-weight:700}
      .change-business-name-grid input,.change-business-name-grid textarea{width:100%;min-width:0;padding:11px 12px;border:1px solid var(--border,#64748b);border-radius:10px;background:var(--background,#fff);color:var(--foreground,#111827);font:inherit}
      .change-business-name-grid .wide{grid-column:1/-1}
      .change-business-name-submit{display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:14px;padding:12px 16px;border:0;border-radius:10px;background:#dc2626;color:#fff;font-weight:800;cursor:pointer}
      .change-business-name-submit:disabled{opacity:.6;cursor:wait}
      .change-business-name-result{margin-top:12px;padding:12px;border-radius:10px;font-size:.88rem;line-height:1.5}
      .change-business-name-success{background:#14532d22;border:1px solid #22c55e66}.change-business-name-error{background:#7f1d1d22;border:1px solid #ef444466}
      .change-business-name-form{position:relative;overflow:hidden;min-height:520px;border:1px solid var(--border,#334155);border-radius:16px;background:#fff}
      .change-business-name-frame{display:block;width:100%;height:min(78vh,980px);min-height:620px;border:0;background:#fff}
      .change-business-name-loading{display:flex;align-items:center;justify-content:center;gap:10px;padding:14px;color:#475569;font-size:.9rem}
      .change-business-name-loading svg{animation:change-business-spin 1s linear infinite}
      @keyframes change-business-spin{to{transform:rotate(360deg)}}
      .change-business-name-note{font-size:.82rem;line-height:1.6;color:var(--muted,#94a3b8);margin:12px 2px 0}
      @media(max-width:600px){.change-business-name-page{padding:12px 9px 28px}.change-business-name-hero{padding:17px;border-radius:16px}.change-business-name-frame{height:78vh;min-height:560px}.change-business-name-form{border-radius:12px}.change-business-name-grid{grid-template-columns:1fr}.change-business-name-grid .wide{grid-column:auto}}
    `}</style>
    <div className="change-business-name-top"><Link className="change-business-name-back" href="/"><ArrowLeft size={17}/> Rudi kwenye huduma</Link></div>
    <section className="change-business-name-hero">
      <span className="change-business-name-icon"><Building2 size={25}/></span>
      <h1>CHANGE BUSINESS NAME AIRTEL LIPA</h1>
      <p>Weka nakala ya taarifa zako kwenye SmartServicesTZ ili ionekane kwenye admin, kisha tuma pia fomu rasmi ya Airtel hapa chini. Fomu rasmi inabaki ndani ya ukurasa huu.</p>
    </section>
    <div className="change-business-name-safe"><ShieldCheck size={19}/><span><strong>Hatua mbili zinahitajika:</strong> hifadhi nakala hapa kwanza ili msimamizi wa SmartServicesTZ aone ombi, kisha jaza na utume fomu rasmi ya Airtel iliyo chini. Nakala hii haijitumi yenyewe kwa Airtel.</span></div>
    <section className="change-business-name-copy">
      <h2>1. HIFADHI NAKALA YA OMBI KWENYE SMARTSERVICESTZ</h2>
      <p>Taarifa hizi zitaingia kwenye sehemu ya MAOMBI YA HUDUMA ya admin. Jaza taarifa sahihi kisha bonyeza HIFADHI NAKALA.</p>
      <form onSubmit={saveCopy}>
        <div className="change-business-name-grid">
          <label>Jina lako kamili *<input required value={form.applicantName} onChange={e=>update("applicantName",e.target.value)} autoComplete="name" /></label>
          <label>Namba ya simu ya mawasiliano *<input required inputMode="tel" value={form.contactPhone} onChange={e=>update("contactPhone",e.target.value)} placeholder="07XXXXXXXX" /></label>
          <label>Namba ya Airtel Lipa *<input required value={form.lipaNumber} onChange={e=>update("lipaNumber",e.target.value)} /></label>
          <label>Jina la biashara la zamani *<input required value={form.oldBusinessName} onChange={e=>update("oldBusinessName",e.target.value)} /></label>
          <label className="wide">Jina jipya la biashara *<input required value={form.newBusinessName} onChange={e=>update("newBusinessName",e.target.value)} /></label>
          <label className="wide">Maelezo ya ziada (si lazima)<textarea rows={3} value={form.reason} onChange={e=>update("reason",e.target.value)} /></label>
        </div>
        <button className="change-business-name-submit" type="submit" disabled={saving||saved}>{saving?<LoaderCircle size={17} className="animate-spin"/>:saved?<CheckCircle2 size={17}/>:<Send size={17}/>} {saving?"Inahifadhi…":saved?"Nakala imehifadhiwa":"HIFADHI NAKALA"}</button>
        {saved&&<div className="change-business-name-result change-business-name-success" role="status"><strong>Nakala imehifadhiwa.</strong> Admin sasa anaweza kuiona chini ya MAOMBI YA HUDUMA. Endelea hatua ya 2 hapa chini ili kutuma fomu rasmi ya Airtel.</div>}
        {error&&<div className="change-business-name-result change-business-name-error" role="alert">{error}</div>}
      </form>
    </section>
    <h2 style={{fontSize:"1.12rem",margin:"24px 2px 10px"}}>2. JAZA NA TUMA FOMU RASMI YA AIRTEL</h2>
    <section className="change-business-name-form" aria-label="Fomu rasmi ya kubadili jina la biashara Airtel Lipa">
      {!loaded&&<div className="change-business-name-loading"><LoaderCircle size={18}/> Inafungua fomu rasmi ya Airtel…</div>}
      <iframe className="change-business-name-frame" title="Fomu rasmi ya CHANGE BUSINESS NAME AIRTEL LIPA" src={FORM_URL} onLoad={()=>setLoaded(true)} allow="clipboard-read; clipboard-write" referrerPolicy="strict-origin-when-cross-origin"/>
    </section>
    <p className="change-business-name-note">Fomu hii inamilikiwa na Airtel kupitia Microsoft Forms. SmartServicesTZ haiwezi kusoma majibu yaliyotumwa ndani ya fomu ya Microsoft moja kwa moja; nakala ya admin inahifadhi taarifa ulizoweka kwenye hatua ya 1.</p>
  </main>;
}
