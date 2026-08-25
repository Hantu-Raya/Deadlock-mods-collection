'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '..', 'panorama', 'scripts', 'profile_stats_community_context_menu.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const STEAM_ID_BASE = 76561197960265728n;

function makeHarness(options = {}) {
  const account = options.account === undefined ? '215334735' : options.account;
  const attributes = Object.assign({}, options.attributes);
  const events = [];
  const witness = {
    text: account,
    IsValid() {
      return true;
    },
  };
  const card = {
    IsValid() {
      return true;
    },
    FindChildTraverse(id) {
      return id === 'ProfileStatsCommunityContextAccount' && options.missingWitness !== true ? witness : null;
    },
    GetAttributeString(name, fallback) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : fallback;
    },
  };
  const root = {
    IsValid() {
      return true;
    },
    FindChildTraverse(id) {
      return id === 'ProfileCard' && options.missingCard !== true ? card : null;
    },
  };
  const panoramaApi = {
    GetContextPanel() {
      return root;
    },
    DispatchEvent(name, value) {
      if (options.throwNavigation) {
        throw new Error('navigation failed');
      }
      events.push([name, value]);
    },
  };
  const context = {
    $: panoramaApi,
    Number,
    Object,
    String,
    Math,
    RegExp,
    Error,
    isFinite,
    parseInt,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: sourcePath });
  return {
    card,
    root,
    events,
    open() {
      return panoramaApi.ProfileStatsCommunityOpenPlayerProfile();
    },
    installedAction() {
      return panoramaApi.ProfileStatsCommunityOpenPlayerProfile;
    },
  };
}

test('context action opens the selected profile card account', () => {
  const harness = makeHarness({ attributes: { accountid: '215334735' } });

  assert.equal(typeof harness.installedAction(), 'function');
  assert.equal(harness.open(), true);
  assert.deepEqual(harness.events, [['CitadelShowProfilePageForAccount', 215334735]]);
});

test('Steam64 authority can corroborate the account witness', () => {
  const account = '198741881';
  const steamid = String(STEAM_ID_BASE + BigInt(account));
  const harness = makeHarness({ account, attributes: { steamid } });

  assert.equal(harness.open(), true);
  assert.deepEqual(harness.events, [['CitadelShowProfilePageForAccount', 198741881]]);
});

test('mismatched or missing selected-player evidence fails closed', () => {
  const mismatch = makeHarness({ attributes: { accountid: '215334736' } });
  const missing = makeHarness({ missingWitness: true });
  const missingCard = makeHarness({ missingCard: true });
  const oversized = makeHarness({ account: '4294967296' });

  [mismatch, missing, missingCard, oversized].forEach((harness) => {
    assert.equal(harness.open(), false);
    assert.deepEqual(harness.events, []);
  });
});

test('failed profile event dispatch reports failure', () => {
  const harness = makeHarness({ throwNavigation: true });

  assert.equal(harness.open(), false);
  assert.deepEqual(harness.events, []);
});
