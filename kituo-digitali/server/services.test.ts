import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { serviceCatalog } from "../shared/catalog";

function createPublicContext(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("HUDUMA ZA MTANDAONI portal", () => {
  it("returns the full Kiswahili service catalog", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const services = await caller.portal.services();
    expect(services.length).toBeGreaterThanOrEqual(serviceCatalog.length);
    const nidaServices = services.filter((service) => /nida|nin/i.test(`${service.slug} ${service.name}`));
    expect(nidaServices.map((service) => service.slug)).toEqual(["soft-copy-nida"]);
    expect(services.find((service) => service.slug === "cheti-tin")?.tokenCost).toBe(2);
  });

  it("returns announcement text and tutorials without fake video URLs", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    expect(await caller.portal.announcement()).not.toContain("0698232313");
    const tutorials = await caller.portal.tutorials();
    expect(tutorials).toHaveLength(3);
    expect(tutorials.every((tutorial) => !tutorial.videoUrl)).toBe(true);
  });
});
