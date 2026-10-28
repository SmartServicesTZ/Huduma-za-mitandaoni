export type DownloadHistoryItem = {
  id: string;
  name: string;
  type: string;
  dataUrl?: string;
  downloadedAt: number;
  expiresAt: number;
};

declare global {
  interface Window {
    AndroidDownload?: {
      beginFile: (name: string, mimeType: string) => boolean;
      appendFileChunk: (base64Chunk: string) => boolean;
      finishFile: () => boolean;
      cancelFile?: () => void;
    };
  }
}

const STORAGE_KEY = "smartservicestz_download_history_v1";
const TTL = 30 * 60 * 1000;

function bytesToBinary(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]);
  return binary;
}

const read = (): DownloadHistoryItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const now = Date.now();
    const items = (JSON.parse(raw) as DownloadHistoryItem[]).filter((item) => item.expiresAt > now);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return items;
  } catch {
    return [];
  }
};

const write = (items: DownloadHistoryItem[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* storage inaweza kuwa imejaa/imefungwa */ }
};

export const getDownloadHistory = () => read();

export const recordDownload = (item: { name: string; type: string; dataUrl?: string }) => {
  const now = Date.now();
  const next: DownloadHistoryItem[] = [
    { id: crypto.randomUUID(), name: item.name, type: item.type, dataUrl: item.dataUrl && item.dataUrl.length <= 1_000_000 ? item.dataUrl : undefined, downloadedAt: now, expiresAt: now + TTL },
    ...read(),
  ].slice(0, 30);
  write(next);
  window.dispatchEvent(new CustomEvent("smartservicestz-download-added"));
};

export const removeDownload = (id: string) => {
  write(read().filter((item) => item.id !== id));
  window.dispatchEvent(new CustomEvent("smartservicestz-download-changed"));
};

export const clearDownloadHistory = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  window.dispatchEvent(new CustomEvent("smartservicestz-download-changed"));
};

export const downloadFromHistory = (item: DownloadHistoryItem) => {
  if (!item.dataUrl) return false;
  const nativeDownload = typeof window !== "undefined" ? window.AndroidDownload : undefined;
  if (nativeDownload) {
    try {
      const [meta, encoded] = item.dataUrl.split(",");
      const binary = atob(encoded ?? "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      if (!nativeDownload.beginFile(item.name, meta.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream")) throw new Error("Android Downloads haikupatikana.");
      for (let offset = 0; offset < bytes.length; offset += 96 * 1024) {
        let chunkBinary = "";
        const chunk = bytes.subarray(offset, Math.min(offset + 96 * 1024, bytes.length));
        for (let index = 0; index < chunk.length; index += 0x8000) chunkBinary += bytesToBinary(chunk.subarray(index, index + 0x8000));
        nativeDownload.appendFileChunk(btoa(chunkBinary));
      }
      nativeDownload.finishFile();
      return true;
    } catch {
      nativeDownload.cancelFile?.();
    }
  }
  const installedApp = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (installedApp && typeof navigator.share === "function") {
    try {
      const [meta, encoded] = item.dataUrl.split(",");
      const mime = meta.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
      const binary = atob(encoded ?? "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], item.name, { type: mime });
      if (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] })) {
        void navigator.share({ files: [file], title: item.name }).catch(() => {
          const a = document.createElement("a");
          a.href = item.dataUrl!;
          a.download = item.name;
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          a.remove();
        });
        return true;
      }
    } catch { /* tumia njia ya kawaida ikiwa share haipatikani */ }
  }
  const a = document.createElement("a");
  a.href = item.dataUrl;
  a.download = item.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
};


/** Anzisha download kwa njia inayofanya kazi kwenye browser ya kawaida na app ya simu, kisha weka rekodi ya hati kwa dakika 30. */
export const triggerDownload = (blob: Blob, name: string, type: string) => {
  recordDownload({ name, type });
  const nativeDownload = typeof window !== "undefined" ? window.AndroidDownload : undefined;
  if (nativeDownload) {
    window.dispatchEvent(new CustomEvent("smartservicestz-download-start", { detail: { name, progress: 0 } }));
    void blob.arrayBuffer().then(async (buffer) => {
      const bytes = new Uint8Array(buffer);
      if (!nativeDownload.beginFile(name, blob.type || "application/octet-stream")) throw new Error("Android imeshindwa kuanzisha faili kwenye Downloads.");
      const chunkSize = 24 * 1024;
      const totalChunks = Math.max(1, Math.ceil(bytes.length / chunkSize));
      for (let offset = 0, chunkIndex = 0; offset < bytes.length; offset += chunkSize, chunkIndex++) {
        let binary = "";
        const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
        for (let index = 0; index < chunk.length; index += 0x4000) binary += bytesToBinary(chunk.subarray(index, index + 0x4000));
        if (!nativeDownload.appendFileChunk(btoa(binary))) throw new Error("Android imeshindwa kuandika sehemu ya faili.");
        const progress = Math.min(95, Math.round(((chunkIndex + 1) / totalChunks) * 95));
        window.dispatchEvent(new CustomEvent("smartservicestz-download-progress", { detail: { name, progress } }));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      if (!nativeDownload.finishFile()) throw new Error("Android imeshindwa kuhifadhi faili. Jaribu tena.");
      window.dispatchEvent(new CustomEvent("smartservicestz-download-complete", { detail: { name } }));
    }).catch(async (_error: unknown) => {
      // Native Android bridge ikishindwa kuandika chunk, jaribu njia mbadala ya kuhifadhi.
      try { nativeDownload.cancelFile?.(); } catch { /* faili la muda linaweza kuwa tayari limefungwa */ }
      try {
        if (typeof navigator.share === "function") {
          const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
          if (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: name });
            window.dispatchEvent(new CustomEvent("smartservicestz-download-complete", { detail: { name } }));
            return;
          }
        }
      } catch { /* Share sheet haikupatikana; tumia browser download. */ }
      startBrowserDownload(blob, name);
      window.dispatchEvent(new CustomEvent("smartservicestz-download-fallback", { detail: { name } }));
    });
    return;
  }
  window.dispatchEvent(new CustomEvent("smartservicestz-download-start", { detail: { name, progress: 10 } }));
  const installedApp = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

  // Katika app iliyosakinishwa, share sheet ya Android huruhusu mtumiaji kuhifadhi hati kwenye Files/Downloads.
  if (installedApp && typeof navigator.share === "function") {
    try {
      const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
      if (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] })) {
        // Subiri share sheet irudiwe/imalizike; usionyeshe "imepakuliwa" kabla ya Android kurudisha matokeo.
        void navigator.share({ files: [file], title: name })
          .then(() => window.dispatchEvent(new CustomEvent("smartservicestz-download-complete", { detail: { name } })))
          .catch(() => {
            startBrowserDownload(blob, name);
            window.dispatchEvent(new CustomEvent("smartservicestz-download-fallback", { detail: { name } }));
          });
      } else {
        startBrowserDownload(blob, name);
        window.dispatchEvent(new CustomEvent("smartservicestz-download-fallback", { detail: { name } }));
      }
    } catch {
      startBrowserDownload(blob, name);
      window.dispatchEvent(new CustomEvent("smartservicestz-download-fallback", { detail: { name } }));
    }
  } else {
    startBrowserDownload(blob, name);
    window.dispatchEvent(new CustomEvent("smartservicestz-download-fallback", { detail: { name } }));
  }

  // Hifadhi hati ndogo ili iweze kupakuliwa tena kutoka Historia kwa dakika 30.
  if (blob.size > 0 && blob.size <= 600 * 1024) {
    void blob.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += bytesToBinary(bytes.subarray(i, i + 0x8000));
      const dataUrl = `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
      const items = read();
      const match = items.find((item) => item.name === name && item.type === type);
      if (match && dataUrl.length <= 1_000_000) {
        match.dataUrl = dataUrl;
        write(items);
        window.dispatchEvent(new CustomEvent("smartservicestz-download-changed"));
      }
    }).catch(() => undefined);
  }
};

const startBrowserDownload = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
