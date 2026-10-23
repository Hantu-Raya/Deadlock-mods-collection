// Observer HUD ability status column, world side: one instance per CitadelStatusEffect list (this
// mod's citadel_status_effect.xml), ported from DLF's dlf_debuff_world.js with its rules. The layout
// also loads for the HUD's own status lists; those sit under CitadelHudRoot and stop at once. A world
// healthbar's list sits in its ClientUIDialogPanel (the overlay root), whose parent is the world panel.
// The unit class (CLASS_PLAYER) lands on the dialog only after the layout loads, and the engine
// recycles world panels between units (spike 2026-10-22), so nothing is decided at boot: a non-hero
// bar re-checks its class with a backoff capped at IDLE_MAX_S, and a hero bar re-checks it on every
// sample (a recycled bar sends one clearing message and goes idle).
// Hero bars scan the direct children of #StatusEffectContainer every pollMs. A status panel's id is
// status_<ability> (status_<ability>/<modifier> when the applying ability entity is gone). Only the
// abilities in dlf/spectator-status.json (RULES) are sent: their debuffs (.isDebuff), their
// non-debuff statuses only when listed as a buff, and a status listed with minStacks (Djinn's Mark)
// only from that many stacks. A panel with the "stunned" class is a stun: its own item. Per ability
// and kind the snapshot carries [key, debuff 0/1, count, end, stun 0/1, hit]: count is the larger of the
// #stacks label and the number of panels, end the predicted expiry (Date.now() ms; 0 = no countdown)
// fitted from three samples of the native radial on #StatusEffectsBorder, hit the bar's hit sequence
// number of the item's last hit (rules with pulse only, else 0): a hit is a status panel that appears
// or whose radial jumps back against its running direction by more than REFRESH_DEG (a refresh).
// Changes, plus a 4 s
// heartbeat while anything is shown, leave through a sibling relay as OH_DEBUFF_SNAPSHOT for
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
  const MAX_KEYS = 8;
  const MAX_COUNT = 99;
  const END_JITTER_MS = 400;
  const FIT_GAP_MS = 450;
  const REFRESH_DEG = 20; // a 1.5 s radial moves 60 deg per 0.25 s sample; whole-degree noise is 1
  const MAX_ALIASES = 24; // $.OHState: at most 24 aliases of at most 24 characters
  const MAX_ALIAS = 24;
  // realLabel takes no space and draws nothing (not collapsed: its text must keep following the variable).
  const HIDDEN_STYLE = { opacity: "0", width: "0px", height: "0px" };
  const KEY = /^[a-z0-9_]{1,64}$/;
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

  // Ids of a stun with no applying ability; the only such stun seen live is the Hyperline knock-off.
  const HYPERLINE_KEY = "citadel_ability_zip_line";
  const NO_ABILITY_STUN_IDS = new Set(["modifier_citadel_knockdown", "MODIFIER_STATE_STUNNED"]);
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

  const valid = (panel) => {
    try {
      return !!panel && panel.IsValid();
    } catch (e) {
      return false;
    }
  };

  // The hero overlay this list belongs to, or null. Cheap: one parent read and one class read (a panel
  // GetParent() just returned is live: no validity call).
  function heroDialog() {
    const parent = context.GetParent();
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
  function predictEnd(key, angle, now, maxSeconds) {
    if (angle === null) {
      fits.delete(key);
      return 0;
    }
    let fit = fits.get(key);
    if (!fit) fits.set(key, (fit = { points: [], end: 0 }));
    const previous = fit.points[fit.points.length - 1];
    if (previous && now - previous.at < FIT_GAP_MS) return fit.end;
    fit.points.push({ angle, at: now });
    if (fit.points.length > 3) fit.points.shift();
    if (fit.points.length < 3) return (fit.end = 0);
    const [a, b, c] = fit.points;
    const span = (c.at - a.at) / 1000;
    const first = (b.at - a.at) / 1000;
    const last = (c.at - b.at) / 1000;
    if (!(first > 0 && last > 0)) return (fit.end = 0);
    const rate = (c.angle - a.angle) / span;
    const firstRate = (b.angle - a.angle) / first;
    const lastRate = (c.angle - b.angle) / last;
    if (!(Math.abs(rate) >= 1 && Math.abs(rate) <= 360) || Math.abs(firstRate - lastRate) > Math.abs(rate) * 0.1 ||
        360 / Math.abs(rate) > maxSeconds * 1.05) {
      return (fit.end = 0);
    }
    const left = rate > 0 ? -c.angle / rate : (360 + c.angle) / -rate;
    const end = Math.round(now + left * 1000);
    if (!(fit.end && Math.abs(end - fit.end) <= END_JITTER_MS)) fit.end = end;
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
      parts = new Map();
      fits = new Map();
      hits = new Map();
      logged = new Map();
      announced = false;
      if (!dialog && inHud()) return -1;
      const delay = idleS;
      idleS = Math.min(idleS * 2, IDLE_MAX_S);
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
      publish("", []);
      if (muted.size) unmuteAll();
      return pollMs / 1000;
    }
    const byKey = new Map();
    const seen = new Map();
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
      let key = id.slice(7).split("/")[0];
      if (stun && NO_ABILITY_STUN_IDS.has(key)) key = HYPERLINE_KEY;
      const rule = KEY.test(key) ? RULES.get(key) : undefined;
      if (!rule || (effect.visible === false && !stun)) continue;
      const debuff = effect.BHasClass("isDebuff");
      if (!stun && !debuff && !rule.buff) continue;
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
        else if (angle !== null && found.angle !== null) {
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
      if (entry.hit) hits.set(slot, ++hitSeq);
      items.push([entry.key, entry.debuff ? 1 : 0, count, predictEnd(slot, entry.angle, now, entry.rule.maxSeconds), entry.stun ? 1 : 0,
        hits.get(slot) || 0]);
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
      context.OHDebuffStop();
      return;
    }
    let delay = IDLE_MAX_S;
    try {
      delay = sample();
    } catch (e) {
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

  // A change restarts the loop at once, so a faster interval or ON applies without waiting.
  function onConfig(raw) {
    if (stopped || typeof raw !== "string" || raw.indexOf("OH_DEBUFF_CONFIG") < 0) return;
    let message = null;
    try {
      message = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!message || message.magic_word !== "OH_DEBUFF_CONFIG" || typeof message.on !== "boolean" ||
        !Number.isInteger(message.poll) || message.poll < MIN_POLL_MS || message.poll > MAX_POLL_MS) return;
    const nextLog = message.log === true;
    // Aliases apply at the next sample; they alone do not restart the loop.
    const nextAliases = parseAliases(message.aliases);
    const nextSig = JSON.stringify([...nextAliases]);
    if (nextSig !== aliasesSig) {
      aliases = nextAliases;
      aliasesSig = nextSig;
    }
    if (message.on === on && message.poll === pollMs && nextLog === log) return;
    on = message.on;
    pollMs = message.poll;
    if (nextLog !== log) announced = false;
    log = nextLog;
    if (!log) logged = new Map();
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
