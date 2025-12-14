"use strict";

// Per-player health display script
// Uses local context loops and robust number parsing like souls_level_display.js

// Hero-specific HP data (base HP and HP per boon)
var heroData = {
    "ABRAMS": { base: 770, perBoon: 49 },
    "BEBOP": { base: 850, perBoon: 46 },
    "BILLY": { base: 790, perBoon: 43 },
    "CALICO": { base: 700, perBoon: 37 },
    "DOORMAN": { base: 725, perBoon: 42 },
    "DRIFTER": { base: 725, perBoon: 39 },
    "DYNAMO": { base: 850, perBoon: 59 },
    "GREY TALON": { base: 750, perBoon: 38 },
    "HAZE": { base: 700, perBoon: 33 },
    "HOLLIDAY": { base: 750, perBoon: 41 },
    "INFERNUS": { base: 800, perBoon: 39 },
    "IVY": { base: 725, perBoon: 44 },
    "KELVIN": { base: 850, perBoon: 58 },
    "LADY GEIST": { base: 850, perBoon: 51 },
    "LASH": { base: 750, perBoon: 50 },
    "MCGINNIS": { base: 750, perBoon: 52 },
    "MINA": { base: 630, perBoon: 28 },
    "MIRAGE": { base: 700, perBoon: 44 },
    "MO & KRILL": { base: 900, perBoon: 63 },
    "PAIGE": { base: 650, perBoon: 29 },
    "PARADOX": { base: 700, perBoon: 45 },
    "POCKET": { base: 750, perBoon: 36 },
    "SEVEN": { base: 700, perBoon: 41 },
    "SHIV": { base: 800, perBoon: 48 },
    "SINCLAIR": { base: 700, perBoon: 38 },
    "VICTOR": { base: 770, perBoon: 39 },
    "VINDICTA": { base: 725, perBoon: 29 },
    "VISCOUS": { base: 750, perBoon: 44 },
    "VYPER": { base: 750, perBoon: 35 },
    "WARDEN": { base: 775, perBoon: 58 },
    "WRAITH": { base: 700, perBoon: 35 },
    "YAMATO": { base: 700, perBoon: 44 }
};

var DEFAULT_BASE = 750;
var DEFAULT_PER_BOON = 42;

// Souls to Boon thresholds (from wiki)
var soulThresholds = [
    0, 900, 1200, 1500, 2100, 2800, 3600, 4400, 5200, 6000,
    6800, 7700, 8600, 9600, 10600, 11600, 12600, 13800, 15600,
    17600, 19600, 21600, 23600, 25600, 27600, 29600, 31600,
    33600, 35600, 37600, 39600, 41600, 43600, 45600, 47600, 49600
];

// Per-instance state
var myHeroName = null;
var myCachedMaxHP = null; // Exact value from last hover
var myCachedBoonLevel = 0; // Boon level when we last cached

// --- Robust Parsing Helpers (from souls_level_display.js) ---

var SUFFIX_RULES = [
    [/^k$/i, 1e3],
    [/^m$/i, 1e6],
    [/^b$/i, 1e3], // Turkish 'bin'
    [/^rb$/i, 1e3], // Indo 'ribu'
    [/^jt$/i, 1e6], // Indo 'juta'
    [/^tr$/i, 1e6], // VN 'trieu'
    [/^l(akh)?$/i, 1e5], // Hindi
    [/^(cr|crore)$/i, 1e7], // Hindi
    [/^(tsd\.?|tys\.?|tis\.?|tkr|тыс\.?|тис\.?|т\.?|ألف)$/i, 1e3],
    [/^(mio\.?|mil\.?|mi|mln\.?|млн\.?|εκ\.?|مليون)$/i, 1e6]
];

function getSuffixMultiplier(suffixRaw) {
    if (!suffixRaw) return 1;
    let s = suffixRaw.replace(/\s|\u00A0/g, "").replace(/\.+$/, "").toLowerCase();
    for (let i = 0; i < SUFFIX_RULES.length; i++) {
        const [rx, mult] = SUFFIX_RULES[i];
        if (rx.test(s)) return mult;
    }
    return 1;
}

function normalizeNumberString(numStr) {
    numStr = (numStr || "").replace(/\s|\u00A0/g, "");
    const hasDot = numStr.includes(".");
    const hasComma = numStr.includes(",");

    if (hasDot && hasComma) {
        const lastDot = numStr.lastIndexOf(".");
        const lastComma = numStr.lastIndexOf(",");
        const decimalSep = lastDot > lastComma ? "." : ",";
        const groupSep = decimalSep === "." ? "," : ".";
        numStr = numStr.split(groupSep).join("");
        if (decimalSep === ",") numStr = numStr.replace(",", ".");
    } else if (hasComma) {
        if (/,(\d{1,2})$/.test(numStr)) {
            numStr = numStr.replace(",", ".");
        } else {
            numStr = numStr.replace(",", "");
        }
    }
    return numStr;
}

function parseValueWithSuffix(value) {
    if (typeof value !== "string") return Number(value) || 0;

    // Remove HTML tags first
    var cleanValue = value.replace(/<[^>]*>/g, "").trim().replace(/\u00A0/g, " ");

    const numberMatch = cleanValue.match(/^[\d.,\s\u00A0]+/);
    if (!numberMatch) return 0;

    let numStr = numberMatch[0].replace(/\s/g, "");
    numStr = normalizeNumberString(numStr);
    let n = parseFloat(numStr);
    if (isNaN(n)) return 0;

    const suffixRaw = cleanValue.slice(numberMatch[0].length).trim();
    const mult = getSuffixMultiplier(suffixRaw);
    return n * mult;
}

// --- Main Display Functions ---

function getSouls() {
    var ctx = $.GetContextPanel();
    var soulsLabel = ctx.FindChildTraverse("SoulsValue");
    if (!soulsLabel || !soulsLabel.text) return 0;
    return parseValueWithSuffix(soulsLabel.text);
}

function getBoonLevel(souls) {
    for (var i = soulThresholds.length - 1; i >= 0; i--) {
        if (souls >= soulThresholds[i]) return i;
    }
    return 0;
}

function getHealthRatio() {
    var ctx = $.GetContextPanel();
    var healthBar = ctx.FindChildTraverse("HeroHealth");
    return healthBar ? healthBar.value : 1;
}

function calculateMaxHP(heroName, boonLevel) {
    var hero = heroData[(heroName || "").toUpperCase()];
    /* 
       HYBRID CALCULATION STRATEGY:
       1. If we have a Cached Max HP (snapshot from hover), uses that as baseline.
          Then adds expected growth: (CurrentBoon - CachedBoon) * PerBoon.
          This preserves Item stats captured in the snapshot.
       
       2. If no cache, fall back to theoretical: Base + (Boon * PerBoon).
          This misses items but is better than nothing.
    */

    var perBoon = (hero ? hero.perBoon : DEFAULT_PER_BOON);

    if (myCachedMaxHP && myHeroName === heroName) {
        var boonDiff = boonLevel - myCachedBoonLevel;
        // Don't reduce HP if for some reason boon level drops (bug safety), only grow
        if (boonDiff < 0) boonDiff = 0;

        return myCachedMaxHP + (boonDiff * perBoon);
    }

    // Fallback: Theoretical Max
    var base = (hero ? hero.base : DEFAULT_BASE);
    return base + (boonLevel * perBoon);
}

function checkForHoveredData() {
    var ctx = $.GetContextPanel();
    var playerId = ctx.id;

    // Find root and ScoreboardMods - check even without hover if ScoreboardMods is visible
    var root = ctx;
    while (root && root.GetParent && root.GetParent()) root = root.GetParent();

    var sb = root.FindChildTraverse("ScoreboardMods");
    if (!sb) return;

    // Check if ScoreboardMods is visible (not just hover)
    var isVisible = false;
    try {
        isVisible = sb.BIsTransparent ? !sb.BIsTransparent() : true;
        if (sb.visible !== undefined) isVisible = sb.visible;
        if (sb.BHasClass && sb.BHasClass("visible")) isVisible = true;
    } catch (e) {
        isVisible = true; // Assume visible if we can't check
    }

    // Also check hover state
    var isHovered = false;
    var detailsContainer = ctx.FindChildTraverse("PlayerDetailsContainer");
    if (ctx.BHasHoverStyle && ctx.BHasHoverStyle()) isHovered = true;
    if (detailsContainer && detailsContainer.BHasHoverStyle && detailsContainer.BHasHoverStyle()) isHovered = true;

    // Only proceed if visible or hovered
    if (!isVisible && !isHovered) return;

    var heroLabel = sb.FindChildTraverse("ScoreboardModsHeroName");
    var heroName = heroLabel ? heroLabel.text : "";
    if (!heroName || heroName === "" || heroName === "{g:citadel_hero_name:scoreboard_mods_hero_id}") return;

    // Get max HP - Try MaxHealthLabel directly first
    var maxHP = "";
    var maxHealthLabel = sb.FindChildTraverse("MaxHealthLabel");
    if (maxHealthLabel && maxHealthLabel.text) {
        var text = maxHealthLabel.text;
        // Remove any non-digit characters except for the value itself
        if (text && text !== "{s:stat_max_health}" && /\d/.test(text)) {
            maxHP = text.replace(/,/g, "").replace(/[^\d]/g, "");
            $.Msg("[" + playerId + "] MaxHealthLabel text: " + text + " -> " + maxHP);
        }
    }

    // Fallback: Try Stat_Health children if MaxHealthLabel didn't work
    if (!maxHP || maxHP === "") {
        var statHealth = sb.FindChildTraverse("Stat_Health");
        if (statHealth) {
            var count = statHealth.GetChildCount();
            for (var i = 0; i < count; i++) {
                var child = statHealth.GetChild(i);
                if (child && child.text && /^\d/.test(child.text)) {
                    maxHP = child.text.replace(/,/g, "");
                    $.Msg("[" + playerId + "] Stat_Health child text: " + child.text);
                    break;
                }
            }
        }
    }

    // Update Hero Name
    if (heroName && heroName !== myHeroName) {
        myHeroName = heroName;
        // Reset cache if hero changed (swapped?)
        myCachedMaxHP = null;
        $.Msg("[" + playerId + "] Hero identified: " + heroName);
    }

    // Update Cached Max HP + Current Boon Level
    if (maxHP && maxHP !== "") {
        var hp = parseInt(maxHP);
        // Only update if value changed or we have no cache
        // We capture the CURRENT boon level at the moment of this snapshot
        if (!isNaN(hp) && hp > 0 && myCachedMaxHP !== hp) {
            myCachedMaxHP = hp;
            myCachedBoonLevel = getBoonLevel(getSouls());
            $.Msg("[" + playerId + "] Snapshot: " + hp + " HP @ Boon " + myCachedBoonLevel);
        }
    }
}

function updateDisplay() {
    var ctx = $.GetContextPanel();
    var playerId = ctx.id;

    var souls = getSouls();
    var boonLevel = getBoonLevel(souls);
    var healthRatio = getHealthRatio();
    var healthPct = Math.round(healthRatio * 100);

    var maxHP;

    if (myHeroName) {
        maxHP = calculateMaxHP(myHeroName, boonLevel);
    } else {
        maxHP = DEFAULT_BASE + (boonLevel * DEFAULT_PER_BOON);
    }

    var currentHP = Math.round(healthRatio * maxHP);

    // Log info
    $.Msg("[" + playerId + "] " +
        (myHeroName || "?") + " B" + boonLevel +
        " " + healthPct + "% " + currentHP + "/" + maxHP +
        (myCachedMaxHP ? "*" : "")); // * indicates using cached baseline

    var maxHealthLabel = ctx.FindChildTraverse("MaxHealthLabel");
    if (maxHealthLabel) {
        maxHealthLabel.text = maxHP.toString();
    }
}

// Main loop
(function Poll() {
    checkForHoveredData();
    updateDisplay();
    $.Schedule(1.0, Poll);
})();

$.Msg("[HP] Hybrid Script Started for: " + $.GetContextPanel().id);
