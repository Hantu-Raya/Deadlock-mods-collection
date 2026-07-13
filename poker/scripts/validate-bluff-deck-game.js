#!/usr/bin/env node
'use strict';

const path = require('node:path');
const harness = require('./poker-panorama-vm');
const {
  createValidatorContext,
  runScript,
  appendChatPanel,
  advanceScheduledTime,
  drainDueScheduledCallbacks,
  clearDomWrites,
  takeDomWrites,
  findPanel,
  findDescendantsWithClass,
} = harness;

const ROOT = path.resolve(__dirname, '..');
const MENU_SCRIPT = path.join(ROOT, 'panorama', 'scripts', 'poker_escape_menu.js');
const BRIDGE_SCRIPT = path.join(ROOT, 'panorama', 'scripts', 'poker_chat_debug.js');
const failures = [];

function fail(message) { failures.push(String(message)); }
function assert(value, message) { if (!value) fail(message); }
function equal(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function payloadOf(dispatch) {
  if (!dispatch) return null;
  if (dispatch.payload && typeof dispatch.payload === 'object') return dispatch.payload;
  if (typeof dispatch.payload === 'string') {
    try { return JSON.parse(dispatch.payload); } catch (error) { return null; }
  }
  return null;
}
function hasEvent(runtimeContext, eventName, predicate) {
  return runtimeContext.dispatches.some((dispatch) => {
    const payload = payloadOf(dispatch);
    return payload && payload.event === eventName && (!predicate || predicate(payload));
  });
}
function runtime(options = {}) {
  const rt = createValidatorContext({ ...options, nowStep: 0 });
  runScript(rt.sandbox, MENU_SCRIPT);
  const hooks = rt.sandbox.__PokerEscapeMenuTestHooks;
  assert(hooks, 'menu test hooks exported');
  return { rt, hooks, E: hooks.modules.BluffDeckEngine, R: hooks.modules.BluffDeckCommandReducer, A: hooks.modules.BluffDeckActions, C: hooks.modules.BluffDeckControlState, V: hooks.modules.BluffDeckViewModel };
}
function visualRuntime() {
  const panelIds = [
    'BluffDeckWindow', 'BluffDeckHistoryWindow', 'BluffDeckTableSurface', 'BluffDeckCardTable', 'BluffDeckTableSeats',
    'BluffDeckTargetCard', 'BluffDeckPlayedCards', 'BluffDeckAnnouncementOverlay', 'BluffDeckAnnouncementTitle', 'BluffDeckAnnouncementBody',
    'BluffDeckTargetLabel', 'BluffDeckTurnLabel', 'BluffDeckPreviousPlayLabel', 'BluffDeckResultLabel', 'BluffDeckLog',
    'BluffDeckCardSlots', 'BluffDeckActionLabel', 'BluffDeckActionControls', 'BluffDeckPlayButton', 'BluffDeckChallengeButton',
    'BluffDeckPendingLabel', 'BluffDeckStatusLabel', 'BluffDeckSlot0', 'BluffDeckSlot1', 'BluffDeckSlot2', 'BluffDeckSlot3', 'BluffDeckSlot4',
    'BluffDeckLifecycleControls', 'BluffDeckPartyControls', 'BluffDeckMatchControls',
    'BluffDeckHostButton', 'BluffDeckJoinButton', 'BluffDeckLeaveButton', 'BluffDeckStartButton', 'BluffDeckEndButton',
  ];
  const rt = createValidatorContext({ panelIds, nowStep: 0 });
  const target = findPanel(rt, 'BluffDeckTargetCard');
  const face = rt.panels.createPanel('Panel', target, '', 'BluffDeckTargetFace PokerCardContents');
  rt.panels.createPanel('Label', face, '', 'BluffDeckTargetFallback', 'TARGET CARD');
  const challenge = findPanel(rt, 'BluffDeckChallengeButton');
  rt.panels.createPanel('Label', challenge, '', '', '');
  const play = findPanel(rt, 'BluffDeckPlayButton');
  rt.panels.createPanel('Label', play, '', '', '');
  runScript(rt.sandbox, MENU_SCRIPT);
  const hooks = rt.sandbox.__PokerEscapeMenuTestHooks;
  assert(hooks, 'visual menu hooks exported');
  return { rt, hooks, E: hooks.modules.BluffDeckEngine, R: hooks.modules.BluffDeckCommandReducer, A: hooks.modules.BluffDeckActions, C: hooks.modules.BluffDeckControlState, V: hooks.modules.BluffDeckViewModel };
}
function bridgeRuntime(options = {}) {
  const rt = createValidatorContext({ ...options, nowStep: 0 });
  runScript(rt.sandbox, BRIDGE_SCRIPT);
  const hooks = rt.sandbox.__PokerChatDebugTestHooks;
  assert(hooks, 'chat bridge test hooks exported');
  return { rt, hooks };
}
function roster(keys) { return keys.map((key) => ({ key, name: key[0].toUpperCase() + key.slice(1) })); }
function game(E, id, keys) { return E.create({ id, roster: roster(keys) }); }
function apply(E, g, actor, action) { return E.apply(g, actor, action); }
function applyPayload(hooks, record) { return hooks.modules.CommandReducer.applyPayload({ event: 'PokerChatMessage', ...record }); }
function startParty(hooks, keys = ['abrams', 'bebop'], partyId = 'party-test') {
  hooks.seedPartyForTest(roster(keys), partyId, 'leader');
  hooks.state.localPlayerKey = keys[0];
}
function startRecord(hooks, matchId = 'a1b2c3d4', seq = 1, sender = 'Abrams', keys = ['abrams', 'bebop']) {
  const g = game(hooks.modules.BluffDeckEngine, matchId, keys);
  const message = `bd1 s ${matchId} ${g.rosterHash}`;
  applyPayload(hooks, { seq, sender, message, isSelf: sender.toLowerCase() === keys[0] });
  return { g, message, seq };
}
function expectRejectedUnchanged(E, g, actor, action, label) {
  const before = E.debugHash(g);
  const result = apply(E, g, actor, action);
  equal(result.changed, false, `${label} rejected`);
  equal(E.debugHash(g), before, `${label} atomic`);
}
function countRanks(hand) {
  const counts = [0, 0, 0, 0];
  hand.forEach((rank) => { counts[rank] += 1; });
  return counts;
}
function assertInvariant(E, g, label) {
  try { equal(E.assertInvariants(g), true, `${label} invariants`); }
  catch (error) { fail(`${label} invariant throw: ${error.message}`); }
}

function testOracleAndEngine() {
  const r = runtime();
  const { E } = r;
  const vectors = [
    { id: 'a1b2c3d4', keys: ['abrams', 'bebop'], hash: 'ee089699', target: 2, starter: 0, risk: [5, 1], hands: [[0, 3, 3, 1, 2], [2, 2, 0, 2, 0]], debug: '5511cd0d' },
    { id: '11223344', keys: ['abrams', 'bebop', 'calico'], hash: '0cfed7b2', target: 2, starter: 0, risk: [3, 0, 4], hands: [[1, 0, 2, 0, 1], [0, 0, 1, 2, 2], [2, 3, 1, 2, 0]], debug: 'c374bbe8' },
    { id: 'deadbeef', keys: ['abrams', 'bebop', 'calico', 'dynamo'], hash: '6334fc34', target: 1, starter: 1, risk: [4, 3, 5, 4], hands: [[0, 2, 3, 3, 1], [1, 1, 1, 1, 1], [2, 0, 2, 0, 2], [2, 0, 0, 0, 2]], debug: 'a5bb8263' },
  ];
  for (const vector of vectors) {
    const g = game(E, vector.id, vector.keys);
    equal(g.rosterHash, vector.hash, `${vector.id} roster hash`);
    equal(g.target, vector.target, `${vector.id} target`);
    equal(g.currentIndex, vector.starter, `${vector.id} starter`);
    equal(g.players.map((p) => p.outIndex), vector.risk, `${vector.id} risk vectors`);
    equal(g.players.map((p) => p.hand), vector.hands, `${vector.id} hands`);
    equal(E.debugHash(g), vector.debug, `${vector.id} initial debug hash`);
    equal(g.players.every((p) => p.remainingMask === 31 && p.riskIndex === 0), true, `${vector.id} initial masks/risk`);
    const total = g.players.reduce((sum, p) => sum + countRanks(p.hand).reduce((a, b) => a + b, 0), 0);
    equal(total, vector.keys.length * 5, `${vector.id} five-card deals`);
    const all = [0, 1, 2, 3].map((rank) => g.players.reduce((sum, p) => sum + countRanks(p.hand)[rank], 0));
    equal(all, vector.keys.length === 2 ? [3, 1, 4, 2] : vector.keys.length === 3 ? [5, 4, 5, 1] : [6, 6, 6, 2], `${vector.id} rank counting`);
    assertInvariant(E, g, vector.id);
  }
  const g = game(E, 'a1b2c3d4', ['abrams', 'bebop']);
  const p = E.projectText(g, 'abrams', 0x05, null);
  equal(p, {
    headerText: 'BLUFF DECK\nROUND 1', targetText: 'TARGET\nQUEEN', turnText: 'TURN\nABRAMS', previousPlayText: '',
    handText: '[ACE*] [JOKER] [JOKER*] [KING] [QUEEN]', opponentTexts: ['BEBOP\nCARDS 5\nRISK 0/6'],
    actionText: 'PLAY 2 SELECTED', pendingText: '', resultText: '', logTexts: [],
  }, 'oracle projection');
  assert(!JSON.stringify(p).includes('BEBOP.*ACE'), 'opponent ranks never projected');
  expectRejectedUnchanged(E, g, 'abrams', { type: 'play', mask: 0 }, 'zero-card play');
  expectRejectedUnchanged(E, g, 'abrams', { type: 'play', mask: 15 }, 'four-card play');
  expectRejectedUnchanged(E, g, 'abrams', { type: 'play', mask: 0x20 }, 'out-of-range mask');
  const unavailable = game(E, 'a1b2c3d4', ['abrams', 'bebop']);
  unavailable.players[0].remainingMask = 1;
  expectRejectedUnchanged(E, unavailable, 'abrams', { type: 'play', mask: 2 }, 'unavailable card');
  expectRejectedUnchanged(E, g, 'bebop', { type: 'play', mask: 1 }, 'stale actor');
  const played = apply(E, g, 'abrams', { type: 'play', mask: 1 });
  assert(played.changed && g.seq === 1 && g.lastPlay && g.lastPlay.mask === 1, 'accepted play records one sequence');
  assertInvariant(E, g, 'after play');
  const challenged = apply(E, g, 'bebop', { type: 'challenge' });
  assert(challenged.changed && !challenged.roundEnded, 'accepted challenge only reveals');
  assert(g.lastResult && g.lastResult.revealed.length === 1, 'challenge reveals exactly played slots');
  assert(g.lastPlay && g.pendingShot && g.seq === 2, 'challenge leaves pending shot and increments once');
  equal(E.legalActions(g, 'bebop').canShoot, false, 'caller cannot shoot on false call');
  equal(E.legalActions(g, 'abrams').canShoot, true, 'accused shoots on false call');
  assert(E.projectText(g, 'abrams', 0, null).resultText.includes('REVEAL:'), 'last result retained through shot decision');
  const shot = apply(E, g, 'abrams', { type: 'shoot' });
  assert(shot.changed && shot.roundEnded && !g.pendingShot && g.seq === 3, 'accepted shot resolves roulette');
  const next = g.players[g.currentIndex];
  const legal = E.legalActions(g, next.key);
  assert(legal.canPlay || legal.canChallenge, 'next round has legal current action');
  const nextMask = next.remainingMask & 1 ? 1 : next.remainingMask & 2 ? 2 : 4;
  if (legal.canPlay && nextMask) apply(E, g, next.key, { type: 'play', mask: nextMask });
  assert(g.lastResult === null, 'accepted play clears prior result');
  const truth = game(E, 'a1b2c3d4', ['abrams', 'bebop']);
  truth.players[0].hand[0] = truth.target;
  assert(apply(E, truth, truth.players[0].key, { type: 'play', mask: 1 }).changed, 'truth fixture play');
  assert(apply(E, truth, truth.players[1].key, { type: 'challenge' }).changed, 'truth challenge reveals');
  equal(truth.pendingShot.shooterIndex, 1, 'truthful call makes caller shooter');
  equal(E.legalActions(truth, truth.players[0].key).canShoot, false, 'accused cannot shoot truthful call');
  equal(E.legalActions(truth, truth.players[1].key).canShoot, true, 'caller can shoot truthful call');
  assert(apply(E, truth, truth.players[1].key, { type: 'shoot' }).changed, 'truthful caller shot');

  const abortGame = game(E, 'a1b2c3d4', ['abrams', 'bebop']);
  equal(E.debugHash(abortGame), '5511cd0d', 'abort source hash');
  const aborted = E.abort(abortGame);
  assert(aborted.changed && abortGame.aborted && !abortGame.finished && !abortGame.winnerKey, 'manual abort terminal shape');
  equal(E.debugHash(abortGame), '0efc5e46', 'manual abort hash');
  equal(E.projectText(abortGame, 'abrams', 0, null).resultText, 'MATCH ENDED BY TABLE LEADER', 'manual abort projection');
  assertInvariant(E, abortGame, 'manual abort');
  equal(E.abort(abortGame).changed, false, 'abort is active-only');

  const out = game(E, 'a1b2c3d4', ['abrams', 'bebop']);
  out.players[0].outIndex = 0;
  out.players[0].hand[0] = out.target === 0 ? 1 : 0;
  const outPlay = apply(E, out, out.players[0].key, { type: 'play', mask: 1 });
  assert(outPlay.changed, 'out fixture play');
  const outResult = apply(E, out, out.players[1].key, { type: 'challenge' });
  assert(outResult.changed && !outResult.roundEnded && out.pendingShot, 'out challenge waits for trigger');
  const outShot = apply(E, out, out.players[0].key, { type: 'shoot' });
  assert(outShot.changed && outShot.matchEnded && out.finished && out.winnerKey === out.players[1].key, 'elimination/winner boundary');
  assert(out.players[0].status === 'eliminated' && out.players[0].riskIndex === 1, 'OUT consumes one risk');
  assertInvariant(E, out, 'natural winner');

  const departed = game(E, '11223344', ['abrams', 'bebop', 'calico']);
  const leaveResult = E.depart(departed, 'bebop');
  assert(leaveResult.changed && departed.players[1].status === 'left' && departed.round === 2, 'active departure redeals');
  equal(departed.players.length, 3, 'departure preserves fixed seats');
  assertInvariant(E, departed, 'departure');
  equal(E.depart(departed, 'bebop').changed, false, 'already-left departure no-op');
  equal(E.depart(departed, 'observer').changed, false, 'observer departure no-op');

  const cap = game(E, 'deadbeef', ['abrams', 'bebop', 'calico', 'dynamo']);
  for (let i = 0; i < 9 && cap.active; i += 1) {
    const actor = cap.players[cap.currentIndex];
    const mask = actor.remainingMask & 1 ? 1 : actor.remainingMask & 2 ? 2 : 4;
    if (!mask) break;
    const pResult = apply(E, cap, actor.key, { type: 'play', mask });
    const cResult = apply(E, cap, cap.players[cap.currentIndex].key, { type: 'challenge' });
    if (!cResult.changed || !cap.pendingShot) break;
    const shooter = cap.players[cap.currentIndex];
    const sResult = apply(E, cap, shooter.key, { type: 'shoot' });
    if (!sResult.changed) break;
  }
  assert(cap.log.length <= 8, 'log is capped at eight entries');
  assertInvariant(E, cap, 'log cap');
}

function testViewModelAdapter() {
  const r = runtime();
  const { hooks, E, V } = r;
  const emptyParty = { id: "", mode: "none", leaderKey: "", leaderName: "", members: {}, order: [] };
  const makeState = (gameState, localKey, selectedMask = 0, pending = null, party = emptyParty) => ({
    game: null,
    localPlayerKey: localKey || "",
    party: clone(party),
    bluffDeck: { game: gameState ? clone(gameState) : null, selectedMask, pending, transcript: [] },
  });
  equal(V.build(makeState(null, "")).stateClass, "Idle", "view model idle state");
  const lobbyParty = {
    id: "party-test",
    mode: "leader",
    leaderKey: "abrams",
    leaderName: "Abrams",
    members: { abrams: { key: "abrams", name: "Abrams" }, bebop: { key: "bebop", name: "Bebop" } },
    order: ["abrams", "bebop"],
  };
  const lobby = V.build(makeState(null, "abrams", 0, null, lobbyParty));
  equal(lobby.stateClass, "Lobby", "view model lobby state");
  equal(lobby.header.phase, "LOBBY", "lobby phase");
  const localGame = E.create({ id: "a1b2c3d4", roster: roster(["abrams", "bebop"]) });
  const localKey = localGame.players[localGame.currentIndex].key;
  const opponentKey = localGame.players.find((player) => player.key !== localKey).key;
  const local = V.build(makeState(localGame, localKey, 1, null, lobbyParty));
  equal(local.stateClass, "LocalTurn", "view model local turn state");
  assert(local.seats.arrowClass && local.actions.play.eligible, "local turn exposes static arrow and eligible play");
  assert(local.actions.hint === "SELECT CARDS OR CALL LIE" || /^SELECT CARDS/.test(local.actions.hint), "local turn action hint");
  assert(local.cards.slots.every((slot) => slot.rank || !slot.valid), "local slots expose only local ranks");
  const opponent = V.build(makeState(localGame, opponentKey, 0, null, lobbyParty));
  equal(opponent.stateClass, "OpponentTurn", "view model opponent turn state");
  assert(/^WAITING FOR /.test(opponent.actions.hint) && opponent.actions.play.hidden, "opponent turn is read-only waiting");
  const pending = V.build(makeState(localGame, localKey, 1, { bridgeStatus: "queued" }, lobbyParty));
  equal(pending.stateClass, "Pending", "pending state takes precedence");
  assert(pending.feedback.statusText === "SENDING..." && !pending.actions.play.enabled && !pending.actions.challenge.enabled, "pending disables choice controls once");
  const invalidCount = V.build(makeState(localGame, localKey, 0, null, lobbyParty));
  assert(invalidCount.actions.hint === "SELECT 1-3 CARDS" && !invalidCount.actions.play.eligible, "invalid selection count is explicit");
  const challengeGame = E.create({ id: "a1b2c3d4", roster: roster(["abrams", "bebop"]) });
  const actor = challengeGame.players[challengeGame.currentIndex];
  assert(E.apply(challengeGame, actor.key, { type: "play", mask: 1 }).changed, "adapter challenge play");
  const caller = challengeGame.players[challengeGame.currentIndex];
  assert(E.apply(challengeGame, caller.key, { type: "challenge" }).changed, "adapter challenge transition");
  const challenge = V.build(makeState(challengeGame, caller.key, 0, null, lobbyParty));
  equal(challenge.stateClass, "Challenge", "view model challenge state");
  assert(challenge.feedback.resultText.includes("REVEAL:"), "challenge result is primary feedback");
  const finishedGame = E.create({ id: "11223344", roster: roster(["abrams", "bebop", "calico"]) });
  finishedGame.active = false;
  finishedGame.finished = true;
  finishedGame.winnerKey = "bebop";
  const finished = V.build(makeState(finishedGame, "abrams", 0, null, lobbyParty));
  equal(finished.stateClass, "Finished", "view model finished state");
  assert(finished.announcement.title === "BEBOP WINS", "finished announcement names winner");
  for (const [id, keys, positions] of [
    ["a1b2c3d4", ["abrams", "bebop"], ["SeatLeft", "SeatRight"]],
    ["11223344", ["abrams", "bebop", "calico"], ["SeatLeft", "SeatTopRight", "SeatBottomRight"]],
    ["deadbeef", ["abrams", "bebop", "calico", "dynamo"], ["SeatTopLeft", "SeatTopRight", "SeatBottomRight", "SeatBottomLeft"]],
  ]) {
    const model = V.build(makeState(E.create({ id, roster: roster(keys) }), "abrams", 0, null, { ...lobbyParty, order: keys, members: Object.fromEntries(keys.map((key) => [key, { key, name: key }])) }));
    equal(model.seats.rows.map((row) => row.positionClass), positions, `${keys.length}-player seat geometry`);
  }
  const serialized = JSON.stringify(local);
  assert(!serialized.includes("BEBOP") || !serialized.includes("ACE"), "view model keeps opponent ranks private");
}

function testProtocolAndHydration() {
  const r = runtime();
  const { hooks, E, R } = r;
  const valid = [
    ['bd1 s a1b2c3d4 ee089699', { type: 'start', matchId: 'a1b2c3d4', rosterHash: 'ee089699' }],
    ['bd1 p a1b2c3d4 1 5', { type: 'play', matchId: 'a1b2c3d4', seq: 1, mask: 5 }],
    ['bd1 c a1b2c3d4 2', { type: 'challenge', matchId: 'a1b2c3d4', seq: 2 }],
    ['bd1 r a1b2c3d4 3', { type: 'shoot', matchId: 'a1b2c3d4', seq: 3 }],
    ['bd1 e a1b2c3d4', { type: 'end', matchId: 'a1b2c3d4' }],
  ];
  for (const [text, expected] of valid) {
    const got = R.decode(text);
    for (const key of Object.keys(expected)) equal(got[key], expected[key], `${text} decode ${key}`);
  }
  equal(R.decode('bd1'), null, 'bare bd1 is non-prefix text');
  for (const text of ['bd1 s', 'bd1 p a1b2c3d4 0 1', 'bd1 p a1b2c3d4 1 100', 'bd1 e a1b2c3d4 extra', 'bd1 x a1b2c3d4']) {
    equal(R.decode(text).type, 'invalid', `${text} malformed consumed`);
  }
  equal(R.decode('poker start a'), null, 'non-bd1 remains separate');
  startParty(hooks);
  const started = startRecord(hooks);
  const g = hooks.getStateSnapshot().bluffDeck.game;
  assert(g && E.debugHash(g) === E.debugHash(started.g), 'leader-only start creates deterministic game');
  const before = E.debugHash(g);
  applyPayload(hooks, { seq: 2, sender: 'Bebop', message: 'bd1 p a1b2c3d4 1 1', isSelf: false });
  equal(E.debugHash(hooks.getStateSnapshot().bluffDeck.game), before, 'non-current actor cannot play');
  applyPayload(hooks, { seq: 3, sender: 'Abrams', message: 'bd1 p a1b2c3d4 1 1', isSelf: true });
  assert(hooks.getStateSnapshot().bluffDeck.game.seq === 1, 'current actor play accepted');
  const stateAfterPlay = hooks.getStateSnapshot();
  applyPayload(hooks, { seq: 4, sender: 'Bebop', message: 'bd1 c a1b2c3d4 2', isSelf: false });
  assert(hooks.getStateSnapshot().bluffDeck.game.seq === 2, 'current actor challenge accepted');
  assert(hooks.getStateSnapshot().bluffDeck.game.pendingShot, 'challenge creates pending shot');
  equal(hooks.getStateSnapshot().bluffDeck.pending, null, 'accepted echo clears pending');
  const stale = E.debugHash(hooks.getStateSnapshot().bluffDeck.game);
  applyPayload(hooks, { seq: 5, sender: 'Bebop', message: 'bd1 c a1b2c3d4 2', isSelf: false });
  equal(E.debugHash(hooks.getStateSnapshot().bluffDeck.game), stale, 'stale duplicate ignored');
  applyPayload(hooks, { seq: 6, sender: 'Abrams', message: 'bd1 r a1b2c3d4 9', isSelf: false });
  assert(hooks.getStateSnapshot().bluffDeck.game.desynced, 'authorized future gap desyncs');
  assert(hasEvent(r.rt, 'PokerChatSnapshotRequest'), 'gap requests snapshot');
  const foreign = E.debugHash(hooks.getStateSnapshot().bluffDeck.game);
  applyPayload(hooks, { seq: 7, sender: 'Abrams', message: 'bd1 e deadbeef', isSelf: false });
  equal(E.debugHash(hooks.getStateSnapshot().bluffDeck.game), foreign, 'foreign match ignored');
  // Unknown self mapping is exact-pending only.
  const self = runtime();
  startParty(self.hooks);
  startRecord(self.hooks);
  const selfState = self.hooks.state.bluffDeck;
  self.hooks.state.localPlayerKey = 'abrams';
  selfState.pending = { message: 'bd1 p a1b2c3d4 1 1', matchId: 'a1b2c3d4', expectedSeq: 1, requestId: 'bd1:a1b2c3d4:1:1', bridgeStatus: 'queued', requestedAt: 1, sentAt: 0, expiresAt: 2 };
  applyPayload(self.hooks, { seq: 2, sender: '<unknown>', message: selfState.pending.message, isSelf: true });
  assert(self.hooks.getStateSnapshot().bluffDeck.game.seq === 1, 'unknown self exact pending mapping');
  const remote = runtime();
  startParty(remote.hooks);
  startRecord(remote.hooks);
  applyPayload(remote.hooks, { seq: 2, sender: '<unknown>', message: 'bd1 p a1b2c3d4 1 1', isSelf: false });
  assert(remote.hooks.getStateSnapshot().bluffDeck.game.seq === 1, 'unknown remote current-actor mapping');
  // Hydration requires start/high-water evidence and preserves concealed state.
  const config = {};
  const source = runtime({ config });
  startParty(source.hooks);
  startRecord(source.hooks, 'a1b2c3d4', 1);
  const sourceGame = source.hooks.getStateSnapshot().bluffDeck.game;
  applyPayload(source.hooks, { seq: 2, sender: 'Abrams', message: 'bd1 p a1b2c3d4 1 1', isSelf: true });
  applyPayload(source.hooks, { seq: 3, sender: 'Bebop', message: 'bd1 c a1b2c3d4 2', isSelf: false });
  const saved = source.hooks.getStateSnapshot().bluffDeck.game;
  assert(config.BluffDeckMatchState && config.BluffDeckMatchState.game.pendingShot, 'committed pending-shot envelope saved');
  const restored = runtime({ config });
  startParty(restored.hooks);
  restored.hooks.handleReadyEvent(JSON.stringify({ event: 'PokerChatMessage', action: 'snapshot', messages: [
    { seq: 1, sender: 'Abrams', message: 'bd1 s a1b2c3d4 ee089699', isSelf: false },
    { seq: 2, sender: 'Abrams', message: 'bd1 p a1b2c3d4 1 1', isSelf: false },
    { seq: 3, sender: 'Bebop', message: 'bd1 c a1b2c3d4 2', isSelf: false },
  ] }));
  equal(E.debugHash(restored.hooks.getStateSnapshot().bluffDeck.game), E.debugHash(saved), 'snapshot hydration hash convergence');
  assertInvariant(E, restored.hooks.getStateSnapshot().bluffDeck.game, 'hydrated game');
  // Invalid candidate is fail-closed.
  const bad = runtime({ config: { BluffDeckMatchState: { version: 1, sourceChatSeq: 99, game: clone(saved) } } });
  bad.hooks.handleReadyEvent(JSON.stringify({ event: 'PokerChatMessage', action: 'snapshot', messages: [] }));
  assert(!bad.hooks.getStateSnapshot().bluffDeck.game, 'incomplete hydration is unavailable');
  equal(bad.hooks.getStateSnapshot().bluffDeck.transcript, [], 'unavailable hydration resets transcript');
  // Scoped departure is strict and mutates only with exact next sequence.
  const dep = runtime();
  startParty(dep.hooks);
  startRecord(dep.hooks);
  const beforeDepSeq = dep.hooks.getStateSnapshot().bluffDeck.game.seq;
  applyPayload(dep.hooks, { seq: 2, sender: 'Abrams', message: '[party leave] poker party party-test bd1 a1b2c3d4 1', isSelf: true });
  equal(dep.hooks.getStateSnapshot().bluffDeck.game.seq, beforeDepSeq + 1, 'scoped departure sequence');
  const malformed = runtime();
  startParty(malformed.hooks);
  startRecord(malformed.hooks);
  const malformedBefore = E.debugHash(malformed.hooks.getStateSnapshot().bluffDeck.game);
  applyPayload(malformed.hooks, { seq: 2, sender: 'Abrams', message: '[party leave] poker party party-test bd1 a1b2c3d4 1 extra', isSelf: true });
  equal(E.debugHash(malformed.hooks.getStateSnapshot().bluffDeck.game), malformedBefore, 'extra suffix never mutates game');
  assert(malformed.hooks.getStateSnapshot().party.members.abrams == null, 'ordinary leave still removes party member');
  // Mutual exclusion and manual end authority.
  const end = runtime();
  startParty(end.hooks);
  end.hooks.state.game = { active: true };
  applyPayload(end.hooks, { seq: 1, sender: 'Abrams', message: 'bd1 s a1b2c3d4 ee089699', isSelf: true });
  assert(!end.hooks.getStateSnapshot().bluffDeck.game, 'Poker blocks Bluff start');
}

function testActionsPendingAndRender() {
  const r = runtime();
  const { rt, hooks, E, A } = r;
  startParty(hooks);
  startRecord(hooks);
  hooks.state.localPlayerKey = 'abrams';
  const g = hooks.getStateSnapshot().bluffDeck.game;
  clearDomWrites(rt);
  const before = hooks.getStateSnapshot();
  assert(A.selectMask(0x05), 'selection accepted');
  const selected = hooks.getStateSnapshot();
  equal(selected.bluffDeck.selectedMask, 0x05, 'selection updates local only');
  equal(selected.bluffDeck.game.seq, before.bluffDeck.game.seq, 'selection does not commit game');
  assert(!hasEvent(rt, 'PokerChatSendRequest', (payload) => payload.source === 'bluff-deck'), 'selection emits no chat');
  drainDueScheduledCallbacks(rt, 32);
  takeDomWrites(rt);
  assert(A.sendPlay(), 'play sends one pending request');
  const sends = rt.dispatches.map(payloadOf).filter((payload) => payload && payload.event === 'PokerChatSendRequest' && payload.source === 'bluff-deck');
  equal(sends.length, 1, 'one Bluff request');
  const pending = hooks.getStateSnapshot().bluffDeck.pending;
  assert(pending && pending.bridgeStatus === 'queued' && pending.requestId.startsWith('bd1:a1b2c3d4:1:'), 'queued pending identity');
  assert(!A.sendPlay(), 'duplicate intent blocked');
  equal(rt.dispatches.map(payloadOf).filter((payload) => payload && payload.event === 'PokerChatSendRequest' && payload.source === 'bluff-deck').length, 1, 'duplicate emits none');
  hooks.handleReadyEvent(JSON.stringify({ event: 'BluffDeckSendStatus', requestId: pending.requestId, message: pending.message, status: 'submitted' }));
  assert(hooks.getStateSnapshot().bluffDeck.pending.bridgeStatus === 'submitted', 'submitted status accepted');
  advanceScheduledTime(rt, 2999, 32);
  assert(hooks.getStateSnapshot().bluffDeck.pending, '2999ms retains pending');
  advanceScheduledTime(rt, 1, 32);
  assert(!hooks.getStateSnapshot().bluffDeck.pending, '3000ms clears pending');
  assert(hasEvent(rt, 'PokerChatSnapshotRequest'), 'pending timeout requests snapshot');

  const prep = runtime();
  startParty(prep.hooks);
  startRecord(prep.hooks);
  prep.hooks.state.localPlayerKey = 'abrams';
  prep.A.selectMask(1);
  assert(prep.A.sendPlay(), 'preparation request');
  const prepPending = prep.hooks.getStateSnapshot().bluffDeck.pending;
  advanceScheduledTime(prep.rt, 3500, 32);
  assert(prep.hooks.getStateSnapshot().bluffDeck.pending.bridgeStatus === 'cancelling', 'preparation timeout requests cancellation');
  assert(hasEvent(prep.rt, 'BluffDeckSendCancelRequest', (payload) => payload.requestId === prepPending.requestId), 'exact cancellation request');
  prep.hooks.handleReadyEvent(JSON.stringify({ event: 'BluffDeckSendStatus', requestId: prepPending.requestId, message: prepPending.message, status: 'cancelled' }));
  assert(!prep.hooks.getStateSnapshot().bluffDeck.pending, 'cancel confirmation clears pending');
  // Old status cannot clear newer pending.
  prep.A.selectMask(1);
  prep.A.sendPlay();
  const newer = prep.hooks.getStateSnapshot().bluffDeck.pending;
  prep.hooks.handleReadyEvent(JSON.stringify({ event: 'BluffDeckSendStatus', requestId: prepPending.requestId, message: prepPending.message, status: 'failed' }));
  assert(prep.hooks.getStateSnapshot().bluffDeck.pending.requestId === newer.requestId, 'old status cannot clear newer pending');
  const resetFlow = runtime();
  startParty(resetFlow.hooks);
  startRecord(resetFlow.hooks);
  resetFlow.hooks.state.localPlayerKey = 'abrams';

  assert(resetFlow.A.selectMask(1), 'selection reset fixture selects card');
  applyPayload(resetFlow.hooks, { seq: 2, sender: 'Abrams', message: 'bd1 p a1b2c3d4 1 1', isSelf: false });
  equal(resetFlow.hooks.getStateSnapshot().bluffDeck.selectedMask, 0, 'accepted play clears selection');
  applyPayload(resetFlow.hooks, { seq: 3, sender: 'Bebop', message: 'bd1 c a1b2c3d4 2', isSelf: false });
  equal(resetFlow.hooks.getStateSnapshot().bluffDeck.selectedMask, 0, 'accepted challenge clears selection');
  applyPayload(resetFlow.hooks, { seq: 4, sender: 'Abrams', message: 'bd1 r a1b2c3d4 3', isSelf: false });
  equal(resetFlow.hooks.getStateSnapshot().bluffDeck.selectedMask, 0, 'accepted shoot clears selection');
  // Coalesced render seam: several local changes yield at most one due callback.
  clearDomWrites(rt);
  hooks.modules.PokerMetrics.reset();
  hooks.modules.RenderScheduler.defer('validator-a');
  hooks.modules.RenderScheduler.defer('validator-b');
  drainDueScheduledCallbacks(rt, 32);
  const metrics = hooks.modules.PokerMetrics.snapshot();
  assert(metrics.counters.renderFlush <= 1, 'render requests coalesce');
}

function testVisualProjection() {
  const v = visualRuntime();
  startParty(v.hooks);
  startRecord(v.hooks);
  v.hooks.state.localPlayerKey = 'abrams';
  v.hooks.state.selectedTableGame = 'bluff-deck';
  v.rt.sandbox.PokerEscapeMenuToggle();
  drainDueScheduledCallbacks(v.rt, 64);
  const target = findPanel(v.rt, 'BluffDeckTargetCard');
  const announcement = findPanel(v.rt, 'BluffDeckAnnouncementOverlay');
  assert(announcement.BHasClass('LocalTurn'), 'Bluff announcement exposes local turn semantic state');
  assert(findPanel(v.rt, 'BluffDeckAnnouncementTitle').text === 'YOUR TURN', 'Bluff announcement title names local turn');
  const targetArts = findDescendantsWithClass(target, 'PokerCardVtexArt');
  assert(targetArts.length === 1 && targetArts[0].src.indexOf('card_face_queen.vtex') >= 0, 'target card renders public VTex art');
  const bluffSeats = findPanel(v.rt, 'BluffDeckTableSeats');
  const renderedSeatPanels = findDescendantsWithClass(bluffSeats, 'PokerTableSeat');
  assert(renderedSeatPanels.length === 2, 'active Bluff game renders two shared Poker seats');
  const renderedSeatNames = renderedSeatPanels.map((seat) => {
    const labels = findDescendantsWithClass(seat, 'PokerTableSeatName');
    return labels.length ? labels[0].text : '';
  });
  assert(renderedSeatNames[0] === 'Abrams' && renderedSeatNames[1] === 'Bebop', 'active Bluff seats use canonical player names');
  assert(renderedSeatPanels.every((seat) => findDescendantsWithClass(seat, 'PokerCard').length === 0), 'waiting Bluff seats create no default Poker cards');
  const activeArrow = findDescendantsWithClass(bluffSeats, 'PokerTableTurnArrow');
  assert(activeArrow.length === 1 && !activeArrow[0].BHasClass('PokerHidden'), 'active Bluff game shows one table turn arrow');
  const seatProjection = v.hooks.modules.BluffDeckSeatProjection.project(v.hooks.getStateSnapshot().bluffDeck.game, v.hooks.getStateSnapshot().party);
  assert(seatProjection.rows[0].stateText === 'TURN' || seatProjection.rows[1].stateText === 'TURN', 'Bluff seat projection marks the active turn');
  assert(seatProjection.rows.every((row) => /^CARDS \d+  RISK \d+\/6$/.test(row.stackText)), 'Bluff seat projection shows remaining cards and risk');
  equal(seatProjection.rows.map((row) => row.positionClass), ['SeatLeft', 'SeatRight'], 'Bluff seats preserve the two-seat table layout');
  const threeGame = v.E.create({ id: '11223344', roster: roster(['abrams', 'bebop', 'calico']) });
  const threeRows = v.hooks.modules.BluffDeckSeatProjection.project(threeGame, v.hooks.getStateSnapshot().party).rows;
  equal(threeRows.map((row) => row.positionClass), ['SeatLeft', 'SeatTopRight', 'SeatBottomRight'], 'Bluff seats preserve the three-seat table layout');
  const fourGame = v.E.create({ id: 'deadbeef', roster: roster(['abrams', 'bebop', 'calico', 'dynamo']) });
  const fourRows = v.hooks.modules.BluffDeckSeatProjection.project(fourGame, v.hooks.getStateSnapshot().party).rows;
  equal(fourRows.map((row) => row.positionClass), ['SeatTopLeft', 'SeatTopRight', 'SeatBottomRight', 'SeatBottomLeft'], 'Bluff seats preserve the four-seat table layout');
  const countGame = v.E.create({ id: 'a1b2c3d4', roster: roster(['abrams', 'bebop']) });
  countGame.lastPlay = { actorIndex: 0, mask: 7, count: 3 };
  const countRows = v.hooks.modules.BluffDeckSeatProjection.project(countGame, v.hooks.getStateSnapshot().party).rows;
  assert(countRows[0].cardMode === 'public-count' && countRows[0].cards.length === 3 && countRows[0].publicCardCount === 3, 'public Bluff projection renders exactly N anonymous card models');
  assert(countRows[1].cardMode === 'none' && countRows[1].cards.length === 0, 'public Bluff projection keeps non-actors card-free');
  const waitingParty = { order: ['abrams', 'bebop', 'calico'], members: { abrams: { name: 'Abrams' }, bebop: { name: 'Bebop' }, calico: { name: 'Calico' } } };
  const waitingRows = v.hooks.modules.BluffDeckSeatProjection.project(null, waitingParty).rows;
  assert(waitingRows.length === 3 && waitingRows.every((row) => row.stateText === 'WAITING' && row.stackText === 'WAITING'), 'waiting Bluff roster renders shared seats with waiting state');
  assert(waitingRows.every((row) => row.cardMode === 'none' && row.cards.length === 0), 'waiting Bluff seats have no private card models');
  assert(v.hooks.modules.BluffDeckSeatProjection.project(null, waitingParty).arrowClass === '', 'waiting Bluff roster hides the turn arrow');
  const endedGame = v.E.create({ id: 'deadbeef', roster: roster(['abrams', 'bebop']) });
  endedGame.active = false;
  endedGame.finished = true;
  endedGame.aborted = false;
  endedGame.winnerKey = 'bebop';
  endedGame.players[0].status = 'eliminated';
  endedGame.players[0].remainingMask = 0;
  const endedRows = v.hooks.modules.BluffDeckSeatProjection.project(endedGame, waitingParty).rows;
  assert(endedRows[0].stateText === 'OUT' && endedRows[1].stateText === 'WINNER' && endedRows[1].classes.winner, 'ended Bluff projection retains OUT and winner state');
  assert(v.hooks.modules.BluffDeckSeatProjection.project(endedGame, waitingParty).arrowClass === '', 'ended Bluff projection hides the turn arrow');
  const leftGame = v.E.create({ id: 'deadbeef', roster: roster(['abrams', 'bebop']) });
  leftGame.players[1].status = 'left';
  leftGame.players[1].remainingMask = 0;
  const leftRows = v.hooks.modules.BluffDeckSeatProjection.project(leftGame, waitingParty).rows;
  assert(leftRows[1].stateText === 'LEFT', 'active Bluff projection retains LEFT state');
  v.hooks.state.localPlayerKey = 'bebop';
  v.hooks.state.bluffDeck.selectedMask = 1;
  v.hooks.modules.TableRenderer.render(v.hooks.modules.ViewModel.build());
  const offTurnSlot = findPanel(v.rt, 'BluffDeckSlot0');
  assert(offTurnSlot.BHasClass('Disabled'), 'off-turn card button visibly disables');
  assert(offTurnSlot.hittest === false, `off-turn card button rejects hit testing: ${offTurnSlot.hittest}`);
  equal(v.hooks.getStateSnapshot().bluffDeck.selectedMask, 0, 'off-turn render clears stale selection');
  assert(!v.hooks.modules.TableGamePicker.selectBluffSlot(0) && !v.A.selectMask(1), 'authoritative selection policy rejects off-turn card activation');
  equal(v.hooks.getStateSnapshot().bluffDeck.selectedMask, 0, 'off-turn activation cannot change selection state');
  assert(!offTurnSlot.BHasClass('Selected'), 'disabled off-turn card never retains Selected styling');
  v.hooks.state.localPlayerKey = 'abrams';
  v.hooks.modules.TableRenderer.render(v.hooks.modules.ViewModel.build());
  assert(v.A.selectMask(1), 'visual fixture selects local card');
  drainDueScheduledCallbacks(v.rt, 64);
  const slot = findPanel(v.rt, 'BluffDeckSlot0');
  assert(slot.BHasClass('Selected') && findDescendantsWithClass(slot, 'PokerCardVtexArt').length === 1, 'local selected slot renders face art and Selected');
  const initialSlots = [0, 1, 2, 3, 4].map((index) => findPanel(v.rt, `BluffDeckSlot${index}`));
  assert(initialSlots.every((panel) => findDescendantsWithClass(panel, 'PokerCardVtexArt').length === 1), 'all five initial local cards render VTex art');
  assert(initialSlots.every((panel) => findDescendantsWithClass(panel, 'BluffDeckSlotRankGlyph').every((label) => !/\[[A-Z]+\]/.test(label.text || ''))), 'local card glyphs never expose bracket rank labels');
  assert(initialSlots.every((panel) => findDescendantsWithClass(panel, 'PokerCardVtexArt').every((image) => String(image.src || '').indexOf('card_face_') >= 0)), 'local rank cards use face VTex art including Joker');
  assert(initialSlots.every((panel) => {
    const contents = findDescendantsWithClass(panel, 'BluffDeckSlotContents')[0];
    const art = findDescendantsWithClass(panel, 'PokerCardArt')[0];
    return !!contents && !!art && art.parent === contents;
  }), 'picker VTex art is nested inside card contents so the cream face cannot cover it');
  applyPayload(v.hooks, { seq: 2, sender: 'Abrams', message: 'bd1 p a1b2c3d4 1 3', isSelf: false });
  drainDueScheduledCallbacks(v.rt, 64);
  const postPlaySeats = findDescendantsWithClass(bluffSeats, 'PokerTableSeat');
  const actorSeat = postPlaySeats.find((seat) => findDescendantsWithClass(seat, 'PokerTableSeatName').some((label) => label.text === 'Abrams'));
  const otherSeat = postPlaySeats.find((seat) => findDescendantsWithClass(seat, 'PokerTableSeatName').some((label) => label.text === 'Bebop'));
  const actorBacks = actorSeat ? findDescendantsWithClass(actorSeat, 'PokerCard').filter((card) => card.BHasClass('CardBack')) : [];
  assert(actorBacks.length === 2, 'public Bluff actor seat renders exactly N anonymous backs');
  assert(otherSeat && findDescendantsWithClass(otherSeat, 'PokerCard').length === 0, 'non-actor Bluff seats stay card-free');
  assert(actorSeat && findDescendantsWithClass(actorSeat, 'PokerTableSeatState').some((label) => label.text === 'PLAYED 2'), 'actor seat labels public committed count');
  assert(actorSeat && findDescendantsWithClass(actorSeat, 'PokerCardRank').every((label) => label.text === '?'), 'public Bluff backs never expose ranks');
  assert(actorSeat && findDescendantsWithClass(actorSeat, 'PokerTableSeatName').every((label) => !/\b(?:ACE|KING|QUEEN|JOKER)\b/.test(label.text || '')), 'Bluff actor seat does not expose rank identity');
  const playTranscript = v.hooks.getStateSnapshot().bluffDeck.transcript || [];
  assert(playTranscript.some((row) => row === 'ABRAMS PLAYED 2 CARDS'), 'accepted play appears in committed Bluff transcript');
  const playTranscriptCount = playTranscript.length;
  applyPayload(v.hooks, { seq: 2, sender: '<unknown>', message: 'bd1 p a1b2c3d4 1 3', isSelf: false });
  applyPayload(v.hooks, { seq: 2, sender: 'Abrams', message: 'bd1 malformed', isSelf: false });
  equal(v.hooks.getStateSnapshot().bluffDeck.transcript.length, playTranscriptCount, 'raw/duplicate/malformed rows do not duplicate transcript');
  const played = findPanel(v.rt, 'BluffDeckPlayedCards');
  v.hooks.state.localPlayerKey = 'bebop';
  v.hooks.modules.RenderScheduler.immediate('visual-challengeable-local');
  const playButton = findPanel(v.rt, 'BluffDeckPlayButton');
  const challengeableButton = findPanel(v.rt, 'BluffDeckChallengeButton');
  assert(!playButton.BHasClass('PokerHidden') && !challengeableButton.BHasClass('PokerHidden'), 'challengeable local turn shows both gameplay actions');
  assert(playButton.GetChild(0).text === 'PLAY SELECTED' && challengeableButton.GetChild(0).text === 'LIE' && !challengeableButton.BHasClass('Disabled'), 'challengeable local turn labels PLAY then enabled LIE');
  const backs = findDescendantsWithClass(played, 'CardBack');
  const concealedTilts = backs.map((card) => Object.keys(card.classes).filter((name) => /^BluffDeckStackTilt\d+$/.test(name)));
  assert(backs.length === 2 && findDescendantsWithClass(played, 'PokerCardRank').length === 0, 'committed play renders anonymous back count only');
  assert(concealedTilts.every((classes) => classes.length === 1), 'each concealed played card receives one stable public-data tilt class');
  assert(backs.every((card) => Object.keys(card.classes).every((name) => !/^BluffDeckReveal(?:Count|Slot)/.test(name))), 'concealed stack has no reveal-row positioning classes');
  applyPayload(v.hooks, { seq: 3, sender: 'Bebop', message: 'bd1 c a1b2c3d4 2', isSelf: false });
  drainDueScheduledCallbacks(v.rt, 64);
  const lieTranscript = v.hooks.getStateSnapshot().bluffDeck.transcript || [];
  assert(lieTranscript.some((row) => row === 'BEBOP CALLED LIE ON ABRAMS'), 'accepted LIE call names challenger and accused');
  v.hooks.state.localPlayerKey = 'abrams';
  v.hooks.modules.RenderScheduler.immediate('visual-shooter');
  const revealedCards = findDescendantsWithClass(played, 'Revealed');
  const revealedLayouts = revealedCards.map((card) => Object.keys(card.classes).filter((name) => /^BluffDeckReveal(?:Count|Slot)\d+$/.test(name)).sort());
  assert(revealedCards.length === 2 && findDescendantsWithClass(played, 'PokerCardRank').some((label) => label.text === 'ACE'), 'challenge swaps to exact public reveal');
  assert(revealedLayouts.every((classes) => classes.includes('BluffDeckRevealCount2')), 'two-card LIE reveal selects centered count-two row');
  assert(revealedLayouts.map((classes) => classes.find((name) => /^BluffDeckRevealSlot/.test(name))).sort().join(',') === 'BluffDeckRevealSlot0,BluffDeckRevealSlot1', 'revealed cards receive unique side-by-side slots');
  const challengeButton = findPanel(v.rt, 'BluffDeckChallengeButton');
  assert(!challengeButton.BHasClass('Disabled') && challengeButton.GetChild(0).text === 'PULL TRIGGER', 'pending shooter gets enabled PULL TRIGGER');
  v.hooks.state.localPlayerKey = 'bebop';
  v.hooks.modules.RenderScheduler.immediate('visual-nonshooter');
  const nonshooterState = v.hooks.getStateSnapshot();
  assert(nonshooterState.localPlayerKey === 'bebop', `nonshooter identity updated: ${nonshooterState.localPlayerKey}`);
  const nonshooterGame = nonshooterState.bluffDeck.game;
  const nonshooterControl = v.hooks.modules.BluffDeckControlState.project({
    game: nonshooterGame,
    legal: v.E.legalActions(nonshooterGame, 'bebop'),
    party: nonshooterState.party,
    roster: roster(['abrams', 'bebop']),
    localKey: 'bebop',
    localPlayer: nonshooterGame.players[1],
    isLeader: false,
  });
  assert(nonshooterControl.challenge.hidden, `projection nonshooter hidden=${nonshooterControl.challenge.hidden}`);
  assert(challengeButton.BHasClass('PokerHidden') && challengeButton.BHasClass('Disabled'), `nonshooter has no action button hidden=${challengeButton.BHasClass('PokerHidden')} disabled=${challengeButton.BHasClass('Disabled')}`);
  v.hooks.state.localPlayerKey = 'abrams';
  applyPayload(v.hooks, { seq: 4, sender: 'Abrams', message: 'bd1 r a1b2c3d4 3', isSelf: false });
  drainDueScheduledCallbacks(v.rt, 64);
  const resultTranscript = v.hooks.getStateSnapshot().bluffDeck.transcript || [];
  const postRoundSeats = findDescendantsWithClass(bluffSeats, 'PokerTableSeat');
  assert(postRoundSeats.every((seat) => findDescendantsWithClass(seat, 'PokerCard').length === 0), 'round transition clears public Bluff seat backs');
  assert(resultTranscript.some((row) => /^ABRAMS PULLED TRIGGER: (SAFE|OUT)$/.test(row)), 'shoot result appears after accepted LIE');
  const ordinaryProjection = v.E.projectText(v.hooks.getStateSnapshot().bluffDeck.game, 'abrams', 0, null);
  assert(ordinaryProjection.opponentTexts.every((row) => !/\[(?:ACE|KING|QUEEN|JOKER)\]/.test(row)), 'opponent projection remains rank-anonymous');
  assert(played.children.length === 0 && v.hooks.getStateSnapshot().bluffDeck.selectedMask === 0 && !slot.BHasClass('Selected'), 'shoot clears played cards and selection on new round');
  v.hooks.state.bluffDeck.game = endedGame;
  v.hooks.modules.RenderScheduler.immediate('visual-ended-seats');
  const endedSeatPanels = findDescendantsWithClass(bluffSeats, 'PokerTableSeat');
  assert(endedSeatPanels.length === 2, 'ended Bluff match retains shared seat cards');
  assert(findDescendantsWithClass(endedSeatPanels[0], 'PokerTableSeatState').some((label) => label.text === 'OUT'), 'ended Bluff match renders OUT seat state');
  assert(findDescendantsWithClass(endedSeatPanels[1], 'PokerTableSeatState').some((label) => label.text === 'WINNER'), 'ended Bluff match renders WINNER seat state');
  assert(findDescendantsWithClass(bluffSeats, 'PokerTableTurnArrow').every((arrow) => arrow.BHasClass('PokerHidden')), 'ended Bluff match hides the turn arrow');
  v.hooks.state.bluffDeck.game = null;
  v.hooks.modules.RenderScheduler.immediate('visual-waiting-seats');
  const waitingSeatPanels = findDescendantsWithClass(bluffSeats, 'PokerTableSeat');
  assert(waitingSeatPanels.length === 2 && waitingSeatPanels.every((seat) => findDescendantsWithClass(seat, 'PokerTableSeatState').some((label) => label.text === 'WAITING')), 'waiting party roster renders shared waiting seats');
  assert(findDescendantsWithClass(bluffSeats, 'PokerTableTurnArrow').every((arrow) => arrow.BHasClass('PokerHidden')), 'waiting party roster hides the turn arrow');
}

function testTranscriptCapAndReset() {
  const cap = visualRuntime();
  startParty(cap.hooks, ['abrams', 'bebop', 'calico', 'dynamo']);
  startRecord(cap.hooks, 'deadbeef', 1, 'Abrams', ['abrams', 'bebop', 'calico', 'dynamo']);
  cap.hooks.state.localPlayerKey = 'abrams';
  cap.hooks.state.selectedTableGame = 'bluff-deck';
  cap.rt.sandbox.PokerEscapeMenuToggle();
  drainDueScheduledCallbacks(cap.rt, 64);
  let chatSeq = 2;
  const accepted = [];
  for (let cycle = 0; cycle < 5; cycle += 1) {
    const current = cap.hooks.getStateSnapshot().bluffDeck.game;
    assert(current && current.active, 'cap cycle starts with an active match ' + cycle);
    if (!current || !current.active) break;
    const actor = current.players[current.currentIndex];
    const mask = actor.remainingMask & 1 ? 1 : 2;
    applyPayload(cap.hooks, { seq: chatSeq++, sender: actor.name, message: cap.R.buildPlay(current, mask), isSelf: false });
    const playedState = cap.hooks.getStateSnapshot().bluffDeck.game;
    assert(playedState && playedState.seq !== current.seq, 'cap play accepted for ' + actor.name);
    if (!playedState || playedState.seq === current.seq) break;
    accepted.push(actor.name.toUpperCase() + ' PLAYED ' + playedState.lastPlay.count + ' CARD' + (playedState.lastPlay.count === 1 ? '' : 'S'));
    const challenged = cap.hooks.getStateSnapshot().bluffDeck.game;
    assert(challenged && challenged.active, 'cap challenge starts with an active match');
    if (!challenged || !challenged.active) break;
    const caller = challenged.players[challenged.currentIndex];
    applyPayload(cap.hooks, { seq: chatSeq++, sender: caller.name, message: cap.R.buildChallenge(challenged), isSelf: false });
    const pending = cap.hooks.getStateSnapshot().bluffDeck.game;
    assert(pending && pending.pendingShot, 'cap challenge creates a pending shot');
    if (!pending || !pending.pendingShot) break;
    const challengeResult = pending.lastResult;
    accepted.push(caller.name.toUpperCase() + ' CALLED LIE ON ' + pending.players[challengeResult.accusedIndex].name.toUpperCase());
    const shooter = pending.players[pending.currentIndex];
    shooter.outIndex = (shooter.riskIndex + 1) % 6;
    applyPayload(cap.hooks, { seq: chatSeq++, sender: shooter.name, message: cap.R.buildShoot(pending), isSelf: false });
    const afterShoot = cap.hooks.getStateSnapshot().bluffDeck.game;
    assert(afterShoot && afterShoot.lastResult, 'cap shoot accepted for ' + shooter.name);
    if (!afterShoot || !afterShoot.lastResult) break;
    accepted.push(shooter.name.toUpperCase() + ' PULLED TRIGGER: ' + (afterShoot.lastResult.eliminated ? 'OUT' : 'SAFE'));
  }
  assert(accepted.length === 15, 'deadbeef fixture produces fifteen accepted transcript summaries (got ' + accepted.length + ')');
  const capped = cap.hooks.getStateSnapshot().bluffDeck.transcript || [];
  equal(capped, accepted.slice(-12), 'state transcript retains summaries 4-15 oldest-first');
  cap.hooks.modules.RenderScheduler.immediate('transcript-cap');
  const log = findPanel(cap.rt, 'BluffDeckLog');
  const logRows = findDescendantsWithClass(log, 'BluffDeckLogRow');
  equal(logRows.length, 12, 'rendered transcript retains twelve rows');
  equal(logRows.map((row) => row.text), accepted.slice(-12).map((text, index) => String(index + 1).padStart(2, '0') + '  ' + text), 'rendered transcript prefixes rows 01-12');
  assert(logRows.every((row, index) => row.BHasClass('Latest') === (index === 11)), 'only newest transcript row is Latest');
  const beforeStale = capped.slice();
  applyPayload(cap.hooks, { seq: chatSeq++, sender: 'Abrams', message: 'bd1 malformed', isSelf: false });
  applyPayload(cap.hooks, { seq: chatSeq++, sender: '<unknown>', message: 'bd1 p deadbeef 99 1', isSelf: false });
  equal(cap.hooks.getStateSnapshot().bluffDeck.transcript, beforeStale, 'malformed/stale rows cannot enter bounded transcript');

  const reset = visualRuntime();
  startParty(reset.hooks);
  startRecord(reset.hooks);
  reset.hooks.state.localPlayerKey = 'abrams';
  reset.hooks.state.selectedTableGame = 'bluff-deck';
  reset.rt.sandbox.PokerEscapeMenuToggle();
  drainDueScheduledCallbacks(reset.rt, 64);
  const opening = reset.hooks.getStateSnapshot().bluffDeck.game;
  applyPayload(reset.hooks, { seq: 2, sender: 'Abrams', message: reset.R.buildPlay(opening, 1), isSelf: false });
  assert((reset.hooks.getStateSnapshot().bluffDeck.transcript || []).length === 1, 'reset fixture has a committed row');
  applyPayload(reset.hooks, { seq: 3, sender: 'Abrams', message: 'bd1 e a1b2c3d4', isSelf: false });
  equal(reset.hooks.getStateSnapshot().bluffDeck.transcript, [], 'accepted match end resets Bluff transcript');
  reset.hooks.modules.RenderScheduler.immediate('transcript-reset');
  const resetRows = findDescendantsWithClass(findPanel(reset.rt, 'BluffDeckLog'), 'BluffDeckLogRow');
  equal(resetRows.length, 1, 'reset renders one empty transcript row');
  equal(resetRows[0].text, 'NO TURNS YET', 'empty transcript row is unnumbered');
  assert(!resetRows[0].BHasClass('Latest'), 'empty transcript row is not Latest');
}

function testControlStateProjection() {
  const r = runtime();
  const { E, C } = r;
  const none = { id: "", mode: "none", leaderKey: "", members: {}, order: [] };
  let controls = C.project({ party: none });
  assert(!controls.host.hidden && controls.host.enabled && controls.host.label === "HOST", "blank lobby shows HOST");
  assert(controls.join.hidden, "blank lobby hides JOIN");
  const discovered = { id: "party-test", mode: "none", leaderKey: "", members: { abrams: { key: "abrams", name: "Abrams" } }, order: ["abrams"] };
  controls = C.project({ party: discovered });
  assert(controls.host.hidden && !controls.join.hidden && controls.join.enabled, "discovered lobby shows JOIN only");
  const hosted = { id: "party-test", mode: "leader", leaderKey: "abrams", members: { abrams: { key: "abrams", name: "Abrams" }, bebop: { key: "bebop", name: "Bebop" } }, order: ["abrams", "bebop"] };
  controls = C.project({ party: hosted, localKey: "abrams", roster: roster(["abrams", "bebop"]), isLeader: true });
  assert(controls.host.hidden && controls.join.hidden && !controls.leave.hidden && controls.start.enabled && controls.end.hidden, "hosted lobby shows LEAVE and eligible START");
  controls = C.project({ party: { ...hosted, mode: "member" }, localKey: "bebop", roster: roster(["abrams", "bebop"]), isLeader: false });
  assert(controls.host.hidden && controls.join.hidden && !controls.leave.hidden && controls.start.hidden, "member lobby hides HOST JOIN START");
  const g = game(E, "a1b2c3d4", ["abrams", "bebop"]);
  const openingLegal = E.legalActions(g, "abrams");
  controls = C.project({ game: g, party: hosted, roster: roster(["abrams", "bebop"]), localKey: "abrams", localPlayer: g.players[0], legal: openingLegal, selectedMask: 1, isLeader: true });
  assert(!controls.play.hidden && controls.play.enabled && controls.play.label === "PLAY SELECTED" && controls.challenge.hidden, "opening turn shows PLAY only");
  controls = C.project({ game: g, party: hosted, roster: roster(["abrams", "bebop"]), localKey: "bebop", localPlayer: g.players[1], legal: E.legalActions(g, "bebop"), selectedMask: 1, isLeader: false });
  assert(controls.play.hidden && controls.challenge.hidden, "waiting remote turn has no disabled action buttons");
  E.apply(g, "abrams", { type: "play", mask: 1 });
  const challengeLegal = E.legalActions(g, "bebop");
  controls = C.project({ game: g, party: hosted, roster: roster(["abrams", "bebop"]), localKey: "bebop", localPlayer: g.players[1], legal: challengeLegal, selectedMask: 1, isLeader: false });
  assert(!controls.play.hidden && !controls.challenge.hidden && controls.play.label === "PLAY SELECTED" && controls.challenge.label === "LIE" && controls.challenge.enabled, "challengeable local turn shows PLAY then enabled LIE");
  E.apply(g, "bebop", { type: "challenge" });
  const shooter = g.players[g.pendingShot.shooterIndex];
  const shooterControls = C.project({ game: g, party: hosted, roster: roster(["abrams", "bebop"]), localKey: shooter.key, localPlayer: shooter, legal: E.legalActions(g, shooter.key), isLeader: shooter.key === "abrams" });
  assert(shooterControls.play.hidden && !shooterControls.challenge.hidden && shooterControls.challenge.enabled && shooterControls.challenge.label === "PULL TRIGGER", "pending shot shows enabled PULL TRIGGER only to shooter");
  const other = g.players[g.pendingShot.shooterIndex === 0 ? 1 : 0];
  const otherControls = C.project({ game: g, party: hosted, roster: roster(["abrams", "bebop"]), localKey: other.key, localPlayer: other, legal: E.legalActions(g, other.key), isLeader: other.key === "abrams" });
  assert(otherControls.play.hidden && otherControls.challenge.hidden, "pending shot hides actions from nonshooter");
}

function testRealBridgeRouting() {
  const bridge = bridgeRuntime();
  const message = 'bd1 p a1b2c3d4 1 5';
  appendChatPanel(bridge.rt, 'Abrams', '[Team]', message, false);
  bridge.hooks.modules.ChatBridgeIntake.scanOnce();
  const records = bridge.rt.dispatches.map(payloadOf).filter((payload) => payload && payload.event === 'PokerChatMessage');
  assert(records.some((record) => record.message === message && record.sender === 'Abrams'), 'real bridge routes visible bd1 row');
  bridge.hooks.handleClientOutput(JSON.stringify({ event: 'BluffDeckFastPollRequest', until: bridge.rt.clock.now() + 1000 }));
  assert(Number(bridge.rt.config.TableGameFastPollUntil) > bridge.rt.clock.now(), 'bridge stores Bluff fast-poll TTL');
  appendChatPanel(bridge.rt, 'Abrams', '[Team]', 'bd1 malformed', false);
  bridge.hooks.modules.ChatBridgeIntake.scanOnce();
  const malformed = bridge.rt.dispatches.map(payloadOf).filter((payload) => payload && payload.event === 'PokerChatMessage' && payload.message === 'bd1 malformed');
  equal(malformed.length, 1, 'real bridge consumes malformed bd1 without fallthrough');
}

function testIndependentConvergence() {
  const a = runtime();
  const b = runtime();
  for (const client of [a, b]) startParty(client.hooks, ['abrams', 'bebop'], 'party-test');
  const id = 'a1b2c3d4';
  const g = game(a.E, id, ['abrams', 'bebop']);
  const start = `bd1 s ${id} ${g.rosterHash}`;
  applyPayload(a.hooks, { seq: 1, sender: 'Abrams', message: start, isSelf: true });
  applyPayload(b.hooks, { seq: 1, sender: 'Abrams', message: start, isSelf: false });
  for (let turn = 0; turn < 4; turn += 1) {
    const ag = a.hooks.getStateSnapshot().bluffDeck.game;
    const actor = ag.players[ag.currentIndex];
    const mask = actor.remainingMask & 1 ? 1 : actor.remainingMask & 2 ? 2 : 4;
    const action = { type: 'play', mask };

    const message = a.R.buildPlay(ag, mask);
    applyPayload(a.hooks, { seq: ag.seq + 1, sender: actor.name, message, isSelf: false });
    applyPayload(b.hooks, { seq: b.hooks.getStateSnapshot().bluffDeck.game.seq + 1, sender: actor.name, message, isSelf: false });
    equal(a.E.debugHash(a.hooks.getStateSnapshot().bluffDeck.game), b.E.debugHash(b.hooks.getStateSnapshot().bluffDeck.game), `convergence after play ${turn}`);
    const bg = b.hooks.getStateSnapshot().bluffDeck.game;
    const caller = bg.players[bg.currentIndex];
    const challenge = a.R.buildChallenge(bg);
    applyPayload(a.hooks, { seq: ag.seq + 2, sender: caller.name, message: challenge, isSelf: false });
    applyPayload(b.hooks, { seq: bg.seq + 1, sender: caller.name, message: challenge, isSelf: false });
    equal(a.E.debugHash(a.hooks.getStateSnapshot().bluffDeck.game), b.E.debugHash(b.hooks.getStateSnapshot().bluffDeck.game), `convergence after challenge ${turn}`);
    const pendingA = a.hooks.getStateSnapshot().bluffDeck.game;
    const shooter = pendingA.players[pendingA.currentIndex];
    const shoot = a.R.buildShoot(pendingA);
    applyPayload(a.hooks, { seq: pendingA.seq + 1, sender: shooter.name, message: shoot, isSelf: false });
    const pendingB = b.hooks.getStateSnapshot().bluffDeck.game;
    applyPayload(b.hooks, { seq: pendingB.seq + 1, sender: shooter.name, message: shoot, isSelf: false });
    equal(a.E.debugHash(a.hooks.getStateSnapshot().bluffDeck.game), b.E.debugHash(b.hooks.getStateSnapshot().bluffDeck.game), `convergence after shoot ${turn}`);
  }
  assert(a.hooks.getStateSnapshot().bluffDeck.game.seq === b.hooks.getStateSnapshot().bluffDeck.game.seq, 'independent clients sequence convergence');
}

try {
  testOracleAndEngine();
  testViewModelAdapter();
  testProtocolAndHydration();
  testActionsPendingAndRender();
  testVisualProjection();
  testTranscriptCapAndReset();
  testControlStateProjection();
  testRealBridgeRouting();
  testIndependentConvergence();
} catch (error) {
  fail(`validator exception: ${error && error.stack ? error.stack : error}`);
}

if (failures.length) {
  process.stderr.write(`validate-bluff-deck-game: failed\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('validate-bluff-deck-game: ok\n');
}
