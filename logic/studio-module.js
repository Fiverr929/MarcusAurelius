// studio-module.js
// Purpose-built module panel for Studio. No slots, no eye, no link/unlink.
// Uses window.ModulePanel.makeSection factory from module-panel.js.

window.StudioModuleState = { layers: null };

(function () {

  var smFileInput = document.getElementById('sm-file-input');
  var activeClrMain = null;

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

    document.querySelector('.studio-module-panel').addEventListener('click', function (e) {
      var loadBtn = e.target.closest('.clr-main.load');
      if (loadBtn) {
        activeClrMain = loadBtn;
        smFileInput.value = '';
        smFileInput.click();
      }
    });

    smFileInput.addEventListener('change', function () {
      var file = smFileInput.files[0];
      if (!file || !activeClrMain) return;
      var clr = activeClrMain.closest('.clr');
      var reader = new FileReader();
      reader.onload = function (evt) {
        var url = evt.target.result;
        clr.innerHTML =
          '<div class="clr-x"><img src="assets/icon-close.svg" alt="x"></div>' +
          '<div class="clr-main img-a"><img src="' + url + '" style="width:100%;height:100%;object-fit:cover;" alt="image"></div>' +
          '<div class="clr-t blue">T</div>';
        activeClrMain = null;

        var uuid = crypto.randomUUID();
        clr.dataset.uuid = uuid;
        DB.images.put(uuid, url);

        var owningContainer = clr.closest('.mod-layers');
        if (owningContainer && owningContainer._saveAndSync) owningContainer._saveAndSync();
      };
      reader.readAsDataURL(file);
    });
  }

  function collectImages() {
    var images = [];
    document.querySelectorAll('#sm-layers .clr').forEach(function (clr) {
      var main = clr.querySelector('.clr-main');
      if (!main) return;
      if (!main.classList.contains('img-a')) return;
      var img = main.querySelector('img');
      if (img && img.src && img.src.startsWith('data:')) images.push(img.src);
    });
    return images;
  }

  function reset() {
    window.StudioModuleState = { layers: null };
    var container = document.getElementById('sm-layers');
    if (container && container._resetState) container._resetState();
  }

  window.StudioModule = {
    _initialized: false,
    init:          init,
    collectImages: collectImages,
    reset:         reset
  };

}());
