import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Download, FileCheck2, MapPin, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { generateBusinessLicense } from "@/lib/firebase";
import locations from "@/data/tanzaniaLocations.json";

type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  businessName: string;
  businessType: string;
  otherBusinessType: string;
  licenseType: "NEW LICENSE" | "RENEWED LICENSE";
  principalBranch: "PRINCIPAL" | "BRANCH";
  region: string;
  district: string;
  ward: string;
  street: string;
  tin: string;
  licenseFee: number;
};

const businessTypes = ["ELECTRONIC MONEY TRANSFER (UWAKALA)", "GENERAL SUPPLY", "RETAIL SHOP", "WHOLESALE SHOP", "HARDWARE", "SALON & BARBER SHOP", "RESTAURANT", "HOTEL & LODGE", "FOOD VENDOR", "CLOTHING SHOP", "MOBILE PHONE & ACCESSORIES", "ELECTRONICS", "PHARMACY", "AGRICULTURAL INPUTS", "TRANSPORT SERVICES", "STATIONERY", "AUTO SPARE PARTS", "CAR WASH", "CAR RENTAL", "CONSTRUCTION SERVICES", "CONSULTANCY SERVICES", "ICT SERVICES", "OTHER"];
const regions = Object.keys(locations.regions);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function expiryIso(date: string) {
  const issued = new Date(`${date}T00:00:00`);
  issued.setFullYear(issued.getFullYear() + 1);
  issued.setDate(issued.getDate() - 1);
  return issued.toISOString().slice(0, 10);
}

function displayDate(date: string) {
  if (!date) return "—";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function issuingOffice(district: string) {
  if (!district) return "—";
  const normalized = district.toUpperCase();
  if (normalized.includes("CITY")) return `${district} CITY COUNCIL`;
  if (normalized.includes("MUNICIPAL")) return `${district} MUNICIPAL COUNCIL`;
  if (normalized.includes("TOWN")) return `${district} TOWN COUNCIL`;
  return `${district} DISTRICT COUNCIL`;
}

function Field({ label, english, children, required = false }: { label: string; english: string; children: React.ReactNode; required?: boolean }) {
  return <label className="license-field"><span><b>{label}{required ? " *" : ""}</b><small>{english}</small></span>{children}</label>;
}

function SelectField({ value, onChange, placeholder, children }: { value: string; onChange: (value: string) => void; placeholder: string; children: React.ReactNode }) {
  return <div className="license-select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{children}</select><ChevronDown size={16} /></div>;
}

function CertificatePreview({ form, issueDate, expiryDate }: { form: FormState; issueDate: string; expiryDate: string }) {
  const owner = `${form.firstName} ${form.lastName}`.trim() || "—";
  const type = form.businessType === "OTHER" ? form.otherBusinessType || "—" : form.businessType || "—";
  return <section className="license-preview-card"><div className="license-preview-heading"><div><span className="overline">MUONEKANO WA HATI</span><h2>LIVE DOCUMENT PREVIEW</h2></div><span className="license-draft-badge">DRAFT PREVIEW</span></div><div className="license-certificate" aria-label="Muonekano wa hati ya leseni ya biashara"><div className="license-certificate__inner"><div className="license-certificate__header"><div className="license-crest-placeholder">TZ</div><strong>THE UNITED REPUBLIC OF TANZANIA</strong><b>BUSINESS LICENSE</b><span>B.L. NO: ITATENGENEZWA KWA USALAMA</span><small>The Business Licensing Act (Act No. 25 of 1972)</small></div><div className="license-block"><h3>License Details</h3><div className="license-row"><span>Issuing Office:</span><b>{issuingOffice(form.district)}</b></div><div className="license-row"><span>Tax Identification No:</span><b>{form.tin || "—"}</b></div><div className="license-row"><span>License Issued To:</span><b>{owner}</b></div><div className="license-row"><span>For the Business of:</span><b>{type}</b></div><div className="license-row"><span>Business Licensing:</span><b>{form.licenseType}</b></div><div className="license-row"><span>Date of Issue:</span><b>{displayDate(issueDate)}</b></div><div className="license-row"><span>Expiring Date:</span><b>{displayDate(expiryDate)}</b></div><div className="license-row"><span>Principal/Branch:</span><b>{form.principalBranch}</b></div></div><div className="license-block license-location"><h3>Business Location</h3><div className="license-row"><span>Region:</span><b>{form.region || "—"}</b></div><div className="license-row"><span>District/Council:</span><b>{form.district || "—"}</b></div><div className="license-row"><span>Ward:</span><b>{form.ward || "—"}</b></div><div className="license-row"><span>Street:</span><b>{form.street || "—"}</b></div><div className="license-qr-placeholder"><img src="/license-assets/tausi-logo.png" alt="Tausi logo" /><span>QR<br />CODE</span></div></div><div className="license-block license-payment"><h3>Payment Details</h3><div className="license-row"><span>Amount of Fee Paid:</span><b>TZS {Number(form.licenseFee || 0).toLocaleString("en-TZ", { minimumFractionDigits: 2 })}</b></div></div><p className="license-copy-note">This digital copy does not require a signature of authority</p><div className="license-conditions"><b>CONDITIONS & NOTES:</b><p>1. This license shall be conspicuously displayed at the place of business.</p><p>2. Renewal applications must be submitted within 21 days of the license expiry; Otherwise, penalties begin at 25% of the license fee and rise by 2% for each additional month, up to 47%.</p></div></div></div></section>;
}

export default function BusinessLicensePage() {
  const { isAuthenticated, profile } = useAuth();
  const [issueDate] = useState(todayIso);
  const [form, setForm] = useState<FormState>({ firstName: "", lastName: "", phone: "", email: "", businessName: "", businessType: "", otherBusinessType: "", licenseType: "NEW LICENSE", principalBranch: "PRINCIPAL", region: "", district: "", ward: "", street: "", tin: "", licenseFee: 80000 });
  const [submitted, setSubmitted] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);

  useEffect(() => {
    setForm((current) => ({ ...current, firstName: current.firstName || profile?.firstName || "", lastName: current.lastName || profile?.lastName || "", phone: current.phone || profile?.phone || "", email: current.email || profile?.email || "" }));
  }, [profile]);

  const regionData = form.region ? locations.regions[form.region as keyof typeof locations.regions] : undefined;
  const districts = regionData ? Object.keys(regionData.districts) : [];
  const wards = form.district && regionData ? (regionData.districts[form.district as keyof typeof regionData.districts] ?? []) : [];
  const expiryDate = useMemo(() => expiryIso(issueDate), [issueDate]);
  const set = (key: keyof FormState, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  const chooseRegion = (value: string) => setForm((current) => ({ ...current, region: value, district: "", ward: "" }));
  const chooseDistrict = (value: string) => setForm((current) => ({ ...current, district: value, ward: "" }));
  const validate = () => {
    if (!isAuthenticated) { toast.error("Ingia kwanza ili kuomba leseni."); return false; }
    if (!form.businessName.trim()) { toast.error("Tafadhali jaza jina la biashara."); return false; }
    if (!form.businessType || (form.businessType === "OTHER" && !form.otherBusinessType.trim())) { toast.error("Tafadhali chagua aina ya biashara."); return false; }
    if (!form.tin.trim() || !/^[A-Za-z0-9\- ]{5,30}$/.test(form.tin.trim())) { toast.error("Ingiza TIN sahihi."); return false; }
    if (!form.region) { toast.error("Chagua Mkoa."); return false; }
    if (!form.district) { toast.error("Chagua Wilaya / Halmashauri."); return false; }
    if (!form.ward) { toast.error("Chagua Kata."); return false; }
    if (!form.street.trim()) { toast.error("Tafadhali jaza Mtaa / Kijiji."); return false; }
    return true;
  };
  const download = async () => {
    if (!validate() || downloadBusy) return;
    setDownloadBusy(true);
    try {
      const result = await generateBusinessLicense({ requestId: crypto.randomUUID(), ...form });
      setSubmitted(true);
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
      toast.success("PDF imetengenezwa kikamilifu.", { description: `Tokeni 2 zimekatwa. Rejea: ${result.reference}` });
    } catch (error: any) {
      const message = error?.message?.includes("Huna tokeni") ? error.message : error?.message ?? "Imeshindikana kutengeneza PDF. Jaribu tena.";
      toast.error(message);
    } finally { setDownloadBusy(false); }
  };
  return <main className="portal-main license-page"><div className="license-topbar"><Link href="/" className="license-back"><ArrowLeft size={17} /> Rudi kwenye huduma</Link><span className="license-security"><ShieldCheck size={16} /> Taarifa zinalindwa</span></div><div className="page-heading"><span className="overline">HUDUMA YA LESENI</span><h1>LESENI YA BIASHARA</h1><p>Business License</p><small>Jaza taarifa za biashara yako kwa usahihi. Muonekano wa hati utaonekana moja kwa moja hapa chini.</small></div>{!isAuthenticated && <Notice tone="warning">Ingia kwenye akaunti ili taarifa zako za mwombaji zijazwe moja kwa moja.</Notice>}<div className="license-layout"><section className="license-form-card"><div className="license-card-title"><FileCheck2 size={21} /><div><h2>Fomu ya Leseni ya Biashara</h2><p>Taarifa za mwombaji na biashara</p></div></div><div className="license-form-section"><h3>1. Taarifa za Mwombaji</h3><div className="license-form-grid"><Field label="Jina la Kwanza" english="First Name" required><input value={form.firstName} disabled={Boolean(profile?.firstName)} onChange={(event) => set("firstName", event.target.value)} /></Field><Field label="Jina la Mwisho" english="Last Name" required><input value={form.lastName} disabled={Boolean(profile?.lastName)} onChange={(event) => set("lastName", event.target.value)} /></Field><Field label="Namba ya Simu" english="Phone Number" required><input inputMode="tel" value={form.phone} disabled={Boolean(profile?.phone)} onChange={(event) => set("phone", event.target.value)} /></Field><Field label="Barua Pepe" english="Email Address" required><input type="email" value={form.email} disabled={Boolean(profile?.email)} onChange={(event) => set("email", event.target.value)} /></Field></div></div><div className="license-form-section"><h3>2. Taarifa za Biashara</h3><div className="license-form-grid"><Field label="Jina la Biashara" english="Business Name" required><input value={form.businessName} onChange={(event) => set("businessName", event.target.value)} placeholder="Mfano: Furaha Shop" /></Field><Field label="Aina ya Biashara" english="Business Type" required><SelectField value={form.businessType} onChange={(value) => set("businessType", value)} placeholder="Chagua aina ya biashara">{businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}</SelectField></Field>{form.businessType === "OTHER" && <Field label="Eleza Aina ya Biashara" english="Specify Business Type" required><input value={form.otherBusinessType} onChange={(event) => set("otherBusinessType", event.target.value)} /></Field>}</div></div><div className="license-form-section"><h3>3. Aina ya Leseni na Eneo</h3><div className="license-form-grid"><Field label="Aina ya Leseni" english="License Type" required><SelectField value={form.licenseType} onChange={(value) => set("licenseType", value as FormState["licenseType"])} placeholder="Chagua aina ya leseni"><option value="NEW LICENSE">NEW LICENSE</option><option value="RENEWED LICENSE">RENEWED LICENSE</option></SelectField></Field><Field label="Eneo la Biashara" english="Business Location" required><SelectField value={form.principalBranch} onChange={(value) => set("principalBranch", value as FormState["principalBranch"])} placeholder="Chagua eneo"><option value="PRINCIPAL">PRINCIPAL — Biashara Kuu</option><option value="BRANCH">BRANCH — Tawi</option></SelectField></Field><Field label="Mkoa" english="Region" required><SelectField value={form.region} onChange={chooseRegion} placeholder="Chagua Mkoa">{regions.map((region) => <option key={region} value={region}>{region}</option>)}</SelectField></Field><Field label="Wilaya / Halmashauri" english="District / Council" required><SelectField value={form.district} onChange={chooseDistrict} placeholder={form.region ? "Chagua Wilaya / Halmashauri" : "Anza kwa kuchagua Mkoa"}>{districts.map((district) => <option key={district} value={district}>{district}</option>)}</SelectField></Field><Field label="Kata" english="Ward" required><SelectField value={form.ward} onChange={(value) => set("ward", value)} placeholder={form.district ? "Chagua Kata" : "Anza kwa kuchagua Wilaya"}>{wards.map((ward) => <option key={ward} value={ward}>{ward}</option>)}</SelectField></Field><Field label="Mtaa / Kijiji" english="Street / Village" required><input value={form.street} onChange={(event) => set("street", event.target.value)} placeholder="Andika mtaa au kijiji" /></Field></div></div><div className="license-form-section"><h3>4. TIN na Malipo</h3><div className="license-form-grid"><Field label="Namba ya TIN" english="TIN Number" required><input value={form.tin} onChange={(event) => set("tin", event.target.value.replace(/[^A-Za-z0-9\- ]/g, ""))} placeholder="Ingiza TIN" /></Field><Field label="Malipo ya Leseni" english="License Fee Paid" required><input type="number" min="0" step="0.01" value={form.licenseFee} onChange={(event) => set("licenseFee", Number(event.target.value))} /></Field></div><div className="license-auto-fields"><span>Namba ya Leseni / B.L. NO. <b>Itatengenezwa securely wakati wa PDF</b></span><span>Tarehe ya Kutolewa <b>{displayDate(issueDate)}</b></span><span>Tarehe ya Kumalizika <b>{displayDate(expiryDate)}</b></span><span>Ofisi Inayotoa Leseni <b>{issuingOffice(form.district)}</b></span></div></div><div className="license-actions"><button className="button button--dark" onClick={() => { if (validate()) toast.success("Taarifa ziko tayari kukaguliwa."); }}><FileCheck2 size={17} /> ANGALIA HATI</button><button className="button button--green" disabled={downloadBusy} onClick={download}><Download size={17} /> {downloadBusy ? "INATENGENEZA PDF..." : submitted ? "PAKUA TENA DOCUMENT" : "PAKUA DOCUMENT (PDF)"}</button></div></section><CertificatePreview form={form} issueDate={issueDate} expiryDate={expiryDate} /></div></main>;
}

function Notice({ children, tone = "warning" }: { children: React.ReactNode; tone?: "warning" | "success" | "info" }) { return <div className={`notice notice--${tone}`}><span>{children}</span></div>; }
