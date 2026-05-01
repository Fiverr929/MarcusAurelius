// settings.js
window.CafeSettings = (function () {

  var STORAGE_KEY = 'cafehtml-settings';

  var MODELS = {
    'google-nano-banana': {
      id: 'gemini-2.5-flash-image',
      label: 'NANO BANANA',
      provider: 'google',
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      resolutions: [],
      defaultResolution: null,
      costByResolution: { default: 0.039 },
      thinkingLevel: null
    },
    'google-nano-banana-2': {
      id: 'gemini-3.1-flash-image-preview',
      label: 'NANO BANANA 2',
      provider: 'google',
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      resolutions: ['512', '1K', '2K', '4K'],
      defaultResolution: '1K',
      costByResolution: { '512': 0.045, '1K': 0.067, '2K': 0.101, '4K': 0.150 },
      thinkingLevel: 'MINIMAL'
    },
    'nano-banana-pro': {
      id: 'gemini-3-pro-image-preview',
      label: 'NANO BANANA PRO',
      provider: 'google',
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      resolutions: ['1K', '2K', '4K'],
      defaultResolution: '1K',
      costByResolution: { '1K': 0.134, '2K': 0.134, '4K': 0.240 },
      thinkingLevel: null
    }
  };

  // ── State ─────────────────────────────────────────────────────────────────

  var state = {
    googleApiKey: '',
    activeModel: 'google-nano-banana',
    activeResolution: '1K'
  };

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved.googleApiKey) state.googleApiKey = saved.googleApiKey;
        if (saved.activeModel && MODELS[saved.activeModel]) state.activeModel = saved.activeModel;
        if (saved.activeResolution) state.activeResolution = saved.activeResolution;
      }
    } catch (e) {}
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        googleApiKey: state.googleApiKey,
        activeModel: state.activeModel,
        activeResolution: state.activeResolution
      }));
    } catch (e) { console.error('[CafeSettings] save failed:', e); }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function getGoogleApiKey() { return state.googleApiKey; }

  function saveGoogleKey(key) {
    state.googleApiKey = (key || '').replace(/[^\x20-\x7E]/g, '').trim();
    saveState();
  }

  function getActiveModel() { return MODELS[state.activeModel]; }

  function setActiveModel(id) {
    if (!MODELS[id]) return;
    state.activeModel = id;
    state.activeResolution = MODELS[id].defaultResolution;
    saveState();
    renderModal();
  }

  function getActiveResolution() { return state.activeResolution; }

  function setActiveResolution(res) {
    var model = MODELS[state.activeModel];
    if (!model || model.resolutions.indexOf(res) === -1) return;
    state.activeResolution = res;
    saveState();
    renderModal();
  }

  function getCostPerImage() {
    var model = MODELS[state.activeModel];
    var costs = model.costByResolution;
    return costs[state.activeResolution] || costs['default'] || costs[model.defaultResolution] || 0;
  }

  // ── Modal render ───────────────────────────────────────────────────────────

  function renderModal() {
    var modal = document.getElementById('cafe-settings-modal');
    if (!modal) return;

    var modelList = modal.querySelector('.csm-model-list');
    modelList.innerHTML = '';
    Object.keys(MODELS).forEach(function (key) {
      var m = MODELS[key];
      var isActive = key === state.activeModel;
      var row = document.createElement('div');
      row.className = 'csm-model-row' + (isActive ? ' active' : '');
      var baseCost = m.costByResolution[m.defaultResolution] || m.costByResolution['default'] || 0;
      row.innerHTML =
        '<span class="csm-model-label">' + m.label + '</span>' +
        '<span class="csm-model-cost">from $' + baseCost.toFixed(3) + '</span>';
      row.addEventListener('click', function () { setActiveModel(key); });
      modelList.appendChild(row);
    });

    var resList = modal.querySelector('.csm-resolution-list');
    if (resList) {
      resList.innerHTML = '';
      var activeModel = MODELS[state.activeModel];
      activeModel.resolutions.forEach(function (res) {
        var isActive = res === state.activeResolution;
        var row = document.createElement('div');
        row.className = 'csm-resolution-row' + (isActive ? ' active' : '');
        row.innerHTML = (isActive ? '<span class="csm-resolution-check">✓</span>' : '') + res;
        row.addEventListener('click', function () { setActiveResolution(res); });
        resList.appendChild(row);
      });
    }

    modal.querySelector('.csm-cost-value').textContent = '$' + getCostPerImage().toFixed(3) + ' per image';
  }

  function openModal() {
    var modal = document.getElementById('cafe-settings-modal');
    if (!modal) return;

    var inp = modal.querySelector('.csm-google-input');
    if (inp) {
      inp.value = '';
      inp.placeholder = state.googleApiKey ? '••••••••••••••••' : 'Enter Vertex AI API key...';
    }

    renderModal();
    modal.classList.add('open');
  }

  function closeModal() {
    var modal = document.getElementById('cafe-settings-modal');
    if (!modal) return;
    modal.classList.remove('open');
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    loadState();

    var modal = document.getElementById('cafe-settings-modal');
    if (!modal) return;

    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });

    modal.querySelector('.csm-close').addEventListener('click', closeModal);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });

    modal.querySelector('.csm-google-save').addEventListener('click', function () {
      var inp = modal.querySelector('.csm-google-input');
      var key = inp ? inp.value.trim() : '';
      saveGoogleKey(key);
      if (inp) { inp.value = ''; inp.placeholder = key ? '••••••••••••••••' : 'Enter Vertex AI API key...'; }
      renderModal();
      var orig = this.textContent;
      this.textContent = 'SAVED';
      setTimeout(function (b, t) { b.textContent = t; }.bind(null, this, orig), 1400);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    getGoogleApiKey: getGoogleApiKey,
    saveGoogleKey: saveGoogleKey,
    getActiveModel: getActiveModel,
    setActiveModel: setActiveModel,
    getActiveResolution: getActiveResolution,
    setActiveResolution: setActiveResolution,
    getCostPerImage: getCostPerImage,
    openModal: openModal,
    closeModal: closeModal,
    getOutputType: function () {
      var drop = document.getElementById('settingsDropdown');
      return drop ? (drop.dataset.activeOutput || 'PRECISE') : 'PRECISE';
    }
  };

})();
