'use strict';
// The one lane table (v3, QOLLOCK, ShowRank) and the per-lane contracts every tool reads: stage paths, the exact
// pak02 asset/forbidden contracts and the generator checks. tools/build.js, doctor.js, vpk-check.js, test.js,
// budgets.js, logscan.js, timing.js, engine-facts.js and ticket.js take lane names, folders, labels and build
// commands from LANES instead of typing them.
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const V3_DIR = 'hp_colors_rewrite_v3';

// One entry per lane. `dir`: the lane folder under the repo; `label`: short name in test output; `ticketLabel`: the
// wording of tools/ticket.js; `sourceDirs`: the lane folders whose panorama/ files the lane ships (variants add
// their own to the canonical v3 sources they package); `composer`: the variant's layout composer under `dir`;
// `build`: the command that builds the lane's release pak.
const lane = (key, dir, label, ticketLabel, sourceDirs, composer) => Object.freeze({
  key, dir, label, ticketLabel, sourceDirs: Object.freeze(sourceDirs), composer,
  build: `node ${V3_DIR}/tools/build.js --project ${key} --skip-deploy`
});
const LANES = Object.freeze({
  v3: lane('v3', V3_DIR, 'v3', 'normal v3', [V3_DIR], null),
  qollock: lane('qollock', V3_DIR + '_qollock', 'QOLLOCK', 'QOLLOCK variant', [V3_DIR, V3_DIR + '_qollock'], 'tools/qollock.js'),
  showrank: lane('showrank', V3_DIR + '_showrank', 'ShowRank', 'ShowRank variant', [V3_DIR, V3_DIR + '_showrank'], 'tools/showrank.js')
});
const PROJECT_NAMES = Object.keys(LANES);
const VARIANT_NAMES = PROJECT_NAMES.filter(name => name !== 'v3');
// `all` is accepted by tools that run every lane.
const isProject = (name, { all = false } = {}) => Object.hasOwn(LANES, name) || (all && name === 'all');

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
  const v3 = path.join(root, V3_DIR);
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
  if (!isProject(name)) throw new Error(`Unknown project '${name}'; expected ${PROJECT_NAMES.join('|')}|all`);
  const L = LANES[name];
  if (name === 'v3') {
    return {
      name, wrapper: L.build,
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
  const laneDir = path.join(root, L.dir);
  const composer = path.join(laneDir, L.composer);
  if (name === 'qollock') {
    return {
      name, wrapper: L.build,
      lane: laneDir, composer, laneLeaf: L.dir,
      buildRoot: path.join(laneDir, '.build'),
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
  return {
    name, wrapper: L.build,
    lane: laneDir, composer, laneLeaf: L.dir,
    buildRoot: path.join(laneDir, '.build'),
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

// Stage layout for one project and mode (same paths as the wrappers).
function stagePaths(config, mode) {
  const stage = path.join(config.buildRoot, mode);
  return {
    stage,
    // The compile tree keeps the canonical name so the outputs match the v3 asset paths.
    stageSource: path.join(stage, V3_DIR),
    stageLane: config.laneLeaf ? path.join(stage, config.laneLeaf) : null,
    compiled: path.join(stage, 'hp_colors_rewrite_v3_compiled'),
    vpk: path.join(stage, 'pak02_dir.vpk'),
    pinned: path.join(stage, 'pin'),
    packedCheck: path.join(stage, 'packed-check')
  };
}

function expandProjects(name) {
  if (name === 'all') return [...PROJECT_NAMES];
  if (!isProject(name)) throw new Error(`Unknown project '${name}'; expected ${PROJECT_NAMES.join('|')}|all`);
  return [name];
}

module.exports = { REPO, V3_DIR, LANES, PROJECT_NAMES, VARIANT_NAMES, isProject, HPV3_ASSETS, BASE_FORBIDDEN, repoPaths, projectConfig, stagePaths, expandProjects };
