// workspace.js
// IndexedDB-backed workspace. Replaces localStorage autosave entirely.
// Depends on: storage.js (window.DB), prompt-builder.js, and Gallery/refState/ModuleState globals.

window.Workspace = (function () {

  var _saveTimer = null;

  // ── Save indicator ────────────────────────────────────────────────────────────

  var _indicatorTimer = null;
  function showSaveIndicator(success) {
    var el = document.getElementById('save-indicator');
    if (!el) return;
    if (_indicatorTimer) clearTimeout(_indicatorTimer);
    el.textContent = success ? 'SAVED' : 'SAVE FAILED';
    el.dataset.state = success ? 'saved' : 'failed';
    el.classList.add('visible');
    _indicatorTimer = setTimeout(function () { el.classList.remove('visible'); }, 1800);
  }

  // ── Autosave ──────────────────────────────────────────────────────────────────

  function autosaveDebounced() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(autosave, 800);
  }

  function autosave() {
    var pid = window.activeProjectId;
    if (!pid) return;

    var payload = window.PromptBuilder ? window.PromptBuilder.collect() : {};
    var s = payload.settings || {};

    Promise.all([
      DB.settings.save(pid, {
        mode       : payload.mode    || 'FRAME',
        prompt     : payload.prompt  || '',
        aspectRatio: s.aspectRatio,
        variation  : s.variation,
        seed       : s.seed,
        seedLocked : s.seedLocked,
        outputType : s.outputType,
        frameCount : s.frameCount,
        visionCache: window.refVisionCache || {}
      }),
      DB.moduleState.save(pid, window.ModuleState || {}),
      DB.references.clear(pid).then(function () {
        var rs = window.refState || { FRAME: [], SCENE: [] };
        var all = rs.FRAME.map(function (src) { return { mode: 'FRAME', src: src }; })
                    .concat(rs.SCENE.map(function (src) { return { mode: 'SCENE', src: src }; }));
        return Promise.all(all.map(function (r) { return DB.references.add(pid, r); }));
      }),
      DB.sequence.save(pid, window.getSeqSlots ? window.getSeqSlots() : [])
    ])
    .then(function () { showSaveIndicator(true); })
    .catch(function (e) {
      console.warn('[Workspace] autosave failed:', e);
      showSaveIndicator(false);
    });
  }

  // ── Apply settings to UI ──────────────────────────────────────────────────────

  function applySettings(s) {
    s = s || {};

    var mode = s.mode || 'FRAME';
    var sw     = document.getElementById('promptSwitch');
    var bar    = document.getElementById('promptBar');
    var genBtn = document.getElementById('generateBtn');
    var text   = document.getElementById('promptText');
    if (sw && bar) {
      sw.dataset.state  = mode;
      bar.dataset.state = mode;
      if (genBtn) genBtn.textContent = mode;
      if (text) text.dataset.placeholder = mode === 'SCENE' ? 'Are we making a movie?' : 'What are we making today?';
    }

    var pt = document.getElementById('promptText');
    if (pt) {
      pt.textContent = s.prompt || '';
      pt.classList.toggle('has-placeholder', !s.prompt);
    }

    var drop = document.getElementById('settingsDropdown');
    if (drop) {
      if (s.aspectRatio) {
        drop.querySelectorAll('.sd-ratio-btn').forEach(function (btn) {
          btn.classList.toggle('active', btn.textContent.trim() === s.aspectRatio);
        });
      }
      if (s.variation) {
        drop.querySelectorAll('.sd-var-btn').forEach(function (btn) {
          btn.classList.toggle('active', parseInt(btn.dataset.value, 10) === s.variation);
        });
      }
      if (s.seed) {
        var seedInput = document.getElementById('seedNum');
        if (seedInput) seedInput.value = s.seed;
      }
      if (s.seedLocked !== undefined) {
        drop.dataset.seed = s.seedLocked ? 'locked' : 'unlocked';
        var seedNotice = document.getElementById('seedNotice');
        if (seedNotice) seedNotice.textContent = s.seedLocked
          ? '*SEED IS LOCKED TO CREATE SIMILAR OUTPUTS'
          : '*SEED IS UNLOCKED TO GIVE MORE VARIETY';
      }
      if (s.outputType) {
        drop.dataset.activeOutput = s.outputType;
        drop.querySelectorAll('.sd-output-btn').forEach(function (btn) {
          btn.classList.toggle('active', btn.dataset.value === s.outputType);
        });
        var outEl = document.getElementById('outputType');
        if (outEl) outEl.textContent = s.outputType === 'PRECISE' ? 'CONTROLLED' : 'REMIX';
      }
      if (s.frameCount) {
        drop.querySelectorAll('.sd-fc-btn').forEach(function (btn) {
          btn.classList.toggle('active', parseInt(btn.dataset.value, 10) === s.frameCount);
        });
      }
    }
  }

  // ── Apply module state ────────────────────────────────────────────────────────

  function restoreModuleState(moduleState) {
    if (!window.ModuleState) return;
    window.ModuleState = { subject: null, stage: null, style: null };
    if (moduleState) {
      ['subject', 'stage', 'style'].forEach(function (key) {
        if (moduleState[key]) window.ModuleState[key] = moduleState[key];
      });
    }
    if (window.applyModuleState) window.applyModuleState();
  }

  // ── Load project ──────────────────────────────────────────────────────────────

  function loadProject(id, skipSave) {
    if (!skipSave) autosave();
    window.activeProjectId = id;

    Promise.all([
      DB.settings.get(id),
      DB.moduleState.get(id),
      DB.references.getAll(id),
      DB.gallery.getAll(id),
      DB.sequence.getAll(id)
    ]).then(function (results) {
      var settings     = results[0];
      var moduleState  = results[1];
      var refs         = results[2];
      var galleryItems = results[3];
      var seqItems     = results[4];

      applySettings(settings);
      window.refVisionCache = (settings && settings.visionCache) || {};

      restoreModuleState(moduleState);

      if (window.refState) {
        window.refState.FRAME = refs.filter(function (r) { return r.mode === 'FRAME'; }).map(function (r) { return r.src; });
        window.refState.SCENE = refs.filter(function (r) { return r.mode === 'SCENE'; }).map(function (r) { return r.src; });
        if (window.renderChips) window.renderChips();
      }

      if (window.Gallery) {
        window.Gallery.clearGenerated();
        galleryItems.slice().reverse().forEach(function (item) {
          window.Gallery.addGenerated(item);
        });
      }

      if (window.clearSeqSlots) window.clearSeqSlots();
      if (window.addSeqSlot) seqItems.forEach(function (slot) { window.addSeqSlot(slot); });

    }).catch(function (e) {
      console.warn('[Workspace] loadProject failed:', e);
    });
  }

  // ── Gallery hook — save each new image to DB on generation ───────────────────

  function hookGallery() {
    if (!window.Gallery) return;
    var _orig = window.Gallery.resolveLoading.bind(window.Gallery);
    window.Gallery.resolveLoading = function (loadingId, cell) {
      _orig(loadingId, cell);

      function saveToProject(pid) {
        DB.gallery.add(pid, {
          imgUrl         : cell.imgUrl,
          ratio          : cell.ratio,
          prompt         : cell.prompt,
          manifest       : cell.manifest || null,
          date           : cell.date,
          dims           : cell.dims,
          model          : cell.model,
          cost           : cell.cost,
          generated      : true,
          moduleSnapshot : cell.moduleSnapshot || null,
          usedImages     : cell.usedImages     || [],
        }).then(function (dbId) {
          cell._dbId = dbId;
          DB.projects.get(pid).then(function (proj) {
            if (proj && !proj.thumbnail) {
              var updates = { thumbnail: cell.imgUrl };
              if (cell.prompt) {
                var words = cell.prompt.trim().split(/\s+/).slice(0, 5).join(' ');
                updates.name = words.length > 36 ? words.slice(0, 36) : words;
              }
              DB.projects.update(pid, updates);
            }
          });
        });
      }

      if (window.activeProjectId) {
        saveToProject(window.activeProjectId);
      } else {
        DB.projects.create({ name: 'Project' }).then(function (id) {
          window.activeProjectId = id;
          saveToProject(id);
          autosave();
        });
      }
    };
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    DB.ready.then(function () {
      hookGallery();
      return DB.projects.getAll();
    }).then(function (projects) {
      if (!projects.length) return;
      projects.sort(function (a, b) { return b.date_modified > a.date_modified ? 1 : -1; });
      loadProject(projects[0].id, true);
    }).catch(function (e) {
      console.warn('[Workspace] init failed:', e);
    });

    try { localStorage.removeItem('cafehtml-workspace'); } catch (e) {}
  });

  // ── Export / Import (.cafe) ───────────────────────────────────────────────────

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  function exportCafe() {
    var name = 'project-' + todayStr();
    if (window.activeProjectId) {
      DB.projects.get(window.activeProjectId).then(function (proj) {
        _doExport(proj && proj.name ? proj.name : name);
      });
      return;
    }
    _doExport(name);
  }

  function _doExport(name) {
    var payload = window.PromptBuilder ? window.PromptBuilder.collect() : {};
    var snapshot = {
      version    : 1,
      savedAt    : new Date().toISOString(),
      mode       : payload.mode    || 'FRAME',
      prompt     : payload.prompt  || '',
      settings   : payload.settings || {},
      gallery    : window.Gallery  ? window.Gallery.getGeneratedCells() : [],
      moduleState: window.ModuleState || null,
      refs       : window.refState ? { FRAME: window.refState.FRAME.slice(), SCENE: window.refState.SCENE.slice() } : null,
      sequence   : window.getSeqSlots ? window.getSeqSlots() : []
      // visionCache intentionally excluded — URL-keyed descriptions don't survive environment changes
    };
    var blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = name + '.cafe';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function importCafe() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.cafe,.json'; input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) { document.body.removeChild(input); return; }
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var snap = JSON.parse(e.target.result);
          if (!snap || snap.version !== 1) throw new Error('Invalid .cafe file');

          if (snap.gallery && snap.gallery.length && window.Gallery) {
            window.Gallery.clearGenerated();
            snap.gallery.slice().reverse().forEach(function (cell) { window.Gallery.addGenerated(cell); });
          }
          applySettings(Object.assign({ mode: snap.mode, prompt: snap.prompt }, snap.settings));
          if (snap.moduleState) restoreModuleState(snap.moduleState);
          if (snap.refs && window.refState) {
            window.refState.FRAME = snap.refs.FRAME || [];
            window.refState.SCENE = snap.refs.SCENE || [];
            if (window.renderChips) window.renderChips();
          }
          if (snap.sequence && snap.sequence.length && window.addSeqSlot) {
            if (window.clearSeqSlots) window.clearSeqSlots();
            snap.sequence.forEach(function (slot) { window.addSeqSlot(slot); });
          }
        } catch (err) {
          console.error('[Workspace] import failed:', err);
        }
        document.body.removeChild(input);
      };
      reader.readAsText(file);
    });
    input.click();
  }

  return {
    autosave         : autosave,
    autosaveDebounced: autosaveDebounced,
    exportCafe       : exportCafe,
    importCafe       : importCafe,
    loadProject      : loadProject,
    applyModuleState : restoreModuleState
  };

})();
