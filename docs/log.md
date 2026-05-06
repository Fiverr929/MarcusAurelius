# CafeHTML Build Log

Track component work, decisions, and session continuations here.

---

## How to Use This Log

- Each session gets a dated entry
- Record what was built, what decisions were made, and what's left to do
- If a session ends abruptly, pick up from the last "IN PROGRESS" entry

---

## Sessions

### 2026-04-05 — Reference Image Chips Component

**Status:** COMPLETED

**What Was Built:**
- `UploadedReferenceImages` — reference chip strip that appears above the prompt bar when images are uploaded via `PromptRefferenceButton`

**How It Works:**
- Clicking `#liveUpload` (the orange `+` button) triggers a hidden `<input type="file" accept="image/*">`
- Uploaded images are stored in `refState = { FRAME: [], SCENE: [] }` — separate arrays per mode
- Up to 5 images per mode; button gets `.disabled` class at the limit
- Each chip renders: a thumbnail (`<img>`), a colored overlay (`#ea5823` FRAME / `#5271ff` SCENE), a label (`R1`–`R5`), and an `×` remove button
- Remove button splices from `refState` and re-renders the row
- Chip strip (`#liveRefChips`) is hidden when empty, shown when refs exist

**Files Touched:**
- `Components/prompt-bar.html` — full component lives here (CSS + HTML + JS)

**Synced to main file:**
- [x] Confirmed synced — `liveRefChips`, `liveUpload`, `refState` all present in `CafeHTML-v2.html`

---

---

### 2026-05-02 — Simplification Pass: Strip Defensive Guards & refVisionCache

**Status:** COMPLETED

**What Was Done:**

Stripped all "public app" defensive code that was overcomplicating the system for personal single-user use.

**Removed — `window.refVisionCache` (entire layer):**
- `logic/enhancer.js` — removed refVisionCache read (`var desc = null` now) and write block after vision scan
- `logic/workspace.js` — removed `visionCache` from autosave, removed `window.refVisionCache = ...` on project load
- `CafeHTML-v2.html` — removed `window.refVisionCache = {}` init, removed two write calls in ref upload handler

**Removed — `if (window.X)` guards throughout:**
- `logic/workspace.js` — removed guards on Gallery, refState, renderChips, PromptBuilder, applyModuleState
- `logic/api.js` — removed entry guard for PromptBuilder/CafeSettings, removed CafeDebug ternary (debugEntry always created now), removed PromptEnhancer ternary, removed all 4× `if (debugEntry)` blocks, removed 2× Workspace autosave guards, removed 2× Gallery removeLoading guards, removed payload.settings double-guard
- `logic/prompt-builder.js` — removed settingsDropdown null guard, removed promptBar/promptText ternaries, removed refState double-guard
- `logic/settings.js` — removed `drop ?` ternary in getOutputType

**Also fixed:**
- `logic/vision.js` — cache key extended from 32 → 128 chars (all 3 cache functions)
- `CafeHTML-v2.html` — off-palette colors: `#c3c3c2` → `#c7c7c7` (4 places), `#666666` → `#999997`
- `CafeHTML-v2.html` — removed 12+ additional `if (window.X)` guards from chip remove, upload, projects panel, module actions, HUD, upscale handler

**Not changed:**
- SCENE mode structure (refState.SCENE, sequence store) — kept intact, SCENE not built yet
- Modal DOM null checks in settings.js init/renderModal/openModal/closeModal — kept, these are startup guards not window.X guards
- debug-logger.js — kept entirely

**Files Touched:**
- `logic/api.js`
- `logic/prompt-builder.js`
- `logic/settings.js`
- `logic/enhancer.js`
- `logic/workspace.js`
- `logic/vision.js`
- `CafeHTML-v2.html`

---

### 2026-05-06 — Docs Overhaul + Consolidation

**Status:** COMPLETED

**What Was Done:**

Full documentation audit and rewrite to match the current codebase. Docs were severely outdated (still referenced fal.ai, PRECISE/CREATIVE mode, old slot structure, CafeEntities registry).

**Logic changes:**
- `logic/api.js` — removed `REQUEST_LIMIT` and both generation limit guards. `_activeRequests` kept for button loading state only.

**Docs updated:**
- `ARCHITECTURE.md` — full rewrite: removed fal.ai, CafeEntities, PRECISE/CREATIVE; added T button, Refine overlay, debug-logger, correct noSlots structure for STAGE/STYLE, all 8 logic files, models table
- `CLAUDE.md` (now `CafeHTML.md`) — full rewrite matching current pipeline state
- `docs/Info/rulebook.md` — updated Style section, component registry, decisions log
- `docs/problem.md` — issues 1–11, 13, 15, 16, 19–23 marked FIXED or REMOVED. Open: 12, 17, 18

**Files converted from .md to .txt** (pure reference, not agent-facing):
- `GENERATE.md` → `GENERATE.txt`
- `IDEA.md` → `IDEA.txt`
- `v3-vision.md` → `v3-vision.txt`
- `Improvement.md` → `Improvement.txt`

**Folder removed:**
- `docs/superpowers/` — both files were implementation plans for work already done and evolved past

**Final consolidation:**
- `ARCHITECTURE.md` + `rulebook.md` merged into `CafeHTML.md` — single source of truth
- `ARCHITECTURE.md` and `rulebook.md` deleted

**Files Touched:**
- `logic/api.js`
- `docs/CafeHTML.md` (formerly CLAUDE.md)
- `docs/ARCHITECTURE.md` (deleted)
- `docs/rulebook.md` (deleted)
- `docs/problem.md`
- Multiple .md → .txt conversions

---

### 2026-04-13 — Wire Module Panel to Prompt Compiler

**Status:** COMPLETED

**What Was Built:**
- `window.ModuleState` global — live object tracking all SUBJECT, STAGE, STYLE slot states
- `syncModuleState()` inside `makeSection()` — fires after every state change (slot switch, on/off, layer edit, child save/delete)
- `syncStyle()` inside the STYLE IIFE — fires after every style state change
- `prompt-builder.js` rewritten — reads `window.ModuleState` instead of DOM scraping; parses each slot's HTML snapshot in a detached element to read all slots (not just active)
- `compilePrompt()` in `api.js` — assembles prompt text from active visible layers across SUBJECT + STAGE + STYLE, prepended with the user's freeform prompt

**Architecture:**
- `window.ModuleState = { subject: { selected, slots: [{on, html}] }, stage: {...}, style: { selected, slots: [{on, mode, linked, imgUrl, promptText}] } }`
- Subject/Stage: slot HTML snapshots parsed via `document.createElement('div')` — read `data-savedPrompt`, `.prompt-a/.img-a` classes, `.plr-eye.on` visibility
- Style: direct state object (no HTML snapshot needed)
- Compile order: SUBJECT layers → STAGE layers → STYLE (if linked and active)
- OFF slots excluded; invisible layers/children excluded

**Files Touched:**
- `CafeHTML/CafeHTML-v2.html` — makeSection signature, syncModuleState, syncStyle, ModuleState init
- `CafeHTML/logic/prompt-builder.js` — full rewrite of collectSection/collectStyle
- `CafeHTML/logic/api.js` — added compilePrompt(), wired into buildPayload and generate()

---

## Component Registry

| Component | File | Status |
|---|---|---|
| `PromptRefferenceButton` | `Components/prompt-bar.html` | Done |
| `UploadedReferenceImages` (ref chips) | `Components/prompt-bar.html` | Done |

---

## Design Tokens (Quick Reference)

| Token | Hex | Role |
|---|---|---|
| Orange | `#ea5823` | Primary CTA, active states |
| Blue | `#5271ff` | Secondary, inactive |
| Gray mid | `#999997` | Neutral/inactive bg |
| Gray light | `#c7c7c7` | Text, borders |
| Font | Times New Roman | All labels |
