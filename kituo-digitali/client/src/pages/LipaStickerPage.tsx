import { useEffect, useMemo, useRef, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import QRCode from "qrcode";
import { triggerDownload } from "@/lib/downloadHistory";

const TEMPLATE = "/lipa-sticker-a5-template.png";
const WIDTH = 1749;
const HEIGHT = 2481;

type StickerForm = { name: string; number: string };

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

export default function LipaStickerPage() {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [form, setForm] = useState<StickerForm>({ name: "STEWARD JACKSON NJIWA", number: "141837451" });
  const [busy, setBusy] = useState(false);
  const [qrPreview, setQrPreview] = useState("");
  const cleanForm = useMemo(() => ({ name: cleanName(form.name), number: cleanNumber(form.number) }), [form]);
  const valid = cleanForm.name.split(" ").filter(Boolean).length >= 2 && /^\d{5,12}$/.test(cleanForm.number);

  useEffect(() => {
    let active = true;
    if (!cleanForm.number) {
      setQrPreview("");
      return () => { active = false; };
    }
    void QRCode.toDataURL(cleanForm.number, { errorCorrectionLevel: "H", margin: 0, width: 810, color: { dark: "#000000", light: "#ffffff" } }).then((url) => {
      if (active) setQrPreview(url);
    }).catch(() => setQrPreview(""));
    return () => { active = false; };
  }, [cleanForm.number]);

  async function renderSticker() {
    const image = imageRef.current;
    if (!valid || busy || !image?.complete || !image.naturalWidth) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas haipatikani kwenye browser hii.");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);

      // Keep the original Vodacom/TIPS artwork and redraw only the dynamic QR area.
      ctx.fillStyle = "#fff";
      ctx.fillRect(424, 555, 901, 900);
      const qrCanvas = document.createElement("canvas");
      await QRCode.toCanvas(qrCanvas, cleanForm.number, {
        errorCorrectionLevel: "H",
        margin: 0,
        width: 810,
        color: { dark: "#000000", light: "#ffffff" },
      });
      ctx.drawImage(qrCanvas, 470, 600, 810, 810);

      // Repaint the two editable lines while preserving the original rounded card.
      ctx.fillStyle = "#fff";
      ctx.fillRect(136, 1602, 1478, 390);
      ctx.fillStyle = "#df1b2f";
      ctx.fillRect(171, 1805, 1407, 4);
      drawCenteredText(ctx, cleanForm.number, WIDTH / 2, 1704, 72, 800);
      drawCenteredText(ctx, cleanForm.name, WIDTH / 2, 1912, cleanForm.name.length > 28 ? 43 : 50, 800);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
      if (!blob) throw new Error("Stika haikuweza kutengenezwa.");
      const filename = `stika-lipa-${cleanForm.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${cleanForm.number}.png`;
      triggerDownload(blob, filename, "PNG");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setForm({ name: "", number: "" });
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 rounded-2xl bg-[#d71935] p-5 text-white">
            <p className="text-xs font-black tracking-[0.18em]">VODACOM M-PESA</p>
            <h1 className="mt-2 text-2xl font-black">STIKA ZA LIPA</h1>
            <p className="mt-1 text-xs text-white/85">Muundo wa A5 unaolingana na stika ya asili.</p>
          </div>
          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-black">Jina la wakala</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: cleanName(event.target.value) }))} className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 font-semibold outline-none focus:border-[#d71935]" placeholder="Mfano: STEWARD JACKSON NJIWA" maxLength={42} />
          </label>
          <label className="mb-5 block">
            <span className="mb-2 block text-sm font-black">Namba ya Lipa</span>
            <input value={form.number} onChange={(event) => setForm((current) => ({ ...current, number: cleanNumber(event.target.value) }))} className="h-12 w-full rounded-xl border-2 border-slate-200 px-3 font-semibold outline-none focus:border-[#d71935]" placeholder="Mfano: 141837451" inputMode="numeric" maxLength={12} />
          </label>
          <button type="button" disabled={!valid || busy} onClick={() => void renderSticker()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#d71935] px-4 py-3.5 font-black text-white transition hover:bg-[#bd102a] disabled:cursor-not-allowed disabled:opacity-50"><Download size={18} /> {busy ? "INATENGENEZA..." : "PAKUA STIKA"}</button>
          <button type="button" onClick={reset} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700"><RotateCcw size={16} /> Futa taarifa</button>
          <p className="mt-4 text-xs leading-5 text-slate-500">QR code itawekwa kwa namba ya Lipa uliyoandika. Artwork ya TIPS, Vodacom M-Pesa, pattern na ujumbe wa stika vimehifadhiwa kama ilivyo kwenye stika ya asili.</p>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-black">Hakiki stika</h2><p className="text-xs text-slate-500">A5 • 1749 × 2481 px • PNG</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">PREVIEW</span></div>
          <div className="flex justify-center overflow-auto rounded-2xl bg-slate-100 p-3 sm:p-6"><div className="relative w-full max-w-[700px] shadow-xl"><img ref={imageRef} src={TEMPLATE} alt="Template ya stika ya Lipa" className="block h-auto w-full" /><div className="pointer-events-none absolute inset-0"><div className="absolute left-[24.2%] top-[22.4%] h-[36.3%] w-[51.5%] bg-white" />{qrPreview && <img src={qrPreview} alt="QR ya namba ya Lipa" className="absolute left-[26.9%] top-[24.2%] h-[32.6%] w-[46.3%]" />}<div className="absolute left-1/2 top-[68.7%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center text-[clamp(18px,4.1vw,29px)] font-extrabold text-black">{cleanForm.number}</div><div className="absolute left-1/2 top-[77.1%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center text-[clamp(14px,2.85vw,23px)] font-extrabold text-black">{cleanForm.name}</div></div></div></div>
        </section>
      </div>
    </main>
  );
}
