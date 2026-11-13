// DLF top-bar debuff icons, world side: one instance per unit-status (world healthbar) context.
// Hero bars scan their own status list (shallow: #StatusEffectContainer's children) every pollMs.
// A status panel's id is status_<ability> (status_<ability>/<modifier> when the applying ability
// entity is gone). Only the abilities in dlf/spectator-status.json (RULES) are sent: their
// debuffs (.isDebuff), their non-debuff statuses only when listed as a buff, and a status
// listed with minStacks (Djinn's Mark) only from that many stacks. A panel with the
// "stunned" class (the modifier's m_strSmallIconCssClass) is a stun: it becomes its own item, apart
// from the ability's other effects. Per ability and kind
// the snapshot carries [key, debuff 0/1, count, end, stun 0/1]: count is the larger of the #stacks
// label and the number of panels, end the predicted expiry (Date.now() ms; 0 = no countdown) fitted
// from three samples of the native radial on #StatusEffectsBorder, as HPv2's pickup rings do.
// Changes, plus a 4 s heartbeat while anything is shown, leave through a sibling relay as
// DLF_DEBUFF_SNAPSHOT for dlf_debuffs.js on the top bar. The top bar's DLF_DEBUFF_CONFIG (DEV
// section: on/off and poll interval) arrives through pickup_host.js, this context's single
// ClientUI_FireOutput listener. Non-hero bars only re-check their class, backing off from 0.5 s to
// every 2 s: world panels are recycled, and CLASS_PLAYER lands late on the world panel above this
// ClientUIDialogPanel (live, Observer HUD, client 6812), so a bar that becomes a hero is picked up
// within 2 s. A bar that stops being a hero drops its state (radial fits, parts, muted stun panels).
// DEV status log (config log: true): hero bars print every status panel to the console when it
// appears (+), changes classes, stacks or visibility (~), or goes away (-). Panorama cannot list a
// panel's classes, so the engine's status classes and DLF_STATUS_CSS (every m_strSmallIconCssClass,
// generated from the game's VData) are tested by name. It runs even with the icons switched off.
(() => {
  "use strict";

  const TAG = "[DLF-DB]";
  const RELAY_LAYOUT = "file://{resources}/layout/dlf/debuff_event_relay.xml";
  const RELAY_ATTR = "dlf_debuff_message";
  // Same default and range as $.DLFState (dev.debuffPollMs); validate-dlf.js checks both.
  const DEFAULT_POLL_MS = 250;
  const MIN_POLL_MS = 100;
  const MAX_POLL_MS = 2000;
  const HEARTBEAT_MS = 4000;
  const IDLE_FIRST_S = 0.5;
  const IDLE_MAX_S = 2;
  const MAX_KEYS = 8;
  const MAX_COUNT = 99;
  const END_JITTER_MS = 400;
  const FIT_GAP_MS = 450;
  const REFRESH_DEG = 20; // a 1.5 s radial moves 60 deg per 0.25 s sample; whole-degree noise is 1
  const KEY = /^[a-z0-9_]{1,64}$/;
  const RADIAL = /^radial\(\s*50(?:\.0+)?%\s+50(?:\.0+)?%\s*,\s*0(?:\.0+)?deg\s*,\s*(-?\d+(?:\.\d+)?)deg\s*\)$/;
  // One rule per ability in dlf/spectator-status.json; nothing else reaches the top bar. Keep equal to
  // the spec (validate-dlf.js compares them). maxSeconds: heuristic threshold, a radial whose full turn
  // is longer gives no number (user report 2026-10-20: a number near Wraith's cooldown on her lift;
  // that the status runs its radial on the cooldown is a hypothesis), so a genuine longer duration loses
  // its number too. buff: its non-debuff statuses show too (own team colour). minStacks: shown from that
  // many stacks (its stun regardless). ignore: status classes skipped (Bebop's bullet amp after the pull).
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
    // pulse: each hit (a new panel, or its radial jumping back: a refresh) pulses the top-bar slot once.
    ["ability_unicorn_dazzlingorb", { maxSeconds: 3, pulse: true }]
  ]);
  // A stun with no applying ability is named after its state (status_MODIFIER_STATE_STUNNED, any such
  // stun: Seven's Static Charge, Ivy's Stone Form, ...) and after its modifier. Only the Hyperline
  // knock-off's modifier is the knockdown (live 2026-10-14); ability knockdowns (Abrams, Solomon,
  // Infernus) are keyed by their ability. The state panel alone is no Hyperline: it stays unlisted.
  const HYPERLINE_KEY = "citadel_ability_zip_line";
  const HYPERLINE_STUN_ID = "modifier_citadel_knockdown";
  // Stun panels stay in the status list (so they can be read) but take no space and draw nothing.
  // dlf_status_world.css (loaded by DLF's citadel_status_effect.xml) does this from the first frame;
  // these inline styles are a fallback while that is unconfirmed live.
  const MUTED_STYLE = { opacity: "0", width: "0px", height: "0px", margin: "0px" };
  // The hidden in-game name label: never collapsed, so it keeps resolving its binding.
  const HIDDEN_STYLE = { opacity: "0", width: "0px", height: "0px" };
  const MAX_ALIASES = 12; // $.DLFState: one per top-bar slot
  const MAX_ALIAS = 16; // $.DLFState.MAX_ALIAS

  const context = $.GetContextPanel();
  if (typeof context.DLFDebuffStop === "function") context.DLFDebuffStop();
  const root = context.GetParent();
  const instance = Date.now() + ":" + Math.random().toString(16).slice(2);

  let stopped = false;
  let generation = 0;
  let on = true;
  let log = false;
  let pollMs = DEFAULT_POLL_MS;
  let logged = new Map(); // status panel -> { name, id, css, sig } while the status log is on
  let announced = false; // this hero bar printed "log on" since the log was switched on
  let idleS = IDLE_FIRST_S;
  let unit = null;
  let namePanel = null; // the stock #name (bound to the overlay's dialog variable "name")
  // Aliases (as Observer HUD, user 2026-10-24): the stock #name shows a player's alias; DLF_DEBUFF_CONFIG
  // carries the banner's map (in-game names upper-cased). Writing #name unbinds it, so the in-game name
  // is read from realLabel, a hidden Label of ours bound to the same dialog variable: it follows a
  // recycled bar while #name shows an alias. shownAlias: what #name shows ("" = the stock binding).
  let realLabel = null;
  let shownAlias = "";
  let aliases = new Map();
  let aliasesSig = "[]";
  let container = null;
  let relay = null;
  let seq = 0;
  let sentSig = ""; // "" while the top bar shows nothing for this bar
  let sentName = "";
  let sentAt = 0;
  let errorShown = false;
  let parts = new Map(); // status panel -> { border, stacks } (panels seen in the last sample)
  let fits = new Map(); // key -> { points: [{ angle, at }], end }
  let hits = new Map(); // slot -> hit sequence number of its last hit (pulse rules)
  let hitSeq = 0;

  const valid = (panel) => {
    try {
      return !!panel && panel.IsValid();
    } catch (e) {
      return false;
    }
  };

  // CLASS_PLAYER sits on the world panel (this dialog's parent; live 6812) or, on older clients, on the
  // dialog itself. The panel that carried it last is checked first.
  function heroUnit() {
    if (valid(unit) && unit.BHasClass("CLASS_PLAYER")) return unit;
    const parent = context.GetParent();
    for (const panel of unit === context ? [context, parent] : [parent, context]) {
      if (valid(panel) && panel.BHasClass("CLASS_PLAYER")) return (unit = panel);
    }
    return null;
  }

  // The hero's in-game name, upper-cased ("" until the dialog variable resolves), from realLabel.
  function readName() {
    if (!valid(realLabel)) {
      realLabel = $.CreatePanel("Label", context, "DLFRealName", { text: "{s:name}", hittest: "false" });
      for (const property of Object.keys(HIDDEN_STYLE)) realLabel.style[property] = HIDDEN_STYLE[property];
    }
    const text = realLabel.text;
    return typeof text === "string" && text !== "{s:name}" ? text.trim().toUpperCase().slice(0, 64) : "";
  }

  // The stock #name shows the alias for this in-game name, else its own binding; writes on change only.
  function showAlias(name) {
    const alias = name ? aliases.get(name) || "" : "";
    if (alias === shownAlias) return;
    if (!valid(namePanel)) namePanel = context.FindChildTraverse("name");
    if (!valid(namePanel)) return;
    namePanel.text = alias || "{s:name}";
    shownAlias = alias;
  }
  function restoreName() {
    if (shownAlias && valid(namePanel)) namePanel.text = "{s:name}";
    shownAlias = "";
  }

  // DLF_DEBUFF_CONFIG aliases: { "<in-game name>": alias }, at most MAX_ALIASES; bad entries are skipped.
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

  function statusList() {
    if (valid(container)) return container;
    const effects = context.FindChildTraverse("StatusEffects");
    container = valid(effects) ? effects.FindChildTraverse("StatusEffectContainer") : null;
    return container;
  }

  // World -> HUD messages leave through a sibling, never from this ClientUIDialogPanel.
  function send(name, items, now) {
    let created = false;
    if (!valid(relay)) {
      if ((root.paneltype || root.type) !== "Panel" || (context.paneltype || context.type) !== "ClientUIDialogPanel")
        throw new Error("expected a ClientUIDialogPanel with a plain Panel parent");
      relay = $.CreatePanel("Panel", root, "DLFDebuffRelay");
      if (!relay.BLoadLayout(RELAY_LAYOUT, false, false)) {
        relay.DeleteAsync(0);
        relay = null;
        throw new Error("debuff relay layout failed to load");
      }
      created = true;
    }
    seq++;
    // STATUS LOG: what leaves this bar; the top bar logs what arrives ("recv"), so a gap shows the loss.
    if (log) $.Msg(`${TAG} send ${name || "(no name)"} seq=${seq} items=${JSON.stringify(items)}${created ? " new relay" : ""}`);
    relay.SetAttributeString(RELAY_ATTR, JSON.stringify({
      magic_word: "DLF_DEBUFF_SNAPSHOT", source: root.id, instance, seq, at: now, name, items
    }));
    $.DispatchEvent("Activated", relay, "mouse");
  }

  // Sends on change, and every HEARTBEAT_MS while something is shown so the top bar can expire
  // records of bars that went away. An empty list is sent once, to clear.
  function publish(name, items) {
    const now = Date.now();
    if (!items.length || !name) {
      if (sentSig) send(sentName, [], now);
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
    if (!found) found = { border: effect.FindChildTraverse("StatusEffectsBorder"), stacks: effect.FindChild("stacks") };
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
    // The same fit gives the full duration (one turn: 360 / rate), sent with the end so the top bar can
    // draw the elapsed part of the circle (user 2026-11-06, on Observer HUD).
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

  // Classes the engine puts on status panels (client.dll), then the modifier CSS classes.
  const ENGINE_CLASSES = ["usingAbilityImage", "smallCSSIcon", "statusEffect", "isDebuff", "buildup", "proced",
    "modifierImmunity"];
  const STATUS_CSS = typeof DLF_STATUS_CSS === "string" ? DLF_STATUS_CSS.split(" ").filter(Boolean) : [];

  // The modifier's CSS class never changes, so it is looked up once per panel.
  function logStatuses(name, list) {
    const next = new Map();
    // Every child is printed, also ones without a status_ id, so an unexpected id is still seen.
    for (const effect of valid(list) ? list.Children() : []) {
      if (!valid(effect)) continue;
      let entry = logged.get(effect);
      if (!entry) {
        const id = typeof effect.id === "string" && effect.id ? effect.id : "(no id)";
        entry = { name, id, css: STATUS_CSS.filter((cls) => effect.BHasClass(cls)), sig: "" };
      }
      const classes = ENGINE_CLASSES.filter((cls) => effect.BHasClass(cls)).concat(entry.css);
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

  // This bar's stun panels are hidden (no stun icon on the world healthbar) once per panel; a panel that
  // stops being a stun (should the engine reuse it) gets its styles back. Done in sample() with the icons
  // ON only (OFF stops all scanning); dlf_status_world.css covers every world bar regardless.
  let muted = new Set();

  // Gives this bar's stun panels their inline styles back (a recycled bar, or icons switched off).
  function unmuteAll() {
    for (const effect of muted) {
      if (!valid(effect)) continue;
      for (const property of Object.keys(MUTED_STYLE)) effect.style[property] = null;
    }
    muted = new Set();
  }

  // Returns the delay in seconds until the next sample.
  function sample() {
    if (!heroUnit()) {
      publish("", []);
      restoreName();
      if (muted.size) unmuteAll();
      parts = new Map();
      fits = new Map();
      hits = new Map();
      logged = new Map();
      announced = false;
      const delay = idleS;
      idleS = Math.min(idleS * 2, IDLE_MAX_S);
      return delay;
    }
    idleS = IDLE_FIRST_S;
    const name = readName();
    showAlias(name);
    const list = name ? statusList() : null;
    if (log && !announced) {
      // One line per hero bar proves the switch arrived, even when the bar has no status.
      const statuses = valid(statusList()) ? `${statusList().Children().length} statuses` : "no status list";
      $.Msg(`${TAG} log on: ${name || "(no name)"}, ${statuses}`);
      announced = true;
    }
    if (log && name) logStatuses(name, list);
    if (!on) {
      publish("", []);
      if (muted.size) unmuteAll();
      return pollMs / 1000;
    }
    const byKey = new Map();
    const seen = new Map();
    // Children() returns live panels, so they are not checked again this sample.
    const children = valid(list) ? list.Children() : [];
    const nextMuted = new Set();
    for (const effect of children) {
      const stun = effect.BHasClass("stunned"); // one class read per panel: muting and sampling share it
      if (stun !== muted.has(effect)) {
        for (const property of Object.keys(MUTED_STYLE)) effect.style[property] = stun ? MUTED_STYLE[property] : null;
      }
      if (stun) nextMuted.add(effect);
      if (effect.visible === false && !stun) continue;
      const id = effect.id;
      if (typeof id !== "string" || id.slice(0, 7) !== "status_") continue;
      const debuff = effect.BHasClass("isDebuff");
      // status_<ability>, or status_<ability>/<modifier> once the applying ability entity is gone. A
      // stun with no applying ability is named after its modifier and its state; only the knockdown
      // one is the Hyperline (see HYPERLINE_STUN_ID).
      let key = id.slice(7).split("/")[0];
      if (stun && key === HYPERLINE_STUN_ID) key = HYPERLINE_KEY;
      const rule = KEY.test(key) ? RULES.get(key) : undefined;
      if (!rule || (!stun && !debuff && !rule.buff)) continue;
      if (rule.ignore && rule.ignore.some((cls) => effect.BHasClass(cls))) continue;
      const slot = stun ? key + "#stun" : key;
      let entry = byKey.get(slot);
      if (!entry) {
        if (byKey.size >= MAX_KEYS) continue;
        byKey.set(slot, (entry = { key, rule, stun, debuff: false, panels: 0, stacks: 0, angle: null, hit: false }));
      }
      const known = parts.has(effect);
      const found = partsOf(effect);
      seen.set(effect, found);
      entry.debuff = entry.debuff || debuff;
      entry.panels++;
      entry.stacks = Math.max(entry.stacks, stackCount(found.stacks));
      if (rule.pulse) {
        // Every panel's radial is read: a new panel or a jump back against the running direction is a hit.
        const angle = radialAngle(found.border);
        if (!known) entry.hit = true;
        else if (angle !== null && found.angle !== undefined && found.angle !== null) {
          const delta = angle - found.angle;
          if (found.dir && delta * found.dir < -REFRESH_DEG) entry.hit = true;
          else if (Math.abs(delta) >= 1) found.dir = delta > 0 ? 1 : -1;
        }
        found.angle = angle;
        if (entry.angle === null) entry.angle = angle;
      } else if (entry.angle === null) entry.angle = radialAngle(found.border);
    }
    muted = nextMuted;
    parts = seen;
    const now = Date.now();
    const items = [];
    for (const [slot, entry] of byKey) {
      if (!entry.stun && entry.stacks < (entry.rule.minStacks || 0)) {
        fits.delete(slot);
        continue;
      }
      // A stun is one status even when the engine shows it twice (a modifier panel and a state panel).
      const count = entry.stun ? 1 : Math.min(MAX_COUNT, Math.max(entry.panels, entry.stacks));
      const end = predictEnd(slot, entry.angle, now, entry.rule.maxSeconds);
      const item = [entry.key, entry.debuff ? 1 : 0, count, end, entry.stun ? 1 : 0];
      // Pulse rules carry the slot's last hit number as a sixth field; the top bar pulses when it changes.
      if (entry.rule.pulse && entry.hit) hits.set(slot, ++hitSeq);
      // The seventh is the full duration (ms) of a predicted end, for the top bar's sweep.
      const fit = fits.get(slot);
      const total = end > 0 && fit ? fit.total : 0;
      if (entry.rule.pulse || total) item.push(entry.rule.pulse ? hits.get(slot) || 0 : 0);
      if (total) item.push(total);
      items.push(item);
    }
    for (const key of fits.keys()) if (!byKey.has(key)) fits.delete(key);
    for (const key of hits.keys()) if (!byKey.has(key)) hits.delete(key);
    publish(name, items);
    return pollMs / 1000;
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
      context.DLFDebuffStop();
      return;
    }
    let delay = IDLE_MAX_S;
    try {
      if (!on && !log) {
        publish("", []);
        return; // OFF: no polling until DLF_DEBUFF_CONFIG turns it back on
      }
      delay = sample();
    } catch (e) {
      if (!errorShown) {
        errorShown = true;
        $.Msg(`${TAG} sample error: ${e && e.message ? e.message : e}`);
      }
    }
    schedule(delay);
  }

  // A change restarts the loop at once, so a faster interval or ON applies without waiting.
  const onConfig = (raw) => {
    if (stopped) return;
    let message = null;
    try {
      message = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!message || message.magic_word !== "DLF_DEBUFF_CONFIG" || typeof message.on !== "boolean" ||
        !Number.isInteger(message.poll) || message.poll < MIN_POLL_MS || message.poll > MAX_POLL_MS) return;
    const nextLog = message.log === true;
    // Aliases apply at once on a hero bar (also with the icons OFF, when no sample runs); they alone do
    // not restart the loop. The 4 s heartbeat repeats this, so a recycled bar follows within 4 s when OFF.
    const nextAliases = parseAliases(message.aliases);
    const nextSig = JSON.stringify([...nextAliases]);
    if (nextSig !== aliasesSig) {
      aliases = nextAliases;
      aliasesSig = nextSig;
    }
    if (aliases.size || shownAlias) {
      try {
        if (heroUnit()) showAlias(readName());
        else restoreName();
      } catch (e) {}
    }
    if (message.on === on && message.poll === pollMs && nextLog === log) return;
    on = message.on;
    pollMs = message.poll;
    if (nextLog !== log) announced = false;
    log = nextLog;
    if (!log) logged = new Map();
    generation++;
    tick();
  };
  context.DLFOnDebuffConfig = onConfig;

  context.DLFDebuffStop = () => {
    stopped = true;
    generation++;
    if (context.DLFOnDebuffConfig === onConfig) context.DLFOnDebuffConfig = null;
    if (valid(relay)) {
      relay.SetAttributeString(RELAY_ATTR, "");
      relay.DeleteAsync(0);
    }
    relay = null;
    restoreName();
    if (valid(realLabel)) realLabel.DeleteAsync(0);
    realLabel = null;
  };

  tick();
})();
