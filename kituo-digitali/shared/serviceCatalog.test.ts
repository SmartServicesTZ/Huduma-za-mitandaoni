import { describe, expect, it } from "vitest";
import { getPortalServiceName, mergeServiceCatalogDefaults, serviceCatalog } from "./catalog";

describe("legacy service catalogue migration fallback", () => {
  it("keeps legacy services visible while the Firestore catalogue is not initialized", () => {
    const services = mergeServiceCatalogDefaults([], false);
    expect(services.map((service) => service.slug)).toContain("cheti-tin");
    expect(services.map((service) => service.slug)).toContain("leseni-biashara");
    expect(services.map((service) => service.slug)).toContain("pata-lipa-namba");
    expect(services.length).toBe(serviceCatalog.length);
  });

  it("uses the requested storefront names even when stored service labels are older", () => {
    expect(getPortalServiceName("cheti-tin", "TIN NUMBER CERTIFICATE")).toBe("TIN CERTIFICATE");
    expect(getPortalServiceName("pata-lipa-namba", "PATA LIPA NAMBA BURE")).toBe("PATA LIPA NAMBA");
    expect(getPortalServiceName("access-lipa-number", "PATA ACCESS YA LIPA&USAJILI")).toBe("PATA ACCESS YA LIPA & USAJILI");
    expect(getPortalServiceName("pata-pocket-wifi-mabando", "PATA POCKET WIFI & MABANDO")).toBe("PATA POCKET WIFI & BANDO");
  });

  it("uses Firestore records to override defaults and keeps newly configured services", () => {
    const configured = [
      { ...serviceCatalog.find((service) => service.slug === "cheti-tin")!, name: "TIN iliyosanidiwa", tokenCost: 4 },
      { slug: "huduma-mpya", name: "Huduma mpya", description: "", icon: "sparkles", tokenCost: 1, kind: "paid" as const, category: "Huduma kuu" },
    ];
    const services = mergeServiceCatalogDefaults(configured, false);
    expect(services.find((service) => service.slug === "cheti-tin")?.name).toBe("TIN iliyosanidiwa");
    expect(services.map((service) => service.slug)).toContain("huduma-mpya");
    expect(services.map((service) => service.slug)).toContain("leseni-biashara");
  });

  it("does not resurrect deleted defaults after Firestore migration is marked complete", () => {
    const services = mergeServiceCatalogDefaults([], true);
    expect(services).toEqual([
      serviceCatalog.find((service) => service.slug === "access-lipa-number"),
      serviceCatalog.find((service) => service.slug === "pata-pocket-wifi-mabando"),
      serviceCatalog.find((service) => service.slug === "pata-till-mitandao-yote"),
      serviceCatalog.find((service) => service.slug === "soft-copy-nida"),
    ]);
  });
});
