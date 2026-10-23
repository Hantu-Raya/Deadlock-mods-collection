// Sibling relay for oh_debuff_world.js (layout/observer_hud/debuff_relay.xml). A ClientUIDialogPanel
// consumes its own ClientUI_FireOutput events, so world debuff snapshots are fired from this panel,
// the DLF pattern. Each message is a full snapshot: only the latest matters.
(() => {
  "use strict";

  const ATTR = "oh_debuff_message";
  const context = $.GetContextPanel();
  let last = "";

  const relay = () => {
    try {
      if (!context.IsValid()) return;
      const raw = context.GetAttributeString(ATTR, "");
      if (!raw || raw === last) return;
      last = raw;
      $.DispatchEvent("ClientUI_FireOutput", raw);
    } catch (e) {
      $.Msg(`[OH-DB] relay error ${e && e.message ? e.message : e}`);
    }
  };

  context.SetPanelEvent("onactivate", relay);
  // Drain a snapshot queued before the layout finished loading.
  relay();
})();
