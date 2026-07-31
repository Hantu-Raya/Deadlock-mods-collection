"use strict";

// Minimap position. Moves the whole minimap by setting align + margin on
// #minimap_persp_wrapper - the positioning hook that already mirrors the vanilla
// #minimap_persp anchor (bottom-right). A corner dropdown picks the anchor
// (bottom/top x right/left); two offset sliders nudge it as a FRACTION of the
// free travel: margin = offset * (container - mapSize). 0 = at the anchored
// edge, 1 = flush against the opposite edge. Percentages keep the placement
// resolution-independent and, since offset is bounded to [0,1], the map stays on
// screen by construction (and auto-tightens when the map is enlarged). Overlay
// markers live inside #minimap_container, so they move with the map.
//
// No drag: the cursor is captured during play (the HUD context has no cursor
// API), which is why the old drag module was removed - placement is settings-
// driven only. Mirrors qollite_map_size.js (same wrapper family, apply-from-state).
var QolLiteMapPosition = (function () {
    var FALLBACK_W = 1920, FALLBACK_H = 1080;   // used until the HUD has laid out (actuallayout* = 0)
    var EDGE_GAP = 15;                            // min edge margin (vanilla ~15px) so the map never sits flush

    // Corner enum <-> the dropdown option ids in the layout.
    var CORNERS = [
        { id: "minimap_corner_br", value: "bottom-right" },
        { id: "minimap_corner_bl", value: "bottom-left" },
        { id: "minimap_corner_tr", value: "top-right" },
        { id: "minimap_corner_tl", value: "top-left" }
    ];

    function _ctx() { return $.GetContextPanel(); }
    function _panel(id) { var c = _ctx(); return c ? c.FindChildTraverse(id) : null; }
    function _log(m) { if (typeof QolLiteMapLog !== "undefined") { QolLiteMapLog.log("pos: " + m); } }

    function _corner() {
        var v = String(QolLiteMapState.get().minimapCorner || "bottom-right");
        return { left: v.indexOf("left") >= 0, top: v.indexOf("top") >= 0, value: v };
    }
    function _optionIdFor(value) {
        for (var i = 0; i < CORNERS.length; i++) { if (CORNERS[i].value === value) { return CORNERS[i].id; } }
        return CORNERS[0].id;
    }
    function _frac(v) { v = Number(v); if (isNaN(v) || v < 0) { return 0; } return v > 1 ? 1 : v; }

    // margin from the anchored edge: a fixed EDGE_GAP plus `frac` of the travel
    // beyond it, never pushing the far edge past the opposite side.
    function _margin(frac, span, M) {
        var free = Math.max(0, span - M - EDGE_GAP);
        return Math.round(Math.min(EDGE_GAP + frac * free, Math.max(0, span - M)));
    }

    // The wrapper's margins are relative to its PARENT (#minimap_ui_clamp_container),
    // so that container's laid-out box is the free-travel space.
    function _bounds(wrap) {
        var p = wrap && wrap.GetParent ? wrap.GetParent() : null;
        var w = p && p.actuallayoutwidth ? p.actuallayoutwidth : 0;
        var h = p && p.actuallayoutheight ? p.actuallayoutheight : 0;
        return { w: w > 0 ? w : FALLBACK_W, h: h > 0 ? h : FALLBACK_H };
    }

    function _mapSize() {
        var s = QolLiteMapState.get();
        var px = Number(s.minimapSizePx) || 400;
        var min = s.minimapSizeMinPx || 200, max = s.minimapSizeMaxPx || 800;
        return Math.max(min, Math.min(max, px));
    }

    function apply() {
        var wrap = _panel("minimap_persp_wrapper");
        if (!wrap) { return; }
        var s = QolLiteMapState.get();
        var c = _corner();
        var b = _bounds(wrap), M = _mapSize();
        var fx = _frac(s.minimapOffsetX), fy = _frac(s.minimapOffsetY);
        var mH = _margin(fx, b.w, M);
        var mV = _margin(fy, b.h, M);

        wrap.style.horizontalAlign = c.left ? "left" : "right";
        wrap.style.verticalAlign = c.top ? "top" : "bottom";
        wrap.style.marginLeft = "0px"; wrap.style.marginRight = "0px";
        wrap.style.marginTop = "0px"; wrap.style.marginBottom = "0px";
        wrap.style[c.left ? "marginLeft" : "marginRight"] = mH + "px";
        wrap.style[c.top ? "marginTop" : "marginBottom"] = mV + "px";

        // Persist the sanitised fractions (defensive - clamps any out-of-range
        // saved value from UMM back into [0,1]).
        if (fx !== Number(s.minimapOffsetX) || fy !== Number(s.minimapOffsetY)) {
            QolLiteMapState.patch({ minimapOffsetX: fx, minimapOffsetY: fy });
        }
        // Diagnostic (DEBUG): confirms the container bounds and that the wrapper
        // actually grows with the map.
        _log("apply: corner=" + c.value + " bounds=" + Math.round(b.w) + "x" + Math.round(b.h) +
            " map=" + M + " wrap=" + Math.round(wrap.actuallayoutwidth || 0) + "x" +
            Math.round(wrap.actuallayoutheight || 0) + " frac=" + fx.toFixed(2) + "," + fy.toFixed(2) +
            " margin=" + mH + "," + mV);
        _syncControls();
    }

    function _syncControls() {
        var s = QolLiteMapState.get();
        var dd = _panel("minimap_corner_dropdown");
        if (dd && typeof dd.SetSelected === "function") {
            try { dd.SetSelected(_optionIdFor(s.minimapCorner)); } catch (e) {}
        }
        _syncSlider("minimap_offset_x_slider", s.minimapOffsetX);
        _syncSlider("minimap_offset_y_slider", s.minimapOffsetY);
    }

    // The sliders are percentage widgets (value 0..1), so we just set the value;
    // the widget renders the "%" text itself.
    function _syncSlider(id, value) {
        var row = _panel(id);
        if (!row || !row.FindChildTraverse) { return; }
        var ctrl = row.FindChildTraverse("Slider");
        if (ctrl) { ctrl.value = _frac(value); }
    }

    function _bindCorner() {
        var dd = _panel("minimap_corner_dropdown");
        if (!dd) { return; }
        for (var i = 0; i < CORNERS.length; i++) {
            (function (value) {
                var opt = _panel(CORNERS[i].id);
                if (opt && opt.SetPanelEvent) {
                    opt.SetPanelEvent("onactivate", function () {
                        QolLiteMapState.patch({ minimapCorner: value });
                        apply();
                    });
                }
            })(CORNERS[i].value);
        }
    }

    function _bindSlider(id, key) {
        var row = _panel(id);
        if (!row || !row.FindChildTraverse) { return; }
        var ctrl = row.FindChildTraverse("Slider");
        if (!ctrl) { return; }
        ctrl.SetPanelEvent("onvaluechanged", function () {
            var patch = {}; patch[key] = _frac(ctrl.value);
            QolLiteMapState.patch(patch);
            apply();
        });
    }

    function init() {
        _bindCorner();
        _bindSlider("minimap_offset_x_slider", "minimapOffsetX");
        _bindSlider("minimap_offset_y_slider", "minimapOffsetY");
        apply();
        // Re-apply once the HUD has certainly laid out, so the travel uses real
        // container bounds (actuallayout* can be 0 on the first frame).
        $.Schedule(0.5, apply);
    }

    function refresh() { apply(); }

    return { init: init, apply: apply, refresh: refresh };
})();
