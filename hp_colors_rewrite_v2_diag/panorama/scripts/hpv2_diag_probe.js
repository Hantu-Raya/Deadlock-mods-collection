(function () {
  "use strict";
  // Copied into the stage AFTER Closure ADVANCED; never loaded by a clean build.
  if ($["HPV2DiagInstalled"]) return;
  $["HPV2DiagInstalled"] = true;
  var schedule = $["Schedule"], register = $["RegisterForUnhandledEvent"];
  var dispatch = $["DispatchEvent"], cancel = $["CancelScheduled"], msg = $["Msg"];
  var panel = $["GetContextPanel"]();
  var kind = "unknown";
  // One bounded ancestor walk at boot; never traverse trees in callbacks.
  for (var depth = 0; panel && depth < 8; depth += 1) {
    var type = panel["paneltype"] || panel["type"] || "";
    var hasClass = function (name) { return panel["BHasClass"] && panel["BHasClass"](name); };
    if (hasClass("HPV2BridgeRelay")) kind = "relay";
    else if (type === "CitadelHudTopBar" || hasClass("HPV2PickupTopBar")) kind = "topbar";
    else if (type === "CitadelHudEscapeMenu") kind = "menu";
    else if (type === "ClientUIDialogPanel" || hasClass("WindowRoot")) kind = "world";
    if (kind !== "unknown") break;
    panel = panel["GetParent"] ? panel["GetParent"]() : null;
  }
  var created = Date.now(), from = created, seq = 0, listener = 0;
  var id = created.toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  var callbacks, messages, ultimate, ultimateOverflow, histogram;
  function reset() {
    callbacks = Object.create(null);
    messages = Object.create(null);
    ultimate = [];
    ultimateOverflow = 0;
    histogram = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }
  reset();
  function owner(delay) {
    var d = Number(delay), name = "schedule";
    if (kind === "world") {
      name = d === 1 ? "scan" : d === 0.15 || d === 0.25 || d === 1.5 ? "paint" :
        d === 3 ? "pickup" : d === 0.05 ? "parts-retry" : name;
    } else if (kind === "topbar") {
      name = d === 1 ? "ultimate" : d === 5 ? "tick" : name;
    } else if (kind === "menu") {
      // Delay alone cannot distinguish identity and replay when both use 1 s.
      name = d === 1 ? "identity/replay" : d === 5 ? "identity" : d === 3 || d === 8 ? "replay" : name;
    }
    return kind + ":" + name + "@" + String(d).slice(0, 8);
  }
  function callbackRow(name) {
    if (!callbacks[name] && Object.keys(callbacks).length >= 8) name = "<other>";
    return callbacks[name] || (callbacks[name] = [name, 0, 0, 0, 0]);
  }
  // A world callback that reschedules its own function object (the renderer's idle health
  // probe finding nothing) is "probe"; one that repaints or ends the chain keeps its owner.
  var running = null, selfScheduled = false;
  function timed(name, fn, receiver, args, scan) {
    var start = Date.now(), outer = running, outerSelf = selfScheduled;
    running = fn; selfScheduled = false;
    if (scan) histogram[Math.floor(((start % 1000) + 1000) % 1000 / 100)] += 1;
    try { return fn.apply(receiver, args); }
    finally {
      var ms = Math.max(0, Date.now() - start);
      var row = callbackRow(kind === "world" && selfScheduled ? "world:probe@0.15" : name);
      row[1] += 1; row[2] += ms; row[3] = Math.max(row[3], ms);
      if (ms >= 4) row[4] += 1;
      running = outer; selfScheduled = outerSelf;
    }
  }
  function bytes(raw) {
    // UTF-8 bytes, without allocating an encoded payload or parsing its JSON.
    var count = 0;
    for (var i = 0; i < raw.length; i += 1) {
      var c = raw.charCodeAt(i);
      if (c < 128) count += 1;
      else if (c < 2048) count += 2;
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < raw.length &&
        raw.charCodeAt(i + 1) >= 0xDC00 && raw.charCodeAt(i + 1) <= 0xDFFF) { count += 4; i += 1; }
      else count += 3;
    }
    return count;
  }
  function message(direction, raw) {
    if (typeof raw !== "string") return;
    var match = /"magic_word"\s*:\s*"([A-Za-z0-9_]{1,64})"/.exec(raw);
    var magic = match ? match[1] : "<unknown>";
    var key = direction + ":" + magic;
    if (!messages[key] && Object.keys(messages).length >= 4) { magic = "<other>"; key = direction + ":" + magic; }
    var row = messages[key] || (messages[key] = [direction, magic, 0, 0]);
    row[2] += 1; row[3] += bytes(raw);
    if (direction === "rx" && match && match[1] === "HPV2_ULTIMATE_SNAPSHOT") {
      var atMatch = /"at"\s*:\s*(\d{1,16})(?=\s*[,}])/.exec(raw);
      if (atMatch) {
        var at = Number(atMatch[1]);
        if (ultimate.indexOf(at) < 0) {
          if (ultimate.length < 8) ultimate.push(at);
          else ultimateOverflow += 1;
        }
      }
    }
  }
  $["Schedule"] = function (delay, fn) {
    var name = owner(delay), scan = kind === "world" && Number(delay) === 1;
    if (fn === running && Number(delay) === 0.15) selfScheduled = true;
    return schedule.call(this, delay, function () { return timed(name, fn, this, arguments, scan); });
  };
  $["CancelScheduled"] = function () { return cancel.apply(this, arguments); };
  $["RegisterForUnhandledEvent"] = function (event, fn) {
    listener += 1;
    var name = kind + ":listener#" + listener;
    return register.call(this, event, function () {
      if (event === "ClientUI_FireOutput") message("rx", arguments[0]);
      return timed(name, fn, this, arguments, false);
    });
  };
  $["DispatchEvent"] = function () {
    if (arguments[0] === "ClientUI_FireOutput") message("tx", arguments[1]);
    return timed(kind + ":dispatch:" + String(arguments[0]).slice(0, 32), dispatch, this, arguments, false);
  };
  function mergeCallback(rows) {
    var row = rows.pop(), other = rows.filter(function (r) { return r[0] === "<other>"; })[0];
    if (!other) { other = ["<other>", 0, 0, 0, 0]; rows.unshift(other); }
    other[1] += row[1]; other[2] += row[2]; other[3] = Math.max(other[3], row[3]); other[4] += row[4];
  }
  function mergeMessage(rows) {
    var row = rows.pop(), other = rows.filter(function (r) { return r[0] === row[0] && r[1] === "<other>"; })[0];
    if (!other) { other = [row[0], "<other>", 0, 0]; rows.unshift(other); }
    other[2] += row[2]; other[3] += row[3];
  }
  function report() {
    var now = Date.now();
    var r = { id: id, kind: kind, created: created, seq: ++seq, from: from, to: now,
      clock: "Date.now-ms", c: Object.keys(callbacks).map(function (k) { return callbacks[k]; }),
      m: Object.keys(messages).map(function (k) { return messages[k]; }),
      u: ultimate, uo: ultimateOverflow, h: histogram, cut: 0 };
    // One ancestor-class read per report: hero bars carry pickups/ultimates and never sleep.
    if (kind === "world") {
      try { r.t = $["GetContextPanel"]()["BAscendantHasClass"]("CLASS_PLAYER") ? "hero" : "unit"; }
      catch (error) { r.t = "unit"; }
    }
    // Keep <other> at the front so compaction never merges it into itself.
    r.c.sort(function (a, b) { return a[0] === "<other>" ? -1 : b[0] === "<other>" ? 1 : 0; });
    r.m.sort(function (a, b) { return a[1] === "<other>" ? -1 : b[1] === "<other>" ? 1 : 0; });
    var line = "[HPV2DIAG] v1 " + JSON.stringify(r);
    while (line.length > 900) {
      r.cut += 1;
      if (r.u.length) { r.u.pop(); r.uo += 1; }
      else if (r.c.length > 1) mergeCallback(r.c);
      else if (r.m.length > 2) mergeMessage(r.m);
      else break;
      line = "[HPV2DIAG] v1 " + JSON.stringify(r);
    }
    // Original APIs keep reporting overhead outside the observed callbacks.
    reset(); from = now;
    try { msg.call($, line); }
    finally { schedule.call($, 60, report); }
  }
  schedule.call($, 60 + Math.random(), report);
})();
