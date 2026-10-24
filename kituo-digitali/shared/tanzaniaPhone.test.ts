import { describe, expect, it } from "vitest";
import { normalizeTanzaniaPhone, phoneAuthAlias, tanzaniaPhoneStoredAliases } from "./tanzaniaPhone";

describe("normalizeTanzaniaPhone", () => {
  it.each([
    ["0698232313", "255698232313"],
    ["0698 232 313", "255698232313"],
    ["+255698232313", "255698232313"],
    ["255698232313", "255698232313"],
    ["+255 698-232-313", "255698232313"],
    ["698232313", "255698232313"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeTanzaniaPhone(input)).toBe(expected);
  });

  it.each(["12345", "069823231", "0858232313", "25569823231", "abc"]) (
    "rejects invalid Tanzania number %s",
    (input) => expect(normalizeTanzaniaPhone(input)).toBeNull(),
  );

  it("creates the same internal Firebase identity alias for equivalent phone formats", () => {
    const variants = ["0698232313", "0698 232 313", "+255698232313", "255698232313"];
    const aliases = variants.map((phone) => phoneAuthAlias(normalizeTanzaniaPhone(phone)!));
    expect(new Set(aliases).size).toBe(1);
  });
});

describe("tanzaniaPhoneStoredAliases", () => {
  it("returns common legacy representations for an exact Firestore phone lookup", () => {
    const aliases = tanzaniaPhoneStoredAliases("255712345678");
    expect(aliases).toContain("255712345678");
    expect(aliases).toContain("+255712345678");
    expect(aliases).toContain("0712345678");
    expect(aliases).toContain("712345678");
    expect(aliases).toContain("0712 345 678");
    expect(aliases).toContain("0712-345-678");
    expect(aliases).toContain("+255 712 345 678");
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});
