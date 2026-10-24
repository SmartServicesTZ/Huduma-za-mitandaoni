import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleCheck, LoaderCircle, Send, Smartphone, Wifi, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/_core/hooks/useAuth";
import { createServiceApplication, subscribeUserServiceApplications, type ServiceApplication } from "@/lib/firebase";
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
type FormState = { phone: string; fullName: string; nidaNumber: string; contactPhone: string; hasTin: "" | "ndio" | "hana"; tinNumber: string; voucherConfirmed: boolean; planType: PlanType; selectedPlan: string };
const INITIAL: FormState = { phone: "", fullName: "", nidaNumber: "", contactPhone: "", hasTin: "", tinNumber: "", voucherConfirmed: false, planType: "data", selectedPlan: "" };
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
  const [myApplications, setMyApplications] = useState<ServiceApplication[]>([]);
  
  useEffect(() => {
    if (!firebaseUser?.uid) { setMyApplications([]); return; }
    return subscribeUserServiceApplications(firebaseUser.uid, (rows) => setMyApplications(rows.filter((row) => row.serviceSlug === "sme-airtel")));
  }, [firebaseUser?.uid]);

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
    if (!form.hasTin) next.hasTin = "Chagua kama una TIN au huna.";
    if (form.hasTin === "ndio" && !/^\d{9}$/.test(form.tinNumber.replace(/\D/g, ""))) next.tinNumber = "Weka namba sahihi ya TIN yenye tarakimu 9.";
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
        contactPhone: normalizePhone(form.contactPhone), hasTin: form.hasTin,
        tinNumber: form.hasTin === "ndio" ? form.tinNumber.replace(/\D/g, "") : "HANA", voucherAmount: 10000,
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

  const fieldClass = (key: string) => "mt-2 w-full rounded-2xl border bg-slate-50/50 px-4 py-3.5 text-sm text-slate-800 outline-none transition-all duration-300 placeholder:text-slate-400 focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-100 focus:shadow-lg " + (errors[key] ? "border-red-500" : "border-slate-200");
  const FieldError = ({ field }: { field: string }) => errors[field] ? <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 text-xs font-semibold text-red-600">{errors[field]}</motion.p> : null;

  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="min-h-screen bg-[#f8f9fc] px-3 py-5 text-slate-800 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold text-slate-500 transition hover:bg-white hover:text-red-700 hover:shadow-sm">
          <ArrowLeft size={17}/> Huduma zote
        </Link>

        {/* HEADER */}
        <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }} className="relative isolate overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#ed1c24] via-[#bd0014] to-[#68000a] text-white shadow-2xl">
          <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none"></div>
          <div className="grid gap-6 p-6 sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center lg:p-11">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-[11px] font-black tracking-[.18em] backdrop-blur-md">
                <Sparkles size={12}/> AIRTEL BUSINESS
              </span>
              <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">SME <span className="text-red-200">AIRTEL</span></h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/90 sm:text-base">Sajili laini mpya au ya zamani kwenye SME Airtel. Jaza taarifa sahihi kama zilivyo kwenye kitambulisho na chagua kifurushi cha biashara.</p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-white">
                <span className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">✓ Laini mpya au ya zamani</span>
                <span className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">✓ Vocha kuanzia TSh 10,000</span>
                <span className="rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm">✓ Zawadi TSh 2,000 kwa SME</span>
              </div>
            </div>
            <motion.div whileHover={{ scale: 1.05, rotate: 2 }} transition={{ type: "spring", stiffness: 300 }} className="flex h-28 w-28 items-center justify-center rounded-[2.5rem] bg-white text-4xl font-black italic text-red-600 shadow-2xl sm:h-36 sm:w-36">
              airtel
            </motion.div>
          </div>
        </motion.header>

        {/* PLANS SECTION */}
        <section className="mt-6 rounded-[2.5rem] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-xs font-black tracking-[.18em] text-red-600">VIFURUSHI VYA BIASHARA</span>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">Chagua kifurushi</h2>
              <p className="mt-1 text-sm text-slate-500">Bei ni TSh kwa mwezi.</p>
            </div>
            <div className="inline-flex rounded-2xl bg-slate-100 p-1.5 shadow-inner" role="tablist">
              <button type="button" role="tab" aria-selected={form.planType === "data"} onClick={() => update("planType", "data")} className={"relative rounded-xl px-4 py-2.5 text-sm font-extrabold transition-all duration-300 " + (form.planType === "data" ? "bg-red-600 text-white shadow-md" : "text-slate-600 hover:text-slate-900")}>
                <Wifi size={15} className="mr-1.5 inline"/> Data bando
              </button>
              <button type="button" role="tab" aria-selected={form.planType === "combo"} onClick={() => update("planType", "combo")} className={"relative rounded-xl px-4 py-2.5 text-sm font-extrabold transition-all duration-300 " + (form.planType === "combo" ? "bg-red-600 text-white shadow-md" : "text-slate-600 hover:text-slate-900")}>
                <Smartphone size={15} className="mr-1.5 inline"/> Combo bando
              </button>
            </div>
          </div>

          <motion.div layout className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {plans.map((plan) => { 
              const selected = form.selectedPlan === String(plan.price); 
              const combo = "calls" in plan; 
              return (
                <motion.button 
                  key={plan.price} 
                  type="button" 
                  whileHover={{ y: -4, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => update("selectedPlan", String(plan.price))} 
                  className={"relative rounded-2xl border p-3.5 text-left transition-colors duration-300 sm:p-4 " + (selected ? "border-red-600 bg-red-50/70 ring-2 ring-red-600/20 shadow-md" : "border-slate-200 bg-white hover:border-red-300 hover:bg-slate-50/50 shadow-xs")}>
                  {selected && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-3 top-3 text-red-600">
                      <CircleCheck size={20}/>
                    </motion.span>
                  )}
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black tracking-wide text-slate-600">KILA MWEZI</span>
                  <p className="mt-2 text-lg font-black text-slate-900 sm:text-2xl">{plan.data}</p>
                  <p className="mt-1 text-xs font-bold text-red-600 sm:text-sm">TSh {money(plan.price)}</p>
                  {combo ? (
                    <div className="mt-2 flex flex-col gap-0.5 border-t border-slate-200/60 pt-2 text-[10px] font-semibold text-slate-600">
                      <p>☎ {plan.calls}</p>
                      <p>✉ {plan.sms}</p>
                    </div>
                  ) : (
                    <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500">Data pekee</p>
                  )}
                  <span className={"mt-2 block text-[10px] font-extrabold " + (selected ? "text-red-700" : "text-slate-400")}>
                    {selected ? "✓ Kimechaguliwa" : "Chagua kifurushi"}
                  </span>
                </motion.button>
              ); 
            })}
          </motion.div>
          <FieldError field="selectedPlan"/>

          {/* CHOSEN PLAN SUMMARY CARD */}
          <AnimatePresence>
            {chosenPlan && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mt-5 flex flex-col gap-3 rounded-2xl bg-slate-900 p-4 text-white sm:flex-row sm:items-center sm:justify-between shadow-lg">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Kifurushi ulichochagua</p>
                  <p className="mt-1 text-lg font-black text-white">{chosenPlan.data} · TSh {money(chosenPlan.price)}</p>
                </div>
                <span className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-3.5 py-2 text-xs font-bold backdrop-blur-md">
                  <CheckCircle2 size={15} className="text-emerald-400"/> Airtel Business Active
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* FORM & REWARD SECTION */}
        <section className="mt-6 grid items-start gap-6 lg:grid-cols-[.7fr_1.3fr]">
          <aside className="rounded-[2.5rem] bg-gradient-to-br from-[#fff1f2] to-[#ffe4e6] p-6 ring-1 ring-red-200 shadow-xs">
            <span className="text-xs font-black tracking-[.18em] text-red-600">ZAWADI YA SME</span>
            <p className="mt-2 text-4xl font-black text-red-700">TSh 2,000</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">Kwa kila SME moja itakayokubaliwa na kuthibitishwa na admin. Zawadi hii si malipo ya papo hapo wakati wa kutuma ombi.</p>
            <div className="mt-5 rounded-2xl bg-white/80 backdrop-blur-sm p-4 text-sm font-semibold text-slate-700 shadow-xs border border-red-100">
              Laini lazima iwe imewekewa vocha ya angalau <strong>TSh 10,000</strong>.
            </div>
          </aside>

          <motion.form initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} onSubmit={submit} className="rounded-[2.5rem] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-8">
            <div className="mb-6">
              <span className="text-xs font-black tracking-[.18em] text-red-600">TAARIFA ZA MWOMBAJI</span>
              <h2 className="mt-1 text-2xl font-black">Jaza fomu ya SME Airtel</h2>
              <p className="mt-1 text-sm text-slate-500">Hakikisha taarifa zinafanana na kitambulisho.</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-bold text-slate-700">Namba ya simu ya Airtel (mpya au ya zamani) *</span>
                <input required autoComplete="tel" inputMode="tel" value={form.phone} onChange={e => update("phone", e.target.value)} placeholder="Mfano 0681234567" className={fieldClass("phone")}/>
                <FieldError field="phone"/>
              </label>

              <label className="block sm:col-span-2">
                <span className="text-sm font-bold text-slate-700">Majina yote matatu kama yalivyo kwenye kitambulisho *</span>
                <input required value={form.fullName} onChange={e => update("fullName", e.target.value)} placeholder="Jina la kwanza, la pili na la tatu" className={fieldClass("fullName")}/>
                <FieldError field="fullName"/>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Namba ya NIDA *</span>
                <input required inputMode="numeric" maxLength={23} value={form.nidaNumber} onChange={e => update("nidaNumber", e.target.value.replace(/[^\d-]/g, "").slice(0, 23))} placeholder="Tarakimu 20 za NIDA" className={fieldClass("nidaNumber")}/>
                <FieldError field="nidaNumber"/>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Namba ya mawasiliano *</span>
                <input required autoComplete="tel" inputMode="tel" value={form.contactPhone} onChange={e => update("contactPhone", e.target.value)} placeholder="Mfano 0712345678" className={fieldClass("contactPhone")}/>
                <FieldError field="contactPhone"/>
              </label>

              <div className="rounded-2xl border border-slate-200 p-4 sm:col-span-2 bg-slate-50/40">
                <p className="text-sm font-extrabold text-slate-700">Je, unayo namba ya TIN? *</p>
                <p className="mt-1 text-xs text-slate-500">Ukiwa nayo, chagua Ndiyo na sehemu ya namba itaonekana.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className={"flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-bold transition " + (form.hasTin === "ndio" ? "border-red-600 bg-red-50 text-red-700 shadow-xs" : "border-slate-200 bg-white hover:bg-slate-50")}>
                    <input type="radio" name="airtelHasTin" checked={form.hasTin === "ndio"} onChange={() => update("hasTin", "ndio")} className="accent-red-600"/> Ndiyo, ninayo
                  </label>
                  <label className={"flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-bold transition " + (form.hasTin === "hana" ? "border-red-600 bg-red-50 text-red-700 shadow-xs" : "border-slate-200 bg-white hover:bg-slate-50")}>
                    <input type="radio" name="airtelHasTin" checked={form.hasTin === "hana"} onChange={() => { update("hasTin", "hana"); update("tinNumber", ""); }} className="accent-red-600"/> Sina TIN
                  </label>
                </div>
                <FieldError field="hasTin"/>
                
                <AnimatePresence>
                  {form.hasTin === "ndio" && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4 overflow-hidden">
                      <label className="text-sm font-bold text-slate-700">Namba ya TIN *</label>
                      <input inputMode="numeric" value={form.tinNumber} onChange={e => update("tinNumber", e.target.value.replace(/\D/g, "").slice(0,9))} placeholder="Tarakimu 9 za TIN" className={fieldClass("tinNumber")}/>
                      <FieldError field="tinNumber"/>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border p-4 sm:col-span-2 transition" style={{borderColor: errors.voucherConfirmed ? "#dc2626" : "#fecdd3", background: "#fff7f7"}}>
                <input type="checkbox" checked={form.voucherConfirmed} onChange={e => update("voucherConfirmed", e.target.checked)} className="mt-1 h-4 w-4 accent-red-600 rounded-sm"/>
                <span className="text-sm font-semibold leading-6 text-slate-700">
                  Nathibitisha kuwa laini hii imewekewa vocha ya <strong>TSh 10,000 au zaidi</strong>. *
                  <FieldError field="voucherConfirmed"/>
                </span>
              </label>
            </div>

            <AnimatePresence>
              {message && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} role="status" className={"mt-5 rounded-2xl border p-4 text-sm font-semibold " + (reference ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
                  {message}
                  {reference && <p className="mt-2 break-all text-xs font-mono">Namba ya kumbukumbu: <strong>{reference}</strong></p>}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" disabled={submitting || authLoading} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 px-5 py-4 text-sm font-black text-white shadow-lg shadow-red-600/20 transition hover:from-red-700 hover:to-red-800 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? <><LoaderCircle size={18} className="animate-spin"/> Inatuma ombi...</> : <><Send size={17}/> TUMA OMBI LA SME AIRTEL</>}
            </motion.button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-400">Kwa kutuma ombi unathibitisha kuwa taarifa ni sahihi. Zawadi ya SME huhesabiwa baada ya uthibitisho wa admin.</p>
          </motion.form>
        </section>

        {/* APPLICATIONS LIST SECTION */}
        <section className="mt-6 rounded-[2.5rem] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="my-airtel-sme-applications">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="my-airtel-sme-applications" className="text-xl font-black">Maombi yangu ya SME Airtel</h2>
              <p className="mt-1 text-sm text-slate-500">Angalia hali ya maombi uliyotuma.</p>
            </div>
            <span className="rounded-full bg-red-50 px-3.5 py-1 text-sm font-black text-red-600 border border-red-100">{myApplications.length}</span>
          </div>

          {!firebaseUser ? (
            <p className="mt-4 rounded-2xl bg-slate-50 p-5 text-sm text-slate-600 text-center border border-slate-100">Ingia kwenye akaunti yako kuona maombi yako.</p>
          ) : myApplications.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-slate-50 p-5 text-sm text-slate-600 text-center border border-slate-100">Bado hujatuma ombi la SME Airtel.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {myApplications.map((app) => (
                <motion.article key={app.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200/80 p-4 transition hover:border-slate-300 bg-slate-50/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-slate-900 font-bold">SME Airtel</strong>
                    <span className={"rounded-full px-3 py-1 text-xs font-black " + (app.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : app.status === "REJECTED" ? "bg-red-100 text-red-800" : app.status === "PROCESSING" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800")}>
                      {app.status === "PENDING" ? "Inasubiri" : app.status === "PROCESSING" ? "Inashughulikiwa" : app.status === "APPROVED" ? "Imeidhinishwa" : app.status === "REJECTED" ? "Imekataliwa" : app.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Tarehe: {app.submittedAt ? new Date(String(app.submittedAt)).toLocaleString("sw-TZ") : "—"}</p>
                  {app.rejectionReason && <p className="mt-2 text-sm text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-100"><strong>Sababu:</strong> {app.rejectionReason}</p>}
                </motion.article>
              ))}
            </div>
          )}
        </section>
      </div>
    </motion.main>
  );
}
