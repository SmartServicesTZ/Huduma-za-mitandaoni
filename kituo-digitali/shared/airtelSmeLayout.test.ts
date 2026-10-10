import { describe, expect, it } from "vitest";
import { AIRTEL_SME_LAYOUT_DEFAULTS, normalizeAirtelSmeLayout } from "./airtelSmeLayout";

describe("normalizeAirtelSmeLayout", () => {
  it("moves old shipped defaults into the correct printed fields", () => {
    const result = normalizeAirtelSmeLayout({
      nameY: "25",
      deviceY: "56",
      customerY: "90",
      sign1Y: 90,
      date1Y: "90",
      salesY: 93.7,
      sign2Y: "93.7",
      date2Y: 93.7,
    });

    expect(result.nameY).toBe(AIRTEL_SME_LAYOUT_DEFAULTS.nameY);
    expect(result.deviceY).toBe(58.3);
    expect(result.customerY).toBe(94);
    expect(result.sign1Y).toBe(94);
    expect(result.date1Y).toBe(94);
    expect(result.salesY).toBe(95.5);
    expect(result.sign2Y).toBe(95.5);
    expect(result.date2Y).toBe(95.5);
  });

  it("keeps deliberate custom coordinates and ignores invalid values", () => {
    const result = normalizeAirtelSmeLayout({
      nameX: "24.5",
      deviceY: 59.1,
      emailY: 44.5,
      nameSize: 40,
      unknownField: 22,
    });

    expect(result.nameX).toBe(24.5);
    expect(result.deviceY).toBe(59.1);
    expect(result.emailY).toBe(44.5);
    expect(result.nameSize).toBe(AIRTEL_SME_LAYOUT_DEFAULTS.nameSize);
    expect(result).not.toHaveProperty("unknownField");
  });
});
