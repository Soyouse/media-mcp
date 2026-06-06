import { describe, it, expect, vi, beforeEach } from "vitest";

const mediaCall = vi.fn();
const listProviders = vi.fn();
const assertProvider = vi.fn();
vi.mock("../lib/core/client.js", () => ({
  mediaCall: (...a) => mediaCall(...a),
  listProviders: (...a) => listProviders(...a),
  assertProvider: (...a) => assertProvider(...a),
}));
const snapshot = vi.fn();
vi.mock("../lib/rate-monitor.js", () => ({ snapshot: (...a) => snapshot(...a) }));

const { tool: callTool } = await import("../handlers/call.js");
const { tool: discoverTool } = await import("../handlers/discover.js");
const { tool: healthTool } = await import("../handlers/health.js");
const { tool: switchTool } = await import("../handlers/switch.js");

function ctx(session = {}) {
  const all = [];
  return { session, incidents: { add: (l, m, meta) => all.push({ l, m, meta }), _all: all, format: () => "" } };
}

beforeEach(() => {
  mediaCall.mockReset();
  listProviders.mockReset();
  assertProvider.mockReset();
  snapshot.mockReset();
});

describe("media_call", () => {
  it("passe-plat : renvoie le JSON de la réponse", async () => {
    mediaCall.mockResolvedValue({ ok: 1 });
    const out = await callTool.handle({ method: "GET", endpoint: "/models" }, ctx());
    expect(mediaCall).toHaveBeenCalledWith("GET", "/models", undefined, { provider: undefined });
    expect(out).toContain('"ok": 1');
  });
  it("précédence : provider explicite > session", async () => {
    mediaCall.mockResolvedValue({});
    await callTool.handle({ method: "POST", endpoint: "/x", payload: { a: 1 }, provider: "alt" }, ctx({ provider: "grok" }));
    expect(mediaCall).toHaveBeenCalledWith("POST", "/x", { a: 1 }, { provider: "alt" });
  });
  it("utilise le provider de session si pas d'explicite", async () => {
    mediaCall.mockResolvedValue({});
    await callTool.handle({ method: "GET", endpoint: "/x" }, ctx({ provider: "grok" }));
    expect(mediaCall).toHaveBeenCalledWith("GET", "/x", undefined, { provider: "grok" });
  });
  it("réponse null → {ok:true}", async () => {
    mediaCall.mockResolvedValue(null);
    const out = await callTool.handle({ method: "GET", endpoint: "/x" }, ctx());
    expect(out).toContain('"ok": true');
  });
  it("erreur → incident error + rethrow", async () => {
    const err = Object.assign(new Error("boom"), { status: 500 });
    mediaCall.mockRejectedValue(err);
    const c = ctx();
    await expect(callTool.handle({ method: "GET", endpoint: "/x" }, c)).rejects.toBe(err);
    expect(c.incidents._all[0].l).toBe("error");
    expect(c.incidents._all[0].meta).toEqual({ status: 500 });
  });
});

describe("media_discover", () => {
  it("résumé : catégories avec counts, sans les clés _", async () => {
    const j = JSON.parse(await discoverTool.handle({}));
    expect(j.categories.image).toContain("endpoints");
    expect(j.categories.video).toBeDefined();
    expect(j.categories.models).toBeDefined();
    expect(j.categories._note).toBeUndefined();
    expect(j.categories._todo).toBeUndefined();
  });
  it("{category} → détail des endpoints", async () => {
    const j = JSON.parse(await discoverTool.handle({ category: "image" }));
    expect(j.image[0].path).toBe("/images/generations");
  });
  it("catégorie insensible à la casse", async () => {
    const j = JSON.parse(await discoverTool.handle({ category: "IMAGE" }));
    expect(j.image).toBeDefined();
  });
  it("catégorie inconnue → message", async () => {
    const out = await discoverTool.handle({ category: "zzz" });
    expect(out).toContain("Catégorie inconnue");
  });
});

describe("media_health", () => {
  it("renvoie providers + sessionProvider + rateLimit", async () => {
    listProviders.mockResolvedValue({ providers: ["grok"], default: "grok" });
    snapshot.mockReturnValue({ warn: false });
    const j = JSON.parse(await healthTool.handle({}, ctx({ provider: "grok" })));
    expect(j.ok).toBe(true);
    expect(j.providers.providers).toEqual(["grok"]);
    expect(j.sessionProvider).toBe("grok");
    expect(j.rateLimit).toEqual({ warn: false });
  });
  it("sessionProvider null sans session.provider", async () => {
    listProviders.mockResolvedValue({ providers: [], default: null });
    snapshot.mockReturnValue({});
    const j = JSON.parse(await healthTool.handle({}, ctx()));
    expect(j.sessionProvider).toBe(null);
  });
});

describe("media_switch_provider", () => {
  it("sans argument → liste providers + session", async () => {
    listProviders.mockResolvedValue({ providers: ["grok", "alt"], default: "grok" });
    const j = JSON.parse(await switchTool.handle({}, ctx({ provider: "alt" })));
    expect(j.providers).toEqual(["grok", "alt"]);
    expect(j.default).toBe("grok");
    expect(j.session).toBe("alt");
  });
  it("bascule : assert + GET /models + committe la session", async () => {
    assertProvider.mockResolvedValue("grok");
    mediaCall.mockResolvedValue({ data: [{ id: "a" }, { id: "b" }] });
    const c = ctx();
    const out = await switchTool.handle({ provider: "grok" }, c);
    expect(assertProvider).toHaveBeenCalledWith("grok");
    expect(mediaCall).toHaveBeenCalledWith("GET", "/models", undefined, { provider: "grok" });
    expect(c.session.provider).toBe("grok");
    expect(out).toContain("« grok »");
    expect(out).toContain("2 modèles");
  });
  it("échec /models → incident warn + throw + PAS de commit", async () => {
    assertProvider.mockResolvedValue("grok");
    const err = Object.assign(new Error("401"), { status: 401 });
    mediaCall.mockRejectedValue(err);
    const c = ctx();
    await expect(switchTool.handle({ provider: "grok" }, c)).rejects.toBe(err);
    expect(c.session.provider).toBeUndefined();
    expect(c.incidents._all[0].l).toBe("warn");
  });
  it("count '?' si data n'est pas un tableau", async () => {
    assertProvider.mockResolvedValue("grok");
    mediaCall.mockResolvedValue({});
    const out = await switchTool.handle({ provider: "grok" }, ctx());
    expect(out).toContain("? modèles");
  });
});
