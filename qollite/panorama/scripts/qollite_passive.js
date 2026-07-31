(function () {
  'use strict';

  if (typeof GameUI === "undefined" || !GameUI.CustomUIConfig) return;
  var qolLite = GameUI.CustomUIConfig().QolLite;
  if (!qolLite || !qolLite.Runtime) return;

  var runtime = qolLite.Runtime;

  function keepVisible() {
    var passiveItems = runtime.find('hud_passive_items');
    if (passiveItems) passiveItems.visible = true;
  }

  runtime.register('passive', {
    init: keepVisible,
    refresh: keepVisible,
    destroy: keepVisible,
  });
})();
