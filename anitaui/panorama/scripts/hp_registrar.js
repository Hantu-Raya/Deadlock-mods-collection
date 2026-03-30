'use strict';
(function () {

  var TITLE = "HP Colors";

  var SCHEMA = [
    { type: "toggle", id: "hp_enabled", label: "Enable", defaultValue: true },
    { type: "cycler", id: "hp_mode", label: "Mode", options: ["Fixed", "Gradient"], defaultValue: 1 },
    { type: "stepper", id: "hp_low_threshold", label: "Low HP %", defaultValue: 25, step: 1 },
    { type: "stepper", id: "hp_high_threshold", label: "High HP %", defaultValue: 65, step: 1 },
    { type: "colorpicker", id: "hp_color_low", label: "Low color", defaultValue: "#E16161" },
    { type: "colorpicker", id: "hp_color_mid", label: "Mid color", defaultValue: "#FF7B00" },
    { type: "colorpicker", id: "hp_color_high", label: "High color", defaultValue: "#00FF00" },
    { type: "colorpicker", id: "hp_color_neutral", label: "Neutral color", defaultValue: "#5BEFB5" },
    { type: "toggle", id: "hp_team_colors", label: "Team colors (high HP)", defaultValue: false }
  ];

  function buildConfig() {
    var elements = [];
    for (var i = 0; i < SCHEMA.length; i++) {
      var element = {};
      var source = SCHEMA[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          element[key] = source[key];
        }
      }
      elements.push(element);
    }

    return {
      title: TITLE,
      description: "Enemy healthbar coloring",
      storageNamespace: "hp_colors",
      storageVersion: 1,
      legacyStoragePrefix: "hp_mod_",
      elements: elements
    };
  }

  function register() {
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
      magic_word: "ANITA_REGISTER",
      config: buildConfig()
    }));
  }

  $.RegisterForUnhandledEvent("ClientUI_FireOutput", function (payload) {
    try {
      var data = (typeof payload === "string") ? JSON.parse(payload) : payload;
      if (!data) return;
      if (data.magic_word === "ANITA_ALIVE") {
        register();
      }
    } catch (e) {
      $.Msg("[HP Registrar] Error: " + e);
    }
  });

  $.Schedule(0.05, register);

})();
