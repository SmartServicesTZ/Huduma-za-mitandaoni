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
  const role: AuthRole = isConfiguredSuperAdmin
    ? "super_admin"
    : profileRole === "super_admin"
      ? "user"
      : profileRole ?? "user";

  return {
    role,
    isConfiguredSuperAdmin,
    shouldPromote: isConfiguredSuperAdmin && profileRole !== "super_admin",
    shouldDemote: !isConfiguredSuperAdmin && profileRole === "super_admin",
  };
}
