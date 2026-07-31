(function () {
  "use strict";

  var config;
  try {
    config = GameUI.CustomUIConfig();
  } catch (error) {
    return;
  }
  if (!config || !config.QolLite || !config.QolLite.Runtime) return;
  config.QolLite.Runtime.init();
}());
