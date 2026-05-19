// sequence-bar.js
(function () {
  var $seqImages = document.querySelector('.sequence-images');
  var seqSlots = [];

  var xSVG = '<svg width="8" height="8" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function addSeqSlot(cell) {
    var wrap = document.createElement('div');
    wrap.className = 'seq-slot-wrap';

    var slot = document.createElement('div');
    slot.className = 'seq-slot';

    var imgSrc = cell.src || cell.imgUrl;
    var slotData = imgSrc ? { imgUrl: imgSrc } : { phClass: cell.phClass };
    seqSlots.push(slotData);

    var thumb;
    if (imgSrc) {
      thumb = document.createElement('img');
      thumb.className = 'seq-thumb';
      thumb.src = imgSrc;
      thumb.alt = '';
    } else {
      thumb = document.createElement('div');
      thumb.className = 'seq-thumb' + (cell.phClass ? ' ' + cell.phClass : '');
    }

    var btnX = document.createElement('button');
    btnX.className = 'seq-btn-x';
    btnX.title = 'Remove';
    btnX.innerHTML = xSVG;
    btnX.addEventListener('click', function () {
      var idx = seqSlots.indexOf(slotData);
      if (idx !== -1) seqSlots.splice(idx, 1);
      wrap.remove();
      window.Workspace.autosave();
    });

    slot.append(thumb, btnX);
    wrap.appendChild(slot);
    $seqImages.appendChild(wrap);
    window.Workspace.autosave();
  }

  window.addSeqSlot  = addSeqSlot;
  window.getSeqSlots = function () { return seqSlots.filter(function (s) { return !!s.imgUrl; }); };
  window.clearSeqSlots = function () {
    seqSlots.length = 0;
    $seqImages.innerHTML = '';
  };

  function addCurrentHudCell() {
    var cell = window.getHudCell ? window.getHudCell() : null;
    if (cell) {
      addSeqSlot(cell);
      window.closeHUD();
    }
  }

  document.getElementById('hud-add-seq').addEventListener('click', addCurrentHudCell);

  document.querySelector('.btn-upload-seq').addEventListener('click', function () {
    addSeqSlot({ phClass: 'ph-0' });
  });

})();
