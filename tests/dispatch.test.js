import { describe, it, expect, vi, beforeEach } from "vitest";

const recordResult = vi.fn();
vi.mock("../lib/rate-monitor.js", () => ({ recordResult: (...a) => recordResult(...a) }));

let registryMap;
vi.mock("../lib/registry.js", () => ({ loadRegistry: async () => registryMap }));

const { handleTool, listTools, monitorInvalidResponses } = await import("../dispatch.js");

beforeEach(() => recordResult.mockClear());

describe("handleTool", () => {
  it("outil inconnu → throw", async () => {
    registryMap = new Map();
    await expect(handleTool("nope", {}, {})).rejects.toThrow(/inconnu/);
  });
  it("exécute le handler et appende le format incidents (succès)", async () => {
    registryMap = new Map([["ok", { name: "ok", handle: async () => "RESULT" }]]);
    const out = await handleTool("ok", {}, {});
    expect(out).toContain("RESULT");
    expect(out).toContain("Aucun incident");
  });
  it("passe args et ctx (incidents + session) au handler", async () => {
    let seen;
    registryMap = new Map([["ok", { name: "ok", handle: async (a, ctx) => { seen = { a, hasInc: !!ctx.incidents, sess: ctx.session }; return "x"; } }]]);
    const session = { provider: "grok" };
    await handleTool("ok", { foo: 1 }, session);
    expect(seen.a).toEqual({ foo: 1 });
    expect(seen.hasInc).toBe(true);
    expect(seen.sess).toBe(session);
  });
  it("handler qui throw → message enrichi des incidents + rethrow", async () => {
    registryMap = new Map([["bad", { name: "bad", handle: async (a, ctx) => { ctx.incidents.add("error", "x"); throw new Error("KO"); } }]]);
    await expect(handleTool("bad", {}, {})).rejects.toThrow(/KO[\s\S]*Incidents/);
  });
});

describe("listTools", () => {
  it("projette name/description/inputSchema uniquement", async () => {
    registryMap = new Map([["ok", { name: "ok", description: "D", inputSchema: { type: "object" }, handle: async () => "", secret: 1 }]]);
    const tools = await listTools();
    expect(tools).toEqual([{ name: "ok", description: "D", inputSchema: { type: "object" } }]);
  });
});

describe("monitorInvalidResponses", () => {
  it("enregistre le status numérique sur throw, puis rethrow", async () => {
    const err = Object.assign(new Error("e"), { status: 429 });
    const wrapped = monitorInvalidResponses(async () => { throw err; });
    await expect(wrapped({ provider: "grok" }, {})).rejects.toBe(err);
    expect(recordResult).toHaveBeenCalledWith("grok", 429);
  });
  it("ne record pas si status non numérique", async () => {
    const wrapped = monitorInvalidResponses(async () => { throw new Error("plain"); });
    await expect(wrapped({}, {})).rejects.toThrow("plain");
    expect(recordResult).not.toHaveBeenCalled();
  });
  it("laisse passer le succès sans rien enregistrer", async () => {
    const wrapped = monitorInvalidResponses(async () => "OK");
    expect(await wrapped({}, {})).toBe("OK");
    expect(recordResult).not.toHaveBeenCalled();
  });
});
