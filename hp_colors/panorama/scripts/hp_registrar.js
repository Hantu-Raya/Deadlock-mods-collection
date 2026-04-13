'use strict';
(function () {

  var TITLE = "HP Colors";
  var REGISTER_RETRY_DELAY_SEC = 0.25;
  var REGISTER_MAX_ATTEMPTS = 24;
  var DEBUG_LOG = false;
  var didRegister = false;
  var didRequestBootstrap = false;
  var registerAttempts = 0;

  function log(message) {
    if (!DEBUG_LOG) return;
    $.Msg("[HP Registrar] " + message);
  }

  var SCHEMA = [
    { type: "toggle", id: "hp_enabled", label: "Enable", defaultValue: true, category: "Behavior" },
    { type: "cycler", id: "hp_mode", label: "Mode", options: ["Fixed", "Gradient"], defaultValue: 1, category: "Behavior" },
    { type: "slider", id: "hp_low_threshold", label: "Low HP %", defaultValue: 25, min: 0, max: 100, step: 1, category: "Behavior" },
    { type: "slider", id: "hp_high_threshold", label: "High HP %", defaultValue: 65, min: 0, max: 100, step: 1, category: "Behavior" },
    { type: "toggle", id: "hp_bg_visible", label: "Healthbar bg visible", defaultValue: true, category: "Behavior" },
    { type: "toggle", id: "hp_team_colors", label: "Team colors (high HP)", defaultValue: false, category: "Behavior" },
    // NPC poll slow removed - using optimized polling instead
    { type: "colorpicker", id: "hp_color_low", label: "Low color", defaultValue: "#E16161", category: "Bar Colors" },
    { type: "colorpicker", id: "hp_color_mid", label: "Mid color", defaultValue: "#FF7B00", category: "Bar Colors" },
    { type: "colorpicker", id: "hp_color_high", label: "High color", defaultValue: "#00FF00", category: "Bar Colors" },
    { type: "slider", id: "hp_counter_size", label: "HP counter size (px)", defaultValue: 120, min: 72, max: 320, step: 1, category: "Counter Text" },
    { type: "positionpicker", id: "hp_counter_position", label: "HP counter position (bg visible)", defaultValue: "20,196", category: "Counter Text" },
    { type: "cycler", id: "hp_text_color_mode", label: "HP text color", options: ["By HP %", "Custom"], defaultValue: 0, category: "Counter Text" },
    { type: "colorpicker", id: "hp_text_color_low", label: "HP text low color", defaultValue: "#E16161", visibleWhen: { id: "hp_text_color_mode", equals: 1 }, category: "Counter Text" },
    { type: "colorpicker", id: "hp_text_color_mid", label: "HP text mid color", defaultValue: "#FF7B00", visibleWhen: { id: "hp_text_color_mode", equals: 1 }, category: "Counter Text" },
    { type: "colorpicker", id: "hp_text_color_high", label: "HP text high color", defaultValue: "#FFFFFF", visibleWhen: { id: "hp_text_color_mode", equals: 1 }, category: "Counter Text" }
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
      storageVersion: 7,
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
    log("tryDirectRegister root=" + String((root && root.id) || "root") +
      " hasAnitaUI=" + String(!!(root && root.AnitaUI)));
    if (!root || !root.AnitaUI) return false;
    if (typeof root.AnitaUI.IsReady === "function" && !root.AnitaUI.IsReady()) return false;
    if (typeof root.AnitaUI.Register !== "function") return false;

    root.AnitaUI.Register(config);
    return true;
  }

  function dispatchRegister(config) {
    log("dispatch register via event elements=" + String((config && config.elements && config.elements.length) || 0));
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
      magic_word: "ANITA_REGISTER",
      config: config
    }));
  }

  function requestBootstrap(reason) {
    if (didRequestBootstrap) return;
    didRequestBootstrap = true;
    log("request bootstrap reason=" + String(reason || "registrar_handshake"));
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
    log("register attempt=" + String(registerAttempts + 1));

    try {
      usedDirect = tryDirectRegister(config);
    } catch (e0) {
      log("Direct register failed: " + e0);
    }

    if (!usedDirect) {
      try {
        dispatchRegister(config);
      } catch (e1) {
        log("Event register failed: " + e1);
      }
    } else {
      didRegister = true;
      log("direct register succeeded");
      try {
        dispatchRegister(config);
      } catch (e2) {
        log("Bridge announce failed: " + e2);
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
        log("received ANITA_ALIVE");
        register();
      } else if (data.magic_word === "ANITA_HANDSHAKE" && data.mod_title === TITLE) {
        didRegister = true;
        log("received handshake");
        requestBootstrap("registrar_handshake");
      }
    } catch (e) {
      log("Error: " + e);
    }
  });

  $.Schedule(0.05, function () {
    log("startup context=" + String(($.GetContextPanel() && $.GetContextPanel().id) || "panel"));
    register();
    queueRegisterRetry();
  });

})();
