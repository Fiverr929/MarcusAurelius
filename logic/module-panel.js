// module-panel.js
(function () {
  var LABELS = 'ABCDEFG';

  function truncate(text, max) {
    max = max || 16;
    return text.length > max ? text.slice(0, max) + '…' : text;
  }

  function makeComposeHTML(promptText) {
    var val = (promptText || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    return '<div class="compose-row">' +
          '<div class="compose-row-bar">' +
            '<div class="clr-x" data-compose-x><img src="assets/icon-close.svg" alt="x"></div>' +
            '<div class="compose-row-label">COMPOSE</div>' +
          '</div>' +
          '<div class="compose-row-input">' +
            '<textarea class="compose-row-textarea" placeholder="Describe what to generate...">' + val + '</textarea>' +
          '</div>' +
          '<div class="compose-row-actions">' +
            '<button class="compose-row-btn generate" data-compose-gen>GENERATE</button>' +
            '<button class="compose-row-btn save" data-compose-save>SAVE</button>' +
          '</div>' +
        '</div>';
  }

  function makeClrHTML() {
    return '<div class="clr">' +
          '<div class="clr-x"><img src="assets/icon-close.svg" alt="x"></div>' +
          '<div class="clr-main load"><img src="assets/icon-load.svg" alt="LOAD"></div>' +
          '<div class="clr-t blue">T</div>' +
        '</div>';
  }

  function makeGroupHTML(name) {
    return '<div class="layer-group">' +
          '<div class="plr">' +
            '<div class="plr-x blue"><img src="assets/icon-x-active.svg" alt="x"></div>' +
            '<div class="plr-exp orange"></div>' +
            '<div class="plr-name blue">' + name + '</div>' +
            '<div class="plr-link linked"><img src="assets/icon-link.svg" alt="link"></div>' +
            '<div class="plr-eye on"><img src="assets/icon-eye-on.svg" alt="eye"></div>' +
          '</div>' +
          '<div class="layer-children">' +
            makeClrHTML() +
            '<div class="add-child-row">' +
              '<div class="btn-add-child"><img src="assets/icon-add-child.svg" alt="+"></div>' +
            '</div>' +
          '</div>' +
        '</div>';
  }

  window.ModuleState = { subject: null, stage: null, style: null };

  function makeSection(config) {
    var noSlots = config.noSlots;
    var slotRow = config.slotRowId ? document.getElementById(config.slotRowId) : null;
    var container = document.getElementById(config.containerId);
    if (!container) return;
    if (!noSlots && !slotRow) return;
    var newLayerBtn = container.parentElement.querySelector('.btn-new-layer');

    function localGroupHTML(name) {
      return '<div class="layer-group">' +
        '<div class="plr">' +
          '<div class="plr-x blue"><img src="assets/icon-x-active.svg" alt="x"></div>' +
          '<div class="plr-exp orange"></div>' +
          '<div class="plr-name blue">' + name + '</div>' +
          (!config.noLink ? '<div class="plr-link linked"><img src="assets/icon-link.svg" alt="link"></div>' : '') +
          (!config.noEye  ? '<div class="plr-eye on"><img src="assets/icon-eye-on.svg" alt="eye"></div>' : '') +
        '</div>' +
        '<div class="layer-children">' +
          makeClrHTML() +
          '<div class="add-child-row">' +
            '<div class="btn-add-child"><img src="assets/icon-add-child.svg" alt="+"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    var selected = 0;
    var initialHTML = container.innerHTML || localGroupHTML(config.defaultLayerName);
    var slotStates = [{ on: true, html: container.innerHTML || localGroupHTML(config.defaultLayerName) }];

    function syncModuleState() {
      if (noSlots) {
        config.stateTarget[config.stateKey] = { html: container.innerHTML };
      } else {
        config.stateTarget[config.stateKey] = {
          selected: selected,
          slots: slotStates.map(function(s) { return { on: s.on, html: s.html }; })
        };
      }
      if (window.Workspace) window.Workspace.autosaveDebounced();
    }

    function saveSlot() { slotStates[selected].html = container.innerHTML; }
    function loadSlot() { container.innerHTML = slotStates[selected].html; }
    container._saveAndSync = function() { saveSlot(); syncModuleState(); };
    container._loadFromState = function(data) {
      if (!data) return;
      if (noSlots) {
        var html = data.html || (data.slots && data.slots[0] ? data.slots[0].html : null) || initialHTML;
        container.innerHTML = html;
        syncModuleState();
        return;
      }
      if (!data.slots) return;
      slotStates.length = 0;
      data.slots.forEach(function(s) { slotStates.push({ on: s.on !== false, html: s.html || initialHTML }); });
      if (!slotStates.length) slotStates.push({ on: true, html: initialHTML });
      selected = data.selected || 0;
      if (selected >= slotStates.length) selected = 0;
      loadSlot();
      setSlotLayerState(!slotStates[selected].on);
      renderSlotRow();
    };
    container._resetState = function() {
      if (noSlots) {
        container.innerHTML = initialHTML;
        syncModuleState();
        return;
      }
      slotStates.length = 0;
      slotStates.push({ on: true, html: initialHTML });
      selected = 0;
      loadSlot();
      try { setSlotLayerState(false); } catch(e) {}
      renderSlotRow();
    };

    function applyChildImageState(group, isOff) {
      group.querySelectorAll('.layer-children .clr').forEach(function (clr) {
        var childEye = clr.querySelector('.plr-eye');
        var edit = clr.querySelector('.clr-edit');
        if (isOff) {
          if (childEye && !config.noEye && childEye.classList.contains('on')) {
            childEye.classList.replace('on', 'off');
            childEye.querySelector('img').src = 'assets/icon-eye-off.svg';
            childEye.dataset.parentOff = '1';
          }
          if (edit && edit.classList.contains('a')) {
            edit.classList.replace('a', 'i');
            edit.querySelector('img').src = 'assets/icon-edit-inactive.svg';
            edit.dataset.parentOff = '1';
          }
        } else {
          if (childEye && !config.noEye && childEye.dataset.parentOff) {
            childEye.classList.replace('off', 'on');
            childEye.querySelector('img').src = 'assets/icon-eye-on.svg';
            delete childEye.dataset.parentOff;
          }
          if (edit && edit.dataset.parentOff) {
            edit.classList.replace('i', 'a');
            edit.querySelector('img').src = 'assets/icon-edit-active.svg';
            delete edit.dataset.parentOff;
          }
        }
      });
    }

    function renderSlotRow() {
      if (noSlots) { syncModuleState(); return; }
      var isOff = !slotStates[selected].on;
      slotRow.className = 'subject-row' + (isOff ? ' slot-is-off' : '');
      var section = slotRow.closest('.mod-section');
      if (section) section.classList.toggle('slot-off', isOff);
      var html = '<div class="subject-switch">';
      slotStates.forEach(function (s, i) {
        var cls = 'btn-subject-a';
        if (!s.on) cls += ' off';
        else if (i === selected) cls += ' on';
        html += '<div class="' + cls + '" data-tab="' + i + '">' + LABELS[i] + '</div>';
      });
      if (slotStates.length < 7)
        html += '<div class="btn-add-slot" data-add><img src="assets/icon-add-subject.svg" alt="+"></div>';
      html += '</div>';
      html += '<div class="on-off-switch"><div class="btn-on" data-on>ON</div><div class="btn-off" data-off>OFF</div></div>';
      slotRow.innerHTML = html;

      slotRow.querySelectorAll('[data-tab]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          saveSlot();
          selected = +tab.dataset.tab;
          loadSlot();
          setSlotLayerState(!slotStates[selected].on);
          renderSlotRow();
        });
      });
      var addBtn = slotRow.querySelector('[data-add]');
      if (addBtn) addBtn.addEventListener('click', function () {
        saveSlot();
        slotStates.push({ on: true, html: localGroupHTML(config.defaultLayerName) });
        selected = slotStates.length - 1;
        loadSlot();
        setSlotLayerState(false);
        renderSlotRow();
      });
      slotRow.querySelector('[data-on]').addEventListener('click', function () {
        slotStates[selected].on = true;
        setSlotLayerState(false);
        renderSlotRow();
        syncModuleState();
      });
      slotRow.querySelector('[data-off]').addEventListener('click', function () {
        slotStates[selected].on = false;
        setSlotLayerState(true);
        renderSlotRow();
        syncModuleState();
      });
      syncModuleState();
    }

    function setSlotLayerState(isOff) {
      container.querySelectorAll('.layer-group').forEach(function (group) {
        var plr = group.querySelector('.plr');
        var eye = plr.querySelector('.plr-eye');
        var x = plr.querySelector('.plr-x');
        if (isOff) {
          if (eye) { eye.classList.replace('on', 'off'); eye.querySelector('img').src = 'assets/icon-eye-off.svg'; }
          x.classList.replace('blue', 'off');
          x.querySelector('img').src = 'assets/icon-x-inactive.svg';
          plr.classList.add('layer-off');
          group.classList.add('parent-off');
          group.querySelectorAll('.clr-x img').forEach(function (img) { img.src = 'assets/icon-x-inactive.svg'; });
          applyChildImageState(group, true);
        } else {
          if (eye) { eye.classList.replace('off', 'on'); eye.querySelector('img').src = 'assets/icon-eye-on.svg'; }
          x.classList.replace('off', 'blue');
          x.querySelector('img').src = 'assets/icon-x-active.svg';
          plr.classList.remove('layer-off');
          group.classList.remove('parent-off');
          group.querySelectorAll('.clr-x img').forEach(function (img) { img.src = 'assets/icon-close.svg'; });
          applyChildImageState(group, false);
        }
      });
    }

    container.addEventListener('click', function (e) {
      var exp = e.target.closest('.plr-exp');
      if (exp) {
        var group = exp.closest('.layer-group');
        group.classList.toggle('collapsed');
        exp.classList.toggle('collapsed');
        return;
      }

      var eye = e.target.closest('.plr-eye');
      if (eye && !config.noEye) {
        var plr = eye.closest('.plr');
        if (plr) {
          var group = eye.closest('.layer-group');
          var x = plr.querySelector('.plr-x');
          var isOn = eye.classList.contains('on');
          if (isOn) {
            eye.classList.replace('on', 'off');
            eye.querySelector('img').src = 'assets/icon-eye-off.svg';
            x.classList.replace('blue', 'off');
            x.querySelector('img').src = 'assets/icon-x-inactive.svg';
            plr.classList.add('layer-off');
            group.classList.add('parent-off');
            group.querySelectorAll('.clr-x img').forEach(function (img) { img.src = 'assets/icon-x-inactive.svg'; });
            applyChildImageState(group, true);
          } else {
            eye.classList.replace('off', 'on');
            eye.querySelector('img').src = 'assets/icon-eye-on.svg';
            x.classList.replace('off', 'blue');
            x.querySelector('img').src = 'assets/icon-x-active.svg';
            plr.classList.remove('layer-off');
            group.classList.remove('parent-off');
            group.querySelectorAll('.clr-x img').forEach(function (img) { img.src = 'assets/icon-close.svg'; });
            applyChildImageState(group, false);
            if (slotStates[selected].on === false) {
              slotStates[selected].on = true;
              renderSlotRow();
            }
          }
          saveSlot();
          syncModuleState();
          return;
        }
      }

      var link = e.target.closest('.plr-link');
      if (link && !config.noLink) {
        if (link.classList.contains('linked')) {
          link.classList.replace('linked', 'unlinked');
          link.querySelector('img').src = 'assets/icon-unlink-small.svg';
        } else {
          link.classList.replace('unlinked', 'linked');
          link.querySelector('img').src = 'assets/icon-link.svg';
        }
        return;
      }

      var name = e.target.closest('.plr-name');
      if (name) {
        name.contentEditable = 'true';
        if (!name.closest('.studio-module-panel')) name.style.borderColor = '#ea5823';
        name.style.outline = 'none';
        name.focus();
        var range = document.createRange();
        range.selectNodeContents(name);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        name.addEventListener('blur', function commit() {
          name.contentEditable = 'false';
          name.style.borderColor = '';
          if (!name.textContent.trim()) name.textContent = 'NEW LAYER';
          name.removeEventListener('blur', commit);
          saveSlot();
          syncModuleState();
        });
        name.addEventListener('keydown', function onKey(e) {
          if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
          if (e.key === 'Escape') { name.textContent = name.dataset.prev || 'NEW LAYER'; name.blur(); }
          name.removeEventListener('keydown', onKey);
        });
        name.dataset.prev = name.textContent;
        return;
      }

      var addChild = e.target.closest('.btn-add-child');
      if (addChild) {
        var addChildRow = addChild.closest('.add-child-row');
        var temp = document.createElement('div');
        temp.innerHTML = makeClrHTML();
        addChildRow.parentElement.insertBefore(temp.firstElementChild, addChildRow);
        return;
      }

      var plrX = e.target.closest('.plr-x');
      if (plrX && plrX.closest('.plr')) {
        var group = plrX.closest('.layer-group');
        var groups = container.querySelectorAll('.layer-group');
        if (groups.length > 1) {
          group.remove();
        } else {
          var temp = document.createElement('div');
          temp.innerHTML = localGroupHTML(config.defaultLayerName);
          group.replaceWith(temp.firstElementChild);
          if (slotStates[selected].on === false) {
            slotStates[selected].on = true;
            setSlotLayerState(false);
            renderSlotRow();
          }
        }
        saveSlot();
        syncModuleState();
        return;
      }

      var clrT = e.target.closest('.clr-t');
      if (clrT && clrT.closest('.clr')) {
        var clr = clrT.closest('.clr');
        var savedPrompt = clrT.classList.contains('orange') ? (clr.dataset.savedPrompt || '') : '';
        var composeEl = document.createElement('div');
        composeEl.innerHTML = makeComposeHTML(savedPrompt);
        var compose = composeEl.firstElementChild;
        compose._originalClr = clr;
        clr.replaceWith(compose);
        return;
      }

      var composeX = e.target.closest('[data-compose-x]');
      if (composeX) {
        var compose = composeX.closest('.compose-row');
        compose.replaceWith(compose._originalClr);
        return;
      }

      var composeSave = e.target.closest('[data-compose-save]');
      if (composeSave) {
        var compose = composeSave.closest('.compose-row');
        var text = compose.querySelector('.compose-row-textarea').value.trim();
        if (!text) return;
        var clr = compose._originalClr;
        clr.dataset.savedPrompt = text;
        var oldUuid = clr.dataset.uuid;
        if (oldUuid && window.DB) window.DB.images.delete(oldUuid);
        clr.innerHTML =
              '<div class="clr-x"><img src="assets/icon-close.svg" alt="x"></div>' +
              '<div class="clr-t orange">T</div>' +
              '<div class="clr-main prompt-a">' + truncate(text) + '</div>' +
              '<div class="plr-eye on"><img src="assets/icon-eye-on.svg" alt="on"></div>';
        compose.replaceWith(clr);
        saveSlot();
        syncModuleState();
        return;
      }

      var composeGen = e.target.closest('[data-compose-gen]');
      if (composeGen) {
        var compose = composeGen.closest('.compose-row');
        var text = compose.querySelector('.compose-row-textarea').value.trim();
        if (!text) return;

        var clr = compose._originalClr;
        clr.innerHTML =
              '<div class="clr-x"><img src="assets/icon-close.svg" alt="x"></div>' +
              '<div class="clr-main generating"></div>' +
              '<div class="clr-t blue">T</div>';
        compose.replaceWith(clr);

        if (window.CafeAPI && window.CafeAPI.generateLayerImage) {
          window.CafeAPI.generateLayerImage(text).then(function (dataUrl) {
            var oldUuid = clr.dataset.uuid;
            if (oldUuid && window.DB) window.DB.images.delete(oldUuid);
            clr.innerHTML =
                '<div class="clr-x"><img src="assets/icon-close.svg" alt="x"></div>' +
                '<div class="clr-main img-a"><img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover;" alt="image"></div>' +
                '<div class="clr-edit a"><img src="assets/icon-edit-active.svg" alt="edit"></div>' +
                '<div class="plr-eye on"><img src="assets/icon-eye-on.svg" alt="on"></div>';
            var genUuid = crypto.randomUUID();
            clr.dataset.uuid = genUuid;
            DB.images.put(genUuid, dataUrl, window.activeProjectId);
            clr.dataset.visionDesc = text;
            saveSlot();
            syncModuleState();
          }).catch(function (err) {
            console.error('[Layer Gen Error]', err);
            alert('Layer image generation failed: ' + err.message);
            clr.replaceWith(compose);
          });
        } else {
          alert('API not ready. Please make sure api.js is loaded.');
          clr.replaceWith(compose);
        }
        return;
      }

      var childEye = e.target.closest('.plr-eye');
      if (childEye && childEye.closest('.clr')) {
        var clr = childEye.closest('.clr');
        var main = clr.querySelector('.clr-main');
        var edit = clr.querySelector('.clr-edit');
        var x = clr.querySelector('.clr-x');
        var t = clr.querySelector('.clr-t');
        var isOn = childEye.classList.contains('on');
        if (isOn) {
          childEye.classList.replace('on', 'off');
          childEye.querySelector('img').src = 'assets/icon-eye-off.svg';
          if (main) {
            if (main.classList.contains('img-a')) main.classList.replace('img-a', 'img-i');
            if (main.classList.contains('prompt-a')) main.classList.replace('prompt-a', 'prompt-i');
          }
          if (edit) { edit.classList.replace('a', 'i'); edit.querySelector('img').src = 'assets/icon-edit-inactive.svg'; }
          if (x) { x.classList.add('off'); x.querySelector('img').src = 'assets/icon-x-inactive.svg'; }
          if (t && t.classList.contains('orange')) t.classList.replace('orange', 'gray');
        } else {
          childEye.classList.replace('off', 'on');
          childEye.querySelector('img').src = 'assets/icon-eye-on.svg';
          if (main) {
            if (main.classList.contains('img-i')) main.classList.replace('img-i', 'img-a');
            if (main.classList.contains('prompt-i')) main.classList.replace('prompt-i', 'prompt-a');
          }
          if (edit) { edit.classList.replace('i', 'a'); edit.querySelector('img').src = 'assets/icon-edit-active.svg'; }
          if (x) { x.classList.remove('off'); x.querySelector('img').src = 'assets/icon-close.svg'; }
          if (t && t.classList.contains('gray')) t.classList.replace('gray', 'orange');
        }
        saveSlot();
        syncModuleState();
        return;
      }

      var clrX = e.target.closest('.clr-x');
      if (clrX && clrX.closest('.clr')) {
        var clr = clrX.closest('.clr');
        var children = clr.closest('.layer-children');
        var group = clr.closest('.layer-group');
        var clrs = children.querySelectorAll('.clr');
        if (clrs.length > 1) {
          var oldUuid = clr.dataset.uuid;
          if (oldUuid && window.DB) window.DB.images.delete(oldUuid);
          clr.remove();
        } else {
          var oldUuid = clr.dataset.uuid;
          if (oldUuid && window.DB) window.DB.images.delete(oldUuid);
          var temp = document.createElement('div');
          temp.innerHTML = makeClrHTML();
          clr.replaceWith(temp.firstElementChild);
          if (slotStates[selected].on === false) {
            slotStates[selected].on = true;
            setSlotLayerState(false);
            renderSlotRow();
          }
        }
        if (group.classList.contains('parent-off')) {
          var plr = group.querySelector('.plr');
          var parentEye = plr.querySelector('.plr-eye');
          var parentX = plr.querySelector('.plr-x');
          parentEye.classList.replace('off', 'on');
          parentEye.querySelector('img').src = 'assets/icon-eye-on.svg';
          parentX.classList.replace('off', 'blue');
          parentX.querySelector('img').src = 'assets/icon-x-active.svg';
          plr.classList.remove('layer-off');
          group.classList.remove('parent-off');
          applyChildImageState(group, false);
          group.querySelectorAll('.clr-x img').forEach(function (img) { img.src = 'assets/icon-close.svg'; });
        }
        saveSlot();
        syncModuleState();
        return;
      }

      var clrEdit = e.target.closest('.clr-edit');
      if (clrEdit && clrEdit.classList.contains('a') && clrEdit.closest('.clr')) {
        var clr = clrEdit.closest('.clr');
        var img = clr.querySelector('.clr-main img');
        if (!img || !img.src || img.src === window.location.href) return;
        window.Studio.open({
          imgUrl: img.src,
          uuid:   clr.dataset.uuid || null,
          ratio:  null,
          caller: 'module',
          onDone: function (refinedUrl) {
            if (!refinedUrl) return;
            img.src = refinedUrl;
            clr.dataset.visionDesc = '';
            var oldUuid = clr.dataset.uuid;
            if (oldUuid && window.DB) window.DB.images.delete(oldUuid);
            var newUuid = crypto.randomUUID();
            clr.dataset.uuid = newUuid;
            DB.images.put(newUuid, refinedUrl, window.activeProjectId);
            saveSlot();
            syncModuleState();
          }
        });
        return;
      }

      saveSlot();
      syncModuleState();
    });

    if (newLayerBtn) {
      newLayerBtn.addEventListener('click', function () {
        var temp = document.createElement('div');
        temp.innerHTML = localGroupHTML(config.defaultLayerName);
        container.appendChild(temp.firstElementChild);
        if (slotStates[selected].on === false) {
          var newGroup = container.lastElementChild;
          var plr = newGroup.querySelector('.plr');
          var eye = plr.querySelector('.plr-eye');
          var x = plr.querySelector('.plr-x');
          if (eye) { eye.classList.replace('on', 'off'); eye.querySelector('img').src = 'assets/icon-eye-off.svg'; }
          x.classList.replace('blue', 'off');
          x.querySelector('img').src = 'assets/icon-x-inactive.svg';
          plr.classList.add('layer-off');
          newGroup.classList.add('parent-off');
        }
        saveSlot();
        syncModuleState();
      });
    }

    loadSlot();
    renderSlotRow();
  }

  var _sectionRegistry = {};

  function registerSection(key, container) {
    _sectionRegistry[key] = container;
  }

  window.ModulePanel = { makeSection: makeSection };

  makeSection({ slotRowId: 'mp-slot-subj', containerId: 'mp-layers-subj', defaultLayerName: 'NEW SUBJECT', stateKey: 'subject', stateTarget: window.ModuleState });
  makeSection({ containerId: 'mp-layers-stage', defaultLayerName: 'NEW STAGE', stateKey: 'stage', stateTarget: window.ModuleState, noSlots: true });
  makeSection({ containerId: 'mp-layers-sty',   defaultLayerName: 'NEW LAYER', stateKey: 'style', stateTarget: window.ModuleState, noSlots: true });

  registerSection('subject', document.getElementById('mp-layers-subj'));
  registerSection('stage',   document.getElementById('mp-layers-stage'));
  registerSection('style',   document.getElementById('mp-layers-sty'));

  window.applyModuleState = function () {
    var ms = window.ModuleState;
    if (!ms) return;
    ['subject', 'stage', 'style'].forEach(function (key) {
      var el = _sectionRegistry[key];
      if (!el) return;
      if (ms[key] && el._loadFromState) el._loadFromState(ms[key]);
      else if (!ms[key] && el._resetState) el._resetState();
    });
  };

  // Image upload for .clr-main.load in module panel
  var mpFileInput = document.getElementById('mp-file-input');
  var activeClrMain = null;

  document.querySelector('.module-panel').addEventListener('click', function (e) {
    var loadBtn = e.target.closest('.clr-main.load');
    if (loadBtn) {
      activeClrMain = loadBtn;
      mpFileInput.value = '';
      mpFileInput.click();
    }
  });

  mpFileInput.addEventListener('change', function () {
    var file = mpFileInput.files[0];
    if (!file || !activeClrMain) return;
    var clr = activeClrMain.closest('.clr');
    var reader = new FileReader();
    reader.onload = function (evt) {
      var url = evt.target.result;
      var oldUuid = clr.dataset.uuid;
      if (oldUuid && window.DB) window.DB.images.delete(oldUuid);
      clr.innerHTML =
          '<div class="clr-x"><img src="assets/icon-close.svg" alt="x"></div>' +
          '<div class="clr-main img-a"><img src="' + url + '" style="width:100%;height:100%;object-fit:cover;" alt="image"></div>' +
          '<div class="clr-edit a"><img src="assets/icon-edit-active.svg" alt="edit"></div>' +
          '<div class="plr-eye on"><img src="assets/icon-eye-on.svg" alt="eye"></div>';
      activeClrMain = null;
      clr.dataset.visionDesc = '';
      var uuid = crypto.randomUUID();
      clr.dataset.uuid = uuid;
      DB.images.put(uuid, url, window.activeProjectId);
      var owningContainer = clr.closest('.mod-layers');

      if (window.CafeSettings.getScanTiming() === 'load') {
        var group = clr.closest('.layer-group');
        var nameEl = group ? group.querySelector('.plr-name') : null;
        var layerName = nameEl ? nameEl.textContent.trim() : 'LAYER';
        var modLayers = clr.closest('.mod-layers');
        var section = modLayers ? modLayers.dataset.section : '';
        var clrMain = clr.querySelector('.clr-main');
        if (clrMain) clrMain.classList.add('scanning');

        window.DescriptionRegistry.ensure(url, {
          type: section === 'style' ? 'style' : 'module',
          layerName: layerName,
          section: section,
          uuid: uuid
        })
          .then(function (desc) {
            clr.dataset.visionDesc = desc;
            if (clrMain) clrMain.classList.remove('scanning');
            if (owningContainer && owningContainer._saveAndSync) owningContainer._saveAndSync();
          })
          .catch(function (err) {
            if (clrMain) clrMain.classList.remove('scanning');
            console.warn('[VisionScan] On-load scan failed:', err.message);
            if (owningContainer && owningContainer._saveAndSync) owningContainer._saveAndSync();
          });
      } else {
        if (owningContainer && owningContainer._saveAndSync) owningContainer._saveAndSync();
      }
    };
    reader.readAsDataURL(file);
  });
})();
