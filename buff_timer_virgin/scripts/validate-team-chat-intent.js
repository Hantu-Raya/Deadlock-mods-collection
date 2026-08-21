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
let contextPanel = null;

const sandbox = {
  module: { exports: {} },
  exports: {},
  console,
  Date,
  globalThis: {},
  $: {
    Schedule: (delay, callback) => {
      scheduled.push({ delay, callback });
      return scheduled.length;
    },
    CancelScheduled: () => {},
    GetContextPanel: () => contextPanel,
    DispatchEvent: (...args) => events.push(args),
    Msg: () => {},
  },
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: scriptPath });
const intent = sandbox.module.exports.__test?.TeamChatIntent;
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
const root = {
  IsValid: () => true,
  GetParent: () => null,
  FindChildTraverse: (id) => id === 'Chat' ? chat : null,
};
contextPanel = root;

assert.equal(intent.send('Bridge; 5:00', 1000), true, 'valid timer text must open team chat');
assert.deepEqual(events[0], ['CitadelConCommand', 'say_chat_team'], 'send must request team chat, not all-chat');
assert.equal(intent.send('Bridge 5:00', 1100), false, 'send cooldown must prevent duplicate messages');

scheduled.shift().callback();
assert.equal(scheduled.length, 1, 'first resolved chat tree must wait for one stable retry');
scheduled.shift().callback();
assert.equal(input.text, 'Bridge 5:00', 'submitted chat text must be sanitized');
scheduled.shift().callback();
assert.ok(events.some((event) => event[0] === 'CitadelChatInputSubmitted' && event[1] === input), 'team chat input must be submitted');
assert.equal(input.text, '', 'chat input must be cleared after submission');
assert.ok(events.some((event) => event[0] === 'DropInputFocus' && event[1] === input), 'chat input focus must be released');

console.log('[TEAM CHAT PASS] sanitization, team targeting, cooldown, retry, submit, and focus contracts are valid.');
