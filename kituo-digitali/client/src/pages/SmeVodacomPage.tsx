import { useState } from "react";
import { ArrowLeft, CheckCircle2, FileText, LoaderCircle, Send, ShieldCheck, UploadCloud } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { createServiceApplication, uploadServiceDocument } from "@/lib/firebase";
import { formatNida } from "../../../shared/serviceForms";
import type { ServiceFormValues } from "../../../shared/serviceForms";

const REGIONS = [
  "Arusha", "Dar es Salaam", "Dodoma", "Geita", "Iringa", "Kagera",
  "Katavi", "Kigoma", "Kilimanjaro", "Lindi", "Manyara", "Mara",
  "Mbeya", "Morogoro", "Mtwara", "Mwanza", "Njombe", "Pwani",
  "Rukwa", "Ruvuma", "Shinyanga", "Simiyu", "Singida", "Songwe",
  "Tabora", "Tanga", "Kaskazini Pemba", "Kaskazini Unguja",
  "Kusini Pemba", "Kusini Unguja", "Mjini Magharibi",
];

type FormState = {
  fullName: string;
  nidaNumber: string;
  smePhone: string;
  alternativePhone: string;
  region: string;
  district: string;
};

const INITIAL: FormState = {
  fullName: "", nidaNumber: "", smePhone: "", alternativePhone: "", region: "", district: "",
};

function newApplicationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `sme-vodacom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("255")) return digits;
  if (digits.startsWith("0")) return `255${digits.slice(1)}`;
  return digits;
}

function validPhone(value: string) {
  return /^255[67]\d{8}$/.test(normalizePhone(value));
}

export default function SmeVodacomPage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [tinFile, setTinFile] = useState<File | null>(null);
  const [tinPath, setTinPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");
  const [applicationId, setApplicationId] = useState(newApplicationId);

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setMessage("");
  };

  const uploadTin = async (file?: File) => {
    if (!file) return;
    if (!firebaseUser?.uid) {
      setErrors((current) => ({ ...current, tinCertificate: "Ingia kwanza ili kupakia cheti cha TIN." }));
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setErrors((current) => ({ ...current, tinCertificate: "Pakia PDF, JPG au PNG pekee." }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((current) => ({ ...current, tinCertificate: "Faili lisizidi MB 5." }));
      return;
    }
    setUploading(true);
    setErrors((current) => ({ ...current, tinCertificate: "" }));
    setMessage("");
    try {
      const path = await uploadServiceDocument(
        firebaseUser.uid, applicationId, "tinCertificate", file, 5,
        ["application/pdf", "image/jpeg", "image/png"],
      );
      setTinFile(file);
      setTinPath(path);
    } catch (error) {
      setTinFile(null);
      setTinPath("");
      setErrors((current) => ({
        ...current,
        tinCertificate: error instanceof Error ? error.message : "Imeshindikana kupakia cheti.",
      }));
    } finally {
      setUploading(false);
    }
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (form.fullName.trim().length < 3) next.fullName = "Jaza majina kamili.";
    if (!/^\d{20}$/.test(form.nidaNumber.replace(/\D/g, ""))) next.nidaNumber = "NIDA lazima iwe na tarakimu 20.";
    if (!validPhone(form.smePhone)) next.smePhone = "Weka namba halali ya Tanzania, mfano 0712000000.";
    if (!validPhone(form.alternativePhone)) next.alternativePhone = "Weka namba mbadala halali.";
    if (validPhone(form.smePhone) && validPhone(form.alternativePhone) && normalizePhone(form.smePhone) === normalizePhone(form.alternativePhone)) {
      next.alternativePhone = "Namba mbadala lazima iwe tofauti na namba ya SME.";
    }
    if (!tinPath) next.tinCertificate = "Pakia cheti cha TIN.";
    if (!form.region) next.region = "Chagua mkoa.";
    if (!form.district.trim()) next.district = "Jaza wilaya.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setReference("");
    if (authLoading) return;
    if (!firebaseUser?.uid) {
      setMessage("Ingia kwenye akaunti yako kwanza ili kutuma ombi.");
      return;
    }
    if (!validate()) return;

    setSubmitting(true);
    try {
      const values: ServiceFormValues = {
        fullName: form.fullName.trim(),
        nidaNumber: formatNida(form.nidaNumber),
        smePhone: normalizePhone(form.smePhone),
        alternativePhone: normalizePhone(form.alternativePhone),
        tinCertificate: tinPath,
        region: form.region,
        district: form.district.trim(),
      };
      const result = await createServiceApplication(applicationId, "sme-vodacom", values);
      const ref = String(result.reference ?? result.applicationId ?? applicationId);
      setReference(ref);
      setMessage("Ombi lako la SME VODACOM limetumwa kwa mafanikio.");
      setForm(INITIAL);
      setTinFile(null);
      setTinPath("");
      setApplicationId(newApplicationId());
      toast.success("Ombi la SME VODACOM limetumwa kwa admin.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Imeshindikana kutuma ombi.";
      setMessage(detail);
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = (field: string) =>
    `mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-100 ${errors[field] ? "border-red-500" : "border-slate-200"}`;

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? <p className="mt-1.5 text-xs font-medium text-red-600">{errors[field]}</p> : null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-7 text-slate-800 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-red-600">
          <ArrowLeft size={17} /> Rudi kwenye huduma
        </Link>

        <header className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-red-800 via-red-600 to-rose-500 p-6 text-white shadow-xl sm:p-10">
          <div className="pointer-events-none absolute -right-10 -top-12 -z-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold tracking-widest">VODACOM BUSINESS</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/20 px-3 py-1.5 text-sm font-bold ring-1 ring-white/20">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> Active
            </span>
          </div>
          <h1 className="mt-7 text-3xl font-black tracking-tight sm:text-5xl">SME VODACOM</h1>
          <p className="mt-3 text-xs font-bold tracking-[0.14em] text-red-100 sm:text-sm">SMALL AND MEDIUM-SIZED ENTERPRISES (SME)</p>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-white/90 sm:text-base">
            Omba kuunganishwa SME Vodacom na uchague Data Plan inayokufaa. Jaza taarifa zinazohitajika na utume ombi lako la SME Vodacom. Baada ya ombi kushughulikiwa, utapokea maelekezo ya malipo pamoja na Control Number kutoka Vodacom. Ukishalipia kwa Control Number uliyotumiwa na Vodacom, utaunganishwa kwenye Data Plan uliyochagua.
          </p>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[.78fr_1.5fr]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><ShieldCheck size={23} /></span>
              <div><h2 className="font-extrabold">Mahitaji ya maombi</h2><p className="mt-1 text-xs text-slate-500">Kabla ya kuanza</p></div>
            </div>
            <ul className="mt-6 space-y-4">
              {["MAJINA KAMILI", "NAMBA YA NIDA", "NAMBA YA VODACOM INAYOUNGWA SME", "ALTERNATIVE NAMBA YA VODACOM", "TIN NUMBER CERTIFICATE"].map((item, index) => (
                <li key={item} className="flex items-start gap-3 text-sm font-semibold leading-5 text-slate-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-black text-red-600">{index + 1}</span>{item}
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-xl bg-amber-50 p-4 text-xs leading-6 text-amber-900"><b>Kumbuka:</b> Taarifa zako lazima ziwe sahihi. Cheti cha TIN kinakubaliwa kama PDF, JPG au PNG hadi MB 5.</div>
          </aside>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <div className="border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><FileText size={22} /></span><div><h2 className="text-xl font-black sm:text-2xl">Fomu ya maombi</h2><p className="mt-1 text-sm text-slate-500">Sehemu 7 zinahitajika (*)</p></div></div>
              <div className="mt-5 h-1.5 w-20 rounded-full bg-red-600" />
            </div>

            {!firebaseUser && !authLoading && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Tafadhali ingia kwenye akaunti yako kabla ya kujaza na kutuma ombi.</div>}

            <form onSubmit={submit} noValidate className="mt-6 space-y-5">
              <div><label htmlFor="sme-full-name" className="text-sm font-bold">Full Name <span className="text-red-500">*</span></label>
                <input id="sme-full-name" autoComplete="name" value={form.fullName} onChange={(e) => update("fullName", e.target.value)} placeholder="e.g. Juma M. Mwakalinga" className={fieldClass("fullName")} aria-invalid={!!errors.fullName} />
                <FieldError field="fullName" /></div>

              <div><label htmlFor="sme-nida" className="text-sm font-bold">NIDA Number <span className="text-red-500">*</span></label>
                <input id="sme-nida" inputMode="numeric" value={form.nidaNumber} onChange={(e) => update("nidaNumber", e.target.value.replace(/\D/g, "").slice(0, 20))} placeholder="20 digit NIDA number" className={fieldClass("nidaNumber")} aria-invalid={!!errors.nidaNumber} />
                <FieldError field="nidaNumber" /></div>

              <div><label htmlFor="sme-phone" className="text-sm font-bold">NAMBA YA VODACOM INAYOUNGWA SME <span className="text-red-500">*</span></label>
                <input id="sme-phone" type="tel" autoComplete="tel" value={form.smePhone} onChange={(e) => update("smePhone", e.target.value)} placeholder="+255 712 000 000" className={fieldClass("smePhone")} aria-invalid={!!errors.smePhone} />
                <FieldError field="smePhone" /></div>

              <div><label htmlFor="sme-alternative" className="text-sm font-bold">NAMBA MBADALA YA VODACOM <span className="text-red-500">*</span></label>
                <input id="sme-alternative" type="tel" value={form.alternativePhone} onChange={(e) => update("alternativePhone", e.target.value)} placeholder="+255 712 000 000" className={fieldClass("alternativePhone")} aria-invalid={!!errors.alternativePhone} />
                <FieldError field="alternativePhone" /></div>

              <div><label htmlFor="sme-tin" className="text-sm font-bold">TIN Number Certificate <span className="text-red-500">*</span></label>
                <label htmlFor="sme-tin" className={`mt-2 flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-4 transition hover:border-red-400 hover:bg-red-50/40 ${errors.tinCertificate ? "border-red-400" : "border-slate-200"}`}>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">{uploading ? <LoaderCircle className="animate-spin" size={22} /> : tinFile ? <CheckCircle2 size={22} /> : <UploadCloud size={22} />}</span>
                  <span className="min-w-0"><span className="block break-all text-sm font-bold">{uploading ? "Inapakia cheti..." : tinFile?.name ?? "Choose file"}</span><span className="mt-1 block text-xs text-slate-500">PDF, JPG au PNG · Upeo MB 5</span></span>
                </label>
                <input id="sme-tin" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" disabled={uploading || submitting} onChange={(e) => void uploadTin(e.target.files?.[0])} aria-invalid={!!errors.tinCertificate} />
                <FieldError field="tinCertificate" /></div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div><label htmlFor="sme-region" className="text-sm font-bold">Region <span className="text-red-500">*</span></label>
                  <select id="sme-region" value={form.region} onChange={(e) => update("region", e.target.value)} className={fieldClass("region")} aria-invalid={!!errors.region}><option value="">Chagua mkoa</option>{REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}</select>
                  <FieldError field="region" /></div>
                <div><label htmlFor="sme-district" className="text-sm font-bold">District <span className="text-red-500">*</span></label>
                  <input id="sme-district" value={form.district} onChange={(e) => update("district", e.target.value)} placeholder="Enter district" className={fieldClass("district")} aria-invalid={!!errors.district} />
                  <FieldError field="district" /></div>
              </div>

              {message && <div role="status" aria-live="polite" className={`rounded-xl border p-4 text-sm ${reference ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{message}{reference && <p className="mt-1 font-bold">Namba ya kumbukumbu: {reference}</p>}</div>}

              <button type="submit" disabled={submitting || uploading || authLoading} className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-red-700 to-rose-600 px-5 py-4 font-extrabold text-white shadow-lg shadow-red-600/20 transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? <><LoaderCircle size={19} className="animate-spin" /> Inatuma ombi...</> : <><Send size={18} /> Submit application</>}
              </button>
              <p className="text-center text-xs leading-5 text-slate-500">Taarifa zako zitatumwa kwa ajili ya kushughulikia ombi la SME VODACOM.</p>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
