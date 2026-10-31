import { describe, expect, it } from "vitest";
import {
  formatDemoBirthDate,
  formatDemoIdNumber,
  getNidaDemoAssetPaths,
  NIDA_DEMO_CARD_HEIGHT,
  NIDA_DEMO_CARD_RATIO,
  NIDA_DEMO_CARD_WIDTH,
  NIDA_DEMO_WATERMARK,
} from "./nidaDemoCard";

describe("safe NIDA demo card model", () => {
  it("keeps the reference card ratio and unmistakable safety watermark", () => {
    expect(NIDA_DEMO_CARD_WIDTH / NIDA_DEMO_CARD_HEIGHT).toBeCloseTo(1.53, 2);
    expect(NIDA_DEMO_CARD_RATIO).toBe(NIDA_DEMO_CARD_WIDTH / NIDA_DEMO_CARD_HEIGHT);
    expect(NIDA_DEMO_WATERMARK).toContain("NOT AN OFFICIAL ID");
  });

  it("builds asset paths relative to the configured GitHub Pages base URL", () => {
    expect(getNidaDemoAssetPaths("/Huduma-za-mitandaoni/")).toEqual({
      ngao: "/Huduma-za-mitandaoni/images/ngao.png",
      bendera: "/Huduma-za-mitandaoni/images/bendera.png",
    });
    expect(getNidaDemoAssetPaths("/").bendera).toBe("/images/bendera.png");
  });

  it("formats only a 20-digit sample ID and preserves other editable text", () => {
    expect(formatDemoIdNumber("00000000000000000000")).toBe("00000000-00000-00000-00");
    expect(formatDemoIdNumber("sample id")).toBe("sample id");
    expect(formatDemoIdNumber("   ")).toBe("—");
  });

  it("formats valid ISO dates and safely handles blank or free-form input", () => {
    expect(formatDemoBirthDate("2000-01-01")).toBe("01 JAN 2000");
    expect(formatDemoBirthDate("")).toBe("—");
    expect(formatDemoBirthDate("unknown")).toBe("unknown");
  });
});
