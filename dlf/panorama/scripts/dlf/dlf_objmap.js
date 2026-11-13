// Keeps QOLLOCK's objectives map disc (citadel_hud_top_bar.xml #ObjectivesMap, objectives_map.css) true while
// spectating. User 2026-10-25: the disc did not follow destroyed objectives, and a rewound demo should bring
// them back. client.dll 6819: the disc only gets its masks from the server's answer to the getobjectivemap
// command, which the client sends when the local player connects, so a spectator or a demo never fills it
// (ENGINE.md). Its SetObjectivesMask event is not reachable from script (live 07:55: "Invalid event name to
// DispatchEvent"), so DLF sets the .Alive class on the disc's icons itself (stock objectives_map.xml:
// #Team1Core, #Team1Titan, #Team1Tier1_1-4, #Team1Tier2_1-4, the same for Team2), comparing every second so
// a repaint by the engine from its own stale mask is undone. The masks use the engine's layout (rva
// 0x1e0d4a0, per team: bit 0 Core, bits 1-4 Tier1 lanes 1-4, 5-8 Tier2, 9 Titan, 10-11 Generator, 12-15
// Barracks; the disc shows only the first ten). Source: the minimap. Each living objective has a #hud_minimap
// .map_button.boss marker with .team1/.team2, a lane colour (.yellowLane .greenLane .blueLane .purpleLane =
// lanes 1-4) and its tier (.boss_icon_t1 guardian, .boss_icon_t2 walker, .boss_barracks_icon base guardian,
// .boss_icon_t3 patron = Core and Titan, .boss_buildingzip shrine = the Generators in turn). A destroyed
// objective loses its marker, and a demo rewound past its death gets it back. Nothing is written until the
// minimap has a team marker (an all-dead disc before the markers exist); mask changes are logged.
(() => {
  "use strict";

  const TAG = "[DLF-OBJMAP]";
  const TICK_SEC = 1;
  const FIND_RETRY_MS = 10000;
  // Quoted: the keys are class names, and Closure ADVANCED never renames quoted keys.
  const LANES = { "yellowLane": 1, "greenLane": 2, "blueLane": 3, "purpleLane": 4 };
  const TIER_BASE = { "boss_icon_t1": 0, "boss_icon_t2": 4, "boss_barracks_icon": 11 };

  const context = $.GetContextPanel();
  if (typeof context.DLFObjMapStop === "function") context.DLFObjMapStop();
  let stopped = false;
  let errorShown = false;
  context.DLFObjMapStop = () => { stopped = true; };

  const S = $.DLFState;
  const valid = S.valid;
  const attrs = S.hudAttrs(context);

  const Find = { disc: null, minimap: null, discAt: 0, minimapAt: 0 };
  // The disc's icons as [id, team, bit]; icons[i] caches the panel, found again while missing or stale.
  const ICONS = [];
  for (const team of [0, 1]) {
    ICONS.push([`Team${team + 1}Core`, team, 0], [`Team${team + 1}Titan`, team, 9]);
    for (let lane = 1; lane <= 4; lane++) ICONS.push([`Team${team + 1}Tier1_${lane}`, team, lane], [`Team${team + 1}Tier2_${lane}`, team, 4 + lane]);
  }
  const icons = ICONS.map(() => null);
  let loggedSig = "";

  function find(key, atKey, lookup, now) {
    if (valid(Find[key])) return Find[key];
    Find[key] = null;
    if (now < Find[atKey]) return null;
    const found = lookup();
    if (valid(found)) Find[key] = found;
    else Find[atKey] = now + FIND_RETRY_MS;
    return Find[key];
  }

  // [Team1 mask, Team2 mask] from the living markers, or null when there is no team marker yet.
  function masks(minimap) {
    const out = [0, 0];
    const shrines = [0, 0];
    let any = false;
    for (const marker of minimap.FindChildrenWithClassTraverse("boss")) {
      const team = marker.BHasClass("team1") ? 0 : marker.BHasClass("team2") ? 1 : -1;
      if (team < 0) continue;
      let lane = 0;
      for (const cls in LANES) if (marker.BHasClass(cls)) lane = LANES[cls];
      let bits = 0;
      for (const cls in TIER_BASE) if (lane && marker.BHasClass(cls)) bits |= 1 << (TIER_BASE[cls] + lane);
      if (marker.BHasClass("boss_icon_t3")) bits |= 1 | (1 << 9);
      if (marker.BHasClass("boss_buildingzip") && shrines[team] < 2) bits |= 1 << (10 + shrines[team]++);
      if (!bits) continue;
      out[team] |= bits;
      any = true;
    }
    return any ? out : null;
  }

  function paint(disc, next) {
    ICONS.forEach(([id, team, bit], i) => {
      if (!valid(icons[i])) icons[i] = disc.FindChildTraverse(id) || null;
      const icon = icons[i];
      if (!icon) return;
      const alive = (next[team] & (1 << bit)) !== 0;
      if (icon.BHasClass("Alive") !== alive) icon.SetHasClass("Alive", alive);
    });
  }

  function step(now) {
    const minimap = find("minimap", "minimapAt", () => attrs.root().FindChildTraverse("hud_minimap"), now);
    const disc = find("disc", "discAt", () => context.FindChildTraverse("ObjectivesMap"), now);
    if (!minimap || !disc) return;
    const next = masks(minimap);
    if (!next) return;
    paint(disc, next);
    const sig = `${next[0]}:${next[1]}`;
    if (sig === loggedSig) return;
    loggedSig = sig;
    $.Msg(`${TAG} masks ${next[0].toString(2)} / ${next[1].toString(2)}`);
  }

  function tick() {
    if (stopped) return;
    $.Schedule(TICK_SEC, tick);
    try {
      step(Date.now());
    } catch (e) {
      if (!errorShown) {
        errorShown = true;
        $.Msg(`${TAG} tick error: ${e && e.message ? e.message : e}`);
      }
    }
  }

  tick();
})();
