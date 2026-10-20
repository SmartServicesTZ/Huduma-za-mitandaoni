export type WebsiteHealthStatus = "healthy" | "error" | "unavailable";
export type HealthReportStatus = "new" | "ongoing" | "resolved";

export function resolveWebsiteHealthStatus(input: {
  externalAvailable: boolean;
  externalFailed: boolean;
  unresolvedBrowserReports: number;
}): WebsiteHealthStatus {
  if (!input.externalAvailable) return "unavailable";
  if (input.externalFailed || input.unresolvedBrowserReports > 0) return "error";
  return "healthy";
}

export const websiteHealthStatusLabels: Record<WebsiteHealthStatus, string> = {
  healthy: "INAENDA VIZURI",
  error: "INA HITILAFU",
  unavailable: "HAIPATIKANI",
};
