/**
 * Monitor des réponses invalides (401/403/429) — observabilité quota/auth.
 *
 * ⚠️ POURQUOI : les providers média plafonnent par-clé (xAI : ~60-300 req/min selon modèle). p-throttle
 *    (client.js) lisse le débit en amont, mais on compte quand même les 429 (limite atteinte malgré tout)
 *    et 401/403 (clé invalide / crédit épuisé) en fenêtre glissante, par provider, pour repérer un souci
 *    AVANT qu'il ne bloque la prod.
 * ⚠️ État module-global ASSUMÉ ICI : métriques agrégées (par nature globales au process), PAS de l'état
 *    par-appel (cf incidents.js qui, lui, DOIT rester scopé). Ne pas confondre.
 * ⚠️ Horloge injectable (now) → tests déterministes, jamais de flake temporel.
 */
const INVALID = new Set([401, 403, 429]);
const WINDOW_MS = 60 * 1000; // fenêtre glissante 1 min
const SOFT_LIMIT = 60; // débit nominal plancher (req/min/clé)
const WARN_RATIO = 0.4; // alerte si ≥40% de la fenêtre part en réponses invalides

let events = []; // [{ ts, provider, status }]

/** Enregistre une réponse SI elle est invalide (401/403/429). No-op sinon. */
export function recordResult(provider, status, now = Date.now) {
  if (!INVALID.has(status)) return;
  events.push({ ts: now(), provider: provider || "(défaut)", status });
}

function prune(t) {
  const cutoff = t - WINDOW_MS;
  if (events.length && events[0].ts < cutoff) {
    events = events.filter((e) => e.ts >= cutoff);
  }
}

/** Photo de la fenêtre glissante : total, par provider, et alerte si trop d'invalides. */
export function snapshot(now = Date.now) {
  const t = now();
  prune(t);
  const perProvider = {};
  for (const e of events) perProvider[e.provider] = (perProvider[e.provider] || 0) + 1;
  const total = events.length;
  return {
    windowMinutes: WINDOW_MS / 60000,
    invalidTotal: total,
    perProvider,
    softLimit: SOFT_LIMIT,
    warn: total >= SOFT_LIMIT * WARN_RATIO,
  };
}

/** Remise à zéro — réservé aux tests. */
export function _reset() {
  events = [];
}
