"use strict";

// Minimalist minimap: strips the decorative chrome (frame, blur, dark backing,
// old flat background, zipline lanes, neutral/upper overlays) down to just the
// map render + markers. The toggle class is set on BOTH #hud_minimap and
// #minimap_persp because the two sets of layers live in different style scopes:
// the map's own layers are inside the C++ HudMinimap panel (styled by our
// hud_minimap.vcss copy that the panel loads), the frame/blur/backing are our
// wrapper panels in hud.vcss - a class on only one wouldn't reach both.
var QolLiteMapMinimal = (function () {
    var CLASS = "BmMinimalMap";

    function _panel(id) {
        var ctx = $.GetContextPanel();
        return ctx ? ctx.FindChildTraverse(id) : null;
    }

    function _minimalMapOpacity() {
        var value = Number(QolLiteMapState.get().minimalMapOpacity);
        if (isNaN(value)) { value = QolLiteMapState.DEFAULTS.minimalMapOpacity; }
        return Math.max(0, Math.min(1, value));
    }
    function _setBaseMapOpacity(opacity) {
        var ctx = $.GetContextPanel();
        if (!ctx) { return; }
        var canvas = ctx.FindChildTraverse ? ctx.FindChildTraverse("canvas") : null;
        if (canvas && canvas.style) { canvas.style.opacity = opacity; }
        var backgrounds = ctx.FindChildrenWithClassTraverse
            ? (ctx.FindChildrenWithClassTraverse("backgroundImage") || [])
            : [];
        for (var i = 0; i < backgrounds.length; i++) {
            if (backgrounds[i] !== canvas && backgrounds[i].style) {
                backgrounds[i].style.opacity = opacity;
            }
        }
    }


    function _apply() {
        var on = !!QolLiteMapState.get().minimalMap;
        var hud = _panel("hud_minimap");
        if (hud && hud.SetHasClass) { hud.SetHasClass(CLASS, on); }
        var persp = _panel("minimap_persp");
        if (persp && persp.SetHasClass) { persp.SetHasClass(CLASS, on); }
        _setBaseMapOpacity(on ? String(_minimalMapOpacity()) : "1.0");
    }

    function _syncControls() {
        var state = QolLiteMapState.get();
        var t = _panel("minimap_minimal_toggle");
        if (t && typeof t.SetSelected === "function") { t.SetSelected(!!state.minimalMap); }
        var slider = _panel("minimap_minimal_opacity_slider");
        if (slider) {
            var ctrl = slider.FindChildTraverse("Slider");
            if (ctrl) { ctrl.value = _minimalMapOpacity(); }
        }
    }

    function bindControls() {
        var t = _panel("minimap_minimal_toggle");
        if (t) {
            t.SetPanelEvent("onactivate", function () {
                QolLiteMapState.patch({ minimalMap: !QolLiteMapState.get().minimalMap });
                _syncControls();
                _apply();
            });
        }

        var slider = _panel("minimap_minimal_opacity_slider");
        if (slider) {
            var ctrl = slider.FindChildTraverse("Slider");
            if (ctrl) {
                ctrl.SetPanelEvent("onvaluechanged", function () {
                    var value = Math.max(0, Math.min(1, Math.round(ctrl.value * 100) / 100));
                    QolLiteMapState.patch({ minimalMapOpacity: value });
                    _apply();
                });
            }
        }
    }

    function init() {
        bindControls();
        _syncControls();
        _apply();
    }

    // Re-apply from state; used when the value changes outside the in-HUD panel
    // (the UMM adapter pushing a value).
    function refresh() {
        _syncControls();
        _apply();
    }

    return { init: init, refresh: refresh };
})();
