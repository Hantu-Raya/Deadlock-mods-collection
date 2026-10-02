"use strict";

// Exercise real state, timer arithmetic, and minimal native-panel/relay VM fixtures.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const repoRoot = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(process.argv[2] || path.join(repoRoot, "hp_colors_rewrite_v2"));
const plain = value => JSON.parse(JSON.stringify(value));
let timersContract;

function load(root) {
  const context = { $: {} };
  for (const name of ["hp_colors_v2_contract.js", "hp_colors_v2_state.js"]) {
    const filename = path.join(root, "panorama/scripts", name);
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
    if (name === "hp_colors_v2_contract.js")
      timersContract = context.$.HPColorsV2ContractFactory.create();
  }
  return context.$.HPColorsV2StateFactory;
}
const factory = load(sourceRoot);
const changed = {
  pickupTimersEnabled: false,
  pickupGunColor: "#123456",
  pickupMovementColor: "#ABCDEF",
  pickupSpiritColor: "#654321",
  pickupSurvivalColor: "#FEDCBA",
  pickupBackgroundDarkness: 43,
  pickupGlyphColor: "#345678",
  pickupSize: 36,
  pickupSpacing: 5,
  pickupOffsetX: -37,
  pickupOffsetY: 19,
  ultimateTimerEnabled: false,
  ultimateTimerSize: 125,
  ultimateTimerDarkness: 64,
  ultimateTimerColorMode: "gradient",
  ultimateTimerUnavailableColor: "#224466",
  ultimateTimerAvailableColor: "#88AACC",
};
const keys = Object.keys(changed);
const pickupKeys = keys.filter(key => key.startsWith("pickup"));
const ultimateKeys = keys.filter(key => key.startsWith("ultimate"));
const select = values => Object.fromEntries(keys.map(key => [key, values[key]]));
const editable = view => view.currentScope || view;
const defaults = select(factory.create().read().values);
function send(state, type, payload = {}) {
  const result = state.send({ type, ...payload });
  assert.notEqual(result.outcome.status, "rejected", `${type}: ${result.outcome.code}`);
  return result;
}
function effect(result, type) {
  const found = result.effects.find(item => item.type === type);
  assert.ok(found, `Expected ${type} after ${result.outcome.action}`);
  return found;
}
function editTimers(state) {
  for (const [key, value] of Object.entries(changed)) send(state, "setting_edit", { key, value });
}
function reset(state, resetKeys) {
  const request = send(state, "reset_request", { keys: resetKeys });
  return send(state, "reset_confirm", { token: request.view.transactions.confirmation.token });
}

// Section reset is scoped and undoable, including conditions and live publication.
const state = factory.create();
send(state, "setting_edit", { key: "enemyLow", value: "#112233" });
send(state, "scope_set", { mode: "all", heroes: [] });
editTimers(state);
send(state, "condition_set", { key: "pickupGunColor", slot: 1, minTier: 2, value: "#778899" });
send(state, "condition_set", { key: "ultimateTimerSize", slot: 2, minTier: 1, value: 150 });
send(state, "condition_set", { key: "ultimateTimerColorMode", slot: 2, minTier: 1, value: "fixed" });
send(state, "condition_set", { key: "ultimateTimerAvailableColor", slot: 1, minTier: 2, value: "#DDEE77" });
const beforeReset = plain(state.read());
const saved = send(state, "preset_save", { name: "Timer roundtrip" });
const presetId = saved.view.repository.selectedId;
const savedPreset = plain(saved.view.repository.allRows.find(row => row.id === presetId));
const resetPickup = reset(state, pickupKeys);
for (const key of pickupKeys) assert.equal(editable(resetPickup.view).values[key], defaults[key], key);
for (const key of ultimateKeys) assert.equal(editable(resetPickup.view).values[key], changed[key], key);
assert.equal(editable(resetPickup.view).conditions.pickupGunColor, undefined);
assert.equal(editable(resetPickup.view).conditions.ultimateTimerSize.value, 150);
assert.equal(resetPickup.view.values.enemyLow, "#112233");
assert.deepEqual(plain(resetPickup.view.repository.allRows.find(row => row.id === presetId)), savedPreset);
assert.equal(JSON.parse(effect(resetPickup, "effective_publish").raw).values.pickupGunColor, defaults.pickupGunColor);
const undone = send(state, "undo");
assert.deepEqual(plain(undone.view.currentScope), beforeReset.currentScope);
reset(state, ultimateKeys);
for (const key of ultimateKeys) assert.equal(editable(state.read()).values[key], defaults[key], key);
assert.equal(editable(state.read()).conditions.ultimateTimerSize, undefined);
assert.equal(editable(state.read()).conditions.ultimateTimerColorMode, undefined);
assert.equal(editable(state.read()).conditions.ultimateTimerAvailableColor, undefined);
assert.equal(editable(state.read()).conditions.pickupGunColor.value, "#778899");
send(state, "undo");

// Cancel and stale confirmation cannot silently discard timer edits.
const request = send(state, "reset_request", { keys });
const token = request.view.transactions.confirmation.token;
send(state, "reset_cancel", { token });
assert.equal(state.send({ type: "reset_confirm", token }).outcome.status, "rejected");
assert.deepEqual(select(editable(state.read()).values), changed);

// Update preserves preset identity, apply restores values and session hydration keeps them.
send(state, "setting_edit", { key: "pickupSize", value: 40 });
send(state, "setting_edit", { key: "ultimateTimerColorMode", value: "fixed" });
send(state, "setting_edit", { key: "ultimateTimerUnavailableColor", value: "#BB2244" });
send(state, "setting_edit", { key: "ultimateTimerAvailableColor", value: "#44CCEE" });
const updated = send(state, "preset_save", { name: "Updated timers" });
assert.equal(updated.view.repository.selectedId, presetId);
assert.equal(updated.view.repository.allRows.filter(row => row.kind === "user").length, 1);
reset(state, keys);
const applied = send(state, "preset_apply", { id: presetId });
const expected = {
  ...changed, pickupSize: 40, ultimateTimerColorMode: "fixed",
  ultimateTimerUnavailableColor: "#BB2244", ultimateTimerAvailableColor: "#44CCEE",
};
assert.deepEqual(select(editable(applied.view).values), expected);
assert.equal(JSON.parse(effect(applied, "effective_publish").raw).values.pickupSize, 40);
const restored = factory.create({ sessionRaw: effect(applied, "session_replace").raw });
assert.deepEqual(select(editable(restored.read()).values), expected);
assert.deepEqual(plain(editable(restored.read()).conditions), savedPreset.conditions);

// HPCRP1 transfers all timer values and conditions; edits never mutate saved records.
const code = effect(send(state, "preset_copy_selected"), "clipboard_write").text;
const destination = factory.create();
const imported = send(destination, "preset_import", { raw: code });
const importedId = imported.view.repository.selectedId;
send(destination, "preset_apply", { id: importedId });
assert.deepEqual(select(editable(destination.read()).values), expected);
assert.deepEqual(plain(editable(destination.read()).conditions), savedPreset.conditions);
send(destination, "hero_mode", { mode: "manual" });
send(destination, "hero_manual", { heroKey: "hero_haze" });
const conditional = send(destination, "ability_observe", { epoch: destination.read().identity.epoch, tiers: [2, 1, -1, -1] });
assert.equal(conditional.view.effectiveValues.pickupGunColor, "#778899");
assert.equal(conditional.view.effectiveValues.ultimateTimerSize, 150);
assert.equal(JSON.parse(effect(conditional, "effective_publish").raw).values.ultimateTimerSize, 150);
assert.equal(conditional.view.effectiveValues.ultimateTimerColorMode, "fixed");
assert.equal(conditional.view.effectiveValues.ultimateTimerAvailableColor, "#DDEE77");
const invalidBefore = destination.read();
assert.equal(destination.send({ type: "setting_edit", key: "pickupGunColor", value: "not-a-color" }).outcome.status, "rejected");
assert.equal(destination.send({ type: "setting_edit", key: "pickupSize", value: Infinity }).outcome.status, "rejected");
assert.equal(destination.send({ type: "setting_edit", key: "ultimateTimerColorMode", value: "unknown" }).outcome.status, "rejected");
assert.equal(destination.send({ type: "setting_edit", key: "ultimateTimerAvailableColor", value: "not-a-color" }).outcome.status, "rejected");
assert.equal(destination.read(), invalidBefore);
const malformed = JSON.parse(code.slice(6));
malformed.records[0].hpv2.values.find(pair => pair[1] === changed.pickupGunColor)[1] = "not-a-color";
assert.equal(destination.send({ type: "preset_import", raw: "HPCRP1" + JSON.stringify(malformed) }).outcome.status, "rejected");
assert.equal(destination.read(), invalidBefore);

// Existing code formats and existing extension slots stay compatible.
// Captured from the canonical runtime before timer extension slots were appended.
const legacyCode = 'HPCRP1{"records":[{"id":"user_0001","kind":"user","name":"Existing preset","mode":"all","heroes":[],"values":[[8,"#FD4949"],[20,"#FFEFD7"],[21,"#FFEFD7"],[22,"#FFEFD7"],[32,-30],[33,434],[63,true]],"conditions":null,"hpv2":{"v":1,"values":[[0,170],[8,-72]],"conditions":{}}}],"selectedPresetId":"user_0001"}';
const oldImport = factory.create();
const oldImported = send(oldImport, "preset_import", { raw: legacyCode });
send(oldImport, "preset_apply", { id: oldImported.view.repository.selectedId });
assert.deepEqual(select(editable(oldImport.read()).values), defaults);
assert.equal(editable(oldImport.read()).values.staminaWidth, 170);
assert.equal(editable(oldImport.read()).values.ultOffsetX, -72);
assert.equal(editable(oldImport.read()).values.enemyKillMarkerEnabled, true);
const oldSettings = 'HPCR2{"v":[[8,"#FD4949"],[20,"#FFEFD7"],[21,"#FFEFD7"],[22,"#FFEFD7"],[32,-30],[33,434],[63,true]],"c":{}}';
const beforeLegacyImport = plain(editable(destination.read()));
send(destination, "settings_import", { raw: oldSettings });
assert.deepEqual(select(editable(destination.read()).values), select(beforeLegacyImport.values));
assert.deepEqual(plain(editable(destination.read()).conditions), beforeLegacyImport.conditions);
const unchanged = factory.create();
const unchangedPayload = JSON.parse(
  effect(send(unchanged, "settings_copy"), "clipboard_write").text.slice(5),
);
// Fresh defaults must be explicit against the frozen wire baseline.
assert.deepEqual(unchangedPayload.hpv2, {
  v: 2,
  values: plain(timersContract.extensionKeys
    .map((key, index) => [index, timersContract.defaults[key]])
    .filter(([index, value]) => value !== undefined &&
      Object.prototype.hasOwnProperty.call(timersContract.defaults, timersContract.extensionKeys[index]) &&
      value !== timersContract.codecDefaults[timersContract.extensionKeys[index]])),
  conditions: {},
});
const freshRoundtrip = factory.create();
send(freshRoundtrip, "settings_import", { raw: "HPCR2" + JSON.stringify(unchangedPayload) });
assert.deepEqual(plain(freshRoundtrip.read().values), plain(unchanged.read().values));
const bakedCode = effect(send(unchanged, "preset_copy_all"), "clipboard_write").text;
send(factory.create(), "preset_import", { raw: bakedCode });

// Native timer arithmetic and identity/freshness boundaries remain the real functions.
const timerSource = fs.readFileSync(path.join(sourceRoot, "panorama/scripts/test_topbar_pickups.js"), "utf8");
function pure(name) {
  const match = timerSource.match(new RegExp("^  function " + name + "\\([^]*?^  }", "m"));
  assert.ok(match, `Missing timer function ${name}`);
  return new Function("return (" + match[0] + ");")();
}

// Native pickup ownership uses the existing sample cadence and exact inline baselines.
const nativeFunctions = [
  "setCachedStyle", "pickupColor", "pickupBackground", "setNativePickupStyle",
  "restoreNativePickupStyles", "styleNativePickup", "sampleUnitPickups", "sampleUnit",
  "findRows",
].map(name => {
  const match = timerSource.match(new RegExp("^  function " + name + "\\([^]*?^  }", "m"));
  assert.ok(match, `Missing native timer function ${name}`);
  return match[0];
}).join("\n");
let nativeWrites = 0;
function nativePanel(styles = {}) {
  const baseline = { ...styles };
  return {
    baseline,
    style: new Proxy({ ...styles }, {
      set(target, key, value) { nativeWrites++; target[key] = value; return true; },
    }),
    IsValid: () => true,
  };
}
const nativeInner = nativePanel({ washColor: "#135724" });
const nativeBorder = nativePanel({ washColor: "#AAAAAA", clip: "radial(50% 50%, 0deg, -180deg)" });
const nativeGlyph = nativePanel({ washColor: "#BBBBBB" });
const nativeImage = nativePanel({ washColor: "#CCCCCC" });
const nativeIcon = nativePanel({
  width: "30px", height: "31px", margin: "1px", transform: "translateX(2px)",
});
nativeIcon.visible = true;
nativeIcon.FindChildTraverse = id => ({
  StatusEffectInner: nativeInner, StatusEffectsBorder: nativeBorder, StatusEffectImage: nativeImage,
})[id];
nativeIcon.FindChildrenWithClassTraverse = () => [nativeGlyph];
let nativePresent = true;
const nativeContainer = {
  IsValid: () => true,
  FindChildrenWithClassTraverse: name => nativePresent && name === "gunpower_pickup" ? [nativeIcon] : [],
};
const nativeEffects = { IsValid: () => true, FindChildTraverse: () => nativeContainer };
const nativeName = { IsValid: () => true, text: "PLAYER" };
const nativeContext = {
  id: "world_player", IsValid: () => true, BHasClass: () => true,
  FindChildTraverse: id => id === "name" ? nativeName : nativeEffects,
};
const nativeSandbox = {
  config: {
    enabled: true, pickupTimersEnabled: true, pickupSize: 40, pickupSpacing: 3,
    pickupOffsetX: 4, pickupOffsetY: -5, pickupGunColor: "#80A0C0",
    pickupBackgroundDarkness: 50, pickupGlyphColor: "#FFFFFF",
  },
  context: nativeContext, nativePickupStyles: [], nativePickupSeen: [],
  pickups: [{ className: "gunpower_pickup", configKey: "pickupGunColor" }],
  clipCaptures: [], lastPublishedName: null, sourceId: "", namePanel: null,
  effectsPanel: null, statusContainer: null, scanEnabled: true, gateReceivedAt: 0,
  localPlayerName: "", valid: panel => !!panel && panel.IsValid(),
  readName: panel => panel.text, pickupTimersEnabled() {
    return this.config.enabled && this.config.pickupTimersEnabled;
  },
  captureNativeClip() {}, publish() {}, rows: [], localPlayerLabels: [],
  render() {},
};
// VM globals, rather than method receivers, match Panorama's helper invocation.
nativeSandbox.pickupTimersEnabled = () => nativeSandbox.config.enabled && nativeSandbox.config.pickupTimersEnabled;
vm.createContext(nativeSandbox);
vm.runInContext(nativeFunctions, nativeSandbox);
nativeSandbox.sampleUnit();
assert.equal(nativeIcon.style.width, "40px");
assert.equal(nativeIcon.style.margin, "0px 3px");
assert.equal(nativeIcon.style.transform, "translateX(4px) translateY(-5px)");
assert.equal(nativeInner.style.washColor, "#405060");
assert.equal(nativeBorder.style.washColor, "#80A0C0");
assert.equal(nativeGlyph.style.washColor, "#FFFFFF");
assert.equal(nativeImage.style.washColor, "#FFFFFF");
assert.equal(nativeBorder.style.clip, nativeBorder.baseline.clip);
const stableWrites = nativeWrites;
nativeSandbox.sampleUnit();
assert.equal(nativeWrites, stableWrites, "unchanged samples perform no native writes");
function assertNativeRestored() {
  for (const panel of [nativeIcon, nativeInner, nativeBorder, nativeGlyph, nativeImage])
    assert.deepEqual({ ...panel.style }, panel.baseline);
  assert.equal(nativeSandbox.nativePickupStyles.length, 0);
}
nativeSandbox.config.pickupTimersEnabled = false;
nativeSandbox.sampleUnit();
assertNativeRestored();
nativeSandbox.config.pickupTimersEnabled = true;
nativeSandbox.sampleUnit();
nativeSandbox.config.enabled = false;
nativeSandbox.sampleUnit();
assertNativeRestored();
nativeSandbox.config.enabled = true;
nativeSandbox.sampleUnit();
nativePresent = false;
nativeSandbox.sampleUnit();
assertNativeRestored();
nativePresent = true;
nativeSandbox.sampleUnit();
nativeSandbox.scanEnabled = false;
nativeSandbox.gateReceivedAt = Date.now();
nativeSandbox.sampleUnit();
assertNativeRestored();
nativeSandbox.scanEnabled = true;
nativeSandbox.localPlayerName = "PLAYER";
nativeSandbox.sampleUnit();
assertNativeRestored();

// Both engine panel-type surfaces discover the unchanged 6726 PlayerName/UltimateStatus IDs.
for (const typeKey of ["paneltype", "type"]) {
  const ultimate = { IsValid: () => true };
  const owner = {
    [typeKey]: "CitadelHudTopBarPlayer", IsValid: () => true,
    BHasClass: () => false, FindChildTraverse: id => id === "UltimateStatus" ? ultimate : null,
  };
  const label = { IsValid: () => true, GetParent: () => owner };
  nativeSandbox.topBar = { FindChildrenWithClassTraverse: () => [label] };
  nativeSandbox.rows = [];
  nativeSandbox.findRows();
  assert.equal(nativeSandbox.rows.length, 1);
  assert.equal(nativeSandbox.rows[0].ultimate, ultimate);
}

// Sibling relay must accept paneltype-only panels just as row discovery does.
const bridgeSource = fs.readFileSync(path.join(sourceRoot, "panorama/scripts/test_event_bridge.js"), "utf8");
const relayRoot = { id: "world_player", paneltype: "Panel", IsValid: () => true };
const relayContext = {
  paneltype: "ClientUIDialogPanel", IsValid: () => true,
  BHasClass: () => false, GetParent: () => relayRoot,
};
let relayRaw = "";
let relayActivations = 0;
const relayPanel = {
  IsValid: () => true, AddClass() {}, BLoadLayout: () => true,
  SetAttributeString: (key, value) => { relayRaw = value; },
};
vm.runInNewContext(bridgeSource, { $: {
  GetContextPanel: () => relayContext, CreatePanel: () => relayPanel,
  DispatchEvent: () => { relayActivations++; }, Msg: message => assert.fail(message),
} });
relayContext.HPV2QueuePickup({ name: "PLAYER", mask: 1 });
assert.equal(relayActivations, 1);
assert.equal(JSON.parse(relayRaw).source, "world_player");

const topbarLayout = fs.readFileSync(path.join(sourceRoot, "panorama/layout/citadel_hud_top_bar.xml"), "utf8");
assert.match(topbarLayout, /classes="gDetailView gShopOpen gScoreboardOpen gStreetBrawl gPVE"/);
assert.match(topbarLayout, /id="MidbossTimerLabel" class="midbossTimerLabel" text="\{s:midboss_timer\}"/);
// Attribute order differs in wrapper-merged (QOLLOCK) topbars.
assert.match(topbarLayout, /<CitadelHudTopBar\b[^>]*\bclass="(?:[^"]* )?HPV2PickupTopBar(?: [^"]*)?"/);
assert.match(topbarLayout, /scripts\/test_topbar_pickups\.vjs_c/);
assert.doesNotMatch(topbarLayout, /citadel_hud_game_announcements/);
// Sparse pickup combinations must split around the ultimate, not by pickup type.
const pickupSlot = pure("pickupSlot");
assert.deepEqual([0, 1, 2, 3].map(index => pickupSlot(15, index)), [-2, -1, 1, 2]);
assert.deepEqual([0, 1, 2, 3].map(index => pickupSlot(9, index)), [-1, 0, 0, 1]);
assert.deepEqual([0, 1, 2, 3].map(index => pickupSlot(7, index)), [-2, -1, 1, 0]);
for (let mask = 0; mask < 16; mask++) {
  const slots = [0, 1, 2, 3].map(index => pickupSlot(mask, index));
  const active = slots.filter(slot => slot !== 0);
  assert.equal(active.length, mask.toString(2).replace(/0/g, "").length);
  assert.equal(new Set(active).size, active.length);
  assert.equal(active.filter(slot => slot < 0).length, Math.ceil(active.length / 2));
  assert.equal(active.filter(slot => slot > 0).length, Math.floor(active.length / 2));
}
const parseUltimateClip = pure("parseUltimateClip");
const validUltimates = pure("validUltimates");
assert.equal(parseUltimateClip("radial(50% 50%, 0deg, 40.588818deg)"), 40.588818);
assert.equal(parseUltimateClip("radial(50% 50%, 0deg, -1deg)"), null);
assert.equal(parseUltimateClip("radial(50% 50%, 0deg, 361deg)"), null);
const snapshot = { magic_word: "HPV2_ULTIMATE_SNAPSHOT", at: 1000, since: 100, players: [["COOLDOWN", 90], ["READY", 360]] };
assert.equal(validUltimates(snapshot, 4999, 100, 900), true);
assert.equal(validUltimates(snapshot, 5000, 100, 900), false);
assert.equal(validUltimates(snapshot, 999, 100, 900), false);
assert.equal(validUltimates(snapshot, 1000, 101, 900), false);
assert.equal(validUltimates(snapshot, 1000, 100, 1001), false);
assert.equal(validUltimates({ ...snapshot, players: [["A", 90], ["A", 360]] }, 1000, 100, 900), false);
assert.equal(validUltimates({ ...snapshot, players: [] }, 1000, 100, 900), true);
const fit = pure("fitProgress");
assert.equal(fit({ angle: -300, at: 1000 }, { angle: -270, at: 4000 }, { angle: -240, at: 7000 }).rate, 10);
assert.equal(fit({ angle: -300, at: 1000 }, { angle: -270, at: 4000 }, { angle: -350, at: 7000 }).rate, 0);
const angle = pure("progressAngle");
assert.equal(angle({ angle: -300, rate: 10, at: 1000 }, 6000, [{ start: 2000, end: 4000 }]), -270);
assert.equal(angle({ angle: -10, rate: 10, at: 1000 }, 6000, []), 0);

// The renderer is Closure-compiled in staging; exercise its authored pure color math.
const rendererSource = fs.readFileSync(path.join(repoRoot, "hp_colors_rewrite_v2/panorama/scripts/unit_status_v2_colors.js"), "utf8");
const colorFunctions = ["interpolateHex", "ultimateProgressColor"].map(name => {
  const match = rendererSource.match(new RegExp("^  function " + name + "\\([^]*?^  }", "m"));
  assert.ok(match, `Missing renderer function ${name}`);
  return match[0];
}).join("\n");
const ultimateProgressColor = new Function(colorFunctions + "\nreturn ultimateProgressColor;")();
const colorSettings = {
  ultimateTimerColorMode: "fixed",
  ultimateTimerUnavailableColor: "#204060",
  ultimateTimerAvailableColor: "#E080A0",
};
assert.equal(ultimateProgressColor(0, colorSettings), "#204060");
assert.equal(ultimateProgressColor(359.999, colorSettings), "#204060");
assert.equal(ultimateProgressColor(360, colorSettings), "#E080A0");
colorSettings.ultimateTimerColorMode = "gradient";
assert.equal(ultimateProgressColor(0, colorSettings).toUpperCase(), "#204060");
assert.equal(ultimateProgressColor(180, colorSettings).toUpperCase(), "#806080");
assert.equal(ultimateProgressColor(360, colorSettings).toUpperCase(), "#E080A0");
colorSettings.ultimateTimerColorMode = "follow";
assert.equal(ultimateProgressColor(180, colorSettings), "#FFFFFF");
console.log("PASS: timer state/codec roundtrips, native progress/colors and freshness, native pickup styling/cache/restore, panel-type discovery and sibling relay.");
