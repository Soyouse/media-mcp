/**
 * Outil `media_switch_provider` — multiplexeur multi-provider (anti-lock-in : Grok→Runware…).
 *
 * ⚠️ Sans `provider` : liste les moteurs disponibles + le provider actif de CETTE session (ne change rien).
 * ⚠️ Avec `provider` : vérifie par GET /models (clé valide) PUIS, sur succès, pose le défaut de
 *    SESSION (ctx.session.provider) → renvoie le nb de modèles (anti-hallucination : on prouve, on ne suppose pas).
 * ⚠️ État de session PAR-SESSION (ctx.session) — JAMAIS global : sinon il fuit entre agents HTTP concurrents.
 */
import { listProviders, assertProvider, mediaCall } from "../lib/core/client.js";

// Stryker disable all : métadonnée déclarative (description/schema) — aucun contrat comportemental.
export const tool = {
  name: "media_switch_provider",
  description:
    "Sélectionne le provider média actif (moteur de génération) pour les appels suivants. Sans argument : " +
    "liste les providers disponibles. Avec {provider} : bascule + confirme la clé (GET /models).",
  inputSchema: {
    type: "object",
    properties: {
      provider: { type: "string", description: "Id du moteur à activer (ex: grok)" },
    },
  },
  // Stryker restore all
  async handle(args, ctx) {
    const { provider } = args;
    if (!provider) {
      const state = await listProviders();
      return JSON.stringify(
        { providers: state.providers, default: state.default, session: ctx.session?.provider ?? null },
        null,
        2
      );
    }
    await assertProvider(provider); // existe ? (throw AVANT réseau si inconnu)
    try {
      const models = await mediaCall("GET", "/models", undefined, { provider });
      // Clé PROUVÉE → on committe le provider SUR LA SESSION (jamais sur un global).
      if (ctx.session) ctx.session.provider = provider;
      const count = Array.isArray(models?.data) ? models.data.length : "?";
      return `Provider actif : « ${provider} » (${count} modèles disponibles)`;
    } catch (e) {
      // clé non vérifiable → on NE committe PAS le switch → incident, on remonte
      ctx.incidents.add("warn", `switch ${provider} : GET /models a échoué → ${e.message}`, {
        status: e.status ?? null,
      });
      throw e;
    }
  },
};
