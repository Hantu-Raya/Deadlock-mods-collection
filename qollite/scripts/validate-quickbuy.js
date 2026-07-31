const fs = require('fs');
const path = require('path');
const vm = require('vm');

function panel(id, parent) {
  return {
    id,
    parent,
    children: [],
    text: '',
    valid: true,
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
    IsValid() { return this.valid; },
    DeleteAsync() {
      this.valid = false;
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    },
  };
}

const source = fs.readFileSync(path.join(process.cwd(), 'qollite/panorama/scripts/qollite_quickbuy.js'), 'utf8');
const root = panel('root');
const queueContainer = panel('QuickBuyQueueContainer', root);
const queue = panel('QuickbuyQueue', queueContainer);
root.children.push(queueContainer);
queueContainer.children.push(queue);
const first = panel('first', queue);
const second = panel('second', queue);
first.GetAttributeInt = (name, fallback) => name === 'cost' ? 1250 : fallback;
second.GetAttributeInt = (name, fallback) => name === 'cost' ? 2750 : fallback;
queue.children.push(first, second);
const stockChildCount = queue.children.length;
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
            schedule(owner, delay, callback) { scheduled.push({ owner, delay, callback }); },
            cancel(owner) { cancelled.push(owner); },
            register(name, feature) { features[name] = feature; },
          },
        },
      };
    },
  },
};

vm.runInNewContext(source, context, { filename: 'qollite_quickbuy.js' });
if (!features.quickbuy) throw new Error('quickbuy feature was not registered');
features.quickbuy.init();
const total = root.FindChildTraverse('QolLiteQuickbuyTotal');
if (!total || total.text !== 'Total: 4000') throw new Error('init must render the sum of stock queue child costs');
if (queue.children.length !== stockChildCount) throw new Error('rendering must not mutate stock queue children');
first.GetAttributeInt = (name, fallback) => name === 'cost' ? 1500 : fallback;
features.quickbuy.refresh();
if (total.text !== 'Total: 4250') throw new Error('refresh must update the owned total label');
total.valid = false;
queueContainer.children = [queue];
scheduled[0].callback();
const recreatedTotal = root.FindChildTraverse('QolLiteQuickbuyTotal');
if (!recreatedTotal || recreatedTotal === total || recreatedTotal.text !== 'Total: 4250') {
  throw new Error('scheduled refresh must recreate an invalid owned label after a stock parent rebuild');
}
if (scheduled.length !== 2) throw new Error('scheduled refresh must continue after recreating an invalid label');
features.quickbuy.destroy();
if (!cancelled.includes('quickbuy')) throw new Error('destroy must cancel quickbuy schedules');
if (root.FindChildTraverse('QolLiteQuickbuyTotal')) throw new Error('destroy must remove only the owned total label');
console.log('OK: quickbuy behavior passed');
