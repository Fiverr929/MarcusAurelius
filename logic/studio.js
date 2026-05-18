// studio.js
window.Studio = (function () {

  var _onDone    = null;
  var _latestUrl = null;
  var _ratio     = '1:1';
  var _caller    = null;

  var RATIO_MAP = [
    { key: '1:1',  w: 1, h: 1  },
    { key: '16:9', w: 16, h: 9 },
    { key: '9:16', w: 9, h: 16 },
    { key: '4:3',  w: 4, h: 3  },
    { key: '3:4',  w: 3, h: 4  }
  ];

  function nearestRatio(w, h) {
    var best = '1:1', bestDiff = Infinity;
    RATIO_MAP.forEach(function (r) {
      var diff = Math.abs((w / h) - (r.w / r.h));
      if (diff < bestDiff) { bestDiff = diff; best = r.key; }
    });
    return best;
  }

  function mimeFrom(url) {
    var m = url.match(/^data:([^;]+);/);
    return m ? m[1] : 'image/png';
  }

  function base64From(url) {
    var i = url.indexOf(',');
    return i !== -1 ? url.slice(i + 1) : url;
  }

  // ── DOM refs (lazy-init) ──────────────────────────────────────────────────

  var overlay, studioCanvas, drawLayer, cropOverlay, historyFrames,
      promptInput, refineBtn, toolSubmenu;
  var ctx;

  var undoStack = [], redoStack = [];
  var activeTool = null;
  var isDrawing  = false;
  var currentStroke = null;
  var strokeColor = '#ea5823';
  var strokeSize  = 3;

  var cropBox = null, cropRatio = 16 / 9, cropIsFree = false;
  var cropDrag = null, cropResize = null;

  function grabDOM() {
    overlay       = document.getElementById('studio-overlay');
    studioCanvas  = document.getElementById('studioCanvas');
    drawLayer     = document.getElementById('studioDrawLayer');
    cropOverlay   = document.getElementById('studioCropOverlay');
    historyFrames = document.getElementById('studioHistoryFrames');
    promptInput   = document.getElementById('studioPromptInput');
    refineBtn     = document.getElementById('studioRefineBtn');
    toolSubmenu   = document.getElementById('studioToolSubmenu');
    ctx           = drawLayer.getContext('2d');
  }

  // ── History ───────────────────────────────────────────────────────────────

  function addPlaceholders() {
    for (var i = 0; i < 3; i++) {
      var p = document.createElement('div');
      p.className = 'history-thumb history-placeholder';
      historyFrames.appendChild(p);
    }
  }

  function clearHistory() {
    historyFrames.innerHTML = '';
    addPlaceholders();
  }

  function setActiveVersion(url, thumb) {
    var existing = studioCanvas.querySelector('img');
    if (existing) existing.remove();
    var img = document.createElement('img');
    img.src = url;
    img.alt = '';
    studioCanvas.insertBefore(img, studioCanvas.firstChild);
    overlay.querySelectorAll('.history-thumb').forEach(function (t) { t.classList.remove('active'); });
    thumb.classList.add('active');
    _latestUrl = url;

    var probe = new Image();
    probe.onload = function () {
      studioCanvas.style.aspectRatio = probe.naturalWidth + ' / ' + probe.naturalHeight;
      requestAnimationFrame(syncDrawLayer);
    };
    probe.src = url;
  }

  function addToHistory(url) {
    var placeholder = historyFrames.querySelector('.history-placeholder');
    if (placeholder) placeholder.remove();
    var thumb = document.createElement('div');
    thumb.className = 'history-thumb';
    thumb.innerHTML = '<img src="' + url + '" alt="">';
    thumb.addEventListener('click', function () { setActiveVersion(url, thumb); });
    historyFrames.prepend(thumb);
    setActiveVersion(url, thumb);
  }

  function addLoadingThumb() {
    var placeholder = historyFrames.querySelector('.history-placeholder');
    if (placeholder) placeholder.remove();
    var thumb = document.createElement('div');
    thumb.className = 'history-thumb loading';
    historyFrames.prepend(thumb);
    return thumb;
  }

  function resolveLoadingThumb(thumb, url) {
    thumb.className = 'history-thumb';
    thumb.innerHTML = '<img src="' + url + '" alt="">';
    thumb.addEventListener('click', function () { setActiveVersion(url, thumb); });
    setActiveVersion(url, thumb);
  }

  function removeLoadingThumb(thumb) {
    thumb.remove();
    if (!historyFrames.querySelector('.history-thumb')) addPlaceholders();
  }

  // ── Draw layer ────────────────────────────────────────────────────────────

  function syncDrawLayer() {
    drawLayer.width  = studioCanvas.offsetWidth;
    drawLayer.height = studioCanvas.offsetHeight;
    redrawStrokes();
  }

  function redrawStrokes() {
    ctx.clearRect(0, 0, drawLayer.width, drawLayer.height);
    undoStack.forEach(function (stroke) {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth   = stroke.size;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points.slice(1).forEach(function (p) { ctx.lineTo(p.x, p.y); });
      ctx.stroke();
    });
  }

  function pencilMouseDown(e) {
    isDrawing = true;
    var r = drawLayer.getBoundingClientRect();
    var sx = drawLayer.width  / drawLayer.offsetWidth;
    var sy = drawLayer.height / drawLayer.offsetHeight;
    currentStroke = { color: strokeColor, size: strokeSize, points: [{ x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }] };
    redoStack = [];
  }

  function pencilMouseMove(e) {
    if (!isDrawing) return;
    var r  = drawLayer.getBoundingClientRect();
    var sx = drawLayer.width  / drawLayer.offsetWidth;
    var sy = drawLayer.height / drawLayer.offsetHeight;
    var pt = { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
    currentStroke.points.push(pt);
    ctx.beginPath();
    ctx.strokeStyle = currentStroke.color;
    ctx.lineWidth   = currentStroke.size;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    var pts = currentStroke.points;
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  }

  function pencilMouseUp() {
    if (!isDrawing || !currentStroke) return;
    isDrawing = false;
    undoStack.push(currentStroke);
    currentStroke = null;
    updatePromptPlaceholder();
  }

  function enablePencil() {
    syncDrawLayer();
    drawLayer.style.pointerEvents = 'all';
    drawLayer.style.cursor = 'crosshair';
    drawLayer.addEventListener('mousedown',  pencilMouseDown);
    drawLayer.addEventListener('mousemove',  pencilMouseMove);
    drawLayer.addEventListener('mouseup',    pencilMouseUp);
    drawLayer.addEventListener('mouseleave', pencilMouseUp);
  }

  function disablePencil() {
    drawLayer.style.pointerEvents = 'none';
    drawLayer.style.cursor = '';
    drawLayer.removeEventListener('mousedown',  pencilMouseDown);
    drawLayer.removeEventListener('mousemove',  pencilMouseMove);
    drawLayer.removeEventListener('mouseup',    pencilMouseUp);
    drawLayer.removeEventListener('mouseleave', pencilMouseUp);
  }

  function updatePromptPlaceholder() {
    promptInput.placeholder = undoStack.length > 0
      ? 'Describe what to do in the marked area...'
      : 'What do you want me to do now?';
  }

  // ── Crop tool ─────────────────────────────────────────────────────────────

  function enableCrop() {
    cropOverlay.classList.add('active');
    buildCropBox();
  }

  function disableCrop() {
    cropOverlay.classList.remove('active');
    cropOverlay.innerHTML = '';
    cropBox = null;
    document.removeEventListener('mousemove', onCropMouseMove);
    document.removeEventListener('mouseup',   onCropMouseUp);
  }

  function buildCropBox() {
    cropOverlay.innerHTML = '';
    var cw = studioCanvas.offsetWidth;
    var ch = studioCanvas.offsetHeight;
    var bw, bh;
    if (cropIsFree) {
      bw = cw * 0.7; bh = ch * 0.7;
    } else {
      bw = Math.min(cw * 0.8, ch * 0.8 * cropRatio);
      bh = bw / cropRatio;
      if (bh > ch * 0.8) { bh = ch * 0.8; bw = bh * cropRatio; }
    }
    var bx = (cw - bw) / 2;
    var by = (ch - bh) / 2;

    cropBox = document.createElement('div');
    cropBox.className = 'crop-box';
    cropBox.style.left   = bx + 'px';
    cropBox.style.top    = by + 'px';
    cropBox.style.width  = bw + 'px';
    cropBox.style.height = bh + 'px';

    [
      { pos: 'tl', cursor: 'nw-resize', top: '-5px', left: '-5px' },
      { pos: 'tr', cursor: 'ne-resize', top: '-5px', right: '-5px' },
      { pos: 'bl', cursor: 'sw-resize', bottom: '-5px', left: '-5px' },
      { pos: 'br', cursor: 'se-resize', bottom: '-5px', right: '-5px' }
    ].forEach(function (h) {
      var el = document.createElement('div');
      el.className = 'crop-handle';
      el.dataset.pos = h.pos;
      el.style.cursor = h.cursor;
      if (h.top)    el.style.top    = h.top;
      if (h.bottom) el.style.bottom = h.bottom;
      if (h.left)   el.style.left   = h.left;
      if (h.right)  el.style.right  = h.right;
      el.addEventListener('mousedown', startCropResize);
      cropBox.appendChild(el);
    });

    cropBox.addEventListener('mousedown', startCropDrag);
    cropOverlay.appendChild(cropBox);
    document.addEventListener('mousemove', onCropMouseMove);
    document.addEventListener('mouseup',   onCropMouseUp);
  }

  function startCropDrag(e) {
    if (e.target !== cropBox) return;
    e.preventDefault();
    cropDrag = { startX: e.clientX, startY: e.clientY, origLeft: parseInt(cropBox.style.left), origTop: parseInt(cropBox.style.top) };
  }

  function startCropResize(e) {
    e.preventDefault(); e.stopPropagation();
    cropResize = {
      pos: e.target.dataset.pos,
      startX: e.clientX, startY: e.clientY,
      origLeft: parseInt(cropBox.style.left), origTop: parseInt(cropBox.style.top),
      origW: parseInt(cropBox.style.width),   origH: parseInt(cropBox.style.height)
    };
  }

  function onCropMouseMove(e) {
    var cw = studioCanvas.offsetWidth;
    var ch = studioCanvas.offsetHeight;
    if (cropDrag) {
      var dx = e.clientX - cropDrag.startX;
      var dy = e.clientY - cropDrag.startY;
      var bw = parseInt(cropBox.style.width);
      var bh = parseInt(cropBox.style.height);
      cropBox.style.left = Math.max(0, Math.min(cropDrag.origLeft + dx, cw - bw)) + 'px';
      cropBox.style.top  = Math.max(0, Math.min(cropDrag.origTop  + dy, ch - bh)) + 'px';
    }
    if (cropResize) {
      var dx2 = e.clientX - cropResize.startX;
      var dy2 = e.clientY - cropResize.startY;
      var l = cropResize.origLeft, t = cropResize.origTop, w = cropResize.origW, h = cropResize.origH;
      var pos = cropResize.pos;
      var nl = l, nt = t, nw = w, nh = h;
      if (pos === 'br') { nw = Math.max(40, w + dx2); nh = cropIsFree ? Math.max(40, h + dy2) : nw / cropRatio; }
      if (pos === 'bl') { nw = Math.max(40, w - dx2); nl = l + w - nw; nh = cropIsFree ? Math.max(40, h + dy2) : nw / cropRatio; }
      if (pos === 'tr') { nw = Math.max(40, w + dx2); nh = cropIsFree ? Math.max(40, h - dy2) : nw / cropRatio; nt = cropIsFree ? t + h - nh : t + h - nw / cropRatio; }
      if (pos === 'tl') { nw = Math.max(40, w - dx2); nl = l + w - nw; nh = cropIsFree ? Math.max(40, h - dy2) : nw / cropRatio; nt = t + h - nh; }
      nl = Math.max(0, nl); nt = Math.max(0, nt);
      nw = Math.min(nw, cw - nl); nh = Math.min(nh, ch - nt);
      cropBox.style.left   = nl + 'px';
      cropBox.style.top    = nt + 'px';
      cropBox.style.width  = nw + 'px';
      cropBox.style.height = nh + 'px';
    }
  }

  function onCropMouseUp() { cropDrag = null; cropResize = null; }

  // ── Tool system ───────────────────────────────────────────────────────────

  function activateTool(tool, btn) {
    deactivateTool();
    activeTool = tool;
    btn.classList.add('active');
    toolSubmenu.classList.add('open');
    overlay.querySelectorAll('.submenu-panel').forEach(function (p) { p.classList.remove('visible'); });
    overlay.querySelector('.submenu-panel[data-tool="' + tool + '"]').classList.add('visible');
    if (tool === 'pencil') enablePencil();
    if (tool === 'crop')   enableCrop();
  }

  function deactivateTool() {
    if (!activeTool) return;
    overlay.querySelectorAll('.tool-btn').forEach(function (b) { b.classList.remove('active'); });
    toolSubmenu.classList.remove('open');
    overlay.querySelectorAll('.submenu-panel').forEach(function (p) { p.classList.remove('visible'); });
    if (activeTool === 'pencil') disablePencil();
    if (activeTool === 'crop')   disableCrop();
    activeTool = null;
  }

  // ── API call ──────────────────────────────────────────────────────────────

  function callStudioAPI(canvasImgUrl, annotationDataUrl, prompt) {
    var apiKey = window.CafeSettings.getGoogleApiKey();
    var model  = window.CafeSettings.getActiveModel();
    if (!apiKey) { window.CafeSettings.openModal(); return Promise.reject(new Error('No API key')); }

    var fullPrompt = prompt + (undoStack.length > 0 ? ' Focus on the annotated area.' : '');
    var parts = [{ text: fullPrompt }];
    parts.push({ inline_data: { mime_type: mimeFrom(canvasImgUrl), data: base64From(canvasImgUrl) } });
    if (undoStack.length > 0) {
      parts.push({ inline_data: { mime_type: 'image/png', data: base64From(annotationDataUrl) } });
    }

    var moduleImages = window.StudioModule.collectImages();
    moduleImages.forEach(function (imgUrl) {
      parts.push({ inline_data: { mime_type: mimeFrom(imgUrl), data: base64From(imgUrl) } });
    });

    var generationConfig = {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: _ratio, imageOutputOptions: { mimeType: 'image/png' } }
    };

    return window.CafeAPI.callGoogleAPI(model.id, apiKey, parts, generationConfig)
      .then(function (data) {
        var candidate = data.candidates && data.candidates[0];
        var part = candidate && candidate.content && candidate.content.parts &&
          candidate.content.parts.find(function (p) { return p.inlineData || p.inline_data; });
        if (!part) throw new Error('No image in response');
        var id = part.inlineData || part.inline_data;
        return 'data:' + (id.mimeType || id.mime_type || 'image/png') + ';base64,' + id.data;
      });
  }

  // ── Init (once) ───────────────────────────────────────────────────────────

  var _initialized = false;

  function initListeners() {
    if (_initialized) return;
    _initialized = true;

    grabDOM();

    document.getElementById('studio-close').addEventListener('click', close);

    overlay.querySelectorAll('.tool-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tool = btn.dataset.tool;
        if (activeTool === tool) deactivateTool();
        else activateTool(tool, btn);
      });
    });

    overlay.querySelectorAll('.size-dot').forEach(function (btn) {
      btn.addEventListener('click', function () {
        overlay.querySelectorAll('.size-dot').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        strokeSize = parseInt(btn.dataset.size);
      });
    });

    overlay.querySelectorAll('.color-swatch').forEach(function (btn) {
      btn.addEventListener('click', function () {
        overlay.querySelectorAll('.color-swatch').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        strokeColor = btn.dataset.color;
      });
    });

    document.getElementById('studioUndoBtn').addEventListener('click', function () {
      if (!undoStack.length) return;
      redoStack.push(undoStack.pop());
      redrawStrokes();
      updatePromptPlaceholder();
    });

    document.getElementById('studioRedoBtn').addEventListener('click', function () {
      if (!redoStack.length) return;
      undoStack.push(redoStack.pop());
      redrawStrokes();
      updatePromptPlaceholder();
    });

    overlay.querySelectorAll('.crop-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        overlay.querySelectorAll('.crop-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var r = btn.dataset.ratio;
        if (r === 'free') {
          cropIsFree = true;
        } else {
          cropIsFree = false;
          var parts = r.split('/');
          cropRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
        }
        if (activeTool === 'crop') buildCropBox();
      });
    });

    document.getElementById('studioApplyCropBtn').addEventListener('click', function () {
      var img = studioCanvas.querySelector('img');
      if (!img || !cropBox) return;
      var scaleX = img.naturalWidth  / studioCanvas.offsetWidth;
      var scaleY = img.naturalHeight / studioCanvas.offsetHeight;
      var bx = parseInt(cropBox.style.left)   * scaleX;
      var by = parseInt(cropBox.style.top)    * scaleY;
      var bw = parseInt(cropBox.style.width)  * scaleX;
      var bh = parseInt(cropBox.style.height) * scaleY;
      var offscreen = document.createElement('canvas');
      offscreen.width  = bw;
      offscreen.height = bh;
      offscreen.getContext('2d').drawImage(img, bx, by, bw, bh, 0, 0, bw, bh);
      offscreen.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        disableCrop();
        deactivateTool();
        addToHistory(url);
      });
    });

    refineBtn.addEventListener('click', function () {
      var prompt = promptInput.value.trim();
      if (!prompt) return;
      var canvasImg = studioCanvas.querySelector('img');
      if (!canvasImg) return;

      var srcUrl            = canvasImg.src;
      var annotationDataUrl = drawLayer.toDataURL('image/png');
      var capturedPrompt    = prompt;

      undoStack = []; redoStack = [];
      promptInput.value = '';
      syncDrawLayer();
      updatePromptPlaceholder();

      var loadingThumb = addLoadingThumb();

      callStudioAPI(srcUrl, annotationDataUrl, capturedPrompt)
        .then(function (resultUrl) {
          resolveLoadingThumb(loadingThumb, resultUrl);
        })
        .catch(function (err) {
          console.error('[Studio] API failed:', err);
          removeLoadingThumb(loadingThumb);
        });
    });
  }

  // ── Open / Close ──────────────────────────────────────────────────────────

  function open(config) {
    initListeners();
    window.StudioModule.init();
    window.StudioModule.reset();

    _onDone    = config.onDone || null;
    _latestUrl = null;
    _caller    = config.caller || 'gallery';
    _ratio     = config.ratio || '1:1';

    if (!config.ratio && config.imgUrl) {
      var probe = new Image();
      probe.onload = function () {
        _ratio = nearestRatio(probe.naturalWidth, probe.naturalHeight);
      };
      probe.src = config.imgUrl;
    }

    undoStack = []; redoStack = [];
    activeTool = null;
    strokeColor = '#ea5823'; strokeSize = 3;
    cropRatio = 16 / 9; cropIsFree = false;

    overlay.querySelectorAll('.size-dot').forEach(function (b) { b.classList.toggle('active', b.dataset.size === '3'); });
    overlay.querySelectorAll('.color-swatch').forEach(function (b) { b.classList.toggle('active', b.dataset.color === '#ea5823'); });
    overlay.querySelectorAll('.crop-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.ratio === '16/9'); });
    overlay.querySelectorAll('.tool-btn').forEach(function (b) { b.classList.remove('active'); });
    if (toolSubmenu) toolSubmenu.classList.remove('open');
    overlay.querySelectorAll('.submenu-panel').forEach(function (p) { p.classList.remove('visible'); });

    clearHistory();
    updatePromptPlaceholder();
    promptInput.value = '';
    addToHistory(config.imgUrl);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    deactivateTool();
    if (_onDone) _onDone(_latestUrl);
    _onDone = null;
  }

  return { open: open };

}());
