import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, CheckCircle2, CircleCheck, CreditCard, LoaderCircle, Phone, Send,
  ShieldCheck, Smartphone, Sparkles, User, Wifi, Gift,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { createServiceApplication, updateServiceApplication, subscribeUserServiceApplications, type ServiceApplication } from "@/lib/firebase";
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
type PlanOption = { price: number; data: string; calls?: string; sms?: string };
type PlanType = "data" | "combo";
type FormState = { phone: string; fullName: string; nidaNumber: string; contactPhone: string; hasTin: "" | "ndio" | "hana"; tinNumber: string; voucherConfirmed: boolean; planType: PlanType; selectedPlan: string };
const INITIAL: FormState = { phone: "", fullName: "", nidaNumber: "", contactPhone: "", hasTin: "", tinNumber: "", voucherConfirmed: false, planType: "data", selectedPlan: "" };
const normalizePhone = (value: string) => { const d = value.replace(/\D/g, ""); return d.startsWith("255") ? d : d.startsWith("0") ? "255" + d.slice(1) : d; };
const validPhone = (value: string) => /^255[67]\d{8}$/.test(normalizePhone(value));
const money = (value: number) => value.toLocaleString("en-TZ");
function newApplicationId() { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "sme-airtel-" + Date.now() + "-" + Math.random().toString(36).slice(2); }

/* Animations — zimewekwa hapa ili ukurasa ujitegemee (hakuna haja ya kuhariri tailwind.config) */
const ANIMATION_CSS = `
@keyframes sa-fadeInUp { from { opacity:0; transform: translateY(24px) scale(.98);} to { opacity:1; transform:none; } }
@keyframes sa-fadeIn { from { opacity:0 } to { opacity:1 } }
@keyframes sa-pop { 0% { transform: scale(0) rotate(-20deg); opacity:0 } 70% { transform: scale(1.25) rotate(6deg); opacity:1 } 100% { transform: scale(1) rotate(0) } }
@keyframes sa-float { 0%,100% { transform: translateY(0) rotate(-3deg) } 50% { transform: translateY(-12px) rotate(3deg) } }
@keyframes sa-orb { 0%,100% { transform: translate(0,0) scale(1) } 33% { transform: translate(30px,-20px) scale(1.15) } 66% { transform: translate(-20px,25px) scale(.9) } }
@keyframes sa-gradient { 0%,100% { background-position: 0% 50% } 50% { background-position: 100% 50% } }
@keyframes sa-shimmer { 0% { transform: translateX(-120%) skewX(-20deg) } 100% { transform: translateX(260%) skewX(-20deg) } }
@keyframes sa-slideDown { from { opacity:0; max-height:0; transform: translateY(-8px) } to { opacity:1; max-height:200px; transform:none } }
@keyframes sa-ring { 0% { box-shadow: 0 0 0 0 rgba(237,28,36,.45) } 100% { box-shadow: 0 0 0 16px rgba(237,28,36,0) } }
@keyframes sa-swap { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
@keyframes sa-shake { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-5px) } 75% { transform: translateX(5px) } }
.sa-in { animation: sa-fadeInUp .7s cubic-bezier(.22,1,.36,1) both; }
.sa-fade { animation: sa-fadeIn .6s ease-out both; }
.sa-pop { animation: sa-pop .45s cubic-bezier(.34,1.56,.64,1) both; }
.sa-float { animation: sa-float 6s ease-in-out infinite; }
.sa-orb { animation: sa-orb 14s ease-in-out infinite; }
.sa-gradient { background-size: 220% 220%; animation: sa-gradient 12s ease infinite; }
.sa-slide { overflow: hidden; animation: sa-slideDown .4s cubic-bezier(.22,1,.36,1) both; }
.sa-ring { animation: sa-ring 1.8s ease-out infinite; }
.sa-swap { animation: sa-swap .35s ease-out both; }
.sa-shake { animation: sa-shake .35s ease-in-out; }
.sa-btn { position: relative; overflow: hidden; }
.sa-btn::after { content:""; position:absolute; top:0; bottom:0; left:0; width:35%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent); animation: sa-shimmer 2.8s ease-in-out infinite; }
.sa-btn:disabled::after { display:none; }
@media (prefers-reduced-motion: reduce) {
  .sa-in,.sa-fade,.sa-pop,.sa-float,.sa-orb,.sa-gradient,.sa-slide,.sa-ring,.sa-swap,.sa-shake,.sa-btn::after { animation: none !important; }
}
`;
export default function SmeAirtelPage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");
  const [applicationId, setApplicationId] = useState(newApplicationId);
  const [editingApplicationId, setEditingApplicationId] = useState<string | null>(null);
  const [myApplications, setMyApplications] = useState<ServiceApplication[]>([]);
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    if (!firebaseUser?.uid) { setMyApplications([]); return; }
    return subscribeUserServiceApplications(firebaseUser.uid, (rows) => setMyApplications(rows.filter((row) => row.serviceSlug === "sme-airtel")));
  }, [firebaseUser?.uid]);

  const plans: PlanOption[] = form.planType === "data" ? DATA_PLANS : COMBO_PLANS;
  const chosenPlan = useMemo(() => plans.find((p) => String(p.price) === form.selectedPlan), [plans, form.selectedPlan]);

  const progress = useMemo(() => {
    const steps = [
      validPhone(form.phone),
      form.fullName.trim().split(/\s+/).filter(Boolean).length >= 3,
      /^\d{20}$/.test(form.nidaNumber.replace(/\D/g, "")),
      validPhone(form.contactPhone),
      form.hasTin === "hana" || (form.hasTin === "ndio" && /^\d{9}$/.test(form.tinNumber)),
      form.voucherConfirmed,
      !!form.selectedPlan,
    ];
    const done = steps.filter(Boolean).length;
    return { done, total: steps.length, pct: Math.round((done / steps.length) * 100) };
  }, [form]);

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
    if (!form.hasTin) next.hasTin = "Chagua kama una TIN au huna.";
    if (form.hasTin === "ndio" && !/^\d{9}$/.test(form.tinNumber.replace(/\D/g, ""))) next.tinNumber = "Weka namba sahihi ya TIN yenye tarakimu 9.";
    if (!form.voucherConfirmed) next.voucherConfirmed = "Thibitisha kuwa laini imewekewa vocha ya TSh 10,000 au zaidi.";
    if (!form.selectedPlan) next.selectedPlan = "Chagua kifurushi cha Airtel Business.";
    setErrors(next);
    if (Object.keys(next).length) setShakeKey((k) => k + 1);
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
        network: "Airtel", smePhone: normalizePhone(form.phone), phoneType: "mpya-au-ya-zamani",
        fullName: form.fullName.trim().replace(/\s+/g, " "), nidaNumber: formatNida(form.nidaNumber),
        contactPhone: normalizePhone(form.contactPhone), hasTin: form.hasTin,
        tinNumber: form.hasTin === "ndio" ? form.tinNumber.replace(/\D/g, "") : "HANA", voucherAmount: 10000,
        voucherConfirmed: "NDIYO", planType: form.planType, selectedPlan: form.selectedPlan,
        selectedPlanName: (form.planType === "data" ? "DATA BANDO" : "COMBO BANDO") + " — TSh " + money(Number(form.selectedPlan)),
        reward: 2000, rewardCurrency: "TZS", rewardRule: "TSh 2,000 kwa kila SME itakayokubaliwa na kuthibitishwa na admin",
      };
      if (editingApplicationId) {
        await updateServiceApplication(editingApplicationId, values);
        setReference(editingApplicationId); setMessage("Mabadiliko ya ombi lako la SME AIRTEL yamehifadhiwa.");
        setEditingApplicationId(null); setForm(INITIAL); setApplicationId(newApplicationId());
        toast.success("Mabadiliko ya ombi yamehifadhiwa.");
      } else {
        const result = await createServiceApplication(applicationId, "sme-airtel", values);
        const ref = String(result.reference ?? result.applicationId ?? applicationId);
        setReference(ref); setMessage("Ombi la SME AIRTEL limetumwa kwa mafanikio. Malipo ya TSh 2,000 kwa SME hutegemea ombi kukubaliwa na kuthibitishwa na admin.");
        setForm(INITIAL); setApplicationId(newApplicationId());
        toast.success("Ombi la SME AIRTEL limetumwa kwa admin.");
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Imeshindikana kutuma ombi.";
      setMessage(detail); toast.error(detail);
    } finally { setSubmitting(false); }
  };

  const fieldClass = (key: string, withIcon = true) =>
    "w-full rounded-2xl border-2 bg-slate-50/70 py-3.5 pr-4 text-sm font-medium text-slate-800 outline-none transition-all duration-300 placeholder:text-slate-400 hover:border-slate-300 hover:bg-white focus:-translate-y-0.5 focus:border-red-500 focus:bg-white focus:shadow-[0_10px_30px_-10px_rgba(237,28,36,.35)] focus:ring-4 focus:ring-red-100 " +
    (withIcon ? "pl-12 " : "pl-4 ") + (errors[key] ? "border-red-400 bg-red-50/50" : "border-transparent");

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? <p className="sa-swap mt-1.5 text-xs font-semibold text-red-600">{errors[field]}</p> : null;

  const iconClass = "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors duration-300 group-focus-within:text-red-600";

  const statusBadge = (status: string) =>
    status === "APPROVED" ? "bg-emerald-100 text-emerald-800"
      : status === "REJECTED" ? "bg-red-100 text-red-800"
      : status === "PROCESSING" ? "bg-blue-100 text-blue-800"
      : "bg-amber-100 text-amber-800";

  return <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#f7f8fc] via-[#f3f4fa] to-[#eef0f8] px-3 py-5 text-slate-800 sm:px-6 sm:py-8">
    <style>{ANIMATION_CSS}</style>

    {/* mandharinyuma laini */}
    <div aria-hidden className="pointer-events-none absolute -left-32 top-40 h-96 w-96 rounded-full bg-red-200/40 blur-3xl sa-orb" />
    <div aria-hidden className="pointer-events-none absolute -right-32 top-[55%] h-96 w-96 rounded-full bg-rose-300/30 blur-3xl sa-orb" style={{ animationDelay: "-6s" }} />

    <div className="relative mx-auto max-w-6xl">
      <Link href="/" className="sa-fade mb-4 inline-flex items-center gap-2 rounded-full border border-white bg-white/70 px-4 py-2 text-sm font-bold text-slate-500 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-x-1 hover:bg-white hover:text-red-700 hover:shadow-md">
        <ArrowLeft size={17} /> Huduma zote
      </Link>

      {/* HEADER */}
      <header className="sa-in sa-gradient relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#ff2b35] via-[#c4001a] to-[#5c0009] text-white shadow-[0_30px_80px_-20px_rgba(190,0,20,.55)]">
        <div aria-hidden className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/15 blur-3xl sa-orb" />
        <div aria-hidden className="absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-rose-300/20 blur-3xl sa-orb" style={{ animationDelay: "-5s" }} />
        <div aria-hidden className="absolute inset-0 opacity-[.12]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <div className="grid gap-6 p-6 sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center lg:p-11">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-[11px] font-black tracking-[.18em] backdrop-blur">
              <span className="sa-ring h-2 w-2 rounded-full bg-white" /> AIRTEL BUSINESS
            </span>
            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">SME <span className="bg-gradient-to-r from-white to-red-200 bg-clip-text text-transparent">AIRTEL</span></h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/85 sm:text-base">Sajili laini mpya au ya zamani kwenye SME Airtel. Jaza taarifa sahihi kama zilivyo kwenye kitambulisho na chagua kifurushi cha biashara.</p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold text-white">
              {["Laini mpya au ya zamani", "Vocha kuanzia TSh 10,000", "Zawadi TSh 2,000 kwa SME iliyothibitishwa"].map((t, i) => (
                <span key={t} className="sa-in inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/15 px-3 py-2 backdrop-blur transition hover:bg-white/25" style={{ animationDelay: `${300 + i * 120}ms` }}>
                  <CheckCircle2 size={14} /> {t}
                </span>
              ))}
            </div>
          </div>
          <div className="sa-float flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white text-4xl font-black italic text-red-600 shadow-[0_25px_60px_-10px_rgba(0,0,0,.45)] sm:h-36 sm:w-36">airtel</div>
        </div>
      </header>
    {/* VIFURUSHI */}
      <section className="sa-in mt-6 rounded-3xl border border-white bg-white/80 p-4 shadow-[0_10px_40px_-15px_rgba(15,23,42,.15)] backdrop-blur-xl sm:p-6" style={{ animationDelay: "120ms" }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-xs font-black tracking-[.18em] text-red-700">VIFURUSHI VYA BIASHARA</span>
            <h2 className="mt-1 text-xl font-black sm:text-2xl">Chagua kifurushi</h2>
            <p className="mt-1 text-sm text-slate-500">Bei ni TSh kwa mwezi.</p>
          </div>
          <div className="relative inline-grid grid-cols-2 rounded-2xl bg-slate-100 p-1" role="tablist" aria-label="Aina ya kifurushi">
            <span aria-hidden className="absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-xl bg-gradient-to-r from-red-600 to-red-700 shadow-lg shadow-red-500/30 transition-all duration-500 ease-[cubic-bezier(.34,1.56,.64,1)]" style={{ left: form.planType === "data" ? "4px" : "calc(50%)" }} />
            <button type="button" role="tab" aria-selected={form.planType === "data"} onClick={() => update("planType", "data")} className={"relative z-10 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors duration-300 " + (form.planType === "data" ? "text-white" : "text-slate-600 hover:text-red-700")}><Wifi size={15} className="mr-1 inline" /> Data bando</button>
            <button type="button" role="tab" aria-selected={form.planType === "combo"} onClick={() => update("planType", "combo")} className={"relative z-10 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors duration-300 " + (form.planType === "combo" ? "text-white" : "text-slate-600 hover:text-red-700")}><Smartphone size={15} className="mr-1 inline" /> Combo bando</button>
          </div>
        </div>

        <div key={form.planType} className="mt-5 grid grid-cols-3 gap-1.5 sm:gap-3 lg:grid-cols-4">
          {plans.map((plan, i) => {
            const selected = form.selectedPlan === String(plan.price);
            const combo = "calls" in plan;
            return <button key={plan.price} type="button" onClick={() => update("selectedPlan", String(plan.price))}
              style={{ animationDelay: `${i * 60}ms` }}
              className={"sa-in group relative overflow-hidden rounded-xl border-2 p-2 text-left transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-xl active:scale-[0.97] sm:rounded-2xl sm:p-3.5 " +
                (selected ? "border-red-600 bg-gradient-to-br from-red-50 to-white shadow-lg shadow-red-500/15 ring-4 ring-red-600/10" : "border-slate-200 bg-white hover:border-red-300 hover:shadow-red-500/10")}>
              <span aria-hidden className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-red-500/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              {selected && <span className="sa-pop absolute right-2 top-2 text-red-600 sm:right-3 sm:top-3"><CircleCheck size={20} fill="currentColor" className="text-red-600 [&>path]:stroke-white" /></span>}
              <span className="inline-flex rounded-full bg-slate-100 px-1.5 py-1 text-[8px] font-black tracking-wide text-slate-600 sm:px-2.5 sm:text-[10px]">KILA MWEZI</span>
              <p className="mt-2 text-base font-black text-slate-900 sm:text-2xl">{plan.data}</p>
              <p className="mt-1 text-xs font-bold text-red-700 sm:text-sm">TSh {money(plan.price)}</p>
              {combo
                ? <div className="mt-1 flex flex-col gap-0.5 border-t border-slate-200 pt-1 text-[9px] font-semibold text-slate-600 sm:mt-2 sm:flex-row sm:gap-x-2 sm:gap-y-1 sm:pt-2 sm:text-[11px]"><p>☎ {plan.calls}</p><p>✉ {plan.sms}</p></div>
                : <p className="mt-1 border-t border-slate-100 pt-1 text-[9px] text-slate-500 sm:mt-2 sm:pt-2 sm:text-[11px]">Data pekee</p>}
              <span className={"mt-1 inline-flex items-center gap-1 text-[9px] font-extrabold transition-colors sm:mt-2 sm:text-[11px] " + (selected ? "text-red-700" : "text-slate-500 group-hover:text-red-600")}>{selected ? "Kimechaguliwa ✓" : "Chagua kifurushi →"}</span>
            </button>;
          })}
        </div>
        <FieldError field="selectedPlan" />

        <div className="mt-5 flex flex-col gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-4 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-white/60">Kifurushi ulichochagua</p>
            <p key={chosenPlan?.price ?? "none"} className="sa-swap mt-1 text-lg font-black">{chosenPlan ? chosenPlan.data + " · TSh " + money(chosenPlan.price) : "Bado hujachagua kifurushi"}</p>
          </div>
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-3 py-2 text-xs font-bold backdrop-blur"><CheckCircle2 size={15} /> Airtel Business</span>
        </div>
      </section>

      <section className="mt-6 grid items-start gap-6 lg:grid-cols-[.7fr_1.3fr]">
        {/* ZAWADI */}
        <aside className="sa-in relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#fff1f2] to-[#ffe4e6] p-5 ring-1 ring-red-100 sm:p-6 lg:sticky lg:top-6" style={{ animationDelay: "200ms" }}>
          <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-red-300/30 blur-2xl sa-orb" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 text-xs font-black tracking-[.18em] text-red-700"><Gift size={14} /> ZAWADI YA SME</span>
            <p className="mt-2 bg-gradient-to-r from-red-700 to-rose-500 bg-clip-text text-5xl font-black text-transparent">TSh 2,000</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">Kwa kila SME moja itakayokubaliwa na kuthibitishwa na admin. Zawadi hii si malipo ya papo hapo wakati wa kutuma ombi.</p>
            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-white/90 p-4 text-sm font-semibold text-slate-700 shadow-sm">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-red-600" />
              <span>Laini lazima iwe imewekewa vocha ya angalau <strong>TSh 10,000</strong>.</span>
            </div>
          </div>
        </aside>

        {/* FOMU */}
        {reference ? <div role="status" aria-live="polite" className="sa-in rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900 shadow-lg">
          <div className="flex items-center gap-3"><CheckCircle2 size={30} className="shrink-0 text-emerald-600"/><div><h2 className="text-lg font-black">TAARIFA ZIMEWASILISHWA</h2><p className="mt-1 text-sm">Ombi lako limepokelewa kikamilifu.</p></div></div>
          <p className="mt-4 break-all text-sm">Namba ya kumbukumbu: <strong>{reference}</strong></p>
          {message && <p className="mt-2 text-sm">{message}</p>}
          <p className="mt-2 text-sm">Unaweza kufuatilia hali ya ombi lako kwenye sehemu ya Maombi yangu hapa chini.</p>
          <button type="button" onClick={() => { setReference(""); setMessage(""); setErrors({}); setForm(INITIAL); setEditingApplicationId(null); setApplicationId(newApplicationId()); }} className="mt-5 w-full rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-black text-white hover:bg-emerald-800">TUMA OMBI JINGINE</button>
        </div> : <form onSubmit={submit} className="sa-in rounded-3xl border border-white bg-white/90 p-4 shadow-[0_20px_60px_-20px_rgba(15,23,42,.2)] backdrop-blur-xl transition-shadow duration-500 hover:shadow-[0_25px_70px_-20px_rgba(190,0,20,.25)] sm:p-7" style={{ animationDelay: "280ms" }}>
          <div className="mb-5">
            <span className="inline-flex items-center gap-1.5 text-xs font-black tracking-[.18em] text-red-700"><Sparkles size={14} /> TAARIFA ZA MWOMBAJI</span>
            <h2 className="mt-1 text-2xl font-black">Jaza fomu ya SME Airtel</h2>
            <p className="mt-1 text-sm text-slate-500">Hakikisha taarifa zinafanana na kitambulisho.</p>
          </div>

          {/* progress */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500">
              <span>Maendeleo ya fomu</span>
              <span className="tabular-nums text-red-700">{progress.done}/{progress.total} · {progress.pct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="relative h-full rounded-full bg-gradient-to-r from-red-500 via-red-600 to-rose-500 transition-all duration-700 ease-out" style={{ width: `${progress.pct}%` }}>
                <span className="absolute inset-0 overflow-hidden rounded-full"><span className="sa-btn absolute inset-0" /></span>
              </div>
            </div>
          </div>
             <div className="grid gap-5 sm:grid-cols-2">
            <label className="group block sm:col-span-2">
              <span className="text-sm font-bold">Namba ya simu ya Airtel (mpya au ya zamani) *</span>
              <div className="relative mt-2"><Phone size={18} className={iconClass} />
                <input required autoComplete="tel" inputMode="tel" value={form.phone} onChange={e => update("phone", e.target.value)} placeholder="Mfano 0681234567" className={fieldClass("phone")} /></div>
              <FieldError field="phone" />
            </label>
            <label className="group block sm:col-span-2">
              <span className="text-sm font-bold">Majina yote matatu kama yalivyo kwenye kitambulisho *</span>
              <div className="relative mt-2"><User size={18} className={iconClass} />
                <input required value={form.fullName} onChange={e => update("fullName", e.target.value)} placeholder="Jina la kwanza, la pili na la tatu" className={fieldClass("fullName")} /></div>
              <FieldError field="fullName" />
            </label>
            <label className="group block">
              <span className="text-sm font-bold">Namba ya NIDA *</span>
              <div className="relative mt-2"><CreditCard size={18} className={iconClass} />
                <input required inputMode="numeric" maxLength={23} value={form.nidaNumber} onChange={e => update("nidaNumber", e.target.value.replace(/[^\d-]/g, "").slice(0, 23))} placeholder="Tarakimu 20 za NIDA" className={fieldClass("nidaNumber")} /></div>
              <FieldError field="nidaNumber" />
            </label>
            <label className="group block">
              <span className="text-sm font-bold">Namba ya mawasiliano *</span>
              <div className="relative mt-2"><Smartphone size={18} className={iconClass} />
                <input required autoComplete="tel" inputMode="tel" value={form.contactPhone} onChange={e => update("contactPhone", e.target.value)} placeholder="Mfano 0712345678" className={fieldClass("contactPhone")} /></div>
              <FieldError field="contactPhone" />
            </label>

            <div className="rounded-2xl border-2 border-slate-100 bg-slate-50/50 p-4 sm:col-span-2">
              <p className="text-sm font-extrabold">Je, unayo namba ya TIN? *</p>
              <p className="mt-1 text-xs text-slate-500">Ukiwa nayo, chagua Ndiyo na sehemu ya namba itaonekana.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {([["ndio", "Ndiyo, ninayo"], ["hana", "Sina TIN"]] as const).map(([val, label]) => {
                  const on = form.hasTin === val;
                  return <label key={val} className={"flex cursor-pointer items-center gap-2 rounded-xl border-2 p-3 text-sm font-bold transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] " + (on ? "border-red-600 bg-red-50 text-red-700 shadow-md shadow-red-500/10" : "border-slate-200 bg-white")}>
                    <input type="radio" name="airtelHasTin" checked={on} onChange={() => { update("hasTin", val); if (val === "hana") update("tinNumber", ""); }} className="accent-red-700" /> {label}
                  </label>;
                })}
              </div>
              <FieldError field="hasTin" />
              {form.hasTin === "ndio" && <div className="sa-slide mt-4">
                <label className="group block"><span className="text-sm font-bold">Namba ya TIN *</span>
                  <div className="relative mt-2"><ShieldCheck size={18} className={iconClass} />
                    <input inputMode="numeric" value={form.tinNumber} onChange={e => update("tinNumber", e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="Tarakimu 9 za TIN" className={fieldClass("tinNumber")} /></div>
                </label>
                <FieldError field="tinNumber" />
              </div>}
            </div>

            <label className={"flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-all duration-300 hover:shadow-md sm:col-span-2 " + (form.voucherConfirmed ? "border-emerald-300 bg-emerald-50/60" : errors.voucherConfirmed ? "border-red-400 bg-red-50/60" : "border-rose-100 bg-[#fff7f7]")}>
              <input type="checkbox" checked={form.voucherConfirmed} onChange={e => update("voucherConfirmed", e.target.checked)} className="mt-1 h-5 w-5 accent-red-600" />
              <span className="text-sm font-semibold leading-6">Nathibitisha kuwa laini hii imewekewa vocha ya <strong>TSh 10,000 au zaidi</strong>. *<FieldError field="voucherConfirmed" /></span>
            </label>
          </div>

          {message && <div key={message} role="status" className={"sa-pop mt-5 flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold " + (reference ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
            {reference && <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600" />}
            <div>{message}{reference && <p className="mt-2 break-all text-xs">Namba ya kumbukumbu: <strong>{reference}</strong></p>}</div>
          </div>}

          <button key={shakeKey} type="submit" disabled={submitting || authLoading}
            className={"sa-btn mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 via-red-700 to-rose-700 px-5 py-4 text-sm font-black text-white shadow-xl shadow-red-600/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-red-600/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 " + (shakeKey && Object.keys(errors).some(k => errors[k]) ? "sa-shake" : "")}>
            {submitting ? <><LoaderCircle size={18} className="animate-spin" /> Inatuma ombi...</> : <><Send size={17} /> TUMA OMBI LA SME AIRTEL</>}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-slate-500">Kwa kutuma ombi unathibitisha kuwa taarifa ni sahihi. Zawadi ya SME huhesabiwa baada ya uthibitisho wa admin.</p>
        </form>}
      </section>

      {/* MAOMBI YANGU */}
      <section className="sa-in mt-6 rounded-3xl border border-white bg-white/80 p-4 shadow-[0_10px_40px_-15px_rgba(15,23,42,.15)] backdrop-blur-xl sm:p-7" aria-labelledby="my-airtel-sme-applications">
        <div className="flex items-center justify-between gap-3">
          <div><h2 id="my-airtel-sme-applications" className="text-xl font-black">Maombi yangu ya SME Airtel</h2><p className="mt-1 text-sm text-slate-500">Angalia hali ya maombi uliyotuma.</p></div>
          <span className="rounded-full bg-red-50 px-3.5 py-1 text-sm font-black text-red-700 ring-1 ring-red-100">{myApplications.length}</span>
        </div>
        {!firebaseUser
          ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Ingia kwenye akaunti yako kuona maombi yako.</p>
          : myApplications.length === 0
            ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Bado hujatuma ombi la SME Airtel.</p>
            : <div className="mt-4 space-y-3">{myApplications.map((app, i) =>
              <article key={app.id} style={{ animationDelay: `${i * 80}ms` }} className="sa-in rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-red-200 hover:shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-slate-900">SME Airtel</strong>
                  <span className={"rounded-full px-3 py-1 text-xs font-black " + statusBadge(app.status)}>
                    {app.status === "PENDING" ? "Inasubiri" : app.status === "PROCESSING" ? "Inashughulikiwa" : app.status === "APPROVED" ? "Imeidhinishwa" : app.status === "REJECTED" ? "Imekataliwa" : app.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">Tarehe: {app.submittedAt ? new Date(String(app.submittedAt)).toLocaleString("sw-TZ") : "—"}</p>
                <div className="mt-3 grid gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm sm:grid-cols-2">
                  {Object.entries(app.applicantData ?? {}).filter(([key, value]) => !/rewardRule|rewardCurrency/.test(key) && value !== undefined && value !== null && value !== "").map(([key, value]) => <div key={key} className="min-w-0"><span className="block text-xs font-semibold text-slate-500">{({fullName:"Majina kamili",smePhone:"Namba ya SME",phone:"Namba ya SME",nidaNumber:"Namba ya NIDA",contactPhone:"Namba ya mawasiliano",hasTin:"TIN",tinNumber:"Namba ya TIN",planType:"Aina ya kifurushi",selectedPlanName:"Kifurushi"} as Record<string,string>)[key] ?? key}</span><span className="break-words font-semibold text-slate-800">{typeof value === "boolean" ? (value ? "Ndiyo" : "Hapana") : String(value)}</span></div>)}
                </div>
                {app.status === "PENDING" && <button type="button" onClick={() => {
                  const data = app.applicantData ?? {};
                  setEditingApplicationId(app.applicationId || app.id);
                  setApplicationId(app.applicationId || app.id);
                  setForm({ phone: String(data.smePhone ?? data.phone ?? ""), fullName: String(data.fullName ?? ""), nidaNumber: String(data.nidaNumber ?? "").replace(/\\D/g, ""), contactPhone: String(data.contactPhone ?? ""), hasTin: data.hasTin === "ndio" ? "ndio" : data.hasTin === "hana" || data.tinNumber === "HANA" ? "hana" : "", tinNumber: String(data.tinNumber ?? "").replace(/\\D/g, ""), voucherConfirmed: true, planType: data.planType === "combo" ? "combo" : "data", selectedPlan: String(data.selectedPlan ?? "") });
                  setMessage("Unahariri ombi ambalo bado halijaanza kushughulikiwa. Hakiki taarifa kisha hifadhi.");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100">Hariri ombi</button>}
                {app.rejectionReason && <p className="mt-2 text-sm text-red-700"><strong>Sababu:</strong> {app.rejectionReason}</p>}
              </article>)}</div>}
      </section>
    </div>
  </main>;
}
