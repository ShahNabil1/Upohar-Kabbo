import { describe, expect, it } from "vitest";
import { resolveCountry } from "./country";

describe("country identity", () => {
  it("resolves dynamic country codes", () => {
    expect(resolveCountry(" bd ")).toEqual({ code: "BD", name: "Bangladesh" });
    expect(resolveCountry("US")).toEqual({ code: "US", name: "United States" });
    expect(resolveCountry("SA")).toEqual({ code: "SA", name: "Saudi Arabia" });
  });
  it("handles full names and UK alias", () => {
    expect(resolveCountry("Bangladesh")?.code).toBe("BD");
    expect(resolveCountry("UK")?.name).toBe("United Kingdom");
  });
  it("never invents a flag for missing or unknown locations", () => {
    for (const value of [null, undefined, "", "XX", "T1", "unknown", 123]) expect(resolveCountry(value)).toBeNull();
  });
});