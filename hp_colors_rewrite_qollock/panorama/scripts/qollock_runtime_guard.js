/* QOLLOCK runtime compatibility guard. ES5-only; loaded before and after ql_core boot. */
(function () {
    "use strict";

    var MASK_DEFAULTS = {
        ENABLE_COMBAT_INDICATOR: 0,
        ENABLE_COLORED_HEALTHBAR: 0,
        ENABLE_COLOR_WARNING_25: 0,
        ENABLE_COLOR_WARNING_65: 0,
        ENABLE_COLOR_WARNING_75: 0,
        ENABLE_ENEMY_COLORED_HEALTHBAR: 0,
        ENABLE_ENEMY_COLOR_WARNING_25: 0,
        ENABLE_ENEMY_COLOR_WARNING_65: 0,
        ENABLE_ENEMY_COLOR_WARNING_75: 0,
        ENABLE_ALLY_COLORED_HEALTHBAR: 0,
        ENABLE_ALLY_COLOR_WARNING_25: 0,
        ENABLE_ALLY_COLOR_WARNING_65: 0,
        ENABLE_ALLY_COLOR_WARNING_75: 0,
        ENABLE_FG_HEALTHBAR: 0,
        ENABLE_MINIMALIST_HEALTHBAR: 0,
        HEALTHBAR_TYPE: 0,
        ENABLE_MINECRAFT_HEALTH_NUMBERS: 0,
        PLAYER_HEALTHBAR_SCALE: 100,
        PLAYER_HEALTHBAR_OPACITY: 1,
        PLAYER_HEALTHBAR_X_OFFSET: 0,
        PLAYER_HEALTHBAR_Y_OFFSET: 0,
        PLAYER_HEALTHBAR_ACCENT_COLOR: 0,
        ENABLE_ENEMY_V2_ENHANCED: 0,
        ENABLE_ENEMY_V2_ULT_INDICATOR: 0,
        ENABLE_ENEMY_V2_LEVEL: 0,
        ENABLE_ENEMY_ULT_INDICATOR: 0,
        MINIMALIST_HEALTHBAR_X_OFFSET: 0,
        MINIMALIST_HEALTHBAR_Y_OFFSET: 0
    };

    var MISSING_MARKER_ATTR = "hp_colors_rewrite_qollock_missing_qol_reported";
    var MISSING_CHECK_COUNT_ATTR = "hp_colors_rewrite_qollock_qol_check_count";
    var WRAP_MARKER = "__hpColorsRewriteQolLockMasked";

    function copyObject(source) {
        var result = {};
        var key;
        if (!source || typeof source !== "object") return result;
        for (key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key];
        }
        return result;
    }

    function maskRuntimeConfig(config) {
        var result = copyObject(config);
        var key;
        for (key in MASK_DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(MASK_DEFAULTS, key)) result[key] = MASK_DEFAULTS[key];
        }
        return result;
    }

    function wrapConfigFunction(namespace, name, fallback) {
        var original;
        var wrapped;
        if (!namespace) return;
        original = typeof namespace[name] === "function" ? namespace[name] : fallback;
        if (typeof original !== "function") return;
        if (original[WRAP_MARKER]) return;
        wrapped = function () {
            var value = original.apply(this, arguments);
            return maskRuntimeConfig(value);
        };
        wrapped[WRAP_MARKER] = true;
        namespace[name] = wrapped;
    }

    function reportMissingQolRuntime() {
        var context = null;
        var shared = null;
        var invocationCount = 0;
        var markerPresent = false;
        try {
            context = $.GetContextPanel ? $.GetContextPanel() : null;
            if (context && context.GetAttributeString && context.SetAttributeString) {
                invocationCount = Number(context.GetAttributeString(MISSING_CHECK_COUNT_ATTR, "0")) || 0;
                invocationCount += 1;
                context.SetAttributeString(MISSING_CHECK_COUNT_ATTR, String(invocationCount));
            } else if (typeof GameUI !== "undefined" && GameUI.CustomUIConfig) {
                shared = GameUI.CustomUIConfig();
                invocationCount = Number(shared.__hpColorsRewriteQolCheckCount) || 0;
                invocationCount += 1;
                shared.__hpColorsRewriteQolCheckCount = invocationCount;
            }
        } catch (countError) {
            invocationCount = 0;
        }
        try {
            markerPresent = typeof QOL !== "undefined" && QOL && QOL.core && QOL.core.App &&
                typeof QOL.core.App.isBooted === "function" && QOL.core.App.isBooted();
        } catch (markerError) {
            markerPresent = false;
        }
        if (markerPresent || invocationCount < 2) return;
        try {
            if (context && context.GetAttributeString && context.GetAttributeString(MISSING_MARKER_ATTR, "") === "1") return;
            if (context && context.SetAttributeString) context.SetAttributeString(MISSING_MARKER_ATTR, "1");
            if (shared && shared.__hpColorsRewriteMissingQolReported) return;
            if (shared) shared.__hpColorsRewriteMissingQolReported = true;
        } catch (attributeError) {
            /* Continue: the process-local guard below still bounds this script. */
        }
        try {
            if (!reportMissingQolRuntime.reported) {
                reportMissingQolRuntime.reported = true;
                $.Msg("[HP Colors Rewrite/QOLLock][ERROR] required QOL runtime marker is absent; QOL compatibility is disabled");
            }
        } catch (logError) {
            reportMissingQolRuntime.reported = true;
        }
    }

    if (typeof QOL !== "undefined" && QOL) {
        /* These wrappers expose an immutable runtime view while raw storage remains untouched. */
        wrapConfigFunction(QOL, "safeParseConfig", function () { return {}; });
        wrapConfigFunction(QOL, "buildDefaultConfig", function () { return {}; });
        wrapConfigFunction(QOL, "mergeConfig", function (config) { return config || {}; });
        /* ql_build_payload is attached after ql_core; wrap only when it exists. */
        wrapConfigFunction(QOL, "applyBuildCategoryPayloadOverride", null);
    }

    reportMissingQolRuntime();

    /* Export the contract for focused validators and the support builder. */
    try {
        if (typeof QOL !== "undefined" && QOL) {
            QOL.hpColorsRewriteRuntimeMaskDefaults = MASK_DEFAULTS;
            QOL.hpColorsRewriteRuntimeMask = maskRuntimeConfig;
            QOL.hpColorsRewriteQolRuntimeMarker = "QOL.core.App.isBooted";
        }
    } catch (exposeError) {
        /* No-op when QOLLOCK is absent; the bounded marker error already covers it. */
    }
}());
