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
    activeResolution: '1K',
    scanTiming: 'generate',
    keepDescriptions: true,
    scanTimeout: 20
  };

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved.googleApiKey) state.googleApiKey = saved.googleApiKey;
        if (saved.activeModel && MODELS[saved.activeModel]) state.activeModel = saved.activeModel;
        if (saved.activeResolution) state.activeResolution = saved.activeResolution;
        if (saved.scanTiming) state.scanTiming = saved.scanTiming;
        if (typeof saved.keepDescriptions === 'boolean') state.keepDescriptions = saved.keepDescriptions;
        if (typeof saved.scanTimeout === 'number' && saved.scanTimeout >= 5) state.scanTimeout = saved.scanTimeout;
      }
    } catch (e) {}
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        googleApiKey: state.googleApiKey,
        activeModel: state.activeModel,
        activeResolution: state.activeResolution,
        scanTiming: state.scanTiming,
        keepDescriptions: state.keepDescriptions,
        scanTimeout: state.scanTimeout
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

    modal.querySelectorAll('.csm-opt[data-group="scan"]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.val === state.scanTiming);
    });
    modal.querySelectorAll('.csm-opt[data-group="cache"]').forEach(function (b) {
      b.classList.toggle('active', (b.dataset.val === 'on') === state.keepDescriptions);
    });
    var timeoutInput = modal.querySelector('.csm-timeout-input');
    if (timeoutInput) timeoutInput.value = state.scanTimeout;

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
      this.textContent = 'Saved';
      setTimeout(function (b, t) { b.textContent = t; }.bind(null, this, orig), 1400);
    });

    modal.querySelectorAll('.csm-nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var page = this.dataset.page;
        modal.querySelectorAll('.csm-nav-btn').forEach(function (b) { b.classList.remove('active'); });
        modal.querySelectorAll('.csm-page').forEach(function (p) { p.classList.remove('active'); });
        this.classList.add('active');
        modal.querySelector('.csm-page[data-page="' + page + '"]').classList.add('active');
      });
    });

    modal.querySelectorAll('.csm-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var group = this.dataset.group;
        var val = this.dataset.val;
        modal.querySelectorAll('.csm-opt[data-group="' + group + '"]').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        if (group === 'scan') { state.scanTiming = val; saveState(); }
        if (group === 'cache') { state.keepDescriptions = val === 'on'; saveState(); }
      });
    });

    var timeoutInput = modal.querySelector('.csm-timeout-input');
    if (timeoutInput) {
      timeoutInput.addEventListener('change', function () {
        var v = parseInt(this.value, 10);
        if (v >= 5 && v <= 120) { state.scanTimeout = v; saveState(); }
        else this.value = state.scanTimeout;
      });
    }
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
    getScanTiming: function () { return state.scanTiming; },
    getKeepDescriptions: function () { return state.keepDescriptions; },
    getScanTimeout: function () { return state.scanTimeout; },
    openModal: openModal,
    closeModal: closeModal
  };

})();
