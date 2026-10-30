import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronRight, ExternalLink, FileImage, Info, Send, ShieldCheck, Sparkles, Upload, WalletCards } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { createServiceApplication, removeServiceUpload, uploadServiceDocument, subscribeUserServiceApplications, updateServiceApplication, type ServiceApplication } from "@/lib/firebase";
import { formatNida } from "../../../shared/serviceForms";

type NetworkId = "airtel" | "yas" | "vodacom" | "halotel";
type Network = { id: NetworkId; name: string; logo: string; accent: string; available: boolean };

const publicAsset = (name: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${name}`;

const NETWORKS: Network[] = [
  { id: "airtel", name: "Airtel", logo: publicAsset("airtel-logo.png"), accent: "#e21b2d", available: true },
  { id: "yas", name: "Yas", logo: publicAsset("yas-logo.png"), accent: "#123e87", available: true },
  { id: "vodacom", name: "Vodacom", logo: publicAsset("vodacom-logo.png"), accent: "#e60012", available: true },
  { id: "halotel", name: "Halotel", logo: publicAsset("halotel-logo.png"), accent: "#f36f21", available: false },
];

const COMPANY_POINTS = [
  "Malipo kwa wakati",
  "Report kwa wakati",
  "Unapata vitendea kazi hata kama ukiwa mbali mradi uwe umefanya kazi tu — T-shirt, blandi, laini, sticker, ndoo za Lipa na vingine vingi",
  "Tunafanya field support kwa waliopo maeneo ya Dar es Salaam",
  "Na fursa nyingine nyingi kulingana na utendaji na mahitaji ya eneo",
];

const WHATSAPP_URL = "https://wa.me/255692287767?text=Habari%20Mbeya%20One%2C%20nahitaji%20mawasiliano%20kuhusu%20ACCESS%20LIPA%20NAMBA.";

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
  const [name1, setName1] = useState("");
  const [name2, setName2] = useState("");
  const [name3, setName3] = useState("");
  const [lipaSequence, setLipaSequence] = useState("1");
  const [mpesaAccountConfirmed, setMpesaAccountConfirmed] = useState(false);
  const [firstLipaConfirmed, setFirstLipaConfirmed] = useState(false);
  const [contact, setContact] = useState("");
  const [nida, setNida] = useState("");
  const [tinNumber, setTinNumber] = useState("");
  const [licensePath, setLicensePath] = useState("");
  const [licenseName, setLicenseName] = useState("");
  const [licensePreview, setLicensePreview] = useState("");
  const [email, setEmail] = useState("");
  const [passportPath, setPassportPath] = useState("");
  const [passportName, setPassportName] = useState("");
  const [passportPreview, setPassportPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState("");
  const [applicationId, setApplicationId] = useState(newApplicationId);
  const [myApplications, setMyApplications] = useState<ServiceApplication[]>([]);
  const [editingApplicationId, setEditingApplicationId] = useState("");
  useEffect(() => {
    if (!firebaseUser?.uid) { setMyApplications([]); return undefined; }
    return subscribeUserServiceApplications(firebaseUser.uid, (rows) => setMyApplications(rows.filter((row) => String(row.serviceSlug ?? "").startsWith("access-lipa-"))), (error) => { console.error("Imeshindikana kusoma maombi ya access Lipa", error); toast.error("Imeshindikana kupakia historia ya maombi."); });
  }, [firebaseUser?.uid]);
  const network = useMemo(() => NETWORKS.find((item) => item.id === selected) ?? NETWORKS[0], [selected]);

  const resetForm = async (nextNetwork?: NetworkId) => {
    if (passportPath.startsWith("serviceUploads/")) await removeServiceUpload(passportPath).catch(() => undefined);
    if (licensePath.startsWith("serviceUploads/")) await removeServiceUpload(licensePath).catch(() => undefined);
    if (licensePreview) URL.revokeObjectURL(licensePreview);
    if (passportPreview) URL.revokeObjectURL(passportPreview);
    setPhone(""); setFullName(""); setName1(""); setName2(""); setName3(""); setLipaSequence("1"); setMpesaAccountConfirmed(false); setFirstLipaConfirmed(false); setContact(""); setNida(""); setTinNumber(""); setLicensePath(""); setLicenseName(""); setLicensePreview(""); setEmail(""); setEditingApplicationId("");
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

  const uploadBusinessLicense = async (file?: File) => {
    if (!file || !firebaseUser?.uid) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast.error("Picha ya leseni halali iwe JPG, PNG au WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Picha ya leseni isizidi MB 5."); return; }
    setUploading(true);
    try {
      const path = await uploadServiceDocument(firebaseUser.uid, applicationId, "businessLicense", file, 5, ["image/jpeg", "image/png", "image/webp"]);
      if (licensePath.startsWith("serviceUploads/")) await removeServiceUpload(licensePath).catch(() => undefined);
      if (licensePreview) URL.revokeObjectURL(licensePreview);
      setLicensePath(path); setLicenseName(file.name); setLicensePreview(URL.createObjectURL(file)); toast.success("Picha ya leseni imepakiwa.");
    } catch (error: any) { toast.error(error?.message ?? "Imeshindikana kupakia picha ya leseni."); }
    finally { setUploading(false); }
  };

  const editApplication = (item: ServiceApplication) => {
    const data = (item.applicantData ?? {}) as Record<string, unknown>;
    const slug = String(item.serviceSlug ?? "");
    const nextNetwork: NetworkId = slug.endsWith("-yas") ? "yas" : slug.endsWith("-vodacom") ? "vodacom" : "airtel";
    const nextId = String(item.applicationId || item.id);
    setSelected(nextNetwork);
    setApplicationId(nextId);
    setEditingApplicationId(nextId);
    setPhone(String(data.phone ?? ""));
    setFullName(String(data.fullName ?? ""));
    setName1(String(data.name1 ?? data.firstName ?? ""));
    setName2(String(data.name2 ?? data.middleName ?? ""));
    setName3(String(data.name3 ?? data.lastName ?? ""));
    setLipaSequence(String(data.lipaSequence ?? "1"));
    setMpesaAccountConfirmed(data.mpesaAccountConfirmed === true || data.mpesaAccountConfirmed === "1" || data.mpesaAccountConfirmed === "true");
    setFirstLipaConfirmed(data.firstLipaConfirmed === true || data.firstLipaConfirmed === "1" || data.firstLipaConfirmed === "true");
    setContact(String(data.contact ?? ""));
    setNida(String(data.nidaNumber ?? ""));
    setTinNumber(String(data.tinNumber ?? ""));
    setLicensePath(String(data.businessLicense ?? ""));
    setLicenseName(""); setLicensePreview("");
    setEmail(String(data.email ?? ""));
    setPassportPath(String(data.passportPhoto ?? ""));
    setPassportName("");
    setPassportPreview("");
    setSubmittedRef("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info("Ombi la PENDING limefunguliwa kwa ajili ya marekebisho.");
  };

  const submit = async () => {
    if (!firebaseUser?.uid) { toast.error("Ingia kwanza ili kutuma ombi."); return; }
    if (!phone.trim()) { toast.error("Namba ya simu inahitajika."); return; }
    if (selected === "airtel" && (!fullName.trim() || !contact.trim())) { toast.error("Jaza majina na namba ya mawasiliano."); return; }
    if (selected === "yas" && (!nida.trim() || !passportPath || !contact.trim() || !tinNumber.trim() || !licensePath)) { toast.error("Yas inahitaji NIDA, TIN, picha ya leseni halali ya biashara, picha ya passport size na namba ya mawasiliano."); return; }
    if (selected === "vodacom" && (!name1.trim() || !name2.trim() || !name3.trim() || !email.trim() || !contact.trim())) { toast.error("Jaza Jina la 1, Jina la 2, Jina la 3, email na namba ya mawasiliano."); return; }
    if (selected === "vodacom" && !mpesaAccountConfirmed) { toast.error("Thibitisha kuwa laini hii haijafunguliwa/kuwezeshwa account ya M-PESA."); return; }
    if (selected === "vodacom" && lipaSequence === "1" && !firstLipaConfirmed) { toast.error("Thibitisha kuwa hii ni Lipa ya kwanza katika NIDA hii."); return; }
    if (selected === "yas" && !/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(nida)) { toast.error("Namba ya NIDA haijakamilika."); return; }
    setSubmitting(true);
    try {
      const serviceSlug = selected === "airtel" ? "access-lipa-airtel" : selected === "yas" ? "access-lipa-yas" : "access-lipa-vodacom";
      const vodacomNames = [name1.trim(), name2.trim(), name3.trim()].filter(Boolean);
      const vodacomFullName = vodacomNames.join(" ");
      const values: Record<string, string | number | null> = selected === "airtel"
        ? { network: "Airtel", phone: phone.trim(), fullName: fullName.trim(), contact: contact.trim(), nidaNumber: null, passportPhoto: null, email: null }
        : selected === "yas"
          ? { network: "Yas", phone: phone.trim(), nidaNumber: nida.trim(), tinNumber: tinNumber.trim(), businessLicense: licensePath, passportPhoto: passportPath, contact: contact.trim(), fullName: null, email: null }
          : {
              network: "Vodacom",
              phone: phone.trim(),
              fullName: vodacomFullName,
              firstName: name1.trim(),
              middleName: name2.trim(),
              lastName: name3.trim(),
              name1: name1.trim(),
              name2: name2.trim(),
              name3: name3.trim(),
              lipaSequence,
              mpesaAccountConfirmed: mpesaAccountConfirmed ? 1 : 0,
              firstLipaConfirmed: lipaSequence === "1" && firstLipaConfirmed ? 1 : 0,
              email: email.trim(),
              contact: contact.trim(),
              nidaNumber: null,
              passportPhoto: null
            };
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
    .access-page{min-height:100vh;padding:26px 18px 80px;background:linear-gradient(180deg,#f6f8fc 0%,#eef2f7 100%);color:#172033}
    .access-shell{width:min(1180px,100%);margin:auto}.access-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.access-back,.access-secure{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:800}.access-back{color:#5d6c80}.access-secure{color:#168653}
    .access-hero{position:relative;overflow:hidden;padding:38px 40px;border-radius:28px;color:#fff;background:linear-gradient(120deg,#07152e 0%,#16366c 55%,#563bc4 100%);box-shadow:0 22px 55px #14213d26}.access-hero:after{content:"";position:absolute;width:280px;height:280px;border:1px solid #ffffff20;border-radius:50%;right:-80px;top:-120px;box-shadow:0 0 0 42px #ffffff08,0 0 0 84px #ffffff05}.access-eyebrow{display:inline-flex;align-items:center;gap:7px;color:#7cf2ae;font-size:10px;font-weight:900;letter-spacing:.14em}.access-hero h1{position:relative;z-index:1;margin:10px 0 12px;font-size:clamp(28px,4.4vw,48px);line-height:1.02;letter-spacing:-.055em}.access-hero p{position:relative;z-index:1;max-width:780px;margin:0;color:#d9e4f5;font-size:13px;line-height:1.7}
    .access-network-panel,.access-card{border:1px solid #e1e7ee;border-radius:22px;background:#fff;box-shadow:0 12px 34px #17233b0d}.access-network-panel{margin-top:16px;padding:22px}.access-section-title{margin:0 0 15px;font-size:18px;letter-spacing:-.02em}.access-network-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.access-network-card{position:relative;display:flex;align-items:center;gap:12px;min-height:86px;padding:14px;border:1px solid #dce4ec;border-radius:17px;background:linear-gradient(180deg,#fff,#fafcfe);color:#182437;text-align:left;cursor:pointer;transition:.18s ease}.access-network-card:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 9px 22px #17233b12}.access-network-card.is-selected{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 13%,transparent),0 10px 24px #17233b10}.access-network-card:disabled{cursor:not-allowed;opacity:.62}.access-network-logo{display:grid;place-items:center;width:47px;height:47px;flex:0 0 auto;border:2px solid;border-radius:12px;background:#fff;overflow:hidden}.access-network-logo img{max-width:84%;max-height:84%;object-fit:contain}.access-network-copy{min-width:0;display:grid;gap:4px}.access-network-copy strong{font-size:13px}.access-network-copy small{color:#718096;font-size:9px}.access-network-check{position:absolute;right:9px;top:9px;display:grid;place-items:center;width:19px;height:19px;border-radius:50%;color:#fff;background:var(--accent)}
    .access-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;margin-top:18px}.access-card{padding:26px}.access-card h2{margin:0;color:#172033;font-size:20px;letter-spacing:-.04em}.access-card h3{margin:21px 0 10px;font-size:14px}.access-card p,.access-card li{color:#66758a;font-size:11px;line-height:1.65}.access-card ul{margin:7px 0;padding-left:18px}.access-card li+li{margin-top:6px}
    .access-brand{display:flex;align-items:center;gap:14px;padding:13px 15px;margin-bottom:20px;border:1px solid #e1e7ee;border-radius:15px;background:linear-gradient(90deg,#f8fafc,#fff)}.access-brand img{width:78px;height:48px;object-fit:contain}.access-brand strong,.access-brand span{display:block}.access-brand strong{font-size:12px}.access-brand span{margin-top:4px;color:#718096;font-size:10px}
    .access-payment-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px}.access-payment{padding:14px;border-radius:14px;background:linear-gradient(180deg,#f8fafc,#f1f5f8);border:1px solid #e1e8ee}.access-payment strong,.access-payment span{display:block}.access-payment strong{color:#182437;font-size:12px}.access-payment span{margin-top:4px;color:#68788c;font-size:10px}
    .access-rule{display:flex;gap:9px;padding:10px 0;border-bottom:1px solid #eef2f5;color:#66758a;font-size:11px;line-height:1.55}.access-rule-num{display:grid;place-items:center;width:22px;height:22px;flex:0 0 auto;border-radius:7px;color:#fff;background:var(--accent);font-size:10px;font-weight:900}
    .access-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;margin-top:17px}.access-field{display:grid;gap:7px;color:#314155;font-size:11px;font-weight:800}.access-field b{color:#df2438;margin-left:2px}.access-field input{width:100%;box-sizing:border-box;padding:12px 13px;border:1px solid #d7e0e8;border-radius:10px;outline:0;background:#fbfdff;color:#162236;font-size:12px}
    .access-upload{grid-column:1/-1;padding:13px;border:1px dashed #b9c8d5;border-radius:12px;background:#f8fbfd}.access-upload-row{display:flex;align-items:center;gap:11px}.access-upload-preview{width:58px;height:58px;border-radius:9px;object-fit:cover;background:#eaf0f4}.access-upload-meta{flex:1;min-width:0}.access-upload-meta strong,.access-upload-meta small{display:block}.access-upload-meta strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.access-upload-meta small{margin-top:4px;color:#718096;font-size:9px}.access-upload-button{display:inline-flex;align-items:center;gap:6px;padding:9px 11px;border-radius:9px;color:#fff;background:#172e61;font-size:10px;font-weight:900;cursor:pointer}.access-upload-button input{display:none}
    .access-submit{display:flex;justify-content:flex-end;margin-top:18px}.access-submit button,.access-whatsapp{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:11px;color:#fff;font-size:11px;font-weight:900;text-decoration:none}.access-submit button{min-height:45px;padding:11px 17px;background:linear-gradient(135deg,#6d4aff,#3d79ff);cursor:pointer}.access-submit button:disabled{opacity:.55;cursor:not-allowed}.access-success,.access-notice{margin-top:14px;padding:13px;border-radius:11px;font-size:10px;line-height:1.5}.access-success{border:1px solid #a7dfc2;color:#12633d;background:#effbf4}.access-notice{display:flex;align-items:flex-start;gap:8px;color:#5c4a24;background:#fff8e7;border:1px solid #f0dfaa}
    .access-side{display:grid;gap:15px}.access-highlight{padding:15px;border-radius:14px;color:#fff;background:linear-gradient(135deg,#0d315d,#165a91)}.access-highlight strong,.access-highlight span{display:block}.access-highlight strong{font-size:16px}.access-highlight span{margin-top:4px;color:#c9dfef;font-size:10px;line-height:1.5}.access-side .access-card{padding:18px}.access-whatsapp{margin-top:12px;padding:10px 12px;background:#168653}
    @media(max-width:900px){.access-layout{grid-template-columns:1fr}.access-side{grid-template-columns:repeat(2,minmax(0,1fr)}}@media(max-width:650px){.access-page{padding:12px 10px 50px}.access-hero{padding:25px 19px;border-radius:22px}.access-network-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.access-form-grid,.access-payment-grid,.access-side{grid-template-columns:1fr}.access-card{padding:18px}.access-submit{display:block}.access-submit button{width:100%;justify-content:center}.access-upload-row{align-items:flex-start;flex-wrap:wrap}}
  /* Premium redesign: animated entrance, lively network choices, refined form controls */
.access-page{background:radial-gradient(ellipse at 5% 0%,#dbeafe 0,transparent 34%),radial-gradient(ellipse at 95% 12%,#ede9fe 0,transparent 30%),linear-gradient(180deg,#f8faff,#edf2f9);animation:accessFade .5s ease-out both}
.access-hero{isolation:isolate;animation:accessRise .55s cubic-bezier(.2,.75,.25,1) both}
.access-hero:before{content:"";position:absolute;z-index:-1;width:260px;height:260px;right:15%;bottom:-210px;border-radius:50%;background:#8d7bff55;filter:blur(8px);animation:accessFloat 8s ease-in-out infinite}
.access-network-panel,.access-card{position:relative;overflow:hidden;box-shadow:0 14px 36px #1a2a460c;transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease;animation:accessRise .48s ease-out both}
.access-network-panel:before,.access-card:before{content:"";position:absolute;left:0;top:0;width:100%;height:3px;background:linear-gradient(90deg,#5b5cf0,#32c98e,#42a5ff);background-size:200% 100%;animation:accessGradient 5s linear infinite}
.access-network-card{min-height:94px;border-radius:18px;box-shadow:0 5px 15px #17233b06;transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease}
.access-network-card:nth-child(2){animation:accessRise .4s .04s both}.access-network-card:nth-child(3){animation:accessRise .4s .08s both}.access-network-card:nth-child(4){animation:accessRise .4s .12s both}
.access-network-card:hover:not(:disabled){transform:translateY(-4px) scale(1.015);box-shadow:0 14px 28px #17233b14}
.access-network-card.is-selected{background:linear-gradient(135deg,#fff,#f5f3ff);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 14%,transparent),0 15px 30px #17233b12}
.access-network-logo{width:60px;height:52px;border-radius:13px;box-shadow:0 3px 9px #17233b0a;transition:transform .22s ease}
.access-network-card:hover .access-network-logo{transform:scale(1.06)}
.access-network-logo img{width:100%;height:100%;max-width:100%;max-height:100%;padding:5px;box-sizing:border-box;object-fit:contain}
.access-card h2{line-height:1.2}.access-card h3{letter-spacing:-.015em}
.access-form-grid{gap:17px}
.access-field{gap:8px;font-size:12px}
.access-field input{min-height:48px;padding:13px 14px;border-radius:13px;font-size:14px;box-shadow:0 2px 6px #17233b05;transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease}
.access-field input:hover{border-color:#b6c6d8}
.access-field input:focus{transform:translateY(-1px);border-color:#7462f4;background:#fff;box-shadow:0 0 0 4px #7462f41c}
.access-upload{border-radius:15px;transition:border-color .2s ease,background .2s ease}
.access-upload:hover{border-color:#7462f4;background:#f4f2ff}
.access-upload-button,.access-submit button,.access-whatsapp{transition:transform .2s ease,box-shadow .2s ease,filter .2s ease}
.access-upload-button:hover,.access-submit button:hover:not(:disabled),.access-whatsapp:hover{transform:translateY(-2px);filter:brightness(1.04);box-shadow:0 10px 22px #20345c24}
.access-submit button{position:relative;overflow:hidden;min-height:49px;padding:12px 19px;border-radius:13px;box-shadow:0 9px 20px #5145cd25}
.access-payment{transition:transform .2s ease,box-shadow .2s ease}.access-payment:hover{transform:translateY(-3px);box-shadow:0 10px 20px #17233b0d}
.access-rule{transition:background .2s ease;padding:12px 8px;border-radius:10px}.access-rule:hover{background:#f7f9fc}
.access-highlight{position:relative;overflow:hidden;box-shadow:0 14px 28px #0d315d20}
.access-highlight:after{content:"";position:absolute;width:100px;height:100px;right:-35px;top:-35px;border:1px solid #ffffff40;border-radius:50%;box-shadow:0 0 0 18px #ffffff0d}
.access-success{animation:accessRise .35s ease-out both}
@keyframes accessFade{from{opacity:0}to{opacity:1}}
@keyframes accessRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes accessFloat{0%,100%{transform:translate(0,0)}50%{transform:translate(-18px,-16px)}}
@keyframes accessGradient{to{background-position:200% 0}}
@media(max-width:650px){.access-page{padding:12px 10px calc(34px + env(safe-area-inset-bottom))}.access-hero{padding:24px 18px}.access-network-card{min-height:82px;padding:11px;gap:9px}.access-network-logo{width:46px;height:42px}.access-card{padding:17px}.access-field input{font-size:16px}.access-submit button{min-height:50px}}
@media(prefers-reduced-motion:reduce){.access-page,.access-hero,.access-network-panel,.access-card,.access-network-card,.access-success{animation:none!important}.access-hero:before,.access-network-panel:before,.access-card:before,.access-highlight:after{animation:none!important}.access-network-card,.access-network-logo,.access-field input,.access-upload-button,.access-submit button,.access-whatsapp,.access-payment,.access-rule{transition:none!important}}
`}</style>
  <div className="access-shell">
    <div className="access-top"><Link href="/" className="access-back"><ArrowLeft size={16}/> Rudi kwenye huduma</Link><span className="access-secure"><ShieldCheck size={14}/> Ombi salama kwa admin</span></div>
    <header className="access-hero"><span className="access-eyebrow"><Sparkles size={13}/> HUDUMA MPYA • ACCESS LIPA NAMBA</span><h1>MAOMBI YA ACCESS LIPA NAMBA</h1><p>Chagua mtandao unaohitaji, soma masharti yake, kisha tuma taarifa zako. Ombi lako litaingia moja kwa moja kwenye mfumo wa admin kwa ajili ya kukaguliwa na kufanyiwa kazi.</p></header>
    <section className="access-network-panel"><h2 className="access-section-title">Chagua mtandao</h2><div className="access-network-grid">{NETWORKS.map((item) => <button key={item.id} type="button" disabled={!item.available} className={`access-network-card ${selected === item.id ? "is-selected" : ""}`} style={{ "--accent": item.accent } as React.CSSProperties} onClick={() => void chooseNetwork(item.id)}><NetworkLogo network={item}/><span className="access-network-copy"><strong>{item.name}</strong><small>{item.available ? "Fungua taarifa na fomu" : "Taarifa zinakuja hivi karibuni"}</small></span>{selected === item.id && <span className="access-network-check"><Check size={12}/></span>}</button>)}</div></section>
    <div className="access-layout">
      <section className="access-card">
        <div className="access-brand"><img src={publicAsset("mbeya-one.png")} alt="Mbeya One Company Limited"/><div><strong>KAMPUNI / AGENCY</strong><span>Mbeya One Company Limited</span></div></div>
        {submittedRef ? <div className="access-success" role="status" aria-live="polite" style={{display:"grid",gap:12,padding:20,border:"1.5px solid #86efac",borderRadius:16,background:"#ecfdf3",color:"#14532d"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{display:"grid",placeItems:"center",width:42,height:42,borderRadius:"50%",background:"#16a34a",color:"#fff"}}><Check size={24}/></span><div><strong style={{fontSize:17}}>TAARIFA ZIMEWASILISHWA</strong><p style={{margin:"4px 0 0",fontSize:13}}>Ombi lako limepokelewa kikamilifu.</p></div></div>
          <p style={{margin:0,fontSize:13}}>Namba ya kumbukumbu: <strong>{submittedRef}</strong>. Unaweza kufuatilia hali ya ombi lako kwenye sehemu ya Maombi yangu hapa chini.</p>
          {selected === "yas" && <div style={{display:"grid",gap:8}}><strong>Hatua inayofuata: wasiliana na Admin kupitia WhatsApp ili upate maelekezo ya OTP.</strong><a className="access-whatsapp" href={"https://wa.me/255698232313?text="+encodeURIComponent("Habari Admin, nimetuma ombi la ACCESS LIPA YAS na nahitaji maelekezo ya OTP. Rejea: "+submittedRef)} target="_blank" rel="noreferrer"><ExternalLink size={14}/> ENDELEA WHATSAPP KUPATA OTP</a></div>}
          <button type="button" onClick={() => void resetForm()} style={{border:0,borderRadius:10,padding:"13px 18px",fontWeight:900,color:"#fff",background:"linear-gradient(135deg,#6d4aff,#3d79ff)",cursor:"pointer",minHeight:48}}>TUMA OMBI JINGINE</button>
        </div> : <>
        {selected === "airtel" && <><h2>Karibu ujipatie huduma ya access ya kutengeneza Lipa Namba Airtel</h2><h3>Muhtasari wa malipo</h3><div className="access-payment-grid"><div className="access-payment"><strong>Lipa 15 · TZS 37,500</strong><span>Kila week</span></div><div className="access-payment"><strong>Lipa 20 · TZS 50,000</strong><span>Kila week</span></div><div className="access-payment"><strong>Lipa 60 · TZS 100,000</strong><span>Kwa mwezi</span></div></div><h3>Vigezo vya kila Lipa ili uweze kulipwa</h3>{["Lipa Namba ifanye miamala 2 au zaidi — mfano leo TZS 9,500 na kesho TZS 500.","Miamala hiyo itoke namba mbili tofauti — mfano leo kwa mteja mmoja, kesho kwa Adija.","Miamala hiyo ifanyike siku tofauti — mfano Ijumaa mmoja na Jumapili mmoja.","Jumla ya miamala isiwe chini ya TZS 10,000 — mfano 10,000, 11,000, 20,000, 25,000 na kuendelea."].map((item,index)=><div className="access-rule" key={item}><span className="access-rule-num" style={{"--accent":network.accent} as React.CSSProperties}>{index+1}</span><span>{item}</span></div>)}<div className="access-notice"><Info size={15}/> Malipo hufanyika kuanzia Jumatatu hadi Jumatano; malipo yanakuwa tayari ndani ya kipindi hicho.</div><h3>KUPATA ACCESS — TUMA TAARIFA HIZI</h3>{FieldBlock(<><Field label="Namba ya simu" value={phone} onChange={setPhone} type="tel" placeholder="07XXXXXXXX" inputMode="tel"/><Field label="Majina 2 au 3 kama yalivyo kwenye NIDA" value={fullName} onChange={setFullName} placeholder="Jina kamili"/><Field label="Namba ya mawasiliano Normal / WhatsApp" value={contact} onChange={setContact} type="tel" placeholder="07XXXXXXXX" inputMode="tel"/></>)}<p className="access-notice"><Info size={15}/> Access ni ya siku 1 tu unapata.</p></>}
        {selected === "yas" && <><h2>Karibu ujipatie huduma ya access ya kutengeneza Lipa Namba Yas</h2><h3>MALIPO</h3><div className="access-payment-grid"><div className="access-payment"><strong>Machinga · TZS 10,000</strong><span>Malipo ya huduma</span></div><div className="access-payment"><strong>Individual · TZS 20,000</strong><span>Malipo ya huduma</span></div><div className="access-payment"><strong>Company · TZS 20,000</strong><span>Malipo ya huduma</span></div></div><h3>Vigezo vya Lipa kukulipa</h3>{["Hakikisha unasajili Lipa ya MIX kwa mteja husika.","Hakikisha Lipa unayomsajilia mteja inafanya miamala 4 itoke MIX by Yas tu.","Hakikisha Lipa yako inafanya miamala 4 yenye thamani ya TZS 100,000 kutoka MIX by Yas.","Hakikisha miamala hiyo inatoka MIX by Yas, sio mitandao mingine."].map((item,index)=><div className="access-rule" key={item}><span className="access-rule-num" style={{"--accent":network.accent} as React.CSSProperties}>{index+1}</span><span>{item}</span></div>)}<h3>TUMA TAARIFA HIZI KUPATA ACCESS</h3>{FieldBlock(<><Field label="Namba ya simu" value={phone} onChange={setPhone} type="tel" placeholder="07XXXXXXXX" inputMode="tel"/><Field label="Namba ya NIDA (isiwe na code yoyote ya YAS)" value={nida} onChange={(value)=>setNida(formatNida(value))} placeholder="20068517-27520-00001-22" inputMode="numeric"/><Field label="Namba ya TIN" value={tinNumber} onChange={setTinNumber} placeholder="Weka TIN ya biashara"/><div className="access-upload"><div className="access-upload-row">{licensePreview?<img className="access-upload-preview" src={licensePreview} alt="Picha ya leseni ya biashara"/>:<span className="access-upload-preview" style={{display:"grid",placeItems:"center"}}><FileImage size={21}/></span>}<div className="access-upload-meta"><strong>{licenseName||"Picha ya leseni halali ya biashara *"}</strong><small>JPG, PNG au WebP · hadi MB 5. Pakia picha halisi ya leseni iliyotolewa na mamlaka, si picha iliyotengenezwa na website.</small></div><label className="access-upload-button"><Upload size={14}/> {uploading?"Inapakia...":licenseName?"Badilisha leseni":"Pakia leseni"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading||submitting} onChange={(event)=>void uploadBusinessLicense(event.target.files?.[0])}/></label></div></div><div className="access-upload"><div className="access-upload-row">{passportPreview?<img className="access-upload-preview" src={passportPreview} alt="Passport size preview"/>:<span className="access-upload-preview" style={{display:"grid",placeItems:"center"}}><FileImage size={21}/></span>}<div className="access-upload-meta"><strong>{passportName||"Picha yako ya passport size"}</strong><small>JPG, PNG au WebP · hadi MB 5</small></div><label className="access-upload-button"><Upload size={14}/> {uploading?"Inapakia...":passportName?"Badilisha":"Chagua picha"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading||submitting} onChange={(event)=>void uploadPassport(event.target.files?.[0])}/></label></div></div><Field label="Namba ya mawasiliano Normal / WhatsApp" value={contact} onChange={setContact} type="tel" placeholder="07XXXXXXXX" inputMode="tel"/></>)}<p className="access-notice"><Info size={15}/> Hakikisha NIDA haina code yoyote ya YAS kabla ya kutuma.</p></>}
        {selected === "vodacom" && <><h2>Karibu ujipatie huduma ya access ya kutengeneza Lipa Namba Vodacom</h2><h3>Malipo</h3><div className="access-payment-grid" style={{gridTemplateColumns:"1fr"}}><div className="access-payment"><strong>LIPA 1 · TZS 10,000</strong><span>Hulipwa mwisho wa mwezi</span></div></div><h3>Vigezo</h3>{["Lipa Namba ipokee angalau miamala 3 ndani ya mwezi husika.","Miamala yote inayohesabika lazima iwe imetoka Vodacom pekee; miamala ya mitandao mingine haitahesabika.","Jumla ya thamani ya miamala ya Vodacom ndani ya mwezi huo isiwe chini ya TSh 70,000.","Zawadi ya TSh 5,000 hulipwa baada ya Admin kuthibitisha idadi, thamani na mwezi wa miamala."].map((item,index)=><div className="access-rule" key={item}><span className="access-rule-num" style={{"--accent":network.accent} as React.CSSProperties}>{index+1}</span><span>{item}</span></div>)}<h3>TUMA TAARIFA HIZI KUPATA ACCESS</h3>{FieldBlock(<><Field label="Namba ya simu" value={phone} onChange={setPhone} type="tel" placeholder="07XXXXXXXX" inputMode="tel"/><Field label="Jina la 1" value={name1} onChange={setName1} placeholder="Jina la kwanza"/><Field label="Jina la 2" value={name2} onChange={setName2} placeholder="Jina la pili"/><Field label="Jina la 3" value={name3} onChange={setName3} placeholder="Jina la tatu"/><Field label="Email" value={email} onChange={setEmail} type="email" placeholder="example@email.com" inputMode="email"/><Field label="Namba ya mawasiliano" value={contact} onChange={setContact} type="tel" placeholder="07XXXXXXXX" inputMode="tel"/><div style={{gridColumn:"1/-1",display:"grid",gap:12,padding:15,border:"1px solid #fecaca",borderRadius:14,background:"#fff7f7"}}><strong style={{color:"#991b1b"}}>UTHIBITISHO WA LIPA VODACOM</strong><label style={{display:"grid",gap:7,fontSize:12,fontWeight:800,color:"#314155"}}><span>Katika NIDA hii, Lipa hii ni ya ngapi?</span><select value={lipaSequence} onChange={(event)=>{setLipaSequence(event.target.value);if(event.target.value!=="1")setFirstLipaConfirmed(false);}} style={{minHeight:46,padding:"10px 12px",border:"1px solid #d7e0e8",borderRadius:10,background:"#fff",fontSize:14}}><option value="1">Lipa ya 1</option><option value="2">Lipa ya 2</option><option value="3">Lipa ya 3</option><option value="4">Lipa ya 4</option><option value="5">Lipa ya 5</option></select></label>{lipaSequence!=="1"&&<p style={{margin:0,padding:12,borderRadius:10,background:"#eff6ff",color:"#1e3a8a",fontSize:12}}>Jina litakavyoonekana baada ya kukamilika: <strong>{[name1,name2,name3].map(value=>value.trim()).filter(Boolean).join(" ")||"Majina yako"} Store {lipaSequence}</strong></p>}<label style={{display:"flex",alignItems:"flex-start",gap:9,fontSize:12,fontWeight:700,color:"#26384a"}}><input type="checkbox" checked={mpesaAccountConfirmed} onChange={(event)=>setMpesaAccountConfirmed(event.target.checked)}/><span>Je, unathibitisha kuwa laini hii haijafunguliwa/kuwezeshwa account ya M-PESA?</span></label>{lipaSequence==="1"&&<label style={{display:"flex",alignItems:"flex-start",gap:9,fontSize:12,fontWeight:700,color:"#26384a"}}><input type="checkbox" checked={firstLipaConfirmed} onChange={(event)=>setFirstLipaConfirmed(event.target.checked)}/><span>Je, unathibitisha kuwa hii ni Lipa ya kwanza katika NIDA hii?</span></label>}</div></>)}</>}
        {!network.available && <div className="access-notice"><Info size={16}/><span>Maelezo ya access ya Halotel bado hayajawekwa. Nimeacha kadi ya Halotel ionekane bila kutengeneza masharti ya kubuni.</span></div>}
        {network.available && <div className="access-submit"><button type="button" disabled={submitting||uploading||Boolean(submittedRef)} onClick={() => void submit()}><Send size={15}/>{submitting?"INATUMA...":editingApplicationId?"HIFADHI MABADILIKO":"TUMA OMBI KWA ADMIN"}<ChevronRight size={15}/></button></div>}

        </>}      </section>
      <section className="access-card" style={{ gridColumn: "1 / -1", marginTop: "18px" }}><h2>Maombi yangu ya Access Lipa Namba</h2><p>Hapa unaweza kuona maombi yako yote. Maombi yenye hali ya PENDING yanaweza kuhaririwa; yakishaanza kushughulikiwa, unaweza kuyaona tu.</p>{myApplications.length === 0 ? <p>Huna maombi ya Access Lipa Namba yaliyotumwa bado.</p> : <div style={{ display: "grid", gap: "10px" }}>{myApplications.map((item) => <article key={item.id} style={{ border: "2px solid", borderColor: item.status === "APPROVED" ? "#52bd76" : item.status === "REJECTED" ? "#ee8179" : item.status === "PROCESSING" ? "#65a9ee" : "#f0c34c", borderLeft: `8px solid ${item.status === "APPROVED" ? "#07833c" : item.status === "REJECTED" ? "#c51f1a" : item.status === "PROCESSING" ? "#0969c7" : "#c47c00"}`, borderRadius: "12px", padding: "14px", boxShadow: "0 3px 9px rgba(15,35,25,.12)", background: item.status === "APPROVED" ? "#baf2c8" : item.status === "REJECTED" ? "#ffc8c4" : item.status === "PROCESSING" ? "#c8e3ff" : "#fff0a8" }}><div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}><strong>{item.serviceName || item.serviceSlug}</strong><strong style={{display:"inline-block",borderRadius:"999px",padding:"6px 10px",fontSize:".75rem",fontWeight:900,background:item.status==="APPROVED"?"#07833c":item.status==="REJECTED"?"#c51f1a":item.status==="PROCESSING"?"#0969c7":"#ffda45",color:item.status==="PENDING"?"#593600":"#fff"}}>{item.status==="APPROVED"?"APPROVED · Limeidhinishwa":item.status==="REJECTED"?"REJECTED · Limekataliwa":item.status==="PROCESSING"?"PROCESSING · Linafanyiwa kazi":(["access-lipa-yas","access-lipa-airtel","access-lipa-vodacom"].includes(String(item.serviceSlug))?"FANYA MALIPO":"PENDING · Linasubiri")}</strong></div><p style={{ margin: "6px 0" }}>Rejea: {item.applicationId || item.id}</p>{item.status==="PENDING" && ["access-lipa-yas","access-lipa-airtel","access-lipa-vodacom"].includes(String(item.serviceSlug)) && <div style={{marginTop:10,padding:12,borderRadius:10,background:"#fff7ed",border:"1px solid #fdba74",color:"#9a3412"}}><strong>Ombi lako halijaanza kufanyiwa kazi. Fanya malipo kwanza.</strong><p style={{margin:"6px 0"}}>Kwa mawasiliano zaidi na kuthibitisha malipo, wasiliana na 0698232313 kupitia WhatsApp.</p><a href={"https://wa.me/255698232313?text="+encodeURIComponent("Habari Admin, naomba maelekezo ya malipo ya ombi langu la "+String(item.serviceName||item.serviceSlug)+". Rejea: "+String(item.applicationId||item.id))} target="_blank" rel="noreferrer" style={{fontWeight:800,color:"#166534"}}>WASILIANA WHATSAPP</a></div>}{item.rejectionReason && <p style={{ color: "#a63329" }}>Sababu: {item.rejectionReason}</p>}<p style={{ margin: "4px 0" }}>Simu: {String((item.applicantData as Record<string, unknown>)?.phone ?? "—")}</p>{(item.status === "PROCESSING" || item.status === "APPROVED") && <div style={{ marginTop: "12px", padding: "12px", borderRadius: "10px", background: "#eafaf0", border: "1px solid #b5e6c8" }}><p style={{ margin: "0 0 9px", color: "#17663b", fontWeight: 700 }}>{item.status === "APPROVED" ? "Access yako imeidhinishwa. Wasiliana nasi WhatsApp kwa maelezo zaidi kuhusu hatua zinazofuata." : "Ombi lako linafanyiwa kazi. Fungua WhatsApp kwa maelezo zaidi kuhusu ombi lako la Access Lipa Namba."}</p><a href={"https://wa.me/255698232313?text=" + encodeURIComponent("Habari, naomba maelezo zaidi kuhusu ombi langu la Access Lipa Namba. Mtandao: " + (item.serviceName || item.serviceSlug) + ". Rejea: " + (item.applicationId || item.id) + ". Hali: " + item.status + ".")} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "9px", background: "#168653", color: "#fff", textDecoration: "none", fontWeight: 900 }}>Wasiliana WhatsApp · 255698232313</a></div>}{(item.status === "PENDING" || item.status === "PROCESSING") && <div style={{ marginTop: "10px", padding: "12px", borderRadius: "10px", background: "#fff8e7", border: "1px solid #f0d58a" }}><p style={{ margin: "0 0 8px", color: "#805600", fontWeight: 700 }}>Ombi limekaa muda mrefu bila hatua? Unaweza kumkumbusha msimamizi kupitia WhatsApp.</p><a href={"https://wa.me/255698232313?text=" + encodeURIComponent("Habari, naomba kukumbushia ombi langu la Access Lipa Namba. Mtandao: " + (item.serviceName || item.serviceSlug) + ". Rejea: " + (item.applicationId || item.id) + ". Hali ya sasa: " + (item.status === "PENDING" ? "PENDING (Linasubiri)" : "PROCESSING (Linafanyiwa kazi)") + ". Tafadhali nipatie taarifa ya maendeleo ya ombi langu. Asante.")} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "9px", background: "#168653", color: "#fff", textDecoration: "none", fontWeight: 900 }}>Kumbushia ombi kupitia WhatsApp</a></div>}{item.status === "PENDING" && <button type="button" className="access-submit" style={{ border: 0, padding: "10px 13px", borderRadius: "9px", color: "#fff", background: "#3454c5", fontWeight: 800, cursor: "pointer" }} onClick={() => editApplication(item)}>Hariri ombi</button>}</article>)}</div>}</section>
      <aside className="access-side"><div className="access-highlight"><WalletCards size={20}/><strong>Access ya siku 1</strong><span>Chagua mtandao, soma vigezo, kisha tuma taarifa zako kwa ajili ya processing ya admin.</span></div><section className="access-card"><h2>Sifa za kampuni / agency</h2><ul>{COMPANY_POINTS.map((item)=><li key={item}>{item}</li>)}</ul><a className="access-whatsapp" href={WHATSAPP_URL} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Wasiliana WhatsApp</a></section><section className="access-card"><h2>Kwa mawasiliano zaidi</h2><p><strong>0692287767</strong> — Normal Call</p><p><strong>0692287767</strong> — WhatsApp</p><a className="access-whatsapp" href={WHATSAPP_URL} target="_blank" rel="noreferrer">Fungua WhatsApp</a></section></aside>
    </div>
  </div></main>;
}
