# CafeHTML — Rule Book

> **Purpose:** This file is the single source of truth for rules, logic, and design decisions in the CafeHTML project.
> Any agent or developer starting work should read this before touching any file.
> Update this file whenever a new rule is established or an existing one changes.

---

## 1. Project Overview

**CafeHTML** is an AI image/video generation tool — a media & frame builder also referred to as the **Cinematic Organism** creative workstation.

| Property | Value |
|---|---|
| Stack | Plain HTML / CSS / JS only — no frameworks, no React, no Tailwind, no build tools |
| Styles | All inline in `<style>` blocks |
| Main file | `CafeHTML-v2.html` |
| Component files | `CafeHTML/Components/` — each component is a standalone HTML file |
| Assets | `CafeHTML/assets/` — SVG icons only |
| Working directory | `C:\Users\This PC\Gravity` |
| Figma file key | `vLqg3NfHKxZJcJbvrqCNol` |

---

## 2. Design System

### Color Tokens

| Token | Hex | Role |
|---|---|---|
| Orange | `#ea5823` | Primary CTA, active states, selected tabs |
| Blue | `#5271ff` | Secondary actions, inactive UI, borders |
| Gray mid | `#999997` | Neutral/inactive backgrounds |
| Gray light | `#c7c7c7` | Text on dark, borders, inactive labels |

### Typography

| Property | Value |
|---|---|
| Font | `Times New Roman`, serif — ALL labels, everywhere |
| No exceptions | Do not substitute with sans-serif or system fonts |

### Icon Rules

- All icons are `.svg` files in `CafeHTML/assets/`
- **Never use Figma asset URLs** — they expire in 7 days. Recreate in CSS/SVG or save locally.
- Active/inactive icon pairs follow the naming pattern:
  - `icon-eye-on.svg` / `icon-eye-off.svg`
  - `icon-x-active.svg` / `icon-x-inactive.svg`
  - `icon-edit-active.svg` / `icon-edit-inactive.svg`
  - `icon-link.svg` / `icon-unlink-small.svg`
  - `icon-close.svg` (child row X — always this, not `icon-x-active`)

---

## 3. Build Process

1. Every component is built as a **standalone HTML file first** in `CafeHTML/Components/`
2. Name files descriptively: `module.html`, `prompt-bar.html`, `upload-button.html`
3. User reviews and approves the standalone version
4. Only then sync/integrate into `CafeHTML-v2.html`
5. When syncing — do NOT use browser explore agents. Grep/Read target file at insertion points and edit directly.

---

## 4. Module Panel

The **Module Panel** is the core layer management sidebar. It contains, from top to bottom:

1. **Preset Row** — label button + view button + dropdown
2. **Section Slots** (repeatable) — each slot has:
   - A **Subject/Stage switch row** (slot tabs + ON/OFF toggle)
   - One **Parent Layer Row**
   - One or more **Child Layer Rows**
   - A **Style Row**
   - An **Add Child** button
3. **New Layer** button — adds a new Parent Layer

### Panel Dimensions

| Property | Value |
|---|---|
| Width | `264px` |
| Background | `#999997` |
| Border | `1.89px solid #5271ff` |

---

## 5. Parent Layer Row (`.plr`)

**Dimensions:** `263px × 25px`

### Elements (left to right)

| Element | Class | Width | Description |
|---|---|---|---|
| X button | `.plr-x` | 24px | Remove / Reset layer |
| Expand toggle | `.plr-exp` | 24px | Expand/collapse children |
| Layer name | `.plr-name` | 153px | Editable label |
| Link button | `.plr-link` | 24px | Link/unlink layer |
| Eye button | `.plr-eye` | 25px | Show/hide layer |

### States

| State | X | Expand | Name | Link | Eye |
|---|---|---|---|---|---|
| **Active · Linked** | `.blue` | `.orange` | `.blue` | `.linked` | `.on` |
| **Active · Unlinked** | `.blue` | `.orange` | `.blue` | `.unlinked` | `.on` |
| **OFF (hidden)** | `.off` | `.off` | `.gray` | `.off` | `.off` |

When the layer is hidden (eye off), the entire row gets `.layer-off` on `.plr` which grays out X, expand, name, and link via CSS cascade rules.

---

## 6. Child Layer Row (`.clr`)

**Dimensions:** `263px × 25px`  
**Padding:** `0 32px` (indented within parent)

Child rows have 3 distinct **content modes**:

### Mode A — Load (default, empty)

| Element | Class | Notes |
|---|---|---|
| X button | `.clr-x` | Blue |
| Main area | `.clr-main.load` | Shows LOAD button icon |
| T button | `.clr-t.blue` | Activates Prompt mode on click |

### Mode B — Image Loaded

| Element | Class | Notes |
|---|---|---|
| X button | `.clr-x` / `.clr-x.off` | Blue when visible, gray when hidden |
| Main area | `.clr-main.img-a` / `.img-i` | Active/inactive image thumbnail area |
| Edit button | `.clr-edit.a` / `.clr-edit.i` | Pencil icon — for image editing (future feature, placeholder) |
| Eye button | `.plr-eye.on` / `.plr-eye.off` | Toggle visibility |

### Mode C — Prompt Active

| Element | Class | Notes |
|---|---|---|
| X button | `.clr-x` / `.clr-x.off` | Blue when visible, gray when hidden |
| T button | `.clr-t.orange` / `.clr-t.gray` | Orange = visible, gray = hidden — click deactivates back to Load |
| Main area | `.clr-main.prompt-a` / `.prompt-i` | Shows "PROMPT" label |
| Eye button | `.plr-eye.on` / `.plr-eye.off` | Toggle visibility |

---

## 7. Style Row (`.style-row`)

**Height:** `49px` — taller than layer rows (double height)

| Element | Class | Width | Notes |
|---|---|---|---|
| Clear button | `.sty-clear` | 49px | Clears/resets style content |
| Load/image area | `.sty-load` | 154px | Shows LOAD or loaded image |
| T button | `.sty-t` | 47px | Larger version; activates prompt |
| Prompt area | `.sty-prompt` | 154px | Shows PROMPT text when active |
| Edit button | `.sty-edit` | 47px | Edit style image |
| Link button | `.sty-link` | 47px | Link/unlink style reference |

> **No Eye button.** Style row only has 1 layer (the default). Its active/inactive state is inherited from the **Slot ON/OFF** toggle — not controlled per-layer. When the slot is OFF, all style row elements go to their inactive/gray state.

---

## 8. Slot Switch Row (`.subject-row`)

Controls which **subject slot** (A, B, C...) is active and whether that slot is ON or OFF.

| Element | Class | Notes |
|---|---|---|
| Tab buttons | `.btn-subject-a` | One per subject; `.on` = selected |
| Add subject | `.btn-add-subject` | Orange `+` button |
| ON button | `.btn-on` | Orange when slot is ON |
| OFF button | `.btn-off` | Orange when slot is OFF |

**State modifier:** `.slot-is-off` on `.subject-row` swaps ON/OFF visual states via CSS.

---

## 9. Button Interaction Rules

### Eye Button — Show / Hide Layer

- Toggles layer visibility
- When **OFF**: row grays out (X, expand, link all go inactive)
- Does **NOT** remove content — it only hides it visually

### X Button — Remove or Reset

This is the most important rule:

> **The module always maintains a minimum of 1 active parent layer with 1 active child layer.**
> The system will never allow the module to be completely empty.

| Scenario | X on Parent | X on Child |
|---|---|---|
| Multiple parent layers exist | **Removes** entire parent + all its children | — |
| 1 parent · multiple children | Cannot fully remove parent → **Reset** parent | **Removes** that child |
| **1 parent · 1 child** (minimum floor) | **Resets** parent to default state | **Resets** child to Load default |

**Reset to default** means:
- Parent: eye → ON, link → linked, expand → open, name → unchanged
- Child: mode → Load (empty), eye → ON

### T Button — Text / Prompt Toggle

| Location | Default state | Click action |
|---|---|---|
| **Child row · Load mode** | `.clr-t.blue` | → Activates **Prompt mode** |
| **Child row · Prompt mode** | `.clr-t.orange` (visible) / `.gray` (hidden) | → Deactivates back to **Load mode** |
| **Style row** | `.sty-t.blue` | → Activates prompt in style row |

### Edit (Pencil) Button

- **Child row** (`.clr-edit`): Future — will open image edit/refine workflow. Currently a **visual placeholder only**, no click action implemented.
- **Style row** (`.sty-edit`): Same — edit/refine style image. Placeholder.

### Link / Unlink Button

- **Parent row** (`.plr-link`): Linked = layers are synced across subjects. Unlinked = independent per subject.
- **Style row** (`.sty-link`): Linked = style image is shared. Unlinked = per-subject style.
- Toggle: `linked` ↔ `unlinked` classes, icon swaps accordingly.

### Expand / Collapse (`.plr-exp`)

- Orange (`#ea5823`) = active parent, expanded
- Gray = inactive parent
- `.collapsed` class rotates the arrow indicator −90°
- Collapsing hides child rows visually (not yet implemented — rule to implement)

---

## 10. Child Layer State Machine

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

- From **Load**: click LOAD → Image, click T → Prompt
- From **Image**: only Eye toggles. Edit is placeholder.
- From **Prompt**: click T → back to Load. Eye toggles visibility.
- From **any mode**: click X → reset to Load (if minimum floor reached)

---

## 11. Component Registry

| Component | File | Status | Synced to main |
|---|---|---|---|
| Module Panel | `Components/module.html` | In Progress | No |
| Prompt Bar | `Components/prompt-bar.html` | Done | Yes |
| Ref Image Chips | `Components/prompt-bar.html` | Done | Yes |

---

## 12. Decisions Log

| Date | Decision | Reason |
|---|---|---|
| 2026-04-07 | X button resets instead of removes at minimum floor (1 parent + 1 child) | Keeps module always populated; prevents empty/broken state |
| 2026-04-07 | T button activates Prompt mode in child row; Edit button is placeholder | Edit = image refine (future feature); T = prompt layer type toggle |
| 2026-04-07 | Child live row uses render() state machine instead of direct DOM mutation | 3 distinct modes require full layout change, not just class swaps |
| 2026-04-07 | Edit pencil does NOT switch modes | It's an image editing action, not a mode toggle |
| 2026-04-07 | Style row has NO eye button | Visibility is inherited from Slot ON/OFF, not per-layer. Style has only 1 default layer |

---

*Last updated: 2026-04-07 by agent*
*Update this file at the end of every session when new rules are established.*
