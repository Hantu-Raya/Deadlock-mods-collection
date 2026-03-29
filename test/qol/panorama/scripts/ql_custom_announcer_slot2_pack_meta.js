"use strict";

(function() {
    try {
        if (!(typeof globalThis === "object" && globalThis)) return;

        if (!globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS || typeof globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS !== "object") {
            globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS = {};
        }

        var slotKey = "2";
        var existing = globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS[slotKey];
        if (!existing || typeof existing !== "object") {
            existing = { name: "", author: "", voiceActor: "" };
            globalThis.QOL_CUSTOM_ANNOUNCER_PACK_SLOTS[slotKey] = existing;
        }

        if (!globalThis.QOL_CUSTOM_ANNOUNCER_SLOT2_META || typeof globalThis.QOL_CUSTOM_ANNOUNCER_SLOT2_META !== "object") {
            globalThis.QOL_CUSTOM_ANNOUNCER_SLOT2_META = existing;
        }
    } catch (e0) {}
})();
