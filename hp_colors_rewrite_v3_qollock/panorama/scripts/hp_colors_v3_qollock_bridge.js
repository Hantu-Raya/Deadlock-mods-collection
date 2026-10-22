// QOLLOCK pak02 only (ticket 22b): QOL LOCK and HP COLORS share the Escape menu, one window at a time.
// Loaded after QOLLOCK's ui/window.js and hp_colors_v3_menu.js.
// - Every exported QOL LOCK open path (QOL.ui.window.setOpen/toggle/toggleSettingsWindow, the global
//   ToggleSettingsWindow, $.ToggleSettingsWindow) runs unchanged, keeping QOLLOCK's debounce and
//   guards; if it left QOL LOCK open, HP COLORS closes through its own toggle (a full close).
// - $.HPColorsMenuToggle runs unchanged; if it left HP COLORS open, QOL LOCK closes through
//   $.ForceCloseModSettings(true), QOLLOCK's own full close that skips its 350 ms open guard.
// - QOLLOCK's delayed boot rebinds #EscapeBackground with SetPanelEvent (ui/window.js hookEscapeMenu).
//   Its callback is wrapped so an open HP COLORS editor consumes the click before any resume.
// Closes call the unwrapped originals, so no path re-enters another. No QOLLOCK storage or state.
(function () {
  "use strict";
  var toggleV3 = $.HPColorsMenuToggle, context = $.GetContextPanel();
  var api = typeof QOL !== "undefined" && QOL && QOL.ui && QOL.ui.window ? QOL.ui.window : null;
  var global = typeof globalThis !== "undefined" ? globalThis : null;
  function valid(panel) { try { return !!panel && panel.IsValid(); } catch (error) { return false; } }
  function v3Open() {
    var settings = $.HPColorsV3Settings;
    var host = settings && settings.menu && valid(context) ? context.FindChildTraverse(settings.menu.rootId) : null;
    return valid(host) && host.BHasClass("HPC3Open");
  }
  function qolOpen() {
    if (api && typeof api.isOpen === "function") return api.isOpen() === true;
    return typeof $.IsModSettingsOpen === "function" && $.IsModSettingsOpen() === true;
  }
  function attempt(close, label) {
    try { close(); }
    catch (error) {
      // HPV3_DEBUG $.Msg("[HPV3] QOLLOCK window bridge could not close " + label + ": " + error);
    }
  }
  function closeV3() { if (qolOpen() && v3Open()) toggleV3(); }
  function closeQol() { if (v3Open() && qolOpen()) $.ForceCloseModSettings(true); }
  function after(open, close, label) {
    return function () { var result = open.apply(this, arguments); attempt(close, label); return result; };
  }
  if (typeof toggleV3 !== "function" || typeof $.ForceCloseModSettings !== "function") {
    // HPV3_DEBUG $.Msg("[HPV3] QOLLOCK window bridge inactive: a window toggle is missing");
    return;
  }
  // Wrapping a delegate and its target is harmless: each close checks both windows first.
  ["setOpen", "toggle", "toggleSettingsWindow"].forEach(function (name) {
    if (api && typeof api[name] === "function") api[name] = after(api[name], closeV3, "HP COLORS");
  });
  if (global && typeof global.ToggleSettingsWindow === "function") global.ToggleSettingsWindow = after(global.ToggleSettingsWindow, closeV3, "HP COLORS");
  if (typeof $.ToggleSettingsWindow === "function") $.ToggleSettingsWindow = after($.ToggleSettingsWindow, closeV3, "HP COLORS");
  $.HPColorsMenuToggle = after(toggleV3, closeQol, "QOL LOCK");

  // Background click: QOL LOCK open -> QOLLOCK's handler closes it; HP COLORS open -> its cancel
  // consumes the click (search first, then the editor); otherwise QOLLOCK's handler resumes.
  function consume() { return !qolOpen() && typeof $.HPColorsMenuCancel === "function" && $.HPColorsMenuCancel() === true; }
  var background = valid(context) ? context.FindChildTraverse("EscapeBackground") : null;
  if (!valid(background)) return;
  var setEvent = background.SetPanelEvent, wrapped = function (name, handler) {
    if (name === "onactivate" && typeof handler === "function") {
      var qolHandler = handler;
      handler = function () { if (!consume()) return qolHandler.apply(this, arguments); };
    }
    return setEvent.apply(background, [name, handler]);
  };
  try { background.SetPanelEvent = wrapped; } catch (error) { /* native panel refused the override */ }
  if (background.SetPanelEvent === wrapped) return;
  // Fallback when the override does not take: after QOLLOCK's boot (0.2 s; the shell is static, so
  // its first attempt binds) install the same behaviour, QOLLOCK's close included.
  function bind() {
    if (!valid(background)) return;
    background.SetPanelEvent("onactivate", function () {
      if (qolOpen()) { $.ForceCloseModSettings(true); return; }
      if (!consume()) $.DispatchEvent("CitadelResumePlaying", context);
    });
  }
  $.Schedule(0.25, bind);
  $.Schedule(1, bind);
})();
