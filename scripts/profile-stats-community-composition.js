'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RUNTIME_PLACEHOLDER = '        /* PROFILE_STATS_COMMUNITY_RUNTIME: profile_stats_community/panorama/scripts/profile_stats_community.js */';
const STYLE_PLACEHOLDER = '/* PROFILE_STATS_COMMUNITY_STYLES: profile_stats_community/panorama/styles/profile_stats_community.css */';
const IDENTITY_POLICY_PLACEHOLDER = '    /* VIEWED_PROFILE_IDENTITY_POLICY: scripts/viewed-profile-identity-policy.js */';

function normalizeLf(source) {
  return source.replace(/\r\n?/g, '\n');
}

function assertText(name, source) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error(`${name} must be non-empty text`);
  }
  if (source.charCodeAt(0) === 0xfeff) {
    throw new Error(`${name} must be UTF-8 without a byte-order mark`);
  }
}

function composeText(template, fragment, placeholder, label) {
  assertText(`${label} template`, template);
  assertText(`${label} fragment`, fragment);
  const newline = template.includes('\r\n') ? '\r\n' : '\n';
  const normalizedTemplate = normalizeLf(template);
  const normalizedFragment = normalizeLf(fragment);
  const normalizedPlaceholder = normalizeLf(placeholder);
  const first = normalizedTemplate.indexOf(normalizedPlaceholder);
  const second = first < 0 ? -1 : normalizedTemplate.indexOf(normalizedPlaceholder, first + normalizedPlaceholder.length);

  if (first < 0 || second >= 0) {
    throw new Error(`${label} template must contain its placeholder exactly once`);
  }
  if (normalizedFragment.includes(normalizedPlaceholder)) {
    throw new Error(`${label} fragment must not contain its host placeholder`);
  }

  const fragmentWithoutFinalNewline = normalizedFragment.endsWith('\n')
    ? normalizedFragment.slice(0, -1)
    : normalizedFragment;
  const composed = normalizedTemplate.slice(0, first)
    + fragmentWithoutFinalNewline
    + normalizedTemplate.slice(first + normalizedPlaceholder.length);

  if (composed.includes(normalizedPlaceholder)) {
    throw new Error(`${label} composition left an unresolved placeholder`);
  }
  return newline === '\r\n' ? composed.replace(/\n/g, '\r\n') : composed;
}

function compositionPaths(repositoryRoot, hostRoot) {
  const root = path.resolve(repositoryRoot);
  const resolvedHostRoot = path.resolve(hostRoot || path.join(root, 'showrank_barebones'));
  return {
    runtimeTemplate: path.join(resolvedHostRoot, 'panorama', 'scripts', 'showrank_barebones.js'),
    styleTemplate: path.join(resolvedHostRoot, 'panorama', 'styles', 'showrank_barebones_topbar.css'),
    canonicalRuntimeTemplate: path.join(root, 'profile_stats_community', 'panorama', 'scripts', 'profile_stats_community.js'),
    canonicalContextRuntimeTemplate: path.join(root, 'profile_stats_community', 'panorama', 'scripts', 'profile_stats_community_context_menu.js'),
    canonicalStyle: path.join(root, 'profile_stats_community', 'panorama', 'styles', 'profile_stats_community.css'),
    identityPolicy: path.join(root, 'scripts', 'viewed-profile-identity-policy.js'),
  };
}

function composeProfileStatsCommunitySources(repositoryRoot) {
  const paths = compositionPaths(repositoryRoot);
  const runtimeTemplate = fs.readFileSync(paths.canonicalRuntimeTemplate, 'utf8');
  const contextRuntimeTemplate = fs.readFileSync(paths.canonicalContextRuntimeTemplate, 'utf8');
  const identityPolicy = fs.readFileSync(paths.identityPolicy, 'utf8');

  return {
    runtime: composeText(
      runtimeTemplate,
      identityPolicy,
      IDENTITY_POLICY_PLACEHOLDER,
      'Profile Stats Community runtime identity policy',
    ),
    contextRuntime: composeText(
      contextRuntimeTemplate,
      identityPolicy,
      IDENTITY_POLICY_PLACEHOLDER,
      'Profile Stats Community context runtime identity policy',
    ),
    runtimeTemplate,
    contextRuntimeTemplate,
    identityPolicy,
    paths,
  };
}

function composeBarebonesSources(repositoryRoot, hostRoot) {
  const paths = compositionPaths(repositoryRoot, hostRoot);
  const profileSources = composeProfileStatsCommunitySources(repositoryRoot);
  const runtimeTemplate = fs.readFileSync(paths.runtimeTemplate, 'utf8');
  const styleTemplate = fs.readFileSync(paths.styleTemplate, 'utf8');
  const canonicalStyle = fs.readFileSync(paths.canonicalStyle, 'utf8');
  const runtimeHost = composeText(
    runtimeTemplate,
    profileSources.identityPolicy,
    IDENTITY_POLICY_PLACEHOLDER,
    'barebones identity policy',
  );
  const nestedProfileRuntime = composeText(
    profileSources.runtimeTemplate,
    '    /* viewed-profile identity policy is supplied by the barebones host */',
    IDENTITY_POLICY_PLACEHOLDER,
    'nested Profile Stats Community identity policy',
  );

  return {
    runtime: composeText(runtimeHost, nestedProfileRuntime, RUNTIME_PLACEHOLDER, 'barebones runtime'),
    style: composeText(styleTemplate, canonicalStyle, STYLE_PLACEHOLDER, 'barebones stylesheet'),
    canonicalRuntime: profileSources.runtime,
    nestedProfileRuntime,
    canonicalStyle,
    identityPolicy: profileSources.identityPolicy,
    paths,
  };
}

function writeBarebonesSources(repositoryRoot, outputRoot, hostRoot) {
  const composition = composeBarebonesSources(repositoryRoot, hostRoot);
  const resolvedOutputRoot = path.resolve(outputRoot);
  const runtimeOutput = path.join(resolvedOutputRoot, 'panorama', 'scripts', 'showrank_barebones.js');
  const styleOutput = path.join(resolvedOutputRoot, 'panorama', 'styles', 'showrank_barebones_topbar.css');
  const inputPaths = Object.values(composition.paths).map((inputPath) => path.resolve(inputPath).toLowerCase());

  for (const outputPath of [runtimeOutput, styleOutput]) {
    if (inputPaths.includes(path.resolve(outputPath).toLowerCase())) {
      throw new Error(`refusing to overwrite composition input: ${outputPath}`);
    }
    if (!fs.existsSync(path.dirname(outputPath))) {
      throw new Error(`composition output directory does not exist: ${path.dirname(outputPath)}`);
    }
  }

  fs.writeFileSync(runtimeOutput, composition.runtime, 'utf8');
  fs.writeFileSync(styleOutput, composition.style, 'utf8');
  return { runtimeOutput, styleOutput };
}

function writeProfileStatsCommunitySources(repositoryRoot, outputRoot) {
  const composition = composeProfileStatsCommunitySources(repositoryRoot);
  const resolvedOutputRoot = path.resolve(outputRoot);
  const runtimeOutput = path.join(resolvedOutputRoot, 'panorama', 'scripts', 'profile_stats_community.js');
  const contextRuntimeOutput = path.join(
    resolvedOutputRoot,
    'panorama',
    'scripts',
    'profile_stats_community_context_menu.js',
  );
  const inputPaths = Object.values(composition.paths).map((inputPath) => path.resolve(inputPath).toLowerCase());

  for (const outputPath of [runtimeOutput, contextRuntimeOutput]) {
    if (inputPaths.includes(path.resolve(outputPath).toLowerCase())) {
      throw new Error(`refusing to overwrite composition input: ${outputPath}`);
    }
    if (!fs.existsSync(path.dirname(outputPath))) {
      throw new Error(`composition output directory does not exist: ${path.dirname(outputPath)}`);
    }
  }

  fs.writeFileSync(runtimeOutput, composition.runtime, 'utf8');
  fs.writeFileSync(contextRuntimeOutput, composition.contextRuntime, 'utf8');
  return { runtimeOutput, contextRuntimeOutput };
}

if (require.main === module) {
  const repositoryRoot = path.resolve(__dirname, '..');
  try {
    if (process.argv.length === 3) {
      writeBarebonesSources(repositoryRoot, process.argv[2]);
    } else if (process.argv.length === 5 && process.argv[2] === '--host-root') {
      writeBarebonesSources(repositoryRoot, process.argv[4], process.argv[3]);
    } else if (process.argv.length === 4 && process.argv[2] === '--profile-stats') {
      writeProfileStatsCommunitySources(repositoryRoot, process.argv[3]);
    } else {
      console.error(
        'Usage: node scripts/profile-stats-community-composition.js [--host-root <host-root>] <staged-source-root>',
      );
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(`[ProfileStatsCommunityComposition] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  RUNTIME_PLACEHOLDER,
  STYLE_PLACEHOLDER,
  IDENTITY_POLICY_PLACEHOLDER,
  composeText,
  composeProfileStatsCommunitySources,
  composeBarebonesSources,
  writeProfileStatsCommunitySources,
  writeBarebonesSources,
};
