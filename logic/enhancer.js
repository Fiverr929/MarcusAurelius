// enhancer.js
window.PromptEnhancer = (function () {

  var MODEL = 'gemini-2.5-flash-lite';

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
    fromSection(payload.style);

    return items;
  }

  var SYSTEM_INSTRUCTION = [
    'You are a generation brief writer for an AI image model.',
    '',
    'The inputs you receive come from a structured composition tool with three modules:',
    '- SUBJECT MODULE: who or what appears in the scene. May have multiple independent slots (A, B, C...) — each slot is a completely separate subject, not the same thing from multiple angles.',
    '- SCENE MODULE: where and when the scene takes place.',
    '- STYLE MODULE: visual treatment only — colour grade, lens, rendering, mood. Never a person or a location.',
    '',
    'Within a single slot, multiple images of the same layer are different angles or views of the same subject — treat them as one thing.',
    'Your task: write a complete generation brief by synthesising the descriptions provided.',
    'Use specific, concrete language drawn directly from those descriptions — never generic placeholders.',
    '',
    'Rules that always apply:',
    '- If multiple subject slots are present, each is a separate independent subject — keep them distinct.',
    '- Place the subject in the scene using the SCENE MODULE. If no scene, derive from user intent or omit.',
    '- Close with the style treatment as visual rendering only — never as a location or character.',
    '- Every detail must come from the descriptions or user intent. Do not invent anything.',
    '- Never use filler phrases like "dynamic pose", "vibrant atmosphere", "stunning", or "beautiful".',
    '- One flowing paragraph. Under 120 words. No labels, no headers, no preamble.',
    '',
    'PRECISE mode — when the user message says Mode: PRECISE:',
    '- The generation model receives the actual images alongside this brief.',
    '- Use positional image references ("the person in Image N") to anchor every subject — the model will lock the face directly from the image.',
    '- Lock every described detail exactly — face, outfit, environment, lighting. No interpretation, no blending, no invention.',
    '',
    'CREATIVE mode — when the user message says Mode: CREATIVE:',
    '- No images are sent to the generation model — the brief is the only input.',
    '- Do not use positional image references ("the person in Image N") — there are no images to anchor to.',
    '- Treat descriptions as raw material. Distil the essence — mood, character, atmosphere — and allow recomposition and artistic reinterpretation.',
    '- Write evocatively, not technically. Prioritise feeling and composition over exact replication.',
    'Output only the brief.'
  ].join('\n');

  function renderSlotGroup(items, sectionLabel, lines, isPrecise, slotType) {
    if (!items.length) return;
    var slotMap = {};
    var slotOrder = [];
    items.forEach(function (img) {
      var key = img.slot || '_';
      if (!slotMap[key]) { slotMap[key] = []; slotOrder.push(key); }
      slotMap[key].push(img);
    });
    var multi = slotOrder.length > 1;
    lines.push(sectionLabel);
    slotOrder.forEach(function (key) {
      var slotItems = slotMap[key];
      if (multi) lines.push('  Slot ' + key + ' — independent ' + (slotType || 'subject') + ':');
      var indent = multi ? '    ' : '  ';
      slotItems.forEach(function (img) {
        var isIdentity = /CHARACTER|FACE|PERSON|MODEL|SUBJECT|HERO|IDENTITY|ACTOR/.test((img.layerName || '').toUpperCase());
        var label = isIdentity
          ? (isPrecise ? 'Identity anchor — Image ' + img.position : 'Identity anchor')
          : (img.layerName || 'Layer') + (isPrecise ? ' — Image ' + img.position : '');
        lines.push(indent + '[' + label + '] ' + (img.desc || '(no description)'));
      });
      if (multi) lines.push('');
    });
    if (!multi) lines.push('');
  }

  function buildUserMessage(userIntent, imageContext, outputType) {
    var isPrecise = outputType !== 'CREATIVE';
    var lines = [];

    if (isPrecise) {
      lines.push('Mode: PRECISE — replicate every described detail exactly. No substitution, no invention.');
    } else {
      lines.push('Mode: CREATIVE — treat descriptions as inspiration. Allow artistic interpretation and recomposition.');
    }
    lines.push('');

    var subjectItems = imageContext.filter(function (i) { return i.section === 'subject'; });
    var stageItems   = imageContext.filter(function (i) { return i.section === 'stage'; });
    var styleItems   = imageContext.filter(function (i) { return i.section === 'style'; });
    var refItems     = imageContext.filter(function (i) { return i.section === 'ref'; });

    renderSlotGroup(subjectItems, 'SUBJECT MODULE (who or what is in the scene):', lines, isPrecise, 'subject');
    renderSlotGroup(stageItems,   'SCENE MODULE (where and when):', lines, isPrecise, 'scene');

    renderSlotGroup(styleItems, 'STYLE MODULE (visual treatment only — colour grade, lens, rendering, mood — NOT a place or person):', lines, isPrecise, 'style');

    if (refItems.length) {
      lines.push('REFERENCE IMAGES (general creative references — blend loosely):');
      refItems.forEach(function (img) {
        lines.push('  [Image ' + img.position + '] ' + (img.desc || '(no description)'));
      });
      lines.push('');
    }

    if (userIntent && userIntent.trim()) {
      lines.push('User intent: ' + userIntent.trim());
      lines.push('');
    }

    lines.push('Write the brief now.');

    return lines.join('\n');
  }

  function runVisionPreflight(imageContext, outputType) {
    var missing = imageContext.filter(function (item) { return !item.desc && item.imgUrl; });
    if (!missing.length) { console.log('[PromptEnhancer] Preflight — all descriptions cached, skipping scans'); return Promise.resolve(); }

    var scans = missing.map(function (item) {
      var p;
      if (item.section === 'ref') {
        p = window.VisionScan.describeRef(item.imgUrl, outputType);
      } else if (item.section === 'style') {
        p = window.VisionScan.describeStyle(item.imgUrl, outputType);
      } else {
        p = window.VisionScan.describe(item.imgUrl, item.layerName, item.section, outputType);
      }
      return p
        .then(function (desc) {
          item.desc = desc;
          if (item.section === 'ref' && window.refVisionCache) {
            window.refVisionCache[item.imgUrl] = desc;
          }
        })
        .catch(function (err) {
          console.warn('[PromptEnhancer] Vision preflight failed for', item.layerName, ':', err.message);
        });
    });

    return Promise.all(scans);
  }

  function enhance(payload) {
    var apiKey = window.CafeSettings.getGoogleApiKey();
    if (!apiKey) return Promise.reject(new Error('[PromptEnhancer] No Google API key'));

    var imageContext = collectImageContext(payload);
    var outputType   = (payload.settings && payload.settings.outputType) || 'PRECISE';
    var userIntent   = payload.prompt || '';

    var preflightPromise = outputType === 'CREATIVE' ? Promise.resolve() : runVisionPreflight(imageContext, outputType);

    return preflightPromise.then(function () {
      var userMessage = buildUserMessage(userIntent, imageContext, outputType);
      var url = 'https://aiplatform.googleapis.com/v1/publishers/google/models/' + MODEL + ':generateContent?key=' + apiKey;
      var t0 = Date.now();
      var scanned = imageContext.filter(function (i) { return i.desc; }).length;
      console.log('[PromptEnhancer] → POST', MODEL, '| mode:', outputType, '| images with desc:', scanned, '/', imageContext.length);
      console.log('[PromptEnhancer] user message:\n' + userMessage);

      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } }
        })
      })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error('[PromptEnhancer] ' + res.status + ': ' + JSON.stringify(data));
          return data;
        });
      })
      .then(function (data) {
        var text = data.candidates &&
                   data.candidates[0] &&
                   data.candidates[0].content &&
                   data.candidates[0].content.parts &&
                   data.candidates[0].content.parts[0] &&
                   data.candidates[0].content.parts[0].text;
        if (!text) throw new Error('[PromptEnhancer] Empty response');
        console.log('[PromptEnhancer] ✓', MODEL, '| ' + (Date.now() - t0) + 'ms | brief:', text.trim().slice(0, 120) + '...');
        return { prompt: text.trim(), manifest: imageContext, enhancerInput: userMessage };
      });
    });
  }

  return { enhance: enhance };

})();
