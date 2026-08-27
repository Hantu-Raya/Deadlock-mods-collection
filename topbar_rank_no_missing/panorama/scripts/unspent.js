(function () {
    const TIER_COST = {
        1: 800,
        2: 1600,
        3: 3200,
        4: 6400
    };

    function parseFormattedNumber(valueText) {
        if (!valueText) return 0;
        valueText = valueText.toString().replace(/,/g, "").trim().toLowerCase();
        if (valueText.endsWith("k")) {
            return parseFloat(valueText.replace("k", "")) * 1000;
        }
        return parseFloat(valueText) || 0;
    }

    function getSoulValueFromPanel(panel) {
        let soulValue = 0;
        // First try the hidden un-truncated value
        const hiddenGoldLabel = panel.FindChildTraverse("HiddenGoldValue");
        if (hiddenGoldLabel && hiddenGoldLabel.text) {
            soulValue = parseFormattedNumber(hiddenGoldLabel.text);
        }
        // Fallback to the visible truncated value if hidden not available
        if (soulValue === 0) {
            const soulsLabel = panel.FindChildTraverse("SoulsValue");
            if (soulsLabel && soulsLabel.text) {
                soulValue = parseFormattedNumber(soulsLabel.text);
            }
        }
        return soulValue;
    }

    function calculateAndUpdateDisplay() {
        const panel = $.GetContextPanel();
        if (!panel) return;

        const totalNetWorth = getSoulValueFromPanel(panel);

        let spentSouls = 0;
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };

        const t1 = panel.FindChildrenWithClassTraverse("isTier1") || [];
        const t2 = panel.FindChildrenWithClassTraverse("isTier2") || [];
        const t3 = panel.FindChildrenWithClassTraverse("isTier3") || [];
        const t4 = panel.FindChildrenWithClassTraverse("isTier4") || [];

        counts[1] = t1.length;
        counts[2] = t2.length;
        counts[3] = t3.length;
        counts[4] = t4.length;

        spentSouls += counts[1] * TIER_COST[1];
        spentSouls += counts[2] * TIER_COST[2];
        spentSouls += counts[3] * TIER_COST[3];
        spentSouls += counts[4] * TIER_COST[4];

        const unspentSouls = totalNetWorth - spentSouls;

        // Find and update the display label
        const display = panel.FindChildTraverse("SpentSoulDisplay");
        if (display) {
            const kValue = (unspentSouls / 1000).toFixed(1);
            display.text = kValue + "k";
        }
    }

    function updateLoop() {
        calculateAndUpdateDisplay();
        $.Schedule(0.5, updateLoop);
    }

    updateLoop();
})();
