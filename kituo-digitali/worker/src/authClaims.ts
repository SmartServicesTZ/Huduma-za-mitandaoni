import { normalizeTanzaniaPhone } from "./fimipayCore.js";

export type AuthRole = "user" | "admin" | "moderator" | "support" | "super_admin";

export function resolveAuthRole(
  profileRole: AuthRole | undefined,
  profilePhone: unknown,
  configuredSuperAdminPhone: unknown,
) {
  const configuredPhone = normalizeTanzaniaPhone(configuredSuperAdminPhone);
  const normalizedProfilePhone = normalizeTanzaniaPhone(profilePhone);
  const isConfiguredSuperAdmin = Boolean(configuredPhone && normalizedProfilePhone === configuredPhone);
  const storedPhone = typeof profilePhone === "string" ? profilePhone.replace(/[\\s()+-]/g, "") : "";
  // When the same configured super-admin phone exists twice, keep the canonical
  // international 255... profile as super_admin and demote the local 0... duplicate.
  const shouldDemote = profileRole === "super_admin"
    && isConfiguredSuperAdmin
    && !storedPhone.startsWith("255");

  const role: AuthRole = shouldDemote
    ? "user"
    : profileRole === "super_admin" || isConfiguredSuperAdmin
      ? "super_admin"
      : profileRole ?? "user";

  return {
    role,
    isConfiguredSuperAdmin,
    shouldPromote: isConfiguredSuperAdmin && profileRole !== "super_admin" && !shouldDemote,
    shouldDemote,
  };
}
