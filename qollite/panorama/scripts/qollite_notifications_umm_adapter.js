"use strict";
// Universal Mod Manager (UMM) adapter (overlay context). Registers the notifier's
// settings into UMM's shared window when a core is present and applies values it sends
// back. It is bus-based (ClientUI_FireOutput), so it runs from our isolated overlay
// context with no panel mounting. Protocol mirrors qollite_map_umm_adapter.js / umm_core.js:
//   mod  -> core  {umm:1, t:"register", id, name, settings, values}
//   core -> mod   {umm:1, t:"hello"}            -> resend register
//   core -> mod   {umm:1, t:"set", id, key, value}
// The core replays saved values back as `set` after a register, which is how a
// returning player's persisted settings arrive (UMM owns persistence; Panorama has none).
var QolLiteNotificationsUmmAdapter = (function () {
    var CHANNEL = "ClientUI_FireOutput";
    var PROTOCOL = 1;
    var MOD_ID = "eventnotifier";        // internal id (keeps UMM-saved settings stable)
    var MOD_NAME = "Map Event Reminders"; // display name shown in UMM's window

    // One widget per player-facing setting, mapped 1:1 onto QolLiteNotificationsConfig.
    var SCHEMA = [
        { id: "enabled",     type: "toggle", label: "Enable Notifications", key: "enabled" },
        { id: "showSpawn",   type: "toggle", label: "Notify On Spawn",      key: "showSpawn" },
        { id: "showWarning", type: "toggle", label: "Notify Before Spawn",  key: "showWarning" },
        {
            id: "warnSecs", type: "select", label: "Warn Ahead", key: "warnSecs",
            options: [
                { label: "5 seconds",  value: 5 },
                { label: "10 seconds", value: 10 },
                { label: "15 seconds", value: 15 },
                { label: "30 seconds", value: 30 }
            ],
            coerce: function (v) { return Number(v); }
        },
        { id: "soundEnabled", type: "toggle", label: "Sound", key: "soundEnabled" }
    ];

    // Per-event toggles (which events notify). Appended under an "Events" header. Each maps
    // to QolLiteNotificationsConfig.events[id] via get/set; default on.
    (function () {
        var EVENTS = [
            ["weak_camps", "Weak Camps"], ["breakables", "Crates & Statues"],
            ["medium_camps", "Medium Camps"], ["bridge_buffs", "Bridge Buffs"],
            ["strong_camps", "Strong Camps"], ["sinners_sacrifice", "Sinner's Sacrifice"],
            ["soul_urn", "Soul Urn"]
        ];
        SCHEMA.push({ id: "ev_group", type: "group", label: "Events" });
        for (var i = 0; i < EVENTS.length; i++) {
            (function (id, label) {
                SCHEMA.push({
                    id: "ev_" + id, type: "toggle", label: label,
                    get: function () { return !QolLiteNotificationsConfig.events || QolLiteNotificationsConfig.events[id] !== false; },
                    set: function (v) { if (!QolLiteNotificationsConfig.events) { QolLiteNotificationsConfig.events = {}; } QolLiteNotificationsConfig.events[id] = !!v; }
                });
            })(EVENTS[i][0], EVENTS[i][1]);
        }
    })();

    var _present = false;

    function _value(entry) { return entry.get ? entry.get() : QolLiteNotificationsConfig[entry.key]; }

    function _send(payload) { try { $.DispatchEvent(CHANNEL, JSON.stringify(payload)); } catch (e) {} }

    function _register() {
        var settings = [], values = {};
        for (var i = 0; i < SCHEMA.length; i++) {
            var e = SCHEMA[i];
            var w = { id: e.id, type: e.type, label: e.label };
            if (e.type === "group") { settings.push(w); continue; }   // header row, carries no value
            if (e.type === "select") { w.options = e.options; }
            var v = _value(e);
            w["default"] = v;
            settings.push(w);
            values[e.id] = v;
        }
        _send({ umm: PROTOCOL, t: "register", id: MOD_ID, name: MOD_NAME, settings: settings, values: values });
    }

    function _entry(id) {
        for (var i = 0; i < SCHEMA.length; i++) { if (SCHEMA[i].id === id) { return SCHEMA[i]; } }
        return null;
    }

    function _onSet(key, value) {
        var e = _entry(key);
        if (!e) { return; }
        var v = e.coerce ? e.coerce(value) : value;
        if (e.set) { e.set(v); } else { QolLiteNotificationsConfig[e.key] = v; }
        // The scheduler reads QolLiteNotificationsConfig live each tick, so most changes take effect
        // immediately; clear any on-screen toasts when the whole mod is turned off.
        if (!QolLiteNotificationsConfig.enabled && typeof QolLiteNotificationsManager !== "undefined") { QolLiteNotificationsManager.clearAll(); }
        QolLiteNotificationsLog.log("umm: set " + key + " = " + v);
    }

    function _markPresent() {
        if (_present) { return; }
        _present = true;
        QolLiteNotificationsLog.info("umm: core present - settings hosted in UMM");
        // (when the standalone in-HUD panel exists, retire it here for one source of truth)
    }

    function _onMessage(payload) {
        if (typeof payload !== "string" || payload.indexOf("\"umm\"") === -1) { return; }
        var msg;
        try { msg = JSON.parse(payload); } catch (e) { return; }
        if (!msg || msg.umm !== PROTOCOL) { return; }

        if (msg.t === "hello") { _markPresent(); _register(); }
        else if (msg.t === "set" && msg.id === MOD_ID) { _markPresent(); _onSet(msg.key, msg.value); }
    }

    function init() {
        try { $.RegisterForUnhandledEvent(CHANNEL, _onMessage); } catch (e) {}
        _register();
    }

    return { init: init };
})();
