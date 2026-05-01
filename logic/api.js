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

  // ── Image collectors ──────────────────────────────────────────────────────

  function collectLayerImageUrls(payload) {
    var urls = [];

    function fromSection(section) {
      if (!section || !section.slots) return;
      section.slots.forEach(function (slot) {
        if (!slot.active) return;
        slot.layers.forEach(function (layer) {
          if (!layer.visible) return;
          layer.children.forEach(function (child) {
            if (!child.visible) return;
            if (child.type === 'image' && child.imgUrl) urls.push(child.imgUrl);
          });
        });
      });
    }

    fromSection(payload.subject);
    fromSection(payload.stage);
    fromSection(payload.style);

    return urls;
  }

  function collectUsedImages(payload) {
    var images = [];

    function fromSection(section, sectionName) {
      if (!section || !section.slots) return;
      section.slots.forEach(function (slot) {
        if (!slot.active) return;
        slot.layers.forEach(function (layer) {
          if (!layer.visible) return;
          layer.children.forEach(function (child) {
            if (!child.visible) return;
            if (child.type === 'image' && child.imgUrl) {
              images.push({ role: layer.name || 'LAYER', slot: slot.label, section: sectionName, imgUrl: child.imgUrl });
            }
          });
        });
      });
    }

    fromSection(payload.subject, 'subject');
    fromSection(payload.stage, 'stage');
    fromSection(payload.style, 'style');

    return images;
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

  function googleGenerate(modelId, apiKey, prompt, numImages, aspectRatio, imageRefs, imageSize, thinkingLevel) {
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
          contents: [{ role: 'user', parts: parts }],
          generationConfig: generationConfig
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

  // ── Main generate ─────────────────────────────────────────────────────────

  var REQUEST_LIMIT = 3;
  var _activeRequests = 0;

  function generate() {
    if (!window.PromptBuilder || !window.CafeSettings) return;

    if (_activeRequests >= REQUEST_LIMIT) {
      console.warn('[CafeAPI] Request limit reached (' + REQUEST_LIMIT + '). Please wait for current generations to finish.');
      return;
    }

    var model = window.CafeSettings.getActiveModel();
    var apiKey = window.CafeSettings.getGoogleApiKey();
    if (!apiKey) {
      window.CafeSettings.openModal();
      return;
    }

    var payload = window.PromptBuilder.collect();
    var moduleSnapshot = snapshotModuleState();
    var usedImages = collectUsedImages(payload);
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
    var debugEntry = window.CafeDebug ? {
      timestamp:      new Date().toISOString(),
      runId:          t0,
      mode:           mode,
      model:          model.label,
      outputType:     (payload.settings && payload.settings.outputType) || 'PRECISE',
      aspectRatio:    ratio,
      numImages:      numImages,
      rawPrompt:      rawPrompt,
      refCount:       (payload.refs || []).length,
      payload:        payload,
      enhancerInput:  null,
      enhancerOutput: null,
      imageManifest:  null,
      imagesSent:     null,
      timingMs:       null,
      result:         null,
      error:          null
    } : null;

    var enhancePromise = window.PromptEnhancer
      ? window.PromptEnhancer.enhance(payload).catch(function (err) {
          if (debugEntry) debugEntry.error = 'Enhancer failed: ' + err.message;
          return { prompt: rawPrompt, manifest: [], enhancerInput: null };
        })
      : Promise.resolve({ prompt: rawPrompt, manifest: [], enhancerInput: null });

    enhancePromise.then(function (enhanced) {
      var t1 = Date.now();
      var finalPrompt = enhanced.prompt;
      var manifest = enhanced.manifest;

      if (debugEntry) {
        debugEntry.enhancerInput  = enhanced.enhancerInput || null;
        debugEntry.enhancerOutput = finalPrompt;
        debugEntry.imageManifest  = manifest || null;
      }

      var loadingIds = [];
      for (var li = 0; li < numImages; li++) {
        var lid = 'loading-' + Date.now() + '-' + li;
        loadingIds.push(lid);
        window.Gallery.addLoading(lid, ratio, mode);
      }

      var isCreative = (payload.settings && payload.settings.outputType) === 'CREATIVE';
      var imageRefs = (payload.refs || []).concat(isCreative ? [] : collectLayerImageUrls(payload));
      var imageSize = window.CafeSettings.getActiveResolution();
      var thinkingLevel = model.thinkingLevel || null;

      if (debugEntry) {
        debugEntry.imagesSent = {
          total:       imageRefs.length,
          refs:        (payload.refs || []).length,
          layerImages: imageRefs.length - (payload.refs || []).length,
          isCreative:  isCreative
        };
      }

      _activeRequests++;
      var tGen = Date.now();
      console.log('[CafeAPI] Generation start | model:', model.id, '| images:', numImages, '| ratio:', ratio, '| CREATIVE:', isCreative, '| active requests:', _activeRequests);
      googleGenerate(model.id, apiKey, finalPrompt, numImages, ratio, imageRefs, imageSize, thinkingLevel)
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

          if (debugEntry) {
            var t2 = Date.now();
            debugEntry.timingMs = { enhancer: t1 - t0, generation: t2 - t1, total: t2 - t0 };
            debugEntry.result   = { success: true, imagesReceived: imgUrls.length };
            window.CafeDebug.record(debugEntry);
          }

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
                usedImages: usedImages
              };
              var img = new Image();
              img.onload = function () {
                cell.dims = img.naturalWidth + ' × ' + img.naturalHeight;
                if (window.Workspace) window.Workspace.autosave();
              };
              img.src = dataUrl;
              window.Gallery.resolveLoading(loadingIds[i] || loadingIds[0], cell);
              if (window.Workspace) window.Workspace.autosave();
            });
          } finally {
            for (var ri = imgUrls.length; ri < loadingIds.length; ri++) {
              if (window.Gallery) window.Gallery.removeLoading(loadingIds[ri]);
            }
          }
        })
        .catch(function (err) {
          console.error('[CafeAPI] Generation failed:', err.message);
          if (debugEntry) {
            var t2 = Date.now();
            debugEntry.timingMs = { enhancer: t1 - t0, generation: t2 - t1, total: t2 - t0 };
            debugEntry.result   = { success: false };
            debugEntry.error    = (debugEntry.error ? debugEntry.error + ' | ' : '') + err.message;
            window.CafeDebug.record(debugEntry);
          }
          loadingIds.forEach(function (lid) {
            if (window.Gallery) window.Gallery.removeLoading(lid);
          });
        })
        .then(function () {
          _activeRequests--;
          if (_activeRequests === 0 && genBtn) genBtn.classList.remove('cafe-loading');
        });
    });
  }

  return { generate: generate };

})();
