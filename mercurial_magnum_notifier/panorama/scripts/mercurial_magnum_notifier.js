(() => {
  "use strict";

  const POLL_SECONDS = 0.05;
  const ITEM_RESCAN_SECONDS = 0.5;
  const MAGNUM_ITEM_ID = "upgrade_ethereal_bullets";
  const MAGNUM_ACTIVE_CLASS = "MagnumBuffActive";
  const MAGNUM_AMMO_GLOW_CLASS = "MagnumAmmoGlow";
  const SPLIT_SHOT_AMMO_GLOW_CLASS = "SplitShotAmmoGlow";
  const BLOOD_TRIBUTE_AMMO_GLOW_CLASS = "BloodTributeAmmoGlow";
  const SPLIT_SHOT_ITEM_ID = "upgrade_split_shot";
  const SPLIT_SHOT_ACTIVE_CLASS = "SplitShotActive";
  const ONE_INDICATOR_OFFSET_CLASS = "NotifierOneOffset";
  const SPLIT_SHOT_DURATION_SECONDS = 5.0;
  const ACTIVE_ITEM_SLOT_IDS = [
    "abilityButton0",
    "abilityButton1",
    "abilityButton2",
    "abilityButton3",
  ];
  const BLOOD_TRIBUTE_ACTIVE_CLASS = "BloodTributeActive";
  const TWO_INDICATOR_OFFSET_CLASS = "NotifierTwoOffsets";

  const context = $.GetContextPanel();
  const state = {
    root: null,
    nextActivationOrder: 1,
    magnum: {
      item: null,
      nextScanAt: 0,
      notifier: null,
      cooldownMask: null,
      cooldownLabel: null,
      ammoLabel: null,
      active: false,
      activationOrder: 0,
      seen: false,
      coolingDown: false,
      reloading: false,
      cooldown: -1,
      cooldownDegrees: -1,
      readySamples: 0,
    },
    split: {
      item: null,
      nextScanAt: 0,
      notifier: null,
      seen: false,
      ready: false,
      active: false,
      activationOrder: 0,
      activeUntil: 0,
    },
    blood: {
      togglePanel: null,
      nextScanAt: 0,
      abilityContainer: null,
      slots: [null, null, null, null],
      labels: [null, null, null, null],
      notifier: null,
      active: false,
      activationOrder: 0,
    },
  };

  function nowSeconds() {
    return Date.now() / 1000;
  }

  function isValid(panel) {
    try {
      return !!(panel && panel.IsValid && panel.IsValid());
    } catch (e) {
      return false;
    }
  }

  function findRoot(panel) {
    let current = panel;
    let parent = null;
    while (isValid(current)) {
      try {
        parent = current.GetParent();
      } catch (e) {
        parent = null;
      }
      if (!isValid(parent)) return current;
      current = parent;
    }
    return null;
  }

  function findFirstWithClass(panel, className) {
    try {
      if (!isValid(panel) || !panel.FindChildrenWithClassTraverse) return null;
      const matches = panel.FindChildrenWithClassTraverse(className) || [];
      return matches.length && isValid(matches[0]) ? matches[0] : null;
    } catch (e) {
      return null;
    }
  }

  function readText(panel) {
    try {
      if (isValid(panel) && typeof panel.text === "string") return panel.text;
    } catch (e) {}
    try {
      if (isValid(panel) && panel.GetAttributeString) {
        return panel.GetAttributeString("text", "");
      }
    } catch (e) {}
    return "";
  }


  function readNumber(panel) {
    const text = readText(panel);
    let value = 0;
    let found = false;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code >= 48 && code <= 57) {
        value = value * 10 + code - 48;
        found = true;
      } else if (found) {
        break;
      }
    }
    return found ? value : -1;
  }

  function readCooldownDegrees(cooldownMask) {
    if (!isValid(cooldownMask)) return -1;

    let clip = "";
    try {
      clip =
        cooldownMask.style && typeof cooldownMask.style.clip === "string"
          ? cooldownMask.style.clip
          : "";
    } catch (e) {}
    try {
      if (!clip && cooldownMask.GetAttributeString) {
        clip = cooldownMask.GetAttributeString("style", "");
      }
    } catch (e) {}

    const degreesEnd = clip.lastIndexOf("deg");
    const comma = clip.lastIndexOf(",", degreesEnd);
    if (degreesEnd < 0 || comma < 0) return -1;

    let index = comma + 1;
    while (index < degreesEnd && clip.charCodeAt(index) <= 32) index += 1;
    let sign = 1;
    if (clip.charCodeAt(index) === 45) {
      sign = -1;
      index += 1;
    } else if (clip.charCodeAt(index) === 43) {
      index += 1;
    }

    let value = 0;
    let fraction = 0;
    let divisor = 0;
    let found = false;
    for (; index < degreesEnd; index += 1) {
      const code = clip.charCodeAt(index);
      if (code >= 48 && code <= 57) {
        found = true;
        if (divisor === 0) {
          value = value * 10 + code - 48;
        } else {
          fraction += (code - 48) / divisor;
          divisor *= 10;
        }
      } else if (code === 46 && divisor === 0) {
        divisor = 10;
      } else if (code > 32) {
        return -1;
      }
    }
    return found ? sign * (value + fraction) : -1;
  }

  function hasClass(panel, className) {
    try {
      return !!(isValid(panel) && panel.BHasClass && panel.BHasClass(className));
    } catch (e) {
      return false;
    }
  }
  function renderAmmoColor() {
    if (!isValid(state.magnum.ammoLabel)) return;
    state.magnum.ammoLabel.SetHasClass(
      MAGNUM_AMMO_GLOW_CLASS,
      state.magnum.active,
    );
    state.magnum.ammoLabel.SetHasClass(
      SPLIT_SHOT_AMMO_GLOW_CLASS,
      state.split.active,
    );
    state.magnum.ammoLabel.SetHasClass(
      BLOOD_TRIBUTE_AMMO_GLOW_CLASS,
      state.blood.active,
    );
  }
  function countNewerIndicators(tracker) {
    if (!tracker.active) return 0;
    let count = 0;
    if (
      state.magnum.active &&
      state.magnum.activationOrder > tracker.activationOrder
    ) {
      count += 1;
    }
    if (
      state.split.active &&
      state.split.activationOrder > tracker.activationOrder
    ) {
      count += 1;
    }
    if (
      state.blood.active &&
      state.blood.activationOrder > tracker.activationOrder
    ) {
      count += 1;
    }
    return count;
  }

  function renderIndicatorPosition(tracker) {
    if (!isValid(tracker.notifier)) return;
    const newerCount = countNewerIndicators(tracker);
    tracker.notifier.SetHasClass(
      ONE_INDICATOR_OFFSET_CLASS,
      tracker.active && newerCount === 1,
    );
    tracker.notifier.SetHasClass(
      TWO_INDICATOR_OFFSET_CLASS,
      tracker.active && newerCount === 2,
    );
  }

  function renderIndicatorPositions() {
    renderIndicatorPosition(state.magnum);
    renderIndicatorPosition(state.split);
    renderIndicatorPosition(state.blood);
  }




  function renderMagnum() {
    if (isValid(state.magnum.notifier)) {
      state.magnum.notifier.SetHasClass(MAGNUM_ACTIVE_CLASS, state.magnum.active);
      state.magnum.notifier.style.visibility = state.magnum.active ? "visible" : "collapse";
      state.magnum.notifier.style.opacity = state.magnum.active ? "1" : "0";
    }
    renderAmmoColor();
  }

  function renderSplitShot() {
    if (!isValid(state.split.notifier)) return;
    state.split.notifier.SetHasClass(
      SPLIT_SHOT_ACTIVE_CLASS,
      state.split.active,
    );
    state.split.notifier.style.visibility = state.split.active ? "visible" : "collapse";
    state.split.notifier.style.opacity = state.split.active ? "1" : "0";
  }

  function renderBloodTribute() {
    if (!isValid(state.blood.notifier)) return;
    state.blood.notifier.SetHasClass(
      BLOOD_TRIBUTE_ACTIVE_CLASS,
      state.blood.active,
    );
    state.blood.notifier.style.visibility = state.blood.active
      ? "visible"
      : "collapse";
    state.blood.notifier.style.opacity = state.blood.active ? "1" : "0";
  }

  function setMagnumActive(active) {
    active = !!active;
    if (state.magnum.active === active) return;
    state.magnum.active = active;
    state.magnum.activationOrder = active
      ? state.nextActivationOrder++
      : 0;
    renderMagnum();
    renderIndicatorPositions();
  }

  function setSplitShotActive(active) {
    active = !!active;
    if (state.split.active === active) return;
    state.split.active = active;
    state.split.activationOrder = active
      ? state.nextActivationOrder++
      : 0;
    renderSplitShot();
    renderAmmoColor();
    renderIndicatorPositions();
  }

  function setBloodTributeActive(active) {
    active = !!active;
    if (state.blood.active === active) return;
    state.blood.active = active;
    state.blood.activationOrder = active
      ? state.nextActivationOrder++
      : 0;
    renderBloodTribute();
    renderAmmoColor();
    renderIndicatorPositions();
  }


  function resetMagnumState() {
    state.magnum.seen = false;
    state.magnum.cooldownMask = null;
    state.magnum.cooldownLabel = null;
    state.magnum.coolingDown = false;
    state.magnum.reloading = false;
    state.magnum.cooldown = -1;
    state.magnum.cooldownDegrees = -1;
    state.magnum.readySamples = 0;
    setMagnumActive(false);
  }

  function resetSplitShotState() {
    state.split.seen = false;
    state.split.ready = false;
    state.split.activeUntil = 0;
    setSplitShotActive(false);
  }

  function cacheLocalPanels() {
    let renderBuff = false;
    let renderSplit = false;
    let renderBlood = false;
    if (!isValid(state.magnum.notifier)) {
      try {
        state.magnum.notifier = context.FindChildTraverse("MercurialMagnumNotifier");
      } catch (e) {
        state.magnum.notifier = null;
      }
      renderBuff = true;
    }
    if (!isValid(state.split.notifier)) {
      try {
        state.split.notifier = context.FindChildTraverse("SplitShotNotifier");
      } catch (e) {
        state.split.notifier = null;
      }
      renderSplit = true;
    }
    if (!isValid(state.blood.notifier)) {
      try {
        state.blood.notifier = context.FindChildTraverse("BloodTributeNotifier");
      } catch (e) {
        state.blood.notifier = null;
      }
      renderBlood = true;
    }
    if (!isValid(state.magnum.ammoLabel)) {
      state.magnum.ammoLabel = findFirstWithClass(context, "weapon_ammo");
      renderBuff = true;
    }
    if (renderBuff) renderMagnum();
    if (renderSplit) renderSplitShot();
    if (renderBlood) renderBloodTribute();
    if (renderBuff || renderSplit || renderBlood) {
      renderIndicatorPositions();
    }
  }

  function findTrainedItem(now, tracker, itemId, reset) {
    if (isValid(tracker.item) && hasClass(tracker.item, "trained")) {
      return tracker.item;
    }
    tracker.item = null;
    if (now < tracker.nextScanAt) return null;

    tracker.nextScanAt = now + ITEM_RESCAN_SECONDS;
    if (!isValid(state.root)) state.root = findRoot(context);
    if (!isValid(state.root)) return null;

    let item = null;
    try {
      item = state.root.FindChildTraverse(itemId);
    } catch (e) {}
    if (!isValid(item) || !hasClass(item, "trained")) return null;

    tracker.item = item;
    reset();
    return item;
  }

  function isBloodTributeSlot(index) {
    return readText(state.blood.labels[index]) === "BLOOD TRIBUTE";
  }

  function cacheBloodTributeSlots() {
    if (!isValid(state.blood.abilityContainer)) {
      state.blood.abilityContainer = null;
      for (let index = 0; index < state.blood.slots.length; index += 1) {
        state.blood.slots[index] = null;
        state.blood.labels[index] = null;
      }

      if (!isValid(state.root)) state.root = findRoot(context);
      if (!isValid(state.root)) return false;
      try {
        state.blood.abilityContainer =
          state.root.FindChildTraverse("abilitiesContainer");
      } catch (e) {}
      if (!isValid(state.blood.abilityContainer)) return false;
    }

    for (let index = 0; index < state.blood.slots.length; index += 1) {
      if (!isValid(state.blood.slots[index])) {
        state.blood.labels[index] = null;
        try {
          state.blood.slots[index] =
            state.blood.abilityContainer.FindChildTraverse(
              ACTIVE_ITEM_SLOT_IDS[index],
            );
        } catch (e) {
          state.blood.slots[index] = null;
        }
      }
      if (
        isValid(state.blood.slots[index]) &&
        !isValid(state.blood.labels[index])
      ) {
        state.blood.labels[index] = findFirstWithClass(
          state.blood.slots[index],
          "ability_name",
        );
      }
    }
    return true;
  }


  function findBloodTributeItem(now) {
    if (now < state.blood.nextScanAt) {
      return isValid(state.blood.togglePanel)
        ? state.blood.togglePanel
        : null;
    }

    state.blood.nextScanAt = now + ITEM_RESCAN_SECONDS;
    state.blood.togglePanel = null;
    if (!cacheBloodTributeSlots()) return null;

    for (let index = 0; index < state.blood.slots.length; index += 1) {
      const slot = state.blood.slots[index];
      if (!isValid(slot) || !isBloodTributeSlot(index)) continue;
      state.blood.togglePanel = slot;
      return slot;
    }
    return null;
  }

  function updateBloodTribute(now) {
    const slot = findBloodTributeItem(now);
    if (!isValid(slot)) {
      setBloodTributeActive(false);
      return false;
    }

    setBloodTributeActive(hasClass(slot, "toggled_on"));
    return true;
  }

  function updateSplitShot(now) {
    const item = findTrainedItem(
      now,
      state.split,
      SPLIT_SHOT_ITEM_ID,
      resetSplitShotState,
    );
    if (!isValid(item)) {
      if (state.split.seen || state.split.active) resetSplitShotState();
      return false;
    }

    const coolingDown = hasClass(item, "cooling_down");
    if (!state.split.seen) {
      state.split.seen = true;
      state.split.ready = !coolingDown;
      return true;
    }

    if (!coolingDown) state.split.ready = true;
    const activated = coolingDown && state.split.ready;

    if (activated) {
      state.split.ready = false;
      state.split.activeUntil = now + SPLIT_SHOT_DURATION_SECONDS;
      setSplitShotActive(true);
    } else if (state.split.active && now >= state.split.activeUntil) {
      setSplitShotActive(false);
    }

    return true;
  }


  function scheduleUpdate(itemOwned) {
    $.Schedule(itemOwned ? POLL_SECONDS : ITEM_RESCAN_SECONDS, update);
  }

  function update() {
    if (!isValid(context)) return;

    const now = nowSeconds();
    cacheLocalPanels();
    const splitOwned = updateSplitShot(now);
    const bloodOwned = updateBloodTribute(now);

    const item = findTrainedItem(
      now,
      state.magnum,
      MAGNUM_ITEM_ID,
      resetMagnumState,
    );
    if (!isValid(item)) {
      if (state.magnum.seen || state.magnum.active) resetMagnumState();
      scheduleUpdate(splitOwned || bloodOwned);
      return;
    }

    if (!isValid(state.magnum.cooldownLabel)) {
      state.magnum.cooldownLabel = findFirstWithClass(item, "cooldown_timer");
    }
    const coolingDown = hasClass(item, "cooling_down");
    const cooldown = readNumber(state.magnum.cooldownLabel);
    if (!isValid(state.magnum.cooldownMask)) {
      try {
        state.magnum.cooldownMask = item.FindChildTraverse("cooldown_mask");
      } catch (e) {
        state.magnum.cooldownMask = null;
      }
    }
    const cooldownDegrees = readCooldownDegrees(state.magnum.cooldownMask);
    const reloading = hasClass(context, "reloading");

    if (!state.magnum.seen) {
      state.magnum.seen = true;
      state.magnum.coolingDown = coolingDown;
      state.magnum.reloading = reloading;
      state.magnum.cooldown = cooldown;
      state.magnum.cooldownDegrees = cooldownDegrees;
      state.magnum.readySamples = coolingDown ? 0 : 1;
      scheduleUpdate(true);
      return;
    }

    const cooldownStarted =
      coolingDown && !state.magnum.coolingDown && state.magnum.readySamples >= 2;
    const radialAvailable =
      cooldownDegrees >= 0 && state.magnum.cooldownDegrees >= 0;
    const radialReset =
      radialAvailable && cooldownDegrees > state.magnum.cooldownDegrees + 0.5;
    const timerReset =
      !radialAvailable &&
      cooldown >= 0 &&
      state.magnum.cooldown >= 0 &&
      cooldown > state.magnum.cooldown + 1;
    const cooldownReset =
      coolingDown && state.magnum.coolingDown && (radialReset || timerReset);
    const reloadStarted = reloading && !state.magnum.reloading;

    if (cooldownStarted || cooldownReset) {
      setMagnumActive(true);
      state.magnum.readySamples = 0;
    } else if (state.magnum.active && reloadStarted) {
      setMagnumActive(false);
    }

    if (!coolingDown) state.magnum.readySamples += 1;
    state.magnum.coolingDown = coolingDown;
    state.magnum.reloading = reloading;
    state.magnum.cooldown = cooldown;
    state.magnum.cooldownDegrees = cooldownDegrees;
    scheduleUpdate(true);
  }

  update();
})();
