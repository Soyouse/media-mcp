/**
 * Smoke live — prouve la clé xAI + le pipeline génération. HORS gate (script manuel).
 * Usage : node scripts/smoke-live.mjs
 * Lit .secrets.json (provider grok). Coût : GET /models = 0 ; 1 image ≈ 0,02$.
 */
import { mediaCall } from "../lib/core/client.js";

const models = await mediaCall("GET", "/models");
const ids = (models?.data || []).map((m) => m.id);
console.log("=== MODELS (" + ids.length + ") ===");
console.log(ids.join(", "));

const imageModel = ids.find((id) => /image/i.test(id)) || "grok-imagine-image";
console.log("\n=== IMAGE GEN avec model:", imageModel, "===");
try {
  const img = await mediaCall("POST", "/images/generations", {
    model: imageModel,
    prompt: "minimalist logo mockup on a clean white desk, soft studio lighting, photorealistic",
    n: 1,
    response_format: "url",
  });
  const out = img?.data?.[0]?.url || JSON.stringify(img).slice(0, 400);
  console.log("OK →", out);
  console.log("usage:", JSON.stringify(img?.usage || {}));
} catch (e) {
  console.log("ERREUR image:", e.message, "| body:", JSON.stringify(e.body).slice(0, 300));
}
