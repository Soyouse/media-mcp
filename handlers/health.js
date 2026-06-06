/**
 * Outil `media_health` — observabilité du service (healthcheck + drapeau orange quota).
 *
 * ⚠️ Zéro réseau : renvoie les providers configurés + la fenêtre glissante des réponses invalides
 *    (401/403/429) par provider. `warn:true` = trop d'invalides (throttle/quota/crédit/auth).
 */
import { listProviders } from "../lib/core/client.js";
import { snapshot } from "../lib/rate-monitor.js";

// Stryker disable all : métadonnée déclarative (description/schema) — aucun contrat comportemental.
export const tool = {
  name: "media_health",
  description:
    "État du service : providers configurés, provider actif de session, et compteur glissant des " +
    "réponses invalides (401/403/429) par provider. warn=true signale un risque quota/crédit/auth.",
  inputSchema: { type: "object", properties: {} },
  // Stryker restore all
  async handle(args, ctx) {
    const providers = await listProviders();
    // provider actif = celui de CETTE session (par-session, pas un global partagé).
    const sessionProvider = ctx?.session?.provider ?? null;
    return JSON.stringify(
      { ok: true, providers, sessionProvider, rateLimit: snapshot() },
      null,
      2
    );
  },
};
