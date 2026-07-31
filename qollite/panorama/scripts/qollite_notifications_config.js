"use strict";
// Runtime config for the notifier (overlay context). This is the seam the settings module
// (own panel + UMM adapter) will drive; for now it is edited by hand. The first three fields
// are the player-facing settings:
//   enabled     - master on/off for the whole mod
//   showSpawn   - show the "Available now" toast when the event spawns
//   showWarning - show the pre-spawn warning (+ warnSecs = how far ahead, the dropdown)
//   soundEnabled- play a short native cue when an event becomes available
var QolLiteNotificationsConfig = {
    enabled: true,
    showSpawn: true,
    showWarning: true,
    warnSecs: 15,        // seconds before spawn to warn; dropdown: 5 | 10 | 15 | 30

    soundEnabled: true,  // play soundEvent on spawn only (not on warnings); toggle "Sound" in UMM
    // A native Deadlock UI sound. Swap to taste (all confirmed in soundevents/ui.vsndevts):
    //   "UI.RevealVote"            - reward/reveal chime (chosen)
    //   "UI.Notify.ItemPurchase"   - UI notification chime
    //   "UI.Shop.TierBonus.Pip"    - short, subtle pip
    //   "Base.UI.ItemDraft.Appear" - "something appeared" sting
    //   "UI.Shop.Mod.Activate"     - activation click
    soundEvent: "UI.RevealVote",

    // Per-event toggles - which events notify. All on by default. Keys are schedule ids
    // (+ soul_urn for the live detector). A false here mutes that event's warn + spawn.
    events: {
        weak_camps: true,
        breakables: true,
        medium_camps: true,
        bridge_buffs: true,
        strong_camps: true,
        sinners_sacrifice: true,
        soul_urn: true
    },

    durationSecs: 6,     // how long a toast shows (matches the game's ToastManager ~5-6s)
    graceSecs: 5,        // late-init: show an event at most this long after its trigger
    debugSchedule: false // true -> mid-match debug schedule (see qollite_notifications_scheduler.js) for fast checks
};
