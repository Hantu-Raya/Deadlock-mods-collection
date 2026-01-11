(function() {
    'use strict';
    
    var CONFIG = {
        FIRST_ALERT: 290,      // 4:50 (5 min - 10 sec)
        INTERVAL: 300,         // 5 minutes
        SOUND_NAME: "MinimapReminder.Alarm",
        TICK_RATE: 1.0,
        TIME_CACHE_TTL: 500,
        IS_DEV: 1
    };
    
    // Clock panel IDs to search
    var TIME_IDS = ["HudGameTime", "GameTime", "MainGameTime", "TopBarGameClock"];
    
    // State
    var UI = { root: null, hud: null, clock: null };
    var lastAlertTime = -1;
    var tCache = 0;
    var tCacheTs = 0;
    var bootAttempts = 0;
    
    $.Msg("[Predi2] === SCRIPT LOADED ===\n");
    
    // Parse time string "MM:SS" to seconds
    function parseTime(s) {
        if (!s) return 0;
        var mm = 0, ss = 0, past = false;
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c === 58) { past = true; continue; }
            if (c < 48 || c > 57) continue;
            if (!past) mm = mm * 10 + (c - 48);
            else ss = ss * 10 + (c - 48);
        }
        return mm * 60 + (ss > 59 ? 59 : ss);
    }
    
    // Find the game HUD panel (try multiple approaches)
    function findHud() {
        var candidates = [
            "CitadelHud", "Hud", "HudRoot", "GameHud", 
            "HudAndDBOverlay", "DOTAHud", "gameplay_hud"
        ];
        
        if (!UI.root) return null;
        
        for (var i = 0; i < candidates.length; i++) {
            try {
                var p = UI.root.FindChildTraverse(candidates[i]);
                if (p) {
                    $.Msg("[Predi2] Found HUD panel: " + candidates[i] + "\n");
                    return p;
                }
            } catch (e) {}
        }
        return UI.root;
    }
    
    // Find the UI clock panel
    function findClock() {
        var searchRoots = [UI.hud, UI.root];
        
        for (var r = 0; r < searchRoots.length; r++) {
            var root = searchRoots[r];
            if (!root) continue;
            
            // Search by ID
            for (var i = 0; i < TIME_IDS.length; i++) {
                try {
                    var p = root.FindChildTraverse(TIME_IDS[i]);
                    if (p && p.text) {
                        $.Msg("[Predi2] Found clock by ID: " + TIME_IDS[i] + " = '" + p.text + "'\n");
                        return p;
                    }
                } catch (e) {}
            }
            
            // Search by class
            try {
                var arr = root.FindChildrenWithClassTraverse("GameTime");
                if (arr && arr.length > 0) {
                    for (var j = 0; j < arr.length; j++) {
                        if (arr[j] && arr[j].text) {
                            $.Msg("[Predi2] Found clock by class: GameTime = '" + arr[j].text + "'\n");
                            return arr[j];
                        }
                    }
                }
            } catch (e) {}
            
            // Try TopBar
            try {
                var topBar = root.FindChildTraverse("TopBar");
                if (topBar) {
                    var clock = topBar.FindChildTraverse("GameTime");
                    if (clock && clock.text) {
                        $.Msg("[Predi2] Found clock in TopBar: '" + clock.text + "'\n");
                        return clock;
                    }
                }
            } catch (e) {}
        }
        
        return null;
    }
    
    function clockTime() {
        // Try cached clock
        if (UI.clock) {
            try {
                if (UI.clock.IsValid && UI.clock.IsValid() && UI.clock.text) {
                    return parseTime(UI.clock.text);
                }
            } catch (e) {}
            UI.clock = null;
        }
        
        // Find clock panel
        UI.clock = findClock();
        if (UI.clock && UI.clock.text) {
            return parseTime(UI.clock.text);
        }
        
        return 0;
    }
    
    // Get game time with fallback chain
    function gTime() {
        var now = Date.now();
        if (now - tCacheTs < CONFIG.TIME_CACHE_TTL) return tCache;
        
        var t = 0;
        
        // Try Game.GetGameTime
        try { 
            if (typeof Game !== "undefined" && Game.GetGameTime) {
                t = Game.GetGameTime(); 
                if (t) t = Math.floor(t);
            }
        } catch (e) {}
        
        if (t > 0) {
            tCache = t;
            tCacheTs = now;
            return t;
        }
        
        // Try GameUI.GetGameTime
        try { 
            if (typeof GameUI !== "undefined" && GameUI.GetGameTime) {
                t = GameUI.GetGameTime(); 
                if (t) t = Math.floor(t);
            }
        } catch (e) {}
        
        if (t > 0) {
            tCache = t;
            tCacheTs = now;
            return t;
        }
        
        // Try Game.GetDOTATime (legacy)
        try { 
            if (typeof Game !== "undefined" && Game.GetDOTATime) {
                t = Game.GetDOTATime(false, false); 
                if (t) t = Math.floor(t);
            }
        } catch (e) {}
        
        if (t > 0) {
            tCache = t;
            tCacheTs = now;
            return t;
        }
        
        // Fallback to UI clock parsing
        t = clockTime();
        if (t > 0) {
            tCache = t;
            tCacheTs = now;
        }
        
        return t;
    }
    
    // Boot: Find root and HUD panels
    function boot() {
        bootAttempts++;
        $.Msg("[Predi2] Boot attempt #" + bootAttempts + "\n");
        
        try {
            var ctx = $.GetContextPanel();
            if (!ctx) {
                $.Msg("[Predi2] No context panel, retrying...\n");
                $.Schedule(0.5, boot);
                return;
            }
            
            // Traverse to absolute root
            UI.root = ctx;
            var depth = 0;
            while (UI.root.GetParent && UI.root.GetParent() && depth < 20) {
                UI.root = UI.root.GetParent();
                depth++;
            }
            $.Msg("[Predi2] Traversed " + depth + " levels to root. Root ID: " + (UI.root.id || "unnamed") + "\n");
            
            // Find HUD panel
            UI.hud = findHud();
            
            // Try to find clock immediately
            UI.clock = findClock();
            
            $.Msg("[Predi2] Boot complete. Clock: " + (UI.clock ? "found" : "null") + "\n");
            
            // Check available APIs
            $.Msg("[Predi2] APIs: Game=" + (typeof Game !== "undefined") + 
                  ", GameUI=" + (typeof GameUI !== "undefined") + "\n");
            
            // Test Game.GetGameTime directly
            try {
                var testTime = Game.GetGameTime();
                $.Msg("[Predi2] Game.GetGameTime() = " + testTime + "\n");
            } catch (e) {
                $.Msg("[Predi2] Game.GetGameTime() FAILED: " + e + "\n");
            }
            
            // Start main loop
            loop();
            
        } catch (e) {
            $.Msg("[Predi2] Boot error: " + e + "\n");
            if (bootAttempts < 10) {
                $.Schedule(1.0, boot);
            }
        }
    }
    
    var tickCount = 0;
    
    function loop() {
        try {
            var currentTime = gTime();
            tickCount++;
            
            // Debug log every 10 ticks
            if (CONFIG.IS_DEV && tickCount % 10 === 0) {
                $.Msg("[Predi2] Tick #" + tickCount + " | GameTime: " + currentTime + "s\n");
            }
            
            // Reset tracker if game restarted
            if (currentTime > 0 && currentTime < lastAlertTime) {
                lastAlertTime = -1;
                $.Msg("[Predi2] Game reset detected\n");
            }
            
            // Check if we should play alert
            if (currentTime >= CONFIG.FIRST_ALERT) {
                var alertNum = Math.floor((currentTime - CONFIG.FIRST_ALERT) / CONFIG.INTERVAL);
                var alertTime = CONFIG.FIRST_ALERT + (alertNum * CONFIG.INTERVAL);
                
                if (currentTime >= alertTime && 
                    currentTime <= alertTime + 3 && 
                    lastAlertTime < alertTime) {
                    
                    $.Msg("[Predi2] !!! ALERT at " + currentTime + "s (target: " + alertTime + "s) !!!\n");
                    $.DispatchEvent("PlaySoundEffect", CONFIG.SOUND_NAME);
                    lastAlertTime = alertTime;
                }
            }
        } catch (e) {
            $.Msg("[Predi2] Loop error: " + e + "\n");
        }
        
        $.Schedule(CONFIG.TICK_RATE, loop);
    }
    
    // Delay boot slightly to let HUD fully load
    $.Schedule(1.0, boot);
})();
