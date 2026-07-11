/**
 * Test LIVE #4 (humain réaliste) — pipeline PROD réel via mediaCall (jamais un bricolage).
 * Applique le template #4 (agent-social) : /images/edits + 2 réfs visage (face[0], profil[1]).
 * ⚠️ PAS de @imageN (= UI Imagine, pas l'API) → réfs reliées par l'ORDRE + langage naturel.
 *
 * Usage : node tests-live/face-edit.mjs [1k|2k]   (défaut 1k = moins cher pour valider la ressemblance)
 * Sortie : PNG horodaté dans D:/Screenshots + ligne dans tests-live/run-log.md + coût RÉEL mesuré.
 * Coût : erreur de syntaxe = HTTP 400 = 0$ (on ne paie que l'image générée).
 */
import { mediaCall } from "../lib/core/client.js";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const RESOLUTION = (process.argv[2] || "1k").toLowerCase();
const DATASET = process.env.FACE_DATASET_DIR || "./tests-live/dataset";
const SHOTS = process.env.SHOTS_DIR || "./tests-live/out";
const RUNLOG = new URL("./run-log.md", import.meta.url);

// ⚠️ RÈGLE (apprise du test #1) : TOUJOURS passer toutes les vues dispo, jamais en écarter une sur intuition.
// Grok agrège des indices d'identité — chaque vue (face/profil/DESSUS) ajoute de la géométrie.
// Le test #1 avait jeté la vue de dessus (628) en croyant « inutile en 2D » → ressemblance dégradée. À ne PLUS refaire.
// max 3 réfs côté Grok → on passe les 3.
const FACE = join(DATASET, "20260420_204604.jpg");
const PROFIL = join(DATASET, "20260420_204612.jpg");
const DESSUS = join(DATASET, "20260420_204628.jpg");

const PROMPT =
  "Candid chest-up portrait of the same person shown in the reference photos. " +
  "SUBJECT: relaxed, sitting slightly forward at a cafe table, focused yet glancing up, gaze to camera, " +
  "short dark hair, light stubble beard, plain dark crewneck sweater, hands resting near an open laptop. " +
  "FRAMING: eye-level angle, 35mm lens, shallow depth of field, subject placed on the left third. " +
  "ENVIRONMENT: cozy specialty coffee shop; foreground a flat white cup and the laptop edge; " +
  "midground a wooden table with a small blurred plant; background warm bokeh of the cafe and a bright window; " +
  "relaxed late-morning atmosphere; calm confident mood. " +
  "LIGHT: large window daylight, side direction, soft, warm temperature. " +
  "LOOK: shot on iPhone, natural skin texture with visible pores and real grain, fine film grain, " +
  "slightly imperfect candid framing, real spontaneous moment, no AI gloss. Warm Portra-400 film grade, vertical. " +
  "Keep facial features STRICTLY faithful to the reference photos (same identity, bone structure, beard, hairline). " +
  "AVOID: plastic smooth skin, waxy glossy eyes, perfect symmetry, airbrushed look, fake background blur, " +
  "oversaturated colors, stock-photo posing, HDR halo, text, captions, logos, watermark, distorted hands or face, extra unwanted people.";

const toDataUri = async (p) =>
  `data:image/jpeg;base64,${(await readFile(p)).toString("base64")}`;

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

console.log("=== ÉTAPE 0 : GET /models (gratuit, prouve la clé) ===");
const models = await mediaCall("GET", "/models");
const ids = (models?.data || []).map((m) => m.id);
console.log("Modèles:", ids.join(", ") || "(aucun)");
const hasQuality = ids.some((id) => /quality/i.test(id));
console.log("grok-imagine-image-quality présent côté API:", hasQuality ? "OUI ✅" : "NON ⚠️ (on tente quand même)");

console.log(`\n=== ÉTAPE 1 : /images/edits — model=quality resolution=${RESOLUTION} ===`);
const payload = {
  model: "grok-imagine-image-quality",
  prompt: PROMPT,
  images: [
    { type: "image_url", url: await toDataUri(FACE) },
    { type: "image_url", url: await toDataUri(PROFIL) },
    { type: "image_url", url: await toDataUri(DESSUS) },
  ],
  aspect_ratio: "3:4",
  resolution: RESOLUTION,
  response_format: "b64_json",
};

try {
  const res = await mediaCall("POST", "/images/edits", payload);
  const item = res?.data?.[0] || {};
  const ticks = res?.usage?.cost_in_usd_ticks ?? null;
  const usd = ticks != null ? (ticks / 1e10).toFixed(4) : "?";
  const ts = stamp();

  let outPath = null;
  if (item.b64_json) {
    await mkdir(SHOTS, { recursive: true });
    outPath = join(SHOTS, `grok-test-${RESOLUTION}-${ts}.png`);
    await writeFile(outPath, Buffer.from(item.b64_json, "base64"));
  }

  console.log("OK ✅");
  console.log("Image:", outPath || item.url || "(ni b64 ni url ?)");
  console.log("mime:", item.mime_type || "?");
  console.log(`COÛT RÉEL: ${usd}$  (ticks=${ticks})`);

  await appendFile(
    RUNLOG,
    `\n## ${ts} — edits quality ${RESOLUTION} (3:4, face+profil)\n` +
      `- coût: **${usd}$** (ticks=${ticks})\n` +
      `- sortie: \`${outPath || item.url}\`\n` +
      `- verdict humain: [ À REMPLIR : ressemblance ? slop ? ]\n`,
    "utf8"
  );
  console.log("\nrun-log mis à jour. → juge l'image dans D:/Screenshots");
} catch (e) {
  console.log("ERREUR:", e.message);
  console.log("status:", e.status, "| body:", JSON.stringify(e.body).slice(0, 600));
  console.log("→ Si HTTP 400 = syntaxe rejetée = 0$ facturé. Le body dit quoi corriger.");
}
