// studio-module.js
// Purpose-built module panel for Studio. No slots, no eye, no link/unlink.

window.StudioModuleState = { layers: null };

(function () {

  var smFileInput   = document.getElementById('sm-file-input');
  var activeClrMain = null;  // replacing an existing LOAD slot
  var activeAddRow  = null;  // + bar below a group adds a new image child
  var pendingNewCard = false; // + header button clicked, waiting for file

  // ── Helpers ─────────────────────────────────────────────────────────────

  function syncAllGroupX() {
    document.querySelectorAll('#sm-layers .layer-group').forEach(function (group) {
      var multiple = group.querySelectorAll('.clr-main.img-a').length > 1;
      var plrX = group.querySelector('.plr > .plr-x');
      if (plrX) plrX.style.display = multiple ? 'none' : '';
      group.querySelectorAll('.clr-x').forEach(function (x) {
        x.style.display = multiple ? '' : 'none';
      });
    });
  }

  function makeRefGroupHTML(name, imgUrl) {
    return '<div class="layer-group">' +
      '<div class="plr">' +
        '<div class="plr-x blue"><img src="assets/icon-x-active.svg" alt="x"></div>' +
        '<div class="plr-exp orange"></div>' +
        '<div class="plr-name blue">' + name.replace(/</g, '&lt;') + '</div>' +
      '</div>' +
      '<div class="layer-children">' +
        '<div class="clr">' +
          '<div class="clr-x"><img src="assets/icon-close.svg" alt="x"></div>' +
          '<div class="clr-main img-a"><img src="' + imgUrl + '" style="width:100%;height:100%;object-fit:cover;" alt="image"></div>' +
        '</div>' +
        '<div class="add-child-row">' +
          '<div class="btn-add-child"><img src="assets/icon-add-child.svg" alt="+"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function insertImageClr(addChildRow, url) {
    var temp = document.createElement('div');
    temp.innerHTML =
      '<div class="clr">' +
        '<div class="clr-x"><img src="assets/icon-close.svg" alt="x"></div>' +
        '<div class="clr-main img-a"><img src="' + url + '" style="width:100%;height:100%;object-fit:cover;" alt="image"></div>' +
      '</div>';
    var clr = temp.firstElementChild;
    addChildRow.parentElement.insertBefore(clr, addChildRow);
    var uuid = crypto.randomUUID();
    clr.dataset.uuid = uuid;
    DB.images.put(uuid, url, window.activeProjectId);
    var container = clr.closest('.mod-layers');
    if (container && container._saveAndSync) container._saveAndSync();
  }

  // ── Add-reference card ───────────────────────────────────────────────────

  function createRefCard() {
    if (document.querySelector('.sm-ref-card')) return; // one at a time
    pendingNewCard = true;
    smFileInput.value = '';
    smFileInput.click();
  }

  function buildAndInsertRefCard(url) {
    var card = document.createElement('div');
    card.className = 'sm-ref-card';
    card._imgUrl = url;
    card.innerHTML =
      '<div class="sm-ref-card-bar">' +
        '<div class="sm-ref-card-x"><img src="assets/icon-x-active.svg" alt="x"></div>' +
        '<div class="sm-ref-card-name" contenteditable="true" spellcheck="false"></div>' +
        '<div class="sm-ref-card-add">ADD</div>' +
      '</div>' +
      '<div class="sm-ref-card-img loaded"><img src="' + url + '" alt="ref"></div>';

    document.getElementById('sm-layers').prepend(card);

    card.querySelector('.sm-ref-card-x').addEventListener('click', function () {
      card.remove(); // refcards have no UUID — UUID only created on ADD; safe to remove directly
    });

    card.querySelector('.sm-ref-card-name').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') e.preventDefault();
    });

    card.querySelector('.sm-ref-card-add').addEventListener('click', function () {
      var name = card.querySelector('.sm-ref-card-name').textContent.trim().toUpperCase() || 'REFERENCE';
      var temp = document.createElement('div');
      temp.innerHTML = makeRefGroupHTML(name, url);
      var group = temp.firstElementChild;
      card.replaceWith(group);
      var clr = group.querySelector('.clr');
      if (clr) { var uuid = crypto.randomUUID(); clr.dataset.uuid = uuid; DB.images.put(uuid, url, window.activeProjectId); }
      var container = document.getElementById('sm-layers');
      if (container && container._saveAndSync) container._saveAndSync();
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  function init() {
    if (window.StudioModule._initialized) return;
    window.StudioModule._initialized = true;

    window.ModulePanel.makeSection({
      containerId:      'sm-layers',
      defaultLayerName: 'REFERENCE',
      stateKey:         'layers',
      stateTarget:      window.StudioModuleState,
      noSlots:          true,
      noEye:            true,
      noLink:           true
    });

    if (window._pendingStudioLayers) {
      var smEl = document.getElementById('sm-layers');
      if (smEl && smEl._loadFromState) { smEl._loadFromState(window._pendingStudioLayers); window._pendingStudioLayers = null; }
    }

    var mo = new MutationObserver(syncAllGroupX);
    mo.observe(document.getElementById('sm-layers'), { childList: true, subtree: true });

    var headerAdd = document.getElementById('sm-header-add');
    if (headerAdd) headerAdd.addEventListener('click', createRefCard);

    // Capture — intercept child + bar clicks before module-panel.js handles them
    document.querySelector('.studio-module-panel').addEventListener('click', function (e) {
      var addBtn = e.target.closest('.btn-add-child');
      if (addBtn) {
        e.stopPropagation();
        var addChildRow = addBtn.closest('.add-child-row');
        var prevClr = addChildRow.previousElementSibling;
        var prevMain = prevClr && prevClr.classList.contains('clr') && prevClr.querySelector('.clr-main');
        if (prevMain && prevMain.classList.contains('load')) {
          activeClrMain = prevMain;
          activeAddRow  = null;
        } else {
          activeAddRow  = addChildRow;
          activeClrMain = null;
        }
        smFileInput.value = '';
        smFileInput.click();
      }
    }, true);

    // Bubble — LOAD slot clicks
    document.querySelector('.studio-module-panel').addEventListener('click', function (e) {
      var loadBtn = e.target.closest('.clr-main.load');
      if (loadBtn) {
        activeClrMain = loadBtn;
        activeAddRow  = null;
        smFileInput.value = '';
        smFileInput.click();
      }
    });

    smFileInput.addEventListener('change', function () {
      var file = smFileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (evt) {
        var url = evt.target.result;

        if (pendingNewCard) {
          pendingNewCard = false;
          buildAndInsertRefCard(url);
          return;
        }

        if (activeAddRow) {
          insertImageClr(activeAddRow, url);
          activeAddRow = null;
          return;
        }

        if (activeClrMain) {
          var clr = activeClrMain.closest('.clr');
          var oldUuid = clr.dataset.uuid;
          if (oldUuid && window.DB) window.DB.images.delete(oldUuid);
          clr.innerHTML =
            '<div class="clr-x"><img src="assets/icon-close.svg" alt="x"></div>' +
            '<div class="clr-main img-a"><img src="' + url + '" style="width:100%;height:100%;object-fit:cover;" alt="image"></div>';
          var uuid = crypto.randomUUID();
          clr.dataset.uuid = uuid;
          DB.images.put(uuid, url, window.activeProjectId);
          var container = clr.closest('.mod-layers');
          if (container && container._saveAndSync) container._saveAndSync();
          activeClrMain = null;

          // Auto-prompt rename so user can name the group immediately
          var group = clr.closest('.layer-group');
          var nameEl = group && group.querySelector('.plr-name');
          if (nameEl) {
            nameEl.contentEditable = 'true';
            nameEl.focus();
            var range = document.createRange();
            range.selectNodeContents(nameEl);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            function onNameKey(e) {
              if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
            }
            function onNameBlur() {
              nameEl.removeEventListener('keydown', onNameKey);
              nameEl.removeEventListener('blur', onNameBlur);
              nameEl.contentEditable = 'false';
              var val = nameEl.textContent.trim().toUpperCase();
              nameEl.textContent = val || 'REFERENCE';
              if (container && container._saveAndSync) container._saveAndSync();
            }
            nameEl.addEventListener('keydown', onNameKey);
            nameEl.addEventListener('blur', onNameBlur);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Public ───────────────────────────────────────────────────────────────

  function collectImages() {
    var results = [];
    document.querySelectorAll('#sm-layers .layer-group').forEach(function (group) {
      var nameEl = group.querySelector('.plr-name');
      var name = nameEl ? nameEl.textContent.trim() : 'REFERENCE';
      group.querySelectorAll('.clr').forEach(function (clr) {
        var main = clr.querySelector('.clr-main');
        if (!main || !main.classList.contains('img-a')) return;
        var img = main.querySelector('img');
        if (img && img.src && img.src.startsWith('data:')) {
          results.push({ url: img.src, name: name });
        }
      });
    });
    return results;
  }

  function reset() {
    var container = document.getElementById('sm-layers');
    if (container && window.DB) {
      var deletePromises = [];
      container.querySelectorAll('.clr[data-uuid]').forEach(function (clr) {
        deletePromises.push(window.DB.images.delete(clr.dataset.uuid));
      });
      Promise.all(deletePromises).then(function () {
        window.StudioModuleState = { layers: null };
        if (container && container._resetState) container._resetState();
      });
    } else {
      window.StudioModuleState = { layers: null };
      if (container && container._resetState) container._resetState();
    }
  }

  window.StudioModule = {
    _initialized: false,
    init:          init,
    collectImages: collectImages,
    reset:         reset
  };

}());
