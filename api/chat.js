const defaultWorkerUrl = "https://huduma-za-mtandao-api.stewardjackson999.workers.dev";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Njia hairuhusiwi" });
  const { message, history } = req.body ?? {};
  if (typeof message !== "string" || !message.trim()) return res.status(400).json({ error: "Tafadhali weka ujumbe" });
  if (message.length > 4000) return res.status(400).json({ error: "Ujumbe usizidi herufi 4,000." });

  const baseUrl = String(process.env.SMARTSERVICESTZ_WORKER_URL ?? process.env.VITE_CLOUDFLARE_WORKER_URL ?? defaultWorkerUrl).trim().replace(/\/+$/, "");
  try {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim(), history: Array.isArray(history) ? history.slice(-6) : [] }),
      signal: AbortSignal.timeout(12_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message ?? "Huduma ya AI haipatikani kwa sasa." });
    return res.status(200).json({ reply: data.reply, sources: Array.isArray(data.sources) ? data.sources : [] });
  } catch {
    return res.status(503).json({ error: "Huduma ya AI haipatikani kwa sasa. Jaribu tena baadaye." });
  }
}
