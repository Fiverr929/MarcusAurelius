# CafeHTML — Claude Rules

## What CafeHTML Is
An AI media creation tool with two distinct modes. Not a simple image generator — a structured reference-based generation system.

## The Two Modes — DO NOT CONFUSE THEM
- **FRAME mode** (orange `#ea5823`) — image generation. User builds a scene using modules + references → generates a still image. This is what's being actively built.
- **SCENE mode** (blue `#5271ff`) — shot creation for video models. Video models accept input scene by scene. Each scene built separately. **NOT being built yet — do not touch SCENE mode logic.**

## Module Architecture — Read Before Touching Any Compiler Code

The right panel has three sections: SUBJECT, STAGE, STYLE.

Hierarchy:
```
SECTION (subject / stage / style)
  └── SLOT (A, B, C... up to 7) — independent sets, each has on/off
        └── LAYER GROUP (parent) — user-named, has visibility toggle
              └── CHILD (clr) — image upload OR text prompt, has own visibility
```

Rules:
- Multiple slots in same section = **independent sets** (not same thing from multiple angles)
- Multiple image children in same layer = **multiple views of the same thing**
- Layer names are user-editable — "CHARACTER", "OUTFIT", "Donkey" are all valid
- `window.ModuleState = { subject, stage, style }` — live state, each section has `{ selected, slots: [{on, html}] }`

## Global References
- `refState = { FRAME: [], SCENE: [] }` — mode-specific, up to 5 per mode
- Uploaded via prompt bar `+` button — these are NOT module images
- Passed as `payload.refs` — sent first in the image URL array to fal.ai

## Planned Prompt Pipeline (not yet built — this is what's coming next)

Replacing the current flat `compilePrompt()` with a 3-stage pipeline:
1. **Vision Scan** — vision model scans each uploaded image with layer context (CHARACTER → describe person, OUTFIT → describe clothing only, BACKGROUND → describe environment/ignore subjects). Description stored in child state. User can specify fragment focus.
2. **LLM Enhancer** — reads full module structure + descriptions + user prompt + PRECISE/CREATIVE mode → writes a structured nano-banana-2 prompt with positional image references ("the person in image 1, 2, 3")
3. **nano-banana-2 generation** — enhanced prompt + ordered image array

API key for vision/LLM enhancer: decision pending — either Claude API or fal.ai text model.

## Prompt Settings
- **PRECISE** = default (`data-active-output="PRECISE"`)
- **CREATIVE** = manual switch
- Affects how the LLM enhancer writes prompts

## Project
- Figma file key: `vLqg3NfHKxZJcJbvrqCNol`
- Main file: `CafeHTML-v2.html`
- Component files: `Components/` — standalone HTML per component
- Logic files: `logic/api.js`, `logic/prompt-builder.js`, `logic/settings.js`, `logic/workspace.js`

## Stack
- Plain HTML / CSS / JS only — no frameworks, no React, no Tailwind, no build tools
- All styles inline in `<style>` blocks
- No external dependencies unless explicitly requested

## Figma-to-Code Workflow
1. Fetch design using `get_design_context`
2. Describe the visual in plain terms before writing any code
3. Wait for user confirmation before proceeding
4. Screenshot is the source of truth — not Figma's generated code
5. NEVER use Figma asset URLs — they expire. Recreate with CSS or inline SVG.

## Component Build Process
1. Build every component as a standalone HTML file first in `C:\Users\This PC\Gravity`
2. User reviews and approves the standalone version
3. Only then integrate into `CafeHTML-v2.html`

## Code Style
- Follow existing patterns in `CafeHTML-v2.html` (absolute positioning, pixel values from Figma)
- Color tokens: orange `#ea5823`, blue `#5271ff`, gray `#999997`, light gray `#c7c7c7`, off-white `#e8e6e6`
- No extra comments, no docstrings, no unnecessary abstractions
- Don't add features beyond what was asked

## Communication
- User is a designer — explain technical decisions in plain language
- Keep responses short and direct
- Never go ahead and build without visual confirmation first

## Plan Mode — Ask First
- Always use AskUserQuestion in plan mode before writing the plan when behavior is ambiguous
- Ask about: exact visual/interaction intent, whether Figma should be checked, edge cases for new states, whether the change affects other components
- Do not assume visual behavior — "deactivate", "disable", "hide", "gray out" all mean different things

## Syncing Components to Main File
- When syncing from a component file into `CafeHTML-v2.html`, do NOT launch explore agents
- The diff is already known — just Grep/Read the target file at insertion points and edit directly
- Agents for sync tasks waste credits
