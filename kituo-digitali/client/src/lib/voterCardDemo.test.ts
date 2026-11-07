import { describe, expect, it } from "vitest";
import {
  DEMO_NOTICE,
  DEMO_REFERENCE,
  VOTER_DEMO_ASPECT_RATIO,
  VOTER_DEMO_HEIGHT,
  VOTER_DEMO_WIDTH,
  formatVoterDemoDate,
} from "./voterCardDemo";

describe("voter card demo output", () => {
  it("uses a high-resolution landscape canvas close to the supplied reference ratio", () => {
    expect(VOTER_DEMO_WIDTH).toBe(1600);
    expect(VOTER_DEMO_HEIGHT).toBe(1000);
    expect(VOTER_DEMO_ASPECT_RATIO).toBe(1.6);
  });

  it("labels the card as unofficial and uses a fixed sample reference", () => {
    expect(DEMO_NOTICE).toContain("DEMO");
    expect(DEMO_NOTICE).toContain("SI KITAMBULISHO RASMI");
    expect(DEMO_REFERENCE).toBe("SAMPLE-000000");
  });

  it("formats valid birth dates without timezone drift", () => {
    expect(formatVoterDemoDate("2001-08-08")).toBe("08/08/2001");
    expect(formatVoterDemoDate("2024-02-29")).toBe("29/02/2024");
  });

  it("does not display malformed dates", () => {
    expect(formatVoterDemoDate("2001-02-29")).toBe("");
    expect(formatVoterDemoDate("08/08/2001")).toBe("");
    expect(formatVoterDemoDate("")).toBe("");
  });
});
