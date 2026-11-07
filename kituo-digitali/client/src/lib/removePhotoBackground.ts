let mediapipePromise: Promise<any> | null = null;

// Pin the known browser build so a CDN "latest" change cannot silently break segmentation.
const MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747";

function loadSelfieSegmentation() {
  if (typeof window === "undefined") return Promise.reject(new Error("Uondoaji wa background unahitaji browser."));
  const scope = window as any;
  if (scope.SelfieSegmentation) return Promise.resolve(scope.SelfieSegmentation);
  if (!mediapipePromise) {
    mediapipePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${MEDIAPIPE_CDN}/selfie_segmentation.js`;
      script.async = true;
      const timeout = window.setTimeout(() => reject(new Error("AI imechelewa kupakia. Hakikisha intaneti ipo kisha jaribu tena.")), 20000);
      script.onload = () => {
        window.clearTimeout(timeout);
        scope.SelfieSegmentation
          ? resolve(scope.SelfieSegmentation)
          : reject(new Error("Mfumo wa AI haujapatikana baada ya kupakia. Jaribu kufungua ukurasa upya."));
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Imeshindikana kupakua AI. Angalia intaneti au zima Data Saver/VPN kisha jaribu tena."));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      mediapipePromise = null;
      throw error;
    });
  }
  return mediapipePromise;
}

/** AI segmentation runs in the browser; the uploaded photo is never sent to an application server. */
export async function removePhotoBackground(source: Blob | string): Promise<Blob> {
  const Segmentation = await loadSelfieSegmentation();
  const image = new Image();
  const temporaryUrl = source instanceof Blob ? URL.createObjectURL(source) : source;
  try {
    image.src = temporaryUrl;
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

    const segmenter = new Segmentation({ locateFile: (fileName: string) => `${MEDIAPIPE_CDN}/${fileName}` });
    segmenter.setOptions({ modelSelection: 1 });
    try {
      let gotMask = false;
      const maskPromise = new Promise<void>((resolve, reject) => {
        segmenter.onResults((results: any) => {
          try {
            if (!results?.segmentationMask) throw new Error("AI haikurudisha mask ya picha.");
            maskContext.clearRect(0, 0, width, height);
            maskContext.drawImage(results.segmentationMask, 0, 0, width, height);
            gotMask = true;
            resolve();
          } catch (error) { reject(error); }
        });
      });
      await Promise.race([
        (async () => { await segmenter.send({ image: inputCanvas }); await maskPromise; })(),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("AI haijamaliza kuchakata picha. Tumia intaneti yenye kasi au picha ndogo zaidi.")), 30000)),
      ]);
      if (!gotMask) throw new Error("AI haikuweza kuchambua picha. Jaribu picha nyingine.");
    } finally {
      if (typeof segmenter.close === "function") segmenter.close();
    }

    const pixels = inputContext.getImageData(0, 0, width, height);
    const mask = maskContext.getImageData(0, 0, width, height);
    let foregroundPixels = 0;
    for (let i = 0; i < pixels.data.length; i += 4) {
      const alpha = mask.data[i];
      pixels.data[i + 3] = alpha;
      if (alpha > 48) foregroundPixels += 1;
    }
    if (foregroundPixels < 100) throw new Error("AI haikuona mtu. Tumia picha inayoonyesha uso na mabega vizuri.");
    inputContext.putImageData(pixels, 0, 0);
    return await new Promise<Blob>((resolve, reject) => inputCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Imeshindikana kutengeneza picha yenye background iliyoondolewa.")), "image/png"));
  } finally {
    if (source instanceof Blob) URL.revokeObjectURL(temporaryUrl);
  }
}
