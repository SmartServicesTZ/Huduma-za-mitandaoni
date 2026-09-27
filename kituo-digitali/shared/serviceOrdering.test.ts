import { describe, expect, it } from "vitest";
import { completeOrder, moveId, orderByIds } from "./serviceOrdering";

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
