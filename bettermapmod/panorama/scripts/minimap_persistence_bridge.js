"use strict";

(function () {
    var BRIDGE_REQUEST_STATE_ATTR = "DMM_MINIMAP_BRIDGE_REQUEST_STATE";
    var BRIDGE_REQUEST_MSG_ATTR = "DMM_MINIMAP_BRIDGE_REQUEST_MSG";
    var PROCESS_TICK_SEC = 0.25;

    function findRootPanel() {
        var panel = (typeof $ !== "undefined" && typeof $.GetContextPanel === "function")
            ? $.GetContextPanel()
            : null;
        while (panel && typeof panel.GetParent === "function") {
            var parent = panel.GetParent();
            if (!parent) {
                break;
            }
            panel = parent;
        }
        return panel;
    }

    function setAttrOnPersistencePanels(attrName, valueText) {
        var panel = (typeof $ !== "undefined" && typeof $.GetContextPanel === "function")
            ? $.GetContextPanel()
            : null;
        var root = findRootPanel();
        var hud = null;
        if (root && typeof root.FindChildTraverse === "function") {
            try {
                hud = root.FindChildTraverse("Hud");
            } catch (eHud) {
                hud = null;
            }
        }

        if (panel && typeof panel.SetAttributeString === "function") {
            try { panel.SetAttributeString(attrName, String(valueText)); } catch (eP0) {}
        }
        if (root && typeof root.SetAttributeString === "function") {
            try { root.SetAttributeString(attrName, String(valueText)); } catch (eR0) {}
        }
        if (hud && typeof hud.SetAttributeString === "function") {
            try { hud.SetAttributeString(attrName, String(valueText)); } catch (eH0) {}
        }
    }

    function getAttrFromPersistencePanels(attrName) {
        var panel = (typeof $ !== "undefined" && typeof $.GetContextPanel === "function")
            ? $.GetContextPanel()
            : null;
        var root = findRootPanel();
        var hud = null;
        var panelVal = "";
        var rootVal = "";
        var hudVal = "";
        if (root && typeof root.FindChildTraverse === "function") {
            try {
                hud = root.FindChildTraverse("Hud");
            } catch (eHud) {
                hud = null;
            }
        }
        if (panel && typeof panel.GetAttributeString === "function") {
            try { panelVal = String(panel.GetAttributeString(attrName, "") || ""); } catch (eP1) { panelVal = ""; }
        }
        if (root && typeof root.GetAttributeString === "function") {
            try { rootVal = String(root.GetAttributeString(attrName, "") || ""); } catch (eR1) { rootVal = ""; }
        }
        if (hud && typeof hud.GetAttributeString === "function") {
            try { hudVal = String(hud.GetAttributeString(attrName, "") || ""); } catch (eH1) { hudVal = ""; }
        }
        return panelVal || rootVal || hudVal || "";
    }

    function tick() {
        var state = String(getAttrFromPersistencePanels(BRIDGE_REQUEST_STATE_ATTR) || "");
        if (state === "pending") {
            setAttrOnPersistencePanels(BRIDGE_REQUEST_MSG_ATTR, "no-durable-backend");
            setAttrOnPersistencePanels(BRIDGE_REQUEST_STATE_ATTR, "failed");
        }

        $.Schedule(PROCESS_TICK_SEC, tick);
    }

    tick();
})();
