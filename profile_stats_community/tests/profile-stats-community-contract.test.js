"use strict";

var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var test = require("node:test");

var moduleRoot = path.resolve(__dirname, "..");
var layout = fs.readFileSync(path.join(moduleRoot, "panorama", "layout", "citadel_db_page_profile.xml"), "utf8");
var script = fs.readFileSync(path.join(moduleRoot, "panorama", "scripts", "profile_stats_community.js"), "utf8");
var styles = fs.readFileSync(path.join(moduleRoot, "panorama", "styles", "profile_stats_community.css"), "utf8");
var packageJson = JSON.parse(fs.readFileSync(path.join(moduleRoot, "package.json"), "utf8"));

function count(source, pattern) {
  var matches = source.match(pattern);
  return matches ? matches.length : 0;
}

function assertWellFormedXml(source) {
  var tokens = source.match(/<!--[\s\S]*?-->|<[^>]*>/g) || [];
  var stack = [];
  var token;
  var opening;
  var closing;
  var index;
  for (index = 0; index < tokens.length; index += 1) {
    token = tokens[index];
    if (token.indexOf("<!--") === 0) {
      continue;
    }
    closing = /^<\s*\/\s*([A-Za-z][\w:.-]*)\s*>$/.exec(token);
    if (closing) {
      if (stack.length === 0 || stack.pop() !== closing[1]) {
        throw new Error("mismatched XML close tag: " + token);
      }
      continue;
    }
    opening = /^<\s*([A-Za-z][\w:.-]*)(?:\s[^>]*)?\/\s*>$/.exec(token);
    if (opening) {
      continue;
    }
    opening = /^<\s*([A-Za-z][\w:.-]*)(?:\s[^>]*)?>$/.exec(token);
    if (opening) {
      stack.push(opening[1]);
      continue;
    }
    throw new Error("invalid XML token: " + token);
  }
  if (stack.length !== 0) {
    throw new Error("unclosed XML tag: " + stack[stack.length - 1]);
  }
}

function directChildIds(source, parentId) {
  var tokens = source.match(/<!--[\s\S]*?-->|<[^>]*>/g) || [];
  var stack = [];
  var children = [];
  var token;
  var opening;
  var closing;
  var idMatch;
  var selfClosing;
  var index;
  for (index = 0; index < tokens.length; index += 1) {
    token = tokens[index];
    if (token.indexOf("<!--") === 0) {
      continue;
    }
    closing = /^<\s*\/\s*([A-Za-z][\w:.-]*)\s*>$/.exec(token);
    if (closing) {
      stack.pop();
      continue;
    }
    opening = /^<\s*([A-Za-z][\w:.-]*)(?:\s[^>]*)?>$/.exec(token);
    if (!opening) {
      continue;
    }
    idMatch = /\bid="([^"]+)"/.exec(token);
    if (stack.length > 0 && stack[stack.length - 1].id === parentId && idMatch) {
      children.push(idMatch[1]);
    }
    selfClosing = /\/\s*>$/.test(token);
    if (!selfClosing) {
      stack.push({ name: opening[1], id: idMatch ? idMatch[1] : "" });
    }
  }
  return children;
}

test("module inventory contains only authored contract files", function () {
  assert.deepEqual(fs.readdirSync(moduleRoot).sort(), ["AGENTS.md", "package.json", "panorama", "tests"]);
  assert.deepEqual(fs.readdirSync(path.join(moduleRoot, "panorama")).sort(), ["layout", "scripts", "styles"]);
  assert.deepEqual(fs.readdirSync(path.join(moduleRoot, "panorama", "layout")), ["citadel_db_page_profile.xml"]);
  assert.deepEqual(fs.readdirSync(path.join(moduleRoot, "panorama", "scripts")), ["profile_stats_community.js"]);
  assert.deepEqual(fs.readdirSync(path.join(moduleRoot, "panorama", "styles")), ["profile_stats_community.css"]);
});

test("layout keeps stock authority and adds only the local bridge surface", function () {
  assert.doesNotThrow(function () { assertWellFormedXml(layout); }, "profile layout must remain well-formed XML");
  assert.deepEqual(directChildIds(layout, "StatsBlock"), ["StatsTitle", "StatsLeft", "StatsRight", "ProfileStatsCommunityPanel"]);
  assert.deepEqual(directChildIds(layout, "HeroList"), []);
  assert.match(layout, /<include src="s2r:\/\/panorama\/styles\/citadel_base_styles\.vcss_c" \/>/);
  assert.match(layout, /<include src="s2r:\/\/panorama\/styles\/citadel_db_page_shared\.vcss_c" \/>/);
  assert.match(layout, /<include src="s2r:\/\/panorama\/styles\/citadel_db_page_profile\.vcss_c" \/>/);
  assert.match(layout, /citadel_db_page_profile\.vcss_c" \/>\s*<include src="s2r:\/\/panorama\/styles\/profile_stats_community\.vcss_c" \/>/);
  assert.match(layout, /<scripts>\s*<include src="s2r:\/\/panorama\/scripts\/profile_stats_community\.vjs_c" \/>\s*<\/scripts>/);
  assert.match(layout, /<CitadelProfilePage class="DashboardPage" oncancel="CitadelNavigateBack\(\);" dashboardclass="isShowingProfilePage">/);
  assert.match(layout, /<AsyncDataPanel class="AsyncContents" state="\{d:player_stats_state\}">/);
  assert.match(layout, /<Label id="ProfileStatsCommunityAccount" text="\{i:r:account_id\}" visible="false" hittest="false" \/>/);
  assert.match(layout, /<Panel id="HeroList"\s*\/>\s*<Button id="ProfileStatsCommunityButton"/);
  assert.doesNotMatch(layout, /<Panel id="HeroList">\s*[\s\S]*ProfileStatsCommunityButton/);
  assert.equal(count(layout, /id="ProfileStatsCommunityButton"/g), 1);
  assert.match(layout, /<CitadelHTMLPanel id="ProfileStatsCommunityBridge"[^>]*visible="false"[^>]*hittest="false"[^>]*acceptsfocus="false"/);
  assert.doesNotMatch(layout, /GetLocalPlayer|local_player|LocalPlayer|FindChildrenWithClassTraverse/);
});

test("support strip keeps live ticker, attribution, and donation contracts", function () {
  var supportChildren = directChildIds(layout, "ProfileStatsCommunityPanel");
  var tickerTag = /<CitadelHTMLPanel\b[^>]*\bid\s*=\s*"ProfileStatsCommunitySupporterTicker"[^>]*>/.exec(layout);
  var poweredByTag = /<Button\b[^>]*\bid\s*=\s*"ProfileStatsCommunityPoweredBy"[^>]*>/.exec(layout);
  var donateTag = /<Button\b[^>]*\bid\s*=\s*"ProfileStatsCommunityDonate"[^>]*>/.exec(layout);
  var tickerUrl = "https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/";
  var requiredIds = [
    "ProfileStatsCommunitySupportBar",
    "ProfileStatsCommunitySupporterTicker",
    "ProfileStatsCommunityPoweredBy",
    "ProfileStatsCommunityDonate"
  ];

  assert.equal(supportChildren[0], "ProfileStatsCommunitySupportBar", "support bar must precede the comparison header");
  requiredIds.forEach(function (id) {
    assert.equal(count(layout, new RegExp('id\\s*=\\s*"' + id + '"', "g")), 1, id + " must be unique");
  });
  assert.ok(tickerTag, "supporter ticker must remain a CitadelHTMLPanel");
  assert.doesNotMatch(tickerTag[0], /\burl\s*=/, "ticker must not load before custom mode");
  assert.match(tickerTag[0], /\bvisible\s*=\s*"false"/);
  assert.match(tickerTag[0], /\bhittest\s*=\s*"false"/);
  assert.match(tickerTag[0], /\bacceptsfocus\s*=\s*"false"/);
  assert.match(script, /SUPPORTER_TICKER_URL\s*=\s*"https:\/\/hantu-raya\.github\.io\/hp-colors-preset-builder\/supporters-strip\/"/);
  assert.match(script, /findPanel\(\s*"ProfileStatsCommunitySupporterTicker"\s*\)/);
  assert.equal(count(script, new RegExp(tickerUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")), 1);

  assert.ok(poweredByTag, "Deadlock API attribution button must remain declared");
  assert.match(poweredByTag[0], /\bonactivate\s*=\s*"[^"]*ExternalBrowserGoToURL[^"]*https:\/\/deadlock-api\.com\/[^"]*"/);
  assert.ok(donateTag, "donation button must remain declared");
  assert.match(donateTag[0], /\bonactivate\s*=\s*"[^"]*ExternalBrowserGoToURL[^"]*https:\/\/ko-fi\.com\/hantuaraya[^"]*"/);
});

test("all six ordered groups and every required comparison row are declared", function () {
  var groups = ["Combat", "Kills", "Survival", "Damage", "Economy", "Sustain"];
  var metrics = [
    "Kd",
    "Kda",
    "AverageKills",
    "AverageAssists",
    "AverageDeaths",
    "DamageTakenPerMinute",
    "PlayerDamagePerMinute",
    "Accuracy",
    "CriticalHitRate",
    "NetWorthPerMinute",
    "BossDamagePerMinute",
    "HealingPerMinute"
  ];
  groups.forEach(function (group) {
    assert.match(layout, new RegExp("ProfileStatsCommunityGroup" + group));
  });
  metrics.forEach(function (metric) {
    assert.match(layout, new RegExp("PSCMetric" + metric + "Player"));
    assert.match(layout, new RegExp("PSCMetric" + metric + "Community"));
    assert.ok(("PSCMetric" + metric + "Player").length <= 44, "player metric panel ID stays within Panorama's runtime limit");
    assert.ok(("PSCMetric" + metric + "Community").length <= 44, "community metric panel ID stays within Panorama's runtime limit");
  });
  assert.match(layout, /PLAYER AVERAGE/);
  assert.match(layout, /COMMUNITY AVERAGE/);
  assert.doesNotMatch(layout, /Back to Hero Stats|ProfileStatsCommunityBack/);
  assert.match(layout, /<TabButton\b[^>]*id="ProfileStatsCommunityRanked"[^>]*text="RANKED"[^>]*selected="true"/);
  assert.match(layout, /<TabButton\b[^>]*id="ProfileStatsCommunityStandard"[^>]*text="STANDARD"/);
  ["50", "100", "150"].forEach(function (matches) {
    assert.match(layout, new RegExp('id="ProfileStatsCommunityMatchCount' + matches + '"[^>]*value="' + matches + '"'));
  });
  assert.match(layout, /id="ProfileStatsCommunitySample"/);
  assert.match(layout, /id="ProfileStatsCommunityGenerated"/);
});

test("filter and metric layout reserve readable scrollbar clearance", function () {
  var matchCountRule = /#ProfileStatsCommunityMatchCount\s*\{([\s\S]*?)\}/.exec(styles);
  var matchCountMenuRule = /#ProfileStatsCommunityMatchCountDropDownMenu\s*\{([\s\S]*?)\}/.exec(styles);
  var headingsRule = /\.ProfileStatsCommunityColumns\s*\{([\s\S]*?)\}/.exec(styles);
  var metricsRule = /#ProfileStatsCommunityMetrics\s*\{([\s\S]*?)\}/.exec(styles);
  var matchCountWidth;
  var matchCountMenuWidth;
  var headingsClearance;
  var metricsClearance;

  assert.ok(matchCountRule, "match-count selector styles must remain declared");
  assert.ok(matchCountMenuRule, "match-count menu styles must remain declared");
  assert.ok(headingsRule, "column heading styles must remain declared");
  assert.ok(metricsRule, "metric scroller styles must remain declared");
  matchCountWidth = /\bwidth\s*:\s*(\d+)px\s*;/.exec(matchCountRule[1]);
  matchCountMenuWidth = /\bwidth\s*:\s*(\d+)px\s*;/.exec(matchCountMenuRule[1]);
  headingsClearance = /\bpadding-right\s*:\s*(\d+)px\s*;/.exec(headingsRule[1]);
  metricsClearance = /\bpadding-right\s*:\s*(\d+)px\s*;/.exec(metricsRule[1]);
  assert.ok(matchCountWidth && Number(matchCountWidth[1]) >= 184, "selector must fit 150 MATCHES");
  assert.ok(matchCountMenuWidth && Number(matchCountMenuWidth[1]) >= 184, "menu must fit 150 MATCHES");
  assert.ok(headingsClearance && Number(headingsClearance[1]) >= 24, "headings must clear the scrollbar");
  assert.ok(metricsClearance && Number(metricsClearance[1]) >= 24, "metric values must clear the scrollbar");
});

test("runtime and stylesheet stay Panorama-safe", function () {
  assert.match(script, /^\(function \(\) \{\s*\n\s*"use strict";/);
  assert.match(script, /BRIDGE_TITLE_PREFIX\s*=\s*"DLSTATS2:"/);
  assert.match(script, /BRIDGE_URL_MAX_LENGTH\s*=\s*4096/);
  assert.match(script, /BRIDGE_FRAGMENT_MAX_LENGTH\s*=\s*4096/);
  assert.match(script, /decodeURIComponent/);
  assert.match(script, /onBridgeTitle\(decodedTitle\)/);
  assert.match(script, /HTMLTitle/);
  assert.match(script, /HTMLURLChanged/);
  assert.match(script, /\$\.RegisterEventHandler\(eventName,\s*panel,\s*handler\)/);
  assert.match(script, /BRIDGE_TITLE_MAX_LENGTH\s*=\s*2048/);
  assert.match(script, /"&mode="\s*\+\s*encodeURIComponent\(request\.mode\)/);
  assert.match(script, /about:blank/);
  assert.match(script, /GetChildCount\(\)/);
  assert.match(script, /MAX_HERO_ROWS\s*=\s*64/);
  assert.doesNotMatch(script, /FindChildrenWithClassTraverse|GetLocalPlayer|GameUI\.GetLocalPlayer|document\.|window\./);
  assert.match(script, /\[ProfileStatsCommunity\]/);
  assert.match(script, /BHasKeyFocus/);
  assert.match(script, /BHasDescendantKeyFocus/);
  assert.match(script, /statSectionName/);
  assert.doesNotMatch(script, /\.HasFocus\(/);
  [
    "kd", "kda", "average_kills", "average_assists", "average_deaths",
    "damage_taken_per_minute", "player_damage_per_minute", "accuracy",
    "critical_hit_rate", "net_worth_per_minute", "boss_damage_per_minute",
    "healing_per_minute", "invalid_query", "network_error", "upstream_error",
    "rate_limit", "empty_sample", "invalid_payload", "payload_too_large", "internal_error",
    "ranked", "standard", "50", "100", "150"
  ].forEach(function (key) {
    assert.match(script, new RegExp('"' + key + '"\\s*:'), key + " must remain quoted for Closure dynamic lookup");
  });
  assert.doesNotMatch(script, /stockVisibility|readStyle/);
  assert.doesNotMatch(script, /setVisibility\(stock(?:Title|Left|Right)/);
  assert.match(styles, /#ProfileStatsCommunityPanel\s*\{[\s\S]*?ignore-parent-flow\s*:\s*true;[\s\S]*?width\s*:\s*100%;[\s\S]*?height\s*:\s*100%;[\s\S]*?background-color\s*:\s*offBlack;/);
  assert.match(styles, /#ProfileStatsCommunityBridge\s*\{[\s\S]*?width\s*:\s*260px;[\s\S]*?height\s*:\s*30px;[\s\S]*?horizontal-align\s*:\s*right;[\s\S]*?background-color\s*:\s*offBlack;/);
  assert.doesNotMatch(styles, /#ProfileStatsCommunityBridge\s*\{[\s\S]*?opacity\s*:/);
  assert.doesNotMatch(styles, /#ProfileStatsCommunityBack/);
  assert.match(styles, /\.ProfileStatsCommunityModeTab:selected/);
  assert.match(styles, /#ProfileStatsCommunityMatchCount/);
  assert.doesNotMatch(styles, /display\s*:\s*flex|position\s*:\s*(absolute|fixed)|font-family\s*:/);
  assert.doesNotMatch(styles, /\bhittest\s*:|\bacceptsfocus\s*:/);
});

test("package exposes focused dependency-free validation", function () {
  assert.equal(packageJson.name, "profile-stats-community");
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.scripts.test, "node --test tests/*.test.js");
  assert.match(packageJson.scripts.validate, /node --check panorama\/scripts\/profile_stats_community\.js/);
});
