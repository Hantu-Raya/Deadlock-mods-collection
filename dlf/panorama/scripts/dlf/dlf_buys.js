// Per-player purchase notices on the top-bar cards (citadel_hud_top_bar.xml). The recent-purchase
// feature was originally made by bytenode; this replaces DLF's copy of QOLLOCK's popups
// (ql_feat_recentpurchases.js) with Observer HUD's rewrite (oh_buys.js), and since 2026-10-24 (user:
// "add wobble recent purchase from the observer hud") also Observer HUD's notice look.
//
// Source: the stock shop list #RecentPurchasesContainer (in #CitadelHudHeroShop). The engine appends a
// row per purchase and deletes the oldest at 25 (client.dll 6819). A row carries the time, the buyer's
// hero image (heroid) and {s:recent_hero_name}, the item name, isTeam1Purchase (Amber) or
// isTeam2Purchase (Sapphire), isTier1-4Purchase and isWeapon/Armor/TechPurchase. The 6819 row has no
// hero name label, so DLF no longer overrides the shop layout to add one.
//
// Compared with the QOLLOCK copy: no shop layout override, no list walk every 0.2 s (one child count
// every 0.5 s; rows are read once, when they appear), the buyer's card is found by team and hero id
// (else hero name; zero or two matches draw nothing), rows already in the list at first sight (a
// mid-game join) and rows stamped more than STALE_S before the game clock (a seek or a refill) never
// show, and neighbouring stacks are laid out by their cards' screen x, not by purchase time.
//
// Each card gets one .QuickPurchasesPanel (QOLLOCK's host styles in qollock/citadel_hud_top_bar.css: centred,
// flowing up, so the newest notice is on top). Its .DLFBuy notices (dlf_card.css, Observer HUD's .OHBuy):
// the stock shop card's paper under an image frame, in a layer that wobbles like the stock chat bubble,
// the icon and name still. MAX_SHOWN at most, each for state.buys seconds, then a 0.4 s fade. As Observer
// HUD (user 2026-10-24) the panel sits right under the card's
// status grid (#DLFDebuffs, as tall as its rows), 2 px under the ult counter when no status shows; a
// stack that would overlap an earlier stack of its team (by x) moves under it, repeated until it
// overlaps none.
(() => {
  "use strict";

  const TAG = "[DLF-BUY]";
  const POLL_SEC = 0.5;
  const FIND_RETRY_MS = 5000; // a missing list (another mod's shop) is looked for again this often
  const STOCK_CAP = 25;
  const MAX_SHOWN = 3;
  const DEFAULT_SHOW_SEC = 5; // state.buys (the editor's PURCHASE NOTICES), read when a notice is about to show
  const FADE_SEC = 0.4; // .DLFBuy.DLFBuyFading animation-duration in dlf_card.css
  const STALE_S = 10;
  // HUD px: the ult icon and counter (125-167 px), then the status grid (167 px down, 39 px per row).
  // NOTICE_TOP is 2 px under the counter (Observer HUD's .OHBuys margin-top), and the grid's rows push it.
  const NOTICE_TOP = 169;
  const STACK_GAP = 4; // between stacked neighbours
  const ROW_H = 35; // a notice not laid out yet counts this tall (HUD px; .DLFBuy 36 high, margins -2 and 1)
  const NOTICE_W = 209; // and this wide (HUD px; .DLFBuy max-width)
  // Stock row class -> this mod's notice class (the stylesheet restyles no stock class).
  const ROW_CLASSES = [["isTier1Purchase", "DLFBuyT1"], ["isTier2Purchase", "DLFBuyT2"], ["isTier3Purchase", "DLFBuyT3"],
    ["isTier4Purchase", "DLFBuyT4"], ["isWeaponPurchase", "DLFBuyWeapon"], ["isArmorPurchase", "DLFBuyVitality"],
    ["isTechPurchase", "DLFBuySpirit"]];
  // Stock top-bar team panels are fixed by game team: TeamFriendly Amber, TeamEnemy Sapphire.
  const TEAMS = [{ rowClass: "isTeam1Purchase", panelId: "TeamFriendly" }, { rowClass: "isTeam2Purchase", panelId: "TeamEnemy" }];

  const context = $.GetContextPanel();
  if (typeof context.DLFBuysStop === "function") context.DLFBuysStop();
  let stopped = false;
  context.DLFBuysStop = () => { stopped = true; };

  const valid = $.DLFState.valid;
  const attrs = $.DLFState.hudAttrs(context);
  const DEFAULTS = $.DLFState.defaults();
  // Seconds a notice shows (0 off): the editor's setting on the HUD root attribute; read per purchase, not per tick.
  function showSeconds() {
    const parsed = attrs.read($.DLFState.ATTR);
    const seconds = parsed ? $.DLFState.normalize(parsed, DEFAULTS).buys : DEFAULTS.buys;
    return Number.isFinite(seconds) ? seconds : DEFAULT_SHOW_SEC;
  }
  const icons = typeof MOD_ICONS === "object" && MOD_ICONS ? MOD_ICONS : {};
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
    shown: new Map(), // .QuickPurchasesPanel -> notices, oldest first
    tops: new Map(), // .QuickPurchasesPanel -> margin-top written
    clock: null
  };

  function parseClock(text) {
    const match = /^\s*(-?)(\d+):(\d{2})(?::(\d{2}))?\s*$/.exec(String(text || ""));
    if (!match) return null;
    const parts = match[4] === undefined ? [0, +match[2], +match[3]] : [+match[2], +match[3], +match[4]];
    const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return match[1] ? -seconds : seconds;
  }
  const labelText = (panel, cls) => {
    const label = panel.FindChildrenWithClassTraverse(cls)[0];
    const text = valid(label) ? label.text : "";
    return typeof text === "string" ? text.trim() : "";
  };
  const heroIdOf = (panel) => {
    const id = valid(panel) ? Number(panel.heroid) : 0;
    return Number.isInteger(id) && id > 0 ? id : 0;
  };
  // Layout px in HUD px; 0 for a panel that was never laid out (Infinity live, 2026-10-24) or is empty.
  const hudPx = (value, panel) => {
    const scale = Number(panel.actualuiscale_y);
    const px = Number(value) || 0;
    return px > 0 && isFinite(px) ? px / (isFinite(scale) && scale > 0 ? scale : 1) : 0;
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

  // The engine sets {s:recent_hero_name} on the row; a hidden label of ours binds to it. Returns its
  // text as read ("{s:..." while the binding has not resolved).
  function rowHeroText(row) {
    let label = row.FindChildrenWithClassTraverse("DLFBuyHero")[0];
    if (!valid(label)) {
      label = $.CreatePanel("Label", row, "", { class: "DLFBuyHero", text: "{s:recent_hero_name}" });
      label.style.visibility = "collapse";
    }
    const text = valid(label) ? label.text : "";
    return typeof text === "string" ? text : "";
  }

  function teamCards(panelId) {
    const team = context.FindChildTraverse(panelId);
    const players = valid(team) ? team.FindChildTraverse("PlayersContainer") : null;
    return valid(players) ? players.Children().filter((card) => card.paneltype === "CitadelHudTopBarPlayer") : [];
  }

  // The buyer's card: same team, same hero id, else (no id match) same hero name; exactly one.
  function cardFor(row) {
    const team = TEAMS.find((entry) => row.BHasClass(entry.rowClass));
    if (!team) return null;
    const cards = teamCards(team.panelId);
    const heroId = heroIdOf(row.FindChildTraverse("RecentPurchaseHeroImage"));
    let found = heroId ? cards.filter((card) => heroIdOf(card.FindChildTraverse("HeroBadge")) === heroId) : [];
    if (found.length) {
      logOnce("match:id", `match id (hero ${heroId})`);
      return found.length === 1 ? found[0] : null;
    }
    const raw = rowHeroText(row);
    const heroName = raw.indexOf("{s:") < 0 ? raw.trim().toUpperCase() : "";
    if (heroName) found = cards.filter((card) => labelText(card, "HeroName").toUpperCase() === heroName);
    const why = `row name "${raw}", hero id ${heroId}, card heroes ${cards.map((card) => labelText(card, "HeroName")).join("/")}`;
    logOnce(found.length ? "match:name" : "match:none", `match ${found.length ? "name" : "none"}: ${why}`);
    return found.length === 1 ? found[0] : null;
  }

  function stale(row) {
    if (!valid(Buys.clock)) Buys.clock = context.FindChildTraverse("GameTime");
    const now = valid(Buys.clock) ? parseClock(Buys.clock.text) : null;
    const at = parseClock(labelText(row, "recentTimePurchased"));
    return now !== null && at !== null && now - at > STALE_S;
  }

  // The card's notice host: QOLLOCK's .QuickPurchasesPanel plus .DLFBuyHost (a fixed 209 px, dlf_card.css).
  function hostFor(card) {
    for (const child of card.Children()) {
      if (!child.BHasClass("QuickPurchasesPanel")) continue;
      if (!child.BHasClass("DLFBuyHost")) child.AddClass("DLFBuyHost"); // a host from before a reload
      return child;
    }
    const host = $.CreatePanel("Panel", card, "");
    host.AddClass("QuickPurchasesPanel");
    host.AddClass("DLFBuyHost");
    return host;
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
    notice.AddClass("DLFBuyFading");
    $.Schedule(FADE_SEC, () => {
      if (valid(notice)) notice.DeleteAsync(0);
      if (!stopped) layout();
    });
  }

  function show(row) {
    const card = cardFor(row);
    const name = labelText(row, "recentModPurchaseName");
    if (!card || !name) {
      logOnce(`nocard:${name ? "card" : "name"}`, `a purchase found no ${name ? "card" : "item name"}; it shows nowhere`);
      return;
    }
    const seconds = showSeconds();
    if (seconds <= 0) return;
    const host = hostFor(card);
    let list = Buys.shown.get(host);
    if (!list) Buys.shown.set(host, (list = []));
    while (list.length >= MAX_SHOWN) drop(host, list[0], false);
    const notice = $.CreatePanel("Panel", host, "");
    notice.AddClass("DLFBuy");
    for (const [stock, own] of ROW_CLASSES) if (row.BHasClass(stock)) notice.AddClass(own);
    // The wobbling layer (Observer HUD's): the stock shop card's paper (slot/tier backer, wear, paper grain)
    // in a box, under a frame drawn as images (left cap, stretched middle, right cap) whose transparent rim
    // hides the panel edges Panorama does not anti-alias.
    const bg = $.CreatePanel("Panel", notice, "");
    bg.AddClass("DLFBuyBg");
    const paper = $.CreatePanel("Panel", bg, "");
    paper.AddClass("DLFBuyPaperBox");
    for (const layer of ["DLFBuyBacker", "DLFBuyWear", "DLFBuyPaper"]) $.CreatePanel("Panel", paper, "").AddClass(layer);
    // Middle (in its own flow row, so fill-parent-flow insets it under the caps), then the caps on top.
    const midRow = $.CreatePanel("Panel", bg, "");
    midRow.AddClass("DLFBuyEdgeRow");
    $.CreatePanel("Panel", midRow, "").AddClass("DLFBuyEdgeM");
    $.CreatePanel("Panel", bg, "").AddClass("DLFBuyEdgeL");
    $.CreatePanel("Panel", bg, "").AddClass("DLFBuyEdgeR");
    const icon = $.CreatePanel("Panel", notice, "");
    icon.AddClass("DLFBuyIcon");
    const url = Object.prototype.hasOwnProperty.call(icons, name) ? icons[name] : "";
    if (url) {
      // Written a frame later, as the QOLLOCK copy did (the reason is not recorded).
      $.Schedule(0, () => {
        if (!valid(icon)) return;
        icon.style.backgroundImage = url;
        icon.style.backgroundSize = "100% 100%";
      });
    } else {
      icon.AddClass("DLFBuyNoIcon");
    }
    const label = $.CreatePanel("Label", notice, "");
    label.AddClass("DLFBuyName");
    label.text = name;
    list.push(notice);
    $.Schedule(seconds, () => drop(host, notice, true));
    // Lay out again once the new notice has its real size.
    $.Schedule(0.1, () => {
      if (!stopped) layout();
    });
  }

  function setTop(host, top) {
    const text = `${Math.round(top)}px`;
    if (Buys.tops.get(host) === text) return;
    host.style.marginTop = text;
    Buys.tops.set(host, text);
  }

  // One team's stacks by screen x, each centred on its card (user 2026-10-24, the innermost too): each
  // moves under every earlier stack it would overlap (moving down can meet another, so repeat until
  // none). x and widths are screen px; tops and heights HUD px.
  function layoutTeam(cards) {
    const stacks = [];
    for (const card of cards) {
      let host = null;
      for (const child of card.Children()) if (child.BHasClass("QuickPurchasesPanel")) host = child;
      const list = host ? Buys.shown.get(host) : null;
      if (!list || !list.length) continue;
      const debuffs = card.FindChildTraverse("DLFDebuffs");
      const debuffH = valid(debuffs) ? hudPx(debuffs.actuallayoutheight, debuffs) : 0;
      const natural = NOTICE_TOP + (debuffH > 0 ? debuffH : 0);
      const scale = Number(card.actualuiscale_x) || 1;
      // The host is a fixed 209 px; the stack is as wide as its widest notice laid out so far.
      let widest = 0;
      for (const notice of list) {
        const width = valid(notice) ? Number(notice.actuallayoutwidth) : 0;
        if (width > widest && isFinite(width)) widest = width;
      }
      const reach = widest || NOTICE_W * scale;
      const height = hudPx(host.contentheight, host) || list.length * ROW_H;
      // A card that was never laid out has no screen x: it keeps its natural top and is not compared.
      const left = Number(card.GetPositionWithinWindow().x);
      const width = Number(card.actuallayoutwidth) || 0;
      const x = left + width / 2;
      stacks.push({ host, natural, reach, height, x, top: 0, bottom: 0 });
    }
    stacks.sort((a, b) => a.x - b.x);
    stacks.forEach((stack, i) => {
      let top = stack.natural;
      for (let moved = true; moved;) {
        moved = false;
        for (let j = 0; j < i; j++) {
          const other = stacks[j];
          if (!isFinite(stack.x) || !isFinite(other.x) || Math.abs(stack.x - other.x) * 2 >= stack.reach + other.reach) continue;
          if (top < other.bottom && top + stack.height > other.top) {
            top = other.bottom + STACK_GAP;
            moved = true;
          }
        }
      }
      stack.top = top;
      stack.bottom = top + stack.height;
      setTop(stack.host, top);
    });
  }

  function layout() {
    for (const team of TEAMS) layoutTeam(teamCards(team.panelId));
  }

  function anyShown() {
    for (const [host, list] of Buys.shown) {
      if (list.length && valid(host)) return true;
      Buys.shown.delete(host);
      Buys.tops.delete(host);
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
    for (const row of newRows(list, count)) if (!stale(row)) show(row);
  }

  // ---------------------------------------------------------------- kill feed
  // The stock kill feed (hud_data_feed.xml #EventFeed: top left, margin-top FEED_STOCK_TOP) can run over
  // the leftmost cards' status grid, ult counter and purchase notices (Observer HUD's placeFeed; user
  // screenshot 2026-10-23, same stock panel). While it holds a kill row it moves down (inline margin-top)
  // to FEED_GAP px under the lowest of those whose left edge is left of the feed's right edge (its widest
  // row, else FEED_W). Down at once, back up only after FEED_HOLD_MS, so a blinking status does not bounce
  // it; the stock place is written back as px (an inline null clear is not trusted live). Card places are
  // cached for FEED_GEOMETRY_MS (2 s while a card is not laid out); an empty feed at its stock place is
  // looked at every FEED_IDLE_TICKS polls only.
  const FEED_STOCK_TOP = 200;
  const FEED_GAP = 6;
  const FEED_W = 360;
  const FEED_HOLD_MS = 2000;
  const FEED_GEOMETRY_MS = 30000;
  const FEED_UNLAID_MS = 2000;
  const FEED_IDLE_TICKS = 2;
  const ULT_BOTTOM = 167; // HUD px under the card's top: the ult counter's bottom
  const Feed = { panel: null, findAt: 0, margin: FEED_STOCK_TOP, holdUntil: 0, cards: null, until: 0,
    x: NaN, stockTop: NaN, count: 0, widest: 0, idle: 0 };
  const finite = (value) => typeof value === "number" && isFinite(value);

  function findFeed(now) {
    if (valid(Feed.panel)) return Feed.panel;
    Feed.cards = null;
    if (now < Feed.findAt) return null;
    const found = attrs.root().FindChildTraverse("EventFeed");
    if (!valid(found)) {
      Feed.panel = null;
      Feed.findAt = now + FIND_RETRY_MS;
      return null;
    }
    Feed.panel = found;
    // A reload finds the feed where the last instance left it.
    const inline = /^(-?\d+(?:\.\d+)?)px$/.exec(String(found.style.marginTop || ""));
    Feed.margin = inline ? Math.round(Number(inline[1])) : FEED_STOCK_TOP;
    Feed.x = NaN;
    Feed.stockTop = NaN;
    return found;
  }

  // Laid-out cards of both teams with their screen place, the feed's own place read with them: at its
  // stock margin directly; moved (found so after a reload) less the margin's offset. A feed this script
  // moved keeps the place read before, so a margin written this frame cannot skew it.
  function feedCards(feed, scale, now) {
    if (Feed.cards && now < Feed.until && finite(Feed.stockTop)) return Feed.cards;
    let unlaid = false;
    Feed.cards = [];
    for (const team of TEAMS) {
      for (const card of teamCards(team.panelId)) {
        const at = card.GetPositionWithinWindow();
        const x = Number(at.x);
        const y = Number(at.y);
        if (!finite(x) || !finite(y)) {
          unlaid = true;
          continue;
        }
        Feed.cards.push({ card: card, x: x, y: y, column: card.FindChildTraverse("DLFDebuffs"), ult: card.FindChildTraverse("DLFUltCooldown") });
      }
    }
    Feed.until = now + (unlaid ? FEED_UNLAID_MS : FEED_GEOMETRY_MS);
    if (Feed.margin === FEED_STOCK_TOP || !finite(Feed.stockTop)) {
      const at = feed.GetPositionWithinWindow();
      Feed.x = Number(at.x);
      Feed.stockTop = Number(at.y) - (Feed.margin - FEED_STOCK_TOP) * scale;
    }
    return Feed.cards;
  }

  // Screen y of the lowest thing on this card that the feed reaches (left of `right`), or 0.
  function cardBottom(entry, right, scale) {
    let bottom = 0;
    const column = entry.column;
    const height = valid(column) ? Number(column.actuallayoutheight) : 0;
    if (height > 0 && finite(height)) {
      const y = Number(column.GetPositionWithinWindow().y) + height;
      if (finite(y)) bottom = Math.max(bottom, y);
    }
    if (valid(entry.ult) && entry.ult.BHasClass("DLFCounting")) bottom = Math.max(bottom, entry.y + ULT_BOTTOM * scale);
    for (const [host, list] of Buys.shown) {
      if (!list.length || !valid(host) || host.GetParent() !== entry.card) continue;
      const at = host.GetPositionWithinWindow();
      const hostH = Number(host.actuallayoutheight) || Number(host.contentheight) || 0;
      const y = Number(at.y) + hostH;
      if (Number(at.x) < right && hostH > 0 && finite(y)) bottom = Math.max(bottom, y);
    }
    return bottom;
  }

  function placeFeed(now) {
    const feed = findFeed(now);
    if (!feed) return;
    const count = feed.GetChildCount();
    if (count !== Feed.count || (count && !Feed.widest)) {
      Feed.widest = 0;
      for (const row of feed.Children()) {
        const width = Number(row.actuallayoutwidth);
        if (finite(width)) Feed.widest = Math.max(Feed.widest, width);
      }
    }
    Feed.count = count;
    if (!count && Feed.margin === FEED_STOCK_TOP) return;
    const scaleRead = Number(feed.actualuiscale_y);
    const scale = finite(scaleRead) && scaleRead > 0 ? scaleRead : 1;
    const cards = feedCards(feed, scale, now);
    let want = FEED_STOCK_TOP;
    const right = Feed.x + (Feed.widest || FEED_W * scale);
    if (count && finite(right) && finite(Feed.stockTop)) {
      let bottom = 0;
      for (const entry of cards) {
        if (entry.x >= right) continue;
        if (!valid(entry.card)) {
          Feed.cards = null;
          continue;
        }
        bottom = Math.max(bottom, cardBottom(entry, right, scale));
      }
      if (bottom) want = Math.max(FEED_STOCK_TOP, Math.round(FEED_STOCK_TOP + (bottom + FEED_GAP * scale - Feed.stockTop) / scale));
    }
    if (!finite(want)) return;
    if (want >= Feed.margin) Feed.holdUntil = now + FEED_HOLD_MS;
    else if (now < Feed.holdUntil) return;
    if (want === Feed.margin) return;
    feed.style.marginTop = `${want}px`;
    Feed.margin = want;
  }

  function tick() {
    if (stopped) return;
    try {
      scan();
      // Debuff icons come and go under shown notices: re-lay while any shows.
      if (anyShown()) layout();
      // The kill feed: every poll while it holds a row or sits moved, else every FEED_IDLE_TICKS polls.
      if (Feed.count || Feed.margin !== FEED_STOCK_TOP || ++Feed.idle >= FEED_IDLE_TICKS) {
        Feed.idle = 0;
        placeFeed(Date.now());
      }
    } catch (e) {
      logOnce("poll", `poll failed: ${e && e.message ? e.message : e}`);
    }
    $.Schedule(POLL_SEC, tick);
  }

  $.Schedule(POLL_SEC, tick);
})();
