// prompt-builder.js
// Reads window.ModuleState (set live by CafeHTML-v2.html) and the settings
// dropdown to build a structured prompt payload for the API.

window.PromptBuilder = (function () {

  var LABELS = 'ABCDEFG';

  // ── Section collector (SUBJECT / STAGE) ──────────────────────────────────
  // Reads from window.ModuleState[sectionKey] — all slots, not just the active one.
  // Parses each slot's HTML snapshot in a detached element to extract layer data.

  function collectSection(sectionKey) {
    var ms = window.ModuleState;
    if (!ms || !ms[sectionKey]) return { slots: [] };

    var data = ms[sectionKey];
    var slots = [];

    data.slots.forEach(function (s, i) {
      var tmp = document.createElement('div');
      tmp.innerHTML = s.html || '';

      var layers = [];
      tmp.querySelectorAll('.layer-group').forEach(function (group) {
        var nameEl = group.querySelector('.plr-name');
        var eyeEl = group.querySelector('.plr > .plr-eye');
        var layerName = nameEl ? nameEl.textContent.trim() : 'LAYER';
        var layerVisible = eyeEl ? eyeEl.classList.contains('on') : true;

        var children = [];
        group.querySelectorAll('.layer-children .clr').forEach(function (clr) {
          var main = clr.querySelector('.clr-main');
          var childEye = clr.querySelector('.plr-eye');
          var childVisible = childEye ? childEye.classList.contains('on') : true;
          if (!main) return;
          if (main.classList.contains('img-a') || main.classList.contains('img-i')) {
            var img = main.querySelector('img');
            var keepDesc = window.CafeSettings ? window.CafeSettings.getKeepDescriptions() : true;
            children.push({ type: 'image', visible: childVisible, imgUrl: img ? img.src : null, visionDesc: (keepDesc ? clr.dataset.visionDesc : null) || null });
          } else if (main.classList.contains('prompt-a') || main.classList.contains('prompt-i')) {
            children.push({ type: 'prompt', text: clr.dataset.savedPrompt || '', visible: childVisible });
          }
          // load state = empty slot, skip
        });

        layers.push({ name: layerName, visible: layerVisible, children: children });
      });

      slots.push({ label: LABELS[i], active: s.on, layers: layers, section: sectionKey });
    });

    return { slots: slots, selected: data.selected };
  }

  // ── Settings collector ────────────────────────────────────────────────────

  function collectSettings() {
    var drop = document.getElementById('settingsDropdown');

    var ratioBtn = drop.querySelector('.sd-ratio-btn.active');
    var aspectRatio = ratioBtn ? ratioBtn.textContent.trim() : null;

    var varBtn = drop.querySelector('.sd-var-btn.active');
    var customEntry = document.getElementById('customEntry');
    var variation = null;
    if (varBtn) {
      variation = parseInt(varBtn.textContent.trim(), 10) || null;
    } else if (customEntry && customEntry.value) {
      variation = parseInt(customEntry.value, 10) || null;
    }

    var fcBtn = drop.querySelector('.sd-fc-btn.active');
    var frameCount = fcBtn ? (parseInt(fcBtn.textContent.trim(), 10) || null) : null;

    var seedInput = document.getElementById('seedNum');
    var seedLocked = drop.dataset.seed === 'locked';
    var seed = seedInput ? (parseInt(seedInput.value, 10) || null) : null;

    return {
      aspectRatio: aspectRatio,
      variation: variation,
      frameCount: frameCount,
      seed: seed,
      seedLocked: seedLocked
    };
  }

  // ── Main collect ──────────────────────────────────────────────────────────

  function collect() {
    var promptBar = document.getElementById('promptBar');
    var promptText = document.getElementById('promptText');
    var mode = promptBar.dataset.state;

    var rawPrompt = promptText.textContent.trim();

    var refs = window.refState[mode].slice();

    return {
      mode: mode,
      prompt: rawPrompt,
      refs: refs,
      subject: collectSection('subject'),
      stage: collectSection('stage'),
      style: collectSection('style'),
      settings: collectSettings()
    };
  }

  return { collect: collect };

})();
