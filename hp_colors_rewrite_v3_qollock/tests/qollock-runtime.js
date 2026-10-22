'use strict';
// Boots the composed QOLLOCK pak02 layouts (ticket 22b). Two QOLLOCK runtimes:
// - pinned: the real QOLLOCK Escape-menu scripts from a verified decompile of the pinned pak03
//   (HPV3_QOLLOCK_ROOT from the build, otherwise decompiled on demand into .build/pin);
// - model: tests/fixtures/qollock-window-model.js stands in for ui/window.js when the pak03 is absent.
// HPV3_QOLLOCK_REQUIRED=1 (QOLLOCK builds) turns a missing pinned runtime into a failure.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
// The canonical v3 test seams (HPV3_SOURCE_ROOT selects the staged v3 tree); this lane only consumes them.
const v3Tests = path.resolve(__dirname, '../../hp_colors_rewrite_v3/tests');
const { loadLayout, sourceRoot } = require(path.join(v3Tests, 'boot-layout'));
const qollock = require('../tools/qollock');
const laneRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(laneRoot, '..');
const MODEL = path.join(__dirname, 'fixtures/qollock-window-model.js');
const VIEWERS = ['.tmp/vrf-cli-19.2/Source2Viewer-CLI.exe', '.tmp/source2viewer-cli/Source2Viewer-CLI.exe'].map(file => path.join(repoRoot, file));
// HPV3_QOLLOCK_SOURCE_ROOT selects the staged lane tree (transformed bridge) in builds.
const qollockRoot = path.resolve(process.env.HPV3_QOLLOCK_SOURCE_ROOT || laneRoot);

// Skip only when the pinned pak03 is absent. With the pak03 present the pinned runtime is required:
// a verified cache or a working Source2Viewer-CLI, otherwise an actionable error (audit 22b P2).
function resolvePinned(deps = {}) {
  const env = deps.env || process.env;
  if (env.HPV3_QOLLOCK_ROOT) {
    const root = path.resolve(env.HPV3_QOLLOCK_ROOT);
    qollock.verify(root, laneRoot);
    return { name: 'pinned', root };
  }
  const { pin } = qollock.readPin(laneRoot);
  const pak = deps.pak || path.resolve(repoRoot, pin.pak03.path), viewers = deps.viewers || VIEWERS;
  const cacheRoot = deps.cacheRoot || path.join(laneRoot, '.build/pin');
  if (!fs.existsSync(pak)) {
    const reason = 'pinned QOLLOCK pak03 absent (' + pin.pak03.path + ')';
    if (env.HPV3_QOLLOCK_REQUIRED === '1') throw new Error('QOLLOCK build requires the pinned runtime: ' + reason);
    return { name: 'pinned', root: null, reason };
  }
  const hash = crypto.createHash('sha256').update(fs.readFileSync(pak)).digest('hex');
  if (hash !== pin.pak03.sha256) throw new Error('Pinned QOLLOCK pak03 drifted: expected=' + pin.pak03.sha256 + ' actual=' + hash + ' (' + pak + ')');
  const target = path.join(cacheRoot, hash.slice(0, 16));
  if (!fs.existsSync(path.join(target, '.verified'))) {
    const viewer = viewers.find(file => fs.existsSync(file));
    const fix = '; install Source2Viewer-CLI 19.2 at ' + VIEWERS[0] + ' (or set HPV3_QOLLOCK_ROOT to a decompile of ' + pak + ')';
    if (!viewer) throw new Error('Pinned QOLLOCK pak03 is present but Source2Viewer-CLI was not found' + fix);
    const scratch = target + '.' + process.pid;
    fs.rmSync(scratch, { recursive: true, force: true });
    const run = spawnSync(viewer, ['-i', pak, '-o', scratch, '-d'], { stdio: 'ignore', timeout: 120000 });
    if (run.status !== 0) {
      fs.rmSync(scratch, { recursive: true, force: true });
      throw new Error('Pinned QOLLOCK pak03 decompile failed (' + viewer + ': ' + (run.error ? run.error.message : 'exit ' + run.status) + ')' + fix);
    }
    qollock.verify(scratch, laneRoot);
    fs.writeFileSync(path.join(scratch, '.verified'), hash);
    try { fs.renameSync(scratch, target); } catch (error) { fs.rmSync(scratch, { recursive: true, force: true }); }
  }
  qollock.verify(target, laneRoot);
  return { name: 'pinned', root: target };
}
let pinned;
function pinnedRuntime() { return pinned || (pinned = resolvePinned()); }
const runtimes = () => [{ name: 'model', root: null }, pinnedRuntime()];
const skipOf = runtime => runtime.root === null && runtime.name === 'pinned' ? runtime.reason : false;

// v3 scripts come from the (staged) v3 tree, the layouts and window bridge from this lane, QOLLOCK's own scripts
// from the pinned decompile; without it only ui/window.js is modelled and the rest is skipped.
function resolver(runtime) {
  return relative => {
    const variant = path.join(qollockRoot, relative);
    if (fs.existsSync(variant)) return variant;
    if (/^panorama\/scripts\/hp_colors_v3_[a-z0-9_]+\.js$/.test(relative)) return path.join(sourceRoot, relative);
    if (runtime.root) return path.join(runtime.root, relative);
    return relative === 'panorama/scripts/ui/window.js' ? MODEL : null;
  };
}

function bootLayout(relative, runtime, options = {}) {
  const boot = loadLayout(relative, { ...options, sourceRoot: qollockRoot, resolveScript: resolver(runtime) });
  const h = boot.harness, release = h.$.Msg, debug = process.env.HPV3_DEBUG === '1';
  // QOLLOCK logs through $.Msg with a [QOL prefix; v3 release scripts still may not log at all.
  h.$.Msg = message => { if (/^\[QOL/.test(String(message))) { if (debug) h.logs.push(String(message)); return; } release(message); };
  // Panorama delivers unhandled events (CitadelResumePlaying) to every registered listener.
  const dispatch = h.$.DispatchEvent;
  h.$.DispatchEvent = (...args) => {
    const result = dispatch(...args);
    if (args[0] === 'CitadelResumePlaying') for (const entry of [...h.handlerEntries]) if (entry.channel === 'CitadelResumePlaying' && !entry.panel) entry.fn();
    return result;
  };
  return boot;
}

module.exports = { runtimes, pinnedRuntime, resolvePinned, skipOf, bootLayout, qollockRoot, laneRoot, v3Tests, MODEL };
