// DLF broadcast banner: fills the banner above the top bar with the match state and the live
// player names of the top-bar heroes underneath each name slot. The match state is
// dlf/match.json (DLF_MATCH, generated into dlf_match.js at build time) until the ESC menu
// publishes edits on the HUD root attribute $.DLFState.ATTR; both go through $.DLFState.normalize.
// It also applies the editor's text style per section and the team logos: each team's default is its
// faction emblem from the PSD (Amber the Hidden King, Sapphire the Archmother); a web logo is a new Image
// per URL and replaces the emblem only once it has loaded; each team's logo state ("default",
// "loading", "loaded", "failed") goes to the ESC menu on the HUD root attribute $.DLFState.LOGO_STATUS_ATTR.
(() => {
  "use strict";

  const TAG = "[DLF]";
  const SLOTS = 6;
  const TICK_SEC = 1;
  const RESCAN_MS = 5000;
  const SIDES = ["Left", "Right"];
  // Stock top-bar team panels are fixed by game team: TeamFriendly team="2" (Amber),
  // TeamEnemy team="3" (Sapphire). Which one is drawn on the left depends on classes.
  const TEAMS = [
    { key: "amber", panelId: "TeamFriendly" },
    { key: "sapphire", panelId: "TeamEnemy" }
  ];

  const context = $.GetContextPanel();
  if (typeof context.DLFBannerStop === "function") context.DLFBannerStop();
  let stopped = false;
  context.DLFBannerStop = () => { stopped = true; };

  const isValid = $.DLFState.valid;
  const attrs = $.DLFState.hudAttrs(context);

  const DEFAULTS = $.DLFState.defaults();
  // Team logo slot: the PSD emblem box (83x83) centered per side; the height cap keeps a scaled logo
  // inside the 100px art (the emblems hang into its torn bottom edge, as in the PSD).
  const LOGO_BOX = { width: 83, height: 83, maxHeight: 90 };
  const LOGO_CENTER = { Left: { x: 268, y: 43 }, Right: { x: 1653, y: 40 } };
  const EMBLEMS = {
    amber: "s2r://panorama/images/dlf/dlf_emblem_amber.vtex",
    sapphire: "s2r://panorama/images/dlf/dlf_emblem_sapphire.vtex"
  };

  // Fit widths (px) per text section: each label's band minus 4 px; [minimum fitted size, section].
  // Sizes stay whole numbers (the engine's own shrink squashes the stencil font).
  const FIT = { event: [206, 12], team: [306, 14], player: [86, 8], score: [44, 16], series: [206, 12] };
  const EVENT_LINE2_MIN = 9;
  const PLAYER_HALF_WIDTH = 44; // .DLFPlayerName is 88px wide, one top-bar card

  const UI = { banner: null, labels: {}, bans: {}, groups: {}, logos: {} };
  const State = {
    lastText: new Map(),
    lastFit: new Map(),
    lastPlace: new Map(),
    lastBan: new Map(),
    teams: {},
    nextRescanMs: 0,
    match: DEFAULTS,
    names: $.DLFState.normalizeNames(null),
    accounts: {}, // game name -> Steam account id, from the ESC menu's players-list probe
    gameNames: {}, // team key -> live game name per slot, read once per tick
    styleSig: "",
    twoBans: null, // the .DLFTwoBans class last written (state.banCount 2)
    logoSeq: 0
  };
  // Per side: the logo box, its emblem Image and team, the current web Image (null = emblem), its
  // URL, scale and load state.
  const Logos = {};

  const setText = (label, text) => {
    if (State.lastText.get(label) === text) return;
    label.text = text;
    State.lastText.set(label, text);
  };

  const setBan = (image, heroId) => {
    if (State.lastBan.get(image) === heroId) return;
    if (heroId > 0) image.SetHeroID(heroId);
    image.SetHasClass("DLFBanEmpty", !(heroId > 0));
    State.lastBan.set(image, heroId);
  };

  // Every banner panel the script writes is a descendant of #DLFBanner: while the banner is valid they
  // are, so only the banner is checked each tick (a layout reload replaces the whole tree).
  const cacheBanner = () => {
    if (isValid(UI.banner)) return true;
    const banner = context.FindChildTraverse("DLFBanner");
    if (!isValid(banner)) return false;
    const ids = ["DLFEventLine1", "DLFEventLine2", "DLFSeriesFormat"];
    const banIds = [];
    const groupIds = ["DLFEventStack"];
    const logoIds = [];
    for (const side of SIDES) {
      ids.push(`DLF${side}TeamName`, `DLF${side}Score`);
      for (let i = 0; i < SLOTS; i++) ids.push(`DLF${side}Player${i}`);
      for (let i = 0; i < $.DLFState.BAN_SLOTS; i++) banIds.push(`DLF${side}Ban${i}`);
      groupIds.push(`DLF${side}Players`);
      logoIds.push(`DLF${side}Logo`);
    }
    for (const [list, store] of [[ids, UI.labels], [banIds, UI.bans], [groupIds, UI.groups], [logoIds, UI.logos]]) {
      for (const id of list) {
        const panel = banner.FindChildTraverse(id);
        if (!isValid(panel)) return false;
        store[id] = panel;
      }
    }
    UI.banner = banner;
    State.lastText.clear();
    State.lastBan.clear();
    State.lastFit.clear();
    State.lastPlace.clear();
    State.styleSig = "";
    State.twoBans = null;
    for (const side of SIDES) {
      const panel = UI.logos[`DLF${side}Logo`];
      const emblem = banner.FindChildTraverse(`DLF${side}LogoDefault`);
      if (!isValid(emblem)) return false;
      // Web logo images of a previous script instance (layout reload) are ours to remove.
      for (const child of panel.Children()) if (child.BHasClass("DLFLogoCustom")) child.DeleteAsync(0);
      panel.RemoveClass("DLFLogoCustomShown");
      // The layout's emblem matches the stock side (Amber left); setLogo swaps it when the teams swap.
      Logos[side] = { panel, emblem, emblemTeam: side === "Left" ? "amber" : "sapphire", image: null, url: "",
        scale: 0, team: "", status: "default" };
    }
    return true;
  };

  // The match state and the session-only aliases from the ESC menu, re-read when they change.
  const refreshMatch = () => {
    const match = attrs.changed($.DLFState.ATTR);
    if (match !== undefined) State.match = match ? $.DLFState.normalize(match, DEFAULTS) : DEFAULTS;
    const names = attrs.changed($.DLFState.NAMES_ATTR);
    if (names !== undefined) State.names = $.DLFState.normalizeNames(names);
    const accounts = attrs.changed($.DLFState.ACCOUNTS_ATTR);
    if (accounts !== undefined) State.accounts = $.DLFState.normalizeAccounts(accounts);
  };

  // The live game names per team and slot (one text read per player per tick); the ESC menu's
  // player rows get them on change.
  const readGameNames = () => {
    for (const team of TEAMS) {
      const live = State.teams[team.key];
      State.gameNames[team.key] = Array.from({ length: SLOTS }, (_, i) => playerName(live ? live.players[i] : null));
    }
    attrs.write($.DLFState.ROSTER_ATTR, State.gameNames);
  };

  // Left/right placement follows the stock CSS: .friend/.team1 left, .enemy/.team2 right.
  const sideOf = (panel, fallback) => {
    if (panel.BHasClass("enemy")) return "Right";
    if (panel.BHasClass("friend")) return "Left";
    if (panel.BHasClass("team2")) return "Right";
    if (panel.BHasClass("team1")) return "Left";
    return fallback;
  };

  const readPlayers = (teamPanel) => {
    const container = teamPanel.FindChildTraverse("PlayersContainer");
    if (!isValid(container)) return [];
    const players = [];
    for (const player of container.Children()) {
      if (players.length >= SLOTS) break;
      if (!isValid(player) || player.paneltype !== "CitadelHudTopBarPlayer") continue;
      const label = player.FindChildrenWithClassTraverse("AlwaysPlayerName")[0] ||
        player.FindChildrenWithClassTraverse("PlayerName")[0] || null;
      players.push({ panel: player, label });
    }
    return players;
  };

  const rosterValid = (team) => !!team && isValid(team.panel) &&
    team.players.every((player) => isValid(player.panel) && (!player.label || isValid(player.label)));

  const refreshTeams = (nowMs) => {
    const rescan = nowMs >= State.nextRescanMs || TEAMS.some((team) => !rosterValid(State.teams[team.key]));
    if (!rescan) return;
    State.nextRescanMs = nowMs + RESCAN_MS;
    for (const team of TEAMS) {
      const panel = context.FindChildTraverse(team.panelId);
      State.teams[team.key] = isValid(panel) ? { panel, players: readPlayers(panel) } : null;
    }
  };

  const playerName = (player) => {
    if (!player || !player.label || !player.panel.visible) return "";
    return $.DLFState.cleanName(player.label.text, $.DLFState.MAX_TEXT);
  };

  // One section's font on its labels; offsets move the section's group. Size and letter spacing
  // depend on the text too, so fitText sets them.
  const fontStyle = (panel, entry) => {
    const font = $.DLFState.FONTS[entry.font] || $.DLFState.FONTS.modesto;
    panel.style.fontFamily = font.family;
    panel.style.fontWeight = font.weight;
    panel.style.fontStyle = font.style;
  };

  // The largest whole size up to the style's size at which the label's text fits its band, with the
  // style's letter spacing, or without it when even the minimum size does not fit; written only when
  // it changes.
  const fitText = (label, section, text, max = State.match.style[section].size, min = FIT[section][1]) => {
    const entry = State.match.style[section];
    const width = FIT[section][0];
    let spacing = entry.spacing;
    let size = $.DLFState.fitFontSize(text, entry.font, max, min, spacing, width);
    if (spacing > 0 && $.DLFState.textWidth(text, entry.font, size, spacing) > width) {
      spacing = 0;
      size = $.DLFState.fitFontSize(text, entry.font, max, min, 0, width);
    }
    const key = `${size}/${spacing}`;
    if (State.lastFit.get(label) === key) return;
    label.style.fontSize = `${size}px`;
    label.style.letterSpacing = `${spacing}px`;
    State.lastFit.set(label, key);
  };

  const setFitted = (label, section, text) => {
    setText(label, text);
    fitText(label, section, text);
  };

  // The banner's window x and UI scale, read once per render for all twelve cards.
  const bannerFrame = () => ({
    x: Number(UI.banner.GetPositionWithinWindow().x),
    scale: Number(UI.banner.actualuiscale_x) || 1
  });

  // Center of a top-bar card in banner px, or null before it is laid out or while hidden. Window
  // positions are screen px; the UI scale converts them back to the banner's 1920-wide layout.
  const cardCenter = (card, frame) => {
    if (!card || !card.visible) return null; // refreshTeams checked every card this tick
    const width = Number(card.actuallayoutwidth) || 0;
    if (width <= 0) return null;
    const x = (Number(card.GetPositionWithinWindow().x) - frame.x + width / 2) / frame.scale;
    return Number.isFinite(x) ? x : null;
  };

  // Puts a name label under its own card (the stock bar packs short teams toward the clock, and the
  // packing differs by mode); an unplaced label stays hidden.
  const placeName = (label, card, frame) => {
    const center = cardCenter(card, frame);
    const left = center === null ? null : Math.round(center - PLAYER_HALF_WIDTH);
    if (State.lastPlace.get(label) === left) return;
    State.lastPlace.set(label, left);
    label.SetHasClass("DLFUnplaced", left === null);
    if (left !== null) label.style.marginLeft = `${left}px`;
  };
  const offset = (panel, entry) => {
    panel.style.transform = `translate3d(${entry.x}px, ${entry.y}px, 0px)`;
  };

  // Written only when the style changes (or the banner was re-cached), never on a steady tick.
  const applyStyle = () => {
    const style = State.match.style;
    const signature = JSON.stringify(style);
    if (signature === State.styleSig) return;
    State.styleSig = signature;
    State.lastFit.clear(); // sizes are refitted for the new style
    const labels = UI.labels;
    fontStyle(labels.DLFEventLine1, style.event);
    fontStyle(labels.DLFEventLine2, style.event);
    offset(UI.groups.DLFEventStack, style.event);
    fontStyle(labels.DLFSeriesFormat, style.series);
    offset(labels.DLFSeriesFormat, style.series);
    for (const side of SIDES) {
      fontStyle(labels[`DLF${side}TeamName`], style.team);
      offset(labels[`DLF${side}TeamName`], style.team);
      fontStyle(labels[`DLF${side}Score`], style.score);
      offset(labels[`DLF${side}Score`], style.score);
      for (let i = 0; i < SLOTS; i++) fontStyle(labels[`DLF${side}Player${i}`], style.player);
      offset(UI.groups[`DLF${side}Players`], style.player);
    }
  };

  const sizeLogo = (side, slot, scale) => {
    if (slot.scale === scale) return;
    slot.scale = scale;
    const width = Math.round(LOGO_BOX.width * scale / 100);
    const height = Math.min(LOGO_BOX.maxHeight, Math.round(LOGO_BOX.height * scale / 100));
    slot.panel.style.width = `${width}px`;
    slot.panel.style.height = `${height}px`;
    slot.panel.style.marginLeft = `${Math.round(LOGO_CENTER[side].x - width / 2)}px`;
    slot.panel.style.marginTop = `${Math.round(LOGO_CENTER[side].y - height / 2)}px`;
  };

  // The default logo is the team's emblem, so it follows the team when the sides swap.
  const setEmblem = (slot, team) => {
    if (slot.emblemTeam === team || !EMBLEMS[team]) return;
    slot.emblem.SetImage(EMBLEMS[team]);
    slot.emblemTeam = team;
  };

  const dropLogoImage = (slot) => {
    const image = slot.image;
    slot.image = null;
    slot.panel.RemoveClass("DLFLogoCustomShown");
    if (!isValid(image)) return;
    try {
      image.DeleteAsync(0);
    } catch (e) {}
  };

  // A new Image per source: its load events belong to that source alone, and a replaced Image's late
  // events find slot.image changed and do nothing. A URL gives one or more sources
  // ($.DLFState.logoSources: a host link's GIF, then a still image); a failed source makes way for the
  // next, and the emblem stays until one loads. The URL itself is never logged.
  const setLogo = (side, team, logo) => {
    const slot = Logos[side];
    if (!slot) return;
    slot.team = team;
    setEmblem(slot, team);
    sizeLogo(side, slot, logo.scale);
    if (slot.url === logo.url) return;
    dropLogoImage(slot);
    slot.url = logo.url;
    slot.status = logo.url ? "loading" : "default";
    if (logo.url) loadLogo(side, slot, $.DLFState.logoSources(logo.url), 0);
  };

  const loadLogo = (side, slot, sources, index) => {
    const image = $.CreatePanel("Image", slot.panel, `DLF${side}LogoCustom${++State.logoSeq}`, {
      scaling: "stretch-to-fit-preserve-aspect", hittest: "false"
    });
    image.AddClass("DLFLogoImage");
    image.AddClass("DLFLogoCustom");
    slot.image = image;
    $.RegisterEventHandler("ImageLoaded", image, () => {
      if (stopped || slot.image !== image) return;
      slot.status = "loaded";
      slot.panel.AddClass("DLFLogoCustomShown");
      publishLogoStatus();
    });
    $.RegisterEventHandler("ImageFailedLoad", image, () => {
      if (stopped || slot.image !== image) return;
      dropLogoImage(slot);
      if (index + 1 < sources.length) {
        loadLogo(side, slot, sources, index + 1);
        return;
      }
      slot.status = "failed";
      publishLogoStatus();
      $.Msg(`${TAG} ${slot.team} logo failed to load; showing the team emblem`);
    });
    image.SetImage(sources[index]);
  };

  // { amber: state, sapphire: state } for the ESC menu's logo rows; written on change.
  const publishLogoStatus = () => {
    const status = {};
    for (const side of SIDES) {
      const slot = Logos[side];
      if (slot && slot.team) status[slot.team] = slot.status;
    }
    attrs.write($.DLFState.LOGO_STATUS_ATTR, status);
  };

  const render = () => {
    applyStyle();
    const match = State.match;
    setFitted(UI.labels.DLFEventLine1, "event", `SEASON ${match.season}`);
    // The second event line keeps the PSD ratio below line 1 and its own smaller minimum.
    const line2 = `MATCH #${match.match}`;
    const line2Max = $.DLFState.eventLine2Size(match.style.event.size);
    setText(UI.labels.DLFEventLine2, line2);
    fitText(UI.labels.DLFEventLine2, "event", line2, line2Max, Math.min(line2Max, EVENT_LINE2_MIN));
    setFitted(UI.labels.DLFSeriesFormat, "series", match.seriesFormat);
    // Two bans per team: the art without the inner boxes, Sapphire's bans on its outer boxes
    // (dlf_banner.css); a slot past banCount is written empty.
    const twoBans = match.banCount === 2;
    if (State.twoBans !== twoBans) {
      UI.banner.SetHasClass("DLFTwoBans", twoBans);
      State.twoBans = twoBans;
    }

    const placed = {};
    const frame = bannerFrame();
    // { in-game name: alias } for the world healthbars, far-away markers and kill feed (dlf_names.js,
    // dlf_debuffs.js -> DLF_DEBUFF_CONFIG). A name two cards share gets no alias there (as Observer HUD).
    const aliases = {};
    const seen = new Map(); // upper-cased name -> times seen
    TEAMS.forEach((team, index) => {
      const live = State.teams[team.key];
      let side = live ? sideOf(live.panel, SIDES[index]) : SIDES[index];
      if (placed[side]) side = side === "Left" ? "Right" : "Left";
      placed[side] = true;
      const details = match[team.key];
      setFitted(UI.labels[`DLF${side}TeamName`], "team", details.name);
      setFitted(UI.labels[`DLF${side}Score`], "score", details.score === null ? "" : String(details.score));
      details.bans.forEach((heroId, slot) => setBan(UI.bans[`DLF${side}Ban${slot}`], slot < match.banCount ? heroId : 0));
      setLogo(side, team.key, details.logo);
      const players = live ? live.players : [];
      for (let i = 0; i < SLOTS; i++) {
        const game = State.gameNames[team.key][i];
        const name = $.DLFState.displayName(State.names, team.key, i, game, match.aliases, State.accounts);
        if (game) {
          const upper = game.toUpperCase();
          seen.set(upper, (seen.get(upper) || 0) + 1);
          if (name && name !== game) aliases[game] = name;
        }
        const label = UI.labels[`DLF${side}Player${i}`];
        setFitted(label, "player", name);
        placeName(label, players[i] ? players[i].panel : null, frame);
      }
    });
    const published = {};
    for (const game of Object.keys(aliases).sort()) if (seen.get(game.toUpperCase()) === 1) published[game] = aliases[game];
    attrs.write($.DLFState.ALIASES_ATTR, published);
    publishLogoStatus();
  };

  const tick = () => {
    if (stopped) return;
    $.Schedule(TICK_SEC, tick);
    try {
      if (!cacheBanner()) return;
      refreshMatch();
      refreshTeams(Date.now());
      readGameNames();
      render();
    } catch (e) {
      $.Msg(`${TAG} tick failed: ${e && e.message ? e.message : e}`);
    }
  };

  $.Msg(`${TAG} banner defaults ${DEFAULTS.amber.name} vs ${DEFAULTS.sapphire.name}`);
  tick();
})();
