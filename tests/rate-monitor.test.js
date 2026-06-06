import { describe, it, expect, beforeEach } from "vitest";
import { recordResult, snapshot, _reset } from "../lib/rate-monitor.js";

beforeEach(() => _reset());

describe("rate-monitor", () => {
  it("ignore les status valides", () => {
    recordResult("grok", 200);
    recordResult("grok", 201);
    recordResult("grok", 500);
    expect(snapshot().invalidTotal).toBe(0);
  });
  it("enregistre 401/403/429 par provider", () => {
    recordResult("grok", 401);
    recordResult("grok", 429);
    recordResult("grok", 403);
    const s = snapshot();
    expect(s.invalidTotal).toBe(3);
    expect(s.perProvider.grok).toBe(3);
  });
  it("provider défaut si absent", () => {
    recordResult(undefined, 429);
    expect(snapshot().perProvider["(défaut)"]).toBe(1);
  });
  it("warn quand total ≥ 40% du softLimit (60 → seuil 24)", () => {
    const now = () => 1000;
    for (let i = 0; i < 24; i++) recordResult("grok", 429, now);
    const s = snapshot(now);
    expect(s.warn).toBe(true);
    expect(s.softLimit).toBe(60);
    expect(s.invalidTotal).toBe(24);
  });
  it("pas de warn juste en dessous du seuil (23)", () => {
    const now = () => 1000;
    for (let i = 0; i < 23; i++) recordResult("grok", 429, now);
    expect(snapshot(now).warn).toBe(false);
  });
  it("élague les events hors fenêtre 1 min", () => {
    recordResult("grok", 429, () => 0); // t=0
    expect(snapshot(() => 60001).invalidTotal).toBe(0); // 60001 - 60000 = 1 > 0
  });
  it("garde les events dans la fenêtre", () => {
    recordResult("grok", 429, () => 0);
    expect(snapshot(() => 60000).invalidTotal).toBe(1); // cutoff = 0, ts 0 >= 0
  });
  it("windowMinutes = 1", () => {
    expect(snapshot().windowMinutes).toBe(1);
  });
});
