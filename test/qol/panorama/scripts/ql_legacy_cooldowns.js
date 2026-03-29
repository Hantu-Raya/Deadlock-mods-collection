"use strict";

(function() {
    var lastDebugSignature = null;

    function LegacyCooldownsEnabled() {
        try {
            if (typeof GameUI !== "object" || !GameUI || typeof GameUI.CustomUIConfig !== "function") return false;
            var customUiConfig = GameUI.CustomUIConfig();
            return !!(customUiConfig && Number(customUiConfig.qolLegacyCooldownsEnabled) === 1);
        } catch (e) {
            return false;
        }
    }

    function DebugLegacyCooldowns(panel, enabled) {
        try {
            var panelId = panel && panel.id ? panel.id : "<no-id>";
            var panelType = panel && panel.paneltype ? panel.paneltype : "<no-type>";
            var hasActive = panel && panel.BHasClass ? panel.BHasClass("active") : false;
            var hasLegacy = panel && panel.BHasClass ? panel.BHasClass("legacy_cooldowns_active") : false;
            var signature = [panelType, panelId, enabled ? 1 : 0, hasActive ? 1 : 0, hasLegacy ? 1 : 0].join("|");
            if (signature === lastDebugSignature) return;
            lastDebugSignature = signature;
            $.Msg("[QOLLock][LegacyCooldownsDbg] type=" + panelType + " id=" + panelId + " enabled=" + (enabled ? 1 : 0) + " active=" + (hasActive ? 1 : 0) + " legacy=" + (hasLegacy ? 1 : 0));
        } catch (e) {}
    }

    function RefreshLegacyCooldownClass() {
        var panel = $.GetContextPanel();
        if (!panel || !panel.IsValid || !panel.IsValid()) return;
        var enabled = LegacyCooldownsEnabled();
        panel.SetHasClass("legacy_cooldowns_active", enabled);
        DebugLegacyCooldowns(panel, enabled);
        $.Schedule(0.25, RefreshLegacyCooldownClass);
    }

    RefreshLegacyCooldownClass();
})();
