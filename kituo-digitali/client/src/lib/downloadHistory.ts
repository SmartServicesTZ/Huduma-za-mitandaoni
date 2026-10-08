export type DownloadHistoryItem = {
  id: string;
  name: string;
  type: string;
  dataUrl?: string;
  downloadedAt: number;
  expiresAt: number;
};

const STORAGE_KEY = "smartservicestz_download_history_v1";
const TTL = 24 * 60 * 60 * 1000;

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
    { id: crypto.randomUUID(), name: item.name, type: item.type, dataUrl: item.dataUrl, downloadedAt: now, expiresAt: now + TTL },
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
