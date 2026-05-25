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

    var payload = window.PromptBuilder.collect();
    var s = payload.settings || {};

    Promise.all([
      DB.settings.save(pid, {
        mode       : payload.mode    || 'FRAME',
        prompt     : payload.prompt  || '',
        aspectRatio: s.aspectRatio,
        variation  : s.variation,
        seed       : s.seed,
        seedLocked : s.seedLocked,
        frameCount : s.frameCount
      }),
      DB.moduleState.save(pid, serializeModuleState(window.ModuleState) || {}),
      DB.references.clear(pid).then(function () {
        var rs = window.refState;
        var all = rs.FRAME.map(function (ref) {
          var r = typeof ref === 'string' ? { url: ref, desc: null } : ref;
          return { mode: 'FRAME', uuid: r.uuid || null, src: r.uuid ? null : r.url, desc: r.desc || null };
        }).concat(rs.SCENE.map(function (ref) {
          var r = typeof ref === 'string' ? { url: ref, desc: null } : ref;
          return { mode: 'SCENE', uuid: r.uuid || null, src: r.uuid ? null : r.url, desc: r.desc || null };
        }));
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
      if (s.frameCount) {
        drop.querySelectorAll('.sd-fc-btn').forEach(function (btn) {
          btn.classList.toggle('active', parseInt(btn.dataset.value, 10) === s.frameCount);
        });
      }
    }
  }

  // ── Apply module state ────────────────────────────────────────────────────────

  // serializeHTML — strips base64 src from img elements inside .clr[data-uuid] containers,
  // replacing them with data-uuid on the img. Used before saving to DB to avoid storing
  // base64 inline in HTML blobs. Does NOT mutate the live DOM — works on a copy.
  function serializeHTML(html) {
    if (!html) return html;
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('.clr[data-uuid]').forEach(function (clr) {
      var uuid = clr.dataset.uuid;
      var img = clr.querySelector('img');
      if (img && img.src && img.src.startsWith('data:')) {
        img.src = '';
        img.setAttribute('data-uuid', uuid);
      }
    });
    return tmp.innerHTML;
  }

  // serializeModuleState — runs serializeHTML over every HTML string in a ModuleState object.
  // Returns a new object safe to write to DB. The original ms object is not mutated.
  function serializeModuleState(ms) {
    if (!ms) return null; // autosave caller uses || {} fallback for null
    var result = {};
    ['subject', 'stage', 'style'].forEach(function (key) {
      var data = ms[key];
      if (!data) { result[key] = null; return; }
      if (data.html) {
        result[key] = { html: serializeHTML(data.html) };
      } else if (data.slots) {
        result[key] = {
          selected: data.selected || 0,
          slots: data.slots.map(function (s) {
            return { on: s.on, html: serializeHTML(s.html || '') };
          })
        };
      } else {
        result[key] = data;
      }
    });
    return result;
  }

  // resolveModuleStateForExport — inverse of serializeHTML.
  // Resolves img[data-uuid] back to base64 src for self-contained export.
  function resolveModuleStateForExport(ms) {
    if (!ms) return Promise.resolve(ms);
    var keys = ['subject', 'stage', 'style'];
    return Promise.all(keys.map(function (key) {
      var data = ms[key];
      if (!data) return Promise.resolve([key, null]);
      if (data.html) {
        return restoreHTML(data.html).then(function (html) { return [key, { html: html }]; });
      }
      if (data.slots) {
        return Promise.all(data.slots.map(function (s) {
          return restoreHTML(s.html || '').then(function (html) { return { on: s.on, html: html }; });
        })).then(function (slots) {
          return [key, { selected: data.selected || 0, slots: slots }];
        });
      }
      return Promise.resolve([key, data]);
    })).then(function (pairs) {
      var result = {};
      pairs.forEach(function (p) { result[p[0]] = p[1]; });
      return result;
    });
  }

  // resolveRefsForExport — resolves UUID refs back to base64 data URLs for self-contained export.
  function resolveRefsForExport(refList) {
    return Promise.all((refList || []).map(function (ref) {
      var r = typeof ref === 'string' ? { url: ref, desc: null } : ref;
      if (r.uuid && window.DB) {
        return window.DB.images.get(r.uuid).then(function (rec) {
          return { url: rec ? rec.dataUrl : r.url || '', desc: r.desc || null };
        }).catch(function () {
          return { url: r.url || '', desc: r.desc || null };
        });
      }
      return Promise.resolve({ url: r.url || '', desc: r.desc || null });
    }));
  }

  // resolveGalleryForExport — resolves UUID imgUrls in gallery cells to base64 for export.
  // Also strips internal fields (_dbId, _imgUuid) that are meaningless outside this DB.
  function resolveGalleryForExport(cells) {
    return Promise.all((cells || []).map(function (cell) {
      var copy = Object.assign({}, cell);
      delete copy._dbId;
      delete copy._imgUuid;
      if (copy.imgUrl && !copy.imgUrl.startsWith('data:') && window.DB) {
        return window.DB.images.get(copy.imgUrl).then(function (rec) {
          copy.imgUrl = rec ? rec.dataUrl : '';
          return copy;
        }).catch(function () {
          copy.imgUrl = '';
          return copy;
        });
      }
      return Promise.resolve(copy);
    }));
  }

  function restoreHTML(html) {
    if (!html) return Promise.resolve(html);
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var imgs = Array.from(tmp.querySelectorAll('img[data-uuid]'));
    if (!imgs.length) return Promise.resolve(html);
    return Promise.all(imgs.map(function (img) {
      var uuid = img.dataset.uuid;
      return DB.images.get(uuid).then(function (record) {
        if (record && record.dataUrl) {
          img.src = record.dataUrl;
          img.removeAttribute('data-uuid');
        }
      }).catch(function () {});
    })).then(function () { return tmp.innerHTML; });
  }

  function restoreModuleState(moduleState) {
    window.ModuleState = { subject: null, stage: null, style: null };
    if (!moduleState) { window.applyModuleState(); return; }

    Promise.all(['subject', 'stage', 'style'].map(function (key) {
      var data = moduleState[key];
      if (!data) return Promise.resolve();
      if (data.html) {
        return restoreHTML(data.html).then(function (html) {
          window.ModuleState[key] = { html: html };
        });
      }
      if (data.slots) {
        return Promise.all(data.slots.map(function (s) {
          return restoreHTML(s.html || '').then(function (html) {
            return { on: s.on, html: html };
          });
        })).then(function (slots) {
          window.ModuleState[key] = { selected: data.selected || 0, slots: slots };
        });
      }
      return Promise.resolve();
    })).then(function () {
      window.applyModuleState();
    });
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
      restoreModuleState(moduleState);

      function resolveRef(r) {
        if (r.uuid && window.DB) {
          return window.DB.images.get(r.uuid).then(function (rec) {
            return { url: rec ? rec.dataUrl : '', desc: r.desc || null, uuid: r.uuid };
          }).catch(function () {
            return { url: '', desc: r.desc || null, uuid: r.uuid };
          });
        }
        return Promise.resolve({ url: r.src || '', desc: r.desc || null });
      }

      var frameRefs = refs.filter(function (r) { return r.mode === 'FRAME'; });
      var sceneRefs = refs.filter(function (r) { return r.mode === 'SCENE'; });

      Promise.all(frameRefs.map(resolveRef)).then(function (resolved) {
        window.refState.FRAME = resolved.filter(function (r) { return r.url; });
        return Promise.all(sceneRefs.map(resolveRef));
      }).then(function (resolved) {
        window.refState.SCENE = resolved.filter(function (r) { return r.url; });
        window.renderChips();
      });

      window.Gallery.clearGenerated();
      var orderedItems = galleryItems.slice().reverse();
      Promise.all(orderedItems.map(function (item) {
        item._dbId = item.id;
        if (item.imgUrl && !item.imgUrl.startsWith('data:')) {
          item._imgUuid = item.imgUrl;
          return window.DB.images.get(item.imgUrl).then(function (rec) {
            item.imgUrl = rec ? rec.dataUrl : '';
            return item;
          }).catch(function () {
            item.imgUrl = '';
            return item;
          });
        }
        return Promise.resolve(item);
      })).then(function (resolvedItems) {
        resolvedItems.forEach(function (item) {
          if (item.imgUrl) window.Gallery.addGenerated(item);
        });
      });

      if (window.clearSeqSlots) window.clearSeqSlots();
      if (window.addSeqSlot) seqItems.forEach(function (slot) { window.addSeqSlot(slot); });

    }).catch(function (e) {
      console.warn('[Workspace] loadProject failed:', e);
    });
  }

  // ── Gallery hook — save each new image to DB on generation ───────────────────

  function saveGalleryCell(cell) {
    function doSave(pid) {
      var imgUuid = crypto.randomUUID();
      window.DB.images.put(imgUuid, cell.imgUrl, pid).then(function () {
        cell._imgUuid = imgUuid;
        DB.gallery.add(pid, {
          imgUrl         : imgUuid,
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
          // Keep cell.imgUrl as the resolved base64 in memory for this session
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
      });
    }
    if (window.activeProjectId) {
      doSave(window.activeProjectId);
    } else {
      DB.projects.create({ name: 'Project' }).then(function (id) {
        window.activeProjectId = id;
        doSave(id);
        autosave();
      });
    }
  }

  function hookGallery() {
    var _origResolve = window.Gallery.resolveLoading.bind(window.Gallery);
    window.Gallery.resolveLoading = function (loadingId, cell) {
      _origResolve(loadingId, cell);
      saveGalleryCell(cell);
    };

    var _origAdd = window.Gallery.addGenerated.bind(window.Gallery);
    window.Gallery.addGenerated = function (cell) {
      _origAdd(cell);
      if (!cell._dbId) {
        saveGalleryCell(cell);
      }
    };
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    DB.ready.then(function () {
      hookGallery();
      return DB.images.runOrphanCleanup();
    }).then(function () {
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
    var payload = window.PromptBuilder.collect();
    var rs = window.refState;

    Promise.all([
      resolveModuleStateForExport(window.ModuleState),
      resolveRefsForExport(rs.FRAME || []),
      resolveRefsForExport(rs.SCENE || []),
      resolveGalleryForExport(window.Gallery.getGeneratedCells())
    ]).then(function (results) {
      var resolvedModuleState = results[0];
      var resolvedFrame       = results[1];
      var resolvedScene       = results[2];
      var resolvedGallery     = results[3];

      var snapshot = {
        version    : 1,
        savedAt    : new Date().toISOString(),
        mode       : payload.mode    || 'FRAME',
        prompt     : payload.prompt  || '',
        settings   : payload.settings || {},
        gallery    : resolvedGallery,
        moduleState: resolvedModuleState,
        refs       : { FRAME: resolvedFrame, SCENE: resolvedScene },
        sequence   : window.getSeqSlots ? window.getSeqSlots() : []
      };

      var blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href = url; a.download = name + '.cafe';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }).catch(function (e) {
      console.error('[Workspace] export failed:', e);
      showSaveIndicator(false);
    });
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

          if (snap.gallery && snap.gallery.length) {
            window.Gallery.clearGenerated();
            snap.gallery.slice().reverse().forEach(function (cell) { window.Gallery.addGenerated(cell); });
          }
          applySettings(Object.assign({ mode: snap.mode, prompt: snap.prompt }, snap.settings));
          if (snap.moduleState) restoreModuleState(snap.moduleState);
          if (snap.refs) {
            window.refState.FRAME = (snap.refs.FRAME || []).map(function (ref) { return typeof ref === 'string' ? { url: ref, desc: null } : { url: ref.url, desc: ref.desc || null }; });
            window.refState.SCENE = (snap.refs.SCENE || []).map(function (ref) { return typeof ref === 'string' ? { url: ref, desc: null } : { url: ref.url, desc: ref.desc || null }; });
            window.renderChips();
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
