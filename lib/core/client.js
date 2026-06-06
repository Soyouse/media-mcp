/**
 * Client média MULTI-PROVIDER — wrap `fetch` natif + throttle p-throttle (rate-limit par-clé).
 *
 * Moteur génératif (image / vidéo / voix / STT) derrière une abstraction SWAPPABLE (anti-lock-in) :
 * Grok/xAI aujourd'hui, Runware/autre demain — l'agent ne parle QU'AU MCP, jamais au fournisseur.
 *
 * ⚠️ xAI = API OpenAI-compatible → fetch natif (Node ≥22), pas de SDK lourd. Throttle p-throttle
 *    PAR api_key (Map), jamais partagé. NE PAS réinventer le limiteur. (bottleneck banni : mort 2019/CJS.)
 * ⚠️ Secrets rechargés À CHAUD depuis .secrets.json (watch mtime) — aucun restart au reset/rotate de clé.
 * ⚠️ api_key JAMAIS en dur, jamais committée (.secrets.json est gitignore).
 *
 * Auth provider : header `Authorization: Bearer <api_key>` (xAI / OpenAI-compatible). base_url par provider.
 *
 * Schéma .secrets.json (multi-provider) :
 *   { "default": "grok",
 *     "providers": { "grok": { "api_key": "...", "base_url": "https://api.x.ai/v1", "limit": 60, "interval": 60000 } } }
 * Rétrocompat (legacy mono) : { "api_key": "...", "base_url": "..." } → provider "default".
 *
 * Résolution du provider pour un appel (ordre) : opts.provider explicite > défaut de session > défaut secrets.
 * ⚠️ Le « défaut de session » vit dans ctx.session.provider (PAR-SESSION, build-server.js), JAMAIS un
 *    global de process : sinon il FUIT entre sessions HTTP concurrentes (2 agents → l'un écrase l'autre).
 */
import pThrottle from "p-throttle";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SECRETS_PATH =
  process.env.MEDIA_SECRETS_PATH || join(here, "..", "..", ".secrets.json");

// Débit par défaut si le provider ne le précise pas. xAI : ~60-300 req/min selon modèle → 60/min = plancher sûr.
const DEFAULT_LIMIT = Number(process.env.MEDIA_THROTTLE_LIMIT || 60);
const DEFAULT_INTERVAL = Number(process.env.MEDIA_THROTTLE_INTERVAL || 60_000);

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

// État rechargé à chaud. throttledByKey = Map<api_key, throttledFn> — 1 throttle par clé.
let providers = null; // { [id]: { api_key, base_url, limit?, interval? } }
let defaultProvider = null;
let loadedMtime = -1;
const throttledByKey = new Map();
// ⚠️ PAS d'état de session ICI. Le provider de session est PAR-SESSION (ctx.session.provider),
//    pas un global de process — sinon fuite entre sessions HTTP concurrentes (multi-agents).

/**
 * Normalise les deux schémas (multi-provider ET legacy mono) vers une forme unique.
 * ⚠️ Exporté pour test offline — ne touche AUCUN réseau.
 */
export function normalizeSecrets(raw) {
  if (raw && typeof raw === "object" && raw.providers && typeof raw.providers === "object") {
    const ids = Object.keys(raw.providers);
    if (ids.length === 0) throw new Error(".secrets.json : `providers` est vide");
    for (const id of ids) {
      const p = raw.providers[id];
      if (!p?.api_key) throw new Error(`.secrets.json : provider \`${id}\` sans api_key`);
      if (!p?.base_url) throw new Error(`.secrets.json : provider \`${id}\` sans base_url`);
    }
    const def = raw.default || ids[0];
    if (!raw.providers[def]) throw new Error(`.secrets.json : default \`${def}\` absent de providers`);
    return { providers: raw.providers, defaultProvider: def };
  }
  if (raw && typeof raw === "object" && raw.api_key && raw.base_url) {
    // legacy mono → provider "default"
    return {
      providers: { default: { api_key: raw.api_key, base_url: raw.base_url } },
      defaultProvider: "default",
    };
  }
  throw new Error(".secrets.json : ni `providers` ni `api_key`+`base_url` — format invalide");
}

async function loadSecrets() {
  const { mtimeMs } = await stat(SECRETS_PATH);
  if (mtimeMs !== loadedMtime) {
    const raw = JSON.parse(await readFile(SECRETS_PATH, "utf8"));
    const norm = normalizeSecrets(raw);
    providers = norm.providers;
    defaultProvider = norm.defaultProvider;
    loadedMtime = mtimeMs;
    // pas de purge des throttles : indexés par api_key, une clé inchangée garde sa fenêtre.
  }
}

/**
 * Résout l'id du provider à utiliser pour un appel (sans réseau).
 * Ordre : explicite > session (foldé par les handlers dans `requested`) > défaut secrets. Throw si inconnu.
 */
export function resolveProviderId(requested) {
  const id = requested || defaultProvider;
  if (!providers[id]) {
    const known = Object.keys(providers).join(", ");
    throw new Error(`Provider inconnu : ${id} (disponibles : ${known})`);
  }
  return id;
}

/** Fonction throttlée (p-throttle) pour une clé : limit appels / interval, en file (zéro perte).
 *  Wrappe un dispatcher générique → tous les appels d'une clé partagent la fenêtre. */
function getThrottled(apiKey, limit, interval) {
  let t = throttledByKey.get(apiKey);
  if (!t) {
    const throttle = pThrottle({
      limit: limit || DEFAULT_LIMIT,
      interval: interval || DEFAULT_INTERVAL,
    });
    t = throttle((verb, baseUrl, route, payload, key) => doFetch(verb, baseUrl, route, payload, key));
    throttledByKey.set(apiKey, t);
  }
  return t;
}

/**
 * Construit la requête HTTP (URL + options) — PUR, testable offline, aucun réseau.
 * ⚠️ Auth = `Authorization: Bearer <api_key>` (xAI / OpenAI-compatible).
 */
export function buildRequest(verb, baseUrl, route, payload, apiKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const options = { method: verb, headers };
  if (payload != null && verb !== "GET") options.body = JSON.stringify(payload);
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return { url: `${base}${route}`, options };
}

/** Exécute la requête (I/O fetch). Throw une erreur portant `.status` (lu par rate-monitor). */
async function doFetch(verb, baseUrl, route, payload, apiKey) {
  const { url, options } = buildRequest(verb, baseUrl, route, payload, apiKey);
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(`media ${verb} ${route} → HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/** Remet l'état à zéro (providers, mtime, throttles) — réservé aux tests. */
export function _resetClient() {
  providers = null;
  defaultProvider = null;
  loadedMtime = -1;
  throttledByKey.clear();
}

/** Liste les ids de providers configurés (offline). Recharge à chaud. */
export async function listProviders() {
  await loadSecrets();
  return { providers: Object.keys(providers), default: defaultProvider };
}

/** Valide qu'un provider existe (throw sinon). Le STOCKAGE du choix est PAR-SESSION
 *  (ctx.session.provider), jamais un global. Utilisé par media_switch_provider avant de committer. */
export async function assertProvider(id) {
  await loadSecrets();
  if (!providers[id]) {
    const known = Object.keys(providers).join(", ");
    throw new Error(`Provider inconnu : ${id} (disponibles : ${known})`);
  }
  return id;
}

/**
 * Appel brut à N'IMPORTE QUEL endpoint REST du provider (couverture 100 %).
 * @param {string} method GET|POST|PUT|PATCH|DELETE
 * @param {string} endpoint ex: "/images/generations" ou "/models"
 * @param {object} [payload] corps JSON (POST/PATCH/PUT)
 * @param {object} [opts] { provider } — id du provider ; défaut = session puis secrets.default
 */
export async function mediaCall(method, endpoint, payload, opts = {}) {
  const verb = String(method).toUpperCase();
  if (!METHODS.has(verb)) throw new Error(`Méthode non supportée : ${method}`); // ⚠️ AVANT secrets (testable offline)
  await loadSecrets();
  const id = resolveProviderId(opts.provider);
  const { api_key, base_url, limit, interval } = providers[id];
  const route = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const throttled = getThrottled(api_key, limit, interval);
  return throttled(verb, base_url, route, payload, api_key);
}
