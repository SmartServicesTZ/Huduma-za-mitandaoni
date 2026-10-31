import { describe, expect, it } from "vitest";
import { popCursor, previousCursor, pushCurrentCursor, type CursorHistory } from "./cursorPageHistory";

describe("cursor page history", () => {
  it("walks back from later pages to the initial undefined cursor", () => {
    let history: CursorHistory = [];
    history = pushCurrentCursor(history, undefined);
    history = pushCurrentCursor(history, "page-2");
    expect(previousCursor(history)).toEqual({ available: true, cursor: "page-2" });
    history = popCursor(history);
    expect(previousCursor(history)).toEqual({ available: true, cursor: undefined });
    history = popCursor(history);
    expect(previousCursor(history)).toEqual({ available: false });
  });

  it("does not mutate shared cursor history", () => {
    const history: CursorHistory = [undefined, "page-2"];
    expect(popCursor(history)).toEqual([undefined]);
    expect(history).toEqual([undefined, "page-2"]);
    expect(popCursor([])).toEqual([]);
  });
});
