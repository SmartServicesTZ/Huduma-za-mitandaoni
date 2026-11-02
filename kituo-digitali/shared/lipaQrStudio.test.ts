import { describe, expect, it } from "vitest";
import {
  buildLipaInfoQrPayload,
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

  it("limits business names to 25 characters", () => {
    expect(validateLipaCard({ ...validValues, businessName: "Jina la Biashara Limezidi Herufi" }).businessName)
      .toBe("Jina la biashara lisizidi herufi 25.");
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
