// api.js
window.CafeAPI = (function () {

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var DIMS = {
    '1:1':  { w: 1024, h: 1024 },
    '16:9': { w: 1344, h: 768  },
    '9:16': { w: 768,  h: 1344 },
    '4:3':  { w: 1152, h: 864  },
    '3:4':  { w: 864,  h: 1152 }
  };

  function formatDate(d) {
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ' ' + d.getFullYear();
  }

  function dimsFromRatio(ratio) {
    return DIMS[ratio] || DIMS['1:1'];
  }

  function collectUsedImagesFromManifest(manifest) {
    return (manifest || [])
      .filter(function (item) { return item.kind === 'image' && item.imgUrl; })
      .map(function (item) {
        return {
          role: item.role || item.layerName || 'REFERENCE',
          slot: item.slot || null,
          section: item.section || null,
          position: item.position || null,
          imgUrl: item.imgUrl
        };
      });
  }

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
    return checkSection(payload.subject) || checkSection(payload.stage) || checkSection(payload.style);
  }

  // Snapshot ModuleState without base64 image data — images are already captured in usedImages
  function snapshotModuleState() {
    var ms = window.ModuleState;
    if (!ms) return {};
    var snap = {};
    ['subject', 'stage', 'style'].forEach(function (key) {
      if (!ms[key]) { snap[key] = null; return; }
      snap[key] = {
        selected: ms[key].selected,
        slots: ms[key].slots.map(function (s) {
          return { on: s.on, html: (s.html || '').replace(/src="data:[^"]*"/g, 'src=""') };
        })
      };
    });
    return snap;
  }

  // ── Google Vertex AI image generation ─────────────────────────────────────

  function dataUrlToBase64(dataUrl) {
    var idx = dataUrl.indexOf(',');
    return idx !== -1 ? dataUrl.slice(idx + 1) : dataUrl;
  }

  function mimeFromDataUrl(dataUrl) {
    var match = dataUrl.match(/^data:([^;]+);/);
    return match ? match[1] : 'image/jpeg';
  }

  function googleGenerate(modelId, apiKey, prompt, numImages, aspectRatio, imageRefs, imageSize, thinkingLevel, seed) {
    var arMap = { '1:1': '1:1', '16:9': '16:9', '9:16': '9:16', '4:3': '4:3', '3:4': '3:4' };
    var ar = arMap[aspectRatio] || '1:1';

    function runOne(attempt) {
      attempt = attempt || 0;
      var url = 'https://aiplatform.googleapis.com/v1/publishers/google/models/' + modelId + ':generateContent?key=' + apiKey;

      var parts = [{ text: prompt }];
      if (imageRefs && imageRefs.length) {
        imageRefs.forEach(function (ref) {
          parts.push({ inline_data: { mime_type: mimeFromDataUrl(ref), data: dataUrlToBase64(ref) } });
        });
      }

      var generationConfig = {
        seed: seed,
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: ar,
          imageSize: imageSize || '1K',
          imageOutputOptions: { mimeType: 'image/png' }
        }
      };

      if (thinkingLevel) {
        generationConfig.thinkingConfig = { thinkingLevel: thinkingLevel };
      }

      var imgPartCount = parts.filter(function (p) { return p.inline_data; }).length;
      console.log('[CafeAPI] → POST', modelId, '| ar:', ar, '| size:', imageSize, '| thinking:', thinkingLevel || 'none', '| image refs:', imgPartCount, '| prompt chars:', (parts[0] && parts[0].text ? parts[0].text.length : 0));

      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: [
                'Follow the user brief as an ordered visual reference manifest.',
                'The inline images are supplied in the same Image N order named in the brief.',
                'Use the brief to decide whether an image is a subject source, wardrobe source, scene source, style source, or base composition.',
                'When an image is the base or main reference, preserve its camera, framing, perspective, lighting, colour grade, environment, and atmosphere.',
                'When subjects or garments are replaced or inserted, integrate them physically into that base scene with matching scale, occlusion, shadows, reflections, and light response.',
                'Do not create a collage, pasted cutout, side-by-side composite, contact sheet, or flat overlay.',
                'Preserve concrete identifying details from referenced images only according to their assigned role in the brief; avoid generic substitutions.'
              ].join(' ')
            }]
          },
          contents: [{ role: 'user', parts: parts }],
          generationConfig: generationConfig,
          safetySettings: [
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' }
          ]
        })
      })
        .then(function (res) {
          return res.json().then(function (body) {
            if (!res.ok) {
              if (res.status === 429 && attempt < 2) {
                var wait = (attempt + 1) * 20000;
                console.warn('[CafeAPI] 429 rate limit — retrying in ' + (wait / 1000) + 's (attempt ' + (attempt + 1) + ' of 2)');
                return new Promise(function (resolve) { setTimeout(resolve, wait); })
                  .then(function () { return runOne(attempt + 1); });
              }
              throw new Error('Google generate failed ' + res.status + ': ' + JSON.stringify(body));
            }
            return body;
          });
        });
    }

    function runSequential(n) {
      var results = [];
      function next(i) {
        if (i >= n) return Promise.resolve(results);
        return runOne(0).then(function (r) {
          results.push(r);
          return next(i + 1);
        });
      }
      return next(0);
    }

    return runSequential(numImages).then(function (results) {
      var predictions = [];
      results.forEach(function (result) {
        if (result.candidates && result.candidates.length) {
          result.candidates.forEach(function (candidate) {
            if (candidate.content && candidate.content.parts) {
              candidate.content.parts.forEach(function (part) {
                var id = part.inlineData || part.inline_data;
                if (id && id.data) {
                  predictions.push({ mimeType: id.mimeType || id.mime_type || 'image/png', bytesBase64Encoded: id.data });
                }
              });
            }
          });
        }
      });
      return { predictions: predictions };
    });
  }
  function generateLayerImage(promptText) {
    var model = window.CafeSettings.getActiveModel();
    var apiKey = window.CafeSettings.getGoogleApiKey();
    if (!apiKey) {
      return Promise.reject(new Error('Please set your Google API Key in Settings first.'));
    }

    _activeRequests++;
    var ratio = '1:1';
    var imageSize = model.defaultResolution || '1K';
    var thinkingLevel = model.thinkingLevel || null;
    var activeSeed = Math.floor(Math.random() * 999999) + 1;

    return googleGenerate(model.id, apiKey, promptText, 1, ratio, [], imageSize, thinkingLevel, activeSeed)
      .then(function (result) {
        var predictions = result.predictions || [];
        var p = predictions[0];
        if (!p || !p.bytesBase64Encoded) throw new Error('No image returned');
        return 'data:' + (p.mimeType || 'image/png') + ';base64,' + p.bytesBase64Encoded;
      })
      .finally(function() {
        _activeRequests--;
      });
  }

  // ── Main generate ─────────────────────────────────────────────────────────

  var _activeRequests = 0;

  function generate() {
    var model = window.CafeSettings.getActiveModel();
    var apiKey = window.CafeSettings.getGoogleApiKey();
    if (!window.CafeSettings.getGoogleApiKey()) {
      window.CafeSettings.openModal();
      return;
    }

    var payload = window.PromptBuilder.collect();
    var moduleSnapshot = snapshotModuleState();
    var ratio = payload.settings.aspectRatio || '1:1';
    var dims = dimsFromRatio(ratio);
    var now = new Date();
    var numImages = payload.settings.variation || 1;
    var mode = payload.mode || 'FRAME';
    var rawPrompt = payload.prompt || '';

    if (!rawPrompt && !(payload.refs && payload.refs.length) && !hasModuleImages(payload)) {
      console.warn('[CafeAPI] No prompt and no images — type something or add module layers.');
      return;
    }

    var genBtn = document.getElementById('generateBtn');
    if (genBtn) genBtn.classList.add('cafe-loading');

    var t0 = Date.now();
    var debugEntry = {
      timestamp:      new Date().toISOString(),
      runId:          t0,
      mode:           mode,
      model:          model.label,
      aspectRatio:    ratio,
      numImages:      numImages,
      rawPrompt:      rawPrompt,
      refCount:       (payload.refs || []).length,
      payload:        payload,
      enhancerInput:  null,
      enhancerOutput: null,
      directorPlan:   null,
      imageManifest:  null,
      imagesSent:     null,
      timingMs:       null,
      result:         null,
      error:          null
    };

    _activeRequests++;
    console.log('[CafeAPI] Pipeline start | model:', model.id, '| images:', numImages, '| ratio:', ratio, '| active requests:', _activeRequests);

    window.PromptEnhancer.enhance(payload).then(function (enhanced) {
      var t1 = Date.now();
      var finalPrompt = enhanced.prompt;
      var manifest = enhanced.manifest;

      debugEntry.enhancerInput  = enhanced.enhancerInput || null;
      debugEntry.enhancerOutput = finalPrompt;
      debugEntry.directorPlan   = enhanced.directorPlan || null;
      debugEntry.imageManifest  = manifest || null;


      var loadingIds = [];
      for (var li = 0; li < numImages; li++) {
        var lid = 'loading-' + Date.now() + '-' + li;
        loadingIds.push(lid);
        window.Gallery.addLoading(lid, ratio, mode);
      }

      var imageRefs = (manifest || [])
        .filter(function (item) { return item.kind === 'image' && item.imgUrl; })
        .map(function (item) { return item.imgUrl; });
      var imageSize = window.CafeSettings.getActiveResolution();
      var thinkingLevel = model.thinkingLevel || null;
      var seedLocked = payload.settings.seedLocked;
      var activeSeed = (seedLocked && payload.settings.seed) ? payload.settings.seed : Math.floor(Math.random() * 999999) + 1;
      var seedInput = document.getElementById('seedNum');
      if (seedInput) seedInput.value = activeSeed;

      debugEntry.imagesSent = {
        total:       imageRefs.length,
        refs:        (payload.refs || []).length,
        layerImages: imageRefs.length - (payload.refs || []).length
      };

      var tGen = Date.now();
      console.log('[CafeAPI] Generation start | model:', model.id, '| images:', numImages, '| ratio:', ratio, '| active requests:', _activeRequests);
      return googleGenerate(model.id, apiKey, finalPrompt, numImages, ratio, imageRefs, imageSize, thinkingLevel, activeSeed)
        .then(function (result) {
          var predictions = result.predictions || [];
          var imgUrls = predictions
            .filter(function (p) { return p.bytesBase64Encoded; })
            .map(function (p) { return 'data:' + (p.mimeType || 'image/png') + ';base64,' + p.bytesBase64Encoded; });

          if (!imgUrls.length) {
            console.error('[CafeAPI] No images in Google response:', result);
            throw new Error('No images in Google response');
          }
          console.log('[CafeAPI] ✓ Generation complete | ' + (Date.now() - tGen) + 'ms | images received:', imgUrls.length);

          var t2 = Date.now();
          debugEntry.timingMs = { enhancer: t1 - t0, generation: t2 - t1, total: t2 - t0 };
          debugEntry.result   = { success: true, imagesReceived: imgUrls.length };
          window.CafeDebug.record(debugEntry);

          try {
            imgUrls.forEach(function (dataUrl, i) {
              var cell = {
                id: Date.now() + Math.random(),
                ratio: ratio,
                imgUrl: dataUrl,
                date: formatDate(now),
                type: 'Image',
                dims: '—',
                prompt: finalPrompt,
                manifest: manifest,
                model: model.label,
                cost: window.CafeSettings.getCostPerImage(),
                generated: true,
                moduleSnapshot: moduleSnapshot,
                usedImages: collectUsedImagesFromManifest(manifest)
              };
              var img = new Image();
              img.onload = function () {
                cell.dims = img.naturalWidth + ' × ' + img.naturalHeight;
                window.Workspace.autosave();
              };
              img.src = dataUrl;
              window.Gallery.resolveLoading(loadingIds[i] || loadingIds[0], cell);
              window.Workspace.autosave();
            });
          } finally {
            for (var ri = imgUrls.length; ri < loadingIds.length; ri++) {
              window.Gallery.removeLoading(loadingIds[ri]);
            }
          }
        })
        .catch(function (err) {
          console.error('[CafeAPI] Generation failed:', err.message);
          var t2 = Date.now();
          debugEntry.timingMs = { enhancer: t1 - t0, generation: t2 - t1, total: t2 - t0 };
          debugEntry.result   = { success: false };
          debugEntry.error    = (debugEntry.error ? debugEntry.error + ' | ' : '') + err.message;
          window.CafeDebug.record(debugEntry);
          loadingIds.forEach(function (lid) {
            window.Gallery.removeLoading(lid);
          });
        });
    }).catch(function (err) {
      console.error('[CafeAPI] Pipeline failed:', err.message);
      var tFail = Date.now();
      debugEntry.timingMs = { enhancer: tFail - t0, generation: 0, total: tFail - t0 };
      debugEntry.result   = { success: false };
      debugEntry.error    = (debugEntry.error ? debugEntry.error + ' | ' : '') + err.message;
      window.CafeDebug.record(debugEntry);
    }).then(function () {
      _activeRequests--;
      if (_activeRequests === 0 && genBtn) genBtn.classList.remove('cafe-loading');
      if (!window.CafeSettings.getKeepDescriptions()) {
        window.VisionScan.clearCache();
      }
    });
  }

  return { generate: generate, generateLayerImage: generateLayerImage };

})();
