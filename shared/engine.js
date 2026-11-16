// The table engine: authoritative state and the actions that change it.
//
// The engine knows nothing about any particular game. It simulates a physical
// table — cards, zones, counters, dice — and guarantees the things a physical
// table guarantees: a card is in exactly one place, a shuffled pile is really
// unknown, and everything that happens is announced to everyone.
//
// It is transport-agnostic and deterministic (seeded RNG): no I/O, no clock.
// To add a mechanic, add a handler to `handlers` below.

import { shuffleInPlace, randomInt, nextRandom } from './rng.js';
import { findZone, keysFor, parseKey } from './zones.js';
import { DefinitionError, normalizeMarks, normalizeNewCard } from './definition.js';

const MAX_CARDS = 3000;
const MAX_SELECTION = 300;
const MAX_ADDED = 200;
const STICKERS = ['⭐', '❤️', '💀', '🔥', '👑', '🩹', '❌', '✅'];

class ActionError extends Error {}

function refuse(message) {
  throw new ActionError(message);
}

// ---------------------------------------------------------------- state

/**
 * `def` belongs to the game from now on: altering or adding cards during play
 * changes it, so callers sharing a definition between tables must pass a copy.
 */
export function createGame(def, seed = Date.now()) {
  const state = clearTable({ def, rng: seed >>> 0, activeSeats: [], seatNames: [], events: [] });
  // What play has changed in the game itself; it survives "new game".
  state.legacy = { marks: {}, added: {} };
  for (const [key, proto] of Object.entries(def.protos)) if (proto.marks) state.legacy.marks[key] = proto.marks;
  // A new game comes in its box: the table stays empty until every pack is opened.
  state.box = def.unboxing ? { open: false, done: false, packs: Object.fromEntries(Object.keys(def.decks).map((id) => [id, 'sealed'])) } : null;
  return state;
}

function clearTable(state) {
  const { def } = state;
  const allSeats = Array.from({ length: def.players.max }, (_, i) => i);
  state.nextId = 1;
  state.cards = {};
  state.zones = {};
  for (const zone of def.zones) for (const key of keysFor(zone, allSeats)) state.zones[key] = [];
  state.counters = { table: {}, players: allSeats.map(() => ({})) };
  for (const counter of def.counters) {
    if (counter.scope === 'table') state.counters.table[counter.id] = counter.initial;
    else for (const values of state.counters.players) values[counter.id] = counter.initial;
  }
  state.turn = state.activeSeats[0] ?? 0;
  state.stains = [];
  return state;
}

/** (Re)starts the game: empties the table and runs the definition's setup. */
export function setup(state) {
  clearTable(state);
  runSteps(state, state.def.setup);
}

// ---------------------------------------------------------------- primitives

/** `fx` is an optional cosmetic effect the clients play along with the log line. */
function emit(state, seat, text, fx) {
  state.events.push({ seat, text, fx });
}

/** A line only one player gets to read. */
function whisper(state, seat, text) {
  state.events.push({ seat, text, only: seat });
}

function seatName(state, seat) {
  return state.seatNames[seat] ?? `Joueur ${seat + 1}`;
}

function zoneLabel(state, key) {
  const { zone, seat } = parseKey(state.def, key);
  return seat === null ? zone.name : `${zone.name} de ${seatName(state, seat)}`;
}

/** Fixed components (boards) are part of the table: nothing picks them up. */
const isFixed = (state, card) => Boolean(state.def.protos[card.proto].fixed);

function clamp01(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

/** Moves a card to a zone. The single place where a card changes location. */
function place(state, card, key, opts = {}) {
  const { zone } = parseKey(state.def, key);
  const previous = card.zone;
  if (previous) {
    const source = state.zones[previous];
    source.splice(source.indexOf(card.id), 1);
  }
  const target = state.zones[key];
  const index = Number.isInteger(opts.index) && opts.index >= 0 && opts.index <= target.length ? opts.index : target.length;
  target.splice(index, 0, card.id);
  card.zone = key;

  if (previous !== key) {
    // Entering a zone: the zone decides the default face, and anything a
    // player privately knew about the card stays behind.
    card.faceUp = typeof opts.faceUp === 'boolean' ? opts.faceUp : zone.visibility === 'public';
    card.tapped = false;
    card.peek = [];
    if (zone.visibility !== 'public') card.tokens = 0;
  }
  if (previous !== key || opts.x !== undefined) delete card.rot; // picking a card up straightens it
  if (zone.layout === 'free') {
    const fixed = isFixed(state, card);
    card.x = clamp01(opts.x, card.x ?? (fixed ? 0.5 : 0.08 + ((target.length * 0.09) % 0.84)));
    card.y = clamp01(opts.y, card.y ?? (fixed ? 0.5 : 0.3));
  } else {
    delete card.x;
    delete card.y;
  }
}

/** Throws the contents of a free zone around; some pieces land on their other side. */
function scatter(state, key, flipChance) {
  for (const id of state.zones[key]) {
    const card = state.cards[id];
    if (isFixed(state, card)) continue;
    card.x = nextRandom(state);
    card.y = nextRandom(state);
    card.rot = randomInt(state, 360);
    if (nextRandom(state) < flipChance) card.faceUp = !card.faceUp;
  }
  shuffleInPlace(state, state.zones[key]);
}

const THROWABLES = ['🍅', '🧦', '🎲', '💐', '🥧', '🧻'];

function spawnCard(state, proto, key) {
  if (Object.keys(state.cards).length >= MAX_CARDS) return;
  const card = { id: `c${state.nextId++}`, proto, deck: state.def.protos[proto].deck, faceUp: false, tapped: false, tokens: 0, peek: [], zone: null };
  state.cards[card.id] = card;
  place(state, card, key);
}

/**
 * Shuffles a zone and gives its cards fresh ids, so that nobody can follow a
 * known card through the shuffle by remembering its id.
 */
function shuffleZone(state, key) {
  const ids = shuffleInPlace(state, state.zones[key]);
  ids.forEach((oldId, i) => {
    const card = state.cards[oldId];
    delete state.cards[oldId];
    card.id = `c${state.nextId++}`;
    card.peek = [];
    state.cards[card.id] = card;
    ids[i] = card.id;
  });
}

function topCards(state, key, count) {
  const cards = state.zones[key].map((id) => state.cards[id]).filter((card) => !isFixed(state, card));
  return cards.slice(Math.max(0, cards.length - count)).reverse();
}

/**
 * Deals from one zone to several, round-robin, `by` cards at a time, until each
 * target has received `count` (or, with 'all', until the source is empty).
 */
function dealRound(state, fromKey, toKeys, count, opts, by = 1) {
  let moved = 0;
  const given = toKeys.map(() => 0);
  for (;;) {
    let progressed = false;
    for (let i = 0; i < toKeys.length; i++) {
      const batch = count === 'all' ? by : Math.min(by, count - given[i]);
      for (let n = 0; n < batch; n++) {
        const [card] = topCards(state, fromKey, 1);
        if (!card) return moved;
        place(state, card, toKeys[i], opts);
        given[i]++;
        moved++;
        progressed = true;
      }
    }
    if (!progressed) return moved;
  }
}

// ---------------------------------------------------------------- steps

/** `ctx.seats`: the players a script applies to; `ctx.args`: its parameter values. */
function runSteps(state, steps, ctx = {}) {
  const { def } = state;
  const seats = ctx.seats ?? state.activeSeats;
  const keys = (zoneId) => keysFor(findZone(def, zoneId), seats);
  for (const step of steps) {
    switch (step.op) {
      case 'spawn':
        for (const key of keys(step.to)) for (const proto of def.decks[step.deck].list) spawnCard(state, proto, key);
        break;
      case 'shuffle':
        for (const key of keys(step.zone)) shuffleZone(state, key);
        break;
      case 'move': {
        const from = keys(step.from);
        const to = keys(step.to);
        const opts = { faceUp: step.faceUp };
        const count = typeof step.count === 'string' && step.count.startsWith('$') ? ctx.args?.[step.count.slice(1)] ?? 1 : step.count;
        if (count === 0) break;
        if (findZone(def, step.from).owner === 'table') dealRound(state, from[0], to, count, opts, step.by);
        // From player zones: each player to their own target, or all to the shared one.
        else from.forEach((key, i) => to.length && dealRound(state, key, [to[to.length === 1 ? 0 : i]], count, opts, step.by));
        break;
      }
      case 'gather': {
        const [target] = keys(step.to);
        if (!target) break;
        const sources = step.from ? step.from.flatMap(keys) : Object.keys(state.zones);
        for (const key of sources) {
          if (key === target) continue;
          for (const id of [...state.zones[key]]) if (!isFixed(state, state.cards[id])) place(state, state.cards[id], target);
        }
        break;
      }
      case 'flip':
        for (const key of keys(step.zone)) for (const id of state.zones[key]) state.cards[id].faceUp = step.faceUp;
        break;
      case 'setCounter': {
        const counter = def.counters.find((c) => c.id === step.counter);
        if (counter.scope === 'table') state.counters.table[counter.id] = step.value;
        else for (const values of state.counters.players) values[counter.id] = step.value;
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- actions

function cardsOf(state, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_SELECTION) refuse('Sélection de cartes invalide.');
  if (new Set(ids).size !== ids.length) refuse('Sélection de cartes invalide.');
  const cards = ids.map((id) => (typeof id === 'string' && Object.hasOwn(state.cards, id) ? state.cards[id] : refuse("Cette carte n'est plus là.")));
  if (cards.some((card) => isFixed(state, card))) refuse('Cet élément est fixé à la table.');
  return cards;
}

function zoneOf(state, key) {
  return parseKey(state.def, key) ?? refuse('Zone inconnue.');
}

function count(value, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) refuse(`Nombre entre 1 et ${max} attendu.`);
  return value;
}

/** Describes cards for the log without ever naming one that stayed hidden. */
function describe(state, names) {
  if (names.length === 1) return names[0] ? `« ${names[0]} »` : 'une carte';
  return `${names.length} cartes`;
}

const defaultArgs = (macro) => Object.fromEntries(macro.params.map((p) => [p.id, p.default]));
const protoName = (state, card) => state.def.protos[card.proto].name;
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

const handlers = {
  move(state, seat, action) {
    const cards = cardsOf(state, action.cards);
    zoneOf(state, action.to);
    const sources = new Set();
    const names = [];
    cards.forEach((card, i) => {
      const previous = card.zone;
      const wasUp = card.faceUp;
      place(state, card, action.to, {
        faceUp: action.faceUp,
        index: Number.isInteger(action.index) ? action.index + i : undefined,
        // `stack` drops the cards exactly on top of each other: a pile.
        x: typeof action.x === 'number' ? action.x + (action.stack ? 0 : i * 0.03) : undefined,
        y: typeof action.y === 'number' ? action.y + (action.stack ? 0 : i * 0.03) : undefined,
      });
      if (previous !== action.to) {
        sources.add(previous);
        names.push(wasUp || card.faceUp ? protoName(state, card) : null);
      }
    });
    if (!names.length) return; // rearranging inside a zone is not news
    const from = sources.size === 1 ? zoneLabel(state, [...sources][0]) : 'plusieurs zones';
    emit(state, seat, `déplace ${describe(state, names)} : ${from} → ${zoneLabel(state, action.to)}`);
  },

  /** Takes the top cards of a zone. Resolved here so two simultaneous draws never collide. */
  take(state, seat, action) {
    zoneOf(state, action.from);
    zoneOf(state, action.to);
    if (action.from === action.to) refuse('Source et destination identiques.');
    const cards = topCards(state, action.from, count(action.count, 100));
    if (!cards.length) refuse(`${zoneLabel(state, action.from)} est vide.`);
    for (const card of cards) place(state, card, action.to);
    emit(state, seat, `prend ${plural(cards.length, 'carte')} : ${zoneLabel(state, action.from)} → ${zoneLabel(state, action.to)}`);
  },

  deal(state, seat, action) {
    zoneOf(state, action.from);
    const target = findZone(state.def, action.to);
    if (!target || target.owner !== 'player') refuse('On ne distribue que vers une zone de joueur.');
    const each = count(action.count, 100);
    const by = action.by == null ? 1 : count(action.by, 20);
    // To everyone by default, or to the listed players only.
    const seats = Array.isArray(action.seats) ? state.activeSeats.filter((s) => action.seats.includes(s)) : state.activeSeats;
    if (!seats.length) refuse('Personne à qui distribuer.');
    const toKeys = keysFor(target, seats).filter((key) => key !== action.from);
    const moved = dealRound(state, action.from, toKeys, each, {}, by);
    const whom = seats.length === state.activeSeats.length ? 'à chacun' : `à ${seats.map((s) => seatName(state, s)).join(', ')}`;
    emit(state, seat, `distribue ${plural(each, 'carte')} ${whom} depuis ${zoneLabel(state, action.from)} (${moved} au total)`);
  },

  flip(state, seat, action) {
    const cards = cardsOf(state, action.cards);
    for (const card of cards) card.faceUp = typeof action.faceUp === 'boolean' ? action.faceUp : !card.faceUp;
    emit(state, seat, `retourne ${describe(state, cards.map((c) => protoName(state, c)))}`);
  },

  tap(state, seat, action) {
    for (const card of cardsOf(state, action.cards)) card.tapped = !card.tapped;
  },

  /** Looks at face-down cards privately. Everyone is told that it happened. */
  peek(state, seat, action) {
    const cards = cardsOf(state, action.cards).filter((card) => {
      const { zone, seat: owner } = parseKey(state.def, card.zone);
      return !card.faceUp && !(zone.visibility === 'owner' && owner === seat) && !card.peek.includes(seat);
    });
    if (!cards.length) return;
    for (const card of cards) card.peek.push(seat);
    const zones = new Set(cards.map((c) => c.zone));
    emit(state, seat, `regarde ${plural(cards.length, 'carte')} en secret (${[...zones].map((k) => zoneLabel(state, k)).join(', ')})`);
  },

  token(state, seat, action) {
    if (action.delta !== 1 && action.delta !== -1) refuse('Jeton : +1 ou -1.');
    for (const card of cardsOf(state, action.cards)) card.tokens = Math.min(99, Math.max(0, card.tokens + action.delta));
  },

  shuffle(state, seat, action) {
    zoneOf(state, action.zone);
    shuffleZone(state, action.zone);
    emit(state, seat, `mélange ${zoneLabel(state, action.zone)}`, { kind: 'shuffle', zone: action.zone });
  },

  /** Shuffles a hand-picked packet in place: same spots, unknown order, fresh ids. */
  shuffleCards(state, seat, action) {
    const cards = cardsOf(state, action.cards);
    if (cards.length < 2) refuse('Il faut au moins deux cartes à mélanger.');
    const key = cards[0].zone;
    if (cards.some((card) => card.zone !== key)) refuse('Rassemblez d’abord ces cartes dans une même zone.');
    const zone = state.zones[key];
    const spots = cards.map((card) => ({ at: zone.indexOf(card.id), x: card.x, y: card.y })).sort((a, b) => a.at - b.at);
    const ids = shuffleInPlace(state, [...cards]).map((card, i) => {
      delete state.cards[card.id];
      card.id = `c${state.nextId++}`;
      card.peek = [];
      state.cards[card.id] = card;
      zone[spots[i].at] = card.id;
      if (spots[i].x !== undefined) Object.assign(card, { x: spots[i].x, y: spots[i].y });
      delete card.rot;
      return card.id;
    });
    emit(state, seat, `mélange un paquet de ${ids.length} cartes (${zoneLabel(state, key)})`, { kind: 'shuffle', cards: ids });
  },

  /** Opening the box: the lid first, then each sealed pack; the last one starts the game. */
  unbox(state, seat, action) {
    const { box } = state;
    if (!box || box.done) refuse('La boîte est déjà déballée.');
    const deckName = (id) => state.def.decks[id].name;
    if (action.all) {
      box.open = true;
      for (const id of Object.keys(box.packs)) box.packs[id] = 'open';
      emit(state, seat, 'déballe tout le jeu d’un coup', { kind: 'unbox', all: true });
    } else if (!box.open) {
      box.open = true;
      emit(state, seat, 'ouvre la boîte', { kind: 'unbox', lid: true });
    } else {
      if (!Object.hasOwn(box.packs, action.deck) || box.packs[action.deck] !== 'sealed') refuse('Ce paquet est déjà ouvert.');
      box.packs[action.deck] = 'open';
      emit(state, seat, `déballe « ${deckName(action.deck)} »`, { kind: 'unbox', deck: action.deck });
    }
    if (Object.values(box.packs).every((status) => status === 'open')) {
      box.done = true;
      setup(state);
    }
  },

  counter(state, seat, action) {
    const counter = state.def.counters.find((c) => c.id === action.id) ?? refuse('Compteur inconnu.');
    if (!Number.isInteger(action.delta) || Math.abs(action.delta) > 1000 || !action.delta) refuse('Variation invalide.');
    let values = state.counters.table;
    let label = counter.name;
    if (counter.scope === 'player') {
      if (!state.activeSeats.includes(action.seat)) refuse('Joueur inconnu.');
      values = state.counters.players[action.seat];
      label = `${counter.name} de ${seatName(state, action.seat)}`;
    }
    const before = values[counter.id];
    values[counter.id] = Math.min(99999, Math.max(-99999, before + action.delta));
    emit(state, seat, `${label} : ${before} → ${values[counter.id]}`);
  },

  roll(state, seat, action) {
    const sides = Number.isInteger(action.sides) && action.sides >= 2 && action.sides <= 1000 ? action.sides : refuse('Dé invalide.');
    const result = randomInt(state, sides) + 1;
    emit(state, seat, sides === 2 ? `lance une pièce : ${result === 1 ? 'pile' : 'face'}` : `lance un d${sides} : ${result}`);
  },

  turn(state, seat) {
    const seats = state.activeSeats;
    if (!seats.length) return;
    state.turn = seats[(seats.indexOf(state.turn) + 1) % seats.length];
    emit(state, seat, `termine son tour — à ${seatName(state, state.turn)} de jouer`);
    // Scripts bound to the start of a turn run for the player whose turn begins.
    for (const macro of state.def.macros.filter((m) => m.on === 'turnStart')) {
      runSteps(state, macro.steps, { seats: macro.scope === 'me' ? [state.turn] : seats, args: defaultArgs(macro) });
      emit(state, state.turn, `déclenche « ${macro.name} »`);
    }
  },

  // ---- a game that lives: cards get written on, torn, and new ones appear

  /** Alters cards for good. Only face-up cards: what is done to a card is done in front of everyone. */
  mark(state, seat, action) {
    const cards = cardsOf(state, action.cards);
    if (cards.some((card) => !card.faceUp)) refuse('Posez d’abord la carte face visible : on ne modifie une carte que devant tout le monde.');
    let verb;
    const change = (marks) => {
      if (action.erase === true) return (verb = 'remet à neuf', {});
      if (typeof action.note === 'string') return (verb = 'écrit sur', { ...marks, note: action.note });
      if (action.scribble === true) return (verb = 'griffonne', { ...marks, scribble: !marks.scribble });
      if (action.torn === true) return (verb = 'déchire', { ...marks, torn: true });
      if (STICKERS.includes(action.sticker)) return (verb = `colle ${action.sticker} sur`, { ...marks, stickers: [...(marks.stickers ?? []), action.sticker].slice(-6) });
      return refuse('Modification inconnue.');
    };
    for (const key of new Set(cards.map((card) => card.proto))) {
      const proto = state.def.protos[key];
      let marks;
      try {
        marks = normalizeMarks(change(proto.marks ?? {}));
      } catch (error) {
        if (error instanceof DefinitionError) refuse('Annotation invalide.');
        throw error;
      }
      if (marks) state.legacy.marks[key] = proto.marks = marks;
      else {
        delete proto.marks;
        delete state.legacy.marks[key];
      }
    }
    emit(state, seat, `${verb} ${describe(state, cards.map((c) => protoName(state, c)))}`, { kind: 'mark', cards: cards.map((c) => c.id) });
  },

  /** Writes a brand new card into the game; it will be there in the next games too. */
  addCard(state, seat, action) {
    if (!Object.hasOwn(state.def.decks, action.deck)) refuse('Paquet inconnu.');
    zoneOf(state, action.to);
    if (Object.keys(state.legacy.added).length >= MAX_ADDED) refuse('Trop de cartes ajoutées à ce jeu.');
    let face;
    try {
      face = normalizeNewCard(action.card);
    } catch (error) {
      if (error instanceof DefinitionError) refuse(error.message);
      throw error;
    }
    let n = 1;
    while (state.def.protos[`${action.deck}/ajout-${n}`]) n++;
    const key = `${action.deck}/ajout-${n}`;
    state.legacy.added[key] = state.def.protos[key] = { ...face, deck: action.deck };
    state.def.decks[action.deck].list.push(key);
    spawnCard(state, key, action.to);
    emit(state, seat, `ajoute une nouvelle carte au jeu : « ${face.name} » (${zoneLabel(state, action.to)})`);
  },

  // ---- mischief: the things one can only do around a real table

  /**
   * A glance at somebody else's hand. Each try shows one more card, only to
   * the cheat — or gets them caught in front of everyone, and the more one
   * has already seen, the likelier that is.
   */
  spy(state, seat, action) {
    if (!state.def.cheating) refuse('On ne triche pas à cette table.');
    const { zone, seat: owner } = zoneOf(state, action.zone);
    if (zone.visibility !== 'owner' || owner === seat || !state.activeSeats.includes(owner)) refuse('Il n’y a rien à lorgner ici.');
    const hidden = state.zones[action.zone].map((id) => state.cards[id]).filter((card) => !card.faceUp);
    const unseen = hidden.filter((card) => !card.peek.includes(seat));
    if (!unseen.length) refuse('Vous avez déjà tout vu.');
    const seen = hidden.length - unseen.length;
    if (nextRandom(state) < Math.min(0.8, 0.25 + 0.15 * seen)) {
      for (const card of hidden) card.peek = card.peek.filter((s) => s !== seat);
      emit(state, seat, `se fait prendre à lorgner le jeu de ${seatName(state, owner)} !`, { kind: 'caught', from: seat, to: owner });
      return;
    }
    unseen[randomInt(state, unseen.length)].peek.push(seat);
    whisper(state, seat, `🤫 Vous apercevez une carte de ${seatName(state, owner)}. Personne n’a rien remarqué…`);
  },

  sweep(state, seat, action) {
    if (zoneOf(state, action.zone).zone.layout !== 'free') refuse('On ne balaie que les zones libres.');
    scatter(state, action.zone, 0.1);
    emit(state, seat, `balaie ${zoneLabel(state, action.zone)} d'un revers de main`);
  },

  flipTable(state, seat) {
    for (const zone of state.def.zones) {
      if (zone.layout === 'free') for (const key of keysFor(zone, state.activeSeats)) scatter(state, key, 0.5);
    }
    emit(state, seat, 'renverse la table !', { kind: 'flip' });
  },

  spill(state, seat) {
    if (state.stains.length >= 6) refuse('La table est déjà trempée.');
    state.stains.push({ x: nextRandom(state), y: nextRandom(state), r: randomInt(state, 360) });
    emit(state, seat, 'renverse son café sur la table', { kind: 'spill' });
  },

  clean(state, seat) {
    if (!state.stains.length) return;
    state.stains = [];
    emit(state, seat, 'passe un coup d’éponge');
  },

  throw(state, seat, action) {
    if (!state.activeSeats.includes(action.seat)) refuse('Joueur inconnu.');
    const item = THROWABLES[randomInt(state, THROWABLES.length)];
    emit(state, seat, `lance ${item} sur ${seatName(state, action.seat)}`, { kind: 'throw', from: seat, to: action.seat, item });
  },

  macro(state, seat, action) {
    const macro = state.def.macros.find((m) => m.id === action.id) ?? refuse('Action de table inconnue.');
    const args = defaultArgs(macro);
    for (const param of macro.params) {
      const value = action.args?.[param.id];
      if (Number.isInteger(value)) args[param.id] = Math.min(param.max, Math.max(param.min, value));
    }
    runSteps(state, macro.steps, { seats: macro.scope === 'me' ? [seat] : state.activeSeats, args });
    emit(state, seat, `lance « ${macro.name} »`);
  },
};

/**
 * Applies a player's action. Returns `{ ok: true }` or `{ error }`.
 * Handlers validate before they mutate, so a refused action changes nothing.
 */
export function applyAction(state, seat, action) {
  const handler = action && typeof action.type === 'string' && Object.hasOwn(handlers, action.type) ? handlers[action.type] : null;
  if (!handler) return { error: 'Action inconnue.' };
  try {
    handler(state, seat, action);
    return { ok: true };
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
    throw error;
  }
}
