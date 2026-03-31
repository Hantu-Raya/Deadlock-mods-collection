'use strict';
(function () {

  var TITLE = "HP Colors";
  var REGISTER_RETRY_DELAY_SEC = 0.25;
  var REGISTER_MAX_ATTEMPTS = 24;
  var didRegister = false;
  var didRequestBootstrap = false;
  var registerAttempts = 0;

  var SCHEMA = [
    { type: "toggle", id: "hp_enabled", label: "Enable", defaultValue: true },
    { type: "cycler", id: "hp_mode", label: "Mode", options: ["Fixed", "Gradient"], defaultValue: 1 },
    { type: "slider", id: "hp_low_threshold", label: "Low HP %", defaultValue: 25, min: 0, max: 100, step: 1 },
    { type: "toggle", id: "hp_bg_visible", label: "Healthbar bg visible", defaultValue: true },
    { type: "slider", id: "hp_counter_size", label: "HP counter size (px)", defaultValue: 140, min: 72, max: 320, step: 1 },
    { type: "positionpicker", id: "hp_counter_position", label: "HP counter position", defaultValue: "20,196" },
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
      storageVersion: 2,
      legacyStoragePrefix: "hp_mod_",
      elements: elements
    };
  }

  function getRootPanel() {
    var panel = $.GetContextPanel();
    while (panel && panel.GetParent && panel.GetParent()) {
      panel = panel.GetParent();
    }
    return panel;
  }

  function tryDirectRegister(config) {
    var root = getRootPanel();
    if (!root || !root.AnitaUI) return false;
    if (typeof root.AnitaUI.IsReady === "function" && !root.AnitaUI.IsReady()) return false;
    if (typeof root.AnitaUI.Register !== "function") return false;

    root.AnitaUI.Register(config);
    return true;
  }

  function dispatchRegister(config) {
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
      magic_word: "ANITA_REGISTER",
      config: config
    }));
  }

  function requestBootstrap(reason) {
    if (didRequestBootstrap) return;
    didRequestBootstrap = true;
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
      magic_word: "ANITA_REQUEST_BOOTSTRAP",
      mod_title: TITLE,
      storageNamespace: "hp_colors",
      reason: String(reason || "registrar_handshake")
    }));
  }

  function register() {
    if (didRegister) return;

    var config = buildConfig();
    var usedDirect = false;

    try {
      usedDirect = tryDirectRegister(config);
    } catch (e0) {
      $.Msg("[HP Registrar] Direct register failed: " + e0);
    }

    if (!usedDirect) {
      try {
        dispatchRegister(config);
      } catch (e1) {
        $.Msg("[HP Registrar] Event register failed: " + e1);
      }
    } else {
      didRegister = true;
      try {
        dispatchRegister(config);
      } catch (e2) {
        $.Msg("[HP Registrar] Bridge announce failed: " + e2);
      }
    }
  }

  function queueRegisterRetry() {
    if (didRegister || registerAttempts >= REGISTER_MAX_ATTEMPTS) return;
    registerAttempts += 1;
    $.Schedule(REGISTER_RETRY_DELAY_SEC, function () {
      if (didRegister) return;
      register();
      queueRegisterRetry();
    });
  }

  $.RegisterForUnhandledEvent("ClientUI_FireOutput", function (payload) {
    try {
      var data = (typeof payload === "string") ? JSON.parse(payload) : payload;
      if (!data) return;
      if (data.magic_word === "ANITA_ALIVE") {
        register();
      } else if (data.magic_word === "ANITA_HANDSHAKE" && data.mod_title === TITLE) {
        didRegister = true;
        requestBootstrap("registrar_handshake");
      }
    } catch (e) {
      $.Msg("[HP Registrar] Error: " + e);
    }
  });

  $.Schedule(0.05, function () {
    register();
    queueRegisterRetry();
  });

})();
