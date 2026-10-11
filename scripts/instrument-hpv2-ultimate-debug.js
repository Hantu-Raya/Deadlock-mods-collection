"use strict";

const fs = require("node:fs");
const seam = "  // World contexts own one listener (the renderer's), which routes pickup,";
const publishSeam = "        lastUltimatePlayers = Object.create(null);";
const diagnostic = String.raw`
  // Opt-in build-only observer: no new schedules, protocol or panel writes.
  var ultimateDebugLast = Object.create(null);
  var ultimateDebugCount = 0;
  var ultimateDebugLimited = false;
  var ultimateDebugSlot = -1;
  var ultimateDebugPublishedPlayers = [];
  function ultimateDebugEmit(lane, signature, record) {
    var now = Date.now();
    var previous = ultimateDebugLast[lane];
    if (previous && previous.signature === signature && now >= previous.at && now - previous.at < 30000) return;
    ultimateDebugLast[lane] = { signature: signature, at: now };
    if (ultimateDebugCount >= 240) {
      if (!ultimateDebugLimited) {
        ultimateDebugLimited = true;
        $.Msg('[HPV2ULTDBG] ' + JSON.stringify({ 'build': 'qollock-2.2.6-ultdebug-r4', 'lane': lane, 'reason': 'log_limit' }));
      }
      return;
    }
    ultimateDebugCount++;
    record['build'] = 'qollock-2.2.6-ultdebug-r4';
    record['lane'] = lane;
    $.Msg('[HPV2ULTDBG] ' + JSON.stringify(record));
  }
  function ultimateDebugWorld(message, previousAt, rawRejected) {
    var now = Date.now();
    var name = valid(namePanel) ? readName(namePanel) : '';
    var accepted = message && !rawRejected && !stopped && valid(context) && playerUnit === true ?
      validUltimates(message, now, sessionStartedAt, previousAt) : false;
    var entry = null;
    var slot = -1;
    var via = null;
    if (accepted) {
      slot = name !== localPlayerName ? ultimateEntryIndex(message.players, name) : -1;
      if (slot >= 0) {
        entry = message.players[slot];
        via = entry[0] === name ? 'player' : 'hero';
      }
      ultimateDebugSlot = slot;
    }
    var enabled = !!config && config.enabled !== false && config.ultimateTimerEnabled !== false;
    var hero = context.BAscendantHasClass('CLASS_PLAYER');
    var local = context.BAscendantHasClass('LocalPlayer') || !!name && name === localPlayerName;
    var readyPresent = valid(ultimateReady);
    var nativeReady = readyPresent ? ultimateReady.BAscendantHasClass('has_ultimate') :
      context.BAscendantHasClass('has_ultimate');
    var overlayVisible = valid(ultimateOverlay) && ultimateOverlay.style['visibility'] === 'visible';
    var reason = rawRejected ? 'rejected_snapshot' : stopped ? 'stopped' :
      !enabled ? 'off' : !hero ? 'nonhero' : worldWakeHook && !worldAwake ? 'sleeping' : local ? 'local' :
      message && !accepted ? 'rejected_snapshot' :
      message && !name ? 'missing_name' : message && !entry ? 'no_match' :
      entry && entry[1] === 360 ? 'snapshot_ready' :
      nativeReady ? 'native_ready' :
      !valid(ultimateBackground) ? 'missing_background' : !readyPresent ? 'missing_ready_panel' :
      ultimateAt > 0 && now - ultimateAt >= 12000 ? 'expired' :
      overlayVisible ? 'cooldown' : ultimateModel ? 'cooldown_not_visible' : 'stock_no_model';
    var age = message && typeof message.at === 'number' && isFinite(message.at) ? now - message.at :
      ultimateAt ? now - ultimateAt : null;
    var record = {
      'reason': reason, 'slot': accepted ? slot : ultimateDebugSlot, 'session': sessionStartedAt,
      'rawRejected': !!rawRejected,
      'enabled': enabled, 'player': playerUnit === true, 'awake': !worldWakeHook || worldAwake,
      'hero': hero,
      'local': local, 'nativeReady': nativeReady, 'readyPresent': readyPresent,
      'nativeVisible': readyPresent ? ultimateReady.visible === true : null,
      'overlayVisible': overlayVisible, 'namePresent': !!name,
      'snapshotAgeMs': age === null ? null : Math.max(-1, Math.min(12000, age)),
      'epochMatch': message ? message.since === sessionStartedAt : null,
      'angle': entry ? entry[1] : ultimateAngle,
      'rate': entry ? entry[2] : ultimateModel ? ultimateModel.rate : null,
      'via': via
    };
    var signature = JSON.stringify([reason, record['slot'], sessionStartedAt, enabled,
      record['player'], record['awake'], local, nativeReady, readyPresent,
      record['nativeVisible'], overlayVisible, record['namePresent'], !!rawRejected, name]);
    ultimateDebugEmit('world', signature, record);
  }
  function ultimateDebugHud() {
    var players = [];
    var states = [];
    for (var index = 0; index < ultimateDebugPublishedPlayers.length; index++) {
      var entry = ultimateDebugPublishedPlayers[index];
      players.push({ 'slot': index, 'angle': entry[1], 'rate': entry[2], 'alias': !!entry[3] });
      states.push([entry[0], entry[1] === 360 ? 'ready' : 'cooldown']);
    }
    var enabled = !!config && config.enabled !== false && config.ultimateTimerEnabled !== false;
    var record = { 'reason': enabled ? 'published' : 'off', 'session': sessionStartedAt,
      'sentAt': lastUltimateSentAt, 'enabled': enabled, 'rows': rows.length, 'players': players };
    ultimateDebugEmit('hud', JSON.stringify([enabled, sessionStartedAt, rows.length, states]), record);
  }
  var ultimateDebugReceive = receiveSnapshot;
  receiveSnapshot = function (raw) {
    var previousAt = ultimateAt;
    try { return ultimateDebugReceive.apply(this, arguments); }
    finally {
      try {
        if (!topBar && typeof raw === 'string' && raw.slice(0, 4096).indexOf('HPV2_ULTIMATE_SNAPSHOT') !== -1) {
          if (raw.length > 4096) ultimateDebugWorld(null, previousAt, true);
          else {
            var message = JSON.parse(raw);
            if (message && message.magic_word === 'HPV2_ULTIMATE_SNAPSHOT') ultimateDebugWorld(message, previousAt, false);
          }
        }
      } catch {}
    }
  };
  var ultimateDebugTick = tick;
  tick = function () {
    try { return ultimateDebugTick.apply(this, arguments); }
    finally { try { if (!topBar) ultimateDebugWorld(null, ultimateAt); } catch {} }
  };
  var ultimateDebugHudTick = ultimateTick;
  ultimateTick = function () {
    try { return ultimateDebugHudTick.apply(this, arguments); }
    finally { try { ultimateDebugHud(); } catch {} }
  };
`;

function instrumentTimer(source) {
  if (source.includes("[HPV2ULTDBG]") || source.split(seam).length !== 2 ||
      source.split(publishSeam).length !== 2) {
    throw new Error("Ultimate debug injection requires clean pre-boot and publisher seams");
  }
  return source.replace(publishSeam, "        ultimateDebugPublishedPlayers = players;\n" + publishSeam)
    .replace(seam, diagnostic + "\n" + seam);
}
module.exports = { instrumentTimer };
if (require.main === module) {
  const [input, output, extra] = process.argv.slice(2);
  if (!input || !output || extra) throw new Error("Usage: node instrument-hpv2-ultimate-debug.js <clean timer.js> <staged timer.js>");
  fs.writeFileSync(output, instrumentTimer(fs.readFileSync(input, "utf8")), "utf8");
}
