import { describe, it, expect, vi, beforeEach } from "vitest";

// Prouve l'isolation PAR-SESSION : 2 agents concurrents qui switchent de provider ne se polluent jamais.
const mediaCall = vi.fn();
const assertProvider = vi.fn();
const listProviders = vi.fn();
vi.mock("../lib/core/client.js", () => ({
  mediaCall: (...a) => mediaCall(...a),
  assertProvider: (...a) => assertProvider(...a),
  listProviders: (...a) => listProviders(...a),
}));

const { tool: switchTool } = await import("../handlers/switch.js");

function ctx(session) {
  return { session, incidents: { add() {}, format: () => "" } };
}

beforeEach(() => {
  mediaCall.mockReset();
  assertProvider.mockReset();
});

describe("isolation par-session", () => {
  it("2 switches concurrents → chaque session garde SON provider", async () => {
    assertProvider.mockImplementation(async (p) => p);
    mediaCall.mockResolvedValue({ data: [{ id: "m" }] });
    const s1 = {};
    const s2 = {};
    await Promise.all([
      switchTool.handle({ provider: "grok" }, ctx(s1)),
      switchTool.handle({ provider: "alt" }, ctx(s2)),
    ]);
    expect(s1.provider).toBe("grok");
    expect(s2.provider).toBe("alt");
  });

  it("50 appels concurrents : aucune fuite de provider entre sessions", async () => {
    assertProvider.mockImplementation(async (p) => p);
    mediaCall.mockResolvedValue({ data: [] });
    const sessions = Array.from({ length: 50 }, () => ({}));
    await Promise.all(
      sessions.map((s, i) => switchTool.handle({ provider: i % 2 ? "alt" : "grok" }, ctx(s)))
    );
    sessions.forEach((s, i) => {
      expect(s.provider).toBe(i % 2 ? "alt" : "grok");
    });
  });
});
