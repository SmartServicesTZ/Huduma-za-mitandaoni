import { describe, expect, it } from "vitest";
import {
  buildLipaInfoQrPayload,
  normalizeLipaNumber,
  validateLipaCard,
  type LipaCardValues,
} from "./lipaQrStudio";

const validValues: LipaCardValues = {
  lipaNumber: "163872884",
  businessName: "Jumanne Haji Fundi",
};

describe("Yas Lipa sticker helpers", () => {
  it("keeps only digits and caps the Lipa number at 12 digits", () => {
    expect(normalizeLipaNumber("+255 (163) 872-884991")).toBe("255163872884");
  });

  it("accepts valid number and business name and reports invalid values", () => {
    expect(validateLipaCard(validValues)).toEqual({});
    expect(validateLipaCard({ ...validValues, lipaNumber: "1234", businessName: " " })).toMatchObject({
      lipaNumber: "Namba ya Lipa iwe na tarakimu 5 hadi 12.",
      businessName: "Weka jina la biashara.",
    });
  });

  it("limits business names to 32 characters", () => {
    expect(validateLipaCard({ ...validValues, businessName: "Jina la biashara limezidi herufi thelathini na mbili" }).businessName)
      .toBe("Jina lisizidi herufi 32.");
  });

  it("creates a readable information-only QR payload, never a payment payload", () => {
    expect(buildLipaInfoQrPayload(validValues)).toBe([
      "TAARIFA TU — SI QR YA MALIPO",
      "Namba ya Lipa: 163872884",
      "Jina: JUMANNE HAJI FUNDI",
    ].join("\n"));
  });
});
