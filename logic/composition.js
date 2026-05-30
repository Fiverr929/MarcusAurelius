// composition.js
// Single normalization point for the generation pipeline. Turns the raw
// PromptBuilder payload sections into one flat, typed list of
// reference entries that every downstream stage (enhancer, api) consumes.
//
// Entry shape:
//   { kind:'image'|'text', source:'module'|'ref',
//     role, slot, section, layerName,
//     desc, imgUrl, uuid,          // images
//     text,                        // text entries
//     inline,                      // image rides to the enhancer as pixels (no desc)
//     position }                   // assigned once for inline images
//
// `source` and `inline` are additive provenance fields — existing consumers
// ignore them.

window.Composition = (function () {

  function build(payload) {
    var moduleItems = [];
    var position = 1;

    function fromSection(section) {
      if (!section || !section.slots) return;
      section.slots.forEach(function (slot) {
        if (!slot.active) return;
        var slotLabel = slot.label || '?';
        slot.layers.forEach(function (layer) {
          if (!layer.visible) return;
          var imageChildren = layer.children.filter(function (c) { return c.visible && c.type === 'image' && c.imgUrl; });
          var total = imageChildren.length;
          layer.children.forEach(function (child) {
            if (!child.visible) return;
            if (child.type === 'image' && child.imgUrl) {
              var idx = imageChildren.indexOf(child);
              var desc = child.visionDesc || null;
              var angleNote = total > 1 ? ' (view ' + (idx + 1) + ' of ' + total + ' — same subject)' : '';
              moduleItems.push({
                kind: 'image',
                source: 'module',
                role: layer.name || 'LAYER',
                slot: slotLabel,
                section: slot.section || 'subject',
                layerName: layer.name || 'LAYER',
                desc: desc ? desc + angleNote : null,
                imgUrl: child.imgUrl,
                uuid: child.uuid || null
              });
            } else if (child.type === 'prompt' && child.text) {
              moduleItems.push({
                kind: 'text',
                source: 'module',
                role: layer.name || 'LAYER',
                slot: slotLabel,
                section: slot.section || 'subject',
                layerName: layer.name || 'LAYER',
                text: child.text
              });
            }
          });
        });
      });
    }

    fromSection(payload.subject);
    fromSection(payload.stage);
    fromSection(payload.style);

    // Keep image positions stable across runs.
    // Only non-described images get a position — they are the ones sent inline.
    var items = moduleItems;
    items.forEach(function (item) {
      if (item.kind === 'image') {
        item.inline = !item.desc;
        if (item.inline) item.position = position++;
      }
    });

    return items;
  }

  return { build: build };

})();
