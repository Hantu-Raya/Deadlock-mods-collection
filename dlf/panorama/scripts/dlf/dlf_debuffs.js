// DLF top-bar debuff icons, HUD side (citadel_hud_top_bar.xml). World healthbars
// (dlf_debuff_world.js) send DLF_DEBUFF_SNAPSHOT { source, name, items: [[key, debuff, count, end, stun(, hit)]] };
// this draws each hero's statuses in the six static #DLFDebuffs slots under its card
// (citadel_hud_top_bar_player.xml), matched by player name, as Observer HUD's centred grid two wide
// (user 2026-10-24): one status in the card's middle, a pair either side of it, an odd last one centred
// under the row above. A status keeps its slot panel while it shows, so when one is added or ends the
// others glide (.DLFGlide, a transform transition) and the new one pops in where it belongs; the column
// is as tall as its rows (.DLFRows1-3), so the purchase notices follow under it. A slot's colour is the
// applying team's: the other team for a debuff, the hero's own team for a listed buff. A count of 2+
// shows as a badge; a predicted end shows as whole seconds left plus END_PAD_MS, redrawn every 0.25 s
// while one runs. A stun is its own slot with the stock stun mark (.DLFStun), next to the same ability's
// other effects. A new hit number (pulse rules: Celeste's Shining Wonder, one per orb bounce) pulses its
// slot once (.DLFPulse). A status that goes away keeps its place for FADE_MS with .DLFFading, whose CSS
// keyframe animation fades it out; statuses keep their order while anything shows, and a status that
// returns shows again at once (the class goes, the animation stops).
// The ESC menu's DEV settings (state.dev on the HUD root attribute $.DLFState.ATTR) go to every
// world bar as DLF_DEBUFF_CONFIG on change and every 4 s, so bars created later pick them up.
(() => {
  "use strict";

  const TAG = "[DLF-DB]";
  const TICK_SEC = 1;
  const COUNTDOWN_TICK_SEC = 0.25;
  const RESCAN_MS = 5000;
  // A snapshot for a name no card has (a hero that just spawned or joined: live 2026-10-20, every
  // first try on a fresh bot logged cards=0) rescans at once, at most every UNMATCHED_RESCAN_MS; a
  // throttled or fruitless rescan is retried at that deadline while the record is at most
  // UNMATCHED_WINDOW_MS unmatched (the card can appear just after the status).
  const UNMATCHED_RESCAN_MS = 500;
  const UNMATCHED_WINDOW_MS = 2000;
  const CONFIG_HEARTBEAT_MS = 4000;
  const TTL_MS = 10000; // world bars resend every 4 s while something is shown
  const MAX_END_AHEAD_MS = 300000;
  const MAX_KEYS = 8;
  const MAX_COUNT = 99;
  const FADE_MS = 1000; // equal to the DLFDebuffFadeOut animation-duration in dlf_card.css
  const END_PAD_MS = 1000; // the countdown reads one second longer than the predicted end (as Observer HUD)
  // Grid places, equal to dlf_card.css: a pair's centres 20 px either side of the middle, rows 39 px apart
  // (.DLFDebuff height, .DLFRows1-3), three rows at most (six slots in citadel_hud_top_bar_player.xml).
  const GRID_HALF = 20;
  const ROW_PITCH = 39;
  const MAX_ROWS = 3;
  const KEY = /^[a-z0-9_]{1,64}$/;
  const GENERIC_ICON = "s2r://panorama/images/icons/properties/debuff.vsvg";
  // Listed abilities without an ability image (spectator-status.json; the validator checks).
  const EXTRA_ICONS = { citadel_ability_zip_line: "s2r://panorama/images/icons/properties/zipline.vsvg" };
  const EMPTY = [];
  // Stock top-bar team panels are fixed by game team: TeamFriendly is Amber (The Hidden King),
  // TeamEnemy is Sapphire (The Archmother). A debuff comes from the other team.
  const TEAMS = [
    { panelId: "TeamFriendly", own: "DLFByAmber", other: "DLFBySapphire" },
    { panelId: "TeamEnemy", own: "DLFBySapphire", other: "DLFByAmber" }
  ];
  const BY_CLASSES = ["DLFByAmber", "DLFBySapphire"];

  const context = $.GetContextPanel();
  if (typeof context.DLFDebuffsStop === "function") context.DLFDebuffsStop();
  let stopped = false;
  let listener = null;
  let errorShown = false;
  let loop = 0; // only the newest scheduled tick runs

  const valid = $.DLFState.valid;
  const attrs = $.DLFState.hudAttrs(context);
  const logOnce = (what, e) => {
    if (errorShown) return;
    errorShown = true;
    $.Msg(`${TAG} ${what}: ${e && e.message ? e.message : e}`);
  };

  const DEFAULTS = $.DLFState.defaults();
  const State = {
    records: new Map(), // source -> { name, items, at, instance, seq }
    cards: [],
    nextRescanMs: 0,
    on: DEFAULTS.dev.debuffs,
    poll: DEFAULTS.dev.debuffPollMs,
    log: DEFAULTS.dev.logStatus,
    configSig: "",
    configSentAt: 0,
    aliases: {}, // the banner's { in-game name: alias }, sent with DLF_DEBUFF_CONFIG
    aliasesSig: "{}",
    unmatchedScanAt: 0,
    rescanQueued: false,
    counting: false // a slot shows seconds left or is fading
  };

  // ------------------------------------------------------------------ icons

  let icons = null;
  function iconFor(key) {
    if (!icons) {
      icons = new Map();
      const table = typeof DLF_DEBUFF_ICONS === "object" && DLF_DEBUFF_ICONS ? DLF_DEBUFF_ICONS : {};
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

  // True when the switch or interval changed. The banner's alias map ({ in-game name: alias }) rides
  // along, so every world healthbar's #name can show it; a new map is sent at once.
  function refreshConfig(now) {
    const parsed = attrs.changed($.DLFState.ATTR);
    if (parsed !== undefined) {
      const dev = $.DLFState.normalize(parsed, DEFAULTS).dev;
      State.on = dev.debuffs;
      State.poll = dev.debuffPollMs;
      State.log = dev.logStatus;
    }
    const rawAliases = attrs.changed($.DLFState.ALIASES_ATTR);
    if (rawAliases !== undefined) {
      const aliases = {};
      for (const [name, alias] of $.DLFState.aliasMap(rawAliases)) aliases[name] = alias;
      State.aliases = aliases;
    }
    const aliasesSig = JSON.stringify(State.aliases);
    const sig = `${State.on}|${State.poll}|${State.log}`;
    const changed = sig !== State.configSig;
    if (changed) $.Msg(`${TAG} config icons=${State.on} poll=${State.poll} log=${State.log}`);
    if (changed || aliasesSig !== State.aliasesSig || now < State.configSentAt || now - State.configSentAt >= CONFIG_HEARTBEAT_MS) {
      State.configSig = sig;
      State.aliasesSig = aliasesSig;
      State.configSentAt = now;
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "DLF_DEBUFF_CONFIG", on: State.on, poll: State.poll, log: State.log, aliases: State.aliases, at: now
      }));
    }
    return changed;
  }

  // ------------------------------------------------------------------ cards

  function scanCards() {
    const cards = [];
    for (const team of TEAMS) {
      const teamPanel = context.FindChildTraverse(team.panelId);
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
        const column = panel.FindChildTraverse("DLFDebuffs");
        if (!valid(column)) continue;
        const label = panel.FindChildrenWithClassTraverse("AlwaysPlayerName")[0] ||
          panel.FindChildrenWithClassTraverse("PlayerName")[0] || null;
        if (!valid(label)) continue; // snapshots match cards by name
        const slots = [];
        for (const slot of column.Children()) {
          const image = slot.FindChildrenWithClassTraverse("DLFDebuffIcon")[0];
          const count = slot.FindChildrenWithClassTraverse("DLFDebuffCount")[0];
          const time = slot.FindChildrenWithClassTraverse("DLFDebuffTime")[0];
          const shade = slot.FindChildrenWithClassTraverse("DLFDebuffShade")[0] || null;
          if (valid(image) && valid(count) && valid(time)) {
            slots.push({ panel: slot, image, count, time, shade, key: "", stun: false, by: "", countText: "", timeText: "",
              sweep: -1, fading: false, place: "", glide: false, shownSeq: 0 });
          }
        }
        cards.push({ panel, label, column, slots, team, shown: [], hits: new Map(), rows: 0 });
      }
    }
    State.cards = cards;
  }

  // Every tick checks the panel, column and name label, and the first slot: the engine rebuilds a card's
  // children on a hero swap, and the slots go with them (found within a tick, not at the 5 s rescan).
  // The other slots are checked when a rescan reuses a card.
  const cardLive = (card) => valid(card.panel) && valid(card.column) && valid(card.label) &&
    (card.slots.length === 0 || valid(card.slots[0].panel));
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
  // then new ones. Fading entries make room first when the column is full. Each entry keeps its slot
  // panel while it shows (so it glides when the others move); new entries take the free ones, lowest first.
  function entriesFor(card, items, now) {
    const fresh = new Map();
    for (const item of items) fresh.set(item[4] ? item[0] + "#stun" : item[0], item);
    const next = [];
    for (const entry of card.shown) {
      const item = fresh.get(entry.id);
      if (item) {
        next.push({ id: entry.id, item, fadeEnd: 0, slot: entry.slot });
        fresh.delete(entry.id);
      } else if (!entry.fadeEnd) {
        const last = entry.item;
        next.push({ id: entry.id, item: [last[0], last[1], last[2], 0, last[4]], fadeEnd: now + FADE_MS, slot: entry.slot });
      } else if (entry.fadeEnd > now) {
        next.push(entry);
      }
    }
    for (const [id, item] of fresh) next.push({ id, item, fadeEnd: 0, slot: -1 });
    while (next.length > card.slots.length) {
      const fading = next.findIndex((entry) => entry.fadeEnd);
      next.splice(fading < 0 ? next.length - 1 : fading, 1);
    }
    const used = new Set(next.map((entry) => entry.slot));
    let free = 0;
    for (const entry of next) {
      if (entry.slot >= 0) continue;
      while (used.has(free)) free++;
      entry.slot = free;
      used.add(free);
    }
    card.shown = next;
    return next;
  }

  // The place of the k-th of n statuses (Observer HUD's grid): rows of two, GRID_HALF px left and right
  // of the card's middle, an odd last one centred. Equal to dlf_card.css (.DLFDebuff 40x39 at the
  // column's top centre).
  function placeFor(k, n) {
    const row = k >> 1;
    const x = row * 2 + 1 < n ? (k & 1 ? GRID_HALF : -GRID_HALF) : 0;
    return `translate3d(${x}px, ${row * ROW_PITCH}px, 0px)`;
  }

  // Moves a shown slot to its place. A slot that just appeared is placed without glide (it pops in
  // where it belongs, the circle's DLFDebuffPop), and glides from the next frame on.
  function place(slot, at, appeared) {
    if (appeared) {
      if (slot.glide) {
        slot.panel.RemoveClass("DLFGlide");
        slot.glide = false;
      }
      const seq = ++slot.shownSeq;
      $.Schedule(0, () => {
        if (stopped || seq !== slot.shownSeq || !slot.key || !valid(slot.panel)) return;
        slot.panel.AddClass("DLFGlide");
        slot.glide = true;
      });
    }
    if (slot.place !== at) {
      slot.panel.style.transform = at;
      slot.place = at;
    }
  }

  // Restarts the one-shot pulse animation: TriggerClass where the engine has it, else the class goes
  // off and comes back on the next frame.
  function pulse(panel) {
    if (typeof panel.TriggerClass === "function") {
      panel.TriggerClass("DLFPulse");
      return;
    }
    if (!panel.BHasClass("DLFPulse")) {
      panel.AddClass("DLFPulse");
      return;
    }
    panel.RemoveClass("DLFPulse");
    $.Schedule(0, () => {
      if (!stopped && valid(panel)) panel.AddClass("DLFPulse");
    });
  }

  function paint(card, items, now) {
    const entries = entriesFor(card, items, now);
    const hits = new Map(); // id -> hit number this paint (card.hits: the last one pulsed)
    const bySlot = new Array(card.slots.length).fill(-1); // slot -> display index
    entries.forEach((entry, index) => { bySlot[entry.slot] = index; });
    let counting = false;
    card.slots.forEach((slot, index) => {
      const order = bySlot[index];
      const entry = order >= 0 ? entries[order] : null;
      const item = entry ? entry.item : null;
      const key = item ? item[0] : "";
      const fading = !!entry && entry.fadeEnd > 0;
      if (slot.fading !== fading) {
        slot.panel.SetHasClass("DLFFading", fading);
        slot.fading = fading;
      }
      const appeared = !!key && !slot.key;
      if (slot.key !== key) {
        if (key) slot.image.SetImage(iconFor(key));
        else {
          // Freed: no glide, no leftover pulse when the panel shows another status later.
          slot.shownSeq++;
          if (slot.glide) slot.panel.RemoveClass("DLFGlide");
          slot.glide = false;
          slot.panel.RemoveClass("DLFPulse");
        }
        slot.panel.SetHasClass("DLFShown", !!key);
        slot.key = key;
        if (State.log && key) $.Msg(`${TAG} show ${cardName(card)} ${key} ${iconFor(key)}`);
      }
      if (key) place(slot, placeFor(order, entries.length), appeared);
      const stun = !!item && item[4] === 1;
      if (slot.stun !== stun) {
        slot.panel.SetHasClass("DLFStun", stun);
        slot.stun = stun;
      }
      const by = item ? (item[1] ? card.team.other : card.team.own) : "";
      if (slot.by !== by) {
        for (const cls of BY_CLASSES) slot.panel.SetHasClass(cls, cls === by);
        slot.by = by;
      }
      setBadge(slot, "countText", "count", "DLFHasCount", item && item[2] >= 2 ? String(item[2]) : "");
      // The sweep (user 2026-11-06, on Observer HUD: the seconds over the icon hid it on a low-bitrate
      // stream): degrees passed out of 360 as a dark wedge from 12 o'clock (-1: none, the seconds show).
      const total = item && item[3] > 0 && slot.shade ? item[6] || 0 : 0;
      const sweep = total > 0 ? Math.round(360 * Math.min(1, Math.max(0, 1 - (item[3] - now) / total))) : -1;
      if (slot.sweep !== sweep) {
        // The CSS transition smooths each step. A sweep that ends resets the hidden wedge to 0, so the next
        // status in this slot grows in from 12 o'clock instead of unwinding the last one's.
        if (sweep >= 0 || slot.sweep >= 0) slot.shade.style.clip = `radial(50% 50%, 0deg, ${Math.max(0, sweep)}deg)`;
        if ((slot.sweep >= 0) !== (sweep >= 0)) slot.panel.SetHasClass("DLFSweep", sweep >= 0);
        slot.sweep = sweep;
      }
      const shownEnd = item && item[3] > 0 && sweep < 0 ? item[3] + END_PAD_MS : 0;
      const left = shownEnd > now ? Math.ceil((shownEnd - now) / 1000) : 0;
      setBadge(slot, "timeText", "time", "DLFHasTime", left > 0 ? String(left) : "");
      counting = counting || left > 0 || (sweep >= 0 && sweep < 360) || fading;
      const hit = item && !fading ? item[5] || 0 : 0;
      if (hit) {
        if (card.hits.get(entry.id) !== hit) pulse(slot.panel);
        hits.set(entry.id, hit);
      }
    });
    // The column is as tall as its rows, so the purchase notices sit under the last one.
    const rows = Math.ceil(entries.length / 2);
    if (card.rows !== rows) {
      for (let n = 1; n <= MAX_ROWS; n++) card.column.SetHasClass(`DLFRows${n}`, n === rows);
      card.rows = rows;
    }
    card.hits = hits;
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
    const names = State.cards.map(cardName);
    let counting = false;
    State.cards.forEach((card, index) => {
      const name = names[index];
      const unique = name && names.indexOf(name) === names.lastIndexOf(name);
      const record = unique ? byName.get(name) : null;
      counting = paint(card, record ? record.items : EMPTY, now) || counting;
    });
    State.counting = counting;
  }

  // ------------------------------------------------------------------ messages

  function validItems(items, at) {
    return Array.isArray(items) && items.length <= MAX_KEYS && items.every((item) =>
      Array.isArray(item) && item.length >= 5 && item.length <= 7 &&
      typeof item[0] === "string" && KEY.test(item[0]) &&
      (item[1] === 0 || item[1] === 1) &&
      Number.isInteger(item[2]) && item[2] >= 1 && item[2] <= MAX_COUNT &&
      (item[4] === 0 || item[4] === 1) &&
      (item.length === 5 || (Number.isInteger(item[5]) && item[5] >= 0)) &&
      (item.length < 7 || (Number.isInteger(item[6]) && item[6] >= 0 && item[6] <= MAX_END_AHEAD_MS)) &&
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
        payload.indexOf("DLF_DEBUFF_SNAPSHOT") < 0) return;
    let message = null;
    try {
      message = JSON.parse(payload);
    } catch (e) {
      drop("unparsable", null);
      return;
    }
    try {
      const now = Date.now();
      if (!message || message.magic_word !== "DLF_DEBUFF_SNAPSHOT" ||
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
      let dirty = refreshConfig(now) || State.counting;
      if (now >= State.nextRescanMs || !cardsValid()) {
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

  context.DLFDebuffsStop = () => {
    stopped = true;
    if (listener !== null) {
      try { $.UnregisterForUnhandledEvent("ClientUI_FireOutput", listener); } catch (e) {}
      listener = null;
    }
  };

  listener = $.RegisterForUnhandledEvent("ClientUI_FireOutput", onMessage);
  tick();
})();
