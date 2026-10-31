export const NIDA_DEMO_CARD_WIDTH = 1600;
export const NIDA_DEMO_CARD_HEIGHT = 1045;
export const NIDA_DEMO_CARD_RATIO = NIDA_DEMO_CARD_WIDTH / NIDA_DEMO_CARD_HEIGHT;
export const NIDA_DEMO_WATERMARK = "DEMO — NOT AN OFFICIAL ID";

export function getNidaDemoAssetPaths(baseUrl: string) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return {
    ngao: `${base}images/ngao.png`,
    bendera: `${base}images/bendera.png`,
  };
}

export function formatDemoIdNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 20) return value.trim() || "—";
  return `${digits.slice(0, 8)}-${digits.slice(8, 13)}-${digits.slice(13, 18)}-${digits.slice(18)}`;
}

export function formatDemoBirthDate(value: string) {
  if (!value) return "—";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${match[3]} ${months[Number(match[2]) - 1] ?? ""} ${match[1]}`;
}
