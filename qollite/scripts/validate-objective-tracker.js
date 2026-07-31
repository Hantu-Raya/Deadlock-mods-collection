#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class Panel {
  constructor(id, classes) {
    this.id = id || '';
    this.classes = new Set(classes || []);
    this.children = [];
    this.parent = null;
    this.style = {};
    this.text = '';
    this.visible = true;
    this.valid = true;
  }

  add(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  IsValid() {
    return this.valid;
  }

  GetParent() {
    return this.parent;
  }

  Children() {
    return this.children.slice();
  }

  FindChild(id) {
    return this.children.find((child) => child.id === id) || null;
  }

  FindChildTraverse(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.FindChildTraverse(id);
      if (found) return found;
    }
    return null;
  }

  FindChildrenWithClassTraverse(className) {
    const found = [];
    const visit = (panel) => {
      for (const child of panel.children) {
        if (child.BHasClass(className)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  BHasClass(className) {
    return this.classes.has(className);
  }

  AddClass(className) {
    this.classes.add(className);
  }

  RemoveClass(className) {
    this.classes.delete(className);
  }

  GetAttributeString(name, fallback) {
    return name === 'class' ? [...this.classes].join(' ') : fallback;
  }
}

function makeRuntime(kothClasses) {
  const root = new Panel('Root');
  const panels = [
    'BuffTime',
    'RejuvTime',
    'UrnTrackerLabel',
    'UrnHUD',
    'UrnHudCard',
  ];
  const scheduled = [];
  let gameTime = 700;
  const game = { GetGameTime: () => gameTime };

  for (const id of panels) root.add(new Panel(id));
  if (kothClasses) root.add(new Panel('KothCashInMeter', kothClasses));

  return {
    root,
    scheduled,
    setGameTime: (seconds) => { gameTime = seconds; },
    context: vm.createContext({
      Game: game,
      $: {
        GetContextPanel: () => root,
        Schedule: (delay, callback) => scheduled.push({ delay, callback }),
      },
    }),
  };
}

function execute(kothClasses) {
  const runtime = makeRuntime(kothClasses);
  const source = fs.readFileSync(path.join(__dirname, '..', 'panorama', 'scripts', 'qollite_topbar.js'), 'utf8');
  vm.runInContext(source, runtime.context, { filename: 'qollite_topbar.js' });
  assert(runtime.scheduled.length > 0, 'root-mode boot must schedule its next update');
  return runtime;
}

const absentRuntime = execute(null);
assert(absentRuntime.root.FindChildTraverse('UrnHUD').text !== 'Rift live', 'absent objective evidence at 700 must not report a live Rift');

const capturingRuntime = execute(['capturing']);
assert(capturingRuntime.root.FindChildTraverse('UrnHUD').text.startsWith('Cap '), 'native capturing Koth state must report capture progress');

const rewindRuntime = execute(null);
const rejuvTime = rewindRuntime.root.FindChildTraverse('RejuvTime');
assert(rejuvTime.text === '01:06', 'rewind scenario must begin from the 700-second Rejuv state');
rewindRuntime.setGameTime(1);
const scheduledRootUpdateIndex = rewindRuntime.scheduled.findIndex((job) => job.delay === 1);
assert(scheduledRootUpdateIndex !== -1, 'rewind scenario must have a scheduled root update');
rewindRuntime.scheduled.splice(scheduledRootUpdateIndex, 1)[0].callback();
assert(rejuvTime.text === 'Spawn', 'a new-game clock rewind must reset Rejuv to its fresh-match state');
console.log('PASS validate-objective-tracker');
