# CafeHTML — Improvements Log

A running record of fixes, upgrades, and tuning applied to the pipeline.

---

## Vision Scan — Description Quality (2026-04-22)

**Problem:** Vision scan descriptions were one-liners or cut off mid-sentence. Console showed outputs like `"**Clothing on"` or `"The scene depicts"` — structured markdown with bold headers that hit the token limit before completing.

**Root causes identified:**
1. Prompts said "Be specific and concise" and "Be thorough but concise" — actively telling the model to be short
2. Prompts used "Cover: X, Y, Z" framing — Gemini interpreted this as a list and wrote structured markdown with `**headers**` instead of prose
3. `maxOutputTokens: 512` was too low for structured output
4. Gemini 2.5 Flash is a thinking model — thinking tokens counted against `maxOutputTokens`, consuming most of the budget before actual text output began

**Fixes applied (`logic/vision.js`):**
- Removed "Be concise" from all prompts
- Added `PROSE` constant appended to every prompt: *"Write in flowing prose. No bullet points, no headers, no markdown. Start directly — no preamble."*
- Rewrote all SUBJECT and STAGE prompts to read as natural requests, not structured lists
- Rewrote `STYLE_PROMPT` to ask for 3–5 sentences covering colour grade, lighting, camera, texture, era/aesthetic movement
- Rewrote `REF_PROMPT` to ask for 4–6 sentences covering subject, environment, lighting, palette, mood, and style
- Raised `maxOutputTokens` to 1024
- Added `thinkingConfig: { thinkingBudget: 0 }` inside `generationConfig` to disable thinking — frees the full token budget for actual description output

**Result:** Descriptions now return as complete flowing prose. Length varies by image — may need tweaking per layer type in future.

**Pending tuning:**
- Style descriptions can run long — consider a tighter sentence count target
- Character/outfit descriptions may benefit from a shorter target (2–3 sentences) vs background/ref (4–6 sentences)

---

## Style Layer — visionDesc Not Reaching Manifest (2026-04-22)

**Problem:** Style image vision descriptions were never appearing in the generation manifest — the Creative Director always saw "(no description available)" for the Style entry.

**Root causes:**
1. `syncStyle()` in `CafeHTML-v2.html` mapped style slot state without including `visionDesc`
2. `syncStyle()` was called immediately after firing the async scan — before the `.then()` completed, so even if it had included `visionDesc`, the value wasn't set yet
3. `collectStyle()` in `prompt-builder.js` also excluded `visionDesc` from its return object

**Fixes applied:**
- `syncStyle()`: added `visionDesc: s.visionDesc || null` to the mapped slot object
- Style scan `.then()` and `.catch()`: both now call `syncStyle()` after setting `visionDesc`
- `collectStyle()` in `prompt-builder.js`: added `visionDesc: s.visionDesc || null` to the return object

---

## Provider Architecture — fal.ai Removed (2026-04-29)

**Decision:** fal.ai has been removed from the codebase. All models in `logic/settings.js` are Google (Vertex AI) only. The original Issue 14 problem — two diverging backend branches with independent queue, polling, and response parsing logic — no longer exists.

**Current state:** `api.js` has a single `googleGenerate()` path. Every generation uses the same final enhanced prompt. No provider branching remains.

**Provider adapter pattern:** Deferred. When a second provider is actually added (Replicate, Kling for video, etc.), a proper adapter interface (`generate(prompt, images, settings)`) should be extracted at that point — not before. Building abstraction for a provider that doesn't exist yet would add complexity with no current benefit.

---

## Future Tasks

### Style Module — Edit Button (no handler)
In image mode, a `sty-edit` button renders but has no click listener. Should re-open the file picker (`mpStyInput.click()`) to replace the current style image. Deferred.

### Style / Subject / Stage — Generate from Compose Prompt
The compose UI (T button) has a "gen" button that currently switches the slot to image mode but does nothing. Intended behaviour: send the composed text prompt to a generation model and load the resulting image into the slot. Same feature exists (or should) in child layers for subject and stage modules. Deferred — needs generation model decision first.

---

## Creative Director — Role Confusion with Multiple Images (2026-04-22)

**Problem:** nano-banana-2 was mixing CHARACTER and OUTFIT references — using the wrong person, ignoring BACKGROUND — when multiple images were sent.

**Fix applied (`logic/enhancer.js`):**
- Added explicit role-writing rules to `buildSystemPrompt()` so the Creative Director uses role-specific anchor language per image type (CHARACTER, OUTFIT, BACKGROUND, STYLE, etc.)
- Style manifest entry role label changed from `'STYLE'` to `'STYLE — visual treatment only, not a scene or subject'` to prevent the Creative Director writing style as a background reference
- Creative Director instructed to anchor the brief with CHARACTER first, then scene, then style
