// Starts the always-on observer features after the imported QOL modules register.
(function() {
    "use strict";

    var contextPanel = $.GetContextPanel();
    var retryAtByFeature = {};
    var LOOP_INTERVAL_SEC = 0.2;

    function RunProtected(name, nowMs, callback) {
        if (nowMs < (retryAtByFeature[name] || 0)) return;
        try {
            callback();
            retryAtByFeature[name] = 0;
        } catch (e) {
            retryAtByFeature[name] = nowMs + 5000;
            $.Msg("[QOLLOCK Spectator][" + name + "] retrying after error: " +
                (e && e.message ? e.message : String(e)));
        }
    }

    function RunFeature(name, root, cfg, nowMs, runWhenGatedOff) {
        var feature = QOL.featureRegistry ? QOL.featureRegistry[name] : null;
        if (!feature || typeof feature.update !== "function") return;
        RunProtected(name, nowMs, function() {
            if (runWhenGatedOff || !feature.gate || feature.gate(cfg)) {
                feature.update(root, cfg, nowMs);
            }
        });
    }

    function Tick() {
        if (!OBSERVER_PACK.isPanelValid(contextPanel)) return;

        // Queue the next pass before touching live HUD panels so a transient
        // Panorama race cannot permanently stop every observer feature.
        $.Schedule(LOOP_INTERVAL_SEC, Tick);

        var root = OBSERVER_PACK.resolveRuntimeRoot(contextPanel);
        var cfg = OBSERVER_PACK.config;
        var nowMs = OBSERVER_PACK.nowMs();
        OBSERVER_PACK.state.lastConfig = cfg;

        if (root) {
            OBSERVER_PACK.applyStaticRootClasses(root);
            RunFeature("rejuvTimers", root, cfg, nowMs);
            RunProtected("soulDifference", nowMs, function() {
                OBSERVER_PACK.updateSoulDifference(root, nowMs);
            });

            var riftCfg = cfg;
            var inStreetBrawl = QOL.isStreetBrawlModeActive &&
                QOL.isStreetBrawlModeActive(root);
            if (inStreetBrawl) {
                riftCfg = {
                    ENABLE_URN_TIMER: 0
                };
            }
            // Run once with the disabled config in Street Brawl so any Rift
            // panel left over from a mode transition is actively hidden.
            RunFeature("urnTimer", root, riftCfg, nowMs, inStreetBrawl);
        }
    }

    $.Msg("[QOLLOCK Spectator] Timers and soul difference enabled.");
    $.Schedule(0.0, Tick);
})();
