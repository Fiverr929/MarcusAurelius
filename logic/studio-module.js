// studio-module.js
// Purpose-built reference panel for Studio. It intentionally does not use
// ModulePanel, so Studio has no hidden slots, text rows, eye, or link behavior.

window.StudioModuleState = { layers: null };

(function () {

  var ACTIONS = ['INSERT', 'SWAP', 'TRANSFER', 'REMOVE', 'PRESERVE'];
  var DEFAULT_ACTION = 'TRANSFER';
  var MAX_IMAGES_PER_GROUP = 3;

  var smFileInput = document.getElementById('sm-file-input');
  var container = null;
  var headerAdd = null;
  var pendingUpload = null;
  var currentSourceUuid = null;

  function escapeHTML(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeName(value) {
    return (value || '').trim().toUpperCase() || 'REFERENCE';
  }

  function normalizeAction(value) {
    value = String(value || '').trim().toUpperCase();
    return ACTIONS.indexOf(value) !== -1 ? value : DEFAULT_ACTION;
  }

  function makeUuid() {
    return crypto.randomUUID();
  }

  function autosave() {
    window.StudioModuleState.layers = serialize();
    if (window.Workspace) window.Workspace.autosaveDebounced();
  }

  function saveImage(uuid, url) {
    if (!window.DB || !uuid || !url) return;
    DB.images.put(uuid, url, window.activeProjectId)
      .catch(function (e) { console.error('[StudioModule] Failed to save image to DB:', e); });
  }

  function deleteImage(uuid) {
    if (!window.DB || !uuid) return;
    DB.images.delete(uuid).catch(function (e) { console.error('[StudioModule] Failed to delete image from DB:', e); });
  }

  function getGroups() {
    var layers = window.StudioModuleState.layers;
    return layers && Array.isArray(layers.groups) ? layers.groups : [];
  }

  function serialize() {
    var groups = [];
    if (!container) return { groups: groups };
    container.querySelectorAll('.layer-group').forEach(function (group) {
      var nameEl = group.querySelector('.plr-name');
      var images = [];
      group.querySelectorAll('.clr').forEach(function (clr) {
        var main = clr.querySelector('.clr-main.img-a');
        var img = main && main.querySelector('img');
        if (!img) return;
        images.push({ uuid: clr.dataset.uuid || '' });
      });
      if (images.length) {
        groups.push({
          action: normalizeAction(group.dataset.action),
          name: normalizeName(nameEl ? nameEl.textContent : ''),
          images: images
        });
      }
    });
    return { groups: groups };
  }

  function syncGroupControls(group) {
    var imageCount = group.querySelectorAll('.clr-main.img-a').length;
    var groupX = group.querySelector('.plr > .plr-x');
    var addRow = group.querySelector('.add-child-row');
    if (groupX) groupX.style.display = imageCount > 1 ? 'none' : '';
    group.querySelectorAll('.clr-x').forEach(function (x) {
      x.style.display = imageCount > 1 ? '' : 'none';
    });
    if (addRow) addRow.classList.toggle('disabled', imageCount >= MAX_IMAGES_PER_GROUP);
  }

  function syncAllGroupControls() {
    container.querySelectorAll('.layer-group').forEach(syncGroupControls);
  }

  function closeHeaderActionMenu() {
    var menu = document.querySelector('.sm-header-action-menu');
    if (menu) menu.remove();
  }

  function closeGroupDrawers(exceptGroup) {
    container.querySelectorAll('.layer-group.drawer-open, .layer-group.action-drawer-open').forEach(function (group) {
      if (group !== exceptGroup) {
        group.classList.remove('drawer-open', 'action-drawer-open');
        group.querySelectorAll('.sm-action-drawer, .sm-name-editor').forEach(function (drawer) { drawer.remove(); });
      }
    });
  }

  function makeImageHTML(image) {
    var uuid = image && image.uuid ? image.uuid : makeUuid();
    var url = image && image.url ? image.url : '';
    return '<div class="clr" data-uuid="' + escapeHTML(uuid) + '">' +
        '<div class="clr-x"><img src="assets/icon-trash.svg" alt="remove"></div>' +
        '<div class="clr-main img-a"><img src="' + escapeHTML(url) + '" style="width:100%;height:100%;object-fit:cover;" alt="image"></div>' +
      '</div>';
  }

  function makeActionButtonHTML(action) {
    return '<button type="button" class="sm-action-btn" data-action-trigger>' + escapeHTML(normalizeAction(action)) + '</button>';
  }

  function makeActionRowsHTML(activeAction) {
    activeAction = normalizeAction(activeAction);
    return ACTIONS.map(function (action) {
      return '<button type="button" class="sm-action-option' + (action === activeAction ? ' active' : '') + '" data-action-option="' + action + '">' + action + '</button>';
    }).join('');
  }

  function makeGroupHTML(groupData) {
    var images = groupData.images || [];
    var action = normalizeAction(groupData.action);
    return '<div class="layer-group" data-action="' + action + '">' +
      '<div class="plr">' +
        '<div class="plr-x blue"><img src="assets/icon-x-inactive.svg" alt="x"></div>' +
        makeActionButtonHTML(action) +
        '<div class="plr-name blue" data-name-trigger>' + escapeHTML(normalizeName(groupData.name)) + '</div>' +
      '</div>' +
      '<div class="layer-children">' +
        images.map(makeImageHTML).join('') +
        '<div class="add-child-row">' +
          '<div class="btn-add-child"><img src="assets/icon-add-child.svg" alt="+"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function render(groups) {
    if (!container) return;
    container.innerHTML = (groups || []).map(makeGroupHTML).join('');
    resolveMissingImages();
    syncAllGroupControls();
    window.StudioModuleState.layers = serialize();
  }

  function resolveMissingImages() {
    if (!window.DB) return;
    container.querySelectorAll('.clr[data-uuid] .clr-main.img-a img').forEach(function (img) {
      var clr = img.closest('.clr');
      var uuid = clr && clr.dataset.uuid;
      if (!uuid || img.getAttribute('src')) return;
      DB.images.get(uuid).then(function (record) {
        if (!record || !record.dataUrl) return;
        img.src = record.dataUrl;
        autosave();
      }).catch(function (e) { console.warn('[StudioModule] Failed to restore image:', uuid, e); });
    });
  }

  function parseLegacyLayers(layers) {
    if (!layers || !layers.html) return null;
    var tmp = document.createElement('div');
    tmp.innerHTML = layers.html;
    var groups = [];
    tmp.querySelectorAll('.layer-group').forEach(function (group) {
      var nameEl = group.querySelector('.plr-name');
      var images = [];
      group.querySelectorAll('.clr').forEach(function (clr) {
        var main = clr.querySelector('.clr-main.img-a');
        var img = main && main.querySelector('img');
        if (!img) return;
        images.push({ uuid: clr.dataset.uuid || img.dataset.uuid || makeUuid(), url: img.src || '' });
      });
      if (images.length) {
        groups.push({ action: DEFAULT_ACTION, name: normalizeName(nameEl ? nameEl.textContent : ''), images: images });
      }
    });
    return { groups: groups };
  }

  function createGroup(action, url) {
    var uuid = makeUuid();
    var temp = document.createElement('div');
    temp.innerHTML = makeGroupHTML({
      action: action,
      name: 'REFERENCE',
      images: [{ uuid: uuid, url: url }]
    });
    var group = temp.firstElementChild;
    container.prepend(group);
    saveImage(uuid, url);
    syncGroupControls(group);
    autosave();
  }

  function insertImage(addRow, url) {
    if (addRow.closest('.layer-group').querySelectorAll('.clr-main.img-a').length >= MAX_IMAGES_PER_GROUP) return;
    var uuid = makeUuid();
    var temp = document.createElement('div');
    temp.innerHTML = makeImageHTML({ uuid: uuid, url: url });
    addRow.parentElement.insertBefore(temp.firstElementChild, addRow);
    saveImage(uuid, url);
    syncGroupControls(addRow.closest('.layer-group'));
    autosave();
  }

  function requestUpload(type, data) {
    pendingUpload = Object.assign({ type: type }, data || {});
    smFileInput.value = '';
    smFileInput.click();
  }

  function handleUpload(url) {
    if (!pendingUpload) return;
    var upload = pendingUpload;
    pendingUpload = null;
    if (upload.type === 'create') createGroup(upload.action, url);
    if (upload.type === 'insert') insertImage(upload.addRow, url);
  }

  function openHeaderActionMenu() {
    closeHeaderActionMenu();
    closeGroupDrawers();
    var menu = document.createElement('div');
    menu.className = 'sm-header-action-menu';
    menu.innerHTML = ACTIONS.map(function (action) {
      return '<button type="button" class="sm-create-option" data-action-option="' + action + '">' + action + '</button>';
    }).join('');
    container.prepend(menu);
  }

  function openActionDrawer(group) {
    closeHeaderActionMenu();
    closeGroupDrawers(group);
    var existing = group.querySelector('.sm-action-drawer');
    if (existing) {
      group.classList.remove('action-drawer-open');
      existing.remove();
      return;
    }
    group.classList.add('action-drawer-open');
    var drawer = document.createElement('div');
    drawer.className = 'sm-action-drawer';
    drawer.innerHTML = makeActionRowsHTML(group.dataset.action);
    group.querySelector('.plr').insertAdjacentElement('afterend', drawer);
  }

  function openNameEditor(group) {
    closeHeaderActionMenu();
    closeGroupDrawers(group);
    // Also close action drawer on the same group
    var actionDrawer = group.querySelector('.sm-action-drawer');
    if (actionDrawer) { group.classList.remove('action-drawer-open'); actionDrawer.remove(); }
    var existing = group.querySelector('.sm-name-editor');
    if (existing) return;
    group.classList.add('drawer-open');
    var current = normalizeName(group.querySelector('.plr-name').textContent);
    var editor = document.createElement('div');
    editor.className = 'sm-name-editor';
    editor.innerHTML = '<input class="sm-name-input" value="' + escapeHTML(current) + '" spellcheck="false">';
    group.querySelector('.plr').insertAdjacentElement('afterend', editor);
    var input = editor.querySelector('.sm-name-input');
    input.focus();
    input.select();
  }

  function closeNameEditor(editor, save) {
    var group = editor.closest('.layer-group');
    var input = editor.querySelector('.sm-name-input');
    if (save) {
      group.querySelector('.plr-name').textContent = normalizeName(input.value);
      autosave();
    }
    group.classList.remove('drawer-open');
    editor.remove();
  }

  function handlePanelClick(e) {
    var headerOption = e.target.closest('.sm-header-action-menu [data-action-option]');
    if (headerOption) {
      var action = headerOption.dataset.actionOption;
      closeHeaderActionMenu();
      requestUpload('create', { action: action });
      return;
    }

    var actionTrigger = e.target.closest('[data-action-trigger]');
    if (actionTrigger) {
      openActionDrawer(actionTrigger.closest('.layer-group'));
      return;
    }

    var actionOption = e.target.closest('.sm-action-drawer [data-action-option]');
    if (actionOption) {
      var actionGroup = actionOption.closest('.layer-group');
      var nextAction = normalizeAction(actionOption.dataset.actionOption);
      actionGroup.dataset.action = nextAction;
      actionGroup.querySelector('[data-action-trigger]').textContent = nextAction;
      closeGroupDrawers();
      autosave();
      return;
    }

    var nameTrigger = e.target.closest('[data-name-trigger]');
    if (nameTrigger) {
      openNameEditor(nameTrigger.closest('.layer-group'));
      return;
    }

    var groupX = e.target.closest('.plr-x');
    if (groupX && groupX.closest('.plr')) {
      var group = groupX.closest('.layer-group');
      group.querySelectorAll('.clr[data-uuid]').forEach(function (clr) { deleteImage(clr.dataset.uuid); });
      group.remove();
      autosave();
      return;
    }

    var clrX = e.target.closest('.clr-x');
    if (clrX && clrX.closest('.clr')) {
      var clr = clrX.closest('.clr');
      var parent = clr.parentElement;
      deleteImage(clr.dataset.uuid);
      clr.remove();
      if (!parent.querySelector('.clr')) parent.closest('.layer-group').remove();
      else syncGroupControls(parent.closest('.layer-group'));
      autosave();
      return;
    }

    var addBtn = e.target.closest('.btn-add-child');
    if (addBtn) {
      var addRow = addBtn.closest('.add-child-row');
      if (addRow.classList.contains('disabled')) return;
      requestUpload('insert', { addRow: addRow });
    }
  }

  function handleDocumentClick(e) {
    if (!e.target.closest('.studio-module-panel')) {
      closeHeaderActionMenu();
      closeGroupDrawers();
    }
  }

  function handlePanelKeydown(e) {
    var input = e.target.closest('.sm-name-input');
    if (!input) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      closeNameEditor(input.closest('.sm-name-editor'), true);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeNameEditor(input.closest('.sm-name-editor'), false);
    }
  }

  function handlePanelFocusout(e) {
    var editor = e.target.closest('.sm-name-editor');
    if (editor && !editor.contains(e.relatedTarget)) {
      closeNameEditor(editor, true);
    }
  }

  function init() {
    if (window.StudioModule._initialized) return;
    window.StudioModule._initialized = true;

    container = document.getElementById('sm-layers');
    headerAdd = document.getElementById('sm-header-add');
    render(getGroups());

    if (headerAdd) {
      headerAdd.addEventListener('click', function (e) {
        e.stopPropagation();
        if (document.querySelector('.sm-header-action-menu')) closeHeaderActionMenu();
        else openHeaderActionMenu();
      });
    }

    var panel = document.querySelector('.studio-module-panel');
    panel.addEventListener('click', handlePanelClick);
    panel.addEventListener('keydown', handlePanelKeydown);
    panel.addEventListener('focusout', handlePanelFocusout);
    document.addEventListener('click', handleDocumentClick);

    smFileInput.addEventListener('change', function () {
      var file = smFileInput.files[0];
      if (!file) { pendingUpload = null; return; }
      var reader = new FileReader();
      reader.onload = function (evt) { handleUpload(evt.target.result); };
      reader.readAsDataURL(file);
    });
  }

  function collectImages() {
    var results = [];
    if (!container) return results;
    container.querySelectorAll('.layer-group').forEach(function (group) {
      var nameEl = group.querySelector('.plr-name');
      var name = normalizeName(nameEl ? nameEl.textContent : '');
      var action = normalizeAction(group.dataset.action);
      group.querySelectorAll('.clr').forEach(function (clr) {
        var main = clr.querySelector('.clr-main.img-a');
        var img = main && main.querySelector('img');
        if (img && img.src && img.src.startsWith('data:')) {
          results.push({ url: img.src, name: name, action: action });
        }
      });
    });
    return results;
  }

  function reset() {
    if (container) {
      container.querySelectorAll('.clr[data-uuid]').forEach(function (clr) { deleteImage(clr.dataset.uuid); });
    }
    window.StudioModuleState.layers = { groups: [] };
    render([]);
    autosave();
  }

  function loadForSource(uuid, layers) {
    currentSourceUuid = uuid || null;
    var normalized = parseLegacyLayers(layers) || layers || { groups: [] };
    if (!Array.isArray(normalized.groups)) normalized.groups = [];
    normalized.groups = normalized.groups.map(function (group) {
      return {
        action: normalizeAction(group.action),
        name: normalizeName(group.name),
        images: Array.isArray(group.images) ? group.images : []
      };
    }).filter(function (group) { return group.images.length; });
    window.StudioModuleState.layers = normalized;
    render(normalized.groups);
  }

  function saveCurrent() {
    window.StudioModuleState.layers = serialize();
    return window.StudioModuleState.layers;
  }

  window.StudioModule = {
    _initialized: false,
    init:          init,
    collectImages: collectImages,
    loadForSource: loadForSource,
    saveCurrent:   saveCurrent,
    reset:         reset
  };

}());
