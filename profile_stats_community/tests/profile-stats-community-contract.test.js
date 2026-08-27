"use strict";

var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var test = require("node:test");

var moduleRoot = path.resolve(__dirname, "..");
var repositoryRoot = path.resolve(moduleRoot, "..");
var composition = require(path.join(repositoryRoot, "scripts", "profile-stats-community-composition"));
var composedSources = composition.composeProfileStatsCommunitySources(repositoryRoot);
var layout = fs.readFileSync(path.join(moduleRoot, "panorama", "layout", "citadel_db_page_profile.xml"), "utf8");
var contextMenuLayout = fs.readFileSync(path.join(moduleRoot, "panorama", "layout", "citadel_ui_context_menu_player.xml"), "utf8");
var profileCardLayout = fs.readFileSync(path.join(moduleRoot, "panorama", "layout", "profile_card.xml"), "utf8");
var scriptTemplate = fs.readFileSync(path.join(moduleRoot, "panorama", "scripts", "profile_stats_community.js"), "utf8");
var contextMenuScriptTemplate = fs.readFileSync(path.join(moduleRoot, "panorama", "scripts", "profile_stats_community_context_menu.js"), "utf8");
var script = composedSources.runtime;
var contextMenuScript = composedSources.contextRuntime;
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
  assert.deepEqual(fs.readdirSync(moduleRoot).sort(), ["AGENTS.md", "oxlint.config.mjs", "package.json", "panorama", "tests"]);
  assert.deepEqual(fs.readdirSync(path.join(moduleRoot, "panorama")).sort(), ["layout", "scripts", "styles"]);
  assert.deepEqual(fs.readdirSync(path.join(moduleRoot, "panorama", "layout")).sort(), ["citadel_db_page_profile.xml", "citadel_ui_context_menu_player.xml", "profile_card.xml"]);
  assert.deepEqual(fs.readdirSync(path.join(moduleRoot, "panorama", "scripts")).sort(), ["profile_stats_community.js", "profile_stats_community_context_menu.js"]);
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
  assert.doesNotMatch(script, /setPanelEvent\(\s*root\s*,\s*"oncancel"/, "runtime must not replace the stock XML cancel path");
  assert.doesNotMatch(script, /CitadelNavigateBack/, "native profile navigation must stay in XML");
});

test("player context menu opens the selected account in the profile database", function () {
  assert.doesNotThrow(function () { assertWellFormedXml(contextMenuLayout); }, "player context menu must remain well-formed XML");
  assert.doesNotThrow(function () { assertWellFormedXml(profileCardLayout); }, "profile card must remain well-formed XML");
  assert.match(contextMenuLayout, /<scripts>\s*<include src="s2r:\/\/panorama\/scripts\/profile_stats_community_context_menu\.vjs_c" \/>\s*<\/scripts>/);
  assert.match(contextMenuLayout, /<Panel id="MenuOptionsPanel" \/>\s*<Panel id="ProfileStatsCommunityPlayerProfileRow" class="MenuRow">/);
  assert.match(contextMenuLayout, /text="Player Profile" onactivate="\$\.ProfileStatsCommunityOpenPlayerProfile\(\);" \/>/);
  assert.equal(count(contextMenuLayout, /id="ProfileStatsCommunityPlayerProfileRow"/g), 1);
  assert.doesNotMatch(contextMenuLayout, /<Panel id="MenuOptionsPanel">\s*[\s\S]*ProfileStatsCommunityPlayerProfileRow/);
  assert.doesNotMatch(profileCardLayout, /profile_stats_community_context_menu\.vjs_c/);
  assert.match(profileCardLayout, /<Label id="ProfileStatsCommunityContextAccount" text="\{i:r:account_id\}" visible="false" hittest="false" \/>/);
  assert.match(contextMenuScript, /\$\.ProfileStatsCommunityOpenPlayerProfile\s*=/);
  assert.match(contextMenuScript, /\$\.DispatchEvent\("CitadelShowProfilePageForAccount", account\)/);
  assert.equal(count(contextMenuScript, /CitadelShowProfilePageForAccount/g), 1, "profile navigation has one event-dispatch path and no fallback");
  assert.doesNotMatch(contextMenuScript, /PSC-PROFILE-DEBUG|\$\.Msg|function debug|errorMessage/);
  assert.doesNotMatch(contextMenuScript, /GetLocalPlayer|local_player|LocalPlayer/);
});

test("player context menu restores the engine-owned favorite hero and totals row", function () {
  var restoredRule = /CitadelContextMenuPlayer\s+CitadelProfileCard\.StatsActive:not\(\.ShowPartyInfo\)\s+#CardMain\s*\{([\s\S]*?)\}/.exec(styles);

  assert.match(profileCardLayout, /profile_card\.vcss_c" \/>\s*<include src="s2r:\/\/panorama\/styles\/profile_stats_community\.vcss_c" \/>/);
  assert.equal(count(profileCardLayout, /id="ShowcaseItems"/g), 1, "favorite hero remains engine populated");
  assert.equal(count(profileCardLayout, /id="StatItems"/g), 1, "match and kill totals remain engine populated");
  assert.doesNotMatch(profileCardLayout, /FAVORITE HERO|MATCHES|KILLS/i, "profile values and labels must not be fabricated in XML");
  assert.ok(restoredRule, "profile statistics are restored only for populated player context-menu cards");
  assert.match(restoredRule[1], /\bvisibility\s*:\s*visible\s*;/);
  assert.equal(count(styles, /#CardMain/g), 1, "the custom stylesheet has one narrowly scoped profile-card override");
  assert.doesNotMatch(contextMenuScript, /\$\.Schedule|SetURL|CitadelHTMLPanel|AsyncWebRequest|XMLHttpRequest/);
});

test("community navigation keeps the hero-list alignment contract", function () {
  var button = /<Button\b[^>]*\bid\s*=\s*"ProfileStatsCommunityButton"[^>]*>([\s\S]*?)<\/Button>/.exec(layout);
  var buttonRule = /#ProfileStatsCommunityButton\s*\{([\s\S]*?)\}/.exec(styles);
  var buttonLabelRule = /#ProfileStatsCommunityButton\s+Label\s*\{([\s\S]*?)\}/.exec(styles);

  assert.ok(button, "community navigation button must remain declared");
  assert.equal(count(button[1], /<Label\b/g), 1, "community navigation button must have one label");
  assert.match(button[1], /<Label\b[^>]*\btext\s*=\s*"VS COMMUNITY"[^>]*\/>/);
  assert.ok(buttonRule, "community navigation button styles must remain declared");
  assert.ok(buttonLabelRule, "community navigation label styles must remain declared");
  assert.match(buttonRule[1], /\bignore-parent-flow\s*:\s*true\s*;/);
  assert.match(buttonRule[1], /\bpadding\s*:\s*0px\s+24px\s*;/);
  assert.match(buttonLabelRule[1], /\bmargin-left\s*:\s*10px\s*;/);
});

test("statistics lead the minimal support footer and metadata", function () {
  var panelChildren = directChildIds(layout, "ProfileStatsCommunityPanel");
  var supportBarChildren = directChildIds(layout, "ProfileStatsCommunitySupportBar");
  var metadataChildren = directChildIds(layout, "ProfileStatsCommunityMetadata");
  var tickerTag = /<CitadelHTMLPanel\b[^>]*\bid\s*=\s*"ProfileStatsCommunitySupporterTicker"[^>]*>/.exec(layout);
  var poweredByTag = /<Button\b[^>]*\bid\s*=\s*"ProfileStatsCommunityPoweredBy"[^>]*>/.exec(layout);
  var donateTag = /<Button\b[^>]*\bid\s*=\s*"ProfileStatsCommunityDonate"[^>]*>/.exec(layout);
  var poweredByUrl;
  var donateUrl;
  var tickerUrl = "https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/";
  var supportBarRule = /#ProfileStatsCommunitySupportBar\s*\{([\s\S]*?)\}/.exec(styles);
  var tickerRule = /#ProfileStatsCommunitySupporterTicker\s*\{([\s\S]*?)\}/.exec(styles);
  var donateRule = /\.ProfileStatsCommunityDonateButton\s*\{([\s\S]*?)\}/.exec(styles);
  var donateLabelRule = /\.ProfileStatsCommunityDonateButton\s+Label\s*\{([\s\S]*?)\}/.exec(styles);
  var donateStateRule = /\.ProfileStatsCommunityDonateButton:hover\s*,\s*\.ProfileStatsCommunityDonateButton:focus\s*\{([\s\S]*?)\}/.exec(styles);
  var donateStateLabelRule = /\.ProfileStatsCommunityDonateButton:hover\s+Label\s*,\s*\.ProfileStatsCommunityDonateButton:focus\s+Label\s*\{([\s\S]*?)\}/.exec(styles);
  var metadataRule = /\.ProfileStatsCommunityMetadata\s*\{([\s\S]*?)\}/.exec(styles);
  var metadataTextRule = /\.ProfileStatsCommunityMetadataText\s*\{([\s\S]*?)\}/.exec(styles);
  var poweredByRule = /\.ProfileStatsCommunityPoweredByLink\s*\{([\s\S]*?)\}/.exec(styles);
  var poweredByStateRule = /\.ProfileStatsCommunityPoweredByLink:hover\s*,\s*\.ProfileStatsCommunityPoweredByLink:focus\s*\{([\s\S]*?)\}/.exec(styles);
  var poweredByStateLabelRule = /\.ProfileStatsCommunityPoweredByLink:hover\s+Label\s*,\s*\.ProfileStatsCommunityPoweredByLink:focus\s+Label\s*\{([\s\S]*?)\}/.exec(styles);
  var metricsIndex = panelChildren.indexOf("ProfileStatsCommunityMetrics");
  var metadataIndex = panelChildren.indexOf("ProfileStatsCommunityMetadata");
  var supportIndex = panelChildren.indexOf("ProfileStatsCommunitySupportBar");
  var requiredIds = [
    "ProfileStatsCommunitySupportBar",
    "ProfileStatsCommunitySupporterTicker",
    "ProfileStatsCommunityPoweredBy",
    "ProfileStatsCommunityDonate"
  ];

  assert.ok(metricsIndex >= 0 && metricsIndex < metadataIndex, "statistics must precede footer metadata");
  assert.equal(supportIndex, metadataIndex + 1, "support strip must sit below metadata at the panel bottom");
  assert.deepEqual(supportBarChildren, ["ProfileStatsCommunitySupporterTicker", "ProfileStatsCommunityDonate"]);
  assert.deepEqual(metadataChildren, ["ProfileStatsCommunitySample", "ProfileStatsCommunityGenerated", "ProfileStatsCommunityPoweredBy"]);
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

  assert.ok(poweredByTag, "Deadlock API attribution link must remain declared");
  assert.match(poweredByTag[0], /\bclass\s*=\s*"ProfileStatsCommunityPoweredByLink"/);
  assert.ok(donateTag, "donation button must remain declared");
  poweredByUrl = /ExternalBrowserGoToURL&apos;\s*,\s*&apos;([^&]+)&apos;/.exec(poweredByTag[0]);
  donateUrl = /ExternalBrowserGoToURL&apos;\s*,\s*&apos;([^&]+)&apos;/.exec(donateTag[0]);
  assert.ok(poweredByUrl, "Deadlock API attribution must open an external URL");
  assert.ok(donateUrl, "donation button must open an external URL");
  assert.equal(poweredByUrl[1], "https://deadlock-api.com/");
  assert.equal(donateUrl[1], "https://ko-fi.com/hantuaraya");

  assert.ok(supportBarRule, "minimal support strip styles must remain declared");
  assert.match(supportBarRule[1], /\bheight\s*:\s*28px\s*;/);
  assert.match(supportBarRule[1], /\bpadding\s*:\s*1px\s+0px\s*;/);
  assert.match(supportBarRule[1], /\bbackground-color\s*:\s*offBlack\s*;/i);
  assert.match(supportBarRule[1], /\bopacity\s*:\s*0\.55\s*;/);
  assert.doesNotMatch(supportBarRule[1], /\bborder\s*:/, "support strip must not compete with statistics");
  assert.match(supportBarRule[1], /\boverflow\s*:\s*clip\s*;/);
  assert.ok(tickerRule, "supporter ticker styles must remain declared");
  assert.match(tickerRule[1], /\bwidth\s*:\s*fill-parent-flow\(\s*1\s*\)\s*;/);
  assert.match(tickerRule[1], /\bheight\s*:\s*26px\s*;/);
  assert.match(tickerRule[1], /\bmargin-right\s*:\s*8px\s*;/);
  assert.match(tickerRule[1], /\bbackground-color\s*:\s*offBlack\s*;/i);
  assert.match(tickerRule[1], /\bbrightness\s*:\s*0\.72\s*;/);
  assert.match(tickerRule[1], /\boverflow\s*:\s*clip\s*;/);

  assert.ok(donateRule, "donation button styles must remain declared");
  assert.match(donateRule[1], /\bwidth\s*:\s*72px\s*;/);
  assert.match(donateRule[1], /\bheight\s*:\s*26px\s*;/);
  assert.match(donateRule[1], /\bpadding\s*:\s*0px\s+8px\s*;/);
  assert.match(donateRule[1], /\bbackground-color\s*:\s*offWhite&03\s*;/i);
  assert.match(donateRule[1], /\bborder\s*:\s*1px\s+solid\s+#9d824044\s*;/i);
  assert.ok(donateLabelRule, "donation label styles must remain declared");
  assert.match(donateLabelRule[1], /\bcolor\s*:\s*#bda66a\s*;/i);
  assert.ok(donateStateRule, "donation hover and focus styles must remain paired");
  assert.match(donateStateRule[1], /\bbackground-color\s*:\s*#51432066\s*;/i);
  assert.match(donateStateRule[1], /\bborder\s*:\s*1px\s+solid\s+#9d824088\s*;/i);
  assert.ok(donateStateLabelRule, "donation hover and focus label styles must remain paired");
  assert.match(donateStateLabelRule[1], /\bcolor\s*:\s*#e9d799\s*;/i);

  assert.ok(metadataRule, "metadata footer styles must remain declared");
  assert.match(metadataRule[1], /\bheight\s*:\s*24px\s*;/);
  assert.match(metadataRule[1], /\bmargin-top\s*:\s*4px\s*;/);
  assert.doesNotMatch(metadataRule[1], /\bpadding(?:-[a-z]+)?\s*:/, "metadata footer must not consume horizontal flow width");
  assert.ok(metadataTextRule, "metadata flow styles must remain declared");
  assert.match(metadataTextRule[1], /\bwidth\s*:\s*fill-parent-flow\(\s*1\s*\)\s*;/);
  assert.doesNotMatch(metadataTextRule[1], /\bwidth\s*:\s*50%\s*;/);

  assert.ok(poweredByRule, "text attribution styles must remain declared");
  assert.match(poweredByRule[1], /\bwidth\s*:\s*190px\s*;/);
  assert.match(poweredByRule[1], /\bheight\s*:\s*24px\s*;/);
  assert.match(poweredByRule[1], /\bopacity\s*:\s*0\.55\s*;/);
  assert.doesNotMatch(poweredByRule[1], /\bbackground-color\s*:/, "attribution must render as text, not a button");
  assert.doesNotMatch(poweredByRule[1], /\bborder\s*:/, "attribution must render as text, not a button");
  assert.doesNotMatch(poweredByRule[1], /\bbox-shadow\s*:/, "attribution must not glow");
  assert.ok(poweredByStateRule, "attribution hover and focus styles must remain paired");
  assert.match(poweredByStateRule[1], /\bopacity\s*:\s*1\s*;/);
  assert.ok(poweredByStateLabelRule, "attribution hover and focus label styles must remain paired");
  assert.match(poweredByStateLabelRule[1], /\bcolor\s*:\s*#c77782\s*;/i);
});

test("all six ordered groups and every required comparison row are declared", function () {
  var groups = ["Performance", "Scoreboard", "AccuracyKd", "Damage", "Economy", "Healing"];
  var metrics = [
    "Kda",
    "KillsPlusAssists",
    "PlayerDamagePerHealth",
    "AverageKills",
    "AverageDeaths",
    "AverageAssists",
    "Accuracy",
    "CriticalHitRate",
    "Kd",
    "PlayerDamagePerMinute",
    "DamageTakenPerMinute",
    "ObjectiveDamagePerMinute",
    "NetWorthPerMinute",
    "AverageLastHits",
    "AverageDenies",
    "SelfHealingPerMinute",
    "PlayerHealingPerMinute",
    "HealPrevented"
  ];
  groups.forEach(function (group) {
    assert.match(layout, new RegExp("ProfileStatsCommunityGroup" + group));
    assert.match(layout, new RegExp('id="PSCGroup' + group + 'Percentile"'));
  });
  metrics.forEach(function (metric) {
    assert.match(layout, new RegExp("PSCMetric" + metric + "Player"));
    assert.match(layout, new RegExp("PSCMetric" + metric + "Community"));
    assert.match(layout, new RegExp('id="PSCMetric' + metric + 'Percentile"'));
    assert.ok(("PSCMetric" + metric + "Player").length <= 44, "player metric panel ID stays within Panorama's runtime limit");
    assert.ok(("PSCMetric" + metric + "Community").length <= 44, "community metric panel ID stays within Panorama's runtime limit");
    assert.ok(("PSCMetric" + metric + "Percentile").length <= 44, "percentile metric panel ID stays within Panorama's runtime limit");
  });
  assert.match(layout, /id="ProfileStatsCommunityGroupDamage"[\s\S]*PSCMetricObjectiveDamagePerMinutePlayer/);
  assert.doesNotMatch(layout, /id="ProfileStatsCommunityGroupEconomy"[\s\S]*PSCMetricObjectiveDamagePerMinutePlayer/);
  assert.equal(count(layout, /text="AVG PERCENTILE"/g), 6);
  assert.equal(count(layout, /class="ProfileStatsCommunityPercentileHeading"/g), 2);
  assert.match(layout, /id="ProfileStatsCommunityTitle"[^>]*text="PLAYER VS COMMUNITY"/);
  assert.match(layout, /id="ProfileStatsCommunityPlayerHeadingLeft"[^>]*text="PLAYER"/);
  assert.match(layout, /id="ProfileStatsCommunityPlayerHeadingRight"[^>]*text="PLAYER"/);
  assert.equal(count(layout, /text="COMMUNITY"/g), 2);
  assert.match(layout, /<Panel id="ProfileStatsCommunityDisplayToggle" class="ProfileStatsCommunityDisplayToggle">/);
  assert.match(layout, /<TabButton\b[^>]*id="ProfileStatsCommunityDisplayCommunity"[^>]*text="AVG"/);
  assert.match(layout, /<TabButton\b[^>]*id="ProfileStatsCommunityDisplayPercentile"[^>]*text="PERCENTILE"[^>]*selected="true"/);
  assert.match(layout, /id="PSCMetricKdaCommunity"[^>]*visibility="collapse"/);
  assert.match(layout, /id="PSCMetricKdaPercentile"[^>]*class="ProfileStatsCommunityPercentileBadge/);
  assert.match(layout, /<Button\b[^>]*id="ProfileStatsCommunityStatLocker"[^>]*>\s*<Label text="STATLOCKER PROFILE" \/><\/Button>/);
  assert.match(script, /STATLOCKER_PROFILE_URL_PREFIX\s*=\s*"https:\/\/statlocker\.gg\/profile\/"/);
  assert.match(script, /STATLOCKER_PROFILE_URL_SUFFIX\s*=\s*"\/matches"/);
  assert.match(script, /METRIC_REGISTRY/);
  assert.match(script, /includeInGroupAverage/);
  assert.match(script, /higher_lower/);
  assert.doesNotMatch(layout, /Back to Hero Stats|ProfileStatsCommunityBack|OverallPercentile|GlobalPercentile/);
  assert.match(layout, /<TabButton\b[^>]*id="ProfileStatsCommunityRanked"[^>]*text="RANKED"[^>]*selected="true"/);
  assert.match(layout, /<TabButton\b[^>]*id="ProfileStatsCommunityStandard"[^>]*text="STANDARD"/);
  ["50", "100", "150"].forEach(function (matches) {
    assert.match(layout, new RegExp('id="ProfileStatsCommunityMatchCount' + matches + '"[^>]*value="' + matches + '"'));
  });
  assert.match(layout, /id="ProfileStatsCommunitySample"/);
  assert.match(layout, /id="ProfileStatsCommunityGenerated"/);
  assert.equal(groups.length, 6);
});

test("filter and metric layout form a compact non-scrollable grid", function () {
  var matchCountRule = /#ProfileStatsCommunityMatchCount\s*\{([\s\S]*?)\}/.exec(styles);
  var matchCountMenuRule = /#ProfileStatsCommunityMatchCountDropDownMenu\s*\{([\s\S]*?)\}/.exec(styles);
  var metricsRule = /#ProfileStatsCommunityMetrics\s*\{([\s\S]*?)\}/.exec(styles);
  var gridRowRule = /\.ProfileStatsCommunityGridRow\s*\{([\s\S]*?)\}/.exec(styles);
  var gridGapRule = /\.ProfileStatsCommunityGridGap\s*\{([\s\S]*?)\}/.exec(styles);
  var metricRowRule = /\.ProfileStatsCommunityMetricRow\s*\{([\s\S]*?)\}/.exec(styles);
  var percentileHeadingRule = /\.ProfileStatsCommunityPercentileHeading\s*\{([\s\S]*?)\}/.exec(styles);
  var percentileBadgeRule = /\.ProfileStatsCommunityPercentileBadge\s*\{([\s\S]*?)\}/.exec(styles);
  var groupBadgeRule = /\.ProfileStatsCommunityGroupBadge\s*\{([\s\S]*?)\}/.exec(styles);
  var displayToggleRule = /\.ProfileStatsCommunityDisplayToggle\s*\{([\s\S]*?)\}/.exec(styles);
  var displayTabRule = /\.ProfileStatsCommunityDisplayTab\s*\{([\s\S]*?)\}/.exec(styles);
  var matchCountWidth;
  var matchCountMenuWidth;
  var metricRowHeight;

  assert.ok(matchCountRule, "match-count selector styles must remain declared");
  assert.ok(matchCountMenuRule, "match-count menu styles must remain declared");
  assert.ok(metricsRule, "metric grid styles must remain declared");
  assert.ok(gridRowRule, "metric grid rows must remain declared");
  assert.ok(gridGapRule, "metric grid gap must remain declared");
  assert.ok(metricRowRule, "compact metric rows must remain declared");
  matchCountWidth = /\bwidth\s*:\s*(\d+)px\s*;/.exec(matchCountRule[1]);
  matchCountMenuWidth = /\bwidth\s*:\s*(\d+)px\s*;/.exec(matchCountMenuRule[1]);
  metricRowHeight = /\bheight\s*:\s*(\d+)px\s*;/.exec(metricRowRule[1]);
  assert.equal(Number(matchCountWidth[1]), 184, "selector must retain the 184px contract");
  assert.equal(Number(matchCountMenuWidth[1]), 184, "menu must retain the 184px contract");
  assert.deepEqual(directChildIds(layout, "ProfileStatsCommunityMetrics"), [
    "ProfileStatsCommunityGridPerformanceScoreboard",
    "ProfileStatsCommunityGridAccuracyKdDamage",
    "ProfileStatsCommunityGridEconomyHealing"
  ]);
  assert.match(metricsRule[1], /\bflow-children\s*:\s*down\s*;/);
  assert.match(metricsRule[1], /\bheight\s*:\s*fill-parent-flow\(\s*1\s*\)\s*;/);
  assert.match(metricsRule[1], /\boverflow\s*:\s*clip\s*;/);
  assert.doesNotMatch(metricsRule[1], /\bscroll\b/);
  assert.match(gridRowRule[1], /\bwidth\s*:\s*100%\s*;/);
  assert.match(gridRowRule[1], /\bheight\s*:\s*fill-parent-flow\(\s*1\s*\)\s*;/);
  assert.match(gridRowRule[1], /\bflow-children\s*:\s*right\s*;/);
  assert.match(gridGapRule[1], /\bwidth\s*:\s*24px\s*;/);
  assert.ok(metricRowHeight && Number(metricRowHeight[1]) <= 24, "metric rows must fit the fixed comparison grid");
  assert.ok(percentileHeadingRule, "percentile column heading styles must remain declared");
  assert.ok(percentileBadgeRule, "metric percentile badge styles must remain declared");
  assert.ok(displayToggleRule, "comparison display toggle styles must remain declared");
  assert.ok(displayTabRule, "comparison display tab styles must remain declared");
  assert.match(displayToggleRule[1], /\bheight\s*:\s*42px\s*;/);
  assert.match(displayTabRule[1], /\bheight\s*:\s*40px\s*;/);
  assert.match(percentileHeadingRule[1], /\bwidth\s*:\s*92px\s*;/);
  assert.match(script, /payload\.v !== 4/);
  assert.match(script, /&protocol=4/);
  assert.match(script, /metric\[3\]/);
  assert.match(script, /formatPercentile/);
  assert.match(script, /averagePercentile/);
  assert.match(percentileBadgeRule[1], /\bwidth\s*:\s*92px\s*;/);
  assert.ok(groupBadgeRule, "group percentile badge styles must remain declared");
  assert.match(groupBadgeRule[1], /\bwidth\s*:\s*92px\s*;/);
  assert.match(styles, /\.ProfileStatsCommunityPercentileTop\s*\{/);
  assert.match(styles, /\.ProfileStatsCommunityPercentileBottom\s*\{/);
  assert.match(styles, /\.ProfileStatsCommunityPercentileUnavailable\s*\{/);
});

test("one private identity policy is composed into both runtime adapters", function () {
  assert.equal(count(scriptTemplate, /VIEWED_PROFILE_IDENTITY_POLICY:/g), 1);
  assert.equal(count(contextMenuScriptTemplate, /VIEWED_PROFILE_IDENTITY_POLICY:/g), 1);
  assert.equal(count(script, /var viewedProfileIdentityPolicy/g), 1);
  assert.equal(count(contextMenuScript, /var viewedProfileIdentityPolicy/g), 1);
  assert.doesNotMatch(script, /VIEWED_PROFILE_IDENTITY_POLICY:/);
  assert.doesNotMatch(contextMenuScript, /VIEWED_PROFILE_IDENTITY_POLICY:/);
  assert.match(script, /viewedProfileIdentityPolicy\.resolve/);
  assert.match(contextMenuScript, /viewedProfileIdentityPolicy\.resolve/);
  assert.doesNotMatch(composedSources.identityPolicy, /PlayerName|HeroName|SelfName|topbar/i,
    "names and Passive top-bar evidence are outside the identity policy interface");
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
  [
    "kda", "kills_plus_assists", "player_damage_per_health",
    "average_kills", "average_deaths", "average_assists",
    "accuracy", "critical_hit_rate", "kd",
    "player_damage_per_minute", "damage_taken_per_minute", "objective_damage_per_minute",
    "net_worth_per_minute", "average_last_hits", "average_denies",
    "self_healing_per_minute", "player_healing_per_minute", "heal_prevented",
    "invalid_query", "network_error", "upstream_error",
    "rate_limit", "empty_sample", "invalid_payload", "payload_too_large", "internal_error",
    "ranked", "standard", "community", "percentile"
  ].forEach(function (key) {
    assert.match(script, new RegExp('"' + key + '"\\s*:'), key + " must remain quoted for Closure dynamic lookup");
  });
  [
    "performance", "scoreboard", "accuracy_kd", "damage", "economy", "healing"
  ].forEach(function (key) {
    assert.match(script, new RegExp('"id"\\s*:\\s*"' + key + '"'), key + " must remain quoted in the v4 group registry");
  });
  assert.doesNotMatch(script, /stockVisibility|readStyle/);
  assert.doesNotMatch(script, /setVisibility\(stock(?:Title|Left|Right)/);
  assert.match(styles, /#ProfileStatsCommunityPanel\s*\{[\s\S]*?ignore-parent-flow\s*:\s*true;[\s\S]*?width\s*:\s*100%;[\s\S]*?height\s*:\s*100%;[\s\S]*?overflow\s*:\s*clip;[\s\S]*?background-color\s*:\s*offBlack;/);
  assert.match(styles, /CitadelProfilePage #HeroList\s*\{[\s\S]*?padding-top\s*:\s*56px;/);
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
  assert.match(packageJson.scripts.lint, /^npx --yes oxlint@1\.79\.0 .*oxlint\.config\.mjs.*profile_stats_community\.js/);
  assert.match(packageJson.scripts.validate, /npm run lint/);
  assert.equal(packageJson.devDependencies, undefined);
});
