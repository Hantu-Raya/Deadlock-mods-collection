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
  const opened = [];
  let dismissCount = 0;
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
  const context = {
    $: {
      GetContextPanel() {
        return card;
      },
    },
    CitadelShowProfilePageForAccount(value) {
      if (options.throwNavigation) {
        throw new Error('navigation failed');
      }
      opened.push(value);
    },
    DismissAllContextMenus() {
      dismissCount += 1;
    },
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
    opened,
    dismissCount() {
      return dismissCount;
    },
  };
}

test('player profile action opens the bound account and dismisses the menu', () => {
  const harness = makeHarness({ attributes: { accountid: '215334735' } });

  assert.equal(typeof harness.card.ProfileStatsCommunityOpenPlayerProfile, 'function');
  assert.equal(harness.card.ProfileStatsCommunityOpenPlayerProfile(), true);
  assert.deepEqual(harness.opened, [215334735]);
  assert.equal(harness.dismissCount(), 1);
});

test('Steam64 authority can corroborate the account witness', () => {
  const account = '198741881';
  const steamid = String(STEAM_ID_BASE + BigInt(account));
  const harness = makeHarness({ account, attributes: { steamid } });

  assert.equal(harness.card.ProfileStatsCommunityOpenPlayerProfile(), true);
  assert.deepEqual(harness.opened, [198741881]);
});

test('mismatched or missing selected-player evidence fails closed', () => {
  const mismatch = makeHarness({ attributes: { accountid: '215334736' } });
  const missing = makeHarness({ missingWitness: true });
  const oversized = makeHarness({ account: '4294967296' });

  [mismatch, missing, oversized].forEach((harness) => {
    assert.equal(harness.card.ProfileStatsCommunityOpenPlayerProfile(), false);
    assert.deepEqual(harness.opened, []);
    assert.equal(harness.dismissCount(), 0);
  });
});

test('failed profile navigation leaves the context menu open', () => {
  const harness = makeHarness({ throwNavigation: true });

  assert.equal(harness.card.ProfileStatsCommunityOpenPlayerProfile(), false);
  assert.deepEqual(harness.opened, []);
  assert.equal(harness.dismissCount(), 0);
});
