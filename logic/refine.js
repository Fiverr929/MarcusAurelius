// refine.js
window.RefineArea = (function () {

  var _onDone    = null;
  var _latestUrl = null;
  var _refs      = [];
  var _ratio     = '1:1';

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

  var overlay, refineCanvas, drawLayer, cropOverlay, historyFrames,
      promptInput, refineBtn, toolSubmenu;

  var undoStack = [], redoStack = [];
  var activeTool = null;
  var isDrawing  = false;
  var currentStroke = null;
  var strokeColor = '#ea5823';
  var strokeSize  = 3;
  var ctx;

  var cropBox = null, cropRatio = 16 / 9, cropIsFree = false;
  var cropDrag = null, cropResize = null;

  function mimeFrom(url) {
    var m = url.match(/^data:([^;]+);/);
    return m ? m[1] : 'image/png';
  }
  function base64From(url) {
    var i = url.indexOf(',');
    return i !== -1 ? url.slice(i + 1) : url;
  }

  // ── History ────────────────────────────────────────────────────────────

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
    var probe = new Image();
    probe.onload = function () {
      refineCanvas.style.aspectRatio = probe.naturalWidth + ' / ' + probe.naturalHeight;
    };
    probe.src = url;
    var existing = refineCanvas.querySelector('img');
    if (existing) existing.remove();
    var img = document.createElement('img');
    img.src = url;
    img.alt = 'refine image';
    refineCanvas.insertBefore(img, refineCanvas.firstChild);
    overlay.querySelectorAll('.history-thumb').forEach(function (t) { t.classList.remove('active'); });
    thumb.classList.add('active');
    syncDrawLayer();
  }

  function addToHistory(url) {
    var placeholder = historyFrames.querySelector('.history-placeholder');
    if (placeholder) placeholder.remove();
    var thumb = document.createElement('div');
    thumb.className = 'history-thumb';
    thumb.innerHTML = '<img src="' + url + '" alt="version">';
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
    thumb.innerHTML = '<img src="' + url + '" alt="version">';
    thumb.addEventListener('click', function () { setActiveVersion(url, thumb); });
    setActiveVersion(url, thumb);
  }

  function removeLoadingThumb(thumb) {
    thumb.remove();
    if (!historyFrames.querySelector('.history-thumb')) addPlaceholders();
  }

  // ── Draw layer ─────────────────────────────────────────────────────────

  function syncDrawLayer() {
    drawLayer.width  = refineCanvas.offsetWidth;
    drawLayer.height = refineCanvas.offsetHeight;
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

  // ── Crop tool ──────────────────────────────────────────────────────────

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
    var cw = refineCanvas.offsetWidth;
    var ch = refineCanvas.offsetHeight;
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

    var handles = [
      { pos: 'tl', cursor: 'nw-resize', top: '-5px', left: '-5px' },
      { pos: 'tr', cursor: 'ne-resize', top: '-5px', right: '-5px' },
      { pos: 'bl', cursor: 'sw-resize', bottom: '-5px', left: '-5px' },
      { pos: 'br', cursor: 'se-resize', bottom: '-5px', right: '-5px' }
    ];
    handles.forEach(function (h) {
      var el = document.createElement('div');
      el.className = 'crop-handle';
      el.dataset.pos = h.pos;
      el.style.cursor = h.cursor;
      if (h.top    != null) el.style.top    = h.top;
      if (h.bottom != null) el.style.bottom = h.bottom;
      if (h.left   != null) el.style.left   = h.left;
      if (h.right  != null) el.style.right  = h.right;
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
    var cw = refineCanvas.offsetWidth;
    var ch = refineCanvas.offsetHeight;
    if (cropDrag) {
      var dx = e.clientX - cropDrag.startX;
      var dy = e.clientY - cropDrag.startY;
      var bw = parseInt(cropBox.style.width);
      var bh = parseInt(cropBox.style.height);
      var nx = Math.max(0, Math.min(cropDrag.origLeft + dx, cw - bw));
      var ny = Math.max(0, Math.min(cropDrag.origTop  + dy, ch - bh));
      cropBox.style.left = nx + 'px';
      cropBox.style.top  = ny + 'px';
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

  // ── Tool system ────────────────────────────────────────────────────────

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

  // ── Ref chips ──────────────────────────────────────────────────────────

  function renderRefChips() {
    var refChipsRow  = overlay.querySelector('#refineRefChipsRow');
    var refUploadBtn = overlay.querySelector('#refineRefUploadBtn');
    refChipsRow.innerHTML = _refs.map(function (url, i) {
      return '<div class="ref-chip" data-index="' + i + '">'
        + '<div class="ref-chip-remove"></div>'
        + '<div class="ref-chip-thumb"><img src="' + url + '" alt=""><div class="ref-chip-overlay"></div><span class="ref-chip-label">R' + (i + 1) + '</span></div>'
        + '</div>';
    }).join('');
    refChipsRow.querySelectorAll('.ref-chip').forEach(function (chip) {
      chip.querySelector('.ref-chip-remove').addEventListener('click', function () {
        var idx = parseInt(chip.dataset.index, 10);
        _refs.splice(idx, 1);
        renderRefChips();
      });
    });
    if (_refs.length >= 3) refUploadBtn.classList.add('disabled');
    else refUploadBtn.classList.remove('disabled');
  }

  // ── API call ───────────────────────────────────────────────────────────

  function callRefineAPI(canvasImgUrl, annotationDataUrl, prompt) {
    var apiKey = window.CafeSettings.getGoogleApiKey();
    var model  = window.CafeSettings.getActiveModel();
    if (!apiKey) { window.CafeSettings.openModal(); return Promise.reject(new Error('No API key')); }

    var fullPrompt = prompt + (undoStack.length > 0 ? ' Focus on the annotated area.' : '');
    var parts = [{ text: fullPrompt }];
    parts.push({ inline_data: { mime_type: mimeFrom(canvasImgUrl), data: base64From(canvasImgUrl) } });
    if (undoStack.length > 0) {
      parts.push({ inline_data: { mime_type: 'image/png', data: base64From(annotationDataUrl) } });
    }
    _refs.forEach(function (r) {
      parts.push({ inline_data: { mime_type: mimeFrom(r), data: base64From(r) } });
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

  // ── Init (lazy) ────────────────────────────────────────────────────────

  function init() {
    overlay       = document.getElementById('refine-overlay');
    refineCanvas  = document.getElementById('refineCanvas');
    drawLayer     = document.getElementById('refineDrawLayer');
    cropOverlay   = document.getElementById('refineCropOverlay');
    historyFrames = document.getElementById('refineHistoryFrames');
    promptInput   = document.getElementById('refinePromptInput');
    refineBtn     = document.getElementById('refineBtn');
    toolSubmenu   = document.getElementById('refineToolSubmenu');
    ctx           = drawLayer.getContext('2d');

    // Close
    document.getElementById('refine-close').addEventListener('click', close);

    // Tool buttons
    overlay.querySelectorAll('.tool-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tool = btn.dataset.tool;
        if (activeTool === tool) deactivateTool();
        else activateTool(tool, btn);
      });
    });

    // Size dots
    overlay.querySelectorAll('.size-dot').forEach(function (btn) {
      btn.addEventListener('click', function () {
        overlay.querySelectorAll('.size-dot').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        strokeSize = parseInt(btn.dataset.size);
      });
    });

    // Color swatches
    overlay.querySelectorAll('.color-swatch').forEach(function (btn) {
      btn.addEventListener('click', function () {
        overlay.querySelectorAll('.color-swatch').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        strokeColor = btn.dataset.color;
      });
    });

    // Undo / Redo
    document.getElementById('refineUndoBtn').addEventListener('click', function () {
      if (!undoStack.length) return;
      redoStack.push(undoStack.pop());
      redrawStrokes();
      updatePromptPlaceholder();
    });
    document.getElementById('refineRedoBtn').addEventListener('click', function () {
      if (!redoStack.length) return;
      undoStack.push(redoStack.pop());
      redrawStrokes();
      updatePromptPlaceholder();
    });

    // Crop ratio buttons
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

    // Apply crop
    document.getElementById('refineApplyCropBtn').addEventListener('click', function () {
      var img = refineCanvas.querySelector('img');
      if (!img || !cropBox) return;
      var scaleX = img.naturalWidth  / refineCanvas.offsetWidth;
      var scaleY = img.naturalHeight / refineCanvas.offsetHeight;
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

    // Ref upload
    var refFileInput  = document.getElementById('refineRefFileInput');
    var refUploadBtn  = document.getElementById('refineRefUploadBtn');
    refUploadBtn.addEventListener('click', function () {
      if (_refs.length >= 3) return;
      refFileInput.value = '';
      refFileInput.click();
    });
    refFileInput.addEventListener('change', function () {
      var file = refFileInput.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      if (_refs.length >= 3) return;
      var reader = new FileReader();
      reader.onload = function (e) { _refs.push(e.target.result); renderRefChips(); };
      reader.readAsDataURL(file);
    });

    // Refine button — fire-and-forget, non-blocking
    refineBtn.addEventListener('click', function () {
      var prompt = promptInput.value.trim();
      if (!prompt) return;
      var canvasImg = refineCanvas.querySelector('img');
      if (!canvasImg) return;

      var srcUrl           = canvasImg.src;
      var annotationDataUrl = drawLayer.toDataURL('image/png');
      var capturedPrompt   = prompt;

      // Clear strokes for the next annotation round immediately
      undoStack = []; redoStack = [];
      promptInput.value = '';
      syncDrawLayer();
      updatePromptPlaceholder();

      var loadingThumb = addLoadingThumb();

      callRefineAPI(srcUrl, annotationDataUrl, capturedPrompt)
        .then(function (resultUrl) {
          _latestUrl = resultUrl;
          resolveLoadingThumb(loadingThumb, resultUrl);
        })
        .catch(function (err) {
          console.error('[RefineArea] API failed:', err);
          removeLoadingThumb(loadingThumb);
        });
    });
  }

  // ── Public ─────────────────────────────────────────────────────────────

  function open(imgUrl, ratio, onDone) {
    if (!overlay) init();
    _onDone    = onDone || null;
    _latestUrl = null;
    _refs      = [];
    undoStack  = []; redoStack = [];
    activeTool = null;
    strokeColor = '#ea5823'; strokeSize = 3;
    cropRatio = 16 / 9; cropIsFree = false;

    if (ratio) {
      _ratio = ratio;
    } else {
      var probe = new Image();
      probe.onload = function () { _ratio = nearestRatio(probe.naturalWidth, probe.naturalHeight); };
      probe.src = imgUrl;
      _ratio = '1:1';
    }

    overlay.querySelectorAll('.size-dot').forEach(function (b) { b.classList.toggle('active', b.dataset.size === '3'); });
    overlay.querySelectorAll('.color-swatch').forEach(function (b) { b.classList.toggle('active', b.dataset.color === '#ea5823'); });
    overlay.querySelectorAll('.crop-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.ratio === '16/9'); });
    overlay.querySelectorAll('.tool-btn').forEach(function (b) { b.classList.remove('active'); });
    if (toolSubmenu) toolSubmenu.classList.remove('open');
    overlay.querySelectorAll('.submenu-panel').forEach(function (p) { p.classList.remove('visible'); });
    clearHistory();
    renderRefChips();
    updatePromptPlaceholder();
    promptInput.value = '';
    addToHistory(imgUrl);
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

})();
