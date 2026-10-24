import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleCheck, LoaderCircle, Send, Smartphone, Wifi } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { createServiceApplication } from "@/lib/firebase";
import { formatNida } from "../../../shared/serviceForms";
import type { ServiceFormValues } from "../../../shared/serviceForms";

const DATA_PLANS = [
  { price: 10000, data: "7 GB" }, { price: 15000, data: "10 GB" },
  { price: 20000, data: "22 GB" }, { price: 30000, data: "30 GB" },
  { price: 50000, data: "60 GB" }, { price: 60000, data: "75 GB" },
  { price: 75000, data: "100 GB" }, { price: 100000, data: "150 GB" },
];
const COMBO_PLANS = [
  { price: 15000, data: "7 GB", calls: "DAK 500", sms: "SMS 100" },
  { price: 20000, data: "10 GB", calls: "DAK 1,000", sms: "SMS 100" },
  { price: 30000, data: "20 GB", calls: "DAK 1,500", sms: "SMS 100" },
  { price: 50000, data: "50 GB", calls: "DAK 2,000", sms: "SMS 100" },
  { price: 60000, data: "60 GB", calls: "DAK 3,000", sms: "SMS 100" },
  { price: 75000, data: "80 GB", calls: "DAK 5,000", sms: "SMS 100" },
  { price: 100000, data: "120 GB", calls: "DAK 8,000", sms: "SMS 100" },
];
type PlanType = "data" | "combo";
type FormState = { phone: string; fullName: string; nidaNumber: string; contactPhone: string; voucherConfirmed: boolean; planType: PlanType; selectedPlan: string };
const INITIAL: FormState = { phone: "", fullName: "", nidaNumber: "", contactPhone: "", voucherConfirmed: false, planType: "data", selectedPlan: "" };
const normalizePhone = (value: string) => { const d = value.replace(/\D/g, ""); return d.startsWith("255") ? d : d.startsWith("0") ? "255" + d.slice(1) : d; };
const validPhone = (value: string) => /^255[67]\d{8}$/.test(normalizePhone(value));
const money = (value: number) => value.toLocaleString("en-TZ");
function newApplicationId() { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "sme-airtel-" + Date.now() + "-" + Math.random().toString(36).slice(2); }

export default function SmeAirtelPage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");
  const [applicationId, setApplicationId] = useState(newApplicationId);
  const plans = form.planType === "data" ? DATA_PLANS : COMBO_PLANS;
  const chosenPlan = useMemo(() => plans.find((p) => String(p.price) === form.selectedPlan), [plans, form.selectedPlan]);
  const update = (field: keyof FormState, value: string | boolean) => {
    setForm((old) => ({ ...old, [field]: value, ...(field === "planType" ? { selectedPlan: "" } : {}) }));
    setErrors((old) => ({ ...old, [field]: "" })); setMessage("");
  };
  const validate = () => {
    const next: Record<string, string> = {};
    if (!validPhone(form.phone)) next.phone = "Weka namba halali ya Airtel, mpya au ya zamani.";
    if (form.fullName.trim().split(/\s+/).filter(Boolean).length < 3) next.fullName = "Jaza majina yote matatu kama yalivyo kwenye kitambulisho.";
    if (!/^\d{20}$/.test(form.nidaNumber.replace(/\D/g, ""))) next.nidaNumber = "Namba ya NIDA lazima iwe na tarakimu 20.";
    if (!validPhone(form.contactPhone)) next.contactPhone = "Weka namba halali ya mawasiliano.";
    if (!form.voucherConfirmed) next.voucherConfirmed = "Thibitisha kuwa laini imewekewa vocha ya TSh 10,000 au zaidi.";
    if (!form.selectedPlan) next.selectedPlan = "Chagua kifurushi cha Airtel Business.";
    setErrors(next); return Object.keys(next).length === 0;
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage(""); setReference("");
    if (authLoading) return;
    if (!firebaseUser?.uid) { setMessage("Ingia kwenye akaunti yako kwanza ili kutuma ombi."); return; }
    if (!validate()) return;
    setSubmitting(true);
    try {
      const values: ServiceFormValues = {
        network: "Airtel", smePhone: normalizePhone(form.phone), phoneType: "mpya-au-ya-zamani",
        fullName: form.fullName.trim().replace(/\s+/g, " "), nidaNumber: formatNida(form.nidaNumber),
        contactPhone: normalizePhone(form.contactPhone), voucherAmount: 10000,
        voucherConfirmed: "NDIYO", planType: form.planType, selectedPlan: form.selectedPlan,
        selectedPlanName: (form.planType === "data" ? "DATA BANDO" : "COMBO BANDO") + " — TSh " + money(Number(form.selectedPlan)),
        reward: 2000, rewardCurrency: "TZS", rewardRule: "TSh 2,000 kwa kila SME itakayokubaliwa na kuthibitishwa na admin",
      };
      const result = await createServiceApplication(applicationId, "sme-airtel", values);
      const ref = String(result.reference ?? result.applicationId ?? applicationId);
      setReference(ref); setMessage("Ombi la SME AIRTEL limetumwa kwa mafanikio. Malipo ya TSh 2,000 kwa SME hutegemea ombi kukubaliwa na kuthibitishwa na admin.");
      setForm(INITIAL); setApplicationId(newApplicationId());
      toast.success("Ombi la SME AIRTEL limetumwa kwa admin.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Imeshindikana kutuma ombi.";
      setMessage(detail); toast.error(detail);
    } finally { setSubmitting(false); }
  };
  const fieldClass = (key: string) => "mt-2 w-full rounded-xl border bg-white px-4 py-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-100 " + (errors[key] ? "border-red-500" : "border-slate-200");
  const FieldError = ({ field }: { field: string }) => errors[field] ? <p className="mt-1.5 text-xs font-semibold text-red-600">{errors[field]}</p> : null;

  return <main className="min-h-screen bg-[#f5f6fa] px-3 py-5 text-slate-800 sm:px-6 sm:py-8">
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold text-slate-500 hover:bg-white hover:text-red-700"><ArrowLeft size={17}/> Huduma zote</Link>
      <header className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#ed1c24] via-[#bd0014] to-[#68000a] text-white shadow-xl">
        <div className="grid gap-6 p-6 sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center lg:p-11">
          <div><span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-black tracking-[.18em]">AIRTEL BUSINESS</span>
            <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">SME <span className="text-red-100">AIRTEL</span></h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/85 sm:text-base">Sajili laini mpya au ya zamani kwenye SME Airtel. Jaza taarifa sahihi kama zilivyo kwenye kitambulisho na chagua kifurushi cha biashara.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-white"><span className="rounded-lg bg-white/15 px-3 py-2">✓ Laini mpya au ya zamani</span><span className="rounded-lg bg-white/15 px-3 py-2">✓ Vocha kuanzia TSh 10,000</span><span className="rounded-lg bg-white/15 px-3 py-2">✓ Zawadi TSh 2,000 kwa SME iliyothibitishwa</span></div>
          </div>
          <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white text-4xl font-black italic text-red-600 shadow-2xl sm:h-36 sm:w-36">airtel</div>
        </div>
      </header>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><span className="text-xs font-black tracking-[.18em] text-red-700">VIFURUSHI VYA BIASHARA</span><h2 className="mt-1 text-xl font-black sm:text-2xl">Chagua kifurushi</h2><p className="mt-1 text-sm text-slate-500">Bei ni TSh kwa mwezi.</p></div>
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Aina ya kifurushi">
            <button type="button" role="tab" aria-selected={form.planType === "data"} onClick={() => update("planType", "data")} className={"rounded-lg px-4 py-2.5 text-sm font-extrabold " + (form.planType === "data" ? "bg-red-700 text-white shadow" : "text-slate-600") }><Wifi size={15} className="mr-1 inline"/> Data bando</button>
            <button type="button" role="tab" aria-selected={form.planType === "combo"} onClick={() => update("planType", "combo")} className={"rounded-lg px-4 py-2.5 text-sm font-extrabold " + (form.planType === "combo" ? "bg-red-700 text-white shadow" : "text-slate-600")}><Smartphone size={15} className="mr-1 inline"/> Combo bando</button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => { const selected = form.selectedPlan === String(plan.price); const combo = "calls" in plan; return <button key={plan.price} type="button" onClick={() => update("selectedPlan", String(plan.price))} className={"relative rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md " + (selected ? "border-red-600 bg-red-50 ring-2 ring-red-600/15" : "border-slate-200 bg-white hover:border-red-300")}>
            {selected && <span className="absolute right-3 top-3 text-red-700"><CircleCheck size={20}/></span>}
            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black tracking-wider text-slate-600">KILA MWEZI</span>
            <p className="mt-3 text-2xl font-black text-slate-900">{plan.data}</p><p className="mt-1 text-sm font-bold text-red-700">TSh {money(plan.price)}</p>
            {combo ? <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-600"><p>☎ {plan.calls}</p><p>✉ {plan.sms}</p></div> : <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">Data pekee</p>}
            <span className={"mt-3 inline-flex items-center gap-1 text-xs font-extrabold " + (selected ? "text-red-700" : "text-slate-500")}>{selected ? "Kimechaguliwa" : "Chagua kifurushi"}</span>
          </button>; })}
        </div><FieldError field="selectedPlan"/>
        <div className="mt-5 flex flex-col gap-2 rounded-2xl bg-slate-900 p-4 text-white sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-white/60">Kifurushi ulichochagua</p><p className="mt-1 text-lg font-black">{chosenPlan ? chosenPlan.data + " · TSh " + money(chosenPlan.price) : "Bado hujachagua kifurushi"}</p></div><span className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-3 py-2 text-xs font-bold"><CheckCircle2 size={15}/> Airtel Business</span></div>
      </section>

      <section className="mt-6 grid items-start gap-6 lg:grid-cols-[.7fr_1.3fr]">
        <aside className="rounded-3xl bg-[#fff1f2] p-5 ring-1 ring-red-100 sm:p-6"><span className="text-xs font-black tracking-[.18em] text-red-700">ZAWADI YA SME</span><p className="mt-2 text-4xl font-black text-red-700">TSh 2,000</p><p className="mt-2 text-sm leading-6 text-slate-600">Kwa kila SME moja itakayokubaliwa na kuthibitishwa na admin. Zawadi hii si malipo ya papo hapo wakati wa kutuma ombi.</p><div className="mt-5 rounded-2xl bg-white p-4 text-sm font-semibold text-slate-700">Laini lazima iwe imewekewa vocha ya angalau <strong>TSh 10,000</strong>.</div></aside>
        <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7">
          <div className="mb-6"><span className="text-xs font-black tracking-[.18em] text-red-700">TAARIFA ZA MWOMBAJI</span><h2 className="mt-1 text-2xl font-black">Jaza fomu ya SME Airtel</h2><p className="mt-1 text-sm text-slate-500">Hakikisha taarifa zinafanana na kitambulisho.</p></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="text-sm font-bold">Namba ya simu ya Airtel (mpya au ya zamani) *</span><input required autoComplete="tel" inputMode="tel" value={form.phone} onChange={e => update("phone", e.target.value)} placeholder="Mfano 0681234567" className={fieldClass("phone")}/><FieldError field="phone"/></label>
            <label className="block sm:col-span-2"><span className="text-sm font-bold">Majina yote matatu kama yalivyo kwenye kitambulisho *</span><input required value={form.fullName} onChange={e => update("fullName", e.target.value)} placeholder="Jina la kwanza, la pili na la tatu" className={fieldClass("fullName")}/><FieldError field="fullName"/></label>
            <label className="block"><span className="text-sm font-bold">Namba ya NIDA *</span><input required inputMode="numeric" maxLength={23} value={form.nidaNumber} onChange={e => update("nidaNumber", e.target.value.replace(/[^\d-]/g, "").slice(0, 23))} placeholder="Tarakimu 20 za NIDA" className={fieldClass("nidaNumber")}/><FieldError field="nidaNumber"/></label>
            <label className="block"><span className="text-sm font-bold">Namba ya mawasiliano *</span><input required autoComplete="tel" inputMode="tel" value={form.contactPhone} onChange={e => update("contactPhone", e.target.value)} placeholder="Mfano 0712345678" className={fieldClass("contactPhone")}/><FieldError field="contactPhone"/></label>
            <label className="flex items-start gap-3 rounded-2xl border p-4 sm:col-span-2" style={{borderColor: errors.voucherConfirmed ? "#dc2626" : "#fecdd3", background: "#fff7f7"}}><input type="checkbox" checked={form.voucherConfirmed} onChange={e => update("voucherConfirmed", e.target.checked)} className="mt-1 h-4 w-4 accent-red-600"/><span className="text-sm font-semibold leading-6">Nathibitisha kuwa laini hii imewekewa vocha ya <strong>TSh 10,000 au zaidi</strong>. *<FieldError field="voucherConfirmed"/></span></label>
          </div>
          {message && <div role="status" className={"mt-5 rounded-2xl border p-4 text-sm font-semibold " + (reference ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>{message}{reference && <p className="mt-2 break-all text-xs">Namba ya kumbukumbu: <strong>{reference}</strong></p>}</div>}
          <button type="submit" disabled={submitting || authLoading} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-4 text-sm font-black text-white shadow-lg transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <><LoaderCircle size={18} className="animate-spin"/> Inatuma ombi...</> : <><Send size={17}/> TUMA OMBI LA SME AIRTEL</>}</button>
          <p className="mt-3 text-center text-xs leading-5 text-slate-500">Kwa kutuma ombi unathibitisha kuwa taarifa ni sahihi. Zawadi ya SME huhesabiwa baada ya uthibitisho wa admin.</p>
        </form>
      </section>
    </div>
  </main>;
}
