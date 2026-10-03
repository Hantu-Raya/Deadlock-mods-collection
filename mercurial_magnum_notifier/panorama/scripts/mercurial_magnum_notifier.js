(() => {
  "use strict";

  const POLL_SECONDS = 0.05;
  const ITEM_RESCAN_SECONDS = 0.5;
  const SPLIT_SHOT_DURATION_SECONDS = 5.0;
  const MAGNUM_ITEM_ID = "upgrade_ethereal_bullets";
  const SPLIT_SHOT_ITEM_ID = "upgrade_split_shot";
  const BLOOD_TRIBUTE_LABEL = "BLOOD TRIBUTE";
  const ACTIVE_ITEM_SLOT_IDS = [
    "abilityButton0",
    "abilityButton1",
    "abilityButton2",
    "abilityButton3",
  ];
  const ONE_INDICATOR_OFFSET_CLASS = "NotifierOneOffset";
  const TWO_INDICATOR_OFFSET_CLASS = "NotifierTwoOffsets";

  const context = $.GetContextPanel();
  let root = null;
  let ammoLabel = null;
  let nextActivationOrder = 1;
  let nextLocalScanAt = 0;
  let itemsOwned = false;

  const magnum = {
    notifierId: "MercurialMagnumNotifier",
    activeClass: "MagnumBuffActive",
    ammoClass: "MagnumAmmoGlow",
    notifier: null,
    active: false,
    activationOrder: 0,
    item: null,
    nextScanAt: 0,
    cooldownMask: null,
    cooldownLabel: null,
    seen: false,
    coolingDown: false,
    reloading: false,
    cooldown: -1,
    cooldownDegrees: -1,
    readySamples: 0,
  };
  const split = {
    notifierId: "SplitShotNotifier",
    activeClass: "SplitShotActive",
    ammoClass: "SplitShotAmmoGlow",
    notifier: null,
    active: false,
    activationOrder: 0,
    item: null,
    nextScanAt: 0,
    seen: false,
    ready: false,
    activeUntil: 0,
  };
  const blood = {
    notifierId: "BloodTributeNotifier",
    activeClass: "BloodTributeActive",
    ammoClass: "BloodTributeAmmoGlow",
    notifier: null,
    active: false,
    activationOrder: 0,
    togglePanel: null,
    nextScanAt: 0,
    abilityContainer: null,
    slots: [null, null, null, null],
    labels: [null, null, null, null],
  };
  const INDICATORS = [magnum, split, blood];

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

  function hasClass(panel, className) {
    try {
      return !!(isValid(panel) && panel.BHasClass && panel.BHasClass(className));
    } catch (e) {
      return false;
    }
  }

  function findChild(panel, id) {
    try {
      const child = panel.FindChildTraverse(id);
      return isValid(child) ? child : null;
    } catch (e) {
      return null;
    }
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

  function getRoot() {
    if (isValid(root)) return root;
    root = null;
    let current = context;
    while (isValid(current)) {
      let parent = null;
      try {
        parent = current.GetParent();
      } catch (e) {}
      if (!isValid(parent)) {
        root = current;
        break;
      }
      current = parent;
    }
    return root;
  }

  function readText(panel) {
    if (!isValid(panel)) return "";
    try {
      const text = panel.text;
      if (typeof text === "string") return text;
    } catch (e) {}
    try {
      if (panel.GetAttributeString) return panel.GetAttributeString("text", "");
    } catch (e) {}
    return "";
  }

  // First unsigned integer in the label text, or -1.
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

  // End angle of the stock `radial(cx cy, startdeg, enddeg)` clip, or -1.
  function readCooldownDegrees(cooldownMask) {
    if (!isValid(cooldownMask)) return -1;

    let clip = "";
    try {
      const style = cooldownMask.style;
      const value = style && style.clip;
      if (typeof value === "string") clip = value;
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

  function renderNotifier(indicator) {
    const panel = indicator.notifier;
    if (!isValid(panel)) return;
    const active = indicator.active;
    panel.SetHasClass(indicator.activeClass, active);
    panel.style.visibility = active ? "visible" : "collapse";
    panel.style.opacity = active ? "1" : "0";
  }

  function renderAmmoColor() {
    if (!isValid(ammoLabel)) return;
    for (let index = 0; index < INDICATORS.length; index += 1) {
      const indicator = INDICATORS[index];
      ammoLabel.SetHasClass(indicator.ammoClass, indicator.active);
    }
  }

  // Older activations shift left: each newer active indicator adds one slot.
  function renderPositions() {
    for (let index = 0; index < INDICATORS.length; index += 1) {
      const indicator = INDICATORS[index];
      if (!isValid(indicator.notifier)) continue;
      let newerCount = 0;
      if (indicator.active) {
        for (let other = 0; other < INDICATORS.length; other += 1) {
          const candidate = INDICATORS[other];
          if (
            candidate.active &&
            candidate.activationOrder > indicator.activationOrder
          ) {
            newerCount += 1;
          }
        }
      }
      indicator.notifier.SetHasClass(ONE_INDICATOR_OFFSET_CLASS, newerCount === 1);
      indicator.notifier.SetHasClass(TWO_INDICATOR_OFFSET_CLASS, newerCount === 2);
    }
  }

  function setActive(indicator, active) {
    if (indicator.active === active) return;
    indicator.active = active;
    indicator.activationOrder = active ? nextActivationOrder++ : 0;
    renderNotifier(indicator);
    renderAmmoColor();
    renderPositions();
  }

  // Missing local panels retry at the discovery cadence; indicators re-render
  // only when a replacement panel is actually found.
  function cacheLocalPanels(now) {
    if (now < nextLocalScanAt) return;
    let found = false;
    let missing = false;
    for (let index = 0; index < INDICATORS.length; index += 1) {
      const indicator = INDICATORS[index];
      if (isValid(indicator.notifier)) continue;
      indicator.notifier = findChild(context, indicator.notifierId);
      if (indicator.notifier) found = true;
      else missing = true;
    }
    if (!isValid(ammoLabel)) {
      ammoLabel = findFirstWithClass(context, "weapon_ammo");
      if (ammoLabel) found = true;
      else missing = true;
    }
    if (missing) nextLocalScanAt = now + ITEM_RESCAN_SECONDS;
    if (!found) return;
    for (let index = 0; index < INDICATORS.length; index += 1) {
      renderNotifier(INDICATORS[index]);
    }
    renderAmmoColor();
    renderPositions();
  }

  // Returns the owned item panel; rescans at most every ITEM_RESCAN_SECONDS.
  function findTrainedItem(now, tracker, itemId, reset) {
    if (hasClass(tracker.item, "trained")) return tracker.item;
    tracker.item = null;
    if (now < tracker.nextScanAt) return null;

    tracker.nextScanAt = now + ITEM_RESCAN_SECONDS;
    const hudRoot = getRoot();
    const item = hudRoot && findChild(hudRoot, itemId);
    if (!hasClass(item, "trained")) return null;

    tracker.item = item;
    reset();
    return item;
  }

  function resetMagnumState() {
    magnum.seen = false;
    magnum.cooldownMask = null;
    magnum.cooldownLabel = null;
    magnum.coolingDown = false;
    magnum.reloading = false;
    magnum.cooldown = -1;
    magnum.cooldownDegrees = -1;
    magnum.readySamples = 0;
    setActive(magnum, false);
  }

  function resetSplitShotState() {
    split.seen = false;
    split.ready = false;
    split.activeUntil = 0;
    setActive(split, false);
  }

  function cacheBloodTributeSlots() {
    if (!isValid(blood.abilityContainer)) {
      for (let index = 0; index < ACTIVE_ITEM_SLOT_IDS.length; index += 1) {
        blood.slots[index] = null;
        blood.labels[index] = null;
      }
      const hudRoot = getRoot();
      blood.abilityContainer = hudRoot && findChild(hudRoot, "abilitiesContainer");
      if (!blood.abilityContainer) return false;
    }

    for (let index = 0; index < ACTIVE_ITEM_SLOT_IDS.length; index += 1) {
      if (!isValid(blood.slots[index])) {
        blood.labels[index] = null;
        blood.slots[index] = findChild(
          blood.abilityContainer,
          ACTIVE_ITEM_SLOT_IDS[index],
        );
      }
      if (blood.slots[index] && !isValid(blood.labels[index])) {
        blood.labels[index] = findFirstWithClass(blood.slots[index], "ability_name");
      }
    }
    return true;
  }

  // The label scan runs every ITEM_RESCAN_SECONDS; hot polls reuse the matched slot.
  function findBloodTributeSlot(now) {
    if (now < blood.nextScanAt) {
      return isValid(blood.togglePanel) ? blood.togglePanel : null;
    }

    blood.nextScanAt = now + ITEM_RESCAN_SECONDS;
    blood.togglePanel = null;
    if (!cacheBloodTributeSlots()) return null;

    for (let index = 0; index < ACTIVE_ITEM_SLOT_IDS.length; index += 1) {
      const slot = blood.slots[index];
      if (!isValid(slot) || readText(blood.labels[index]) !== BLOOD_TRIBUTE_LABEL) {
        continue;
      }
      blood.togglePanel = slot;
      return slot;
    }
    return null;
  }

  function updateBloodTribute(now) {
    const slot = findBloodTributeSlot(now);
    setActive(blood, hasClass(slot, "toggled_on"));
    return !!slot;
  }

  function updateSplitShot(now) {
    const item = findTrainedItem(now, split, SPLIT_SHOT_ITEM_ID, resetSplitShotState);
    if (!item) {
      if (split.seen || split.active) resetSplitShotState();
      return false;
    }

    const coolingDown = hasClass(item, "cooling_down");
    if (!split.seen) {
      split.seen = true;
      split.ready = !coolingDown;
      return true;
    }

    if (!coolingDown) split.ready = true;
    if (coolingDown && split.ready) {
      split.ready = false;
      split.activeUntil = now + SPLIT_SHOT_DURATION_SECONDS;
      setActive(split, true);
    } else if (split.active && now >= split.activeUntil) {
      setActive(split, false);
    }
    return true;
  }

  function updateMagnum(now) {
    const item = findTrainedItem(now, magnum, MAGNUM_ITEM_ID, resetMagnumState);
    if (!item) {
      if (magnum.seen || magnum.active) resetMagnumState();
      return false;
    }

    const coolingDown = hasClass(item, "cooling_down");
    const reloading = hasClass(context, "reloading");
    // Progress only feeds cooldownReset, which needs two consecutive cooling
    // samples, so ready ticks skip the label text and clip-string reads.
    let cooldown = -1;
    let cooldownDegrees = -1;
    if (coolingDown) {
      if (!isValid(magnum.cooldownLabel)) {
        magnum.cooldownLabel = findFirstWithClass(item, "cooldown_timer");
      }
      if (!isValid(magnum.cooldownMask)) {
        magnum.cooldownMask = findChild(item, "cooldown_mask");
      }
      cooldown = readNumber(magnum.cooldownLabel);
      cooldownDegrees = readCooldownDegrees(magnum.cooldownMask);
    }

    if (!magnum.seen) {
      magnum.seen = true;
      magnum.readySamples = coolingDown ? 0 : 1;
    } else {
      const cooldownStarted =
        coolingDown && !magnum.coolingDown && magnum.readySamples >= 2;
      const radialAvailable = cooldownDegrees >= 0 && magnum.cooldownDegrees >= 0;
      const radialReset =
        radialAvailable && cooldownDegrees > magnum.cooldownDegrees + 0.5;
      const timerReset =
        !radialAvailable &&
        cooldown >= 0 &&
        magnum.cooldown >= 0 &&
        cooldown > magnum.cooldown + 1;
      const cooldownReset =
        coolingDown && magnum.coolingDown && (radialReset || timerReset);

      if (cooldownStarted || cooldownReset) {
        setActive(magnum, true);
        magnum.readySamples = 0;
      } else if (magnum.active && reloading && !magnum.reloading) {
        setActive(magnum, false);
      }
      if (!coolingDown) magnum.readySamples += 1;
    }

    magnum.coolingDown = coolingDown;
    magnum.reloading = reloading;
    magnum.cooldown = cooldown;
    magnum.cooldownDegrees = cooldownDegrees;
    return true;
  }

  function update() {
    if (!isValid(context)) return;

    try {
      const now = nowSeconds();
      cacheLocalPanels(now);
      // Detector order is the same-tick activation order: Split Shot, Blood Tribute, Magnum.
      const splitOwned = updateSplitShot(now);
      const bloodOwned = updateBloodTribute(now);
      itemsOwned = updateMagnum(now) || splitOwned || bloodOwned;
    } finally {
      // Reschedule at the last known cadence even when a panel write throws.
      $.Schedule(itemsOwned ? POLL_SECONDS : ITEM_RESCAN_SECONDS, update);
    }
  }

  update();
})();
