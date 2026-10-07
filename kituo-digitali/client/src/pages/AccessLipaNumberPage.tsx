import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronRight, ExternalLink, FileImage, Info, Send, ShieldCheck, Sparkles, Upload, WalletCards } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { createServiceApplication, removeServiceUpload, uploadServiceDocument } from "@/lib/firebase";
import { formatNida } from "../../../shared/serviceForms";

type NetworkId = "airtel" | "yas" | "vodacom" | "halotel";
type Network = { id: NetworkId; name: string; logo: string; accent: string; available: boolean };

const NETWORKS: Network[] = [
  { id: "airtel", name: "Airtel", logo: "/airtel-logo.png", accent: "#e21b2d", available: true },
  { id: "yas", name: "Yas", logo: "/yas-logo.png", accent: "#123e87", available: true },
  { id: "vodacom", name: "Vodacom", logo: "/vodacom-logo.png", accent: "#e60012", available: true },
  { id: "halotel", name: "Halotel", logo: "/halotel-logo.png", accent: "#f36f21", available: false },
];

const COMPANY_POINTS = [
  "Malipo kwa wakati",
  "Report kwa wakati",
  "Unapata vitendea kazi hata kama ukiwa mbali mradi uwe umefanya kazi tu — T-shirt, blandi, laini, sticker, ndoo za Lipa na vingine vingi",
  "Tunafanya field support kwa waliopo maeneo ya Dar es Salaam",
  "Na fursa nyingine nyingi kulingana na utendaji na mahitaji ya eneo",
];

const WHATSAPP_URL = "https://wa.me/255698232313?text=Habari%20Mbeya%20One%2C%20nahitaji%20mawasiliano%20kuhusu%20ACCESS%20LIPA%20NAMBA.";

function newApplicationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `access-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Field({ label, value, onChange, type = "text", placeholder, inputMode }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return <label className="access-field"><span>{label}<b>*</b></span><input required type={type} inputMode={inputMode} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NetworkLogo({ network }: { network: Network }) {
  return <span className="access-network-logo" style={{ borderColor: network.accent }}><img src={network.logo} alt={network.name} /></span>;
}

export default function AccessLipaNumberPage() {
  const { firebaseUser } = useAuth();
  const [selected, setSelected] = useState<NetworkId>("airtel");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [contact, setContact] = useState("");
  const [nida, setNida] = useState("");
  const [email, setEmail] = useState("");
  const [passportPath, setPassportPath] = useState("");
  const [passportName, setPassportName] = useState("");
  const [passportPreview, setPassportPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState("");
  const [applicationId, setApplicationId] = useState(newApplicationId);
  const network = useMemo(() => NETWORKS.find((item) => item.id === selected) ?? NETWORKS[0], [selected]);

  const resetForm = async (nextNetwork?: NetworkId) => {
    if (passportPath.startsWith("serviceUploads/")) await removeServiceUpload(passportPath).catch(() => undefined);
    if (passportPreview) URL.revokeObjectURL(passportPreview);
    setPhone(""); setFullName(""); setContact(""); setNida(""); setEmail("");
    setPassportPath(""); setPassportName(""); setPassportPreview(""); setSubmittedRef(""); setApplicationId(newApplicationId());
    if (nextNetwork) setSelected(nextNetwork);
  };

  const chooseNetwork = async (id: NetworkId) => {
    if (id === selected) return;
    const next = NETWORKS.find((item) => item.id === id);
    if (!next?.available) { toast.info("Huduma ya access Halotel itaongezwa hivi karibuni."); return; }
    await resetForm(id);
  };

  const uploadPassport = async (file?: File) => {
    if (!file || !firebaseUser?.uid) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast.error("Picha ya passport size iwe JPG, PNG au WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Picha isizidi MB 5."); return; }
    setUploading(true);
    try {
      const path = await uploadServiceDocument(firebaseUser.uid, applicationId, "passportPhoto", file, 5, ["image/jpeg", "image/png", "image/webp"]);
      if (passportPath.startsWith("serviceUploads/")) await removeServiceUpload(passportPath).catch(() => undefined);
      if (passportPreview) URL.revokeObjectURL(passportPreview);
      setPassportPath(path); setPassportName(file.name); setPassportPreview(URL.createObjectURL(file)); toast.success("Picha imepakiwa.");
    } catch (error: any) { toast.error(error?.message ?? "Imeshindikana kupakia picha."); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (!firebaseUser?.uid) { toast.error("Ingia kwanza ili kutuma ombi."); return; }
    if (!phone.trim()) { toast.error("Namba ya simu inahitajika."); return; }
    if (selected === "airtel" && (!fullName.trim() || !contact.trim())) { toast.error("Jaza majina na namba ya mawasiliano."); return; }
    if (selected === "yas" && (!nida.trim() || !passportPath || !contact.trim())) { toast.error("Jaza NIDA, picha ya passport size na namba ya mawasiliano."); return; }
    if (selected === "vodacom" && (!fullName.trim() || !email.trim() || !contact.trim())) { toast.error("Jaza majina, email na namba ya mawasiliano."); return; }
    if (selected === "yas" && !/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(nida)) { toast.error("Namba ya NIDA haijakamilika."); return; }
    setSubmitting(true);
    try {
      const serviceSlug = selected === "airtel" ? "access-lipa-airtel" : selected === "yas" ? "access-lipa-yas" : "access-lipa-vodacom";
      const values: Record<string, string | number | null> = selected === "airtel"
        ? { network: "Airtel", phone: phone.trim(), fullName: fullName.trim(), contact: contact.trim(), nidaNumber: null, passportPhoto: null, email: null }
        : selected === "yas"
          ? { network: "Yas", phone: phone.trim(), nidaNumber: nida.trim(), passportPhoto: passportPath, contact: contact.trim(), fullName: null, email: null }
          : { network: "Vodacom", phone: phone.trim(), fullName: fullName.trim(), email: email.trim(), contact: contact.trim(), nidaNumber: null, passportPhoto: null };
      const result = await createServiceApplication(applicationId, serviceSlug, values);
      setSubmittedRef(String(result.reference ?? result.applicationId ?? applicationId));
      toast.success("Ombi limetumwa kwa admin.");
      if (passportPath.startsWith("serviceUploads/")) await removeServiceUpload(passportPath).catch(() => undefined);
      setPassportPath(""); setPassportName("");
      if (passportPreview) URL.revokeObjectURL(passportPreview);
      setPassportPreview("");
    } catch (error: any) { toast.error(error?.message ?? "Imeshindikana kutuma ombi."); }
    finally { setSubmitting(false); }
  };

  const FieldBlock = (children: React.ReactNode) => <div className="access-form-grid">{children}</div>;

  return <main className="access-page"><style>{`
    .access-page{min-height:100vh;padding:20px 16px 70px;background:radial-gradient(circle at 8% 0%,#e7f4ff 0,transparent 27%),radial-gradient(circle at 94% 8%,#eee8ff 0,transparent 25%),#f7fafc;color:#142033}
    .access-shell{width:min(1120px,100%);margin:auto}.access-top{display:flex;justify-content:space-between;gap:12px;margin-bottom:16px}.access-back,.access-secure{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800}.access-back{color:#5d6c80}.access-secure{color:#168653}
    .access-hero{position:relative;overflow:hidden;padding:30px;border-radius:24px;color:#fff;background:linear-gradient(135deg,#0c1832,#263f7b 53%,#6547d9);box-shadow:0 24px 60px #182b5230}.access-eyebrow{display:inline-flex;align-items:center;gap:6px;color:#77efaa;font-size:10px;font-weight:900;letter-spacing:.13em}.access-hero h1{margin:9px 0;font-size:clamp(26px,4vw,44px);line-height:1.03;letter-spacing:-.055em}.access-hero p{max-width:760px;margin:0;color:#d2def0;font-size:13px;line-height:1.65}
    .access-network-panel,.access-card{border:1px solid #e1e7ee;border-radius:20px;background:#fff;box-shadow:0 16px 38px #17233b10}.access-network-panel{margin-top:16px;padding:20px}.access-section-title{margin:0 0 13px;font-size:17px}.access-network-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}.access-network-card{position:relative;display:flex;align-items:center;gap:11px;min-height:75px;padding:12px;border:1px solid #dce4ec;border-radius:15px;background:#fff;color:#182437;text-align:left;cursor:pointer}.access-network-card.is-selected{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}.access-network-card:disabled{cursor:not-allowed;opacity:.62}.access-network-logo{display:grid;place-items:center;width:47px;height:47px;flex:0 0 auto;border:2px solid;border-radius:12px;background:#fff;overflow:hidden}.access-network-logo img{max-width:84%;max-height:84%;object-fit:contain}.access-network-copy{min-width:0;display:grid;gap:4px}.access-network-copy strong{font-size:13px}.access-network-copy small{color:#718096;font-size:9px}.access-network-check{position:absolute;right:9px;top:9px;display:grid;place-items:center;width:19px;height:19px;border-radius:50%;color:#fff;background:var(--accent)}
    .access-layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px;margin-top:16px}.access-card{padding:22px}.access-card h2{margin:0;color:#172033;font-size:20px;letter-spacing:-.04em}.access-card h3{margin:21px 0 10px;font-size:14px}.access-card p,.access-card li{color:#66758a;font-size:11px;line-height:1.65}.access-card ul{margin:7px 0;padding-left:18px}.access-card li+li{margin-top:6px}
    .access-brand{display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:17px;border:1px solid #e3e8ee;border-radius:13px;background:#f9fbfd}.access-brand img{width:62px;height:45px;object-fit:contain}.access-brand strong,.access-brand span{display:block}.access-brand strong{font-size:12px}.access-brand span{margin-top:4px;color:#718096;font-size:10px}
    .access-payment-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:10px}.access-payment{padding:12px;border-radius:12px;background:#f4f8fb;border:1px solid #e4ebf0}.access-payment strong,.access-payment span{display:block}.access-payment strong{color:#182437;font-size:12px}.access-payment span{margin-top:4px;color:#68788c;font-size:10px}
    .access-rule{display:flex;gap:9px;padding:10px 0;border-bottom:1px solid #eef2f5;color:#66758a;font-size:11px;line-height:1.55}.access-rule-num{display:grid;place-items:center;width:22px;height:22px;flex:0 0 auto;border-radius:7px;color:#fff;background:var(--accent);font-size:10px;font-weight:900}
    .access-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:17px}.access-field{display:grid;gap:7px;color:#314155;font-size:11px;font-weight:800}.access-field b{color:#df2438;margin-left:2px}.access-field input{width:100%;box-sizing:border-box;padding:12px 13px;border:1px solid #d7e0e8;border-radius:10px;outline:0;background:#fbfdff;color:#162236;font-size:12px}
    .access-upload{grid-column:1/-1;padding:13px;border:1px dashed #b9c8d5;border-radius:12px;background:#f8fbfd}.access-upload-row{display:flex;align-items:center;gap:11px}.access-upload-preview{width:58px;height:58px;border-radius:9px;object-fit:cover;background:#eaf0f4}.access-upload-meta{flex:1;min-width:0}.access-upload-meta strong,.access-upload-meta small{display:block}.access-upload-meta strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.access-upload-meta small{margin-top:4px;color:#718096;font-size:9px}.access-upload-button{display:inline-flex;align-items:center;gap:6px;padding:9px 11px;border-radius:9px;color:#fff;background:#172e61;font-size:10px;font-weight:900;cursor:pointer}.access-upload-button input{display:none}
    .access-submit{display:flex;justify-content:flex-end;margin-top:18px}.access-submit button,.access-whatsapp{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:11px;color:#fff;font-size:11px;font-weight:900;text-decoration:none}.access-submit button{min-height:45px;padding:11px 17px;background:linear-gradient(135deg,#6d4aff,#3d79ff);cursor:pointer}.access-submit button:disabled{opacity:.55;cursor:not-allowed}.access-success,.access-notice{margin-top:14px;padding:13px;border-radius:11px;font-size:10px;line-height:1.5}.access-success{border:1px solid #a7dfc2;color:#12633d;background:#effbf4}.access-notice{display:flex;align-items:flex-start;gap:8px;color:#5c4a24;background:#fff8e7;border:1px solid #f0dfaa}
    .access-side{display:grid;gap:15px}.access-highlight{padding:15px;border-radius:14px;color:#fff;background:linear-gradient(135deg,#0d315d,#165a91)}.access-highlight strong,.access-highlight span{display:block}.access-highlight strong{font-size:16px}.access-highlight span{margin-top:4px;color:#c9dfef;font-size:10px;line-height:1.5}.access-side .access-card{padding:18px}.access-whatsapp{margin-top:12px;padding:10px 12px;background:#168653}
    @media(max-width:900px){.access-layout{grid-template-columns:1fr}.access-side{grid-template-columns:repeat(2,minmax(0,1fr)}}@media(max-width:650px){.access-page{padding:12px 10px 50px}.access-hero{padding:23px 19px}.access-network-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.access-form-grid,.access-payment-grid,.access-side{grid-template-columns:1fr}.access-card{padding:18px}.access-submit{display:block}.access-submit button{width:100%;justify-content:center}.access-upload-row{align-items:flex-start;flex-wrap:wrap}}
  `}</style>
  <div className="access-shell">
    <div className="access-top"><Link href="/" className="access-back"><ArrowLeft size={16}/> Rudi kwenye huduma</Link><span className="access-secure"><ShieldCheck size={14}/> Ombi salama kwa admin</span></div>
    <header className="access-hero"><span className="access-eyebrow"><Sparkles size={13}/> HUDUMA MPYA • ACCESS LIPA NAMBA</span><h1>MAOMBI YA ACCESS LIPA NAMBA</h1><p>Chagua mtandao unaohitaji, soma masharti yake, kisha tuma taarifa zako. Ombi lako litaingia moja kwa moja kwenye mfumo wa admin kwa ajili ya kukaguliwa na kufanyiwa kazi.</p></header>
    <section className="access-network-panel"><h2 className="access-section-title">Chagua mtandao</h2><div className="access-network-grid">{NETWORKS.map((item) => <button key={item.id} type="button" disabled={!item.available} className={`access-network-card ${selected === item.id ? "is-selected" : ""}`} style={{ "--accent": item.accent } as React.CSSProperties} onClick={() => void chooseNetwork(item.id)}><NetworkLogo network={item}/><span className="access-network-copy"><strong>{item.name}</strong><small>{item.available ? "Fungua taarifa na fomu" : "Taarifa zinakuja hivi karibuni"}</small></span>{selected === item.id && <span className="access-network-check"><Check size={12}/></span>}</button>)}</div></section>
    <div className="access-layout">
      <section className="access-card">
        <div className="access-brand"><img src="/mbeya-one.png" alt="Mbeya One Company Limited"/><div><strong>KAMPUNI / AGENCY</strong><span>Mbeya One Company Limited</span></div></div>
        {selected === "airtel" && <><h2>Karibu ujipatie huduma ya access ya kutengeneza Lipa Namba Airtel</h2><h3>Muhtasari wa malipo</h3><div className="access-payment-grid"><div className="access-payment"><strong>Lipa 15 · TZS 37,500</strong><span>Kila week</span></div><div className="access-payment"><strong>Lipa 20 · TZS 50,000</strong><span>Kila week</span></div><div className="access-payment"><strong>Lipa 60 · TZS 100,000</strong><span>Kwa mwezi</span></div></div><h3>Vigezo vya kila Lipa ili uweze kulipwa</h3>{["Lipa Namba ifanye miamala 2 au zaidi — mfano leo TZS 9,500 na kesho TZS 500.","Miamala hiyo itoke namba mbili tofauti — mfano leo kwa mteja mmoja, kesho kwa Adija.","Miamala hiyo ifanyike siku tofauti — mfano Ijumaa mmoja na Jumapili mmoja.","Jumla ya miamala isiwe chini ya TZS 10,000 — mfano 10,000, 11,000, 20,000, 25,000 na kuendelea."].map((item,index)=><div className="access-rule" key={item}><span className="access-rule-num" style={{"--accent":network.accent} as React.CSSProperties}>{index+1}</span><span>{item}</span></div>)}<div className="access-notice"><Info size={15}/> Malipo hufanyika kuanzia Jumatatu hadi Jumatano; malipo yanakuwa tayari ndani ya kipindi hicho.</div><h3>KUPATA ACCESS — TUMA TAARIFA HIZI</h3>{FieldBlock(<><Field label="Namba ya simu" value={phone} onChange={setPhone} type="tel" placeholder="07XXXXXXXX" inputMode="tel"/><Field label="Majina 2 au 3 kama yalivyo kwenye NIDA" value={fullName} onChange={setFullName} placeholder="Jina kamili"/><Field label="Namba ya mawasiliano Normal / WhatsApp" value={contact} onChange={setContact} type="tel" placeholder="07XXXXXXXX" inputMode="tel"/></>)}<p className="access-notice"><Info size={15}/> Access ni ya siku 1 tu unapata.</p></>}
        {selected === "yas" && <><h2>Karibu ujipatie huduma ya access ya kutengeneza Lipa Namba Yas</h2><h3>MALIPO</h3><div className="access-payment-grid"><div className="access-payment"><strong>Machinga · TZS 10,000</strong><span>Malipo ya huduma</span></div><div className="access-payment"><strong>Individual · TZS 20,000</strong><span>Malipo ya huduma</span></div><div className="access-payment"><strong>Company · TZS 20,000</strong><span>Malipo ya huduma</span></div></div><h3>Vigezo vya Lipa kukulipa</h3>{["Hakikisha unasajili Lipa ya MIX kwa mteja husika.","Hakikisha Lipa unayomsajilia mteja inafanya miamala 4 itoke MIX by Yas tu.","Hakikisha Lipa yako inafanya miamala 4 yenye thamani ya TZS 100,000 kutoka MIX by Yas.","Hakikisha miamala hiyo inatoka MIX by Yas, sio mitandao mingine."].map((item,index)=><div className="access-rule" key={item}><span className="access-rule-num" style={{"--accent":network.accent} as React.CSSProperties}>{index+1}</span><span>{item}</span></div>)}<h3>TUMA TAARIFA HIZI KUPATA ACCESS</h3>{FieldBlock(<><Field label="Namba ya simu" value={phone} onChange={setPhone} type="tel" placeholder="07XXXXXXXX" inputMode="tel"/><Field label="Namba ya NIDA (isiwe na code yoyote ya YAS)" value={nida} onChange={(value)=>setNida(formatNida(value))} placeholder="20068517-27520-00001-22" inputMode="numeric"/><div className="access-upload"><div className="access-upload-row">{passportPreview?<img className="access-upload-preview" src={passportPreview} alt="Passport size preview"/>:<span className="access-upload-preview" style={{display:"grid",placeItems:"center"}}><FileImage size={21}/></span>}<div className="access-upload-meta"><strong>{passportName||"Picha yako ya passport size"}</strong><small>JPG, PNG au WebP · hadi MB 5</small></div><label className="access-upload-button"><Upload size={14}/> {uploading?"Inapakia...":passportName?"Badilisha":"Chagua picha"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading||submitting} onChange={(event)=>void uploadPassport(event.target.files?.[0])}/></label></div></div><Field label="Namba ya mawasiliano Normal / WhatsApp" value={contact} onChange={setContact} type="tel" placeholder="07XXXXXXXX" inputMode="tel"/></>)}<p className="access-notice"><Info size={15}/> Hakikisha NIDA haina code yoyote ya YAS kabla ya kutuma.</p></>}
        {selected === "vodacom" && <><h2>Karibu ujipatie huduma ya access ya kutengeneza Lipa Namba Vodacom</h2><h3>Malipo</h3><div className="access-payment-grid" style={{gridTemplateColumns:"1fr"}}><div className="access-payment"><strong>LIPA 1 · TZS 10,000</strong><span>Hulipwa mwisho wa mwezi</span></div></div><h3>Vigezo</h3>{["Lipa ifanye miamala 3 kutoka Vodacom.","Miamala hiyo ifanyike siku tofauti.","Jumla ya miamala iwe TZS 30,000."].map((item,index)=><div className="access-rule" key={item}><span className="access-rule-num" style={{"--accent":network.accent} as React.CSSProperties}>{index+1}</span><span>{item}</span></div>)}<h3>TUMA TAARIFA HIZI KUPATA ACCESS</h3>{FieldBlock(<><Field label="Namba ya simu" value={phone} onChange={setPhone} type="tel" placeholder="07XXXXXXXX" inputMode="tel"/><Field label="Majina 3" value={fullName} onChange={setFullName} placeholder="Majina kamili"/><Field label="Email" value={email} onChange={setEmail} type="email" placeholder="example@email.com" inputMode="email"/><Field label="Namba ya mawasiliano" value={contact} onChange={setContact} type="tel" placeholder="07XXXXXXXX" inputMode="tel"/></>)}</>}
        {!network.available && <div className="access-notice"><Info size={16}/><span>Maelezo ya access ya Halotel bado hayajawekwa. Nimeacha kadi ya Halotel ionekane bila kutengeneza masharti ya kubuni.</span></div>}
        {submittedRef && <div className="access-success"><strong>Ombi limetumwa kikamilifu.</strong><br/>Rejea: <strong>{submittedRef}</strong><br/>Admin anaweza kuliona kwenye <strong>Maombi ya huduma</strong> na kulihamisha PENDING → PROCESSING → APPROVED/REJECTED.</div>}
        {network.available && <div className="access-submit"><button type="button" disabled={submitting||uploading||Boolean(submittedRef)} onClick={() => void submit()}><Send size={15}/>{submitting?"INATUMA...":"TUMA OMBI KWA ADMIN"}<ChevronRight size={15}/></button></div>}
      </section>
      <aside className="access-side"><div className="access-highlight"><WalletCards size={20}/><strong>Access ya siku 1</strong><span>Chagua mtandao, soma vigezo, kisha tuma taarifa zako kwa ajili ya processing ya admin.</span></div><section className="access-card"><h2>Sifa za kampuni / agency</h2><ul>{COMPANY_POINTS.map((item)=><li key={item}>{item}</li>)}</ul><a className="access-whatsapp" href={WHATSAPP_URL} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Wasiliana WhatsApp</a></section><section className="access-card"><h2>Kwa mawasiliano zaidi</h2><p><strong>0698232313</strong> — Normal Call</p><p><strong>0698232313</strong> — WhatsApp</p><a className="access-whatsapp" href={WHATSAPP_URL} target="_blank" rel="noreferrer">Fungua WhatsApp</a></section></aside>
    </div>
  </div></main>;
}
