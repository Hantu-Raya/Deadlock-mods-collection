/* QOLLOCK settings compatibility guard. ES5-only: raw ignored values stay in MOD_CONFIG/storage. */
(function () {
    "use strict";

    var IGNORED_HEALTHBAR_KEYS = {
        ENABLE_COMBAT_INDICATOR: true,
        ENABLE_COLORED_HEALTHBAR: true,
        ENABLE_COLOR_WARNING_25: true,
        ENABLE_COLOR_WARNING_65: true,
        ENABLE_COLOR_WARNING_75: true,
        ENABLE_ENEMY_COLORED_HEALTHBAR: true,
        ENABLE_ENEMY_COLOR_WARNING_25: true,
        ENABLE_ENEMY_COLOR_WARNING_65: true,
        ENABLE_ENEMY_COLOR_WARNING_75: true,
        ENABLE_ALLY_COLORED_HEALTHBAR: true,
        ENABLE_ALLY_COLOR_WARNING_25: true,
        ENABLE_ALLY_COLOR_WARNING_65: true,
        ENABLE_ALLY_COLOR_WARNING_75: true,
        ENABLE_FG_HEALTHBAR: true,
        ENABLE_MINIMALIST_HEALTHBAR: true,
        HEALTHBAR_TYPE: true,
        ENABLE_MINECRAFT_HEALTH_NUMBERS: true,
        PLAYER_HEALTHBAR_SCALE: true,
        PLAYER_HEALTHBAR_OPACITY: true,
        PLAYER_HEALTHBAR_X_OFFSET: true,
        PLAYER_HEALTHBAR_Y_OFFSET: true,
        PLAYER_HEALTHBAR_ACCENT_COLOR: true,
        ENABLE_ENEMY_V2_ENHANCED: true,
        ENABLE_ENEMY_V2_ULT_INDICATOR: true,
        ENABLE_ENEMY_V2_LEVEL: true,
        ENABLE_ENEMY_ULT_INDICATOR: true,
        MINIMALIST_HEALTHBAR_X_OFFSET: true,
        MINIMALIST_HEALTHBAR_Y_OFFSET: true
    };

    var pendingImportedConfig = null;
    var pendingIgnoredKeys = [];
    var ignoredWarningShown = false;

    function hasIgnoredKey(config) {
        var key;
        if (!config || typeof config !== "object") return false;
        for (key in IGNORED_HEALTHBAR_KEYS) {
            if (Object.prototype.hasOwnProperty.call(config, key)) return true;
        }
        return false;
    }

    function ignoredKeys(config) {
        var result = [];
        var key;
        if (!config || typeof config !== "object") return result;
        for (key in IGNORED_HEALTHBAR_KEYS) {
            if (Object.prototype.hasOwnProperty.call(config, key)) result.push(key);
        }
        return result;
    }

    function isIgnoredRowKey(configId) {
        var key = String(configId || "");
        return Object.prototype.hasOwnProperty.call(IGNORED_HEALTHBAR_KEYS, key);
    }

    function withoutHealthbarTab(tabs) {
        var result = [];
        var index;
        if (!tabs || typeof tabs.length !== "number") return result;
        for (index = 0; index < tabs.length; index += 1) {
            if (String(tabs[index] || "") !== "Healthbar") result.push(tabs[index]);
        }
        return result;
    }

    /* Remove the Healthbar tab itself, not only its rows. */
    if (typeof GetSettingsTabOrder === "function") {
        (function (getSettingsTabOrder) {
            GetSettingsTabOrder = function () {
                return withoutHealthbarTab(getSettingsTabOrder.apply(this, arguments));
            };
        }(GetSettingsTabOrder));
    }
    if (typeof GetSettingsTabGroups === "function") {
        (function (getSettingsTabGroups) {
            GetSettingsTabGroups = function () {
                var source = getSettingsTabGroups.apply(this, arguments) || [];
                var result = [];
                var index;
                for (index = 0; index < source.length; index += 1) {
                    result.push({
                        title: source[index].title,
                        tabs: withoutHealthbarTab(source[index].tabs)
                    });
                }
                return result;
            };
        }(GetSettingsTabGroups));
    }
    if (typeof currentTab !== "undefined" && currentTab === "Healthbar") currentTab = "HUD";

    /* Remove healthbar rows at construction time, including search-mode rows. */
    if (typeof CreateRow === "function") {
        (function (createRow) {
            CreateRow = function (parent, label, configId, type, min, max, step, options, description) {
                if (isIgnoredRowKey(configId)) return null;
                return createRow.apply(this, arguments);
            };
        }(CreateRow));
    }
    if (typeof CreateInlineSecondaryCheckboxToggleRow === "function") {
        (function (createInlineRow) {
            CreateInlineSecondaryCheckboxToggleRow = function (parent, label, configId, secondaryLabel, secondaryConfigId) {
                if (isIgnoredRowKey(configId) || isIgnoredRowKey(secondaryConfigId)) return null;
                return createInlineRow.apply(this, arguments);
            };
        }(CreateInlineSecondaryCheckboxToggleRow));
    }
    if (typeof CreateSliderRow === "function") {
        (function (createSliderRow) {
            CreateSliderRow = function (parent, label, configId) {
                if (isIgnoredRowKey(configId)) return null;
                return createSliderRow.apply(this, arguments);
            };
        }(CreateSliderRow));
    }

    /* Search index builders may have been populated before this guard loaded. */
    if (typeof InvalidateSearchSectionIndexCache === "function") {
        try { InvalidateSearchSectionIndexCache(); } catch (ignored) { /* best effort */ }
    }

    function showIgnoredImportWarning() {
        if (!pendingIgnoredKeys.length || ignoredWarningShown) return;
        ignoredWarningShown = true;
        var show = function () {
            try {
                if (typeof SetLocalizedConfigFeedbackMessage === "function") {
                    SetLocalizedConfigFeedbackMessage(
                        "HP COLORS owns healthbars; ignored QOL healthbar values were retained.",
                        "warning",
                        5000
                    );
                }
            } catch (warningError) {
                try { $.Msg("[QOLLock][WARN][import] ignored healthbar values retained"); } catch (ignored) { /* no-op */ }
            }
        };
        if (typeof $.Schedule === "function") $.Schedule(0, show);
        else show();
    }

    /* Remember ignored values at parse time, but warn only after confirmation applies them. */
    if (typeof TryApplyImportStringWithDiagnostics === "function") {
        (function (tryApplyImport) {
            TryApplyImportStringWithDiagnostics = function (raw) {
                ignoredWarningShown = false;
                pendingImportedConfig = null;
                pendingIgnoredKeys = [];
                var result = tryApplyImport.apply(this, arguments);
                var found = result && result.parsedConfig ? ignoredKeys(result.parsedConfig) : [];
                if (result) result.ignoredHealthbarKeys = found;
                if (result && result.ok === true && result.parsedConfig && found.length) {
                    pendingImportedConfig = result.parsedConfig;
                    pendingIgnoredKeys = found;
                }
                return result;
            };
        }(TryApplyImportStringWithDiagnostics));
    }

    if (typeof QOL !== "undefined" && QOL.persistence &&
        typeof QOL.persistence.applyParsedConfigWithDiagnostics === "function") {
        (function (applyParsedConfig) {
            QOL.persistence.applyParsedConfigWithDiagnostics = function (parsedConfig) {
                var result = applyParsedConfig.apply(this, arguments);
                if (parsedConfig === pendingImportedConfig && pendingIgnoredKeys.length) {
                    pendingImportedConfig = null;
                    showIgnoredImportWarning();
                    pendingIgnoredKeys = [];
                }
                return result;
            };
        }(QOL.persistence.applyParsedConfigWithDiagnostics));
    }

    /* Expose deterministic key metadata for focused validators without changing storage. */
    try {
        if (typeof QOL !== "undefined") {
            QOL.hpColorsRewriteIgnoredHealthbarKeys = IGNORED_HEALTHBAR_KEYS;
            QOL.hpColorsRewriteHasIgnoredHealthbarKey = hasIgnoredKey;
        }
    } catch (ignoredExposeError) {
        /* Settings still works if the bridge namespace is unavailable. */
    }
}());
