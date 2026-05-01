# CafeHTML — Future Ideas

A running log of features, concepts, and architectural directions discussed but not yet built.
Add to this file whenever a new idea comes up. Nothing here is scheduled — just captured.

---

## 11. Readable Generation Log + Training Data Export

**What:** A dedicated log store in IndexedDB that captures every vision scan and generation event. A simple export button dumps it as a JSON file that can be read or fed into model training.

**Each log entry captures:**
- Input image (reference by URL)
- Layer name and section
- Vision prompt sent to Gemini
- Description returned
- Final generation brief (Creative Director output)
- Model used, settings, date

**Why it matters:**
- Makes the pipeline inspectable — see exactly what the vision model is outputting without opening DevTools
- Fixes issue 22 (ref vision descriptions lost on reload) as a side effect — log is the persistent record
- Enables few-shot learning (idea #2) — log + ratings = training dataset
- Export format: JSON lines, one entry per generation, readable outside the browser

**Dependencies:** Rating system on gallery cells (idea #2 Track A) makes the log useful for training. Build log first, ratings second.

---

## 10. The Full Product Vision — Image → Video → Audio → Timeline → Ideator

CafeHTML is not an image generator. It is a **creative pipeline** modelled after DaVinci Resolve's workflow logic but built for AI generation.

**Tab 1 — Image** *(current)*
User builds structured scenes using the module system (SUBJECT/STAGE/STYLE), generates still frames, reviews in the gallery. Selected/approved images are dropped into the **Sequence Bar**. The Sequence Bar is the handoff point — chosen keyframes travel to the next stage.

**Tab 2 — Video** *(next)*
Receives only the frames from the Sequence Bar. Each frame becomes a shot. The system sends structured prompts shot-by-shot (not 60fps — keyframe-by-keyframe) to a video model (Kling, Runway ML etc.) which interpolates motion between them. CHARACTER/STAGE references locked across all shots solve the consistency problem that breaks every current AI video generator.

**Tab 3 — Audio** *(future)*
Scoring, voiceover, sound design layered onto the video output.

**Tab 4 — Timeline** *(future)*
Final assembly. Video clips, audio tracks, transitions. The edit layer.

**The Ideator** *(long-term)*
An autonomous entity that drives the entire pipeline from a single brief. User describes a concept → Ideator builds the module state, generates frames, sequences shots, generates video, adds audio, assembles the timeline. Fully automated creative production from intent to output.

---

## 1. Vector Embeddings

**What:** Convert each module layer (SUBJECT, STAGE, STYLE) into vector embeddings instead of plain text compilation. Blend vectors semantically before sending to the model.

**Why it matters:**
- Enables true semantic blending of layers — not just string concatenation
- Powers conflict detection (cosine similarity between subject and prompt bar)
- Enables smart layer ordering by semantic relevance
- Foundation for style matching (find closest text description for a loaded image)

**Where it plugs in:**
- As a scoring/ordering layer on top of the existing `prompt-builder.js` `collect()` output
- Current structured object output already designed to support this

**Sub-ideas:**
- Conflict detection: embed subject + prompt bar text, flag if cosine similarity is too low (Director feature)
- Smart layer ordering: higher semantic relevance = higher position in compiled prompt
- Style matching: given a style image, auto-suggest prompt language from a known style vector library

---

## 2. Small LLM Training / Few-Shot Learning

**What:** Use generation history + user ratings to make CafeHTML smarter about your personal taste over time.

**Two tracks:**

### Track A — Few-Shot Learning (no weight updates)
Store every generation (prompt, module state, settings, rating). Before each new generation, a small LLM reads the last 10-20 generations as context and adjusts the compiled prompt to match your patterns.
- Works in browser with any LLM API (Claude Haiku, Gemini Flash, Ollama)
- Needs: rating system on gallery cells + generation history log (already partially in localStorage)

### Track B — Fine-Tuning (true training)
Feed prompt + result + rating back into a small LLM to adjust its weights. Model literally learns your taste.
- Requires local model runner (Ollama, llama.cpp) or fine-tuning API
- Requires Next.js backend — not possible in plain HTML
- Long-term, post-migration feature

**What needs to be built first:**
- Rating system on gallery cells (thumbs up/down or 1-5 stars) stored with each cell
- Generation history log persisted in localStorage/`.cafe` file

---

## 3. API Upgrade — Image Reference Support

**What:** Upgrade from Pollinations basic URL API to an API that supports image inputs (ip-adapter / img2img style).

**Why it matters:**
- Currently image layers in the module panel can't influence generation — text only
- Unlocks the "Frankenstein Identity Locking" feature (load face + outfit separately, AI dresses exact face in exact outfit)
- Unlocks precise style transfer from loaded style images

**Candidate APIs:**
- Replicate (supports ip-adapter, ControlNet, img2img)
- fal.ai (fast, supports image inputs)
- Stability AI API

**Architecture note:**
- `pendingRefs` already included in `collect()` payload — image layers are flagged and stored, just not sent yet
- When API is upgraded, `api.js` reads `pendingRefs` and includes them in the request

---

## 4. The Witty Director (Conflict Detection Agent)

**What:** A background AI agent (Gemini Flash or Claude Haiku) that reads the full module state before generation and flags issues in the entity strip.

**Example conflicts it would catch:**
- Subject has brightly lit beach photo but prompt says "dark moody night" → LIGHTING MISMATCH
- STAGE slot A and B both ON at same time → SCENE CONFLICT
- Style set to Precise but subject layers are all empty → NOTHING TO LOCK

**Where it shows up:**
- Top entity strip with a `[CONFLICT]` tag
- Non-blocking — user can dismiss and generate anyway

**Dependency:** Vector embeddings (idea #1) make conflict detection more accurate

---

## 5. Video Tab

**What:** Build out the VIDEO mode UI (currently placeholder tab).

**Planned features:**
- Timeline editor
- Frame sequencing (the sequence bar already exists)
- Motion prompts per frame
- Audio API integration (ElevenLabs, AssemblyAI)
- Video generation APIs (Runway ML, Kling, Replicate video models)

**Note:** Module bar carries over — SUBJECT/STAGE/STYLE apply to video too, with motion layer added

---

## 6. Next.js Migration

**What:** Move CafeHTML from plain HTML/CSS/JS to Next.js for real backend support.

**Why:**
- Real API routes (`/api/generate-image`, `/api/generate-video`)
- Auth (when multi-user support is needed)
- Database (Supabase) for persistent generation history across devices
- File storage (Cloudflare R2 / AWS S3) for generated images/videos

**Migration path:**
- HTML structure → JSX
- `<style>` blocks → CSS modules
- `<script>` logic → React hooks/components
- `logic/` folder (prompt-builder, api, workspace) → imported directly, minimal rewrite

**Timing:** After image tab is feature-complete and video tab is designed

---

## 7. Gallery Filter/Sort — Make It Actually Work

**What:** The filter dropdown UI (Sort, Ratio, Type, Show) exists but chips don't filter the grid yet.

**What needs wiring:**
- Sort: newest/oldest → reorder CELLS array
- Ratio: filter by `cell.ratio`
- Type: filter by `cell.type` (Image/Video)
- Show: favorites filter using `favSet`

---

## 9. Variation Batching — Requests Over API Limit

**What:** fal.ai models cap `num_images` at 4 per request. If the user selects more than 4 variations (via custom entry), split into multiple parallel requests of max 4 each (e.g. 6 = one batch of 4 + one batch of 2). Each batch spawns its own set of loading cells and runs concurrently via `Promise.all`. Result cells fill in as each batch completes.

**Where:** `generate()` in `logic/api.js` — detect `numImages > 4`, slice into batches, run each through `falQueue` independently.

---

## 8. Workspace Save v2 — Module Panel State

**What:** Currently autosave only saves gallery cells and settings. The SUBJECT/STAGE/STYLE layers reset on every page open.

**What needs to be added:**
- Expose `slotStates` from `makeSection()` IIFEs via `window.ModuleState`
- Serialize full module state into `.cafe` snapshot
- Restore module state on load (rebuild DOM from saved data)
