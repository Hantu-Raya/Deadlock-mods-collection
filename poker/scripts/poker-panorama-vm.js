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

  function createPanel(type, parent, id, classNames, text) {
    const panel = {
      id: id || `${type || 'Panel'}_${++nextId}`,
      type: type || 'Panel',
      parent: parent || null,
      children: [],
      classes: Object.create(null),
      text: text || '',
      hittest: true,
      deleted: false,
      style: {},
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
        this.classes[className] = !!enabled;
      },
      AddClass(className) {
        this.classes[className] = true;
      },
      RemoveClass(className) {
        delete this.classes[className];
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
        for (const child of this.children) child.deleted = true;
        this.children = [];
      },
      DeleteAsync() {
        this.deleted = true;
        if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      },
      SetPanelEvent(eventName, handler) {
        this[eventName] = handler;
      },
    };

    addClasses(panel, classNames);
    if (parent) parent.children.push(panel);
    if (panel.id) panelsById[panel.id] = panel;
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

  return { createPanel, root, chat, messages, panelsById };
}

function createValidatorContext(options = {}) {
  const config = options.config || {};
  const dispatches = [];
  const messages = [];
  const schedules = [];
  const panels = createPanelFactory(options);
  let now = options.now || 1700000000000;
  const nowStep = options.nowStep || 1000;

  function MockDate(...args) {
    return args.length > 0 ? new Date(...args) : new Date(now);
  }
  MockDate.now = () => {
    now += nowStep;
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
        dispatches.push({
          name,
          event: name,
          payload,
          payloadText: payload && Object.prototype.hasOwnProperty.call(payload, 'text') ? String(payload.text) : undefined,
        });
      },
      GetContextPanel: () => panels.root,
      Msg: (message) => {
        messages.push(String(message));
      },
      RegisterForUnhandledEvent: () => {},
      Schedule: (delay, callback) => {
        schedules.push({ delay, callback });
      },
    },
  };

  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return { sandbox, config, dispatches, messages, logs: messages, schedules, panels };
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

function drainScheduledCallbacks(runtime, maxCallbacks = 256) {
  for (let i = 0; i < maxCallbacks && runtime.schedules.length; i += 1) {
    runtime.schedules.shift().callback();
  }
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
  lastScheduledDelay,
  appendChatPanel,
  renderedActionButtons,
  renderedPlayerRows,
  renderedTableSeats,
  renderedLogLines,
  capturePanelIdentity,
};
