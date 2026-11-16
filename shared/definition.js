// Game definition files: validation and normalisation.
//
// A definition is untrusted input (players upload their own). `normalizeDefinition`
// either throws a DefinitionError with a readable message, or returns a clean
// object containing only known fields, which the engine and the client can
// then use without further checks.

export const FORMAT = 'tapis/1';

export class DefinitionError extends Error {}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const COLOR = /^#[0-9a-fA-F]{3,8}$/;
const IMAGE = /^(https:\/\/[^\s"'<>]+|data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+)$/;
const LIMITS = { cards: 1500, zones: 24, counters: 12, macros: 24, steps: 64, image: 300_000 };

function fail(message) {
  throw new DefinitionError(message);
}

function text(value, max, where) {
  if (value == null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') fail(`${where} : texte attendu.`);
  return String(value).slice(0, max);
}

function ident(value, where) {
  if (typeof value !== 'string' || !ID.test(value)) {
    fail(`${where} : identifiant invalide (lettres, chiffres, - et _ ; 40 caractères max).`);
  }
  return value;
}

function int(value, min, max, fallback, where) {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${where} : entier entre ${min} et ${max} attendu.`);
  }
  return value;
}

function list(value, max, where) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${where} : liste attendue.`);
  if (value.length > max) fail(`${where} : ${max} éléments au maximum.`);
  return value;
}

function oneOf(value, options, fallback, where) {
  if (value == null) return fallback;
  if (!options.includes(value)) fail(`${where} : valeurs possibles : ${options.join(', ')}.`);
  return value;
}

function object(value, where) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${where} : objet attendu.`);
  return value;
}

// ---------------------------------------------------------------- cards

const FACE_FIELDS = [['type', 40], ['cost', 6], ['art', 16], ['stats', 16], ['rank', 3], ['suit', 3], ['text', 600]];

function image(value, where) {
  if (typeof value !== 'string' || value.length > LIMITS.image || !IMAGE.test(value)) {
    fail(`${where} : URL https ou data-URI png/jpeg/webp/gif attendue.`);
  }
  return value;
}

function color(value, where) {
  if (typeof value !== 'string' || !COLOR.test(value)) fail(`${where} : couleur hexadécimale attendue (#rrggbb).`);
  return value;
}

function normalizeFace(raw, where) {
  object(raw, where);
  const face = { name: text(raw.name, 60, where) };
  if (!face.name) fail(`${where} : "name" est obligatoire.`);
  for (const [field, max] of FACE_FIELDS) {
    const value = text(raw[field], max, `${where}.${field}`);
    if (value) face[field] = value;
  }
  if (raw.color != null) face.color = color(raw.color, `${where}.color`);
  if (raw.image != null) face.image = image(raw.image, `${where}.image`);
  // Components need not be cards: square tiles and round pawns share the same model.
  const shape = oneOf(raw.shape, ['card', 'square', 'round'], 'card', `${where}.shape`);
  if (shape !== 'card') face.shape = shape;
  if (raw.size != null) {
    if (typeof raw.size !== 'number' || !(raw.size >= 0.3 && raw.size <= 12)) fail(`${where}.size : nombre entre 0.3 et 12 attendu.`);
    face.size = raw.size;
  }
  // `size` scales the width (1 = a standard card); `ratio` is height / width.
  // A board is simply a very large component, usually `fixed` to the table.
  if (raw.ratio != null) {
    if (typeof raw.ratio !== 'number' || !(raw.ratio >= 0.2 && raw.ratio <= 5)) fail(`${where}.ratio : nombre entre 0.2 et 5 attendu.`);
    face.ratio = raw.ratio;
  }
  if (raw.fixed === true) face.fixed = true;
  return face;
}

const SUITS = [['S', '♠', 'pique', '#1b1b1f'], ['H', '♥', 'cœur', '#c62828'], ['D', '♦', 'carreau', '#c62828'], ['C', '♣', 'trèfle', '#1b1b1f']];
const RANKS = [['A', 'As'], ['2', 'Deux'], ['3', 'Trois'], ['4', 'Quatre'], ['5', 'Cinq'], ['6', 'Six'], ['7', 'Sept'],
  ['8', 'Huit'], ['9', 'Neuf'], ['10', 'Dix'], ['V', 'Valet'], ['D', 'Dame'], ['R', 'Roi']];
const RANKS_32 = new Set(['A', '7', '8', '9', '10', 'V', 'D', 'R']);

/** The traditional French-suited deck, generated so files do not have to list it. */
function standardCards(preset, jokers) {
  const ranks = preset === 'standard32' ? RANKS.filter(([r]) => RANKS_32.has(r)) : RANKS;
  const cards = [];
  for (const [letter, symbol, suitName, color] of SUITS) {
    for (const [rank, rankName] of ranks) {
      cards.push({ id: rank + letter, name: `${rankName} de ${suitName}`, rank, suit: symbol, color });
    }
  }
  if (jokers) cards.push({ id: 'JOKER', name: 'Joker', type: 'Joker', art: '★', count: jokers });
  return cards;
}

function normalizeDeck(deckId, raw, def) {
  const where = `decks.${deckId}`;
  object(raw, where);
  const back = raw.back ? object(raw.back, `${where}.back`) : {};
  const deck = {
    back: {
      color: back.color != null && COLOR.test(String(back.color)) ? back.color : '#1d3557',
      label: text(back.label, 4, `${where}.back.label`) || '✦',
    },
    list: [],
  };
  const preset = oneOf(raw.preset, ['standard52', 'standard32'], null, `${where}.preset`);
  const cards = [
    ...(preset ? standardCards(preset, int(raw.jokers, 0, 8, 0, `${where}.jokers`)) : []),
    ...list(raw.cards, LIMITS.cards, `${where}.cards`),
  ];
  cards.forEach((rawCard, i) => {
    const cardWhere = `${where}.cards[${i}]`;
    const face = normalizeFace(rawCard, cardWhere);
    const key = `${deckId}/${rawCard.id == null ? i + 1 : ident(String(rawCard.id), `${cardWhere}.id`)}`;
    if (def.protos[key]) fail(`${cardWhere} : identifiant de carte en double (${key}).`);
    def.protos[key] = { ...face, deck: deckId };
    const count = int(rawCard.count, 1, 99, 1, `${cardWhere}.count`);
    for (let n = 0; n < count; n++) deck.list.push(key);
  });
  if (!deck.list.length) fail(`${where} : le paquet est vide.`);
  return deck;
}

// ---------------------------------------------------------------- steps

/** Steps are the small declarative vocabulary used by `setup` and by macros. */
function normalizeSteps(raw, def, where, { allowSpawn }) {
  const zone = (v, w) => {
    ident(v, w);
    return def.zones.find((z) => z.id === v) ?? fail(`${w} : zone inconnue "${v}".`);
  };
  return list(raw, LIMITS.steps, where).map((step, i) => {
    const w = `${where}[${i}]`;
    object(step, w);
    switch (step.op) {
      case 'spawn':
        if (!allowSpawn) fail(`${w} : "spawn" n'est permis que dans "setup".`);
        if (!def.decks[step.deck]) fail(`${w}.deck : paquet inconnu "${step.deck}".`);
        return { op: 'spawn', deck: step.deck, to: zone(step.to, `${w}.to`).id };
      case 'shuffle':
        return { op: 'shuffle', zone: zone(step.zone, `${w}.zone`).id };
      case 'deal':
      case 'move': {
        const out = { op: 'move', from: zone(step.from, `${w}.from`).id, to: zone(step.to, `${w}.to`).id };
        out.count = step.count === 'all' || step.count == null ? 'all' : int(step.count, 1, 500, 1, `${w}.count`);
        if (typeof step.faceUp === 'boolean') out.faceUp = step.faceUp;
        return out;
      }
      case 'gather': {
        const out = { op: 'gather', to: zone(step.to, `${w}.to`).id };
        if (step.from != null) out.from = list(step.from, LIMITS.zones, `${w}.from`).map((z, j) => zone(z, `${w}.from[${j}]`).id);
        return out;
      }
      case 'flip':
        return { op: 'flip', zone: zone(step.zone, `${w}.zone`).id, faceUp: step.faceUp !== false };
      case 'setCounter': {
        const counter = def.counters.find((c) => c.id === step.counter) ?? fail(`${w}.counter : compteur inconnu.`);
        return { op: 'setCounter', counter: counter.id, value: int(step.value, -99999, 99999, counter.initial, `${w}.value`) };
      }
      default:
        return fail(`${w}.op : opération inconnue "${step.op}" (spawn, shuffle, deal, move, gather, flip, setCounter).`);
    }
  });
}

// ---------------------------------------------------------------- definition

export function normalizeDefinition(raw) {
  object(raw, 'Fichier de jeu');
  if (raw.format !== FORMAT) fail(`Champ "format" attendu : "${FORMAT}".`);

  const players = raw.players ? object(raw.players, 'players') : {};
  const def = {
    format: FORMAT,
    id: ident(raw.id, 'id'),
    name: text(raw.name, 60, 'name') || fail('"name" est obligatoire.'),
    description: text(raw.description, 300, 'description'),
    author: text(raw.author, 80, 'author'),
    license: text(raw.license, 80, 'license'),
    rules: text(raw.rules, 12000, 'rules'),
    duration: text(raw.duration, 20, 'duration'),
    // "How to play" in a few lines, shown to every player who sits down.
    quickstart: list(raw.quickstart, 6, 'quickstart').map((line, i) => text(line, 160, `quickstart[${i}]`)).filter(Boolean),
    players: { min: int(players.min, 1, 8, 1, 'players.min'), max: int(players.max, 1, 8, 4, 'players.max') },
    protos: {},
    decks: {},
    zones: [],
    counters: [],
    setup: [],
    macros: [],
    ui: {},
    table: {},
  };
  if (raw.table != null) {
    const table = object(raw.table, 'table');
    if (table.color != null) def.table.color = color(table.color, 'table.color');
    if (table.image != null) def.table.image = image(table.image, 'table.image');
  }
  if (def.players.min > def.players.max) fail('players.min doit être inférieur ou égal à players.max.');

  const decks = Object.entries(object(raw.decks, 'decks'));
  if (!decks.length || decks.length > 12) fail('decks : entre 1 et 12 paquets attendus.');
  let total = 0;
  for (const [deckId, rawDeck] of decks) {
    ident(deckId, 'decks');
    def.decks[deckId] = normalizeDeck(deckId, rawDeck, def);
    total += def.decks[deckId].list.length;
  }
  if (total > LIMITS.cards) fail(`Trop de cartes (${total}, maximum ${LIMITS.cards}).`);

  const zones = list(raw.zones, LIMITS.zones, 'zones');
  if (!zones.length) fail('zones : au moins une zone est nécessaire.');
  zones.forEach((rawZone, i) => {
    const w = `zones[${i}]`;
    object(rawZone, w);
    const zone = {
      id: ident(rawZone.id, `${w}.id`),
      name: text(rawZone.name, 40, `${w}.name`) || rawZone.id,
      owner: oneOf(rawZone.owner, ['table', 'player'], 'table', `${w}.owner`),
      visibility: oneOf(rawZone.visibility, ['public', 'hidden', 'owner'], 'public', `${w}.visibility`),
      layout: oneOf(rawZone.layout, ['stack', 'row', 'free'], 'row', `${w}.layout`),
    };
    if (zone.visibility === 'owner' && zone.owner !== 'player') fail(`${w} : visibility "owner" exige owner "player".`);
    // A free zone with an image is a game board.
    if (rawZone.image != null) zone.image = image(rawZone.image, `${w}.image`);
    if (rawZone.color != null) zone.color = color(rawZone.color, `${w}.color`);
    if (def.zones.some((z) => z.id === zone.id)) fail(`${w} : zone en double "${zone.id}".`);
    def.zones.push(zone);
  });

  list(raw.counters, LIMITS.counters, 'counters').forEach((rawCounter, i) => {
    const w = `counters[${i}]`;
    object(rawCounter, w);
    const counter = {
      id: ident(rawCounter.id, `${w}.id`),
      name: text(rawCounter.name, 30, `${w}.name`) || rawCounter.id,
      scope: oneOf(rawCounter.scope, ['player', 'table'], 'player', `${w}.scope`),
      initial: int(rawCounter.initial, -99999, 99999, 0, `${w}.initial`),
    };
    if (def.counters.some((c) => c.id === counter.id)) fail(`${w} : compteur en double.`);
    def.counters.push(counter);
  });

  def.setup = normalizeSteps(raw.setup, def, 'setup', { allowSpawn: true });
  if (!def.setup.some((s) => s.op === 'spawn')) fail('setup : au moins une étape "spawn" est nécessaire pour poser des cartes.');

  list(raw.macros, LIMITS.macros, 'macros').forEach((rawMacro, i) => {
    const w = `macros[${i}]`;
    object(rawMacro, w);
    def.macros.push({
      id: ident(rawMacro.id, `${w}.id`),
      name: text(rawMacro.name, 40, `${w}.name`) || rawMacro.id,
      steps: normalizeSteps(rawMacro.steps, def, `${w}.steps`, { allowSpawn: false }),
    });
  });

  // UI hints: which zones the shortcuts (double-click to draw / to play) target.
  const ui = raw.ui ? object(raw.ui, 'ui') : {};
  const hint = (field, guess) => {
    if (ui[field] == null) return guess?.id ?? null;
    return (def.zones.find((z) => z.id === ui[field]) ?? fail(`ui.${field} : zone inconnue.`)).id;
  };
  def.ui = {
    hand: hint('hand', def.zones.find((z) => z.visibility === 'owner')),
    draw: hint('draw', def.zones.find((z) => z.owner === 'table' && z.visibility === 'hidden')),
    play: hint('play', def.zones.find((z) => z.visibility === 'public' && z.layout !== 'stack')),
  };
  if (def.ui.hand && def.zones.find((z) => z.id === def.ui.hand).owner !== 'player') fail('ui.hand doit désigner une zone de joueur.');

  return def;
}
