"use strict";

var QolLiteMapSettings = (function () {
    var _open = false;
    var _controlsBound = false;
    var _lastDetailVisible = false;
    var _ummActive = false;

    var _activeTab = "overlay";

    function _panel(id) {
        var ctx = $.GetContextPanel();
        return ctx ? ctx.FindChildTraverse(id) : null;
    }

    function _setTabActive(contentId, active) {
        var panel = _panel(contentId);
        if (!panel) { return; }
        panel.SetHasClass("TabActive", active);
        panel.style.visibility = active ? "visible" : "collapse";
    }

    function _applyTab(tab) {
        _activeTab = tab;
        _setTabActive("minimap_tab_content_overlay", tab === "overlay");
        _setTabActive("minimap_tab_content_minimap", tab === "minimap");

        var tabOverlay = _panel("minimap_tab_overlay");
        if (tabOverlay && typeof tabOverlay.SetSelected === "function") { tabOverlay.SetSelected(tab === "overlay"); }
        var tabMinimap = _panel("minimap_tab_minimap");
        if (tabMinimap && typeof tabMinimap.SetSelected === "function") { tabMinimap.SetSelected(tab === "minimap"); }
    }

    function open() {
        _open = true;
        var panel = _panel("minimap_settings");
        if (panel) {
            panel.style.visibility = "visible";
            panel.SetHasClass("SettingsOpen", true);
        }
        var label = _panel("minimap_settings_toggle_label");
        if (label) { label.text = "Close"; }
    }

    function close(immediate) {
        _open = false;
        var panel = _panel("minimap_settings");
        if (panel) {
            panel.SetHasClass("SettingsOpen", false);
            if (immediate) {
                // TAB release: the window must vanish NOW, not after the 0.22s
                // fade - a still-visible hittest panel during the cursor
                // re-capture transition can hang the mouse.
                panel.style.visibility = "collapse";
            } else {
                $.Schedule(0.22, function () {
                    if (!_open && panel) {
                        panel.style.visibility = "collapse";
                    }
                });
            }
        }
        var label = _panel("minimap_settings_toggle_label");
        if (label) { label.text = "Settings"; }
    }

    function toggle() {
        if (_open) { close(); } else { open(); }
    }

    function bindControls() {
        var toggleBtn = _panel("minimap_settings_toggle");
        if (toggleBtn) {
            toggleBtn.SetPanelEvent("onactivate", toggle);
            _controlsBound = true;
        }

        var tabOverlay = _panel("minimap_tab_overlay");
        if (tabOverlay) { tabOverlay.SetPanelEvent("onactivate", function () { _applyTab("overlay"); }); }

        var tabMinimap = _panel("minimap_tab_minimap");
        if (tabMinimap) { tabMinimap.SetPanelEvent("onactivate", function () { _applyTab("minimap"); }); }

        var mapOpacity = _panel("minimap_map_opacity_slider");
        if (mapOpacity) {
            var oCtrl = mapOpacity.FindChildTraverse("Slider");
            if (oCtrl) {
                oCtrl.SetPanelEvent("onvaluechanged", function () {
                    var v = Math.max(0.01, Math.min(1.0, Math.round(oCtrl.value * 100) / 100));
                    QolLiteMapState.patch({ mapOpacity: v });
                    var hudMinimap = _panel("HudMinimapContainer");
                    if (hudMinimap) { hudMinimap.style.opacity = String(v); }
                });
            }
        }

        var resetMap = _panel("minimap_reset_map_button");
        if (resetMap) {
            resetMap.SetPanelEvent("onactivate", function () {
                var d = QolLiteMapState.DEFAULTS;
                QolLiteMapState.patch({ mapOpacity: d.mapOpacity });
                QolLiteMapSize.apply();
            });
        }

    }

    function _syncMapOpacity() {
        var state = QolLiteMapState.get();
        var hudMinimap = _panel("HudMinimapContainer");
        if (hudMinimap) { hudMinimap.style.opacity = String(state.mapOpacity); }

        var slider = _panel("minimap_map_opacity_slider");
        if (slider) {
            var ctrl = slider.FindChildTraverse("Slider");
            if (ctrl) { ctrl.value = state.mapOpacity; }
        }
    }

    function _isDetailViewVisible() {
        var minimapPersp = _panel("minimap_persp");
        var ancestor = minimapPersp;
        while (ancestor) {
            if (ancestor.BHasClass && (ancestor.BHasClass("gDetailView") || ancestor.BHasClass("gScoreboardOpen"))) {
                return true;
            }
            if (!ancestor.GetParent) { break; }
            ancestor = ancestor.GetParent();
        }

        var statePanelIds = [
            "minimap_persp",
            "minimap_persp_wrapper",
            "context_action_container",
            "AbilitiesContainer",
            "cast_failed_box",
            "CheaterVoteBox",
            "DamageReportGlobalClassListener"
        ];

        for (var i = 0; i < statePanelIds.length; i++) {
            var panel = _panel(statePanelIds[i]);
            if (panel && (panel.BHasClass("gDetailView") || panel.BHasClass("gScoreboardOpen"))) {
                return true;
            }
        }

        var ctx = $.GetContextPanel();
        return !!(ctx && (ctx.BHasClass("gDetailView") || ctx.BHasClass("gScoreboardOpen")));
    }

    // When UMM hosts our settings, the in-HUD panel steps aside entirely.
    function setUmmActive(active) {
        _ummActive = !!active;
        if (_ummActive) {
            var actions = _panel("minimap_settings_actions");
            if (actions) { actions.style.visibility = "collapse"; actions.hittest = false; }
            if (_open) { close(true); }
        }
    }

    function _syncActionButtonsVisibility(visible) {
        if (_ummActive) { visible = false; }
        var actions = _panel("minimap_settings_actions");
        if (!actions) { return; }
        actions.style.visibility = visible ? "visible" : "collapse";
        // hittest is a panel property, not CSS: the current build's style setter
        // throws on unknown property names, which used to abort this whole init.
        actions.hittest = visible;

        if (!visible && _open) {
            close(true);
        }
    }

    function _keepMinimapNormalDuringDetailView(active) {
        var minimapPersp = _panel("minimap_persp");
        if (minimapPersp) {
            minimapPersp.SetHasClass("DisableBigMapScaleOnTab", true);
            minimapPersp.style.opacity = "1";
        }

        if (active && typeof QolLiteMapSize !== "undefined" && QolLiteMapSize.applyCurrentSize) {
            QolLiteMapSize.applyCurrentSize();
        }
    }

    function _pollDetailView() {
        if (!_controlsBound) { bindControls(); }
        var detailVisible = _isDetailViewVisible();
        // Only touch our UI on an actual open/close transition. Re-setting
        // visibility/hittest 33x/sec churned input and could interrupt a control
        // mid-interaction (reported mouse hang in the settings).
        if (detailVisible !== _lastDetailVisible) {
            _lastDetailVisible = detailVisible;
            if (typeof QolLiteMapLog !== "undefined") {
                QolLiteMapLog.log("detailView " + (detailVisible ? "OPEN -> showing actions"
                    : "CLOSED -> collapse actions" + (_open ? " + settings window" : "")));
            }
            _syncActionButtonsVisibility(detailVisible);
        }
        if (detailVisible) { _keepMinimapNormalDuringDetailView(true); }
        $.Schedule(0.03, _pollDetailView);
    }

    function init() {
        bindControls();
        _applyTab("overlay");
        _syncMapOpacity();

        var panel = _panel("minimap_settings");
        if (panel) { panel.style.visibility = "collapse"; }
        var actions = _panel("minimap_settings_actions");
        if (actions) {
            actions.style.visibility = "collapse";
            actions.hittest = false;
        }
        _pollDetailView();
    }

    return {
        init: init, open: open, close: close, toggle: toggle,
        applyMapOpacity: _syncMapOpacity, setUmmActive: setUmmActive
    };
})();
