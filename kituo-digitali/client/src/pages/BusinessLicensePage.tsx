import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Download, FileCheck2, MapPin, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import QRCode from "qrcode";
import { useAuth } from "@/_core/hooks/useAuth";
import { generateBusinessLicense, reserveBusinessLicenseNumber, subscribeToCollection } from "@/lib/firebase";
import locations from "@/data/tanzaniaLocations.json";
import LicenseTemplatePreview from "./LicenseTemplatePreview";

type FormState = {
  firstName: string; middleName: string; lastName: string;
  businessType: string; otherBusinessType: string;
  licenseType: "" | "NEW LICENCE" | "RENEWED LICENCE";
  principalBranch: "" | "PRINCIPAL" | "BRANCH";
  region: string; district: string; ward: string; street: string;
  tin: string; licenseFee: number;
};

const businessTypes = ["GENERAL RETAIL SHOP", "WHOLESALE BUSINESS", "MOBILE PHONE SHOP", "ELECTRONICS SHOP", "STATIONERY SHOP", "RESTAURANT", "FOOD VENDOR", "CLOTHING SHOP", "HARDWARE SHOP", "SALON", "BARBERSHOP", "CAR WASH", "GROCERY SHOP", "PHARMACY", "COMPUTER SERVICES", "REPAIR SERVICES", "TRANSPORT SERVICES", "AGRICULTURAL INPUTS", "POULTRY BUSINESS", "HOTEL", "LODGE", "SUPERMARKET", "INTERNET CAFE", "OTHER"];
const regions = Object.keys(locations.regions);
const assetPath = (name: string) => `${import.meta.env.BASE_URL}license-assets/${name}`;

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function expiryIso(date: string) {
  const issued = new Date(`${date}T00:00:00`);
  issued.setFullYear(issued.getFullYear() + 1);
  return `${issued.getFullYear()}-${String(issued.getMonth() + 1).padStart(2, "0")}-${String(issued.getDate()).padStart(2, "0")}`;
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function displayDate(date: string) {
  if (!date) return "—";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function issuingOffice(_district: string) {
  return "DAR ES SALAAM CITY COUNCIL";
}

function Field({ label, english, children, required = false }: { label: string; english: string; children: React.ReactNode; required?: boolean }) {
  return <label className="license-field"><span><b>{label}{required ? " *" : ""}</b><small>{english}</small></span>{children}</label>;
}

function SelectField({ value, onChange, placeholder, children }: { value: string; onChange: (value: string) => void; placeholder: string; children: React.ReactNode }) {
  return <div className="license-select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{children}</select><ChevronDown size={16} /></div>;
}

function CertificatePreview({ form, issueDate, expiryDate, licenseNumber }: { form: FormState; issueDate: string; expiryDate: string; licenseNumber: string }) {
  const owner = `${form.firstName} ${form.middleName} ${form.lastName}`.replace(/\s+/g, " ").trim().toUpperCase() || "—";
  const type = (form.businessType === "OTHER" ? form.otherBusinessType || "—" : form.businessType || "—").toUpperCase();
  const [qrDataUrl, setQrDataUrl] = useState("");
  const qrReady = Boolean(licenseNumber && form.firstName.trim() && form.middleName.trim() && form.lastName.trim() && /^\d{3}-\d{3}-\d{3}$/.test(form.tin) && form.businessType && form.licenseType && form.principalBranch && form.region && form.ward.trim() && form.street.trim() && Number(form.licenseFee) > 0);
  useEffect(() => {
    if (!qrReady) { setQrDataUrl(""); return; }
    let cancelled = false;
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${licenseNumber}|${form.tin}|${expiryDate}`)).then((buffer) => {
      const hc = Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
      return QRCode.toDataURL(JSON.stringify({ licenceNumber: licenseNumber, tin: form.tin, expireDate: expiryDate, hc }), { errorCorrectionLevel: "H", margin: 1, width: 420 });
    }).then((url) => { if (!cancelled) setQrDataUrl(url); }).catch(() => { if (!cancelled) setQrDataUrl(""); });
    return () => { cancelled = true; };
  }, [expiryDate, form.tin, licenseNumber, qrReady]);
  const row = (label: string, value: string) => <div className="license-clean-row"><span>{label}</span><strong>{value || "—"}</strong></div>;
  return <section className="license-preview-card"><div className="license-preview-heading"><div><span className="overline">MUONEKANO WA HATI</span><h2>LIVE DOCUMENT PREVIEW</h2></div><span className="license-draft-badge">LIVE</span></div><div className="license-clean-paper" style={{ backgroundImage: `url(${assetPath("tanzania-watermark.png")})` }}><header className="license-clean-header"><img src={assetPath("tanzania-crest.png")} alt="Ngao ya Tanzania" /><div>THE UNITED REPUBLIC OF TANZANIA</div><b>BUSINESS LICENSE</b><span>B.L. NO: {licenseNumber || "—"}</span><small>The Business Licensing Act (Act No. 25 of 1972)</small></header><section className="license-clean-section"><h3>License Details</h3>{row("Issuing Office:", "DAR ES SALAAM CITY COUNCIL")}{row("Tax Identification No:", form.tin)}{row("License Issued To:", owner)}{row("For the Business of:", type)}{row("Business Licensing:", form.licenseType)}{row("Date of Issue:", displayDate(issueDate))}{row("Expiring Date:", displayDate(expiryDate))}{row("Principal/Branch:", form.principalBranch)}</section><div className="license-clean-lower"><div><section className="license-clean-section"><h3>Business Location</h3>{row("Region:", form.region)}{row("Ward:", form.ward)}{row("Street:", form.street)}</section><section className="license-clean-section"><h3>Payment Details</h3>{row("Amount of Fee Paid:", `${Number(form.licenseFee || 0).toLocaleString("en-TZ", { maximumFractionDigits: 2 })} TZS`)}</section></div><div className="license-clean-qr-area">{qrDataUrl ? <div className="license-qr-stack"><img className="license-qr-image" src={qrDataUrl} alt="QR code ya leseni" /><img className="license-qr-logo" src={assetPath("tausi-logo.png")} alt="Tausi logo" /></div> : <span>QR code itatengenezwa baada ya taarifa kukamilika</span>}</div></div><p className="license-clean-note">This digital copy does not require a signature of authority</p><section className="license-clean-conditions"><b>CONDITIONS &amp; NOTES:</b><p>1. This license shall be conspicuously displayed at the place of business.</p><p>2. Renewal applications must be submitted within 21 days of the license expiry; Otherwise, penalties begin at 25% of the license fee and rise by 2% for each additional month, up to 47%.</p></section></div></section>;
}

export default function BusinessLicensePage() {
  const { isAuthenticated } = useAuth();
  const [issueDate] = useState(todayIso);
  const [form, setForm] = useState<FormState>({ firstName: "", middleName: "", lastName: "", businessType: "", otherBusinessType: "", licenseType: "", principalBranch: "", region: "", district: "DAR ES SALAAM", ward: "Tegeta", street: "Mbuyuni", tin: "", licenseFee: 80000 });
  const [submitted, setSubmitted] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [serviceLocked, setServiceLocked] = useState(false);

  useEffect(() => subscribeToCollection("serviceLocks", (rows) => {
    const record = rows.find((item) => String(item.slug ?? item.id) === "leseni-biashara");
    setServiceLocked(record?.isLocked === true);
  }), []);

  useEffect(() => {
    if (!isAuthenticated || licenseNumber || serviceLocked) return;
    void reserveBusinessLicenseNumber(requestId).then((result) => setLicenseNumber(result.licenseNumber)).catch(() => undefined);
  }, [isAuthenticated, licenseNumber, requestId, serviceLocked]);


  const regionData = form.region ? locations.regions[form.region as keyof typeof locations.regions] : undefined;
  const districts = regionData ? Object.keys(regionData.districts) : [];
  const wards: string[] = ["MAGU"];
  const expiryDate = useMemo(() => expiryIso(issueDate), [issueDate]);
  const set = (key: keyof FormState, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  const chooseRegion = (value: string) => setForm((current) => ({ ...current, region: value }));
  const chooseDistrict = (_value: string) => undefined;
  const validate = () => {
    if (serviceLocked) { toast.error("Huduma ya Leseni ya Biashara imefungwa kwa sasa."); return false; }
    if (!isAuthenticated) { toast.error("Ingia kwanza ili kuomba leseni."); return false; }
    if (!form.firstName.trim() || !form.middleName.trim() || !form.lastName.trim()) { toast.error("Tafadhali jaza majina yote matatu ya mwombaji."); return false; }
    if (!form.licenseType) { toast.error("Chagua aina ya leseni."); return false; }
    if (!form.principalBranch) { toast.error("Chagua Principal au Branch."); return false; }
    if (!form.businessType || (form.businessType === "OTHER" && !form.otherBusinessType.trim())) { toast.error("Tafadhali chagua aina ya biashara."); return false; }
    if (!/^\d{3}-\d{3}-\d{3}$/.test(form.tin.trim())) { toast.error("Format ya TIN si sahihi. Tumia mfumo 123-123-123."); return false; }
    if (!form.region) { toast.error("Chagua Mkoa."); return false; }
    if (!form.ward.trim()) { toast.error("Tafadhali jaza Kata."); return false; }
    if (!form.street.trim()) { toast.error("Tafadhali jaza Mtaa / Kijiji."); return false; }
    return true;
  };
  const download = async () => {
    if (!validate() || downloadBusy) return;
    setDownloadBusy(true);
    try {
      const payload = {
        requestId,
        ...form,
        licenseType: form.licenseType as "NEW LICENCE" | "RENEWED LICENCE",
        principalBranch: form.principalBranch as "PRINCIPAL" | "BRANCH",
      };
      const result = await generateBusinessLicense(payload);
      setSubmitted(true);
      setLicenseNumber(result.licenseNumber ?? "");
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
      toast.success("PDF imetengenezwa kikamilifu.", { description: `Tokeni 2 zimekatwa. Rejea: ${result.reference}` });
    } catch (error: any) {
      const message = error?.message?.includes("Huna tokeni") ? error.message : error?.message ?? "Imeshindikana kutengeneza PDF. Jaribu tena.";
      toast.error(message);
    } finally { setDownloadBusy(false); }
  };
  return <main className="portal-main license-page"><div className="license-topbar"><Link href="/" className="license-back"><ArrowLeft size={17} /> Rudi kwenye huduma</Link><span className="license-security"><ShieldCheck size={16} /> Taarifa zinalindwa</span></div><div className="page-heading"><span className="overline">HUDUMA YA LESENI</span><h1>LESENI YA BIASHARA</h1><p>Business License</p><small>Jaza taarifa za biashara yako kwa usahihi. Muonekano wa hati utaonekana moja kwa moja hapa chini.</small></div>{!isAuthenticated && <Notice tone="warning">Ingia kwenye akaunti ili kuomba leseni. Majina na taarifa za mwombaji zitaandikwa na wewe kwenye fomu.</Notice>}{serviceLocked && <Notice tone="warning">Huduma ya Leseni ya Biashara imefungwa kwa sasa na admin; ombi na utoaji wa PDF vimesitishwa.</Notice>}<div className="license-layout"><section className="license-form-card"><div className="license-card-title"><FileCheck2 size={21} /><div><h2>Fomu ya Leseni ya Biashara</h2><p>Taarifa za mwombaji na biashara</p></div></div><div className="license-form-section"><h3>1. Taarifa za Mwombaji</h3><div className="license-form-grid"><Field label="Jina la Kwanza" english="First Name" required><input value={form.firstName} onChange={(event) => set("firstName", event.target.value.toUpperCase())} placeholder="Mfano: STAWARD" required /></Field><Field label="Jina la Pili" english="Middle Name" required><input value={form.middleName} onChange={(event) => set("middleName", event.target.value.toUpperCase())} placeholder="Mfano: NJUMBA" required /></Field><Field label="Jina la Mwisho" english="Last Name" required><input value={form.lastName} onChange={(event) => set("lastName", event.target.value.toUpperCase())} placeholder="Mfano: NJIWA" required /></Field></div></div><div className="license-form-section"><h3>2. Taarifa za Biashara</h3><div className="license-form-grid"><Field label="Aina ya Biashara" english="Business Type" required><SelectField value={form.businessType} onChange={(value) => set("businessType", value)} placeholder="Chagua aina ya biashara">{businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}</SelectField></Field>{form.businessType === "OTHER" && <Field label="Eleza Aina ya Biashara" english="Specify Business Type" required><input value={form.otherBusinessType} onChange={(event) => set("otherBusinessType", event.target.value.toUpperCase())} /></Field>}</div></div><div className="license-form-section"><h3>3. Aina ya Leseni na Eneo</h3><div className="license-form-grid"><Field label="Aina ya Leseni" english="License Type" required><SelectField value={form.licenseType} onChange={(value) => set("licenseType", value as FormState["licenseType"])} placeholder="Chagua aina ya leseni"><option value="NEW LICENCE">NEW LICENCE</option><option value="RENEWED LICENCE">RENEWED LICENCE</option></SelectField></Field><Field label="Eneo la Biashara" english="Principal / Branch" required><SelectField value={form.principalBranch} onChange={(value) => set("principalBranch", value as FormState["principalBranch"])} placeholder="Chagua eneo"><option value="PRINCIPAL">PRINCIPAL — Biashara Kuu</option><option value="BRANCH">BRANCH — Tawi</option></SelectField></Field><Field label="Mkoa" english="Region" required><SelectField value={form.region} onChange={chooseRegion} placeholder="Chagua Mkoa">{regions.map((region) => <option key={region} value={region}>{region}</option>)}</SelectField></Field><Field label="Kata" english="Ward" required><input value={form.ward} onChange={(event) => set("ward", titleCase(event.target.value))} /></Field><Field label="Mtaa / Kijiji" english="Street / Village" required><input value={form.street} onChange={(event) => set("street", titleCase(event.target.value))} /></Field></div></div><div className="license-form-section"><h3>4. TIN na Malipo</h3><div className="license-form-grid"><Field label="Namba ya TIN" english="TIN Number" required><input inputMode="numeric" maxLength={11} value={form.tin} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 9); const formatted = digits.replace(/(\d{3})(?=\d)/g, "$1-"); set("tin", formatted); }} placeholder="123-456-789" aria-describedby="tin-format-help" /><small id="tin-format-help">Format: 123-456-789</small></Field><Field label="Malipo ya Leseni" english="License Fee Paid" required><input type="number" min="0" step="0.01" value={form.licenseFee} onChange={(event) => set("licenseFee", Number(event.target.value))} /></Field></div><div className="license-auto-fields"><span>B.L NO. <b>{licenseNumber || "Itatengenezwa securely wakati wa PDF"}</b><small>READ ONLY — mfumo ndiyo unatengeneza namba</small></span><span>Tarehe ya Kutolewa <b>{displayDate(issueDate)}</b></span><span>Tarehe ya Kumalizika <b>{displayDate(expiryDate)}</b></span><span>Ofisi Inayotoa Leseni <b>{issuingOffice(form.district)}</b></span></div></div><div className="license-actions"><Link href="/" className="button button--outline"><ArrowLeft size={17} /> BACK</Link><button className="button button--dark" onClick={() => { if (validate()) toast.success("Taarifa ziko tayari kukaguliwa."); }}><FileCheck2 size={17} /> ANGALIA HATI</button><button className="button button--green" disabled={downloadBusy || serviceLocked} onClick={download}><Download size={17} /> {downloadBusy ? "INATENGENEZA PDF..." : submitted ? "PAKUA TENA DOCUMENT" : "PAKUA DOCUMENT (PDF)"}</button></div></section><LicenseTemplatePreview form={form} issueDate={issueDate} expiryDate={expiryDate} licenseNumber={licenseNumber} /></div></main>;
}

function Notice({ children, tone = "warning" }: { children: React.ReactNode; tone?: "warning" | "success" | "info" }) { return <div className={`notice notice--${tone}`}><span>{children}</span></div>; }
