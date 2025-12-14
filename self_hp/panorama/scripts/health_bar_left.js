(function () {
  "use strict";

  const CONFIG = {
    LOCK_DURATION: 5,
    COLOR_RED: "rgb(255, 71, 77)",
    COLOR_WHITE: "rgb(255, 255, 255)",
    UPDATE_INTERVAL: 1,
    THRESHOLD: 25,
    DAMAGE_CHECK_DELAY: 0.5, // Reduced from 1 to 0.5 for faster recovery detection
    COOLDOWN_DURATION: 12,
    STABILITY_THRESHOLD: 1,
    SEARCH_CACHE_TTL: 3000,
    HEALTH_SMOOTH_ALPHA: 0.3,
    DAMAGE_THRESHOLD: 0.1,
    RECOVERY_THRESHOLD: 0.7,
  };

  const DEBUG = true;

  const elementCache = {
    revitalizerPanel: null,
    lastSearchTime: 0,
    healthBar: null,
    progressBarLeft: null,
    cdIcons: null,
    fortCdLabel: null,
  };

  const state = {
    maxHeight: null,
    lockTime: 0,
    lastColor: null,
    lastVisibilityState: null,
    ready: false,
    prevHealthPct: 0,
    smoothedHealthPct: 0,
    damageTakenTime: 0,
    lowestHealthPct: Infinity,
    cooldownActive: false,
    cooldownStartTime: 0,
    actualCooldownDuration: CONFIG.COOLDOWN_DURATION,
    lastHealthDuringCooldown: 0,
    damageDetected: false,
  };

  function resetAllLogic() {
    if (DEBUG) {
      $.Msg("[RESET] Resetting all logic to initial state\n");
    }

    state.maxHeight = null;
    state.lockTime = 0;
    state.lastColor = null;
    state.prevHealthPct = 0;
    state.smoothedHealthPct = 0;
    state.damageTakenTime = 0;
    state.lowestHealthPct = Infinity;
    state.cooldownActive = false;
    state.cooldownStartTime = 0;
    state.actualCooldownDuration = CONFIG.COOLDOWN_DURATION;
    state.lastHealthDuringCooldown = 0;
    state.damageDetected = false;

    if (elementCache.fortCdLabel) {
      elementCache.fortCdLabel.text = "0";
    }

    if (DEBUG) {
      $.Msg("[RESET] All state variables reset to initial values\n");
    }
  }

  function init() {
    if (state.ready) return;

    if (DEBUG) $.Msg("[INIT] Initializing elements\n");

    elementCache.healthBar = $("#health_bar");
    if (!elementCache.healthBar) {
      if (DEBUG) $.Msg("[INIT] health_bar not found\n");
      return;
    }

    elementCache.progressBarLeft =
      elementCache.healthBar.FindChild("health_bar_left");
    if (!elementCache.progressBarLeft) {
      const count = elementCache.healthBar.GetChildCount();
      for (let i = 0; i < count; i++) {
        const child = elementCache.healthBar.GetChild(i);
        if (child?.BHasClass?.("ProgressBarLeft")) {
          elementCache.progressBarLeft = child;
          break;
        }
      }
    }

    elementCache.cdIcons = $("#cd_icons");
    if (!elementCache.cdIcons) {
      if (DEBUG) $.Msg("[INIT] cd_icons not found\n");
      return;
    }

    elementCache.fortCdLabel = $("#fort_cd");
    if (!elementCache.fortCdLabel) {
      if (DEBUG) $.Msg("[INIT] fort_cd not found\n");
      return;
    }

    state.ready = !!elementCache.progressBarLeft;

    if (state.ready && DEBUG) {
      $.Msg("[INIT] All elements initialized successfully\n");
    }
  }

  function isCachedRevitalizerStillValid() {
    if (!elementCache.revitalizerPanel) return false;

    try {
      if (elementCache.revitalizerPanel.BHasClass?.("revitalizer")) {
        return true;
      }
    } catch (e) {}

    return false;
  }

  function findRevitalizer() {
    if (elementCache.revitalizerPanel && !isCachedRevitalizerStillValid()) {
      if (DEBUG) {
        $.Msg("[REVITALIZER] Revitalizer removed/swapped detected!\n");
      }
      elementCache.revitalizerPanel = null;
      elementCache.lastSearchTime = 0;
    }

    if (elementCache.revitalizerPanel) return elementCache.revitalizerPanel;

    const now = Date.now();
    if (now - elementCache.lastSearchTime < CONFIG.SEARCH_CACHE_TTL) {
      return elementCache.revitalizerPanel;
    }

    elementCache.lastSearchTime = now;

    try {
      let root = $.GetContextPanel?.();
      while (root?.GetParent?.()) {
        root = root.GetParent();
      }

      if (!root) return null;

      const lowerLeft = root.FindChildTraverse("LowerLeft");
      if (!lowerLeft) return null;

      const queue = [lowerLeft];

      while (queue.length > 0) {
        const panel = queue.shift();

        if (panel?.BHasClass?.("revitalizer")) {
          elementCache.revitalizerPanel = panel;
          if (DEBUG) {
            $.Msg("[REVITALIZER] Revitalizer found and cached\n");
          }
          return panel;
        }

        const childCount = panel?.GetChildCount?.() || 0;
        for (let i = 0; i < childCount; i++) {
          try {
            queue.push(panel.GetChild(i));
          } catch (e) {}
        }
      }
    } catch (error) {}

    return null;
  }

  function updateRevitalizerVisibility() {
    if (!elementCache.cdIcons) return;

    const found = findRevitalizer();
    const currentState = found ? "visible" : "collapse";

    if (currentState !== state.lastVisibilityState) {
      state.lastVisibilityState = currentState;
      elementCache.cdIcons.style.visibility = currentState;

      if (DEBUG) {
        $.Msg(`[VISIBILITY] cd_icons changed to: ${currentState}\n`);
      }

      if (currentState === "collapse") {
        if (DEBUG) {
          $.Msg("[VISIBILITY] Revitalizer removed - Resetting all logic\n");
        }

        resetAllLogic();
      } else if (currentState === "visible") {
        if (DEBUG) {
          $.Msg(
            "[VISIBILITY] Revitalizer equipped - Resetting damage detection baseline\n",
          );
        }

        state.prevHealthPct = 0;
        state.smoothedHealthPct = 0;
        state.damageTakenTime = 0;
        state.lowestHealthPct = Infinity;
        state.damageDetected = false;
        state.cooldownActive = false;

        if (DEBUG) {
          $.Msg("[VISIBILITY] Damage detection reset - Ready for new game\n");
        }
      }
    }
  }

  function interruptCooldown(currentPct) {
    if (!state.cooldownActive) return false;

    if (
      state.lastHealthDuringCooldown &&
      currentPct < state.lastHealthDuringCooldown - 0.5
    ) {
      if (DEBUG) {
        $.Msg(
          `[INTERRUPT] Cooldown interrupted at ${currentPct.toFixed(1)}%\n`,
        );
      }

      state.cooldownActive = false;
      state.cooldownStartTime = 0;
      state.actualCooldownDuration = CONFIG.COOLDOWN_DURATION;
      state.lastHealthDuringCooldown = 0;
      state.damageTakenTime = 0;
      state.lowestHealthPct = Infinity;
      state.prevHealthPct = currentPct;
      state.damageDetected = false;
      elementCache.fortCdLabel.text = "12";

      if (DEBUG) {
        $.Msg("[INTERRUPT] Cooldown reset to 12s\n");
      }

      return true;
    }

    state.lastHealthDuringCooldown = currentPct;
    return false;
  }

  function updateCooldown() {
    if (!state.cooldownActive) return;

    const now = Date.now();
    const elapsed = (now - state.cooldownStartTime) / 1000;
    const remaining = Math.max(0, state.actualCooldownDuration - elapsed);

    elementCache.fortCdLabel.text = Math.ceil(remaining).toString();

    if (remaining <= 0) {
      state.cooldownActive = false;
      elementCache.fortCdLabel.text = "0";
      if (DEBUG) {
        $.Msg("[COOLDOWN] Cooldown finished\n");
      }
    }
  }

  function startCooldown() {
    if (state.cooldownActive) {
      if (DEBUG) {
        $.Msg("[COOLDOWN] Already active, resetting to 12s\n");
      }
    }

    state.actualCooldownDuration = CONFIG.COOLDOWN_DURATION;
    state.cooldownActive = true;
    state.cooldownStartTime = Date.now();
    state.lastHealthDuringCooldown = 0;
    elementCache.fortCdLabel.text = CONFIG.COOLDOWN_DURATION.toString();

    if (DEBUG) {
      $.Msg("[COOLDOWN] Started - 12s duration\n");
    }
  }

  function smoothHealth(rawPct) {
    if (state.smoothedHealthPct === 0) {
      state.smoothedHealthPct = rawPct;
      return rawPct;
    }

    state.smoothedHealthPct =
      CONFIG.HEALTH_SMOOTH_ALPHA * rawPct +
      (1 - CONFIG.HEALTH_SMOOTH_ALPHA) * state.smoothedHealthPct;

    return state.smoothedHealthPct;
  }

  function detectDamage(currentPct) {
    const smoothedPct = smoothHealth(currentPct);

    if (!state.prevHealthPct) {
      state.prevHealthPct = smoothedPct;
      if (DEBUG) {
        $.Msg(`[DAMAGE] Baseline set to ${smoothedPct.toFixed(1)}%\n`);
      }
      return;
    }

    const drop = state.prevHealthPct - smoothedPct;

    if (drop >= CONFIG.DAMAGE_THRESHOLD && !state.damageDetected) {
      state.damageDetected = true;

      if (DEBUG) {
        $.Msg(
          `[DAMAGE] ✓ Detected - From: ${state.prevHealthPct.toFixed(
            2,
          )}%, To: ${smoothedPct.toFixed(2)}%, Drop: ${drop.toFixed(2)}%\n`,
        );
      }

      startCooldown();
    }

    if (drop < -CONFIG.RECOVERY_THRESHOLD) {
      state.damageDetected = false;
      if (DEBUG) {
        $.Msg(`[DAMAGE] Recovery detected: +${Math.abs(drop).toFixed(2)}%\n`);
      }
    }

    state.prevHealthPct = smoothedPct;
  }

  function update() {
    if (!state.ready) {
      init();
      if (!state.ready) return $.Schedule(0.1, update);
    }

    const pH = elementCache.progressBarLeft.actuallayoutheight;
    const cH = elementCache.progressBarLeft.GetParent().actuallayoutheight;

    if (cH <= 0) {
      return $.Schedule(CONFIG.UPDATE_INTERVAL, update);
    }

    const pct = (pH / cH) * 100;

    if (state.maxHeight === null) {
      state.maxHeight = pct;
      state.lockTime = Date.now();
    }

    const color =
      pct <= CONFIG.THRESHOLD ? CONFIG.COLOR_RED : CONFIG.COLOR_WHITE;

    if (color !== state.lastColor) {
      elementCache.healthBar.style.washColor = color;
      state.lastColor = color;
    }

    if (
      (Date.now() - state.lockTime) / 1000 >= CONFIG.LOCK_DURATION &&
      pct > state.maxHeight
    ) {
      state.maxHeight = pct;
      state.lockTime = Date.now();
    }

    const found = findRevitalizer();
    if (found && !elementCache.revitalizerPanel) {
      elementCache.revitalizerPanel = found;
    }

    updateRevitalizerVisibility();

    if (elementCache.revitalizerPanel) {
      if (state.cooldownActive) {
        const wasInterrupted = interruptCooldown(pct);
        if (wasInterrupted) {
          detectDamage(pct);
        }
      } else {
        detectDamage(pct);
      }
    }

    updateCooldown();

    $.Schedule(CONFIG.UPDATE_INTERVAL, update);
  }

  if (DEBUG) {
    $.Msg("[SCRIPT] Revitalizer Cooldown Tracker - 0.5s recovery check\n");
  }

  init();
  update();
})();
