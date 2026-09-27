import { describe, expect, it } from "vitest";
import { completeOrder, isServiceLocked, moveId, orderByIds } from "./serviceOrdering";

describe("service ordering", () => {
  const ids = ["tin", "nida", "leseni-biashara"];

  it("honors the saved priority and appends services added later", () => {
    expect(completeOrder(ids, ["leseni-biashara", "tin"])).toEqual(["leseni-biashara", "tin", "nida"]);
  });

  it("ignores duplicate and removed IDs while preserving original order for the rest", () => {
    expect(completeOrder(ids, ["missing", "leseni-biashara", "leseni-biashara"])).toEqual(["leseni-biashara", "tin", "nida"]);
  });

  it("sorts service records by their saved slug order", () => {
    const rows = ids.map((slug) => ({ slug, name: slug }));
    expect(orderByIds(rows, ["leseni-biashara"]).map((item) => item.slug)).toEqual(["leseni-biashara", "tin", "nida"]);
  });

  it("lets an administrator move a service directly to the first position", () => {
    expect(moveId(ids, "leseni-biashara", 0)).toEqual(["leseni-biashara", "tin", "nida"]);
  });
});


describe("service lock overrides", () => {
  it("allows an explicit unlock to override a default-locked service", () => {
    expect(isServiceLocked("cheti-kuzaliwa", false)).toBe(false);
  });

  it("locks ordinary services when an administrator sets a lock override", () => {
    expect(isServiceLocked("leseni-biashara", true)).toBe(true);
  });

  it("preserves the catalog lock when no override has been saved", () => {
    expect(isServiceLocked("cheti-kuzaliwa", undefined)).toBe(true);
    expect(isServiceLocked("leseni-biashara", undefined, true)).toBe(true);
  });
});
