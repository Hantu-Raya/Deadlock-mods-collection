// Throwaway spike for observer_hud/PLAN.md phase 1: can a script hosted by
// hud_spectate_bar.xml load our own layouts into #TopBar, each top-bar card
// and #EscapeMenu, and do they survive panorama_reload_layout?
(() => {
  "use strict";

  const TAG = "[OH-SPIKE]";
  const BAR = "file://{resources}/layout/observer_hud/spike_bar.xml";
  const ALIAS = "file://{resources}/layout/observer_hud/spike_alias.xml";
  const MENU = "file://{resources}/layout/observer_hud/spike_menu.xml";
  const LOGO = "https://raw.githubusercontent.com/github/explore/main/topics/steam/steam.png";
  const TEAMS = ["TeamFriendly", "TeamEnemy"];

  const context = $.GetContextPanel();
  const gen = (context.OHSpikeGen = (context.OHSpikeGen || 0) + 1);
  const valid = (panel) => !!panel && typeof panel.IsValid === "function" && panel.IsValid();
  const log = (message) => $.Msg(`${TAG} g${gen} ${message}`);

  const UI = { top: null, topBar: null, escape: null, bar: null, menu: null, logo: null };
  const seen = {};
  let ticks = 0;

  // Log a value only when it changes, so console.log stays readable.
  const report = (key, value) => {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (seen[key] === text) return;
    seen[key] = text;
    log(`${key} ${text}`);
  };

  const ancestry = () => {
    const chain = [];
    let panel = context;
    while (valid(panel)) {
      const classes = ["spec_mode", "replay_playback", "TeamSpectator", "spectatingUnit"].filter((name) => panel.BHasClass(name));
      chain.push(`${panel.paneltype}#${panel.id || ""}${classes.length ? "." + classes.join(".") : ""}`);
      UI.top = panel;
      panel = panel.GetParent();
    }
    return chain;
  };

  const rect = (panel) => {
    if (!valid(panel)) return null;
    const pos = panel.GetPositionWithinWindow();
    return {
      x: Math.round(pos.x), y: Math.round(pos.y),
      w: Math.round(panel.actuallayoutwidth), h: Math.round(panel.actuallayoutheight),
      s: Math.round((panel.actualuiscale_x || 0) * 1000) / 1000
    };
  };

  const load = (parent, id, layout) => {
    const old = parent.FindChild(id);
    if (valid(old)) {
      old.DeleteAsync(0);
      log(`replaced stale ${id}`);
    }
    const panel = $.CreatePanel("Panel", parent, id);
    if (!panel.BLoadLayout(layout, false, false)) {
      panel.DeleteAsync(0);
      log(`BLoadLayout failed: ${layout}`);
      return null;
    }
    return panel;
  };

  const ensureBar = () => {
    if (valid(UI.bar) && valid(UI.topBar)) return true;
    UI.topBar = UI.top.FindChildTraverse("TopBar");
    if (!valid(UI.topBar)) return false;
    UI.bar = load(UI.topBar, "OHSpikeBarHost", BAR);
    if (!valid(UI.bar)) return false;
    log(`bar injected into ${UI.topBar.paneltype}#TopBar`);
    const ban = UI.bar.FindChildTraverse("OHSpikeBan");
    try { ban.SetHeroID(1); } catch (error) { log(`SetHeroID threw ${error}`); }
    const slot = UI.bar.FindChildTraverse("OHSpikeLogoSlot");
    const image = $.CreatePanel("Image", slot, "OHSpikeLogo", { scaling: "stretch-to-fit-preserve-aspect", hittest: "false" });
    image.AddClass("OHSpikeLogo");
    $.RegisterEventHandler("ImageLoaded", image, () => log("web logo ImageLoaded"));
    $.RegisterEventHandler("ImageFailedLoad", image, () => log("web logo ImageFailedLoad"));
    image.SetImage(LOGO);
    return true;
  };

  const ensureMenu = () => {
    if (valid(UI.menu) && valid(UI.escape)) return true;
    UI.escape = UI.top.FindChildTraverse("EscapeMenu");
    if (!valid(UI.escape)) return false;
    UI.menu = load(UI.escape, "OHSpikeMenuHost", MENU);
    if (!valid(UI.menu)) return false;
    const root = UI.menu;
    root.FindChildTraverse("OHSpikeOpen").SetPanelEvent("onactivate", () => {
      // The created panel becomes the layout root; set the class on it and its first child to learn which.
      root.SetHasClass("OHOpen", true);
      if (valid(root.Children()[0])) root.Children()[0].SetHasClass("OHOpen", true);
      log("editor opened (button onactivate reached the host script)");
      const entry = root.FindChildTraverse("OHSpikeEntry");
      if (valid(entry)) entry.SetFocus();
    });
    root.FindChildTraverse("OHSpikeClose").SetPanelEvent("onactivate", () => {
      root.SetHasClass("OHOpen", false);
      for (const child of root.Children()) child.SetHasClass("OHOpen", false);
      log("editor closed");
    });
    log(`menu injected into ${UI.escape.paneltype}#EscapeMenu; created panel took the layout root class: ${root.BHasClass("OHSpikeMenu")}`);
    return true;
  };

  // One alias label per stock card, re-attached when the engine rebuilds a card.
  const ensureAliases = () => {
    let cards = 0;
    let labels = 0;
    let added = 0;
    for (const teamId of TEAMS) {
      const team = valid(UI.topBar) ? UI.topBar.FindChildTraverse(teamId) : null;
      const players = valid(team) ? team.FindChildTraverse("PlayersContainer") : null;
      if (!valid(players)) continue;
      for (const card of players.Children()) {
        if (!valid(card) || card.paneltype !== "CitadelHudTopBarPlayer") continue;
        cards++;
        const area = card.FindChildTraverse("HeroImageArea");
        if (!valid(area)) continue;
        let host = area.FindChild("OHSpikeAliasHost");
        if (!valid(host)) {
          host = load(area, "OHSpikeAliasHost", ALIAS);
          if (valid(host)) added++;
        }
        if (valid(host)) labels++;
      }
    }
    report("aliases", { cards, labels, added: added > 0 });
    return { cards, labels };
  };

  const mirror = () => {
    const entry = valid(UI.menu) ? UI.menu.FindChildTraverse("OHSpikeEntry") : null;
    const text = valid(entry) ? String(entry.text || "") : "";
    const echo = valid(UI.bar) ? UI.bar.FindChildTraverse("OHSpikeEcho") : null;
    if (valid(echo) && text && echo.text !== text) echo.text = text;
    // The first card's alias takes the typed text: the override path for aliases.
    const team = valid(UI.topBar) ? UI.topBar.FindChildTraverse("TeamFriendly") : null;
    const label = valid(team) ? team.FindChildTraverse("OHSpikeAliasText") : null;
    if (valid(label) && text && label.text !== text) label.text = text;
    report("typed", text);
  };

  const finite = (r) => !!r && [r.x, r.y, r.w, r.h, r.s].every(Number.isFinite) && r.s > 0;
  const set = (panel, key, value) => { if (panel.style[key] !== value) panel.style[key] = value; };

  // TopBar is width: fit-children (1400 px from its widest stock child), and it clips
  // children outside its bounds. Widening our bar to the HUD width makes TopBar span
  // the screen; stock children are centred, so they should stay where they were.
  const widen = () => {
    const hud = rect(UI.top);
    if (!finite(hud)) return;
    set(UI.bar, "width", `${Math.round(hud.w / hud.s)}px`);
  };

  const place = () => {
    const left = UI.bar.FindChildTraverse("OHSpikeLeft");
    const right = UI.bar.FindChildTraverse("OHSpikeRight");
    const clock = UI.bar.FindChildTraverse("OHSpikeClock");
    const bar = rect(UI.bar);
    const amber = rect(UI.topBar.FindChildTraverse("TeamFriendly"));
    const sapphire = rect(UI.topBar.FindChildTraverse("TeamEnemy"));
    const time = rect(UI.topBar.FindChildTraverse("GameTime"));
    const plate = rect(left);
    if (![bar, amber, sapphire, plate].every(finite)) return;
    const px = (value) => `${Math.round(value / bar.s)}px`;
    set(left, "marginLeft", px(Math.max(0, amber.x - bar.x - plate.w - 12 * bar.s)));
    set(right, "marginLeft", px(sapphire.x + sapphire.w - bar.x + 12 * bar.s));
    if (finite(time)) {
      set(clock, "marginLeft", px(time.x + time.w / 2 - bar.x - 130 * bar.s));
      set(clock, "marginTop", px(time.y + time.h - bar.y + 40 * bar.s));
    }
  };

  const geometry = () => {
    const spectate = UI.top.FindChildTraverse("spectate_target");
    report("geo", {
      screen: { w: Math.round(UI.top.actuallayoutwidth), h: Math.round(UI.top.actuallayoutheight) },
      topBar: rect(UI.topBar), bar: rect(UI.bar), left: rect(UI.bar.FindChildTraverse("OHSpikeLeft")),
      right: rect(UI.bar.FindChildTraverse("OHSpikeRight")), amber: rect(UI.topBar.FindChildTraverse("TeamFriendly")),
      sapphire: rect(UI.topBar.FindChildTraverse("TeamEnemy")), clock: rect(UI.topBar.FindChildTraverse("GameTime")),
      objectives: rect(UI.topBar.FindChildTraverse("ObjectivesMap")), spectateText: rect(spectate)
    });
  };

  const tick = () => {
    if (context.OHSpikeGen !== gen) return log("stopped (newer instance)");
    ticks++;
    try {
      report("ancestry", ancestry().join(" > "));
      const bar = ensureBar();
      const menu = ensureMenu();
      report("status", { bar, menu });
      if (bar) {
        ensureAliases();
        widen();
        place();
        mirror();
        if (ticks % 5 === 1) geometry();
      }
    } catch (error) {
      log(`tick error ${error && error.stack ? error.stack : error}`);
    }
    $.Schedule(1, tick);
  };

  // Phase 1b: world-bar messages from citadel_status_effect.xml through their sibling relays.
  const world = { msgs: 0, names: {}, stuns: 0, sample: "" };
  const onWorld = (raw) => {
    if (context.OHSpikeGen !== gen || typeof raw !== "string" || raw.indexOf("OH_SPIKE_WORLD") < 0) return;
    try {
      const msg = JSON.parse(raw);
      if (msg.magic_word !== "OH_SPIKE_WORLD") return;
      world.msgs++;
      world.names[msg.name || `#${msg.instance}`] = msg.n;
      if (msg.stunned) world.stuns++;
      if (msg.n > 0) world.sample = `${msg.name}: ${msg.ids.join(",")}`;
    } catch (error) {
      log(`world message parse error ${error}`);
    }
  };
  $.RegisterForUnhandledEvent("ClientUI_FireOutput", onWorld);
  const worldReport = () => {
    if (context.OHSpikeGen !== gen) return;
    let shared = null;
    try { shared = GameUI.CustomUIConfig().ohSpikeWorld || null; } catch (error) { shared = null; }
    report("world", { msgs: world.msgs, bars: Object.keys(world.names).length, stuns: world.stuns, shared, sample: world.sample });
    $.Schedule(5, worldReport);
  };
  $.Schedule(5, worldReport);

  log("host script loaded");
  $.Schedule(0.5, tick);
})();
