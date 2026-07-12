'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DEFAULT_PANEL_IDS = [
  'PokerMenuButton',
  'PokerAnitaPanel',
  'PokerTableWindow',
  'PokerLobbyWindow',
  'PokerPlayersWindow',
  'PokerHistoryWindow',
  'PokerActionsWindow',
  'PokerCloseButton',
  'PokerBackButton',
  'PokerReadyChatButton',
  'PokerStartButton',
  'PokerEndMatchButton',
  'PokerLeaveLobbyButton',
  'PokerStartButtonLabel',
  'PokerReadyCountLabel',
  'PokerSeatsList',
  'PokerStatusLabel',
  'PokerPotLabel',
  'PokerPhaseLabel',
  'PokerTableSurface',
  'PokerPotCenter',
  'PokerPotCenterAmount',
  'PokerPotChips',
  'PokerAnnouncerOverlay',
  'PokerAnnouncerTitle',
  'PokerAnnouncerBody',
  'PokerCommunityCards',
  'PokerTableSeats',
  'PokerPlayersList',
  'PokerActionButtons',
  'PokerPartyControls',
  'PokerHostPartyButton',
  'PokerJoinPartyButton',
  'PokerPartyStatusLabel',
  'PokerProgressControls',
  'PokerExportProgressButton',
  'PokerImportProgressButton',
  'PokerProgressCodeInput',
  'PokerProgressCodeLabel',
  'PokerResumeControls',
  'PokerResumeLeaderButton',
  'PokerResumeReadyButton',
  'PokerResumeStatusLabel',
  'PokerResumeLeaderList',
  'PokerGameLog',
  'TableGamePickerWindow',
  'TableGamePickerWarning',
  'TableGamePickerPokerButton',
  'TableGamePickerPokerLabel',
  'TableGamePickerBluffButton',
  'TableGamePickerBluffLabel',
  'BluffDeckWindow',
  'BluffDeckAnnouncementOverlay',
  'BluffDeckAnnouncementTitle',
  'BluffDeckAnnouncementBody',
  'BluffDeckPlayersWindow',
  'BluffDeckHistoryWindow',
  'BluffDeckActionsWindow',
  'BluffDeckBackButton',
  'BluffDeckCloseButton',
  'ChatControls',
  'ChatInput',
  'ChatTargetLabel',
];

function addClasses(panel, classNames) {
  if (!classNames) return;
  if (Array.isArray(classNames)) {
    for (const className of classNames) if (className) panel.classes[className] = true;
    return;
  }
  for (const className of String(classNames).split(/\s+/)) {
    if (className) panel.classes[className] = true;
  }
}

function createPanelFactory(options = {}) {
  const panelsById = Object.create(null);
  let nextId = 0;
  const domWrites = [];

  function recordDomWrite(entry) {
    domWrites.push(entry);
  }

  function clearDomWrites() {
    domWrites.length = 0;
  }

  function takeDomWrites() {
    const writes = domWrites.slice();
    clearDomWrites();
    return writes;
  }

  function createPanel(type, parent, id, classNames, text) {
    const attrs = classNames && typeof classNames === 'object' && !Array.isArray(classNames) ? classNames : null;
    const panelClassNames = attrs ? '' : classNames;
    let panelText = String(text == null ? '' : text);
    let panelHitTest = true;
    let panelSrc = attrs && attrs.src != null ? String(attrs.src) : '';
    let panelValue = attrs && Object.prototype.hasOwnProperty.call(attrs, 'value') ? attrs.value : 0;
    let panelMin = attrs && Object.prototype.hasOwnProperty.call(attrs, 'min') ? attrs.min : 0;
    let panelMax = attrs && Object.prototype.hasOwnProperty.call(attrs, 'max') ? attrs.max : 0;
    let panelIncrement = attrs && Object.prototype.hasOwnProperty.call(attrs, 'increment') ? attrs.increment : 0;
    const styleTarget = {};
    const panelStyle = typeof Proxy === 'function'
      ? new Proxy(styleTarget, {
          set(target, name, value) {
            const key = String(name);
            const next = String(value == null ? '' : value);
            if (target[key] === next) return true;
            const before = target[key];
            target[key] = next;
            recordDomWrite({ type: 'style', id: panel.id, name: key, before, after: next });
            return true;
          },
        })
      : styleTarget;
    const panel = {
      id: id || `${type || 'Panel'}_${++nextId}`,
      type: type || 'Panel',
      parent: parent || null,
      children: [],
      classes: Object.create(null),
      deleted: false,
      style: panelStyle,
      attrs: attrs || {},
      direction: attrs && attrs.direction ? String(attrs.direction) : '',
      IsValid() {
        return !this.deleted;
      },
      GetParent() {
        return this.parent;
      },
      GetChildCount() {
        return this.children.length;
      },
      GetChild(index) {
        return this.children[index] || null;
      },
      BHasClass(className) {
        return !!this.classes[className];
      },
      SetHasClass(className, enabled) {
        const next = !!enabled;
        if (!!this.classes[className] === next) return;
        this.classes[className] = next;
        recordDomWrite({ type: 'class', id: this.id, className, enabled: next });
      },
      AddClass(className) {
        if (this.classes[className]) return;
        this.classes[className] = true;
        recordDomWrite({ type: 'class', id: this.id, className, enabled: true });
      },
      RemoveClass(className) {
        if (!this.classes[className]) return;
        delete this.classes[className];
        recordDomWrite({ type: 'class', id: this.id, className, enabled: false });
      },
      FindChildTraverse(searchId) {
        if (this.id === searchId) return this;
        for (const child of this.children) {
          if (!child || child.deleted || typeof child.FindChildTraverse !== 'function') continue;
          const found = child.FindChildTraverse(searchId);
          if (found) return found;
        }
        return this.parent ? null : (panelsById[searchId] || null);
      },
      FindChildrenWithClassTraverse(className) {
        const matches = [];
        if (this.BHasClass(className)) matches.push(this);
        for (const child of this.children) {
          if (!child || child.deleted || typeof child.FindChildrenWithClassTraverse !== 'function') continue;
          matches.push(...child.FindChildrenWithClassTraverse(className));
        }
        return matches;
      },
      RemoveAndDeleteChildren() {
        const count = this.children.length;
        if (!count) return;
        for (const child of this.children) child.deleted = true;
        this.children = [];
        recordDomWrite({ type: 'delete-children', id: this.id, count });
      },
      DeleteAsync() {
        if (this.deleted) return;
        this.deleted = true;
        if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
        recordDomWrite({ type: 'delete', id: this.id });
      },
      SetPanelEvent(eventName, handler) {
        if (this[eventName] === handler) return;
        this[eventName] = handler;
        recordDomWrite({ type: 'event', id: this.id, eventName });
      },
      SetImage(src) {
        this.src = src;
      },
      SetAttributeString(name, value) {
        const attrName = String(name || '');
        const next = String(value == null ? '' : value);
        const before = this.attrs[attrName];
        if (before === next) return;
        this.attrs[attrName] = next;
        recordDomWrite({ type: 'attr', id: this.id, name: attrName, before, after: next });
        if (attrName === 'src') this.src = next;
      },
      SetValueNoEvents(value) {
        this.value = value;
      },
    };

    Object.defineProperty(panel, 'text', {
      enumerable: true,
      get() {
        return panelText;
      },
      set(value) {
        const next = String(value == null ? '' : value);
        if (panelText === next) return;
        const before = panelText;
        panelText = next;
        recordDomWrite({ type: 'text', id: panel.id, before, after: next });
      },
    });
    Object.defineProperty(panel, 'hittest', {
      enumerable: true,
      get() {
        return panelHitTest;
      },
      set(value) {
        const next = !!value;
        if (panelHitTest === next) return;
        const before = panelHitTest;
        panelHitTest = next;
        recordDomWrite({ type: 'hittest', id: panel.id, before, after: next });
      },
    });
    Object.defineProperty(panel, 'src', {
      enumerable: true,
      get() {
        return panelSrc;
      },
      set(value) {
        const next = String(value == null ? '' : value);
        if (panelSrc === next) return;
        const before = panelSrc;
        panelSrc = next;
        recordDomWrite({ type: 'image-src', id: panel.id, before, after: next });
      },
    });
    Object.defineProperty(panel, 'value', {
      enumerable: true,
      get() {
        return panelValue;
      },
      set(value) {
        const next = typeof value === 'number' ? value : String(value == null ? '' : value);
        if (panelValue === next) return;
        const before = panelValue;
        panelValue = next;
        recordDomWrite({ type: 'value', id: panel.id, before, after: next });
      },
    });
    Object.defineProperty(panel, 'min', {
      enumerable: true,
      get() {
        return panelMin;
      },
      set(value) {
        const next = typeof value === 'number' ? value : String(value == null ? '' : value);
        if (panelMin === next) return;
        const before = panelMin;
        panelMin = next;
        recordDomWrite({ type: 'value-attr', id: panel.id, attr: 'min', before, after: next });
      },
    });
    Object.defineProperty(panel, 'max', {
      enumerable: true,
      get() {
        return panelMax;
      },
      set(value) {
        const next = typeof value === 'number' ? value : String(value == null ? '' : value);
        if (panelMax === next) return;
        const before = panelMax;
        panelMax = next;
        recordDomWrite({ type: 'value-attr', id: panel.id, attr: 'max', before, after: next });
      },
    });
    Object.defineProperty(panel, 'increment', {
      enumerable: true,
      get() {
        return panelIncrement;
      },
      set(value) {
        const next = typeof value === 'number' ? value : String(value == null ? '' : value);
        if (panelIncrement === next) return;
        const before = panelIncrement;
        panelIncrement = next;
        recordDomWrite({ type: 'value-attr', id: panel.id, attr: 'increment', before, after: next });
      },
    });

    addClasses(panel, panelClassNames);
    if (parent) parent.children.push(panel);
    if (panel.id) panelsById[panel.id] = panel;
    recordDomWrite({
      type: 'create',
      id: panel.id,
      panelType: panel.type,
      parentId: parent && parent.id ? parent.id : '',
    });
    return panel;
  }

  const root = createPanel('Panel', null, options.rootId || 'PokerValidatorRoot');
  const chat = createPanel('Panel', root, 'Chat');
  const messages = createPanel('Panel', chat, 'ChatMessages');

  const ids = options.panelIds || DEFAULT_PANEL_IDS;
  for (const id of ids) {
    if (panelsById[id]) continue;
    const panel = createPanel('Panel', root, id);
    if (id === 'PokerAnitaPanel') panel.classes.PokerHidden = true;
  }

  return { createPanel, root, chat, messages, panelsById, clearDomWrites, takeDomWrites };
}

function createValidatorContext(options = {}) {
  const config = options.config || {};
  const dispatches = [];
  const messages = [];
  const schedules = [];
  const panels = createPanelFactory(options);
  let now = options.now || 1700000000000;
  const nowStep = Number(options.nowStep) > 0 ? Number(options.nowStep) : 0;
  let scheduleOrder = 0;

  function MockDate(...args) {
    return args.length > 0 ? new Date(...args) : new Date(now);
  }
  MockDate.now = () => {
    if (nowStep > 0) now += nowStep;
    return now;
  };
  MockDate.parse = Date.parse;
  MockDate.UTC = Date.UTC;
  MockDate.prototype = Date.prototype;

  const sandbox = {
    __PokerTestMode: true,
    console,
    GameUI: {
      CustomUIConfig: () => config,
    },
    Date: MockDate,
    $: {
      CreatePanel: panels.createPanel,
      DispatchEvent: (name, payload) => {
        const payloadTextAtDispatch = payload && Object.prototype.hasOwnProperty.call(payload, 'text') ? String(payload.text) : undefined;
        dispatches.push({
          name,
          event: name,
          payload,
          payloadText: payloadTextAtDispatch,
          payloadId: payload && Object.prototype.hasOwnProperty.call(payload, 'id') ? String(payload.id) : undefined,
          payloadType: payload && Object.prototype.hasOwnProperty.call(payload, 'type') ? String(payload.type) : undefined,
          payloadTextAtDispatch,
        });
      },
      GetContextPanel: () => panels.root,
      Msg: (message) => {
        messages.push(String(message));
      },
      RegisterForUnhandledEvent: () => {},
      Schedule: (delay, callback) => {
        const numericDelay = Math.max(0, Number(delay) || 0);
        schedules.push({
          delay,
          dueAt: now + numericDelay * 1000,
          order: scheduleOrder++,
          callback,
        });
      },
    },
  };

  const context = { sandbox, config, dispatches, messages, logs: messages, schedules, panels };
  context.clock = {
    now: () => now,
    _setNow: (value) => { now = Number(value) || now; },
    advanceBy: (ms, maxCallbacks) => advanceScheduledTime(context, ms, maxCallbacks),
    runDue: (maxCallbacks) => drainDueScheduledCallbacks(context, maxCallbacks),
    runAll: (maxCallbacks) => drainScheduledCallbacks(context, maxCallbacks),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return context;
}

function runScript(context, filePath) {
  const sandbox = context && context.sandbox ? context.sandbox : context;
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(source, sandbox, { filename: path.relative(process.cwd(), filePath).replace(/\\/g, '/') });
}

function findPanel(runtime, id) {
  return runtime && runtime.panels && runtime.panels.root ? runtime.panels.root.FindChildTraverse(id) : null;
}

function findDescendantsWithClass(panel, className, out = []) {
  if (!panel || panel.deleted) return out;
  if (hasClass(panel, className)) out.push(panel);
  for (const child of panel.children || []) findDescendantsWithClass(child, className, out);
  return out;
}

function firstDescendantWithClass(panel, className) {
  const matches = findDescendantsWithClass(panel, className, []);
  return matches.length ? matches[0] : null;
}

function panelText(panel) {
  return panel ? String(panel.text || '') : '';
}

function hasClass(panel, className) {
  return !!(panel && panel.classes && panel.classes[className]);
}

function sortScheduledCallbacks(runtime) {
  if (!runtime || !runtime.schedules) return;
  runtime.schedules.sort((a, b) => {
    const aDue = Number.isFinite(a && a.dueAt) ? a.dueAt : 0;
    const bDue = Number.isFinite(b && b.dueAt) ? b.dueAt : 0;
    if (aDue !== bDue) return aDue - bDue;
    const aOrder = Number.isFinite(a && a.order) ? a.order : 0;
    const bOrder = Number.isFinite(b && b.order) ? b.order : 0;
    return aOrder - bOrder;
  });
}

function drainScheduledCallbacks(runtime, maxCallbacks = 256) {
  for (let i = 0; i < maxCallbacks && runtime.schedules.length; i += 1) {
    sortScheduledCallbacks(runtime);
    runtime.schedules.shift().callback();
  }
}

function drainDueScheduledCallbacks(runtime, maxCallbacks = 256) {
  const now = runtime && runtime.clock && typeof runtime.clock.now === 'function' ? runtime.clock.now() : 0;
  for (let i = 0; i < maxCallbacks && runtime.schedules.length; i += 1) {
    sortScheduledCallbacks(runtime);
    const next = runtime.schedules[0];
    const dueAt = Number.isFinite(next && next.dueAt) ? next.dueAt : 0;
    if (dueAt > now) break;
    runtime.schedules.shift().callback();
  }
}

function advanceScheduledTime(runtime, ms, maxCallbacks = 256) {
  if (!runtime || !runtime.clock || typeof runtime.clock.now !== 'function') return drainScheduledCallbacks(runtime, maxCallbacks);
  const amount = Math.max(0, Number(ms) || 0);
  const current = runtime.clock.now();
  const target = current + amount;
  if (Object.prototype.hasOwnProperty.call(runtime.clock, '_setNow')) runtime.clock._setNow(target);
  else runtime.clock.now = () => target;
  drainDueScheduledCallbacks(runtime, maxCallbacks);
}

function lastScheduledDelay(runtime) {
  const last = runtime.schedules[runtime.schedules.length - 1];
  return last ? last.delay : undefined;
}

function appendChatPanel(runtime, sender, channel, message, isSelf) {
  const row = runtime.panels.createPanel('Panel', runtime.panels.messages, '', isSelf ? 'IsSelf' : '');
  const source = runtime.panels.createPanel('Panel', row, 'MessageSource');
  const contents = runtime.panels.createPanel('Panel', row, 'MessageContents');
  const senderLabel = runtime.panels.createPanel('Label', source, '', 'SenderName', sender);
  const channelLabel = runtime.panels.createPanel('Label', source, '', 'ChannelName', channel || '');
  const contentsLabel = runtime.panels.createPanel('Label', contents, '', '', message);
  return { row, senderLabel, channelLabel, contentsLabel };
}

function labelTextWithin(panel, className) {
  return panelText(firstDescendantWithClass(panel, className));
}

function cardKeysWithin(panel) {
  return findDescendantsWithClass(panel, 'PokerCard', []).map((cardPanel) => {
    const rankText = labelTextWithin(cardPanel, 'PokerCardRank').replace('10', 'T');
    const suitText = labelTextWithin(cardPanel, 'PokerCardSuit');
    const suit = suitText === '♠' ? 'S' : suitText === '♥' ? 'H' : suitText === '♦' ? 'D' : suitText === '♣' ? 'C' : suitText;
    return rankText + suit;
  });
}

function renderedActionButtons(runtime) {
  return findDescendantsWithClass(findPanel(runtime, 'PokerActionButtons'), 'PokerActionButton', [])
    .filter((panel) => panel.type === 'Button')
    .map((button) => ({
      label: labelTextWithin(button, 'PokerActionButtonLabel') || panelText(button),
      enabled: !hasClass(button, 'Disabled'),
      readOnly: hasClass(button, 'ReadOnly'),
      hittest: button.hittest,
      panel: button,
    }));
}

function renderedPlayerRows(runtime) {
  return findDescendantsWithClass(findPanel(runtime, 'PokerPlayersList'), 'PokerPlayerRow', []).map((row) => ({
    name: labelTextWithin(row, 'PokerPlayerName'),
    stackText: labelTextWithin(row, 'PokerPlayerStack'),
    stateText: labelTextWithin(row, 'PokerPlayerState'),
    cardKeys: cardKeysWithin(firstDescendantWithClass(row, 'PokerHoleCards')),
    panel: row,
  }));
}

function renderedTableSeats(runtime) {
  return findDescendantsWithClass(findPanel(runtime, 'PokerTableSeats'), 'PokerTableSeat', []).map((row) => ({
    name: labelTextWithin(row, 'PokerTableSeatName'),
    stackText: labelTextWithin(row, 'PokerTableSeatStack'),
    stateText: labelTextWithin(row, 'PokerTableSeatState'),
    cardKeys: cardKeysWithin(firstDescendantWithClass(row, 'PokerTableSeatCards')),
    panel: row,
  }));
}

function renderedLogLines(runtime) {
  return findDescendantsWithClass(findPanel(runtime, 'PokerGameLog'), 'PokerLogLine', []).map(panelText);
}

function capturePanelIdentity(panel) {
  return panel;
}

function clearDomWrites(runtime) {
  if (runtime && runtime.panels && runtime.panels.clearDomWrites) runtime.panels.clearDomWrites();
}

function takeDomWrites(runtime) {
  return runtime && runtime.panels && runtime.panels.takeDomWrites ? runtime.panels.takeDomWrites() : [];
}


module.exports = {
  createPanelFactory,
  createValidatorContext,
  runScript,
  findPanel,
  findDescendantsWithClass,
  firstDescendantWithClass,
  panelText,
  hasClass,
  drainScheduledCallbacks,
  drainDueScheduledCallbacks,
  advanceScheduledTime,
  lastScheduledDelay,
  appendChatPanel,
  renderedActionButtons,
  renderedPlayerRows,
  renderedTableSeats,
  renderedLogLines,
  capturePanelIdentity,
  clearDomWrites,
  takeDomWrites,
};
