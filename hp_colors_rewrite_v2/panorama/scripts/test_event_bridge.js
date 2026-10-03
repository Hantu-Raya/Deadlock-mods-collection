(() => {
  "use strict";

  // Dispatch from a sibling: ClientUIDialogPanel consumes its own FireOutput events.
  var context = $.GetContextPanel();
  if (context.HPV2EventProbeStop) context.HPV2EventProbeStop();
  var isRelay = context.BHasClass("HPV2BridgeRelay");
  var root = context.GetParent();
  var instance = isRelay ? "" : Date.now() + ":" + Math.random().toString(16).slice(2);
  var sequence = 0;
  var stopped = false;
  var relay = null;
  var relayAttribute = "hpv2_pickup_message";
  var lastRelayed = "";
  var requestErrorShown = false;

  function deleteRelay() {
    if (relay && relay.IsValid()) {
      relay.SetAttributeString(relayAttribute, "");
      relay.DeleteAsync(0);
    }
    relay = null;
  }

  context.HPV2EventProbeStop = function () {
    stopped = true;
    if (!isRelay) {
      context.HPV2QueuePickup = null;
      context.HPV2QueueConfigRequest = null;
      context.HPV2ReleaseRelay = null;
    }
    if (isRelay && context.IsValid()) context.ClearPanelEvent("onactivate");
    deleteRelay();
  };

  // Every world -> HUD message leaves through the sibling relay, never from
  // this ClientUIDialogPanel context.
  function queueMessage(message) {
    if (!relay || !relay.IsValid()) {
      if ((root.paneltype || root.type) !== "Panel" ||
          (context.paneltype || context.type) !== "ClientUIDialogPanel")
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
    message.source = root.id;
    message.instance = instance;
    message.seq = ++sequence;
    message.at = Date.now();
    relay.SetAttributeString(relayAttribute, JSON.stringify(message));
    $.DispatchEvent("Activated", relay, "mouse");
  }

  function queueSnapshot(record) {
    queueMessage({ magic_word: "HPV2_PICKUP_SNAPSHOT", record: record });
  }

  function alive() {
    return context.IsValid() && !!root && root.IsValid();
  }

  function playerContext() {
    var panel = context;
    for (var depth = 0; panel && depth < 24; depth++) {
      if (panel.BHasClass && panel.BHasClass("CLASS_PLAYER")) return true;
      panel = panel.GetParent();
    }
    return false;
  }

  function relaySnapshot() {
    if (stopped) return;
    if (!alive()) {
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
      if (stopped || !alive()) return false;
      try { queueSnapshot(record); return true; }
      catch (error) { $.Msg("[test_hpv2][relay-error] " + String(error)); return false; }
    };
    // True once queued; the renderer bounds its retries on false.
    context.HPV2QueueConfigRequest = function (revision) {
      if (stopped || !alive()) return false;
      try {
        queueMessage({ magic_word: "HPV2_CONFIG_REQUEST",
          revision: typeof revision === "number" && isFinite(revision) ? revision : -1 });
        return true;
      } catch (error) {
        if (!requestErrorShown) {
          requestErrorShown = true;
          $.Msg("[test_hpv2][relay-error] " + String(error));
        }
        return false;
      }
    };
    // Heroes keep the relay for pickup snapshots; queueMessage recreates it.
    context.HPV2ReleaseRelay = function () {
      if (stopped || !relay || playerContext()) return;
      deleteRelay();
    };
  } else {
    context.SetPanelEvent("onactivate", relaySnapshot);
    // Drain a snapshot queued before the layout finished loading.
    relaySnapshot();
  }
})();
