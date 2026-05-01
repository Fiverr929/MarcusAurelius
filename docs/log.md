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
