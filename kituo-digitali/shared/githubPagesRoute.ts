export function withBasePath(route: string, base: string): string {
  const normalizedBase = `/${base.split("/").filter(Boolean).join("/")}` || "/";
  const routeHasBase =
    route === normalizedBase ||
    route.startsWith(`${normalizedBase}/`) ||
    route.startsWith(`${normalizedBase}?`) ||
    route.startsWith(`${normalizedBase}#`);

  if (routeHasBase) return route;
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return normalizedBase === "/" ? normalizedRoute : `${normalizedBase}${normalizedRoute}`;
}
