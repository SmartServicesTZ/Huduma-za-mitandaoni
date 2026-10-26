import { useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, ChevronDown, CheckCircle2, MapPin, MessageCircle, Package, Radio, Router, ShieldCheck, ShoppingBag, Wifi, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { createPocketWifiOrder } from "@/lib/firebase";
import tanzaniaLocations from "@/data/tanzaniaLocations.json";

type DeviceId = "wireless-300" | "olax-mt30" | "zte-k12";
type PlanId = "none" | "10mbps" | "20mbps" | "30mbps" | "50mbps" | "100mbps";
type LocationData = { regions: Record<string, { districts: Record<string, string[]> }> };

const locations = tanzaniaLocations as LocationData;
const regionNames = Object.keys(locations.regions).sort((a, b) => a.localeCompare(b, "sw"));
const devices: Array<{ id: DeviceId; name: string; shortName: string; description: string; features: string[]; price: number; icon: typeof Wifi; theme: string }> = [
  { id: "wireless-300", name: "Wireless Mobile WiFi (300Mbps)", shortName: "Wireless Mobile WiFi", description: "Pocket WiFi ndogo, rahisi kubeba unapokuwa safarini.", features: ["Hadi 300Mbps", "Inabebeka"], price: 65000, icon: Wifi, theme: "cyan" },
  { id: "olax-mt30", name: "OLAX MT30 LTE Advanced Mobile CPE", shortName: "OLAX MT30 LTE Advanced", description: "Router yenye betri ya 4000mAh na sehemu ya LAN.", features: ["Betri 4000mAh", "LAN Port"], price: 100000, icon: Router, theme: "violet" },
  { id: "zte-k12", name: "ZTE K12 Wi-Fi 6 Router", shortName: "ZTE K12 Wi-Fi 6", description: "Wi-Fi 6 kwa matumizi ya hadi watu 32.", features: ["Hadi watu 32", "Betri 3000mAh"], price: 135000, icon: Radio, theme: "blue" },
];
const plans: Array<{ id: PlanId; speed: string; description: string; price: number }> = [
  { id: "none", speed: "Kifaa pekee", description: "Bila bando", price: 0 },
  { id: "10mbps", speed: "Hadi 10Mbps", description: "Unlimited M2M · No Data Cap", price: 70000 },
  { id: "20mbps", speed: "Hadi 20Mbps", description: "Unlimited M2M · No Data Cap", price: 100000 },
  { id: "30mbps", speed: "Hadi 30Mbps", description: "Unlimited M2M · No Data Cap", price: 120000 },
  { id: "50mbps", speed: "Hadi 50Mbps", description: "Unlimited M2M · No Data Cap", price: 150000 },
  { id: "100mbps", speed: "Hadi 100Mbps", description: "Unlimited M2M · No Data Cap", price: 200000 },
];
const money = (amount: number) => "TSh " + amount.toLocaleString("en-TZ") + (amount === 0 ? "" : "/=");

function SelectField({ label, value, onChange, placeholder, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; options: string[]; disabled?: boolean }) {
  return <label className="block min-w-0 space-y-1.5">
    <span className="text-sm font-semibold text-slate-700">{label} <span className="text-rose-500">*</span></span>
    <span className="relative block">
      <select required value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-10 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-3.5 text-slate-400" />
    </span>
  </label>;
}

export default function PocketWifiPage() {
  const { firebaseUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [lastOrderId, setLastOrderId] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<DeviceId>("wireless-300");
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("none");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [ward, setWard] = useState("");
  const [village, setVillage] = useState("");

  const districtNames = useMemo(() => Object.keys(locations.regions[region]?.districts ?? {}).sort((a, b) => a.localeCompare(b, "sw")), [region]);
  const wardNames = useMemo(() => locations.regions[region]?.districts[district] ?? [], [region, district]);
  const device = devices.find((item) => item.id === selectedDevice) ?? devices[0];
  const plan = plans.find((item) => item.id === selectedPlan) ?? plans[0];
  const total = device.price + plan.price;

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = fullName.trim();
    const mobile = phone.trim();
    const villageName = village.trim();
    const digits = mobile.replace(/\D/g, "");
    if (!firebaseUser) {
      toast.error("Ingia kwenye akaunti yako kwanza ili oda ihifadhiwe na ufuatilie hali yake.");
      return;
    }
    if (!name || !mobile || !region || !district || !ward || !villageName) {
      toast.error("Tafadhali jaza taarifa zote, ikiwemo Mkoa, Wilaya, Kata na Kijiji/Mtaa.");
      return;
    }
    if (digits.length < 9 || digits.length > 13) {
      toast.error("Tafadhali weka namba sahihi ya simu au WhatsApp.");
      return;
    }
    const isCoreRegion = ["Dar es Salaam", "Pwani", "Morogoro"].includes(region);
    const deliveryRule = isCoreRegion
      ? "ENEO LA UTOAJI: Dar es Salaam/Pwani/Morogoro. Thibitisha utaratibu wa malipo na kuwasilisha na admin."
      : "MALIPO KABLA YA USAFIRISHAJI: Kwa kuwa mteja yuko nje ya Dar es Salaam, Pwani na Morogoro, oda itatumwa kwenye usafiri baada ya malipo kuthibitishwa.";
    const orderDetails = [
      "ODA YA POCKET WIFI & MABANDO",
      "Jina kamili: " + name,
      "Namba ya mawasiliano: " + mobile,
      "Mkoa: " + region,
      "Wilaya: " + district,
      "Kata: " + ward,
      "Kijiji/Mtaa: " + villageName,
      "Kifaa: " + device.name,
      "Bei ya kifaa: " + money(device.price),
      "Bando: " + plan.speed + (selectedPlan === "none" ? "" : " - Vodacom Unlimited M2M"),
      "Bei ya bando: " + money(plan.price),
      "JUMLA KUU: " + money(total),
      deliveryRule,
    ].join("\n");
    const message = [
      "HABARI, NAOMBA KUAGIZA POCKET WIFI / ROUTER.",
      "",
      orderDetails,
      "",
      "Naomba kuthibitishiwa oda, malipo na usafirishaji."
    ].join("\\n");
    const popup = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const applicationId = crypto.randomUUID().replace(/-/g, "");
      await createPocketWifiOrder(applicationId, orderDetails, mobile);
      setLastOrderId(applicationId);
      toast.success("Oda imehifadhiwa. Unaweza kuifuatilia kwenye Historia > Maombi yangu ya huduma.");
      if (popup) popup.location.href = "https://wa.me/255698232313?text=" + encodeURIComponent(message);
      else toast.error("Oda imehifadhiwa, lakini WhatsApp haikufunguka. Fungua WhatsApp uwasiliane na support.");
    } catch (error: any) {
      if (popup) popup.close();
      toast.error(error?.message ?? "Imeshindikana kuhifadhi oda. Tafadhali jaribu tena.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
    <div className="relative overflow-hidden bg-gradient-to-br from-[#092a61] via-[#124a9b] to-[#087f9d] text-white">
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[36px] border-white/[0.06]" />
      <div className="pointer-events-none absolute -bottom-36 left-[42%] h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
      <header className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Rudi mwanzo" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 transition hover:bg-white/20"><ArrowLeft size={20} /></Link>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200 sm:text-xs">SMARTSERVICESTZ · INTERNET</p><h1 className="mt-1 text-lg font-black leading-tight sm:text-2xl">PATA POCKET WIFI &amp; MABANDO</h1></div>
        <span className="ml-auto hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 sm:flex"><Wifi size={24} className="text-cyan-200" /></span>
      </header>
      <div className="relative mx-auto grid max-w-6xl gap-4 px-4 pb-8 pt-1 sm:px-6 md:grid-cols-[1fr_auto] md:items-end lg:px-8 lg:pb-10">
        <div><span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-200/10 px-3 py-1.5 text-xs font-semibold text-cyan-100"><Zap size={14} /> Router na bando kulingana na mahitaji yako</span><h2 className="mt-4 max-w-2xl text-2xl font-black leading-tight sm:text-4xl">Mtandao wako. <span className="text-cyan-200">Chaguo lako.</span></h2><p className="mt-3 max-w-xl text-sm leading-6 text-blue-100 sm:text-base">Chagua kifaa, linganisha mabando na uone gharama yote kabla ya kutuma oda.</p></div>
        <div className="hidden items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 md:flex"><ShieldCheck size={25} className="text-cyan-200" /><div><p className="text-sm font-bold">Bei wazi</p><p className="text-xs text-blue-100">Jumla inajihesabu yenyewe</p></div></div>
      </div>
    </div>

    <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-6 px-4 py-6 sm:px-6 md:py-8 lg:grid-cols-[1.2fr_.8fr] lg:px-8">
      <div className="space-y-7">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Package size={21} /></span><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Hatua ya 1</p><h2 className="text-lg font-extrabold">Chagua kifaa cha Wi-Fi</h2><p className="text-xs text-slate-500">Bonyeza kifaa unachotaka.</p></div></div>
          <div className="grid gap-3">
            {devices.map((item) => {
              const DeviceIcon = item.icon;
              const active = selectedDevice === item.id;
              const iconStyle = item.theme === "cyan" ? "bg-cyan-50 text-cyan-700 ring-cyan-100" : item.theme === "violet" ? "bg-violet-50 text-violet-700 ring-violet-100" : "bg-blue-50 text-blue-700 ring-blue-100";
              return <button type="button" key={item.id} aria-pressed={active} onClick={() => setSelectedDevice(item.id)} className={"flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition sm:gap-4 sm:p-4 " + (active ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/10" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50")}>
                <span className={"flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 sm:h-16 sm:w-16 " + iconStyle}><DeviceIcon size={29} strokeWidth={1.7} /></span>
                <span className="min-w-0 flex-1"><strong className="block text-sm font-extrabold leading-5 text-slate-900 sm:text-base">{item.shortName}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span><span className="mt-2 flex flex-wrap gap-1.5">{item.features.map(feature => <span key={feature} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{feature}</span>)}</span></span>
                <span className="flex shrink-0 flex-col items-end gap-2"><strong className="text-xs font-black text-blue-800 sm:text-sm">{money(item.price)}</strong><span className={"flex h-5 w-5 items-center justify-center rounded-full border " + (active ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 text-transparent")}><Check size={12} /></span></span>
              </button>;
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Radio size={21} /></span><div><p className="text-xs font-bold uppercase tracking-wider text-rose-600">Hatua ya 2</p><h2 className="text-lg font-extrabold">Chagua bando</h2><p className="text-xs text-slate-500">Vodacom Unlimited M2M · No Data Cap</p></div></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {plans.map((item) => {
              const active = selectedPlan === item.id;
              return <button type="button" key={item.id} aria-pressed={active} onClick={() => setSelectedPlan(item.id)} className={"relative flex min-h-[118px] flex-col items-start rounded-2xl border p-4 text-left transition " + (active ? "border-rose-400 bg-rose-50 ring-2 ring-rose-400/10" : "border-slate-200 bg-white hover:border-rose-200 hover:bg-rose-50/40")}>
                {active && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white"><Check size={12} /></span>}
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.id === "none" ? "Chaguo la 1" : "Vodacom M2M"}</span><strong className="mt-1 pr-5 text-base font-black text-slate-900">{item.speed}</strong><span className="mt-1 text-[11px] text-slate-500">{item.description}</span><span className={"mt-auto pt-3 text-sm font-black " + (item.price === 0 ? "text-slate-600" : "text-rose-600")}>{money(item.price)}</span>
              </button>;
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Kasi halisi inaweza kutegemea coverage, eneo na masharti ya mtoa huduma.</p>
        </section>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-[#0b3270] to-[#087e9c] p-5 text-white sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Muhtasari wa oda yako</p><div className="mt-3 flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><ShoppingBag size={23} /></span><div className="min-w-0"><h3 className="font-extrabold">{device.shortName}</h3><p className="mt-1 text-xs text-blue-100">{plan.speed}{selectedPlan === "none" ? " · Bila bando" : " · Unlimited M2M"}</p></div></div></div>
          <div className="space-y-3 p-5 sm:p-6"><div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-500">Bei ya kifaa</span><strong>{money(device.price)}</strong></div><div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-500">Bei ya bando</span><strong>{money(plan.price)}</strong></div><div className="border-t border-dashed border-slate-200 pt-4"><p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">JUMLA KUU</p><p className="mt-1 text-3xl font-black tracking-tight text-blue-800">{money(total)}</p><p className="mt-1 text-[11px] text-slate-500">Bei ya kifaa + bei ya bando ulilochagua.</p></div></div>
        </section>

        <form onSubmit={submitOrder} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><MapPin size={21} /></span><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Hatua ya 3</p><h2 className="text-lg font-extrabold">Taarifa za mteja</h2><p className="text-xs text-slate-500">Jaza mahali ulipo na mawasiliano.</p></div></div>
          <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Jina kamili <span className="text-rose-500">*</span></span><input required autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Andika jina lako kamili" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" /></label>
          <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Namba ya mawasiliano <span className="text-rose-500">*</span></span><span className="relative block"><MessageCircle size={16} className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400" /><input required type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07XX XXX XXX" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" /></span></label>
          <div className="border-t border-slate-100 pt-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-slate-800"><MapPin size={16} className="text-emerald-700" /> MAHALI ALIPO</h3><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField label="Mkoa" value={region} onChange={value => { setRegion(value); setDistrict(""); setWard(""); }} placeholder="Chagua mkoa" options={regionNames} />
            <SelectField label="Wilaya" value={district} onChange={value => { setDistrict(value); setWard(""); }} placeholder={region ? "Chagua wilaya" : "Anza kwa kuchagua mkoa"} options={districtNames} disabled={!region} />
            <SelectField label="Kata" value={ward} onChange={setWard} placeholder={district ? "Chagua kata" : "Anza kwa kuchagua wilaya"} options={wardNames} disabled={!district} />
            <label className="block min-w-0 space-y-1.5"><span className="text-sm font-semibold text-slate-700">Kijiji / Mtaa <span className="text-rose-500">*</span></span><input required value={village} onChange={e => setVillage(e.target.value)} placeholder="Andika kijiji au mtaa" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" /></label>
          </div><p className="mt-2 text-[11px] leading-5 text-slate-500">Wilaya na kata huonekana baada ya kuchagua eneo lililotangulia. Kama jina la kata halipo kwenye orodha, tafadhali chagua lililo karibu na ulitaje kijiji/mtaa kwa usahihi.</p></div>
          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-emerald-700/15 transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-emerald-600/20"><MessageCircle size={18} /> {busy ? "INAHIFADHI ODA..." : "Hifadhi oda na tuma WhatsApp"}</button>
          <p className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-700" /> Oda itahifadhiwa kwenye akaunti yako na kufika kwenye dashboard ya admin; WhatsApp itafunguka kwa ajili ya kuituma pia. Kagua ujumbe, kisha bonyeza Tuma.</p>{lastOrderId && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">Oda yako imehifadhiwa. Rejea: {lastOrderId}. Fuata hali yake kupitia Historia → Maombi yangu ya huduma.</p>}
        </form>
      </aside>
    </div>
    <footer className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 pb-8 text-center text-xs text-slate-500 sm:px-6"><CheckCircle2 size={15} className="shrink-0 text-emerald-600" /> Chaguo na gharama zote zinaonekana kabla ya kutuma oda.</footer>
  </main>;
}
