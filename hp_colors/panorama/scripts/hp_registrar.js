'use strict';
(function () {
  var TITLE = "HP Colors";
  var REGISTER_RETRY_DELAY_SEC = 0.25;
  var REGISTER_MAX_ATTEMPTS = 24;
  var didRegister = false;
  var didRequestBootstrap = false;
  var registerAttempts = 0;
  var SCHEMA = [
    // General - Core Behavior
    { type: "toggle", id: "hp_enabled", label: "Enable enemy HP colors", defaultValue: true, category: "GENERAL|Core Behavior" },
    { type: "toggle", id: "hp_bg_visible", label: "Show enemy HP background", defaultValue: true, category: "GENERAL|Core Behavior" },
    { type: "cycler", id: "hp_mode", label: "Enemy color behavior", options: ["Fixed", "Gradient"], defaultValue: 1, category: "GENERAL|Core Behavior" },
    { type: "slider", id: "hp_low_threshold", label: "Low HP starts at %", defaultValue: 25, min: 0, max: 100, step: 1, category: "GENERAL|Core Behavior" },
    { type: "slider", id: "hp_high_threshold", label: "High HP starts at %", defaultValue: 65, min: 0, max: 100, step: 1, category: "GENERAL|Core Behavior" },
    { type: "toggle", id: "hp_team_colors", label: "Use team color at high HP", defaultValue: false, category: "GENERAL|Core Behavior" },
    { type: "toggle", id: "hp_skip_buildings", label: "Ignore buildings and bosses", defaultValue: false, category: "GENERAL|Core Behavior" },
    { type: "slider", id: "hp_info_health_margin_top", label: "HP container top offset", defaultValue: 23, min: 0, max: 100, step: 1, category: "GENERAL|Core Behavior" },
    { type: "slider", id: "hp_healthbar_height", label: "HP bar height", defaultValue: 130, min: 0, max: 230, step: 1, category: "GENERAL|Core Behavior" },
    // Health Bars - Enemy Colors
    { type: "toggle", id: "hp_ult_color_enabled", label: "Color ult icon", defaultValue: true, category: "HEALTH BARS|Enemy Colors" },
    { type: "colorpicker", id: "hp_ult_color_custom", label: "Ult icon custom color", defaultValue: "#E16161", category: "HEALTH BARS|Enemy Colors", visibleWhen: { id: "hp_ult_color_enabled", equals: false } },
    { type: "colorpicker", id: "hp_color_low", label: "Low HP bar color", defaultValue: "#E16161", category: "HEALTH BARS|Enemy Colors" },
    { type: "colorpicker", id: "hp_color_mid", label: "Mid HP bar color", defaultValue: "#FF7B00", category: "HEALTH BARS|Enemy Colors" },
    { type: "colorpicker", id: "hp_color_high", label: "High HP bar color", defaultValue: "#00FF00", category: "HEALTH BARS|Enemy Colors" },
    // Visual Effects - Low HP Pulse
    { type: "toggle", id: "hp_pulse_enabled", label: "Pulse at low HP", defaultValue: true, category: "VISUAL EFFECTS|Low HP Pulse" },
    { type: "slider", id: "hp_pulse_threshold", label: "Pulse starts below %", defaultValue: 25, min: 0, max: 100, step: 1, category: "VISUAL EFFECTS|Low HP Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "slider", id: "hp_pulse_bpm", label: "Pulse speed", defaultValue: 75, min: 30, max: 300, step: 1, category: "VISUAL EFFECTS|Low HP Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "cycler", id: "hp_pulse_intensity", label: "Pulse strength", options: ["Subtle", "Medium", "Intense"], defaultValue: 1, category: "VISUAL EFFECTS|Low HP Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "toggle", id: "hp_pulse_hide_bar", label: "Hide bar while pulsing", defaultValue: false, category: "VISUAL EFFECTS|Low HP Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "toggle", id: "hp_pulse_text_enabled", label: "Pulse HP number", defaultValue: false, category: "VISUAL EFFECTS|Low HP Pulse", visibleWhen: { id: "hp_pulse_enabled", equals: true } },
    { type: "slider", id: "hp_pulse_text_scale", label: "Pulsing number size", defaultValue: 120, min: 72, max: 320, step: 1, category: "VISUAL EFFECTS|Low HP Pulse", visibleWhen: { id: "hp_pulse_text_enabled", equals: true } },
    { type: "positionpicker", id: "hp_pulse_text_position", label: "Pulsing number position", defaultValue: "20,196", category: "VISUAL EFFECTS|Low HP Pulse", visibleWhen: { id: "hp_pulse_text_enabled", equals: true } },
    // Health Bars - Number Overlay
    { type: "slider", id: "hp_counter_size", label: "HP number size", defaultValue: 145, min: 72, max: 320, step: 1, category: "HEALTH BARS|Number Overlay" },
    { type: "positionpicker", id: "hp_counter_position", label: "HP number position", defaultValue: "27,20", category: "HEALTH BARS|Number Overlay" },
    { type: "cycler", id: "hp_counter_format", label: "HP number format", options: ["HP", "%", "Current HP"], defaultValue: 0, category: "HEALTH BARS|Number Overlay" },
    { type: "cycler", id: "hp_text_color_mode", label: "HP number color source", options: ["Bar color", "Custom"], defaultValue: 0, category: "HEALTH BARS|Number Overlay" },
    { type: "toggle", id: "hp_level_number_visible", label: "Show level number", defaultValue: true, category: "HEALTH BARS|Number Overlay" },
    { type: "toggle", id: "hp_pip_visible", label: "Show pip HP segments", defaultValue: true, category: "HEALTH BARS|Number Overlay" },
    { type: "colorpicker", id: "hp_text_color_low", label: "Low HP number color", defaultValue: "#E16161", visibleWhen: { id: "hp_text_color_mode", equals: 1 }, category: "HEALTH BARS|Number Overlay" },
    { type: "colorpicker", id: "hp_text_color_mid", label: "Mid HP number color", defaultValue: "#FF7B00", visibleWhen: { id: "hp_text_color_mode", equals: 1 }, category: "HEALTH BARS|Number Overlay" },
    { type: "colorpicker", id: "hp_text_color_high", label: "High HP number color", defaultValue: "#FFFFFF", visibleWhen: { id: "hp_text_color_mode", equals: 1 }, category: "HEALTH BARS|Number Overlay" },
    // Health Bars - Ally Colors
    { type: "toggle", id: "hp_friend_enabled", label: "Color ally HP bars", defaultValue: false, category: "HEALTH BARS|Ally Colors" },
    { type: "colorpicker", id: "hp_friend_color_low", label: "Ally low HP color", defaultValue: "#E16161", category: "HEALTH BARS|Ally Colors", visibleWhen: { id: "hp_friend_enabled", equals: true } },
    { type: "colorpicker", id: "hp_friend_color_mid", label: "Ally mid HP color", defaultValue: "#FF7B00", category: "HEALTH BARS|Ally Colors", visibleWhen: { id: "hp_friend_enabled", equals: true } },
    { type: "colorpicker", id: "hp_friend_color_high", label: "Ally high HP color", defaultValue: "#00FF00", category: "HEALTH BARS|Ally Colors", visibleWhen: { id: "hp_friend_enabled", equals: true } },
    { type: "toggle", id: "hp_friend_pulse_enabled", label: "Pulse ally bars", defaultValue: false, category: "HEALTH BARS|Ally Colors", visibleWhen: { id: "hp_friend_enabled", equals: true } },
    { type: "slider", id: "hp_friend_pulse_threshold", label: "Ally pulse starts below %", defaultValue: 25, min: 0, max: 100, step: 1, category: "HEALTH BARS|Ally Colors", visibleWhen: { id: "hp_friend_pulse_enabled", equals: true } },
    { type: "slider", id: "hp_friend_pulse_bpm", label: "Ally pulse speed", defaultValue: 75, min: 30, max: 300, step: 1, category: "HEALTH BARS|Ally Colors", visibleWhen: { id: "hp_friend_pulse_enabled", equals: true } },
    { type: "cycler", id: "hp_friend_pulse_intensity", label: "Ally pulse strength", options: ["Subtle", "Medium", "Intense"], defaultValue: 1, category: "HEALTH BARS|Ally Colors", visibleWhen: { id: "hp_friend_pulse_enabled", equals: true } },
    { type: "toggle", id: "hp_friend_pulse_color_enabled", label: "Use custom ally pulse color", defaultValue: false, category: "HEALTH BARS|Ally Colors", visibleWhen: { id: "hp_friend_pulse_enabled", equals: true } },
    { type: "colorpicker", id: "hp_friend_pulse_color", label: "Ally pulse color", defaultValue: "#FF2222", category: "HEALTH BARS|Ally Colors", visibleWhen: { id: "hp_friend_pulse_color_enabled", equals: true } },
    // Visual Effects - Kill Marker
    { type: "toggle", id: "hp_kill_zone_enabled", label: "Show kill marker", defaultValue: false, category: "VISUAL EFFECTS|Kill Marker" },
    { type: "slider", id: "hp_kill_zone_threshold", label: "Marker position %", defaultValue: 25, min: 5, max: 80, step: 1, category: "VISUAL EFFECTS|Kill Marker", visibleWhen: { id: "hp_kill_zone_enabled", equals: true } },
    { type: "colorpicker", id: "hp_kill_zone_color", label: "Marker color", defaultValue: "#FF2222", category: "VISUAL EFFECTS|Kill Marker", visibleWhen: { id: "hp_kill_zone_enabled", equals: true } },
    { type: "slider", id: "hp_kill_zone_width", label: "Marker width", defaultValue: 3, min: 1, max: 100, step: 1, category: "VISUAL EFFECTS|Kill Marker", visibleWhen: { id: "hp_kill_zone_enabled", equals: true } }
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
      storageVersion: 97,
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
  function markRegistered() {
    didRegister = true;
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
      markRegistered();
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
        markRegistered();
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
