// storage.js
// IndexedDB abstraction for CafeHTML.
// Exposes window.DB — stores: projects, settings, moduleState, references, gallery, sequence.
// All methods return Promises. Must load before workspace.js.

window.DB = (function () {

  var DB_NAME    = 'cafehtml-db';
  var _db        = null;

  var S = {
    PROJECTS    : 'projects',
    SETTINGS    : 'settings',
    MODULE_STATE: 'module-state',
    REFERENCES  : 'references',
    GALLERY     : 'gallery',
    SEQUENCE    : 'sequence',
    IMAGES      : 'images',
    DESCRIPTIONS: 'descriptions',
    STUDIO_STATE: 'studio-state'
  };

  // ── Open ─────────────────────────────────────────────────────────────────────

  var ready = new Promise(function (resolve, reject) {
    var reqCurrent = indexedDB.open(DB_NAME);
    reqCurrent.onsuccess = function (e) {
      var db = e.target.result;
      var currentVersion = db.version || 1;
      var needsUpgrade = !db.objectStoreNames.contains(S.PROJECTS) ||
                         !db.objectStoreNames.contains(S.SETTINGS) ||
                         !db.objectStoreNames.contains(S.MODULE_STATE) ||
                         !db.objectStoreNames.contains(S.STUDIO_STATE) ||
                         !db.objectStoreNames.contains(S.REFERENCES) ||
                         !db.objectStoreNames.contains(S.GALLERY) ||
                         !db.objectStoreNames.contains(S.SEQUENCE) ||
                         !db.objectStoreNames.contains(S.IMAGES) ||
                         !db.objectStoreNames.contains(S.DESCRIPTIONS);
      db.close();

      var targetVersion = needsUpgrade ? currentVersion + 1 : currentVersion;

      var req = indexedDB.open(DB_NAME, targetVersion);
      req.onupgradeneeded = function (e2) {
        var db2 = e2.target.result;

        if (!db2.objectStoreNames.contains(S.PROJECTS)) {
          var ps = db2.createObjectStore(S.PROJECTS, { keyPath: 'id', autoIncrement: true });
          ps.createIndex('by_modified', 'date_modified');
        }

        if (!db2.objectStoreNames.contains(S.SETTINGS)) {
          db2.createObjectStore(S.SETTINGS, { keyPath: 'project_id' });
        }

        if (!db2.objectStoreNames.contains(S.MODULE_STATE)) {
          db2.createObjectStore(S.MODULE_STATE, { keyPath: 'project_id' });
        }

        if (!db2.objectStoreNames.contains(S.STUDIO_STATE)) {
          db2.createObjectStore(S.STUDIO_STATE, { keyPath: 'project_id' });
        }

        if (!db2.objectStoreNames.contains(S.REFERENCES)) {
          var rs = db2.createObjectStore(S.REFERENCES, { keyPath: 'id', autoIncrement: true });
          rs.createIndex('by_project', 'project_id');
        }

        if (!db2.objectStoreNames.contains(S.GALLERY)) {
          var gs = db2.createObjectStore(S.GALLERY, { keyPath: 'id', autoIncrement: true });
          gs.createIndex('by_project', 'project_id');
        }

        if (!db2.objectStoreNames.contains(S.SEQUENCE)) {
          var sq = db2.createObjectStore(S.SEQUENCE, { keyPath: 'id', autoIncrement: true });
          sq.createIndex('by_project', 'project_id');
          sq.createIndex('by_order',   'order');
        }

        if (!db2.objectStoreNames.contains(S.IMAGES)) {
          db2.createObjectStore(S.IMAGES, { keyPath: 'uuid' });
        }
        if (!db2.objectStoreNames.contains(S.DESCRIPTIONS)) {
          db2.createObjectStore(S.DESCRIPTIONS, { keyPath: 'uuid' });
        }
      };

      req.onsuccess = function (e2) {
        _db = e2.target.result;
        resolve(_db);
      };

      req.onerror = function (e2) {
        console.error('[DB] open target failed:', e2.target.error);
        reject(e2.target.error);
      };
    };

    reqCurrent.onerror = function (e) {
      console.error('[DB] open current failed:', e.target.error);
      reject(e.target.error);
    };
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function tx(storeNames, mode) {
    if (!Array.isArray(storeNames)) storeNames = [storeNames];
    return _db.transaction(storeNames, mode || 'readonly');
  }

  function wrap(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror  = function () { reject(request.error); };
    });
  }

  function getAllByIndex(storeName, value) {
    return ready.then(function () {
      var store = tx(storeName).objectStore(storeName);
      return wrap(store.index('by_project').getAll(value));
    });
  }

  function deleteByIndex(t, storeName, projectId) {
    return new Promise(function (resolve, reject) {
      var index = t.objectStore(storeName).index('by_project');
      var req   = index.openCursor(IDBKeyRange.only(projectId));
      req.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) { cursor.delete(); cursor.continue(); } else { resolve(); }
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  // ── Projects ──────────────────────────────────────────────────────────────────

  var projects = {

    getAll: function () {
      return ready.then(function () {
        return wrap(tx(S.PROJECTS).objectStore(S.PROJECTS).getAll());
      });
    },

    get: function (id) {
      return ready.then(function () {
        return wrap(tx(S.PROJECTS).objectStore(S.PROJECTS).get(id));
      });
    },

    create: function (data) {
      return ready.then(function () {
        var now    = new Date().toISOString();
        var record = Object.assign({ mode: 'FRAME', thumbnail: null }, data, {
          date_created : now,
          date_modified: now
        });
        return wrap(tx(S.PROJECTS, 'readwrite').objectStore(S.PROJECTS).add(record));
      });
    },

    update: function (id, data) {
      return ready.then(function () {
        var store = tx(S.PROJECTS, 'readwrite').objectStore(S.PROJECTS);
        return wrap(store.get(id)).then(function (existing) {
          if (!existing) throw new Error('[DB] project not found: ' + id);
          return wrap(store.put(Object.assign({}, existing, data, {
            id           : id,
            date_modified: new Date().toISOString()
          })));
        });
      });
    },

    // Cascade — removes all data across every store for this project.
    delete: function (id) {
      return ready.then(function () {
        var allStores = [S.PROJECTS, S.SETTINGS, S.MODULE_STATE, S.STUDIO_STATE, S.REFERENCES, S.GALLERY, S.SEQUENCE];
        var t = tx(allStores, 'readwrite');
        return Promise.all([
          wrap(t.objectStore(S.PROJECTS).delete(id)),
          wrap(t.objectStore(S.SETTINGS).delete(id)),
          wrap(t.objectStore(S.MODULE_STATE).delete(id)),
          wrap(t.objectStore(S.STUDIO_STATE).delete(id)),
          deleteByIndex(t, S.REFERENCES, id),
          deleteByIndex(t, S.GALLERY,    id),
          deleteByIndex(t, S.SEQUENCE,   id),
          images.deleteByProject(id),
          descriptions.deleteByProject(id)
        ]);
      });
    }
  };

  // ── Settings ──────────────────────────────────────────────────────────────────

  var settings = {

    get: function (projectId) {
      return ready.then(function () {
        return wrap(tx(S.SETTINGS).objectStore(S.SETTINGS).get(projectId));
      });
    },

    save: function (projectId, data) {
      return ready.then(function () {
        return wrap(
          tx(S.SETTINGS, 'readwrite').objectStore(S.SETTINGS)
            .put(Object.assign({}, data, { project_id: projectId }))
        );
      });
    }
  };

  // ── Module State ──────────────────────────────────────────────────────────────

  var moduleState = {

    get: function (projectId) {
      return ready.then(function () {
        return wrap(tx(S.MODULE_STATE).objectStore(S.MODULE_STATE).get(projectId));
      });
    },

    save: function (projectId, data) {
      return ready.then(function () {
        return wrap(
          tx(S.MODULE_STATE, 'readwrite').objectStore(S.MODULE_STATE)
            .put(Object.assign({}, data, { project_id: projectId }))
        );
      });
    }
  };

  // ── Studio State ──────────────────────────────────────────────────────────────

  var studioState = {
    get: function (projectId) {
      return ready.then(function () {
        return wrap(tx(S.STUDIO_STATE).objectStore(S.STUDIO_STATE).get(projectId));
      });
    },

    save: function (projectId, data) {
      return ready.then(function () {
        return wrap(
          tx(S.STUDIO_STATE, 'readwrite').objectStore(S.STUDIO_STATE)
            .put(Object.assign({}, data, { project_id: projectId }))
        );
      });
    }
  };

  // ── References ────────────────────────────────────────────────────────────────

  var references = {

    getAll: function (projectId) {
      return getAllByIndex(S.REFERENCES, projectId);
    },

    add: function (projectId, data) {
      return ready.then(function () {
        var record = Object.assign({}, data, {
          project_id: projectId,
          added_at  : new Date().toISOString()
        });
        return wrap(tx(S.REFERENCES, 'readwrite').objectStore(S.REFERENCES).add(record));
      });
    },

    delete: function (id) {
      return ready.then(function () {
        return wrap(tx(S.REFERENCES, 'readwrite').objectStore(S.REFERENCES).delete(id));
      });
    },

    clear: function (projectId) {
      return getAllByIndex(S.REFERENCES, projectId).then(function (items) {
        return ready.then(function () {
          var store = tx(S.REFERENCES, 'readwrite').objectStore(S.REFERENCES);
          return Promise.all(items.map(function (item) { return wrap(store.delete(item.id)); }));
        });
      });
    },

    // Atomic clear-then-add in a single transaction — prevents race-condition duplicates.
    replace: function (projectId, refs) {
      return ready.then(function () {
        var t     = tx(S.REFERENCES, 'readwrite');
        var store = t.objectStore(S.REFERENCES);
        return new Promise(function (resolve, reject) {
          var req = store.index('by_project').openCursor(IDBKeyRange.only(projectId));
          req.onsuccess = function (e) {
            var cursor = e.target.result;
            if (cursor) { cursor.delete(); cursor.continue(); return; }
            var now = new Date().toISOString();
            refs.forEach(function (r) {
              store.add(Object.assign({}, r, { project_id: projectId, added_at: now }));
            });
            resolve();
          };
          req.onerror = function () { reject(req.error); };
        });
      });
    }
  };

  // ── Gallery ───────────────────────────────────────────────────────────────────

  var gallery = {

    getAll: function (projectId) {
      return getAllByIndex(S.GALLERY, projectId);
    },

    add: function (projectId, data) {
      return ready.then(function () {
        var record = Object.assign({}, data, {
          project_id: projectId,
          type      : 'image',
          created_at: new Date().toISOString()
        });
        return wrap(tx(S.GALLERY, 'readwrite').objectStore(S.GALLERY).add(record));
      });
    },

    update: function (id, data) {
      return ready.then(function () {
        var store = tx(S.GALLERY, 'readwrite').objectStore(S.GALLERY);
        return wrap(store.get(id)).then(function (existing) {
          if (!existing) throw new Error('[DB] gallery item not found: ' + id);
          return wrap(store.put(Object.assign({}, existing, data, { id: id })));
        });
      });
    },

    delete: function (id) {
      return ready.then(function () {
        return wrap(tx(S.GALLERY, 'readwrite').objectStore(S.GALLERY).delete(id));
      });
    },

    clear: function (projectId) {
      return getAllByIndex(S.GALLERY, projectId).then(function (items) {
        return ready.then(function () {
          var store = tx(S.GALLERY, 'readwrite').objectStore(S.GALLERY);
          return Promise.all(items.map(function (item) { return wrap(store.delete(item.id)); }));
        });
      });
    }
  };

  // ── Sequence ──────────────────────────────────────────────────────────────────

  var sequence = {

    getAll: function (projectId) {
      return getAllByIndex(S.SEQUENCE, projectId).then(function (items) {
        return items.sort(function (a, b) { return a.order - b.order; });
      });
    },

    // Replaces all slots for the project atomically.
    save: function (projectId, slots) {
      return ready.then(function () {
        var t     = tx(S.SEQUENCE, 'readwrite');
        var store = t.objectStore(S.SEQUENCE);
        return new Promise(function (resolve, reject) {
          var req = store.index('by_project').openCursor(IDBKeyRange.only(projectId));
          req.onsuccess = function (e) {
            var cursor = e.target.result;
            if (cursor) { cursor.delete(); cursor.continue(); return; }
            Promise.all(
              slots.map(function (slot, i) {
                return wrap(store.add(Object.assign({}, slot, { project_id: projectId, order: i })));
              })
            ).then(resolve).catch(reject);
          };
          req.onerror = function () { reject(req.error); };
        });
      });
    },

    clear: function (projectId) {
      return this.save(projectId, []);
    }
  };

  // ── Images ────────────────────────────────────────────────────────────────────

  var images = {
    get: function (uuid) {
      return ready.then(function () {
        return wrap(tx(S.IMAGES).objectStore(S.IMAGES).get(uuid));
      });
    },
    put: function (uuid, dataUrl, projectId) {
      return ready.then(function () {
        return wrap(
          tx(S.IMAGES, 'readwrite').objectStore(S.IMAGES)
            .put({ uuid: uuid, dataUrl: dataUrl, project_id: projectId || null, createdAt: new Date().toISOString() })
        );
      });
    },
    delete: function (uuid) {
      return ready.then(function () {
        return wrap(tx(S.IMAGES, 'readwrite').objectStore(S.IMAGES).delete(uuid));
      });
    },
    deleteByProject: function (projectId) {
      return ready.then(function () {
        var store = tx(S.IMAGES, 'readwrite').objectStore(S.IMAGES);
        return new Promise(function (resolve, reject) {
          var req = store.openCursor();
          req.onsuccess = function (e) {
            var cursor = e.target.result;
            if (!cursor) { resolve(); return; }
            if (cursor.value.project_id === projectId) cursor.delete();
            cursor.continue();
          };
          req.onerror = function () { reject(req.error); };
        });
      });
    },
    runOrphanCleanup: function () {
      return ready.then(function () {
        var store = tx(S.IMAGES, 'readwrite').objectStore(S.IMAGES);
        return new Promise(function (resolve, reject) {
          var count = 0;
          var req = store.openCursor();
          req.onsuccess = function (e) {
            var cursor = e.target.result;
            if (!cursor) { console.log('[DB] orphan cleanup: removed ' + count + ' records'); resolve(); return; }
            if (!cursor.value.project_id) { cursor.delete(); count++; }
            cursor.continue();
          };
          req.onerror = function () { reject(req.error); };
        });
      });
    }
  };

  // ── Descriptions ──────────────────────────────────────────────────────────────

  var descriptions = {
    get: function (uuid) {
      return ready.then(function () {
        return wrap(tx(S.DESCRIPTIONS).objectStore(S.DESCRIPTIONS).get(uuid));
      });
    },
    put: function (uuid, desc, context) {
      return ready.then(function () {
        var record = Object.assign({ uuid: uuid, desc: desc, createdAt: new Date().toISOString() }, context || {});
        return wrap(tx(S.DESCRIPTIONS, 'readwrite').objectStore(S.DESCRIPTIONS).put(record));
      });
    },
    deleteByProject: function (projectId) {
      return ready.then(function () {
        var store = tx(S.DESCRIPTIONS, 'readwrite').objectStore(S.DESCRIPTIONS);
        return new Promise(function (resolve, reject) {
          var req = store.openCursor();
          req.onsuccess = function (e) {
            var cursor = e.target.result;
            if (!cursor) { resolve(); return; }
            if (cursor.value.project_id === projectId) cursor.delete();
            cursor.continue();
          };
          req.onerror = function () { reject(req.error); };
        });
      });
    }
  };

  // ── Public API ────────────────────────────────────────────────────────────────

  return {
    ready       : ready,
    projects    : projects,
    settings    : settings,
    moduleState : moduleState,
    studioState : studioState,
    references  : references,
    gallery     : gallery,
    sequence    : sequence,
    images      : images,
    descriptions: descriptions
  };

})();
