import { describe, expect, it } from "vitest";
import { preserveServerOrder } from "./chronologicalPage";

describe("chronological server page display", () => {
  it("keeps server newest-first timestamp plus document-ID tie-break order", () => {
    const page = [
      { id: "request_z", submittedAt: "2026-10-28T11:00:00.123456789Z" },
      { id: "request_b", submittedAt: "2026-10-28T11:00:00.123456789Z" },
      { id: "request_a", submittedAt: "2026-10-28T11:00:00.123456788Z" },
    ];
    expect(preserveServerOrder(page, true)).toEqual(page);
    expect(preserveServerOrder(page, true)).not.toBe(page);
  });

  it("reverses the backend order only when the user explicitly selects ascending", () => {
    const page = [{ id: "newest" }, { id: "older" }, { id: "oldest" }];
    expect(preserveServerOrder(page, false)).toEqual([{ id: "oldest" }, { id: "older" }, { id: "newest" }]);
    expect(page.map((row) => row.id)).toEqual(["newest", "older", "oldest"]);
  });
});
