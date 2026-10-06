export const accountAccessModes = ["active", "read_only", "limited", "denied"] as const;
export type AccountAccessMode = (typeof accountAccessModes)[number];

export const accountRestrictionActions = ["profile", "chat", "applications", "services", "payments"] as const;
export type AccountRestrictionAction = (typeof accountRestrictionActions)[number];

export const accountRestrictionActionLabels: Record<AccountRestrictionAction, string> = {
  profile: "Kuhariri wasifu",
  chat: "Kutumia chat",
  applications: "Kutuma maombi ya huduma / Lipa Namba",
  services: "Kutumia huduma zinazotumia tokeni",
  payments: "Kuanza ombi la ununuzi wa tokeni",
};

export function resolveAccountAccessMode(profile: { accessMode?: unknown; accountStatus?: unknown } | null | undefined): AccountAccessMode {
  if (profile?.accountStatus === "blocked" || profile?.accountStatus === "deleted") return "denied";
  if (accountAccessModes.includes(profile?.accessMode as AccountAccessMode)) return profile!.accessMode as AccountAccessMode;
  return "active";
}
