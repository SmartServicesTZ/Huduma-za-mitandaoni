import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, CircleCheck, FileText, LoaderCircle, Send, ShieldCheck, Smartphone, Wallet, Wifi } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { createServiceApplication } from "@/lib/firebase";
import { formatNida } from "../../../shared/serviceForms";
import type { ServiceFormValues } from "../../../shared/serviceForms";

const DATA_PLANS = [
  { price: 15000, data: "10 GB" }, { price: 20000, data: "15 GB" },
  { price: 30000, data: "30 GB" }, { price: 50000, data: "60 GB" },
  { price: 60000, data: "75 GB" }, { price: 75000, data: "100 GB" },
  { price: 100000, data: "150 GB" },
];
const COMBO_PLANS = [
  { price: 15000, data: "7 GB", calls: "DKK 500", sms: "SMS 100" },
  { price: 20000, data: "10 GB", calls: "DKK 1,000", sms: "SMS 100" },
  { price: 30000, data: "20 GB", calls: "DKK 1,500", sms: "SMS 100" },
  { price: 50000, data: "50 GB", calls: "DKK 2,000", sms: "SMS 100" },
  { price: 60000, data: "60 GB", calls: "DKK 3,000", sms: "SMS 100" },
  { price: 75000, data: "80 GB", calls: "DKK 5,000", sms: "SMS 100" },
  { price: 100000, data: "120 GB", calls: "DKK 8,000", sms: "SMS 100" },
];
type PlanType = "data" | "combo";
type FormState = {
  fullName: string; nidaNumber: string; smePhone: string; contactPhone: string;
  voucherAmount: string; hasTin: string; tinNumber: string; planType: PlanType; selectedPlan: string;
};
const INITIAL: FormState = {
  fullName: "", nidaNumber: "", smePhone: "", contactPhone: "",
  voucherAmount: "", hasTin: "", tinNumber: "", planType: "data", selectedPlan: "",
};
function newApplicationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : `sme-vodacom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("255")) return digits;
  if (digits.startsWith("0")) return `255${digits.slice(1)}`;
  return digits;
}
function validPhone(value: string) { return /^255[67]\d{8}$/.test(normalizePhone(value)); }
function money(value: number) { return value.toLocaleString("en-TZ"); }
function formatTin(value: string) { const digits = value.replace(/\D/g, "").slice(0, 9); return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean).join("-"); }

export default function SmeVodacomPage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");
  const [applicationId, setApplicationId] = useState(newApplicationId);
  const plans = form.planType === "data" ? DATA_PLANS : COMBO_PLANS;
  const chosenPlan = useMemo(() => plans.find((plan) => String(plan.price) === form.selectedPlan), [plans, form.selectedPlan]);

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value, ...(field === "planType" ? { selectedPlan: "" } : {}) }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setMessage("");
  };
  const validate = () => {
    const next: Record<string, string> = {};
    if (form.fullName.trim().length < 3) next.fullName = "Jaza majina kamili.";
    if (!/^\d{20}$/.test(form.nidaNumber.replace(/\D/g, ""))) next.nidaNumber = "NIDA lazima iwe na tarakimu 20.";
    if (!validPhone(form.smePhone)) next.smePhone = "Weka namba ya Tanzania inayoanza na 255, mfano 255712000000.";
    if (!validPhone(form.contactPhone)) next.contactPhone = "Weka namba halali ya mawasiliano, mfano 255754000000.";
    if (form.hasTin === "ndio" && !/^\d{9}$/.test(form.tinNumber.replace(/\D/g, ""))) next.tinNumber = "Weka TIN kwa muundo 133-231-251.";
    if (!form.hasTin) next.hasTin = "Chagua kama una namba ya TIN au huna.";
    const voucher = Number(form.voucherAmount);
    if (!form.voucherAmount || !Number.isFinite(voucher) || voucher < 15000) next.voucherAmount = "Kiasi cha vocha lazima kiwe TSh 15,000 au zaidi.";
    if (!form.selectedPlan) next.selectedPlan = "Chagua kifurushi unachotaka.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage(""); setReference("");
    if (authLoading) return;
    if (!firebaseUser?.uid) { setMessage("Ingia kwenye akaunti yako kwanza ili kutuma ombi."); return; }
    if (!validate()) return;
    setSubmitting(true);
    try {
      const values: ServiceFormValues = {
        fullName: form.fullName.trim(), nidaNumber: formatNida(form.nidaNumber),
        smePhone: normalizePhone(form.smePhone), contactPhone: normalizePhone(form.contactPhone),
        alternativePhone: normalizePhone(form.contactPhone), alternatePhone: normalizePhone(form.contactPhone),
        hasTin: form.hasTin, tinNumber: form.hasTin === "ndio" ? formatTin(form.tinNumber) : "HANA",
        voucherAmount: String(Number(form.voucherAmount)), planType: form.planType,
        selectedPlan: form.selectedPlan, selectedPlanName: `${form.planType === "data" ? "Data Plan" : "Combo Plan"} — TSh ${money(Number(form.selectedPlan))}`,
      };
      const result = await createServiceApplication(applicationId, "sme-vodacom", values);
      const ref = String(result.reference ?? result.applicationId ?? applicationId);
      setReference(ref); setMessage("Ombi lako la SME VODACOM limetumwa kwa mafanikio.");
      setForm(INITIAL); setApplicationId(newApplicationId());
      toast.success("Ombi la SME VODACOM limetumwa kwa admin.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Imeshindikana kutuma ombi.";
      setMessage(detail); toast.error(detail);
    } finally { setSubmitting(false); }
  };
  const fieldClass = (field: string) =>
    `mt-2 w-full rounded-xl border bg-white px-4 py-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-100 ${errors[field] ? "border-red-500" : "border-slate-200"}`;
  const FieldError = ({ field }: { field: string }) => errors[field] ? <p className="mt-1.5 text-xs font-semibold text-red-600">{errors[field]}</p> : null;

  return (
    <main className="min-h-screen bg-[#f5f6fa] px-3 py-5 text-slate-800 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-white hover:text-red-700"><ArrowLeft size={17}/> Huduma zote</Link>
        <header className="relative isolate overflow-hidden rounded-[2rem] bg-[#70000a] text-white shadow-xl">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#a80016] via-[#79000b] to-[#350006]"/>
          <div className="pointer-events-none absolute -right-10 -top-14 -z-10 h-72 w-72 rounded-full border-[40px] border-white/5"/>
          <div className="grid gap-6 p-6 sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center lg:p-11">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-black tracking-[.18em]">VODACOM BUSINESS</span>
                <span className="flex items-center gap-2 rounded-full bg-emerald-300/15 px-3 py-1.5 text-xs font-bold text-emerald-100"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300"/> Huduma inapatikana</span>
              </div>
              <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">SME <span className="text-red-200">VODACOM</span></h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80 sm:text-base">Omba kuunganishwa kwenye vifurushi vya biashara vya siku 30. Linganisha Data Plan na Combo Plan, chagua kifurushi, kisha weka taarifa zako kwa usahihi.</p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-white/85">
                <span className="rounded-lg bg-white/10 px-3 py-2">✓ Vifurushi vya siku 30</span><span className="rounded-lg bg-white/10 px-3 py-2">✓ Taarifa za TIN huulizwa</span><span className="rounded-lg bg-white/10 px-3 py-2">✓ Vocha kuanzia TSh 15,000</span>
              </div>
            </div>
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white p-4 shadow-2xl ring-1 ring-white/40 sm:h-36 sm:w-36">
              <img src="/Huduma-za-mitandaoni/vodacom-logo.png" alt="Vodacom" className="h-full w-full object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }}/>
              <Wifi className="absolute h-10 w-10 text-red-700" aria-hidden="true"/>
            </div>
          </div>
        </header>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><span className="text-xs font-black tracking-[.18em] text-red-700">CHAGUA KIFURUSHI</span><h2 className="mt-1 text-xl font-black sm:text-2xl">Bei na vifurushi vya SME</h2><p className="mt-1 text-sm text-slate-500">Bei zote ni TSh, na vifurushi ni vya siku 30.</p></div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Aina ya kifurushi">
              <button type="button" role="tab" aria-selected={form.planType === "data"} onClick={() => update("planType", "data")} className={`rounded-lg px-4 py-2.5 text-sm font-extrabold transition ${form.planType === "data" ? "bg-red-700 text-white shadow" : "text-slate-600 hover:bg-white"}`}> <Wifi size={15} className="mr-1 inline"/> Data</button>
              <button type="button" role="tab" aria-selected={form.planType === "combo"} onClick={() => update("planType", "combo")} className={`rounded-lg px-4 py-2.5 text-sm font-extrabold transition ${form.planType === "combo" ? "bg-red-700 text-white shadow" : "text-slate-600 hover:bg-white"}`}><Smartphone size={15} className="mr-1 inline"/> Combo</button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const selected = form.selectedPlan === String(plan.price);
              const combo = "calls" in plan;
              return <button key={plan.price} type="button" onClick={() => update("selectedPlan", String(plan.price))} className={`group relative rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selected ? "border-red-600 bg-red-50 ring-2 ring-red-600/15" : "border-slate-200 bg-white hover:border-red-300"}`}>
                {selected && <span className="absolute right-3 top-3 text-red-700"><CircleCheck size={20}/></span>}
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black tracking-wider text-slate-600">SIKU 30</span>
                <p className="mt-3 text-2xl font-black tracking-tight text-slate-900">{plan.data}</p>
                <p className="mt-1 text-sm font-bold text-red-700">TSh {money(plan.price)}</p>
                {combo && <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-600"><p>☎ {plan.calls}</p><p>✉ {plan.sms}</p></div>}
                {!combo && <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">Data pekee · siku 30</p>}
                <span className={`mt-3 inline-flex items-center gap-1 text-xs font-extrabold ${selected ? "text-red-700" : "text-slate-500 group-hover:text-red-700"}`}>{selected ? "Kimechaguliwa" : "Chagua kifurushi"} <ChevronDown size={14}/></span>
              </button>;
            })}
          </div>
          <FieldError field="selectedPlan"/>
          <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-slate-900 p-4 text-white sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div><p className="text-xs font-bold uppercase tracking-wider text-white/60">Kifurushi ulichochagua</p><p className="mt-1 text-lg font-black">{chosenPlan ? `${chosenPlan.data} · TSh ${money(chosenPlan.price)}` : "Bado hujachagua kifurushi"}</p></div>
            <span className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white/80 sm:self-auto"><CheckCircle2 size={15}/> Siku 30</span>
          </div>
        </section>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[.7fr_1.3fr]">
          <aside className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white sm:p-6"><ShieldCheck size={25} className="text-red-300"/><h2 className="mt-3 text-xl font-black">Tayarisha maombi</h2><p className="mt-2 text-sm leading-6 text-white/70">Hakikisha una taarifa na nyaraka hizi kabla ya kutuma.</p></div>
            <div className="space-y-4 p-5 sm:p-6">
              {["Majina kamili yanayolingana na NIDA","Namba ya NIDA yenye tarakimu 20","Namba ya SME na namba ya mawasiliano","Namba ya TIN (ikiwa unayo)","Vocha iliyowekwa ya angalau TSh 15,000"].map((item, index) => <div key={item} className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-black text-red-700">{index + 1}</span><p className="pt-1 text-sm font-semibold leading-5 text-slate-700">{item}</p></div>)}
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900"><b>Mchakato:</b> Tuma ombi, subiri kushughulikiwa, kisha fuata maelekezo ya malipo ya Control Number yatakayotolewa na Vodacom.</div>
            </div>
          </aside>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-5"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-700"><FileText size={23}/></span><div><p className="text-xs font-black tracking-[.16em] text-red-700">HATUA YA 2</p><h2 className="text-xl font-black sm:text-2xl">Taarifa za mwombaji</h2><p className="mt-1 text-sm text-slate-500">Jaza sehemu zote zenye alama ya *</p></div></div>
            {!firebaseUser && !authLoading && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Ingia kwenye akaunti yako kabla ya kujaza na kutuma ombi.</div>}
            <form onSubmit={submit} noValidate className="mt-6 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div><label htmlFor="sme-full-name" className="text-sm font-extrabold">Majina kamili <span className="text-red-600">*</span></label><input id="sme-full-name" autoComplete="name" value={form.fullName} onChange={(e) => update("fullName", e.target.value)} placeholder="Andika majina yako yote" className={fieldClass("fullName")} aria-invalid={!!errors.fullName}/><FieldError field="fullName"/></div>
                <div><label htmlFor="sme-nida" className="text-sm font-extrabold">Namba ya NIDA <span className="text-red-600">*</span></label><input id="sme-nida" inputMode="numeric" value={form.nidaNumber} onChange={(e) => update("nidaNumber", e.target.value.replace(/\D/g, "").slice(0,20))} placeholder="Tarakimu 20" className={fieldClass("nidaNumber")} aria-invalid={!!errors.nidaNumber}/><FieldError field="nidaNumber"/></div>
                <div><label htmlFor="sme-phone" className="text-sm font-extrabold">Namba ya Vodacom ya SME <span className="text-red-600">*</span></label><input id="sme-phone" type="tel" autoComplete="tel" value={form.smePhone} onChange={(e) => update("smePhone", e.target.value)} placeholder="255712000000" className={fieldClass("smePhone")} aria-invalid={!!errors.smePhone}/><FieldError field="smePhone"/></div>
                <div><label htmlFor="sme-alternative" className="text-sm font-extrabold">Namba ya mawasiliano <span className="text-red-600">*</span></label><input id="sme-alternative" type="tel" value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} placeholder="255754000000" className={fieldClass("contactPhone")} aria-invalid={!!errors.contactPhone}/><FieldError field="contactPhone"/></div>
              </div>
              <div className="rounded-2xl border border-red-100 bg-red-50/70 p-4 sm:p-5">
                <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-red-700 shadow-sm"><Wallet size={21}/></span><div className="flex-1"><label htmlFor="sme-voucher" className="text-sm font-black text-slate-900">Vocha imewekwa ya shilingi ngapi? <span className="text-red-600">*</span></label><p className="mt-1 text-xs leading-5 text-slate-600">Ingiza kiasi cha vocha kilichowekwa kwenye laini. Kiwango cha chini ni TSh 15,000.</p><div className="relative mt-3"><span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-black text-slate-500">TSh</span><input id="sme-voucher" type="number" min="15000" step="1000" inputMode="numeric" value={form.voucherAmount} onChange={(e) => update("voucherAmount", e.target.value)} placeholder="Mfano: 15000" className={`${fieldClass("voucherAmount")} pl-14`} aria-invalid={!!errors.voucherAmount}/></div><FieldError field="voucherAmount"/></div></div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <label className="text-sm font-extrabold text-slate-900">Je, unayo namba ya TIN? <span className="text-red-600">*</span></label>
                <p className="mt-1 text-xs text-slate-500">Chagua jibu. Ukiwa nayo, andika namba yako ya TIN hapa chini.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-bold ${form.hasTin === "ndio" ? "border-red-600 bg-red-50 text-red-700" : "border-slate-200"}`}><input type="radio" name="hasTin" value="ndio" checked={form.hasTin === "ndio"} onChange={() => update("hasTin", "ndio")} className="accent-red-700"/> Ndiyo, ninayo</label>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-bold ${form.hasTin === "hana" ? "border-red-600 bg-red-50 text-red-700" : "border-slate-200"}`}><input type="radio" name="hasTin" value="hana" checked={form.hasTin === "hana"} onChange={() => { update("hasTin", "hana"); update("tinNumber", ""); }} className="accent-red-700"/> Sina TIN</label>
                </div>
                <FieldError field="hasTin"/>
                {form.hasTin === "ndio" && <div className="mt-4"><label htmlFor="sme-tin-number" className="text-sm font-extrabold">Namba ya TIN <span className="text-red-600">*</span></label><input id="sme-tin-number" inputMode="numeric" value={form.tinNumber} onChange={(e) => update("tinNumber", formatTin(e.target.value))} placeholder="133-231-251" className={fieldClass("tinNumber")} aria-invalid={!!errors.tinNumber}/><FieldError field="tinNumber"/></div>}
              </div>
                            {message && <div role="status" aria-live="polite" className={`rounded-2xl border p-4 text-sm ${reference ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{message}{reference && <p className="mt-1 font-black">Namba ya kumbukumbu: {reference}</p>}</div>}
              <button type="submit" disabled={submitting || authLoading} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#a90017] to-[#d20b2c] px-5 py-4 font-black text-white shadow-lg shadow-red-700/20 transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <><LoaderCircle size={19} className="animate-spin"/> Inatuma ombi...</> : <><Send size={18}/> TUMA OMBI LA SME VODACOM</>}</button>
              <p className="text-center text-xs leading-5 text-slate-500">Taarifa zako zitatumwa kwa ajili ya kushughulikia ombi la SME VODACOM.</p>
            </form>
          </section>
        </div>
        <footer className="py-7 text-center text-xs font-semibold tracking-wide text-slate-400">VODACOM SME · Growth for your business, every step of the way.</footer>
      </div>
    </main>
  );
}
