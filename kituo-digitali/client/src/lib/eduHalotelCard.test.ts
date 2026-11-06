import { describe, expect, it } from "vitest";
import { EDU_CARD_HEIGHT, EDU_CARD_WIDTH, formatEduDate, makeEduQrPayload } from "./eduHalotelCard";

describe("EDU-HALOTEL card template helpers", () => {
  it("uses the reference landscape ratio and print-resolution canvas size", () => {
    expect(EDU_CARD_WIDTH).toBe(2881);
    expect(EDU_CARD_HEIGHT).toBe(1801);
    expect(EDU_CARD_WIDTH / EDU_CARD_HEIGHT).toBeCloseTo(1.6, 3);
  });

  it("formats dates in the reference DD-MM-YYYY style without timezone conversion", () => {
    expect(formatEduDate("2026-11-06")).toBe("06-11-2026");
    expect(formatEduDate("")).toBe("");
    expect(formatEduDate("2026-2-3")).toBe("");
  });

  it("marks QR data as demo and carries the entered identity fields", () => {
    const payload = JSON.parse(makeEduQrPayload({
      name: "  Asha Example ",
      college: " Sample College ",
      course: " Nursing ",
      regNo: " NS/EX/26/0001 ",
      validUntil: "2029",
    }));
    expect(payload).toEqual({
      demo: true,
      name: "Asha Example",
      college: "Sample College",
      course: "Nursing",
      regNo: "NS/EX/26/0001",
      validUntil: "2029",
    });
  });
});
