import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Download, QrCode, RotateCcw, Sparkles } from "lucide-react";
import { triggerDownload } from "@/lib/downloadHistory";

type Network = "AIRTEL" | "VODACOM" | "YAS" | "HALOTEL";
const palettes: Record<Network, { main: string; dark: string; accent: string; text: string }> = {
  AIRTEL: { main: "#ed1c2e", dark: "#b80e20", accent: "#ffc928", text: "#fff" },
  VODACOM: { main: "#e31837", dark: "#a9001c", accent: "#fff", text: "#fff" },
  YAS: { main: "#ffd500", dark: "#102d69", accent: "#102d69", text: "#101828" },
  HALOTEL: { main: "#f58220", dark: "#b64d00", accent: "#fff", text: "#fff" },
};

const clean = (v: string) => v.replace(/\s+/g, " ").trim();
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 14);

export default function LipaStickerPage() {
  const [network, setNetwork] = useState<Network>("AIRTEL");
  const [names, setNames] = useState("");
  const [lipaNumber, setLipaNumber] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const theme = palettes[network];
  const valid = useMemo(() => clean(names).split(" ").filter(Boolean).length >= 2 && /^\d{5,14}$/.test(digits(lipaNumber)), [names, lipaNumber]);
  const qrPayload = useMemo(() => `LIPA NAMBA\nMtandao: ${network}\nNamba: ${digits(lipaNumber)}\nJina: ${clean(names).toUpperCase()}`, [network, lipaNumber, names]);

  useEffect(() => {
    let cancelled = false;
    if (!valid) { setQr(""); return; }
    QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "M", margin: 1, width: 240, color: { dark: "#111827", light: "#ffffff" } })
      .then((url: string) => { if (!cancelled) setQr(url); })
      .catch(() => { if (!cancelled) setQr(""); });
    return () => { cancelled = true; };
  }, [valid, qrPayload]);

  async function downloadSticker() {
    if (!valid || !qr) return;
    setBusy(true); setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1500; canvas.height = 1000;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Kifaa cha kutengeneza picha hakipatikani.");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      bg.addColorStop(0, theme.main); bg.addColorStop(1, theme.dark);
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(520, 0); ctx.lineTo(0, 430); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(70, 40); ctx.lineTo(70, 390); ctx.stroke();
      ctx.fillStyle = theme.main; ctx.fillRect(0, 0, canvas.width, 22);
      ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 12; ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
      ctx.textAlign = "center"; ctx.fillStyle = theme.main; ctx.font = "900 86px Arial"; ctx.fillText("LIPA NAMBA", 750, 170);
      ctx.fillStyle = "#64748b"; ctx.font = "bold 34px Arial"; ctx.fillText("LIPA KWA MITANDAO YOTE", 750, 225);
      ctx.fillStyle = theme.main; ctx.beginPath(); ctx.roundRect(190, 290, 1120, 245, 62); ctx.fill();
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 14; ctx.stroke();
      ctx.fillStyle = theme.text; ctx.font = `900 ${clean(names).length > 23 ? 52 : 68}px Arial`; ctx.fillText(clean(names).toUpperCase(), 750, 430, 1020);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(180, 600, 800, 190, 80); ctx.fill();
      ctx.strokeStyle = theme.main; ctx.lineWidth = 12; ctx.stroke();
      ctx.fillStyle = theme.main; ctx.font = "900 78px Arial"; ctx.fillText(digits(lipaNumber), 580, 715, 720);
      const qrImage = new Image(); qrImage.src = qr;
      await new Promise<void>((resolve, reject) => { qrImage.onload = () => resolve(); qrImage.onerror = () => reject(new Error("QR code haikuweza kupakiwa.")); });
      ctx.fillStyle = "#fff"; ctx.fillRect(1030, 580, 270, 270); ctx.drawImage(qrImage, 1045, 595, 240, 240);
      ctx.fillStyle = "#334155"; ctx.font = "bold 24px Arial"; ctx.fillText("SCAN / TAARIFA", 1165, 890);
      ctx.fillStyle = theme.dark; ctx.font = "bold 27px Arial"; ctx.fillText(network, 750, 880);
      ctx.fillStyle = "#64748b"; ctx.font = "24px Arial"; ctx.fillText("QR hii ina taarifa za Lipa Namba na jina la biashara", 750, 935);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Sticker haikuweza kutengenezwa.");
      triggerDownload(blob, `stika-lipa-${network.toLowerCase()}-${digits(lipaNumber)}.png`, "PNG");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Imeshindikana kutengeneza sticker.");
    } finally { setBusy(false); }
  }

  function reset() { setNames(""); setLipaNumber(""); setNetwork("AIRTEL"); setError(""); }

  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 rounded-3xl p-5 text-white shadow-lg sm:p-7" style={{ background: `linear-gradient(120deg, ${theme.main}, ${theme.dark})` }}>
        <div className="flex items-center gap-3"><div className="rounded-2xl bg-white/15 p-3"><QrCode size={30}/></div><div><p className="text-xs font-black tracking-[.2em] opacity-90">SMARTSERVICESTZ</p><h1 className="text-2xl font-black sm:text-3xl">STIKA ZA LIPA NAMBA</h1><p className="mt-1 text-sm opacity-90">Tengeneza stika yenye QR code kwa mitandao yote.</p></div></div>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[370px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-black">Jaza taarifa za stika</h2>
          <label className="mb-4 block text-sm font-bold">Mtandao wa Lipa Namba
            <select value={network} onChange={e => setNetwork(e.target.value as Network)} className="mt-2 h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-base">
              {Object.keys(palettes).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="mb-4 block text-sm font-bold">Majina ya biashara (angalau majina 2)
            <input value={names} onChange={e => setNames(e.target.value.slice(0, 48))} maxLength={48} autoComplete="organization" placeholder="Mfano: BRIAN FRANCIS" className="mt-2 h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-base"/>
          </label>
          <label className="mb-2 block text-sm font-bold">Namba ya Lipa Namba
            <input value={lipaNumber} onChange={e => setLipaNumber(digits(e.target.value))} inputMode="numeric" maxLength={14} placeholder="Weka namba ya Lipa" className="mt-2 h-12 w-full rounded-xl border-2 border-slate-200 px-3 text-base"/>
          </label>
          <p className="mb-5 text-xs text-slate-500">Majina na namba vitaonekana kwenye stika na taarifa hizo zitawekwa ndani ya QR code.</p>
          <button disabled={!valid || !qr || busy} onClick={downloadSticker} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-black text-white disabled:opacity-50" style={{background:theme.main}}><Download size={19}/>{busy ? "Inatengeneza..." : "PAKUA STIKA PNG"}</button>
          <button onClick={reset} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700"><RotateCcw size={16}/> Futa taarifa</button>
          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-black">Muonekano wa stika</h2><p className="text-xs text-slate-500">Preview hubadilika unapoandika.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">LIVE</span></div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="relative overflow-hidden px-4 pb-8 pt-8 text-center">
              <div className="absolute left-0 top-0 h-28 w-36 -translate-x-7 -translate-y-8 rotate-[-25deg]" style={{background:theme.main}}/>
              <div className="relative"><h3 className="text-3xl font-black tracking-[.18em]" style={{color:theme.main}}>LIPA NAMBA</h3><p className="mt-2 text-xs font-black tracking-[.18em] text-slate-500">LIPA KWA MITANDAO YOTE</p>
                <div className="mx-auto mt-7 max-w-xl rounded-3xl border-4 px-3 py-5 shadow-sm" style={{background:theme.main,borderColor:theme.accent,color:theme.text}}><p className="break-words text-xl font-black uppercase sm:text-3xl">{clean(names) || "JINA LA BIASHARA"}</p><p className="mt-1 text-xs font-bold opacity-90">{network}</p></div>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-4"><div className="min-w-0 rounded-full border-4 px-5 py-4" style={{borderColor:theme.main,color:theme.main}}><p className="break-all text-2xl font-black sm:text-4xl">{digits(lipaNumber) || "000000000"}</p></div>{qr && <img src={qr} alt="QR code ya taarifa za Lipa Namba" className="h-28 w-28 rounded-lg border border-slate-200 p-1"/>}</div>
                <p className="mt-4 flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-500"><Sparkles size={13}/> QR ina jina, mtandao na namba ya Lipa.</p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-amber-700">Kumbuka: QR code hii ni ya kusoma taarifa za Lipa Namba. Ili iweze kufungua malipo moja kwa moja, tunahitaji muundo rasmi wa QR kutoka kwa mtandao husika.</p>
        </section>
      </div>
    </div>
  </main>;
}
