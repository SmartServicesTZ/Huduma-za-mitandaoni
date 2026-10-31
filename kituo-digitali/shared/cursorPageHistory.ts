export type CursorHistory = Array<string | undefined>;

export type PreviousCursor = { available: true; cursor: string | undefined } | { available: false };

export function pushCurrentCursor(history: CursorHistory, current: string | undefined): CursorHistory {
  return [...history, current];
}

export function previousCursor(history: CursorHistory): PreviousCursor {
  return history.length ? { available: true, cursor: history[history.length - 1] } : { available: false };
}

export function popCursor(history: CursorHistory): CursorHistory {
  return history.length ? history.slice(0, -1) : history;
}
