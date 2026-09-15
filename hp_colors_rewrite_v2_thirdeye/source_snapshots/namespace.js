// Creates the global namespace. Loaded FIRST in every layout.

(function()
{
    "use strict";

    var context = "?";
    try {
        context = ($.GetContextPanel() && $.GetContextPanel().id) || "?";
    } catch (e) {}

    globalThis.ThirdEye = {
        // VERSION must not contain ":", "[", or "]": the codec export prefix
        // ([TE-<VERSION>]:) and renderer line-wrap split on these delimiters.
        VERSION: "ALPHA-4",
        ROLE: (context === "EscapeMenu") ? "em" : "hud",
        core: {},
        ui: {},
        features: {},
        perf: {},
    };

    $.Msg(
        "[third-eye] namespace ready (role=" + globalThis.ThirdEye.ROLE
            + ", context=" + context + ")"
    );
})();
