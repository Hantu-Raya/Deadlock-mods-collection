'use strict';
// Paths and per-project contracts shared by tools/build.js, tools/doctor.js and tools/vpk-check.js: stage
// paths, the exact pak02 asset/forbidden contracts and the generator checks of the three lanes.
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const PROJECT_NAMES = ['v3', 'qollock', 'showrank'];

// Get-HpV3Assets: the exact canonical v3 pak02 asset contract; variant lanes add their own assets.
const HPV3_ASSETS = Object.freeze([
  'panorama/layout/hud_escape_menu.vxml_c',
  'panorama/layout/unit_status_overlay_v2.vxml_c',
  'panorama/layout/hp_colors_v3_relay.vxml_c',
  'panorama/layout/citadel_hud_top_bar.vxml_c',
  'panorama/layout/citadel_status_effect.vxml_c',
  'panorama/images/hpv3/ultimate_progress.vsvg_c',
  'panorama/scripts/hp_colors_v3_settings.vjs_c',
  'panorama/scripts/hp_colors_v3_world_settings.vjs_c',
  'panorama/scripts/hp_colors_v3_world_boot.vjs_c',
  'panorama/scripts/hp_colors_v3_from_v2.vjs_c',
  'panorama/scripts/hp_colors_v3_codec.vjs_c',
  'panorama/scripts/hp_colors_v3_storage.vjs_c',
  'panorama/scripts/hp_colors_v3_menu.vjs_c',
  'panorama/scripts/hp_colors_v3_preview.vjs_c',
  'panorama/scripts/hp_colors_v3_renderer.vjs_c',
  'panorama/scripts/hp_colors_v3_bridge.vjs_c',
  'panorama/scripts/hp_colors_v3_timers_world.vjs_c',
  'panorama/scripts/hp_colors_v3_timers_hud.vjs_c',
  'panorama/styles/hp_colors_v3_menu.vcss_c',
  'panorama/styles/hp_colors_v3_world.vcss_c',
  'panorama/styles/hp_colors_v3_status.vcss_c',
  'panorama/styles/unit_status_v2.vcss_c'
]);

const BASE_FORBIDDEN = Object.freeze(['.js', '.xml', '.css', 'hp_colors_v2', 'unit_status_v2_colors', 'panorama/scripts/hp_colors_v3_timers.vjs_c']);

function repoPaths(root = REPO) {
  const v3 = path.join(root, 'hp_colors_rewrite_v3');
  const compilerDir = path.join(root, 'sr2compiler');
  return {
    root,
    v3,
    compilerDir,
    compiler: path.join(compilerDir, 'New folder.exe'),
    prefJson: path.join(compilerDir, 'pref.json'),
    // Get-RepoToolPath candidates, in the wrappers' order.
    vpkToolCandidates: [path.join(root, 'vpk cli', 'vpkeditcli.exe'), path.join(root, 'passive_items_mod', 'compiler', 'vpkeditcli.exe')],
    viewerCandidates: [path.join(root, '.tmp', 'vrf-cli-19.2', 'Source2Viewer-CLI.exe'), path.join(root, '.tmp', 'source2viewer-cli', 'Source2Viewer-CLI.exe')],
    showrankRepoVpk: path.join(root, 'showrank_barebones_dir.vpk'),
    tools: {
      gameData: path.join(v3, 'tools', 'game-data.js'),
      generate: path.join(v3, 'tools', 'generate.js'),
      stageScripts: path.join(v3, 'tools', 'stage-scripts.js'),
      suiteCache: path.join(v3, 'tools', 'suite-cache.js')
    },
    record: path.join(v3, 'settings', 'record.json'),
    news: path.join(v3, 'settings', 'news.json'),
    pin: path.join(v3, 'game-data-pin.json')
  };
}

// One entry per lane. `wrapper` is the command that builds the lane's release pak (export name kept for vpk-check).
function projectConfig(name, root = REPO) {
  const p = repoPaths(root);
  if (name === 'v3') {
    return {
      name, wrapper: 'node hp_colors_rewrite_v3/tools/build.js --project v3 --skip-deploy',
      lane: null,
      buildRoot: path.join(p.v3, '.build'),
      assets: [...HPV3_ASSETS],
      forbidden: [...BASE_FORBIDDEN],
      label: 'HPV3 pak02',
      generators: [{ script: p.tools.generate, args: ['--check'], error: 'V3 generation check failed; see pin mismatch/stale-file details above. Run tools/generate.js only after reviewing inputs.' }],
      skipDeployError: 'V3 is build-only. Pass --skip-deploy; deployment is not implemented.',
      complete: (mode, vpk) => `HPV3 ${mode} build complete: ${vpk}`,
      deployMessage: 'Deployment skipped; this wrapper has no game-folder writes.'
    };
  }
  if (name === 'qollock') {
    const lane = path.join(root, 'hp_colors_rewrite_v3_qollock');
    const composer = path.join(lane, 'tools', 'qollock.js');
    return {
      name, wrapper: 'node hp_colors_rewrite_v3/tools/build.js --project qollock --skip-deploy',
      lane, composer, laneLeaf: 'hp_colors_rewrite_v3_qollock',
      buildRoot: path.join(lane, '.build'),
      assets: [...HPV3_ASSETS, 'panorama/scripts/hp_colors_v3_qollock_bridge.vjs_c'],
      forbidden: [...BASE_FORBIDDEN, 'panorama/layout/hud.vxml_c', 'ql_', 'qollock_hp_colors_bridge'],
      label: 'HPV3 QOLLOCK pak02',
      generators: [
        { script: p.tools.generate, args: ['--check'], error: 'V3 generation check failed; run hp_colors_rewrite_v3/tools/generate.js after reviewing inputs.' },
        { script: composer, args: ['--check'], error: 'QOLLOCK layouts are stale; run hp_colors_rewrite_v3_qollock/tools/qollock.js after reviewing the v3 menu change.' }
      ],
      skipDeployError: 'The v3 QOLLOCK variant is build-only. Pass --skip-deploy; deployment is not implemented.',
      complete: (mode, vpk) => `HPV3 QOLLOCK ${mode} build complete: ${vpk}`,
      deployMessage: 'Deployment skipped; never install this pak02 over a non-QOLLOCK pak03.'
    };
  }
  if (name === 'showrank') {
    const lane = path.join(root, 'hp_colors_rewrite_v3_showrank');
    const composer = path.join(lane, 'tools', 'showrank.js');
    return {
      name, wrapper: 'node hp_colors_rewrite_v3/tools/build.js --project showrank --skip-deploy',
      lane, composer, laneLeaf: 'hp_colors_rewrite_v3_showrank',
      buildRoot: path.join(lane, '.build'),
      // ShowRank adds no asset to pak02: its script, styles and other layouts stay in pak89.
      assets: [...HPV3_ASSETS],
      forbidden: [...BASE_FORBIDDEN, 'showrank_barebones'],
      label: 'HPV3 ShowRank pak02',
      generators: [
        { script: p.tools.generate, args: ['--check'], error: 'V3 generation check failed; run hp_colors_rewrite_v3/tools/generate.js after reviewing inputs.' },
        { script: composer, args: ['--check'], error: 'ShowRank layouts are stale; run hp_colors_rewrite_v3_showrank/tools/showrank.js after reviewing the v3 menu or ShowRank layout change.' }
      ],
      showrankScript: 'panorama/scripts/showrank_barebones.vjs_c',
      skipDeployError: 'The v3 ShowRank variant is build-only. Pass --skip-deploy; deployment is not implemented.',
      complete: (mode, vpk) => `HPV3 ShowRank ${mode} build complete: ${vpk}`,
      deployMessage: 'Deployment skipped; this wrapper has no game-folder writes. Install ShowRank barebones as pak89 and this build as pak02.'
    };
  }
  throw new Error(`Unknown project '${name}'; expected ${PROJECT_NAMES.join('|')}|all`);
}

// Stage layout for one project and mode (same paths as the wrappers).
function stagePaths(config, mode) {
  const stage = path.join(config.buildRoot, mode);
  return {
    stage,
    // The compile tree keeps the canonical name so the outputs match the v3 asset paths.
    stageSource: path.join(stage, 'hp_colors_rewrite_v3'),
    stageLane: config.laneLeaf ? path.join(stage, config.laneLeaf) : null,
    compiled: path.join(stage, 'hp_colors_rewrite_v3_compiled'),
    vpk: path.join(stage, 'pak02_dir.vpk'),
    pinned: path.join(stage, 'pin'),
    packedCheck: path.join(stage, 'packed-check')
  };
}

function expandProjects(name) {
  if (name === 'all') return [...PROJECT_NAMES];
  if (!PROJECT_NAMES.includes(name)) throw new Error(`Unknown project '${name}'; expected ${PROJECT_NAMES.join('|')}|all`);
  return [name];
}

module.exports = { REPO, PROJECT_NAMES, HPV3_ASSETS, BASE_FORBIDDEN, repoPaths, projectConfig, stagePaths, expandProjects };

// Compatibility for tools that still read DEFAULT_STEAM_INF: the discovered install (toolchain.discoverDeadlock,
// resolved lazily on first read), not a hard-coded drive. New code calls discoverDeadlock directly.
let discovered;
Object.defineProperty(module.exports, 'DEFAULT_STEAM_INF', {
  enumerable: true,
  get() {
    if (discovered === undefined) {
      const { discoverDeadlock } = require('./toolchain');
      discovered = discoverDeadlock({ fs: require('node:fs'), env: process.env, spawnSync: require('node:child_process').spawnSync }).steamInf
        // Nothing found: the old wrapper default, which then reads as absent (callers need a path string).
        || 'G:\\SteamLibrary\\steamapps\\common\\Deadlock\\game\\citadel\\steam.inf';
    }
    return discovered;
  }
});
