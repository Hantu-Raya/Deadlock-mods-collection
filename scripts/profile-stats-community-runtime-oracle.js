"use strict";

var assert = require("node:assert/strict");
var fs = require("node:fs");
var test = require("node:test");
var vm = require("node:vm");

function registerProfileStatsCommunityRuntimeTests(runtimeAdapter) {
  assert.equal(typeof runtimeAdapter.sourcePath, "string", "runtime adapter provides a source path");
  assert.ok(runtimeAdapter.source === undefined || typeof runtimeAdapter.source === "string", "runtime adapter source override is text");
  var sourcePath = runtimeAdapter.sourcePath;
  var source = runtimeAdapter.source === undefined ? fs.readFileSync(sourcePath, "utf8") : runtimeAdapter.source;

  function runRuntime(counters, callback, thisArg, args) {
    var previous = counters.inRuntime;
    counters.inRuntime = true;
    try {
      return callback.apply(thisArg, args || []);
    } finally {
      counters.inRuntime = previous;
    }
  }

  function wrapRuntimeCallback(counters, callback) {
    return function () {
      return runRuntime(counters, callback, this, arguments);
    };
  }

  function Panel(id, classes) {
    this.id = id;
    this.classes = classes || [];
    this.style = {};
    this._text = "";
    this.visible = true;
    this.events = {};
    this.children = [];
    this.urls = [];
    this.ignoreCursor = false;
    this.valid = true;
    this.attributes = {};
    this.selectedOption = null;
    this.counters = null;
  }

  Object.defineProperty(Panel.prototype, "text", {
    get: function () {
      if (this.counters && this.counters.inRuntime) this.counters.textRead += 1;
      return this._text;
    },
    set: function (value) { this._text = value; }
  });

  Panel.prototype.IsValid = function () { return this.valid; };
  Panel.prototype.FindChildTraverse = function (id) {
    if (this.counters && this.counters.inRuntime) this.counters.findChild += 1;
    return this.rootMap[id] || null;
  };
  Panel.prototype.SetPanelEvent = function (name, callback) {
    if (name.indexOf("HTML") === 0) throw new Error("HTML events require $.RegisterEventHandler");
    this.events[name] = wrapRuntimeCallback(this.counters, callback);
  };
  Panel.prototype.SetURL = function (url) { this.urls.push(url); };
  Panel.prototype.SetIgnoreCursor = function (value) { this.ignoreCursor = value; };
  Panel.prototype.GetChildCount = function () {
    if (this.counters && this.counters.inRuntime) this.counters.childCount += 1;
    return this.children.length;
  };
  Panel.prototype.GetChild = function (index) {
    if (this.counters && this.counters.inRuntime) this.counters.childRead += 1;
    return this.children[index];
  };
  Panel.prototype.BHasClass = function (name) { return this.classes.indexOf(name) !== -1; };

  Panel.prototype.AddClass = function (name) {
    if (this.classes.indexOf(name) === -1) this.classes.push(name);
  };
  Panel.prototype.RemoveClass = function (name) {
    this.classes = this.classes.filter(function (item) { return item !== name; });
  };
  Panel.prototype.BHasKeyFocus = function () { return this.BHasClass("keyfocused"); };
  Panel.prototype.BHasDescendantKeyFocus = function () { return this.BHasClass("descendant-keyfocused"); };
  Panel.prototype.IsSelected = function () { return this.BHasClass("selected"); };
  Panel.prototype.GetSelected = function () { return this.selectedOption; };
  Panel.prototype.GetAttributeString = function (name, fallback) {
    if (this.counters && this.counters.inRuntime) this.counters.attributeRead += 1;
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? String(this.attributes[name]) : fallback;
  };

  function FakeScheduler(nowMs, counters) {
    this.nowMs = nowMs;
    this.nextId = 1;
    this.tasks = {};
    this.scheduledCount = 0;
    this.cancelledCount = 0;
    this.executedCount = 0;
    this.maxPending = 0;
    this.counters = counters;
  }

  FakeScheduler.prototype.pendingCount = function () {
    return Object.keys(this.tasks).length;
  };

  FakeScheduler.prototype.schedule = function (delay, callback) {
    var id = this.nextId;
    this.nextId += 1;
    this.tasks[id] = {
      at: this.nowMs + (Number(delay) * 1000),
      callback: wrapRuntimeCallback(this.counters, callback)
    };
    this.scheduledCount += 1;
    this.maxPending = Math.max(this.maxPending, this.pendingCount());
    return id;
  };

  FakeScheduler.prototype.cancel = function (id) {
    if (!Object.prototype.hasOwnProperty.call(this.tasks, id)) return;
    delete this.tasks[id];
    this.cancelledCount += 1;
  };

  FakeScheduler.prototype.nextTask = function () {
    var ids = Object.keys(this.tasks);
    var selected = null;
    var index;
    for (index = 0; index < ids.length; index += 1) {
      if (!selected || this.tasks[ids[index]].at < selected.task.at) {
        selected = { id: ids[index], task: this.tasks[ids[index]] };
      }
    }
    return selected;
  };

  FakeScheduler.prototype.advance = function (seconds) {
    var target = this.nowMs + (Number(seconds) * 1000);
    var selected = this.nextTask();
    var guard = 0;
    while (selected && selected.task.at <= target) {
      delete this.tasks[selected.id];
      this.nowMs = selected.task.at;
      this.executedCount += 1;
      selected.task.callback();
      guard += 1;
      if (guard > 10000) throw new Error("scheduler did not settle");
      selected = this.nextTask();
    }
    this.nowMs = target;
  };

  FakeScheduler.prototype.runNext = function () {
    var selected = this.nextTask();
    if (!selected) throw new Error("no scheduled callback");
    this.advance((selected.task.at - this.nowMs) / 1000);
  };

  FakeScheduler.prototype.pendingCallbacks = function () {
    return Object.keys(this.tasks).map(function (id) {
      return this.tasks[id].callback;
    }, this);
  };

  function fakeDateFor(scheduler) {
    function FakeDate(value) {
      this.value = arguments.length > 0 ? new Date(value).getTime() : scheduler.nowMs;
    }
    FakeDate.prototype.getTime = function () { return this.value; };
    FakeDate.prototype.toISOString = function () { return new Date(this.value).toISOString(); };
    FakeDate.now = function () { return scheduler.nowMs; };
    FakeDate.parse = Date.parse;
    return FakeDate;
  }

  function makeHarness(account, playerName) {
    var ids = [
      "HeroList", "StatsBlock", "StatsTitle", "StatsLeft", "StatsRight", "SelfName",
      "ProfileStatsCommunityButton", "ProfileStatsCommunityPanel", "ProfileStatsCommunityIdentity",
      "ProfileStatsCommunityTitle", "ProfileStatsCommunityStatLocker", "ProfileStatsCommunityPlayerHeadingLeft",
      "ProfileStatsCommunityPlayerHeadingRight", "ProfileStatsCommunityStatus", "ProfileStatsCommunityMetrics",
      "ProfileStatsCommunityMetadata", "ProfileStatsCommunitySample", "ProfileStatsCommunityGenerated",
      "ProfileStatsCommunityRetry", "ProfileStatsCommunityBridge", "ProfileStatsCommunitySupporterTicker",
      "ProfileStatsCommunityAccount", "ProfileStatsCommunityMatchCount", "ProfileStatsCommunityMatchCount50",
      "ProfileStatsCommunityMatchCount100", "ProfileStatsCommunityMatchCount150",
      "ProfileStatsCommunityRanked", "ProfileStatsCommunityStandard",
      "ProfileStatsCommunityDisplayCommunity", "ProfileStatsCommunityDisplayPercentile",
      "ProfileStatsCommunityCommunityHeadingLeft", "ProfileStatsCommunityPercentileHeadingLeft",
      "ProfileStatsCommunityCommunityHeadingRight", "ProfileStatsCommunityPercentileHeadingRight",
      "PSCGroupCombatPercentile", "PSCGroupKillsPercentile", "PSCGroupSurvivalPercentile",
      "PSCGroupDamagePercentile", "PSCGroupEconomyPercentile", "PSCGroupSustainPercentile"
    ];
    var metricIds = [
      "Kd", "Kda", "AverageKills", "AverageAssists", "AverageDeaths", "DamageTakenPerMinute",
      "PlayerDamagePerMinute", "Accuracy", "CriticalHitRate", "BossDamagePerMinute",
      "NetWorthPerMinute", "HealingPerMinute"
    ];
    var root = new Panel("root");
    root.paneltype = runtimeAdapter.contextPanelType || "";
    var map = {};
    var stockHero;
    var secondHero;
    var counters = { findChild: 0, childCount: 0, childRead: 0, attributeRead: 0, textRead: 0, inRuntime: false };
    var scheduler = new FakeScheduler(1700000000000, counters);
    var messages = [];
    var externalUrls = [];
    var navigation = { xmlCancel: 0, navigateBack: 0 };
    var context;
    ids.forEach(function (id) {
      map[id] = new Panel(id);
    });
    metricIds.forEach(function (id) {
      map["PSCMetric" + id + "Player"] = new Panel("PSCMetric" + id + "Player");
      map["PSCMetric" + id + "Community"] = new Panel("PSCMetric" + id + "Community");
      map["PSCMetric" + id + "Percentile"] = new Panel("PSCMetric" + id + "Percentile");
    });
    map.ProfileStatsCommunityMatchCount50.attributes.value = "50";
    map.ProfileStatsCommunityMatchCount100.attributes.value = "100";
    map.ProfileStatsCommunityMatchCount150.attributes.value = "150";
    map.ProfileStatsCommunityMatchCount.selectedOption = map.ProfileStatsCommunityMatchCount50;
    map.ProfileStatsCommunityAccount.text = String(account);
    map.SelfName.children = [new Panel("")];
    map.SelfName.children[0].text = playerName || "Ishan";
    stockHero = new Panel("StockHero", ["heroRow", "selected"]);
    secondHero = new Panel("SecondHero", ["heroRow"]);
    map.HeroList.children = [stockHero, secondHero];
    Object.keys(map).forEach(function (id) {
      map[id].rootMap = map;
      map[id].counters = counters;
    });
    stockHero.rootMap = map;
    stockHero.counters = counters;
    secondHero.rootMap = map;
    secondHero.counters = counters;
    root.rootMap = map;
    root.counters = counters;
    root.GetContextPanel = function () { return root; };
    context = {
      $: {
        GetContextPanel: function () { return root; },
        Schedule: function (delay, callback) { return scheduler.schedule(delay, callback); },
        CancelScheduled: function (handle) { scheduler.cancel(handle); },
        Msg: function (message) { messages.push(String(message)); },
        RegisterEventHandler: function (name, panel, callback) { panel.events[name] = wrapRuntimeCallback(counters, callback); },
        DispatchEvent: function (name, url) {
          if (name === "ExternalBrowserGoToURL") externalUrls.push(String(url));
        }
      },
      Date: fakeDateFor(scheduler),
      JSON: JSON,
      Math: Math,
      String: String,
      Object: Object,
      Error: Error,
      isFinite: isFinite,
      parseInt: parseInt,
      encodeURIComponent: encodeURIComponent,
      decodeURIComponent: decodeURIComponent,
      CitadelNavigateBack: function () {
        navigation.navigateBack += 1;
        context.navigatedBack = true;
      }
    };
    root.events.oncancel = function () {
      navigation.xmlCancel += 1;
      context.CitadelNavigateBack();
    };
    runRuntime(counters, function () {
      vm.runInNewContext(source, context, { filename: sourcePath });
    });
    assert.equal(scheduler.pendingCount(), 1, "boot is the only initial callback");
    scheduler.runNext();
    return {
      root: root,
      map: map,
      scheduler: scheduler,
      counters: counters,
      messages: messages,
      context: context,
      externalUrls: externalUrls,
      navigation: navigation,
      bridge: map.ProfileStatsCommunityBridge,
      stockRows: [stockHero, secondHero]
    };
  }

  var metricPanelSuffixes = {
    kd: "Kd",
    kda: "Kda",
    average_kills: "AverageKills",
    average_assists: "AverageAssists",
    average_deaths: "AverageDeaths",
    damage_taken_per_minute: "DamageTakenPerMinute",
    player_damage_per_minute: "PlayerDamagePerMinute",
    accuracy: "Accuracy",
    critical_hit_rate: "CriticalHitRate",
    boss_damage_per_minute: "BossDamagePerMinute",
    net_worth_per_minute: "NetWorthPerMinute",
    healing_per_minute: "HealingPerMinute"
  };

  function badgeText(value) {
    var displayed;
    if (value === null || value === undefined) return "—";
    displayed = value >= 50 ? 100 - value : value;
    return (value >= 50 ? "TOP " : "BOTTOM ") + String(Math.max(1, Math.round(displayed))) + "%";
  }

  function badgeClass(value) {
    if (value === null || value === undefined) return "ProfileStatsCommunityPercentileUnavailable";
    return value >= 50 ? "ProfileStatsCommunityPercentileTop" : "ProfileStatsCommunityPercentileBottom";
  }

  function payloadFor(request, sample, matches, mode) {
    var groups = [
      ["combat", ["kd", "kda"]],
      ["kills", ["average_kills", "average_assists"]],
      ["survival", ["average_deaths", "damage_taken_per_minute"]],
      ["damage", ["player_damage_per_minute", "accuracy", "critical_hit_rate", "boss_damage_per_minute"]],
      ["economy", ["net_worth_per_minute"]],
      ["sustain", ["healing_per_minute"]]
    ];
    var metricSerial = 0;
    matches = matches || 50;
    mode = mode || "ranked";
    return {
      v: 3,
      kind: "profile_stats",
      request: request,
      account: 42,
      matches: matches,
      mode: mode,
      sample: sample,
      generated: "2026-08-25T00:00:00Z",
      groups: groups.map(function (group) {
        return {
          id: group[0],
          metrics: group[1].map(function (id) {
            metricSerial += 1;
            return { id: id, player: metricSerial + 0.25, community: metricSerial + 0.5, percentile: 10 + (metricSerial * 5) };
          })
        };
      })
    };
  }

  function assertRenderedPayload(map, payload) {
    payload.groups.forEach(function (group) {
      var total = 0;
      var count = 0;
      group.metrics.forEach(function (metric) {
        var suffix = metricPanelSuffixes[metric.id];
        var percentilePanel = map["PSCMetric" + suffix + "Percentile"];
        assert.equal(map["PSCMetric" + suffix + "Player"].text, String(metric.player), metric.id + " player value");
        assert.equal(map["PSCMetric" + suffix + "Community"].text, String(metric.community), metric.id + " community value");
        assert.equal(percentilePanel.text, badgeText(metric.percentile), metric.id + " percentile badge");
        assert.equal(percentilePanel.BHasClass(badgeClass(metric.percentile)), true, metric.id + " percentile class");
        if (metric.percentile !== null) {
          total += metric.percentile;
          count += 1;
        }
      });
      assert.equal(map["PSCGroup" + group.id.charAt(0).toUpperCase() + group.id.substring(1) + "Percentile"].text, badgeText(count ? total / count : null), group.id + " average percentile");
    });
  }


  function requestFromUrl(url) {
    var match = /[?&]request=([^&]+)/.exec(url);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function queryValue(url, name) {
    var match = new RegExp("[?&]" + name + "=([^&#]+)").exec(url);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function selectDifferentHero(harness) {
    harness.stockRows[0].classes = ["heroRow"];
    harness.stockRows[1].classes.push("selected");
    harness.scheduler.runNext();
  }

  function resetRuntimeProbe(harness) {
    harness.counters.findChild = 0;
    harness.counters.childCount = 0;
    harness.counters.childRead = 0;
    harness.counters.attributeRead = 0;
    harness.counters.textRead = 0;
    harness.scheduler.scheduledCount = 0;
    harness.scheduler.cancelledCount = 0;
    harness.scheduler.executedCount = 0;
    harness.scheduler.maxPending = harness.scheduler.pendingCount();
  }

  function runtimeProbe(harness) {
    return {
      scheduled: harness.scheduler.scheduledCount,
      cancelled: harness.scheduler.cancelledCount,
      callbacks: harness.scheduler.executedCount,
      maxPending: harness.scheduler.maxPending,
      pending: harness.scheduler.pendingCount(),
      traversal: harness.counters.findChild,
      childCount: harness.counters.childCount,
      childRead: harness.counters.childRead,
      attributeRead: harness.counters.attributeRead,
      textRead: harness.counters.textRead
    };
  }

  function assertNoRuntimeWork(probe, label) {
    assert.deepEqual(probe, {
      scheduled: 0,
      cancelled: 0,
      callbacks: 0,
      maxPending: 0,
      pending: 0,
      traversal: 0,
      childCount: 0,
      childRead: 0,
      attributeRead: 0,
      textRead: 0
    }, label);
  }

  function assertActiveRuntimeBudget(probe) {
    var panelReads = probe.traversal + probe.childCount + probe.childRead +
      probe.attributeRead + probe.textRead;
    assert.equal(probe.pending, 1, "active mode keeps one pending watcher");
    assert.ok(probe.maxPending <= 1, "active mode never overlaps watcher callbacks");
    assert.ok(probe.scheduled > 0 && probe.scheduled <= 11, "five active seconds schedule at most eleven callbacks");
    assert.ok(probe.callbacks > 0 && probe.callbacks <= 10, "five active seconds execute at most ten callbacks");
    assert.equal(probe.cancelled, 0, "stable active mode does not cancel callbacks");
    assert.ok(panelReads > 0 && panelReads <= 250, "five active seconds stay within the panel-read budget");
  }

  test("stock mode has no recurring callbacks or panel scans", function () {
    var harness = makeHarness("42");

    assert.equal(harness.scheduler.pendingCount(), 0, "boot settles without an idle watcher");
    resetRuntimeProbe(harness);
    harness.scheduler.advance(5);

    assertNoRuntimeWork(runtimeProbe(harness), "stock mode performs no recurring lifecycle or panel work");
    assert.deepEqual(harness.map.ProfileStatsCommunitySupporterTicker.urls, ["about:blank"]);
    assert.equal(harness.map.ProfileStatsCommunityBridge.visible, false);
  });

  test("viewed display name drives comparison labels and StatLocker profile", function () {
    var harness = makeHarness("42", "Ishan");

    harness.map.ProfileStatsCommunityButton.events.onactivate();

    assert.equal(harness.map.ProfileStatsCommunityTitle.text, "Ishan VS COMMUNITY");
    assert.equal(harness.map.ProfileStatsCommunityPlayerHeadingLeft.text, "Ishan");
    assert.equal(harness.map.ProfileStatsCommunityPlayerHeadingRight.text, "Ishan");
    harness.map.ProfileStatsCommunityStatLocker.events.onactivate();
    assert.deepEqual(harness.externalUrls, ["https://statlocker.gg/profile/42/matches"]);

    harness.map.SelfName.children[0].text = "Changed Name";
    harness.scheduler.runNext();
    assert.equal(harness.map.ProfileStatsCommunityTitle.text, "Changed Name VS COMMUNITY");
    assert.equal(harness.map.ProfileStatsCommunityPlayerHeadingLeft.text, "Changed Name");
    assert.equal(harness.map.ProfileStatsCommunityPlayerHeadingRight.text, "Changed Name");
  });

  test("StatLocker link rereads account authority at click time", function () {
    var harness = makeHarness("42", "Ishan");

    harness.map.ProfileStatsCommunityButton.events.onactivate();
    harness.map.ProfileStatsCommunityAccount.text = "";
    harness.map.ProfileStatsCommunityStatLocker.events.onactivate();

    assert.deepEqual(harness.externalUrls, []);

    harness.map.ProfileStatsCommunityAccount.text = "42";
    harness.root.attributes.accountid = "43";
    harness.map.ProfileStatsCommunityStatLocker.events.onactivate();
    assert.deepEqual(harness.externalUrls, [], "mismatched root authority must not open a profile");

    delete harness.root.attributes.accountid;
    harness.root.attributes.steamid = "76561197960265771";
    harness.map.ProfileStatsCommunityStatLocker.events.onactivate();
    assert.deepEqual(harness.externalUrls, [], "mismatched SteamID64 authority must not open a profile");

    harness.root.attributes.steamid = "76561197960265770";
    harness.map.ProfileStatsCommunityStatLocker.events.onactivate();
    assert.deepEqual(harness.externalUrls, ["https://statlocker.gg/profile/42/matches"]);
  });

  test("Escape preserves the XML profile-page cancel path", function () {
    var harness = makeHarness("42");

    harness.map.ProfileStatsCommunityButton.events.onactivate();
    harness.root.events.oncancel();

    assert.deepEqual(harness.navigation, { xmlCancel: 1, navigateBack: 1 });
    assert.equal(harness.context.navigatedBack, true);
  });

  test("open mode keeps one watcher and stock restoration cancels it", function () {
    var harness = makeHarness("42");
    var staleWatcher;

    harness.map.ProfileStatsCommunityButton.events.onactivate();
    assert.equal(harness.scheduler.pendingCount(), 1);
    staleWatcher = harness.scheduler.pendingCallbacks()[0];
    resetRuntimeProbe(harness);
    harness.scheduler.advance(5);
    assertActiveRuntimeBudget(runtimeProbe(harness));
    assert.deepEqual(harness.messages, [], "production lifecycle emits no debug messages");

    selectDifferentHero(harness);
    assert.equal(harness.scheduler.pendingCount(), 0);
    assert.equal(harness.map.ProfileStatsCommunityBridge.urls.at(-1), "about:blank");
    assert.equal(harness.map.ProfileStatsCommunitySupporterTicker.urls.at(-1), "about:blank");
    resetRuntimeProbe(harness);
    harness.scheduler.advance(5);
    assertNoRuntimeWork(runtimeProbe(harness), "restored stock mode does not rearm lifecycle or panel work");

    harness.map.ProfileStatsCommunityButton.events.onactivate();
    assert.equal(harness.scheduler.pendingCount(), 1);
    staleWatcher();
    assert.equal(harness.scheduler.pendingCount(), 1, "a cancelled watcher cannot rearm or cancel the reopened watcher");
  });

  test("closed-view responses stay stale after reopening", function () {
    var harness = makeHarness("42");
    var bridge = harness.bridge;
    var oldRequest;
    var newRequest;

    harness.map.ProfileStatsCommunityButton.events.onactivate();
    oldRequest = requestFromUrl(bridge.urls.at(-1));
    selectDifferentHero(harness);
    harness.map.ProfileStatsCommunityButton.events.onactivate();
    newRequest = requestFromUrl(bridge.urls.at(-1));
    assert.notEqual(newRequest, oldRequest);

    bridge.events.HTMLTitle(bridge, "DLSTATS2:" + JSON.stringify(payloadFor(oldRequest, 10)));
    assert.match(harness.map.ProfileStatsCommunityStatus.text, /Loading/);
    bridge.events.HTMLTitle(bridge, "DLSTATS2:" + JSON.stringify(payloadFor(newRequest, 10)));
    assert.match(harness.map.ProfileStatsCommunityStatus.text, /loaded/);
  });

  test("active timeout fails the request but keeps the view responsive", function () {
    var harness = makeHarness("42");

    harness.map.ProfileStatsCommunityButton.events.onactivate();
    harness.scheduler.advance(25);

    assert.match(harness.map.ProfileStatsCommunityStatus.text, /could not be reached/);
    assert.equal(harness.map.ProfileStatsCommunityRetry.style.visibility, "visible");
    assert.equal(harness.map.ProfileStatsCommunityBridge.urls.at(-1), "about:blank");
    assert.equal(harness.scheduler.pendingCount(), 1, "error view still watches for stock navigation");

    selectDifferentHero(harness);
    assert.equal(harness.scheduler.pendingCount(), 0);
  });

  test("invalid active panels disable the runtime without rearming", function () {
    var harness = makeHarness("42");
    var requestCount;

    harness.map.ProfileStatsCommunityButton.events.onactivate();
    requestCount = harness.map.ProfileStatsCommunityBridge.urls.length;
    harness.map.ProfileStatsCommunityPanel.valid = false;
    harness.scheduler.runNext();

    assert.equal(harness.scheduler.pendingCount(), 0);
    assert.equal(harness.map.ProfileStatsCommunityBridge.urls.at(-1), "about:blank");
    assert.equal(harness.map.ProfileStatsCommunitySupporterTicker.urls.at(-1), "about:blank");
    harness.map.ProfileStatsCommunityButton.events.onactivate();
    assert.equal(harness.map.ProfileStatsCommunityBridge.urls.length, requestCount + 1, "disabled runtime does not start another request");
  });

  test("rate-limit Retry-After blocks retries and filter bypasses", function () {
    var harness = makeHarness("42");
    var bridge = harness.bridge;
    var requestUrl;
    var request;
    var networkRequestCount;
    var errorTitle;

    harness.map.ProfileStatsCommunityButton.events.onactivate();
    requestUrl = bridge.urls.at(-1);
    request = requestFromUrl(requestUrl);
    errorTitle = "DLSTATS2:" + JSON.stringify({
      v: 3,
      kind: "error",
      request: request,
      account: 42,
      matches: 50,
      mode: "ranked",
      code: "rate_limit",
      status: 429,
      retry_after: 2,
      message: "The stats service is rate limited."
    });
    bridge.events.HTMLTitle(bridge, errorTitle);
    networkRequestCount = bridge.urls.filter(function (url) {
      return /^https:\/\/hantu-raya\.github\.io\/deadlock-stats-bridge\/bridge\.html\?/.test(url);
    }).length;

    assert.match(harness.map.ProfileStatsCommunityStatus.text, /Retry after 2 seconds/);
    assert.equal(harness.map.ProfileStatsCommunityRetry.style.visibility, "collapse");
    harness.map.ProfileStatsCommunityRetry.events.onactivate();
    harness.map.ProfileStatsCommunityStandard.events.onactivate();
    assert.equal(bridge.urls.filter(function (url) {
      return /^https:\/\/hantu-raya\.github\.io\/deadlock-stats-bridge\/bridge\.html\?/.test(url);
    }).length, networkRequestCount, "Retry and filter changes cannot bypass Retry-After");

    harness.scheduler.advance(2);
    assert.equal(harness.map.ProfileStatsCommunityRetry.style.visibility, "visible");
    harness.map.ProfileStatsCommunityRetry.events.onactivate();
    assert.equal(queryValue(bridge.urls.at(-1), "mode"), "standard");
  });

  test("HTMLTitle renders every validated metric for the viewed profile", function () {
    var harness = makeHarness("42");
    var bridge = harness.bridge;
    var firstUrl;
    var request;
    var title;
    var encodedUrl;
    var replacementKdPlayer;
    var payload;
    harness.map.ProfileStatsCommunityButton.events.onactivate();
    assert.equal(harness.map.StatsTitle.visible, true, "stock title remains mounted and visible");
    assert.equal(harness.map.StatsLeft.visible, true, "stock left stats remain mounted and visible");
    assert.equal(harness.map.StatsRight.visible, true, "stock right stats remain mounted and visible");
    assert.equal(harness.map.StatsTitle.style.visibility, undefined, "custom open does not mutate stock title visibility");
    assert.equal(harness.map.StatsLeft.style.visibility, undefined, "custom open does not mutate stock left visibility");
    assert.equal(harness.map.StatsRight.style.visibility, undefined, "custom open does not mutate stock right visibility");
    assert.equal(harness.map.ProfileStatsCommunityPanel.style.visibility, "visible");
    assert.equal(bridge.visible, true, "request lifecycle exposes the hidden bridge panel");
    firstUrl = bridge.urls[bridge.urls.length - 1];
    request = requestFromUrl(firstUrl);
    assert.match(firstUrl, /^https:\/\/hantu-raya\.github\.io\/deadlock-stats-bridge\/bridge\.html\?/);
    assert.equal(queryValue(firstUrl, "matches"), "50");
    assert.equal(queryValue(firstUrl, "mode"), "ranked");
    assert.equal(queryValue(firstUrl, "protocol"), "3");
    assert.equal(bridge.ignoreCursor, true);
    assert.match(harness.map.ProfileStatsCommunityStatus.text, /Loading/);
    bridge.events.HTMLURLChanged(bridge, firstUrl);
    assert.match(harness.map.ProfileStatsCommunityStatus.text, /Loading/, "initial bridge URL does not finish the request");
    harness.map.PSCMetricKdPlayer.valid = false;
    replacementKdPlayer = new Panel("PSCMetricKdPlayer");
    replacementKdPlayer.rootMap = harness.map;
    harness.map.PSCMetricKdPlayer = replacementKdPlayer;
    payload = payloadFor(request, 7);
    title = "DLSTATS2:" + JSON.stringify(payload);
    encodedUrl = firstUrl + "#" + harness.context.encodeURIComponent(title);
    bridge.events.HTMLTitle(bridge, title);
    assert.equal(replacementKdPlayer.text, "1.25", "render resolves a metric label replaced after boot");
    assertRenderedPayload(harness.map, payload);
    assert.equal(harness.map.ProfileStatsCommunitySample.text, "Ranked sample: 7 / 50");
    assert.equal(harness.map.ProfileStatsCommunityMetrics.style.visibility, "visible");
    assert.equal(bridge.visible, false, "completed request collapses the hidden bridge panel");
    assert.equal(bridge.urls[bridge.urls.length - 1], "about:blank");
    bridge.events.HTMLURLChanged(bridge, encodedUrl);
    bridge.events.HTMLTitle(bridge, title);
    assert.equal(harness.map.PSCMetricKdPlayer.text, "1.25", "duplicate title and URL delivery is inert");
  });

  test("percentile badges render TOP/BOTTOM states and category means", function () {
    var harness = makeHarness("42");
    var bridge = harness.bridge;
    var request;
    var payload;
    harness.map.ProfileStatsCommunityButton.events.onactivate();
    request = requestFromUrl(bridge.urls[bridge.urls.length - 1]);
    payload = payloadFor(request, 12);
    payload.groups[0].metrics[0].player = null;
    payload.groups[0].metrics[0].percentile = null;
    payload.groups[0].metrics[1].percentile = 74.6;
    bridge.events.HTMLTitle(bridge, "DLSTATS2:" + JSON.stringify(payload));
    assert.equal(harness.map.PSCMetricKdPercentile.text, "—");
    assert.equal(harness.map.PSCMetricKdPercentile.BHasClass("ProfileStatsCommunityPercentileUnavailable"), true);
    assert.equal(harness.map.PSCMetricKdPlayer.text, "—");
    assert.equal(harness.map.PSCMetricKdPlayer.BHasClass("ProfileStatsCommunityValueUnavailable"), true);
    assert.equal(harness.map.PSCMetricKdaPercentile.text, "TOP 25%");
    assert.equal(harness.map.PSCMetricKdaPercentile.BHasClass("ProfileStatsCommunityPercentileTop"), true);
    assert.equal(harness.map.PSCGroupCombatPercentile.text, "TOP 25%");
    assert.equal(harness.map.PSCGroupCombatPercentile.BHasClass("ProfileStatsCommunityPercentileTop"), true);
    assert.equal(harness.map.ProfileStatsCommunityPercentile, undefined, "runtime does not render an overall percentile");
  });


  test("comparison toggle defaults to TOP %, switches every row without a request, and switches back", function () {
    var harness = makeHarness("42");
    var bridge = harness.bridge;
    var request;
    var payload;
    var urlsAfterRender;
    var scheduledBefore;
    var pendingBefore;
    var groupBadgeTexts;
    var metricIds = Object.keys(metricPanelSuffixes);
    var groupIds = ["combat", "kills", "survival", "damage", "economy", "sustain"];

    harness.map.ProfileStatsCommunityButton.events.onactivate();
    request = requestFromUrl(bridge.urls[bridge.urls.length - 1]);
    payload = payloadFor(request, 12);
    payload.groups[0].metrics[0].percentile = 75;
    payload.groups[0].metrics[1].percentile = 48;
    bridge.events.HTMLTitle(bridge, "DLSTATS2:" + JSON.stringify(payload));

    urlsAfterRender = bridge.urls.slice();
    scheduledBefore = harness.scheduler.scheduledCount;
    pendingBefore = harness.scheduler.pendingCount();
    groupBadgeTexts = groupIds.map(function (groupId) {
      return harness.map["PSCGroup" + groupId.charAt(0).toUpperCase() + groupId.substring(1) + "Percentile"].text;
    });
    assert.equal(harness.map.ProfileStatsCommunityDisplayPercentile.BHasClass("selected"), true);
    assert.equal(harness.map.ProfileStatsCommunityDisplayCommunity.BHasClass("selected"), false);
    assert.equal(harness.map.PSCMetricKdCommunity.style.visibility, "collapse");
    assert.equal(harness.map.PSCMetricKdPercentile.style.visibility, "visible");
    assert.equal(harness.map.ProfileStatsCommunityCommunityHeadingLeft.style.visibility, "collapse");
    assert.equal(harness.map.ProfileStatsCommunityPercentileHeadingLeft.style.visibility, "visible");
    assert.equal(harness.map.PSCMetricKdPercentile.text, "TOP 25%");
    assert.equal(harness.map.PSCMetricKdaPercentile.text, "BOTTOM 48%");

    metricIds.forEach(function (metricId) {
      var suffix = metricPanelSuffixes[metricId];
      assert.equal(harness.map["PSCMetric" + suffix + "Community"].style.visibility, "collapse", metricId + " community starts hidden");
      assert.equal(harness.map["PSCMetric" + suffix + "Percentile"].style.visibility, "visible", metricId + " percentile starts visible");
    });

    harness.map.ProfileStatsCommunityDisplayCommunity.events.onactivate();
    assert.equal(harness.map.ProfileStatsCommunityDisplayCommunity.BHasClass("selected"), true);
    assert.equal(harness.map.ProfileStatsCommunityDisplayPercentile.BHasClass("selected"), false);
    assert.equal(harness.map.PSCMetricKdCommunity.style.visibility, "visible");
    assert.equal(harness.map.PSCMetricKdPercentile.style.visibility, "collapse");
    assert.equal(harness.map.ProfileStatsCommunityCommunityHeadingLeft.style.visibility, "visible");
    assert.equal(harness.map.ProfileStatsCommunityPercentileHeadingLeft.style.visibility, "collapse");
    assert.equal(harness.map.PSCMetricKdCommunity.text, "1.5");
    assert.equal(harness.map.PSCMetricKdaCommunity.text, "2.5");
    assert.equal(harness.map.PSCMetricKdPlayer.text, "1.25");
    assert.deepEqual(groupIds.map(function (groupId) {
      return harness.map["PSCGroup" + groupId.charAt(0).toUpperCase() + groupId.substring(1) + "Percentile"].text;
    }), groupBadgeTexts);
    metricIds.forEach(function (metricId) {
      var suffix = metricPanelSuffixes[metricId];
      assert.equal(harness.map["PSCMetric" + suffix + "Community"].style.visibility, "visible", metricId + " community switches together");
      assert.equal(harness.map["PSCMetric" + suffix + "Percentile"].style.visibility, "collapse", metricId + " percentile switches together");
    });
    assert.deepEqual(bridge.urls, urlsAfterRender);
    assert.equal(harness.scheduler.scheduledCount, scheduledBefore);
    assert.equal(harness.scheduler.pendingCount(), pendingBefore);

    harness.map.ProfileStatsCommunityDisplayPercentile.events.onactivate();
    assert.equal(harness.map.PSCMetricKdCommunity.style.visibility, "collapse");
    assert.equal(harness.map.PSCMetricKdPercentile.style.visibility, "visible");
    assert.equal(harness.map.PSCMetricKdPercentile.text, "TOP 25%");
    assert.deepEqual(bridge.urls, urlsAfterRender);
    assert.equal(harness.scheduler.scheduledCount, scheduledBefore);
    assert.equal(harness.scheduler.pendingCount(), pendingBefore);
  });

  test("runtime rejects non-finite or out-of-range metric percentiles", function () {
    var harness = makeHarness("42");
    var bridge = harness.bridge;
    var request;
    var payload;
    harness.map.ProfileStatsCommunityButton.events.onactivate();
    request = requestFromUrl(bridge.urls[bridge.urls.length - 1]);
    payload = payloadFor(request, 9);
    payload.groups[0].metrics[0].percentile = 101;
    bridge.events.HTMLTitle(bridge, "DLSTATS2:" + JSON.stringify(payload));
    assert.match(harness.map.ProfileStatsCommunityStatus.text, /invalid|response/i);
    assert.equal(harness.map.ProfileStatsCommunityMetrics.style.visibility, "collapse");
    assert.equal(harness.map.ProfileStatsCommunityRetry.style.visibility, "visible");
  });

  test("stale success keeps metrics visible and exposes Retry", function () {
    var harness = makeHarness("42");
    var bridge = harness.bridge;
    var request;
    var payload;
    harness.map.ProfileStatsCommunityButton.events.onactivate();
    request = requestFromUrl(bridge.urls[bridge.urls.length - 1]);
    payload = payloadFor(request, 50);
    payload.generated = new Date(harness.scheduler.nowMs - (10 * 60 * 1000) - 1).toISOString();
    bridge.events.HTMLTitle(bridge, "DLSTATS2:" + JSON.stringify(payload));
    assert.equal(harness.map.ProfileStatsCommunityMetrics.style.visibility, "visible");
    assert.match(harness.map.ProfileStatsCommunityGenerated.text, /\(stale\)$/);
    assert.equal(harness.map.ProfileStatsCommunityRetry.style.visibility, "visible");
    assert.match(harness.map.ProfileStatsCommunityStatus.text, /cached comparison data/);
    var requestCount = bridge.urls.filter(function (url) {
      return /^https:\/\/hantu-raya\.github\.io\/deadlock-stats-bridge\/bridge\.html\?/.test(url);
    }).length;
    harness.map.ProfileStatsCommunityRetry.events.onactivate();
    harness.scheduler.advance(0.25);
    assert.equal(bridge.urls.filter(function (url) {
      return /^https:\/\/hantu-raya\.github\.io\/deadlock-stats-bridge\/bridge\.html\?/.test(url);
    }).length, requestCount + 1, "Retry bypasses stale in-memory data");
  });

  test("rapid filter changes debounce to the last request and stock cancels the pending assignment", function () {
    var harness = makeHarness("42");
    var bridge = harness.bridge;
    var requestUrl;
    var request;
    var payload;
    var networkRequestCount;

    harness.map.ProfileStatsCommunityButton.events.onactivate();
    networkRequestCount = bridge.urls.filter(function (url) {
      return /^https:\/\/hantu-raya\.github\.io\/deadlock-stats-bridge\/bridge\.html\?/.test(url);
    }).length;

    harness.map.ProfileStatsCommunityStandard.events.onactivate();
    harness.map.ProfileStatsCommunityMatchCount.selectedOption = harness.map.ProfileStatsCommunityMatchCount100;
    harness.map.ProfileStatsCommunityMatchCount.events.oninputsubmit();
    harness.map.ProfileStatsCommunityMatchCount.selectedOption = harness.map.ProfileStatsCommunityMatchCount150;
    harness.map.ProfileStatsCommunityMatchCount.events.oninputsubmit();

    assert.equal(bridge.urls.filter(function (url) {
      return /^https:\/\/hantu-raya\.github\.io\/deadlock-stats-bridge\/bridge\.html\?/.test(url);
    }).length, networkRequestCount, "rapid changes do not assign intermediate bridge URLs");
    assert.equal(harness.scheduler.pendingCount(), 2, "one watcher and one bridge assignment are pending");
    harness.scheduler.advance(0.24);
    assert.equal(bridge.urls.filter(function (url) {
      return /^https:\/\/hantu-raya\.github\.io\/deadlock-stats-bridge\/bridge\.html\?/.test(url);
    }).length, networkRequestCount);

    harness.scheduler.advance(0.01);
    requestUrl = bridge.urls[bridge.urls.length - 1];
    assert.equal(queryValue(requestUrl, "mode"), "standard");
    assert.equal(queryValue(requestUrl, "matches"), "150");
    assert.equal(bridge.urls.filter(function (url) {
      return /^https:\/\/hantu-raya\.github\.io\/deadlock-stats-bridge\/bridge\.html\?/.test(url);
    }).length, networkRequestCount + 1, "only the final filter selection starts a request");

    request = requestFromUrl(requestUrl);
    payload = payloadFor(request, 150, 150, "standard");
    bridge.events.HTMLTitle(bridge, "DLSTATS2:" + JSON.stringify(payload));
    assert.equal(harness.map.ProfileStatsCommunityStatus.text, "Standard comparison loaded.");

    harness.scheduler.advance(0.25);
    harness.map.ProfileStatsCommunityRanked.events.onactivate();
    harness.stockRows[0].classes = ["heroRow"];
    harness.stockRows[1].classes.push("selected");
    harness.scheduler.advance(0.25);

    assert.equal(harness.scheduler.pendingCount(), 0, "stock mode leaves no pending bridge callback");
    assert.equal(bridge.urls.filter(function (url) {
      return /^https:\/\/hantu-raya\.github\.io\/deadlock-stats-bridge\/bridge\.html\?/.test(url);
    }).length, networkRequestCount + 1, "stock restoration cancels the deferred request");
    assert.equal(bridge.urls[bridge.urls.length - 1], "about:blank");
  });

  test("runtime keeps malformed expected fragments pending and rejects wrong-origin URLs", function () {
    var malformedHarness = makeHarness("42");
    var malformedBridge = malformedHarness.bridge;
    var malformedUrl;
    var unexpectedHarness;
    var unexpectedBridge;
    malformedHarness.map.ProfileStatsCommunityButton.events.onactivate();
    malformedUrl = malformedBridge.urls[malformedBridge.urls.length - 1];
    malformedBridge.events.HTMLURLChanged(malformedBridge, malformedUrl + "#DLSTATS2%ZZ");
    assert.match(malformedHarness.map.ProfileStatsCommunityStatus.text, /Loading/, "malformed encoding cannot finish the request");
    malformedBridge.events.HTMLURLChanged(malformedBridge, malformedUrl + "#not-a-dlstats-title");
    assert.match(malformedHarness.map.ProfileStatsCommunityStatus.text, /Loading/, "unexpected fragment title cannot finish the request");
    malformedBridge.events.HTMLURLChanged(malformedBridge, malformedUrl + "#" + new Array(4100).join("x"));
    assert.match(malformedHarness.map.ProfileStatsCommunityStatus.text, /Loading/, "oversized fragments cannot finish the request");

    unexpectedHarness = makeHarness("42");
    unexpectedBridge = unexpectedHarness.bridge;
    unexpectedHarness.map.ProfileStatsCommunityButton.events.onactivate();
    unexpectedBridge.events.HTMLURLChanged(unexpectedBridge, "https://example.invalid/bridge.html");
    assert.match(unexpectedHarness.map.ProfileStatsCommunityStatus.text, /could not be reached/);
    assert.equal(unexpectedHarness.map.ProfileStatsCommunityRetry.style.visibility, "visible");
    assert.equal(unexpectedBridge.urls[unexpectedBridge.urls.length - 1], "about:blank");
  });

  test("selected hero baseline stays open until a different hero selection", function () {
    var harness = makeHarness("42");
    var bridge = harness.bridge;
    var requestUrl;
    harness.map.ProfileStatsCommunityButton.events.onactivate();
    requestUrl = bridge.urls[bridge.urls.length - 1];
    assert.equal(harness.map.StatsTitle.visible, true);
    assert.equal(harness.map.StatsLeft.visible, true);
    assert.equal(harness.map.StatsRight.visible, true);
    assert.equal(harness.map.StatsTitle.style.visibility, undefined);
    assert.equal(harness.map.StatsLeft.style.visibility, undefined);
    assert.equal(harness.map.StatsRight.style.visibility, undefined);
    assert.equal(harness.stockRows[0].BHasClass("selected"), true);
    assert.equal(harness.scheduler.pendingCount(), 1, "one bounded context check is pending");
    harness.scheduler.runNext();
    assert.equal(harness.map.ProfileStatsCommunityPanel.style.visibility, "visible");
    assert.equal(bridge.urls[bridge.urls.length - 1], requestUrl, "selected baseline does not cancel the request");
    harness.stockRows[0].classes = ["heroRow"];
    harness.stockRows[1].classes.push("selected");
    harness.scheduler.runNext();
    assert.equal(harness.map.ProfileStatsCommunityPanel.style.visibility, "collapse");
    assert.equal(harness.map.StatsTitle.visible, true, "hero change leaves stock title visible");
    assert.equal(harness.map.StatsLeft.visible, true, "hero change leaves stock left visible");
    assert.equal(harness.map.StatsRight.visible, true, "hero change leaves stock right visible");
    assert.equal(harness.map.StatsTitle.style.visibility, undefined, "hero change does not write stock title visibility");
    assert.equal(harness.map.StatsLeft.style.visibility, undefined, "hero change does not write stock left visibility");
    assert.equal(harness.map.StatsRight.style.visibility, undefined, "hero change does not write stock right visibility");
    assert.equal(bridge.visible, false, "hero change collapses the request bridge");
    assert.equal(bridge.urls[bridge.urls.length - 1], "about:blank");
  });

  test("supporter ticker loads only in custom mode and unloads on stock restoration or invalid page", function () {
    var restoreHarness = makeHarness("42");
    var restoreTicker = restoreHarness.map.ProfileStatsCommunitySupporterTicker;
    var cancelHarness;
    var cancelTicker;
    var supporterUrl = "https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/";

    assert.deepEqual(restoreTicker.urls, ["about:blank"], "stock mode keeps the ticker unloaded");
    assert.equal(restoreTicker.visible, false);
    assert.equal(restoreTicker.style.visibility, "collapse");

    restoreHarness.map.ProfileStatsCommunityButton.events.onactivate();
    assert.equal(restoreTicker.urls[restoreTicker.urls.length - 1], supporterUrl);
    assert.equal(restoreTicker.visible, true);
    assert.equal(restoreTicker.style.visibility, "visible");

    restoreHarness.scheduler.runNext();
    restoreHarness.stockRows[0].classes = ["heroRow"];
    restoreHarness.stockRows[1].classes.push("selected");
    restoreHarness.scheduler.runNext();
    assert.equal(restoreTicker.urls[restoreTicker.urls.length - 1], "about:blank");
    assert.equal(restoreTicker.visible, false);
    assert.equal(restoreTicker.style.visibility, "collapse");

    cancelHarness = makeHarness("42");
    cancelTicker = cancelHarness.map.ProfileStatsCommunitySupporterTicker;
    assert.deepEqual(cancelTicker.urls, ["about:blank"], "ticker does not load before custom mode");
    cancelHarness.map.ProfileStatsCommunityButton.events.onactivate();
    assert.equal(cancelTicker.urls[cancelTicker.urls.length - 1], supporterUrl);
    cancelHarness.root.valid = false;
    cancelHarness.scheduler.runNext();
    assert.equal(cancelTicker.urls[cancelTicker.urls.length - 1], "about:blank");
    assert.equal(cancelTicker.visible, false);
    assert.equal(cancelTicker.style.visibility, "collapse");
  });

  test("runtime rejects oversized hostile titles and stock restoration preserves native panels", function () {
    var harness = makeHarness("42");
    var bridge = harness.bridge;
    harness.map.ProfileStatsCommunityButton.events.onactivate();
    bridge.events.HTMLTitle(bridge, "DLSTATS2:" + new Array(2050).join("x"));
    assert.match(harness.map.ProfileStatsCommunityStatus.text, /invalid|response/i);
    assert.equal(harness.map.ProfileStatsCommunityRetry.style.visibility, "visible");
    selectDifferentHero(harness);
    assert.equal(harness.map.StatsTitle.visible, true);
    assert.equal(harness.map.StatsLeft.visible, true);
    assert.equal(harness.map.StatsRight.visible, true);
    assert.equal(harness.map.StatsTitle.style.visibility, undefined);
    assert.equal(harness.map.StatsLeft.style.visibility, undefined);
    assert.equal(harness.map.StatsRight.style.visibility, undefined);
    assert.equal(harness.map.ProfileStatsCommunityPanel.style.visibility, "collapse");
    assert.equal(bridge.urls[bridge.urls.length - 1], "about:blank");
  });
}

module.exports = {
  registerProfileStatsCommunityRuntimeTests: registerProfileStatsCommunityRuntimeTests
};
