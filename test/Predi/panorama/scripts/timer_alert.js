(function() {
    'use strict';
    
    var CONFIG = {
        FIRST_ALERT_TIME: 290, // 4:50
        INTERVAL: 300,         // 5 minutes
        SOUND_NAME: "MidTimer.Alarm",
        TICK_RATE: 0.5
    };
    
    var TimerAlert = {
        lastAlertTime: -1,
        
        init: function() {
            this.loop();
        },
        
        // Robust time fetcher from soul_timer/buff_timer
        gTime: function() {
            var t = 0;
            try { t = Game.GetGameTime() | 0; } catch (e) {}
            if (t > 0) return t;
            
            // Fallback to UI parsing
            return this.uiTime();
        },
        
        uiTime: function() {
            var hud = $.GetContextPanel();
            // Traverse up to find Hud
            while (hud && hud.id !== "Hud" && hud.GetParent()) {
                hud = hud.GetParent();
            }
            if (!hud) return 0;
            
            // Try standard ID locations
            var timePanel = hud.FindChildTraverse("GameTime") || hud.FindChildTraverse("HudGameTime");
            if (timePanel && timePanel.text) return this.parseSec(timePanel.text);
            
            // Try class search
            var children = hud.FindChildrenWithClassTraverse("GameTime");
            if (children && children[0] && children[0].text) return this.parseSec(children[0].text);
            
            return 0;
        },
        
        parseSec: function(t) {
            if (!t) return 0;
            var parts = String(t).split(':');
            if (parts.length !== 2) return 0;
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        },
        
        loop: function() {
            var self = this;
            
            try {
                var currentTime = self.gTime();
                
                // Debug log every tick (1s)
                if (currentTime > 0) {
                     $.Msg("[Predi] Current Time: " + currentTime + "\n");
                }
                
                // Reset if game restarted
                if (currentTime < self.lastAlertTime) {
                    self.lastAlertTime = -1;
                    $.Msg("[Predi] Game reset detected. Resetting alert tracker.\n");
                }
                
                if (currentTime >= CONFIG.FIRST_ALERT_TIME) {
                    // Calculate the most recent alert time that should have happened
                    var alertNumber = Math.floor((currentTime - CONFIG.FIRST_ALERT_TIME) / CONFIG.INTERVAL);
                    var expectedAlertTime = CONFIG.FIRST_ALERT_TIME + alertNumber * CONFIG.INTERVAL;
                    
                    // If we just passed an alert time and haven't triggered it yet
                    // Allow a 5-second window to trigger (to avoid missing it if lag/tick skip)
                    if (currentTime >= expectedAlertTime && 
                        currentTime <= expectedAlertTime + 5 && 
                        self.lastAlertTime < expectedAlertTime) {
                        
                        $.Msg("[Predi] !!! ALERT TRIGGERED at " + currentTime + " (Expected: " + expectedAlertTime + ") !!!\n");
                        try { $.DispatchEvent("PlaySoundEffect", CONFIG.SOUND_NAME); } catch(e) { $.Msg("[Predi] Sound Error: " + e + "\n"); }
                        self.lastAlertTime = expectedAlertTime;
                    }
                }
            } catch (e) {
                $.Msg("[Predi] Error in loop: " + e + "\n");
            }
            
            $.Schedule(CONFIG.TICK_RATE, function() { self.loop(); });
        }
    };
    
    TimerAlert.init();
})();
