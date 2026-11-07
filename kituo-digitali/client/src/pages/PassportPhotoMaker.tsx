import { useRef, useState } from "react";
import { Download, ImagePlus, LoaderCircle, Sparkles } from "lucide-react";

declare global {
  interface Window { SelfieSegmentation?: any; }
}

let mediapipePromise: Promise<any> | null = null;

function loadSelfieSegmentation() {
  if (window.SelfieSegmentation) return Promise.resolve(window.SelfieSegmentation);
  if (!mediapipePromise) {
    mediapipePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js";
      script.async = true;
      script.onload = () => window.SelfieSegmentation ? resolve(window.SelfieSegmentation) : reject(new Error("AI ya kuondoa background haikupakia."));
      script.onerror = () => reject(new Error("Imeshindikana kupakua mfumo wa AI. Angalia intaneti ujaribu tena."));
      document.head.appendChild(script);
    }).catch((error) => {
      mediapipePromise = null;
      throw error;
    });
  }
  return mediapipePromise;
}

const PHOTO_W = 413;
const PHOTO_H = 531;

export default function PassportPhotoMaker() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [background, setBackground] = useState("#ffffff");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const processPhoto = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Chagua picha ya JPG, PNG au WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Picha isizidi MB 8.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("Inaandaa mfumo wa AI...");
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    const originalUrl = URL.createObjectURL(file);
    setSourceUrl(originalUrl);
    setResultUrl("");

    try {
      const Segmentation = await loadSelfieSegmentation();
      const image = new Image();
      image.src = originalUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Picha haijasomeka. Chagua picha nyingine."));
      });

      const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const inputCanvas = document.createElement("canvas");
      inputCanvas.width = width;
      inputCanvas.height = height;
      const inputContext = inputCanvas.getContext("2d", { willReadFrequently: true });
      if (!inputContext) throw new Error("Imeshindikana kusoma picha.");
      inputContext.drawImage(image, 0, 0, width, height);

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = width;
      maskCanvas.height = height;
      const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
      if (!maskContext) throw new Error("Imeshindikana kuandaa picha.");

      setStatus("AI inaondoa background ya picha...");
      const segmenter = new Segmentation({ locateFile: (fileName: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${fileName}` });
      segmenter.setOptions({ modelSelection: 1 });
      const maskPromise = new Promise<void>((resolve, reject) => {
        segmenter.onResults((results: any) => {
          try {
            maskContext.clearRect(0, 0, width, height);
            maskContext.drawImage(results.segmentationMask, 0, 0, width, height);
            resolve();
          } catch (e) { reject(e); }
        });
      });
      await segmenter.send({ image: inputCanvas });
      await maskPromise;
      if (typeof segmenter.close === "function") segmenter.close();

      const originalPixels = inputContext.getImageData(0, 0, width, height);
      const maskPixels = maskContext.getImageData(0, 0, width, height);
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          const alpha = maskPixels.data[i];
          originalPixels.data[i + 3] = alpha;
          if (alpha > 48) {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          }
        }
      }
      if (maxX < minX || maxY < minY) throw new Error("AI haikuona mtu kwenye picha. Tumia picha inayoonyesha uso na mabega vizuri.");
      inputContext.putImageData(originalPixels, 0, 0);

      const subjectW = maxX - minX + 1;
      const subjectH = maxY - minY + 1;
      const padX = subjectW * 0.12;
      const padTop = subjectH * 0.08;
      const padBottom = subjectH * 0.05;
      let cropW = subjectW + padX * 2;
      let cropH = subjectH + padTop + padBottom;
      const aspect = PHOTO_W / PHOTO_H;
      if (cropW / cropH > aspect) cropH = cropW / aspect;
      else cropW = cropH * aspect;
      let sx = (minX + maxX + 1) / 2 - cropW / 2;
      let sy = minY - padTop;
      sx = Math.max(0, Math.min(width - cropW, sx));
      sy = Math.max(0, Math.min(height - cropH, sy));
      cropW = Math.min(cropW, width - sx);
      cropH = Math.min(cropH, height - sy);

      const output = document.createElement("canvas");
      output.width = PHOTO_W;
      output.height = PHOTO_H;
      const outputContext = output.getContext("2d");
      if (!outputContext) throw new Error("Imeshindikana kuandaa picha ya mwisho.");
      outputContext.fillStyle = background === "transparent" ? "rgba(0,0,0,0)" : background;
      outputContext.fillRect(0, 0, PHOTO_W, PHOTO_H);
      outputContext.drawImage(inputCanvas, sx, sy, cropW, cropH, 0, 0, PHOTO_W, PHOTO_H);
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob((value) => value ? resolve(value) : reject(new Error("Imeshindikana kuhifadhi PNG.")), "image/png"));
      setResultUrl(URL.createObjectURL(blob));
      setStatus("Background imeondolewa. Picha ya pasipoti size iko tayari.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Imeshindikana kuondoa background.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!resultUrl) return;
    const link = document.createElement("a");
    link.href = resultUrl;
    link.download = "picha-pasipoti-size-413x531.png";
    link.click();
  };

  return <section style={{ background: "#fff", border: "1px solid #dbe4ee", borderRadius: 16, padding: 16, marginTop: 18 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
      <ImagePlus size={20} color="#0f766e" />
      <h2 style={{ margin: 0, fontSize: 18, color: "#102a43" }}>Tengeneza Picha ya Pasipoti Size</h2>
    </div>
    <p style={{ color: "#526174", fontSize: 13, marginTop: 0 }}>Pakia picha ya uso na mabega. AI itaondoa background kwenye kifaa chako na kuandaa picha ya 35 × 45 mm (413 × 531 px, 300 DPI).</p>
    <label style={{ display: "grid", gap: 7, fontSize: 13, fontWeight: 700 }}>
      Chagua picha (JPG, PNG au WebP; hadi MB 8)
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => void processPhoto(e.target.files?.[0])} />
    </label>
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700 }}>Rangi ya background
        <select value={background} disabled={busy} onChange={(e) => setBackground(e.target.value)} style={{ padding: 8, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" }}>
          <option value="#ffffff">Nyeupe</option><option value="#dbeafe">Bluu hafifu</option><option value="#2563eb">Bluu</option><option value="#dcfce7">Kijani hafifu</option><option value="transparent">Transparent</option>
        </select>
      </label>
      <button type="button" disabled={busy || !sourceUrl} onClick={() => void processPhoto(inputRef.current?.files?.[0])} style={{ border: 0, borderRadius: 9, padding: "10px 14px", color: "#fff", background: "#0f766e", fontWeight: 800, display: "inline-flex", gap: 7, alignItems: "center" }}>
        {busy ? <LoaderCircle size={16} /> : <Sparkles size={16} />} {busy ? "Inasafisha..." : "Ondoa background tena"}
      </button>
    </div>
    {status && <p role="status" style={{ color: "#0f766e", fontSize: 13 }}>{status}</p>}
    {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginTop: 14 }}>
      {sourceUrl && <div><strong style={{ display: "block", fontSize: 12, marginBottom: 6 }}>Picha ya awali</strong><img src={sourceUrl} alt="Picha ya awali" style={{ width: 120, height: 154, objectFit: "contain", background: "#f1f5f9", borderRadius: 8 }} /></div>}
      {resultUrl && <div><strong style={{ display: "block", fontSize: 12, marginBottom: 6 }}>Pasipoti size (35 × 45 mm)</strong><img src={resultUrl} alt="Picha ya pasipoti size iliyosafishwa" style={{ width: 124, height: 160, objectFit: "contain", background: "repeating-conic-gradient(#eee 0% 25%, white 0% 50%) 50% / 16px 16px", border: "1px solid #cbd5e1", borderRadius: 8 }} /><button type="button" onClick={download} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, border: 0, borderRadius: 8, padding: "9px 12px", background: "#166534", color: "#fff", fontWeight: 800 }}><Download size={15} /> Pakua PNG</button></div>}
    </div>
    <small style={{ display: "block", color: "#64748b", marginTop: 12 }}>Faragha: picha inachakatwa kwenye browser yako. Modeli ya AI pekee ndiyo inapakuliwa kutoka CDN; picha yako haitumwi kwenye server.</small>
  </section>;
}
