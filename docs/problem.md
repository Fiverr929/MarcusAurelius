# Problem Log

---

## 2026-04-18 — Vision and Prompt (Compiler)

### Issues

1. **Vision output truncated** — Gemini cuts off mid-sentence (e.g. "Here is a description of the clothing in"). `maxOutputTokens` set too low (256).

2. **STYLE module not scanned** — Vision scan only triggers inside `mpFileInput` (SUBJECT/STAGE). The STYLE module uses a separate `mpStyInput` with no vision scan call. STYLE images are passed to the enhancer with no description.

3. **Slots not separated in enhancer** — Multiple active slots (e.g. Slot A = Character 1, Slot B = Character 2) are flattened into a single numbered image list. The enhancer has no awareness that they are independent sets, so multi-character or multi-scene setups won't be described correctly in the final prompt.

4. **Vision scan has no goal context** — The vision prompt asks Gemini to describe an image generically (build, age, features) without telling it WHY. It doesn't know the description will be used to reconstruct the subject in an AI-generated image. So it writes a general description instead of one optimised for image generation.

5. **Custom layer names get no context** — Layer names that don't match known keywords (CHARACTER, OUTFIT, etc.) fall into a generic fallback: "Describe the X in this image." The AI has no idea what role this layer plays in the scene, leading to useless or misdirected descriptions.

6. **Enhancer has no system knowledge** — The enhancer is told "you are a prompt engineer" but knows nothing about CafeHTML's structure. It doesn't know what SUBJECT/STAGE/STYLE mean, that slots are independent sets, that multiple images in one layer are the same subject from multiple angles, or what the generation model expects. It's writing a prompt blind.

7. **Enhancer doesn't know the generation model** — The enhancer has no knowledge of nano-banana-2's specific capabilities or how it interprets positional image references. Without this, it can't write prompts that fully exploit what the model can do.

8. **Vision data is sent twice to the enhancer** — `compilePrompt()` already bakes vision descriptions into a text string (e.g. "character: [vision desc]"). This compiled string is then passed to the enhancer as "user intent." But the enhancer also reads the same vision descriptions again via `collectImageContext()`. The AI receives the same information twice in two different formats — creating confusion and redundancy.

9. **The fal.ai path ignores the enhanced prompt** — The enhancer output (`finalPrompt`) is only used for the Google generation path. The fal.ai gallery cell saves `compiled` (the raw compiled prompt), not `finalPrompt`. So all the enhancer work is wasted on fal.ai.

10. **compilePrompt() and the enhancer are competing** — `compilePrompt()` has carefully written role instructions ("use the person in this reference as the subject — match their face, body type, and build exactly"). The enhancer then rewrites everything from scratch, discarding all that precision. Two systems doing overlapping jobs with no coordination.

11. **The enhancer never sees the actual images** — It only sees text descriptions of images. It's writing a prompt for a visual output without seeing any of the visuals. A human art director would look at the references before writing a brief — the enhancer is working blind.

12. **No feedback loop** — After generation, there is no way for the system to learn what worked. No rating, no iteration, no memory of which prompts produced good results. Every generation starts from zero — the system cannot evolve with the user's taste.

13. **The structured module hierarchy is destroyed before reaching AI** — Slots, layers, children, visibility — all this rich structure gets flattened into a comma-separated string before any AI sees it. The AI never knows that "these 3 images are the same character from different angles" or "Slot A and Slot B are two different people." The structure exists in the UI but is lost before it matters.

15. ~~**No way to reload a frame's module state**~~ — **FIXED.** `info-popup-yes` loads `cell.moduleSnapshot` via `Workspace.applyModuleState()`. Load button shown/hidden based on snapshot presence.

16. ~~**Favourites are not persisted**~~ — **REMOVED.** Favourites feature removed as unnecessary.

17. **Vision scan has no UI feedback** — No indicator when a scan is running, completed, or failed. If it fails silently, generation proceeds with no description and the user has no idea why results are poor.

18. **Prompt bar and module state can silently contradict** — Prompt bar says "dark moody night" but STAGE module has a bright beach photo. They conflict with no warning. Bad outputs, no explanation.

19. ~~**Gallery cell doesn't record which images were used**~~ — **FIXED.** `usedImages` stored per cell and rendered as thumbnails in `info-ref-strip` in the info panel.

20. **PRECISE and CREATIVE are too shallow** — Currently PRECISE adds one line ("be specific, controlled, and detailed") and CREATIVE adds one line ("allow creative interpretation"). This is cosmetic — it doesn't actually change how the enhancer reasons about the structure. PRECISE should mean: lock every reference exactly, no interpretation, prioritise accuracy over composition. CREATIVE should mean: treat references as inspiration, allow the AI to reinterpret, blend loosely, add artistic direction. The difference needs to run deep through the entire prompt — not just a single instruction line.

21. **No vision scan cache** — Every time the user clicks Generate, all images in all active layers are re-scanned from scratch. There is no check for whether an image has already been scanned and nothing has changed. This is unnecessary API cost and latency on every single generation.

22. **Global Reference images have no vision scan** — R1-R5 images uploaded to the reference bar (`refState`) are sent to the generation API as images but have no vision description attached. No scan mechanism exists for them. The generation model receives unnamed, undescribed reference images with no context about what they are.

23. **Enhancer's "user intent" input is the wrong data** — The enhancer receives the pre-compiled prompt string from `compilePrompt()` as its "user intent" parameter. This means the Creative Director never reads what the user actually typed in the prompt bar. The raw user text is available at `payload.prompt` but is never passed directly. The AI is reading a machine-compiled summary of intent, not the user's actual words.

---

## 2026-04-20 — Image Manifest Architecture (Resolution for issues 3, 8, 11, 13)

**Root problem identified:** The enhancer writes positional image references ("use image 2 as character") but has no contract with the API about what image is actually at position 2. They are built independently. Any reorder, addition, or removal of module images silently breaks the enhancer's prompt.

**Resolution: Build the image manifest first, pass it to the enhancer.**

**New flow:**
1. Assemble ordered image list (fixed priority: module images > global refs)
2. Build a manifest: `Image 1 = R1 (full scan: red dress, beach, warm light), Image 2 = CHARACTER Slot A (young woman, dark hair), Image 3 = STYLE ref (film noir, high contrast)`
3. Pass manifest to enhancer before it writes a single word
4. Enhancer writes prompt with real positional accuracy — references image numbers it actually knows
5. API receives same ordered image list + that prompt — they are guaranteed to match

**What this also resolves:**
- Issue 3 (slots not separated): manifest entries are labelled by slot and layer — enhancer knows "these 3 images are the same character from Slot A"
- Issue 8 (vision data sent twice): manifest is the single source — compiled string no longer passed as "user intent"
- Issue 11 (enhancer never sees images): manifest is a full visual brief built from vision scans — functionally equivalent to seeing the images
- Issue 13 (structure destroyed before AI): slot/layer/child hierarchy survives into the manifest — AI finally sees it

**R1-R5 global reference integration:**
- R1-R5 are user-facing labels for global ref bar images
- In the manifest they appear as numbered entries with their full vision scan
- If user types "R1" in the prompt bar, compiler looks up the manifest entry and resolves it to the correct image position
- Deduplication: if R1 and a module layer contain the same image, they get one manifest entry — no double scan, no double send

---

## Video Consistency — Deferred (Not fixing now)

**V1. Sequence bar loses all context for video** — When a frame is added to the Sequence Bar, only the image URL is stored. The module state, references, prompt, and settings that produced that frame are not attached. When frames travel to the Video tab, there is no record of which CHARACTER, STAGE, or STYLE was used — making shot-to-shot consistency impossible to enforce programmatically. Fix when Video tab is being built.



