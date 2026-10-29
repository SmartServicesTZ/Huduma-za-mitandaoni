import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Download, QrCode, RotateCcw } from "lucide-react";
import { triggerDownload } from "@/lib/downloadHistory";

type Network = "AIRTEL" | "VODACOM" | "YAS" | "HALOTEL";
const palettes: Record<Network, { main: string; dark: string; accent: string; text: string; logo: string; label: string }> = {
  AIRTEL: { main: "#ed1c2e", dark: "#b80e20", accent: "#ffc928", text: "#fff", logo: "/airtel-logo.png", label: "AIRTEL MONEY" },
  VODACOM: { main: "#e31837", dark: "#a9001c", accent: "#fff", text: "#fff", logo: "/vodacom-logo.png", label: "M-PESA" },
  YAS: { main: "#ffd500", dark: "#102d69", accent: "#102d69", text: "#102d69", logo: "/yas-logo.png", label: "YAS PESA" },
  HALOTEL: { main: "#f58220", dark: "#b64d00", accent: "#fff", text: "#fff", logo: "/halotel-logo.png", label: "HALOPESA" },
};
const clean = (v: string) => v.replace(/\\s+/g, " ").trim();
const digits = (v: string) => v.replace(/\\D/g, "").slice(0, 14);
const wordCount = (v: string) => clean(v).split(" ").filter(Boolean).length;
const stickerNames = (network: Network, names: string) => {
  const words = clean(names).split(" ").filter(Boolean);
  return (network === "YAS" ? words.slice(0, 2) : network === "AIRTEL" ? words.slice(0, 3) : words.slice(0, 2)).join(" ");
};

export default function LipaStickerPage() {
  const [network, setNetwork] = useState<Network>("AIRTEL");
  const [names, setNames] = useState("");
  const [lipaNumber, setLipaNumber] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const theme = palettes[network];
  const requiredNames = network === "AIRTEL" || network === "YAS" ? 3 : 2;
  const valid = useMemo(() => wordCount(names) >= requiredNames && /^\\d{5,14}$/.test(digits(lipaNumber)), [names, lipaNumber, requiredNames]);
  const qrPayload = useMemo(() => `LIPA NAMBA\\nMtandao: ${network}\\nNamba: ${digits(lipaNumber)}\\nJina: ${clean(names).toUpperCase()}`, [network, lipaNumber, names]);
  useEffect(() => {
    let cancelled = false;
    if (!valid) { setQr(""); return; }
    QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "M", margin: 2, width: 280, color: { dark: "#111827", light: "#ffffff" } })
      .then((url: string) => { if (!cancelled) setQr(url); })
      .catch(() => { if (!cancelled) setQr(""); });
    return () => { cancelled = true; };
  }, [valid, qrPayload]);

  async function downloadSticker() {
    if (!valid || !qr) return;
    setBusy(true); setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1600; canvas.height = 2350;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Kifaa cha kutengeneza picha hakipatikani.");
      // Airtel reference-style sticker: red patterned panel, large QR, number and name fields.
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const red = theme.main, dark = theme.dark;
      ctx.fillStyle = red; ctx.fillRect(0, 250, canvas.width, 1780);
      // subtle dotted red background
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      for (let y = 275; y < 1990; y += 42) for (let x = 20; x < 1580; x += 42) {
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      }
      // white top header with TIPS and network logo
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1600, 250);
      ctx.fillStyle = "#eef2f7"; ctx.fillRect(0, 0, 35, 250);
      const logo = new Image(); logo.src = theme.logo;
      await new Promise<void>((resolve) => { logo.onload = () => resolve(); logo.onerror = () => resolve(); });
      if (logo.naturalWidth > 0) {
        const maxW = 370, maxH = 160, ratio = Math.min(maxW / logo.naturalWidth, maxH / logo.naturalHeight);
        ctx.drawImage(logo, 105, 45, logo.naturalWidth * ratio, logo.naturalHeight * ratio);
      } else {
        ctx.fillStyle = red; ctx.font = "900 68px Arial"; ctx.textAlign = "right"; ctx.fillText(network, 1510, 140);
      }
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "900 42px Arial";
      ctx.fillText("LIPA KUPITIA MTANDAO AU BENKI YOYOTE", 800, 340);
      // QR white card
      const qrImage = new Image(); qrImage.src = qr;
      await new Promise<void>((resolve, reject) => { qrImage.onload = () => resolve(); qrImage.onerror = () => reject(new Error("QR code haikuweza kupakiwa.")); });
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(240, 410, 1120, 1120, 75); ctx.fill();
      ctx.drawImage(qrImage, 325, 495, 950, 950);
      // Lipa number field
      ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "900 34px Arial"; ctx.fillText("LIPA NAMBA", 95, 1600);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(95, 1640, 1410, 205, 26); ctx.fill();
      ctx.strokeStyle = "#ffd500"; ctx.lineWidth = 7; ctx.stroke();
      ctx.fillStyle = "#111827"; ctx.font = "900 94px Arial"; ctx.fillText(digits(lipaNumber), 145, 1770, 1300);
      // Name field
      ctx.fillStyle = "#fff"; ctx.font = "900 34px Arial"; ctx.fillText("JINA", 95, 1905);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(95, 1935, 1410, 155, 26); ctx.fill();
      ctx.strokeStyle = "#ffd500"; ctx.lineWidth = 7; ctx.stroke();
      ctx.fillStyle = "#111827";
      const displayName = stickerNames(network, names).toUpperCase();
      const nameSize = displayName.length > 25 ? 42 : displayName.length > 18 ? 52 : 64;
      ctx.font = `500 ${nameSize}px Arial`; ctx.fillText(displayName, 145, 2030, 1300);
      // footer strip with accepted networks and brand
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 2110, 1600, 240);
      ctx.fillStyle = "#111827"; ctx.font = "bold 30px Arial"; ctx.fillText("Tunapokea:", 75, 2170);
      const networkColors = ["#ffd500", "#e31837", "#f58220", "#ed1c2e"];
      const networkLabels = ["mixx", "M-PESA", "halo", "airtel"];
      for (let i = 0; i < networkLabels.length; i++) {
        const x = 80 + i * 125;
        ctx.fillStyle = networkColors[i]; ctx.beginPath(); ctx.roundRect(x, 2190, 95, 70, 8); ctx.fill();
        ctx.fillStyle = i === 0 ? "#102d69" : "#fff"; ctx.font = "bold 18px Arial"; ctx.textAlign = "center"; ctx.fillText(networkLabels[i], x + 47, 2232);
      }
      ctx.fillStyle = red; ctx.textAlign = "right"; ctx.font = "900 58px Arial"; ctx.fillText("LIPA", 1510, 2195);
      ctx.font = "900 35px Arial"; ctx.fillText("K W A  S I M U", 1510, 2245);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Stika haikuweza kutengenezwa.");
      triggerDownload(blob, `stika-lipa-${network.toLowerCase()}-${digits(lipaNumber)}.png`, "PNG");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Imeshindikana kutengeneza stika.");
    } finally { setBusy(false); }
  }
  function reset() { setNames(""); setLipaNumber(""); setNetwork("AIRTEL"); setError(""); }

  return <main className="min-h-screen bg-slate-100 px-3 py-5 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="h-2" style={{background:theme.main}}/>
        <div className="flex items-center gap-4 p-5 sm:p-7">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm" style={{background:theme.main}}><QrCode size={30}/></div>
          <div><p className="text-xs font-black tracking-[.22em]" style={{color:theme.main}}>SMARTSERVICESTZ</p><h1 className="text-2xl font-black sm:text-3xl">STIKA ZA LIPA NAMBA</h1><p className="mt-1 text-sm text-slate-500">Chagua mtandao; stika itatumia rangi na logo yake.</p></div>
        </div>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[350px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-black">Taarifa za stika</h2>
          <label className="mb-4 block text-sm font-bold">Mtandao
            <select value={network} onChange={e => {setNetwork(e.target.value as Network); setError("");}} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base focus:border-slate-500 focus:outline-none">
              {Object.keys(palettes).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="mb-4 flex items-center gap-3 rounded-2xl p-3" style={{background:network==="YAS"?"#fff9cc":theme.main+"12"}}>
            <img src={theme.logo} alt={network+" logo"} className="h-12 w-16 object-contain" onError={e => {e.currentTarget.style.visibility="hidden";}}/>
            <div><p className="font-black" style={{color:theme.dark}}>{theme.label}</p><p className="text-xs text-slate-500">{requiredNames} majina yanahitajika</p></div>
          </div>
          <label className="mb-2 block text-sm font-bold">Majina kamili
            <input value={names} onChange={e => setNames(e.target.value.slice(0, 64))} maxLength={64} autoComplete="organization" placeholder={network==="AIRTEL"||network==="YAS"?"Mfano: JINA LA BIASHARA":"Mfano: JINA LA BIASHARA"} className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-3 text-base focus:border-slate-500 focus:outline-none"/>
          </label>
          <p className="mb-4 text-xs leading-relaxed text-slate-500">{network==="YAS"?"QR itakuwa na majina yote 3; stika itaonyesha majina 2 ya kwanza.":network==="AIRTEL"?"QR na stika vitatumia majina 3.":"QR itakuwa na majina uliyoweka; stika itaonyesha majina 2 ya kwanza."}</p>
          <label className="mb-2 block text-sm font-bold">Namba ya Lipa Namba
            <input value={lipaNumber} onChange={e => setLipaNumber(digits(e.target.value))} inputMode="numeric" maxLength={14} placeholder="Weka namba ya Lipa" className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-3 text-base focus:border-slate-500 focus:outline-none"/>
          </label>
          <p className="mb-5 mt-2 text-xs text-slate-500">Angalau {requiredNames} majina na namba halali vinahitajika.</p>
          <button disabled={!valid || !qr || busy} onClick={downloadSticker} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-black text-white shadow-sm disabled:opacity-50" style={{background:theme.main}}><Download size={19}/>{busy ? "Inatengeneza..." : "PAKUA STIKA PNG"}</button>
          <button onClick={reset} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700"><RotateCcw size={16}/> Futa taarifa</button>
          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-black">Muonekano wa stika</h2><p className="text-xs text-slate-500">Muonekano wa mwisho utapakuliwa kama PNG.</p></div><span className="rounded-full px-3 py-1 text-xs font-black" style={{background:theme.main+"18",color:theme.dark}}>LIVE PREVIEW</span></div>
          <div className="overflow-hidden rounded-2xl border-2 bg-slate-50 p-3 sm:p-5" style={{borderColor:theme.main}}>
            <div className="overflow-hidden rounded-xl bg-white shadow-sm">
              <div className="flex items-center gap-3 px-4 py-4 text-white sm:px-6" style={{background:theme.main}}>
                <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl bg-white p-2"><img src={theme.logo} alt={network+" logo"} className="max-h-full max-w-full object-contain"/></div>
                <div className="min-w-0"><p className="text-xs font-black tracking-widest opacity-90">{network}</p><h3 className="text-xl font-black sm:text-3xl">LIPA KWA {theme.label}</h3><p className="text-xs font-semibold opacity-90">LIPA NAMBA</p></div>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center sm:p-6">
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-black tracking-widest text-slate-500">JINA LA MTEJA / BIASHARA</p>
                  <h4 className="break-words text-2xl font-black sm:text-3xl" style={{color:theme.dark}}>{stickerNames(network,names).toUpperCase()||"JINA LA BIASHARA"}</h4>
                  <div className="mt-5 rounded-xl p-4" style={{background:theme.main+"12",borderLeft:"6px solid "+theme.main}}><p className="text-xs font-bold text-slate-500">NAMBA YA LIPA</p><p className="mt-1 break-all text-2xl font-black sm:text-3xl" style={{color:theme.dark}}>{digits(lipaNumber)||"000000000"}</p></div>
                  <p className="mt-4 text-sm font-black" style={{color:theme.main}}>LIPA KWA URAHISI</p>
                </div>
                <div className="mx-auto w-fit rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">{qr?<img src={qr} alt="QR code ya taarifa za Lipa Namba" className="h-36 w-36"/>:<div className="flex h-36 w-36 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">QR CODE</div>}<p className="mt-2 text-xs font-black text-slate-600">SCAN QR CODE</p></div>
              </div>
              <div className="h-2" style={{background:theme.main}}/>
            </div>
          </div>
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">Muhimu: kwa sasa QR ina taarifa za jina, mtandao na namba tu; si QR rasmi ya malipo iliyothibitishwa. QR za mfano ulizotuma zinahitaji muundo rasmi wa mtandao na hesabu sahihi ya CRC kabla ya kuzalisha QR za malipo zinazobadilika.</p>
        </section>
      </div>
    </div>
  </main>;
}
