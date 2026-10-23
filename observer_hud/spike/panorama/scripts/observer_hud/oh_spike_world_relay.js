// Spike relay (DLF pattern): a ClientUIDialogPanel consumes its own ClientUI_FireOutput,
// so world messages are fired from this sibling panel.
(() => {
  "use strict";
  const ATTR = "oh_spike_message";
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
      $.Msg(`[OH-SPIKE-W] relay error ${e && e.message ? e.message : e}`);
    }
  };
  context.SetPanelEvent("onactivate", relay);
  relay();
})();
