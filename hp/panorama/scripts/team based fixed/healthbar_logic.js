(function () {
    'use strict';

    /**
     * HEALTHBAR LOGIC - OPTIMIZED & PRODUCTION READY
     * 
     * Features:
     * - Team-based coloring (Fixed Logic)
     * - High performance caching (minimizes FindChildTraverse)
     * - Smooth updates (60frame_rate target where relevant)
     * - Robust error handling
     */

    // ========================================================================
    // CONSTANTS & CONFIGURATION
    // ========================================================================

    const CONSTANTS = {
        COLORS: {
            TEAM_1: 'rgb(255,201,97)',  // Amber
            TEAM_2: 'rgb(100,133,252)', // Blue
            MID: 'rgb(255,123,0)',      // Orange
            NEUTRAL: 'rgb(91,239,181)', // Turquoise
            WHITE: '#ffffff',
            CRITICAL: '#e16161'         // Red
        },
        CLASSES: {
            BAR_PULSE: 'low_hp_bar_pulse',
            TEXT_LARGE: 'low_hp_text_large',
            ULT_STATIC: 'low_hp_ult_static',
            ENEMY: 'enemy',
            TEAM_1: 'team1',
            TEAM_2: 'team2',
            TEAM_NEUTRAL: 'team_neutral',
            NEUTRAL: 'neutral',
            LEVEL_TIERS: ['level_tier2', 'level_tier3', 'level_tier4', 'level_tier5']
        },
        IDS: {
            UNIT_STATUS: 'UnitStatus',
            HP_COUNTER: 'hp_counter',
            PIP_LABEL: 'unit_healthbar_pip_label',
            LAGGING_BAR: 'unit_healthbar_lagging',
            ULT_ICON_1: 'unit_ult_ready_icon',
            ULT_ICON_2: 'ult_icon',
            ULT_ICON_3: 'ability_ult',
            LEVEL_LABEL: 'unit_level_label',
            LEVEL_CONTAINER: 'LevelContainer'
        },
        INTERVALS: {
            DEFAULT: 0.15,
            FAST: 0.4,    // 400ms
            NEUTRAL: 1.5, // 1.5s
            IDLE: 1.0,    // 1s
            CHECK: 2000,  // Re-scan attributes every 2s
            TIMEOUT: 2000 // Idle timeout
        },
        THRESHOLDS: {
            LOW_HP: 25,     // %
            FACTOR: 0.97,
            HP_CHANGE: 3,   // %
            MAX_ATTEMPTS: 10
        },
        LEVEL_TIERS: [11, 19, 27, 35]
    };

    // ========================================================================
    // STATE MANAGEMENT
    // ========================================================================

    const UI = {
        context: $.GetContextPanel(),
        rootBar: null,      // Main healthbar panel found in context
        unitStatus: null,
        hpCounter: null,
        pipLabel: null,
        laggingBar: null,
        laggingBarParent: null,
        ultIcon: null,
        levelLabel: null,
        levelContainer: null,
        windowRoot: null
    };

    const STATE = {
        isCached: false,
        cacheAttempts: 0,
        currentParent: null,
        
        // Entity Flags
        teamId: 0,          // 0=Unknown, 1=Team1, 2=Team2
        flags: 0,           // Bitmask: 1=Enemy, 2=Neutral
        
        // Previous Values (for change detection)
        lastColor: null,
        lastUltColor: null,
        lastTextColor: null,
        lastHpPercent: -1,
        lastLowHpPercent: -1,
        lastWidth: -1,
        lastParentWidth: -1,
        lastText: null,     // For parsing max HP
        lastShownHealth: -1,
        lastShownMax: -1,
        
        // Timing & Counters
        calculatedMax: 0,
        lastAttributeCheckTime: 0,
        lastUpdateLoopTime: 0,
        stableFrameCount: 0,
        previousPercent: -1,
        isPulseMode: false,
        lastLevel: -1,
        
        // Visibility Tracking
        labelVisibility: null
    };

    // ========================================================================
    // CORE FUNCTIONS
    // ========================================================================

    /**
     * Initialize/Find the main healthbar element in the current context.
     * @returns {Panel|null}
     */
    function findRootBar() {
        return UI.context.FindChildTraverse('unit_healthbar_lagging') || 
               UI.context.FindChildTraverse('health_bar') || 
               UI.context.FindChildTraverse('unit_health') || 
               UI.context.FindChildTraverse('hero_health_lagging');
    }

    /**
     * Scan parent hierarchy to determine team and hostility.
     * Updates STATE.teamId and STATE.flags.
     * @param {Panel} startPanel 
     */
    function scanAttributes(startPanel) {
        let team = 0;
        let flags = 0;
        let depth = 0;
        let current = startPanel;

        while (current && depth < 10) {
            if (typeof current.BHasClass === 'function') {
                if (!team) {
                    if (current.BHasClass(CONSTANTS.CLASSES.TEAM_2)) team = 2;
                    else if (current.BHasClass(CONSTANTS.CLASSES.TEAM_1)) team = 1;
                }
                
                // Flag 1: Enemy
                if (!(flags & 1) && current.BHasClass(CONSTANTS.CLASSES.ENEMY)) flags |= 1;
                
                // Flag 2: Neutral
                if (!(flags & 2) && (current.BHasClass(CONSTANTS.CLASSES.TEAM_NEUTRAL) || current.BHasClass(CONSTANTS.CLASSES.NEUTRAL))) flags |= 2;
                
                // Break if we found everything (Team + Enemy/Neutral check)
                // Note: Logic allows stopping early if we identified team and at least one flag, 
                // but usually we want to confirm 'enemy' status primarily.
                if (team && (flags & 3)) break;
            }

            if (typeof current.GetParent !== 'function') break;
            current = current.GetParent();
            depth++;
        }

        STATE.teamId = team;
        STATE.flags = flags;
    }

    /**
     * Cache UI references. Returns true if critical elements are found.
     * @returns {boolean}
     */
    function cachePanels() {
        if (STATE.isCached) return true;
        if (STATE.cacheAttempts >= CONSTANTS.THRESHOLDS.MAX_ATTEMPTS) return false;

        STATE.cacheAttempts++;

        if (!UI.unitStatus || !UI.unitStatus.IsValid()) {
            UI.unitStatus = UI.context.FindChildTraverse(CONSTANTS.IDS.UNIT_STATUS);
            if (!UI.unitStatus) return false;
        }

        if (!UI.hpCounter || !UI.hpCounter.IsValid()) UI.hpCounter = UI.unitStatus.FindChildTraverse(CONSTANTS.IDS.HP_COUNTER);
        if (!UI.pipLabel || !UI.pipLabel.IsValid()) UI.pipLabel = UI.unitStatus.FindChildTraverse(CONSTANTS.IDS.PIP_LABEL);
        
        // Cache Lagging Bar (Used for width calc)
        if (!UI.laggingBar || !UI.laggingBar.IsValid()) UI.laggingBar = UI.unitStatus.FindChildTraverse(CONSTANTS.IDS.LAGGING_BAR);
        if (UI.laggingBar && (!UI.laggingBarParent || !UI.laggingBarParent.IsValid())) UI.laggingBarParent = UI.laggingBar.GetParent();

        // Check if we have enough to proceed (PipLabel + Bars required for logic)
        if (UI.pipLabel && UI.laggingBar && UI.laggingBarParent) {
            STATE.isCached = true;
            return true;
        }

        return false;
    }

    /**
     * Parse the pipe-delimited string to calculate Max HP.
     * Logic: Count '|' (500hp) and quotes (100hp).
     * @param {string} text 
     * @returns {number}
     */
    function parseMaxHealth(text) {
        if (text === STATE.lastText) return STATE.calculatedMax;
        STATE.lastText = text;

        let pipes = 0;
        let quotes = 0;
        let len = text.length;
        let lastPipeIndex = text.lastIndexOf('|');

        for (let i = 0; i < len; i++) {
            let code = text.charCodeAt(i);
            if (code === 124) { // '|'
                pipes++;
            } else if ((code === 34 || code === 39) && (lastPipeIndex === -1 || i > lastPipeIndex)) {
                // '"' or ''' occurring after the last pipe
                quotes++;
            }
        }

        STATE.calculatedMax = (pipes * 500) + (quotes * 100);
        return STATE.calculatedMax;
    }

    /**
     * Apply wash color to the health bar.
     */
    function setBarColor(color) {
        if (STATE.lastColor === color) return;
        if (UI.rootBar) UI.rootBar.style.washColor = color;
        STATE.lastColor = color;
    }

    /**
     * Apply wash color to the ultimate icon.
     */
    function setUltColor(color) {
        if (!UI.ultIcon || !UI.ultIcon.IsValid()) {
            // Try finding it (cached search)
            UI.ultIcon = UI.context.FindChildTraverse(CONSTANTS.IDS.ULT_ICON_1) || 
                         UI.context.FindChildTraverse(CONSTANTS.IDS.ULT_ICON_2) || 
                         UI.context.FindChildTraverse(CONSTANTS.IDS.ULT_ICON_3);
        }
        
        if (!UI.ultIcon || !UI.ultIcon.style) return;
        
        if (STATE.lastUltColor === color) return;
        UI.ultIcon.style.washColor = color;
        STATE.lastUltColor = color;
    }

    /**
     * Apply wash color to the HP text.
     */
    function setTextColor(color) {
        if (!UI.hpCounter || !UI.hpCounter.style) return;
        if (STATE.lastTextColor === color) return;
        UI.hpCounter.style.washColor = color;
        STATE.lastTextColor = color;
    }

    /**
     * Update the text content of the health counter.
     */
    function updateHealthText(current, max) {
        if (!UI.hpCounter) return;
        if (current === STATE.lastShownHealth && max === STATE.lastShownMax) return;

        // Ensure visibility
        if (STATE.labelVisibility !== 'visible') {
            UI.hpCounter.style.visibility = 'visible';
            STATE.labelVisibility = 'visible';
        }

        const text = current + ' / ' + max;
        
        try {
            if (UI.hpCounter.text !== text) UI.hpCounter.text = text;
        } catch (e) {
            // Fallback for some panel types
            try {
                UI.hpCounter.SetAttributeString('text', text);
            } catch (e2) {}
        }

        STATE.lastShownHealth = current;
        STATE.lastShownMax = max;
    }

    // ========================================================================
    // MAIN LOOPS
    // ========================================================================

    /**
     * Main Game Loop - Handles Health Bar Logic
     */
    function gameLoop() {
        const now = Date.now();
        
        // 1. Validation & Setup
        if (!UI.rootBar) {
            UI.rootBar = findRootBar();
            if (!UI.rootBar) return; // Exit if not found
        }

        if (!STATE.isCached) {
            if (!cachePanels()) {
                $.Schedule(CONSTANTS.INTERVALS.DEFAULT, gameLoop);
                return;
            }
        }

        // Track parent changes
        if (typeof UI.rootBar.GetParent === 'function') {
            let p = UI.rootBar.GetParent();
            if (STATE.currentParent !== p) STATE.currentParent = p;
        }

        // 2. Periodic Attribute Scan (every 2s)
        if (now - STATE.lastAttributeCheckTime > CONSTANTS.INTERVALS.CHECK) {
            STATE.lastAttributeCheckTime = now;
            scanAttributes(UI.rootBar);
        }

        // 3. Logic Branching
        // Branch A: Neutrals
        if (STATE.flags & 2) {
            setBarColor(CONSTANTS.COLORS.NEUTRAL);
            setTextColor(CONSTANTS.COLORS.WHITE);
            STATE.lastUpdateLoopTime = now;
            $.Schedule(CONSTANTS.INTERVALS.NEUTRAL, gameLoop);
            return;
        }

        // Branch B: Not Enemy (Friendly/Self)
        if (!(STATE.flags & 1)) {
            STATE.lastUpdateLoopTime = now;
            $.Schedule(CONSTANTS.INTERVALS.FAST, gameLoop);
            return;
        }

        // 4. Width Calculation
        const w = UI.rootBar.actuallayoutwidth | 0;
        const pw = (STATE.currentParent && STATE.currentParent.actuallayoutwidth !== undefined) ? STATE.currentParent.actuallayoutwidth | 0 : 0;

        // Optimization: Idle Check
        // If width hasn't changed for a while, slow down updates
        if (w === STATE.lastWidth && pw === STATE.lastParentWidth) {
            if (now - STATE.lastUpdateLoopTime > CONSTANTS.INTERVALS.TIMEOUT) {
                $.Schedule(CONSTANTS.INTERVALS.IDLE, gameLoop);
                return;
            }
            $.Schedule(CONSTANTS.INTERVALS.DEFAULT, gameLoop);
            return;
        }

        STATE.lastWidth = w;
        STATE.lastParentWidth = pw;
        STATE.lastUpdateLoopTime = now;

        if (pw <= 0) {
            $.Schedule(0.18, gameLoop);
            return;
        }

        // 5. HP Calculation
        let hpPercent = ((w / pw) * 100) | 0;

        // Optimization: Small Delta Filter
        // If change is small (<3%) and above low threshold, skip update
        if (Math.abs(hpPercent - STATE.lastHpPercent) < CONSTANTS.THRESHOLDS.HP_CHANGE && hpPercent > CONSTANTS.THRESHOLDS.LOW_HP) {
            $.Schedule(CONSTANTS.INTERVALS.DEFAULT, gameLoop);
            return;
        }

        // Stability check
        if (hpPercent === STATE.previousPercent) {
            STATE.stableFrameCount++;
        } else {
            STATE.stableFrameCount = 0;
            STATE.previousPercent = hpPercent;
        }

        STATE.lastHpPercent = hpPercent;

        // 6. Text Update (Max HP Parsing)
        let text = '';
        if (UI.pipLabel) {
            try {
                text = UI.pipLabel.text || UI.pipLabel.GetAttributeString('text', '');
            } catch (e) {
                text = '';
            }
        }

        let currentHealth = 0;
        let maxHealth = 0;

        if (UI.laggingBar && UI.laggingBarParent) {
            const barW = UI.laggingBar.actuallayoutwidth || 0;
            const barParentW = UI.laggingBarParent.actuallayoutwidth || 0;
            const ratio = barParentW > 0 ? barW / barParentW : 0;
            
            maxHealth = parseMaxHealth(text);
            currentHealth = ratio >= CONSTANTS.THRESHOLDS.FACTOR ? maxHealth : Math.round(maxHealth * ratio);
        }

        updateHealthText(currentHealth, maxHealth);

        // 7. Visual Updates (Colors)
        let scheduleTime = CONSTANTS.INTERVALS.DEFAULT;

        if (hpPercent <= CONSTANTS.THRESHOLDS.LOW_HP) {
            // LOW HEALTH MODE
            if (!UI.rootBar || !UI.rootBar.IsValid()) {
                $.Schedule(0.15, gameLoop);
                return;
            }

            if (!STATE.isPulseMode) {
                UI.rootBar.AddClass(CONSTANTS.CLASSES.BAR_PULSE);
                if (UI.hpCounter) UI.hpCounter.AddClass(CONSTANTS.CLASSES.TEXT_LARGE);
                
                // Re-verify ult icon existence
                if (!UI.ultIcon || !UI.ultIcon.IsValid()) {
                    setUltColor('dummy'); // Triggers find
                }
                if (UI.ultIcon) UI.ultIcon.AddClass(CONSTANTS.CLASSES.ULT_STATIC);
                
                STATE.isPulseMode = true;
                STATE.lastColor = null;
                STATE.lastUltColor = null;
                STATE.lastTextColor = null;
            }

            setTextColor(CONSTANTS.COLORS.CRITICAL);
            setUltColor(CONSTANTS.COLORS.CRITICAL);

            if (STATE.lastLowHpPercent === -1 || Math.abs(hpPercent - STATE.lastLowHpPercent) >= 5) {
                STATE.lastLowHpPercent = hpPercent;
                STATE.stableFrameCount = 0;
            }
            scheduleTime = CONSTANTS.INTERVALS.DEFAULT;

        } else {
            // NORMAL HEALTH MODE
            if (STATE.isPulseMode) {
                UI.rootBar.RemoveClass(CONSTANTS.CLASSES.BAR_PULSE);
                if (UI.hpCounter) UI.hpCounter.RemoveClass(CONSTANTS.CLASSES.TEXT_LARGE);
                if (UI.ultIcon) UI.ultIcon.RemoveClass(CONSTANTS.CLASSES.ULT_STATIC);
                
                STATE.isPulseMode = false;
                STATE.lastTextColor = null;
                STATE.lastUltColor = null;
            }

            // Determine Color
            let color = CONSTANTS.COLORS.TEAM_1;
            if (hpPercent <= 65) {
                color = CONSTANTS.COLORS.MID;
            } else if (STATE.teamId === 2) {
                color = CONSTANTS.COLORS.TEAM_2;
            } else {
                color = CONSTANTS.COLORS.TEAM_1;
            }

            setBarColor(color);
            setUltColor(color);
            setTextColor(CONSTANTS.COLORS.WHITE);

            STATE.lastLowHpPercent = hpPercent;

            // Dynamic Interval Adjustment
            if (STATE.stableFrameCount >= 5) {
                const timeFactor = Math.floor(STATE.stableFrameCount / 5);
                // Decaying update rate for stable values
                scheduleTime = Math.min(CONSTANTS.INTERVALS.DEFAULT * Math.pow(2, timeFactor), CONSTANTS.INTERVALS.IDLE);
            }
        }

        $.Schedule(scheduleTime, gameLoop);
    }

    // ========================================================================
    // LEVEL TIER LOGIC
    // ========================================================================

    function parseLevel(txt) {
        let val = 0;
        for (let i = 0; i < txt.length; i++) {
            const c = txt.charCodeAt(i) - 48;
            if (c >= 0 && c <= 9) val = val * 10 + c;
        }
        return val;
    }

    function findEnemyRoot(panel) {
        let cur = panel;
        while (cur) {
            if (typeof cur.BHasClass === 'function' && cur.BHasClass(CONSTANTS.CLASSES.ENEMY)) {
                return cur;
            }
            if (typeof cur.GetParent !== 'function') break;
            cur = cur.GetParent();
        }
        return null;
    }

    function cacheLevelUI() {
        if (!UI.levelLabel || !UI.levelLabel.IsValid()) {
            UI.levelLabel = UI.context.FindChildTraverse(CONSTANTS.IDS.LEVEL_LABEL);
        }
        if (!UI.levelContainer || !UI.levelContainer.IsValid()) {
            UI.levelContainer = UI.context.FindChildTraverse(CONSTANTS.IDS.LEVEL_CONTAINER);
        }
        if (UI.levelContainer && (!UI.windowRoot || !UI.windowRoot.IsValid())) {
            UI.windowRoot = findEnemyRoot(UI.levelContainer);
        }
        return UI.levelLabel && UI.levelContainer && UI.windowRoot;
    }

    function updateLevelTier() {
        if (!cacheLevelUI()) return;

        let txt = '';
        try {
            txt = UI.levelLabel.text || UI.levelLabel.GetAttributeString('text', '') || '';
        } catch (e) {
            txt = '';
        }

        // Skip if binding not resolved
        if (!txt || txt.charCodeAt(0) === 123) return;

        const level = parseLevel(txt);
        if (level === STATE.lastLevel || level === 0) return;
        STATE.lastLevel = level;

        // Clear classes
        for (let i = 0; i < CONSTANTS.CLASSES.LEVEL_TIERS.length; i++) {
            UI.windowRoot.RemoveClass(CONSTANTS.CLASSES.LEVEL_TIERS[i]);
        }

        // Apply new class
        for (let i = CONSTANTS.LEVEL_TIERS.length - 1; i >= 0; i--) {
            if (level >= CONSTANTS.LEVEL_TIERS[i]) {
                UI.windowRoot.AddClass(CONSTANTS.CLASSES.LEVEL_TIERS[i]);
                break;
            }
        }
    }

    function levelLoop() {
        updateLevelTier();
        $.Schedule(0.5, levelLoop);
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    gameLoop();
    levelLoop();

})();

