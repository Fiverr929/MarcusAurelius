# MarcusAurelius

Client-side rendering pipeline with modular prompt composition, multi-modal inference routing, and async token stream handling. No build step. No dependencies. Opens in browser.

---

## Current Build

Single-file architecture (`MarcusAurelius.html`) backed by a `logic/` module layer. Settings and state are managed client-side via `localStorage`. All inference calls are routed through a keyed endpoint configured at runtime.

```
MarcusAurelius.html
│
├── logic/
│   ├── api.js            — inference routing + retry logic
│   ├── enhancer.js       — pre-processing pipeline
│   ├── prompt-builder.js — compositional token assembly
│   ├── vision.js         — multi-modal input handling
│   ├── workspace.js      — session + state management
│   ├── settings.js       — runtime config + key binding
│   ├── storage.js        — persistence layer
│   └── debug-logger.js   — structured event logging
│
└── Components/
    └── settings-modal.html
```

---

## Pipeline Flow

```
Input
  │
  ▼
[prompt-builder]  ←──  [enhancer]
  │
  ▼
[api.js]  ──→  Endpoint
  │
  ▼
[workspace]  ──→  Rendered Output
  │
  └──→  [debug-logger]
```

---

## Current Complexity

- **Retry handling** — 429 rate-limit responses are caught and retried with backoff inside `api.js`. Still brittle under burst load.
- **Vision routing** — `vision.js` handles base64 input parsing and passes to the inference layer. Mime type detection is manual.
- **Prompt composition** — `prompt-builder.js` assembles context dynamically. Token length is not currently capped, which can cause silent failures at the endpoint.
- **State isolation** — workspace state lives in memory and `localStorage`. No sync between tabs. Refreshing mid-session can drop unsaved context.
- **Single file constraint** — `CafeHTML-v2.html` carries inline logic that hasn't been fully offloaded to modules yet. Causes duplication with some `logic/` functions.

---

## Setup

1. Open `MarcusAurelius.html` in any modern browser
2. Go to Settings and enter your endpoint key
3. No install, no server, no build

---

## Status

Active development. Build is functional but not hardened. Module separation is ongoing.
