import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer, RotateCcw } from "lucide-react";
import QRCode from "qrcode";
import { triggerDownload } from "@/lib/downloadHistory";

const A5_TEMPLATE = "/lipa-sticker-a5-template.png";
const A5_WIDTH = 1749;
const A5_HEIGHT = 2481;
const A4_WIDTH = 2480;
const A4_HEIGHT = 1754;

type StickerSize = "a4" | "a5";
type StickerForm = { name: string; number: string };
type A4Preview = { url: string; qr: string };

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 42);
}

function cleanNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 12);
}

function drawCenteredText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, weight = 800) {
  ctx.save();
  ctx.fillStyle = "#050505";
  ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
  ctx.restore();
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Picha haikupatikana: ${src}`));
    image.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawWrapped(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = value.split(" ");
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

async function renderAirtelA4(form: { name: string; number: string }) {
  const canvas = document.createElement("canvas");
  canvas.width = A4_WIDTH;
  canvas.height = A4_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas haipatikani kwenye browser hii.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const red = "#ed202d";
  const darkRed = "#d7192a";
  const yellow = "#ffd52d";
  const white = "#fff";
  const leftWidth = 1250;
  const rightX = leftWidth;
  const rightWidth = A4_WIDTH - leftWidth;

  ctx.fillStyle = red;
  ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#8f0d1a";
  for (let x = 90; x < A4_WIDTH; x += 95) for (let y = 80; y < A4_HEIGHT; y += 120) {
    ctx.beginPath();
    ctx.ellipse(x, y, 16, 42, -0.65, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = white;
  ctx.fillRect(0, 0, leftWidth, 240);
  ctx.fillStyle = "#487987";
  ctx.font = "900 70px Arial, sans-serif";
  ctx.fillText("TIPS", 90, 132);
  ctx.font = "600 20px Arial, sans-serif";
  ctx.fillText("TANZANIA INSTANT PAYMENTS SYSTEM", 94, 166);
  let airtelLogoLoaded = false;
  try {
    const airtel = await loadImage(`${import.meta.env.BASE_URL}airtel-logo.png`);
    ctx.drawImage(airtel, 820, 45, 260, 145);
    airtelLogoLoaded = true;
  } catch { /* logo is optional; the editable text remains visible */ }
  if (!airtelLogoLoaded) {
    ctx.fillStyle = "#d7192a";
    ctx.font = "900 66px Arial, sans-serif";
    ctx.fillText("airtel", 960, 115);
    ctx.font = "600 42px Arial, sans-serif";
    ctx.fillText("money", 970, 170);
  }

  ctx.fillStyle = white;
  ctx.font = "900 41px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LIPA KUPITIA MTANDAO AU BENKI YOYOTE", leftWidth / 2, 335);
  ctx.textAlign = "left";

  ctx.save();
  ctx.fillStyle = white;
  roundRect(ctx, 270, 405, 720, 690, 58);
  ctx.fill();
  ctx.strokeStyle = "#e9a33d";
  ctx.lineWidth = 10;
  roundRect(ctx, 270, 405, 720, 690, 58);
  ctx.stroke();
  ctx.restore();
  const qr = await QRCode.toDataURL(form.number, { errorCorrectionLevel: "H", margin: 0, width: 620, color: { dark: "#000", light: "#fff" } });
  const qrImage = await loadImage(qr);
  ctx.drawImage(qrImage, 320, 455, 620, 620);

  ctx.fillStyle = white;
  ctx.font = "900 36px Arial, sans-serif";
  ctx.fillText("LIPA NAMBA", 120, 1205);
  roundRect(ctx, 120, 1250, 1060, 112, 12); ctx.fillStyle = white; ctx.fill();
  ctx.fillStyle = "#111"; ctx.font = "700 62px Arial, sans-serif"; ctx.fillText(form.number, 145, 1325);
  ctx.fillStyle = white; ctx.font = "900 36px Arial, sans-serif"; ctx.fillText("JINA", 120, 1435);
  roundRect(ctx, 120, 1480, 1060, 112, 12); ctx.fillStyle = white; ctx.fill();
  ctx.fillStyle = "#111"; ctx.font = `700 ${form.name.length > 26 ? 42 : 56}px Arial, sans-serif`; ctx.fillText(form.name, 145, 1555);

  ctx.fillStyle = white;
  ctx.fillRect(0, 1635, leftWidth, 119);
  ctx.fillStyle = darkRed;
  ctx.font = "900 25px Arial, sans-serif";
  ctx.fillText("Tunapokea:", 45, 1680);
  ctx.fillStyle = "#111";
  ctx.font = "800 24px Arial, sans-serif";
  ctx.fillText("tigo pesa   m-pesa   halo pesa   T-PESA   CRDB   NMB", 45, 1728);
  ctx.fillStyle = darkRed;
  ctx.font = "900 40px Arial, sans-serif";
  ctx.fillText("LIPA KWA SIMU", 760, 1718);

  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fillRect(rightX, 0, 4, A4_HEIGHT);
  const cards = [
    ["LIPA KWA SIMU", "Piga *150*60#", ["Chagua 5 Lipa Bili", "Chagua 1 Lipa kwa Simu", "Chagua 1 Airtel", "Weka Lipa Namba", "Weka Kiasi", "Weka PIN"]],
    ["TIGO PESA", "Piga *150*01#", ["Chagua 5 Lipa kwa Simu", "Chagua 2 TANQR", "Weka Lipa namba", "Weka Kiasi", "Hakiki jina la Lipa kisha weka PIN"]],
    ["M-PESA", "Piga *150*00#", ["Chagua 5 Lipa kwa Simu", "Chagua 1 Lipa kwa Simu", "Chagua 1 Weka Lipa namba", "Chagua 3 Airtel Money", "Weka Lipa namba", "Weka Kiasi", "Weka Number ya Siri"]],
    ["NMB MKONONI", "Piga *150*66#", ["Chagua 4 Lipa Mkononi", "Chagua 1 Lipa kwa TIPS", "Weka Lipa Namba", "Weka Kiasi", "Weka PIN"]],
    ["SIMBANKING", "Piga *150*03#", ["Chagua 6 Lipa Hapa", "Chagua 3 TANQR", "Weka Lipa Namba", "Weka Kiasi", "Weka PIN"]],
    ["WENGINE", "Piga *150*XX#", ["Chagua Lipa Kwa Simu/TanQR", "Weka Lipa Namba", "Weka Kiasi", "Weka PIN"]],
  ] as const;
  const colWidth = 480;
  const cardWidth = 410;
  const cardHeight = 480;
  cards.forEach(([provider, command, steps], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = rightX + 55 + col * colWidth;
    const y = 55 + row * 555;
    ctx.fillStyle = white;
    roundRect(ctx, x, y, 290, 66, 35); ctx.fill();
    ctx.fillStyle = darkRed; ctx.font = "900 22px Arial, sans-serif"; ctx.fillText(provider, x + 38, y + 43);
    ctx.fillStyle = white; ctx.font = "900 31px Arial, sans-serif"; ctx.fillText(command, x, y + 125);
    ctx.strokeStyle = index === 3 || index === 4 || index === 5 ? "#b9c5ff" : yellow;
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x + 38, y + 185); ctx.lineTo(x + 38, y + 405); ctx.lineTo(x + 370, y + 405); ctx.stroke();
    ctx.fillStyle = white; ctx.font = "700 19px Arial, sans-serif";
    steps.forEach((step, stepIndex) => { ctx.fillText(`› ${step}`, x + 65, y + 188 + stepIndex * 35); });
  });
  return { url: canvas.toDataURL("image/png"), qr };
}

export default function LipaStickerPage() {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const printRef = useRef<HTMLImageElement | null>(null);
  const [size, setSize] = useState<StickerSize>("a4");
  const [form, setForm] = useState<StickerForm>({ name: "STEWARD JACKSON NJIWA", number: "141837451" });
  const [busy, setBusy] = useState(false);
  const [qrPreview, setQrPreview] = useState("");
  const [a4Preview, setA4Preview] = useState<A4Preview | null>(null);
  const cleanForm = useMemo(() => ({ name: cleanName(form.name), number: cleanNumber(form.number) }), [form]);
  const valid = cleanForm.name.split(" ").filter(Boolean).length >= 2 && /^\d{5,12}$/.test(cleanForm.number);

  useEffect(() => {
    let active = true;
    if (!cleanForm.number) { setQrPreview(""); setA4Preview(null); return () => { active = false; }; }
    void QRCode.toDataURL(cleanForm.number, { errorCorrectionLevel: "H", margin: 0, width: 810, color: { dark: "#000000", light: "#ffffff" } }).then((url) => { if (active) setQrPreview(url); }).catch(() => setQrPreview(""));
    if (valid) void renderAirtelA4(cleanForm).then((preview) => { if (active) setA4Preview(preview); }).catch(() => setA4Preview(null));
    return () => { active = false; };
  }, [cleanForm, valid]);

  async function renderA5Sticker() {
    const image = imageRef.current;
    if (!valid || busy || !image?.complete || !image.naturalWidth) return;
    const canvas = document.createElement("canvas"); canvas.width = A5_WIDTH; canvas.height = A5_HEIGHT;
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas haipatikani kwenye browser hii.");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(image, 0, 0, A5_WIDTH, A5_HEIGHT);
    ctx.fillStyle = "#fff"; ctx.fillRect(424, 555, 901, 900);
    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, cleanForm.number, { errorCorrectionLevel: "H", margin: 0, width: 810, color: { dark: "#000000", light: "#ffffff" } });
    ctx.drawImage(qrCanvas, 470, 600, 810, 810);
    ctx.fillStyle = "#fff"; ctx.fillRect(136, 1602, 1478, 390); ctx.fillStyle = "#df1b2f"; ctx.fillRect(171, 1805, 1407, 4);
    drawCenteredText(ctx, cleanForm.number, A5_WIDTH / 2, 1704, 72, 800); drawCenteredText(ctx, cleanForm.name, A5_WIDTH / 2, 1912, cleanForm.name.length > 28 ? 43 : 50, 800);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
    if (!blob) throw new Error("Stika haikuweza kutengenezwa.");
    triggerDownload(blob, `stika-lipa-a5-${cleanForm.number}.png`, "PNG");
  }

  async function downloadSticker() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (size === "a4") {
        const preview = await renderAirtelA4(cleanForm);
        const response = await fetch(preview.url); const blob = await response.blob();
        triggerDownload(blob, `stika-airtel-a4-${cleanForm.number}.png`, "PNG");
      } else await renderA5Sticker();
    } finally { setBusy(false); }
  }

  function printSticker() {
    if (!valid) return;
    window.print();
  }

  function reset() { setForm({ name: "", number: "" }); }

  return (
    <main className="lipa-sticker-page min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <section className="no-print rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 rounded-2xl bg-[#d71935] p-5 text-white"><p className="text-xs font-black tracking-[0.18em]">AIRTEL MONEY • TIPS</p><h1 className="mt-2 text-2xl font-black">STIKA ZA LIPA</h1><p className="mt-1 text-xs text-white/85">Chagua ukubwa wa stika na jaza taarifa zako.</p></div>
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1"><button type="button" onClick={() => setSize("a4")} className={`rounded-xl px-3 py-3 text-sm font-black ${size === "a4" ? "bg-[#d71935] text-white shadow" : "text-slate-600"}`}>A4 Airtel</button><button type="button" onClick={() => setSize("a5")} className={`rounded-xl px-3 py-3 text-sm font-black ${size === "a5" ? "bg-[#d71935] text-white shadow" : "text-slate-600"}`}>A5 iliyopo</button></div>
          <label className="mb-4 block"><span className="mb-2 block text-sm font-black">Jina la wakala</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: cleanName(event.target.value) }))} className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 font-semibold outline-none focus:border-[#d71935]" placeholder="Mfano: STEWARD JACKSON NJIWA" maxLength={42} /></label>
          <label className="mb-5 block"><span className="mb-2 block text-sm font-black">Namba ya Lipa</span><input value={form.number} onChange={(event) => setForm((current) => ({ ...current, number: cleanNumber(event.target.value) }))} className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 font-semibold outline-none focus:border-[#d71935]" placeholder="Mfano: 141837451" inputMode="numeric" maxLength={12} /></label>
          <div className="grid grid-cols-2 gap-2"><button type="button" disabled={!valid || busy} onClick={() => void downloadSticker()} className="flex items-center justify-center gap-2 rounded-xl bg-[#d71935] px-3 py-3.5 text-sm font-black text-white transition hover:bg-[#bd102a] disabled:cursor-not-allowed disabled:opacity-50"><Download size={17} /> {busy ? "INATENGENEZA" : "PAKUA"}</button><button type="button" disabled={!valid} onClick={printSticker} className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-3 py-3.5 text-sm font-black text-white disabled:opacity-50"><Printer size={17} /> PRINT</button></div>
          <button type="button" onClick={reset} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700"><RotateCcw size={16} /> Futa taarifa</button>
          <p className="mt-4 text-xs leading-5 text-slate-500">QR code/TIPS inatumia namba ya Lipa uliyoandika. A4 ni layout mpya ya Airtel; A5 inaendelea kutumia template yake ya sasa.</p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="no-print mb-4 flex items-center justify-between"><div><h2 className="font-black">Hakiki stika</h2><p className="text-xs text-slate-500">{size === "a4" ? "A4 Airtel • 210 × 297 mm • landscape • PNG" : "A5 • 1749 × 2481 px • PNG"}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">PREVIEW</span></div>
          <div className={`sticker-preview-${size} flex justify-center overflow-auto rounded-2xl bg-slate-100 p-3 sm:p-6`}>
            {size === "a4" ? <img ref={printRef} src={a4Preview?.url} alt="A4 Airtel Lipa sticker preview" className="sticker-a4-preview block h-auto w-full shadow-xl" /> : <div className="relative w-full max-w-[700px] shadow-xl"><img ref={imageRef} src={A5_TEMPLATE} alt="Template ya stika ya Lipa A5" className="block h-auto w-full" /><div className="pointer-events-none absolute inset-0"><div className="absolute left-[24.2%] top-[22.4%] h-[36.3%] w-[51.5%] bg-white" />{qrPreview && <img src={qrPreview} alt="QR ya namba ya Lipa" className="absolute left-[26.9%] top-[24.2%] h-[32.6%] w-[46.3%]" />}<div className="absolute left-1/2 top-[68.7%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center text-[clamp(18px,4.1vw,29px)] font-extrabold text-black">{cleanForm.number}</div><div className="absolute left-1/2 top-[77.1%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center text-[clamp(14px,2.85vw,23px)] font-extrabold text-black">{cleanForm.name}</div></div></div>}
          </div>
        </section>
      </div>
    </main>
  );
}
