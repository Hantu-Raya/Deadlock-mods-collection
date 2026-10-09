#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '..', 'panorama', 'scripts', 'rejuvnbufftimer.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const scheduled = [];
const events = [];
let fakeNow = 1000;
let nextScheduleId = 0;
let contextPanel = null;

function liveScheduled() {
  return scheduled.filter((item) => !item.cancelled);
}

function runNextScheduled() {
  scheduled.sort((a, b) => a.dueMs - b.dueMs || a.id - b.id);
  const index = scheduled.findIndex((item) => !item.cancelled);
  if (index < 0) return null;
  const [item] = scheduled.splice(index, 1);
  fakeNow = Math.max(fakeNow, item.dueMs);
  item.callback();
  return item;
}

const sandbox = {
  module: { exports: {} },
  exports: {},
  console,
  Date: { now: () => fakeNow },
  globalThis: {},
  $: {
    Schedule: (delay, callback) => {
      const item = {
        id: ++nextScheduleId,
        delay,
        dueMs: fakeNow + Math.max(0, Number(delay) || 0) * 1000,
        callback,
        cancelled: false,
      };
      scheduled.push(item);
      return item.id;
    },
    CancelScheduled: (handle) => {
      const item = scheduled.find((entry) => entry.id === handle);
      if (item) item.cancelled = true;
    },
    GetContextPanel: () => contextPanel,
    DispatchEvent: (...args) => events.push(args),
    Msg: () => {},
  },
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: scriptPath });
const test = sandbox.module.exports.__test;
const intent = test?.TeamChatIntent;
assert.ok(test, 'runtime test exports missing');
assert.ok(intent, 'TeamChatIntent test export missing');
scheduled.length = 0;

assert.equal(intent.sanitize('  Bridge;\n"soon"  '), 'Bridge soon', 'chat text must remove command separators and quotes');
assert.equal(intent.sanitize('   '), '', 'blank chat text must remain unsendable');
assert.equal(intent.canSend(1300, 1000, 300), true, 'cooldown boundary must allow sending');
assert.equal(intent.canSend(1299, 1000, 300), false, 'cooldown must reject early sends');
assert.equal(intent.isTeamTarget({ IsValid: () => true, text: 'To (ALL):' }), false, 'all-chat must be rejected');
assert.equal(intent.isTeamTarget({ IsValid: () => true, text: '#citadel_chat_placeholder' }), false, 'placeholder target must be rejected');
assert.equal(intent.isTeamTarget({ IsValid: () => true, text: 'To (TEAM):' }), true, 'team chat target must be accepted');

const input = { IsValid: () => true, text: '' };
const label = { IsValid: () => true, text: 'To (TEAM):' };
const controls = {
  FindChildTraverse: (id) => id === 'ChatInput' ? input : id === 'ChatTargetLabel' ? label : null,
};
const chat = {
  IsValid: () => true,
  FindChildTraverse: (id) => id === 'ChatControls' ? controls : null,
};
const attributes = new Map();
const root = {
  IsValid: () => true,
  GetAttributeInt: (name, fallback) => attributes.has(name) ? attributes.get(name) : fallback,
  SetAttributeInt: (name, value) => attributes.set(name, value),
  GetParent: () => null,
  FindChildTraverse: (id) => id === 'Chat' ? chat : null,
};
contextPanel = root;
root.SetAttributeInt('bt_timer_gen', 1);
test.setInstanceTestState({ instanceGen: 1, hudRoot: root, retired: false });

assert.equal(intent.send('Bridge; 5:00', 1000), true, 'valid timer text must open team chat');
assert.deepEqual(events[0], ['CitadelConCommand', 'say_chat_team'], 'send must request team chat, not all-chat');
// Failure mode ASTRA-23: the 300 ms cooldown is shorter than retry work, allowing a second timer to overwrite the first.
assert.equal(intent.send('Bridge 5:00', 1300), false, 'a second timer intent must be rejected after cooldown while one is pending');

runNextScheduled();
assert.ok(liveScheduled().some((item) => item.delay === 0.03), 'first resolved chat tree must wait for one stable retry');
runNextScheduled();
assert.equal(input.text, 'Bridge 5:00', 'submitted chat text must be sanitized');
runNextScheduled();
assert.ok(events.some((event) => event[0] === 'CitadelChatInputSubmitted' && event[1] === input), 'team chat input must be submitted');
assert.equal(input.text, '', 'chat input must be cleared after submission');
assert.ok(events.some((event) => event[0] === 'DropInputFocus' && event[1] === input), 'chat input focus must be released');
assert.equal(test.isChatIntentInFlight(), false, 'successful submit must release its in-flight token');
runNextScheduled();

// Failure mode ASTRA-22: switching to all-chat after text is staged must abort without submitting the timer.
fakeNow = 1500;
events.length = 0;
assert.equal(intent.send('Urn 1s', fakeNow), true, 'a later timer intent must be accepted after the prior submit');
runNextScheduled();
runNextScheduled();
assert.equal(input.text, 'Urn 1s', 'timer text should be staged before the submit callback');
label.text = 'To (ALL):';
runNextScheduled();
assert.equal(events.some((event) => event[0] === 'CitadelChatInputSubmitted'), false, 'changed all-chat target must block the scheduled submit');
assert.equal(input.text, '', 'aborted intent must clear only its own staged text');
assert.equal(test.isChatIntentInFlight(), false, 'target change must release the in-flight token');
assert.ok(events.some((event) => event[0] === 'DropInputFocus' && event[1] === input), 'aborted intent must release chat focus');
label.text = 'To (TEAM):';
runNextScheduled();
fakeNow = 2000;

scheduled.length = 0;
events.length = 0;
fakeNow = 2500;
test.setChatTestGeneration(10);
assert.equal(intent.send('Bridge 4:59', fakeNow), true, 'generation test message must schedule');
test.setChatTestGeneration(11);
runNextScheduled();
assert.equal(liveScheduled().length, 0, 'stale chat retry must stop after a runtime generation change');
assert.equal(
  events.some((event) => event[0] === 'CitadelChatInputSubmitted'),
  false,
  'stale chat retry must not submit after reset',
);
// Failure mode ASTRA-23: exhausting readiness retries must release the token rather than serialize future timer actions forever.
fakeNow = 5000;
label.text = 'To (ALL):';
assert.equal(intent.send('Bridge 5:00', fakeNow), true, 'unready chat intent must begin its bounded retry window');
for (let attempt = 0; attempt < 6; attempt++) runNextScheduled();
assert.equal(test.isChatIntentInFlight(), false, 'retry exhaustion must release the in-flight token');
label.text = 'To (TEAM):';


// Failure mode ASTRA-23: a lost retry callback can retain the in-flight token forever.
scheduled.length = 0;
fakeNow = 10000;
events.length = 0;
assert.equal(intent.send('Urn 1s', fakeNow), true, 'timeout test intent must start');
const lostRetry = liveScheduled().find((item) => item.delay === 0.01);
assert.ok(lostRetry, 'intent must have a scheduled retry to lose');
sandbox.$.CancelScheduled(lostRetry.id);
runNextScheduled();
assert.equal(test.isChatIntentInFlight(), false, 'two-second intent expiry must release a token whose retry was lost');

scheduled.length = 0;
events.length = 0;
assert.equal(intent.send('Urn 1s', 13000), true, 'retirement test intent must schedule a chat retry');
root.SetAttributeInt('bt_timer_gen', 2);
const eventCountBeforeRetirement = events.length;
runNextScheduled();
assert.equal(events.length, eventCountBeforeRetirement, 'retired timer must not dispatch any chat event from a pending retry');
assert.equal(test.getInstanceTestState().retired, true, 'superseded timer must retire on its pending chat retry');

console.log('[TEAM CHAT PASS] sanitization, team targeting, cooldown, in-flight retries, submit, and focus contracts are valid.');
