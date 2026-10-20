export type DownloadHistoryItem = {
  id: string;
  name: string;
  type: string;
  dataUrl?: string;
  downloadedAt: number;
  expiresAt: number;
};

const STORAGE_KEY = "smartservicestz_download_history_v1";
const TTL = 30 * 60 * 1000;

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
  const a = document.createElement("a");
  a.href = item.dataUrl;
  a.download = item.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
};


/** Anzisha download kwa njia inayofanya kazi kwenye browser ya kawaida na app ya simu, kisha weka rekodi ya hati kwa dakika 30. */
export const triggerDownload = (blob: Blob, name: string, type: string) => {
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
  recordDownload({ name, type });
  // Hifadhi faili ndogo kwa ajili ya kupakua tena kutoka Historia.
  if (blob.size > 0 && blob.size <= 600 * 1024) {
    void blob.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
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
