import { useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, CheckCircle2, MapPin, MessageCircle, Package, Radio, Router, ShieldCheck, ShoppingBag, Smartphone, Wifi, Zap } from "lucide-react";
import { toast } from "sonner";

type DeviceId = "wireless-300" | "olax-mt30" | "zte-k12";
type PlanId = "none" | "10mbps" | "20mbps" | "30mbps" | "50mbps" | "100mbps";

const devices: Array<{ id: DeviceId; name: string; shortName: string; description: string; features: string[]; price: number; icon: typeof Wifi; tone: string }> = [
  { id: "wireless-300", name: "Wireless Mobile WiFi (300Mbps)", shortName: "Wireless Mobile WiFi", description: "Pocket WiFi ya kubebeka kwa matumizi ya kila siku.", features: ["Kasi hadi 300Mbps", "Muundo wa kubebeka"], price: 65000, icon: Wifi, tone: "cyan" },
  { id: "olax-mt30", name: "OLAX MT30 LTE Advanced Mobile CPE", shortName: "OLAX MT30 LTE Advanced", description: "Router yenye betri kubwa na nafasi ya kuunganisha LAN.", features: ["Betri 4000mAh", "LAN Port"], price: 100000, icon: Router, tone: "violet" },
  { id: "zte-k12", name: "ZTE K12 Wi-Fi 6 Router", shortName: "ZTE K12 Wi-Fi 6", description: "Router ya Wi-Fi 6 inayoweza kuunganisha hadi watumiaji 32.", features: ["Hadi watumiaji 32", "Betri 3000mAh"], price: 135000, icon: Radio, tone: "emerald" },
];

const plans: Array<{ id: PlanId; name: string; speed: string; description: string; price: number }> = [
  { id: "none", name: "Bila Bando", speed: "Kifaa pekee", description: "Nunua router bila bando.", price: 0 },
  { id: "10mbps", name: "Unlimited M2M", speed: "Hadi 10Mbps", description: "Vodacom Unlimited M2M · No Data Cap", price: 70000 },
  { id: "20mbps", name: "Unlimited M2M", speed: "Hadi 20Mbps", description: "Vodacom Unlimited M2M · No Data Cap", price: 100000 },
  { id: "30mbps", name: "Unlimited M2M", speed: "Hadi 30Mbps", description: "Vodacom Unlimited M2M · No Data Cap", price: 120000 },
  { id: "50mbps", name: "Unlimited M2M", speed: "Hadi 50Mbps", description: "Vodacom Unlimited M2M · No Data Cap", price: 150000 },
  { id: "100mbps", name: "Unlimited M2M", speed: "Hadi 100Mbps", description: "Vodacom Unlimited M2M · No Data Cap", price: 200000 },
];

const money = (amount: number) => "TSHS " + amount.toLocaleString("en-US") + "/=";

export default function PocketWifiPage() {
  const [selectedDevice, setSelectedDevice] = useState<DeviceId>("wireless-300");
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("none");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");

  const device = useMemo(() => devices.find((item) => item.id === selectedDevice) ?? devices[0], [selectedDevice]);
  const plan = useMemo(() => plans.find((item) => item.id === selectedPlan) ?? plans[0], [selectedPlan]);
  const total = device.price + plan.price;

  const submitOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();
    const cleanLocation = location.trim();
    const digits = cleanPhone.replace(/\D/g, "");
    if (!cleanName || !cleanPhone || !cleanLocation) {
      toast.error("Tafadhali jaza jina, namba ya simu na eneo.");
      return;
    }
    if (digits.length < 9 || digits.length > 13) {
      toast.error("Tafadhali weka namba sahihi ya simu au WhatsApp.");
      return;
    }

    const message = [
      "HABARI SMARTSERVICESTZ, NAOMBA KUNUNUA POCKET WIFI / ROUTER.",
      "",
      "Jina kamili: " + cleanName,
      "Simu / WhatsApp: " + cleanPhone,
      "Eneo / Mtaa: " + cleanLocation,
      "",
      "KIFAA: " + device.name,
      "Bei ya kifaa: " + money(device.price),
      "BANDO: " + plan.speed + (plan.id === "none" ? " (Hakuna bando)" : " - Vodacom Unlimited M2M"),
      "Bei ya bando: " + money(plan.price),
      "JUMLA KUU: " + money(total),
      "",
      "Tafadhali nisaidie kuthibitisha upatikanaji na utaratibu wa malipo / usafirishaji."
    ].join("\n");
    const url = "https://wa.me/255698232313?text=" + encodeURIComponent(message);
    const popup = window.open(url, "_blank");
    if (popup) {
      popup.opener = null;
      toast.success("WhatsApp imefunguliwa. Kagua taarifa kisha bonyeza Tuma.");
    } else {
      toast.error("WhatsApp haikufunguka. Ruhusu pop-up kwenye browser kisha jaribu tena.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-5 md:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex items-start gap-3 border-b border-white/10 pb-5">
          <Link href="/" aria-label="Rudi mwanzo" className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-emerald-300 transition hover:bg-white/10">
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">HUDUMA ZA INTERNET</span>
            <h1 className="mt-1 text-xl font-black leading-tight sm:text-3xl">PATA POCKET WIFI &amp; MABANDO</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Chagua kifaa cha router, ongeza bando unalotaka, kisha tuma oda yako kupitia WhatsApp.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200"><Wifi size={13} /> Pocket WiFi &amp; Router</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200"><Zap size={13} /> Unlimited M2M</span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="space-y-7 lg:col-span-7">
            <section>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><Package size={19} /></span>
                <div><h2 className="font-bold">1. Chagua kifaa</h2><p className="text-xs text-slate-400">Chagua router unayotaka kununua.</p></div>
              </div>
              <div className="grid gap-3">
                {devices.map((item) => {
                  const DeviceIcon = item.icon;
                  const active = selectedDevice === item.id;
                  return (
                    <button key={item.id} type="button" aria-pressed={active} onClick={() => setSelectedDevice(item.id)} className={"group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition sm:gap-4 sm:p-4 " + (active ? "border-emerald-400/70 bg-emerald-400/[0.08] ring-1 ring-emerald-400/20" : "border-white/10 bg-slate-900/80 hover:border-white/20 hover:bg-slate-900")}>
                      <span className={"flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border sm:h-16 sm:w-16 " + (item.tone === "cyan" ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-300" : item.tone === "violet" ? "border-violet-300/20 bg-violet-300/10 text-violet-300" : "border-emerald-300/20 bg-emerald-300/10 text-emerald-300")}><DeviceIcon size={28} strokeWidth={1.7} /></span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm leading-5 text-white sm:text-base">{item.shortName}</strong>
                        <span className="mt-1 block text-xs leading-5 text-slate-400">{item.description}</span>
                        <span className="mt-2 flex flex-wrap gap-1.5">{item.features.map((feature) => <span key={feature} className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-300">{feature}</span>)}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-2">
                        <span className="text-xs font-extrabold text-emerald-300 sm:text-sm">{money(item.price)}</span>
                        <span className={"flex h-5 w-5 items-center justify-center rounded-full border " + (active ? "border-emerald-300 bg-emerald-300 text-slate-950" : "border-slate-600 text-transparent")}><Check size={13} /></span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-400/10 text-rose-300"><Radio size={19} /></span>
                <div><h2 className="font-bold">2. Chagua bando la Vodacom Unlimited M2M</h2><p className="text-xs text-slate-400">Bei za mabando kama zilivyoorodheshwa.</p></div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {plans.map((item) => {
                  const active = selectedPlan === item.id;
                  return (
                    <button key={item.id} type="button" aria-pressed={active} onClick={() => setSelectedPlan(item.id)} className={"relative flex min-h-32 flex-col items-start rounded-2xl border p-4 text-left transition " + (active ? "border-rose-400/70 bg-rose-400/[0.08] ring-1 ring-rose-400/20" : "border-white/10 bg-slate-900/80 hover:border-white/20")}>
                      {active && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-rose-300 text-slate-950"><Check size={12} /></span>}
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{item.name}</span>
                      <strong className="mt-1 text-lg font-black text-white">{item.speed}</strong>
                      <span className="mt-1 text-[11px] leading-4 text-slate-400">{item.description}</span>
                      <span className={"mt-auto pt-3 text-sm font-extrabold " + (item.id === "none" ? "text-slate-300" : "text-rose-300")}>{item.price === 0 ? "TSHS 0" : money(item.price)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">Kumbuka: kasi ya mtandao hutegemea eneo, coverage na masharti ya mtoa huduma.</p>
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-5 lg:col-span-5">
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/20">
              <div className="border-b border-white/10 bg-gradient-to-r from-emerald-400/10 to-cyan-400/10 p-5">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">Muhtasari wa oda</span>
                <div className="mt-3 flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5 text-emerald-300"><ShoppingBag size={23} /></span>
                  <div className="min-w-0"><h3 className="font-bold leading-5">{device.shortName}</h3><p className="mt-1 text-xs text-slate-400">{plan.speed}{plan.id === "none" ? " · Kifaa pekee" : " · Vodacom M2M"}</p></div>
                </div>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-4 text-sm"><span className="text-slate-400">Bei ya kifaa</span><strong>{money(device.price)}</strong></div>
                <div className="flex items-center justify-between gap-4 text-sm"><span className="text-slate-400">Bei ya bando</span><strong>{money(plan.price)}</strong></div>
                <div className="border-t border-dashed border-white/15 pt-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">JUMLA KUU</span>
                  <div className="mt-1 break-words text-2xl font-black text-emerald-300 sm:text-3xl">{money(total)}</div>
                  <p className="mt-1 text-[11px] text-slate-500">Bei huhesabiwa moja kwa moja kulingana na chaguo lako.</p>
                </div>
              </div>
            </section>

            <form onSubmit={submitOrder} className="space-y-4 rounded-2xl border border-white/10 bg-slate-900 p-5">
              <div><h2 className="font-bold">3. Taarifa zako</h2><p className="mt-1 text-xs leading-5 text-slate-400">Jaza mawasiliano ili oda itayarishwe kwenye WhatsApp.</p></div>
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Jina lako kamili</span><span className="relative block"><Smartphone size={16} className="pointer-events-none absolute left-3 top-3.5 text-slate-500" /><input required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Mfano: Juma Ally" className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10" /></span></label>
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Namba ya simu / WhatsApp</span><span className="relative block"><MessageCircle size={16} className="pointer-events-none absolute left-3 top-3.5 text-slate-500" /><input required type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07xx xxx xxx" className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10" /></span></label>
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Eneo / Mtaa unakoishi</span><span className="relative block"><MapPin size={16} className="pointer-events-none absolute left-3 top-3.5 text-slate-500" /><input required autoComplete="street-address" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Mfano: Mwenge, Dar es Salaam" className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/10" /></span></label>
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/10 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-slate-900"><MessageCircle size={18} /> Tuma oda WhatsApp</button>
              <p className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-300" /> WhatsApp itafunguka na ujumbe uliojazwa. Hakikisha taarifa ziko sahihi kisha bonyeza Tuma ili kutuma oda.</p>
            </form>
          </aside>
        </div>
        <footer className="mt-7 flex items-center justify-center gap-2 border-t border-white/10 pt-5 text-center text-[11px] text-slate-500"><CheckCircle2 size={14} className="text-emerald-300" /> Bei na chaguo la bando vitaonekana kwenye muhtasari kabla ya kutuma oda.</footer>
      </div>
    </main>
  );
}
