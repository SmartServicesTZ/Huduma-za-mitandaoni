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

  // The Firestore role is server-managed: browser writes cannot change it,
  // adminWrite blocks the role field, and updateUserAccess restricts role
  // elevation to an already-authorized super admin. Do not silently demote an
  // established super_admin just because the optional phone allow-list is
  // missing or out of sync; that mismatch otherwise breaks every protected
  // action (including adjustTokens) while the dashboard still shows SUPER ADMIN.
  const role: AuthRole = profileRole === "super_admin" || isConfiguredSuperAdmin
    ? "super_admin"
    : profileRole ?? "user";

  return {
    role,
    isConfiguredSuperAdmin,
    shouldPromote: isConfiguredSuperAdmin && profileRole !== "super_admin",
    // Never auto-demote a server-managed super_admin based solely on a phone
    // mismatch. Demotion must be an explicit, authorized role change.
    shouldDemote: false,
  };
}
