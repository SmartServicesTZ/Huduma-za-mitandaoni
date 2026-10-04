import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Image as ImageIcon, RotateCcw, ShieldCheck, Smartphone } from "lucide-react";

type NetworkKey = "airtel" | "vodacom" | "halotel" | "yas";
type NetworkConfig = { name: string; template: string; logo: string; className: NetworkKey };

const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  airtel: { name: "AIRTEL", template: "Airtel.png", logo: "airtel-logo.png", className: "airtel" },
  vodacom: { name: "VODACOM", template: "Vodacom.png", logo: "vodacom-logo.png", className: "vodacom" },
  halotel: { name: "HALOTEL", template: "Halotel.png", logo: "halotel-logo.png", className: "halotel" },
  yas: { name: "YAS", template: "Yas.png", logo: "yas-logo.png", className: "yas" },
};

/**
 * STICKER ZA WAKALA
 * Templates na logos zinawekwa kwenye client/public/
 *
 * Airtel.png, Vodacom.png, Halotel.png, Yas.png
 * airtel-logo.png, vodacom-logo.png, halotel-logo.png, yas-logo.png
 *
 * X/Y ya maandishi iko hapa:
 * left/top ni asilimia ya template.
 */
export const STICKER_LAYOUT = {
  name: { left: 50, top: 72, fontPercent: 3.4 },
  number: { left: 50, top: 82, fontPercent: 3.1 },
} as const;

const themes: Record<NetworkKey, { main: string; main2: string; light: string; text: string }> = {
  airtel: { main: "#e60012", main2: "#b9000e", light: "#fff0f2", text: "#fff" },
  vodacom: { main: "#e60000", main2: "#b80000", light: "#fff0f0", text: "#fff" },
  halotel: { main: "#f58220", main2: "#d96200", light: "#fff4e9", text: "#fff" },
  yas: { main: "#ffd400", main2: "#0066cc", light: "#fffbe1", text: "#172033" },
};

function asset(name: string) {
  return import.meta.env.BASE_URL + name;
}
function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}
function cleanNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 12);
}

export default function AgentStickerPage() {
  const [network, setNetwork] = useState<NetworkKey>("airtel");
  const [agentName, setAgentName] = useState("");
  const [agentNumber, setAgentNumber] = useState("");
  const [imageError, setImageError] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const config = NETWORKS[network];
  const theme = themes[network];

  const valid = useMemo(() => {
    const words = cleanName(agentName).split(" ").filter(Boolean);
    return words.length >= 2 && /^\d{5,12}$/.test(cleanNumber(agentNumber));
  }, [agentName, agentNumber]);

  useEffect(() => {
    setImageError(false);
  }, [network]);

  async function downloadSticker() {
    if (!valid || !imageRef.current?.complete || !imageRef.current.naturalWidth) return;

    const image = imageRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const drawText = (
      value: string,
      layout: { left: number; top: number; fontPercent: number },
    ) => {
      if (!value) return;
      ctx.save();
      ctx.fillStyle = "#111";
      ctx.font = "900 " + Math.max(12, canvas.width * (layout.fontPercent / 100)) + "px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(value, canvas.width * (layout.left / 100), canvas.height * (layout.top / 100));
      ctx.restore();
    };

    drawText(cleanName(agentName), STICKER_LAYOUT.name);
    drawText(cleanNumber(agentNumber), STICKER_LAYOUT.number);

    const safeName = cleanName(agentName).replace(/\s+/g, "-").toLowerCase();
    const safeNumber = cleanNumber(agentNumber);
    const link = document.createElement("a");
    link.download = network + "-" + safeName + "-" + safeNumber + ".png";
    link.href = canvas.toDataURL("image/png", 1);
    link.click();
  }

  function reset() {
    setAgentName("");
    setAgentNumber("");
    setNetwork("airtel");
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900" style={{ "--st-main": theme.main, "--st-light": theme.light, "--st-text": theme.text } as React.CSSProperties}>
      <header className="sticky top-0 z-20 shadow-sm" style={{ background: "var(--st-main)", color: "var(--st-text)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm">
              <img src={asset(config.logo)} alt={config.name} className="h-full w-full object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight sm:text-xl">STICKER ZA WAKALA</h1>
              <p className="text-xs opacity-90">{config.name} • Live Form Preview</p>
            </div>
          </div>
          <ShieldCheck className="hidden h-6 w-6 sm:block" />
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <section className="mb-6 text-center">
          <h2 className="text-2xl font-black sm:text-3xl">Chagua Mtandao</h2>
          <p className="mt-1 text-sm text-slate-500">Chagua mtandao unaotaka kutengeneza sticker yake.</p>
        </section>

        <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(Object.keys(NETWORKS) as NetworkKey[]).map((key) => {
            const item = NETWORKS[key];
            const active = network === key;
            return (
              <button key={key} type="button" onClick={() => setNetwork(key)} className="rounded-2xl border-2 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" style={{ borderColor: active ? theme.main : "#e5e7eb" }}>
                <img src={asset(item.logo)} alt={item.name} className="mx-auto h-12 w-12 object-contain" />
                <span className="mt-2 block text-sm font-black">{item.name}</span>
              </button>
            );
          })}
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[370px_minmax(0,1fr)]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 rounded-2xl p-4" style={{ background: theme.main, color: theme.text }}>
              <h3 className="font-black">Taarifa za Wakala</h3>
              <p className="mt-1 text-xs opacity-90">Jaza taarifa zako ili kutengeneza sticker.</p>
            </div>

            <div className="mb-5 flex items-center gap-3 rounded-2xl p-3" style={{ background: theme.light }}>
              <img src={asset(config.logo)} alt="" className="h-10 w-10 object-contain" />
              <div><p className="text-[11px] text-slate-500">Mtandao uliochaguliwa</p><strong>{config.name}</strong></div>
            </div>

            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-extrabold">Jina la Wakala</span>
              <input value={agentName} onChange={(e) => setAgentName(cleanName(e.target.value))} maxLength={40} placeholder="MFANO: STAWARD NJIWA" autoComplete="off" className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-base font-semibold outline-none transition focus:border-slate-400" />
              <span className="mt-1 block text-[11px] text-slate-500">Andika majina mawili au zaidi, mfano: STAWARD NJIWA.</span>
            </label>

            <label className="mb-5 block">
              <span className="mb-2 block text-sm font-extrabold">Namba ya Wakala</span>
              <input value={agentNumber} onChange={(e) => setAgentNumber(cleanNumber(e.target.value))} inputMode="numeric" maxLength={12} placeholder="MFANO: 1461417" autoComplete="off" className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-base font-semibold outline-none transition focus:border-slate-400" />
              <span className="mt-1 block text-[11px] text-slate-500">Andika namba ya wakala bila alama.</span>
            </label>

            <button type="button" disabled={!valid} onClick={downloadSticker} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-black text-white transition disabled:cursor-not-allowed disabled:opacity-50" style={{ background: theme.main }}>
              <Download className="h-5 w-5" /> PAKUA STICKER
            </button>
            <button type="button" onClick={reset} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700">
              <RotateCcw className="h-4 w-4" /> Rudisha
            </button>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div><h3 className="font-black">Live Preview</h3><p className="text-xs text-slate-500">Template: {config.template}</p></div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">LIVE</span>
            </div>

            <div className="flex min-h-[420px] items-center justify-center overflow-auto rounded-2xl bg-slate-100 p-3 sm:p-5">
              <div className="relative inline-block leading-none shadow-xl">
                <img ref={imageRef} src={asset(config.template)} alt={config.name + " agent sticker template"} className="block h-auto max-w-full" onError={() => setImageError(true)} />
                {!imageError && <>
                  <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center font-black uppercase" style={{ left: STICKER_LAYOUT.name.left + "%", top: STICKER_LAYOUT.name.top + "%", fontSize: "clamp(12px, 3vw, 28px)", color: "#111" }}>{cleanName(agentName)}</div>
                  <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center font-black" style={{ left: STICKER_LAYOUT.number.left + "%", top: STICKER_LAYOUT.number.top + "%", fontSize: "clamp(12px, 3vw, 26px)", color: "#111" }}>{cleanNumber(agentNumber)}</div>
                </>}
                {imageError && <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-6 text-center"><div><ImageIcon className="mx-auto mb-2 h-8 w-8 text-slate-400" /><p className="font-bold">Template haijapatikana.</p><p className="mt-1 text-xs text-slate-500">Weka {config.template} ndani ya client/public/.</p></div></div>}
              </div>
            </div>
          </section>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-slate-500"><Smartphone className="h-4 w-4" /> Sticker • Live Preview • PNG download</div>
      </div>
    </main>
  );
}
