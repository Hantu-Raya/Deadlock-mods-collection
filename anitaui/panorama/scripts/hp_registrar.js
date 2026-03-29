'use strict';
(function () {

  var TITLE = "HP Colors";
  var SK = function (id) { return "hp_mod_" + id; };

  var SCHEMA = [
    { type: "toggle",      id: "hp_enabled",        label: "Enable",                defaultValue: true },
    { type: "cycler",      id: "hp_mode",            label: "Mode",                  options: ["Fixed", "Gradient"], defaultValue: 1 },
    { type: "stepper",     id: "hp_low_threshold",   label: "Low HP %",              defaultValue: 25, step: 1 },
    { type: "stepper",     id: "hp_high_threshold",  label: "High HP %",             defaultValue: 65, step: 1 },
    { type: "colorpicker", id: "hp_color_low",       label: "Low color",             defaultValue: "#E16161" },
    { type: "colorpicker", id: "hp_color_mid",       label: "Mid color",             defaultValue: "#FF7B00" },
    { type: "colorpicker", id: "hp_color_high",      label: "High color",            defaultValue: "#00FF00" },
    { type: "colorpicker", id: "hp_color_neutral",   label: "Neutral color",         defaultValue: "#5BEFB5" },
    { type: "toggle",      id: "hp_team_colors",     label: "Team colors (high HP)", defaultValue: false }
  ];

  function readStorage(id) {
    var raw = $.persistentStorage.getItem(SK(id));
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function writeStorage(id, val) {
    $.persistentStorage.setItem(SK(id), JSON.stringify(val));
  }

  // Write defaults for any key not yet stored
  function initDefaults() {
    for (var i = 0; i < SCHEMA.length; i++) {
      var el = SCHEMA[i];
      if (readStorage(el.id) === null) writeStorage(el.id, el.defaultValue);
    }
  }

  // Build config with current stored values populated into currentValue
  function buildConfig() {
    var elements = [];
    for (var i = 0; i < SCHEMA.length; i++) {
      var el = SCHEMA[i];
      var clone = {};
      for (var k in el) clone[k] = el[k];
      var stored = readStorage(el.id);
      clone.currentValue = (stored !== null) ? stored : el.defaultValue;
      elements.push(clone);
    }
    return { title: TITLE, description: "Enemy healthbar coloring", elements: elements };
  }

  function register() {
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
      magic_word: "ANITA_REGISTER",
      config: buildConfig()
    }));
  }

  initDefaults();

  $.RegisterForUnhandledEvent("ClientUI_FireOutput", function (payload) {
    try {
      var data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!data) return;
      if (data.magic_word === "ANITA_ALIVE") {
        register();
      } else if (data.magic_word === "ANITA_UPDATE" && data.mod_title === TITLE) {
        writeStorage(data.setting_id, data.value);
      }
    } catch (e) {
      $.Msg("[HP Registrar] Error: " + e);
    }
  });

  // Register immediately — anita_ui_core.js is included before us so ANITA_ALIVE
  // has already fired; we also catch future ANITA_ALIVE for mid-session restarts.
  $.Schedule(0.05, register);

})();
