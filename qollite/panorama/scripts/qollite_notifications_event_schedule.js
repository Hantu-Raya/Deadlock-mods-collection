"use strict";
// Static event schedule (timing data only). Times in seconds from match start;
// repeatInterval=null -> one-time. Display names live in qollite_notifications_strings.js (localized),
// keyed by `id`. Timings cross-checked against the Bridge Buff Timer reference +
// BetterMap's crate-spawn commit (docs/knowledge/event_timings.md); the pipeline task
// confirms/replaces this later.
var QolLiteNotificationsEventSchedule = [
    { id: "weak_camps",        initialTime: 120, repeatInterval: null, defaultEnabled: true },
    { id: "breakables",        initialTime: 180, repeatInterval: null, defaultEnabled: true },
    { id: "medium_camps",      initialTime: 300, repeatInterval: null, defaultEnabled: true },
    { id: "bridge_buffs",      initialTime: 300, repeatInterval: 300,  defaultEnabled: true },
    { id: "strong_camps",      initialTime: 480, repeatInterval: null, defaultEnabled: true },
    { id: "sinners_sacrifice", initialTime: 480, repeatInterval: null, defaultEnabled: true },
    // Soul Urn: its SPAWN is detected live off the minimap idol_spawn marker (qollite_notifications_urn_detector.js,
    // every appearance). warnOnly here adds the pre-spawn WARNING for the FIRST urn (~10:00)
    // - which coincides with a Bridge Buffs cycle, so they share one "Bridge Buffs & Soul
    // Urn" warning. warnOnly = the scheduler never fires its spawn (the live detector does).
    { id: "soul_urn",          initialTime: 600, repeatInterval: null, warnOnly: true, defaultEnabled: true }
];
