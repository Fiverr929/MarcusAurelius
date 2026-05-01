# Agentic Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the CafeHTML generation pipeline so the Creative Director's output reaches both providers, vision scans are extraction-focused and cached, the manifest carries full slot/layer structure, and dead competing code is removed.

**Architecture:** Surgical fixes across 4 existing files plus two new scan hooks in the HTML. No new files. The manifest concept already exists in `collectImageContext()` — it just needs slot labels, ref descriptions, and style descriptions added. The Creative Director replaces `compilePrompt()` entirely.

**Tech Stack:** Vanilla JS, Gemini 2.5 Flash (vision + enhancer), fal.ai + Google Gemini (generation)

---

## File Map

| File | What changes |
|---|---|
| `logic/vision.js` | maxOutputTokens fix, style prompt, describeRef, describeStyle, cache validation, PRECISE/CREATIVE threading |
| `logic/enhancer.js` | Fix user intent input, slot labels in manifest, ref/style descriptions, Creative Director system prompt, deeper PRECISE/CREATIVE, higher token limit, return `{ prompt, manifest }` |
| `logic/api.js` | Remove dead code (compilePrompt, SUBJECT_ROLES, STAGE_ROLES), fix buildPayload to accept finalPrompt, fix fal.ai to use finalPrompt, attach manifest to gallery cell |
| `CafeHTML-v2.html` | Add vision scan to STYLE input, add vision scan to ref chip upload, add data-vision-src cache attribute |
| `logic/workspace.js` | Save manifest with gallery cell in hookGallery DB save |

---

## Task 1: Fix Vision Agent — token limit + cache + style + ref scans

**Files:**
- Modify: `logic/vision.js`

- [ ] **Step 1: Fix maxOutputTokens and add cache validation to `describe()`**

Replace the entire `vision.js` with:

```js
// vision.js
window.VisionScan = (function () {

  var MODEL = 'gemini-2.5-flash';

  var SUBJECT_PROMPTS = {
    'CHARACTER': 'Describe the person in this image for use as a reference in AI image generation. Cover: physical build, approximate age, facial features, hair color and style, skin tone. Be specific and concise.',
    'OUTFIT':    'Describe only the clothing in this image for use as a wardrobe reference. List each garment, its color, material, style, and fit. Do not describe the person wearing it.',
    'FACE':      'Describe the face in this image for use as a face reference. Cover: structure, eyes, nose, lips, skin tone, and any distinctive features.',
    'HAIR':      'Describe only the hairstyle in this image for use as a hair reference. Cover: length, color, texture, and style. Ignore everything else.',
    'CAP':       'Describe only the headwear in this image. Cover: type, color, and style. Ignore the person wearing it.',
    'PROP':      'Describe only the main object or prop in this image. Cover: what it is, its appearance, color, and notable details.'
  };

  var STAGE_PROMPTS = {
    'BACKGROUND':  'Describe only the background environment in this image for use as a scene reference. Cover: setting, colors, atmosphere, and lighting. Ignore any people or subjects.',
    'LOCATION':    'Describe the location in this image. Cover: type of place, architecture or geography, time of day, and atmosphere.',
    'LIGHTING':    'Describe only the lighting in this image. Cover: source, direction, color temperature, and mood.',
    'ENVIRONMENT': 'Describe the environment in this image. Cover: setting, weather, atmosphere, and surrounding elements.',
    'PROP':        'Describe the main prop or object in this image. Cover: what it is, appearance, color, and notable details.'
  };

  var STYLE_PROMPT = 'Describe the visual style of this image for use as a style reference in AI image generation. Cover: photographic vs illustrated, colour grading, texture, lighting style, mood, and overall aesthetic. Do not describe the subject matter — only the visual treatment.';

  var REF_PROMPT = 'Describe everything in this image that would help reconstruct it as an AI generation reference: the subject (if any), the environment, the lighting, the colour palette, the mood, and the visual style. Be thorough but concise.';

  function modeSuffix(outputType) {
    if (outputType === 'REMIX') return ' Prioritise mood, feeling, and artistic impression over exact detail.';
    return ' Be exact and specific. Prioritise measurable details.';
  }

  function buildPrompt(layerName, section, outputType) {
    var name = (layerName || '').toUpperCase().trim();
    var base = '';
    if (section === 'subject' && SUBJECT_PROMPTS[name]) base = SUBJECT_PROMPTS[name];
    else if (section === 'stage' && STAGE_PROMPTS[name]) base = STAGE_PROMPTS[name];
    else base = 'Describe the ' + (layerName || 'subject') + ' in this image for use as an AI generation reference. Cover its appearance, colors, and key visual details. Be concise.';
    return base + modeSuffix(outputType);
  }

  function callGemini(apiKey, prompt, base64, mimeType) {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + apiKey;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]}],
        generationConfig: { maxOutputTokens: 512 }
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var text = data.candidates &&
                 data.candidates[0] &&
                 data.candidates[0].content &&
                 data.candidates[0].content.parts &&
                 data.candidates[0].content.parts[0] &&
                 data.candidates[0].content.parts[0].text;
      if (!text) throw new Error('[VisionScan] Empty response');
      return text.trim();
    });
  }

  function parseDataUrl(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    var mimeMatch = dataUrl.match(/^data:([^;]+);/);
    var mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    return { base64: base64, mimeType: mimeType };
  }

  function describe(base64DataUrl, layerName, section, outputType) {
    var apiKey = window.CafeSettings.getGoogleApiKey();
    if (!apiKey) return Promise.reject(new Error('[VisionScan] No Google API key'));
    var parsed = parseDataUrl(base64DataUrl);
    if (!parsed.base64) return Promise.reject(new Error('[VisionScan] Invalid image data'));
    return callGemini(apiKey, buildPrompt(layerName, section, outputType), parsed.base64, parsed.mimeType);
  }

  function describeStyle(base64DataUrl, outputType) {
    var apiKey = window.CafeSettings.getGoogleApiKey();
    if (!apiKey) return Promise.reject(new Error('[VisionScan] No Google API key'));
    var parsed = parseDataUrl(base64DataUrl);
    if (!parsed.base64) return Promise.reject(new Error('[VisionScan] Invalid image data'));
    return callGemini(apiKey, STYLE_PROMPT + modeSuffix(outputType), parsed.base64, parsed.mimeType);
  }

  function describeRef(base64DataUrl, outputType) {
    var apiKey = window.CafeSettings.getGoogleApiKey();
    if (!apiKey) return Promise.reject(new Error('[VisionScan] No Google API key'));
    var parsed = parseDataUrl(base64DataUrl);
    if (!parsed.base64) return Promise.reject(new Error('[VisionScan] Invalid image data'));
    return callGemini(apiKey, REF_PROMPT + modeSuffix(outputType), parsed.base64, parsed.mimeType);
  }

  return { describe: describe, describeStyle: describeStyle, describeRef: describeRef };

})();
```

- [ ] **Step 2: Initialise the global ref vision cache**

In `CafeHTML-v2.html`, find the line where `window.refState` is initialised (search for `refState = {`). Directly below it add:

```js
window.refVisionCache = {};
```

- [ ] **Step 4: Open the browser and confirm vision.js loads without errors**

Open `CafeHTML-v2.html` in browser. Open console. Confirm no errors on load. Type `window.VisionScan` — should return the object with `describe`, `describeStyle`, `describeRef`.

- [ ] **Step 5: Commit**

```
git add logic/vision.js CafeHTML-v2.html
git commit -m "fix: vision agent — token limit, style/ref scan, PRECISE/CREATIVE threading"
```

---

## Task 2: Add vision scan to STYLE image upload

**Files:**
- Modify: `CafeHTML-v2.html`

- [ ] **Step 1: Find the STYLE image upload handler**

Search for `mpStyInput` in `CafeHTML-v2.html`. Find the `FileReader` onload block where `slotStates[selected].imgUrl` is set.

- [ ] **Step 2: Add scan call after image loads**

After the line that sets `slotStates[selected].imgUrl = evt.target.result`, add:

```js
var _imgUrl = evt.target.result;
var _outputType = (window.CafeSettings && window.CafeSettings.getOutputType && window.CafeSettings.getOutputType()) || 'PRECISE';
window.VisionScan.describeStyle(_imgUrl, _outputType)
  .then(function (desc) {
    slotStates[selected].visionDesc = desc;
  })
  .catch(function () {
    slotStates[selected].visionDesc = '';
  });
```

- [ ] **Step 3: Verify in browser**

Upload an image to the STYLE module. Open console, type `window.ModuleState.style` and check the selected slot has a `visionDesc` field populated after a moment.

- [ ] **Step 4: Commit**

```
git add CafeHTML-v2.html
git commit -m "fix: add vision scan to STYLE image upload"
```

---

## Task 3: Add vision scan to Global Reference chip upload

**Files:**
- Modify: `CafeHTML-v2.html`

- [ ] **Step 1: Find the ref chip upload handler**

Search for `refState[mode].push` or `refState[mode]` assignment in `CafeHTML-v2.html`. This is where ref images are added after a file is selected.

- [ ] **Step 2: Add scan call after ref image loads**

The ref upload handler is around line 4110 in `CafeHTML-v2.html`. The existing code is:

```js
reader.onload = function (evt) {
  if (refState[mode].length < 5) {
    refState[mode].push(evt.target.result);
    renderChips();
    if (window.Workspace) window.Workspace.autosave();
  }
};
```

Replace it with:

```js
reader.onload = function (evt) {
  if (refState[mode].length < 5) {
    var _refUrl = evt.target.result;
    refState[mode].push(_refUrl);
    renderChips();
    if (window.Workspace) window.Workspace.autosave();
    var _outputType = (window.CafeSettings && window.CafeSettings.getOutputType) ? window.CafeSettings.getOutputType() : 'PRECISE';
    window.VisionScan.describeRef(_refUrl, _outputType)
      .then(function (desc) { window.refVisionCache[_refUrl] = desc; })
      .catch(function ()    { window.refVisionCache[_refUrl] = ''; });
  }
};
```

- [ ] **Step 3: Verify in browser**

Upload a ref chip. Open console, type `window.refVisionCache` — should show an entry keyed by the image data URL with a description value after a moment.

- [ ] **Step 4: Commit**

```
git add CafeHTML-v2.html
git commit -m "fix: add vision scan to global reference chip upload"
```

---

## Task 4: Rewrite the Manifest Builder and Creative Director

**Files:**
- Modify: `logic/enhancer.js`

- [ ] **Step 1: Replace enhancer.js entirely**

```js
// enhancer.js
window.PromptEnhancer = (function () {

  var MODEL = 'gemini-2.5-flash';

  function collectImageContext(payload) {
    var items = [];
    var position = 1;

    var refs = payload.refs || [];
    refs.forEach(function (imgUrl) {
      var desc = (window.refVisionCache && window.refVisionCache[imgUrl]) || null;
      items.push({ position: position++, role: 'REFERENCE', slot: null, section: 'ref', layerName: 'REFERENCE', desc: desc, imgUrl: imgUrl });
    });

    function fromSection(section) {
      if (!section || !section.slots) return;
      section.slots.forEach(function (slot) {
        if (!slot.active) return;
        var slotLabel = slot.label || '?';
        slot.layers.forEach(function (layer) {
          if (!layer.visible) return;
          var imageChildren = layer.children.filter(function (c) { return c.visible && c.type === 'image' && c.imgUrl; });
          var total = imageChildren.length;
          imageChildren.forEach(function (child, idx) {
            var desc = child.visionDesc || null;
            var angleNote = total > 1 ? ' (view ' + (idx + 1) + ' of ' + total + ' — same subject)' : '';
            items.push({
              position:  position++,
              role:      layer.name || 'LAYER',
              slot:      slotLabel,
              section:   slot.section || 'subject',
              layerName: layer.name || 'LAYER',
              desc:      desc ? desc + angleNote : null,
              imgUrl:    child.imgUrl
            });
          });
        });
      });
    }

    fromSection(payload.subject);
    fromSection(payload.stage);

    var style = payload.style;
    if (style && style.slots) {
      var sSlot = style.slots[style.selected || 0];
      if (sSlot && sSlot.active && sSlot.linked && sSlot.mode === 'image' && sSlot.imgUrl) {
        items.push({
          position:  position++,
          role:      'STYLE',
          slot:      null,
          section:   'style',
          layerName: 'STYLE',
          desc:      sSlot.visionDesc || null,
          imgUrl:    sSlot.imgUrl
        });
      }
    }

    return items;
  }

  function buildSystemPrompt(userIntent, imageContext, outputType) {
    var isPrecise = outputType !== 'REMIX';
    var lines = [];

    lines.push('You are the Creative Director for an AI image generation system called CafeHTML.');
    lines.push('');
    lines.push('How the system works:');
    lines.push('- Users build scenes using structured modules: SUBJECT (who or what), STAGE (where and when), STYLE (how it looks)');
    lines.push('- Each module has slots (A, B, C...) — slots in the same section are INDEPENDENT sets, not the same subject');
    lines.push('- Multiple images in the same layer are the SAME subject from different angles');
    lines.push('- The generation model is nano-banana-2, which follows this formula: Subject → Scene → Style');
    lines.push('- Reference images are sent to the model numbered by position — you must use these numbers');
    lines.push('');

    if (isPrecise) {
      lines.push('Mode: PRECISE');
      lines.push('Lock every reference exactly as described. Match faces, outfits, and environments with no deviation.');
      lines.push('Prioritise accuracy over composition. Do not invent details not present in the references.');
    } else {
      lines.push('Mode: CREATIVE');
      lines.push('Treat references as creative inspiration, not strict rules. Blend loosely.');
      lines.push('Allow the generation model to interpret, recompose, and add artistic direction.');
      lines.push('Mood and feeling matter more than exact matching.');
    }

    lines.push('');
    lines.push('Your job: read the image manifest and the user\'s intent, then write ONE generation brief.');
    lines.push('Reference images by their position number where relevant (e.g. "the person in image 1", "styled as image 3").');
    lines.push('Output ONLY the brief. No labels, no explanation, no preamble.');
    lines.push('');

    if (imageContext.length) {
      lines.push('Image manifest:');
      imageContext.forEach(function (img) {
        var line = img.position + '. [' + img.role + (img.slot ? ' — Slot ' + img.slot : '') + ']';
        if (img.desc) line += ' — ' + img.desc;
        else line += ' — (no description available)';
        lines.push(line);
      });
      lines.push('');
    }

    lines.push('User intent: ' + (userIntent || '(none)'));
    lines.push('');
    lines.push('Generation brief:');

    return lines.join('\n');
  }

  function enhance(payload) {
    var apiKey = window.CafeSettings.getGoogleApiKey();
    if (!apiKey) return Promise.reject(new Error('[PromptEnhancer] No Google API key'));

    var imageContext = collectImageContext(payload);
    var outputType   = (payload.settings && payload.settings.outputType) || 'PRECISE';
    var userIntent   = payload.prompt || '';
    var promptText   = buildSystemPrompt(userIntent, imageContext, outputType);

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + apiKey;

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { maxOutputTokens: 1024 }
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var text = data.candidates &&
                 data.candidates[0] &&
                 data.candidates[0].content &&
                 data.candidates[0].content.parts &&
                 data.candidates[0].content.parts[0] &&
                 data.candidates[0].content.parts[0].text;
      if (!text) throw new Error('[PromptEnhancer] Empty response');
      return { prompt: text.trim(), manifest: imageContext };
    });
  }

  return { enhance: enhance };

})();
```

- [ ] **Step 2: Verify in browser console**

Open `CafeHTML-v2.html`. Type `window.PromptEnhancer` — should return object with `enhance`. Type `window.PromptEnhancer.enhance` — should be a function.

- [ ] **Step 3: Commit**

```
git add logic/enhancer.js
git commit -m "fix: Creative Director — slot labels, correct user intent, deeper PRECISE/CREATIVE, return manifest"
```

---

## Task 5: Fix api.js — remove dead code, unify prompt path, attach manifest

**Files:**
- Modify: `logic/api.js`

- [ ] **Step 1: Remove dead code**

Delete the following from `api.js`:
- The entire `SUBJECT_ROLES` object (lines 28–35)
- The entire `STAGE_ROLES` object (lines 37–43)
- The entire `compilePrompt()` function (lines 45–89)
- The `processSection()` function inside it is removed along with it

- [ ] **Step 2: Fix `buildPayload()` to accept finalPrompt as parameter**

Change the function signature from:
```js
function buildPayload(model, payload) {
  var ratio = payload.settings.aspectRatio || '1:1';
  var dims = dimsFromRatio(ratio);
  var finalPrompt = compilePrompt(payload);
```

To:
```js
function buildPayload(model, payload, finalPrompt) {
  var ratio = payload.settings.aspectRatio || '1:1';
  var dims = dimsFromRatio(ratio);
```

- [ ] **Step 3: Fix `generate()` — use enhancer result correctly**

Find the `enhancePromise` block in `generate()`. Change:

```js
var compiled = compilePrompt(payload);
if (!compiled) compiled = payload.prompt || '';
if (!compiled) {
  console.warn('[CafeAPI] No prompt text...');
  return;
}

var enhancePromise = window.PromptEnhancer
  ? window.PromptEnhancer.enhance(payload, compiled).catch(function () { return compiled; })
  : Promise.resolve(compiled);

enhancePromise.then(function (finalPrompt) {
```

To:

```js
var rawPrompt = payload.prompt || '';

var enhancePromise = window.PromptEnhancer
  ? window.PromptEnhancer.enhance(payload).catch(function () { return { prompt: rawPrompt, manifest: [] }; })
  : Promise.resolve({ prompt: rawPrompt, manifest: [] });

if (!rawPrompt && !(payload.refs && payload.refs.length) && !hasModuleImages(payload)) {
  console.warn('[CafeAPI] No prompt text and no images — type something or add module layers.');
  return;
}

enhancePromise.then(function (enhanced) {
  var finalPrompt = enhanced.prompt;
  var manifest    = enhanced.manifest;
```

- [ ] **Step 4: Add `hasModuleImages()` helper**

Before `generate()`, add:

```js
function hasModuleImages(payload) {
  function checkSection(section) {
    if (!section || !section.slots) return false;
    return section.slots.some(function (slot) {
      return slot.active && slot.layers.some(function (layer) {
        return layer.visible && layer.children.some(function (c) {
          return c.visible && c.type === 'image' && c.imgUrl;
        });
      });
    });
  }
  return checkSection(payload.subject) || checkSection(payload.stage);
}
```

- [ ] **Step 5: Fix fal.ai path to use finalPrompt and attach manifest to cell**

Find the `buildPayload` call in the fal.ai path:
```js
var requestBody = buildPayload(model, payload);
```
Change to:
```js
var requestBody = buildPayload(model, payload, finalPrompt);
```

Find the fal.ai `resolveOne` function. Change:
```js
prompt: compiled,
```
To:
```js
prompt: finalPrompt,
manifest: manifest,
```

- [ ] **Step 6: Attach manifest to Google path cell**

Find the Google path cell object. Add:
```js
manifest: manifest,
```
alongside the existing `prompt: finalPrompt`.

- [ ] **Step 7: Verify in browser**

Open console. Click Generate with a Google API key set and at least one module image. Check console for `[CafeAPI]` logs. Confirm no errors. Confirm a cell appears in gallery.

- [ ] **Step 8: Commit**

```
git add logic/api.js
git commit -m "fix: remove compilePrompt dead code, unify prompt path, attach manifest to gallery cell"
```

---

## Task 6: Save manifest with gallery cell in workspace

**Files:**
- Modify: `logic/workspace.js`

- [ ] **Step 1: Add manifest to DB save in `hookGallery()`**

Find `DB.gallery.add(pid, {` in `hookGallery()`. Add `manifest` field:

```js
DB.gallery.add(pid, {
  imgUrl    : cell.imgUrl,
  ratio     : cell.ratio,
  prompt    : cell.prompt,
  manifest  : cell.manifest || null,
  date      : cell.date,
  dims      : cell.dims,
  model     : cell.model,
  cost      : cell.cost,
  generated : true
})
```

- [ ] **Step 2: Verify manifest persists**

Generate an image. Reload the page. Open console. Type `window.Gallery.getGeneratedCells()[0].manifest` — should return the manifest array, not undefined.

- [ ] **Step 3: Commit**

```
git add logic/workspace.js
git commit -m "fix: persist manifest with gallery cell in IndexedDB"
```

---

## Task 7: Add CafeSettings.getOutputType() if missing

**Files:**
- Modify: `logic/settings.js`

- [ ] **Step 1: Check if getOutputType exists**

Search `logic/settings.js` for `getOutputType`. If it exists, skip this task.

- [ ] **Step 2: Add getOutputType if missing**

Find the `return {` at the bottom of `window.CafeSettings`. Add:

```js
getOutputType: function () {
  var drop = document.getElementById('settingsDropdown');
  return drop ? (drop.dataset.activeOutput || 'PRECISE') : 'PRECISE';
},
```

- [ ] **Step 3: Commit**

```
git add logic/settings.js
git commit -m "fix: add getOutputType to CafeSettings"
```

---

## Task 8: End-to-end generation test

No code changes — verification only.

- [ ] **Step 1: Full generation test with Google**

1. Upload an image to SUBJECT → CHARACTER layer
2. Upload an image to STYLE
3. Upload one global ref chip
4. Type "walking through a forest at golden hour" in prompt bar
5. Click Generate
6. Open console — confirm no errors, confirm `[CafeAPI]` logs show the enhanced prompt (not a compiled string)
7. Confirm image appears in gallery

- [ ] **Step 2: Verify manifest on generated cell**

After generation, open console:
```js
window.Gallery.getGeneratedCells()[0].manifest
```
Should return an array with entries for the ref, the CHARACTER image, and the STYLE image — each with a `desc` field populated.

- [ ] **Step 3: Verify PRECISE vs CREATIVE difference**

Switch output to CREATIVE in settings. Generate again with same inputs. Open console and compare the two prompts — they should read differently. PRECISE should reference images exactly. CREATIVE should be more interpretive.

- [ ] **Step 4: Final commit**

```
git add -A
git commit -m "feat: agentic pipeline complete — manifest, Creative Director, unified prompt path"
```
