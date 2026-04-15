'use strict';
(function () {

  var TITLE = "HP Colors";
  var REGISTER_RETRY_DELAY_SEC = 0.25;
  var REGISTER_MAX_ATTEMPTS = 24;
  var didRegister = false;
  var didRequestBootstrap = false;
  var registerAttempts = 0;

  var SCHEMA = [
    // General — shared behaviour for both enemy and ally coloring
    { type: "toggle", id: "hp_enabled", label: "Enable enemy colors", defaultValue: true, category: "General" },
    { type: "cycler", id: "hp_mode", label: "Color mode", options: ["Fixed", "Gradient"], defaultValue: 1, category: "General" },
    { type: "slider", id: "hp_low_threshold", label: "Low HP threshold %", defaultValue: 25, min: 0, max: 100, step: 1, category: "General" },
    { type: "slider", id: "hp_high_threshold", label: "High HP threshold %", defaultValue: 65, min: 0, max: 100, step: 1, category: "General" },
    { type: "toggle", id: "hp_team_colors", label: "Team tint at high HP", defaultValue: false, category: "General" },
    // Enemy Colors — bar color palette applied to enemy units
    { type: "toggle", id: "hp_bg_visible", label: "Show healthbar background", defaultValue: true, category: "Enemy Colors" },
    { type: "toggle", id: "hp_skip_buildings", label: "Skip buildings & bosses", defaultValue: false, category: "Enemy Colors" },
    { type: "colorpicker", id: "hp_color_low", label: "Low HP color", defaultValue: "#E16161", category: "Enemy Colors" },
    { type: "colorpicker", id: "hp_color_mid", label: "Mid HP color", defaultValue: "#FF7B00", category: "Enemy Colors" },
    { type: "colorpicker", id: "hp_color_high", label: "High HP color", defaultValue: "#00FF00", category: "Enemy Colors" },
    // Enemy Pulse — low-HP pulse animation on enemy bars
    { type: "toggle", id: "hp_pulse_enabled", label: "Enable pulse", defaultValue: true, category: "Enemy Pulse" },
    { type: "slider", id: "hp_pulse_threshold", label: "Pulse below %", defaultValue: 25, min: 0, max: 100, step: 1, category: "Enemy Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "slider", id: "hp_pulse_bpm", label: "Pulse speed (BPM)", defaultValue: 75, min: 30, max: 300, step: 1, category: "Enemy Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "cycler", id: "hp_pulse_intensity", label: "Pulse intensity", options: ["Subtle", "Medium", "Intense"], defaultValue: 1, category: "Enemy Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "toggle", id: "hp_pulse_hide_bar", label: "Hide bar while pulsing", defaultValue: false, category: "Enemy Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "toggle", id: "hp_pulse_text_enabled", label: "Pulse HP counter text", defaultValue: true, category: "Enemy Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "slider", id: "hp_pulse_text_scale", label: "Pulse text size (px)", defaultValue: 120, min: 72, max: 320, step: 1, category: "Enemy Pulse", visibleWhen: { id: "hp_pulse_text_enabled", equals: true } },
    { type: "positionpicker", id: "hp_pulse_text_position", label: "Pulse text position", defaultValue: "20,196", category: "Enemy Pulse", visibleWhen: { id: "hp_pulse_text_enabled", equals: true } },
    // Enemy Counter — HP number overlay on enemy bars
    { type: "slider", id: "hp_counter_size", label: "Counter text size (px)", defaultValue: 120, min: 72, max: 320, step: 1, category: "Enemy Counter" },
    { type: "positionpicker", id: "hp_counter_position", label: "Counter position", defaultValue: "20,196", category: "Enemy Counter" },
    { type: "cycler", id: "hp_counter_format", label: "Counter format", options: ["HP", "%"], defaultValue: 0, category: "Enemy Counter" },
    { type: "cycler", id: "hp_text_color_mode", label: "Counter color source", options: ["Bar color", "Custom"], defaultValue: 0, category: "Enemy Counter" },
    { type: "colorpicker", id: "hp_text_color_low", label: "Counter low color", defaultValue: "#E16161", visibleWhen: { id: "hp_text_color_mode", equals: 1 }, category: "Enemy Counter" },
    { type: "colorpicker", id: "hp_text_color_mid", label: "Counter mid color", defaultValue: "#FF7B00", visibleWhen: { id: "hp_text_color_mode", equals: 1 }, category: "Enemy Counter" },
    { type: "colorpicker", id: "hp_text_color_high", label: "Counter high color", defaultValue: "#FFFFFF", visibleWhen: { id: "hp_text_color_mode", equals: 1 }, category: "Enemy Counter" },
    // Ally Bars — independent coloring for friendly player heroes
    { type: "toggle", id: "hp_friend_enabled", label: "Enable ally colors", defaultValue: false, category: "Ally Bars" },
    { type: "colorpicker", id: "hp_friend_color_low", label: "Ally low HP color", defaultValue: "#E16161", category: "Ally Bars", visibleWhen: { id: "hp_friend_enabled", equals: true } },
    { type: "colorpicker", id: "hp_friend_color_mid", label: "Ally mid HP color", defaultValue: "#FF7B00", category: "Ally Bars", visibleWhen: { id: "hp_friend_enabled", equals: true } },
    { type: "colorpicker", id: "hp_friend_color_high", label: "Ally high HP color", defaultValue: "#00FF00", category: "Ally Bars", visibleWhen: { id: "hp_friend_enabled", equals: true } },
    { type: "toggle", id: "hp_friend_pulse_enabled", label: "Enable ally pulse", defaultValue: false, category: "Ally Bars", visibleWhen: { id: "hp_friend_enabled", equals: true } },
    { type: "slider", id: "hp_friend_pulse_threshold", label: "Pulse below %", defaultValue: 25, min: 0, max: 100, step: 1, category: "Ally Bars", visibleWhen: { id: "hp_friend_pulse_enabled", equals: true } },
    { type: "slider", id: "hp_friend_pulse_bpm", label: "Pulse speed (BPM)", defaultValue: 75, min: 30, max: 300, step: 1, category: "Ally Bars", visibleWhen: { id: "hp_friend_pulse_enabled", equals: true } },
    { type: "cycler", id: "hp_friend_pulse_intensity", label: "Pulse intensity", options: ["Subtle", "Medium", "Intense"], defaultValue: 1, category: "Ally Bars", visibleWhen: { id: "hp_friend_pulse_enabled", equals: true } },
    { type: "toggle", id: "hp_friend_pulse_color_enabled", label: "Custom pulse color", defaultValue: false, category: "Ally Bars", visibleWhen: { id: "hp_friend_pulse_enabled", equals: true } },
    { type: "colorpicker", id: "hp_friend_pulse_color", label: "Pulse color", defaultValue: "#FF2222", category: "Ally Bars", visibleWhen: { id: "hp_friend_pulse_color_enabled", equals: true } }
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
      storageVersion: 18,
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
    }

    if (!usedDirect) {
      try {
        dispatchRegister(config);
      } catch (e1) {
      }
    } else {
      didRegister = true;
      try {
        dispatchRegister(config);
      } catch (e2) {
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
    }
  });

  $.Schedule(0.05, function () {
    register();
    queueRegisterRetry();
  });

})();
