// Observer HUD purchase notices (host: this mod's hud_spectate_bar.xml), a rewrite of DLF's QOLLOCK
// recent-purchase popups. The stock shop list (#RecentPurchasesContainer in #CitadelHudHeroShop) gets a
// row per purchase: the engine appends it (flow-children: up draws it on top) and deletes the oldest
// row at 25 (client.dll 6819, rva 0x1bdd790). The row carries the time, the buyer's hero image (heroid)
// and {s:recent_hero_name} dialog variable, the item name, isTeam1Purchase (team 2, Amber) or
// isTeam2Purchase (team 3, Sapphire), isTier1-4Purchase and isWeapon/Armor/TechPurchase. Each new row puts a notice on the buyer's top-bar
// card, inside the status column under its slots (#OHBuys in observer_hud/debuffs.xml): one line,
// newest on top, MAX_SHOWN at most, each for state.buys seconds, then a 0.4 s fade.
// A notice is at most MAX_NOTICE_W wide (oh_debuffs.css). While any notice shows, each team's stacks are
// laid out left to right by their cards' x (child order is not screen order: .connectedToHeroTesting
// .friend #PlayersContainer flows left in stock CSS): a stack whose notices (measured width, else the
// maximum) would overlap an earlier stack's moves under it. Heights are known (status slots 43 px,
// notice rows 39 px); a stack counts every notice still drawn, fading ones too.
// Compared with DLF: no shop layout override, no full-list scan per tick, no per-hero panels. The poll
// runs only while spectating and reads one validity flag below the stock cap (two at it) while no
// notice shows; rows are matched once, when they appear.
// (live 2026-10-23, user: two-line names shrank too small; one line preferred.)
// Rows present at first sight (joining mid-game) and rows stamped more than STALE_S before the game
// clock (a seek or a refill) never show. The card is the one on the buyer's team with the same hero
// id, else the same hero name; no match or two matches draw nothing.
(() => {
  "use strict";

  const TAG = "[OH-BUY]";
  const POLL_SEC = 0.5;
  const IDLE_POLL_SEC = 2; // not spectating: only the plain host flag is read
  const FIND_RETRY_MS = 5000; // a missing list (another mod's shop) is looked for again this often
  const STOCK_CAP = 25;
  const MAX_SHOWN = 3;
  const FADE_SEC = 0.4; // equal to the OHBuyFadeOut animation-duration in oh_debuffs.css
  const STALE_S = 10;
  // Heights in HUD px, equal to oh_debuffs.css: a status slot (.OHDebuff), a notice row (.OHBuy height +
  // margin-top + margin-bottom: 40 - 2 + 1, a 36 px frame in a 2 px transparent rim), the gap above the
  // stack (.OHBuys margin-top) and between stacked neighbours.
  const SLOT_H = 43;
  const ROW_H = 39;
  const STACK_TOP = 2;
  const STACK_GAP = 4;
  const MAX_NOTICE_W = 232; // .OHBuy max-width (228 px frame + rim): a notice not laid out yet counts this wide
  const TEAMS = [["isTeam1Purchase", "TeamFriendly"], ["isTeam2Purchase", "TeamEnemy"]];
  // Stock row class -> this mod's notice class (the stylesheet restyles no stock class).
  const ROW_CLASSES = [["isTier1Purchase", "OHBuyT1"], ["isTier2Purchase", "OHBuyT2"], ["isTier3Purchase", "OHBuyT3"],
    ["isTier4Purchase", "OHBuyT4"], ["isWeaponPurchase", "OHBuyWeapon"], ["isArmorPurchase", "OHBuyVitality"],
    ["isTechPurchase", "OHBuySpirit"]];

  const context = $.GetContextPanel();
  if (typeof context.OHBuysStop === "function") context.OHBuysStop();
  let stopped = false;
  context.OHBuysStop = () => {
    stopped = true;
  };

  const valid = $.OHState.valid;
  const logged = new Set();
  const logOnce = (key, message) => {
    if (logged.has(key)) return;
    logged.add(key);
    $.Msg(`${TAG} ${message}`);
  };

  const Buys = {
    list: null,
    findAt: 0,
    count: -1, // rows at the last poll
    last: null, // the newest row at the last poll
    seen: new WeakSet(),
    shown: new Map(), // #OHBuys panel -> notices, newest first
    pushed: new Map() // #OHBuys panel -> extra margin-top written (px)
  };

  const icons = typeof OH_ITEM_ICONS === "object" && OH_ITEM_ICONS ? OH_ITEM_ICONS : {};

  const parseClock = $.OHState.parseClock;

  const labelText = (panel, cls) => {
    const label = panel.FindChildrenWithClassTraverse(cls)[0];
    const text = valid(label) ? label.text : "";
    return typeof text === "string" ? text.trim() : "";
  };
  const heroIdOf = (panel) => {
    const id = valid(panel) ? Number(panel.heroid) : 0;
    return Number.isInteger(id) && id > 0 ? id : 0;
  };

  function findList() {
    if (valid(Buys.list)) return Buys.list;
    const now = Date.now();
    if (now < Buys.findAt) return null;
    let root = context;
    while (root.GetParent()) root = root.GetParent();
    const list = root.FindChildTraverse("RecentPurchasesContainer");
    if (!valid(list)) {
      Buys.findAt = now + FIND_RETRY_MS;
      logOnce("list", "no #RecentPurchasesContainer (another mod's shop?); purchase notices wait");
      return null;
    }
    // A new list (first sight or the HUD rebuilt): its rows are history.
    Buys.list = list;
    for (const row of list.Children()) Buys.seen.add(row);
    Buys.count = list.GetChildCount();
    Buys.last = Buys.count > 0 ? list.GetChild(Buys.count - 1) : null;
    return null;
  }

  // 6819's row has no hero name label (older stock and QOLLOCK's copy had .recentModPurchaserHero), but
  // the engine still sets {s:recent_hero_name} on the row: a label of ours binds to it.
  function rowHeroName(row) {
    let label = row.FindChildrenWithClassTraverse("OHBuyHero")[0] || row.FindChildrenWithClassTraverse("recentModPurchaserHero")[0];
    if (!valid(label)) {
      label = $.CreatePanel("Label", row, "", { class: "OHBuyHero", text: "{s:recent_hero_name}" });
      label.style.visibility = "collapse";
    }
    const text = valid(label) ? label.text : "";
    return typeof text === "string" && text.indexOf("{s:") < 0 ? text.trim().toUpperCase() : "";
  }

  // The buyer's card: same team, same hero id, else same hero name; exactly one.
  function cardFor(row) {
    const team = TEAMS.find(([cls]) => row.BHasClass(cls));
    const topBar = $.OHHost.topBar();
    if (!team || !topBar) return null;
    const teamPanel = topBar.FindChildTraverse(team[1]);
    const players = valid(teamPanel) ? teamPanel.FindChildTraverse("PlayersContainer") : null;
    if (!valid(players)) return null;
    const heroId = heroIdOf(row.FindChildTraverse("RecentPurchaseHeroImage"));
    const heroName = rowHeroName(row);
    const cards = players.Children().filter((card) => valid(card) && card.paneltype === "CitadelHudTopBarPlayer");
    let found = heroId ? cards.filter((card) => heroIdOf(card.FindChildTraverse("HeroBadge")) === heroId) : [];
    if (found.length === 0 && heroName) found = cards.filter((card) => labelText(card, "HeroName").toUpperCase() === heroName);
    return found.length === 1 ? found[0] : null;
  }

  function stale(row) {
    const topBar = $.OHHost.topBar();
    const clock = topBar ? topBar.FindChildTraverse("GameTime") : null;
    const now = valid(clock) ? parseClock(clock.text) : null;
    const at = parseClock(labelText(row, "recentTimePurchased"));
    return now !== null && at !== null && now - at > STALE_S;
  }

  function drop(host, notice, fade) {
    const list = Buys.shown.get(host) || [];
    const index = list.indexOf(notice);
    if (index >= 0) list.splice(index, 1);
    if (!valid(notice)) return;
    if (!fade) {
      notice.DeleteAsync(0);
      return;
    }
    notice.AddClass("OHBuyFading");
    $.Schedule(FADE_SEC, () => {
      if (valid(notice)) notice.DeleteAsync(0);
    });
  }

  function show(row, seconds) {
    const card = cardFor(row);
    const host = card ? card.FindChildTraverse("OHBuys") : null;
    const name = labelText(row, "recentModPurchaseName");
    if (!valid(host) || !name) {
      logOnce(`nocard:${name ? "card" : "name"}`, `a purchase found no ${name ? "card" : "item name"}; it shows nowhere`);
      return;
    }
    let list = Buys.shown.get(host);
    if (!list) Buys.shown.set(host, (list = []));
    while (list.length >= MAX_SHOWN) drop(host, list[list.length - 1], false);
    const notice = $.CreatePanel("Panel", host, "");
    notice.AddClass("OHBuy");
    for (const [stock, own] of ROW_CLASSES) if (row.BHasClass(stock)) notice.AddClass(own);
    // The wobbling layer (stock chat bubble groove): the stock shop card's paper (citadel_shop_mod_view:
    // slot/tier backer, wear, paper grain) in a box, under a frame drawn as images (left cap, stretched
    // middle, right cap) whose transparent rim hides the panel edges Panorama does not anti-alias.
    const bg = $.CreatePanel("Panel", notice, "");
    bg.AddClass("OHBuyBg");
    const paper = $.CreatePanel("Panel", bg, "");
    paper.AddClass("OHBuyPaperBox");
    for (const layer of ["OHBuyBacker", "OHBuyWear", "OHBuyPaper"]) {
      $.CreatePanel("Panel", paper, "").AddClass(layer);
    }
    // Middle (in its own flow row, so fill-parent-flow insets it under the caps), then the caps on top.
    const midRow = $.CreatePanel("Panel", bg, "");
    midRow.AddClass("OHBuyEdgeRow");
    $.CreatePanel("Panel", midRow, "").AddClass("OHBuyEdgeM");
    $.CreatePanel("Panel", bg, "").AddClass("OHBuyEdgeL");
    $.CreatePanel("Panel", bg, "").AddClass("OHBuyEdgeR");
    const icon = $.CreatePanel("Image", notice, "");
    icon.AddClass("OHBuyIcon");
    const path = Object.prototype.hasOwnProperty.call(icons, name) ? icons[name] : "";
    if (path) icon.SetImage(`file://{images}/${path}.psd`);
    else icon.AddClass("OHBuyNoIcon");
    const label = $.CreatePanel("Label", notice, "");
    label.AddClass("OHBuyName");
    label.text = name;
    const first = host.GetChild(0);
    if (first && first !== notice) host.MoveChildBefore(notice, first);
    list.unshift(notice);
    $.Schedule(seconds, () => drop(host, notice, true));
    // Lay out again once the new notice has its real width.
    $.Schedule(0.1, () => {
      if (!stopped) layout();
    });
  }

  function setPush(host, push) {
    if ((Buys.pushed.get(host) || 0) === push) return;
    if (!valid(host)) {
      Buys.pushed.delete(host);
      return;
    }
    // Always explicit px: clearing an inline style with null did not take live (ENGINE.md).
    host.style.marginTop = `${STACK_TOP + push}px`;
    if (push) Buys.pushed.set(host, push);
    else Buys.pushed.delete(host);
  }

  const shownCount = (column) => column.Children().filter((slot) => slot.BHasClass("OHShown")).length;

  // One team's stacks by x: each moves under every earlier stack it would overlap (moving down can
  // meet another, so repeat until none). x comes from GetPositionWithinWindow, in screen px like the
  // measured widths (actualxoffset's unit is not recorded live; m1 audit B8).
  function layoutTeam(players, placed) {
    const stacks = [];
    for (const card of players.Children()) {
      if (card.paneltype !== "CitadelHudTopBarPlayer") continue;
      const column = card.FindChild("OHDebuffsHost");
      const host = valid(column) ? column.FindChild("OHBuys") : null;
      const rows = valid(host) ? host.GetChildCount() : 0;
      if (!rows) continue;
      let reach = 0;
      for (const notice of host.Children()) reach = Math.max(reach, Number(notice.actuallayoutwidth) || 0);
      if (!(reach > 0)) reach = MAX_NOTICE_W * (Number(card.actualuiscale_x) || 1);
      const x = Number(card.GetPositionWithinWindow().x) + (Number(card.actuallayoutwidth) || 0) / 2;
      stacks.push({ host, rows, reach, x, natural: shownCount(column) * SLOT_H, top: 0, bottom: 0 });
    }
    stacks.sort((a, b) => a.x - b.x);
    stacks.forEach((stack, i) => {
      let top = stack.natural;
      for (let moved = true; moved;) {
        moved = false;
        for (let j = 0; j < i; j++) {
          const other = stacks[j];
          if (Math.abs(stack.x - other.x) * 2 >= stack.reach + other.reach) continue;
          if (top < other.bottom && top + stack.rows * ROW_H > other.top) {
            top = other.bottom + STACK_GAP;
            moved = true;
          }
        }
      }
      stack.top = top;
      stack.bottom = top + stack.rows * ROW_H;
      setPush(stack.host, top - stack.natural);
      placed.add(stack.host);
    });
  }

  function layout() {
    const topBar = $.OHHost.topBar();
    if (!topBar) return;
    const placed = new Set();
    for (const [, teamId] of TEAMS) {
      const teamPanel = topBar.FindChildTraverse(teamId);
      const players = valid(teamPanel) ? teamPanel.FindChildTraverse("PlayersContainer") : null;
      if (valid(players)) layoutTeam(players, placed);
    }
    for (const host of Array.from(Buys.pushed.keys())) if (!placed.has(host)) setPush(host, 0);
  }

  function anyShown() {
    for (const [host, list] of Buys.shown) {
      if (list.length) return true;
      Buys.shown.delete(host);
    }
    return false;
  }

  // Rows appended since the last poll: walk back from the newest to the first one already seen.
  function newRows(list, count) {
    const rows = [];
    for (let i = count - 1; i >= 0; i--) {
      const row = list.GetChild(i);
      if (!row || Buys.seen.has(row)) break;
      Buys.seen.add(row);
      rows.unshift(row);
    }
    return rows;
  }

  function scan() {
    const list = findList();
    if (!list) return;
    const count = list.GetChildCount();
    // Below the cap a row only arrives by appending, so an unchanged count means no new row.
    if (count === Buys.count && count < STOCK_CAP) return;
    const last = count > 0 ? list.GetChild(count - 1) : null;
    if (count === Buys.count && last === Buys.last) return;
    Buys.count = count;
    Buys.last = last;
    const seconds = $.OHHost.getState().buys;
    for (const row of newRows(list, count)) {
      if (seconds > 0 && !stale(row)) show(row, seconds);
    }
  }

  // True while spectating (the next poll comes at POLL_SEC, else IDLE_POLL_SEC).
  function poll() {
    if (!$.OHHost.watching()) return false;
    scan();
    // Status slots come and go under shown notices: re-lay while any shows, once more to clear.
    if (anyShown() || Buys.pushed.size) layout();
    return true;
  }

  function tick() {
    if (stopped) return;
    let watching = true;
    try {
      watching = poll();
    } catch (e) {
      logOnce("poll", `poll failed: ${e && e.message ? e.message : e}`);
    }
    $.Schedule(watching ? POLL_SEC : IDLE_POLL_SEC, tick);
  }

  $.Schedule(POLL_SEC, tick);
})();
