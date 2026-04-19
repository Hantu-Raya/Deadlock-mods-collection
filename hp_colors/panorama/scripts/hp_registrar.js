'use strict';
(function () {
  var TITLE = "HP Colors";
  var REGISTER_RETRY_DELAY_SEC = 0.25;
  var REGISTER_MAX_ATTEMPTS = 24;
  var didRegister = false;
  var didRequestBootstrap = false;
  var registerAttempts = 0;
  var SCHEMA = [
    // General - main switches and behavior controls
    { type: "toggle", id: "hp_enabled", label: "Enable enemy HP colors", defaultValue: true, category: "General" },
    { type: "toggle", id: "hp_bg_visible", label: "Show enemy HP background", defaultValue: true, category: "General" },
    { type: "cycler", id: "hp_mode", label: "Enemy color behavior", options: ["Fixed", "Gradient"], defaultValue: 1, category: "General" },
    { type: "slider", id: "hp_low_threshold", label: "Low HP starts at %", defaultValue: 25, min: 0, max: 100, step: 1, category: "General" },
    { type: "slider", id: "hp_high_threshold", label: "High HP starts at %", defaultValue: 65, min: 0, max: 100, step: 1, category: "General" },
    { type: "toggle", id: "hp_team_colors", label: "Use team color at high HP", defaultValue: false, category: "General" },
    { type: "toggle", id: "hp_skip_buildings", label: "Ignore buildings and bosses", defaultValue: false, category: "General" },
    // Enemy Bar Colors - palette applied to enemy units
    { type: "colorpicker", id: "hp_color_low", label: "Low HP bar color", defaultValue: "#E16161", category: "Enemy Bar Colors" },
    { type: "colorpicker", id: "hp_color_mid", label: "Mid HP bar color", defaultValue: "#FF7B00", category: "Enemy Bar Colors" },
    { type: "colorpicker", id: "hp_color_high", label: "High HP bar color", defaultValue: "#00FF00", category: "Enemy Bar Colors" },
    // Low HP Pulse - enemy low-HP pulse animation and text
    { type: "toggle", id: "hp_pulse_enabled", label: "Pulse at low HP", defaultValue: true, category: "Low HP Pulse" },
    { type: "slider", id: "hp_pulse_threshold", label: "Pulse starts below %", defaultValue: 25, min: 0, max: 100, step: 1, category: "Low HP Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "slider", id: "hp_pulse_bpm", label: "Pulse speed", defaultValue: 75, min: 30, max: 300, step: 1, category: "Low HP Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "cycler", id: "hp_pulse_intensity", label: "Pulse strength", options: ["Subtle", "Medium", "Intense"], defaultValue: 1, category: "Low HP Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "toggle", id: "hp_pulse_hide_bar", label: "Hide bar while pulsing", defaultValue: false, category: "Low HP Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "toggle", id: "hp_pulse_text_enabled", label: "Pulse HP number", defaultValue: true, category: "Low HP Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "slider", id: "hp_pulse_text_scale", label: "Pulsing number size", defaultValue: 120, min: 72, max: 320, step: 1, category: "Low HP Pulse", visibleWhen: { id: "hp_pulse_text_enabled", equals: true } },
    { type: "positionpicker", id: "hp_pulse_text_position", label: "Pulsing number position", defaultValue: "20,196", category: "Low HP Pulse", visibleWhen: { id: "hp_pulse_text_enabled", equals: true } },
    // HP Number - enemy HP number overlay
    { type: "slider", id: "hp_counter_size", label: "HP number size", defaultValue: 120, min: 72, max: 320, step: 1, category: "HP Number" },
    { type: "positionpicker", id: "hp_counter_position", label: "HP number position", defaultValue: "20,196", category: "HP Number" },
    { type: "cycler", id: "hp_counter_format", label: "HP number format", options: ["HP", "%"], defaultValue: 0, category: "HP Number" },
    { type: "cycler", id: "hp_text_color_mode", label: "HP number color source", options: ["Bar color", "Custom"], defaultValue: 0, category: "HP Number" },
    { type: "toggle", id: "hp_level_number_visible", label: "Show level number", defaultValue: true, category: "HP Number" },
    { type: "colorpicker", id: "hp_text_color_low", label: "Low HP number color", defaultValue: "#E16161", visibleWhen: { id: "hp_text_color_mode", equals: 1 }, category: "HP Number" },
    { type: "colorpicker", id: "hp_text_color_mid", label: "Mid HP number color", defaultValue: "#FF7B00", visibleWhen: { id: "hp_text_color_mode", equals: 1 }, category: "HP Number" },
    { type: "colorpicker", id: "hp_text_color_high", label: "High HP number color", defaultValue: "#FFFFFF", visibleWhen: { id: "hp_text_color_mode", equals: 1 }, category: "HP Number" },
    // Ally Bars - independent coloring for friendly player heroes
    { type: "toggle", id: "hp_friend_enabled", label: "Color ally HP bars", defaultValue: false, category: "Ally Bars" },
    { type: "colorpicker", id: "hp_friend_color_low", label: "Ally low HP color", defaultValue: "#E16161", category: "Ally Bars", visibleWhen: { id: "hp_friend_enabled", equals: true } },
    { type: "colorpicker", id: "hp_friend_color_mid", label: "Ally mid HP color", defaultValue: "#FF7B00", category: "Ally Bars", visibleWhen: { id: "hp_friend_enabled", equals: true } },
    { type: "colorpicker", id: "hp_friend_color_high", label: "Ally high HP color", defaultValue: "#00FF00", category: "Ally Bars", visibleWhen: { id: "hp_friend_enabled", equals: true } },
    { type: "toggle", id: "hp_friend_pulse_enabled", label: "Pulse ally bars", defaultValue: false, category: "Ally Bars", visibleWhen: { id: "hp_friend_enabled", equals: true } },
    { type: "slider", id: "hp_friend_pulse_threshold", label: "Ally pulse starts below %", defaultValue: 25, min: 0, max: 100, step: 1, category: "Ally Bars", visibleWhen: { id: "hp_friend_pulse_enabled", equals: true } },
    { type: "slider", id: "hp_friend_pulse_bpm", label: "Ally pulse speed", defaultValue: 75, min: 30, max: 300, step: 1, category: "Ally Bars", visibleWhen: { id: "hp_friend_pulse_enabled", equals: true } },
    { type: "cycler", id: "hp_friend_pulse_intensity", label: "Ally pulse strength", options: ["Subtle", "Medium", "Intense"], defaultValue: 1, category: "Ally Bars", visibleWhen: { id: "hp_friend_pulse_enabled", equals: true } },
    { type: "toggle", id: "hp_friend_pulse_color_enabled", label: "Use custom ally pulse color", defaultValue: false, category: "Ally Bars", visibleWhen: { id: "hp_friend_pulse_enabled", equals: true } },
    { type: "colorpicker", id: "hp_friend_pulse_color", label: "Ally pulse color", defaultValue: "#FF2222", category: "Ally Bars", visibleWhen: { id: "hp_friend_pulse_color_enabled", equals: true } },
    // Kill Marker - threshold marker on enemy healthbars
    { type: "toggle", id: "hp_kill_zone_enabled", label: "Show kill marker", defaultValue: false, category: "Kill Marker" },
    { type: "slider", id: "hp_kill_zone_threshold", label: "Marker position %", defaultValue: 25, min: 5, max: 80, step: 1, category: "Kill Marker", visibleWhen: { id: "hp_kill_zone_enabled", equals: true } },
    { type: "colorpicker", id: "hp_kill_zone_color", label: "Marker color", defaultValue: "#FF2222", category: "Kill Marker", visibleWhen: { id: "hp_kill_zone_enabled", equals: true } },
    { type: "slider", id: "hp_kill_zone_width", label: "Marker width", defaultValue: 3, min: 1, max: 20, step: 1, category: "Kill Marker", visibleWhen: { id: "hp_kill_zone_enabled", equals: true } }
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
      description: "Set enemy, ally, pulse, HP number, and kill marker colors.",
      storageNamespace: "hp_colors",
      storageVersion: 21,
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
