// debug-logger.js
// Records every generation run as a structured entry.
// Press Ctrl+Shift+D to download the log as a JSON file.
// Share the downloaded file to get a full diagnosis of what happened.

window.CafeDebug = (function () {

  var _entries = [];

  function stripBase64(obj) {
    return JSON.parse(
      JSON.stringify(obj).replace(
        /"data:image\/[^;]+;base64,[A-Za-z0-9+/=]{20,}"/g,
        '"[base64-image]"'
      )
    );
  }

  function summarizeManifest(manifest) {
    if (!manifest) return null;
    return manifest.map(function (item) {
      return {
        position:  item.position,
        role:      item.role,
        slot:      item.slot,
        section:   item.section,
        layerName: item.layerName,
        hasImage:  !!item.imgUrl,
        desc:      item.desc || null
      };
    });
  }

  function record(entry) {
    var safe = stripBase64(entry);
    if (safe.imageManifest) safe.imageManifest = summarizeManifest(entry.imageManifest);
    _entries.push(safe);
    console.log('[CafeDebug] Run #' + _entries.length + ' logged —', entry.result && entry.result.success ? 'SUCCESS' : 'FAILED', '— Ctrl+Shift+D to download');
  }

  function download() {
    if (!_entries.length) {
      console.log('[CafeDebug] No runs logged yet. Generate something first.');
      return;
    }
    var blob = new Blob([JSON.stringify(_entries, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'cafe-debug-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[CafeDebug] Downloaded', _entries.length, 'run(s).');
  }

  function clear() {
    _entries = [];
    console.log('[CafeDebug] Log cleared.');
  }

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      download();
    }
  });

  return { record: record, download: download, clear: clear };

})();
