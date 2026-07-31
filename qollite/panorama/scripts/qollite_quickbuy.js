(function () {
  'use strict';

  var qolLite = GameUI.CustomUIConfig().QolLite;
  if (!qolLite || !qolLite.Runtime) return;

  var runtime = qolLite.Runtime;
  var generation = 0;
  var totalLabel = null;

  function isUsable(panel) {
    return !!panel && (typeof panel.IsValid !== 'function' || panel.IsValid());
  }

  function readCost(entry) {
    if (!entry || typeof entry.GetAttributeInt !== 'function') return 0;
    return entry.GetAttributeInt('cost', 0);
  }

  function render() {
    var queue = runtime.find('QuickbuyQueue');
    if (!isUsable(queue) || typeof queue.GetParent !== 'function') return;

    var container = queue.GetParent();
    if (!isUsable(container)) return;

    if (!isUsable(totalLabel)) {
      totalLabel = runtime.find('QolLiteQuickbuyTotal', container);
      if (!isUsable(totalLabel)) totalLabel = null;
      if (!totalLabel && typeof $ !== 'undefined' && $.CreatePanel) {
        totalLabel = $.CreatePanel('Label', container, 'QolLiteQuickbuyTotal');
        if (typeof totalLabel.AddClass === 'function') totalLabel.AddClass('qollite_quickbuy_total');
      }
    }
    if (!isUsable(totalLabel)) return;

    var total = 0;
    for (var index = 0; index < queue.GetChildCount(); index += 1) {
      total += readCost(queue.GetChild(index));
    }
    totalLabel.text = 'Total: ' + total;
  }

  function scheduleRefresh(currentGeneration) {
    runtime.schedule('quickbuy', 0.25, function () {
      if (currentGeneration !== generation) return;
      render();
      scheduleRefresh(currentGeneration);
    });
  }

  runtime.register('quickbuy', {
    init: function () {
      generation += 1;
      runtime.cancel('quickbuy');
      render();
      scheduleRefresh(generation);
    },
    refresh: render,
    destroy: function () {
      generation += 1;
      runtime.cancel('quickbuy');
      if (isUsable(totalLabel) && typeof totalLabel.DeleteAsync === 'function') totalLabel.DeleteAsync(0);
      totalLabel = null;
    },
  });
})();
