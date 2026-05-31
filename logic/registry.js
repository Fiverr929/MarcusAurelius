// registry.js
window.DescriptionRegistry = (function () {

  var _store = {};   // url → description string
  var _pending = {}; // url → in-flight Promise (concurrent dedup)

  function get(url) {
    return _store[url] || null;
  }

  function set(url, desc) {
    _store[url] = desc;
  }

  function clear() {
    _store = {};
    _pending = {};
    // Clear DOM descriptions so collectMissing won't skip them next run
    document.querySelectorAll('.mod-layers .clr').forEach(function (clr) {
      delete clr.dataset.visionDesc;
    });
    if (window.ModulePanel && window.ModulePanel.clearVisionDescriptions) {
      window.ModulePanel.clearVisionDescriptions();
    }
    console.log('[Registry] Cleared all descriptions');
  }

  function ensure(url, context) {
    var key = (context && context.uuid) ? context.uuid : url;

    if (_store[key]) return Promise.resolve(_store[key]);
    if (_pending[key]) return _pending[key];

    _pending[key] = (function () {
      var dbCheck = (context && context.uuid)
        ? DB.descriptions.get(context.uuid)
        : Promise.resolve(null);

      return dbCheck.then(function (record) {
        if (record && record.desc) {
          _store[key] = record.desc;
          delete _pending[key];
          return record.desc;
        }

        var promise;
        if (context.type === 'style') {
          promise = window.VisionScan.describeStyle(url);
        } else if (context.type === 'ref') {
          promise = window.VisionScan.describeRef(url);
        } else {
          promise = window.VisionScan.describe(url, context.layerName || 'LAYER', context.section || 'subject');
        }

        return promise.then(function (desc) {
          _store[key] = desc;
          delete _pending[key];
          if (context.uuid && window.CafeSettings && window.CafeSettings.getKeepDescriptions()) {
            DB.descriptions.put(context.uuid, desc, { layerName: context.layerName, section: context.section });
          }
          return desc;
        }).catch(function (err) {
          delete _pending[key];
          throw err;
        });
      });
    })();

    return _pending[key];
  }

  function ensureAll(items) {
    return Promise.all(items.map(function (item) {
      return ensure(item.url, item.context).catch(function () { return null; });
    }));
  }

  function collectMissing() {
    var missing = [];

    // Module images — scan .mod-layers .clr elements
    document.querySelectorAll('.mod-layers .clr').forEach(function (clr) {
      var main = clr.querySelector('.clr-main');
      if (!main) return;
      if (!main.classList.contains('img-a') && !main.classList.contains('img-i')) return;
      var img = main.querySelector('img');
      if (!img || !img.src) return;
      if (clr.dataset.visionDesc) return; // already has description

      var group = clr.closest('.layer-group');
      var nameEl = group ? group.querySelector('.plr-name') : null;
      var layerName = nameEl ? nameEl.textContent.trim() : 'LAYER';
      var modLayers = clr.closest('.mod-layers');
      var section = modLayers ? modLayers.dataset.section : 'subject';

      missing.push({
        url: img.src,
        context: { type: section === 'style' ? 'style' : 'module', layerName: layerName, section: section, uuid: clr.dataset.uuid || null },
        domTarget: clr
      });
    });

    if (window.ModulePanel && window.ModulePanel.getState) {
      var state = window.ModulePanel.getState();
      (state.files || []).forEach(function (file) {
        if (!file || file.folder != null || file.eye === false || !file.url || file.visionDesc) return;
        missing.push({
          url: file.url,
          context: { type: 'ref', layerName: file.label || 'REFERENCE', section: 'reference', uuid: file.uuid || null },
          stateTarget: { uuid: file.uuid || null }
        });
      });
    }

    return missing;
  }

  return { get: get, set: set, clear: clear, ensure: ensure, ensureAll: ensureAll, collectMissing: collectMissing };

})();
