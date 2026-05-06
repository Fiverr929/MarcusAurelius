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

Plain HTML / CSS / JS only. No frameworks, no React, no build tools. All styles inline in `<style>` blocks.

Main file: `CafeHTML-v2.html`
Logic files: `logic/api.js`, `logic/prompt-builder.js`, `logic/enhancer.js`, `logic/vision.js`, `logic/settings.js`, `logic/workspace.js`, `logic/storage.js`, `logic/debug-logger.js`
Docs: `docs/` folder

---

## Generation Pipeline

```
1. PromptBuilder.collect()     — reads ModuleState + settings → structured payload
2. PromptEnhancer.enhance()    — reads payload → calls Gemini 2.5 Flash with all images inline → returns { prompt, manifest }
3. googleGenerate()            — sends enhanced prompt + ordered image array to active model → returns predictions
4. Gallery.resolveLoading()    — displays result, saves to IndexedDB via Workspace hook
```

Vision scan descriptions (`clr.dataset.visionDesc`) are read by PromptBuilder at step 1 if present. The enhancer sends all images inline to Gemini, which analyzes them directly — vision descriptions are supplementary, not required.

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

`refState = { FRAME: [], SCENE: [] }` — up to 5 refs per mode. Uploaded via prompt bar `+` button. Labelled R1–R5 in the manifest, sent first in the image array.

---

## Refine Overlay

Full-screen panel opened from Image HUD. Separate from the main generation pipeline.

- **History strip** — left panel of version thumbnails. Click to switch active canvas
- **Pencil tool** — draw annotation strokes, undo/redo stack
- **Crop tool** — drag/resize crop box, free or ratio-locked, applies client-side
- **Refs** — up to 3 additional reference images for the refine call
- **Refine button** — sends canvas image + annotation PNG + prompt + refs to active Google model. Appends "Focus on the annotated area." when strokes exist

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
window.VisionScan       — image description agent (vision.js)
window.CafeSettings     — settings state + modal (settings.js)
window.Workspace        — project persistence (workspace.js)
window.DB               — IndexedDB abstraction (storage.js)
window.CafeDebug        — generation run logger (debug-logger.js)
window.Gallery          — gallery UI (CafeHTML-v2.html inline)
window.ModuleState      — live module state (CafeHTML-v2.html inline)
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
| Prompt Bar + Ref Chips | `Components/prompt-bar.html` | Done — synced to main |
| Module Panel (SUBJECT/STAGE/STYLE) | `CafeHTML-v2.html` inline | Done |
| Gallery + Image HUD | `CafeHTML-v2.html` inline | Done |
| Refine Overlay | `CafeHTML-v2.html` inline | Done |
| Sequence Bar | `CafeHTML-v2.html` inline | Done |

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

---

*Last updated: 2026-05-06*
