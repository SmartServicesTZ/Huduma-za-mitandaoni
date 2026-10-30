import React, { useEffect, useRef, useState } from "react";
import { Download, RotateCcw, ShieldCheck } from "lucide-react";
import { triggerDownload } from "@/lib/downloadHistory";

type NetworkKey = "airtel" | "vodacom";

const NETWORKS: Record<NetworkKey, { name: string; template: string; width: number; height: number; numberY: number; nameY: number }> = {
  airtel: { name: "AIRTEL MONEY", template: "Airtel.png", width: 1536, height: 1081, numberY: 0.45, nameY: 0.715 },
  vodacom: { name: "VODACOM M-PESA", template: "Vodacom.png", width: 1536, height: 970, numberY: 0.465, nameY: 0.765 },
};

const asset = (file: string) => import.meta.env.BASE_URL + file;
const cleanName = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();
const cleanNumber = (value: string) => value.replace(/\D/g, "").slice(0, 12);

export default function AgentStickerPage() {
  const [network, setNetwork] = useState<NetworkKey>("airtel");
  const [agentName, setAgentName] = useState("");
  const [agentNumber, setAgentNumber] = useState("");
  const [templateReady, setTemplateReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const config = NETWORKS[network];

  const valid = cleanName(agentName).split(" ").filter(Boolean).length >= 2 && /^\d{5,12}$/.test(cleanNumber(agentNumber));

  // Preview na faili la PNG hutengenezwa na canvas hii hii ili visipishane.
  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!templateReady || !image || !canvas || !image.complete || !image.naturalWidth) return;

    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const drawCentered = (value: string, y: number, initialSize: number, maxWidth: number) => {
      if (!value) return;
      ctx.save();
      ctx.fillStyle = "#050505";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let size = initialSize;
      ctx.font = `900 ${size}px Arial, Helvetica, sans-serif`;
      while (ctx.measureText(value).width > maxWidth && size > 24) {
        size -= 2;
        ctx.font = `900 ${size}px Arial, Helvetica, sans-serif`;
      }
      ctx.fillText(value, canvas.width / 2, y, maxWidth);
      ctx.restore();
    };

    drawCentered(cleanNumber(agentNumber), canvas.height * config.numberY, canvas.width * 0.145, canvas.width * 0.82);
    drawCentered(cleanName(agentName), canvas.height * config.nameY, canvas.width * 0.078, canvas.width * 0.84);
  }, [network, agentName, agentNumber, templateReady, config]);

  function downloadSticker() {
    const canvas = canvasRef.current;
    if (!valid || !canvas || !templateReady || busy) return;
    setBusy(true);
    canvas.toBlob((blob) => {
      if (!blob) {
        setBusy(false);
        return;
      }
      const safeName = cleanName(agentName).replace(/\s+/g, "-").toLowerCase();
      triggerDownload(blob, `stika-wakala-${network}-${safeName}-${cleanNumber(agentNumber)}.png`, "PNG");
      setBusy(false);
    }, "image/png", 1);
  }

  function reset() {
    setAgentName("");
    setAgentNumber("");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-5 text-slate-900 sm:px-6">
      <img
        ref={imageRef}
        src={asset(config.template)}
        alt=""
        aria-hidden="true"
        className="hidden"
        onLoad={() => setTemplateReady(true)}
        onError={() => setTemplateReady(false)}
      />

      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between gap-3 rounded-2xl px-4 py-4 text-white shadow-sm sm:px-6" style={{ background: network === "airtel" ? "#e60012" : "#e31837" }}>
          <div>
            <p className="text-xs font-bold tracking-widest opacity-90">HUDUMA ZA MTANDAONI</p>
            <h1 className="text-xl font-black sm:text-2xl">STIKA ZA WAKALA</h1>
            <p className="mt-1 text-xs opacity-90">Airtel Money na Vodacom M-Pesa</p>
          </div>
          <ShieldCheck className="h-7 w-7 shrink-0" />
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-black">Taarifa za wakala</h2>

            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-extrabold">Chagua mtandao</span>
              <select
                value={network}
                onChange={(event) => { setTemplateReady(false); setNetwork(event.target.value as NetworkKey); }}
                className="h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-base font-semibold outline-none focus:border-slate-500"
              >
                <option value="airtel">Airtel Money</option>
                <option value="vodacom">Vodacom M-Pesa</option>
              </select>
            </label>

            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-extrabold">Majina ya wakala</span>
              <input
                value={agentName}
                onChange={(event) => setAgentName(event.target.value.slice(0, 40))}
                maxLength={40}
                autoComplete="off"
                placeholder="Mfano: STAWARD NJIWA"
                className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-base font-semibold uppercase outline-none focus:border-slate-500"
              />
              <small className="mt-1 block text-xs text-slate-500">Andika majina ya wakala kama yanavyoonekana kwenye usajili.</small>
            </label>

            <label className="mb-5 block">
              <span className="mb-2 block text-sm font-extrabold">Namba ya wakala</span>
              <input
                value={agentNumber}
                onChange={(event) => setAgentNumber(cleanNumber(event.target.value))}
                inputMode="numeric"
                maxLength={12}
                autoComplete="off"
                placeholder="Mfano: 1461417"
                className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-base font-semibold outline-none focus:border-slate-500"
              />
              <small className="mt-1 block text-xs text-slate-500">Tarakimu 5 hadi 12, bila nafasi au alama.</small>
            </label>

            <button
              type="button"
              disabled={!valid || !templateReady || busy}
              onClick={downloadSticker}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: network === "airtel" ? "#e60012" : "#e31837" }}
            >
              <Download className="h-5 w-5" /> {busy ? "Inaandaa..." : "PAKUA STIKA PNG"}
            </button>
            <button type="button" onClick={reset} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700">
              <RotateCcw className="h-4 w-4" /> Futa taarifa
            </button>
            {!valid && (agentName || agentNumber) && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">Hakikisha umeandika angalau majina mawili na namba sahihi ya wakala.</p>}
          </section>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h2 className="font-black">Muonekano wa stika</h2><p className="text-xs text-slate-500">{config.name} · Hakikisho la moja kwa moja</p></div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">LIVE PREVIEW</span>
            </div>
            <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl bg-slate-100 p-2 sm:p-4">
              <canvas ref={canvasRef} className="block h-auto w-full max-w-3xl shadow-lg" aria-label={`Stika ya wakala ${config.name}`} />
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">Picha inayopakuliwa ni hii hii inayoonekana kwenye hakikisho.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
