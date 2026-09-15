/* HP Colors Rewrite v2 / Third Eye compatibility bridge. */
(function () {
  "use strict";

  var global = typeof globalThis !== "undefined" ? globalThis : this;
  var errorLogged = false;

  function logError(message) {
    if (errorLogged) return;
    errorLogged = true;
    try {
      $.Msg("[HP Colors Rewrite v2/Third Eye][ERROR] " + String(message || "bridge unavailable"));
    } catch (ignored) {
      /* Panorama may be tearing down the Escape menu. */
    }
  }

  function getHpCancel() {
    try {
      return $["HPColorsMenuCancel"];
    } catch (ignored) {
      return null;
    }
  }

  function getWindowApi() {
    var thirdEye = global["ThirdEye"];
    var ui = thirdEye && thirdEye["ui"];
    return ui && ui["window"] ? ui["window"] : null;
  }

  /*
   * Close Third Eye only when its shell is open. Returning true means the
   * Escape event was consumed, including a failed close attempt; callers must
   * not resume the game behind a still-visible modal shell.
   */
  function closeThirdEyeWindow() {
    var api = getWindowApi();
    if (!api) return false;

    try {
      if (typeof api["isOpen"] === "function" && !api["isOpen"]()) return false;
      if (typeof api["setOpen"] !== "function") return true;
      api["setOpen"](false);
      return true;
    } catch (error) {
      logError("failed to close Third Eye: " + String(error && error.message ? error.message : error));
      return true;
    }
  }

  /*
   * Third Eye -> HP COLORS: a settings-button click first gives HP's nested
   * editor/modal the canonical cancel opportunity. A consumed HP event stops
   * the toggle; otherwise Third Eye toggles. Returning true means the helper
   * handled the click, including an intentional nested-modal no-op.
   */
  function toggleThirdEyeWindow() {
    var hpCancel = getHpCancel();
    if (typeof hpCancel === "function") {
      try {
        if (hpCancel()) return true;
      } catch (error) {
        logError("HP Colors cancel before Third Eye failed: " + String(error && error.message ? error.message : error));
        return true;
      }
    }

    var api = getWindowApi();
    if (!api || typeof api["toggle"] !== "function") return false;
    try {
      api["toggle"]();
      return true;
    } catch (error2) {
      logError("failed to toggle Third Eye: " + String(error2 && error2.message ? error2.message : error2));
      return true;
    }
  }

  /* Stable bridge names used by merged XML and the patched window runtime. */
  global["HPColorsThirdEyeCloseWindow"] = closeThirdEyeWindow;
  global["HPColorsThirdEyeToggleWindow"] = toggleThirdEyeWindow;
  if (typeof $ !== "undefined") {
    $["HPColorsThirdEyeCloseWindow"] = closeThirdEyeWindow;
    $["HPColorsThirdEyeToggleWindow"] = toggleThirdEyeWindow;
  }

  /*
   * HP COLORS -> Third Eye: HPColorsMenuCancel is the canonical Escape-menu
   * contract. If HP has no nested editor/modal to consume the event, close
   * Third Eye and return true so canonical root handlers do not resume behind
   * the still-visible shell.
   */
  var hpCancel = getHpCancel();
  if (typeof hpCancel === "function") {
    $["HPColorsMenuCancel"] = function () {
      var consumed;
      try {
        consumed = hpCancel.apply(this, arguments);
      } catch (error3) {
        logError("HP Colors cancel bridge failed: " + String(error3 && error3.message ? error3.message : error3));
        return true;
      }
      if (consumed) return true;
      return closeThirdEyeWindow();
    };
  }

  /*
   * HP COLORS -> Third Eye: decorate only the SetPanelEvent calls made while
   * HPColorsMenuBoot binds its button. The original method is restored in the
   * same call, so repeated boot/retry remains safe and no persistent method
   * interception is left on the Panorama panel.
   */
  var hpBoot = null;
  try {
    hpBoot = $["HPColorsMenuBoot"];
  } catch (ignoredBootLookup) {
    hpBoot = null;
  }
  if (typeof hpBoot !== "function") return;

  $["HPColorsMenuBoot"] = function () {
    var button = null;
    var originalSetPanelEvent = null;
    var temporarySetPanelEvent = null;

    try {
      button = $.GetContextPanel().FindChildTraverse("HPColorsMenuButton");
      if (button && typeof button.SetPanelEvent === "function") {
        originalSetPanelEvent = button.SetPanelEvent;
        temporarySetPanelEvent = function (eventName, callback) {
          if (eventName === "onactivate" && typeof callback === "function") {
            var originalCallback = callback;
            var exclusiveCallback = function () {
              closeThirdEyeWindow();
              return originalCallback.apply(this, arguments);
            };
            return originalSetPanelEvent.call(this, eventName, exclusiveCallback);
          }
          return originalSetPanelEvent.apply(this, arguments);
        };
        button.SetPanelEvent = temporarySetPanelEvent;
      }
    } catch (setupError) {
      logError("HP Colors boot bridge setup failed: " + String(setupError && setupError.message ? setupError.message : setupError));
      button = null;
      originalSetPanelEvent = null;
      temporarySetPanelEvent = null;
    }

    try {
      return hpBoot.apply(this, arguments);
    } finally {
      if (
        button &&
        originalSetPanelEvent &&
        temporarySetPanelEvent &&
        button.SetPanelEvent === temporarySetPanelEvent
      ) {
        button.SetPanelEvent = originalSetPanelEvent;
      }
    }
  };
})();
