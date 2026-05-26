// gallery.js
(function () {
/* ═══════════════════════════════════════════════════════════
   DATA — 14 placeholder cells with varied ratios
═══════════════════════════════════════════════════════════ */
var CELLS = [];

/* ═══════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════ */
var selectMode = false;
var currentView = 'medium';
var hudOpen = false;
var hudIndex = 0;
var infoPanelOpen = false;
var selectedIds = new Set();
var visibleCells = [];

/* ═══════════════════════════════════════════════════════════
   DOM REFS
═══════════════════════════════════════════════════════════ */
var $scroll = document.getElementById('gallery-scroll');
var $grid = document.getElementById('gallery-grid');
var $btnSelect = document.getElementById('btn-select');
var $btnThreedot = document.getElementById('btn-threedot');
var $tdropdown = document.getElementById('threedot-dropdown');
var $btnFilter = document.getElementById('btn-filter');
var $filterDrop = document.getElementById('filter-dropdown');
var $hud = document.getElementById('hud');
var $hudCounter = document.getElementById('hud-counter');
var $hudSlideTrack = document.getElementById('hud-slide-track');
var $hudInfo = document.getElementById('hud-info');
var $hudInfoPanel = document.getElementById('hud-info-panel');
var $hudInfoClose = document.getElementById('hud-info-close');
var $hudPrev = document.getElementById('hud-prev');
var $hudNext = document.getElementById('hud-next');
var $hudClose = document.getElementById('hud-close');
var $hudThreedot = document.getElementById('hud-threedot');
var $hudThreedotDrop = document.getElementById('hud-threedot-dropdown');
var $infoPanelDate = document.getElementById('info-date');
var $infoPanelType = document.getElementById('info-type');
var $infoPanelDims = document.getElementById('info-dims');
var $infoPanelPrompt = document.getElementById('info-prompt');
var $btnCopy = document.getElementById('btn-copy-prompt');

/* ═══════════════════════════════════════════════════════════
   BUILD GRID CELLS
═══════════════════════════════════════════════════════════ */
function buildGrid() {
  applyFilters();
}

function currentSort() {
  return (document.querySelector('.filter-chip[data-group="sort"].active') || {dataset:{}}).dataset.val || 'newest';
}

function cellMatchesFilter(cell) {
  var ratioVal = (document.querySelector('.filter-chip[data-group="ratio"].active') || {dataset:{}}).dataset.val || 'all';
  if (ratioVal === 'landscape') return ['16:9', '21:9', '4:3'].includes(cell.ratio);
  if (ratioVal === 'portrait')  return ['9:16', '3:4'].includes(cell.ratio);
  if (ratioVal === 'square')    return cell.ratio === '1:1';
  return true;
}

function createCellElement(cell) {
  var el = document.createElement('div');
  el.className = 'gallery-cell';
  el.dataset.id = cell.id;
  el.dataset.ratio = cell.ratio;
  if (cell.uuid) el.dataset.uuid = cell.uuid;
  if (selectedIds.has(cell.id)) el.classList.add('selected');

  var inner = document.createElement('div');
  inner.className = 'cell-inner';
  if (cell.imgUrl) {
    inner.style.backgroundImage = 'url(\'' + cell.imgUrl + '\')';
    inner.style.backgroundSize = 'cover';
    inner.style.backgroundPosition = 'center';
  } else if (cell.phClass) {
    inner.classList.add(cell.phClass);
  }
  el.appendChild(inner);

  var check = document.createElement('div');
  check.className = 'cell-check';
  el.appendChild(check);

  el.addEventListener('click', function () { onCellClick(cell.id); });
  return el;
}

// Full rebuild — used for filter/sort changes and bulk operations.
function applyFilters() {
  var filtered = CELLS.filter(cellMatchesFilter);
  if (currentSort() === 'oldest') filtered = filtered.slice().reverse();

  visibleCells = filtered;

  var loadingEls = Array.from($grid.querySelectorAll('[data-loading-id]'));

  var frag = document.createDocumentFragment();
  filtered.forEach(function (cell) { frag.appendChild(createCellElement(cell)); });

  $grid.innerHTML = '';
  loadingEls.forEach(function (el) { $grid.appendChild(el); });
  $grid.appendChild(frag);
}

// Incremental insert for a single new (newest) cell — avoids rebuilding the
// whole grid. Keeps visibleCells aligned with the DOM order of gallery cells.
// loadingEl, if given, is the placeholder this cell resolves (newest sort
// replaces it in place; oldest sort removes it and appends at the end).
function insertCellIntoView(cell, loadingEl) {
  if (!cellMatchesFilter(cell)) {
    if (loadingEl) loadingEl.remove();
    return;
  }
  var el = createCellElement(cell);
  if (currentSort() === 'oldest') {
    if (loadingEl) loadingEl.remove();
    $grid.appendChild(el);
    visibleCells.push(cell);
  } else if (loadingEl) {
    loadingEl.replaceWith(el);
    visibleCells.unshift(cell);
  } else {
    var firstGallery = $grid.querySelector('.gallery-cell:not([data-loading-id])');
    if (firstGallery) $grid.insertBefore(el, firstGallery);
    else $grid.appendChild(el);
    visibleCells.unshift(cell);
  }
}

function removeCellFromView(id) {
  var el = $grid.querySelector('.gallery-cell[data-id="' + id + '"]');
  if (el) el.remove();
  var vi = visibleCells.findIndex(function (c) { return c.id === id; });
  if (vi !== -1) visibleCells.splice(vi, 1);
}

/* ═══════════════════════════════════════════════════════════
   CELL CLICK
═══════════════════════════════════════════════════════════ */
function onCellClick(id) {
  if (selectMode) {
    toggleSelect(id);
  } else {
    openHUD(id);
  }
}

/* ═══════════════════════════════════════════════════════════
   SELECT MODE
═══════════════════════════════════════════════════════════ */
function toggleSelect(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  updateCellSelection();
  updateThreedotItems();
}

function updateCellSelection() {
  document.querySelectorAll('.gallery-cell').forEach(function (el) {
    var id = +el.dataset.id;
    el.classList.toggle('selected', selectedIds.has(id));
  });
}

function setSelectMode(on) {
  selectMode = on;
  $scroll.dataset.select = on ? 'on' : 'off';
  $btnSelect.classList.toggle('active', on);
  document.getElementById('threedot-wrap').classList.toggle('visible', on);
  if (!on) {
    selectedIds.clear();
    updateCellSelection();
    closeDropdown($tdropdown);
    document.getElementById('threedot-wrap').classList.remove('visible');
    $btnThreedot.classList.remove('active');
  }
  updateThreedotItems();
}

$btnSelect.addEventListener('click', function () { setSelectMode(!selectMode); });

/* ═══════════════════════════════════════════════════════════
   3-DOT DROPDOWN
═══════════════════════════════════════════════════════════ */
function updateThreedotItems() {
  var hasSelected = selectedIds.size > 0;
  document.querySelectorAll('#threedot-dropdown .ddrop-item').forEach(function (el) {
    el.classList.toggle('disabled', !hasSelected);
  });
  $btnThreedot.classList.toggle('btn-disabled', !hasSelected);
  if (!hasSelected) closeDropdown($tdropdown);
}

$btnThreedot.addEventListener('click', function (e) {
  e.stopPropagation();
  var isOpen = $tdropdown.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) {
    $tdropdown.classList.add('open');
    $btnThreedot.classList.add('active');
  }
});

/* ═══════════════════════════════════════════════════════════
   VIEW TOGGLES
═══════════════════════════════════════════════════════════ */
document.querySelectorAll('.btn-view').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var view = btn.dataset.viewTarget;
    currentView = view;
    $scroll.dataset.view = view;
    document.querySelectorAll('.btn-view').forEach(function (b) {
      b.classList.toggle('active', b.dataset.viewTarget === view);
    });
  });
});

/* ═══════════════════════════════════════════════════════════
   FILTER DROPDOWN
═══════════════════════════════════════════════════════════ */
$btnFilter.addEventListener('click', function (e) {
  e.stopPropagation();
  var isOpen = $filterDrop.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) {
    $filterDrop.classList.add('open');
    $btnFilter.classList.add('active');
  }
});

document.querySelectorAll('.filter-chip').forEach(function (chip) {
  chip.addEventListener('click', function (e) {
    e.stopPropagation();
    var group = chip.dataset.group;
    var val = chip.dataset.val;

    if (group === 'type') {
      chip.classList.toggle('active');
    } else {
      document.querySelectorAll('.filter-chip[data-group="' + group + '"]').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
    }
    checkFilterActive();
    applyFilters();
  });
});

function checkFilterActive() {
  var sortActive = Array.from(document.querySelectorAll('.filter-chip[data-group="sort"].active')).map(function (c) { return c.dataset.val; });
  var ratioActive = Array.from(document.querySelectorAll('.filter-chip[data-group="ratio"].active')).map(function (c) { return c.dataset.val; });
  var nonDefault = sortActive.includes('oldest') || !ratioActive.includes('all');
  $btnFilter.classList.toggle('has-filter', nonDefault);
}

/* ═══════════════════════════════════════════════════════════
   DROPDOWN UTILITIES
═══════════════════════════════════════════════════════════ */
function closeDropdown(el) {
  el.classList.remove('open');
}
function closeAllDropdowns() {
  document.querySelectorAll('.dropdown.open').forEach(function (d) { d.classList.remove('open'); });
  $btnThreedot.classList.remove('active');
  $btnFilter.classList.remove('active');
  $hudThreedot.classList.remove('active');
}

document.addEventListener('click', function () { closeAllDropdowns(); });
document.querySelectorAll('.dropdown').forEach(function (d) { d.addEventListener('click', function (e) { e.stopPropagation(); }); });

/* ═══════════════════════════════════════════════════════════
   HUD
═══════════════════════════════════════════════════════════ */
// Index into the currently displayed (filtered/sorted) list — what the HUD navigates.
function visibleIndexById(id) {
  for (var i = 0; i < visibleCells.length; i++) {
    if (visibleCells[i].id === id) return i;
  }
  return -1;
}

function openHUD(id) {
  var idx = visibleIndexById(id);
  if (idx === -1) return;
  hudIndex = idx;
  hudOpen = true;
  $hud.classList.add('open');
  closeInfoPanel();
  renderHUDSlide(idx, 'none');
  document.body.style.overflow = 'hidden';
}

function closeHUD() {
  hudOpen = false;
  $hud.classList.remove('open');
  closeInfoPanel();
  document.body.style.overflow = '';
}

function renderHUDSlide(id, direction) {
  var cell = visibleCells[id];
  $hudCounter.textContent = (id + 1) + ' OF ' + visibleCells.length;

  var incoming = document.createElement('div');
  incoming.className = 'hud-slide';
  incoming.dataset.slideId = id;

  var placeholder = document.createElement('div');
  placeholder.className = 'hud-slide-placeholder' + (cell.phClass ? ' ' + cell.phClass : '');
  var w = cell.ratio.split(':').map(Number);
  var area = document.getElementById('hud-image-area');
  var maxW = area.clientWidth * 0.86;
  var maxH = area.clientHeight * 0.86;
  var scale = Math.min(maxW / w[0], maxH / w[1]);
  placeholder.style.width = Math.round(w[0] * scale) + 'px';
  placeholder.style.height = Math.round(w[1] * scale) + 'px';
  if (cell.imgUrl) {
    placeholder.style.backgroundImage = 'url(\'' + cell.imgUrl + '\')';
    placeholder.style.backgroundSize = 'cover';
    placeholder.style.backgroundPosition = 'center';
  }
  incoming.appendChild(placeholder);

  var allSlides = $hudSlideTrack.querySelectorAll('.hud-slide');
  allSlides.forEach(function (s, i) { if (i < allSlides.length - 1) s.remove(); });
  var outgoing = $hudSlideTrack.querySelector('.hud-slide');

  if (direction === 'none' || !outgoing) {
    $hudSlideTrack.innerHTML = '';
    $hudSlideTrack.appendChild(incoming);
    return;
  }

  var offset = direction === 'next' ? '100%' : '-100%';
  incoming.style.transform = 'translateX(' + offset + ')';
  $hudSlideTrack.appendChild(incoming);

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var outDir = direction === 'next' ? '-100%' : '100%';
      outgoing.style.transform = 'translateX(' + outDir + ')';
      incoming.style.transform = 'translateX(0)';
      setTimeout(function () {
        if (outgoing.parentNode) outgoing.remove();
      }, 290);
    });
  });
}

function navigateHUD(dir) {
  if (!visibleCells.length) return;
  var next = (hudIndex + dir + visibleCells.length) % visibleCells.length;
  var direction = dir > 0 ? 'next' : 'prev';
  hudIndex = next;
  renderHUDSlide(hudIndex, direction);
  if (infoPanelOpen) populateInfoPanel(hudIndex);
}

$hudClose.addEventListener('click', closeHUD);
$hudPrev.addEventListener('click', function () { navigateHUD(-1); });
$hudNext.addEventListener('click', function () { navigateHUD(1); });

document.getElementById('info-load-setup').addEventListener('click', function (e) {
  e.stopPropagation();
  var popup = document.getElementById('info-setup-popup');
  popup.classList.toggle('open');
});

document.getElementById('info-popup-yes').addEventListener('click', function () {
  var cell = visibleCells[hudIndex];
  if (cell && cell.moduleSnapshot && window.Workspace) {
    window.Workspace.applyModuleState(cell.moduleSnapshot);
  }
  document.getElementById('info-setup-popup').classList.remove('open');
  closeInfoPanel();
  closeHUD();
});

document.getElementById('info-popup-no').addEventListener('click', function () {
  document.getElementById('info-setup-popup').classList.remove('open');
});

// HUD 3-dot
$hudThreedot.addEventListener('click', function (e) {
  e.stopPropagation();
  var isOpen = $hudThreedotDrop.classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) {
    $hudThreedotDrop.classList.add('open');
    $hudThreedot.classList.add('active');
  }
});

// Info panel toggle
$hudInfo.addEventListener('click', function (e) {
  e.stopPropagation();
  if (infoPanelOpen) {
    closeInfoPanel();
  } else {
    openInfoPanel();
  }
});

function openInfoPanel() {
  infoPanelOpen = true;
  populateInfoPanel(hudIndex);
  $hudInfoPanel.classList.add('open');
}

function closeInfoPanel() {
  infoPanelOpen = false;
  $hudInfoPanel.classList.remove('open');
}

function populateInfoPanel(id) {
  var cell = visibleCells[id];
  $infoPanelDate.textContent = cell.date;
  $infoPanelType.textContent = cell.type;
  $infoPanelDims.textContent = cell.dims;
  $infoPanelPrompt.textContent = cell.prompt;

  var strip = document.getElementById('info-ref-strip');
  strip.innerHTML = '';
  if (cell.usedImages && cell.usedImages.length) {
    cell.usedImages.forEach(function (img) {
      var thumb = document.createElement('div');
      thumb.className = 'info-ref-thumb';
      thumb.style.backgroundImage = "url('" + img.imgUrl + "')";
      strip.appendChild(thumb);
    });
    strip.style.display = 'flex';
  } else {
    strip.style.display = 'none';
  }
  var loadBtn = document.getElementById('info-load-setup');
  loadBtn.style.display = cell.moduleSnapshot ? 'flex' : 'none';
  document.getElementById('info-setup-popup').classList.remove('open');
}

$hudInfoClose.addEventListener('click', closeInfoPanel);

// Copy prompt
$btnCopy.addEventListener('click', function () {
  var text = $infoPanelPrompt.textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function () {
      $btnCopy.style.opacity = '1';
      $btnCopy.style.color = '#c7c7c7';
      setTimeout(function () { $btnCopy.style.opacity = ''; $btnCopy.style.color = ''; }, 1400);
    });
  }
});

// Keyboard
document.addEventListener('keydown', function (e) {
  if (!hudOpen) return;
  if (e.key === 'ArrowRight') navigateHUD(1);
  if (e.key === 'ArrowLeft') navigateHUD(-1);
  if (e.key === 'Escape') {
    if (infoPanelOpen) closeInfoPanel();
    else closeHUD();
  }
});

// Close HUD on backdrop
$hud.addEventListener('click', function (e) {
  if (e.target === $hud) closeHUD();
});

/* ═══════════════════════════════════════════════════════════
   ACTIONS — shared helpers
═══════════════════════════════════════════════════════════ */
function downloadCell(cell) {
  if (!cell || !cell.imgUrl) return;
  var mime = cell.imgUrl.match(/^data:([^;]+);/);
  var ext = mime ? mime[1].split('/')[1] : 'jpg';
  var a = document.createElement('a');
  a.href = cell.imgUrl;
  a.download = 'cafe-' + cell.id + '.' + ext;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function deleteCell(id) {
  var idx = CELLS.findIndex(function (c) { return c.id === id; });
  if (idx === -1) return;
  var cell = CELLS.splice(idx, 1)[0];
  if (cell) {
    var dbId = cell._dbId !== undefined ? cell._dbId : cell.id;
    if (cell._imgUuid && window.DB) {
      window.DB.images.delete(cell._imgUuid);
    }
    if (window.DB && window.DB.gallery) window.DB.gallery.delete(dbId);
  }
  removeCellFromView(id);
  window.Workspace.autosave();
}

function duplicateCell(id) {
  var cell = CELLS.find(function (c) { return c.id === id; });
  if (!cell) return;
  var copy = Object.assign({}, cell, { id: Date.now() + Math.random(), uuid: crypto.randomUUID(), _imgUuid: null, _dbId: null });
  CELLS.unshift(copy);
  insertCellIntoView(copy);
  window.Workspace.autosave();
}

/* ── Gallery 3-dot actions (multi-select) ── */
document.getElementById('ddrop-add-seq').addEventListener('click', function () {
  selectedIds.forEach(function (id) {
    var cell = CELLS.find(function (c) { return c.id === id; });
    if (cell && window.addSeqSlot) window.addSeqSlot(cell);
  });
  selectedIds.clear();
  setSelectMode(false);
  closeDropdown($tdropdown);
});

document.getElementById('ddrop-download').addEventListener('click', function () {
  selectedIds.forEach(function (id) {
    var cell = CELLS.find(function (c) { return c.id === id; });
    downloadCell(cell);
  });
  closeDropdown($tdropdown);
});

document.getElementById('ddrop-duplicate').addEventListener('click', function () {
  var ids = Array.from(selectedIds);
  ids.forEach(function (id) { duplicateCell(id); });
  selectedIds.clear();
  setSelectMode(false);
  closeDropdown($tdropdown);
});

document.getElementById('ddrop-delete').addEventListener('click', function () {
  var toDelete = [];
  CELLS = CELLS.filter(function (cell) {
    if (selectedIds.has(cell.id)) {
      toDelete.push(cell);
      return false;
    }
    return true;
  });
  toDelete.forEach(function (cell) {
    var dbId = cell._dbId !== undefined ? cell._dbId : cell.id;
    if (cell._imgUuid && window.DB) {
      window.DB.images.delete(cell._imgUuid);
    }
    if (window.DB && window.DB.gallery) window.DB.gallery.delete(dbId);
    removeCellFromView(cell.id);
  });
  selectedIds.clear();
  setSelectMode(false);
  closeDropdown($tdropdown);
  window.Workspace.autosave();
});

/* ── HUD 3-dot actions ── */
document.getElementById('hud-drop-reuse').addEventListener('click', function () {
  var cell = visibleCells[hudIndex];
  if (!cell || !cell.prompt) return;
  var promptEl = document.getElementById('promptText');
  if (promptEl) {
    promptEl.textContent = cell.prompt;
    promptEl.classList.remove('has-placeholder');
  }
  closeDropdown($hudThreedotDrop);
  closeHUD();
});

document.getElementById('hud-drop-ref').addEventListener('click', function () {
  var cell = visibleCells[hudIndex];
  if (!cell || !cell.imgUrl) return;
  var mode = document.getElementById('promptBar').dataset.state;
  if (window.refState[mode].length < 5) {
    var refUuid = crypto.randomUUID();
    var pid = window.activeProjectId;
    if (window.DB) window.DB.images.put(refUuid, cell.imgUrl, pid);
    window.refState[mode].push({ url: cell.imgUrl, desc: null, uuid: refUuid });
    renderChips();
  }
  closeDropdown($hudThreedotDrop);
  closeHUD();
});

document.getElementById('hud-drop-duplicate').addEventListener('click', function () {
  var cell = visibleCells[hudIndex];
  if (!cell) return;
  duplicateCell(cell.id);
  closeDropdown($hudThreedotDrop);
});

// HUD bottom strip — Download
document.getElementById('hud-btn-download').addEventListener('click', function () {
  downloadCell(visibleCells[hudIndex]);
});

// HUD bottom strip — Delete
document.getElementById('hud-btn-delete').addEventListener('click', function () {
  var cell = visibleCells[hudIndex];
  if (!cell) return;
  var id = cell.id;
  closeHUD();
  deleteCell(id);
});

// HUD bottom strip — Upscale (placeholder)
document.getElementById('hud-btn-upscale').addEventListener('click', function () {
  var btn = document.getElementById('hud-btn-upscale');
  var orig = btn.textContent;
  btn.textContent = 'COMING SOON';
  setTimeout(function () { btn.textContent = orig; }, 1800);
});

// HUD — Refine
function persistGalleryCellImage(cell) {
  if (!window.DB || !window.activeProjectId || !cell || !cell.imgUrl) return;

  var imageUuid = cell._imgUuid || crypto.randomUUID();
  cell._imgUuid = imageUuid;

  window.DB.images.put(imageUuid, cell.imgUrl, window.activeProjectId)
    .then(function () {
      var dbId = cell._dbId !== undefined ? cell._dbId : cell.id;
      if (dbId !== undefined && window.DB.gallery) {
        return window.DB.gallery.update(dbId, { imgUrl: imageUuid });
      }
    })
    .catch(function (e) { console.error('[Gallery] Failed to save refined image:', e); });
}

document.getElementById('hud-edit').addEventListener('click', function () {
  var cell = window.getHudCell ? window.getHudCell() : visibleCells[hudIndex];
  if (!cell || !cell.imgUrl) return;
  closeHUD();
  window.Studio.open({
    imgUrl: cell.imgUrl,
    uuid:   cell.uuid || null,
    ratio:  cell.ratio,
    caller: 'gallery',
    onDone: function (refinedUrl) {
      if (!refinedUrl) return;
      cell.imgUrl = refinedUrl;
      persistGalleryCellImage(cell);
      buildGrid();
      openHUD(cell.id);
      window.Workspace.autosave();
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
buildGrid();
$scroll.dataset.view = 'medium';
window.getHudCell = function () { return visibleCells[hudIndex]; };
window.closeHUD = closeHUD;

window.Gallery = {
  addGenerated: function (cell) {
    CELLS.unshift(cell);
    insertCellIntoView(cell);
  },
  getGeneratedCells: function () {
    return CELLS.filter(function (c) { return c.generated === true; });
  },
  clearGenerated: function () {
    for (var i = CELLS.length - 1; i >= 0; i--) {
      if (CELLS[i].generated) CELLS.splice(i, 1);
    }
    buildGrid();
  },
  addLoading: function (loadingId, ratio, mode) {
    var accentColor = mode === 'SCENE' ? '#5271ff' : '#ea5823';
    var el = document.createElement('div');
    el.className = 'gallery-cell';
    el.dataset.ratio = ratio;
    el.dataset.loadingId = loadingId;

    var inner = document.createElement('div');
    inner.className = 'cell-inner cafe-loading';
    inner.style.backgroundColor = accentColor;
    el.appendChild(inner);

    var check = document.createElement('div');
    check.className = 'cell-check';
    el.appendChild(check);

    $grid.insertBefore(el, $grid.firstChild);
  },
  resolveLoading: function (loadingId, cell) {
    var loadingEl = $grid.querySelector('[data-loading-id="' + loadingId + '"]');
    CELLS.unshift(cell);
    insertCellIntoView(cell, loadingEl);
  },
  removeLoading: function (loadingId) {
    var loadingEl = $grid.querySelector('[data-loading-id="' + loadingId + '"]');
    if (loadingEl) loadingEl.remove();
  }
};

})();
