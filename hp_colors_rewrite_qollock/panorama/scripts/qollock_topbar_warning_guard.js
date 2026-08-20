/* Preserve QOLLOCK topbar HP warnings while HP Colors owns unit-status healthbars. */
(function () {
    "use strict";

    var WRAP_MARKER = "__hpColorsRewriteTopbarOnly";
    var BODY_HEALTHBAR_DEFAULTS = {
        ENABLE_COLORED_HEALTHBAR: 0,
        ENABLE_COLOR_WARNING_25: 0,
        ENABLE_COLOR_WARNING_65: 0,
        ENABLE_COLOR_WARNING_75: 0,
        ENABLE_ENEMY_COLORED_HEALTHBAR: 0,
        ENABLE_ALLY_COLORED_HEALTHBAR: 0
    };

    function topbarOnlyConfig(config) {
        var result = {};
        var key;
        if (config && typeof config === "object") {
            for (key in config) {
                if (Object.prototype.hasOwnProperty.call(config, key)) result[key] = config[key];
            }
        }
        for (key in BODY_HEALTHBAR_DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(BODY_HEALTHBAR_DEFAULTS, key)) {
                result[key] = BODY_HEALTHBAR_DEFAULTS[key];
            }
        }
        return result;
    }

    try {
        var registry = typeof QOL !== "undefined" && QOL && QOL.core
            ? QOL.core.FeatureRegistry
            : null;
        var configStore = typeof QOL !== "undefined" && QOL && QOL.core
            ? QOL.core.ConfigStore
            : null;
        var manifest = registry && registry.getManifest
            ? registry.getManifest("ql_color_warnings")
            : null;
        if (!manifest || typeof manifest.create !== "function") {
            $.Msg("[HP Colors Rewrite/QOLLock][ERROR] QOL topbar HP warning manifest is unavailable");
            return;
        }
        if (manifest[WRAP_MARKER]) return;

        var create = manifest.create;
        manifest.enableKey = "";
        manifest.enabledByDefault = true;
        manifest.create = function (context) {
            var wrappedContext = {};
            var key;
            for (key in context) {
                if (Object.prototype.hasOwnProperty.call(context, key)) wrappedContext[key] = context[key];
            }
            wrappedContext.config = {};
            if (context.config) {
                for (key in context.config) {
                    if (Object.prototype.hasOwnProperty.call(context.config, key)) {
                        wrappedContext.config[key] = context.config[key];
                    }
                }
            }
            wrappedContext.config.view = function () {
                return topbarOnlyConfig(context.config && context.config.view
                    ? context.config.view()
                    : {});
            };
            return create(wrappedContext);
        };
        manifest[WRAP_MARKER] = true;

        if (configStore && typeof configStore.set === "function") {
            configStore.set("ql_color_warnings", "enabled", true);
        }
        QOL.hpColorsRewriteTopbarOnlyConfig = topbarOnlyConfig;
    } catch (error) {
        try {
            $.Msg("[HP Colors Rewrite/QOLLock][ERROR] failed to preserve QOL topbar HP warnings: " +
                String(error && error.message ? error.message : error));
        } catch (ignored) {
            /* Panorama may be tearing down. */
        }
    }
}());
