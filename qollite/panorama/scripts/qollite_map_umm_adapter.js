"use strict";

// Universal Mod Manager (UMM) adapter.
//
// When a UMM core is present it hosts BetterMap's settings as a tab in its
// shared window AND owns persistence - Panorama has no storage API, and UMM's
// server-side hero-build-description trick is the only channel that survives a
// restart (see docs/knowledge/panorama_notes.md). Standalone is unaffected:
// without UMM this module simply never hears back, and the in-HUD settings panel
// stays the settings UI + there is no persistence (memory only).
//
// Protocol, verified against the decompiled core
// (references/mods/Mod Manager/panorama/scripts/umm_core.js):
//   bus         = "ClientUI_FireOutput"; JSON payloads namespaced by {umm:1}
//   mod  -> core  {umm:1, t:"register", id, name, settings, values}
//   core -> mod   {umm:1, t:"hello"}              (re-announce -> resend register)
//   core -> mod   {umm:1, t:"set", id, key, value}
// The core replays every value back as `set` right after a register, which is
// how a returning player's saved values arrive - we just apply what we're told.
var QolLiteMapUmmAdapter = (function () {
    var CHANNEL = "ClientUI_FireOutput";
    var PROTOCOL = 1;
    var MOD_ID = "bettermap";
    var MOD_NAME = "BetterMap";

    // One entry per UMM widget, mapped to QolLiteMapState. `key` = a 1:1 state
    // key; get/set instead when the widget value needs a transform (level mode
    // <-> bool, opacity fraction <-> integer percent for a nicer slider).
    var SCHEMA = [
        { id: "poiCratesEnabled",  type: "toggle", label: "Show Crates",         key: "poiCratesEnabled" },
        { id: "poiStatuesEnabled", type: "toggle", label: "Show Golden Statues", key: "poiStatuesEnabled" },
        { id: "poiShowSmall",      type: "toggle", label: "Show Small Objects",  key: "poiShowSmall" },
        { id: "poiFrom3Min",       type: "toggle", label: "Objects From 3:00",   key: "poiFrom3Min" },
        {
            id: "poiLevelAuto", type: "toggle", label: "Auto Level (Underground)",
            get: function (s) { return s.poiLevelMode === "auto"; },
            set: function (v) { return { poiLevelMode: v ? "auto" : "both" }; }
        },
        { id: "poiMarkerSizePx", type: "slider", label: "Marker Size", min: 1, max: 8, step: 1, unit: "px", key: "poiMarkerSizePx" },
        {
            id: "poiOpacityPct", type: "slider", label: "Marker Opacity", min: 10, max: 100, step: 5, unit: "%",
            get: function (s) { return Math.round((Number(s.poiOpacity) || 0.8) * 100); },
            set: function (v) { return { poiOpacity: Math.max(0.01, Math.min(1, v / 100)) }; }
        },
        { id: "minimapSizePx", type: "slider", label: "Minimap Size", min: 200, max: 800, step: 20, unit: "px", key: "minimapSizePx" },
        {
            id: "mapOpacityPct", type: "slider", label: "Map Opacity", min: 10, max: 100, step: 5, unit: "%",
            get: function (s) { return Math.round((Number(s.mapOpacity) || 0.95) * 100); },
            set: function (v) { return { mapOpacity: Math.max(0.01, Math.min(1, v / 100)) }; }
        },
        {
            id: "minimalMapOpacityPct", type: "slider", label: "Minimalist Map Opacity", min: 0, max: 100, step: 5, unit: "%",
            get: function (s) {
                var value = Number(s.minimalMapOpacity);
                return Math.round((isNaN(value) ? 0.9 : Math.max(0, Math.min(1, value))) * 100);
            },
            set: function (v) { return { minimalMapOpacity: Math.max(0, Math.min(1, Number(v) / 100)) }; }
        },
        {
            id: "minimapCorner", type: "select", label: "Minimap Corner", key: "minimapCorner",
            options: [
                { value: "bottom-right", label: "Bottom-Right" },
                { value: "bottom-left", label: "Bottom-Left" },
                { value: "top-right", label: "Top-Right" },
                { value: "top-left", label: "Top-Left" }
            ]
        },
        {
            id: "minimapOffsetXPct", type: "slider", label: "Minimap Offset X", min: 0, max: 100, step: 5, unit: "%",
            get: function (s) { return Math.round((Number(s.minimapOffsetX) || 0) * 100); },
            set: function (v) { return { minimapOffsetX: Math.max(0, Math.min(1, v / 100)) }; }
        },
        {
            id: "minimapOffsetYPct", type: "slider", label: "Minimap Offset Y", min: 0, max: 100, step: 5, unit: "%",
            get: function (s) { return Math.round((Number(s.minimapOffsetY) || 0) * 100); },
            set: function (v) { return { minimapOffsetY: Math.max(0, Math.min(1, v / 100)) }; }
        },
        { id: "hudFullWidth", type: "toggle", label: "Full-Width HUD", key: "hudFullWidth" },
        { id: "minimalMap", type: "toggle", label: "Minimalist Minimap", key: "minimalMap" },
        { id: "ultLargeMapEnabled", type: "toggle", label: "Larger Map When Targeting", key: "ultLargeMapEnabled" },
        { id: "urnTrackerEnabled", type: "toggle", label: "Urn Spawn Tracker", key: "urnTrackerEnabled" }
    ];

    var _present = false;

    function _widgetValue(entry, state) {
        return entry.get ? entry.get(state) : state[entry.key];
    }

    function _send(payload) {
        try { $.DispatchEvent(CHANNEL, JSON.stringify(payload)); } catch (e) {}
    }

    function _register() {
        var state = QolLiteMapState.get();
        var settings = [];
        var values = {};
        for (var i = 0; i < SCHEMA.length; i++) {
            var e = SCHEMA[i];
            var w = { id: e.id, type: e.type, label: e.label };
            if (e.type === "slider") {
                w.min = e.min; w.max = e.max; w.step = e.step; w.unit = e.unit;
            } else if (e.type === "select") {
                w.options = e.options;
            }
            var v = _widgetValue(e, state);
            w["default"] = v;
            settings.push(w);
            values[e.id] = v;
        }
        _send({ umm: PROTOCOL, t: "register", id: MOD_ID, name: MOD_NAME, settings: settings, values: values });
    }

    // Re-sync every subsystem from state; idempotent, so applying one `set` this
    // way is fine even though it refreshes all three.
    function _applyAll() {
        if (typeof QolLiteMapPoi !== "undefined" && QolLiteMapPoi.refresh) { QolLiteMapPoi.refresh(); }
        if (typeof QolLiteMapSize !== "undefined" && QolLiteMapSize.apply) { QolLiteMapSize.apply(); }
        if (typeof QolLiteMapSize !== "undefined" && QolLiteMapSize.applyClampWidth) { QolLiteMapSize.applyClampWidth(); }
        if (typeof QolLiteMapPosition !== "undefined" && QolLiteMapPosition.apply) { QolLiteMapPosition.apply(); }
        if (typeof QolLiteMapSettings !== "undefined" && QolLiteMapSettings.applyMapOpacity) { QolLiteMapSettings.applyMapOpacity(); }
        if (typeof QolLiteMapMinimal !== "undefined" && QolLiteMapMinimal.refresh) { QolLiteMapMinimal.refresh(); }
        if (typeof QolLiteMapUrn !== "undefined" && QolLiteMapUrn.refresh) { QolLiteMapUrn.refresh(); }
    }

    function _entryByWidgetId(id) {
        for (var i = 0; i < SCHEMA.length; i++) { if (SCHEMA[i].id === id) { return SCHEMA[i]; } }
        return null;
    }

    function _onSet(key, value) {
        var e = _entryByWidgetId(key);
        if (!e) { return; }
        var patch = e.set ? e.set(value) : (function () { var o = {}; o[e.key] = value; return o; })();
        QolLiteMapState.patch(patch);
        _applyAll();
        if (typeof QolLiteMapLog !== "undefined") { QolLiteMapLog.log("umm: set " + key + " = " + value); }
    }

    function _markPresent() {
        if (_present) { return; }
        _present = true;
        if (typeof QolLiteMapLog !== "undefined") { QolLiteMapLog.info("umm: core present - deferring settings UI to UMM"); }
        // UMM now hosts settings + persistence; retire our own in-HUD panel so
        // there is one source of truth. (Standalone stays the no-UMM fallback.)
        if (typeof QolLiteMapSettings !== "undefined" && QolLiteMapSettings.setUmmActive) {
            QolLiteMapSettings.setUmmActive(true);
        }
    }

    function _onMessage(payload) {
        if (typeof payload !== "string" || payload.indexOf("\"umm\"") === -1) { return; }
        var msg;
        try { msg = JSON.parse(payload); } catch (e) { return; }
        if (!msg || msg.umm !== PROTOCOL) { return; }

        if (msg.t === "hello") {
            _markPresent();
            _register();
        } else if (msg.t === "set" && msg.id === MOD_ID) {
            _markPresent();
            _onSet(msg.key, msg.value);
        }
    }

    function init() {
        try { $.RegisterForUnhandledEvent(CHANNEL, _onMessage); } catch (e) {}
        _register();
    }

    return { init: init };
})();
