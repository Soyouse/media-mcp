import { describe, it, expect } from "vitest";
import { createIncidentContext } from "../incidents.js";

describe("incidents", () => {
  it("vide → message OK, count 0, list vide", () => {
    const c = createIncidentContext();
    expect(c.count).toBe(0);
    expect(c.list()).toEqual([]);
    expect(c.format()).toBe("✅ Aucun incident.");
  });
  it("add empile niveau/message, meta défaut null, ts string", () => {
    const c = createIncidentContext();
    c.add("error", "boom");
    expect(c.count).toBe(1);
    const e = c.list()[0];
    expect(e.level).toBe("error");
    expect(e.message).toBe("boom");
    expect(e.meta).toBe(null);
    expect(typeof e.ts).toBe("string");
  });
  it("add conserve la meta fournie", () => {
    const c = createIncidentContext();
    c.add("warn", "x", { status: 429 });
    expect(c.list()[0].meta).toEqual({ status: 429 });
  });
  it("format liste les incidents avec compte et préfixes", () => {
    const c = createIncidentContext();
    c.add("error", "a");
    c.add("warn", "b");
    const f = c.format();
    expect(f).toContain("Incidents (2)");
    expect(f).toContain("- [error] a");
    expect(f).toContain("- [warn] b");
  });
  it("list() renvoie une copie (mutation externe sans effet)", () => {
    const c = createIncidentContext();
    c.add("info", "z");
    c.list().push("HACK");
    expect(c.count).toBe(1);
  });
});
