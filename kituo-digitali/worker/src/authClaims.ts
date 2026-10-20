export type AuthRole = "user" | "admin" | "moderator" | "support" | "super_admin";

export function resolveAuthRole(
  profileRole: AuthRole | undefined,
  authenticatedUid: unknown,
  configuredSuperAdminUid: unknown,
) {
  const configuredUid = typeof configuredSuperAdminUid === "string" ? configuredSuperAdminUid.trim() : "";
  const uid = typeof authenticatedUid === "string" ? authenticatedUid.trim() : "";
  const isConfiguredSuperAdmin = Boolean(configuredUid && uid && uid === configuredUid);
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
