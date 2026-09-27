import { useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Download, FileCheck2, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { generateBusinessLicense } from "@/lib/firebase";
import locations from "@/data/tanzaniaLocations.json";

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

function titleCase(value: string) {
  return value.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function Field({ label, english, children, required = false }: { label: string; english: string; children: React.ReactNode; required?: boolean }) {
  return <label className="license-field"><span><b>{label}{required ? " *" : ""}</b><small>{english}</small></span>{children}</label>;
}

function SelectField({ value, onChange, placeholder, children }: { value: string; onChange: (value: string) => void; placeholder: string; children: React.ReactNode }) {
  return <div className="license-select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{children}</select><ChevronDown size={16} /></div>;
}

function ApplicationPreview({ form, applicationId }: { form: FormState; applicationId: string }) {
  const applicant = `${form.firstName} ${form.middleName} ${form.lastName}`.replace(/\s+/g, " ").trim().toUpperCase() || "—";
  const businessType = (form.businessType === "OTHER" ? form.otherBusinessType || "—" : form.businessType || "—").toUpperCase();
  const row = (label: string, value: string) => <div className="license-clean-row"><span>{label}</span><strong>{value || "—"}</strong></div>;
  const location = [form.district, form.region].filter(Boolean).join(", ") || "—";
  const estimatedFee = Number(form.licenseFee) > 0 ? `${Number(form.licenseFee).toLocaleString("en-TZ", { maximumFractionDigits: 2 })} TZS (makadirio)` : "Haijawekwa";

  return <section className="license-preview-card"><div className="license-preview-heading"><div><span className="overline">MUONEKANO WA RASIMU</span><h2>LIVE APPLICATION PREVIEW</h2></div><span className="license-draft-badge">RASIMU</span></div><div className="license-clean-paper license-application-paper"><header className="license-clean-header"><img src={assetPath("tausi-logo.png")} alt="Nembo ya huduma" /><div>HUDUMA ZA MTANDAONI</div><b>BUSINESS LICENSE APPLICATION</b><span>OMBI LA LESENI YA BIASHARA</span><small>Rejea ya ombi: {applicationId || "Itatengenezwa baada ya kupakua rasimu"}</small></header><div className="license-draft-ribbon">RASIMU TU — SI LESENI RASMI</div><section className="license-clean-section"><h3>Applicant &amp; Business Details</h3>{row("Jina la mwombaji:", applicant)}{row("TIN:", form.tin)}{row("Aina ya biashara:", businessType)}{row("Aina ya ombi:", form.licenseType)}{row("Eneo:", form.principalBranch)}</section><div className="license-clean-lower"><div><section className="license-clean-section"><h3>Business Location</h3>{row("Mkoa:", form.region)}{row("Halmashauri/Wilaya:", form.district)}{row("Kata:", form.ward)}{row("Mtaa/Kijiji:", form.street)}</section><section className="license-clean-section"><h3>Payment Estimate</h3>{row("Makadirio ya ada:", estimatedFee)}<small className="license-preview-disclaimer">Kiasi hiki si uthibitisho wa malipo.</small></section></div><div className="license-verification-placeholder"><ShieldCheck size={26} /><b>UTHIBITISHO RASMI</b><span>QR itaongezwa na mamlaka baada ya ombi kuidhinishwa.</span></div></div><p className="license-clean-note">Hii ni rasimu ya kujaza na kukagua taarifa zako. Haikupi leseni wala ruhusa ya kuendesha biashara.</p><section className="license-clean-conditions"><b>HATUA ZINAZOFUATA</b><p>1. Kagua usahihi wa taarifa zote ulizoingiza.</p><p>2. Wasilisha ombi kupitia mamlaka husika kwa mapitio, uthibitishaji na malipo rasmi.</p><p>3. Namba ya leseni, tarehe za uhalali na QR ya uthibitisho hutolewa na mamlaka baada ya idhini.</p></section></div></section>;
}

export default function BusinessLicensePage() {
  const { isAuthenticated } = useAuth();
  const [form, setForm] = useState<FormState>({ firstName: "", middleName: "", lastName: "", businessType: "", otherBusinessType: "", licenseType: "", principalBranch: "", region: "", district: "", ward: "", street: "", tin: "", licenseFee: 0 });
  const [applicationId, setApplicationId] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const regionData = form.region ? locations.regions[form.region as keyof typeof locations.regions] : undefined;
  const districts = regionData ? Object.keys(regionData.districts) : [];
  const wards = form.district && regionData ? regionData.districts[form.district as keyof typeof regionData.districts] ?? [] : [];
  const set = (key: keyof FormState, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  const chooseRegion = (value: string) => setForm((current) => ({ ...current, region: value, district: "", ward: "" }));
  const chooseDistrict = (value: string) => setForm((current) => ({ ...current, district: value, ward: "" }));
  const locationSummary = useMemo(() => [form.district, form.region].filter(Boolean).join(", "), [form.district, form.region]);

  const validate = () => {
    if (!isAuthenticated) { toast.error("Ingia kwanza ili kuandaa rasimu ya ombi."); return false; }
    if (!form.firstName.trim() || !form.lastName.trim()) { toast.error("Tafadhali jaza jina la kwanza na la mwisho."); return false; }
    if (!form.licenseType || !form.principalBranch) { toast.error("Chagua aina ya ombi na eneo la biashara."); return false; }
    if (!form.businessType || (form.businessType === "OTHER" && !form.otherBusinessType.trim())) { toast.error("Tafadhali chagua au eleza aina ya biashara."); return false; }
    if (!/^\d{3}-\d{3}-\d{3}$/.test(form.tin.trim())) { toast.error("TIN haijakamilika. Tumia muundo 123-456-789."); return false; }
    if (!form.region || !form.district || !form.ward.trim() || !form.street.trim()) { toast.error("Jaza Mkoa, Halmashauri/Wilaya, Kata na Mtaa/Kijiji."); return false; }
    return true;
  };

  const downloadDraft = async () => {
    if (!validate() || downloadBusy) return;
    setDownloadBusy(true);
    try {
      const requestId = crypto.randomUUID();
      const payload = {
        requestId,
        ...form,
        licenseType: form.licenseType as "NEW LICENCE" | "RENEWED LICENCE",
        principalBranch: form.principalBranch as "PRINCIPAL" | "BRANCH",
      };
      const result = await generateBusinessLicense(payload);
      setApplicationId(result.applicationId ?? "");
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
      toast.success("Rasimu ya ombi imetengenezwa.", { description: `Rejea: ${result.applicationId}` });
    } catch (error: any) {
      toast.error(error?.message ?? "Imeshindikana kutengeneza rasimu. Jaribu tena.");
    } finally { setDownloadBusy(false); }
  };

  return <main className="portal-main license-page"><div className="license-topbar"><Link href="/" className="license-back"><ArrowLeft size={17} /> Rudi kwenye huduma</Link><span className="license-security"><ShieldCheck size={16} /> Taarifa zinalindwa</span></div><div className="page-heading"><span className="overline">HUDUMA YA OMBI</span><h1>OMBI LA LESENI YA BIASHARA</h1><p>Business License Application</p><small>Jaza taarifa zako; hakikisho litasasishwa mara moja. Taarifa za ombi lako zinaweza kuhaririwa kabla ya kupakua rasimu.</small></div><div className="license-application-notice"><ShieldCheck size={18} /><span><b>Hii ni rasimu ya ombi tu</b> — si leseni rasmi, si uthibitisho wa malipo, na haitoi ruhusa ya kuendesha biashara. Leseni halali hutolewa na mamlaka husika baada ya kuidhinishwa.</span></div>{!isAuthenticated && <Notice tone="warning">Ingia kwenye akaunti ili kuandaa na kupakua rasimu. Unaweza kuhariri taarifa kabla ya kupakua.</Notice>}<div className="license-layout"><section className="license-form-card"><div className="license-card-title"><FileCheck2 size={21} /><div><h2>Taarifa za mwombaji na biashara</h2><p>Sehemu zenye alama * zinahitajika kwa rasimu.</p></div></div><div className="license-form-section"><h3>1. Taarifa za Mwombaji</h3><div className="license-form-grid"><Field label="Jina la kwanza" english="First name" required><input autoComplete="given-name" value={form.firstName} onChange={(event) => set("firstName", event.target.value.toUpperCase())} placeholder="Mfano: AMINA" required /></Field><Field label="Jina la kati" english="Middle name (hiari)"><input autoComplete="additional-name" value={form.middleName} onChange={(event) => set("middleName", event.target.value.toUpperCase())} placeholder="Hiari" /></Field><Field label="Jina la mwisho" english="Last name" required><input autoComplete="family-name" value={form.lastName} onChange={(event) => set("lastName", event.target.value.toUpperCase())} placeholder="Mfano: JUMA" required /></Field></div></div><div className="license-form-section"><h3>2. Taarifa za Biashara</h3><div className="license-form-grid"><Field label="Aina ya biashara" english="Business type" required><SelectField value={form.businessType} onChange={(value) => set("businessType", value)} placeholder="Chagua aina ya biashara">{businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}</SelectField></Field>{form.businessType === "OTHER" && <Field label="Eleza aina ya biashara" english="Specify business type" required><input value={form.otherBusinessType} onChange={(event) => set("otherBusinessType", event.target.value.toUpperCase())} /></Field>}<Field label="TIN" english="Tax Identification Number · 123-456-789" required><input inputMode="numeric" maxLength={11} value={form.tin} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 9); set("tin", digits.replace(/(\d{3})(?=\d)/g, "$1-")); }} placeholder="123-456-789" /></Field></div></div><div className="license-form-section"><h3>3. Aina ya Ombi na Eneo</h3><div className="license-form-grid"><Field label="Aina ya ombi" english="Application type" required><SelectField value={form.licenseType} onChange={(value) => set("licenseType", value as FormState["licenseType"])} placeholder="Chagua aina"><option value="NEW LICENCE">Ombi jipya</option><option value="RENEWED LICENCE">Kuomba upya</option></SelectField></Field><Field label="Eneo la biashara" english="Principal / Branch" required><SelectField value={form.principalBranch} onChange={(value) => set("principalBranch", value as FormState["principalBranch"])} placeholder="Chagua eneo"><option value="PRINCIPAL">Biashara kuu</option><option value="BRANCH">Tawi</option></SelectField></Field><Field label="Mkoa" english="Region" required><SelectField value={form.region} onChange={chooseRegion} placeholder="Chagua Mkoa">{regions.map((region) => <option key={region} value={region}>{region}</option>)}</SelectField></Field><Field label="Halmashauri / Wilaya" english="Council / District" required><SelectField value={form.district} onChange={chooseDistrict} placeholder={form.region ? "Chagua halmashauri/wilaya" : "Chagua Mkoa kwanza"}>{districts.map((district) => <option key={district} value={district}>{district}</option>)}</SelectField></Field><Field label="Kata" english="Ward" required><SelectField value={form.ward} onChange={(value) => set("ward", value)} placeholder={form.district ? "Chagua Kata" : "Chagua Wilaya kwanza"}>{wards.map((ward) => <option key={ward} value={ward}>{ward}</option>)}</SelectField></Field><Field label="Mtaa / Kijiji" english="Street / Village" required><input autoComplete="address-line1" value={form.street} onChange={(event) => set("street", titleCase(event.target.value))} placeholder="Andika mtaa au kijiji" /></Field></div></div><div className="license-form-section"><h3>4. Ada ya Makadirio (Hiari)</h3><div className="license-form-grid"><Field label="Makadirio ya ada" english="Estimated fee — not a payment receipt"><input type="number" min="0" step="0.01" value={form.licenseFee || ""} onChange={(event) => set("licenseFee", Number(event.target.value))} placeholder="Haijawekwa" /></Field></div><p className="license-estimate-help">Usiandike kama imelipwa isipokuwa mamlaka husika imethibitisha malipo rasmi.</p><div className="license-auto-fields"><span>Rejea ya ombi<b>{applicationId || "Itatengenezwa unapopakua rasimu"}</b></span><span>Eneo ulilochagua<b>{locationSummary || "Halijachaguliwa"}</b></span><span>Namba ya leseni<b>Hutolewa na mamlaka baada ya idhini</b></span><span>Tarehe za uhalali<b>Hutolewa na mamlaka baada ya idhini</b></span></div></div><div className="license-actions"><Link href="/" className="button button--outline"><ArrowLeft size={17} /> Rudi</Link><button className="button button--dark" onClick={() => { if (validate()) toast.success("Taarifa ziko kwenye hakikisho la rasimu."); }}><FileCheck2 size={17} /> HAKIKI RASIMU</button><button className="button button--green" disabled={downloadBusy} onClick={downloadDraft}><Download size={17} /> {downloadBusy ? "INAANDAA RASIMU..." : "PAKUA RASIMU YA OMBI (PDF)"}</button></div></section><ApplicationPreview form={form} applicationId={applicationId} /></div></main>;
}

function Notice({ children, tone = "warning" }: { children: React.ReactNode; tone?: "warning" | "success" | "info" }) { return <div className={`notice notice--${tone}`}><span>{children}</span></div>; }
