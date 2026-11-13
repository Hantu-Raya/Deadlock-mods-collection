// Observer HUD ability status column, world side: one instance per CitadelStatusEffect list (this
// mod's citadel_status_effect.xml), ported from DLF's dlf_debuff_world.js with its rules. The layout
// also loads for the HUD's own status lists; those sit under CitadelHudRoot and stop at once. A world
// healthbar's list sits in its ClientUIDialogPanel (the overlay root), whose parent is the world panel.
// The unit class (CLASS_PLAYER) lands on the dialog only after the layout loads, and the engine
// recycles world panels between units (spike 2026-10-22), so nothing is decided at boot: a non-hero
// bar re-checks its class with a backoff capped at IDLE_MAX_S, and a hero bar re-checks it on every
// full sample (every FULL_MS, or when its status list or name changes; a recycled bar sends one
// clearing message and goes idle).
// Hero bars scan the direct children of #StatusEffectContainer every pollMs. A status panel's id is
// status_<ability> (status_<ability>/<modifier> when the applying ability entity is gone). Only the
// abilities in dlf/spectator-status.json (RULES) are sent: their debuffs (.isDebuff), their
// non-debuff statuses only when listed as a buff, and a status listed with minStacks (Djinn's Mark)
// only from that many stacks. A panel with the "stunned" class is a stun: its own item. Per ability
// and kind the snapshot carries [key, debuff 0/1, count, end, stun 0/1, hit, total]: count is the larger of the
// #stacks label and the number of panels, end the predicted expiry (Date.now() ms; 0 = no countdown)
// fitted from three samples of the native radial on #StatusEffectsBorder, hit the bar's hit sequence
// number of the item's last hit (rules with pulse only, else 0): a hit is a status panel that appears
// or whose radial jumps back against its running direction by more than REFRESH_DEG (a refresh).
// Changes, plus a 4 s heartbeat while anything is shown, leave through a sibling relay as OH_DEBUFF_SNAPSHOT for
// oh_debuffs.js. The editor's DEV settings arrive as OH_DEBUFF_CONFIG on this context's own
// ClientUI_FireOutput listener. DEV status log (config log: true): hero bars print every status panel
// when it appears (+), changes classes, stacks or visibility (~), or goes away (-).
(() => {
  "use strict";

  const TAG = "[OH-DB]";
  const RELAY_LAYOUT = "file://{resources}/layout/observer_hud/debuff_relay.xml";
  const RELAY_ATTR = "oh_debuff_message";
  // Same default and range as $.OHState (dev.debuffPollMs); the validator checks both.
  const DEFAULT_POLL_MS = 250;
  const MIN_POLL_MS = 100;
  const MAX_POLL_MS = 2000;
  const HEARTBEAT_MS = 4000;
  const IDLE_FIRST_S = 0.5;
  const IDLE_MAX_S = 2;
  const IDLE_SLOW_S = 4; // an idle bar's cap once WAKE_WINDOW_MS has passed without a wake
  const WAKE_WINDOW_MS = 30000;
  const FULL_MS = 2000; // a hero bar's full sample at least this often (quick polls in between)
  const RADIAL_MS = 500; // the shown statuses' radials and stacks between full samples
  const MAX_KEYS = 8; // = oh_debuffs.js MAX_KEYS (the column shows six and picks which)
  const MAX_COUNT = 99;
  const END_JITTER_MS = 400;
  const FIT_GAP_MS = 450;
  const REFRESH_DEG = 20; // a 1.5 s radial moves 60 deg per 0.25 s sample; whole-degree noise is 1
  const MAX_ALIASES = 24; // $.OHState: at most 24 aliases of at most 24 characters
  const MAX_ALIAS = 24;
  // realLabel takes no space and draws nothing (not collapsed: its text must keep following the variable).
  const HIDDEN_STYLE = { opacity: "0", width: "0px", height: "0px" };
  const RADIAL = /^radial\(\s*50(?:\.0+)?%\s+50(?:\.0+)?%\s*,\s*0(?:\.0+)?deg\s*,\s*(-?\d+(?:\.\d+)?)deg\s*\)$/;
  // One rule per ability in dlf/spectator-status.json; nothing else reaches the top bar. Keep equal to
  // the spec (validate-observer-hud.js compares them). maxSeconds: heuristic threshold, a radial whose full turn
  // is longer gives no number (user report 2026-10-20: a number near Wraith's cooldown on her lift;
  // that the status runs its radial on the cooldown is a hypothesis), so a genuine longer duration loses
  // its number too. buff: its non-debuff statuses show too (own team colour). minStacks: shown from that
  // many stacks (its stun regardless). ignore: status classes skipped (Bebop's bullet amp after the pull).
  // pulse: each hit sends a new hit number, and the top-bar slot pulses once (Shining Wonder's bounces).
  const RULES = new Map([
    ["citadel_ability_bull_leap", { maxSeconds: 6, buff: true }],
    ["citadel_ability_hook", { maxSeconds: 3, buff: true, ignore: ["bullet_armor_reduction"] }],
    ["ability_baba_ultimate_2", { maxSeconds: 10 }],
    ["ability_doorman_hotel", { maxSeconds: 12 }],
    ["drifter_darkness", { maxSeconds: 12 }],
    ["citadel_ability_self_vacuum", { maxSeconds: 6 }],
    ["ability_guided_arrow", { maxSeconds: 3 }],
    ["ability_gravity_lasso", { maxSeconds: 6 }],
    ["ability_ice_dome", { maxSeconds: 10, buff: true }],
    ["ability_health_swap", { maxSeconds: 8, buff: true }],
    ["citadel_ability_lash_ultimate", { maxSeconds: 8 }],
    ["ability_ult_combo", { maxSeconds: 6 }],
    ["citadel_ability_chrono_swap", { maxSeconds: 4 }],
    ["ability_bookworm_knightcharge", { maxSeconds: 20, buff: true }],
    ["synth_affliction", { maxSeconds: 20 }],
    ["ability_familiar_ability01", { maxSeconds: 8 }],
    ["ability_magician_animalhexarea", { maxSeconds: 6 }],
    ["viscous_restorative_goo", { maxSeconds: 16, buff: true }],
    ["ability_viper_petrifybola", { maxSeconds: 6 }],
    ["citadel_ability_psychic_lift", { maxSeconds: 6 }],
    ["mirage_sand_phantom", { maxSeconds: 10, minStacks: 8 }],
    ["ability_frank_revive", { maxSeconds: 6 }],
    ["citadel_ability_zip_line", { maxSeconds: 16 }],
    ["ability_punkgoat_tether", { maxSeconds: 2 }],
    ["ability_chessmaster_queen", { maxSeconds: 4 }],
    ["ability_chessmaster_forkpiece", { maxSeconds: 3 }],
    ["ability_fire_bomb", { maxSeconds: 4 }],
    ["citadel_ability_flying_strike", { maxSeconds: 3 }],
    ["ability_sleep_dagger", { maxSeconds: 8 }],
    ["ability_deadpack_ultimate", { maxSeconds: 6 }],
    ["ability_artist_bamboogrove", { maxSeconds: 6 }],
    ["ability_warden_lock_down", { maxSeconds: 5 }],
    ["ability_doorman_luggage_cart", { maxSeconds: 6 }],
    ["ability_nurse_fear", { maxSeconds: 6, ignore: ["nurse_fear_buildup"] }],
    ["ability_unicorn_dazzlingorb", { maxSeconds: 3, pulse: true }]
  ]);

  // A stun with no applying ability is named after its state (status_MODIFIER_STATE_STUNNED, any such
  // stun: Seven's Static Charge, Ivy's Stone Form, ...) and after its modifier. Only the Hyperline
  // knock-off's modifier is the knockdown (live 2026-10-14); ability knockdowns (Abrams, Solomon,
  // Infernus) are keyed by their ability. The state panel alone is no Hyperline: it stays unlisted.
  const HYPERLINE_KEY = "citadel_ability_zip_line";
  const HYPERLINE_STUN_ID = "modifier_citadel_knockdown";
  // Stun panels stay in the status list (so they can be read) but take no space and draw nothing.
  // oh_status_world.css does this from the first frame; these inline styles are the fallback.
  const MUTED_STYLE = { opacity: "0", width: "0px", height: "0px", margin: "0px" };
  // Classes the engine puts on status panels (client.dll), for the status log.
  const ENGINE_CLASSES = ["usingAbilityImage", "smallCSSIcon", "statusEffect", "isDebuff", "buildup", "proced",
    "modifierImmunity", "stunned"];

  const context = $.GetContextPanel();
  if (typeof context.OHDebuffStop === "function") context.OHDebuffStop();
  const instance = Date.now() + ":" + Math.random().toString(16).slice(2);

  let stopped = false;
  let generation = 0;
  let on = true;
  let log = false;
  let pollMs = DEFAULT_POLL_MS;
  let logged = new Map(); // status panel -> { name, id, sig } while the status log is on
  let announced = false;
  let idleS = IDLE_FIRST_S;
  let dialog = null; // the overlay root (ClientUIDialogPanel) while this list sits in one
  let root = null; // its parent, the world panel: the relay's parent and the snapshot source
  let namePanel = null; // the stock #name (bound to the overlay's dialog variable "name")
  // Aliases (user 2026-10-23): the stock #name shows a player's alias while spectating; OH_DEBUFF_CONFIG
  // carries them (unique in-game names, upper-cased here). The in-game name is read from realLabel, a
  // hidden Label of ours bound to the same dialog variable, so it follows a recycled bar even while the
  // stock label shows an alias (a written text unbinds a label). shownAlias: what #name shows ("" =
  // the stock binding).
  let realLabel = null;
  let shownAlias = "";
  let aliases = new Map();
  let aliasesSig = "[]";
  let container = null;
  let relay = null;
  let listener = null;
  let seq = 0;
  let sentSig = ""; // "" while the top bar shows nothing for this bar
  let sentName = "";
  let sentAt = 0;
  let errorShown = false;
  let parts = new Map(); // status panel -> { border, stacks, angle, dir } (panels seen in the last sample)
  let fits = new Map(); // key -> { points: [{ angle, at }], end }
  let hits = new Map(); // slot -> hit sequence number of its last hit (pulse rules)
  let hitSeq = 0;
  let muted = new Set();
  let carrierIsRoot = true; // CLASS_PLAYER was last seen on the world panel (else on the dialog)
  // Quick polls (2026-10-25, phase 1 of decisions/postgame-identity-perf-plan.md): see quick().
  let watch = true; // spectating (OH_DEBUFF_CONFIG watch); false sleeps the loop
  let wake = 0; // the column's wake counter: a change re-checks idle bars at once
  let configRaw = ""; // the last OH_DEBUFF_CONFIG heard
  let awakeAt = Date.now(); // load or the last wake: the 2 s idle cap holds for WAKE_WINDOW_MS after it
  let tracked = []; // the shown status panels of the last full sample: { effect, found, slot, key, rule, stun, debuff }
  let trackedFast = false; // a shown status needs every poll (pulse or minStacks rule)
  let shownName = ""; // the in-game name of the last full sample
  let listSig = ""; // "<child count>|<last child id>" of the last full sample
  let fullAt = 0;
  let radialAt = 0;
  let quickOk = false; // a hero bar with a full sample to compare against

  const valid = (panel) => {
    try {
      return !!panel && panel.IsValid();
    } catch (e) {
      return false;
    }
  };

  // The hero overlay this list belongs to, or null. Cheap: the cached overlay is validated (a bar stays
  // in its overlay; the engine recycles the whole world panel), so a re-check costs one validity call and
  // one class read; the parent is read only until the overlay is known.
  function heroDialog() {
    let parent = dialog;
    if (!parent || !valid(parent)) {
      parent = context.GetParent();
      if (!parent || (parent.paneltype || parent.type) !== "ClientUIDialogPanel") return null;
      if (parent !== dialog) {
        restoreName();
        if (valid(realLabel)) realLabel.DeleteAsync(0);
        realLabel = null;
        dialog = parent;
        root = parent.GetParent();
        namePanel = null;
        carrierIsRoot = true;
      }
    }
    if (!valid(root)) return null;
    // The unit class sits on the overlay root or on the world panel above it (live: the world panel).
    // The one that carried it last is read first, so a hero bar costs one class read per sample.
    const first = carrierIsRoot ? root : parent;
    if (first.BHasClass("CLASS_PLAYER")) return parent;
    if (!(carrierIsRoot ? parent : root).BHasClass("CLASS_PLAYER")) return null;
    carrierIsRoot = !carrierIsRoot;
    return parent;
  }

  // True when this list belongs to the HUD (its top panel is CitadelHudRoot): it never hosts a world bar.
  function inHud() {
    let panel = context;
    for (let depth = 0; depth < 40; depth++) {
      const parent = panel.GetParent();
      if (!valid(parent)) break;
      panel = parent;
    }
    return panel.id === "CitadelHudRoot";
  }

  // The hero's in-game name ("" until the dialog variable resolves), from realLabel.
  function realName() {
    if (!valid(realLabel)) {
      realLabel = $.CreatePanel("Label", dialog, "OHRealName", { text: "{s:name}", hittest: "false" });
      for (const property of Object.keys(HIDDEN_STYLE)) realLabel.style[property] = HIDDEN_STYLE[property];
    }
    const text = realLabel.text;
    return typeof text === "string" && text !== "{s:name}" ? text.trim().slice(0, 64) : "";
  }

  // The stock #name shows the alias for this in-game name, else its own binding; writes on change only.
  function showAlias(real) {
    const alias = real ? aliases.get(real.toUpperCase()) || "" : "";
    if (alias === shownAlias) return;
    if (!valid(namePanel)) namePanel = dialog.FindChild("name") || dialog.FindChildTraverse("name") || null;
    if (!namePanel) return;
    namePanel.text = alias || "{s:name}";
    shownAlias = alias;
  }
  function restoreName() {
    if (shownAlias && valid(namePanel)) namePanel.text = "{s:name}";
    shownAlias = "";
  }

  // OH_DEBUFF_CONFIG aliases: { "<in-game name>": alias }, at most MAX_ALIASES; bad entries are skipped.
  function parseAliases(raw) {
    const out = new Map();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const key of Object.keys(raw)) {
      if (out.size >= MAX_ALIASES) break;
      const alias = raw[key];
      if (key.trim() && key.length <= 64 && typeof alias === "string" && alias.trim() && alias.length <= MAX_ALIAS) {
        out.set(key.trim().toUpperCase(), alias);
      }
    }
    return out;
  }

  // The live status list or null (a cached one is validated, a fresh FindChild result is live).
  function statusList() {
    if (!valid(container)) container = context.FindChild("StatusEffectContainer") || null;
    return container;
  }

  // World -> HUD messages leave through a sibling of the overlay, never from the ClientUIDialogPanel.
  function send(name, items, now) {
    let created = false;
    if (!valid(relay) || relay.GetParent() !== root) {
      if (valid(relay)) relay.DeleteAsync(0);
      if (!valid(root) || (root.paneltype || root.type) !== "Panel") throw new Error("expected a plain Panel above the overlay");
      relay = $.CreatePanel("Panel", root, "OHDebuffRelay");
      if (!relay.BLoadLayout(RELAY_LAYOUT, false, false)) {
        relay.DeleteAsync(0);
        relay = null;
        throw new Error("debuff relay layout failed to load");
      }
      created = true;
    }
    seq++;
    if (log) $.Msg(`${TAG} send ${name || "(no name)"} seq=${seq} items=${JSON.stringify(items)}${created ? " new relay" : ""}`);
    relay.SetAttributeString(RELAY_ATTR, JSON.stringify({
      magic_word: "OH_DEBUFF_SNAPSHOT", source: root.id || instance, instance: instance, seq: seq, at: now, name: name, items: items
    }));
    $.DispatchEvent("Activated", relay, "mouse");
  }

  // Sends on change, and every HEARTBEAT_MS while something is shown so the top bar can expire
  // records of bars that went away. An empty list is sent once, to clear.
  function publish(name, items) {
    const now = Date.now();
    if (!items.length || !name) {
      if (sentSig && valid(root)) send(sentName, [], now);
      sentSig = "";
      return;
    }
    const sig = name + "|" + items.join(" ");
    if (sig === sentSig && now >= sentAt && now - sentAt < HEARTBEAT_MS) return;
    send(name, items, now);
    sentSig = sig;
    sentName = name;
    sentAt = now;
  }

  // Child panels of one status, looked up once per status panel.
  function partsOf(effect) {
    let found = parts.get(effect);
    if (!found) found = { border: effect.FindChildTraverse("StatusEffectsBorder"), stacks: effect.FindChild("stacks"), angle: null, dir: 0 };
    return found;
  }

  function radialAngle(border) {
    if (!valid(border)) return null;
    const match = RADIAL.exec(String(border.style.clip || ""));
    const angle = match ? Number(match[1]) : NaN;
    return isFinite(angle) && angle >= -360 && angle <= 0 ? angle : null;
  }

  // Three samples with one steady rate predict the expiry; a refresh, pause, aura (constant angle)
  // or missing radial gives 0. The radial runs from -360 towards 0, or the other way when reversed.
  // The fit uses samples at least FIT_GAP_MS apart at any poll rate: the angle is read in whole,
  // slightly noisy degrees, so closer samples fail the 10% steadiness test (validator, 0.25 s poll).
  // The same fit gives the full duration (one turn: 360 / rate), sent with the end so the column can
  // draw the elapsed part of the circle (user 2026-11-06); fit.total is 0 whenever fit.end is.
  function predictEnd(key, angle, now, maxSeconds) {
    if (angle === null) {
      fits.delete(key);
      return 0;
    }
    let fit = fits.get(key);
    if (!fit) fits.set(key, (fit = { points: [], end: 0, total: 0 }));
    const previous = fit.points[fit.points.length - 1];
    if (previous && now - previous.at < FIT_GAP_MS) return fit.end;
    fit.points.push({ angle, at: now });
    if (fit.points.length > 3) fit.points.shift();
    if (fit.points.length < 3) return (fit.end = fit.total = 0);
    const [a, b, c] = fit.points;
    const span = (c.at - a.at) / 1000;
    const first = (b.at - a.at) / 1000;
    const last = (c.at - b.at) / 1000;
    if (!(first > 0 && last > 0)) return (fit.end = fit.total = 0);
    const rate = (c.angle - a.angle) / span;
    const firstRate = (b.angle - a.angle) / first;
    const lastRate = (c.angle - b.angle) / last;
    if (!(Math.abs(rate) >= 1 && Math.abs(rate) <= 360) || Math.abs(firstRate - lastRate) > Math.abs(rate) * 0.1 ||
        360 / Math.abs(rate) > maxSeconds * 1.05) {
      return (fit.end = fit.total = 0);
    }
    const left = rate > 0 ? -c.angle / rate : (360 + c.angle) / -rate;
    const end = Math.round(now + left * 1000);
    if (!(fit.end && Math.abs(end - fit.end) <= END_JITTER_MS)) {
      fit.end = end;
      fit.total = Math.round(360000 / Math.abs(rate));
    }
    return fit.end;
  }

  function stackCount(label) {
    const text = valid(label) ? label.text : "";
    return typeof text === "string" && /^\d{1,3}$/.test(text) ? Number(text) : 0;
  }

  function logStatuses(name, list) {
    const next = new Map();
    for (const effect of valid(list) ? list.Children() : []) {
      if (!valid(effect)) continue;
      let entry = logged.get(effect);
      if (!entry) entry = { name, id: typeof effect.id === "string" && effect.id ? effect.id : "(no id)", sig: "" };
      const classes = ENGINE_CLASSES.filter((cls) => effect.BHasClass(cls));
      const stacks = partsOf(effect).stacks;
      const stackText = valid(stacks) && typeof stacks.text === "string" && stacks.text ? stacks.text : "-";
      const hidden = effect.visible === false ? " hidden" : "";
      const sig = `classes=[${classes.join(" ")}] stacks=${stackText}${hidden}`;
      if (sig !== entry.sig) {
        const angle = radialAngle(partsOf(effect).border);
        $.Msg(`${TAG} status ${entry.sig ? "~" : "+"} ${name} ${entry.id} ${sig} radial=${angle === null ? "-" : Math.round(angle)}`);
        entry.sig = sig;
      }
      next.set(effect, entry);
    }
    for (const [effect, entry] of logged) if (!next.has(effect)) $.Msg(`${TAG} status - ${entry.name} ${entry.id}`);
    logged = next;
  }

  // Gives this bar's stun panels their inline styles back (a recycled bar, or icons switched off).
  function unmuteAll() {
    for (const effect of muted) {
      if (!valid(effect)) continue;
      for (const property of Object.keys(MUTED_STYLE)) effect.style[property] = null;
    }
    muted = new Set();
  }

  // Returns the delay in seconds until the next sample, or -1 to stop for good.
  function sample() {
    if (!heroDialog()) {
      publish("", []);
      restoreName();
      if (muted.size) unmuteAll();
      if (parts.size) parts = new Map();
      if (fits.size) fits = new Map();
      if (hits.size) hits = new Map();
      if (logged.size) logged = new Map();
      announced = false;
      if (!dialog && inHud()) return -1;
      const delay = idleS;
      // The 2 s cap holds for WAKE_WINDOW_MS after load or a wake (the hero class lands up to ~15 s late,
      // ENGINE.md); after that an idle bar re-checks every IDLE_SLOW_S until the column wakes it.
      idleS = Math.min(idleS * 2, Date.now() - awakeAt < WAKE_WINDOW_MS ? IDLE_MAX_S : IDLE_SLOW_S);
      return delay;
    }
    idleS = IDLE_FIRST_S;
    // The in-game name: the snapshot's key (the column matches it to the card) and the alias lookup.
    const real = realName();
    showAlias(real);
    const name = real.toUpperCase();
    const list = name ? statusList() : null;
    if (log && !announced) {
      const statuses = valid(statusList()) ? `${statusList().Children().length} statuses` : "no status list";
      $.Msg(`${TAG} log on: ${name || "(no name)"}, ${statuses}`);
      announced = true;
    }
    if (log && name) logStatuses(name, list);
    if (!on) {
      // Icons off: only the alias on the name label is kept up (once a second is plenty for a name).
      publish("", []);
      if (muted.size) unmuteAll();
      return 1;
    }
    const now = Date.now();
    const byKey = new Map();
    const seen = new Map();
    const nextTracked = [];
    // Children() returns live panels, so they are not checked again this sample; statusList() already
    // validated the list.
    const children = list ? list.Children() : [];
    const nextMuted = new Set();
    for (const effect of children) {
      const stun = effect.BHasClass("stunned"); // one class read per panel: muting and sampling share it
      if (stun !== muted.has(effect)) {
        for (const property of Object.keys(MUTED_STYLE)) effect.style[property] = stun ? MUTED_STYLE[property] : null;
      }
      if (stun) nextMuted.add(effect);
      // Id and rule first (plain JS after one id read): panels of abilities outside RULES cost no
      // visibility or debuff read.
      const id = effect.id;
      if (typeof id !== "string" || id.slice(0, 7) !== "status_") continue;
      const cut = id.indexOf("/", 7);
      let key = cut < 0 ? id.slice(7) : id.slice(7, cut);
      if (stun && key === HYPERLINE_STUN_ID) key = HYPERLINE_KEY;
      const rule = RULES.get(key);
      if (!rule || (effect.visible === false && !stun)) continue;
      const debuff = effect.BHasClass("isDebuff");
      if (!stun && !debuff && !rule.buff) continue;
      if (rule.ignore && rule.ignore.some((cls) => effect.BHasClass(cls))) continue;
      const slot = stun ? key + "#stun" : key;
      if (!byKey.has(slot) && byKey.size >= MAX_KEYS) continue;
      const known = parts.has(effect);
      const found = partsOf(effect);
      seen.set(effect, found);
      const item = { effect: effect, found: found, slot: slot, key: key, rule: rule, stun: stun, debuff: debuff };
      nextTracked.push(item);
      accumulate(byKey, item, known);
    }
    muted = nextMuted;
    parts = seen;
    tracked = nextTracked;
    trackedFast = tracked.some((item) => item.rule.pulse || item.rule.minStacks);
    shownName = name;
    // The signature the quick polls compare (live P5: new statuses arrive as new panels).
    listSig = children.length ? `${children.length}|${children[children.length - 1].id}` : "0";
    fullAt = now + FULL_MS;
    radialAt = now + RADIAL_MS;
    // The status log reads every panel at every poll; it never takes the quick path.
    quickOk = !!name && !log;
    publish(name, buildItems(byKey, now));
    return pollMs / 1000;
  }

  // One shown status panel into its ability's entry: panels, stacks, the radial and (pulse rules) hits.
  function accumulate(byKey, item, known) {
    let entry = byKey.get(item.slot);
    if (!entry) {
      byKey.set(item.slot, (entry = { key: item.key, rule: item.rule, stun: item.stun, debuff: false, panels: 0, stacks: 0, angle: null, hit: false }));
    }
    const found = item.found;
    entry.debuff = entry.debuff || item.debuff;
    entry.panels++;
    entry.stacks = Math.max(entry.stacks, stackCount(found.stacks));
    if (item.rule.pulse) {
      // Every panel's radial is read: a new panel or a jump back against the running direction is a hit.
      const angle = radialAngle(found.border);
      if (!known) entry.hit = true;
      else if (angle !== null && found.angle !== null) {
        const delta = angle - found.angle;
        if (found.dir && delta * found.dir < -REFRESH_DEG) entry.hit = true;
        else if (Math.abs(delta) >= 1) found.dir = delta > 0 ? 1 : -1;
      }
      found.angle = angle;
      if (entry.angle === null) entry.angle = angle;
    } else if (entry.angle === null) entry.angle = radialAngle(found.border);
  }

  function buildItems(byKey, now) {
    const items = [];
    for (const [slot, entry] of byKey) {
      if (!entry.stun && entry.stacks < (entry.rule.minStacks || 0)) {
        fits.delete(slot);
        continue;
      }
      // A stun is one status even when the engine shows it twice (a modifier panel and a state panel).
      const count = entry.stun ? 1 : Math.min(MAX_COUNT, Math.max(entry.panels, entry.stacks));
      if (entry.hit) hits.set(slot, ++hitSeq);
      const end = predictEnd(slot, entry.angle, now, entry.rule.maxSeconds);
      const fit = fits.get(slot);
      items.push([entry.key, entry.debuff ? 1 : 0, count, end, entry.stun ? 1 : 0, hits.get(slot) || 0,
        end > 0 && fit ? fit.total : 0]);
    }
    for (const key of fits.keys()) if (!byKey.has(key)) fits.delete(key);
    for (const key of hits.keys()) if (!byKey.has(key)) hits.delete(key);
    return items;
  }

  // Between full samples a hero bar reads only its status list's signature: the child count and the
  // last child's id (live P5, client 6819: every stun and every listed status arrived as a new panel; no
  // reorder, id change or visibility flip was seen). The statuses it shows are re-read for their radial
  // and stacks every RADIAL_MS (the end fit takes samples FIT_GAP_MS apart), at every poll for pulse
  // and minStacks rules (a refresh or a stack keeps the count). At the same RADIAL_MS the in-game name is
  // compared while it matters (an alias exists or a status shows): a bar the engine gave to another hero
  // takes a full sample. A full sample also runs on a changed signature and every FULL_MS (classes,
  // recycled bars). Returns the delay, or -1 for a full sample.
  function quick(now) {
    if (now >= fullAt || !valid(container)) return -1;
    const count = container.GetChildCount();
    const last = count ? container.GetChild(count - 1) : null;
    if ((count ? `${count}|${last ? last.id : ""}` : "0") !== listSig) return -1;
    const due = now >= radialAt;
    if (due) {
      radialAt = now + RADIAL_MS;
      if ((aliases.size || tracked.length) && realName().toUpperCase() !== shownName) return -1;
    }
    if (tracked.length && (trackedFast || due)) {
      const byKey = new Map();
      for (const item of tracked) accumulate(byKey, item, true);
      publish(shownName, buildItems(byKey, now));
    }
    return pollMs / 1000;
  }

  // Nothing to do (not spectating, or icons off with no alias): clear what this bar sent, give the stock
  // name and stun panels back, and stop until a config message wakes the loop.
  function sleep() {
    try {
      publish("", []);
      restoreName();
      if (muted.size) unmuteAll();
    } catch (e) { /* a bar going away */ }
    parts = new Map();
    fits = new Map();
    hits = new Map();
    tracked = [];
    quickOk = false;
  }

  function schedule(delayS) {
    const mine = generation;
    $.Schedule(delayS, () => {
      if (mine === generation) tick();
    });
  }

  function tick() {
    if (stopped) return;
    if (!valid(context)) {
      context.OHDebuffStop();
      return;
    }
    // Only while spectating, and only when there is something to show: icons, or an alias.
    if (!watch || (!on && !aliases.size)) {
      sleep();
      return;
    }
    let delay = IDLE_MAX_S;
    try {
      delay = quickOk ? quick(Date.now()) : -1;
      if (delay < 0) {
        quickOk = false;
        delay = sample();
      }
    } catch (e) {
      quickOk = false;
      if (!errorShown) {
        errorShown = true;
        $.Msg(`${TAG} sample error: ${e && e.message ? e.message : e}`);
      }
    }
    if (delay < 0) {
      context.OHDebuffStop(); // a HUD status list: never a world bar
      return;
    }
    schedule(delay);
  }

  // A change restarts the loop at once, so a faster interval or ON applies without waiting. The heartbeat
  // repeats the last message, and only this function writes what a message sets, so an equal one is skipped
  // before the parse (one bar per world panel hears every heartbeat).
  function onConfig(raw) {
    if (stopped || typeof raw !== "string" || raw === configRaw || raw.indexOf("OH_DEBUFF_CONFIG") < 0) return;
    configRaw = raw;
    let message = null;
    try {
      message = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!message || message.magic_word !== "OH_DEBUFF_CONFIG" || typeof message.on !== "boolean" ||
        !Number.isInteger(message.poll) || message.poll < MIN_POLL_MS || message.poll > MAX_POLL_MS) return;
    const nextLog = message.log === true;
    // Older senders have no watch flag: they only ran while spectating.
    const nextWatch = message.watch !== false;
    const nextWake = Number.isInteger(message.wake) ? message.wake : wake;
    // Aliases apply at the next full sample (forced now); they restart the loop only from sleep.
    const nextAliases = parseAliases(message.aliases);
    const nextSig = JSON.stringify([...nextAliases]);
    const wasActive = watch && (on || aliases.size > 0);
    if (nextSig !== aliasesSig) {
      aliases = nextAliases;
      aliasesSig = nextSig;
      fullAt = 0;
    }
    const woken = nextWake !== wake;
    wake = nextWake;
    if (message.on === on && message.poll === pollMs && nextLog === log && nextWatch === watch && !woken &&
        wasActive === (watch && (on || aliases.size > 0))) return;
    on = message.on;
    pollMs = message.poll;
    const started = nextWatch && !watch;
    watch = nextWatch;
    if (nextLog !== log) announced = false;
    log = nextLog;
    if (!log) logged = new Map();
    // A wake (the column saw its cards change: a respawn, a swap, a new map) or the start of spectating
    // re-checks idle bars now and keeps the 2 s cap for WAKE_WINDOW_MS.
    if (woken || started) {
      idleS = IDLE_FIRST_S;
      awakeAt = Date.now();
    }
    quickOk = false;
    generation++;
    tick();
  }

  context.OHDebuffStop = () => {
    stopped = true;
    generation++;
    if (listener !== null) {
      try { $.UnregisterForUnhandledEvent("ClientUI_FireOutput", listener); } catch (e) {}
      listener = null;
    }
    if (valid(relay)) {
      relay.SetAttributeString(RELAY_ATTR, "");
      relay.DeleteAsync(0);
    }
    relay = null;
    restoreName();
    if (valid(realLabel)) realLabel.DeleteAsync(0);
    realLabel = null;
  };

  listener = $.RegisterForUnhandledEvent("ClientUI_FireOutput", onConfig);
  schedule(IDLE_FIRST_S);
})();
