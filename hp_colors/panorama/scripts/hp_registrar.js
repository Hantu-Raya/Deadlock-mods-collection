'use strict';
(function () {

  var TITLE = "HP Colors";
  var menuConfig = {
    title: TITLE,
    description: "Enemy healthbar coloring",
    elements: [
      { type: "toggle",      id: "ENABLED",      label: "Enable",                defaultValue: true },
      { type: "cycler",      id: "MODE",          label: "Mode",                  options: ["Fixed","Gradient"], defaultValue: 1 },
      { type: "stepper",     id: "LOW",           label: "Low HP %",              defaultValue: 25, step: 1 },
      { type: "stepper",     id: "HIGH",          label: "High HP %",             defaultValue: 65, step: 1 },
      { type: "colorpicker", id: "COLOR_LOW",     label: "Low color",             defaultValue: "#E16161" },
      { type: "colorpicker", id: "COLOR_MID",     label: "Mid color",             defaultValue: "#FF7B00" },
      { type: "colorpicker", id: "COLOR_HIGH",    label: "High color",            defaultValue: "#00FF00" },
      { type: "colorpicker", id: "COLOR_NEUTRAL", label: "Neutral color",         defaultValue: "#5BEFB5" },
      { type: "toggle",      id: "TEAM_COLORS",   label: "Team colors (high HP)", defaultValue: false }
    ]
  };

  var done = false;

  function register() {
    if (done) return;
    $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({ magic_word: "ANITA_REGISTER", config: menuConfig }));
    $.Schedule(1.0, register);
  }

  $.RegisterForUnhandledEvent("ClientUI_FireOutput", function (payload) {
    try {
      var data = JSON.parse(payload);
      if (data.magic_word === "ANITA_ALIVE") { done = false; register(); }
      if (data.magic_word === "ANITA_HANDSHAKE" && data.mod_title === TITLE) { done = true; }
    } catch (e) {}
  });

  $.Schedule(0.05, register);

})();
