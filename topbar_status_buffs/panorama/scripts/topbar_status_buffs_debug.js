(() => {
  "use strict";

  var SHARED_KEY = "__topbarStatusBuffs";

  function getStore() {
    var config = null;
    try {
      if (GameUI && GameUI.CustomUIConfig) config = GameUI.CustomUIConfig();
    } catch (e0) { config = null; }
    if (!config) {
      try { config = $; } catch (e1) { config = null; }
    }
    return config ? config[SHARED_KEY] || null : null;
  }

  function dumpStore() {
    var store = getStore();
    var text;
    try { text = JSON.stringify(store || {}, null, 2); } catch (e0) { text = String(store || ""); }
    try { $.Msg("[topbar_status_buffs] " + text); } catch (e1) {}
    return text;
  }

  function clearStore() {
    var config = null;
    try {
      if (GameUI && GameUI.CustomUIConfig) config = GameUI.CustomUIConfig();
    } catch (e0) { config = null; }
    if (!config) {
      try { config = $; } catch (e1) { config = null; }
    }
    if (config) config[SHARED_KEY] = { version: 1, seq: 0, ttl_ms: 2500, buff_duration_ms: 160000, updated_at: 0, units: {} };
    return dumpStore();
  }

  $.TopbarStatusBuffsDebugDump = dumpStore;
  $.TopbarStatusBuffsDebugClear = clearStore;
})();
