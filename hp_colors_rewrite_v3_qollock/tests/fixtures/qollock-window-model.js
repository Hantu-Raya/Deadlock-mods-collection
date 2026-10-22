// Test model of QOLLOCK 4.0.5 (13 Oct) ui/window.js, used when the pinned pak03 is absent. It mirrors
// the exported surface and wiring of the pinned decompile: windowApi on QOL.ui.window with setOpen,
// toggle, toggleSettingsWindow, forceCloseModSettings and isOpen (lines 1019-1182, 2286-2346);
// $.ToggleSettingsWindow delegating to windowApi.toggleSettingsWindow and the global binding to the
// closure (2340, 2346); the 220 ms debounce and 350 ms open guard; the CitadelResumePlaying close
// (2248-2275); and the delayed boot that rebinds #EscapeBackground with SetPanelEvent (2194-2241).
(function () {
  "use strict";
  var Q = globalThis.QOL = globalThis.QOL || {};
  Q.ui = Q.ui || {};
  var debounceUntil = 0, guardUntil = 0;
  function win() { return $.GetContextPanel().FindChildTraverse("SettingsWindow"); }
  function isOpen() { var w = win(); return !!(w && w.IsValid() && w.BHasClass("Visible")); }
  function forceCloseModSettings(ignoreGuard) {
    if (!ignoreGuard && Date.now() < guardUntil) return;
    var w = win(); if (w) w.RemoveClass("Visible");
  }
  function toggleSettingsWindow() {
    var now = Date.now();
    if (now < debounceUntil) return;
    debounceUntil = now + 220;
    var w = win(); if (!w) return;
    w.ToggleClass("Visible");
    if (w.BHasClass("Visible")) guardUntil = Date.now() + 350;
  }
  function setOpen(open) {
    if (open) { if (!isOpen()) win().SetHasClass("Visible", true); }
    else forceCloseModSettings(true);
  }
  function toggle() { if (isOpen()) forceCloseModSettings(true); else setOpen(true); }
  var windowApi = { setOpen: setOpen, toggle: toggle, isOpen: isOpen, toggleSettingsWindow: toggleSettingsWindow, forceCloseModSettings: forceCloseModSettings };
  Q.ui.window = windowApi;
  $.ToggleSettingsWindow = function () { return windowApi.toggleSettingsWindow(); };
  $.ForceCloseModSettings = function (ignoreGuard) { return windowApi.forceCloseModSettings(ignoreGuard); };
  $.IsModSettingsOpen = function () { return windowApi.isOpen(); };
  $.BuildUI = function () {};
  globalThis.ToggleSettingsWindow = toggleSettingsWindow;
  globalThis.ForceCloseModSettings = forceCloseModSettings;
  $.Schedule(0.2, function boot() {
    var ctx = $.GetContextPanel(), root = ctx;
    while (root.GetParent && root.GetParent()) root = root.GetParent();
    var bg = root.FindChildTraverse("EscapeBackground");
    if (bg) bg.SetPanelEvent("onactivate", function () {
      if (isOpen()) setOpen(false);
      else $.DispatchEvent("CitadelResumePlaying", ctx);
    });
  });
  $.RegisterForUnhandledEvent("CitadelResumePlaying", function () { forceCloseModSettings(false); });
})();
