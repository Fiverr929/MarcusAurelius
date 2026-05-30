// module-panel.js
(function () {
  var C = {
    orange: '#ea5823',
    blue: '#5271ff',
    grayMid: '#999997',
    grayLight: '#c7c7c7',
    offWhite: '#e8e6e6'
  };
  var ACCENTS = ['#ea5823', '#5271ff', '#5a8a3a', '#7a4a8a', '#c79a2a', '#3a8a7a'];
  var MODES = ['SUBJECT', 'STYLE', 'COMP', 'ALL'];
  var DEFAULT_FOLDERS = [
    { id: 'SUBJECT', name: 'SUBJECT', accent: C.orange, locked: true },
    { id: 'STAGE', name: 'STAGE', accent: C.orange, locked: true },
    { id: 'STYLE', name: 'STYLE', accent: C.orange, locked: true }
  ];
  var uid = 10;

  window.ModuleState = window.ModuleState || { subject: null, stage: null, style: null, cafeModule: null };

  var state = {
    files: [],
    folders: DEFAULT_FOLDERS.slice(),
    view: 'root',
    activeFileId: null,
    openFolders: new Set(['SUBJECT', 'STAGE', 'STYLE']),
    editingFolder: null,
    addingFolder: false,
    sortBy: 'MOD',
    selectMode: false,
    selectedIds: new Set(),
    searchQuery: '',
    showUpload: false,
    menuFileId: null,
    moveFileId: null,
    inspectorMenuOpen: false,
    renamingFileId: null,
    dragOver: null,
    showInfo: false
  };

  var panel = document.querySelector('.module-panel');
  var fileInput = document.getElementById('mp-file-input');
  var pendingUploadLabel = '';

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nowTime() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function makeFile(label, url, file) {
    var id = uid++;
    return {
      id: id,
      folder: null,
      kind: 'IMG',
      label: (label || 'UNLABELED').trim().toUpperCase() || 'UNLABELED',
      name: file ? file.name : 'upload_' + id + '.jpg',
      size: file ? formatSize(file.size) : '0 KB',
      dims: 'IMAGE',
      modified: nowTime(),
      linked: false,
      eye: true,
      strength: 50,
      mode: 'SUBJECT',
      url: url || '',
      uuid: crypto.randomUUID(),
      visionDesc: ''
    };
  }

  function formatSize(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function sortFiles(list) {
    var out = list.slice();
    out.sort(function (a, b) {
      if (state.sortBy === 'NAME') return (a.label || '').localeCompare(b.label || '');
      if (state.sortBy === 'SIZE') return parseFloat(b.size) - parseFloat(a.size);
      if (state.sortBy === 'STR') return (b.strength || 0) - (a.strength || 0);
      return String(b.modified || '').localeCompare(String(a.modified || ''));
    });
    return out;
  }

  function activeFile() {
    return state.files.find(function (f) { return f.id === state.activeFileId; }) || null;
  }

  function folderFor(file) {
    return state.folders.find(function (f) { return f.id === file.folder; }) || null;
  }

  function updateFile(id, patch, shouldRender) {
    state.files = state.files.map(function (f) {
      return f.id === id ? Object.assign({}, f, patch) : f;
    });
    sync(shouldRender);
  }

  function duplicateFile(file) {
    var idx = state.files.findIndex(function (f) { return f.id === file.id; });
    var copy = Object.assign({}, file, {
      id: uid++,
      label: (file.label || 'UNLABELED') + ' COPY',
      uuid: crypto.randomUUID(),
      modified: nowTime()
    });
    state.files.splice(idx + 1, 0, copy);
    sync();
  }

  function removeFile(id) {
    var file = state.files.find(function (f) { return f.id === id; });
    if (file && file.uuid && window.DB) DB.images.delete(file.uuid);
    state.files = state.files.filter(function (f) { return f.id !== id; });
    state.selectedIds.delete(id);
    if (state.activeFileId === id) {
      state.view = 'root';
      state.activeFileId = null;
    }
    sync();
  }

  function assignFile(id, folderId) {
    updateFile(id, { folder: folderId, linked: true });
    state.openFolders.add(folderId);
  }

  function makeLegacyHTML(section) {
    var files = state.files.filter(function (f) {
      if (!f.eye || !f.linked || !f.url) return false;
      if (section === 'subject') return f.folder === 'SUBJECT' || (f.folder && f.mode === 'SUBJECT');
      if (section === 'stage') return f.folder === 'STAGE' || (f.folder && (f.mode === 'COMP' || f.mode === 'ALL'));
      if (section === 'style') return f.folder === 'STYLE' || (f.folder && (f.mode === 'STYLE' || f.mode === 'ALL'));
      return false;
    });
    return files.map(function (f) {
      var cls = f.eye ? 'on' : 'off';
      return '<div class="layer-group">' +
        '<div class="plr"><div class="plr-name blue">' + esc(f.label || 'UNLABELED') + '</div><div class="plr-eye ' + cls + '"></div></div>' +
        '<div class="layer-children"><div class="clr" data-uuid="' + esc(f.uuid || '') + '" data-vision-desc="' + esc(f.visionDesc || '') + '">' +
        '<div class="clr-main img-a"><img src="' + esc(f.url) + '" alt=""></div><div class="plr-eye ' + cls + '"></div>' +
        '</div></div></div>';
    }).join('');
  }

  function sync(shouldRender) {
    window.ModuleState.cafeModule = {
      files: state.files,
      folders: state.folders,
      openFolders: Array.from(state.openFolders)
    };
    window.ModuleState.subject = { selected: 0, slots: [{ on: true, html: makeLegacyHTML('subject') }] };
    window.ModuleState.stage = { html: makeLegacyHTML('stage') };
    window.ModuleState.style = { html: makeLegacyHTML('style') };
    renderLegacyMirror();
    if (window.Workspace) window.Workspace.autosaveDebounced();
    if (shouldRender !== false) render();
  }

  function renderLegacyMirror() {
    var mirror = document.getElementById('module-legacy-mirror');
    if (!mirror) {
      mirror = document.createElement('div');
      mirror.id = 'module-legacy-mirror';
      mirror.style.display = 'none';
      document.body.appendChild(mirror);
    }
    mirror.innerHTML =
      '<div class="mod-layers" data-section="subject">' + makeLegacyHTML('subject') + '</div>' +
      '<div class="mod-layers" data-section="stage">' + makeLegacyHTML('stage') + '</div>' +
      '<div class="mod-layers" data-section="style">' + makeLegacyHTML('style') + '</div>';
  }

  function thumb(file, big) {
    if (file.url) return '<img class="cmp-thumb-img" src="' + esc(file.url) + '" alt="">';
    return '<svg viewBox="0 0 100 100" class="cmp-thumb-svg"><rect width="100" height="100" fill="#3a4a55"/><circle cx="50" cy="34" r="14" fill="rgba(0,0,0,.45)"/><path d="M24 100Q24 64 50 60Q76 64 76 100Z" fill="rgba(0,0,0,.45)"/></svg>';
  }

  function imageRow(file, showFolderTag) {
    var selected = state.selectedIds.has(file.id);
    var renaming = state.renamingFileId === file.id;
    var folder = folderFor(file);
    return '<div class="cmp-image-row' + (file.folder === null ? ' loose' : '') + (selected ? ' selected' : '') + (!file.eye ? ' hidden' : '') + '" draggable="' + (file.folder === null) + '" data-file-row="' + file.id + '">' +
      (state.selectMode ? '<span class="cmp-check">' + (selected ? '&#10003;' : '') + '</span>' : '') +
      '<div class="cmp-thumb">' + thumb(file) + (file.linked ? '<span class="cmp-linked-dot"></span>' : '') + '</div>' +
      '<div class="cmp-row-main">' +
        (renaming
          ? '<input class="cmp-inline-rename" data-rename-input="' + file.id + '" value="' + esc(file.label || 'UNLABELED') + '">'
          : '<div class="cmp-row-label">' + esc(file.label || 'UNLABELED') + (showFolderTag && folder ? ' <span>[' + esc(folder.name) + ']</span>' : '') + '</div>') +
        '<div class="cmp-row-meta">' + (file.folder === null ? '<span class="cmp-loose-tag">LOOSE</span>' : '') + '<span>' + esc(file.dims) + '</span>' + (!file.eye ? '<span>HIDDEN</span>' : '') +
        '<span class="cmp-mini-strength"><i style="width:' + file.strength + '%"></i></span><span>' + file.strength + '%</span></div>' +
      '</div>' +
      '<button class="cmp-dot' + (state.menuFileId === file.id || state.moveFileId === file.id ? ' open' : '') + '" data-dot="' + file.id + '">&#8943;</button>' +
      rowMenu(file) +
    '</div>';
  }

  function rowMenu(file) {
    if (state.menuFileId !== file.id && state.moveFileId !== file.id) return '';
    if (state.moveFileId === file.id) {
      return '<div class="cmp-menu cmp-move-menu"><div class="cmp-menu-title">MOVE TO MODULE</div>' +
        state.folders.map(function (folder) {
          return '<button class="' + (file.folder === folder.id ? 'current' : '') + '" data-move-target="' + esc(folder.id) + '"><i style="background:' + esc(folder.accent) + '"></i><span>' + esc(folder.name) + '</span>' + (file.folder === folder.id ? '<b>NOW</b>' : '') + '</button>';
        }).join('') +
        '<button data-menu-close>CANCEL</button></div>';
    }
    return '<div class="cmp-menu"><div class="cmp-menu-title">' + esc(file.label || 'UNLABELED') + '</div>' +
      '<button class="primary" data-row-action="studio">STUDIO</button>' +
      '<button data-row-action="rename">RENAME</button>' +
      '<button data-row-action="move">MOVE TO...</button>' +
      '<button data-row-action="duplicate">DUPLICATE</button>' +
      '<button class="danger" data-row-action="remove">REMOVE</button>' +
    '</div>';
  }

  function inspectorMenu(file) {
    if (!state.inspectorMenuOpen) return '';
    return '<div class="cmp-menu cmp-inspector-menu"><div class="cmp-menu-title">' + esc(file.label || 'UNLABELED') + '</div>' +
      '<button class="primary" data-inspector-action="studio">STUDIO</button>' +
      '<button data-inspector-replace>REPLACE</button>' +
      '<button data-inspector-action="rename">RENAME</button>' +
      '<button class="danger" data-inspector-action="remove">REMOVE</button>' +
    '</div>';
  }

  function folderCard(folder) {
    var open = state.openFolders.has(folder.id);
    var list = sortFiles(state.files.filter(function (f) { return f.folder === folder.id; }));
    if (state.editingFolder === folder.id) return folderForm(folder);
    return '<div class="cmp-folder' + (state.dragOver === folder.id ? ' drag-over' : '') + '" data-folder="' + esc(folder.id) + '">' +
      '<div class="cmp-folder-head' + (open ? ' open' : '') + '" style="' + (open ? 'background:' + esc(folder.accent) : '') + '">' +
        '<button class="cmp-folder-toggle" data-folder-toggle="' + esc(folder.id) + '"><span class="cmp-chevron"></span><span class="cmp-folder-icon"></span>' +
        '<span class="cmp-folder-name">' + (state.dragOver === folder.id ? 'DROP INTO ' + esc(folder.name) : esc(folder.name)) + '</span>' +
        (folder.locked && state.dragOver !== folder.id ? '<span class="cmp-sys">SYS</span>' : '') + '<span class="cmp-count">' + list.length + '</span></button>' +
        '<button class="cmp-folder-dot" data-folder-edit="' + esc(folder.id) + '">&#8943;</button>' +
      '</div>' +
      (open ? '<div class="cmp-folder-body">' + list.map(function (f) { return imageRow(f, false); }).join('') + '</div>' : '') +
    '</div>';
  }

  function folderForm(folder) {
    var isNew = !folder;
    var id = folder ? folder.id : '';
    return '<div class="cmp-folder-form" data-folder-form="' + esc(id) + '">' +
      '<div class="cmp-folder-form-head"><span>' + (isNew ? 'NEW MODULE' : 'MODULE SETTINGS') + '</span>' +
        (!isNew && folder.locked ? '<b>SYS</b>' : '') + '</div>' +
      '<div class="cmp-field-block"><label>FOLDER NAME</label>' +
        '<input data-folder-name value="' + esc(folder ? folder.name : '') + '" placeholder="LIGHTING / CAMERA / MOOD..."></div>' +
      '<div class="cmp-field-block"><label>ACCENT</label><div class="cmp-swatches">' + ACCENTS.map(function (a, i) {
        return '<button data-accent="' + esc(a) + '" class="' + ((!folder && i === 0) || (folder && folder.accent === a) ? 'active' : '') + '" style="background:' + esc(a) + '"></button>';
      }).join('') + '</div></div>' +
      '<div class="cmp-form-actions' + (!isNew && !folder.locked ? ' has-danger' : '') + '"><button class="primary" data-folder-save>' + (isNew ? 'CREATE' : 'SAVE') + '</button><button data-folder-cancel>CANCEL</button>' +
      (!isNew && !folder.locked ? '<button class="danger" data-folder-delete>DELETE</button>' : '') + '</div></div>';
  }

  function uploadForm() {
    return '<div class="cmp-upload-form"><label>NAME THIS REFERENCE</label><input id="cmp-upload-label" placeholder="BACKGROUND - MOOD - CHARACTER...">' +
      '<div><button data-upload-confirm>UPLOAD</button><button data-upload-cancel>CANCEL</button></div></div>';
  }

  function toolbar() {
    return '<div class="cmp-sort"><span>SORT</span>' + ['MOD', 'NAME', 'SIZE', 'STR'].map(function (k) {
      return '<button class="' + (state.sortBy === k ? 'active' : '') + '" data-sort="' + k + '">' + k + '</button>';
    }).join('') + '<i></i><button class="' + (state.selectMode ? 'active' : '') + '" data-select-toggle>' + (state.selectMode ? 'DONE' : 'SELECT') + '</button></div>' +
    (state.selectMode && state.selectedIds.size ? '<div class="cmp-bulk"><span>' + state.selectedIds.size + ' SELECTED</span><div><button data-bulk="link">LINK</button><button data-bulk="unlink">UNLINK</button><button data-bulk="hide">HIDE</button><button data-bulk="delete">DELETE</button></div></div>' : '');
  }

  function renderRoot() {
    var q = state.searchQuery.trim().toLowerCase();
    var rootFiles = sortFiles(state.files.filter(function (f) { return f.folder === null; }));
    var assigned = state.files.filter(function (f) { return f.folder !== null; });
    var results = assigned.filter(function (f) {
      var folder = folderFor(f);
      return (f.label || '').toLowerCase().indexOf(q) >= 0 || (folder && folder.name.toLowerCase().indexOf(q) >= 0);
    });
    return '<div class="cmp-panel">' +
      '<div class="cmp-header"><span>MODULE</span><b></b><button data-upload-toggle>+</button></div>' +
      '<div class="cmp-search"><span>&#8981;</span><input value="' + esc(state.searchQuery) + '" placeholder="SEARCH" data-search>' + (state.searchQuery ? '<button data-search-clear>&times;</button>' : '') + '</div>' +
      (state.showUpload ? uploadForm() : '') + toolbar() +
      '<div class="cmp-scroll">' +
      (q ? '<div class="cmp-results-head"><span>RESULTS</span><b>' + results.length + ' OF ' + assigned.length + '</b></div>' + results.map(function (f) { return imageRow(f, true); }).join('')
        : rootFiles.map(function (f) { return imageRow(f, false); }).join('') + state.folders.map(folderCard).join('') + (state.addingFolder ? folderForm(null) : '<button class="cmp-new-module" data-new-folder>+ NEW MODULE</button>')) +
      '</div><div class="cmp-status"><span>' + state.folders.length + ' MOD · ' + assigned.length + ' FILES</span><span>' + rootFiles.length + ' LOOSE</span></div></div>';
  }

  function renderInspector() {
    var f = activeFile();
    if (!f) return renderRoot();
    var folder = folderFor(f);
    return '<div class="cmp-panel">' +
      '<div class="cmp-detail-nav"><button data-back>&lsaquo;</button><span>' + esc(folder ? folder.name : 'ROOT') + ' &rsaquo; <b>' + esc(f.label || 'UNLABELED') + '</b></span><div class="cmp-inspector-menu-wrap"><button class="cmp-dot' + (state.inspectorMenuOpen ? ' open' : '') + '" data-inspector-menu>&#8943;</button>' + inspectorMenu(f) + '</div></div>' +
      '<div class="cmp-detail-body">' +
        '<div class="cmp-big-thumb">' + thumb(f, true) + '<span>' + esc(f.dims) + '</span><b class="mode-' + esc(f.mode) + '">' + esc(f.mode) + '</b></div>' +
        '<input class="cmp-label-input" data-detail-label value="' + esc(f.label || 'UNLABELED') + '" placeholder="UNLABELED">' +
        section('REFERENCE MODE', '<div class="cmp-segments">' + MODES.map(function (m) { return '<button class="' + (f.mode === m ? 'active' : '') + '" data-mode="' + m + '">' + m + '</button>'; }).join('') + '</div><p>' + modeHelp(f.mode) + '</p>') +
        section('STRENGTH', '<div class="cmp-strength-head"><span></span><b>' + f.strength + '%</b></div><div class="cmp-strength" data-strength><i style="width:' + f.strength + '%"></i><span style="left:25%"></span><span style="left:50%"></span><span style="left:75%"></span></div><div class="cmp-scale"><span>SUBTLE</span><span>STANDARD</span><span>FORCEFUL</span></div>') +
        section('STATE', '<button class="cmp-toggle ' + (f.linked ? 'on' : '') + '" data-toggle="linked"><span>LINKED</span><b>' + (f.linked ? 'ON' : 'OFF') + '</b></button><button class="cmp-toggle ' + (f.eye ? 'on' : '') + '" data-toggle="eye"><span>VISIBLE</span><b>' + (f.eye ? 'ON' : 'OFF') + '</b></button>') +
      '</div>' +
      '<div class="cmp-info ' + (state.showInfo ? 'open' : '') + '"><span>FILE</span><b>' + esc(f.name) + '</b><span>SIZE</span><b>' + esc(f.size) + '</b><span>DIM</span><b>' + esc(f.dims) + '</b></div>' +
      '<div class="cmp-status"><button data-info-toggle>INFO ' + (state.showInfo ? '&#9652;' : '&#9662;') + '</button><span>' + f.strength + '% · ' + esc(f.mode) + '</span></div></div>';
  }

  function section(title, body) {
    return '<div class="cmp-detail-section"><h4>' + title + '</h4>' + body + '</div>';
  }

  function modeHelp(mode) {
    return { SUBJECT: 'use as subject in scene', STYLE: 'use only the look, not content', COMP: 'use composition / layout only', ALL: 'apply everything' }[mode] || '';
  }

  function render() {
    if (!panel) return;
    var active = document.activeElement;
    var refocus = null;
    var selectionStart = null;
    if (active && active.matches && active.matches('[data-search]')) {
      refocus = '[data-search]';
      selectionStart = active.selectionStart;
    } else if (active && active.matches && active.matches('[data-detail-label]')) {
      refocus = '[data-detail-label]';
      selectionStart = active.selectionStart;
    }
    panel.innerHTML = state.view === 'file' ? renderInspector() : renderRoot();
    if (refocus) {
      var next = panel.querySelector(refocus);
      if (next) {
        next.focus();
        try { next.setSelectionRange(selectionStart, selectionStart); } catch (ignore) {}
      }
    }
    var upload = document.getElementById('cmp-upload-label');
    if (upload && state.showUpload) upload.focus();
    var rename = panel.querySelector('[data-rename-input]');
    if (rename) { rename.focus(); rename.select(); }
  }

  function readImageDims(fileObj) {
    if (!fileObj.url) return;
    var img = new Image();
    img.onload = function () {
      updateFile(fileObj.id, { dims: img.naturalWidth + 'x' + img.naturalHeight });
    };
    img.src = fileObj.url;
  }

  function openUpload() {
    state.view = 'root';
    state.activeFileId = null;
    state.showUpload = true;
    state.menuFileId = null;
    state.moveFileId = null;
    state.inspectorMenuOpen = false;
    render();
  }

  function handleStrength(e) {
    var bar = e.target.closest('[data-strength]');
    var f = activeFile();
    if (!bar || !f) return;
    function set(ev) {
      var r = bar.getBoundingClientRect();
      updateFile(f.id, { strength: Math.max(0, Math.min(100, Math.round(((ev.clientX - r.left) / r.width) * 100))) });
    }
    set(e);
    function move(ev) { set(ev); }
    function up() { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  panel.addEventListener('click', function (e) {
    var row = e.target.closest('[data-file-row]');
    var id = row ? +row.dataset.fileRow : null;

    if (e.target.closest('[data-upload-toggle]')) { state.showUpload = !state.showUpload; render(); return; }
    if (e.target.closest('[data-upload-cancel]')) { state.showUpload = false; render(); return; }
    if (e.target.closest('[data-upload-confirm]')) {
      pendingUploadLabel = (document.getElementById('cmp-upload-label').value || 'UNLABELED').trim();
      fileInput.value = '';
      fileInput.click();
      return;
    }
    if (e.target.closest('[data-search-clear]')) { state.searchQuery = ''; render(); return; }
    if (e.target.closest('[data-select-toggle]')) { state.selectMode = !state.selectMode; state.selectedIds.clear(); render(); return; }
    var sort = e.target.closest('[data-sort]');
    if (sort) { state.sortBy = sort.dataset.sort; render(); return; }
    var dot = e.target.closest('[data-dot]');
    if (dot) {
      var dotId = +dot.dataset.dot;
      var isOpen = state.menuFileId === dotId || state.moveFileId === dotId;
      state.menuFileId = isOpen ? null : dotId;
      state.moveFileId = null;
      render();
      return;
    }
    var action = e.target.closest('[data-row-action]');
    if (action) {
      var actionRow = action.closest('[data-file-row]');
      var actionId = actionRow ? +actionRow.dataset.fileRow : id;
      var f = state.files.find(function (x) { return x.id === actionId; });
      if (!f) return;
      if (action.dataset.rowAction === 'rename') state.renamingFileId = actionId;
      if (action.dataset.rowAction === 'move') { state.moveFileId = actionId; state.menuFileId = null; }
      if (action.dataset.rowAction === 'studio') openStudio(actionId);
      if (action.dataset.rowAction === 'duplicate') duplicateFile(f);
      if (action.dataset.rowAction === 'remove') removeFile(actionId);
      if (action.dataset.rowAction !== 'move') {
        state.menuFileId = null;
        state.moveFileId = null;
      }
      render();
      return;
    }
    var move = e.target.closest('[data-move-target]');
    if (move) {
      var moveRow = move.closest('[data-file-row]');
      if (moveRow) assignFile(+moveRow.dataset.fileRow, move.dataset.moveTarget);
      state.menuFileId = null;
      state.moveFileId = null;
      render();
      return;
    }
    if (e.target.closest('[data-menu-close]')) { state.menuFileId = null; state.moveFileId = null; render(); return; }
    var ft = e.target.closest('[data-folder-toggle]');
    if (ft) { state.openFolders.has(ft.dataset.folderToggle) ? state.openFolders.delete(ft.dataset.folderToggle) : state.openFolders.add(ft.dataset.folderToggle); sync(); return; }
    var fe = e.target.closest('[data-folder-edit]');
    if (fe) { state.editingFolder = fe.dataset.folderEdit; render(); return; }
    if (e.target.closest('[data-new-folder]')) { state.addingFolder = true; render(); return; }
    if (e.target.closest('[data-folder-cancel]')) { state.addingFolder = false; state.editingFolder = null; render(); return; }
    if (e.target.closest('[data-folder-save]')) { saveFolder(e.target.closest('[data-folder-form]')); return; }
    if (e.target.closest('[data-folder-delete]')) { deleteFolder(e.target.closest('[data-folder-form]').dataset.folderForm); return; }
    var bulk = e.target.closest('[data-bulk]');
    if (bulk) { runBulk(bulk.dataset.bulk); return; }
    if (e.target.closest('[data-back]')) { state.view = 'root'; state.activeFileId = null; state.inspectorMenuOpen = false; render(); return; }
    if (e.target.closest('[data-inspector-menu]')) { state.inspectorMenuOpen = !state.inspectorMenuOpen; render(); return; }
    var inspectorReplace = e.target.closest('[data-inspector-replace]');
    if (inspectorReplace) { state.inspectorMenuOpen = false; pendingUploadLabel = activeFile().label; fileInput.value = ''; fileInput.click(); render(); return; }
    var inspectorAction = e.target.closest('[data-inspector-action]');
    if (inspectorAction) { state.inspectorMenuOpen = false; runDetailAction(inspectorAction.dataset.inspectorAction); render(); return; }
    var mode = e.target.closest('[data-mode]');
    if (mode) { updateFile(state.activeFileId, { mode: mode.dataset.mode }); return; }
    var tog = e.target.closest('[data-toggle]');
    if (tog) { var af = activeFile(); updateFile(af.id, tog.dataset.toggle === 'linked' ? { linked: !af.linked } : { eye: !af.eye }); return; }
    if (e.target.closest('[data-info-toggle]')) { state.showInfo = !state.showInfo; render(); return; }
    if (e.target.closest('[data-replace]')) { pendingUploadLabel = activeFile().label; fileInput.value = ''; fileInput.click(); return; }
    var detailAction = e.target.closest('[data-action]');
    if (detailAction) { runDetailAction(detailAction.dataset.action); return; }
    if (row && !e.target.closest('.cmp-menu') && !e.target.closest('input')) {
      if (state.selectMode) state.selectedIds.has(id) ? state.selectedIds.delete(id) : state.selectedIds.add(id);
      else { state.view = 'file'; state.activeFileId = id; state.showInfo = false; }
      render();
      return;
    }
    if ((state.menuFileId || state.moveFileId) && !e.target.closest('.cmp-menu') && !e.target.closest('[data-dot]')) {
      state.menuFileId = null;
      state.moveFileId = null;
      render();
    }
    if (state.inspectorMenuOpen && !e.target.closest('.cmp-inspector-menu-wrap')) {
      state.inspectorMenuOpen = false;
      render();
    }
  });

  panel.addEventListener('input', function (e) {
    if (e.target.matches('[data-search]')) { state.searchQuery = e.target.value; render(); }
    if (e.target.matches('[data-detail-label]')) updateFile(state.activeFileId, { label: e.target.value.toUpperCase() || 'UNLABELED' }, false);
  });

  panel.addEventListener('keydown', function (e) {
    if (e.target.matches('[data-rename-input]')) {
      var id = +e.target.dataset.renameInput;
      if (e.key === 'Enter') { updateFile(id, { label: (e.target.value || 'UNLABELED').toUpperCase() }); state.renamingFileId = null; }
      if (e.key === 'Escape') { state.renamingFileId = null; render(); }
    }
    if (e.target.id === 'cmp-upload-label' && e.key === 'Enter') {
      pendingUploadLabel = e.target.value;
      fileInput.value = '';
      fileInput.click();
    }
  });

  panel.addEventListener('blur', function (e) {
    if (e.target.matches('[data-rename-input]')) {
      updateFile(+e.target.dataset.renameInput, { label: (e.target.value || 'UNLABELED').toUpperCase() });
      state.renamingFileId = null;
    }
  }, true);

  panel.addEventListener('mousedown', handleStrength);
  panel.addEventListener('dragstart', function (e) {
    var row = e.target.closest('[data-file-row]');
    if (row) e.dataTransfer.setData('text/plain', row.dataset.fileRow);
  });
  panel.addEventListener('dragover', function (e) {
    var folder = e.target.closest('[data-folder]');
    if (!folder) return;
    e.preventDefault();
    if (state.dragOver === folder.dataset.folder) return;
    state.dragOver = folder.dataset.folder;
    render();
  });
  panel.addEventListener('dragleave', function (e) {
    if (e.target.closest('[data-folder]')) { state.dragOver = null; render(); }
  });
  panel.addEventListener('drop', function (e) {
    var folder = e.target.closest('[data-folder]');
    if (!folder) return;
    e.preventDefault();
    assignFile(+e.dataTransfer.getData('text/plain'), folder.dataset.folder);
    state.dragOver = null;
    render();
  });

  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest('.module-panel') && (state.menuFileId || state.moveFileId)) {
      state.menuFileId = null;
      state.moveFileId = null;
      render();
    }
  });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (evt) {
      var current = activeFile();
      if (state.view === 'file' && current) {
        if (current.uuid && window.DB) DB.images.delete(current.uuid);
        var replacementUuid = crypto.randomUUID();
        if (window.DB) DB.images.put(replacementUuid, evt.target.result, window.activeProjectId);
        updateFile(current.id, { url: evt.target.result, name: file.name, size: formatSize(file.size), uuid: replacementUuid, visionDesc: '' });
        readImageDims(activeFile());
      } else {
        var created = makeFile(pendingUploadLabel, evt.target.result, file);
        if (window.DB) DB.images.put(created.uuid, created.url, window.activeProjectId);
        state.files.unshift(created);
        state.showUpload = false;
        sync();
        readImageDims(created);
      }
      pendingUploadLabel = '';
    };
    reader.readAsDataURL(file);
  });

  function saveFolder(form) {
    var name = (form.querySelector('[data-folder-name]').value || '').trim().toUpperCase();
    var active = form.querySelector('.cmp-swatches .active');
    var accent = active ? active.dataset.accent : C.orange;
    if (!name) return;
    var id = form.dataset.folderForm;
    if (id) {
      state.folders = state.folders.map(function (f) { return f.id === id ? Object.assign({}, f, { name: name, accent: accent }) : f; });
      state.editingFolder = null;
    } else {
      var newId = name.replace(/\s+/g, '_') + '_' + Date.now().toString().slice(-4);
      state.folders.push({ id: newId, name: name, accent: accent, locked: false });
      state.openFolders.add(newId);
      state.addingFolder = false;
    }
    sync();
  }

  function deleteFolder(id) {
    state.folders = state.folders.filter(function (f) { return f.id !== id || f.locked; });
    state.files = state.files.filter(function (f) { return f.folder !== id; });
    state.editingFolder = null;
    sync();
  }

  function runBulk(action) {
    var ids = state.selectedIds;
    if (action === 'delete') state.files = state.files.filter(function (f) { return !ids.has(f.id); });
    else state.files = state.files.map(function (f) {
      if (!ids.has(f.id)) return f;
      if (action === 'link') return Object.assign({}, f, { linked: true });
      if (action === 'unlink') return Object.assign({}, f, { linked: false });
      if (action === 'hide') return Object.assign({}, f, { eye: false });
      return f;
    });
    state.selectedIds.clear();
    state.selectMode = false;
    sync();
  }

  function runDetailAction(action) {
    var f = activeFile();
    if (!f) return;
    if (action === 'duplicate') duplicateFile(f);
    if (action === 'remove') removeFile(f.id);
    if (action === 'studio') openStudio(f.id);
    if (action === 'rename') {
      var next = prompt('Rename reference', f.label || 'UNLABELED');
      if (next != null) updateFile(f.id, { label: next.trim().toUpperCase() || 'UNLABELED' });
    }
    if (action === 'move') {
      var folder = prompt('Move to module', f.folder || 'SUBJECT');
      if (folder && state.folders.some(function (x) { return x.id === folder; })) assignFile(f.id, folder);
    }
  }

  function openStudio(fileId) {
    var f = state.files.find(function (file) { return file.id === fileId; });
    if (!f || !window.Studio || !f.url) return;
    window.Studio.open({
      imgUrl: f.url,
      uuid: f.uuid || null,
      ratio: null,
      caller: 'module',
      onDone: function (refinedUrl) {
        if (!refinedUrl) return;
        updateFile(f.id, { url: refinedUrl, visionDesc: '' });
      }
    });
  }

  panel.addEventListener('click', function (e) {
    var swatch = e.target.closest('[data-accent]');
    if (!swatch) return;
    swatch.parentElement.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
    swatch.classList.add('active');
  });

  function importLegacyModuleState() {
    var imported = [];
    [
      { key: 'subject', folder: 'SUBJECT' },
      { key: 'stage', folder: 'STAGE' },
      { key: 'style', folder: 'STYLE' }
    ].forEach(function (entry) {
      var data = window.ModuleState && window.ModuleState[entry.key];
      var htmlList = [];
      if (!data) return;
      if (data.html) htmlList.push(data.html);
      if (data.slots) data.slots.forEach(function (slot) { if (slot && slot.on !== false) htmlList.push(slot.html || ''); });
      htmlList.forEach(function (html) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html || '';
        tmp.querySelectorAll('.layer-group').forEach(function (group) {
          var nameEl = group.querySelector('.plr-name');
          var label = nameEl ? nameEl.textContent.trim().toUpperCase() : 'UNLABELED';
          group.querySelectorAll('.layer-children .clr').forEach(function (clr) {
            var img = clr.querySelector('.clr-main img');
            if (!img || !img.src) return;
            imported.push({
              id: uid++,
              folder: entry.folder,
              kind: 'IMG',
              label: label || 'UNLABELED',
              name: label ? label.toLowerCase().replace(/\s+/g, '_') + '.png' : 'legacy_module.png',
              size: 'LEGACY',
              dims: 'IMAGE',
              modified: nowTime(),
              linked: true,
              eye: !clr.querySelector('.plr-eye.off'),
              strength: 50,
              mode: entry.key === 'style' ? 'STYLE' : entry.key === 'stage' ? 'COMP' : 'SUBJECT',
              url: img.src,
              uuid: clr.dataset.uuid || crypto.randomUUID(),
              visionDesc: clr.dataset.visionDesc || ''
            });
          });
        });
      });
    });
    return imported;
  }

  window.applyModuleState = function () {
    var saved = window.ModuleState && window.ModuleState.cafeModule;
    if (saved && saved.files && saved.folders) {
      state.files = saved.files;
      state.folders = saved.folders;
      state.openFolders = new Set(saved.openFolders || ['SUBJECT', 'STAGE', 'STYLE']);
      uid = state.files.reduce(function (max, f) { return Math.max(max, Number(f.id) || 0); }, 10) + 1;
    } else {
      state.files = importLegacyModuleState();
      state.folders = DEFAULT_FOLDERS.slice();
      state.openFolders = new Set(['SUBJECT', 'STAGE', 'STYLE']);
      uid = state.files.reduce(function (max, f) { return Math.max(max, Number(f.id) || 0); }, 10) + 1;
    }
    sync();
  };

  window.ModulePanel = {
    getState: function () { return state; },
    render: render,
    openUpload: openUpload
  };

  sync();
})();
