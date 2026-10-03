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
const timerSource = fs.readFileSync(path.join(repoRoot, "hp_colors_rewrite_v2/panorama/scripts/test_topbar_pickups.js"), "utf8");
const runtimeTimerSource = fs.readFileSync(path.join(sourceRoot, "panorama/scripts/test_topbar_pickups.js"), "utf8");
for (const wrapperName of ["build_hp_colors_rewrite_v2.ps1", "build_hp_colors_rewrite_v2_qollock.ps1"]) {
  const wrapper = fs.readFileSync(path.join(repoRoot, wrapperName), "utf8");
  assert.match(wrapper, /Invoke-HpColorsRewriteClosureAdvanced\b/, wrapperName);
  assert.match(wrapper, /test_event_bridge\.js/, wrapperName + " bridge asset");
  assert.match(wrapper, /test_topbar_pickups\.js/, wrapperName + " timer asset");
  if (wrapperName.includes("qollock"))
    assert.match(wrapper, /\$compatibilityScripts\s*=\s*\$canonicalScripts\s*\+\s*\$timerScripts/,
      wrapperName + " compiles timers with compatibility scripts");
  else
    assert.doesNotMatch(wrapper, /-not\s+\$_\.Source\.Contains\('\\test_'\)/,
      wrapperName + " must not exclude timers from Closure");
}
const closureHelper = fs.readFileSync(path.join(repoRoot, "scripts/hp-colors-rewrite-closure.ps1"), "utf8");
for (const scriptName of ["test_event_bridge.js", "test_topbar_pickups.js"])
  assert.match(closureHelper, new RegExp("'" + scriptName.replace(".", "\\.") + "'\\s*\\{"),
    scriptName + " has a Closure output contract");

// A native world bar needs only its stock ult background until a cooldown is shown.
const findUltimateSource = timerSource.match(/^  function findUltimatePanels\([^]*?^  }/m)[0];
let overlayCreates = 0;
const ultBackground = {
  IsValid: () => true, style: { preTransformScale2d: "1" }, children: {},
  FindChildTraverse(id) { return this.children[id] || null; },
};
const overlaySandbox = {
  context: { FindChildTraverse: id => id === "unit_info_bg" ? ultBackground : null },
  valid: panel => !!panel && panel.IsValid(), ultimateOverlay: null,
  ultimateBackground: null, ultimateBackgroundScale: "1", ultimateStyleCache: {},
  setTimerStyle: () => true,
  $: { CreatePanel: (type, parent, id) => {
    overlayCreates++;
    const panel = { id, type, parent, IsValid: () => true, style: {}, children: {},
      GetParent: () => parent, FindChildTraverse(name) { return this.children[name] || null; },
      AddClass() {}, SetImage() {} };
    parent.children[id] = panel;
    return panel;
  } },
};
vm.createContext(overlaySandbox);
vm.runInContext(findUltimateSource, overlaySandbox);
assert.equal(overlaySandbox.findUltimatePanels(false), true);
assert.equal(overlayCreates, 0, "ready/idle ultimate needs no overlay");
assert.equal(overlaySandbox.findUltimatePanels(true), true);
assert.equal(overlayCreates, 3, "cooldown creates overlay and two artwork panels");
overlaySandbox.findUltimatePanels(true);
assert.equal(overlayCreates, 3, "cooldown reuses the same panels");
let ultimateBackgroundLookups = 0;
Object.assign(overlaySandbox, {
  ultimateTimerEnabled: () => true, validUltimates: () => true,
  sessionStartedAt: 100, ultimateAt: 0, localPlayerName: "LOCAL",
  namePanel: { IsValid: () => true, text: "PLAYER" }, readName: panel => panel.text,
  ultimateReady: { IsValid: () => true, visible: false }, ultimateProgressPending: false,
  clearUltimate: () => assert.fail("valid cooldown must not clear"), paintUltimateProgress() {},
});
overlaySandbox.context.BAscendantHasClass = () => false;
overlaySandbox.context.FindChildTraverse = id => {
  if (id === "unit_info_bg") { ultimateBackgroundLookups++; return ultBackground; }
  return null;
};
vm.runInContext(timerSource.match(/^  function receiveUltimates\([^]*?^  }/m)[0], overlaySandbox);
overlaySandbox.receiveUltimates({ at: 1000, players: [["PLAYER", 90, 6]] }, 1000);
assert.equal(ultimateBackgroundLookups, 1, "cooldown reuses its just-validated background");
assert.equal(overlaySandbox.ultimateModel.angle, 90);
let ultimateClears = 0;
overlaySandbox.clearUltimate = () => { ultimateClears++; overlaySandbox.ultimateName = ""; };
overlaySandbox.receiveUltimates({ at: 2000, players: [["PLAYER", 360, 0]] }, 2000);
assert.equal(ultimateClears, 1, "ready ultimate clears the cooldown without resolving panels");
const replacementBackground = { ...ultBackground, style: { preTransformScale2d: "1" },
  children: { unit_ult_ready_icon: { IsValid: () => true, visible: false } } };
overlaySandbox.context.FindChildTraverse = id => {
  if (id === "unit_info_bg") { ultimateBackgroundLookups++; return replacementBackground; }
  return null;
};
overlaySandbox.receiveUltimates({ at: 3000, players: [["PLAYER", 180, 6]] }, 3000);
assert.equal(ultimateBackgroundLookups, 2, "next snapshot resolves a replacement background once");
assert.equal(overlaySandbox.ultimateOverlay.GetParent(), replacementBackground);
assert.equal(overlayCreates, 6, "replacement background gets its own overlay artwork");
assert.equal(overlaySandbox.ultimateModel.angle, 180);
replacementBackground.children.unit_ult_ready_icon.visible = true;
overlaySandbox.receiveUltimates({ at: 4000, players: [["PLAYER", 180, 6]] }, 4000);
assert.equal(ultimateClears, 2, "native ready icon still blocks a cooldown overlay");
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
let relayWriteFails = false;
const relayPanel = {
  IsValid: () => true, AddClass() {}, BLoadLayout: () => true,
  SetAttributeString: (key, value) => {
    if (relayWriteFails) throw new Error("temporary relay write failure");
    relayRaw = value;
  },
  DeleteAsync() {},
};
vm.runInNewContext(bridgeSource, { $: {
  GetContextPanel: () => relayContext, CreatePanel: () => relayPanel,
  DispatchEvent: () => { relayActivations++; },
  Msg: message => assert.match(message, /temporary relay write failure/),
} });
assert.equal(relayContext.HPV2QueuePickup({ name: "PLAYER", mask: 1 }), true);
assert.equal(relayActivations, 1);
assert.equal(JSON.parse(relayRaw).source, "world_player");
let relayQueueCalls = 0;
const queuePickup = relayContext.HPV2QueuePickup;
relayContext.HPV2QueuePickup = record => { relayQueueCalls++; return queuePickup(record); };
const publishSandbox = {
  context: relayContext, sourceId: "world_player", pickups: [0],
  clipCaptures: [{ progress: { angle: -180, rate: 10, at: 1000 } }],
  lastPublishedName: null, lastPublishedMask: -1, lastPublishedAt: 0,
  lastPublishedProgress: null, progressDirty: true, PICKUP_PREDICT_TOLERANCE: 6,
  Date: { now: () => 1000 },
};
vm.createContext(publishSandbox);
vm.runInContext(["progressPredicted", "publish"].map(name =>
  timerSource.match(new RegExp("^  function " + name + "\\([^]*?^  }", "m"))[0]).join("\n"), publishSandbox);
relayWriteFails = true;
publishSandbox.publish("PLAYER", 1);
assert.deepEqual([publishSandbox.lastPublishedName, publishSandbox.lastPublishedMask,
  publishSandbox.lastPublishedAt, publishSandbox.lastPublishedProgress, publishSandbox.progressDirty],
  [null, -1, 0, null, true], "a failed queue cannot advance publisher dedup state");
relayWriteFails = false;
publishSandbox.publish("PLAYER", 1);
assert.equal(relayQueueCalls, 2, "the identical sample retries immediately after failure");
assert.equal(relayActivations, 2);
assert.equal(publishSandbox.lastPublishedAt, 1000);
assert.equal(publishSandbox.lastPublishedProgress[0].angle, -180);
assert.equal(publishSandbox.progressDirty, false);
publishSandbox.publish("PLAYER", 1);
assert.equal(relayQueueCalls, 2, "only a successful queue suppresses identical samples");
for (const result of [false, undefined, null, 1, "true"]) {
  relayContext.HPV2QueuePickup = () => result;
  publishSandbox.publish("CHANGED", 2);
  assert.equal(publishSandbox.lastPublishedName, "PLAYER", "non-true queue results do not acknowledge");
}
relayContext.HPV2QueuePickup = queuePickup;
relayWriteFails = true;
publishSandbox.publish("", 0);
assert.equal(publishSandbox.lastPublishedName, "PLAYER", "failed clears retain the published identity");
relayWriteFails = false;
publishSandbox.publish("", 0);
assert.equal(publishSandbox.lastPublishedName, "", "failed clears retry immediately");
assert.equal(queuePickup(null), true, "clearing a pickup is also acknowledged");
relayRoot.IsValid = () => false;
assert.equal(queuePickup(null), false, "invalid context cannot queue");
relayRoot.IsValid = () => true;
relayContext.HPV2EventProbeStop();
assert.equal(queuePickup(null), false, "retained stopped callback cannot queue");

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
const snapshot = { magic_word: "HPV2_ULTIMATE_SNAPSHOT", at: 1000, since: 100, players: [["COOLDOWN", 90, 6], ["READY", 360, 0]] };
assert.equal(validUltimates(snapshot, 12999, 100, 900), true);
assert.equal(validUltimates(snapshot, 13000, 100, 900), false);
assert.equal(validUltimates(snapshot, 999, 100, 900), false);
assert.equal(validUltimates(snapshot, 1000, 101, 900), false);
assert.equal(validUltimates(snapshot, 1000, 100, 1001), false);
assert.equal(validUltimates({ ...snapshot, players: [["A", 90, 0], ["A", 360, 0]] }, 1000, 100, 900), false);
assert.equal(validUltimates({ ...snapshot, players: [] }, 1000, 100, 900), true);
for (const rate of [-1, NaN, Infinity, "6", 361, undefined])
  assert.equal(validUltimates({ ...snapshot, players: [["A", 90, rate]] }, 1000, 100, 900), false);
assert.equal(validUltimates({ ...snapshot, players: [["READY", 360, 6]] }, 1000, 100, 900), false);
assert.equal(validUltimates({ ...snapshot, players: [["OLD", 90]] }, 1000, 100, 900), false);
assert.equal(validUltimates({ ...snapshot, players: Array.from({ length: 13 }, (_, n) => ["P" + n, 90, 6]) }, 1000, 100, 900), false);
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

// The actual script (including Closure staging) must quiesce when both features are off,
// restart on configuration, and read each row identity only once per discovery pass.
const scheduled = [];
let timerConfig = { enabled: true, pickupTimersEnabled: false, ultimateTimerEnabled: false };
let configRevision = 1;
let labelReads = 0;
let localLabelReads = 0;
let timerDispatches = 0;
const timerMessages = [];
const rowOwner = {
  paneltype: "CitadelHudTopBarPlayer", IsValid: () => true,
  BHasClass: () => false, FindChildTraverse: id => id === "UltimateStatus" ? timerUltimate : null,
};
const timerUltimate = {
  IsValid: () => true, GetParent: () => rowOwner, FindChildTraverse: () => null,
};
const timerLabel = {
  IsValid: () => true, GetParent: () => rowOwner,
  get text() { labelReads++; return "PLAYER"; },
  BAscendantHasClass: () => false,
};
const localOwner = {
  paneltype: "CitadelHudTopBarPlayer", IsValid: () => true,
  BHasClass: name => name === "LocalPlayer",
};
const localLabel = {
  IsValid: () => true, GetParent: () => localOwner,
  get text() { localLabelReads++; return "LOCAL"; },
};
const timerRoot = {
  id: "TopBar", IsValid: () => true, BHasClass: name => name === "HPV2PickupTopBar",
  BAscendantHasClass: () => false, GetParent: () => null,
  GetAttributeString: () => JSON.stringify({
    magic_word: "HP_COLORS_V2_CONFIG", version: 2, revision: configRevision, values: timerConfig,
  }),
  FindChildrenWithClassTraverse: name => name === "PlayerName" ? [timerLabel, localLabel] : [],
  FindChildTraverse: () => null,
};
let timerListener;
const timerApi = {
  GetContextPanel: () => timerRoot,
  HPColorsV2ContractFactory: { create: () => ({
    normalizeValues: values => ({ ...timerConfig, ...values }),
  }) },
  RegisterForUnhandledEvent: (_name, callback) => { timerListener = callback; return 1; },
  Schedule: (delay, callback) => { scheduled.push({ delay, callback }); },
  DispatchEvent: (_name, raw) => { timerDispatches++; timerMessages.push(JSON.parse(raw)); },
  Msg: message => assert.fail(message),
};
vm.runInNewContext(runtimeTimerSource, { $: timerApi, Date, Math, JSON });
assert.equal(scheduled.length, 0, "disabled timers create no 1s/5s work");
timerConfig = { ...timerConfig, pickupTimersEnabled: true };
configRevision++;
timerListener(timerRoot.GetAttributeString());
assert.equal(scheduled.filter(item => item.delay === 5).length, 1, "config wakes row discovery");
assert.equal(scheduled.filter(item => item.delay === 1).length, 0, "ultimate off creates no 1s work");
const discovery = scheduled.find(item => item.delay === 5);
scheduled.length = 0;
labelReads = 0;
localLabelReads = 0;
discovery.callback();
assert.equal(labelReads, 1, "scan gate and row rendering share row identity");
assert.equal(localLabelReads, 1, "scan gate reuses the sampled local identity");
const beforeUltimateOnly = timerMessages.length;
timerConfig = { ...timerConfig, pickupTimersEnabled: false, ultimateTimerEnabled: true };
configRevision++;
timerListener(timerRoot.GetAttributeString());
assert.equal(scheduled.filter(item => item.delay === 1).length, 1, "ultimate config wakes 1s tick");
assert.ok(timerMessages.slice(beforeUltimateOnly).some(message => message.magic_word === "HPV2_PICKUP_SCAN_GATE" &&
  message.since >= 0 && message.localName === "LOCAL"),
  "ultimate-only discovery still supplies the session token to new world bars");
timerConfig = { ...timerConfig, ultimateTimerEnabled: false };
configRevision++;
timerListener(timerRoot.GetAttributeString());
const stale = scheduled.splice(0);
const beforeStaleDispatch = timerDispatches;
for (const task of stale) task.callback();
assert.equal(scheduled.length, 0, "disabled features do not reschedule old callbacks");
assert.equal(timerDispatches, beforeStaleDispatch, "disabled callbacks do not publish");

// Renderer wake notifications replace the separate 3s classification loop on dormant bars.
let heroActive = false;
let worldWake;
let wakeUnsubscribed = false;
const worldJobs = [];
const worldPanel = {
  id: "", IsValid: () => true, BHasClass: () => false,
  BAscendantHasClass: name => name === "CLASS_PLAYER" && heroActive,
  FindChildTraverse: () => null,
  GetParent: () => null,
  HPV2GetNormalizedConfig: () => ({ enabled: true, pickupTimersEnabled: true,
    pickupSize: 22, ultimateTimerEnabled: false, ultimateTimerSize: 100, ultimateTimerDarkness: 70 }),
  HPV2OnConfigChanged: () => () => {},
  HPV2GetUltimateProgressColor: () => "#FFFFFF",
  HPV2OnWake(callback) { worldWake = callback; callback(false); return () => { wakeUnsubscribed = true; }; },
};
vm.runInNewContext(runtimeTimerSource, { $: {
  GetContextPanel: () => worldPanel,
  Schedule: (delay, callback) => { worldJobs.push({ delay, callback }); },
  Msg: message => assert.fail(message),
}, Date, Math, JSON });
assert.equal(worldJobs.length, 0, "dormant world bar relies on renderer wake, not a second 3s poll");
heroActive = true;
worldWake(true);
assert.equal(worldJobs.filter(job => job.delay === 3).length, 1, "hero transition starts sampling");
heroActive = false;
worldWake(false);
const oldWorldJob = worldJobs.pop();
oldWorldJob.callback();
assert.equal(worldJobs.length, 0, "nonhero transition retires the world timer");
worldPanel.HPV2PickupStop();
assert.equal(wakeUnsubscribed, true, "stopping detaches renderer wake hook");

// Eager config subscriptions must not apply the initial normalized object twice.
let worldConfigSamples = 0;
const worldConfig = worldPanel.HPV2GetNormalizedConfig();
const worldConfigSandbox = {
  context: { HPV2GetNormalizedConfig: () => worldConfig,
    HPV2OnConfigChanged(callback) { assert.equal(callback(worldConfig), true); return () => {}; } },
  config: null, stopped: false, topBar: null, ultimateStylesDirty: false,
  worldWakeHook: false, clipCaptures: [], lastPublishedName: "", ultimateName: "",
  pickupTimersEnabled: () => true, ultimateTimerEnabled: () => false,
  clearUltimate() {}, refreshPlayerUnit: () => true, applyUltimateBaseScale() {},
  sampleUnit: () => { worldConfigSamples++; }, $: { Msg: message => assert.fail(message) },
};
vm.createContext(worldConfigSandbox);
vm.runInContext(["onWorldConfigChanged", "bindWorldConfig"].map(name =>
  timerSource.match(new RegExp("^  function " + name + "\\([^]*?^  }", "m"))[0]).join("\n"), worldConfigSandbox);
worldConfigSandbox.bindWorldConfig();
assert.equal(worldConfigSamples, 1, "eager subscription reuses the initial normalized config");
assert.equal(worldConfigSandbox.onWorldConfigChanged({ ...worldConfig, pickupSize: 30 }), true);
assert.equal(worldConfigSamples, 2, "a different normalized config still resamples");
assert.equal(worldConfigSandbox.onWorldConfigChanged({ ...worldConfig, pickupSize: NaN }), false);
worldConfigSandbox.stopped = true;
assert.equal(worldConfigSandbox.onWorldConfigChanged(worldConfigSandbox.config), false);
assert.equal(worldConfigSamples, 2, "malformed and stopped deliveries do not resample");

// An ambiguous team releases owned HUD styling without resolving the same identity twice.
const menuSource = fs.readFileSync(path.join(repoRoot, "hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_menu.js"), "utf8");
const menuFunctions = ["releaseHudHealthWash", "paintHudHealthWash"]
  .map(name => menuSource.match(new RegExp("^  function " + name + "\\([^]*?^  }", "m"))[0]).join("\n");
let washResolves = 0;
const washSandbox = {
  hydration: { phase: "done" }, HYDRATION_ATTR: "hydration",
  readRootAttribute: () => "done",
  hudHealthWash: { container: {}, released: false, styles: {} },
  resolveHudHealthWash: () => { washResolves++; return true; },
  panelHasClass: () => true,
  clearHudHealthWash: () => {},
};
washSandbox.clearHudHealthWash = () => {
  washSandbox.hudHealthWash.styles = { backgroundImage: null, backgroundColor: null, washColor: null };
};
vm.createContext(washSandbox);
vm.runInContext(menuFunctions, washSandbox);
washSandbox.paintHudHealthWash({ enabled: true, hudHealthColorMode: "team" });
assert.equal(washResolves, 1, "unknown-team release reuses the identity resolved for paint");

const progressSandbox = {
  pauseIntervals: [], rows: [], stopped: false, context: { IsValid: () => true },
  valid: panel => !!panel && panel.IsValid(), readName: panel => panel.text,
  updatePause() {}, rowUnavailable: () => false, render() {},
  $: { Schedule: (delay, callback) => scheduled.push({ delay, callback }), Msg: message => assert.fail(message) },
  Date: { now: () => progressSandbox.now },
  now: 2000, paused: false, progressTickPending: false,
};
const progressSource = ["progressAngle", "paintProgress", "progressTick", "renderProgress"]
  .map(name => timerSource.match(new RegExp("^  function " + name + "\\([^]*?^  }", "m"))[0]).join("\n");
vm.createContext(progressSandbox);
vm.runInContext(progressSource, progressSandbox);
let clipWrites = 0;
const ring = { IsValid: () => true, style: new Proxy({}, {
  set(target, key, value) { if (key === "clip") clipWrites++; target[key] = value; return true; },
}) };
progressSandbox.rows = [{
  label: { text: "PLAYER" }, mask: 1, rings: [ring], progressClips: [],
  progressModels: [{ angle: -180, at: 1000, rate: 10 }],
  progressEnded: [false],
}];
progressSandbox.progressTick();
assert.equal(clipWrites, 1);
scheduled.length = 0;
progressSandbox.pauseIntervals = [{ start: 2000, end: null }];
progressSandbox.now = 3000;
progressSandbox.paused = true;
progressSandbox.progressTick();
assert.equal(clipWrites, 1, "pause does not rewrite frozen clip");
assert.equal(scheduled.length, 0, "pause does not tick a frozen progress model");
progressSandbox.pauseIntervals = [{ start: 2000, end: 3000 }];
progressSandbox.now = 4000;
progressSandbox.paused = false;
progressSandbox.progressTick();
assert.equal(clipWrites, 2, "resumed countdown advances and repaints");
scheduled.length = 0;
progressSandbox.rows[0].progressModels[0] = { angle: -10, at: 1000, rate: 10 };
progressSandbox.rows[0].progressEnded[0] = false;
progressSandbox.now = 10000;
progressSandbox.progressTick();
assert.equal(scheduled.length, 0, "finished countdown does not keep a 1s loop alive");
const finishedWrites = clipWrites;
progressSandbox.rows[0].progressModels[0] = { angle: -90, at: 10000, rate: 0 };
progressSandbox.progressTick();
assert.equal(clipWrites, finishedWrites, "non-advancing model does not rewrite clip");
assert.equal(scheduled.length, 0, "non-advancing model does not tick");
scheduled.length = 0;
const pausedRow = progressSandbox.rows[0];
pausedRow.progressModels[0] = null;
pausedRow.progressClips[0] = null;
progressSandbox.pauseIntervals = [{ start: 10000, end: null }];
progressSandbox.paused = true;
progressSandbox.now = 11000;
const beforePausedModel = clipWrites;
const newlyReceived = { angle: -135, at: 11000, rate: 12 };
progressSandbox.renderProgress(pausedRow, 0, newlyReceived);
assert.equal(clipWrites, beforePausedModel + 1, "a newly received model gets its initial clip while paused");
assert.equal(ring.style.clip, "radial(50% 50%, 0deg, -135deg)");
progressSandbox.progressTick();
assert.equal(clipWrites, beforePausedModel + 1, "pause freezes the newly painted clip");
assert.equal(scheduled.length, 0, "paused model creates no advancing schedule");
colorSettings.ultimateTimerColorMode = "follow";
assert.equal(ultimateProgressColor(180, colorSettings), "#FFFFFF");
console.log("PASS: timer state/codec roundtrips, native progress/colors and freshness, native pickup styling/cache/restore, panel-type discovery and sibling relay.");
