// vision.js
window.VisionScan = (function () {

  var MODEL = 'gemini-2.5-flash';

  var PROSE = ' Write in flowing prose. No bullet points, no headers, no markdown formatting. Start directly with the description — no preamble.';

  var _PERSON_PROMPT = 'Describe the person in this image as a reference for AI image generation. Cover their physical build, approximate age, facial features, hair colour and style, and skin tone. Paint a clear picture of who this person is visually.';

  var SUBJECT_PROMPTS = {
    'CHARACTER': _PERSON_PROMPT,
    'PERSON': _PERSON_PROMPT,
    'MODEL': _PERSON_PROMPT,
    'SUBJECT': _PERSON_PROMPT,
    'OUTFIT': 'Describe only the clothing visible in this image as a wardrobe reference. Cover each garment — what it is, its colour, material, style, and how it fits. Ignore the person wearing it entirely.',
    'FACE': 'Describe the face in this image as a face reference for AI generation. Cover facial structure, eyes, nose, lips, skin tone, and any distinctive features that make this face recognisable.',
    'HAIR': 'Describe only the hairstyle in this image. Cover the length, colour, texture, and style. Ignore everything else in the image.',
    'CAP': 'Describe only the headwear in this image. Cover what type it is, its colour, material, and style. Ignore the person wearing it.',
    'PROP': 'Describe only the main object or prop in this image. Cover what it is, its appearance, colour, material, and any notable details.',
    'OBJECT': 'Describe only the main object or prop in this image. Cover what it is, its appearance, colour, material, and any notable details.',
    'ANIMAL': 'Describe the animal in this image as a subject reference for AI image generation. Cover the species, size, colour, markings, fur or skin texture, and any distinctive physical features.',
    'ACCESSORY': 'Describe the accessory or wearable item in this image. Cover what it is, its colour, material, style, and how it would be worn or carried.'
  };

  var STAGE_PROMPTS = {
    'BACKGROUND': 'Describe only the background environment in this image as a scene reference. Cover the setting, colours, atmosphere, and lighting. Ignore any people or subjects in the foreground.',
    'LOCATION': 'Describe the location in this image. Cover the type of place, its architecture or geography, the time of day, and the overall atmosphere.',
    'SETTING': 'Describe the location in this image. Cover the type of place, its architecture or geography, the time of day, and the overall atmosphere.',
    'LIGHTING': 'Describe only the lighting in this image. Cover the source, direction, colour temperature, intensity, and the mood it creates.',
    'ENVIRONMENT': 'Describe the environment in this image. Cover the setting, weather conditions, atmosphere, and the surrounding elements that define the space.',
    'SCENE': 'Describe the environment in this image. Cover the setting, weather conditions, atmosphere, and the surrounding elements that define the space.',
    'INTERIOR': 'Describe the interior space in this image. Cover the room type, surfaces, colours, architectural details, furniture, and lighting.',
    'EXTERIOR': 'Describe the exterior environment in this image. Cover the setting, architecture or landscape, sky conditions, time of day, and atmosphere.',
    'SKY': 'Describe the sky in this image. Cover cloud formation or lack thereof, colour gradient, light quality, time of day, and weather conditions.',
    'FOREGROUND': 'Describe the foreground elements in this image. Cover what objects or surfaces are in the front of the frame, their colours, textures, and how they frame the scene.',
    'PROP': 'Describe the main prop or object in this image. Cover what it is, its appearance, colour, material, and notable details.'
  };

  var STYLE_PROMPT = 'Describe the visual style of this image as a style reference for AI image generation. Write 3 to 5 sentences. Cover: the photographic or artistic medium, the colour palette and any colour grading (name the grade if it has one, such as teal-orange, bleach bypass, or cross-processed), the lighting quality and direction, the texture and rendering feel (film grain, digital, painterly), the camera angle and depth of field, and the overall aesthetic mood. If the image belongs to a recognisable aesthetic movement or era — such as Y2K, vintage film, dark academia, cottagecore, vaporwave, or editorial fashion — name it. Focus entirely on the visual treatment, not on what the image depicts.';

  var REF_PROMPT = 'Describe this image as a complete reference for AI generation. Write 4 to 6 sentences covering the subject or subjects, the environment and setting, the lighting and its effect on the scene, the colour palette, the mood and atmosphere, and the visual style or aesthetic. Be thorough enough that someone could reconstruct the image from your description alone.';

  var PRECISE_SUFFIX = ' Be precise and specific. Prioritise measurable, reproducible details.';

  function buildPrompt(layerName, section) {
    var name = (layerName || '').toUpperCase().trim();
    var base = '';
    if (section === 'subject' && SUBJECT_PROMPTS[name]) base = SUBJECT_PROMPTS[name];
    else if (section === 'stage' && STAGE_PROMPTS[name]) base = STAGE_PROMPTS[name];
    else if (section === 'subject') {
      base = 'Describe the ' + (layerName || 'subject') + ' in this image as a subject reference for AI image generation. This element will appear as a foreground subject in the generated image — describe what it is, its appearance, colours, defining visual details, and any features that make it immediately recognisable.';
    } else if (section === 'stage') {
      base = 'Describe the ' + (layerName || 'element') + ' in this image as a scene element for AI image generation. This element will appear in the background or environment of the generated image — describe its setting, spatial presence, colours, atmosphere, and how it contributes to the scene.';
    } else {
      base = 'Describe the ' + (layerName || 'subject') + ' in this image as an AI generation reference. Cover its appearance, colours, and key visual details.';
    }
    return base + PROSE + PRECISE_SUFFIX;
  }

  function getTimeoutMs() {
    return (window.CafeSettings && window.CafeSettings.getScanTimeout ? window.CafeSettings.getScanTimeout() : 20) * 1000;
  }

  var _cache = {};    // permanent per-session: key → description string
  var _inFlight = {}; // concurrent dedup: key → in-flight Promise

  function deduped(key, factory) {
    if (_cache[key]) {
      console.log('[VisionScan] cache hit (permanent) →', key.slice(0, 60));
      return Promise.resolve(_cache[key]);
    }
    if (_inFlight[key]) {
      console.log('[VisionScan] cache hit (in-flight) →', key.slice(0, 60));
      return _inFlight[key];
    }
    var p = factory().then(
      function (r) { _cache[key] = r; delete _inFlight[key]; return r; },
      function (e) { delete _inFlight[key]; throw e; }
    );
    _inFlight[key] = p;
    return p;
  }

  function callGemini(apiKey, prompt, base64, mimeType) {
    var url = 'https://aiplatform.googleapis.com/v1/publishers/google/models/' + MODEL + ':generateContent?key=' + apiKey;

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, getTimeoutMs());
    var t0 = Date.now();
    console.log('[VisionScan] → POST', MODEL, '| mime:', mimeType, '| prompt:', prompt.slice(0, 80) + '...');

    return fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user', parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } }
          ]
        }],
        generationConfig: { maxOutputTokens: 1024 }
      })
    })
      .then(function (res) {
        clearTimeout(timer);
        return res.json().then(function (data) {
          if (!res.ok) throw new Error('[VisionScan] ' + res.status + ': ' + JSON.stringify(data));
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
        if (!text) throw new Error('[VisionScan] Empty response');
        console.log('[VisionScan] ✓', MODEL, '| ' + (Date.now() - t0) + 'ms | chars:', text.trim().length);
        return text.trim();
      })
      .catch(function (err) {
        clearTimeout(timer);
        console.warn('[VisionScan] ✗', MODEL, '| ' + (Date.now() - t0) + 'ms |', err.message);
        throw err;
      });
  }

  function parseDataUrl(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    var mimeMatch = dataUrl.match(/^data:([^;]+);/);
    var mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    return { base64: base64, mimeType: mimeType };
  }

  function describe(base64DataUrl, layerName, section) {
    var apiKey = window.CafeSettings.getGoogleApiKey();
    if (!apiKey) return Promise.reject(new Error('[VisionScan] No Google API key'));
    if (!base64DataUrl || typeof base64DataUrl !== 'string') {
      return Promise.reject(new Error('[VisionScan] Invalid image data'));
    }
    var parsed = parseDataUrl(base64DataUrl);
    if (!parsed.base64) return Promise.reject(new Error('[VisionScan] Invalid image data'));
    var key = 'describe:' + parsed.base64.slice(0, 512) + ':' + section + ':' + layerName;
    console.log('[VisionScan] describe →', section, '/', layerName);
    return deduped(key, function () {
      return callGemini(apiKey, buildPrompt(layerName, section), parsed.base64, parsed.mimeType);
    })
      .then(function (desc) { console.log('[VisionScan] describe ✓', section, '/', layerName); return desc; })
      .catch(function (err) { console.warn('[VisionScan] describe ✗', section, '/', layerName, '—', err.message); throw err; });
  }

  function describeStyle(base64DataUrl) {
    var apiKey = window.CafeSettings.getGoogleApiKey();
    if (!apiKey) return Promise.reject(new Error('[VisionScan] No Google API key'));
    if (!base64DataUrl || typeof base64DataUrl !== 'string') {
      return Promise.reject(new Error('[VisionScan] Invalid image data'));
    }
    var parsed = parseDataUrl(base64DataUrl);
    if (!parsed.base64) return Promise.reject(new Error('[VisionScan] Invalid image data'));
    var key = 'style:' + parsed.base64.slice(0, 512);
    console.log('[VisionScan] describeStyle →');
    return deduped(key, function () {
      return callGemini(apiKey, STYLE_PROMPT + PROSE + PRECISE_SUFFIX, parsed.base64, parsed.mimeType);
    })
      .then(function (desc) { console.log('[VisionScan] describeStyle ✓'); return desc; })
      .catch(function (err) { console.warn('[VisionScan] describeStyle ✗ —', err.message); throw err; });
  }

  function describeRef(base64DataUrl) {
    var apiKey = window.CafeSettings.getGoogleApiKey();
    if (!apiKey) return Promise.reject(new Error('[VisionScan] No Google API key'));
    if (!base64DataUrl || typeof base64DataUrl !== 'string') {
      return Promise.reject(new Error('[VisionScan] Invalid image data'));
    }
    var parsed = parseDataUrl(base64DataUrl);
    if (!parsed.base64) return Promise.reject(new Error('[VisionScan] Invalid image data'));
    var key = 'ref:' + parsed.base64.slice(0, 512);
    console.log('[VisionScan] describeRef →');
    return deduped(key, function () {
      return callGemini(apiKey, REF_PROMPT + PROSE + PRECISE_SUFFIX, parsed.base64, parsed.mimeType);
    })
      .then(function (desc) { console.log('[VisionScan] describeRef ✓'); return desc; })
      .catch(function (err) { console.warn('[VisionScan] describeRef ✗ —', err.message); throw err; });
  }

  function clearCache() {
    Object.keys(_cache).forEach(function (k) { delete _cache[k]; });
    Object.keys(_inFlight).forEach(function (k) { delete _inFlight[k]; });
    console.log('[VisionScan] Cache cleared');
  }

  window._visionCache = _cache;

  return { describe: describe, describeStyle: describeStyle, describeRef: describeRef, clearCache: clearCache };

})();
