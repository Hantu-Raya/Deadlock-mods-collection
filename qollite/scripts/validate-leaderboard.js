const fs = require('fs');
const path = require('path');
const vm = require('vm');

function panel(id, parent, classes) {
  return {
    id,
    parent,
    children: [],
    classes: new Set(classes || []),
    events: {},
    text: '',
    GetParent() { return this.parent; },
    GetChildCount() { return this.children.length; },
    GetChild(index) { return this.children[index]; },
    FindChildTraverse(target) {
      if (this.id === target) return this;
      for (const child of this.children) {
        const found = child.FindChildTraverse(target);
        if (found) return found;
      }
      return null;
    },
    FindChildrenWithClassTraverse(className) {
      const found = [];
      if (this.classes.has(className)) found.push(this);
      for (const child of this.children) found.push(...child.FindChildrenWithClassTraverse(className));
      return found;
    },
    SetPanelEvent(name, callback) { this.events[name] = callback; },
    AddClass(name) { this.classes.add(name); },
    DeleteAsync() {
      this.parent.children = this.parent.children.filter((child) => child !== this);
    },
  };
}

const source = fs.readFileSync(path.join(process.cwd(), 'qollite/panorama/scripts/qollite_leaderboard.js'), 'utf8');
const root = panel('root');
const rating = panel('PlayersRatingContainer', root);
const rows = panel('PlayersContainer', rating);
root.children.push(rating);
rating.children.push(rows);
function addRow(name) {
  const row = panel('', rows, ['playerSnippet']);
  const label = panel('', row, ['playerRatingName']);
  label.text = name;
  row.children.push(label);
  rows.children.push(row);
  return row;
}
const alice = addRow('Alice');
const literal = addRow('A.* Literal');
const bob = addRow('Bob');
const features = {};
const scheduled = [];
const cancelled = [];
const context = {
  $: {
    CreatePanel(type, parent, id) {
      const created = panel(id, parent);
      created.type = type;
      parent.children.push(created);
      return created;
    },
  },
  GameUI: {
    CustomUIConfig() {
      return {
        QolLite: {
          Runtime: {
            find(id, from) { return (from || root).FindChildTraverse(id); },
            setClass(target, className, enabled) {
              if (enabled) target.classes.add(className);
              else target.classes.delete(className);
            },
            schedule(owner, delay, callback) { scheduled.push({ owner, delay, callback }); },
            cancel(owner) { cancelled.push(owner); },
            register(name, feature) { features[name] = feature; },
          },
        },
      };
    },
  },
};

vm.runInNewContext(source, context, { filename: 'qollite_leaderboard.js' });
if (!features.leaderboard) throw new Error('leaderboard feature was not registered');
features.leaderboard.init();
const search = root.FindChildTraverse('QolLiteLeaderboardSearchInput');
if (!search || !search.events.ontextentrychange) throw new Error('init must add an owned leaderboard search input');
search.text = 'ALI';
search.events.ontextentrychange();
if (alice.classes.has('qollite_leaderboard_hidden') || !literal.classes.has('qollite_leaderboard_hidden') || !bob.classes.has('qollite_leaderboard_hidden')) {
  throw new Error('search must filter player rows case-insensitively');
}
search.text = 'a.*';
search.events.ontextentrychange();
if (!alice.classes.has('qollite_leaderboard_hidden') || literal.classes.has('qollite_leaderboard_hidden') || !bob.classes.has('qollite_leaderboard_hidden')) {
  throw new Error('search must treat punctuation literally rather than as a pattern');
}
const scheduledBeforeDestroy = scheduled.length;
features.leaderboard.destroy();
if (!cancelled.includes('leaderboard')) throw new Error('destroy must cancel leaderboard schedules');
if (root.FindChildTraverse('QolLiteLeaderboardSearch')) throw new Error('destroy must remove only the owned search controls');
if ([alice, literal, bob].some((row) => row.classes.has('qollite_leaderboard_hidden'))) throw new Error('destroy must restore every stock row');
scheduled[0].callback();
if (scheduled.length !== scheduledBeforeDestroy) throw new Error('stale scheduled callbacks must not reschedule after destroy');
console.log('OK: leaderboard behavior passed');
