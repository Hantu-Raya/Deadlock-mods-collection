"use strict";

var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var test = require("node:test");
var vm = require("node:vm");

var sourcePath = path.resolve(__dirname, "..", "panorama", "scripts", "profile_stats_community.js");
var source = fs.readFileSync(sourcePath, "utf8");

function Panel(id, classes) {
  this.id = id;
  this.classes = classes || [];
  this.style = {};
  this.text = "";
  this.visible = true;
  this.events = {};
  this.children = [];
  this.urls = [];
  this.ignoreCursor = false;
  this.valid = true;
  this.attributes = {};
  this.selectedOption = null;
}

Panel.prototype.IsValid = function () { return this.valid; };
Panel.prototype.FindChildTraverse = function (id) { return this.rootMap[id] || null; };
Panel.prototype.SetPanelEvent = function (name, callback) {
  if (name.indexOf("HTML") === 0) throw new Error("HTML events require $.RegisterEventHandler");
  this.events[name] = callback;
};
Panel.prototype.SetURL = function (url) { this.urls.push(url); };
Panel.prototype.SetIgnoreCursor = function (value) { this.ignoreCursor = value; };
Panel.prototype.GetChildCount = function () { return this.children.length; };
Panel.prototype.GetChild = function (index) { return this.children[index]; };
Panel.prototype.BHasClass = function (name) { return this.classes.indexOf(name) !== -1; };
Panel.prototype.BHasKeyFocus = function () { return this.BHasClass("keyfocused"); };
Panel.prototype.BHasDescendantKeyFocus = function () { return this.BHasClass("descendant-keyfocused"); };
Panel.prototype.IsSelected = function () { return this.BHasClass("selected"); };
Panel.prototype.GetSelected = function () { return this.selectedOption; };
Panel.prototype.GetAttributeString = function (name, fallback) {
  return Object.prototype.hasOwnProperty.call(this.attributes, name) ? String(this.attributes[name]) : fallback;
};

function makeHarness(account) {
  var ids = [
    "HeroList", "StatsBlock", "StatsTitle", "StatsLeft", "StatsRight", "ProfileStatsCommunityButton",
    "ProfileStatsCommunityPanel", "ProfileStatsCommunityIdentity", "ProfileStatsCommunityStatus",
    "ProfileStatsCommunityMetrics", "ProfileStatsCommunityMetadata", "ProfileStatsCommunitySample",
    "ProfileStatsCommunityGenerated", "ProfileStatsCommunityRetry", "ProfileStatsCommunityBridge",
    "ProfileStatsCommunitySupporterTicker", "ProfileStatsCommunityAccount",
    "ProfileStatsCommunityMatchCount", "ProfileStatsCommunityMatchCount50",
    "ProfileStatsCommunityMatchCount100", "ProfileStatsCommunityMatchCount150",
    "ProfileStatsCommunityRanked", "ProfileStatsCommunityStandard"
  ];
  var metricIds = [
    "Kd", "Kda", "AverageKills", "AverageAssists", "AverageDeaths", "DamageTakenPerMinute",
    "PlayerDamagePerMinute", "Accuracy", "CriticalHitRate", "NetWorthPerMinute",
    "BossDamagePerMinute", "HealingPerMinute"
  ];
  var root = new Panel("root");
  var map = {};
  var stockHero;
  var secondHero;
  var queue = [];
  var context;
  ids.forEach(function (id) {
    map[id] = new Panel(id);
  });
  metricIds.forEach(function (id) {
    map["PSCMetric" + id + "Player"] = new Panel("PSCMetric" + id + "Player");
    map["PSCMetric" + id + "Community"] = new Panel("PSCMetric" + id + "Community");
  });
  map.ProfileStatsCommunityMatchCount50.attributes.value = "50";
  map.ProfileStatsCommunityMatchCount100.attributes.value = "100";
  map.ProfileStatsCommunityMatchCount150.attributes.value = "150";
  map.ProfileStatsCommunityMatchCount.selectedOption = map.ProfileStatsCommunityMatchCount50;
  map.ProfileStatsCommunityAccount.text = String(account);
  stockHero = new Panel("StockHero", ["heroRow", "selected"]);
  secondHero = new Panel("SecondHero", ["heroRow"]);
  map.HeroList.children = [stockHero, secondHero];
  Object.keys(map).forEach(function (id) { map[id].rootMap = map; });
  root.rootMap = map;
  root.GetContextPanel = function () { return root; };
  context = {
    $: {
      GetContextPanel: function () { return root; },
      Schedule: function (delay, callback) { queue.push({ delay: delay, callback: callback }); },
      RegisterEventHandler: function (name, panel, callback) { panel.events[name] = callback; }
    },
    Date: Date,
    JSON: JSON,
    Math: Math,
    String: String,
    Object: Object,
    Error: Error,
    isFinite: isFinite,
    parseInt: parseInt,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    CitadelNavigateBack: function () { context.navigatedBack = true; }
  };
  vm.runInNewContext(source, context, { filename: sourcePath });
  assert.equal(queue.length, 1, "boot schedules one bounded check");
  queue.shift().callback();
  return {
    root: root,
    map: map,
    queue: queue,
    context: context,
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
  net_worth_per_minute: "NetWorthPerMinute",
  boss_damage_per_minute: "BossDamagePerMinute",
  healing_per_minute: "HealingPerMinute"
};

function payloadFor(request, sample, matches, mode) {
  var groups = [
    ["combat", ["kd", "kda"]],
    ["kills", ["average_kills", "average_assists"]],
    ["survival", ["average_deaths", "damage_taken_per_minute"]],
    ["damage", ["player_damage_per_minute", "accuracy", "critical_hit_rate"]],
    ["economy", ["net_worth_per_minute", "boss_damage_per_minute"]],
    ["sustain", ["healing_per_minute"]]
  ];
  var metricSerial = 0;
  matches = matches || 50;
  mode = mode || "ranked";
  return {
    v: 2,
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
          return { id: id, player: metricSerial + 0.25, community: metricSerial + 0.5 };
        })
      };
    })
  };
}
function assertRenderedPayload(map, payload) {
  payload.groups.forEach(function (group) {
    group.metrics.forEach(function (metric) {
      var suffix = metricPanelSuffixes[metric.id];
      assert.equal(map["PSCMetric" + suffix + "Player"].text, String(metric.player), metric.id + " player value");
      assert.equal(map["PSCMetric" + suffix + "Community"].text, String(metric.community), metric.id + " community value");
    });
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

test("mode tabs and match dropdown restart requests with active filters", function () {
  var harness = makeHarness("42");
  var bridge = harness.bridge;
  var standardUrl;
  var hundredUrl;
  var hundredPayload;
  var hundredTitle;
  var hundredFiftyUrl;
  var rankedUrl;
  harness.map.ProfileStatsCommunityButton.events.onactivate();

  harness.map.ProfileStatsCommunityStandard.events.onactivate();
  standardUrl = bridge.urls[bridge.urls.length - 1];
  assert.equal(queryValue(standardUrl, "mode"), "standard");
  assert.equal(queryValue(standardUrl, "matches"), "50");

  harness.map.ProfileStatsCommunityMatchCount.selectedOption = harness.map.ProfileStatsCommunityMatchCount100;
  harness.map.ProfileStatsCommunityMatchCount.events.oninputsubmit();
  hundredUrl = bridge.urls[bridge.urls.length - 1];
  assert.equal(queryValue(hundredUrl, "mode"), "standard");
  assert.equal(queryValue(hundredUrl, "matches"), "100");

  hundredPayload = payloadFor(requestFromUrl(hundredUrl), 100, 100, "standard");
  hundredTitle = "DLSTATS2:" + JSON.stringify(hundredPayload);
  bridge.events.HTMLTitle(bridge, hundredTitle);
  assert.equal(harness.map.ProfileStatsCommunitySample.text, "Standard sample: 100 / 100");
  assert.equal(harness.map.ProfileStatsCommunityStatus.text, "Standard comparison loaded.");

  harness.map.ProfileStatsCommunityMatchCount.selectedOption = harness.map.ProfileStatsCommunityMatchCount150;
  harness.map.ProfileStatsCommunityMatchCount.events.oninputsubmit();
  hundredFiftyUrl = bridge.urls[bridge.urls.length - 1];
  assert.equal(queryValue(hundredFiftyUrl, "mode"), "standard");
  assert.equal(queryValue(hundredFiftyUrl, "matches"), "150");

  harness.map.ProfileStatsCommunityRanked.events.onactivate();
  rankedUrl = bridge.urls[bridge.urls.length - 1];
  assert.equal(queryValue(rankedUrl, "mode"), "ranked");
  assert.equal(queryValue(rankedUrl, "matches"), "150");
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
  assert.equal(harness.queue.length, 1, "one bounded context check is pending");
  harness.queue.shift().callback();
  assert.equal(harness.map.ProfileStatsCommunityPanel.style.visibility, "visible");
  assert.equal(bridge.urls[bridge.urls.length - 1], requestUrl, "selected baseline does not cancel the request");
  harness.stockRows[0].classes = ["heroRow"];
  harness.stockRows[1].classes.push("selected");
  harness.queue.shift().callback();
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

test("supporter ticker loads only in custom mode and unloads on stock restoration or page cancel", function () {
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

  restoreHarness.queue.shift().callback();
  restoreHarness.stockRows[0].classes = ["heroRow"];
  restoreHarness.stockRows[1].classes.push("selected");
  restoreHarness.queue.shift().callback();
  assert.equal(restoreTicker.urls[restoreTicker.urls.length - 1], "about:blank");
  assert.equal(restoreTicker.visible, false);
  assert.equal(restoreTicker.style.visibility, "collapse");

  cancelHarness = makeHarness("42");
  cancelTicker = cancelHarness.map.ProfileStatsCommunitySupporterTicker;
  assert.deepEqual(cancelTicker.urls, ["about:blank"], "ticker does not load before custom mode");
  cancelHarness.map.ProfileStatsCommunityButton.events.onactivate();
  assert.equal(cancelTicker.urls[cancelTicker.urls.length - 1], supporterUrl);
  cancelHarness.root.events.oncancel();
  assert.equal(cancelTicker.urls[cancelTicker.urls.length - 1], "about:blank");
  assert.equal(cancelTicker.visible, false);
  assert.equal(cancelTicker.style.visibility, "collapse");
});

test("runtime rejects oversized hostile titles and page cancel restores stock panels", function () {
  var harness = makeHarness("42");
  var bridge = harness.bridge;
  harness.map.ProfileStatsCommunityButton.events.onactivate();
  bridge.events.HTMLTitle(bridge, "DLSTATS2:" + new Array(2050).join("x"));
  assert.match(harness.map.ProfileStatsCommunityStatus.text, /invalid|response/i);
  assert.equal(harness.map.ProfileStatsCommunityRetry.style.visibility, "visible");
  harness.root.events.oncancel();
  assert.equal(harness.map.StatsTitle.visible, true);
  assert.equal(harness.map.StatsLeft.visible, true);
  assert.equal(harness.map.StatsRight.visible, true);
  assert.equal(harness.map.StatsTitle.style.visibility, undefined);
  assert.equal(harness.map.StatsLeft.style.visibility, undefined);
  assert.equal(harness.map.StatsRight.style.visibility, undefined);
  assert.equal(harness.map.ProfileStatsCommunityPanel.style.visibility, "collapse");
  assert.equal(harness.context.navigatedBack, true, "page cancel navigates back");
  assert.equal(bridge.urls[bridge.urls.length - 1], "about:blank");
});


