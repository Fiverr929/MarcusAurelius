# CafeHTML — Architecture

A living document. Update whenever a component is added, renamed, or its purpose changes.

---

## What CafeHTML Is

A structured AI media creation pipeline. Not a prompt box — a reference-based generation system where the user builds a scene from real images and the system writes the generation brief automatically.

Current scope: Image generation (Tab 1). Video, Audio, Timeline are future tabs.

---

## Communication Model

All components register themselves on `window.CafeEntities` when they initialise. Nothing calls blind `window.X` globals. If a component isn't registered, it doesn't exist to the rest of the system.

```js
window.CafeEntities = {
  gallery:    null,   // set by Gallery on init
  modules:    null,   // set by ModuleState on init
  promptBar:  null,   // set by prompt bar on init
  settings:   null,   // set by CafeSettings on init
  workspace:  null,   // set by Workspace on init
  pipeline:   null    // set by the generation pipeline on init
};
```

This is intentionally flexible — components register when ready, no strict contract enforced yet.

---

## Generation Pipeline

When the user clicks Generate, the system runs these steps in order:

```
1. Vision Agent      — scans each uploaded image with layer-name-aware extraction
2. Manifest Builder  — assembles ordered image list with descriptions and slot labels
3. Creative Director — reads manifest + raw user text → writes generation brief
4. Provider Adapter  — routes final prompt + images to fal.ai or Google
5. Gallery           — receives result, displays cell, saves to IndexedDB
```

Each step is a focused function. The pipeline orchestrates them — it knows the order, nothing about the internals.

---

## Components

### CafeHTML-v2.html
The main application shell. Contains all HTML structure, CSS, and inline JS for UI components. Logic lives in `/logic` files loaded at the bottom.

---

### Gallery
**File:** `CafeHTML-v2.html` (inline, bottom section)
**Registered as:** `window.CafeEntities.gallery` / `window.Gallery`
**What it does:** Displays generated image cells in a scrollable grid. Manages the CELLS array in memory.
**Why it exists:** Central display and management point for all generated output.
**Exposes:**
- `addGenerated(cell)` — adds a completed cell to the grid
- `addLoading(id, ratio, mode)` — inserts a loading placeholder
- `resolveLoading(id, cell)` — replaces loading placeholder with real image
- `removeLoading(id)` — removes a loading placeholder on failure
- `getGeneratedCells()` — returns all generated cells (for save/export)
- `clearGenerated()` — removes all generated cells (on project load)
**Talks to:** Workspace (autosave on resolve)

---

### Image HUD
**File:** `CafeHTML-v2.html` (inline)
**What it does:** Full-screen overlay shown when user clicks a gallery cell. Shows the image large with navigation arrows, action buttons, and an info panel.
**Why it exists:** Primary way to inspect, download, delete, or sequence a generated image.
**Info panel shows:** Date, type, dimensions, final prompt text. *(Future: reference manifest — which images produced it)*
**Actions:** Add to Sequence, Upscale, Download, Delete
**Talks to:** Gallery (reads CELLS), Sequence Bar (add to sequence)

---

### Module Panel — SUBJECT / STAGE / STYLE
**File:** `CafeHTML-v2.html` (inline)
**Registered as:** `window.ModuleState`
**What it does:** Three collapsible sections where the user builds the scene. Each section has slots (A–G), each slot has named layer groups, each layer has image or text children.
**Why it exists:** The structured reference system. This is what separates CafeHTML from a plain prompt box — references are organised, labelled, and visually controlled before generation.
**Hierarchy:**
```
SECTION (subject / stage / style)
  └── SLOT (A–G) — independent sets, each toggleable
        └── LAYER GROUP — user-named (CHARACTER, OUTFIT, BACKGROUND, etc.)
              └── CHILD — image upload OR text prompt, each with visibility toggle
```
**State:** `window.ModuleState = { subject, stage, style }` — live, updated on every change
**Talks to:** VisionScan (on image upload), PromptBuilder (reads state), Workspace (autosave)

---

### Prompt Bar
**File:** `CafeHTML-v2.html` (inline)
**What it does:** Text input where the user types their raw creative intent. Has a FRAME/SCENE mode toggle. Owns the generate button.
**Why it exists:** The user's direct creative voice. This raw text is passed to the Creative Director unchanged — it is NOT pre-compiled before reaching the AI.
**Modes:**
- `FRAME` (orange) — image generation
- `SCENE` (blue) — future video shot creation, not built yet
**Talks to:** CafeAPI (triggers generate on button click)

---

### Global Reference Bar
**File:** `CafeHTML-v2.html` (inline)
**Registered as:** `window.refState`
**What it does:** Up to 5 reference image chips attached to the prompt bar. Mode-specific (FRAME refs and SCENE refs stored separately).
**Why it exists:** Quick reference images that don't belong to a specific module layer. Labelled R1–R5 in the manifest. Scanned by the Vision Agent on upload.
**State:** `window.refState = { FRAME: [], SCENE: [] }` — arrays of image data URLs
**Vision cache:** `window.refVisionCache` — keyed by image URL, stores scan descriptions
**Talks to:** VisionScan (on upload), Manifest Builder (descriptions fed in), PromptBuilder (refs included in payload)

---

### Settings Panel
**File:** `CafeHTML-v2.html` (inline), `logic/settings.js`
**Registered as:** `window.CafeSettings`
**What it does:** Dropdown panel for generation settings. Controls aspect ratio, variation count, seed, output type (PRECISE/CREATIVE), resolution, and active model.
**Why it exists:** User controls for how the generation runs — not what to generate, but how.
**PRECISE vs CREATIVE:** Threads through the entire pipeline — affects vision scan depth, manifest labelling, and Creative Director instructions. Not just one line.
**Exposes:** `getActiveModel()`, `getApiKeyForModel()`, `getGoogleApiKey()`, `getResolution()`, `getCostPerImage()`

---

### Sequence Bar
**File:** `CafeHTML-v2.html` (inline)
**What it does:** A horizontal strip of approved frames at the bottom of the screen. User adds images from the HUD. Acts as the handoff point to the Video tab.
**Why it exists:** Curated keyframes travel from Image tab to Video tab. The Sequence Bar is the bridge between them.
**Current limitation:** Stores only `{ imgUrl }` per slot — no module state, prompt, or manifest attached. Full context needed for video consistency. Fix deferred to Video tab build.
**Talks to:** Gallery HUD (receives cells), Video tab (future)

---

### Vision Agent
**File:** `logic/vision.js`
**Registered as:** `window.VisionScan`
**What it does:** Sends an image to Gemini 2.5 Flash with a layer-name-aware extraction prompt. Extracts only what the layer name specifies — CHARACTER describes the person only, OUTFIT describes clothing only, BACKGROUND describes environment only.
**Why it exists:** Without a focused description, the generation model receives an image with no context. The Vision Agent turns each reference image into a targeted description the Creative Director can use.
**Cache:** Stores result in `child.dataset.visionDesc`. Re-scans only if the image URL changes (`child.dataset.visionSrc` tracks the last scanned URL).
**Exposes:** `describe(base64DataUrl, layerName, section)`, `describeRef(base64DataUrl)`, `describeStyle(base64DataUrl)`
**Talks to:** CafeSettings (API key)

---

### Manifest Builder
**File:** `logic/enhancer.js` (`collectImageContext()`)
**What it does:** Assembles the ordered image list before the Creative Director writes anything. Every active image across SUBJECT, STAGE, STYLE, and Global Refs gets a numbered slot with its role, slot label, and vision description.
**Why it exists:** Creates a guaranteed contract between the prompt and the image array. The Creative Director writes positional references ("the person in image 1") knowing exactly what image 1 is. The API sends images in the same order. They always match.
**Image order:** Global Refs (R1–R5) → SUBJECT slots (A→G, layer order) → STAGE slots → STYLE
**Output:** `[{ position, role, slot, layerName, desc }]`

---

### Creative Director
**File:** `logic/enhancer.js`
**Registered as:** `window.PromptEnhancer`
**What it does:** Reads the manifest and the user's raw prompt text. Writes a generation brief for nano-banana-2 — not a formatted string, a natural language creative brief with real positional image references.
**Why it exists:** The user's raw text ("woman walking in rain") combined with structured references needs to become a prompt the generation model can fully exploit. The Creative Director knows CafeHTML's structure, knows nano-banana-2's formula (Subject → Scene → Style), and writes accordingly.
**PRECISE mode:** Lock every reference exactly. No interpretation. Accuracy over composition.
**CREATIVE mode:** References are inspiration. Blend loosely. Add artistic direction.
**Exposes:** `enhance(payload, rawUserText)` → returns `{ prompt, manifest }`
**Talks to:** CafeSettings (API key, output type), VisionScan descriptions via manifest

---

### Generation API
**File:** `logic/api.js`
**Registered as:** `window.CafeAPI`
**What it does:** Orchestrates the generation pipeline. Calls the Creative Director, builds the final payload, routes to the correct provider, handles polling, delivers results to Gallery.
**Why it exists:** Single entry point for all generation. Provider-blind — fal.ai and Google both receive the same final prompt from the Creative Director.
**Providers:**
- `fal.ai` — queue-based, polling, returns image URLs
- `Google Gemini` — direct generate, returns base64 inline data
**Exposes:** `generate()`
**Talks to:** PromptBuilder, PromptEnhancer, Gallery, Workspace, CafeSettings

---

### Prompt Builder
**File:** `logic/prompt-builder.js`
**Registered as:** `window.PromptBuilder`
**What it does:** Reads `window.ModuleState` and settings, returns a structured payload object. Does not compile text — just collects and structures the raw state.
**Why it exists:** Single point that reads all live state into one clean object. Every part of the pipeline reads from this payload rather than reading the DOM directly.
**Exposes:** `collect()` → returns `{ mode, prompt, refs, subject, stage, style, settings }`

---

### Workspace
**File:** `logic/workspace.js`
**Registered as:** `window.Workspace`
**What it does:** Manages project persistence. Autosaves to IndexedDB on every change. Loads the most recent project on startup. Handles export (.cafe) and import.
**Why it exists:** Everything the user builds should survive a page reload. Gallery cells, module state, refs, settings, sequence — all persisted without the user doing anything.
**Exposes:** `autosave()`, `autosaveDebounced()`, `loadProject(id)`, `exportCafe()`, `importCafe()`
**Talks to:** DB (storage.js), Gallery, ModuleState, refState, PromptBuilder, Sequence Bar

---

### Storage (DB)
**File:** `logic/storage.js`
**Registered as:** `window.DB`
**What it does:** IndexedDB wrapper. Five stores: projects, settings, moduleState, references, gallery, sequence.
**Why it exists:** Persistent storage without a backend. Everything survives page reloads.
**Exposes:** `DB.projects`, `DB.settings`, `DB.moduleState`, `DB.references`, `DB.gallery`, `DB.sequence` — each with `get`, `save`, `add`, `getAll`, `clear`

---

## Known Issues

See `problem.md` for the full list of 23 logged issues with resolution approaches.

High priority (block correct generation):
- Issues 1, 2, 4, 9, 10, 22, 23 — vision extraction, STYLE not scanned, fal.ai ignores enhanced prompt, wrong enhancer input

Resolved by manifest architecture (not yet built):
- Issues 3, 8, 11, 13 — slots separated, no duplicate data, structure preserved

---

## Future Components (not built)

- **Conflict Detector (Witty Director)** — background agent that flags contradictions between module state and prompt bar before generation
- **Video Tab** — receives Sequence Bar frames, sends to video generation models (Kling, RunwayML)
- **Audio Tab** — scoring, voiceover, sound design
- **Timeline Tab** — final assembly
- **The Ideator** — autonomous pipeline driver from a single brief

See `IDEA.md` for full future vision.
