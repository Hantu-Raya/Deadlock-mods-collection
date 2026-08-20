/* QOLLOCK/HP Colors Rewrite menu bridge. ES5-only: loaded in the Escape menu context. */
(function () {
    "use strict";

    var errorLogged = false;
    var toggleQolLock = typeof $.ToggleSettingsWindow === "function" ? $.ToggleSettingsWindow : null;

    function logError(message) {
        if (errorLogged) return;
        errorLogged = true;
        try {
            $.Msg("[HP Colors Rewrite/QOLLock][ERROR] " + String(message || "menu bridge unavailable"));
        } catch (ignored) {
            /* Panorama may be tearing down the menu. */
        }
    }

    function closeHpColors() {
        try {
            if (typeof $.HPColorsMenuCancel === "function") $.HPColorsMenuCancel();
        } catch (error) {
            logError("failed to close HP COLORS: " + String(error && error.message ? error.message : error));
        }
    }

    function closeQolLock() {
        try {
            var settingsWindow = $.GetContextPanel().FindChildTraverse("SettingsWindow");
            if (settingsWindow && typeof settingsWindow.BHasClass === "function" && !settingsWindow.BHasClass("Visible")) return;
            if (toggleQolLock) toggleQolLock();
        } catch (error) {
            logError("failed to close QOL LOCK: " + String(error && error.message ? error.message : error));
        }
    }

    /* QOL LOCK -> HP COLORS: close the Rewrite panel before opening QOL. */
    if (typeof $.ToggleSettingsWindow === "function") {
        (function (toggleSettingsWindow) {
            $.ToggleSettingsWindow = function () {
                closeHpColors();
                return toggleSettingsWindow.apply(this, arguments);
            };
        }($.ToggleSettingsWindow));
    }

    /* HP COLORS -> QOL LOCK: wrap the handler that hp_colors_menu.js installs. */
    if (typeof $.HPColorsMenuBoot === "function") {
        (function (hpColorsMenuBoot) {
            $.HPColorsMenuBoot = function () {
                var button = null;
                try {
                    button = $.GetContextPanel().FindChildTraverse("HPColorsMenuButton");
                    if (button && typeof button.SetPanelEvent === "function") {
                        var originalSetPanelEvent = button.SetPanelEvent;
                        button.SetPanelEvent = function (eventName, callback) {
                            if (eventName === "onactivate" && typeof callback === "function") {
                                var exclusiveCallback = function () {
                                    closeQolLock();
                                    return callback.apply(this, arguments);
                                };
                                return originalSetPanelEvent.call(this, eventName, exclusiveCallback);
                            }
                            return originalSetPanelEvent.apply(this, arguments);
                        };
                    }
                    return hpColorsMenuBoot.apply(this, arguments);
                } catch (error) {
                    logError("failed to boot exclusive HP COLORS handler: " + String(error && error.message ? error.message : error));
                    return hpColorsMenuBoot.apply(this, arguments);
                } finally {
                    if (button && typeof button.SetPanelEvent === "function" && typeof originalSetPanelEvent === "function") {
                        button.SetPanelEvent = originalSetPanelEvent;
                    }
                }
            };
        }($.HPColorsMenuBoot));
    }
}());
