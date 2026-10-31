export function preserveServerOrder<T>(rows: readonly T[], descending: boolean): T[] {
  const copy = [...rows];
  return descending ? copy : copy.reverse();
}
