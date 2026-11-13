(function () {
  "use strict";
  // ---- Relay identity. The class and layout path are pinned by layout/hp_colors_v3_relay.xml; the layout ships because tools/lib/projects.js collects every file under panorama/.
  var RELAY_CLASS = "HPV3BridgeRelay";
  var RELAY_ID = "HPColorsV3EventRelay";
  var RELAY_LAYOUT = "file://{resources}/layout/hp_colors_v3_relay.xml";
  var RELAY_ATTRIBUTE = "hpv3_config_request"; // historic name: it carries every relayed message, not only config requests
  // ---- Message magics (the wire strings). Size caps are enforced by each consumer with its own literals: the menu for
  // the config request, the hud for the pickup snapshot, the world context for the three topbar snapshots (neither
  // the hud nor the menu layout includes this script, so they cannot read a shared table).
  var MAGICS = {
    CONFIG_REQUEST: "HPV3_CONFIG_REQUEST",
    PICKUP_SNAPSHOT: "HPV3_PICKUP_SNAPSHOT",
    PICKUP_SCAN_GATE: "HPV3_PICKUP_SCAN_GATE",
    ULTIMATE_SNAPSHOT: "HPV3_ULTIMATE_SNAPSHOT",
    BOUNTY_SNAPSHOT: "HPV3_BOUNTY_SNAPSHOT"
  };
  var context = $.GetContextPanel();
  var relay = null;
  var sequence = 0;
  var lastRelayed = "";
  var instance = Date.now() + ":" + Math.random().toString(16).slice(2);
  // Copy-on-write: emit reads the array once, so a subscriber that unsubscribes while it runs changes the next emit only.
  var hooks = [];
  function valid(panel) {
    try { return !!panel && panel.IsValid(); } catch (error) { return false; }
  }
  // Runs in the relay layout's own context (a sibling of the world dialog). The sender's hidden `seq` makes every
  // message text unique, so the repeated-text check only drops a re-fired activation of the same message.
  function forward() {
    if (!valid(context)) return;
    var raw = context.GetAttributeString(RELAY_ATTRIBUTE, "");
    if (!raw || raw === lastRelayed) return;
    // The world dialog consumes its own output.
    $.DispatchEvent("ClientUI_FireOutput", raw);
    lastRelayed = raw;
  }
  if (valid(context) && context.BHasClass(RELAY_CLASS)) {
    context.SetPanelEvent("onactivate", forward);
    forward();
    return;
  }
  if ($.HPColorsV3Bridge) $.HPColorsV3Bridge.stop();
  function stop() {
    if (valid(relay)) relay.DeleteAsync(0);
    relay = null;
  }
  // Sends one message object (it gets the hidden seq) to the world dialog through the sibling relay; false when the
  // relay cannot be made.
  function send(message) {
    try {
      context = $.GetContextPanel();
      if (!valid(context)) return false;
      var parent = context.GetParent();
      if (!valid(parent) || (parent.paneltype || parent.type) !== "Panel" ||
          (context.paneltype || context.type) !== "ClientUIDialogPanel") return false;
      if (!valid(relay)) {
        relay = $.CreatePanel("Panel", parent, RELAY_ID);
        relay.AddClass(RELAY_CLASS);
        if (!relay.BLoadLayout(RELAY_LAYOUT, false, false)) {
          stop(); return false;
        }
      }
      message.seq = ++sequence;
      relay.SetAttributeString(RELAY_ATTRIBUTE, JSON.stringify(message));
      $.DispatchEvent("Activated", relay, "mouse");
      return true;
    } catch (error) {
      stop();
      // HPV3_DEBUG $.Msg("[HPV3] relay request failed: " + String(error));
      return false;
    }
  }
  // The world context's one ClientUI_FireOutput listener (the renderer's) hands every message that is not a config
  // envelope to emit; subscribers get the raw text and filter by magic themselves.
  function subscribe(fn) {
    hooks = hooks.concat([fn]);
    return function () {
      var i = hooks.indexOf(fn);
      if (i >= 0) hooks = hooks.slice(0, i).concat(hooks.slice(i + 1));
    };
  }
  function emit(raw) {
    var list = hooks;
    for (var i = 0; i < list.length; i++) list[i](raw);
  }
  $.HPColorsV3Bridge = { stop: stop, send: send, subscribe: subscribe, emit: emit, MAGICS: MAGICS, instance: instance };
})();
