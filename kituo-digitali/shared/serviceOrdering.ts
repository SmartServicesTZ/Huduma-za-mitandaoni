export const homepageSectionIds = ["services", "locked", "special", "tools", "tutorials"] as const;
export type HomepageSectionId = (typeof homepageSectionIds)[number];
export const defaultHomepageSectionOrder: HomepageSectionId[] = [...homepageSectionIds];

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

export function moveId(ids: readonly string[], id: string, destination: number): string[] {
  const currentIndex = ids.indexOf(id);
  if (currentIndex < 0 || ids.length < 2) return [...ids];
  const next = [...ids];
  const [moving] = next.splice(currentIndex, 1);
  const boundedIndex = Math.max(0, Math.min(destination, next.length));
  next.splice(boundedIndex, 0, moving);
  return next;
}
