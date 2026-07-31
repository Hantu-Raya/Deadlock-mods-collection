(function () {
  var CH = "ClientUI_FireOutput";

  var MANIFEST = {
    umm: 1, t: "register",
    id: "always_show_passives",
    name: "Always Show Passives & Actives",
    settings: [
      { id: "enabled", type: "toggle", label: "Enabled", default: true,
        description: "Turn the mod off without uninstalling it." },
      { id: "compact", type: "toggle", label: "Compact", default: false,
        description: "Smaller icons." }
    ]
  };
  var root = $.GetContextPanel();
  while (root.GetParent()) root = root.GetParent();

  function apply(key, value) {
    if (key === "enabled") root.SetHasClass("ASAPOn", value);
    if (key === "compact") root.SetHasClass("ASAPCompact", value);
  }

  function announce() { $.DispatchEvent(CH, JSON.stringify(MANIFEST)); }

  $.RegisterForUnhandledEvent(CH, function (p) {
    if (typeof p !== "string" || p.indexOf('"umm"') === -1) return;
    var m; try { m = JSON.parse(p); } catch (e) { return; }
    if (!m || m.umm !== 1) return;
    if (m.t === "hello") announce();
    else if (m.t === "set" && m.id === MANIFEST.id) apply(m.key, m.value);
  });

  for (var i = 0; i < MANIFEST.settings.length; i++)
    apply(MANIFEST.settings[i].id, MANIFEST.settings[i]["default"]);

  announce();
})();