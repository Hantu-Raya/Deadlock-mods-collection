(() => {
  "use strict";

  // Dispatch from a sibling: ClientUIDialogPanel consumes its own FireOutput events.
  var context = $.GetContextPanel();
  if (context.HPV2EventProbeStop) context.HPV2EventProbeStop();
  var isRelay = context.BHasClass("HPV2BridgeRelay");
  var root = context.GetParent();
  var profile = context.HPV2Profile;
  var instance = Date.now() + ":" + Math.random().toString(16).slice(2);
  var sequence = 0;
  var stopped = false;
  var relay = null;
  var relayAttribute = "hpv2_pickup_message";
  var lastRelayed = "";
  var since = Date.now();
  var telemetry = {
    role: isRelay ? "relay" : "queue",
    context: context && context.id ? String(context.id) : "",
    source: root && root.id ? String(root.id) : "",
    since: since,
    lastReportedAt: since,
    counts: {
      queuedAttributeWrites: 0,
      activationDispatches: 0,
      creates: 0,
      recreates: 0,
      callbacks: 0,
      startupDrains: 0,
      sent: 0,
      emptySkippedSnapshots: 0,
      duplicateSkippedSnapshots: 0,
      errors: 0,
      stoppedOrInvalidCallSkips: 0,
      payloadChars: 0
    }
  };

  function reportTelemetry(final) {
    var now = Date.now();
    var counts = telemetry.counts;
    if ((!counts.queuedAttributeWrites && !counts.callbacks && !counts.sent && !counts.errors) ||
        (!final && now - telemetry.lastReportedAt < 30000)) return;
    try {
      $.Msg("[test_hpv2][telemetry-v1] " + JSON.stringify({
        role: telemetry.role,
        context: telemetry.context,
        source: telemetry.source,
        since: telemetry.since,
        at: now,
        final: !!final,
        counts: counts
      }));
      telemetry.lastReportedAt = now;
    } catch (error) {
      // Diagnostics must not interrupt the event path.
    }
  }

  context.HPV2EventProbeStop = function () {
    stopped = true;
    if (!isRelay) context.HPV2QueuePickup = null;
    if (isRelay && context.IsValid()) context.ClearPanelEvent("onactivate");
    if (relay && relay.IsValid()) {
      relay.SetAttributeString(relayAttribute, "");
      relay.DeleteAsync(0);
      relay = null;
    }
    reportTelemetry(true);
    profile.flush(true);
  };

  function queueSnapshot(record) {
    var hadRelay = !!relay;
    if (!relay || !relay.IsValid()) {
      if (root.type !== "Panel" || context.type !== "ClientUIDialogPanel")
        throw new Error("Expected ClientUIDialogPanel with a plain Panel parent");
      relay = $.CreatePanel("Panel", root, "HPV2EventRelay");
      if (hadRelay) telemetry.counts.recreates++;
      else telemetry.counts.creates++;
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
    var raw = JSON.stringify({
      magic_word: "HPV2_PICKUP_SNAPSHOT", source: root.id,
      instance: instance, seq: ++sequence, at: Date.now(), record: record
    });
    relay.SetAttributeString(relayAttribute, raw);
    profile.count("serializedChars", raw.length);
    telemetry.counts.queuedAttributeWrites++;
    telemetry.counts.payloadChars += raw.length;
    $.DispatchEvent("Activated", relay, "mouse");
    telemetry.counts.activationDispatches++;
  }

  function relaySnapshot() {
    if (stopped) {
      telemetry.counts.stoppedOrInvalidCallSkips++;
      reportTelemetry(false);
      return;
    }
    if (!context.IsValid() || !root || !root.IsValid()) {
      telemetry.counts.stoppedOrInvalidCallSkips++;
      reportTelemetry(false);
      context.HPV2EventProbeStop();
      return;
    }
    try {
      var raw = context.GetAttributeString(relayAttribute, "");
      if (!raw) {
        telemetry.counts.emptySkippedSnapshots++;
        reportTelemetry(false);
        return;
      }
      if (raw === lastRelayed) {
        telemetry.counts.duplicateSkippedSnapshots++;
        reportTelemetry(false);
        return;
      }
      // This callback belongs to the sibling's layout, not the publisher.
      $.DispatchEvent("ClientUI_FireOutput", raw);
      telemetry.counts.sent++;
      lastRelayed = raw;
      reportTelemetry(false);
    } catch (error) {
      telemetry.counts.errors++;
      reportTelemetry(false);
      $.Msg("[test_hpv2][relay-error] " + String(error));
    }
  }

  queueSnapshot = profile.wrap("queueSnapshot", queueSnapshot);
  relaySnapshot = profile.wrap("relaySnapshot", relaySnapshot);

  if (!isRelay) {
    context.HPV2QueuePickup = function (record) {
      if (stopped || !context.IsValid() || !root || !root.IsValid()) {
        telemetry.counts.stoppedOrInvalidCallSkips++;
        reportTelemetry(false);
        return;
      }
      try {
        queueSnapshot(record);
        reportTelemetry(false);
      }
      catch (error) {
        telemetry.counts.errors++;
        reportTelemetry(false);
        $.Msg("[test_hpv2][relay-error] " + String(error));
      }
    };
  }
  if (isRelay) {
    context.SetPanelEvent("onactivate", function () {
      telemetry.counts.callbacks++;
      relaySnapshot();
    });
    // Drain a snapshot queued before the layout finished loading.
    telemetry.counts.startupDrains++;
    relaySnapshot();
  }
})();
