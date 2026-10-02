import { describe, expect, it } from "vitest";
import { omitUndefinedFields } from "./omitUndefinedFields";

describe("omitUndefinedFields", () => {
  it("omits undefined fields that Firestore rejects", () => {
    const result = omitUndefinedFields({ name: "Asha", profileImageUrl: undefined });
    expect(result).toEqual({ name: "Asha" });
    expect("profileImageUrl" in result).toBe(false);
  });

  it("preserves valid null and falsy values", () => {
    const result = omitUndefinedFields({ nullable: null, enabled: false, balance: 0 });
    expect(result).toEqual({ nullable: null, enabled: false, balance: 0 });
  });
});
