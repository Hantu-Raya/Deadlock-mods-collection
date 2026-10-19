'use strict';

// This edition is derived from showrank_barebones by scripts/showrank-barebones-editions.js. Fail if the
// committed tree is stale, then run the shared runtime suite against it (missing-lane scenarios become
// no-missing assertions there).
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repositoryDir = path.resolve(__dirname, '..', '..');
execFileSync(process.execPath, [path.join(repositoryDir, 'scripts', 'showrank-barebones-editions.js'), '--check'], { stdio: 'inherit' });
process.env.SHOWRANK_BAREBONES_HOST_ROOT = path.resolve(__dirname, '..');
require(path.join(repositoryDir, 'showrank_barebones', 'tests', 'showrank-barebones-runtime.test.js'));
