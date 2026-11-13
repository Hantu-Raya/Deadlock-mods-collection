// Observer HUD lobby setup (0.3.0), dashboard side: runs in CitadelPrivateLobbyPage (this mod's override of
// citadel_db_page_private_lobby.xml). The private lobby has no Escape menu (Esc there asks to leave the
// lobby, and the in-game Escape menu only opens in a match), so everything an observer changes between
// maps lives on the lobby page itself:
//  - each stock team title shows the HUD's team: logo or monogram, name, tag, the bans (2 or 3), series pips and
//    an edit pencil; the name or the pencil opens an edit card over that column (name, tag, logo URL), a
//    ban opens a hero picker over it;
//  - clicking a player's name opens an alias box keyed by that player's Steam account;
//  - an "Observer HUD" block under the stock match settings (observer_hud/lobby_setup.xml): link state,
//    the "teams changed sides" offer, the series format, bans per team, the stage, SWAP HUD SIDES, CLEAR BANS and SHARE,
//    which opens a card at the foot of the column (lobby_share.xml): copy or import a share code, and
//    RESET ALL, which also overwrites the saved setup.
// $.OHHost (HUD context) owns the state; this page only renders what the HUD echoes (oh_link.js has the
// protocol). Engine facts (live client 6842, ENGINE.md "Private-lobby page"): filled slots carry .IsPlayer and
// CitadelFriend#PlayerID.accountid, an emptied slot keeps its old account, CitadelPartyUpdated fires on
// every slot change, Esc reaches a focused TextEntry's or panel's oncancel before the page's leave confirm,
// and a panel placed under a team title cuts the slot list (so the team row sits inside the title).
(() => {
  "use strict";

  const TAG = "[OH-LOBBY]";
  const PREFIX = "OHL1:";
  const REPLY = "OHL1S:";
  const HELLO_MS = 5000; // while the page shows
  const LINK_MS = 12000; // no reply for this long: "HUD not linked"
  const NOTE_MS = 6000;
  const RESET_ARM_MS = 4000; // RESET ALL acts on a second press within this
  const LISTS = { amber: "Team1Listing", sapphire: "Team2Listing" };
  const TEAMS = [["amber", "TeamAmber"], ["sapphire", "TeamSapphire"]];
  const OFFER_MIN = 4; // the learned-registry rule (SPEC "Match cards"): at least 4 of a side in one team
  const OFFER_MAX_OTHER = 2; // and at most 2 in the other
  const SETUP_LAYOUT = "file://{resources}/layout/observer_hud/lobby_setup.xml";
  const SHARE_LAYOUT = "file://{resources}/layout/observer_hud/lobby_share.xml";
  const ALIAS_LAYOUT = "file://{resources}/layout/observer_hud/lobby_alias.xml";
  const S = $.OHState;
  const HEROES = typeof OH_HEROES === "object" && Array.isArray(OH_HEROES) ? OH_HEROES : [];
  const page = $.GetContextPanel();
  if (typeof page.OHLobbyStop === "function") page.OHLobbyStop();
  if (!S) {
    $.Msg(`${TAG} oh_state.js missing; the lobby setup is off`);
    return;
  }
  const valid = S.valid;
  let stopped = false;
  const heroName = (id) => {
    const hero = HEROES.find((entry) => entry[0] === id);
    return hero ? hero[1] : `Hero ${id}`;
  };

  // ---------------------------------------------------------------- writes (only on change)
  const writes = new Map();
  function cached(panel, key, value) {
    let slot = writes.get(panel);
    if (!slot) writes.set(panel, (slot = {}));
    if (slot[key] === value) return false;
    slot[key] = value;
    return true;
  }
  const setText = (panel, text) => { if (valid(panel) && cached(panel, "text", text)) panel.text = text; };
  const setClass = (panel, name, on) => { if (valid(panel) && cached(panel, `c:${name}`, on)) panel.SetHasClass(name, on); };
  const setShown = (panel, on) => { if (valid(panel) && cached(panel, "vis", on)) panel.style.visibility = on ? "visible" : "collapse"; };
  const setStyle = (panel, key, value) => { if (valid(panel) && cached(panel, `s:${key}`, value)) panel.style[key] = value; };
  const setEnabled = (panel, on) => { if (valid(panel) && cached(panel, "enabled", on)) panel.enabled = on; };
  const make = (type, parent, id, props) => $.CreatePanel(type, parent, id || "", props || {});
  const hasFocus = (entry) => {
    try {
      return !!(valid(entry) && entry.BHasKeyFocus && entry.BHasKeyFocus());
    } catch (e) {
      return false;
    }
  };
  const dropFocus = (panel) => { try { $.DispatchEvent("DropInputFocus", panel); } catch (e) {} };
  function tooltip(panel, text) {
    panel.SetPanelEvent("onmouseover", () => {
      const value = typeof text === "function" ? text() : text;
      if (value) $.DispatchEvent("UIShowTextTooltip", panel, value);
    });
    panel.SetPanelEvent("onmouseout", () => $.DispatchEvent("UIHideTextTooltip", panel));
  }
  // A click hides the button's tooltip first (live: it stayed over the box the click opened).
  function onClick(panel, fn) {
    panel.SetPanelEvent("onactivate", () => {
      try { $.DispatchEvent("UIHideTextTooltip", panel); } catch (e) {}
      fn();
    });
  }

  // ---------------------------------------------------------------- link
  const Link = { host: "", version: -1, state: null, card: 0, heardAt: -1e12, request: 0, note: "", noteAt: 0, sentAt: -1e12 };
  function send(op) {
    // An instance that was stopped (a second boot on this page) sends nothing, whatever its panels do.
    if (stopped) return;
    Link.request++;
    op.q = Link.request;
    op.h = Link.host;
    try {
      $.DispatchEvent("ClientUI_FireOutput", PREFIX + JSON.stringify(op));
    } catch (e) {
      $.Msg(`${TAG} could not reach the HUD`);
    }
  }
  const hello = () => { Link.sentAt = Date.now(); send({ k: "hi" }); };
  const linked = () => !!Link.state && Date.now() - Link.heardAt < LINK_MS;
  function note(text) {
    Link.note = text;
    Link.noteAt = Date.now();
  }
  const REFUSALS = {
    stale: "The setup changed meanwhile. Check it and try again.",
    "name too long": "Team names are at most 28 characters.",
    "tag too long": "Tags are at most 4 characters.",
    "stage too long": "The stage is at most 28 characters.",
    "logo URL not accepted": "Logo URL not accepted: use a plain http(s) image link.",
    "alias too long": "Aliases are at most 24 characters.",
    "alias list full": "The alias list is full (24). Clear one first.",
    account: "That player has no Steam account (a bot).",
    code: "Not an Observer HUD code.",
    "newer code": "That code is from a newer version of the mod.",
    "too long": S.SHARE_TOO_LONG
  };
  // Answers this page waits for, by request number: the share code and the import / reset results.
  const Waiting = { share: 0, import: 0, reset: 0 };
  // The HUD may answer inside the dispatch (live: same frame), so the request number is noted first.
  function expect(kind, op) {
    Waiting[kind] = Link.request + 1;
    send(op);
  }
  // The last ended match card from the HUD: two account lists and two [name, ...] team entries, or 0. The
  // channel can carry anything (any script may fire it), so a card of another shape is dropped whole.
  function endedCard(card) {
    if (!card || typeof card !== "object") return 0;
    const accounts = (list) => Array.isArray(list) && list.length <= 12 && list.every((n) => Number.isInteger(n) && n > 0);
    const entry = (team) => Array.isArray(team) && typeof team[0] === "string";
    return accounts(card.a) && accounts(card.b) && Array.isArray(card.t) && card.t.length === 2 && card.t.every(entry) ? card : 0;
  }
  function onReply(raw) {
    if (stopped || typeof raw !== "string" || raw.slice(0, REPLY.length) !== REPLY) return;
    let reply = null;
    try {
      reply = JSON.parse(raw.slice(REPLY.length));
    } catch (e) {
      return;
    }
    if (!reply || typeof reply.h !== "string" || !Number.isInteger(reply.v) || !reply.s || typeof reply.s !== "object") return;
    // The HUD's slice passes the same checks as everything else; a broken one is dropped whole.
    const state = S.normalize(Object.assign(S.defaults(), reply.s));
    const first = !Link.state;
    Link.host = reply.h;
    Link.version = reply.v;
    Link.state = state;
    Link.card = endedCard(reply.c);
    Link.heardAt = Date.now();
    const error = typeof reply.e === "string" ? reply.e : "";
    if (reply.q && reply.q === Waiting.share) {
      Waiting.share = 0;
      if (typeof reply.x === "string" && reply.x) showCode(reply.x);
      else shareStatus(REFUSALS[error] || "The HUD sent no code.");
    } else if (reply.q && reply.q === Waiting.import) {
      Waiting.import = 0;
      shareStatus(error ? REFUSALS[error] || `Not imported (${error}).` : "Imported. The HUD shows the new setup.");
    } else if (reply.q && reply.q === Waiting.reset) {
      Waiting.reset = 0;
      shareStatus(error ? REFUSALS[error] || `Not reset (${error}).` : "Every setting is back to the defaults; the saved setup was overwritten.");
    } else if (error) {
      note(REFUSALS[error] || `Not applied (${error}).`);
    }
    if (first) $.Msg(`${TAG} linked to the HUD`);
    // A hidden page (an echo can still arrive for 15 s after it hid) renders when it shows again.
    if (page.BHasClass("PageVisible")) render();
    else UI.dirty = true;
  }

  // ---------------------------------------------------------------- team titles, edit cards, ban pickers
  const UI = { teams: {}, setup: null, ids: {}, formatSeen: 0, banCountSeen: 0, shareOpen: false, resetAt: 0, dirty: false };
  function buildTeam(key, cls) {
    const ctn = page.FindChildrenWithClassTraverse(cls)[0];
    if (!valid(ctn)) return null;
    const title = ctn.FindChildrenWithClassTraverse("TeamTitle")[0];
    if (!valid(title)) return null;
    const stock = title.FindChildrenWithClassTraverse("TeamTitleText")[0];
    const side = key === "amber" ? "Amber" : "Sapphire";
    // Separate buttons, not one: a click on a pip or a ban must not also open the card.
    const row = make("Panel", title, `OHL${side}Title`, { class: "OHLTitle" });
    const main = make("Button", row, "", { class: "OHLTitleMain" });
    const logoBox = make("Panel", main, "", { class: "OHLLogoBox" });
    const mono = make("Label", logoBox, "", { class: "OHLMono", text: "" });
    const name = make("Label", main, "", { class: "OHLName", text: "" });
    const tag = make("Label", main, "", { class: "OHLTag", text: "" });
    const right = make("Panel", row, "", { class: "OHLRight" });
    const bans = make("Panel", right, "", { class: "OHLBans" });
    const banButtons = [];
    for (let slot = 0; slot < S.BAN_SLOTS; slot++) {
      const button = make("Button", bans, `OHL${side}Ban${slot}`, { class: "OHLBan" });
      const image = make("CitadelHeroImage", button, "", { class: "OHLBanImage", heroimagestyle: "small", scaling: "stretch-to-cover-preserve-aspect", hittest: "false" });
      make("Panel", button, "", { class: "OHLBanPlus", hittest: "false" });
      onClick(button, () => openPicker(key, slot));
      tooltip(button, () => {
        if (!linked()) return "";
        const id = Link.state[key].bans[slot];
        return id > 0 ? `Ban ${slot + 1}: ${heroName(id)}. Click to change.` : `Ban ${slot + 1}: none. Click to pick a hero.`;
      });
      banButtons.push({ button, image, hero: -1 });
    }
    const pips = make("Panel", right, "", { class: "OHLPips" });
    const edit = make("Button", right, `OHL${side}Edit`, { class: "OHLEdit" });
    make("Panel", edit, "", { class: "OHLEditIcon", hittest: "false" });
    tooltip(edit, "Edit the team name, tag and logo");
    main.SetPanelEvent("onactivate", () => openCard(key));
    onClick(edit, () => openCard(key));
    // The edit card and the picker lie over the slot list (ignore-parent-flow): the list keeps its height.
    const card = make("Panel", ctn, `OHL${side}Card`, { class: "OHLCard", acceptsfocus: "true" });
    make("Label", card, "", { class: "OHLCardTitle", text: "Team on the HUD" });
    const field = (label, max, placeholder) => {
      const line = make("Panel", card, "", { class: "OHLField" });
      make("Label", line, "", { class: "OHLFieldLabel", text: label });
      const entry = make("TextEntry", line, "", { class: "OHLEntry", maxchars: String(max), placeholder: placeholder, text: "" });
      entry.SetPanelEvent("oninputsubmit", () => commitCard(key));
      entry.SetPanelEvent("oncancel", () => closeCard(key));
      return entry;
    };
    const nameEntry = field("Name", S.LIMITS.name, "e.g. Night Owls");
    const tagEntry = field("Tag", S.LIMITS.tag, "NOW");
    const logoEntry = field("Logo URL", S.MAX_URL, "image or GIF link (optional)");
    const cardNote = make("Label", card, "", { class: "OHLCardNote", text: "Enter saves, Esc closes." });
    const buttons = make("Panel", card, "", { class: "OHLCardButtons" });
    const done = make("Button", buttons, "", { class: "SecondaryButton light outline OHLPill" });
    make("Label", done, "", { class: "OHLPillText", text: "Save" });
    done.SetPanelEvent("onactivate", () => commitCard(key));
    const cancel = make("Button", buttons, "", { class: "SecondaryButton light outline OHLPill" });
    make("Label", cancel, "", { class: "OHLPillText", text: "Cancel" });
    cancel.SetPanelEvent("onactivate", () => closeCard(key));
    card.SetPanelEvent("oncancel", () => closeCard(key));
    setShown(card, false);
    const picker = make("Panel", ctn, `OHL${side}Picker`, { class: "OHLPicker", acceptsfocus: "true" });
    const pickerHead = make("Panel", picker, "", { class: "OHLPickerHead" });
    const pickerTitle = make("Label", pickerHead, "", { class: "OHLCardTitle OHLPickerTitle", text: "" });
    const pickerHover = make("Label", pickerHead, "", { class: "OHLPickerHover", text: "" });
    const grid = make("Panel", picker, "", { class: "OHLHeroGrid" });
    const pickerButtons = make("Panel", picker, "", { class: "OHLCardButtons" });
    const none = make("Button", pickerButtons, "", { class: "SecondaryButton light outline OHLPill" });
    make("Label", none, "", { class: "OHLPillText", text: "No Ban" });
    none.SetPanelEvent("onactivate", () => pickHero(key, 0));
    const back = make("Button", pickerButtons, "", { class: "SecondaryButton light outline OHLPill" });
    make("Label", back, "", { class: "OHLPillText", text: "Cancel" });
    back.SetPanelEvent("onactivate", () => closePicker(key));
    picker.SetPanelEvent("oncancel", () => closePicker(key));
    setShown(picker, false);
    return { ctn, title, stock, row, logoBox, mono, name, tag, banButtons, pips, pipButtons: [], edit, card, nameEntry, tagEntry, logoEntry,
      cardNote, open: false, logo: null, logoUrl: "", picker, pickerTitle, pickerHover, grid, tiles: [], picking: -1 };
  }
  // Only one box over the columns at a time: a card, a picker or an alias box.
  function closeOverlays(except) {
    for (const other of Object.keys(UI.teams)) {
      if (except !== `card:${other}`) closeCard(other);
      if (except !== `picker:${other}`) closePicker(other);
    }
    if (Alias.editing && except !== "alias") closeAlias(Alias.editing);
    if (except !== "share") closeShare();
  }
  function scrollBack(key) {
    // Live (6842): while a box over the column had focus the slot list under it scrolled a few pixels.
    const list = page.FindChildTraverse(LISTS[key]);
    if (valid(list) && typeof list.ScrollToTop === "function") list.ScrollToTop();
  }
  function openCard(key) {
    const team = UI.teams[key];
    if (!team || !linked()) return;
    closeOverlays(`card:${key}`);
    const state = Link.state[key];
    team.nameEntry.text = state.name;
    team.tagEntry.text = state.tag;
    team.logoEntry.text = state.logo.url;
    setText(team.cardNote, "Enter saves, Esc closes.");
    team.open = true;
    setShown(team.card, true);
    team.nameEntry.SetFocus();
  }
  function closeCard(key) {
    const team = UI.teams[key];
    if (!team || !team.open) return;
    team.open = false;
    setShown(team.card, false);
    dropFocus(team.card);
    scrollBack(key);
  }
  // Each changed field is one op; anything the HUD refuses comes back as a note. A value this page
  // already rejects keeps the card open and says why; otherwise the card closes.
  function commitCard(key) {
    const team = UI.teams[key];
    if (!team || !team.open || !linked()) return;
    const state = Link.state[key];
    const name = S.cleanText(String(team.nameEntry.text || ""), S.LIMITS.name);
    const tag = S.cleanText(String(team.tagEntry.text || ""), S.LIMITS.tag);
    const url = S.cleanUrl(String(team.logoEntry.text || ""));
    if (name === null || tag === null || url === null) {
      setText(team.cardNote, url === null ? REFUSALS["logo URL not accepted"] : name === null ? REFUSALS["name too long"] : REFUSALS["tag too long"]);
      return;
    }
    if (name !== state.name) send({ k: "set", f: "name", t: key, x: name });
    if (tag.toUpperCase() !== state.tag) send({ k: "set", f: "tag", t: key, x: tag });
    if (url !== state.logo.url) send({ k: "set", f: "logo", t: key, x: url });
    closeCard(key);
  }
  function setSeries(key, pip) {
    if (!linked()) return;
    const current = Link.state[key].series;
    send({ k: "set", f: "series", t: key, x: current === pip + 1 ? pip : pip + 1 });
  }

  // The hero grid is built the first time its picker opens (44 tiles per team).
  function buildGrid(key) {
    const team = UI.teams[key];
    if (team.tiles.length) return;
    for (const [id, label] of HEROES) {
      const tile = make("Button", team.grid, "", { class: "OHLHeroTile" });
      const image = make("CitadelHeroImage", tile, "", { class: "OHLHeroImage", heroimagestyle: "small", scaling: "stretch-to-cover-preserve-aspect", hittest: "false" });
      image.SetHeroID(id);
      tile.SetPanelEvent("onactivate", () => pickHero(key, id));
      tile.SetPanelEvent("onmouseover", () => setText(team.pickerHover, label));
      tile.SetPanelEvent("onmouseout", () => setText(team.pickerHover, ""));
      team.tiles.push({ id, tile });
    }
  }
  function openPicker(key, slot) {
    const team = UI.teams[key];
    if (!team || !linked()) return;
    closeOverlays(`picker:${key}`);
    buildGrid(key);
    team.picking = slot;
    const state = Link.state;
    const current = state[key].bans[slot];
    // Heroes banned elsewhere stay pickable (picking one moves the ban here) but are marked.
    const elsewhere = new Set();
    for (const [other] of TEAMS) state[other].bans.forEach((id, index) => { if (id > 0 && !(other === key && index === slot)) elsewhere.add(id); });
    for (const { id, tile } of team.tiles) {
      setClass(tile, "OHLCurrent", id === current);
      setClass(tile, "OHLTaken", elsewhere.has(id));
    }
    setText(team.pickerTitle, `${state[key].name} - ban ${slot + 1}`);
    setText(team.pickerHover, current > 0 ? heroName(current) : "");
    setShown(team.picker, true);
    team.picker.SetFocus();
  }
  function closePicker(key) {
    const team = UI.teams[key];
    if (!team || team.picking < 0) return;
    team.picking = -1;
    setShown(team.picker, false);
    dropFocus(team.picker);
    scrollBack(key);
  }
  function pickHero(key, id) {
    const team = UI.teams[key];
    if (!team || team.picking < 0) return;
    const slot = team.picking;
    closePicker(key);
    if (linked() && Link.state[key].bans[slot] !== id) send({ k: "set", f: "ban", t: key, i: slot, x: id });
  }

  // One Image per URL, shown after its own ImageLoaded; a failure keeps the monogram (as the HUD's logos).
  // Live (6842): an image whose load failed once reports ImageLoaded when it is asked for again, and draws
  // nothing (an expired Discord link left a blank circle after SWAP HUD SIDES and back), so a source that
  // failed is never tried again this session.
  const failedSources = new Set();
  function renderLogo(team, url) {
    if (team.logoUrl === url) return;
    team.logoUrl = url;
    if (valid(team.logo)) team.logo.DeleteAsync(0);
    team.logo = null;
    setShown(team.mono, true);
    if (!url) return;
    const sources = S.logoSources(url).filter((source) => !failedSources.has(source));
    const tryAt = (index) => {
      if (index >= sources.length || team.logoUrl !== url) return;
      const image = make("Image", team.logoBox, "", { class: "OHLLogo", scaling: "stretch-to-cover-preserve-aspect", hittest: "false" });
      image.style.opacity = "0";
      team.logo = image;
      $.RegisterEventHandler("ImageLoaded", image, () => {
        if (team.logo !== image) return;
        image.style.opacity = "1";
        setShown(team.mono, false);
      });
      $.RegisterEventHandler("ImageFailedLoad", image, () => {
        failedSources.add(sources[index]);
        if (team.logo !== image) return;
        image.DeleteAsync(0);
        team.logo = null;
        tryAt(index + 1);
      });
      image.SetImage(sources[index]);
    };
    tryAt(0);
  }
  function renderTeam(key) {
    const team = UI.teams[key];
    if (!team) return;
    const on = linked();
    setShown(team.row, on);
    setShown(team.stock, !on);
    if (!on) {
      closeCard(key);
      closePicker(key);
      return;
    }
    const state = Link.state[key];
    setText(team.name, state.name);
    setText(team.tag, state.tag);
    setText(team.mono, S.monogram(state));
    renderLogo(team, state.logo.url);
    team.banButtons.forEach((ban, slot) => {
      // A slot past banCount collapses; its ban stays in the HUD's state.
      setShown(ban.button, slot < Link.state.banCount);
      const id = state.bans[slot];
      setClass(ban.button, "OHLBanSet", id > 0);
      if (id > 0 && ban.hero !== id) {
        ban.hero = id;
        ban.image.SetHeroID(id);
      }
    });
    const wins = S.winsNeeded(Link.state.bestOf);
    while (team.pipButtons.length < wins) {
      const index = team.pipButtons.length;
      const pip = make("Button", team.pips, "", { class: "OHLPip" });
      make("Panel", pip, "", { class: "OHLPipDot", hittest: "false" });
      onClick(pip, () => setSeries(key, index));
      tooltip(pip, () => linked() ? `${Link.state[key].name}: ${Link.state[key].series} of ${S.winsNeeded(Link.state.bestOf)} wins. Click to set.` : "");
      team.pipButtons.push(pip);
    }
    team.pipButtons.forEach((pip, index) => {
      setShown(pip, index < wins);
      setClass(pip, "OHLWon", index < state.series);
    });
  }

  // ---------------------------------------------------------------- aliases on player names
  // A Button over the stock name, as a sibling of CitadelFriend inside the slot's .Player panel, so a click
  // reaches it and not the stock player menu (the avatar keeps that). Accounts are read only from .IsPlayer
  // slots (an emptied slot keeps its old account, live).
  // Alias button -> { account, name, nameBox } of the slot it sits on now (slots are reused by C++).
  const Alias = { editing: null, info: new Map() };
  function slotInfo(slot) {
    if (!valid(slot) || slot.paneltype !== "CitadelPrivateLobbyTeamSlot" || !slot.BHasClass("IsPlayer")) return null;
    const friend = slot.FindChildTraverse("PlayerID");
    if (!valid(friend)) return null;
    const account = String(friend.accountid || "");
    if (!S.isAccount(account)) return null;
    const nameBox = friend.FindChildTraverse("FriendNameContainer");
    const nameUser = friend.FindChildTraverse("FriendName");
    const label = valid(nameUser) ? nameUser.GetChild(0) : null;
    return { slot, friend, account, nameBox, name: valid(label) ? String(label.text || "") : "", player: friend.GetParent() };
  }
  // The slot's alias button. A button a stopped instance left is marked OHLDead until its DeleteAsync
  // lands (live, the next frame), so it is never adopted with that instance's callbacks.
  function aliasButton(player) {
    if (!valid(player)) return null;
    const button = player.FindChild("OHLAlias");
    if (!valid(button) || !button.BHasClass("OHLDead")) return button;
    return player.Children().find((child) => child.id === "OHLAlias" && !child.BHasClass("OHLDead")) || null;
  }
  // The stock name under a button that leaves its slot (emptied, a bot, another name box) shows again.
  // Written "1", never null: live a null write left the inline opacity 0 (user report 2026-11-03, after
  // RESET ALL; the visibility quirk in ENGINE.md). Stock CSS sets no opacity on #FriendNameContainer.
  function unbindAlias(button) {
    const old = Alias.info.get(button);
    if (!old) return;
    setStyle(old.nameBox, "opacity", "1");
    Alias.info.delete(button);
  }
  function ensureAliasButton(info) {
    let button = aliasButton(info.player);
    if (!valid(button)) {
      // Its own layout: panels a script makes under a slot take the slot's stylesheets, not this page's.
      button = make("Button", info.player, "OHLAlias", {});
      if (!button.BLoadLayout(ALIAS_LAYOUT, false, false)) {
        button.DeleteAsync(0);
        if (!ensureAliasButton.failed) $.Msg(`${TAG} could not load ${ALIAS_LAYOUT}`);
        ensureAliasButton.failed = true;
        return null;
      }
      const entry = button.FindChildTraverse("OHLAliasEntry");
      setShown(entry, false);
      button.SetPanelEvent("onactivate", () => openAlias(button));
      entry.SetPanelEvent("oninputsubmit", () => commitAlias(button, true));
      entry.SetPanelEvent("onblur", () => commitAlias(button, false));
      entry.SetPanelEvent("oncancel", () => closeAlias(button));
    }
    const old = Alias.info.get(button);
    if (old && old.account !== info.account) {
      // Another player took the slot: a box being typed in for the old one closes unsaved.
      if (Alias.editing === button) closeAlias(button);
      if (old.nameBox !== info.nameBox) unbindAlias(button);
    }
    Alias.info.set(button, { account: info.account, name: info.name, nameBox: info.nameBox });
    return button;
  }
  // Over the name: offsets from the .Player panel, in layout pixels. A panel that has not been laid out
  // reads FLT_MAX positions; it is measured again on the next roster read.
  function placeAlias(button, info) {
    if (!valid(info.nameBox)) return false;
    const a = info.nameBox.GetPositionWithinWindow();
    const b = info.player.GetPositionWithinWindow();
    const scale = info.player.actualuiscale_x || 1;
    if (!a || !b || Math.abs(a.x) > 1e6 || Math.abs(b.x) > 1e6 || !(scale > 0)) return false;
    const x = Math.max(0, Math.round((a.x - b.x) / scale));
    const y = Math.max(0, Math.round((a.y - b.y) / scale));
    const width = Math.max(80, Math.round((info.player.actuallayoutwidth - (a.x - b.x)) / scale));
    const height = Math.max(22, Math.round(info.nameBox.actuallayoutheight / scale));
    setStyle(button, "marginLeft", `${x}px`);
    setStyle(button, "marginTop", `${y}px`);
    setStyle(button, "width", `${width}px`);
    setStyle(button, "height", `${height}px`);
    return true;
  }
  function openAlias(button) {
    if (!linked() || !valid(button)) return;
    closeOverlays("alias");
    if (Alias.editing && Alias.editing !== button) closeAlias(Alias.editing);
    const entry = button.FindChildTraverse("OHLAliasEntry");
    const bound = Alias.info.get(button);
    if (!bound) return;
    const player = Link.state.players[bound.account];
    entry.text = player ? player.a : "";
    Alias.editing = button;
    setClass(button, "OHLEditing", true);
    setShown(entry, true);
    entry.SetFocus();
  }
  function closeAlias(button) {
    if (!valid(button)) return;
    if (Alias.editing === button) Alias.editing = null;
    setClass(button, "OHLEditing", false);
    const entry = button.FindChildTraverse("OHLAliasEntry");
    setShown(entry, false);
    try { $.DispatchEvent("DropInputFocus", entry); } catch (e) {}
  }
  function commitAlias(button, close) {
    if (!valid(button) || Alias.editing !== button || !linked()) return;
    const entry = button.FindChildTraverse("OHLAliasEntry");
    const text = S.cleanText(String(entry.text || ""), S.LIMITS.alias);
    if (text === null) {
      note(REFUSALS["alias too long"]);
      render();
      return;
    }
    const bound = Alias.info.get(button);
    if (!bound) return;
    const player = Link.state.players[bound.account];
    if (text !== (player ? player.a : "")) send({ k: "alias", a: bound.account, n: bound.name, x: text });
    if (close) closeAlias(button);
  }
  // The names of the two team lists: alias buttons for filled slots, hidden on emptied ones.
  const Roster = { amber: [], sapphire: [], sig: "", dismissed: "" };
  function readRoster() {
    const sides = { amber: [], sapphire: [] };
    let placed = true;
    for (const key of Object.keys(LISTS)) {
      const list = page.FindChildTraverse(LISTS[key]);
      if (!valid(list)) continue;
      for (const slot of list.Children()) {
        const player = slot.paneltype === "CitadelPrivateLobbyTeamSlot" ? slot.FindChildrenWithClassTraverse("Player")[0] : null;
        const stale = aliasButton(player);
        const info = slotInfo(slot);
        if (!info || !valid(info.player)) {
          if (valid(stale)) {
            if (Alias.editing === stale) closeAlias(stale);
            setShown(stale, false);
            unbindAlias(stale);
          }
          continue;
        }
        sides[key].push(info.account);
        const button = ensureAliasButton(info);
        if (!button) continue;
        setShown(button, linked());
        if (!placeAlias(button, info)) placed = false;
        renderAlias(button);
      }
    }
    Roster.amber = sides.amber;
    Roster.sapphire = sides.sapphire;
    Roster.sig = `${sides.amber.join(",")}|${sides.sapphire.join(",")}`;
    return placed;
  }
  function renderAlias(button) {
    const bound = Alias.info.get(button);
    if (!bound) return;
    const player = linked() ? Link.state.players[bound.account] : null;
    const alias = player ? player.a : "";
    setText(button.FindChildTraverse("OHLAliasText"), alias);
    setText(button.FindChildTraverse("OHLAliasReal"), alias ? bound.name : "");
    setClass(button, "OHLHasAlias", !!alias);
    // With an alias the stock name hides under ours; without one it shows ("1", see unbindAlias).
    setStyle(bound.nameBox, "opacity", alias ? "0" : "1");
  }
  let rosterRetry = 0;
  function rosterSoon() {
    // While the page is hidden a party event only marks it dirty; it is read when the page shows.
    if (!page.BHasClass("PageVisible")) {
      UI.dirty = true;
      return;
    }
    // C++ refills the slots right after the event: read now and once more a frame later.
    $.Schedule(0, () => {
      if (stopped) return;
      const placed = readRoster();
      renderOffer();
      if (!placed && rosterRetry < 10) {
        rosterRetry++;
        $.Schedule(0.2, rosterSoon);
      } else {
        rosterRetry = 0;
      }
    });
  }

  // ---------------------------------------------------------------- swap offer
  // The players of the last ended match changed sides (stock Swap Teams, or a re-made lobby) while the HUD
  // still shows the old sides: offer the swap; never do it alone.
  function offerWanted() {
    const card = Link.card;
    if (!linked() || !card || Roster.sig === Roster.dismissed) return false;
    const inSet = (list, ids) => list.filter((account) => ids.includes(Number(account))).length;
    const amberWasB = inSet(Roster.amber, card.b);
    const amberWasA = inSet(Roster.amber, card.a);
    const sapphireWasA = inSet(Roster.sapphire, card.a);
    const sapphireWasB = inSet(Roster.sapphire, card.b);
    if (amberWasB < OFFER_MIN || amberWasA > OFFER_MAX_OTHER || sapphireWasA < OFFER_MIN || sapphireWasB > OFFER_MAX_OTHER) return false;
    // Still labelled as last match (Amber's team name on Amber): the players moved, the names did not.
    return Link.state.amber.name === card.t[0][0] && Link.state.sapphire.name === card.t[1][0];
  }
  function renderOffer() {
    const on = offerWanted();
    setShown(UI.ids.OHLOffer, on);
    if (on) setText(UI.ids.OHLOfferText, `${Link.card.t[0][0]} are now on the Sapphire side.`);
  }

  // ---------------------------------------------------------------- the Observer HUD block
  const SETUP_IDS = ["OHLLinkDot", "OHLLink", "OHLOffer", "OHLOfferText", "OHLOfferYes", "OHLOfferNo", "OHLFormat", "OHLBanCount", "OHLStage",
    "OHLSwap", "OHLClearBans", "OHLShareOpen"];
  const SHARE_IDS = ["OHLShareClose", "OHLShareEntry", "OHLShareCopy", "OHLShareImport", "OHLReset", "OHLResetLabel", "OHLShareStatus"];
  // The two drop-downs' option ids end in the value (lobby_setup.xml).
  const FORMAT_ID = "OHLBo";
  const BAN_COUNT_ID = "OHLBans";
  let syncingFormat = false;
  function buildSetup() {
    if (valid(UI.setup)) return;
    const info = page.FindChildTraverse("LobbyInfo");
    const settings = valid(info) ? info.FindChildrenWithClassTraverse("SettingsPanel")[0] : null;
    if (!valid(settings)) return;
    // Own layouts, as the alias button: each brings its stylesheets (stock base, lobby, oh_lobby).
    const ids = {};
    const load = (id, file, wanted) => {
      const panel = make("Panel", info, id, {});
      let ok = panel.BLoadLayout(file, false, false);
      for (const name of ok ? wanted : []) {
        ids[name] = panel.FindChildTraverse(name);
        if (!valid(ids[name])) {
          $.Msg(`${TAG} ${file} lacks #${name}`);
          ok = false;
        }
      }
      if (!ok) panel.DeleteAsync(0);
      return ok ? panel : null;
    };
    const setup = load("OHLSetup", SETUP_LAYOUT, SETUP_IDS);
    const share = setup ? load("OHLShare", SHARE_LAYOUT, SHARE_IDS) : null;
    if (!setup || !share) {
      if (setup) setup.DeleteAsync(0);
      $.Msg(`${TAG} the Observer HUD block could not load`);
      buildSetup.failed = true;
      return;
    }
    info.MoveChildAfter(setup, settings);
    ids.OHLShare = share;
    UI.setup = setup;
    UI.ids = ids;
    // A new block's drop-downs show their first option: select the HUD's values again.
    UI.formatSeen = 0;
    UI.banCountSeen = 0;
    ids.OHLFormat.SetPanelEvent("oninputsubmit", () => {
      if (syncingFormat || !linked()) return;
      const picked = ids.OHLFormat.GetSelected();
      const bestOf = valid(picked) ? S.BEST_OF.find((n) => FORMAT_ID + n === picked.id) : 0;
      if (S.BEST_OF.includes(bestOf) && bestOf !== Link.state.bestOf) send({ k: "set", f: "bestOf", x: bestOf });
    });
    ids.OHLBanCount.SetPanelEvent("oninputsubmit", () => {
      if (syncingFormat || !linked()) return;
      const picked = ids.OHLBanCount.GetSelected();
      const count = valid(picked) ? S.BAN_COUNTS.find((n) => BAN_COUNT_ID + n === picked.id) : 0;
      if (S.BAN_COUNTS.includes(count) && count !== Link.state.banCount) send({ k: "set", f: "banCount", x: count });
    });
    tooltip(ids.OHLBanCount, "Bans per team on the HUD. A third ban is kept while only two show.");
    const stage = ids.OHLStage;
    stage.SetPanelEvent("oninputsubmit", () => { commitStage(); dropFocus(stage); });
    stage.SetPanelEvent("onblur", commitStage);
    stage.SetPanelEvent("oncancel", () => {
      if (linked()) stage.text = Link.state.stage;
      dropFocus(stage);
    });
    onClick(ids.OHLSwap, () => { if (linked()) send({ k: "swap", v: Link.version }); });
    tooltip(ids.OHLSwap, "Moves team names, tags, logos, series and bans to the other side. Players stay where they are.");
    onClick(ids.OHLClearBans, () => { if (linked()) send({ k: "clearBans", v: Link.version }); });
    tooltip(ids.OHLClearBans, "Empties both teams' bans for the next map.");
    onClick(ids.OHLShareOpen, () => {
      if (UI.shareOpen) closeShare();
      else openShare();
    });
    ids.OHLShareClose.SetPanelEvent("onactivate", closeShare);
    tooltip(ids.OHLShareOpen, "Copy or import a setup code, or reset everything.");
    ids.OHLShareCopy.SetPanelEvent("onactivate", () => {
      if (!linked()) return;
      shareStatus("Asking the HUD for the code...");
      expect("share", { k: "share" });
    });
    ids.OHLShareImport.SetPanelEvent("onactivate", importCode);
    ids.OHLShareEntry.SetPanelEvent("oninputsubmit", importCode);
    ids.OHLShareEntry.SetPanelEvent("oncancel", closeShare);
    share.SetPanelEvent("oncancel", closeShare);
    ids.OHLReset.SetPanelEvent("onactivate", resetAll);
    ids.OHLOfferYes.SetPanelEvent("onactivate", () => {
      // Re-checked on click: the roster or the setup may have moved since the row showed.
      readRoster();
      if (offerWanted()) send({ k: "swap", v: Link.version });
      renderOffer();
    });
    ids.OHLOfferNo.SetPanelEvent("onactivate", () => {
      Roster.dismissed = Roster.sig;
      renderOffer();
    });
    setShown(ids.OHLOffer, false);
  }
  // The share card lies over the foot of the column (the stock Unassigned list) while it is open.
  function openShare() {
    if (!linked()) return;
    closeOverlays("share");
    UI.shareOpen = true;
    shareStatus("");
    render();
  }
  function closeShare() {
    if (!UI.shareOpen) return;
    UI.shareOpen = false;
    disarmReset();
    dropFocus(UI.ids.OHLShareEntry);
    render();
  }
  function commitStage() {
    const entry = UI.ids.OHLStage;
    if (!valid(entry) || !linked()) return;
    const text = S.cleanText(String(entry.text || ""), S.LIMITS.stage);
    if (text === null) {
      note(REFUSALS["stage too long"]);
      render();
      return;
    }
    if (text !== Link.state.stage) send({ k: "set", f: "stage", x: text });
  }
  function shareStatus(text) {
    setText(UI.ids.OHLShareStatus, text);
  }
  // The code goes in the box and, through the box, on the clipboard: CopyStringToClipboard throws in this
  // game (DLF, live 2026-10-17); TextEntryCopyToClipboard copies a selected entry.
  function showCode(code) {
    const entry = UI.ids.OHLShareEntry;
    if (!valid(entry)) return;
    entry.text = code;
    let copied = false;
    try {
      entry.SetFocus();
      entry.SelectAll();
      copied = $.DispatchEvent("TextEntryCopyToClipboard", entry) !== false;
    } catch (e) {}
    dropFocus(entry);
    // Live (6842): a box holding the whole code (thousands of characters on one line) draws nothing, so
    // after a copy it is emptied for the next paste; without a copy the code stays in it to select.
    if (copied) entry.text = "";
    shareStatus(copied ? `Code copied (${code.length} characters). Import it on the other PC.` : "The code is in the box (it may look empty): click it, press Ctrl+A, then Ctrl+C.");
  }
  // A valid code replaces the setup (fields it lacks take the defaults; the HUD keeps this PC's DEV
  // settings). An empty box pastes the clipboard first. The code is checked here first, so a typo says so
  // without a round trip, and again in the HUD.
  function importCode() {
    const entry = UI.ids.OHLShareEntry;
    if (!valid(entry) || !linked()) return;
    let text = String(entry.text || "").trim();
    if (!text) {
      try { $.DispatchEvent("TextEntryInsertFromClipboard", entry); } catch (e) {}
      text = String(entry.text || "").trim();
    }
    if (!text) {
      shareStatus("Paste a code first.");
      return;
    }
    const result = S.decodeShare(text);
    if (result.kind !== "valid") {
      shareStatus(result.kind === "unsupported" ? REFUSALS["newer code"] : REFUSALS.code);
      return;
    }
    dropFocus(entry);
    shareStatus("Importing...");
    expect("import", { k: "import", c: text });
  }
  // RESET ALL arms on the first press and acts on a second press within RESET_ARM_MS.
  function disarmReset() {
    UI.resetAt = 0;
    setText(UI.ids.OHLResetLabel, "Reset All");
    setClass(UI.ids.OHLReset, "OHLArmed", false);
  }
  function resetAll() {
    if (!linked()) return;
    const now = Date.now();
    if (!(UI.resetAt && now - UI.resetAt < RESET_ARM_MS)) {
      UI.resetAt = now;
      setText(UI.ids.OHLResetLabel, "Confirm Reset");
      setClass(UI.ids.OHLReset, "OHLArmed", true);
      shareStatus("Press again to put every setting back to the defaults and forget the saved setup on this PC.");
      $.Schedule(RESET_ARM_MS / 1000 + 0.05, () => {
        if (!stopped && UI.resetAt === now) {
          disarmReset();
          shareStatus("");
        }
      });
      return;
    }
    disarmReset();
    shareStatus("Resetting...");
    expect("reset", { k: "reset", v: Link.version });
  }
  function renderSetup(on) {
    const ids = UI.ids;
    if (!valid(UI.setup)) return;
    setClass(UI.setup, "OHLOff", !on);
    for (const id of ["OHLFormat", "OHLBanCount", "OHLStage", "OHLSwap", "OHLClearBans", "OHLShareOpen", "OHLShareCopy", "OHLShareImport", "OHLReset", "OHLShareEntry"]) setEnabled(ids[id], on);
    const fresh = Link.note && Date.now() - Link.noteAt < NOTE_MS;
    setText(ids.OHLLink, fresh ? Link.note : on ? "Linked to the HUD" : "Not linked: restart the game if this stays");
    setClass(ids.OHLLink, "OHLLinkNote", !!fresh);
    setClass(ids.OHLLinkDot, "OHLLinkOn", on);
    const open = UI.shareOpen && on;
    setShown(ids.OHLShare, open);
    setClass(ids.OHLShareOpen, "OHLSelected", open);
    if (!on) return;
    const state = Link.state;
    if (UI.formatSeen !== state.bestOf) {
      UI.formatSeen = state.bestOf;
      // SetSelected fires oninputsubmit: the guard keeps it from sending the value back.
      syncingFormat = true;
      try {
        ids.OHLFormat.SetSelected(FORMAT_ID + state.bestOf);
      } finally {
        syncingFormat = false;
      }
    }
    if (UI.banCountSeen !== state.banCount) {
      UI.banCountSeen = state.banCount;
      syncingFormat = true;
      try {
        ids.OHLBanCount.SetSelected(BAN_COUNT_ID + state.banCount);
      } finally {
        syncingFormat = false;
      }
    }
    if (!hasFocus(ids.OHLStage) && ids.OHLStage.text !== state.stage) ids.OHLStage.text = state.stage;
  }

  function build() {
    for (const [key, cls] of TEAMS) {
      if (UI.teams[key] && valid(UI.teams[key].row)) continue;
      const team = buildTeam(key, cls);
      if (team) UI.teams[key] = team;
    }
    if (!buildSetup.failed) buildSetup();
  }
  function render() {
    if (stopped) return;
    build();
    for (const key of Object.keys(UI.teams)) renderTeam(key);
    const on = linked();
    renderSetup(on);
    readRoster();
    renderOffer();
  }

  // ---------------------------------------------------------------- page life
  // Hello and render only while the page shows: a hidden page costs one class read a second.
  let shownLast = false;
  function tick() {
    if (stopped) return;
    const shown = page.BHasClass("PageVisible");
    const now = Date.now();
    if (shown) {
      if (!shownLast) {
        if (UI.dirty) render();
        UI.dirty = false;
        rosterSoon();
      }
      if (now - Link.sentAt >= HELLO_MS) hello();
      const linkedNow = linked();
      if (linkedNow !== tick.linked || (Link.note && now - Link.noteAt >= NOTE_MS && tick.noteShown)) render();
      tick.linked = linkedNow;
      tick.noteShown = !!Link.note && now - Link.noteAt < NOTE_MS;
    } else if (shownLast) {
      closeOverlays("");
    }
    shownLast = shown;
    $.Schedule(1, tick);
  }
  tick.linked = false;
  tick.noteShown = false;

  const listeners = [
    ["ClientUI_FireOutput", $.RegisterForUnhandledEvent("ClientUI_FireOutput", onReply)],
    ["CitadelPartyUpdated", $.RegisterForUnhandledEvent("CitadelPartyUpdated", rosterSoon)],
    ["CitadelPartyPrivateLobbyStateChanged", $.RegisterForUnhandledEvent("CitadelPartyPrivateLobbyStateChanged", rosterSoon)]
  ];
  // A second boot on this page (a layout reload) stops this instance: its panels go and the stock titles
  // and names show again, so the new instance builds one of everything.
  function teardown() {
    const drop = (panel) => {
      if (!valid(panel)) return;
      panel.AddClass("OHLDead");
      panel.DeleteAsync(0);
    };
    for (const key of Object.keys(UI.teams)) {
      const team = UI.teams[key];
      if (valid(team.stock)) team.stock.style.visibility = "visible";
      for (const panel of [team.row, team.card, team.picker]) drop(panel);
    }
    drop(UI.setup);
    drop(UI.ids.OHLShare);
    for (const [button, info] of Alias.info) {
      if (valid(info.nameBox)) info.nameBox.style.opacity = "1";
      drop(button);
    }
    Alias.info.clear();
  }
  page.OHLobbyStop = () => {
    stopped = true;
    for (const [name, id] of listeners) {
      try { $.UnregisterForUnhandledEvent(name, id); } catch (e) {}
    }
    try {
      teardown();
    } catch (e) {
      $.Msg(`${TAG} teardown failed`);
    }
  };
  // First paint: the stock titles stay until the HUD answers.
  render();
  $.Msg(`${TAG} lobby page ready`);
  $.Schedule(0, tick);
})();
