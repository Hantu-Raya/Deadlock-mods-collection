(function () {
  "use strict";
  var context = $.GetContextPanel();
  var relay = null;
  var attribute = "hpv3_config_request";
  var sequence = 0;
  var lastRelayed = "";
  var instance = Date.now() + ":" + Math.random().toString(16).slice(2);
  function valid(panel) {
    try { return !!panel && panel.IsValid(); } catch (error) { return false; }
  }
  function forward() {
    if (!valid(context)) return;
    var raw = context.GetAttributeString(attribute, "");
    if (!raw || raw === lastRelayed) return;
    // Runs in the sibling's layout context; the world dialog consumes its own output.
    $.DispatchEvent("ClientUI_FireOutput", raw);
    lastRelayed = raw;
  }
  if (valid(context) && context.BHasClass("HPV3BridgeRelay")) {
    context.SetPanelEvent("onactivate", forward);
    forward();
    return;
  }
  if ($.HPColorsV3Bridge) $.HPColorsV3Bridge.stop();
  function stop() {
    if (valid(relay)) relay.DeleteAsync(0);
    relay = null;
  }
  function send(message) {
    try {
      context = $.GetContextPanel();
      if (!valid(context)) return false;
      var parent = context.GetParent();
      if (!valid(parent) || (parent.paneltype || parent.type) !== "Panel" ||
          (context.paneltype || context.type) !== "ClientUIDialogPanel") return false;
      if (!valid(relay)) {
        relay = $.CreatePanel("Panel", parent, "HPColorsV3EventRelay");
        relay.AddClass("HPV3BridgeRelay");
        if (!relay.BLoadLayout("file://{resources}/layout/hp_colors_v3_relay.xml", false, false)) {
          stop(); return false;
        }
      }
      message.seq = ++sequence;
      relay.SetAttributeString(attribute, JSON.stringify(message));
      $.DispatchEvent("Activated", relay, "mouse");
      return true;
    } catch (error) {
      stop();
      // HPV3_DEBUG $.Msg("[HPV3] relay request failed: " + String(error));
      return false;
    }
  }
  $.HPColorsV3Bridge = { stop: stop,
    request: function (revision, epoch) { return send({ magic: "HPV3_CONFIG_REQUEST", epoch: epoch || "", revision: revision }); },
    pickup: function (source, record) { return send({ magic: "HPV3_PICKUP_SNAPSHOT", source: source, instance: instance, at: Date.now(), record: record }); }
  };
})();
