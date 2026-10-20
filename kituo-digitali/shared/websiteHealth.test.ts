import { describe, expect, it } from "vitest";
import { resolveWebsiteHealthStatus } from "./websiteHealth";

describe("resolveWebsiteHealthStatus", () => {
  it("reports healthy when external and browser checks are clear", () => {
    expect(resolveWebsiteHealthStatus({ externalAvailable: true, externalFailed: false, unresolvedBrowserReports: 0 })).toBe("healthy");
  });
  it("reports error when an external check or browser report is unresolved", () => {
    expect(resolveWebsiteHealthStatus({ externalAvailable: true, externalFailed: true, unresolvedBrowserReports: 0 })).toBe("error");
    expect(resolveWebsiteHealthStatus({ externalAvailable: true, externalFailed: false, unresolvedBrowserReports: 2 })).toBe("error");
  });
  it("prioritizes unavailable when the public website cannot be reached", () => {
    expect(resolveWebsiteHealthStatus({ externalAvailable: false, externalFailed: true, unresolvedBrowserReports: 4 })).toBe("unavailable");
  });
});
