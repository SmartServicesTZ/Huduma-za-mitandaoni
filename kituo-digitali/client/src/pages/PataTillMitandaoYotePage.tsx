import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, FileUp, MessageCircle, ShieldCheck, Smartphone, UploadCloud } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { createServiceApplication, subscribeUserServiceApplications, uploadServiceDocument, type ServiceApplication } from "@/lib/firebase";
import type { ServiceFormValues } from "../../../shared/serviceForms";

type Network = "HALOTEL" | "AIRTEL" | "VODACOM";
type UploadState = { file: File; path: string };
const ADMIN_PHONE = "255692287767";
const networkInfo: Array<{ id: Network; price: number; logo: string; color: string; description: string }> = [
  { id: "HALOTEL", price: 0, logo: "Halotel.png", color: "#e51d2a", description: "Till ya Halopesa / Uwakala" },
  { id: "AIRTEL", price: 5000, logo: "Airtel.png", color: "#e31e2b", description: "Till ya Airtel Money" },
  { id: "VODACOM", price: 40000, logo: "Vodacom.png", color: "#e31e2b", description: "Till ya M-Pesa" },
];
const newId = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "till-" + Date.now() + "-" + Math.random().toString(36).slice(2);

function phoneOk(value: string) { return /^(06|07)\d{8}$/.test(value.replace(/\s+/g, "")); }
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="till-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function dateLabel(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("sw-TZ", { dateStyle: "medium", timeStyle: "short" });
}
export default function PataTillMitandaoYotePage() {
  const { firebaseUser, profile, loading } = useAuth();
  const [network, setNetwork] = useState<Network | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [applications, setApplications] = useState<ServiceApplication[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  useEffect(() => {
    if (!firebaseUser?.uid) { setApplications([]); return; }
    return subscribeUserServiceApplications(firebaseUser.uid, rows => setApplications(rows.filter(row => row.serviceSlug === "pata-till-mitandao-yote" || row.serviceName === "PATA TILL MITANDAO YOTE")));
  }, [firebaseUser?.uid]);
  const set = (key: string, value: string | boolean) => { setValues(old => ({ ...old, [key]: value })); setError(""); };
  const choose = (next: Network) => { setNetwork(next); setValues({}); setUploads({}); setError(""); setReference(""); };
  const upload = async (key: string, file?: File) => {
    if (!file || !firebaseUser) return;
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) { setError("Pakia picha ya JPG/PNG/WEBP au PDF."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Faili lisizidi MB 5."); return; }
    const appId = newId();
    setBusy(true); setError("");
    try {
      const path = await uploadServiceDocument(firebaseUser.uid, appId, key, file, 5, ["image/jpeg", "image/png", "image/webp", "application/pdf"]);
      setUploads(old => ({ ...old, [key]: { file, path } }));
      set("applicationDraftId", appId);
      toast.success("Kiambatisho kimepakiwa.");
    } catch (e: any) { setError(e?.message ?? "Imeshindikana kupakia faili."); }
    finally { setBusy(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setReference("");
    if (loading) return;
    if (!firebaseUser) { setError("Ingia kwenye akaunti yako kwanza ili kutuma ombi."); return; }
    if (!network) { setError("Chagua mtandao kwanza."); return; }
    if (network === "HALOTEL") {
      if (!String(values.fullName ?? "").trim() || !phoneOk(String(values.tillPhone ?? "")) || !phoneOk(String(values.contactPhone ?? "")) || !/^\d{3}-\d{3}-\d{3}$/.test(String(values.tin ?? "")) || !String(values.idType ?? "") || !String(values.idNumber ?? "").trim() || !uploads.idDocument || values.floatConfirmed !== true || values.noLipa !== true) {
        setError("Jaza taarifa zote za lazima, pakia kitambulisho na thibitisha vigezo vya Halotel."); return;
      }
    } else if (network === "AIRTEL") {
      if (!phoneOk(String(values.airtelPhone ?? "")) || !String(values.nidaNumber ?? "").trim() || values.paymentReady !== true) { setError("Weka namba ya Airtel, namba ya NIDA na uthibitishe utayari wa malipo."); return; }
    } else {
      if (!String(values.nidaNumber ?? "").trim() || values.notRegistered !== true || values.hasScanner !== true || values.paymentReady !== true) { setError("Kamilisha vigezo vya Vodacom kabla ya kutuma."); return; }
    }
    setBusy(true);
    try {
      const applicationId = String(values.applicationDraftId ?? newId());
      const payload: ServiceFormValues = {
        ...values,
        network,
        serviceName: "PATA TILL MITANDAO YOTE",
        applicantName: profile?.name ?? firebaseUser.displayName ?? "",
        applicantPhone: profile?.phone ?? "",
        priceTsh: networkInfo.find(n => n.id === network)?.price ?? 0,
        idDocument: uploads.idDocument?.path ?? "",
        attachmentNames: Object.fromEntries(Object.entries(uploads).map(([key, item]) => [key, item.file.name])),
      };
      const result = await createServiceApplication(applicationId, "pata-till-mitandao-yote", payload);
      setReference(String(result.reference ?? result.applicationId ?? applicationId));
      setValues({}); setUploads({});
      toast.success("Ombi limetumwa kwa admin.");
    } catch (e: any) { setError(e?.message ?? "Imeshindikana kutuma ombi. Tafadhali jaribu tena."); }
    finally { setBusy(false); }
  };
  const openOtpWhatsApp = () => {
    const message = "Habari Admin, nimetuma ombi la Till ya Airtel kwenye Huduma za Mtandaoni. Naomba maelekezo ya kupata OTP. Jina: " + (profile?.name ?? "") + ", simu: " + (profile?.phone ?? "") + ".";
    window.open("https://wa.me/" + ADMIN_PHONE + "?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
  };
  return <main className="portal-main till-page">
    <div className="till-wrap">
      <Link href="/services" className="till-back"><ArrowLeft size={17}/> Rudi kwenye huduma</Link>
      <header className="till-hero"><div className="till-hero-icon"><Smartphone size={28}/></div><div><span className="till-kicker">SMARTSERVICESTZ · HUDUMA ZA WAKALA</span><h1>PATA TILL MITANDAO YOTE</h1><p>Chagua mtandao, soma vigezo na tuma ombi lako kwa admin.</p></div></header>
      <div className="till-network-grid">{networkInfo.map(item => <button type="button" key={item.id} onClick={() => choose(item.id)} className={"till-network-card " + (network === item.id ? "selected" : "")} style={{ "--network-color": item.color } as React.CSSProperties}>
        <span className="till-logo-wrap"><img src={import.meta.env.BASE_URL + item.logo} alt={item.id + " logo"}/></span><strong>{item.id}</strong><span>{item.description}</span><b>{item.price === 0 ? "BURE KABISA" : "TSh " + item.price.toLocaleString("en-US")}</b><small>{network === item.id ? "✓ Umechagua" : "Chagua huduma"}</small>
      </button>)}</div>
      {!network ? <div className="till-empty"><ShieldCheck size={30}/><h2>Chagua mtandao kuendelea</h2><p>Gusa kadi ya Halotel, Airtel au Vodacom ili kuona vigezo na fomu yake.</p></div> : <section className="till-form-card">
        <div className="till-form-head"><div><span className="till-kicker">FOMU YA MAOMBI</span><h2>Tuma Maombi ya Till — {network}</h2></div><span className="till-price">{networkInfo.find(n => n.id === network)?.price === 0 ? "BURE" : "TSh " + networkInfo.find(n => n.id === network)?.price.toLocaleString("en-US")}</span></div>
        {!firebaseUser && <div className="till-notice warning">Ingia au jisajili kwanza kabla ya kutuma maombi.</div>}
        {network === "HALOTEL" && <>
          <div className="till-notice warning"><strong>⚠ Tahadhari (Till/Uwakala):</strong> Bila kuwa na float ya Tsh 100,000 kwenye laini ya mteja, maombi yanaweza kukataliwa (REJECTED).</div>
          <p className="till-intro">Jaza taarifa zote muhimu. Laini ya Halotel iwe na salio/float ya Tsh 100,000 na mteja asiwe na Lipa Namba.</p>
        </>}
        {network === "AIRTEL" && <div className="till-notice info">Huduma hii inahitaji malipo ya TSh 5,000 na uthibitisho wa OTP kupitia admin. Baada ya kutuma ombi, gusa kitufe cha WhatsApp ili kuwasiliana na admin kuhusu OTP.</div>}
        {network === "VODACOM" && <div className="till-notice info">Huduma hii inahitaji malipo ya TSh 40,000. Usisajili laini kwanza; baada ya uhakiki na malipo utapewa user ya kuwasha Till.</div>}
        <form onSubmit={submit} className="till-form">
          {network === "HALOTEL" && <>
            <Field label="Majina kamili ya mteja *"><input required value={String(values.fullName ?? "")} onChange={e => set("fullName", e.target.value)} placeholder="Majina yote ya mteja"/></Field>
            <Field label="Namba ya simu ya Till *" hint="Lazima ianze na 06 au 07; tarakimu 10 tu."><input required inputMode="numeric" maxLength={10} value={String(values.tillPhone ?? "")} onChange={e => set("tillPhone", e.target.value.replace(/\D/g, "").slice(0,10))} placeholder="07XXXXXXXX"/></Field>
            <Field label="Namba ya simu ya mawasiliano *" hint="Lazima ianze na 06 au 07."><input required inputMode="numeric" maxLength={10} value={String(values.contactPhone ?? "")} onChange={e => set("contactPhone", e.target.value.replace(/\D/g, "").slice(0,10))} placeholder="06XXXXXXXX au 07XXXXXXXX"/></Field>
            <Field label="Namba ya TIN *" hint="Muundo: 123-456-789"><input required value={String(values.tin ?? "")} onChange={e => { const v=e.target.value.replace(/\D/g,"").slice(0,9); set("tin",v.match(/.{1,3}/g)?.join("-") ?? ""); }} placeholder="180-145-245"/></Field>
            <Field label="Aina ya kitambulisho *"><select required value={String(values.idType ?? "")} onChange={e => set("idType", e.target.value)}><option value="">Chagua kitambulisho</option><option>NIDA</option><option>KITAMBULISHO CHA MPIGA KURA</option><option>LESENI YA UDEREVA</option></select></Field>
            <Field label="Namba ya kitambulisho *"><input required value={String(values.idNumber ?? "")} onChange={e => set("idNumber", e.target.value)} placeholder="Mfano: 20000909-59418-00001-22"/></Field>
            <Field label="Namba ya NIDA (ikiwa huna kitambulisho cha taifa)" ><input value={String(values.nidaNumber ?? "")} onChange={e => set("nidaNumber", e.target.value)} placeholder="Namba ya NIDA"/></Field>
            <Field label="Jina la biashara (hiari)" hint="Kwa wateja walio na vigezo vya kutosha tu."><input value={String(values.businessName ?? "")} onChange={e => set("businessName", e.target.value)} placeholder="Jina la biashara"/></Field>
            <Field label="Pakia picha ya kitambulisho *" hint="JPG, PNG, WEBP au PDF; kiwango cha juu MB 5."><input required type="file" accept="image/*,application/pdf" onChange={e => void upload("idDocument", e.target.files?.[0])}/>{uploads.idDocument && <small>✓ {uploads.idDocument.file.name}</small>}</Field>
            <div className="till-notice warning">Msisitizo kuhusu Jina la Biashara: sehemu hii si lazima na ni kwa wateja wenye vigezo vya kutosha tu. Bila vigezo vya kutosha ombi linaweza kukataliwa. Wasiliana na wakala mkuu kwa maelezo zaidi.</div>
            <label className="till-check"><input type="checkbox" checked={values.floatConfirmed === true} onChange={e => set("floatConfirmed", e.target.checked)}/> Thibitisha: mteja ameweka float ya TSh 100,000 kwenye laini yake.</label>
            <label className="till-check"><input type="checkbox" checked={values.noLipa === true} onChange={e => set("noLipa", e.target.checked)}/> Nimethibitisha kuwa mteja hana Lipa Namba.</label>
          </>}
          {network === "AIRTEL" && <>
            <Field label="Namba ya Airtel *" hint="Lazima ianze na 06 au 07; tarakimu 10."><input required inputMode="numeric" maxLength={10} value={String(values.airtelPhone ?? "")} onChange={e => set("airtelPhone", e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="07XXXXXXXX"/></Field>
            <Field label="Namba ya NIDA *"><input required value={String(values.nidaNumber ?? "")} onChange={e => set("nidaNumber", e.target.value)} placeholder="Weka namba ya NIDA"/></Field>
            <label className="till-check"><input type="checkbox" checked={values.paymentReady === true} onChange={e => set("paymentReady", e.target.checked)}/> Niko tayari kufanya malipo ya TSh 5,000 kwanza.</label>
            <button type="button" className="till-otp" onClick={openOtpWhatsApp}><MessageCircle size={18}/> Wasiliana na Admin kwa OTP</button>
          </>}
          {network === "VODACOM" && <>
            <Field label="Namba ya mawasiliano *"><input required inputMode="tel" value={String(values.contactPhone ?? profile?.phone ?? "")} onChange={e => set("contactPhone", e.target.value)} placeholder="Namba ya simu"/></Field>
            <Field label="Namba ya NIDA *"><input required value={String(values.nidaNumber ?? "")} onChange={e => set("nidaNumber", e.target.value)} placeholder="Weka namba ya NIDA"/></Field>
            <label className="till-check"><input type="checkbox" checked={values.notRegistered === true} onChange={e => set("notRegistered", e.target.checked)}/> Nimethibitisha kutosajili laini kwanza.</label>
            <label className="till-check"><input type="checkbox" checked={values.hasScanner === true} onChange={e => set("hasScanner", e.target.checked)}/> Nina scanner au Famoco yenye scanner.</label>
            <label className="till-check"><input type="checkbox" checked={values.paymentReady === true} onChange={e => set("paymentReady", e.target.checked)}/> Niko tayari kulipa TSh 40,000 kabla ya kupewa user ya kuwasha Till.</label>
            <Field label="Maelezo ya ziada (hiari)"><textarea rows={3} value={String(values.extraDetails ?? "")} onChange={e => set("extraDetails", e.target.value)} placeholder="Admin atakamilisha taarifa nyingine."/></Field>
          </>}
          <Field label="Viambatisho vya ziada (hiari)"><input type="file" accept="image/*,application/pdf" onChange={e => void upload("extraAttachment", e.target.files?.[0])}/>{uploads.extraAttachment && <small>✓ {uploads.extraAttachment.file.name}</small>}</Field>
          {error && <div className="till-notice error" role="alert">{error}</div>}
          {reference && <div className="till-notice success"><CheckCircle2 size={18}/> Ombi limetumwa! Namba ya rejea: <strong>{reference}</strong>. Unaweza kulifuatilia kwenye “Maombi Yangu”.</div>}
          <div className="till-actions"><button type="submit" disabled={busy || !firebaseUser} className="till-submit">{busy ? "Inatuma ombi..." : "Thibitisha & Tuma Maombi"}</button><Link href="/" className="till-cancel">Rudi Dashboard</Link></div>
        </form>
        {network === "AIRTEL" && <p className="till-muted">Baada ya kutuma ombi, tumia kitufe cha “Wasiliana na Admin kwa OTP” ikiwa unahitaji OTP.</p>}
      </section>}
      <section className="till-history"><div className="till-form-head"><div><span className="till-kicker">HISTORIA</span><h2>Maombi Yangu</h2></div><Clock3 size={22}/></div>
        {applications.length === 0 ? <p className="till-muted">Bado hujatuma maombi ya Till kupitia kipengele hiki.</p> : <div className="till-table-wrap"><table><thead><tr><th>Mteja / Mtandao</th><th>Aina</th><th>Namba ya Till / Lipa</th><th>Status</th><th>Commission</th><th>Tarehe</th><th>Mkataba</th></tr></thead><tbody>{applications.map(app => { const data = (app.applicantData ?? {}) as Record<string, unknown>; const status = String(app.status ?? "PENDING").toUpperCase(); return <tr key={app.id}><td>{String(data.fullName ?? data.applicantName ?? profile?.name ?? "—")}<small>{String(data.network ?? app.serviceName ?? "")}</small></td><td>Till / Uwakala</td><td>{String(data.tillPhone ?? data.airtelPhone ?? data.contactPhone ?? "—")}</td><td><span className={"till-status " + status.toLowerCase()}>{status}</span></td><td>{String(app.commission ?? "—")}</td><td>{dateLabel(app.submittedAt)}</td><td>{status === "APPROVED" ? "Admin Only" : "—"}</td></tr>; })}</tbody></table></div>}
      </section>
      <p className="till-security"><ShieldCheck size={16}/> Taarifa zako hutumwa kwa mfumo wa maombi wa SmartServicesTZ na zinaonekana kwa admin kwa ajili ya uhakiki.</p>
    </div>
    <style>{`
      .till-page{padding:22px 14px 100px!important}.till-wrap{max-width:1120px;margin:0 auto;color:var(--text-primary,#10233f)}.till-back{display:inline-flex;align-items:center;gap:7px;color:inherit;text-decoration:none;font-weight:700;font-size:13px;margin:4px 0 18px}.till-hero{display:flex;align-items:center;gap:16px;padding:24px;border-radius:22px;background:linear-gradient(125deg,#071a36,#12345e);color:#fff;box-shadow:0 12px 32px #071a361c}.till-hero-icon{width:58px;height:58px;display:grid;place-items:center;border-radius:18px;background:#ffffff18;flex-shrink:0}.till-kicker{display:block;font-size:10px;letter-spacing:1.4px;font-weight:900;opacity:.75}.till-hero h1{font-size:clamp(22px,4vw,32px);margin:5px 0 6px;line-height:1.15}.till-hero p{font-size:14px;opacity:.82}.till-network-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:20px 0}.till-network-card{background:var(--card,#fff);color:inherit;border:2px solid var(--border,#e5eaf1);border-radius:18px;padding:18px 14px;display:flex;align-items:center;gap:7px;flex-direction:column;cursor:pointer;text-align:center;transition:.18s;box-shadow:0 8px 22px #10233f08}.till-network-card.selected{border-color:var(--network-color);box-shadow:0 0 0 3px color-mix(in srgb,var(--network-color) 12%,transparent)}.till-logo-wrap{height:54px;width:100%;display:grid;place-items:center}.till-logo-wrap img{max-width:130px;max-height:48px;object-fit:contain}.till-network-card strong{font-size:15px}.till-network-card>span:not(.till-logo-wrap){font-size:12px;opacity:.75}.till-network-card>b{font-size:14px;color:var(--network-color)}.till-network-card small{font-size:11px;opacity:.75}.till-empty,.till-form-card,.till-history{background:var(--card,#fff);border:1px solid var(--border,#e5eaf1);border-radius:20px;padding:22px;margin:18px 0;box-shadow:0 8px 28px #10233f08}.till-empty{text-align:center;padding:35px}.till-empty h2{margin:10px 0 6px}.till-empty p,.till-muted{font-size:13px;opacity:.72;line-height:1.6}.till-form-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.till-form-head h2{font-size:21px;margin-top:5px}.till-price{padding:8px 12px;border-radius:12px;background:#e8f8ef;color:#087943;font-size:13px;font-weight:900;white-space:nowrap}.till-intro{font-size:13px;line-height:1.6;margin:12px 0}.till-notice{display:flex;align-items:flex-start;gap:8px;padding:13px 14px;border-radius:12px;font-size:13px;line-height:1.55;margin:12px 0}.till-notice.warning{background:#fff5d6;border:1px solid #f1d27a;color:#744a00}.till-notice.info{background:#eaf4ff;border:1px solid #b9d9ff;color:#123b66}.till-notice.error{background:#fff0f0;border:1px solid #fecaca;color:#9f1239}.till-notice.success{background:#e9fff1;border:1px solid #a7f3c0;color:#065f46}.till-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.till-field{display:flex;flex-direction:column;gap:7px;font-size:13px;font-weight:750;min-width:0}.till-field input,.till-field select,.till-field textarea{width:100%;min-width:0;border:1px solid var(--border,#dbe3ed);border-radius:11px;padding:12px 13px;background:var(--input,#fff);color:inherit;font:inherit;font-weight:500;outline:none}.till-field input:focus,.till-field select:focus,.till-field textarea:focus{border-color:#3b82f6;box-shadow:0 0 0 3px #3b82f61a}.till-field small{font-size:11px;font-weight:500;opacity:.7}.till-check{grid-column:1/-1;display:flex;gap:10px;align-items:flex-start;padding:12px;background:var(--muted,#f6f8fb);border-radius:11px;font-size:13px;line-height:1.5}.till-check input{margin-top:3px;accent-color:#16834a}.till-notice,.till-intro,.till-otp,.till-muted,.till-actions{grid-column:1/-1}.till-otp{display:flex;align-items:center;justify-content:center;gap:9px;padding:13px;border:0;border-radius:12px;background:#0b8f51;color:white;font-weight:850;cursor:pointer}.till-actions{display:flex;gap:10px;margin-top:6px}.till-submit,.till-cancel{min-height:46px;padding:12px 18px;border-radius:12px;font-weight:850;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center}.till-submit{flex:1;border:0;background:linear-gradient(120deg,#087b49,#19b96a);color:#fff;cursor:pointer}.till-submit:disabled{opacity:.55;cursor:not-allowed}.till-cancel{border:1px solid var(--border,#dbe3ed);color:inherit}.till-table-wrap{overflow-x:auto}.till-table-wrap table{width:100%;border-collapse:collapse;font-size:12px;min-width:760px}.till-table-wrap th,.till-table-wrap td{text-align:left;padding:12px;border-bottom:1px solid var(--border,#e5eaf1);vertical-align:top}.till-table-wrap th{font-size:11px;text-transform:uppercase;opacity:.7}.till-table-wrap td small{display:block;opacity:.65;margin-top:4px}.till-status{display:inline-block;border-radius:99px;padding:5px 8px;font-size:10px;font-weight:900;background:#e8eef7;color:#334155}.till-status.approved{background:#dcfce7;color:#166534}.till-status.rejected{background:#fee2e2;color:#991b1b}.till-status.processing{background:#dbeafe;color:#1d4ed8}.till-security{display:flex;align-items:center;gap:8px;justify-content:center;text-align:center;font-size:11px;opacity:.65;margin:18px auto;max-width:700px}.till-page input[type=file]{font-size:12px;padding:9px}.till-page .portal-main{max-width:100%}@media(max-width:700px){.till-network-grid{grid-template-columns:1fr;gap:10px}.till-network-card{display:grid;grid-template-columns:82px 1fr auto;grid-template-rows:auto auto;text-align:left;gap:3px 12px;padding:13px}.till-logo-wrap{grid-row:1/3;height:45px}.till-logo-wrap img{max-width:78px;max-height:38px}.till-network-card strong{align-self:end}.till-network-card>span:not(.till-logo-wrap){grid-column:2;grid-row:2}.till-network-card>b{grid-column:3;grid-row:1/3;align-self:center;font-size:12px}.till-network-card small{display:none}.till-form-card,.till-history{padding:15px}.till-form{grid-template-columns:1fr}.till-hero{padding:18px}.till-hero-icon{width:46px;height:46px}.till-actions{flex-direction:column}.till-cancel{min-height:42px}}
    `}</style>
  </main>;
}
