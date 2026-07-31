"use strict";

var QolLiteMapState = (function () {
    var DEFAULTS = {
        poiCratesEnabled: false,
        poiStatuesEnabled: false,
        poiShowSmall: false,       // off by default; every crate/POI display toggle starts disabled
        poiLevelMode: "auto",      // "auto" = follow is_underground, "both" = show all levels
        poiMarkerSizePx: 3,
        poiOpacity: 0.8,
        poiFrom3Min: true,        // only show crates/statues once they spawn (3:00)
        minimapSizePx: 400,
        minimapSizeMinPx: 200,
        minimapSizeMaxPx: 800,
        minimapSizeStepPx: 20,
        mapOpacity: 0.95,
        minimalMapOpacity: 0.9,
        minimapCorner: "bottom-right", // "bottom-right" | "bottom-left" | "top-right" | "top-left"
        minimapOffsetX: 0,             // fraction 0..1 of the free travel from the anchored horizontal edge
        minimapOffsetY: 0,             // fraction 0..1 of the free travel from the anchored vertical edge
        hudFullWidth: false,           // remove the 2000px clamp_width cap -> map can use full monitor width
        minimalMap: false,
        ultLargeMapEnabled: true,      // on by default; enlarge the minimap while aiming a map ability (Mirage Traveler)
        urnTrackerEnabled: false       // off by default (opt-in): predicts an objective, a
                                       // grey-area category in Deadlock - let the player choose it
    };

    var _state = null;

    function reset() {
        _state = {};
        for (var k in DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
                _state[k] = DEFAULTS[k];
            }
        }
    }

    function get() {
        if (!_state) { reset(); }
        return _state;
    }

    function patch(obj) {
        if (!_state) { reset(); }
        for (var k in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) {
                _state[k] = obj[k];
            }
        }
    }

    reset();

    return {
        DEFAULTS: DEFAULTS,
        get: get,
        patch: patch,
        reset: reset
    };
})();
