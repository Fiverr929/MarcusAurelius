# CafeHTML

> A living document. Update at the end of every session when rules, components, or specs change.

---

## What CafeHTML Is

A structured AI media creation pipeline. Not a prompt box — a reference-based generation system where the user builds a scene from real images and the system writes the generation brief automatically.

Current scope: Image generation (FRAME mode). Video, Audio, Timeline are future tabs.

---

## FRAME / SCENE — DO NOT CONFUSE

- **FRAME mode** (orange `#ea5823`) — image generation. This is what's being actively built.
- **SCENE mode** (blue `#5271ff`) — future video pipeline. **NOT being built yet — do not touch SCENE mode logic.**

---

## Stack

Plain HTML / CSS / JS only. No frameworks, no React, no build tools. Styles live in `style.css`.

Main file: `CafeHTML-v2.html`
Styles: `style.css`
Logic files: `logic/api.js`, `logic/prompt-builder.js`, `logic/enhancer.js`, `logic/vision.js`, `logic/registry.js`, `logic/settings.js`, `logic/workspace.js`, `logic/storage.js`, `logic/debug-logger.js`, `logic/prompt-bar.js`, `logic/module-panel.js`, `logic/gallery.js`, `logic/sequence-bar.js`, `logic/studio.js`, `logic/studio-module.js`
Docs: `docs/` folder

---

## Generation Pipeline

```
1. PromptBuilder.collect()     — reads ModuleState + settings → structured payload
                                 reads clr.dataset.visionDesc from DOM
2. DescriptionRegistry         — On Load only: catch-up scan finds missing descriptions
   .collectMissing()           — ensureAll() scans via VisionScan when scanTiming === 'load'
   .ensureAll()                — results written to DOM + refState, then PromptBuilder re-collects
                                 On Generate skips catch-up scan and leaves missing descriptions inline
3. PromptEnhancer.enhance()    — builds text message with descriptions + sends only undescribed images inline
                                 calls Gemini 2.5 Flash → returns { prompt, manifest }
4. googleGenerate()            — sends enhanced prompt + ALL images (refs + module, positioned first then described) → returns predictions
5. Gallery.resolveLoading()    — displays result, saves to IndexedDB via Workspace hook
6. Registry.clear()            — if Keep Descriptions OFF, clears all stored descriptions
```

---

## VisionScan Pipeline

VisionScan (`vision.js`) describes individual images using `gemini-2.5-flash`. Its output feeds the enhancer so the enhancer call becomes text-only for described images — faster and cheaper than sending everything inline.

All caching is handled by **DescriptionRegistry** (`registry.js`) — VisionScan functions call Gemini directly, no internal cache.

### Scan Timing Setting

**On Load** — VisionScan runs immediately when an image is uploaded to a module slot. Description is stored via `DescriptionRegistry.ensure()` which populates `_store` (URL→description map). Result also written to `clr.dataset.visionDesc` in the DOM for PromptBuilder to read.

**On Generate** — No scan on upload and no catch-up scan before enhancement. Missing descriptions stay `null`; `PromptEnhancer` sends those module/ref images inline to Gemini so it reads the current pixels. This mode must not reuse enhancer output when inline images are present.

### How Descriptions Flow Into the Enhancer

- `collectImageContext()` reads `child.visionDesc` → stores as `desc` on each image item
- Items with `desc` → rendered as text in the message (`[Identity anchor] tall woman, black hair...`)
- Items without `desc` → rendered as `[Identity anchor — Image N]` and sent inline
- Ref images (R1–R5) get descriptions from Registry when available → sent as text; fall back to inline when null
- The final Gemini call receives: text message + only the undescribed inline images

### Keep Descriptions Setting

**Keep ON** — Description text is cached for the session.
- Registry `_store` persists across generates → described images can reuse text descriptions
- Enhancer output is cached only when there are **zero inline images**. If module/ref images are sent inline, the enhancer cache is disabled so Gemini re-reads the current image pixels.

**Keep OFF** — Always fresh.
- Registry descriptions are used for the current generation
- `Registry.clear()` is called after successful generation (`api.js`)
- Enhancer brief cache is never written
- On Load: catch-up scan can refill missing descriptions before enhancement
- On Generate: inline images go directly to PromptEnhancer; no description catch-up scan

### Scan Failure Fallback

If VisionScan fails for any image (429, timeout, network error), that image's `desc` stays null → falls back to inline automatically. The generation continues — failure is silent per image, not a pipeline abort. `ensureAll()` catches individual failures and returns `null` for failed scans.

### Retry Behavior

Both VisionScan and the enhancer retry on 429:
- Attempt 1: wait 5 seconds, retry
- Attempt 2: wait 10 seconds, retry
- After 2 retries: hard fail (VisionScan → image goes inline; enhancer → pipeline aborts)

The generation model (`googleGenerate`) uses the same 5s/10s retry pattern.

---

## Module Architecture

Three sections: SUBJECT, STAGE, STYLE. **Only SUBJECT has slots.** STAGE and STYLE are layer-only.

```
SUBJECT
  └── SLOT (A–G) — independent sets, each toggleable
        └── LAYER GROUP — user-named (CHARACTER, OUTFIT, BACKGROUND, etc.)
              └── CHILD (clr) — image upload OR text prompt, with visibility toggle

STAGE / STYLE
  └── LAYER GROUP — user-named
        └── CHILD (clr) — image upload OR text prompt, with visibility toggle
```

- Multiple slots = independent sets (not the same thing from multiple angles)
- Multiple image children in the same layer = multiple views of the same thing
- `window.ModuleState = { subject, stage, style }` — live state

---

## T Button — Compose System

Each child slot (`.clr`) has a `T` badge:

- **blue T** — empty, no text. Click opens COMPOSE row (textarea + GENERATE + SAVE)
- **orange T** — text saved in `clr.dataset.savedPrompt`. Click reopens compose pre-filled
- **SAVE** — stores text, renders slot as text-prompt child (orange T)
- **GENERATE** — calls `CafeAPI.generateLayerImage(text)`, converts slot to image on success. Sets `clr.dataset.visionDesc = text` directly, bypassing vision scan

---

## Global References

`refState = { FRAME: [], SCENE: [] }` — up to 5 refs per mode, each entry is `{url, desc}` (legacy strings supported via typeof fallback). Uploaded via prompt bar `+` button. Labelled R1–R5 in the manifest, sent first in the image array.

---

## Refine Overlay

Full-screen panel opened from Image HUD. Separate from the main generation pipeline.

- **History strip** — left panel of version thumbnails. Click to switch active canvas
- **Pencil tool** — draw annotation strokes, undo/redo stack
- **Crop tool** — drag/resize crop box, free or ratio-locked, applies client-side
- **Refs** — up to 3 additional reference images for the refine call
- **Refine button** — sends canvas image + annotation PNG + prompt + refs to active Google model. Appends "Focus on the annotated area." when strokes exist

---

## Studio Overlay

Studio is the current image editing workspace for Gallery images and Module image layers.

- **Entry points** — Gallery HUD pencil and Module image-layer pencil both call `window.Studio.open({ imgUrl, uuid, ratio, caller, onDone })`
- **History is image-specific** — saved under `DB.studioState.histories[uuid]`, not shared globally
- **Active history image** — clicking a history thumbnail updates `activeUrl`; Back returns that selected active image to the caller
- **Gallery return** — replaces the original Gallery image in place with the selected active Studio image
- **Module return** — replaces the module image in place and keeps the same module image UUID so Studio history remains attached
- **References are image-specific** — Studio module/reference layers are stored as `layers` on the same per-UUID Studio session
- **No automatic Gallery publishing** — Studio outputs do not auto-add new Gallery rows. Future behavior should be an explicit “Save to Gallery” action.

### Studio Reference Panel (`studio-module.js`)

Purpose-built panel — does not use `ModulePanel.makeSection`. Owns its own render/serialize cycle.

- **ACTION system** — each reference group carries one of `INSERT | SWAP | TRANSFER | REMOVE | PRESERVE` (default: `TRANSFER`). Action is sent to the API alongside the reference images.
- **Adding groups** — header `+` button opens an action-type menu; user picks action, then file picker opens. First image creates the group.
- **Adding images to a group** — add-child-row button below each group. Max 3 images per group (`MAX_IMAGES_PER_GROUP`).
- **Action drawer** — click the action button on any group to open a picker; closes all other drawers first.
- **Name editor** — click the group name label to open an inline input; Enter/Escape/blur commits. Opening name editor closes any open action drawer on the same group.
- **Serialize** — `serialize()` reads the DOM and returns `{ groups: [{ action, name, images: [{ uuid }] }] }`. Images store UUID only; `resolveMissingImages()` fetches base64 from `DB.images` on load.
- **Legacy compat** — `parseLegacyLayers()` converts old HTML-snapshot format to new shape on restore.

---

## Projects Panel

The Projects modal is owned by `logic/prompt-bar.js`; persistence lives in `logic/workspace.js` and `logic/storage.js`.

- **New** â€” creates `Project N` directly, loads it with `skipSave=true`, and closes the modal
- **Delete** â€” visible `×` button removes the project and cascades its related DB records
- **Delete final project** â€” clears the workspace and leaves the Projects list empty; it does not auto-create a replacement project
- **Storage cascade** â€” project/settings/module/studio/reference/gallery/sequence records delete first, then image/description records clean up by project

---

## Models

| Label | Model ID | Thinking | Resolutions |
|---|---|---|---|
| NANO BANANA | `gemini-2.5-flash-image` | none | default only |
| NANO BANANA 2 | `gemini-3.1-flash-image-preview` | MINIMAL | 512, 1K, 2K, 4K |
| NANO BANANA PRO | `gemini-3-pro-image-preview` | none | 1K, 2K, 4K |

Enhancer model: `gemini-2.5-flash` (text + vision, not an image model)

---

## Provider

Google AI Platform only (`aiplatform.googleapis.com`). fal.ai has been removed entirely. No rate limit — multiple concurrent generations allowed.

---

## Window Globals

```
window.CafeAPI          — generation pipeline (api.js)
window.PromptBuilder    — payload collector (prompt-builder.js)
window.PromptEnhancer   — brief writer / manifest builder (enhancer.js)
window.DescriptionRegistry — centralized description store (registry.js)
window.VisionScan       — image description agent (vision.js)
window.CafeSettings     — settings state + modal (settings.js)
window.Workspace        — project persistence (workspace.js)
window.DB               — IndexedDB abstraction (storage.js)
window.CafeDebug        — generation run logger (debug-logger.js)
window.Gallery          — gallery UI (gallery.js)
window.ModuleState      — live module state (module-panel.js)
window.ModulePanel      — module section factory { makeSection } (module-panel.js)
window.Studio           — studio overlay (studio.js)
window.StudioModule     — studio reference panel (studio-module.js)
window.StudioModuleState — live studio module state (studio-module.js)
window.refState         — global reference images { FRAME: [], SCENE: [] }
```

No `CafeEntities` registry — direct window globals only.

---

## Future Components (not built)

- **Video Tab** — receives Sequence Bar frames, sends to video generation models
- **Audio Tab** — scoring, voiceover, sound design
- **Timeline Tab** — final assembly
- **SCENE mode** — shot-by-shot video pipeline

---

## Figma-to-Code Workflow

1. Fetch design using Figma MCP tool
2. Describe the visual in plain terms before writing any code
3. Wait for user confirmation before proceeding
4. Screenshot is source of truth — not Figma's generated code
5. NEVER use Figma asset URLs — they expire. Recreate with CSS or inline SVG.

---

## Component Build Process

1. Build every component as a standalone HTML file first in `C:\Users\This PC\Gravity`
2. User reviews and approves the standalone version
3. Only then integrate into `CafeHTML-v2.html`
4. When syncing — do NOT launch explore agents. Grep/Read the target file at insertion points and edit directly.

---

## Code Style

- Color tokens: orange `#ea5823`, blue `#5271ff`, gray `#999997`, light gray `#c7c7c7`, off-white `#e8e6e6`
- Font: Times New Roman, all-caps labels
- No extra comments, no docstrings, no unnecessary abstractions
- Don't add features beyond what was asked
- Match existing patterns in `CafeHTML-v2.html`

---

## Communication

- User is a designer — explain technical decisions in plain language
- Keep responses short and direct
- Never go ahead and build without visual confirmation first

---

## Design System

### Color Tokens

| Token | Hex | Role |
|---|---|---|
| Orange | `#ea5823` | Primary CTA, active states, selected tabs |
| Blue | `#5271ff` | Secondary actions, inactive UI, borders |
| Gray mid | `#999997` | Neutral/inactive backgrounds |
| Gray light | `#c7c7c7` | Text on dark, borders, inactive labels |
| Off-white | `#e8e6e6` | Backgrounds, surface |

### Typography

Font: `Times New Roman`, serif — ALL labels, everywhere. No exceptions.

### Icon Rules

- All icons are `.svg` files in `CafeHTML/assets/`
- Never use Figma asset URLs — they expire in 7 days. Recreate in CSS/SVG or save locally.
- Active/inactive pairs: `icon-eye-on.svg` / `icon-eye-off.svg`, `icon-x-active.svg` / `icon-x-inactive.svg`, `icon-edit-active.svg` / `icon-edit-inactive.svg`, `icon-link.svg` / `icon-unlink-small.svg`, `icon-close.svg` (child row X)

---

## Module Panel Dimensions

| Property | Value |
|---|---|
| Width | `264px` |
| Background | `#999997` |
| Border | `1.89px solid #5271ff` |

---

## Parent Layer Row (`.plr`)

**Dimensions:** `263px × 25px`

| Element | Class | Width | Description |
|---|---|---|---|
| X button | `.plr-x` | 24px | Remove / Reset layer |
| Expand toggle | `.plr-exp` | 24px | Expand/collapse children |
| Layer name | `.plr-name` | 153px | Editable label |
| Link button | `.plr-link` | 24px | Link/unlink layer |
| Eye button | `.plr-eye` | 25px | Show/hide layer |

| State | X | Expand | Name | Link | Eye |
|---|---|---|---|---|---|
| **Active · Linked** | `.blue` | `.orange` | `.blue` | `.linked` | `.on` |
| **Active · Unlinked** | `.blue` | `.orange` | `.blue` | `.unlinked` | `.on` |
| **OFF (hidden)** | `.off` | `.off` | `.gray` | `.off` | `.off` |

When hidden, `.layer-off` on `.plr` grays out X, expand, name, and link via CSS cascade.

---

## Child Layer Row (`.clr`)

**Dimensions:** `263px × 25px` | **Padding:** `0 32px`

### Mode A — Load (default, empty)

| Element | Class | Notes |
|---|---|---|
| X button | `.clr-x` | Blue |
| Main area | `.clr-main.load` | Shows LOAD button icon |
| T button | `.clr-t.blue` | Opens COMPOSE row on click |

### Mode B — Image Loaded

| Element | Class | Notes |
|---|---|---|
| X button | `.clr-x` / `.clr-x.off` | Blue when visible, gray when hidden |
| Main area | `.clr-main.img-a` / `.img-i` | Active/inactive image thumbnail |
| Edit button | `.clr-edit.a` / `.clr-edit.i` | Pencil icon — opens Refine overlay |
| Eye button | `.plr-eye.on` / `.plr-eye.off` | Toggle visibility |

### Mode C — Prompt Active

| Element | Class | Notes |
|---|---|---|
| X button | `.clr-x` / `.clr-x.off` | Blue when visible, gray when hidden |
| T button | `.clr-t.orange` / `.clr-t.gray` | Orange = visible, gray = hidden |
| Main area | `.clr-main.prompt-a` / `.prompt-i` | Shows "PROMPT" label |
| Eye button | `.plr-eye.on` / `.plr-eye.off` | Toggle visibility |

---

## Style Module

STYLE uses the same layer structure as SUBJECT and STAGE — `.layer-group` → `.clr` children. No slots, no separate Style Row component. `VisionScan.describeStyle()` is called for its image children instead of `describe()`.

---

## Slot Switch Row (`.subject-row`)

Controls which subject slot (A, B, C…) is active and ON/OFF.

| Element | Class | Notes |
|---|---|---|
| Tab buttons | `.btn-subject-a` | One per subject; `.on` = selected |
| Add subject | `.btn-add-subject` | Orange `+` button |
| ON button | `.btn-on` | Orange when slot is ON |
| OFF button | `.btn-off` | Orange when slot is OFF |

`.slot-is-off` on `.subject-row` swaps ON/OFF visual states via CSS.

---

## Button Interaction Rules

### Eye Button — Show / Hide Layer
- Toggles layer visibility. Does NOT remove content.
- When OFF: row grays out (X, expand, link all go inactive)

### X Button — Remove or Reset

> **The module always maintains a minimum of 1 active parent layer with 1 active child layer.**

| Scenario | X on Parent | X on Child |
|---|---|---|
| Multiple parent layers exist | Removes entire parent + all children | — |
| 1 parent · multiple children | Cannot remove parent → Reset parent | Removes that child |
| 1 parent · 1 child (floor) | Resets parent to default | Resets child to Load |

**Reset:** Parent → eye ON, link linked, expand open. Child → Load mode, eye ON.

### T Button — Text / Prompt Toggle

| Location | Default state | Click action |
|---|---|---|
| Child row · Load mode | `.clr-t.blue` | → Activates Prompt mode |
| Child row · Prompt mode | `.clr-t.orange` (visible) / `.gray` (hidden) | → Back to Load mode |

### Edit (Pencil) Button

`.clr-edit` — opens Refine overlay for image editing. Currently placeholder — no click action on child rows yet.

### Link / Unlink Button

`.plr-link` — linked = layers synced across subjects. Unlinked = independent per subject. Toggle swaps `linked` ↔ `unlinked` classes.

### Expand / Collapse (`.plr-exp`)

Orange = active, expanded. `.collapsed` rotates arrow −90°. Collapsing hides child rows visually.

---

## Child Layer State Machine

```
[Load mode]  ←──────────────────────────────────────────────┐
    │ click LOAD                   │ click T (deactivate)    │
    ↓                              │                         │
[Image mode]                  [Prompt mode]                  │
    │ click Eye                    │ click Eye               │
    ↓                              ↓                         │
[Image Hidden]              [Prompt Hidden]                  │
    │ click X (reset)              │ click X (reset)         │
    └──────────────────────────────┴─────────────────────────┘
```

---

## Component Registry

| Component | File | Status |
|---|---|---|
| Prompt Bar + Ref Chips + Projects | `logic/prompt-bar.js` | Done |
| Module Panel (SUBJECT/STAGE/STYLE) | `logic/module-panel.js` | Done |
| Gallery + Image HUD | `logic/gallery.js` | Done |
| Sequence Bar | `logic/sequence-bar.js` | Done |
| Refine Overlay | `logic/refine.js` | Done |
| Studio Overlay | `logic/studio.js` | Done |
| Studio Reference Panel | `logic/studio-module.js` | Done |

---

## Decisions Log

| Date | Decision | Reason |
|---|---|---|
| 2026-04-07 | X button resets instead of removes at minimum floor (1 parent + 1 child) | Keeps module always populated; prevents empty/broken state |
| 2026-04-07 | T button opens COMPOSE row; GENERATE sends text to `generateLayerImage()`; SAVE stores as text-prompt child | T = layer text/generate entry point |
| 2026-04-07 | Edit pencil opens Refine, not a mode toggle | It's an image editing action, not a state switch |
| 2026-04-07 | STYLE uses same layer structure as SUBJECT/STAGE | Removed separate Style Row — consistency across all three sections |
| 2026-04-07 | Only SUBJECT has slots (A–G). STAGE and STYLE are layer-only | STAGE and STYLE don't need independent scene/style sets |
| 2026-04-29 | fal.ai removed — Google AI Platform only | Single provider path, no branching |
| 2026-05-06 | PRECISE/CREATIVE mode removed | Not deep enough to be useful; removed rather than half-implemented |
| 2026-05-06 | Generation rate limit removed | `_activeRequests` kept for button state only; no REQUEST_LIMIT |
| 2026-05-08 | VisionScan pipeline wired into enhancer | Described images go as text, not inline — faster enhancer calls, less quota |
| 2026-05-08 | Enhancer brief cache added | Keyed on userMessage + image URLs; gated on Keep Descriptions setting |
| 2026-05-08 | Retry added to VisionScan and enhancer | 5s/10s on 429; generation model retry shortened from 20s/40s to 5s/10s |
| 2026-05-11 | Inline JS extracted to 5 logic/ modules | ~2400 lines split into prompt-bar.js, module-panel.js, gallery.js, sequence-bar.js, refine.js. Reduces context cost when editing. Load order is safe — all communication via window.* globals at click time. |
| 2026-05-12 | DescriptionRegistry centralized all image description storage | Replaced scattered storage (DOM dataset, VisionScan._cache, refState) with single URL→description map. refState shape changed from `string[]` to `{url, desc}[]`. Catch-up scan added to api.js. Image dispatch fixed — all images now sent to Nano Banana. VisionScan caching layer removed — Registry owns all caching. |
| 2026-05-18 | On Generate enhancer cache disabled for inline images | `PromptEnhancer` no longer reuses final brief cache when inline module/ref images are present. `Keep Descriptions` remains a description cache, not a stale generated-brief cache. Added UUID assignment for module uploads/generated module images and fingerprint logs in `api.js` / `enhancer.js`. |
| 2026-05-19 | Modular logic is canonical | The legacy inline behavior block in `CafeHTML-v2.html` is disabled as inert text. Runtime behavior now loads from `logic/prompt-bar.js`, `logic/module-panel.js`, `logic/gallery.js`, `logic/sequence-bar.js`, `logic/refine.js`, and the generation modules. `logic/registry.js` is loaded after `vision.js`. |
| 2026-05-21 | Inline CSS extracted from HTML | Extracted ~4000 lines of inline styles from `CafeHTML-v2.html` and prepended them to `style.css` to completely remove the single-file inline constraint. |
| 2026-05-21 | Parallel Generation Restored | Replaced `runSequential` with `Promise.all` in `api.js` to ensure that multiple requested variations are generated concurrently, drastically speeding up generation times. |
| 2026-05-25 | UUID image storage — all stores use UUID pointers | `DB.images` is the single source of truth for all image data. moduleState HTML, references, and gallery cells hold UUID keys. Base64 lives in DB.images only. Project delete and per-image-delete cascade properly. Export resolves UUIDs back to base64 for self-contained `.cafe` files. |
| 2026-05-25 | DB version detection is dynamic | Instead of hardcoded `DB_VERSION`, storage.js opens the DB, checks which stores are missing, and bumps version only when needed. Safe across future store additions. |
| 2026-05-25 | Studio module LOAD slot auto-prompts rename | After loading an image via the LOAD slot, `.plr-name` is immediately focused with text selected. Blur commits and saves to DB. Consistent with the `+` header ref-card naming flow. |
| 2026-05-26 | Studio sessions are keyed by source image UUID | History, active selected image, and Studio reference layers restore per image. Gallery and Module Studio no longer share references or history. |
| 2026-05-26 | Studio Back returns the selected active history image | Clicking a history thumbnail sets `activeUrl`; closing Studio returns that image to Gallery or Module instead of always returning the newest generated result. |
| 2026-05-26 | Studio does not auto-publish to Gallery | Gallery and Module callers both replace their original image in place. Future Gallery publishing should be an explicit "Save to Gallery" action. |
| 2026-05-26 | Projects modal can have zero projects | Deleting the final project clears the workspace and leaves the list empty; the app no longer auto-creates a replacement row that makes deletion look broken. |
| 2026-05-26 | Studio reference panel no longer uses ModulePanel.makeSection | Custom render/serialize cycle eliminates hidden slots, text rows, eye, and link behavior that ModulePanel always brought along. Panel state is `{ groups: [{ action, name, images: [{ uuid }] }] }`. |
| 2026-05-26 | Studio references carry ACTION intent | Each reference group has an action tag (INSERT / SWAP / TRANSFER / REMOVE / PRESERVE). The API prompt includes `action` + `intent` per reference so the model knows how to apply each image. Default action is TRANSFER. |
| 2026-05-26 | action-drawer-open separate from drawer-open | Action button active state only triggers on `.action-drawer-open`, not `.drawer-open`, so opening the name editor no longer falsely activates the action button. |

---

*Last updated: 2026-05-26*
