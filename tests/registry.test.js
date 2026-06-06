import { describe, it, expect } from "vitest";
import { loadRegistry } from "../lib/registry.js";

describe("registry", () => {
  it("auto-découvre les 4 handlers média", async () => {
    const reg = await loadRegistry();
    expect(reg.get("media_call")).toBeDefined();
    expect(reg.get("media_discover")).toBeDefined();
    expect(reg.get("media_health")).toBeDefined();
    expect(reg.get("media_switch_provider")).toBeDefined();
    expect(reg.size).toBe(4);
  });
  it("chaque tool expose name (string) + handle (fonction)", async () => {
    const reg = await loadRegistry();
    for (const t of reg.values()) {
      expect(typeof t.name).toBe("string");
      expect(typeof t.handle).toBe("function");
    }
  });
  it("cache : 2e appel renvoie la MÊME Map", async () => {
    const a = await loadRegistry();
    const b = await loadRegistry();
    expect(a).toBe(b);
  });
});
