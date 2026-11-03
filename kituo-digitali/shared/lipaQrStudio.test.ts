import { describe, expect, it } from "vitest";
import {
  buildLipaInfoQrPayload,
  getHalotelStickerDigits,
  normalizeLipaNumber,
  validateLipaCard,
  type LipaCardValues,
} from "./lipaQrStudio";

const validValues: LipaCardValues = {
  lipaNumber: "13130884222",
  businessName: "Duka la Majaribio",
  location: "MBEYA",
  postalCode: "53000",
};

describe("Lipa QR Studio helpers", () => {
  it("keeps only digits and caps the Lipa number at 12 digits", () => {
    expect(normalizeLipaNumber("+255 (131) 308-84222299")).toBe("255131308842");
  });

  it("accepts a valid card and reports each invalid field", () => {
    expect(validateLipaCard(validValues)).toEqual({});
    expect(validateLipaCard({ ...validValues, lipaNumber: "1234", businessName: " ", location: "UNKNOWN", postalCode: "5300" })).toMatchObject({
      lipaNumber: "Namba ya Lipa iwe na tarakimu 5 hadi 12.",
      businessName: "Weka jina la biashara.",
    });
  });

  it("limits business names to 32 characters", () => {
    expect(validateLipaCard({ ...validValues, businessName: "Jina la Biashara Limezidi Herufi Sana Zaidi" }).businessName)
      .toBe("Jina la biashara lisizidi herufi 32.");
  });

  it("creates a readable information QR payload and explicitly not a payment payload", () => {
    expect(buildLipaInfoQrPayload(validValues)).toBe([
      "TAARIFA ZA LIPA — SI QR YA MALIPO",
      "Namba ya Lipa: 13130884222",
      "Biashara: DUKA LA MAJARIBIO",
      "Eneo: MBEYA",
      "Posta: 53000",
    ].join("\n"));
  });
});


describe("Halotel sticker digit and footer requirements", () => {
  it.each([5, 6, 7, 8, 9])("supports a %i-digit Halotel Lipa number without changing generic validation", (length) => {
    const lipaNumber = "123456789".slice(0, length);
    expect(normalizeLipaNumber(lipaNumber)).toBe(lipaNumber);
    expect(validateLipaCard({ ...validValues, lipaNumber })).toEqual({});
    expect(lipaNumber.length).toBe(length);
  });
});

describe("Halotel sticker digit boxes", () => {
  it.each([5, 6, 7, 8, 9])("returns exactly %i boxes for a %i-digit number", (length) => {
    const digits = getHalotelStickerDigits("123456789".slice(0, length));
    expect(digits).toHaveLength(length);
    expect(digits.join("")).toBe("123456789".slice(0, length));
  });

  it("shows five empty placeholder boxes before a number is entered", () => {
    expect(getHalotelStickerDigits("")).toEqual(["", "", "", "", ""]);
  });

  it("does not change the shared 5-to-12 digit validation", () => {
    expect(validateLipaCard({ ...validValues, lipaNumber: "123456789012" })).toEqual({});
  });
});
