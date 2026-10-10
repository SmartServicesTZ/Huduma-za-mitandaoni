import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Download, FileCheck2, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { generateBusinessLicense, reserveBusinessLicenseNumber, subscribeToCollection } from "@/lib/firebase";
import locations from "@/data/tanzaniaLocations.json";
import LicenseTemplatePreview from "./LicenseTemplatePreview";

type FormState = {
  applicantName: string;
  businessType: string;
  otherBusinessType: string;
  licenseType: "" | "NEW LICENCE" | "RENEWED LICENCE";
  principalBranch: "" | "PRINCIPAL" | "BRANCH";
  region: string;
  ward: string;
  street: string;
  tin: string;
  licenseFee: number;
};

type IssuedFiles = {
  pdfBlob: Blob;
  jpgBlob: Blob;
  licenseNumber: string;
  reference: string;
  duplicate: boolean;
};

const REQUEST_ID_KEY = "hmt-business-license-request-id";
const initialForm: FormState = {
  applicantName: "",
  businessType: "",
  otherBusinessType: "",
  licenseType: "NEW LICENCE",
  principalBranch: "PRINCIPAL",
  region: "",
  ward: "",
  street: "",
  tin: "",
  licenseFee: 80000,
};

const businessTypes = [
  "GENERAL RETAIL SHOP", "WHOLESALE BUSINESS", "MOBILE PHONE SHOP", "ELECTRONICS SHOP", "STATIONERY SHOP",
  "RESTAURANT", "FOOD VENDOR", "CLOTHING SHOP", "HARDWARE SHOP", "SALON", "BARBERSHOP", "CAR WASH",
  "GROCERY SHOP", "PHARMACY", "COMPUTER SERVICES", "REPAIR SERVICES", "TRANSPORT SERVICES",
  "AGRICULTURAL INPUTS", "POULTRY BUSINESS", "HOTEL", "LODGE", "SUPERMARKET", "INTERNET CAFE", "OTHER",
];
const regions = Object.keys(locations.regions);

function createRequestId() {
  const next = crypto.randomUUID();
  try { sessionStorage.setItem(REQUEST_ID_KEY, next); } catch { /* storage may be unavailable */ }
  return next;
}

function getOrCreateRequestId() {
  try {
    const previous = sessionStorage.getItem(REQUEST_ID_KEY);
    if (previous && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(previous)) return previous;
  } catch { /* storage may be unavailable */ }
  return createRequestId();
}

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
  return <label className="license-field"><span><b>{label}{required && <span className="required-star">*</span>}</b><small>{english}</small></span>{children}</label>;
}

function SelectField({ value, onChange, placeholder, children }: { value: string; onChange: (value: string) => void; placeholder: string; children: React.ReactNode }) {
  return <div className="license-select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{children}</select><ChevronDown size={16} /></div>;
}

export default function BusinessLicensePage() {
  const { isAuthenticated } = useAuth();
  const [issueDate] = useState(todayIso);
  const [form, setForm] = useState<FormState>({ ...initialForm });
  const [submitted, setSubmitted] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [renewedLicenseNumber, setRenewedLicenseNumber] = useState("");
  const [numberPending, setNumberPending] = useState(false);
  const [numberError, setNumberError] = useState(false);
  const [requestId, setRequestId] = useState(getOrCreateRequestId);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [serviceLocked, setServiceLocked] = useState(false);
  const [issuedFiles, setIssuedFiles] = useState<IssuedFiles | null>(null);

  useEffect(() => subscribeToCollection("serviceLocks", (rows) => {
    const record = rows.find((item) => String(item.slug ?? item.id) === "leseni-biashara");
    setServiceLocked(record?.isLocked === true);
  }), []);

  useEffect(() => {
    if (!isAuthenticated || licenseNumber || serviceLocked || form.licenseType === "RENEWED LICENCE") {
      setNumberPending(false);
      return;
    }
    let cancelled = false;
    setNumberPending(true);
    setNumberError(false);
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("Muda wa kupata namba umeisha.")), 15000);
    });
    void Promise.race([reserveBusinessLicenseNumber(requestId, "NEW LICENCE"), timeout])
      .then((result) => { if (!cancelled && result.licenseNumber) setLicenseNumber(result.licenseNumber); })
      .catch((error: unknown) => { if (!cancelled) { setNumberError(true); toast.error(error instanceof Error ? `Namba ya leseni haikupatikana: ${error.message}` : "Namba ya leseni haikupatikana. Jaribu tena."); } })
      .finally(() => { if (!cancelled) setNumberPending(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated, licenseNumber, requestId, serviceLocked, form.licenseType]);

  const expiryDate = useMemo(() => expiryIso(issueDate), [issueDate]);

  useEffect(() => { if (form.licenseType === "RENEWED LICENCE") setLicenseNumber(renewedLicenseNumber); }, [form.licenseType, renewedLicenseNumber]);

  const rotateRequest = () => {
    setRequestId(createRequestId());
    setLicenseNumber("");
    setRenewedLicenseNumber("");
    setNumberError(false);
    setSubmitted(false);
    setIssuedFiles(null);
  };

  const refreshLicenseNumber = () => {
    if (numberPending || downloadBusy || submitted || serviceLocked || !isAuthenticated) return;
    if (!licenseNumber && !numberError) return;
    rotateRequest();
  };

  const set = (key: keyof FormState, value: string | number) => {
    if (downloadBusy) return;
    setForm((current) => ({ ...current, [key]: value }));
    setIssuedFiles(null);
    if (submitted) rotateRequest();
  };

  const validate = (forIssuance: boolean) => {
    if (forIssuance && serviceLocked) { toast.error("Huduma ya Leseni ya Biashara imefungwa kwa sasa."); return false; }
    if (forIssuance && !isAuthenticated) { toast.error("Ingia kwanza ili kupakua leseni."); return false; }
    if (!form.applicantName.trim()) { toast.error("Tafadhali jaza majina yote matatu ya mwombaji kwenye sehemu moja."); return false; }
    if (!form.licenseType) { toast.error("Chagua aina ya leseni."); return false; }
    if (form.licenseType === "RENEWED LICENCE" && !/^BL01699682026-27000\d{5}$/.test(renewedLicenseNumber.trim())) { toast.error("Weka namba ya leseni kwa mfumo BL01699682026-2700012345."); return false; }
    if (!form.principalBranch) { toast.error("Chagua Principal au Branch."); return false; }
    if (!form.businessType || (form.businessType === "OTHER" && !form.otherBusinessType.trim())) { toast.error("Tafadhali chagua aina ya biashara."); return false; }
    if (!/^\d{3}-\d{3}-\d{3}$/.test(form.tin.trim())) { toast.error("Format ya TIN si sahihi. Tumia mfumo 123-123-123."); return false; }
    if (!form.region) { toast.error("Chagua Mkoa."); return false; }
    if (!form.ward.trim()) { toast.error("Tafadhali jaza Kata."); return false; }
    if (!form.street.trim()) { toast.error("Tafadhali jaza Mtaa / Kijiji."); return false; }
    if (!Number.isFinite(form.licenseFee) || form.licenseFee < 0) { toast.error("Weka kiasi sahihi cha ada ya leseni."); return false; }
    return true;
  };

  const download = async (format: "pdf" | "jpg") => {
    if (!validate(true) || downloadBusy) return;
    setDownloadBusy(true);
    try {
      let files = issuedFiles;
      if (!files) {
        const payload = {
          requestId,
          ...form,
          licenseNumber: form.licenseType === "RENEWED LICENCE" ? renewedLicenseNumber.trim() : undefined,
          licenseType: form.licenseType as "NEW LICENCE" | "RENEWED LICENCE",
          principalBranch: form.principalBranch as "PRINCIPAL" | "BRANCH",
        };
        const result = await generateBusinessLicense(payload);
        files = {
          pdfBlob: result.pdfBlob,
          jpgBlob: result.jpgBlob,
          licenseNumber: result.licenseNumber,
          reference: result.reference,
          duplicate: result.duplicate,
        };
        setIssuedFiles(files);
        setSubmitted(true);
        setLicenseNumber(result.licenseNumber);
        try { sessionStorage.removeItem(REQUEST_ID_KEY); } catch { /* storage may be unavailable */ }
      }

      const blob = format === "pdf" ? files.pdfBlob : files.jpgBlob;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `leseni-${files.licenseNumber || "biashara"}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);

      if (issuedFiles) {
        toast.success(`Hati ya ${format.toUpperCase()} imepakuliwa tena bila kukata tokeni nyingine.`, { description: `Rejea: ${files.reference}` });
      } else {
        toast.success("Leseni imetengenezwa kikamilifu.", { description: files.duplicate ? `Ombi hili lilikuwa limekamilika tayari. Rejea: ${files.reference}` : `Tokeni 2 zimekatwa mara moja kwa hati hii. Rejea: ${files.reference}` });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Imeshindikana kutengeneza hati. Jaribu tena.";
      toast.error(message);
    } finally {
      setDownloadBusy(false);
    }
  };

  const resetForm = () => {
    if (downloadBusy) return;
    setForm({ ...initialForm });
    setIssuedFiles(null);
    if (submitted) rotateRequest();
    toast.success("Fomu imesafishwa.");
  };

  return <main className="portal-main license-page">
    <div className="license-topbar">
      <Link href="/" className="license-back"><ArrowLeft size={17} /> Rudi kwenye huduma</Link>
      <span className="license-security"><ShieldCheck size={16} /> Taarifa zinalindwa</span>
    </div>

    <div className="page-heading">
      <span className="overline">HUDUMA YA LESENI</span>
      <h1>LESENI YA BIASHARA</h1>
      <p>Business License</p>
      <small>Jaza taarifa za biashara yako kwa usahihi. Muonekano wa template utaonekana moja kwa moja hapa chini.</small>
    </div>

    {!isAuthenticated && <Notice tone="warning">Ingia kwenye akaunti ili kupakua leseni. Unaweza kujaza fomu na kuona live preview kabla ya kuingia.</Notice>}
    {serviceLocked && <Notice tone="warning">Huduma ya Leseni ya Biashara imefungwa kwa sasa na admin; utoaji wa hati umesitishwa.</Notice>}

    <div className="license-layout">
      <section className="license-form-card">
        <div className="license-card-title"><FileCheck2 size={21} /><div><h2>Fomu ya Leseni ya Biashara</h2><p>Taarifa za mwombaji na biashara</p></div></div>

        <div className="license-form-section">
          <h3>1. Taarifa za Mwombaji</h3>
          <div className="license-form-grid">
            <Field label="Majina Matatu" english="Full Name" required><input value={form.applicantName} onChange={(event) => set("applicantName", event.target.value.toUpperCase().replace(/\s+/g, " "))} placeholder="Andika majina yote matatu" required /></Field>
          </div>
        </div>

        <div className="license-form-section">
          <h3>2. Taarifa za Biashara</h3>
          <div className="license-form-grid">
            <Field label="Aina ya Biashara" english="Business Type" required>
              <SelectField value={form.businessType} onChange={(value) => set("businessType", value)} placeholder="Chagua aina ya biashara">
                {businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </SelectField>
            </Field>
            {form.businessType === "OTHER" && <Field label="Eleza Aina ya Biashara" english="Specify Business Type" required><input value={form.otherBusinessType} onChange={(event) => set("otherBusinessType", event.target.value.toUpperCase())} /></Field>}
          </div>
        </div>

        <div className="license-form-section">
          <h3>3. Aina ya Leseni na Eneo</h3>
          <div className="license-form-grid">
            <Field label="Aina ya Leseni" english="License Type" required>
              <SelectField value={form.licenseType} onChange={(value) => set("licenseType", value as FormState["licenseType"])} placeholder="Chagua aina ya leseni">
                <option value="NEW LICENCE">NEW LICENCE</option><option value="RENEWED LICENCE">RENEWED LICENCE</option>
              </SelectField>
            </Field>
            {form.licenseType === "RENEWED LICENCE" && <Field label="Namba ya Leseni ya Zamani" english="Previous License Number" required><input inputMode="numeric" maxLength={25} value={renewedLicenseNumber} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 25); setRenewedLicenseNumber(digits); }} placeholder="BL01699682026-2700012345" /></Field>}
            <Field label="Eneo la Biashara" english="Principal / Branch" required>
              <SelectField value={form.principalBranch} onChange={(value) => set("principalBranch", value as FormState["principalBranch"])} placeholder="Chagua eneo">
                <option value="PRINCIPAL">PRINCIPAL — Biashara Kuu</option><option value="BRANCH">BRANCH — Tawi</option>
              </SelectField>
            </Field>
            <Field label="Mkoa" english="Region" required>
              <SelectField value={form.region} onChange={(value) => set("region", value)} placeholder="Chagua Mkoa">
                {regions.map((region) => <option key={region} value={region}>{region}</option>)}
              </SelectField>
            </Field>
            <Field label="Kata" english="Ward" required><input value={form.ward} onChange={(event) => set("ward", titleCase(event.target.value))} /></Field>
            <Field label="Mtaa / Kijiji" english="Street / Village" required><input value={form.street} onChange={(event) => set("street", titleCase(event.target.value))} /></Field>
          </div>
        </div>

        <div className="license-form-section">
          <h3>4. TIN na Malipo</h3>
          <div className="license-form-grid">
            <Field label="Namba ya TIN" english="TIN Number" required>
              <input inputMode="numeric" maxLength={11} value={form.tin} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 9); set("tin", digits.replace(/(\d{3})(?=\d)/g, "$1-")); }} placeholder="Weka TIN namba" aria-describedby="tin-format-help" />
              <small id="tin-format-help">Format: 123-456-789</small>
            </Field>
            <Field label="Malipo ya Leseni" english="License Fee Paid" required><input type="number" min="0" step="0.01" value={form.licenseFee} onChange={(event) => set("licenseFee", Number(event.target.value))} /></Field>
          </div>
          <div className="license-auto-fields">
            <span className="license-number-field">B.L. NO. <b>{licenseNumber || (numberError ? "Haikupatikana" : isAuthenticated ? "Inatolewa na mfumo..." : "Itatolewa baada ya kuingia")}</b><button type="button" className="license-number-refresh" disabled={!isAuthenticated || serviceLocked || downloadBusy || submitted || numberPending || (!licenseNumber && !numberError)} onClick={refreshLicenseNumber} title="Badilisha tarakimu tano za mwisho za namba ya leseni"><RefreshCw size={13} /> {numberPending ? "Inatolewa..." : numberError ? "Jaribu tena" : "Badilisha namba"}</button><small>{submitted ? "READ ONLY — namba imefungwa kwenye leseni iliyotengenezwa" : "READ ONLY — badilisha kabla ya kutengeneza hati; hakuna tokeni inayokatwa kwa refresh"}</small></span>
            <span>Tarehe ya Kutolewa <b>{displayDate(issueDate)}</b></span>
            <span>Tarehe ya Kumalizika <b>{displayDate(expiryDate)}</b></span>
            <span>Ofisi Inayotoa Leseni <b>{issuingOffice("")}</b></span>
          </div>
        </div>

        <div className="license-actions">
          <Link href="/" className="button button--outline"><ArrowLeft size={17} /> BACK</Link>
          <button type="button" className="button button--dark" onClick={() => { if (validate(false)) toast.success("Muonekano wa template uko tayari; hakiki taarifa kabla ya kuomba hati."); }}><FileCheck2 size={17} /> ANGALIA HATI</button>
          <div className="license-download-option">
            <button type="button" className="button button--dark" disabled={downloadBusy || serviceLocked} onClick={() => void download("jpg")}><Download size={17} /> {downloadBusy ? "INATENGENEZA..." : submitted ? "PAKUA JPG TENA" : "PAKUA JPG"}</button>
            <small className="license-download-note">Ubora wa juu · faili dogo</small>
          </div>
          <div className="license-download-option license-download-option--recommended">
            <button type="button" className="button button--green" disabled={downloadBusy || serviceLocked} onClick={() => void download("pdf")}><Download size={17} /> {downloadBusy ? "INATENGENEZA..." : submitted ? "PAKUA PDF TENA" : "PAKUA PDF"}</button>
            <small className="license-download-note">Quality 100% · Inapendekezwa zaidi</small>
          </div>
          <button type="button" className="button button--outline" disabled={downloadBusy} onClick={resetForm}><RotateCcw size={16} /> FUTA FOMU</button>
        </div>
        <p className="license-output-note">PDF ya resolution kamili na JPG yenye faili dogo zinatengenezwa pamoja; tokeni 2 hukatwa mara moja kwa hati, si kwa kila format. <strong>Pendekezo: tumia PDF kwa uchapishaji wa ubora wa juu zaidi.</strong></p>
      </section>

      <div className="license-preview-column">
        <LicenseTemplatePreview form={form} issueDate={issueDate} expiryDate={expiryDate} licenseNumber={licenseNumber} />
        {isAuthenticated && form.licenseType === "NEW LICENCE" && !licenseNumber && (
          <div className={numberError ? "notice notice--warning" : "notice notice--info"} role="status">
            <span>{numberPending ? "BL NO inatolewa, tafadhali subiri..." : numberError ? "Namba haikupatikana. Jaribu tena; namba halisi hutolewa na huduma ya leseni." : "BL NO bado haijatolewa."}</span>
            {numberError && <button type="button" className="button button--outline" disabled={downloadBusy || serviceLocked} onClick={refreshLicenseNumber}>JARIBU TENA</button>}
          </div>
        )}
      </div>
    </div>
  </main>;
}

function Notice({ children, tone = "warning" }: { children: React.ReactNode; tone?: "warning" | "success" | "info" }) {
  return <div className={`notice notice--${tone}`}><span>{children}</span></div>;
}
