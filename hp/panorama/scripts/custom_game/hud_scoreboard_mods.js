(function () {
    "use strict";

    const root = $.GetContextPanel();
    let debugLogged = false;

    function logMaxHealth() {
        // Find the max health label
        const maxHealthLabel = root.FindChildTraverse("MaxHealthLabel");

        if (!maxHealthLabel) {
            $.Msg("[MaxHealth Logger] MaxHealthLabel not found");
            $.Schedule(1.0, logMaxHealth);
            return;
        }

        // First time: log all available properties for debugging
        if (!debugLogged) {
            $.Msg("=== DEBUG: Panel Properties ===");
            $.Msg("Root panel:", root);
            $.Msg("Root panel ID:", root.id);
            $.Msg("Label element:", maxHealthLabel);
            $.Msg("Label ID:", maxHealthLabel.id);
            $.Msg("Label text property:", maxHealthLabel.text);

            // Try different ways to read the value
            try {
                $.Msg("GetAttributeString('text'):", maxHealthLabel.GetAttributeString("text", "N/A"));
            } catch (e) {
                $.Msg("GetAttributeString failed:", e);
            }

            try {
                $.Msg("Label innerHTML:", maxHealthLabel.innerHTML);
            } catch (e) {
                $.Msg("innerHTML not available");
            }

            try {
                $.Msg("Label data:", maxHealthLabel.data);
            } catch (e) {
                $.Msg("data not available");
            }

            // Check parent panel
            const statHealthPanel = maxHealthLabel.GetParent();
            if (statHealthPanel) {
                $.Msg("Parent panel:", statHealthPanel);
                $.Msg("Parent ID:", statHealthPanel.id);
            }

            $.Msg("=== END DEBUG ===");
            debugLogged = true;
        }

        // Get the text value
        let maxHealthValue;
        try {
            maxHealthValue = maxHealthLabel.text || "empty";
        } catch (e) {
            maxHealthValue = "error: " + e;
        }

        // Log to console
        $.Msg("[MaxHealth] Current Max Health:", maxHealthValue);

        // Schedule next check (every 0.5 seconds)
        $.Schedule(0.5, logMaxHealth);
    }

    // Start logging
    $.Msg("[MaxHealth Logger] Starting debug logging...");
    $.Schedule(2.0, logMaxHealth); // Wait 2 seconds for panel to fully load
})();
