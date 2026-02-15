(() => {
  "use strict";

  const MOD_TITLE = "Standalone Redesign";
  const SETTING_ID = "hud_passive_items_margin_top";
  const DEFAULT_MARGIN_TOP = -6;
  const MIN_MARGIN_TOP = -40;
  const MAX_MARGIN_TOP = 40;
  const STEP_MARGIN_TOP = 1;
  const RETRY_FAST = 0.4;
  const RETRY_SLOW = 1.0;

  let _registered = false;
  let _listenerBound = false;

  function findRoot(panel) {
    let p = panel;
    try {
      while (p?.GetParent?.()) p = p.GetParent();
    } catch (e) {
      return panel;
    }
    return p || panel;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function toNumber(val, fallback) {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }

  function getPassiveItemsPanel() {
    try {
      return findRoot($.GetContextPanel())?.FindChildTraverse?.("hud_passive_items");
    } catch (e) {
      return null;
    }
  }

  function setPassiveMarginTop(value) {
    const panel = getPassiveItemsPanel();
    if (!panel?.IsValid?.()) return;
    const v = clamp(toNumber(value, DEFAULT_MARGIN_TOP), MIN_MARGIN_TOP, MAX_MARGIN_TOP);
    panel.style.marginTop = v + "%";
  }

  function handleUpdate(raw) {
    let data = null;
    try {
      data = (typeof raw === "string") ? JSON.parse(raw) : raw;
    } catch (e) {
      return;
    }
    if (!data || data.magic_word !== "ANITA_UPDATE") return;
    if (data.mod_title !== MOD_TITLE || data.setting_id !== SETTING_ID) return;
    setPassiveMarginTop(data.value);
  }

  function registerWithAnita() {
    if (_registered) return true;

    let api = null;
    try {
      api = findRoot($.GetContextPanel())?.AnitaUI;
    } catch (e) {
      api = null;
    }

    if (!api?.IsReady?.()) return false;

    api.Register({
      title: MOD_TITLE,
      description: "Standalone Redesign controls",
      elements: [
        {
          type: "stepper",
          id: SETTING_ID,
          label: "Passive Items Vertical Offset (%)",
          defaultValue: DEFAULT_MARGIN_TOP,
          min: MIN_MARGIN_TOP,
          max: MAX_MARGIN_TOP,
          step: STEP_MARGIN_TOP,
          onChange: (val) => setPassiveMarginTop(val)
        }
      ]
    });

    _registered = true;
    return true;
  }

  function boot() {
    if (!_listenerBound) {
      $.RegisterForUnhandledEvent("ClientUI_FireOutput", handleUpdate);
      _listenerBound = true;
    }

    const panel = getPassiveItemsPanel();
    const hasPanel = !!panel?.IsValid?.();
    const registered = registerWithAnita();

    if (!hasPanel || !registered) {
      $.Schedule(hasPanel ? RETRY_FAST : RETRY_SLOW, boot);
      return;
    }

  }

  boot();
})();
