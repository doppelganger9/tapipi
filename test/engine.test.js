import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DefinitionError, normalizeDefinition } from '../shared/definition.js';
import { applyAction, createGame, setup } from '../shared/engine.js';
import { viewFor } from '../shared/view.js';

const load = (file) => normalizeDefinition(JSON.parse(readFileSync(new URL(`../games/${file}`, import.meta.url), 'utf8')));

function newGame(file = '01-chaudrons-et-chardons.json', seats = [0, 1], seed = 42) {
  const state = createGame(load(file), seed);
  state.activeSeats = seats;
  state.seatNames = seats.map((s) => `P${s}`);
  setup(state);
  return state;
}

const total = (state) => Object.values(state.zones).reduce((n, ids) => n + ids.length, 0);

test('every bundled game is valid', () => {
  for (const file of readdirSync(new URL('../games/', import.meta.url))) assert.ok(load(file).name);
});

test('setup deals to seated players only and conserves cards', () => {
  const state = newGame();
  assert.equal(state.zones['main@0'].length, 5);
  assert.equal(state.zones['main@1'].length, 5);
  assert.equal(state.zones['main@2'].length, 0);
  assert.equal(total(state), 56);
  assert.equal(Object.keys(state.cards).length, 56);
});

test('same seed, same game', () => {
  const protos = (s) => s.zones.pioche.map((id) => s.cards[id].proto);
  assert.deepEqual(protos(newGame(undefined, [0, 1], 7)), protos(newGame(undefined, [0, 1], 7)));
  assert.notDeepEqual(protos(newGame(undefined, [0, 1], 7)), protos(newGame(undefined, [0, 1], 8)));
});

test('views hide what a player may not see', () => {
  const state = newGame();
  const mine = viewFor(state, 0);
  assert.ok(mine.zones['main@0'].every((c) => c.p));
  assert.ok(mine.zones['main@1'].every((c) => !c.p && c.d === 'grimoire'));
  assert.ok(mine.zones.pioche.every((c) => !c.p));
  assert.ok(viewFor(state, -1).zones['main@0'].every((c) => !c.p), 'spectators see no hand');
  assert.ok(!JSON.stringify(mine.zones['main@1']).includes('amanite'));
});

test('playing a card reveals it; the log never names a hidden card', () => {
  const state = newGame();
  const [id] = state.zones['main@0'];
  assert.deepEqual(applyAction(state, 0, { type: 'move', cards: [id], to: 'chaudron@0' }), { ok: true });
  assert.ok(viewFor(state, 1).zones['chaudron@0'][0].p);
  assert.match(state.events.pop().text, /«/);

  applyAction(state, 0, { type: 'take', from: 'pioche', to: 'main@0', count: 2 });
  assert.equal(state.zones['main@0'].length, 6);
  assert.doesNotMatch(state.events.pop().text, /«/);
});

test('shuffling renames cards so they cannot be tracked', () => {
  const state = newGame();
  const before = new Set(state.zones.pioche);
  applyAction(state, 0, { type: 'shuffle', zone: 'pioche' });
  assert.ok(state.zones.pioche.every((id) => !before.has(id)));
  assert.equal(total(state), 56);
});

test('peeking is private and announced', () => {
  const state = newGame();
  const top = state.zones.pioche.at(-1);
  applyAction(state, 1, { type: 'peek', cards: [top] });
  assert.ok(viewFor(state, 1).zones.pioche.at(-1).p);
  assert.ok(!viewFor(state, 0).zones.pioche.at(-1).p);
  assert.match(state.events.pop().text, /regarde 1 carte en secret/);
});

test('invalid actions are refused without side effects', () => {
  const state = newGame();
  const snapshot = JSON.stringify(state.zones);
  for (const action of [
    null, { type: 'constructor' }, { type: 'move', cards: ['nope'], to: 'pioche' },
    { type: 'move', cards: [state.zones.pioche[0]], to: 'main@9' }, { type: 'move', cards: [state.zones.pioche[0]], to: '__proto__' },
    { type: 'take', from: 'pioche', to: 'main@0', count: -1 }, { type: 'counter', id: 'potions', seat: 4, delta: 1 },
  ]) assert.ok(applyAction(state, 0, action).error, JSON.stringify(action));
  assert.equal(JSON.stringify(state.zones), snapshot);
});

test('macros, counters and turns', () => {
  const state = newGame('02-classique-52.json', [0, 2]);
  applyAction(state, 0, { type: 'macro', id: 'donneTout' });
  assert.equal(state.zones['main@0'].length, 27);
  assert.equal(state.zones['main@2'].length, 27);
  applyAction(state, 0, { type: 'macro', id: 'ramasser' });
  assert.equal(state.zones.pioche.length, 54);
  applyAction(state, 0, { type: 'counter', id: 'score', seat: 2, delta: 3 });
  assert.equal(state.counters.players[2].score, 3);
  applyAction(state, 0, { type: 'turn' });
  assert.equal(state.turn, 2);
});

test('definitions are validated and stripped', () => {
  const base = JSON.parse(readFileSync(new URL('../games/02-classique-52.json', import.meta.url), 'utf8'));
  const bad = (patch, pattern) => assert.throws(() => normalizeDefinition({ ...structuredClone(base), ...patch }), (e) => e instanceof DefinitionError && pattern.test(e.message));
  bad({ format: 'x' }, /format/);
  bad({ zones: [] }, /zone/);
  bad({ setup: [{ op: 'shuffle', zone: 'nowhere' }] }, /zone inconnue/);
  bad({ decks: { a: { cards: [{ name: 'X', image: 'javascript:alert(1)' }] } } }, /image/);
  bad({ decks: { a: { cards: [{ name: 'X', color: 'red;background:url(x)' }] } } }, /color/);
  const def = normalizeDefinition({ ...base, evil: '<script>', zones: base.zones.map((z) => ({ ...z, onclick: 'x' })) });
  assert.equal(def.evil, undefined);
  assert.equal(def.zones[0].onclick, undefined);
});

test('a hand-picked packet is shuffled in place', () => {
  const state = newGame('02-classique-52.json', [0, 1]);
  const ids = state.zones.pioche.slice(0, 10);
  const rest = state.zones.pioche.slice(10);
  const protos = ids.map((id) => state.cards[id].proto).sort();
  assert.deepEqual(applyAction(state, 0, { type: 'shuffleCards', cards: ids }), { ok: true });
  const after = state.zones.pioche.slice(0, 10);
  assert.ok(after.every((id) => !ids.includes(id)), 'fresh ids');
  assert.deepEqual(after.map((id) => state.cards[id].proto).sort(), protos, 'same cards');
  assert.deepEqual(state.zones.pioche.slice(10), rest, 'the rest of the pile is untouched');
  assert.equal(state.events.pop().fx.kind, 'shuffle');
});

test('scripts take parameters, apply to one player, and deal by packets', () => {
  const state = newGame('03-classique-32.json', [0, 1, 2]);
  applyAction(state, 1, { type: 'macro', id: 'donner', args: { n: 4 } });
  assert.deepEqual([0, 1, 2].map((s) => state.zones[`main@${s}`].length), [4, 4, 4]);
  applyAction(state, 1, { type: 'macro', id: 'piocher', args: { n: 999 } }); // clamped to the script's max
  assert.deepEqual([0, 1, 2].map((s) => state.zones[`main@${s}`].length), [4, 14, 4]);
  applyAction(state, 0, { type: 'macro', id: 'ramasser' });
  applyAction(state, 0, { type: 'macro', id: 'donne32' });
  assert.deepEqual([0, 1, 2].map((s) => state.zones[`main@${s}`].length), [5, 5, 5]);
  applyAction(state, 0, { type: 'deal', from: 'talon', to: 'main', count: 2, seats: [2] });
  assert.equal(state.zones['main@2'].length, 7);
  assert.equal(state.zones['main@0'].length, 5);
});

test('turn-start scripts fire for the player whose turn begins', () => {
  const raw = JSON.parse(readFileSync(new URL('../games/02-classique-52.json', import.meta.url), 'utf8'));
  raw.macros.push({ id: 'auto', name: 'Pioche du tour', scope: 'me', on: 'turnStart', steps: [{ op: 'move', from: 'pioche', to: 'main', count: 2 }] });
  const state = createGame(normalizeDefinition(raw), 1);
  state.activeSeats = [0, 1];
  setup(state);
  applyAction(state, 0, { type: 'turn' });
  assert.equal(state.zones['main@1'].length, 2);
  assert.equal(state.zones['main@0'].length, 0);
  assert.throws(() => normalizeDefinition({ ...raw, macros: [{ id: 'x', steps: [{ op: 'deal', from: 'pioche', to: 'main', count: '$nope' }] }] }), /paramètre inconnu/);
});

test('a new game is sealed until every pack is opened', () => {
  const state = createGame(load('05-bac-a-sable.json'), 3);
  state.activeSeats = [0];
  assert.equal(total(state), 0);
  assert.ok(applyAction(state, 0, { type: 'unbox' }).ok);
  assert.equal(state.box.open, true);
  assert.ok(applyAction(state, 0, { type: 'unbox', deck: 'plateau' }).ok);
  assert.ok(applyAction(state, 0, { type: 'unbox', deck: 'plateau' }).error);
  assert.equal(total(state), 0);
  assert.ok(applyAction(state, 0, { type: 'unbox', deck: 'materiel' }).ok);
  assert.equal(state.box.done, true);
  assert.ok(total(state) > 50);
  assert.equal(createGame(load('04-estimation.json'), 1).box, null);
});

test('stacked moves make a pile; fixed boards never move', () => {
  const state = newGame('05-bac-a-sable.json', [0]);
  const pawns = state.zones.reserve.slice(0, 3);
  applyAction(state, 0, { type: 'move', cards: pawns, to: 'plateau', x: 0.4, y: 0.4, stack: true });
  assert.ok(pawns.every((id) => state.cards[id].x === 0.4 && state.cards[id].y === 0.4));
  const board = state.zones.plateau.find((id) => state.def.protos[state.cards[id].proto].fixed);
  assert.ok(applyAction(state, 0, { type: 'move', cards: [board], to: 'reserve' }).error);
  applyAction(state, 0, { type: 'macro', id: 'ranger' });
  assert.deepEqual(state.zones.plateau, [board]);
});

test('lorgner une main : une carte de plus par essai, ou pris sur le fait', async () => {
  const { exportDefinition } = await import('../shared/definition.js');
  const raw = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../games/02-classique-52.json', import.meta.url), 'utf8'));
  let caught = 0;
  let seen = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const state = createGame(normalizeDefinition({ ...raw, unboxing: false }), seed);
    state.activeSeats = [0, 1];
    setup(state);
    const hand = `${state.def.ui.hand}@1`;
    for (const card of Object.values(state.cards).slice(0, 5)) applyAction(state, 1, { type: 'move', cards: [card.id], to: hand });
    state.events.length = 0;
    assert.ok(applyAction(state, 0, { type: 'spy', zone: `${state.def.ui.hand}@0` }).error, 'pas sa propre main');
    assert.ok(applyAction(state, 0, { type: 'spy', zone: hand }).ok);
    const [event] = state.events;
    const peeked = viewFor(state, 0).zones[hand].filter((c) => c.p).length;
    if (event.fx?.kind === 'caught') { caught++; assert.equal(peeked, 0); assert.equal(event.only, undefined); }
    else { seen++; assert.equal(peeked, 1); assert.equal(event.only, 0); }
    assert.equal(viewFor(state, 1).zones[hand].length, 5);
  }
  assert.ok(caught > 3 && seen > 15, `${caught} pris, ${seen} réussis`);
  const noCheat = createGame(normalizeDefinition({ ...raw, unboxing: false, cheating: false }), 1);
  noCheat.activeSeats = [0, 1];
  setup(noCheat);
  assert.ok(applyAction(noCheat, 0, { type: 'spy', zone: `${noCheat.def.ui.hand}@1` }).error);
  assert.deepEqual(normalizeDefinition(exportDefinition(noCheat.def)), noCheat.def, 'export puis import : même jeu');
});

test('un jeu qui évolue : cartes marquées et ajoutées survivent à la partie et à la sauvegarde', async () => {
  const { exportDefinition } = await import('../shared/definition.js');
  const raw = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../games/02-classique-52.json', import.meta.url), 'utf8'));
  const state = createGame(normalizeDefinition({ ...raw, unboxing: false }), 7);
  state.activeSeats = [0, 1];
  setup(state);
  const before = Object.keys(state.cards).length;
  const card = Object.values(state.cards)[0];
  assert.ok(applyAction(state, 0, { type: 'mark', cards: [card.id], note: 'x' }).error, 'face cachée : refusé');
  applyAction(state, 0, { type: 'flip', cards: [card.id], faceUp: true });
  assert.ok(applyAction(state, 0, { type: 'mark', cards: [card.id], note: 'Atout de mamie' }).ok);
  assert.ok(applyAction(state, 0, { type: 'mark', cards: [card.id], sticker: '⭐' }).ok);
  assert.ok(applyAction(state, 0, { type: 'mark', cards: [card.id], torn: true }).ok);
  assert.ok(applyAction(state, 0, { type: 'mark', cards: [card.id], sticker: '<b>' }).error);
  assert.deepEqual(viewFor(state, 1).legacy.marks[card.proto], { note: 'Atout de mamie', torn: true, stickers: ['⭐'] });
  const to = state.def.zones.find((z) => z.owner === 'table').id;
  assert.ok(applyAction(state, 1, { type: 'addCard', deck: Object.keys(state.def.decks)[0], to, card: { name: 'Le Fou', text: 'Bat tout.', image: 'https://x/y.png', fixed: true } }).ok);
  assert.ok(applyAction(state, 1, { type: 'addCard', deck: 'nope', to, card: { name: 'x' } }).error);
  assert.ok(applyAction(state, 1, { type: 'addCard', deck: Object.keys(state.def.decks)[0], to, card: {} }).error);
  const added = Object.values(viewFor(state, 0).legacy.added);
  assert.equal(added.length, 1);
  assert.equal(added[0].image, undefined);
  assert.equal(added[0].fixed, undefined);
  setup(state); // new game: the game itself has changed
  assert.equal(Object.keys(state.cards).length, before + 1);
  assert.equal(state.def.protos[card.proto].marks.note, 'Atout de mamie');
  const reopened = createGame(normalizeDefinition(exportDefinition(state.def)), 1);
  assert.equal(reopened.box, null);
  assert.equal(reopened.legacy.marks[card.proto].torn, true);
  assert.equal(reopened.def.decks[Object.keys(state.def.decks)[0]].list.length, state.def.decks[Object.keys(state.def.decks)[0]].list.length);
  assert.ok(applyAction(state, 0, { type: 'flip', cards: [state.zones[Object.keys(state.zones).find((k) => state.zones[k].length)][0]], faceUp: true }).ok);
});
