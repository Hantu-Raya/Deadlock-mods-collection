(() => {
  "use strict";

  // Dispatch from a sibling: ClientUIDialogPanel consumes its own FireOutput events.
  var context = $.GetContextPanel();
  if (context.HPV2EventProbeStop) context.HPV2EventProbeStop();
  var isRelay = context.BHasClass("HPV2BridgeRelay");
  var root = context.GetParent();
  var instance = Date.now() + ":" + Math.random().toString(16).slice(2);
  var sequence = 0;
  var stopped = false;
  var relay = null;
  var relayAttribute = "hpv2_pickup_message";
  var lastRelayed = "";

  context.HPV2EventProbeStop = function () {
    stopped = true;
    if (!isRelay) context.HPV2QueuePickup = null;
    if (isRelay && context.IsValid()) context.ClearPanelEvent("onactivate");
    if (relay && relay.IsValid()) {
      relay.SetAttributeString(relayAttribute, "");
      relay.DeleteAsync(0);
      relay = null;
    }
  };

  function queueSnapshot(record) {
    if (!relay || !relay.IsValid()) {
      if (root.type !== "Panel" || context.type !== "ClientUIDialogPanel")
        throw new Error("Expected ClientUIDialogPanel with a plain Panel parent");
      relay = $.CreatePanel("Panel", root, "HPV2EventRelay");
      relay.AddClass("HPV2BridgeRelay");
      try {
        if (!relay.BLoadLayout("file://{resources}/layout/test_event_relay.xml", false, false))
          throw new Error("Sibling relay layout failed to load");
      } catch (error) {
        relay.DeleteAsync(0);
        relay = null;
        throw error;
      }
    }
    relay.SetAttributeString(relayAttribute, JSON.stringify({
      magic_word: "HPV2_PICKUP_SNAPSHOT", source: root.id,
      instance: instance, seq: ++sequence, at: Date.now(), record: record
    }));
    $.DispatchEvent("Activated", relay, "mouse");
  }

  function relaySnapshot() {
    if (stopped) return;
    if (!context.IsValid() || !root || !root.IsValid()) {
      context.HPV2EventProbeStop();
      return;
    }
    try {
      var raw = context.GetAttributeString(relayAttribute, "");
      if (!raw || raw === lastRelayed) return;
      // This callback belongs to the sibling's layout, not the publisher.
      $.DispatchEvent("ClientUI_FireOutput", raw);
      lastRelayed = raw;
    } catch (error) {
      $.Msg("[test_hpv2][relay-error] " + String(error));
    }
  }

  if (!isRelay) {
    context.HPV2QueuePickup = function (record) {
      if (stopped || !context.IsValid() || !root || !root.IsValid()) return;
      try { queueSnapshot(record); }
      catch (error) { $.Msg("[test_hpv2][relay-error] " + String(error)); }
    };
  } else {
    context.SetPanelEvent("onactivate", relaySnapshot);
    // Drain a snapshot queued before the layout finished loading.
    relaySnapshot();
  }
})();
