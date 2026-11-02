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

  it("limits business names to 25 characters", () => {
    expect(validateLipaCard({ ...validValues, businessName: "Jina la biashara limezidi herufi thelathini na mbili" }).businessName)
      .toBe("Jina lisizidi herufi 25.");
  });

  it("builds the supplied TIPS payload with dynamic merchant name, Lipa number and CRC", () => {
    expect(buildLipaInfoQrPayload({
      lipaNumber: "15148616",
      businessName: "Staward Jackson njiwa",
    })).toBe("00020101021226390014tz.go.bot.tips0105025010208151486165204413153038345802TZ5921STAWARD JACKSON NJIWA6010KIBAHA CBD610561104622103082271514307051100263040240");
  });

  it("updates merchant details when form values change", () => {
    const payload = buildLipaInfoQrPayload(validValues);
    expect(payload).toContain("163872884");
    expect(payload).toContain("JUMANNE HAJI FUNDI");
    expect(payload.slice(-8, -4)).toBe("6304");
  });
});
