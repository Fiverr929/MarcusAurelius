// enhancer.js
window.PromptEnhancer = (function () {

  var MODEL = 'gemini-2.5-flash';

  function dataUrlToBase64(dataUrl) {
    var idx = dataUrl.indexOf(',');
    return idx !== -1 ? dataUrl.slice(idx + 1) : dataUrl;
  }

  function mimeFromDataUrl(dataUrl) {
    var match = dataUrl.match(/^data:([^;]+);/);
    return match ? match[1] : 'image/jpeg';
  }

  function collectImageContext(payload) {
    var moduleItems = [];
    var refItems = [];
    var position = 1;

    function fromSection(section) {
      if (!section || !section.slots) return;
      section.slots.forEach(function (slot) {
        if (!slot.active) return;
        var slotLabel = slot.label || '?';
        slot.layers.forEach(function (layer) {
          if (!layer.visible) return;
          var imageChildren = layer.children.filter(function (c) { return c.visible && c.type === 'image' && c.imgUrl; });
          var total = imageChildren.length;
          layer.children.forEach(function (child) {
            if (!child.visible) return;
            if (child.type === 'image' && child.imgUrl) {
              var idx = imageChildren.indexOf(child);
              var desc = child.visionDesc || null;
              var angleNote = total > 1 ? ' (view ' + (idx + 1) + ' of ' + total + ' — same subject)' : '';
              moduleItems.push({
                kind: 'image',
                role: layer.name || 'LAYER',
                slot: slotLabel,
                section: slot.section || 'subject',
                layerName: layer.name || 'LAYER',
                desc: desc ? desc + angleNote : null,
                imgUrl: child.imgUrl,
                uuid: child.uuid || null
              });
            } else if (child.type === 'prompt' && child.text) {
              moduleItems.push({
                kind: 'text',
                role: layer.name || 'LAYER',
                slot: slotLabel,
                section: slot.section || 'subject',
                layerName: layer.name || 'LAYER',
                text: child.text
              });
            }
          });
        });
      });
    }

    fromSection(payload.subject);
    fromSection(payload.stage);
    fromSection(payload.style);

    var refs = payload.refs || [];
    refs.forEach(function (ref, idx) {
      refItems.push({ kind: 'image', role: 'R' + (idx + 1), slot: null, section: 'ref', layerName: 'REFERENCE', desc: ref.desc || null, imgUrl: ref.url });
    });

    // Keep image positions stable across runs. R1 is always before module images.
    // Only non-described images get a position — they are the ones sent inline.
    var items = refItems.concat(moduleItems);
    items.forEach(function (item) {
      if (item.kind === 'image' && !item.desc) item.position = position++;
    });

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
    'Your task: write a complete generation brief by analysing the provided inputs — attached inline images and pre-scanned text descriptions — and their assigned roles.',
    'Before writing, act as a creative director: decide the final image, not a pile of assets.',
    'Use specific, concrete language drawn directly from the images and descriptions — never generic placeholders.',
    'Prompt-bar references R1-R5 are freeform references attached to the user intent. Infer their role from the prompt text; do not assign fixed subject, scene, or style roles to them.',
    'If the prompt is empty and modules are present, modules own subject, scene, and style details while R1-R5 provide overall look, composition, or mood support.',
    'If only R1-R5 are present, treat them as the primary prompt input.',
    '',
    'Rules:',
    '- The generation model receives the actual images alongside this brief.',
    '- The final output must be one newly generated coherent image, not transferred pixels from one reference onto another.',
    '- Write an edit/composition brief, not an inventory of separate assets.',
    '- If the user prompt is empty, infer the default production move from the modules and references.',
    '- Default production move: SUBJECT provides identity/objects, SCENE provides world/camera/environment, STYLE provides rendering only, and R1-R5 provide full-scene composition/style support when present.',
    '- Use positional image references ("the person in Image N", "the outfit in Image N", "the lighting from Image N") to anchor every concrete subject, garment, scene, and style source.',
    '- Only use Image N references for images explicitly listed in the user message.',
    '- If multiple subject slots are present, each is a separate independent subject — keep them distinct.',
    '- When one image is the base scene or main reference, preserve its camera, framing, environment, lighting, colour grade, perspective, and atmosphere.',
    '- When replacing or inserting subjects, integrate them into that base scene with matching scale, occlusion, shadows, reflections, skin/clothing light response, and perspective.',
    '- Prefer language like "redraw the whole scene as one coherent image" over "place X on Y" when combining references.',
    '- Module images with a pre-scanned description are provided as description text — use the description directly, no Image N needed.',
    '- Inline images (refs and any module images without descriptions) are attached as Image N — reference them by position.',
    '- Place the subject in the scene using the SCENE MODULE. If no scene, derive from user intent or omit.',
    '- Close with the style treatment as visual rendering only — never as a location or character.',
    '- Every detail must come from the attached images or user intent. Do not invent anything.',
    '- Preserve distinctive details: printed text, logos, garment cuts, colours, materials, facial traits, props, architecture, camera angle, lens feel, and light direction.',
    '- Never ask for a collage, pasted cutout, side-by-side composite, contact sheet, or flat overlay.',
    '- Never use filler phrases like "dynamic pose", "vibrant atmosphere", "stunning", or "beautiful".',
    '- One flowing paragraph. Under 170 words. No labels, no headers, no preamble.',
    'Output only the brief.'
  ].join('\n');

  function firstImage(items, predicate) {
    for (var i = 0; i < items.length; i++) {
      if (!predicate || predicate(items[i])) return items[i];
    }
    return null;
  }

  function buildDirectorPlan(userIntent, imageContext) {
    var text = (userIntent || '').trim();
    var subjectItems = imageContext.filter(function (i) { return i.section === 'subject'; });
    var stageItems = imageContext.filter(function (i) { return i.section === 'stage'; });
    var styleItems = imageContext.filter(function (i) { return i.section === 'style'; });
    var refItems = imageContext.filter(function (i) { return i.section === 'ref'; });

    var plan = {
      goal: 'single_coherent_generated_image',
      userIntent: text || '(none)',
      defaultAction: 'synthesize_references_into_one_scene',
      subjectSources: subjectItems.map(function (i) {
        var ref = (i.role || i.layerName) + ' Slot ' + (i.slot || '-');
        return i.position ? ref + ' / Image ' + i.position : ref;
      }),
      sceneSource: null,
      styleSource: null,
      compositionSource: null,
      preserve: ['physical integration', 'matching perspective', 'matching light direction', 'contact shadows', 'occlusion', 'edge softness'],
      avoid: ['collage', 'cutout', 'sticker overlay', 'side-by-side composite', 'literal pasted reference pixels']
    };

    var mentionedRef = text.match(/\bR([1-5])\b/i);
    var activeRef = mentionedRef
      ? firstImage(refItems, function (i) { return i.role.toUpperCase() === ('R' + mentionedRef[1]).toUpperCase(); })
      : firstImage(refItems);
    var stageImage = firstImage(stageItems);
    var styleImage = firstImage(styleItems);

    var wantsSameStyle = /\b(same\s+style|style\s+as|look\s+like|like\s+R[1-5])\b/i.test(text);
    var wantsPose = /\b(same\s+pose|pose|posture|framing|composition)\b/i.test(text);
    var wantsReplace = /\b(replace|swap|insert|put|place|use)\b/i.test(text) &&
      /\b(subject|person|character|model|face|body)\b/i.test(text);

    if (subjectItems.length && (stageImage || activeRef)) {
      plan.defaultAction = 'integrate_subject_sources_into_a_base_world';
    }
    if (subjectItems.length && !stageImage && activeRef) {
      plan.sceneSource = activeRef.role + ' / Image ' + activeRef.position;
      plan.compositionSource = activeRef.role + ' / Image ' + activeRef.position;
      plan.styleSource = activeRef.role + ' / Image ' + activeRef.position;
    }
    if (stageImage) {
      var stageRef = (stageImage.role || stageImage.layerName) + ' Slot ' + (stageImage.slot || '-');
      plan.sceneSource = stageImage.position ? stageRef + ' / Image ' + stageImage.position : stageRef;
      plan.compositionSource = plan.compositionSource || plan.sceneSource;
    }
    if (styleImage) {
      var styleRef = (styleImage.role || styleImage.layerName) + ' Slot ' + (styleImage.slot || '-');
      plan.styleSource = styleImage.position ? styleRef + ' / Image ' + styleImage.position : styleRef;
    }
    if (activeRef && (wantsSameStyle || wantsPose || wantsReplace)) {
      plan.compositionSource = activeRef.role + ' / Image ' + activeRef.position;
      if (wantsSameStyle) plan.styleSource = activeRef.role + ' / Image ' + activeRef.position;
      if (!plan.sceneSource) plan.sceneSource = activeRef.role + ' / Image ' + activeRef.position;
    }
    if (wantsPose) plan.preserve.push('pose language from ' + (plan.compositionSource || 'the main reference'));

    if (!text && subjectItems.length && !stageImage && !refItems.length) {
      plan.defaultAction = 'create_a_subject_led_image_from_available_identity_sources';
    }

    return plan;
  }

  function renderDirectorPlan(plan) {
    var lines = [
      'DIRECTOR PLAN (internal production contract):',
      '  Goal: ' + plan.goal,
      '  Default action: ' + plan.defaultAction
    ];
    if (plan.subjectSources.length) lines.push('  Subject source(s): ' + plan.subjectSources.join('; '));
    if (plan.sceneSource) lines.push('  Scene/world source: ' + plan.sceneSource);
    if (plan.compositionSource) lines.push('  Composition/camera source: ' + plan.compositionSource);
    if (plan.styleSource) lines.push('  Style/rendering source: ' + plan.styleSource);
    lines.push('  Preserve: ' + plan.preserve.join(', '));
    lines.push('  Avoid: ' + plan.avoid.join(', '));
    lines.push('  Write the final brief as if describing the finished coherent image. Do not describe stacking, overlaying, or pasting assets.');
    return lines.join('\n');
  }

  function buildIntentGuidance(userIntent, imageContext) {
    var text = (userIntent || '').trim();
    var refItems = imageContext.filter(function (i) { return i.section === 'ref'; });
    var moduleItems = imageContext.filter(function (i) { return i.section !== 'ref'; });
    if (!refItems.length) return null;

    var refMatch = text.match(/\bR([1-5])\b/i);
    var activeRef = refMatch
      ? refItems.filter(function (i) { return i.role.toUpperCase() === ('R' + refMatch[1]).toUpperCase(); })[0]
      : refItems[0];
    if (!activeRef) activeRef = refItems[0];

    var mentionsRef = !!refMatch;
    var wantsBase = /\b(base|main|look\s*a?\s*like|look\s+like|reference|reff?erence|in\s+R[1-5])\b/i.test(text);
    var wantsReplace = /\b(replace|use|put|insert|place)\b/i.test(text) &&
      /\b(subject|subjects|module|person|people|character|characters)\b/i.test(text);

    if (mentionsRef && moduleItems.length && (wantsReplace || wantsBase)) {
      return 'Use ' + activeRef.role + ' / Image ' + activeRef.position + ' as the base composition and lived-in scene. Replace or fill its subjects with the active module subject images while preserving the base image camera, framing, environment, lighting, colour grade, perspective, and atmosphere. The result must look photographed as one coherent scene, not pasted together.';
    }

    if (!text && moduleItems.length) {
      return 'Use the modules for concrete subject, scene, and style details. Use R1-R5 only as supporting overall look, composition, or mood unless the user prompt makes a reference primary.';
    }

    if (!moduleItems.length) {
      return 'Use the prompt-bar references as the primary visual source and keep the final image coherent with their composition, lighting, and atmosphere.';
    }

    return null;
  }

  function renderSlotGroup(items, sectionLabel, lines, slotType) {
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
        if (img.kind === 'text') {
          lines.push(indent + '[' + (img.layerName || 'Layer') + ' text] ' + img.text);
          return;
        }
        var isIdentity = /CHARACTER|FACE|PERSON|MODEL|SUBJECT|HERO|IDENTITY|ACTOR/.test((img.layerName || '').toUpperCase());
        if (img.desc) {
          var roleLabel = isIdentity ? 'Identity anchor' : (img.layerName || 'Layer');
          lines.push(indent + '[' + roleLabel + '] ' + img.desc);
        } else {
          var label = isIdentity
            ? 'Identity anchor — Image ' + img.position
            : (img.layerName || 'Layer') + ' — Image ' + img.position;
          lines.push(indent + '[' + label + ']');
        }
      });
      if (multi) lines.push('');
    });
    if (!multi) lines.push('');
  }

  function buildUserMessage(userIntent, imageContext) {
    var lines = [];

    var subjectItems = imageContext.filter(function (i) { return i.section === 'subject'; });
    var stageItems = imageContext.filter(function (i) { return i.section === 'stage'; });
    var styleItems = imageContext.filter(function (i) { return i.section === 'style'; });
    var refItems = imageContext.filter(function (i) { return i.section === 'ref'; });
    var intentGuidance = buildIntentGuidance(userIntent, imageContext);
    var directorPlan = buildDirectorPlan(userIntent, imageContext);

    if (intentGuidance) {
      lines.push('INTERPRETED TASK: ' + intentGuidance);
      lines.push('');
    }

    lines.push(renderDirectorPlan(directorPlan));
    lines.push('');

    renderSlotGroup(subjectItems, 'SUBJECT MODULE (who or what is in the scene):', lines, 'subject');
    renderSlotGroup(stageItems, 'SCENE MODULE (where and when):', lines, 'scene');

    renderSlotGroup(styleItems, 'STYLE MODULE (visual treatment only — colour grade, lens, rendering, mood — NOT a place or person):', lines, 'style');

    if (refItems.length) {
      lines.push('PROMPT-BAR REFERENCES (R1-R5, interpret through the user intent):');
      refItems.forEach(function (img) {
        lines.push('  [' + img.role + ' — Image ' + img.position + ']');
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

  var _cache = {};
  var _cacheOrder = [];
  var _CACHE_MAX = 50;

  function cacheSet(key, value) {
    if (!(key in _cache)) {
      _cacheOrder.push(key);
      if (_cacheOrder.length > _CACHE_MAX) {
        delete _cache[_cacheOrder.shift()];
      }
    }
    _cache[key] = value;
  }

  function cacheKey(userMessage, imageItems) {
    return userMessage + '||' + imageItems.map(function (i) {
      if (i.uuid) return 'uuid:' + i.uuid;
      var src = i.imgUrl || '';
      // Length alone collides easily for replaced module images. Sample both ends
      // so a changed data URL invalidates the enhancer cache without hashing MBs.
      return 'data:' + src.length + ':' + src.slice(0, 96) + ':' + src.slice(-96);
    }).join('|');
  }

  function imageFingerprint(item) {
    var src = item.imgUrl || '';
    return {
      role: item.role || item.layerName || 'IMAGE',
      section: item.section || null,
      slot: item.slot || null,
      position: item.position || null,
      uuid: item.uuid || null,
      described: !!item.desc,
      len: src.length,
      head: src.slice(0, 24),
      tail: src.slice(-24)
    };
  }

  function enhance(payload) {
    var apiKey = window.CafeSettings.getGoogleApiKey();
    if (!apiKey) return Promise.reject(new Error('[PromptEnhancer] No Google API key'));

    var t0 = Date.now();

    var imageContext = collectImageContext(payload);
    var userIntent = payload.prompt || '';
    var userMessage = buildUserMessage(userIntent, imageContext);
    var url = 'https://aiplatform.googleapis.com/v1/publishers/google/models/' + MODEL + ':generateContent?key=' + apiKey;

    var imageItems = imageContext.filter(function (i) { return i.kind === 'image' && i.imgUrl; });

    var inlineItems = imageItems.filter(function (i) { return !i.desc; });
    inlineItems.sort(function (a, b) { return a.position - b.position; });

    // KeepDescriptions is a vision-description cache. Do not cache enhancer
    // outputs when live inline images are present, because the brief depends on
    // Gemini re-reading those pixels and stale briefs produce wrong generations.
    var canCacheEnhancer = window.CafeSettings.getKeepDescriptions() && inlineItems.length === 0;
    var activeCacheKey = canCacheEnhancer ? cacheKey(userMessage, imageItems) : null;
    console.log('[PromptEnhancer] image fingerprints:', JSON.stringify(imageItems.map(imageFingerprint)));
    if (canCacheEnhancer) {
      console.log('[PromptEnhancer] cache key:', activeCacheKey);
      if (_cache[activeCacheKey]) {
        console.log('[PromptEnhancer] ✓ cache hit — skipping Gemini call');
        return Promise.resolve(_cache[activeCacheKey]);
      }
    } else {
      console.log('[PromptEnhancer] cache disabled for this run — inline image pixels must be re-read');
    }

    var parts = [{ text: userMessage }];
    inlineItems.forEach(function (item) {
      parts.push({ inline_data: { mime_type: mimeFromDataUrl(item.imgUrl), data: dataUrlToBase64(item.imgUrl) } });
    });

    console.log('[PromptEnhancer] → POST', MODEL, '| images inline:', inlineItems.length, '| described:', imageItems.length - inlineItems.length, '| enhancer cache:', canCacheEnhancer ? 'on' : 'off', '| prompt chars:', userMessage.length);
    console.log('[PromptEnhancer] user message:\n' + userMessage);

    return window.CafeNet.fetchJSON(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: parts }],
        generationConfig: { maxOutputTokens: 4999 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' }
        ]
      })
    }, { label: '[PromptEnhancer]' })
      .then(function (data) {
        var candidateParts = data.candidates &&
          data.candidates[0] &&
          data.candidates[0].content &&
          data.candidates[0].content.parts;
        console.log('[PromptEnhancer] parts:', JSON.stringify((candidateParts || []).map(function(p) { return { thought: p.thought, len: (p.text || '').length, preview: (p.text || '').slice(0, 60) }; })));
        var text = candidateParts
          ? candidateParts.filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ''; }).join('')
          : null;
        if (!text) throw new Error('[PromptEnhancer] Empty response');
        console.log('[PromptEnhancer] ✓', MODEL, '| ' + (Date.now() - t0) + 'ms | brief:', text.trim().slice(0, 120) + '...');
        var result = { prompt: text.trim(), manifest: imageContext, enhancerInput: userMessage, directorPlan: buildDirectorPlan(userIntent, imageContext) };
        if (canCacheEnhancer) {
          cacheSet(activeCacheKey, result);
          console.log('[PromptEnhancer] cached enhancer output for key:', activeCacheKey);
        }
        return result;
      });
  }

  return { enhance: enhance, collectImageContext: collectImageContext };

})();
