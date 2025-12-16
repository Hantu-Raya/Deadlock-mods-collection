(function () {
  "use strict";

  const CONFIG = {
    UPDATE_INTERVAL: 0.05,
    // Health percentage thresholds
    THRESHOLD_HIGH: 75,    // Above this = green
    THRESHOLD_MEDIUM: 65,  // Below this = yellow
    THRESHOLD_LOW: 50,     // Below this = orange
    THRESHOLD_CRITICAL: 28 // Below this = red
  };

  const DEBUG = false;

  const state = {
    ready: false,
    lastColorClass: null
  };

  const elementCache = {
    healthBar: null,
    progressBarLeft: null,
    currentHealthLabel: null
  };

  function init() {
    if (state.ready) return;

    if (DEBUG) $.Msg("[HEALTH_COLOR] Initializing...\n");

    elementCache.healthBar = $("#health_bar");
    if (!elementCache.healthBar) {
      if (DEBUG) $.Msg("[HEALTH_COLOR] health_bar not found\n");
      return;
    }

    // Find the ProgressBarLeft child
    const count = elementCache.healthBar.GetChildCount();
    for (let i = 0; i < count; i++) {
      const child = elementCache.healthBar.GetChild(i);
      if (child && child.BHasClass && child.BHasClass("ProgressBarLeft")) {
        elementCache.progressBarLeft = child;
        break;
      }
    }

    if (!elementCache.progressBarLeft) {
      if (DEBUG) $.Msg("[HEALTH_COLOR] ProgressBarLeft not found\n");
      return;
    }

    // Find the current_health label
    elementCache.currentHealthLabel = elementCache.healthBar.FindChildTraverse("current_health");
    if (!elementCache.currentHealthLabel) {
      if (DEBUG) $.Msg("[HEALTH_COLOR] current_health label not found\n");
      // Don't return - we can still color the bar
    }

    state.ready = true;
    if (DEBUG) $.Msg("[HEALTH_COLOR] Initialized successfully\n");
  }

  function getHealthPercentage() {
    const progressHeight = elementCache.progressBarLeft.actuallayoutheight;
    const containerHeight = elementCache.progressBarLeft.GetParent().actuallayoutheight;

    if (containerHeight <= 0) return 100;

    return (progressHeight / containerHeight) * 100;
  }

  function setColorClass(newClass) {
    if (state.lastColorClass === newClass) return;

    // Remove old color classes
    const classes = ["health_white", "health_yellow", "health_orange", "health_red"];
    
    // Update health bar
    for (const cls of classes) {
      elementCache.healthBar.RemoveClass(cls);
    }
    if (newClass) {
      elementCache.healthBar.AddClass(newClass);
    }

    // Update current health label directly
    if (elementCache.currentHealthLabel) {
      for (const cls of classes) {
        elementCache.currentHealthLabel.RemoveClass(cls);
      }
      if (newClass) {
        elementCache.currentHealthLabel.AddClass(newClass);
      }
    }

    state.lastColorClass = newClass;

    if (DEBUG) $.Msg(`[HEALTH_COLOR] Changed to: ${newClass}\n`);
  }

  function update() {
    if (!state.ready) {
      init();
      if (!state.ready) {
        $.Schedule(0.1, update);
        return;
      }
    }

    const healthPct = getHealthPercentage();

    // Determine color based on health percentage
    let colorClass;
    if (healthPct < CONFIG.THRESHOLD_CRITICAL) {
      colorClass = "health_red";
    } else if (healthPct < CONFIG.THRESHOLD_LOW) {
      colorClass = "health_orange";
    } else if (healthPct < CONFIG.THRESHOLD_MEDIUM) {
      colorClass = "health_yellow";
    } else {
      colorClass = "health_white";
    }

    setColorClass(colorClass);

    $.Schedule(CONFIG.UPDATE_INTERVAL, update);
  }

  if (DEBUG) $.Msg("[HEALTH_COLOR] Script loaded\n");

  init();
  update();
})();
