(() => {
  "use strict";

  const SETTING_ID = "hud_passive_items_margin_top";
  const DEFAULT_MARGIN_TOP = -6;
  const RETRY_DELAY = 0.4;

  function getPassiveItemsPanel() {
    try {
      const root = $.GetContextPanel();
      return root?.FindChildTraverse?.("hud_passive_items") || null;
    } catch (e) {
      return null;
    }
  }

  function setPassiveMarginTop(value) {
    const panel = getPassiveItemsPanel();
    if (!panel?.IsValid?.()) return;
    
    const v = Math.max(-40, Math.min(40, value || DEFAULT_MARGIN_TOP));
    panel.style.marginTop = v + "%";
  }

  function loadFromDataFile() {
    try {
      const data = window.MOD_SETTINGS_DATA;
      if (!data?.length) return false;
      
      const entry = data.find(e => e.setting_id === SETTING_ID);
      if (entry) {
        $.Msg("[PassiveItems] Loaded: " + SETTING_ID + "=" + entry.value);
        setPassiveMarginTop(entry.value);
        return true;
      }
    } catch (e) {
      $.Msg("[PassiveItems] Error: " + e);
    }
    return false;
  }

  function boot() {
    if (!loadFromDataFile()) {
      setPassiveMarginTop(DEFAULT_MARGIN_TOP);
    }

    const panel = getPassiveItemsPanel();
    if (!panel?.IsValid?.()) {
      $.Schedule(RETRY_DELAY, boot);
    }
  }

  boot();
})();
