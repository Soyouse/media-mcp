/**
 * Outil `media_call` — passe-plat brut. Couverture API du provider 100 %.
 *
 * ⚠️ Aucun endpoint n'est "wrappé" → rien à oublier, rien ne plafonne.
 * Le throttle par-clé (p-throttle) est géré par client.js sous le capot.
 */
import { mediaCall } from "../lib/core/client.js";

// Stryker disable all : métadonnée déclarative (description/schema) — aucun contrat comportemental.
export const tool = {
  name: "media_call",
  description:
    "Appel brut à n'importe quel endpoint REST du provider média actif (Grok/xAI par défaut, OpenAI-compatible). " +
    "Couverture 100 %. Utiliser media_discover pour le catalogue (génération image/vidéo/voix). " +
    "Le provider actif (media_switch_provider) est appliqué automatiquement.",
  inputSchema: {
    type: "object",
    properties: {
      method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
      endpoint: { type: "string", description: "Chemin API, ex: /images/generations ou /models" },
      payload: { type: "object", description: "Corps JSON optionnel (POST/PATCH/PUT)" },
      provider: {
        type: "string",
        description:
          "Provider à utiliser (id du moteur). Optionnel : défaut = provider de session (media_switch_provider) puis défaut secrets.",
      },
    },
    required: ["method", "endpoint"],
  },
  // Stryker restore all
  async handle(args, ctx) {
    const { method, endpoint, payload, provider } = args;
    // Précédence : `provider` explicite de l'appel > provider de session > défaut secrets.
    const effectiveProvider = provider ?? ctx.session?.provider ?? undefined;
    try {
      const res = await mediaCall(method, endpoint, payload, { provider: effectiveProvider });
      return JSON.stringify(res ?? { ok: true }, null, 2);
    } catch (e) {
      ctx.incidents.add("error", `${method} ${endpoint} → ${e.message}`, {
        status: e.status ?? null,
      });
      throw e;
    }
  },
};
