(() => {
  "use strict";

  // Feeder Feed: a tab in the stock damage report ranking heroes on either team by souls
  // donated to the other team (deaths + stolen soul bags) and received from them.
  //
  // Data source: the stock kill feed (#EventFeed under HudDataFeed). client.dll builds each
  // entry from CCitadelUserMsg_HeroKilled / SoulBagPickup, which Panorama JS cannot receive.
  // An entry exposes player names, side classes, the soul amount and assister portraits
  // ("PlayerAssist<heroId>"); killer/victim portraits carry no readable hero id. Heroes are
  // matched by player name against the top bar (row: #HeroBadge.heroid + Label.HeroName +
  // Label.PlayerName) on the right side. Player names are never logged or shown.
  const TAG = "[FF]";
  const POLL_SECONDS = 0.1;
  const FEED_RETRY_MS = 1000;
  const RETRY_MS = 1000;
  const ASSIST_RETRY_MS = 200;
  const SCAN_MIN_MS = 2000;
  const TEAM_READ_MS = 1000;
  const FRESH_SCAN_MS = 50;
  // ponytail: a stolen bag goes to the newest friendly death without a bag inside this window;
  // the entry does not say whose bag it was. Two deaths close together can swap bag owners.
  const BAG_WINDOW_MS = 90000;
  // server.dll 6753 (rva:9de590): with N assisters a hero killer keeps KR / (N + KR) of the
  // bounty (citadel_player_gold_killer_to_assist_ratio) and the assisters split the rest.
  // No credited player (NPC kill) means assisters take it all.
  const KILLER_ASSIST_RATIO = 2.2;
  const FIRST_KILL_BONUS = 125; // citadel_player_gold_reward_first_kill_bonus, killer's first kill
  // Comeback bonus (rva:9dd0e0), included in the feed total. Active when the victim's team is
  // more than `gap` souls ahead (team multiplier) and/or the victim is worth more than the killer
  // team's average above `avgMin` (difficulty multiplier); cap 5 before 8:00 and 7 afterwards.
  // Extra souls = 0.4 * (bounty * mult - bounty): killer 30%, the rest weighted 1.5 per assister
  // and 1 per other killer-team hero (comeback_* convars).
  const COMEBACK = {
    gap: 1500, teamMult: 2.268, avgMin: 1250, diffMult: 2.484, bonus: 0.15,
    scale: 0.4, killerFrac: 0.3, assisterWeight: 1.5
  };
  // Compiled ordinary-mode defaults (server.dll 6753): min 200, max 2200, time 2400 seconds.
  // ponytail: mode-hash bounty scales/additions and no-team-mult/0.2 branches are not exposed
  // by Panorama; validate against server diagnostics before claiming accuracy in custom modes.
  const BOUNTY = { min: 200, max: 2200, time: 2400 };
  const HERO_KILL_SHARE_FRAC = [1.25, 0.575, 0.283, 0.175, 0.11, 0.083];
  const ENTRY_ATTR = "ff_entry";
  const INFO_FEED = "CitadelHudInfoFeed"; // kill and soul-bag entries; other feed panels are skipped
  // Class names styled by citadel_hud_data_feed_info.css; C++ sets them when it builds the entry.
  const ENTRY_CLASSES = [
    "enemyDied", "teammateDied", "killedSelf", "noKiller", "bossDied", "midBoss",
    "hasGold", "hasAssists", "has_killstreak", "SoulBagPickup", "SoulBagStolen",
    "IdolPickedUp", "IdolReturned", "KothCompleted", "isRejuvenator", "isRejuvenatorPickup",
    "isRejuvenatorUsed", "is_item", "hideKillerImage", "hideVictimImage"
  ];
  // Entries whose victim slot names an object or NPC (soul bag, guardian), never a player.
  const OBJECT_VICTIM_CLASSES = [
    "bossDied", "midBoss", "SoulBagPickup", "IdolPickedUp", "IdolReturned", "KothCompleted",
    "isRejuvenator", "isRejuvenatorPickup", "isRejuvenatorUsed"
  ];
  // Top-bar team panels are fixed by game team (stock citadel_hud_top_bar.xml: TeamFriendly
  // team="2" Amber, TeamEnemy team="3" Sapphire) whatever the local team, so a local player on
  // Sapphire (HUD class localPlayerTeam2) finds the enemy heroes in TeamFriendly.
  const TOPBAR_AMBER = { TeamFriendly: true, TeamEnemy: false };
  // Spectator feed containers: team_1 = Amber (game team 2), team_2 = Sapphire (game team 3).
  const ABSOLUTE_SIDES = ["team_1", "team_2"];
  const NEUTRAL = { key: "neutral", name: "NPCs & mishaps", heroId: null, neutral: true };
  const UNKNOWN = { key: "unknown", name: "Unknown hero", heroId: null, neutral: false };
  const f = Math.fround; // the server computes souls in float32

  const context = $.GetContextPanel();
  if (typeof context.FeederFeedStop === "function") context.FeederFeedStop();
  let stopped = false;
  context.FeederFeedStop = () => { stopped = true; };

  const bootAt = Date.now();
  const UI = {
    hud: null, feed: null, clock: null, tabDamage: null, tabFeed: null, section: null, donors: null, recipients: null,
    donorsMore: null, recipientsMore: null, root: null
  };
  // assistBase: last accounted top-bar assist count per enemy hero; assistQueue: our deaths
  // waiting to learn which enemy heroes assisted, oldest first.
  const State = {
    donors: {}, recipients: {}, deaths: [], dirty: true, inProgress: false,
    assistBase: {}, assistQueue: [], freshMatch: false, estimated: false,
    expanded: { donors: false, recipients: false }, active: false,
    // Enemy color is applied at 1 Hz; relative feed entries refresh local-team classes first.
    teamReadAt: -Infinity, team1: false, team2: false, enemyColor: null,
    // Spectators: enemy team class learned from feed entries; a change requests a reset.
    enemyTeam: null, perspectiveFlip: false
  };
  let live = {};
  let rows = [];
  let teamPanels = {};
  let lastScan = -Infinity;
  let lastFeedTry = -Infinity;
  let lastTopbarDiag = "";
  let nextEntry = 0;
  let lastError = "";
  let inputLogged = false;

  function log(message) {
    $.Msg(TAG + " t=" + ((Date.now() - bootAt) / 1000).toFixed(2) + " " + message);
  }

  function valid(panel) {
    try { return !!panel && panel.IsValid(); } catch (error) { return false; }
  }

  // Trimmed label text, null when unreadable.
  function readText(label) {
    try {
      const text = label.text;
      return typeof text === "string" ? text.trim() : null;
    } catch (error) {
      return null;
    }
  }

  function textOf(label) {
    return valid(label) ? readText(label) : null;
  }

  function key(text) {
    return text ? text.toLowerCase() : "";
  }

  function firstOfType(scope, className, panelType) {
    if (!valid(scope)) return null;
    const found = scope.FindChildrenWithClassTraverse(className) || [];
    for (let i = 0; i < found.length; i++) {
      if (found[i].paneltype === panelType) return found[i];
    }
    return null;
  }

  function sideOf(panel) {
    if (!valid(panel)) return null;
    if (panel.BHasClass("friendly")) return "friendly";
    if (panel.BHasClass("enemy")) return "enemy";
    for (let i = 0; i < ABSOLUTE_SIDES.length; i++) if (panel.BHasClass(ABSOLUTE_SIDES[i])) return ABSOLUTE_SIDES[i];
    return null;
  }

  const isAbsolute = (side) => ABSOLUTE_SIDES.indexOf(side) >= 0;

  // Cached; re-walked only when the cached root died (layout reload re-runs the script anyway).
  function hudRoot() {
    if (valid(UI.root)) return UI.root;
    let root = context;
    while (valid(root.GetParent())) root = root.GetParent();
    UI.root = root;
    return root;
  }

  // Full integers, comma-grouped integers, or decimal k/m abbreviations; never numeric prefixes.
  function parseSouls(text) {
    if (typeof text !== "string") return null;
    const t = text.replace(/<[^>]*>/g, "").trim().toLowerCase();
    let value;
    if (/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(t)) value = Number(t.replace(/,/g, ""));
    else {
      const m = /^(\d+(?:\.\d+)?)([km])$/.exec(t);
      if (!m) return null;
      value = Math.round(Number(m[1]) * (m[2] === "k" ? 1000 : 1000000));
    }
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  function parseClock(text) {
    const m = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(text || "");
    if (!m) return null;
    const seconds = m[3] === undefined ? Number(m[1]) * 60 + Number(m[2])
      : Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }

  function formatSouls(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // ---- top bar (lookup only, cached) ----------------------------------------------------

  // One poll pass sees one engine frame: top-bar labels cannot change while the script runs.
  // Row values and liveness, covered() and teamWorth() are read at most once per frame;
  // poll() starts a new frame, and scanRows() drops the roster-derived values.
  let frame = 0;
  let frameMemo = {};

  function nextFrame() {
    frame++;
    frameMemo = {};
  }

  // This frame's values of one row: liveness, its record, label texts by part name.
  function rowMemo(row) {
    if (row.frame !== frame) {
      row.frame = frame;
      row.memo = { alive: undefined, record: null, text: {} };
    }
    return row.memo;
  }

  function alive(row) {
    const memo = rowMemo(row);
    if (memo.alive === undefined) memo.alive = valid(row.panel);
    return memo.alive;
  }

  // Rows are found by class, not container id: other HUD panels reuse ids like
  // TeamsContainer, and the shop has its own HeroName labels.
  // Rows keep their cached label references (row.parts) across rescans of the same panel.
  function scanRows() {
    lastScan = Date.now();
    frameMemo.covered = undefined; // the roster changes; this frame's labels do not
    frameMemo.teams = undefined;
    const previous = rows;
    rows = [];
    teamPanels = {};
    const labels = hudRoot().FindChildrenWithClassTraverse("HeroName") || [];
    for (let i = 0; i < labels.length; i++) {
      let row = null;
      for (let p = labels[i]; valid(p); p = p.GetParent()) {
        if (!row && p.paneltype === "CitadelHudTopBarPlayer") row = p;
        if (row && typeof TOPBAR_AMBER[p.id] === "boolean" && p.paneltype === "CitadelHudTopBarTeam") {
          const side = panelSide(p.id);
          teamPanels[side] = p;
          const kept = previous.find((old) => old.panel === row && old.side === side);
          rows.push(kept || { panel: row, side: side, parts: {} });
          break;
        }
      }
    }
    const heroes = rows.map((row) => { const r = readRow(row); return r.side + ":" + heroText(r); });
    const diag = "TOPBAR rows=" + rows.length + " [" + heroes.join(" ") + "]";
    if (diag !== lastTopbarDiag) log(diag);
    lastTopbarDiag = diag;
  }

  // Perspective side of a top-bar team panel; spectators (neither local-team class) keep Amber
  // as the home side, matching classifySpectated.
  function panelSide(id) {
    return TOPBAR_AMBER[id] !== State.team2 ? "friendly" : "enemy";
  }

  // Sides depend on the local team: drop the roster so the next lookup rescans.
  function dropRows() {
    rows = [];
    teamPanels = {};
    lastScan = -Infinity;
    frameMemo.covered = undefined;
    frameMemo.teams = undefined;
  }

  // Row label lookups, found once per row; each reference is re-found only when it died.
  // Values (text, heroid) are read once per frame.
  const ROW_PARTS = {
    badge: (panel) => panel.FindChildTraverse("HeroBadge"),
    player: (panel) => firstOfType(panel, "PlayerName", "Label"),
    hero: (panel) => firstOfType(panel, "HeroName", "Label"),
    souls: (panel) => panel.FindChildTraverse("SoulsValue"),
    kills: (panel) => firstOfType(panel, "kills", "Label"),
    assists: (panel) => firstOfType(panel, "assists", "Label")
  };

  // A validated label reference or null; one IsValid when the cached reference is alive.
  function part(row, name) {
    const ref = row.parts[name];
    if (valid(ref)) return ref;
    const found = alive(row) ? ROW_PARTS[name](row.panel) : null;
    row.parts[name] = found;
    return valid(found) ? found : null;
  }

  // Text of a row label; part() already validated the reference.
  function partText(row, name) {
    const texts = rowMemo(row).text;
    if (!(name in texts)) {
      const ref = part(row, name);
      texts[name] = ref ? readText(ref) : null;
    }
    return texts[name];
  }

  // Shared within a frame; callers must not mutate it.
  function readRow(row) {
    const memo = rowMemo(row);
    if (memo.record) return memo.record;
    const badge = part(row, "badge");
    let heroId = null;
    try { heroId = badge ? badge.heroid : null; } catch (error) { heroId = null; }
    memo.record = {
      side: row.side,
      player: key(partText(row, "player")),
      hero: partText(row, "hero") || null,
      heroId: typeof heroId === "number" && heroId > 0 ? heroId : null
    };
    return memo.record;
  }

  // Fallback when the feed's assister portraits are unreadable (see feedAssisters): the top bar
  // shows each hero's {i:assists}; the server bumps it for every assister of the kill, so the
  // enemy heroes whose counter rose since the last accounted death are this death's assisters.
  function assistCounts(side) {
    ensureRows();
    const out = [];
    rows.forEach((row) => {
      if (row.side !== side || !alive(row)) return;
      const r = readRow(row);
      const count = parseInt(partText(row, "assists") || "", 10);
      if ((r.hero || r.heroId) && !isNaN(count)) out.push({ who: whoOf(r), count: count });
    });
    return out;
  }

  function baseOf(who, count) {
    // Counters start at 0 each match; when booted mid-match, the first reading is the base.
    if (!(who.key in State.assistBase)) State.assistBase[who.key] = State.freshMatch ? 0 : count;
    return State.assistBase[who.key];
  }

  // ponytail: deaths are matched one at a time, oldest first. Counters that rose by more than
  // the head death's assister count (team wipes, missed entries) give up on every queued death
  // (souls go to the "Assisters (split)" row) and resync, rather than guess.
  function attributeAssists(gone) {
    const item = State.assistQueue[0];
    if (!item) return;
    item.lastAssistTry = Date.now();
    const counts = assistCounts(otherSide(item.victimSide));
    const risen = [];
    let sum = 0;
    counts.forEach((c) => {
      const d = c.count - baseOf(c.who, c.count);
      if (d > 0) { risen.push(c); sum += d; }
    });
    const n = item.snap.assists;
    if (sum === n && risen.length === n) {
      item.assisters = risen.map((c) => c.who);
      risen.forEach((c) => { State.assistBase[c.who.key] = c.count; });
      item.assistDone = true;
      State.assistQueue.shift();
      log("ASSIST #" + item.id + " " + item.assisters.map((who) => who.name + (who.heroId ? "(" + who.heroId + ")" : "")).join(","));
      tryCount(item);
      if (State.assistQueue.length) attributeAssists(false);
      return;
    }
    if (sum < n && !gone) return; // counters not updated yet
    log("ASSIST unresolved (" + State.assistQueue.length + " death(s), counters rose by " + sum + ")");
    const queued = State.assistQueue;
    State.assistQueue = [];
    counts.forEach((c) => { State.assistBase[c.who.key] = c.count; });
    queued.forEach((queuedItem) => { queuedItem.assistDone = true; tryCount(queuedItem); });
  }

  const canScan = () => Date.now() - lastScan >= SCAN_MIN_MS;

  // Throttled rescan when the roster is empty or a cached row died.
  function ensureRows() {
    if ((!rows.length || rows.some((row) => !alive(row))) && canScan()) scanRows();
  }

  // Matches on the player label alone; hero name and id are read only for matching rows.
  function lookup(wanted, side) {
    const matches = [];
    rows.forEach((row) => {
      if ((side && row.side !== side) || key(partText(row, "player")) !== wanted) return;
      const r = readRow(row);
      matches.push({ hero: r.hero, heroId: r.heroId, side: r.side });
    });
    return matches;
  }

  // Hero record, { other } when the top bar has no such player (an NPC), or { unresolved } so
  // the entry retries; a throttled miss must not be mistaken for an NPC. Names are read live,
  // so a miss against a fresh scan or a fully covered, fully named cached roster is conclusive.
  function resolve(name, side) {
    const wanted = key(name);
    if (!wanted) return { unresolved: "empty name" };
    ensureRows();
    let matches = lookup(wanted, side);
    if (!matches.length && canScan()) {
      scanRows();
      matches = lookup(wanted, side);
    }
    if (matches.length > 1) return { unresolved: "duplicate name" };
    if (matches.length === 1) {
      return matches[0].hero || matches[0].heroId ? matches[0] : { unresolved: "empty hero" };
    }
    if (!rows.length) return { unresolved: "top bar not found" };
    // A cached roster is conclusive only when every row's player label is readable and set.
    const conclusive = Date.now() - lastScan < FRESH_SCAN_MS ||
      (rows.every((row) => alive(row) && !!partText(row, "player")) && covered());
    return conclusive ? { other: true } : { unresolved: "not on top bar yet" };
  }

  function heroText(record) {
    if (!record) return "?";
    if (record.hero || record.heroId) {
      return (record.hero || "id") + (record.heroId ? "(" + record.heroId + ")" : "");
    }
    if (record.object) return record.object;
    if (record.other) return "non-hero";
    if (record.noKiller) return "<no killer>";
    return "?";
  }

  // Tally identity for a resolved (or given-up) side.
  // ponytail: hero-id tallies merge duplicate-hero bots; their snapshots are rejected for
  // comeback attribution. Use a stable server player identifier if Panorama exposes one.
  function whoOf(record) {
    if (record && (record.hero || record.heroId)) {
      return {
        key: record.heroId ? "id:" + record.heroId : "name:" + key(record.hero),
        name: record.hero || "Hero " + record.heroId,
        heroId: record.heroId,
        neutral: false,
        side: record.side || null
      };
    }
    if (record && (record.other || record.noKiller)) return NEUTRAL;
    return UNKNOWN;
  }

  const otherSide = (side) => side === "friendly" ? "enemy" : side === "enemy" ? "friendly" : null;

  // Unknown heroes get one row per team, so team totals and colors stay right.
  const sided = (who, side) => who === UNKNOWN && side ? Object.assign({}, UNKNOWN, { key: "unknown:" + side, side: side }) : who;

  // Unidentified assisters get one row per killing team.
  const assistersOf = (side) => ({ key: "assisters:" + side, name: "Assisters (split)", heroId: null, neutral: false, side: side });

  // ---- tally ------------------------------------------------------------------------------

  function bump(table, who, souls, field, by = 1) {
    const row = table[who.key] || (table[who.key] = {
      name: who.name, heroId: who.heroId, neutral: who.neutral, side: who.side || null, souls: 0, bagSouls: 0, deaths: 0,
      kills: 0, bags: 0, assists: 0, shares: 0
    });
    row.souls += souls;
    if (field === "bags") row.bagSouls += souls;
    row[field] += by;
  }

  function killerShare(total, assisters, killer) {
    if (killer.neutral) return assisters > 0 ? 0 : total;
    if (assisters <= 0) return total;
    return total - Math.floor((1 - KILLER_ASSIST_RATIO / (assisters + KILLER_ASSIST_RATIO)) * total);
  }

  // Top-bar {g:citadel_thousands:gold}, frozen at firstSeen alongside kill counters and clock.
  // Each team's physical top-bar rows (bounded walk of the team panel; rows are leaves) must be
  // exactly its cached rows: equal numbers of missing labels must not look complete, and a row
  // that left or changed teams forces a rescan.
  function covered() {
    if (frameMemo.covered !== undefined) return frameMemo.covered;
    let complete = true;
    ["friendly", "enemy"].forEach((side) => {
      const team = teamPanels[side];
      if (!valid(team)) { complete = false; return; }
      const physical = [];
      const visit = (panel) => {
        if (!valid(panel)) return;
        if (panel.paneltype === "CitadelHudTopBarPlayer") { physical.push(panel); return; }
        for (let i = 0; i < panel.GetChildCount(); i++) visit(panel.GetChild(i));
      };
      visit(team);
      const cached = rows.filter((row) => row.side === side);
      if (physical.length !== cached.length || !physical.every((panel) => cached.some((row) => row.panel === panel))) {
        complete = false;
      }
    });
    frameMemo.covered = complete;
    return complete;
  }

  // One snapshot per frame: entries that appear together share it.
  function teamWorth() {
    if (frameMemo.teams) return frameMemo.teams;
    // Freeze the visible roster; rescan only when the cached rows no longer cover the top bar.
    let complete = rows.length > 0 && rows.every(alive) && covered();
    if (!complete) {
      scanRows();
      complete = covered();
    }
    const teams = { friendly: [], enemy: [], coverage: complete };
    rows.forEach((row) => {
      if (!alive(row)) return;
      const r = readRow(row);
      const raw = partText(row, "souls");
      const kills = partText(row, "kills");
      teams[row.side].push({
        who: whoOf(r), raw: raw, nw: parseSouls(raw),
        kills: /^\d+$/.test(kills || "") && Number.isSafeInteger(Number(kills)) ? Number(kills) : null
      });
    });
    frameMemo.teams = teams;
    return teams;
  }

  function completeTeams(teams) {
    const all = teams.friendly.concat(teams.enemy);
    return teams.coverage && teams.friendly.length > 0 && teams.enemy.length > 0 &&
      all.every((p) => p.nw !== null && p.who !== UNKNOWN) &&
      all.every((p, i) => all.findIndex((q) => q.who.key === p.who.key) === i);
  }

  // ponytail: firstSeen can already be post-payout; souls ratios are only a fallback estimate.
  function comebackOf(victims, killers, victim, seconds) {
    const sum = (list) => list.reduce((total, p) => total + p.nw, 0);
    const victimTeam = sum(victims);
    const killerTeam = sum(killers);
    const victimRow = victims.find((p) => p.who.key === victim.key);
    const avg = Math.floor(killerTeam / killers.length);
    let teamM = 1;
    let diffM = 1;
    let poorWinner = false;
    if (killerTeam > 0 && victimTeam - killerTeam > COMEBACK.gap) teamM = COMEBACK.teamMult * (victimTeam / killerTeam - 1) + 1;
    if (victimRow && avg > COMEBACK.avgMin && victimRow.nw > avg) {
      diffM = COMEBACK.diffMult * (victimRow.nw / avg - 1) + 1;
      poorWinner = victimTeam < killerTeam;
    }
    let mult = teamM * diffM;
    const cap = comebackCap(seconds);
    const capped = mult > cap;
    if (capped) mult = cap;
    if (mult > 1 && !poorWinner && !capped) mult += COMEBACK.bonus;
    return { mult: mult, victimTeam: victimTeam, killerTeam: killerTeam, victimNw: victimRow ? victimRow.nw : null, avg: avg };
  }

  // Multiplier cap: 5, or 7 from 8:00 (game minutes vs citadel_trooper_laning_gold_rules_end_time).
  function comebackCap(seconds) {
    return seconds !== null && Math.floor(seconds / 60) >= 8 ? 7 : 5;
  }

  function comebackShares(nominal, n, otherCount, heroKiller) {
    const killer = heroKiller ? Math.trunc(f(f(COMEBACK.killerFrac) * f(nominal))) : 0;
    const rest = f(nominal - killer);
    const weight = f(f(n * f(COMEBACK.assisterWeight)) + otherCount);
    const assister = weight > 0 ? Math.trunc(f(f(f(COMEBACK.assisterWeight) / weight) * rest)) : 0;
    const other = weight > 0 ? Math.trunc(f(rest / weight)) : 0;
    return { killer: killer, assister: assister, other: other, paid: killer + n * assister + otherCount * other };
  }

  function recoverShares(paid, n, otherCount, heroKiller) {
    // Each recipient truncates less than one soul; nominal lies within this bounded interval.
    for (let nominal = paid; nominal <= paid + n + otherCount + 3; nominal++) {
      const shares = comebackShares(nominal, n, otherCount, heroKiller);
      if (shares.paid === paid) return shares;
    }
    return null;
  }

  function bountyAt(seconds) {
    const fraction = Math.max(0, Math.min(1, f(f(seconds) / f(BOUNTY.time))));
    return Math.trunc(f(f(BOUNTY.min) + f(f(BOUNTY.max - BOUNTY.min) * fraction)));
  }

  // Hero bounty after participant scaling: ceil(B * frac[k-1] * k), k = hero killer + assisters
  // (server rva 9d36fb-9d3753; frac = generic_data.vdata m_flHeroKillGoldShareFrac). This scaled
  // value is both the paid bounty and the comeback base. Live check: B 271, k 2 -> 312.
  function scaledBounty(seconds, participants) {
    const frac = HERO_KILL_SHARE_FRAC[participants - 1];
    if (frac === undefined) return 0;
    return Math.ceil(f(f(f(bountyAt(seconds)) * f(frac)) * f(participants)));
  }

  function nominalComeback(base, mult) {
    return Math.max(0, Math.trunc(f((Math.trunc(f(base * f(mult))) - base) * f(COMEBACK.scale))));
  }

  function diagnoseInputs(teams, clock) {
    const populated = (raw) => typeof raw === "string" && raw.trim().length > 0 &&
      !/^(?:[?—-]+|0(?:[.,]0+)?[km]?|0+:00|\{[^}]*\}|loading)$/i.test(raw.trim());
    const values = teams.friendly.concat(teams.enemy);
    if (inputLogged || !populated(clock) || !values.some((p) => populated(p.raw))) return;
    inputLogged = true;
    const samples = values.filter((p) => populated(p.raw)).slice(0, 4).map((p) =>
      JSON.stringify((p.raw || "").slice(0, 48)) + " parsed=" + p.nw);
    log("INPUT SoulsValue=" + samples.join(" ") + " GameTime=" + JSON.stringify(clock.slice(0, 24)) +
      " seconds=" + parseClock(clock));
  }

  // Once per frame; the label is re-found while it is missing or shows no clock.
  function clockText() {
    if (frameMemo.clock) return frameMemo.clock;
    let text = textOf(UI.clock);
    if (!/\d:\d\d/.test(text || "")) {
      const label = hudRoot().FindChildTraverse("GameTime");
      UI.clock = valid(label) && label.paneltype === "Label" ? label : null;
      text = textOf(UI.clock);
    }
    frameMemo.clock = text || "?";
    return frameMemo.clock;
  }

  // The stolen bag belonged to the picker's opponents: the newest unclaimed death on that side.
  function claimBag(now, side) {
    State.deaths = State.deaths.filter((death) => now - death.at <= BAG_WINDOW_MS);
    for (let i = State.deaths.length - 1; i >= 0; i--) {
      if (!State.deaths[i].bagClaimed && State.deaths[i].side === side) {
        State.deaths[i].bagClaimed = true;
        return State.deaths[i].donor;
      }
    }
    return UNKNOWN;
  }

  // Exact split from the clock (design.md "Recovering the split"). The label shows whole seconds
  // and trails the server clock (live: label 0:20 paid the 21 s bounty), so every bounty within
  // the next two seconds is a candidate. The KDA label can lag and live sandbox kills paid the
  // 125 bonus with KDA above one, so both bonus values are candidates (KDA order breaks ties).
  // Exact needs no comeback at all, or a payout the souls estimate reproduces; a lone integer
  // match could be a missed bonus posing as a comeback.
  function clockSplit(souls, seconds, n, otherCount, npcKiller, bonus, mult) {
    const heroKiller = !npcKiller;
    const cap = comebackCap(seconds) + COMEBACK.bonus; // +0.15 just under the cap
    const bonuses = npcKiller ? [0] : [bonus, FIRST_KILL_BONUS - bonus];
    const candidates = [];
    const failures = [];
    [0, 1, 2].map((d) => scaledBounty(seconds + d, (heroKiller ? 1 : 0) + n))
      .filter((base, i, all) => all.indexOf(base) === i)
      .forEach((base) => bonuses.forEach((candidateBonus) => {
        const paid = souls - base - candidateBonus;
        const maxPaid = comebackShares(nominalComeback(base, cap), n, otherCount, heroKiller).paid;
        const portions = paid >= 0 && paid <= maxPaid ? recoverShares(paid, n, otherCount, heroKiller) : null;
        if (!portions) { failures.push(paid < 0 ? "negative-paid" : paid > maxPaid ? "above-cap" : "no-integer-match"); return; }
        const expected = comebackShares(nominalComeback(base, mult), n, otherCount, heroKiller).paid;
        candidates.push({ base: base, bonus: candidateBonus, paid: paid, shares: portions, gap: Math.abs(portions.paid - expected),
          crossCheck: portions.paid === expected ? "match" : "mismatch" });
      }));
    const same = (list) => list.length > 0 && list.every((c) => c.bonus === list[0].bonus &&
      c.shares.killer === list[0].shares.killer && c.shares.assister === list[0].shares.assister &&
      c.shares.other === list[0].shares.other);
    const zero = candidates.filter((c) => c.paid === 0);
    const matching = candidates.filter((c) => c.crossCheck === "match");
    const chosen = same(zero) ? zero[0] : !zero.length && same(matching) ? matching[0] : null;
    // Rounded top-bar souls ("9.8k") rarely reproduce a live comeback exactly. The clock still
    // pins the bounty within two seconds and every candidate conserves the feed total, so the
    // candidate nearest the souls estimate beats a souls-only split (it stays an estimate).
    const nearest = chosen || zero.length ? null : candidates.reduce((best, c) => (!best || c.gap < best.gap ? c : best), null);
    return {
      chosen: chosen,
      nearest: nearest,
      reason: chosen ? "clock-paid" : nearest ? "nearest-clock-candidate" : zero.length ? "ambiguous-clock-candidates"
        : failures[0] || "no-integer-match"
    };
  }

  // Souls fallback: the integer base whose own comeback reproduces the feed total, else the
  // nearest guess (null when even that would exceed the total).
  function soulsSplit(souls, bonus, mult, n, otherCount, npcKiller) {
    const guess = Math.max(0, Math.trunc((souls - bonus) / (1 + COMEBACK.scale * (mult - 1))));
    for (let base = Math.max(0, guess - 3); base <= guess + 3; base++) {
      const tried = comebackShares(nominalComeback(base, mult), n, otherCount, !npcKiller);
      if (base + tried.paid === souls - bonus) return tried;
    }
    const shares = comebackShares(nominalComeback(guess, mult), n, otherCount, !npcKiller);
    return shares.paid > souls ? null : shares;
  }

  function count(item) {
    item.counted = true;
    const kind = item.snap.kind;
    if (kind !== "death" && kind !== "bag") return; // idols, rifts, rejuvenators ("-" souls)
    const souls = parseSouls(item.snap.souls);
    if (souls === null) { log("SKIP #" + item.id + " invalid feed souls"); return; }
    if (kind === "death") countDeath(item, souls);
    else countBag(item, souls);
    State.dirty = true; // poll() renders once after the whole feed pass
  }

  // Either team can die; the killing team is the other top-bar side. The feed total is
  // bounty + first-kill bonus + paid comeback shares (design.md).
  function countDeath(item, souls) {
    const snap = item.snap;
    const donor = whoOf(snap.victim);
    bump(State.donors, sided(donor, item.victimSide), souls, "deaths");
    const killer = whoOf(snap.killer);
    const n = snap.assists;
    // Assister heroes, when the feed portraits or top-bar counters identified them ([] when none).
    const known = n <= 0 ? [] : (item.assisters && item.assisters.length === n ? item.assisters : null);
    // Worth was frozen at first sight; copy and re-side its identities if the local team arrived later.
    const flip = (list) => list.map((p) => p.who === UNKNOWN ? p : Object.assign({}, p, {
      who: Object.assign({}, p.who, { side: otherSide(p.who.side) })
    }));
    const teams = snap.teamsTeam2 === State.team2 ? snap.teams : {
      friendly: flip(snap.teams.enemy), enemy: flip(snap.teams.friendly), coverage: snap.teams.coverage
    };
    const victimSide = item.victimSide;
    const killerSide = otherSide(victimSide);
    const victims = teams[victimSide] || [];
    const killers = teams[killerSide] || [];
    const seconds = parseClock(snap.clock);
    const killerRow = killers.find((p) => p.who.key === killer.key);
    const killsKnown = killer.neutral || (killerRow && killerRow.kills !== null);
    // A frozen KDA of one may be updated first-kill KDA or lagging second-kill KDA.
    let bonus = !killer.neutral && killsKnown && killerRow.kills <= 1 ? FIRST_KILL_BONUS : 0;
    const inputsKnown = !!killerSide && completeTeams(teams) && killsKnown && donor !== UNKNOWN &&
      victims.some((p) => p.who.key === donor.key) &&
      (killer.neutral || !!killerRow) && n <= killers.length - (killer.neutral ? 0 : 1) &&
      (!known || known.every((a) => a.key !== killer.key && killers.some((p) => p.who.key === a.key)));
    const others = inputsKnown && known ? killers.filter((p) =>
      p.who.key !== killer.key && !known.some((a) => a.key === p.who.key)) : [];
    const otherCount = inputsKnown ? (known ? others.length : Math.max(0, killers.length - (killer.neutral ? 0 : 1) - n)) : 0;
    const cb = inputsKnown ? comebackOf(victims, killers, donor, seconds) : { mult: 1 };
    let shares = null;
    let status = inputsKnown ? "estimate" : "unknown";
    let reason = inputsKnown ? "clock-unknown" : "unknown-inputs";
    if (inputsKnown && seconds !== null) {
      const split = clockSplit(souls, seconds, n, otherCount, killer.neutral, bonus, cb.mult);
      reason = split.reason;
      const picked = split.chosen || split.nearest;
      if (picked) {
        bonus = picked.bonus;
        shares = picked.shares;
        cb.crossCheck = picked.crossCheck;
        cb.base = picked.base;
        if (split.chosen) status = "exact";
      }
    }
    if (!shares && inputsKnown) shares = soulsSplit(souls, bonus, cb.mult, n, otherCount, killer.neutral);
    if (!shares) shares = comebackShares(0, n, otherCount, !killer.neutral);
    if (status !== "exact" || !known) State.estimated = true;
    const bounty = souls - shares.paid;
    const share = killerShare(bounty, n, killer);
    let pool = bounty - share;
    log("CB #" + item.id + " status=" + status + " mult=" + cb.mult.toFixed(2) + " extra=" + shares.paid + " bonus=" + bonus +
      " victimTeam=" + cb.victimTeam + " killerTeam=" + cb.killerTeam + " victim=" + cb.victimNw +
      " avg=" + cb.avg + " clock=" + snap.clock +
      " K=" + shares.killer + " A=" + shares.assister + " O=" + shares.other + " soulsCrossCheck=" + (cb.crossCheck || "unavailable") +
      " reason=" + reason + " chosenBonus=" + bonus + " base=" + (cb.base === undefined ? "?" : cb.base));
    if (share + shares.killer > 0 || n <= 0) bump(State.recipients, killer, share + shares.killer, "kills");
    if (known) {
      // ponytail: top-bar order may differ from server assister order; a one-soul bounty
      // residue can land on the wrong hero. Preserve totals; use server order if exposed.
      known.forEach((who, i) => {
        const part = Math.floor(pool / (n - i));
        pool -= part;
        bump(State.recipients, who, part + shares.assister, "assists");
      });
      if (shares.other > 0) others.forEach((p) => bump(State.recipients, p.who, shares.other, "shares"));
    } else {
      const unattributed = pool + shares.assister * n + shares.other * otherCount;
      if (unattributed > 0) bump(State.recipients, assistersOf(killerSide), unattributed, "assists", n);
    }
    State.deaths.push({ donor: donor, side: victimSide, at: Date.now(), bagClaimed: false });
  }

  // A hero picked up the other side's dropped soul bag.
  function countBag(item, souls) {
    const owner = otherSide(item.killerSide);
    bump(State.donors, sided(claimBag(Date.now(), owner), owner), souls, "bags");
    bump(State.recipients, whoOf(item.snap.killer), souls, "bags");
  }

  function reset(reason) {
    State.donors = {};
    State.recipients = {};
    State.deaths = [];
    State.assistBase = {};
    State.assistQueue = [];
    State.freshMatch = true;
    State.estimated = false;
    State.enemyTeam = null;
    State.perspectiveFlip = false;
    State.dirty = true;
    live = {};
    rows = [];
    lastScan = -Infinity;
    log("reset (" + reason + ")");
    render();
  }

  // ---- feed -------------------------------------------------------------------------------

  function done(record) {
    return !!record && !record.unresolved;
  }

  const resolved = (snap) => done(snap.killer) && done(snap.victim);
  const isInfo = (item) => item.snap.type === INFO_FEED;
  const hasClass = (snap, name) => snap.cls.indexOf(name) >= 0;

  // Top-bar heroes with this id (on one side when given), in roster order.
  function rowsWithHero(heroId, side) {
    return rows.filter((row) => alive(row) && (!side || row.side === side))
      .map(readRow).filter((r) => r.heroId === heroId);
  }

  // Feed and top bar take the player name from the same client function (6759 rva 8687a0), so a
  // name lookup on the right side identifies heroes. Portrait hero ids are not readable:
  // CitadelHeroImage exposes only SetHeroID to JavaScript (rva 1cfab80), no heroid getter.
  function resolveUnit(entry, containerId, labelClass, side) {
    return resolve(textOf(firstOfType(entry.FindChildTraverse(containerId), labelClass, "Label")), side);
  }

  function resolveEntry(item) {
    item.lastTry = Date.now();
    const entry = item.panel;
    const snap = item.snap;
    if (!isAbsolute(item.killerClass) && !isAbsolute(item.victimClass)) {
      readLocalTeam(true);
      if (!State.team1 && !State.team2) {
        ensureRows(); // keep the roster warm, but do not resolve against guessed sides
        return;
      }
    }
    if (!done(snap.killer)) {
      snap.killer = hasClass(snap, "noKiller") ? { noKiller: true } : resolveUnit(entry, "KillerContainer", "killerInfo", item.killerSide);
    }
    if (!done(snap.victim)) {
      snap.victim = snap.objectVictim
        ? { object: textOf(firstOfType(entry.FindChildTraverse("VictimContainer"), "victimInfo", "Label")) || "?" }
        : resolveUnit(entry, "VictimContainer", "victimInfo", item.victimSide);
    }
    if (snap.kind === "pending" && resolved(snap)) classifySpectated(item);
  }

  // Spectators get absolute team_1/team_2 containers (client rva 92a180 returns 4/5 when the
  // local player has no playing team). The top bar still splits heroes into TeamFriendly and
  // TeamEnemy, so a hero's top-bar side is the perspective; NPC sides stay unknown.
  function classifySpectated(item) {
    const snap = item.snap;
    item.killerSide = snap.killer.side || null;
    item.victimSide = snap.victim.side || null;
    snap.kind = kindOf(snap, item.killerSide, item.victimSide);
    [[snap.killer.side, item.killerClass], [snap.victim.side, item.victimClass]].forEach((pair) => {
      if (!pair[0] || !isAbsolute(pair[1])) return;
      const enemyTeam = pair[0] === "enemy" ? pair[1] : ABSOLUTE_SIDES[1 - ABSOLUTE_SIDES.indexOf(pair[1])];
      // ponytail: a changed spectator home team swaps the top bar; tallies restart rather than
      // being kept per team.
      if (State.enemyTeam && State.enemyTeam !== enemyTeam) State.perspectiveFlip = true;
      State.enemyTeam = enemyTeam;
    });
  }

  // Both teams feed: death = a hero on either side died; bag = a hero stole the other side's
  // dropped soul bag. Unknown sides (NPC slots, unresolved names) stay "other".
  function kindOf(snap, killerSide, victimSide) {
    const has = (name) => hasClass(snap, name);
    return !snap.objectVictim && otherSide(victimSide) ? "death"
      : has("SoulBagPickup") && has("SoulBagStolen") && otherSide(killerSide) ? "bag"
        : "other";
  }

  // Read once when the entry appears; C++ fills it before the next poll.
  function snapshot(entry, item) {
    const snap = { type: entry.paneltype };
    if (snap.type !== INFO_FEED) return snap;
    const killerBox = entry.FindChildTraverse("KillerContainer");
    item.killerClass = sideOf(killerBox);
    item.victimClass = sideOf(entry.FindChildTraverse("VictimContainer"));
    item.killerSide = isAbsolute(item.killerClass) ? null : item.killerClass;
    item.victimSide = isAbsolute(item.victimClass) ? null : item.victimClass;
    snap.cls = ENTRY_CLASSES.filter((name) => entry.BHasClass(name));
    snap.objectVictim = OBJECT_VICTIM_CLASSES.some((name) => hasClass(snap, name));
    const spectated = isAbsolute(item.killerClass) || isAbsolute(item.victimClass);
    if (!spectated) readLocalTeam(true); // re-side cached rows before freezing this entry's inputs
    if (spectated) snap.spec = item.killerClass + ">" + item.victimClass;
    snap.kind = spectated ? "pending" : kindOf(snap, item.killerSide, item.victimSide);
    snap.souls = textOf(firstOfType(killerBox, "gold", "Label"));
    const assistBox = entry.FindChildTraverse("AssistsContainer");
    snap.assists = valid(assistBox) ? assistBox.GetChildCount() : 0;
    snap.assisterIds = valid(assistBox) ? feedAssisters(assistBox) : [];
    // A spectated hero death may still turn out to be ours once the victim resolves.
    if (snap.kind === "death" || (snap.kind === "pending" && !snap.objectVictim)) {
      snap.teams = teamWorth();
      snap.teamsTeam2 = State.team2;
      snap.clock = clockText();
      diagnoseInputs(snap.teams, snap.clock);
    }
    snap.killer = null;
    snap.victim = null;
    return snap;
  }

  function summary(snap) {
    if (snap.type !== INFO_FEED) return snap.type;
    return heroText(snap.killer) + " -> " + heroText(snap.victim) + " souls=" + (snap.souls || "-") +
      " assists=" + snap.assists + " kind=" + snap.kind + " [" + snap.cls.join(",") + "]" +
      (snap.spec ? " spec=" + snap.spec : "");
  }

  function findFeed() {
    if (valid(UI.feed)) return UI.feed;
    if (Date.now() - lastFeedTry < FEED_RETRY_MS) return null;
    lastFeedTry = Date.now();
    const dataFeed = hudRoot().FindChildTraverse("DataFeed");
    const feed = valid(dataFeed) && dataFeed.paneltype === "HudDataFeed" ? dataFeed.FindChildTraverse("EventFeed") : null;
    if (!valid(feed)) return null;
    UI.feed = feed;
    log("watching #EventFeed");
    return feed;
  }

  function pollFeed() {
    const root = findFeed();
    const seen = {};
    const now = Date.now();
    const count0 = root ? root.GetChildCount() : 0;
    for (let i = 0; i < count0; i++) {
      const entry = root.GetChild(i);
      if (!valid(entry)) continue;
      let id = entry.GetAttributeString(ENTRY_ATTR, "");
      let item = id ? live[id] : null;
      if (!item) {
        id = String(++nextEntry);
        entry.SetAttributeString(ENTRY_ATTR, id);
        item = { id: id, panel: entry, firstSeen: now, lastTry: -Infinity, lastAssistTry: -Infinity, counted: false };
        item.snap = snapshot(entry, item);
        live[id] = item;
        if (isInfo(item)) resolveEntry(item);
        log("NEW #" + id + " " + summary(item.snap));
        queueDeath(item);
      } else if (!item.counted && isInfo(item) && !resolved(item.snap) && now - item.lastTry >= RETRY_MS) {
        // Only entries the top bar could not resolve yet are touched again.
        resolveEntry(item);
        if (resolved(item.snap)) log("RESOLVED #" + id + " " + summary(item.snap));
        queueDeath(item);
      }
      tryCount(item);
      seen[id] = true;
    }
    const head = State.assistQueue[0];
    if (head && now - head.lastAssistTry >= ASSIST_RETRY_MS) attributeAssists(false);
    Object.keys(live).forEach((id) => {
      if (seen[id]) return;
      const item = live[id];
      // Gone before assisters were known: give up on them (and anything queued behind).
      if (!item.assistDone && State.assistQueue.indexOf(item) >= 0) attributeAssists(true);
      // Gave up resolving: still count the souls, with whatever side stayed unknown.
      if (!item.counted && isInfo(item)) count(item);
      delete live[id];
    });
  }

  function tryCount(item) {
    if (item.counted || !isInfo(item) || !resolved(item.snap)) return;
    if (item.snap.kind === "death" && item.snap.assists > 0 && !item.assistDone) return;
    count(item);
  }

  // Each assister portrait is a CitadelHeroImage named "PlayerAssist<heroId>" (client 6759 rva
  // 1d53ca8); the name is the only readable id. Null when any portrait is unnamed.
  function feedAssisters(assistBox) {
    const ids = [];
    for (let i = 0; i < assistBox.GetChildCount(); i++) {
      const portrait = assistBox.GetChild(i);
      const named = /^PlayerAssist(\d+)$/.exec(valid(portrait) ? portrait.id || "" : "");
      const heroId = named ? Number(named[1]) : 0;
      if (!(heroId > 0)) return null;
      ids.push(heroId);
    }
    return ids;
  }

  function queueDeath(item) {
    if (item.queued || item.snap.kind !== "death" || item.snap.assists <= 0) return;
    if (!isAbsolute(item.killerClass) && !isAbsolute(item.victimClass) && !State.team1 && !State.team2) return;
    item.queued = true;
    const ids = item.snap.assisterIds;
    if (ids && ids.length === item.snap.assists) {
      // The feed names the assisters itself; top-bar counters (which lag while spectating)
      // stay the fallback. Keep their bases in step so later fallback deltas stay correct.
      item.assisters = ids.map((heroId) => whoOf(rowsWithHero(heroId, null)[0] || { heroId: heroId }));
      item.assistDone = true;
      item.assisters.forEach((who) => { if (who.key in State.assistBase) State.assistBase[who.key]++; });
      log("ASSIST #" + item.id + " feed " + item.assisters.map((who) => who.name + "(" + who.heroId + ")").join(","));
      return;
    }
    State.assistQueue.push(item);
    if (State.assistQueue.length === 1) attributeAssists(false);
  }

  // ---- tab + render -----------------------------------------------------------------------

  function sorted(table) {
    return Object.keys(table).map((k) => table[k]).sort((a, b) => b.souls - a.souls);
  }

  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  function rowPanel(list, index) {
    let panel = list.GetChild(index);
    if (valid(panel)) return panel;
    panel = $.CreatePanel("Panel", list, "");
    if (!panel.BLoadLayoutSnippet("FeederRow")) {
      log("ERR FeederRow snippet failed to load");
      panel.DeleteAsync(0);
      return null;
    }
    return panel;
  }

  // Chip label id -> [row field, singular word]; donors and recipients show different stats.
  const DONOR_CHIPS = { ChipDeaths: ["deaths", "death"], ChipBags: ["bags", "bag"] };
  const RECIPIENT_CHIPS = {
    ChipKills: ["kills", "kill"], ChipAssists: ["assists", "assist"], ChipShares: ["shares", "share"], ChipBags: ["bags", "bag"]
  };
  const CHIP_IDS = ["ChipDeaths", "ChipKills", "ChipAssists", "ChipShares", "ChipBags"];
  const TOP_ROWS = 3;
  // Child references of each list row (snippet children this script never removes), found
  // once per row panel instead of on every changed render.
  const ROW_REFS = { donors: [], recipients: [] };

  function rowRefs(slots, index, panel) {
    const refs = slots[index];
    if (refs && refs.panel === panel) return refs;
    slots[index] = {
      panel: panel,
      chips: CHIP_IDS.map((id) => panel.FindChildTraverse(id)),
      deathBar: panel.FindChildTraverse("FeederBarDeath"),
      bagBar: panel.FindChildTraverse("FeederBarBag"),
      image: panel.FindChildTraverse("HeroImage")
    };
    return slots[index];
  }

  function setRow(panel, refsOf, row, max, top, donors) {
    const chips = donors ? DONOR_CHIPS : RECIPIENT_CHIPS;
    const texts = CHIP_IDS.map((id) => chips[id] && row[chips[id][0]] > 0 ? plural(row[chips[id][0]], chips[id][1]) : "");
    // One bar per row: death souls, then stolen-bag souls, scaled against the top row.
    const pct = max > 0 ? Math.max(2, Math.round(row.souls / max * 100)) : 0;
    const bagPct = row.souls > 0 ? Math.round(pct * row.bagSouls / row.souls) : 0;
    const isTop = top && row.souls > 0;
    const sig = [row.name, row.heroId, row.neutral, row.side, row.souls, texts.join(","), pct, bagPct, isTop].join("|");
    panel.visible = true;
    if (panel.GetAttributeString("ff_sig", "") === sig) return;
    panel.SetAttributeString("ff_sig", sig);
    panel.SetHasClass("Neutral", row.neutral);
    panel.SetHasClass("NoHeroId", !row.neutral && !row.heroId);
    panel.SetHasClass("Top", isTop);
    // Bars take the hero's team color; NPC and unknown rows stay neutral.
    panel.SetHasClass("SideFriendly", row.side === "friendly");
    panel.SetHasClass("SideEnemy", row.side === "enemy");
    panel.SetDialogVariable("feeder_name", row.name);
    panel.SetDialogVariable("feeder_souls", formatSouls(row.souls));
    const refs = refsOf();
    refs.chips.forEach((chip, i) => {
      if (!valid(chip)) return;
      chip.text = texts[i];
      chip.visible = texts[i] !== "";
    });
    if (valid(refs.deathBar)) refs.deathBar.style.width = (pct - bagPct) + "%";
    if (valid(refs.bagBar)) refs.bagBar.style.width = bagPct + "%";
    const image = refs.image;
    if (row.heroId && valid(image) && image.GetAttributeInt("ff_hero", 0) !== row.heroId) {
      try {
        image.SetHeroID(row.heroId);
        image.SetAttributeInt("ff_hero", row.heroId);
      } catch (error) {
        log("ERR SetHeroID(" + row.heroId + "): " + error);
      }
    }
  }

  // Top three rows unless the list is expanded; the pill toggles and counts the hidden rows.
  function renderList(list, more, data, donors, expanded) {
    if (!valid(list)) return;
    const slots = donors ? ROW_REFS.donors : ROW_REFS.recipients;
    const max = data.length ? data[0].souls : 0;
    const limit = expanded ? data.length : Math.min(TOP_ROWS, data.length);
    let shown = 0;
    for (let i = 0; i < limit; i++) {
      const panel = rowPanel(list, i);
      if (!panel) break;
      setRow(panel, () => rowRefs(slots, i, panel), data[i], max, i === 0, donors);
      shown++;
    }
    for (let i = shown; i < list.GetChildCount(); i++) list.GetChild(i).visible = false;
    if (!valid(more)) return;
    more.visible = data.length > TOP_ROWS;
    more.SetDialogVariable("feeder_more", expanded ? "Show less" : "Show more (" + (data.length - TOP_ROWS) + ")");
  }

  function toggleMore(key) {
    State.expanded[key] = !State.expanded[key];
    State.dirty = true;
    render();
  }

  function render() {
    if (!State.dirty || !State.active || !valid(UI.section)) return;
    State.dirty = false;
    const donors = sorted(State.donors);
    renderList(UI.donors, UI.donorsMore, donors, true, State.expanded.donors);
    renderList(UI.recipients, UI.recipientsMore, sorted(State.recipients), false, State.expanded.recipients);
    // Footer totals per feeding team (top-bar friendly side = "our" team, also while spectating).
    const totals = { friendly: { souls: 0, deaths: 0, bags: 0 }, enemy: { souls: 0, deaths: 0, bags: 0 } };
    donors.forEach((row) => {
      const team = totals[row.side];
      if (!team) return;
      team.souls += row.souls;
      team.deaths += row.deaths;
      team.bags += row.bags;
    });
    const line = (team) => formatSouls(team.souls) + " souls across " + plural(team.deaths, "death") + " and " +
      plural(team.bags, "stolen bag");
    UI.section.SetDialogVariable("feeder_footer", donors.length
      ? "Team charity total: " + line(totals.friendly) + ". The enemy thanks you for your generosity." +
        (totals.enemy.souls > 0 ? " Enemy charity total: " + line(totals.enemy) + "." : "") +
        (State.estimated ? " Recipient splits/rankings include estimates (unknown or fallback inputs)." : "")
      : "No donations yet. Suspiciously responsible teams.");
  }

  function selectTab(feed) {
    State.active = feed;
    context.SetHasClass("FeederFeedActive", feed);
    UI.tabDamage.SetHasClass("Selected", !feed);
    UI.tabFeed.SetHasClass("Selected", feed);
    render();
  }

  // ---- loop ---------------------------------------------------------------------------------

  function readLocalTeam(force) {
    if (!valid(UI.hud)) return;
    const now = Date.now();
    if (!force && now - State.teamReadAt < TEAM_READ_MS) return;
    if (!force || State.teamReadAt === -Infinity) State.teamReadAt = now; // forced entry reads must not postpone color updates
    const team1 = UI.hud.BHasClass("localPlayerTeam1");
    const team2 = UI.hud.BHasClass("localPlayerTeam2");
    if (team1 !== State.team1 || team2 !== State.team2) dropRows();
    State.team1 = team1;
    State.team2 = team2;
  }

  function checkMatch() {
    if (!valid(UI.hud)) return;
    const inProgress = UI.hud.BHasClass("GameStateInProgress");
    const started = inProgress && !State.inProgress;
    if (started) reset("match started");
    State.inProgress = inProgress;
    // Colors use the 1 Hz read; relative entries force a refresh before resolving.
    readLocalTeam(started);
    // Only spectated (absolute-class) entries raise the flip, so it needs no team-class check.
    if (State.perspectiveFlip) reset("spectator perspective changed");
    // Spectators have neither class; use the team learned from spectated feed entries.
    const spectating = !State.team1 && !State.team2;
    const enemy1 = spectating ? State.enemyTeam === "team_1" : State.team2 && !State.team1;
    const enemy2 = spectating ? State.enemyTeam === "team_2" : State.team1 && !State.team2;
    const color = (enemy1 ? 1 : 0) + (enemy2 ? 2 : 0);
    if (State.enemyColor === color) return;
    State.enemyColor = color; // first apply writes both classes, clearing any stale reload state
    context.SetHasClass("FeederEnemyTeam1", enemy1);
    context.SetHasClass("FeederEnemyTeam2", enemy2);
  }

  function poll() {
    if (stopped) return;
    if (!valid(context)) { stopped = true; return; }
    try {
      nextFrame();
      checkMatch();
      pollFeed();
      render(); // once per poll, after every count of this pass
    } catch (error) {
      if (String(error) !== lastError) log("ERR " + error);
      lastError = String(error);
    }
    $.Schedule(POLL_SECONDS, poll);
  }

  function boot() {
    if (stopped) return;
    UI.tabDamage = context.FindChildTraverse("FeederTabDamage");
    UI.tabFeed = context.FindChildTraverse("FeederTabFeed");
    UI.section = context.FindChildTraverse("FeederFeedSection");
    UI.donors = context.FindChildTraverse("FeederDonors");
    UI.recipients = context.FindChildTraverse("FeederRecipients");
    UI.donorsMore = context.FindChildTraverse("FeederDonorsMore");
    UI.recipientsMore = context.FindChildTraverse("FeederRecipientsMore");
    if (![UI.tabDamage, UI.tabFeed, UI.section, UI.donors, UI.recipients].every(valid)) {
      $.Schedule(0.5, boot);
      return;
    }
    for (let p = context; valid(p); p = p.GetParent()) {
      if (p.paneltype === "CitadelHud") { UI.hud = p; break; }
    }
    State.inProgress = valid(UI.hud) && UI.hud.BHasClass("GameStateInProgress");
    UI.tabDamage.SetPanelEvent("onactivate", () => selectTab(false));
    UI.tabFeed.SetPanelEvent("onactivate", () => selectTab(true));
    if (valid(UI.donorsMore)) UI.donorsMore.SetPanelEvent("onactivate", () => toggleMore("donors"));
    if (valid(UI.recipientsMore)) UI.recipientsMore.SetPanelEvent("onactivate", () => toggleMore("recipients"));
    selectTab(context.BHasClass("FeederFeedActive"));
    log("boot" + (valid(UI.hud) ? "" : " (CitadelHud not found; no match reset)"));
    poll();
  }

  boot();
})();
