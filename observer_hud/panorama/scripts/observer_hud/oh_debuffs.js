// Observer HUD ability status column, HUD side (host: this mod's hud_spectate_bar.xml), ported from
// DLF's dlf_debuffs.js with its rules. World healthbars (oh_debuff_world.js) send OH_DEBUFF_SNAPSHOT
// { source, name, items: [[key, debuff, count, end, stun, hit, total]] }; this draws each hero's statuses in the
// six slots of the column oh_host.js injects under each stock top-bar card (observer_hud/debuffs.xml),
// matched by player name: a centred grid two wide (one in the middle, a pair either side of it, an odd
// last one centred under the row above; user 2026-10-23). A status keeps its slot panel while it shows,
// so when one comes or goes the others glide to their new places and the new one pops in.
// The cards come from the host's registry
// ($.OHHost.cards(), re-read when $.OHHost.cardsVersion() moves); the column never walks the top bar.
// A slot's colour is the applying team's: the
// other team for a debuff, the hero's own team for a listed buff. A count of 2+ shows as a badge; a
// predicted end with its full duration (total, ms) shows as a sweep: the icon stays bright for the part
// that remains and a dark wedge (.OHDebuffShade, clip radial from 12 o'clock) covers the part that has
// passed (user 2026-11-06: on a low-bitrate stream the seconds over the icon hid it). An end without a
// total (an older world bar) shows whole seconds left plus END_PAD_MS. Both redraw every 0.25 s. A stun is its own
// slot with the stock stun mark (.OHStun). A status that goes away keeps its slot for FADE_MS with
// .OHFading, whose CSS keyframe animation fades it out. A new hit number (pulse rules: Shining Wonder,
// one per orb bounce) pulses its slot once (.OHPulse). The editor's DEV settings (state.dev) go to
// every world bar as OH_DEBUFF_CONFIG on change and every 4 s, so bars created later pick them up.
(() => {
  "use strict";

  const TAG = "[OH-DB]";
  const TICK_SEC = 1;
  const COUNTDOWN_TICK_SEC = 0.25;
  const NAMES_MS = 1000; // card names are read at most this often (the countdown ticks only paint)
  const REPAINT_MS = 5000; // a steady column repaints this often, so a name that binds late is matched
  // A snapshot for a name no card has (a hero that just spawned) rescans at once, at most every
  // UNMATCHED_RESCAN_MS; a throttled or fruitless rescan is retried at that deadline while the record
  // is at most UNMATCHED_WINDOW_MS unmatched (the card can appear just after the status).
  const UNMATCHED_RESCAN_MS = 500;
  const UNMATCHED_WINDOW_MS = 2000;
  const CONFIG_HEARTBEAT_MS = 4000;
  const TTL_MS = 10000; // world bars resend every 4 s while something is shown
  const MAX_END_AHEAD_MS = 300000;
  // More than the six slots of a column (debuffs.xml): entriesFor keeps what already shows and drops the
  // rest, so a seventh status waits for a free slot instead of pushing a shown one out.
  const MAX_KEYS = 8;
  const MAX_COUNT = 99;
  const MAX_HIT = 1e9;
  const MAX_TOTAL_MS = 300000; // a sweep's full duration: the world side caps a fit at the rule's maxSeconds
  const FADE_MS = 1000; // equal to the OHDebuffFadeOut animation-duration in oh_debuffs.css
  const END_PAD_MS = 1000; // the countdown reads one second longer than the predicted end (user 2026-10-23)
  // Grid places, equal to oh_debuffs.css: a pair's centres 20 px either side of the middle, rows 39 px
  // apart (.OHDebuff height, .OHRows1-3), three rows at most (six slots in debuffs.xml).
  const GRID_HALF = 20;
  const ROW_PITCH = 39;
  const MAX_ROWS = 3;
  const KEY = /^[a-z0-9_]{1,64}$/;
  const GENERIC_ICON = "s2r://panorama/images/icons/properties/debuff.vsvg";
  // Listed abilities without an ability image (spectator-status.json; the validator checks).
  const EXTRA_ICONS = { citadel_ability_zip_line: "s2r://panorama/images/icons/properties/zipline.vsvg" };
  const EMPTY = [];
  // The status colours per team (own: from that team, other: from the other), keyed by the registry's
  // teamKey; the table is $.OHState.TEAM_PANELS.
  const TEAMS = {};
  for (const team of $.OHState.TEAM_PANELS) TEAMS[team.key] = team;
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
    cardsVersion: -1, // the registry version State.cards was built from
    repaintAt: 0,
    on: DEFAULTS.dev.debuffs,
    poll: DEFAULTS.dev.debuffPollMs,
    log: DEFAULTS.dev.logStatus,
    stateVersion: -1,
    configSig: "",
    aliasesSig: "{}", // the aliases last sent to the world bars
    watch: null, // the spectating flag last sent to the world bars
    wake: 0, // bumped when the card registry changes; sent as OH_DEBUFF_CONFIG wake
    wakeSent: 0,
    configSentAt: 0,
    unmatchedScanAt: 0,
    rescanQueued: false,
    counting: false, // a slot shows seconds left or is fading
    // The 0.25 s countdown ticks paint only: names are read at most once a second (m1 audit O1).
    names: [],
    namesAt: 0,
    dead: new Map(), // card panel -> it carried the stock .Dead class at the last check
    deadAt: 0
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

  // Sends OH_DEBUFF_CONFIG to the world bars on change and every CONFIG_HEARTBEAT_MS: the DEV settings,
  // the player aliases ($.OHHost.aliases(): unique in-game names, {} when not spectating), which the
  // world bars show on their name labels, whether we are spectating (watch: false puts every world bar
  // to sleep, so a PC that plays with pak10 installed pays nothing) and the wake counter (bumped when the
  // card registry changes, so idle bars re-check their hero class at once). True when the switch or
  // interval changed.
  function refreshConfig(now) {
    const version = $.OHHost.version();
    if (version !== State.stateVersion) {
      State.stateVersion = version;
      const dev = $.OHHost.getState().dev;
      State.on = dev.debuffs;
      State.poll = dev.debuffPollMs;
      State.log = dev.logStatus;
    }
    const watch = $.OHHost.watching();
    const sig = `${State.on}|${State.poll}|${State.log}`;
    const aliasesSig = $.OHHost.aliasesSig();
    const changed = sig !== State.configSig;
    if (changed) $.Msg(`${TAG} config icons=${State.on} poll=${State.poll} log=${State.log}`);
    if (changed || aliasesSig !== State.aliasesSig || watch !== State.watch || State.wake !== State.wakeSent ||
        now < State.configSentAt || now - State.configSentAt >= CONFIG_HEARTBEAT_MS) {
      State.configSig = sig;
      State.aliasesSig = aliasesSig;
      State.watch = watch;
      State.wakeSent = State.wake;
      State.configSentAt = now;
      $.DispatchEvent("ClientUI_FireOutput", JSON.stringify({
        magic_word: "OH_DEBUFF_CONFIG", on: State.on, poll: State.poll, log: State.log, watch: watch, wake: State.wake,
        aliases: $.OHHost.aliases()
      }));
    }
    return changed;
  }

  // ------------------------------------------------------------------ cards

  // Rebuilds State.cards from the host's registry when its version moved (or after a paint error,
  // which sets cardsVersion to -1). A card's slot cache is kept by its column panel: a hero swap
  // rebuilds the card's children, the host injects a new column (a new registry entry) and the slots
  // are looked up again. Entries without a name label are skipped: snapshots match cards by name.
  // Returns true when the list was rebuilt.
  function syncCards() {
    const version = $.OHHost.cardsVersion();
    if (version === State.cardsVersion) return false;
    State.cardsVersion = version;
    const cards = [];
    for (const entry of $.OHHost.cards()) {
      if (!entry.label || !valid(entry.debuffs)) continue;
      const known = State.cards.find((card) => card.column === entry.debuffs);
      if (known && slotsLive(known)) {
        known.label = entry.label;
        cards.push(known);
        continue;
      }
      const grid = entry.debuffs.FindChild("OHDebuffGrid");
      const slots = [];
      for (const slot of valid(grid) ? grid.Children() : []) {
        const image = slot.FindChildrenWithClassTraverse("OHDebuffIcon")[0];
        const count = slot.FindChildrenWithClassTraverse("OHDebuffCount")[0];
        const time = slot.FindChildrenWithClassTraverse("OHDebuffTime")[0];
        const shade = slot.FindChildrenWithClassTraverse("OHDebuffShade")[0] || null;
        if (image && count && time) {
          slots.push({ panel: slot, image: image, count: count, time: time, shade: shade, key: "", stun: false, by: "",
            countText: "", timeText: "", sweep: -1, fading: false, place: "", glide: false, shownSeq: 0 });
        }
      }
      cards.push({ panel: entry.panel, label: entry.label, column: entry.debuffs, grid: grid, slots: slots, rows: 0,
        team: TEAMS[entry.teamKey] || TEAMS.amber, shown: [], hits: new Map() });
    }
    State.cards = cards;
    State.namesAt = 0;
    return true;
  }

  const slotsLive = (card) => card.slots.length > 0 && valid(card.grid) &&
    card.slots.every((slot) => valid(slot.panel) && valid(slot.image) && valid(slot.count) && valid(slot.time));

  // True when a card lost the stock .Dead class since the last check (a respawn), read at most every
  // NAMES_MS: one class read per card a second.
  const respawned = (now) => {
    if (now < State.deadAt && State.deadAt - now <= NAMES_MS) return false;
    State.deadAt = now + NAMES_MS;
    let back = false;
    const next = new Map();
    for (const card of State.cards) {
      const dead = card.panel.BHasClass("Dead");
      if (State.dead.get(card.panel) === true && !dead) back = true;
      next.set(card.panel, dead);
    }
    State.dead = next;
    return back;
  };

  const cardName = (card) => {
    const text = valid(card.label) ? card.label.text : "";
    return typeof text === "string" ? text.trim().toUpperCase() : "";
  };
  // The cards' names, read at most every NAMES_MS (State.namesAt = 0 forces a read).
  function cardNames(now) {
    if (now >= State.namesAt) {
      State.names = State.cards.map(cardName);
      State.namesAt = now + NAMES_MS;
    }
    return State.names;
  }

  // A label shows when its text is non-empty; writes happen only on change, and the class only when the
  // label appears or goes (a countdown step 6 -> 5 writes the text alone).
  function setBadge(slot, field, labelKey, flag, text) {
    const old = slot[field];
    if (old === text) return;
    if (text) slot[labelKey].text = text;
    if (!old !== !text) slot.panel.SetHasClass(flag, !!text);
    slot[field] = text;
  }

  // What a card shows, in display order: the statuses it showed before, in place (gone ones fading
  // until fadeEnd), then new ones. Fading entries make room first when the column is full. An entry
  // keeps its slot panel (entry.slot) for as long as it shows.
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
    // New entries take the free slot panels, lowest first.
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

  // The place of the k-th of n statuses: rows of two, 20 px left and right of the card's middle, an
  // odd last one centred (user 2026-10-23). Equal to oh_debuffs.css (.OHDebuff 40x39 at the grid's
  // top centre).
  function placeFor(k, n) {
    const row = k >> 1;
    const x = row * 2 + 1 < n ? (k & 1 ? GRID_HALF : -GRID_HALF) : 0;
    return `translate3d(${x}px, ${row * ROW_PITCH}px, 0px)`;
  }

  // Moves a shown slot to its place. A slot that just appeared is placed without glide (it pops in
  // where it belongs, the circle's OHDebuffPop), and glides from the next frame on.
  function place(slot, at, appeared) {
    if (appeared) {
      if (slot.glide) {
        slot.panel.RemoveClass("OHGlide");
        slot.glide = false;
      }
      const seq = ++slot.shownSeq;
      $.Schedule(0, () => {
        if (stopped || seq !== slot.shownSeq || !slot.key || !valid(slot.panel)) return;
        slot.panel.AddClass("OHGlide");
        slot.glide = true;
      });
    }
    if (slot.place !== at) {
      slot.panel.style.transform = at;
      slot.place = at;
    }
  }

  // Restarts the one-shot pulse animation: TriggerClass where the engine has it, else the class goes
  // off and comes back on the next frame (HP Colors v3 menu pattern).
  function pulse(panel) {
    if (typeof panel.TriggerClass === "function") {
      panel.TriggerClass("OHPulse");
      return;
    }
    if (!panel.BHasClass("OHPulse")) {
      panel.AddClass("OHPulse");
      return;
    }
    panel.RemoveClass("OHPulse");
    $.Schedule(0, () => {
      if (!stopped && valid(panel)) panel.AddClass("OHPulse");
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
        slot.panel.SetHasClass("OHFading", fading);
        slot.fading = fading;
      }
      const appeared = !!key && !slot.key;
      if (slot.key !== key) {
        if (key) slot.image.SetImage(iconFor(key));
        else {
          // Freed: no glide, no leftover pulse when the panel shows another status later.
          slot.shownSeq++;
          if (slot.glide) slot.panel.RemoveClass("OHGlide");
          slot.glide = false;
          slot.panel.RemoveClass("OHPulse");
        }
        slot.panel.SetHasClass("OHShown", !!key);
        slot.key = key;
        if (State.log && key) $.Msg(`${TAG} show ${cardName(card)} ${key} ${iconFor(key)}`);
      }
      if (key) place(slot, placeFor(order, entries.length), appeared);
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
      // The sweep: degrees passed out of 360 (-1: none). A fading status that had one is all passed (its
      // entry carries no end any more), so it stays dark through the fade.
      const total = item && item[3] > 0 && slot.shade ? item[6] || 0 : 0;
      const sweep = fading ? (slot.sweep >= 0 ? 360 : -1) :
        total > 0 ? Math.round(360 * Math.min(1, Math.max(0, 1 - (item[3] - now) / total))) : -1;
      if (slot.sweep !== sweep) {
        // The CSS transition smooths each step. A sweep that ends resets the hidden wedge to 0, so the next
        // status in this slot grows in from 12 o'clock instead of unwinding the last one's.
        if (sweep >= 0 || slot.sweep >= 0) slot.shade.style.clip = `radial(50% 50%, 0deg, ${Math.max(0, sweep)}deg)`;
        if ((slot.sweep >= 0) !== (sweep >= 0)) slot.panel.SetHasClass("OHSweep", sweep >= 0);
        slot.sweep = sweep;
      }
      const shownEnd = item && item[3] > 0 && sweep < 0 ? item[3] + END_PAD_MS : 0;
      const left = shownEnd > now ? Math.ceil((shownEnd - now) / 1000) : 0;
      setBadge(slot, "timeText", "time", "OHHasTime", left > 0 ? String(left) : "");
      counting = counting || left > 0 || (sweep >= 0 && sweep < 360) || fading;
      const hit = item && !fading ? item[5] || 0 : 0;
      if (hit) {
        if (card.hits.get(entry.id) !== hit) pulse(slot.panel);
        hits.set(entry.id, hit);
      }
    });
    // The grid is as tall as its rows, so the purchase notices sit under the last one.
    const rows = Math.ceil(entries.length / 2);
    if (card.rows !== rows && valid(card.grid)) {
      for (let n = 1; n <= MAX_ROWS; n++) card.grid.SetHasClass(`OHRows${n}`, n === rows);
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
    const names = cardNames(now);
    let counting = false;
    State.cards.forEach((card, index) => {
      const name = names[index];
      const unique = name && names.indexOf(name) === names.lastIndexOf(name);
      const record = unique ? byName.get(name) : null;
      try {
        counting = paint(card, record ? record.items : EMPTY, now) || counting;
      } catch (e) {
        // A card rebuilt since the registry last moved: rebuild the list on the next tick.
        State.cardsVersion = -1;
        logOnce("paint error", e);
      }
    });
    State.counting = counting;
  }

  // ------------------------------------------------------------------ messages

  function validItems(items, at) {
    return Array.isArray(items) && items.length <= MAX_KEYS && items.every((item) =>
      Array.isArray(item) && (item.length === 5 || (item.length === 6 || item.length === 7) && Number.isInteger(item[5]) && item[5] >= 0 &&
        item[5] <= MAX_HIT && (item.length === 6 || Number.isInteger(item[6]) && item[6] >= 0 && item[6] <= MAX_TOTAL_MS)) &&
      typeof item[0] === "string" && KEY.test(item[0]) &&
      (item[1] === 0 || item[1] === 1) &&
      Number.isInteger(item[2]) && item[2] >= 1 && item[2] <= MAX_COUNT &&
      (item[4] === 0 || item[4] === 1) &&
      typeof item[3] === "number" && isFinite(item[3]) &&
      (item[3] === 0 || item[3] >= at - TTL_MS && item[3] <= at + MAX_END_AHEAD_MS));
  }

  const hasCard = (name, now) => cardNames(now).indexOf(name) >= 0;
  // A record still waiting for its card: unmatched (unmatchedSince, 0 = has a card) for under UNMATCHED_WINDOW_MS.
  const waiting = (record, now) => record.unmatchedSince > 0 && now >= record.unmatchedSince &&
    now - record.unmatchedSince < UNMATCHED_WINDOW_MS;

  function paintNow(now) {
    const wasCounting = State.counting;
    render(now);
    if (State.counting && !wasCounting) schedule(COUNTDOWN_TICK_SEC);
  }

  // Re-reads the registry and the names, then rechecks the records that had no card; one still waiting
  // queues a retry.
  function rescanNow(now) {
    State.unmatchedScanAt = now;
    syncCards();
    State.namesAt = 0;
    let retry = false;
    for (const record of State.records.values()) {
      if (!record.unmatchedSince) continue;
      if (!record.items.length || hasCard(record.name, now)) record.unmatchedSince = 0;
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
      syncCards(); // a registry change since the last tick (one version compare otherwise)
      const same = !!previous && previous.name === record.name && previous.sig === record.sig;
      // Names are compared for new or changed content, and for heartbeats of a record still without a card.
      if (record.items.length && (!same || previous.unmatchedSince) && !hasCard(record.name, now)) {
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
      // kept validating and rescanning (101.9 calls/s, m2 review). The registry is [] meanwhile and its
      // version moves on return, so the first watching tick rebuilds the list and paints what the
      // records say (an expired status clears).
      if (!$.OHHost.watching()) {
        // The world bars hear it once (watch: false puts them to sleep and drops the aliases), then every
        // CONFIG_HEARTBEAT_MS so a bar created while playing goes to sleep too.
        refreshConfig(now);
        schedule(TICK_SEC);
        return;
      }
      // A changed registry (a hero swap, a new map) or a respawn (a card loses the stock .Dead class; the
      // hero may come back on another world panel) wakes idle world bars at once.
      const rebuilt = syncCards();
      if (rebuilt || respawned(now)) State.wake++;
      let dirty = refreshConfig(now) || State.counting || rebuilt;
      // A steady column repaints now and then, so a name that bound after its snapshot still matches.
      if (now >= State.repaintAt) {
        State.repaintAt = now + REPAINT_MS;
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
