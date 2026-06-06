import { describe, it, expect, vi, beforeEach } from "vitest";

// ⚠️ vi.hoisted s'exécute AVANT les imports → la var d'env est posée avant que client.js ne la lise.
//    Chemin relatif au cwd (racine repo pendant vitest) → résolu par stat/readFile sans absolu fragile.
vi.hoisted(() => {
  process.env.MEDIA_SECRETS_PATH = "tests/fixtures/secrets.test.json";
});

import {
  normalizeSecrets,
  resolveProviderId,
  buildRequest,
  mediaCall,
  listProviders,
  assertProvider,
  _resetClient,
} from "../lib/core/client.js";

beforeEach(() => {
  _resetClient();
  vi.unstubAllGlobals();
});

describe("normalizeSecrets", () => {
  it("multi-provider valide", () => {
    const r = normalizeSecrets({ default: "a", providers: { a: { api_key: "k", base_url: "u" } } });
    expect(r.defaultProvider).toBe("a");
    expect(r.providers.a.api_key).toBe("k");
  });
  it("default implicite = 1er provider", () => {
    const r = normalizeSecrets({ providers: { x: { api_key: "k", base_url: "u" }, y: { api_key: "k2", base_url: "u2" } } });
    expect(r.defaultProvider).toBe("x");
  });
  it("providers vide → throw", () => {
    expect(() => normalizeSecrets({ providers: {} })).toThrow(/vide/);
  });
  it("api_key manquant → throw", () => {
    expect(() => normalizeSecrets({ providers: { a: { base_url: "u" } } })).toThrow(/api_key/);
  });
  it("base_url manquant → throw", () => {
    expect(() => normalizeSecrets({ providers: { a: { api_key: "k" } } })).toThrow(/base_url/);
  });
  it("default absent des providers → throw", () => {
    expect(() => normalizeSecrets({ default: "z", providers: { a: { api_key: "k", base_url: "u" } } })).toThrow(/default/);
  });
  it("legacy mono → provider 'default'", () => {
    const r = normalizeSecrets({ api_key: "k", base_url: "u" });
    expect(r.defaultProvider).toBe("default");
    expect(r.providers.default.api_key).toBe("k");
    expect(r.providers.default.base_url).toBe("u");
  });
  it("format invalide → throw", () => {
    expect(() => normalizeSecrets({})).toThrow(/format invalide/);
    expect(() => normalizeSecrets(null)).toThrow(/format invalide/);
    expect(() => normalizeSecrets({ api_key: "k" })).toThrow(/format invalide/); // base_url manquant en mono
  });
});

describe("resolveProviderId", () => {
  beforeEach(async () => { await listProviders(); }); // charge les secrets fixture
  it("retourne l'id explicite", () => {
    expect(resolveProviderId("alt")).toBe("alt");
  });
  it("retourne le défaut si non précisé", () => {
    expect(resolveProviderId()).toBe("grok");
  });
  it("provider inconnu → throw", () => {
    expect(() => resolveProviderId("zzz")).toThrow(/inconnu/);
  });
});

describe("buildRequest", () => {
  it("GET : header Bearer, URL jointe, pas de body", () => {
    const { url, options } = buildRequest("GET", "https://api.x.ai/v1", "/models", undefined, "KEY");
    expect(url).toBe("https://api.x.ai/v1/models");
    expect(options.method).toBe("GET");
    expect(options.headers.Authorization).toBe("Bearer KEY");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.body).toBeUndefined();
  });
  it("POST : body JSON sérialisé", () => {
    const { options } = buildRequest("POST", "https://api.x.ai/v1", "/images/generations", { prompt: "x" }, "KEY");
    expect(options.body).toBe(JSON.stringify({ prompt: "x" }));
  });
  it("strip le slash final du base_url", () => {
    const { url } = buildRequest("GET", "https://api.x.ai/v1/", "/models", undefined, "KEY");
    expect(url).toBe("https://api.x.ai/v1/models");
  });
  it("POST sans payload → pas de body", () => {
    const { options } = buildRequest("POST", "u", "/x", undefined, "K");
    expect(options.body).toBeUndefined();
  });
});

describe("mediaCall", () => {
  it("méthode non supportée → throw AVANT tout réseau", async () => {
    await expect(mediaCall("FETCH", "/x")).rejects.toThrow(/non supportée/);
  });
  it("GET ok : URL + Bearer du provider par défaut", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ data: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const r = await mediaCall("GET", "/models");
    expect(r).toEqual({ data: [] });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/models");
    expect(opts.headers.Authorization).toBe("Bearer KEYG");
  });
  it("normalise un endpoint sans slash initial", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    await mediaCall("GET", "models");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.x.ai/v1/models");
  });
  it("provider explicite → base_url + clé du provider alt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "null" });
    vi.stubGlobal("fetch", fetchMock);
    await mediaCall("GET", "/models", undefined, { provider: "alt" });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://alt.example/v1/models");
    expect(opts.headers.Authorization).toBe("Bearer KEYA");
  });
  it("POST envoie le body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);
    await mediaCall("POST", "/images/generations", { prompt: "x" });
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ prompt: "x" }));
  });
  it("réponse non-ok → throw avec .status et .body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => JSON.stringify({ error: "bad" }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(mediaCall("GET", "/models")).rejects.toMatchObject({ status: 401, body: { error: "bad" } });
  });
});

describe("listProviders / assertProvider", () => {
  it("listProviders liste les ids + défaut", async () => {
    const r = await listProviders();
    expect(r.providers).toEqual(["grok", "alt"]);
    expect(r.default).toBe("grok");
  });
  it("assertProvider ok renvoie l'id", async () => {
    expect(await assertProvider("alt")).toBe("alt");
  });
  it("assertProvider inconnu → throw", async () => {
    await expect(assertProvider("zz")).rejects.toThrow(/inconnu/);
  });
});
