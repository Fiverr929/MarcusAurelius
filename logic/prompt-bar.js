// prompt-bar.js
(function () {
  var bar = document.getElementById('promptBar');
  var sw = document.getElementById('promptSwitch');
  var genBtn = document.getElementById('generateBtn');
  var text = document.getElementById('promptText');
  var settBtn = document.getElementById('settingsBtn');
  var drop = document.getElementById('settingsDropdown');

  document.body.dataset.state = bar.dataset.state;

  /* ── Prompt Switch ── */
  sw.addEventListener('click', function () {
    var next = this.dataset.state === 'FRAME' ? 'SCENE' : 'FRAME';
    this.dataset.state = next;
    bar.dataset.state = next;
    document.body.dataset.state = next;
    genBtn.textContent = next;
    text.dataset.placeholder = next === 'SCENE' ? 'Are we making a movie?' : 'What are we making today?';
    updatePlaceholder();

    drop.dataset.open = 'false';
    settBtn.classList.remove('open');

    renderChips();
  });

  /* ── Prompt Field ── */
  function updatePlaceholder() {
    text.classList.toggle('has-placeholder', text.textContent.trim() === '');
  }

  function scrollCaretIntoView() {
    requestAnimationFrame(function () {
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      var parentRect = text.getBoundingClientRect();
      if (rect.right > parentRect.right) {
        text.scrollLeft += rect.right - parentRect.right + 12;
      } else if (rect.left < parentRect.left) {
        text.scrollLeft -= parentRect.left - rect.left + 12;
      }
    });
  }

  function moveCursorToEnd() {
    var range = document.createRange();
    range.selectNodeContents(text);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    text.scrollLeft = text.scrollWidth;
  }

  text.addEventListener('focus', function () { text.classList.remove('has-placeholder'); });
  text.addEventListener('blur', updatePlaceholder);
  text.addEventListener('input', function () { updatePlaceholder(); scrollCaretIntoView(); });
  text.addEventListener('keyup', scrollCaretIntoView);
  text.addEventListener('click', scrollCaretIntoView);
  updatePlaceholder();

  var promptHistory = [], historyIndex = -1;

  text.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      genBtn.click();
    } else if (e.key === 'Escape') {
      text.textContent = '';
      text.scrollLeft = 0;
      updatePlaceholder();
      text.blur();
    } else if (e.key === 'ArrowUp' && text.textContent.trim() === '') {
      e.preventDefault();
      if (historyIndex < promptHistory.length - 1) {
        historyIndex++;
        text.textContent = promptHistory[historyIndex];
        text.classList.remove('has-placeholder');
        moveCursorToEnd();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        text.textContent = promptHistory[historyIndex];
        text.classList.remove('has-placeholder');
        moveCursorToEnd();
      } else {
        historyIndex = -1;
        text.textContent = '';
        text.scrollLeft = 0;
        updatePlaceholder();
      }
    }
  });

  text.addEventListener('paste', function (e) {
    e.preventDefault();
    var plain = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, plain);
    scrollCaretIntoView();
  });

  /* ── Generate Button ── */
  genBtn.addEventListener('click', function () {
    var prompt = text.textContent.trim();
    if (prompt && promptHistory[0] !== prompt) { promptHistory.unshift(prompt); }
    historyIndex = -1;
    if (window.CafeAPI) window.CafeAPI.generate();
  });

  /* ── Settings Gear Toggle (works in both FRAME and SCENE) ── */
  settBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var opening = drop.dataset.open !== 'true';
    drop.dataset.open = opening ? 'true' : 'false';
    this.classList.toggle('open', opening);
  });

  document.addEventListener('click', function (e) {
    if (!drop.contains(e.target) && e.target !== settBtn) {
      drop.dataset.open = 'false';
      settBtn.classList.remove('open');
    }
  });

  /* ── Aspect Ratio ── */
  drop.querySelectorAll('.sd-ratio-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      drop.querySelectorAll('.sd-ratio-btn').forEach(function (x) { x.classList.remove('active'); });
      this.classList.add('active');
    });
  });

  /* ── Variation ── */
  drop.querySelectorAll('.sd-var-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      drop.querySelectorAll('.sd-var-btn').forEach(function (x) { x.classList.remove('active'); });
      drop.querySelectorAll('.sd-frame-only .sd-custom-lbl, .sd-frame-only .sd-entry-lbl').forEach(function (x) { x.classList.remove('active'); });
      this.classList.add('active');
    });
  });

  /* ── Frame Count ── */
  drop.querySelectorAll('.sd-fc-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      drop.querySelectorAll('.sd-fc-btn').forEach(function (x) { x.classList.remove('active'); });
      drop.querySelectorAll('.sd-scene-only .sd-custom-lbl, .sd-scene-only .sd-entry-lbl').forEach(function (x) { x.classList.remove('active'); });
      this.classList.add('active');
    });
  });

  /* ── Custom Entry (Shared) ── */
  drop.querySelectorAll('.sd-custom-lbl').forEach(function (b) {
    b.addEventListener('click', function () {
      drop.querySelectorAll('.sd-var-btn, .sd-fc-btn').forEach(function (x) { x.classList.remove('active'); });
      var group = this.closest('.sd-custom-group');
      group.querySelectorAll('.sd-custom-lbl, .sd-entry-lbl').forEach(function (x) { x.classList.add('active'); });
      var entry = group.querySelector('.sd-entry-lbl');
      if (entry) { entry.removeAttribute('readonly'); entry.focus(); }
    });
  });

  /* ── Custom Variation Entry ── */
  var customEntry = document.getElementById('customEntry');
  customEntry.addEventListener('focus', function () {
    drop.querySelectorAll('.sd-var-btn').forEach(function (x) { x.classList.remove('active'); });
    drop.querySelectorAll('.sd-custom-lbl, .sd-entry-lbl').forEach(function (x) { x.classList.add('active'); });
  });
  customEntry.addEventListener('change', function () {
    var v = parseInt(this.value, 10);
    if (isNaN(v) || v < 3) this.value = 3;
    if (v > 4) this.value = 4;
  });
}());

// ── Reference Upload State ─────────────────────
window.refState = { FRAME: [], SCENE: [] };

function renderChips() {
  var mode = document.getElementById('promptBar').dataset.state;
  var refs = window.refState[mode];
  var row = document.getElementById('liveRefChips');
  var uploadBtn = document.getElementById('liveUpload');

  row.innerHTML = refs.map(function (ref, i) {
    var src = typeof ref === 'string' ? ref : ref.url;
    return '<div class="ref-chip ' + mode.toLowerCase() + '" data-index="' + i + '">' +
      '<div class="ref-chip-remove"></div>' +
      '<div class="ref-chip-thumb">' +
      '<img src="' + src + '" alt="">' +
      '<div class="ref-chip-overlay"></div>' +
      '<span class="ref-chip-label">R' + (i + 1) + '</span>' +
      '</div>' +
      '</div>';
  }).join('');

  row.style.display = refs.length ? 'flex' : 'none';

  if (refs.length >= 5) {
    uploadBtn.classList.add('disabled');
  } else {
    uploadBtn.classList.remove('disabled');
  }

  row.querySelectorAll('.ref-chip').forEach(function (chip) {
    chip.querySelector('.ref-chip-remove').addEventListener('click', function () {
      var idx = parseInt(chip.dataset.index, 10);
      var ref = window.refState[mode][idx];
      if (ref && ref.uuid && window.DB) window.DB.images.delete(ref.uuid);
      window.refState[mode].splice(idx, 1);
      renderChips();
      window.Workspace.autosave();
    });
  });
}
window.renderChips = renderChips;

document.getElementById('liveUpload').addEventListener('click', function () {
  var mode = document.getElementById('promptBar').dataset.state;
  if (window.refState[mode].length >= 5) return;
  document.getElementById('refFileInput').click();
});

document.getElementById('refFileInput').addEventListener('change', function (e) {
  var files = Array.from(e.target.files);
  if (!files.length) return;
  var mode = document.getElementById('promptBar').dataset.state;
  var remaining = 5 - window.refState[mode].length;
  files.slice(0, remaining).forEach(function (file) {
    var reader = new FileReader();
    reader.onload = function (evt) {
      if (window.refState[mode].length < 5) {
        var refUrl = evt.target.result;
        var uuid = crypto.randomUUID();
        var pid = window.activeProjectId;
        if (window.DB) window.DB.images.put(uuid, refUrl, pid)
          .catch(function (e) { console.error('[PromptBar] Failed to save ref image to DB:', e); });
        var chipIdx = window.refState[mode].length;
        window.refState[mode].push({ url: refUrl, desc: null, uuid: uuid });
        renderChips();
        window.Workspace.autosave();

        if (window.CafeSettings && window.CafeSettings.getScanTiming() === 'load') {
          var chipThumb = document.querySelector('#liveRefChips .ref-chip[data-index="' + chipIdx + '"] .ref-chip-thumb');
          if (chipThumb) chipThumb.classList.add('scanning');
          window.DescriptionRegistry.ensure(refUrl, { type: 'ref' })
            .then(function (desc) {
              window.refState[mode][chipIdx].desc = desc;
              if (chipThumb) chipThumb.classList.remove('scanning');
            })
            .catch(function () {
              if (chipThumb) chipThumb.classList.remove('scanning');
            });
        }
      }
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
});

// ── Title Bar Tabs ─────────────────────────────
document.querySelectorAll('.tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    var clicked = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.remove('active', 'inactive');
      t.classList.add(t.dataset.tab === clicked ? 'active' : 'inactive');
    });
  });
});

// ── Cafe Menu ──────────────────────────────────
var menuBtn = document.getElementById('menuBtn');
var cafeMenu = document.getElementById('cafeMenu');

menuBtn.addEventListener('click', function (e) {
  e.stopPropagation();
  cafeMenu.classList.toggle('open');
});

document.addEventListener('click', function () {
  cafeMenu.classList.remove('open');
});

cafeMenu.querySelectorAll('.menu-item').forEach(function (item) {
  item.addEventListener('click', function (e) {
    e.stopPropagation();
    cafeMenu.classList.remove('open');
    var label = item.textContent.trim();
    if (label === 'PROJECTS') window.ProjectsPanel.open();
    if (label === 'SETTING') window.CafeSettings.openModal();
  });
});

// ── PROJECTS PANEL ────────────────────────────────
window.ProjectsPanel = (function () {
  var modal, list, _ready = false;
  var THUMB = '<svg class="pm-thumb-icon" width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="18" height="18" rx="1" stroke="#e8e6e6" stroke-width="1.2"/><path d="M1 14l5-5 4 4 3-4 6 6" stroke="#e8e6e6" stroke-width="1.2" stroke-linejoin="round"/></svg>';

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function init() {
    if (_ready) return;
    modal = document.getElementById('projects-modal');
    list  = document.getElementById('pm-list');

    document.getElementById('pm-close').addEventListener('click', function () {
      modal.classList.remove('open');
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.classList.remove('open');
    });
    document.getElementById('pm-new').addEventListener('click', function () {
      DB.projects.getAll().then(function (projects) {
        return DB.projects.create({ name: 'Project ' + (projects.length + 1) });
      }).then(function (id) {
        window.Workspace.loadProject(id, true);
        modal.classList.remove('open');
        loadAndRender();
      }).catch(function (e) {
        console.error('[ProjectsPanel] Failed to create project:', e);
      });
    });
    document.getElementById('pm-export').addEventListener('click', function () {
      window.Workspace.exportCafe();
    });
    document.getElementById('pm-import').addEventListener('click', function () {
      window.Workspace.importCafe();
    });
    _ready = true;
  }

  function render(projects) {
    if (!projects.length) {
      list.innerHTML = '<div class="pm-empty">No saved projects</div>';
      return;
    }
    list.innerHTML = projects.map(function (p) {
      var isActive = p.id === window.activeProjectId;
      return '<div class="pm-item' + (isActive ? ' active' : '') + '" data-id="' + p.id + '">' +
        '<div class="pm-thumb">' + (p.thumbnail ? '<img src="' + p.thumbnail + '">' : THUMB) + '</div>' +
        '<div class="pm-info">' +
          '<div class="pm-name">' + escapeHTML(p.name) + '<span class="pm-ext">.cafe</span></div>' +
          '<div class="pm-meta">' + (p.date_modified || '').slice(0, 10) + '</div>' +
        '</div>' +
        '<button class="pm-delete" data-id="' + p.id + '">&#215;</button>' +
      '</div>';
    }).join('');

    list.querySelectorAll('.pm-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.classList.contains('pm-delete')) return;
        var id = parseInt(el.dataset.id);
        window.Workspace.loadProject(id);
        modal.classList.remove('open');
      });
    });

    list.querySelectorAll('.pm-delete').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idToDelete = parseInt(btn.dataset.id);
        DB.projects.delete(idToDelete).then(function() {
          if (idToDelete === window.activeProjectId) {
            DB.projects.getAll().then(function(projects) {
              if (projects.length) {
                projects.sort(function (a, b) { return a.date_modified < b.date_modified ? 1 : a.date_modified > b.date_modified ? -1 : 0; });
                window.Workspace.loadProject(projects[0].id, true);
              } else {
                window.Workspace.clearWorkspace();
              }
              loadAndRender();
            });
          } else {
            loadAndRender();
          }
        }).catch(function (e) {
          console.error('[ProjectsPanel] Failed to delete project:', e);
        });
      });
    });
  }

  function loadAndRender() {
    DB.projects.getAll().then(function (projects) {
      projects.sort(function (a, b) { return a.date_modified < b.date_modified ? 1 : a.date_modified > b.date_modified ? -1 : 0; });
      render(projects);
    });
  }

  function open() {
    init();
    modal.classList.add('open');
    loadAndRender();
  }

  return { open: open };
}());

// ── MOD STRIP COLLAPSE ────────────────────────────
document.querySelector('.mod-tab-module').addEventListener('click', function () {
  this.closest('.mod-panel-wrap').classList.toggle('collapsed');
});
