"use strict";

var QolLiteMapPoi = (function () {
    var MAP_NAME = "dl_midtown";

    // Markers are tiny, so type is conveyed by colour alone (owner directive):
    // crate = blue, statue = yellow. No shape/border-radius - which also keeps
    // us clear of the strict JS style setter (no Valve precedent for
    // style.borderRadius; see CURRENT_STATUS checkpoint #1).
    var COLOR = {
        crate: "rgba(74, 158, 255, ",   // blue
        statue: "rgba(255, 207, 74, "   // yellow
    };
    var SMALL_FACTOR = 0.6;             // small POI = base size * factor (min 1px)
    var UNDERGROUND_Z_MAX = 0;          // world z below this = underground POI
    var LEVEL_POLL_SEC = 0.25;
    var SPAWN_TIME_SEC = 180;           // game clock (sec): crates/statues spawn at 3:00

    var _markers = [];                  // { panel, t, small, under }
    var _underground = false;
    var _beforeSpawn = false;

    function _log(msg) {
        if (typeof QolLiteMapLog !== "undefined") { QolLiteMapLog.log("poi: " + msg); }
    }

    function _panel(id) {
        var ctx = $.GetContextPanel();
        return ctx ? ctx.FindChildTraverse(id) : null;
    }

    // The engine toggles `is_underground` somewhere above #map_render (the CSS
    // rule is `.is_underground #map_render`); walking up from map_render finds
    // it wherever it actually lives, so a Valve re-parent won't break us.
    function _isUnderground() {
        var node = _panel("map_render");
        while (node) {
            if (node.BHasClass && node.BHasClass("is_underground")) { return true; }
            node = node.GetParent ? node.GetParent() : null;
        }
        return false;
    }

    // Match-clock seconds from the top-bar GameTime label; null before the
    // clock exists (pregame/loading), which we treat as "already spawned".
    function _gameTimeSeconds() {
        var label = _panel("GameTime");
        if (!label || typeof label.text !== "string") { return null; }
        var mm = label.text.replace(/<[^>]+>/g, "").match(/(\d+):(\d{2})/);
        if (!mm) { return null; }
        return (parseInt(mm[1], 10) * 60) + parseInt(mm[2], 10);
    }

    function _applyMarkerStyle(m) {
        var state = QolLiteMapState.get();
        var base = Number(state.poiMarkerSizePx) || 3;
        var px = m.small ? Math.max(1, Math.round(base * SMALL_FACTOR)) : base;
        var opacity = Math.max(0.01, Math.min(1, Number(state.poiOpacity) || 0.8));
        var p = m.panel;
        p.style.width = px + "px";
        p.style.height = px + "px";
        p.style.transform = "translateX(" + (-px / 2) + "px) translateY(" + (-px / 2) + "px)";
        p.style.backgroundColor = COLOR[m.t] + opacity.toFixed(2) + ")";
        p.style.zIndex = "10";
    }

    function _visible(m, state) {
        if (state.poiFrom3Min && _beforeSpawn) { return false; }
        if (m.t === "crate" && !state.poiCratesEnabled) { return false; }
        if (m.t === "statue" && !state.poiStatuesEnabled) { return false; }
        if (m.small && !state.poiShowSmall) { return false; }
        if (state.poiLevelMode === "auto" && m.under !== _underground) { return false; }
        return true;
    }

    function _applyVisibility() {
        var state = QolLiteMapState.get();
        for (var i = 0; i < _markers.length; i++) {
            _markers[i].panel.style.visibility = _visible(_markers[i], state) ? "visible" : "collapse";
        }
    }

    function _renderMarkers() {
        var host = _panel("minimap_markers");
        if (!host) { _log("#minimap_markers not found, skip render"); return; }
        while (host.GetChildCount() > 0) { host.GetChild(0).DeleteAsync(0); }
        _markers = [];

        var data = (typeof QolLiteMapPoiData !== "undefined") ? QolLiteMapPoiData[MAP_NAME] : null;
        if (!data || !data.pois) { _log("no QolLiteMapPoiData for map " + MAP_NAME); return; }

        for (var i = 0; i < data.pois.length; i++) {
            var p = data.pois[i];
            if (typeof p.u !== "number" || typeof p.v !== "number") { continue; }
            var marker = $.CreatePanel("Panel", host, "poi_" + i);
            marker.style.horizontalAlign = "left";
            marker.style.verticalAlign = "top";
            // x/y are Panorama's position components and accept % of parent
            // (Valve: citadel_shop_mods_list.css). percentX/percentY are NOT real
            // properties and the current build throws on unknown style names.
            marker.style.x = (p.u * 100).toFixed(4) + "%";
            marker.style.y = (p.v * 100).toFixed(4) + "%";
            var m = { panel: marker, t: p.t, small: !!p.small, under: p.z < UNDERGROUND_Z_MAX };
            _applyMarkerStyle(m);
            _markers.push(m);
        }
        _applyVisibility();
    }

    function _applyAllStyles() {
        for (var i = 0; i < _markers.length; i++) { _applyMarkerStyle(_markers[i]); }
    }

    function _pollLevel() {
        var u = _isUnderground();
        if (u !== _underground) {
            _underground = u;
            _log("level -> " + (u ? "underground" : "surface"));
            if (QolLiteMapState.get().poiLevelMode === "auto") { _applyVisibility(); }
        }
        var g = _gameTimeSeconds();
        var before = (g !== null && g < SPAWN_TIME_SEC);
        if (before !== _beforeSpawn) {
            _beforeSpawn = before;
            _log("spawnGate -> " + (before ? "before 3:00 (POI hidden)" : "spawned"));
            _applyVisibility();
        }
        $.Schedule(LEVEL_POLL_SEC, _pollLevel);
    }

    function _bindToggle(id, key, after) {
        var toggle = _panel(id);
        if (!toggle) { return; }
        toggle.SetPanelEvent("onactivate", function () {
            var patch = {};
            patch[key] = !QolLiteMapState.get()[key];
            QolLiteMapState.patch(patch);
            _log(key + " = " + patch[key]);
            _syncControls();
            after();
        });
    }

    function _syncControls() {
        var state = QolLiteMapState.get();
        var pairs = [
            ["minimap_crates_toggle", state.poiCratesEnabled],
            ["minimap_statues_toggle", state.poiStatuesEnabled],
            ["minimap_poi_small_toggle", state.poiShowSmall],
            ["minimap_poi_level_toggle", state.poiLevelMode === "auto"],
            ["minimap_poi_spawn_toggle", state.poiFrom3Min]
        ];
        for (var i = 0; i < pairs.length; i++) {
            var t = _panel(pairs[i][0]);
            if (t && typeof t.SetSelected === "function") { t.SetSelected(pairs[i][1]); }
        }
        var sizeSlider = _panel("minimap_crates_size_slider");
        if (sizeSlider) {
            var sCtrl = sizeSlider.FindChildTraverse("Slider");
            if (sCtrl) { sCtrl.value = state.poiMarkerSizePx; }
        }
        var opSlider = _panel("minimap_crates_opacity_slider");
        if (opSlider) {
            var oCtrl = opSlider.FindChildTraverse("Slider");
            if (oCtrl) { oCtrl.value = state.poiOpacity; }
        }
    }

    function bindControls() {
        _bindToggle("minimap_crates_toggle", "poiCratesEnabled", _applyVisibility);
        _bindToggle("minimap_statues_toggle", "poiStatuesEnabled", _applyVisibility);
        _bindToggle("minimap_poi_small_toggle", "poiShowSmall", _applyVisibility);
        _bindToggle("minimap_poi_spawn_toggle", "poiFrom3Min", _applyVisibility);

        var levelToggle = _panel("minimap_poi_level_toggle");
        if (levelToggle) {
            levelToggle.SetPanelEvent("onactivate", function () {
                var mode = QolLiteMapState.get().poiLevelMode === "auto" ? "both" : "auto";
                QolLiteMapState.patch({ poiLevelMode: mode });
                _log("poiLevelMode = " + mode);
                _syncControls();
                _applyVisibility();
            });
        }

        var sizeSlider = _panel("minimap_crates_size_slider");
        if (sizeSlider) {
            var sCtrl = sizeSlider.FindChildTraverse("Slider");
            if (sCtrl) {
                sCtrl.min = 1;
                sCtrl.max = 8;
                sCtrl.SetPanelEvent("onvaluechanged", function () {
                    var px = Math.max(1, Math.min(8, Math.round(sCtrl.value)));
                    QolLiteMapState.patch({ poiMarkerSizePx: px });
                    _applyAllStyles();
                });
            }
        }

        var opSlider = _panel("minimap_crates_opacity_slider");
        if (opSlider) {
            var oCtrl = opSlider.FindChildTraverse("Slider");
            if (oCtrl) {
                oCtrl.SetPanelEvent("onvaluechanged", function () {
                    var v = Math.max(0.01, Math.min(1.0, Math.round(oCtrl.value * 100) / 100));
                    QolLiteMapState.patch({ poiOpacity: v });
                    _applyAllStyles();
                });
            }
        }

        var resetBtn = _panel("minimap_reset_crates_button");
        if (resetBtn) {
            resetBtn.SetPanelEvent("onactivate", function () {
                var d = QolLiteMapState.DEFAULTS;
                QolLiteMapState.patch({
                    poiCratesEnabled: d.poiCratesEnabled,
                    poiStatuesEnabled: d.poiStatuesEnabled,
                    poiShowSmall: d.poiShowSmall,
                    poiLevelMode: d.poiLevelMode,
                    poiMarkerSizePx: d.poiMarkerSizePx,
                    poiOpacity: d.poiOpacity
                });
                _syncControls();
                _applyAllStyles();
                _applyVisibility();
            });
        }
    }

    function init() {
        _underground = _isUnderground();
        _renderMarkers();
        bindControls();
        _syncControls();
        _pollLevel();

        if (typeof QolLiteMapLog !== "undefined") {
            var c = 0, cs = 0, s = 0, ss = 0;
            for (var i = 0; i < _markers.length; i++) {
                var m = _markers[i];
                if (m.t === "crate") { m.small ? cs++ : c++; }
                else if (m.t === "statue") { m.small ? ss++ : s++; }
            }
            QolLiteMapLog.info("poi: " + _markers.length + " markers (crates " + c + "/" + cs +
                " small, statues " + s + "/" + ss + " small), underground=" + _underground);
        }
    }

    // Re-apply everything from QolLiteMapState. Used when settings change outside
    // the in-HUD panel (e.g. the UMM adapter pushing a value).
    function refresh() {
        _syncControls();
        _applyVisibility();
        _applyAllStyles();
    }

    return { init: init, refresh: refresh };
})();
