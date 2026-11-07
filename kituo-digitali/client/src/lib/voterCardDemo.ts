export const VOTER_DEMO_WIDTH = 1600;
export const VOTER_DEMO_HEIGHT = 1000;
export const VOTER_DEMO_ASPECT_RATIO = VOTER_DEMO_WIDTH / VOTER_DEMO_HEIGHT;
export const DEMO_NOTICE = "DEMO — SI KITAMBULISHO RASMI";
export const DEMO_REFERENCE = "SAMPLE-000000";

export function formatVoterDemoDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return "";
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (parsed.getFullYear() !== Number(year) || parsed.getMonth() !== Number(month) - 1 || parsed.getDate() !== Number(day)) return "";
  return `${day}/${month}/${year}`;
}
