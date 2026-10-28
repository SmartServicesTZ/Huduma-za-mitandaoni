export const homepageSectionIds = ["services", "locked", "special", "tools", "tutorials"] as const;
export type HomepageSectionId = (typeof homepageSectionIds)[number];
export const defaultHomepageSectionOrder: HomepageSectionId[] = [...homepageSectionIds];
export const defaultLockedServiceSlugs = new Set(["cheti-kuzaliwa", "visa-pasipoti", "cheti-ndoa", "ripoti-hasara"]);
export const preferredHomepageServiceSlugs = [
  "leseni-biashara",
  "cheti-tin",
  "pata-lipa-namba",
  "access-lipa-number",
  "sme-airtel",
  "sme-vodacom",
  "sme-airtel-mkataba",
  "change-business-name-airtel-lipa",
  "kitambulisho-wakala",
  "pata-pocket-wifi-mabando",
] as const;

export function isServiceLocked(slug: string, override: boolean | undefined, recordLocked = false): boolean {
  if (typeof override === "boolean") return override;
  return recordLocked || defaultLockedServiceSlugs.has(slug);
}

export function completeOrder<T extends string>(available: T[], saved: readonly string[] = []): T[] {
  const availableSet = new Set<string>(available);
  const seen = new Set<string>();
  const result: T[] = [];
  for (const id of saved) {
    if (availableSet.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id as T);
    }
  }
  for (const id of available) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

export function orderByIds<T extends { slug: string }>(items: T[], saved: readonly string[] = []): T[] {
  const orderedIds = completeOrder(items.map((item) => item.slug), saved);
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return items.map((item, index) => ({ item, index })).sort((a, b) => {
    const rankDifference = (rank.get(a.item.slug) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.item.slug) ?? Number.MAX_SAFE_INTEGER);
    return rankDifference || a.index - b.index;
  }).map(({ item }) => item);
}

export function prioritizeHomepageServices<T extends { slug: string; kind?: string }>(items: T[]): T[] {
  const rank = new Map<string, number>(preferredHomepageServiceSlugs.map((slug, index): [string, number] => [slug, index]));
  return items.map((item, index) => ({ item, index })).sort((a, b) => {
    const lockDifference = Number(a.item.kind === "locked") - Number(b.item.kind === "locked");
    if (lockDifference) return lockDifference;
    const rankA = rank.get(a.item.slug) ?? Number.MAX_SAFE_INTEGER;
    const rankB = rank.get(b.item.slug) ?? Number.MAX_SAFE_INTEGER;
    return rankA === rankB ? a.index - b.index : rankA - rankB;
  }).map(({ item }) => item);
}

export function moveId(ids: readonly string[], id: string, destination: number): string[] {
  const currentIndex = ids.indexOf(id);
  if (currentIndex < 0 || ids.length < 2) return [...ids];
  const next = [...ids];
  const [moving] = next.splice(currentIndex, 1);
  const boundedIndex = Math.max(0, Math.min(destination, next.length));
  next.splice(boundedIndex, 0, moving);
  return next;
}
