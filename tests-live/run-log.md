# Run-log — tests live media-mcp (Grok/xAI)

Journal des générations de test. 1 entrée = 1 image (params exacts + coût réel mesuré + verdict).
Script : `tests-live/face-edit.mjs` (arg `1k|2k`). Pipeline = PROD réel (`mediaCall` → `/images/edits`).
Coût lu via `usage.cost_in_usd_ticks` (1$ = 10 000 000 000 ticks). Erreur syntaxe = HTTP 400 = 0$.

---

## TEST #1 — Template #4 (humain réaliste), VALIDÉ ✅

**Date** : 2026-06-07T18:55Z
**But** : prouver que le canal `/images/edits` + template #4 produit un visage ressemblant ET anti-slop.

**Params exacts** (reproductibles) :
- endpoint : `POST /v1/images/edits`
- model : `grok-imagine-image-quality`
- images[] : `[face=20260420_204604.jpg, profil=20260420_204612.jpg]` en base64 data-URI (ordre = lien, PAS de @imageN)
- aspect_ratio : `3:4` · resolution : `1k` · response_format : `b64_json`
- prompt : template #4 rempli, scénario "fondateur en café" (portrait chest-up, 35mm, dof shallow, lumière fenêtre, grade Portra-400, socle anti-slop LOOK+AVOID, fidélité visage). Prompt complet archivé dans `face-edit.mjs` (const PROMPT).

**Résultat mesuré** :
- coût RÉEL : **0,0700$** (ticks=700000000) — xAI ne facture PAS le double input/output
- sortie : `D:\Screenshots\grok-test-1k-2026-06-07T18-55-23-666Z.png` (+ copie `Downloads\grok-tests\`)
- dimensions : 864×1152 (1k vertical)

**Verdict** :
- Ressemblance : **7,5/10** (jugé IA, comparé à la réf face) — reconnaissable, identité tient ; l'IA idéalise légèrement (visage aminci/plus net que la réf). Blocage deepfake définitivement écarté.
- Anti-slop : **9/10** — grain film, lumière fenêtre naturelle, bokeh café crédible, texture peau présente, zéro plastique. Le template #4 sort totalement du slop.
- **Verdict humain (Théo)** : QUALITÉ VALIDÉE ✅. Position actée : 1 bon tirage + prompt complet = preuve suffisante (variance qualité d'un modèle moderne = faible ; le vrai levier = le prompt, jugé complet et template exploité au max).

**Conclusion** : plomberie MCP→API→image + syntaxe + coût = PROUVÉS A-à-Z. Anti-slop = excellent.
**Non encore testés** : 2k (résolution feed prod), 3ᵉ réf, types #2 scène / #3 produit, autres scénarios.

### ⚠️ RÉVISION 2026-06-08 — ressemblance requalifiée
Le verdict « qualité validée » ci-dessus est **revu**. Théo, avec recul : **« ne me ressemble pas assez »** (vu mieux sur d'autres API). **Causes identifiées :**
1. **Seulement 2 réfs sur 3** — la vue de dessus (`...628.jpg`) a été **jetée à tort** (croyance « inutile en 2D » = FAUSSE ; Grok agrège des indices d'identité, chaque vue ajoute de la géométrie).
2. **Résolution 1k** (pas 2k) → moins de détail facial.
3. **Grok faible en identity-preservation** (aucun param face-consistency, levier = prompt only) → peut-être insuffisant tout court.
**Action** : refaire un test **2k + 3 réfs (face+profil+dessus)** avec dataset enrichi AVANT toute validation. Si insuffisant → **swap provider** (modèle visage dédié, archi anti-lock-in). **Règle gravée : toujours passer TOUTES les vues du `dataset.json`, jamais en écarter une sur intuition.**
