"use strict";

var QolLiteMapSize = (function () {
    var DEFAULT_UI_CLAMP_WIDTH = 2000;   // the vanilla clamp_width cap
    var FULL_WIDTH_PX = 10000;           // effectively "no cap" - HUD/minimap spans the full monitor
    var ULT_LARGE_PX = 750;             // minimap size while a map ability is aimed (Mirage Traveler)
    var MT_POLL_SEC = 0.06;
    var _ultActive = false;

    function _panel(id) {
        var ctx = $.GetContextPanel();
        return ctx ? ctx.FindChildTraverse(id) : null;
    }

    function _applyContainerSize(px) {
        var size = px + "px";
        var persp = _panel("minimap_persp");
        if (persp) { persp.style.width = size; persp.style.height = size; }
        var container = _panel("minimap_container");
        if (container) { container.style.width = size; container.style.height = size; }
        var frame = _panel("minimap_frame");
        if (frame) { frame.style.width = size; frame.style.height = size; }
    }

    function _sanitizeSize(value) {
        var state = QolLiteMapState.get();
        var min = state.minimapSizeMinPx;
        var max = state.minimapSizeMaxPx;
        var step = state.minimapSizeStepPx;
        var px = Math.round(Number(value) / step) * step;
        return Math.max(min, Math.min(max, px || state.minimapSizePx));
    }

    function apply() {
        var state = QolLiteMapState.get();
        var px = _sanitizeSize(state.minimapSizePx);
        _applyContainerSize(px);

        var slider = _panel("minimap_size_slider");
        if (slider) {
            var ctrl = slider.FindChildTraverse("Slider");
            if (ctrl) { ctrl.value = px; }
            var entry = slider.FindChildTraverse("TextEntry");
            if (entry) { entry.text = String(px); }
        }
        // A larger map shrinks how far the position offset can go before the map
        // runs off screen; re-clamp the placement against the new size.
        if (typeof QolLiteMapPosition !== "undefined" && QolLiteMapPosition.apply) { QolLiteMapPosition.apply(); }
    }

    function applyCurrentSize() {
        var state = QolLiteMapState.get();
        _applyContainerSize(_sanitizeSize(state.minimapSizePx));
    }

    // The vanilla minimap area sits in a clamp_width container capped at 2000px
    // (centred), so on wide monitors it never reaches the physical edge. The
    // Full-Width HUD toggle lifts that cap so the minimap can use the whole width.
    function applyClampWidth() {
        var clamp = _panel("minimap_ui_clamp_container");
        if (!clamp) { return; }
        var full = !!QolLiteMapState.get().hudFullWidth;
        clamp.style.maxWidth = (full ? FULL_WIDTH_PX : DEFAULT_UI_CLAMP_WIDTH) + "px";
    }

    function _bindFullWidthToggle() {
        var t = _panel("minimap_full_width_toggle");
        if (!t) { return; }
        if (typeof t.SetSelected === "function") { t.SetSelected(!!QolLiteMapState.get().hudFullWidth); }
        t.SetPanelEvent("onactivate", function () {
            QolLiteMapState.patch({ hudFullWidth: !QolLiteMapState.get().hudFullWidth });
            if (typeof t.SetSelected === "function") { t.SetSelected(!!QolLiteMapState.get().hudFullWidth); }
            applyClampWidth();
            // the usable width changed -> re-clamp the map's position offsets.
            if (typeof QolLiteMapPosition !== "undefined" && QolLiteMapPosition.apply) { QolLiteMapPosition.apply(); }
        });
    }

    function bindSlider() {
        var slider = _panel("minimap_size_slider");
        if (!slider) { return; }
        var ctrl = slider.FindChildTraverse("Slider");
        if (!ctrl) { return; }

        var state = QolLiteMapState.get();
        ctrl.min = state.minimapSizeMinPx;
        ctrl.max = state.minimapSizeMaxPx;
        ctrl.value = _sanitizeSize(state.minimapSizePx);

        ctrl.SetPanelEvent("onvaluechanged", function () {
            var px = _sanitizeSize(ctrl.value);
            QolLiteMapState.patch({ minimapSizePx: px });
            apply();
        });
    }

    // True while a map-targeted ability is being aimed. The engine sets
    // `map_targeting` on an ancestor of the minimap markers; walk up from
    // map_render so we catch it wherever it lives (same idiom as the POI
    // underground check). Verify in-game that Mirage's Traveler triggers it.
    function _isMapTargeting() {
        var node = _panel("map_render");
        while (node) {
            if (node.BHasClass && node.BHasClass("map_targeting")) { return true; }
            node = node.GetParent ? node.GetParent() : null;
        }
        return false;
    }

    function _pollMapTargeting() {
        var on = !!QolLiteMapState.get().ultLargeMapEnabled && _isMapTargeting();
        if (on !== _ultActive) {
            _ultActive = on;
            if (typeof QolLiteMapLog !== "undefined") {
                QolLiteMapLog.log("size: map_targeting -> " + (on ? "enlarge" : "restore"));
            }
            if (on) { _applyContainerSize(ULT_LARGE_PX); } else { applyCurrentSize(); }
        }
        $.Schedule(MT_POLL_SEC, _pollMapTargeting);
    }

    function _bindUltToggle() {
        var t = _panel("minimap_ult_map_toggle");
        if (!t) { return; }
        if (typeof t.SetSelected === "function") { t.SetSelected(!!QolLiteMapState.get().ultLargeMapEnabled); }
        t.SetPanelEvent("onactivate", function () {
            QolLiteMapState.patch({ ultLargeMapEnabled: !QolLiteMapState.get().ultLargeMapEnabled });
            if (typeof t.SetSelected === "function") { t.SetSelected(!!QolLiteMapState.get().ultLargeMapEnabled); }
        });
    }

    function init() {
        bindSlider();
        apply();
        applyClampWidth();
        _bindFullWidthToggle();
        _bindUltToggle();
        _pollMapTargeting();
    }

    return { init: init, apply: apply, applyCurrentSize: applyCurrentSize, applyClampWidth: applyClampWidth };
})();
