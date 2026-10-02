import { describe, expect, it } from "vitest";
import { withBasePath } from "./githubPagesRoute";

describe("withBasePath", () => {
  const base = "/Huduma-za-mtandao/";

  it("prefixes a deep route with the repository base", () => {
    expect(withBasePath("/account", base)).toBe("/Huduma-za-mtandao/account");
  });

  it("preserves query strings and hashes", () => {
    expect(withBasePath("/admin/users?tab=active#list", base)).toBe("/Huduma-za-mtandao/admin/users?tab=active#list");
  });

  it("does not duplicate an existing base path", () => {
    expect(withBasePath("/Huduma-za-mtandao/history", base)).toBe("/Huduma-za-mtandao/history");
  });

  it("maps the home route to the repository root", () => {
    expect(withBasePath("/", base)).toBe("/Huduma-za-mtandao/");
  });
});
