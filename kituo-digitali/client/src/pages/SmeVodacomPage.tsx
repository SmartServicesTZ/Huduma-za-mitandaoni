import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, CheckCircle2, CircleCheck, CreditCard, FileText, LoaderCircle, Phone, Send,
  ShieldCheck, Smartphone, User, Wallet, Wifi,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { createServiceApplication, updateServiceApplication, subscribeUserServiceApplications, type ServiceApplication } from "@/lib/firebase";
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

/* Animation zimewekwa hapa ili ukurasa ujitegemee (hakuna haja ya kuhariri tailwind.config) */
const ANIMATION_CSS = `
@keyframes sv-fadeInUp { from { opacity:0; transform: translateY(24px) scale(.98);} to { opacity:1; transform:none; } }
@keyframes sv-fadeIn { from { opacity:0 } to { opacity:1 } }
@keyframes sv-pop { 0% { transform: scale(0) rotate(-20deg); opacity:0 } 70% { transform: scale(1.25) rotate(6deg); opacity:1 } 100% { transform: scale(1) rotate(0) } }
@keyframes sv-float { 0%,100% { transform: translateY(0) rotate(-3deg) } 50% { transform: translateY(-12px) rotate(3deg) } }
@keyframes sv-orb { 0%,100% { transform: translate(0,0) scale(1) } 33% { transform: translate(30px,-20px) scale(1.15) } 66% { transform: translate(-20px,25px) scale(.9) } }
@keyframes sv-gradient { 0%,100% { background-position: 0% 50% } 50% { background-position: 100% 50% } }
@keyframes sv-shimmer { 0% { transform: translateX(-120%) skewX(-20deg) } 100% { transform: translateX(260%) skewX(-20deg) } }
@keyframes sv-slideDown { from { opacity:0; max-height:0; transform: translateY(-8px) } to { opacity:1; max-height:200px; transform:none } }
@keyframes sv-ring { 0% { box-shadow: 0 0 0 0 rgba(110,231,183,.6) } 100% { box-shadow: 0 0 0 10px rgba(110,231,183,0) } }
@keyframes sv-swap { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
@keyframes sv-shake { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-5px) } 75% { transform: translateX(5px) } }
@keyframes sv-rise { from { opacity:0; transform: translateX(-14px) } to { opacity:1; transform:none } }
.sv-in { animation: sv-fadeInUp .7s cubic-bezier(.22,1,.36,1) both; }
.sv-fade { animation: sv-fadeIn .6s ease-out both; }
.sv-pop { animation: sv-pop .45s cubic-bezier(.34,1.56,.64,1) both; }
.sv-float { animation: sv-float 6s ease-in-out infinite; }
.sv-orb { animation: sv-orb 14s ease-in-out infinite; }
.sv-gradient { background-size: 220% 220%; animation: sv-gradient 12s ease infinite; }
.sv-slide { overflow: hidden; animation: sv-slideDown .4s cubic-bezier(.22,1,.36,1) both; }
.sv-ring { animation: sv-ring 1.8s ease-out infinite; }
.sv-swap { animation: sv-swap .35s ease-out both; }
.sv-shake { animation: sv-shake .35s ease-in-out; }
.sv-rise { animation: sv-rise .55s cubic-bezier(.22,1,.36,1) both; }
.sv-btn { position: relative; overflow: hidden; }
.sv-btn::after { content:""; position:absolute; top:0; bottom:0; left:0; width:35%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent); animation: sv-shimmer 2.8s ease-in-out infinite; }
.sv-btn:disabled::after { display:none; }
@media (prefers-reduced-motion: reduce) {
  .sv-in,.sv-fade,.sv-pop,.sv-float,.sv-orb,.sv-gradient,.sv-slide,.sv-ring,.sv-swap,.sv-shake,.sv-rise,.sv-btn::after { animation: none !important; }
}
`;

export default function SmeVodacomPage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");
  const [applicationId, setApplicationId] = useState(newApplicationId);
  const [editingApplicationId, setEditingApplicationId] = useState<string | null>(null);
  const [myApplications, setMyApplications] = useState<ServiceApplication[]>([]);
  const [logoFailed, setLogoFailed] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    if (!firebaseUser?.uid) { setMyApplications([]); return; }
    return subscribeUserServiceApplications(firebaseUser.uid, (rows) => setMyApplications(rows.filter((row) => row.serviceSlug === "sme-vodacom")));
  }, [firebaseUser?.uid]);

  const plans = form.planType === "data" ? DATA_PLANS : COMBO_PLANS;
  const chosenPlan = useMemo(() => plans.find((plan) => String(plan.price) === form.selectedPlan), [plans, form.selectedPlan]);

  const progress = useMemo(() => {
    const steps = [
      form.fullName.trim().length >= 3,
      /^\d{20}$/.test(form.nidaNumber.replace(/\D/g, "")),
      validPhone(form.smePhone),
      validPhone(form.contactPhone),
      Number(form.voucherAmount) >= 15000,
      form.hasTin === "hana" || (form.hasTin === "ndio" && /^\d{9}$/.test(form.tinNumber.replace(/\D/g, ""))),
      !!form.selectedPlan,
    ];
    const done = steps.filter(Boolean).length;
    return { done, total: steps.length, pct: Math.round((done / steps.length) * 100) };
  }, [form]);

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
        fullName: form.fullName.trim(), nidaNumber: formatNida(form.nidaNumber),
        smePhone: normalizePhone(form.smePhone), contactPhone: normalizePhone(form.contactPhone),
        alternativePhone: normalizePhone(form.contactPhone), alternatePhone: normalizePhone(form.contactPhone),
        hasTin: form.hasTin, tinNumber: form.hasTin === "ndio" ? formatTin(form.tinNumber) : "HANA",
        voucherAmount: String(Number(form.voucherAmount)), planType: form.planType,
        selectedPlan: form.selectedPlan, selectedPlanName: `${form.planType === "data" ? "Data Plan" : "Combo Plan"} — TSh ${money(Number(form.selectedPlan))}`,
      };
      if (editingApplicationId) {
        await updateServiceApplication(editingApplicationId, values);
        setReference(editingApplicationId); setMessage("Mabadiliko ya ombi lako la SME VODACOM yamehifadhiwa.");
        setEditingApplicationId(null); setForm(INITIAL); setApplicationId(newApplicationId());
        toast.success("Mabadiliko ya ombi yamehifadhiwa.");
      } else {
        const result = await createServiceApplication(applicationId, "sme-vodacom", values);
        const ref = String(result.reference ?? result.applicationId ?? applicationId);
        setReference(ref); setMessage("Ombi lako la SME VODACOM limetumwa kwa mafanikio.");
        setForm(INITIAL); setApplicationId(newApplicationId());
        toast.success("Ombi la SME VODACOM limetumwa kwa admin.");
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Imeshindikana kutuma ombi.";
      setMessage(detail); toast.error(detail);
    } finally { setSubmitting(false); }
  };

  const fieldClass = (field: string, pad = "pl-12") =>
    `w-full rounded-2xl border-2 bg-slate-50/70 py-3.5 pr-4 text-sm font-medium text-slate-800 outline-none transition-all duration-300 placeholder:text-slate-400 hover:border-slate-300 hover:bg-white focus:-translate-y-0.5 focus:border-red-500 focus:bg-white focus:shadow-[0_10px_30px_-10px_rgba(200,0,30,.35)] focus:ring-4 focus:ring-red-100 ${pad} ${errors[field] ? "border-red-400 bg-red-50/50" : "border-transparent"}`;
  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? <p className="sv-swap mt-1.5 text-xs font-semibold text-red-600">{errors[field]}</p> : null;
  const iconClass = "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors duration-300 group-focus-within:text-red-600";

  const statusBadge = (status: string) =>
    status === "APPROVED" ? "bg-emerald-100 text-emerald-800"
      : status === "REJECTED" ? "bg-red-100 text-red-800"
      : status === "PROCESSING" ? "bg-blue-100 text-blue-800"
      : "bg-amber-100 text-amber-800";

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#f7f8fc] via-[#f3f4fa] to-[#eef0f8] px-3 py-5 text-slate-800 sm:px-6 sm:py-8">
      <style>{ANIMATION_CSS}</style>
      <div aria-hidden className="pointer-events-none absolute -left-32 top-40 h-96 w-96 rounded-full bg-red-200/40 blur-3xl sv-orb" />
      <div aria-hidden className="pointer-events-none absolute -right-32 top-[55%] h-96 w-96 rounded-full bg-rose-300/30 blur-3xl sv-orb" style={{ animationDelay: "-6s" }} />

      <div className="relative mx-auto max-w-6xl">
        <Link href="/" className="sv-fade mb-4 inline-flex items-center gap-2 rounded-full border border-white bg-white/70 px-4 py-2 text-sm font-bold text-slate-500 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-x-1 hover:bg-white hover:text-red-700 hover:shadow-md">
          <ArrowLeft size={17} /> Huduma zote
        </Link>

        {/* HEADER */}
        <header className="sv-in sv-gradient relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#d4001f] via-[#8a000e] to-[#300005] text-white shadow-[0_30px_80px_-20px_rgba(150,0,20,.55)]">
          <div aria-hidden className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/15 blur-3xl sv-orb" />
          <div aria-hidden className="absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-rose-400/20 blur-3xl sv-orb" style={{ animationDelay: "-5s" }} />
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-72 w-72 rounded-full border-[40px] border-white/5" />
          <div aria-hidden className="absolute inset-0 opacity-[.1]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "22px 22px" }} />
          <div className="grid gap-6 p-6 sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center lg:p-11">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-[11px] font-black tracking-[.18em] backdrop-blur">VODACOM BUSINESS</span>
                <span className="flex items-center gap-2 rounded-full bg-emerald-300/15 px-3 py-1.5 text-xs font-bold text-emerald-100 backdrop-blur"><span className="sv-ring h-2 w-2 rounded-full bg-emerald-300" /> Huduma inapatikana</span>
              </div>
              <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">SME <span className="bg-gradient-to-r from-white to-red-200 bg-clip-text text-transparent">VODACOM</span></h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80 sm:text-base">Omba kuunganishwa kwenye vifurushi vya biashara vya siku 30. Linganisha Data Plan na Combo Plan, chagua kifurushi, kisha weka taarifa zako kwa usahihi.</p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold text-white/90">
                {["Vifurushi vya siku 30", "Taarifa za TIN huulizwa", "Vocha kuanzia TSh 15,000"].map((t, i) => (
                  <span key={t} className="sv-in inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur transition hover:bg-white/20" style={{ animationDelay: `${300 + i * 120}ms` }}>
                    <CheckCircle2 size={14} /> {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="sv-float relative mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white p-4 shadow-[0_25px_60px_-10px_rgba(0,0,0,.45)] ring-1 ring-white/40 sm:h-36 sm:w-36">
              {!logoFailed
                ? <img src="/Huduma-za-mitandaoni/vodacom-logo.png" alt="Vodacom" className="h-full w-full object-contain" onError={() => setLogoFailed(true)} />
                : <Wifi className="h-12 w-12 text-red-700" aria-hidden="true" />}
            </div>
          </div>
        </header>

        {/* VIFURUSHI */}
        <section className="sv-in mt-6 rounded-3xl border border-white bg-white/80 p-4 shadow-[0_10px_40px_-15px_rgba(15,23,42,.15)] backdrop-blur-xl sm:p-6" style={{ animationDelay: "120ms" }}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-xs font-black tracking-[.18em] text-red-700">CHAGUA KIFURUSHI</span>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">Bei na vifurushi vya SME</h2>
              <p className="mt-1 text-sm text-slate-500">Bei zote ni TSh, na vifurushi ni vya siku 30.</p>
            </div>
            <div className="relative inline-grid grid-cols-2 rounded-2xl bg-slate-100 p-1" role="tablist" aria-label="Aina ya kifurushi">
              <span aria-hidden className="absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-xl bg-gradient-to-r from-red-600 to-red-800 shadow-lg shadow-red-500/30 transition-all duration-500 ease-[cubic-bezier(.34,1.56,.64,1)]" style={{ left: form.planType === "data" ? "4px" : "50%" }} />
              <button type="button" role="tab" aria-selected={form.planType === "data"} onClick={() => update("planType", "data")} className={`relative z-10 rounded-xl px-5 py-2.5 text-sm font-extrabold transition-colors duration-300 ${form.planType === "data" ? "text-white" : "text-slate-600 hover:text-red-700"}`}><Wifi size={15} className="mr-1 inline" /> Data</button>
              <button type="button" role="tab" aria-selected={form.planType === "combo"} onClick={() => update("planType", "combo")} className={`relative z-10 rounded-xl px-5 py-2.5 text-sm font-extrabold transition-colors duration-300 ${form.planType === "combo" ? "text-white" : "text-slate-600 hover:text-red-700"}`}><Smartphone size={15} className="mr-1 inline" /> Combo</button>
            </div>
          </div>

          <div key={form.planType} className="mt-5 grid grid-cols-3 gap-1.5 sm:gap-3 lg:grid-cols-4">
            {plans.map((plan, i) => {
              const selected = form.selectedPlan === String(plan.price);
              const combo = "calls" in plan;
              return <button key={plan.price} type="button" onClick={() => update("selectedPlan", String(plan.price))} style={{ animationDelay: `${i * 60}ms` }}
                className={`sv-in group relative overflow-hidden rounded-xl border-2 p-2 text-left transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-xl active:scale-[0.97] sm:rounded-2xl sm:p-3.5 ${selected ? "border-red-600 bg-gradient-to-br from-red-50 to-white shadow-lg shadow-red-500/15 ring-4 ring-red-600/10" : "border-slate-200 bg-white hover:border-red-300 hover:shadow-red-500/10"}`}>
                <span aria-hidden className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-red-500/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                {selected && <span className="sv-pop absolute right-2 top-2 sm:right-3 sm:top-3"><CircleCheck size={20} fill="currentColor" className="text-red-600 [&>path]:stroke-white" /></span>}
                <span className="inline-flex rounded-full bg-slate-100 px-1.5 py-1 text-[8px] font-black tracking-wide text-slate-600 sm:px-2.5 sm:text-[10px]">SIKU 30</span>
                <p className="mt-2 text-base font-black tracking-tight text-slate-900 sm:text-2xl">{plan.data}</p>
                <p className="mt-1 text-xs font-bold text-red-700 sm:text-sm">TSh {money(plan.price)}</p>
                {combo
                  ? <div className="mt-1 flex flex-col gap-0.5 border-t border-slate-200 pt-1 text-[9px] font-semibold text-slate-600 sm:mt-2 sm:flex-row sm:gap-x-3 sm:gap-y-1 sm:pt-2 sm:text-xs"><span>☎ {plan.calls}</span><span>✉ {plan.sms}</span></div>
                  : <p className="mt-1 border-t border-slate-100 pt-1 text-[9px] text-slate-500 sm:mt-2 sm:pt-2 sm:text-xs">Data pekee · siku 30</p>}
                <span className={`mt-1 inline-flex items-center gap-1 text-[9px] font-extrabold transition-colors sm:mt-2 sm:text-[11px] ${selected ? "text-red-700" : "text-slate-500 group-hover:text-red-600"}`}>{selected ? "Kimechaguliwa ✓" : "Chagua kifurushi →"}</span>
              </button>;
            })}
          </div>
          <FieldError field="selectedPlan" />

          <div className="mt-5 flex flex-col gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-4 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white/60">Kifurushi ulichochagua</p>
              <p key={chosenPlan?.price ?? "none"} className="sv-swap mt-1 text-lg font-black">{chosenPlan ? `${chosenPlan.data} · TSh ${money(chosenPlan.price)}` : "Bado hujachagua kifurushi"}</p>
            </div>
            <span className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white/80 backdrop-blur sm:self-auto"><CheckCircle2 size={15} /> Siku 30</span>
          </div>
        </section>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[.7fr_1.3fr]">
          {/* MAELEKEZO */}
          <aside className="sv-in overflow-hidden rounded-3xl border border-white bg-white/85 shadow-[0_10px_40px_-15px_rgba(15,23,42,.15)] backdrop-blur-xl lg:sticky lg:top-6" style={{ animationDelay: "200ms" }}>
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white sm:p-6">
              <div aria-hidden className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-red-500/30 blur-2xl sv-orb" />
              <ShieldCheck size={25} className="relative text-red-300" />
              <h2 className="relative mt-3 text-xl font-black">Tayarisha maombi</h2>
              <p className="relative mt-2 text-sm leading-6 text-white/70">Hakikisha una taarifa na nyaraka hizi kabla ya kutuma.</p>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              {["Majina kamili yanayolingana na NIDA", "Namba ya NIDA yenye tarakimu 20", "Namba ya SME na namba ya mawasiliano", "Namba ya TIN (ikiwa unayo)", "Vocha iliyowekwa ya angalau TSh 15,000"].map((item, index) =>
                <div key={item} className="sv-rise group flex items-start gap-3" style={{ animationDelay: `${300 + index * 90}ms` }}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-black text-red-700 transition-all duration-300 group-hover:scale-110 group-hover:bg-red-600 group-hover:text-white">{index + 1}</span>
                  <p className="pt-1 text-sm font-semibold leading-5 text-slate-700">{item}</p>
                </div>)}
              <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 text-xs leading-6 text-amber-900"><b>Mchakato:</b> Tuma ombi, subiri kushughulikiwa, kisha fuata maelekezo ya malipo ya Control Number yatakayotolewa na Vodacom.</div>
            </div>
          </aside>

          {/* FOMU */}
          <section className="sv-in rounded-3xl border border-white bg-white/90 p-5 shadow-[0_20px_60px_-20px_rgba(15,23,42,.2)] backdrop-blur-xl transition-shadow duration-500 hover:shadow-[0_25px_70px_-20px_rgba(150,0,20,.25)] sm:p-8" style={{ animationDelay: "280ms" }}>
            <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-50 to-rose-100 text-red-700 shadow-inner"><FileText size={23} /></span>
              <div><p className="text-xs font-black tracking-[.16em] text-red-700">HATUA YA 2</p><h2 className="text-xl font-black sm:text-2xl">Taarifa za mwombaji</h2><p className="mt-1 text-sm text-slate-500">Jaza sehemu zote zenye alama ya *</p></div>
            </div>

            {!firebaseUser && !authLoading && <div className="sv-swap mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Ingia kwenye akaunti yako kabla ya kujaza na kutuma ombi.</div>}

            {/* progress */}
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Maendeleo ya fomu</span>
                <span className="tabular-nums text-red-700">{progress.done}/{progress.total} · {progress.pct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-red-500 via-red-600 to-rose-500 transition-all duration-700 ease-out" style={{ width: `${progress.pct}%` }}>
                  <span className="sv-btn absolute inset-0" />
                </div>
              </div>
            </div>

            <form onSubmit={submit} noValidate className="mt-6 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="group">
                  <label htmlFor="sme-full-name" className="text-sm font-extrabold">Majina kamili <span className="text-red-600">*</span></label>
                  <div className="relative mt-2"><User size={18} className={iconClass} />
                    <input id="sme-full-name" autoComplete="name" value={form.fullName} onChange={(e) => update("fullName", e.target.value)} placeholder="Andika majina yako yote" className={fieldClass("fullName")} aria-invalid={!!errors.fullName} /></div>
                  <FieldError field="fullName" />
                </div>
                <div className="group">
                  <label htmlFor="sme-nida" className="text-sm font-extrabold">Namba ya NIDA <span className="text-red-600">*</span></label>
                  <div className="relative mt-2"><CreditCard size={18} className={iconClass} />
                    <input id="sme-nida" inputMode="numeric" value={form.nidaNumber} onChange={(e) => update("nidaNumber", e.target.value.replace(/\D/g, "").slice(0, 20))} placeholder="Tarakimu 20" className={fieldClass("nidaNumber")} aria-invalid={!!errors.nidaNumber} /></div>
                  <FieldError field="nidaNumber" />
                </div>
                <div className="group">
                  <label htmlFor="sme-phone" className="text-sm font-extrabold">Namba ya Vodacom ya SME (anza na 255) <span className="text-red-600">*</span></label>
                  <div className="relative mt-2"><Phone size={18} className={iconClass} />
                    <input id="sme-phone" type="tel" autoComplete="tel" value={form.smePhone} onChange={(e) => update("smePhone", e.target.value)} onBlur={() => { if (form.smePhone.trim()) update("smePhone", normalizePhone(form.smePhone)); }} placeholder="255712000000" className={fieldClass("smePhone")} aria-invalid={!!errors.smePhone} /></div>
                  <FieldError field="smePhone" />
                </div>
                <div className="group">
                  <label htmlFor="sme-alternative" className="text-sm font-extrabold">Namba ya mawasiliano <span className="text-red-600">*</span></label>
                  <div className="relative mt-2"><Smartphone size={18} className={iconClass} />
                    <input id="sme-alternative" type="tel" value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} placeholder="255754000000" className={fieldClass("contactPhone")} aria-invalid={!!errors.contactPhone} /></div>
                  <FieldError field="contactPhone" />
                </div>
              </div>

              <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50/80 to-rose-50/60 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-red-700 shadow-sm"><Wallet size={21} /></span>
                  <div className="group flex-1">
                    <label htmlFor="sme-voucher" className="text-sm font-black text-slate-900">Vocha imewekwa ya shilingi ngapi? <span className="text-red-600">*</span></label>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Ingiza kiasi cha vocha kilichowekwa kwenye laini. Kiwango cha chini ni TSh 15,000.</p>
                    <div className="relative mt-3">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-xs font-black text-slate-500 transition-colors group-focus-within:text-red-600">TSh</span>
                      <input id="sme-voucher" type="number" min="15000" step="1000" inputMode="numeric" value={form.voucherAmount} onChange={(e) => update("voucherAmount", e.target.value)} placeholder="Mfano: 15000" className={fieldClass("voucherAmount", "pl-14")} aria-invalid={!!errors.voucherAmount} />
                    </div>
                    <FieldError field="voucherAmount" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border-2 border-slate-100 bg-slate-50/50 p-4 sm:p-5">
                <p className="text-sm font-extrabold text-slate-900">Je, unayo namba ya TIN? <span className="text-red-600">*</span></p>
                <p className="mt-1 text-xs text-slate-500">Chagua jibu. Ukiwa nayo, andika namba yako ya TIN hapa chini.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {([["ndio", "Ndiyo, ninayo"], ["hana", "Sina TIN"]] as const).map(([val, label]) => {
                    const on = form.hasTin === val;
                    return <label key={val} className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 p-3 text-sm font-bold transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] ${on ? "border-red-600 bg-red-50 text-red-700 shadow-md shadow-red-500/10" : "border-slate-200 bg-white"}`}>
                      <input type="radio" name="hasTin" value={val} checked={on} onChange={() => { update("hasTin", val); if (val === "hana") update("tinNumber", ""); }} className="accent-red-700" /> {label}
                    </label>;
                  })}
                </div>
                <FieldError field="hasTin" />
                {form.hasTin === "ndio" && <div className="sv-slide group mt-4">
                  <label htmlFor="sme-tin-number" className="text-sm font-extrabold">Namba ya TIN <span className="text-red-600">*</span></label>
                  <div className="relative mt-2"><ShieldCheck size={18} className={iconClass} />
                    <input id="sme-tin-number" inputMode="numeric" value={form.tinNumber} onChange={(e) => update("tinNumber", formatTin(e.target.value))} placeholder="133-231-251" className={fieldClass("tinNumber")} aria-invalid={!!errors.tinNumber} /></div>
                  <FieldError field="tinNumber" />
                </div>}
              </div>

              {message && <div key={message} role="status" aria-live="polite" className={`sv-pop flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold ${reference ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
                {reference && <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600" />}
                <div>{message}{reference && <p className="mt-1 break-all font-black">Namba ya kumbukumbu: {reference}</p>}</div>
              </div>}

              <button key={shakeKey} type="submit" disabled={submitting || authLoading}
                className={`sv-btn flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#a90017] via-[#c10a26] to-[#d20b2c] px-5 py-4 font-black text-white shadow-xl shadow-red-700/30 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-2xl hover:shadow-red-700/40 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60 ${shakeKey && Object.values(errors).some(Boolean) ? "sv-shake" : ""}`}>
                {submitting ? <><LoaderCircle size={19} className="animate-spin" /> {editingApplicationId ? "Inahifadhi mabadiliko..." : "Inatuma ombi..."}</> : <><Send size={18} /> {editingApplicationId ? "HIFADHI MABADILIKO" : "TUMA OMBI LA SME VODACOM"}</>}
              </button>
              <p className="text-center text-xs leading-5 text-slate-500">Taarifa zako zitatumwa kwa ajili ya kushughulikia ombi la SME VODACOM.</p>
            </form>
          </section>
        </div>

        {/* MAOMBI YANGU (imehamishwa nje ya grid ili ijaze upana wote) */}
        <section className="sv-in mt-6 rounded-3xl border border-white bg-white/80 p-4 shadow-[0_10px_40px_-15px_rgba(15,23,42,.15)] backdrop-blur-xl sm:p-7" aria-labelledby="my-vodacom-sme-applications">
          <div className="flex items-center justify-between gap-3">
            <div><h2 id="my-vodacom-sme-applications" className="text-xl font-black">Maombi yangu ya SME Vodacom</h2><p className="mt-1 text-sm text-slate-500">Angalia hali ya maombi uliyotuma.</p></div>
            <span className="rounded-full bg-red-50 px-3.5 py-1 text-sm font-black text-red-700 ring-1 ring-red-100">{myApplications.length}</span>
          </div>
          {!firebaseUser
            ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Ingia kwenye akaunti yako kuona maombi yako.</p>
            : myApplications.length === 0
              ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Bado hujatuma ombi la SME Vodacom.</p>
              : <div className="mt-4 space-y-3">{myApplications.map((app, i) =>
                <article key={app.id} style={{ animationDelay: `${i * 80}ms` }} className="sv-in rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-red-200 hover:shadow-lg">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-slate-900">SME Vodacom</strong>
                    <span className={"rounded-full px-3 py-1 text-xs font-black " + statusBadge(app.status)}>
                      {app.status === "PENDING" ? "Inasubiri" : app.status === "PROCESSING" ? "Inashughulikiwa" : app.status === "APPROVED" ? "Imeidhinishwa" : app.status === "REJECTED" ? "Imekataliwa" : app.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Tarehe: {app.submittedAt ? new Date(String(app.submittedAt)).toLocaleString("sw-TZ") : "—"}</p>
                  <div className="mt-3 grid gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm sm:grid-cols-2">
                    {Object.entries(app.applicantData ?? {}).filter(([key, value]) => !/rewardRule|rewardCurrency/.test(key) && value !== undefined && value !== null && value !== "").map(([key, value]) => <div key={key} className="min-w-0"><span className="block text-xs font-semibold text-slate-500">{({fullName:"Majina kamili",smePhone:"Namba ya SME",nidaNumber:"Namba ya NIDA",contactPhone:"Namba ya mawasiliano",alternativePhone:"Namba mbadala",hasTin:"TIN",tinNumber:"Namba ya TIN",planType:"Aina ya kifurushi",selectedPlanName:"Kifurushi",voucherAmount:"Kiasi cha vocha"} as Record<string,string>)[key] ?? key}</span><span className="break-words font-semibold text-slate-800">{typeof value === "boolean" ? (value ? "Ndiyo" : "Hapana") : String(value)}</span></div>)}
                  </div>
                  {app.status === "PENDING" && <button type="button" onClick={() => {
                    const data = app.applicantData ?? {};
                    setEditingApplicationId(app.applicationId || app.id);
                    setApplicationId(app.applicationId || app.id);
                    setForm({ fullName: String(data.fullName ?? ""), nidaNumber: String(data.nidaNumber ?? "").replace(/\\D/g, ""), smePhone: String(data.smePhone ?? ""), contactPhone: String(data.contactPhone ?? data.alternativePhone ?? data.alternatePhone ?? ""), voucherAmount: String(data.voucherAmount ?? ""), hasTin: data.hasTin === "ndio" || data.hasTin === "hana" ? String(data.hasTin) : "", tinNumber: String(data.tinNumber ?? "").replace(/\\D/g, ""), planType: data.planType === "combo" ? "combo" : "data", selectedPlan: String(data.selectedPlan ?? "") });
                    setMessage("Unahariri ombi ambalo bado halijaanza kushughulikiwa. Hakiki taarifa kisha hifadhi.");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100">Hariri ombi</button>}
                  {app.rejectionReason && <p className="mt-2 text-sm text-red-700"><strong>Sababu:</strong> {app.rejectionReason}</p>}
                </article>)}</div>}
        </section>

        <footer className="py-7 text-center text-xs font-semibold tracking-wide text-slate-400">VODACOM SME · Growth for your business, every step of the way.</footer>
      </div>
    </main>
  );
}
