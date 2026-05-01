# CafeHTML — Agentic Pipeline Design Spec
**Date:** 2026-04-20
**Status:** Approved for implementation planning

---

## What This Solves

The current generation pipeline is broken in 15 of 23 logged ways. The enhanced prompt never reaches fal.ai. The enhancer receives pre-compiled text instead of the user's actual words. STYLE images are never scanned. Global references have no vision descriptions. The module hierarchy is destroyed before any AI sees it. Two competing systems (compilePrompt and the enhancer) do overlapping jobs with no coordination.

This spec defines the surgical fixes and new additions that resolve all 15 issues in one pass — without rebuilding the entire application.

---

## Guiding Principles

- **No new files unless necessary.** The existing architecture already has the right shape. Fix what's broken, extend what's incomplete.
- **No junk code left behind.** Dead code (compilePrompt, SUBJECT_ROLES, STAGE_ROLES) is removed when replaced.
- **Flexible, not rigid.** The CafeEntities registry describes the system — it doesn't enforce contracts yet.
- **Pipeline, not event-driven.** Fixed sequence, predictable, easy to debug. Event-driven is a future upgrade.
- **Vision scans are cached.** Re-scan only when the image changes. Never re-scan unchanged images on generate.

---

## The Generation Pipeline (New)

```
User clicks Generate
  │
  ├─ 1. Vision Agent        scan any images without a cached description
  │                         skip images where imgUrl matches visionSrc (cache hit)
  │
  ├─ 2. Manifest Builder    assemble ordered image list with descriptions + slot labels
  │                         order: Global Refs (R1–R5) → SUBJECT → STAGE → STYLE
  │
  ├─ 3. Creative Director   read manifest + raw user prompt text
  │                         write generation brief for nano-banana-2
  │                         return { prompt, manifest }
  │
  ├─ 4. Provider Adapter    route final prompt + image URLs to fal.ai or Google
  │                         both providers receive the same finalPrompt
  │
  └─ 5. Gallery             receive cell, attach manifest, display, save to IndexedDB
```

Empty state rule: if no images exist anywhere (no module images, no refs), skip Vision Agent and Manifest Builder. Pass raw user text directly to Creative Director.

---

## Component Registry

All components register on `window.CafeEntities` when they initialise. Nothing calls blind `window.X` globals directly from logic files.

```js
window.CafeEntities = {
  gallery:   null,
  modules:   null,
  promptBar: null,
  settings:  null,
  workspace: null,
  pipeline:  null
};
```

**Intentionally flexible.** No enforced interface yet. Components register when ready, describe themselves, and that's it. This is the foundation — contracts come later as the system matures.

The ARCHITECTURE.md file is the human-readable registry. Each component is documented there with its purpose, interface, and dependencies.

---

## Fix 1 — Vision Agent (`logic/vision.js`)

### What changes
- `maxOutputTokens`: 256 → 512
- Add `STYLE_PROMPTS` — "Describe the visual style, artistic treatment, colour palette, and rendering quality. Cover: photographic vs illustrated, colour grading, texture, lighting style, and mood."
- Add `describeRef(base64DataUrl)` — full Subject + Scene + Style scan for global reference images. Prompt: "Describe everything in this image that would help reconstruct it: the subject (if any), the environment, the lighting, the colour palette, the mood, and the visual style."
- Add `describeStyle(base64DataUrl)` — calls STYLE_PROMPTS scan
- Cache validation: store last scanned URL on the child element as `data-vision-src`. On next scan, compare current `imgUrl` to `data-vision-src`. If they match, skip — return cached `data-vision-desc` immediately.

### PRECISE / CREATIVE threading
- PRECISE mode: append "Be exact and specific. Prioritise measurable details over mood." to every scan prompt.
- CREATIVE mode: append "Prioritise mood, feeling, and artistic impression over exact detail." to every scan prompt.
- `outputType` passed into `describe()`, `describeRef()`, `describeStyle()` as a parameter.

### What stays the same
- `SUBJECT_PROMPTS` and `STAGE_PROMPTS` — already correct, no changes needed
- API call structure — already correct
- `describe(base64DataUrl, layerName, section)` signature — extended with optional `outputType` param

---

## Fix 2 — Manifest Builder (`logic/enhancer.js` — `collectImageContext()`)

### What changes
- Add slot label to each manifest entry: `{ position, role, slot, layerName, section, desc }`
  - `slot` = "A", "B", "C" etc. (from `slot.label`)
  - `section` = "subject", "stage", "style", "ref"
- Refs: look up description from `window.refVisionCache[imgUrl]` instead of `desc: null`
- Style: call `VisionScan.describeStyle()` if no cached description, or read from style slot state
- Multiple images in same layer: label as "Image 1 of 3 — same subject, different angle" in the desc prefix

### Manifest entry shape
```js
{
  position:  1,              // image number (1-indexed, matches API array position)
  role:      'CHARACTER',    // layer name
  slot:      'A',            // slot label
  section:   'subject',      // which module section
  desc:      'lean woman...' // vision scan result, or null if scan failed
}
```

### Image ordering rule (fixed, never changes)
1. Global Refs in chip order (R1, R2, R3...)
2. SUBJECT — active slots in order (A→G), layers in order, children in order
3. STAGE — same
4. STYLE — active slot image (if mode = image and linked)

---

## Fix 3 — Creative Director (`logic/enhancer.js` — `buildSystemPrompt()` + `enhance()`)

### What changes

**Fix user intent input:**
- `enhance(payload, compiledPrompt)` → `enhance(payload)`
- User intent = `payload.prompt` (raw text from prompt bar), not the compiled string
- If `payload.prompt` is empty, user intent = "(none)"

**Fix system prompt — Creative Director knows CafeHTML:**
```
You are the Creative Director for an AI image generation system called CafeHTML.

The system works like this:
- Users build scenes using structured modules: SUBJECT (who/what), STAGE (where/when), STYLE (how it looks)
- Each module has slots (A, B, C...) — slots in the same section are INDEPENDENT (different characters, not the same character)
- Multiple images in the same layer are the SAME subject from different angles
- Reference images are sent to the generation model numbered by position
- The generation model is nano-banana-2, which follows this formula: Subject → Scene → Style

Your job: read the image manifest and the user's intent, then write ONE generation brief.
The brief must reference images by their position number where relevant.
Output ONLY the brief. No labels, no explanation, no preamble.
```

**PRECISE mode instructions:**
```
PRECISE: Lock every reference exactly as described. Match faces, outfits, environments with no deviation.
Prioritise accuracy over composition. Do not invent details not present in the references.
```

**CREATIVE mode instructions:**
```
CREATIVE: Treat references as creative inspiration, not strict rules. Blend loosely.
Allow the generation model to interpret, recompose, and add artistic direction.
Mood and feeling matter more than exact matching.
```

**Fix return value:**
- Currently returns plain string
- Now returns `{ prompt: string, manifest: array }`
- `manifest` is the `imageContext` array built by `collectImageContext()`

**Fix maxOutputTokens:** 512 → 1024

---

## Fix 4 — Generation API (`logic/api.js`)

### Dead code to remove
- `SUBJECT_ROLES` object — no longer used
- `STAGE_ROLES` object — no longer used
- `compilePrompt()` function — replaced by Manifest Builder + Creative Director
- `processSection()` inside compilePrompt — removed with compilePrompt

### What changes

**`buildPayload(model, payload, finalPrompt)`**
- Add `finalPrompt` as a parameter — stop calling `compilePrompt()` internally
- Use `finalPrompt` for all providers (fal.ai and Google)

**`generate()`**
- Call `enhance(payload)` — no longer passes compiled string
- Read result as `{ prompt: finalPrompt, manifest }` instead of plain string
- fal.ai path: use `finalPrompt` (currently uses `compiled`)
- Google path: already uses `finalPrompt` ✓
- fal.ai gallery cell: `prompt: finalPrompt` (currently saves `compiled`)
- Attach manifest to cell: `cell.manifest = manifest`
- Empty state: if `payload.refs.length === 0` and no images in any module, skip enhancer entirely, use `payload.prompt` directly

**`collectLayerImageUrls()`** — keep unchanged, still needed for building the image URL array

### Provider unification
Both fal.ai and Google now receive:
- Same `finalPrompt` from Creative Director
- Same ordered image array from `collectLayerImageUrls()` + refs

---

## Fix 5 — STYLE Vision Scan + Global Ref Scan (`CafeHTML-v2.html`)

### STYLE scan
- Find `mpStyInput` file input handler (where style images are uploaded)
- After image loads into `slotStates[selected].imgUrl`, call `VisionScan.describeStyle()`
- Store result in `slotStates[selected].visionDesc`
- Manifest Builder reads `sSlot.visionDesc` when building the style manifest entry

### Global Ref scan
- Find the ref chip upload handler (where `refState[mode]` is populated)
- After image loads, call `VisionScan.describeRef(base64DataUrl)`
- Store result in `window.refVisionCache[imgUrl]`
- `collectImageContext()` reads from `refVisionCache` when building ref manifest entries

### Vision scan UI feedback (issue 17)
- When scan starts: add `data-scanning="true"` to the layer child element (`.clr`)
- When scan completes or fails: remove `data-scanning` attribute
- CSS handles the visual indicator — a subtle pulse or border state on the child element
- On failure: store `data-vision-desc=""` (empty string, not null) — signals "scan attempted, nothing returned"

---

## Fix 6 — Manifest Saved with Gallery Cell (`logic/workspace.js`)

### What changes
- `hookGallery()` DB save: add `manifest: cell.manifest || null` to the saved object
- On project load: `Gallery.addGenerated(item)` already passes full item through — manifest rides along
- On `.cafe` export: manifest is included in gallery cell data automatically (no change needed)

### Where manifest is displayed
- Currently nowhere — info panel shows date, type, dims, prompt only
- Future: "References" section added to `#hud-info-panel`
- Not built in this pass — data is saved, UI is a future task

---

## What This Does NOT Change

- `logic/prompt-builder.js` — already correct, no changes
- `logic/storage.js` — no changes
- `logic/workspace.js` — only the one DB save addition above
- `logic/settings.js` — no changes
- Module panel HTML/JS — no changes (vision scan already called on image upload for SUBJECT/STAGE)
- Gallery HTML/JS — no changes
- Sequence Bar — no changes

---

## Problems Resolved by This Spec

| Issue | Description | Resolved by |
|---|---|---|
| 1 | Vision output truncated | Fix 1 — maxOutputTokens 256→512 |
| 2 | STYLE not scanned | Fix 5 — add scan to mpStyInput |
| 3 | Slots not separated | Fix 2 — slot labels in manifest |
| 4 | Vision scan no goal context | Fix 1 — extraction-focused prompts already exist |
| 5 | Custom layer names no context | Fix 1 — generic fallback improved |
| 6 | Enhancer has no system knowledge | Fix 3 — Creative Director knows CafeHTML |
| 7 | Enhancer doesn't know generation model | Fix 3 — nano-banana-2 formula in system prompt |
| 8 | Vision data sent twice | Fix 3 — manifest is single source, compiled string removed |
| 9 | fal.ai ignores enhanced prompt | Fix 4 — unified prompt path |
| 10 | compilePrompt and enhancer competing | Fix 4 — compilePrompt removed |
| 11 | Enhancer never sees images | Fix 2 — manifest contains full visual descriptions |
| 13 | Structure destroyed before AI | Fix 2 — slot/layer/section hierarchy in manifest |
| 14 | No provider abstraction | Fix 4 — unified path (partial, full adapter layer future) |
| 21 | No vision scan cache | Fix 1 — data-vision-src cache validation |
| 22 | Global refs have no vision scan | Fix 5 — describeRef on chip upload |
| 23 | Enhancer gets wrong user intent | Fix 3 — payload.prompt passed directly |

---

## Problems Deferred (not in this pass)

| Issue | Reason |
|---|---|
| 12 | Feedback loop — needs rating UI, separate task |
| 15 | Reload module state — needs snapshot design, separate task |
| 16 | Favourites not persisted — small isolated fix, separate task |
| 17 | Vision scan UI feedback — CSS indicator, separate task |
| 18 | Conflict detection — Witty Director agent, future feature |
| 19 | Gallery image provenance UI — info panel redesign, future task |
| 20 | PRECISE/CREATIVE depth — partially addressed here, full depth future |

---

## Open / Flexible

- `CafeEntities` registry — structure defined, wiring deferred. Components self-register as they are touched.
- Scan timing switch (upload vs generate) — upload is default, manual settings toggle is a future feature
- Provider adapter pattern — unified path achieved here, full adapter files deferred to when a third provider is added
- Parallel vs sequential vision scans — parallel per-entity, sequential across entities. Decision: run all scans in parallel via `Promise.all` before building manifest.
