"use strict";
// Mocked HUD (kill feed, top bar, damage report) that boots the real feeder_feed.js in a VM.
// Shared by validate-feeder-feed.js and measure-feeder-feed.js.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// FEEDER_FEED_SOURCE runs every scenario against another copy of the script (the build's
// Closure output, or a pre-refactor tree for old-vs-new comparisons).
const SOURCE = process.env.FEEDER_FEED_SOURCE || path.join(__dirname, "..", "panorama", "scripts", "feeder_feed.js");

// stats: per-hero top-bar text overrides, e.g. { VENATOR: { souls: "9,000", kills: "3" } }.
// onNative(name): called for every $ API call (the measure script counts them).
// runs: every setup() of this process, so artifacts can record all observed output.
const F = { stats: {}, onNative: null, runs: [] };

class Panel {
  constructor(type, id = "", classes = [], kids = [], extra = {}) {
    Object.assign(this, { paneltype: type, id, _cls: new Set(classes), _kids: [], _parent: null, _attr: {},
      _vars: {}, _events: {}, _valid: true, style: {}, visible: true }, extra);
    kids.forEach((k) => this.add(k));
  }
  add(kid) { kid._parent = this; this._kids.push(kid); return kid; }
  IsValid() { return this._valid; }
  GetParent() { return this._parent; }
  GetChildCount() { return this._kids.length; }
  GetChild(i) { return this._kids[i] || null; }
  BHasClass(c) { return this._cls.has(c); }
  SetHasClass(c, on) { if (on) this._cls.add(c); else this._cls.delete(c); }
  GetAttributeString(k, d) { return k in this._attr ? this._attr[k] : d; }
  SetAttributeString(k, v) { this._attr[k] = v; }
  GetAttributeInt(k, d) { return k in this._attr ? this._attr[k] : d; }
  SetAttributeInt(k, v) { this._attr[k] = v; }
  SetDialogVariable(k, v) { this._vars[k] = v; }
  SetPanelEvent(name, fn) { this._events[name] = fn; }
  SetHeroID(id) { this.heroId = id; }
  DeleteAsync() { this._valid = false; }
  FindChildTraverse(id) {
    for (const k of this._kids) { if (k.id === id) return k; const r = k.FindChildTraverse(id); if (r) return r; }
    return null;
  }
  FindChildrenWithClassTraverse(c) {
    const out = [];
    const walk = (n) => n._kids.forEach((k) => { if (k._cls.has(c)) out.push(k); walk(k); });
    walk(this);
    return out;
  }
  BLoadLayoutSnippet(name) {
    if (name !== "FeederRow") return false;
    this._cls.add("FeederRow");
    this.add(new Panel("Panel", "", ["FeederIcon"], [new Panel("CitadelHeroImage", "HeroImage")]));
    const chips = ["ChipDeaths", "ChipKills", "ChipAssists", "ChipShares", "ChipBags"].map((id) => new Panel("Label", id, ["FeederChip"], [], { text: "" }));
    this.add(new Panel("Panel", "", ["FeederBarArea"], [new Panel("Panel", "", ["FeederBarStack"], [
      new Panel("Panel", "", ["FeederBarTrack"], [
        new Panel("Panel", "FeederBarDeath", ["FeederBar"]), new Panel("Panel", "FeederBarBag", ["FeederBar"])]),
      new Panel("Panel", "", ["FeederBarInner"], chips)])]));
    return true;
  }
}
const label = (cls, text) => new Panel("Label", "", cls, [], { text });

function topbarRow(player, hero, heroid) {
  const s = F.stats[hero] || {};
  return new Panel("CitadelHudTopBarPlayer", "", [], [
    new Panel("CitadelHeroBadge", "HeroBadge", [], [], { heroid }),
    new Panel("Panel", "HeroContents", [], [new Panel("Label", "SoulsValue", ["SoulsValue"], [], { text: s.souls === undefined ? "0" : s.souls })]),
    new Panel("Panel", "PlayerNameNWContainer", [], [label(["PlayerName"], player), label(["HeroName"], hero),
      new Panel("Panel", "KDAContainer", [], [label(["PlayerStat", "kills"], s.kills || "0"), label(["PlayerStat", "assists"], "0")])])]);
}

// heroIds: name each assister portrait "PlayerAssist<heroId>" as the client does. Hero portraits
// carry no readable hero id: CitadelHeroImage registers only the SetHeroID method for JS (client
// 6759 rva 1cfab80), so the mock exposes no heroid property either.
function entry(killer, killerSide, victim, victimSide, souls, cls, assists = 0, heroIds = null) {
  const assisters = Array.from({ length: assists }, (_, i) =>
    new Panel("CitadelHeroImage", heroIds ? "PlayerAssist" + heroIds[i] : "", ["assister"]));
  return new Panel("CitadelHudInfoFeed", "", cls, [new Panel("Panel", "TextContainer", [], [
    new Panel("Panel", "KillerContainer", ["killerContainer", killerSide].filter(Boolean), [
      new Panel("CitadelHeroImage", "KillerImage"),
      label(["killerInfo", "personaName"], killer), new Panel("Panel", "AssistsContainer", [], assisters),
      new Panel("Panel", "", ["gold"], [label(["gold"], souls)])]),
    new Panel("Panel", "VictimContainer", ["victimContainer", victimSide].filter(Boolean), [
      label(["victimInfo", "personaName"], victim),
      new Panel("CitadelHeroImage", "VictimImage")])])]);
}

// Top-bar team panels are fixed by game team (stock citadel_hud_top_bar.xml: TeamFriendly
// team="2" Amber, TeamEnemy team="3" Sapphire), so these lists are per panel, not per
// perspective: for a local player on Sapphire, "friendly" holds the enemy heroes.
const DEFAULT_ROSTER = {
  friendly: [["xXSniperXx", "SEVEN", 2], ["potato", "HAZE", 13], ["friendly filler", "ABRAMS", 6]],
  enemy: [["bob", "VENATOR", 65], ["carl", "INFERNUS", 1], ["dave", "LASH", 31]]
};

function setup(clockText = "?", roster = DEFAULT_ROSTER) {
  const report = new Panel("CitadelHudDamageReport", "CitadelHudDamageReport", ["Compact", "HudDamageReport"], [
    new Panel("Panel", "ReportContents", [], [
      new Panel("Panel", "FeederTabs", [], [new Panel("Panel", "FeederTabDamage", ["FeederTab", "Selected"]),
        new Panel("Panel", "FeederTabFeed", ["FeederTab"])]),
      new Panel("Panel", "FeederFeedSection", [], [new Panel("Panel", "FeederDonors"), new Panel("Panel", "FeederDonorsMore"),
        new Panel("Panel", "FeederRecipients"), new Panel("Panel", "FeederRecipientsMore")])])]);
  const feed = new Panel("Panel", "EventFeed");
  const hud = new Panel("CitadelHud", "Hud", [], [
    // Decoy reusing the top bar container id, plus a shop HeroName label: both must be ignored.
    new Panel("Panel", "Shop", [], [new Panel("Panel", "TeamsContainer", [], [label(["HeroName"], "SHOP HERO")])]),
    new Panel("Panel", "TeamsContainer", [], [
      new Panel("CitadelHudTopBarTeam", "TeamFriendly", [], roster.friendly.map((r) => topbarRow(...r))),
      new Panel("CitadelHudTopBarTeam", "TeamEnemy", [], roster.enemy.map((r) => topbarRow(...r)))]),
    new Panel("HudDataFeed", "DataFeed", ["DataFeed"], [feed]),
    new Panel("Label", "GameTime", [], [], { text: clockText }),
    new Panel("Panel", "HudCore", [], [report])]);
  new Panel("Panel", "CitadelHudRoot", [], [hud]);
  let now = 0;
  const queue = [];
  const logs = [];
  const native = (name) => { if (F.onNative) F.onNative(name); };
  const sandbox = {
    $: {
      GetContextPanel: () => report,
      Msg: (m) => { native("Msg"); logs.push(m); },
      Schedule: (s, f) => { native("Schedule"); queue.push(f); },
      CreatePanel: (type, parent, id) => { native("CreatePanel"); return parent.add(new Panel(type, id)); }
    },
    Date: { now: () => now }, JSON, String, Object, Math, parseInt, parseFloat, Infinity
  };
  vm.runInNewContext(fs.readFileSync(SOURCE, "utf8"), sandbox, { filename: "feeder_feed.js" });
  const tick = (ms = 100) => { now += ms; const f = queue.shift(); if (f) f(); };
  const push = (e) => { e._parent = feed; feed._kids.push(e); tick(); };
  const drop = (e) => { feed._kids.splice(feed._kids.indexOf(e), 1); tick(); };
  const run = { report, hud, feed, logs, tick, push, drop };
  F.runs.push(run);
  return run;
}

// value: "<souls> souls - <visible chips>", the same words the row shows.
function rendered(list) {
  return list._kids.filter((p) => p.visible).map((p) => ({
    name: p._vars.feeder_name, tag: p.BHasClass("Top") ? "TOP" : "",
    value: [p._vars.feeder_souls + " souls"].concat(p.FindChildrenWithClassTraverse("FeederChip")
      .filter((c) => c.visible && c.text).map((c) => c.text)).join(" - "),
    death: p.FindChildTraverse("FeederBarDeath").style.width, bag: p.FindChildTraverse("FeederBarBag").style.width,
    heroId: p.FindChildTraverse("HeroImage").heroId || null,
    neutral: p.BHasClass("Neutral")
  }));
}

// Everything a run shows: logs, both lists (expanded state as left by the scenario), footer,
// pills and the root classes the runtime owns.
function observed(run) {
  const find = (id) => run.report.FindChildTraverse(id);
  const pill = (id) => ({ visible: find(id).visible, text: find(id)._vars.feeder_more || null });
  return {
    logs: run.logs,
    donors: rendered(find("FeederDonors")),
    recipients: rendered(find("FeederRecipients")),
    footer: find("FeederFeedSection")._vars.feeder_footer || null,
    pills: [pill("FeederDonorsMore"), pill("FeederRecipientsMore")],
    classes: ["FeederFeedActive", "FeederEnemyTeam1", "FeederEnemyTeam2"].filter((c) => run.report.BHasClass(c))
  };
}

module.exports = Object.assign(F, { SOURCE, Panel, label, topbarRow, entry, DEFAULT_ROSTER, setup, rendered, observed });
