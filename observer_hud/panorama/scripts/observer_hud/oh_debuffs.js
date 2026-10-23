// Observer HUD ability status column, HUD side (host: this mod's hud_spectate_bar.xml), ported from
// DLF's dlf_debuffs.js with its rules. World healthbars (oh_debuff_world.js) send OH_DEBUFF_SNAPSHOT
// { source, name, items: [[key, debuff, count, end, stun]] }; this draws each hero's statuses in the
// four static slots of the column oh_host.js injects under each stock top-bar card
// (observer_hud/debuffs.xml), matched by player name. A slot's colour is the applying team's: the
// other team for a debuff, the hero's own team for a listed buff. A count of 2+ shows as a badge; a
// predicted end shows as whole seconds left plus END_PAD_MS, redrawn every 0.25 s while one runs. A stun is its own
// slot with the stock stun mark (.OHStun). A status that goes away keeps its slot for FADE_MS with
// .OHFading, whose CSS keyframe animation fades it out. The editor's DEV settings (state.dev) go to
// every world bar as OH_DEBUFF_CONFIG on change and every 4 s, so bars created later pick them up.
(() => {
  "use strict";

  const TAG = "[OH-DB]";
  const TICK_SEC = 1;
  const COUNTDOWN_TICK_SEC = 0.25;
  const RESCAN_MS = 5000;
  const VALIDATE_MS = 1000; // cards and names are checked at most this often (the countdown ticks only paint)
  // A snapshot for a name no card has (a hero that just spawned) rescans at once, at most every
  // UNMATCHED_RESCAN_MS; a throttled or fruitless rescan is retried at that deadline while the record
  // is at most UNMATCHED_WINDOW_MS unmatched (the card can appear just after the status).
  const UNMATCHED_RESCAN_MS = 500;
  const UNMATCHED_WINDOW_MS = 2000;
  const CONFIG_HEARTBEAT_MS = 4000;
  const TTL_MS = 10000; // world bars resend every 4 s while something is shown
  const MAX_END_AHEAD_MS = 300000;
  const MAX_KEYS = 8;
  const MAX_COUNT = 99;
  const FADE_MS = 1000; // equal to the OHDebuffFadeOut animation-duration in oh_debuffs.css
  const END_PAD_MS = 1000; // the countdown reads one second longer than the predicted end (user 2026-10-23)
  const KEY = /^[a-z0-9_]{1,64}$/;
  const GENERIC_ICON = "s2r://panorama/images/icons/properties/debuff.vsvg";
  // Listed abilities without an ability image (spectator-status.json; the validator checks).
  const EXTRA_ICONS = { citadel_ability_zip_line: "s2r://panorama/images/icons/properties/zipline.vsvg" };
  const EMPTY = [];
  // Stock top-bar team panels are fixed by game team: TeamFriendly is Amber (team 2), TeamEnemy is
  // Sapphire (team 3). A debuff comes from the other team.
  const TEAMS = [
    { panelId: "TeamFriendly", own: "OHByAmber", other: "OHBySapphire" },
    { panelId: "TeamEnemy", own: "OHBySapphire", other: "OHByAmber" }
  ];
  const BY_CLASSES = ["OHByAmber", "OHBySapphire"];

  const context = $.GetContextPanel();
  if (typeof context.OHDebuffsStop === "function") context.OHDebuffsStop();
  let stopped = false;
  let listener = null;
  let loop = 0; // only the newest scheduled tick runs

  const valid = $.OHState.valid;
  const logged = new Set();
  const logOnce = (what, e) => {
    if (logged.has(what)) return;
    logged.add(what);
    $.Msg(`${TAG} ${what}: ${e && e.message ? e.message : e}`);
  };

  const DEFAULTS = $.OHState.defaults();
  const State = {
    records: new Map(), // source -> { name, items, at, instance, seq }
    cards: [],
    nextRescanMs: 0,
    on: DEFAULTS.dev.debuffs,
    poll: DEFAULTS.dev.debuffPollMs,
    log: DEFAULTS.dev.logStatus,
    stateVersion: -1,
    configSig: "",
    configSentAt: 0,
    unmatchedScanAt: 0,
    rescanQueued: false,
    counting: false, // a slot shows seconds left or is fading
    idle: false, // not spectating at the last tick: the column does no work
    // The 0.25 s countdown ticks paint only: the cards are validated (VALIDATE_MS) and their names read
    // at most once a second (m1 audit O1: every countdown tick re-validated 12 cards and re-read their names).
    validateAt: 0,
    names: [],
    namesAt: 0
  };

  // ------------------------------------------------------------------ icons

  let icons = null;
  function iconFor(key) {
    if (!icons) {
      icons = new Map();
      const table = typeof OH_DEBUFF_ICONS === "object" && OH_DEBUFF_ICONS ? OH_DEBUFF_ICONS : {};
      for (const folder of Object.keys(table)) {
        for (const entry of String(table[folder]).split(" ")) {
          const split = entry.indexOf("=");
          const file = split < 0 ? entry : entry.slice(split + 1);
          icons.set(split < 0 ? entry : entry.slice(0, split),
            `file://{images}/${folder}/${file.indexOf(".") < 0 ? file + ".psd" : file}`);
        }
      }
    }
    return icons.get(key) || EXTRA_ICONS[key] || GENERIC_ICON;
  }

  // ------------------------------------------------------------------ config

  // True when the switch or interval changed.
  function refreshConfig(now) {
    const version = $.OHHost.version();
    if (version !== State.stateVersion) {
      State.stateVersion = version;
      const dev = $.OHHost.getState().dev;
      State.on = dev.debuffs;
      State.poll = dev.debuffPollMs;
      State.log = dev.logStatus;
    }
    const sig = `${State.on}|${State.poll}|${State.log}`;
    const changed = sig !== State.configSig;
    if (changed) $.Msg(`${TAG} config icons=${State.on} poll=${State.poll} log=${State.log}`);
    if (changed || now < State.configSentAt || now - State.configSentAt >= CONFIG_HEARTBEAT_MS) {
      State.configSig = sig;
      State.configSentAt = now;
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "OH_DEBUFF_CONFIG", on: State.on, poll: State.poll, log: State.log, at: now
      }));
    }
    return changed;
  }

  // ------------------------------------------------------------------ cards

  function scanCards() {
    const cards = [];
    const topBar = $.OHHost.topBar();
    for (const team of TEAMS) {
      const teamPanel = valid(topBar) ? topBar.FindChildTraverse(team.panelId) : null;
      const players = valid(teamPanel) ? teamPanel.FindChildTraverse("PlayersContainer") : null;
      if (!valid(players)) continue;
      for (const panel of players.Children()) {
        if (!valid(panel) || panel.paneltype !== "CitadelHudTopBarPlayer") continue;
        // Reuse a card only while all its cached panels live: the engine can rebuild a card's children.
        const known = State.cards.find((card) => card.panel === panel && card.team === team);
        if (known && cardComplete(known)) {
          cards.push(known);
          continue;
        }
        const column = panel.FindChild("OHDebuffsHost"); // injected by oh_host.js
        if (!valid(column)) continue;
        const label = panel.FindChildrenWithClassTraverse("AlwaysPlayerName")[0] ||
          panel.FindChildrenWithClassTraverse("PlayerName")[0] || null;
        if (!valid(label)) continue; // snapshots match cards by name
        const slots = [];
        for (const slot of column.Children()) {
          const image = slot.FindChildrenWithClassTraverse("OHDebuffIcon")[0];
          const count = slot.FindChildrenWithClassTraverse("OHDebuffCount")[0];
          const time = slot.FindChildrenWithClassTraverse("OHDebuffTime")[0];
          if (valid(image) && valid(count) && valid(time)) {
            slots.push({ panel: slot, image, count, time, key: "", stun: false, by: "", countText: "", timeText: "",
              fading: false });
          }
        }
        cards.push({ panel, label, column, slots, team, shown: [] });
      }
    }
    State.cards = cards;
    State.namesAt = 0;
  }

  // Checks each card's panel, column and name label (at most every VALIDATE_MS); slots are checked when
  // a rescan reuses a card.
  const cardLive = (card) => valid(card.panel) && valid(card.column) && valid(card.label);
  const cardComplete = (card) => cardLive(card) && card.slots.length > 0 &&
    card.slots.every((slot) => valid(slot.panel) && valid(slot.image) && valid(slot.count) && valid(slot.time));
  const cardsValid = () => State.cards.length > 0 && State.cards.every(cardLive);

  const cardName = (card) => {
    const text = valid(card.label) ? card.label.text : "";
    return typeof text === "string" ? text.trim().toUpperCase() : "";
  };

  // A label shows when its text is non-empty; writes happen only on change.
  function setBadge(slot, field, labelKey, flag, text) {
    if (slot[field] === text) return;
    if (text) slot[labelKey].text = text;
    slot.panel.SetHasClass(flag, !!text);
    slot[field] = text;
  }

  // What a card shows: the statuses it showed before, in place (gone ones fading until fadeEnd),
  // then new ones. Fading entries make room first when the column is full.
  function entriesFor(card, items, now) {
    const fresh = new Map();
    for (const item of items) fresh.set(item[4] ? item[0] + "#stun" : item[0], item);
    const next = [];
    for (const entry of card.shown) {
      const item = fresh.get(entry.id);
      if (item) {
        next.push({ id: entry.id, item, fadeEnd: 0 });
        fresh.delete(entry.id);
      } else if (!entry.fadeEnd) {
        const last = entry.item;
        next.push({ id: entry.id, item: [last[0], last[1], last[2], 0, last[4]], fadeEnd: now + FADE_MS });
      } else if (entry.fadeEnd > now) {
        next.push(entry);
      }
    }
    for (const [id, item] of fresh) next.push({ id, item, fadeEnd: 0 });
    while (next.length > card.slots.length) {
      const fading = next.findIndex((entry) => entry.fadeEnd);
      next.splice(fading < 0 ? next.length - 1 : fading, 1);
    }
    card.shown = next;
    return next;
  }

  function paint(card, items, now) {
    const entries = entriesFor(card, items, now);
    let counting = false;
    card.slots.forEach((slot, index) => {
      const entry = index < entries.length ? entries[index] : null;
      const item = entry ? entry.item : null;
      const key = item ? item[0] : "";
      const fading = !!entry && entry.fadeEnd > 0;
      if (slot.fading !== fading) {
        slot.panel.SetHasClass("OHFading", fading);
        slot.fading = fading;
      }
      if (slot.key !== key) {
        if (key) slot.image.SetImage(iconFor(key));
        slot.panel.SetHasClass("OHShown", !!key);
        slot.key = key;
        if (State.log && key) $.Msg(`${TAG} show ${cardName(card)} ${key} ${iconFor(key)}`);
      }
      const stun = !!item && item[4] === 1;
      if (slot.stun !== stun) {
        slot.panel.SetHasClass("OHStun", stun);
        slot.stun = stun;
      }
      const by = item ? (item[1] ? card.team.other : card.team.own) : "";
      if (slot.by !== by) {
        for (const cls of BY_CLASSES) slot.panel.SetHasClass(cls, cls === by);
        slot.by = by;
      }
      setBadge(slot, "countText", "count", "OHHasCount", item && item[2] >= 2 ? String(item[2]) : "");
      const shownEnd = item && item[3] > 0 ? item[3] + END_PAD_MS : 0;
      const left = shownEnd > now ? Math.ceil((shownEnd - now) / 1000) : 0;
      setBadge(slot, "timeText", "time", "OHHasTime", left > 0 ? String(left) : "");
      counting = counting || left > 0 || fading;
    });
    return counting;
  }

  // Newest record per name, a clearing (empty) one included; a name shared by two cards draws nothing.
  function render(now) {
    const byName = new Map();
    if (State.on) {
      for (const record of State.records.values()) {
        const best = byName.get(record.name);
        if (!best || record.at > best.at) byName.set(record.name, record);
      }
    }
    if (now >= State.namesAt) {
      State.names = State.cards.map(cardName);
      State.namesAt = now + VALIDATE_MS;
    }
    const names = State.names;
    let counting = false;
    State.cards.forEach((card, index) => {
      const name = names[index];
      const unique = name && names.indexOf(name) === names.lastIndexOf(name);
      const record = unique ? byName.get(name) : null;
      try {
        counting = paint(card, record ? record.items : EMPTY, now) || counting;
      } catch (e) {
        // A card rebuilt since the last check: validate on the next tick.
        State.validateAt = 0;
        logOnce("paint error", e);
      }
    });
    State.counting = counting;
  }

  // ------------------------------------------------------------------ messages

  function validItems(items, at) {
    return Array.isArray(items) && items.length <= MAX_KEYS && items.every((item) =>
      Array.isArray(item) && item.length === 5 &&
      typeof item[0] === "string" && KEY.test(item[0]) &&
      (item[1] === 0 || item[1] === 1) &&
      Number.isInteger(item[2]) && item[2] >= 1 && item[2] <= MAX_COUNT &&
      (item[4] === 0 || item[4] === 1) &&
      typeof item[3] === "number" && isFinite(item[3]) &&
      (item[3] === 0 || item[3] >= at - TTL_MS && item[3] <= at + MAX_END_AHEAD_MS));
  }

  const hasCard = (name) => State.cards.some((card) => cardName(card) === name);
  // A record still waiting for its card: unmatched (unmatchedSince, 0 = has a card) for under UNMATCHED_WINDOW_MS.
  const waiting = (record, now) => record.unmatchedSince > 0 && now >= record.unmatchedSince &&
    now - record.unmatchedSince < UNMATCHED_WINDOW_MS;

  function paintNow(now) {
    const wasCounting = State.counting;
    render(now);
    if (State.counting && !wasCounting) schedule(COUNTDOWN_TICK_SEC);
  }

  // Rescans the cards, then rechecks the records that had no card; one still waiting queues a retry.
  function rescanNow(now) {
    State.unmatchedScanAt = now;
    scanCards();
    State.nextRescanMs = now + RESCAN_MS;
    let retry = false;
    for (const record of State.records.values()) {
      if (!record.unmatchedSince) continue;
      if (!record.items.length || hasCard(record.name)) record.unmatchedSince = 0;
      else retry = retry || waiting(record, now);
    }
    if (retry) queueRescan(now);
  }

  // One pending rescan at a time, at the throttle deadline; it paints what it finds.
  function queueRescan(now) {
    if (State.rescanQueued) return;
    State.rescanQueued = true;
    const due = Math.min(UNMATCHED_RESCAN_MS, Math.max(0, State.unmatchedScanAt + UNMATCHED_RESCAN_MS - now));
    $.Schedule(due / 1000, function queuedRescan() {
      State.rescanQueued = false;
      if (stopped) return;
      try {
        const at = Date.now();
        rescanNow(at);
        paintNow(at);
      } catch (e) {
        logOnce("rescan error", e);
      }
    });
  }

  // STATUS LOG: every snapshot that reaches the top bar is printed as recv or drop <reason>.
  function drop(why, message) {
    if (!State.log) return;
    const name = message && typeof message.name === "string" ? message.name.slice(0, 64) : "?";
    $.Msg(`${TAG} drop ${why} ${name} seq=${message ? message.seq : "?"}`);
  }

  function onMessage(payload) {
    if (stopped || typeof payload !== "string" || payload.length > 4096 ||
        payload.indexOf("OH_DEBUFF_SNAPSHOT") < 0) return;
    let message = null;
    try {
      message = JSON.parse(payload);
    } catch (e) {
      drop("unparsable", null);
      return;
    }
    try {
      const now = Date.now();
      if (!message || message.magic_word !== "OH_DEBUFF_SNAPSHOT" ||
          typeof message.source !== "string" || !message.source || message.source.length > 256 ||
          typeof message.instance !== "string" || message.instance.length > 200 ||
          !Number.isSafeInteger(message.seq) || message.seq < 1 ||
          typeof message.name !== "string" || !message.name.trim() || message.name.length > 64) return drop("malformed", message);
      if (typeof message.at !== "number" || !isFinite(message.at) || message.at > now || now - message.at > TTL_MS) {
        return drop(`clock at=${message.at} now=${now}`, message);
      }
      if (!validItems(message.items, message.at)) return drop("items", message);
      const previous = State.records.get(message.source);
      if (previous && (message.at < previous.at ||
          (message.instance === previous.instance && message.seq <= previous.seq))) return drop("stale", message);
      const record = {
        name: message.name.trim().toUpperCase(), items: message.items.map((item) => item.slice()), at: message.at,
        instance: message.instance, seq: message.seq, sig: JSON.stringify(message.items), unmatchedSince: 0
      };
      State.records.set(message.source, record);
      // Not spectating: the record is kept (it expires as usual), but nothing is matched or painted.
      if (!$.OHHost.watching()) return;
      const same = !!previous && previous.name === record.name && previous.sig === record.sig;
      // Names are compared for new or changed content, and for heartbeats of a record still without a card.
      if (record.items.length && (!same || previous.unmatchedSince) && !hasCard(record.name)) {
        record.unmatchedSince = previous && previous.unmatchedSince && previous.unmatchedSince <= now ? previous.unmatchedSince : now;
      }
      let rescanned = false;
      if (!State.cards.length || waiting(record, now)) {
        if (State.cards.length && now >= State.unmatchedScanAt && now - State.unmatchedScanAt < UNMATCHED_RESCAN_MS) {
          queueRescan(now);
        } else {
          rescanNow(now);
          rescanned = true;
        }
      }
      if (State.log) {
        const cards = State.cards.filter((card) => cardName(card) === record.name).length;
        $.Msg(`${TAG} recv ${record.name} seq=${record.seq} items=${record.sig} cards=${cards}${same ? " same" : ""}`);
      }
      // A heartbeat that repeats the only record for its name changes nothing on screen (unless a rescan just found its card).
      if (!rescanned && same && State.cards.length &&
          ![...State.records.values()].some((other) => other !== record && other.name === record.name)) return;
      paintNow(now);
    } catch (e) {
      logOnce("receive error", e);
    }
  }

  // ------------------------------------------------------------------ loop

  function schedule(delay) {
    const mine = ++loop;
    $.Schedule(delay, () => {
      if (mine === loop) tick();
    });
  }

  function tick() {
    if (stopped) return;
    try {
      const now = Date.now();
      // Not spectating (back to playing): the column idles; the top bar stays valid, so without this it
      // kept validating and rescanning (101.9 calls/s, m2 review). The first watching tick re-validates,
      // rescans and re-reads the names, then paints what the records say (an expired status clears).
      if (!$.OHHost.watching()) {
        State.idle = true;
        schedule(TICK_SEC);
        return;
      }
      if (State.idle) {
        State.idle = false;
        State.validateAt = 0;
        State.nextRescanMs = 0;
        State.namesAt = 0;
      }
      let dirty = refreshConfig(now) || State.counting;
      const check = now >= State.validateAt;
      if (check) State.validateAt = now + VALIDATE_MS;
      if (now >= State.nextRescanMs || (check && !cardsValid())) {
        scanCards();
        State.nextRescanMs = now + RESCAN_MS;
        dirty = true;
      }
      for (const [source, record] of State.records) {
        if (record.at > now || now - record.at > TTL_MS) {
          State.records.delete(source);
          dirty = true;
        }
      }
      if (dirty) render(now);
    } catch (e) {
      logOnce("tick error", e);
    }
    schedule(State.counting ? COUNTDOWN_TICK_SEC : TICK_SEC);
  }

  context.OHDebuffsStop = () => {
    stopped = true;
    if (listener !== null) {
      try { $.UnregisterForUnhandledEvent("ClientUI_FireOutput", listener); } catch (e) {}
      listener = null;
    }
  };
  // An edit of the DEV settings applies at once.
  $.OHHost.onChange(() => {
    if (stopped) return;
    try {
      if (refreshConfig(Date.now())) paintNow(Date.now());
    } catch (e) {
      logOnce("config error", e);
    }
  });

  listener = $.RegisterForUnhandledEvent("ClientUI_FireOutput", onMessage);
  tick();
})();
