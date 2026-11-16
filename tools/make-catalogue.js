// Generates the catalogue: games/c-*.json.
//
// Only traditional games (public domain, generic names) and Tapipi's own
// creations. Tapipi supplies the equipment, drawn in its own style, and no
// rules for traditional games: players bring the ones they know.
// Run: node tools/make-catalogue.js
import { writeFileSync, readdirSync, unlinkSync } from 'node:fs';

const PAPER = '#f1ecdf', KRAFT = '#d9b98a', BLACK = '#0b0b0b', RED = '#e8300f', YELLOW = '#f5e100', BLUE = '#1f4fd8', GREEN = '#0b8a4a';
const out = [];
const uri = (w, h, body) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${PAPER}"/>${body}<rect x="3" y="3" width="${w - 6}" height="${h - 6}" fill="none" stroke="${BLACK}" stroke-width="6"/></svg>`).toString('base64')}`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const label = (x, y, text, size = 20, fill = BLACK) => `<text x="${x}" y="${y}" font-family="Arial Narrow, Arial, sans-serif" font-weight="900" font-size="${size}" text-anchor="middle" fill="${fill}">${text}</text>`;

// ------------------------------------------------------------ building blocks

const T = { id: 'talon', name: 'Talon', visibility: 'hidden', layout: 'stack' };
const TAPIS = { id: 'tapis', name: 'Tapis', layout: 'free' };
const MAIN = { id: 'main', name: 'Main', owner: 'player', visibility: 'owner', layout: 'row' };
const PLIS = { id: 'plis', name: 'Plis', owner: 'player', visibility: 'hidden', layout: 'stack' };
const DEFAUSSE = { id: 'defausse', name: 'Défausse', layout: 'stack' };
const SCORE = { id: 'score', name: 'Score', scope: 'player', initial: 0 };
const jetons = (n) => ({ id: 'jetons', name: 'Jetons', scope: 'player', initial: n });
const POT = { id: 'pot', name: 'Pot', scope: 'table', initial: 0 };

const SETUP = 'Mise en place';
const deal = (name, ...rounds) => ({ id: `donne${rounds.join('')}`, name, group: SETUP, steps: rounds.map((n) => (n === 'all' ? { op: 'deal', from: 'talon', to: 'main', count: 'all' } : { op: 'deal', from: 'talon', to: 'main', count: n, by: n })) });
const dealN = (n, max = 26) => ({ id: 'donner', name: 'Distribuer…', group: SETUP, params: [{ id: 'n', name: 'Cartes par joueur', min: 1, max, default: n }], steps: [{ op: 'deal', from: 'talon', to: 'main', count: '$n' }] });
const turnUp = (to = 'tapis', name = 'Retourner une carte du talon') => ({ id: 'retourne', name, group: SETUP, steps: [{ op: 'move', from: 'talon', to, count: 1, faceUp: true }] });
const gather = (to = 'talon') => ({ id: 'ramasser', name: 'Tout ramasser et mélanger', group: SETUP, steps: [{ op: 'gather', to }, { op: 'shuffle', zone: to }] });
const draw = (from = 'talon') => ({ id: 'piocher', name: 'Piocher…', group: 'À mon tour', scope: 'me', params: [{ id: 'n', name: 'Cartes à piocher', min: 1, max: 10, default: 1 }], steps: [{ op: 'move', from, to: 'main', count: '$n' }] });
const toTable = (id, name, to, count) => ({ id, name, group: SETUP, steps: [{ op: 'move', from: 'talon', to, count, faceUp: true }] });

const SUITS = [['S', '♠', 'pique', '#0b0b0b'], ['H', '♥', 'cœur', '#c4260a'], ['D', '♦', 'carreau', '#c4260a'], ['C', '♣', 'trèfle', '#0b0b0b']];
const RANKS = { A: 'As', 2: 'Deux', 3: 'Trois', 4: 'Quatre', 5: 'Cinq', 6: 'Six', 7: 'Sept', 8: 'Huit', 9: 'Neuf', 10: 'Dix', V: 'Valet', C: 'Cavalier', D: 'Dame', R: 'Roi' };
/** French-suited cards for the given ranks; `omit` lists ids such as "VC" to leave out. */
const french = (ranks, omit = []) => SUITS.flatMap(([letter, symbol, suit, color]) => ranks.map((rank) => ({ id: rank + letter, name: `${RANKS[rank]} de ${suit}`, rank: String(rank), suit: symbol, color })))
  .filter((card) => !omit.includes(card.id));

function game({ id, name, category, description, players, decks, zones, counters = [], setup, macros = [], ui, quickstart, duration }) {
  out.push({
    format: 'tapis/1', id, name, category, description, author: 'Tapipi', license: 'CC0-1.0', duration, players: { min: players[0], max: players[1] },
    quickstart, decks, zones, counters, ui, setup, macros,
  });
}

/** A card game played with one or two traditional packs. */
function cards(id, name, description, players, { pack = 52, jokers = 0, packs = 1, custom, back = '#7a1f2b', zones = [T, TAPIS, MAIN, PLIS], counters = [SCORE], macros, extra = [] }) {
  const decks = {};
  for (let i = 0; i < packs; i++) {
    decks[packs > 1 ? `jeu${i + 1}` : 'jeu'] = custom
      ? { name: `Paquet de ${custom.length} cartes`, back: { color: back, label: '❖' }, cards: custom }
      : { name: `Jeu de ${pack} cartes${packs > 1 ? ` n° ${i + 1}` : ''}`, preset: `standard${pack}`, jokers, back: { color: i ? '#1f4e79' : back, label: '❖' } };
  }
  game({
    id, name, category: 'Cartes traditionnelles', description, players, decks, zones, counters,
    ui: { hand: 'main', draw: 'talon', play: zones.find((z) => z.id === 'tapis') ? 'tapis' : undefined },
    setup: [...Object.keys(decks).map((deck) => ({ op: 'spawn', deck, to: 'talon' })), { op: 'shuffle', zone: 'talon' }],
    macros: [...macros, ...extra, gather(), draw()],
  });
}

// ------------------------------------------------------------ 1. traditional card games

const R32 = ['A', 7, 8, 9, 10, 'V', 'D', 'R'];
const R52 = ['A', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'V', 'D', 'R'];
const CHIEN = { id: 'chien', name: 'Chien', visibility: 'hidden', layout: 'row' };

cards('bataille', 'Bataille', 'Le premier jeu de cartes de tout le monde. Deux paquets, deux joueurs, zéro stratégie.', [2, 4], { macros: [deal('Distribuer tout le paquet', 'all')], zones: [T, TAPIS, { ...MAIN, visibility: 'hidden', layout: 'stack', name: 'Mon paquet' }, PLIS] });
cards('bataille-corse', 'Bataille corse', 'La bataille, mais on tape sur le tas. Protégez vos doigts.', [2, 6], { macros: [deal('Distribuer tout le paquet', 'all')], zones: [T, { id: 'tapis', name: 'Le tas', layout: 'stack' }, { ...MAIN, visibility: 'hidden', layout: 'stack', name: 'Mon paquet' }] });
cards('belote', 'Belote', 'Trente-deux cartes, une retourne, des annonces et des disputes de famille.', [4, 4], { pack: 32, back: '#1f4e79', macros: [deal('Donne 3 puis 2', 3, 2), turnUp(), deal('Compléter : 3 cartes', 3)] });
cards('coinche', 'Coinche', 'La belote avec des enchères, pour ceux qui aiment annoncer trop haut.', [4, 4], { pack: 32, back: '#1f4e79', macros: [deal('Donne 3, 2, 3', 3, 2, 3)] });
cards('manille', 'Manille', 'Le dix est roi. Jeu de levées du Sud et du Nord, à trente-deux cartes.', [2, 4], { pack: 32, back: '#1f4e79', macros: [deal('Donne 4 par 4', 4, 4), dealN(8, 16)] });
cards('ecarte', 'Écarté', 'Duel de salon à trente-deux cartes : on propose, on écarte, on joue.', [2, 2], { pack: 32, back: '#1f4e79', zones: [T, TAPIS, MAIN, PLIS, DEFAUSSE], macros: [deal('Donne 3 puis 2', 3, 2), turnUp()] });
cards('piquet', 'Piquet', 'Un classique à deux, trente-deux cartes et un talon de huit.', [2, 2], { pack: 32, back: '#1f4e79', zones: [T, TAPIS, MAIN, PLIS, DEFAUSSE], macros: [deal('Donne 12 cartes, 3 par 3', 3, 3, 3, 3)] });
cards('polignac', 'Polignac', 'Faites tout sauf ramasser les valets. Surtout celui de pique.', [3, 6], { pack: 32, back: '#1f4e79', macros: [deal('Distribuer tout le paquet', 'all'), dealN(8, 10)] });

const tarot = [
  ...french(['A', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'V', 'C', 'D', 'R']),
  ...Array.from({ length: 21 }, (_, i) => ({ id: `atout${i + 1}`, name: `Atout ${i + 1}`, type: 'Atout', art: String(i + 1), color: [1, 21].includes(i + 1) ? RED : '#1f4e79' })),
  { id: 'excuse', name: "L'Excuse", type: 'Atout', art: ':etoile', color: RED },
];
cards('tarot', 'Tarot', 'Soixante-dix-huit cartes, vingt et un atouts, une excuse et un chien.', [3, 5], {
  custom: tarot, back: '#3b2a5c', zones: [T, TAPIS, CHIEN, MAIN, PLIS], counters: [SCORE],
  macros: [
    { id: 'donne4', name: 'Donne à 4 (18 cartes, chien de 6)', group: SETUP, steps: [{ op: 'move', from: 'talon', to: 'chien', count: 6 }, { op: 'deal', from: 'talon', to: 'main', count: 18, by: 3 }] },
    { id: 'donne3', name: 'Donne à 3 (24 cartes, chien de 6)', group: SETUP, steps: [{ op: 'move', from: 'talon', to: 'chien', count: 6 }, { op: 'deal', from: 'talon', to: 'main', count: 24, by: 4 }] },
    { id: 'donne5', name: 'Donne à 5 (15 cartes, chien de 3)', group: SETUP, steps: [{ op: 'move', from: 'talon', to: 'chien', count: 3 }, { op: 'deal', from: 'talon', to: 'main', count: 15, by: 3 }] },
    { id: 'montrer', name: 'Retourner le chien', group: SETUP, steps: [{ op: 'flip', zone: 'chien', faceUp: true }] },
  ],
});

const melds = [T, DEFAUSSE, TAPIS, MAIN];
cards('rami', 'Rami', 'Deux jeux, des jokers, des suites et des brelans à poser avant les autres.', [2, 6], { packs: 2, jokers: 2, zones: melds, macros: [dealN(13, 15), turnUp('defausse', 'Ouvrir la défausse')] });
cards('gin-rami', 'Gin rami', 'Le rami à deux, dix cartes en main, on frappe quand on est prêt.', [2, 2], { zones: melds, macros: [deal('Donne 10 cartes', 10), turnUp('defausse', 'Ouvrir la défausse')] });
cards('canasta', 'Canasta', 'Cent huit cartes, des séries de sept et des trois rouges qui comptent.', [2, 4], { packs: 2, jokers: 2, zones: melds, macros: [dealN(11, 15), turnUp('defausse', 'Ouvrir la défausse')] });
cards('president', 'Président', 'Du président au dernier des derniers : débarrassez-vous de tout, vite.', [3, 8], { macros: [deal('Distribuer tout le paquet', 'all')], zones: [T, TAPIS, MAIN, DEFAUSSE], counters: [] });
cards('huit-americain', 'Huit américain', 'Même couleur ou même valeur, et le huit change tout.', [2, 6], { zones: melds.filter((z) => z !== TAPIS), macros: [dealN(7, 8), turnUp('defausse', 'Ouvrir la défausse')] });
cards('menteur', 'Menteur', 'Posez face cachée, annoncez ce que vous voulez, et priez.', [2, 8], { macros: [deal('Distribuer tout le paquet', 'all')], zones: [T, { id: 'tapis', name: 'Le tas', visibility: 'hidden', layout: 'stack' }, MAIN], counters: [] });
cards('pouilleux', 'Pouilleux', 'Cinquante et une cartes, des paires à défausser, et un valet dont personne ne veut.', [2, 8], { custom: french(R52, ['VC']), macros: [deal('Distribuer tout le paquet', 'all')], zones: [T, DEFAUSSE, MAIN], counters: [] });
cards('kems', 'Kems', 'Quatre cartes, un carré à réunir et un signe secret avec votre partenaire.', [4, 8], { zones: [T, { id: 'tapis', name: 'Les quatre cartes', layout: 'row' }, DEFAUSSE, MAIN], macros: [deal('Donne 4 cartes', 4), toTable('poser4', 'Poser 4 cartes au centre', 'tapis', 4), { id: 'balayer', name: 'Balayer le centre', group: SETUP, steps: [{ op: 'move', from: 'tapis', to: 'defausse', count: 'all' }] }] });
cards('speed', 'Speed', 'Pas de tour de jeu : le plus rapide des deux gagne.', [2, 2], { zones: [T, { id: 'pileA', name: 'Pile gauche', layout: 'stack' }, { id: 'pileB', name: 'Pile droite', layout: 'stack' }, MAIN, { id: 'reserve', name: 'Ma réserve', owner: 'player', visibility: 'hidden', layout: 'stack' }], counters: [], macros: [
  { id: 'donneSpeed', name: 'Donne : 5 en main, 15 en réserve', group: SETUP, steps: [{ op: 'deal', from: 'talon', to: 'main', count: 5 }, { op: 'deal', from: 'talon', to: 'reserve', count: 15 }] },
  { id: 'ouvrir', name: 'Retourner les deux piles', group: SETUP, steps: [{ op: 'move', from: 'talon', to: 'pileA', count: 1, faceUp: true }, { op: 'move', from: 'talon', to: 'pileB', count: 1, faceUp: true }] },
] });
cards('dame-de-pique', 'Dame de pique', 'Évitez les cœurs. Évitez surtout la dame.', [3, 6], { macros: [deal('Distribuer tout le paquet', 'all'), dealN(13, 17)] });
cards('whist', 'Whist', "L'ancêtre : treize levées, un atout, deux équipes.", [4, 4], { macros: [deal('Donne 13 cartes', 13), turnUp()] });
cards('bridge', 'Bridge', 'Treize cartes, des enchères, un mort. Le reste prend une vie à apprendre.', [4, 4], { macros: [deal('Donne 13 cartes', 13)] });
cards('ascenseur', 'Ascenseur', 'Une carte, puis deux, puis trois… et il faut annoncer ses plis au plus juste.', [3, 7], { macros: [dealN(1, 17), turnUp('tapis', "Retourner l'atout")] });
cards('barbu', 'Barbu', 'Sept contrats, quatre joueurs, et le roi de cœur dont il faut se méfier.', [4, 4], { macros: [deal('Donne 13 cartes', 13)] });
cards('trente-et-un', 'Trente et un', 'Trois cartes, une couleur, le plus près de trente et un. Trois vies.', [2, 8], { zones: [T, { id: 'tapis', name: 'Le milieu', layout: 'row' }, MAIN], counters: [{ id: 'vies', name: 'Vies', scope: 'player', initial: 3 }], macros: [deal('Donne 3 cartes', 3), toTable('milieu', 'Poser 3 cartes au milieu', 'tapis', 3)] });
cards('poker-ferme', 'Poker fermé', 'Cinq cartes cachées, un échange, et du bluff.', [2, 7], { zones: [T, DEFAUSSE, MAIN], counters: [jetons(100), POT], macros: [deal('Donne 5 cartes', 5)] });
cards('poker-ouvert', 'Poker à cartes communes', 'Deux cartes en main, cinq au milieu, et des tapis qui volent.', [2, 8], { zones: [T, { id: 'tapis', name: 'Le tableau', layout: 'row' }, DEFAUSSE, MAIN], counters: [jetons(100), POT], macros: [deal('Donne 2 cartes', 2), toTable('flop', 'Le flop : 3 cartes', 'tapis', 3), toTable('tournant', 'Une carte de plus', 'tapis', 1), { id: 'bruler', name: 'Brûler une carte', group: SETUP, steps: [{ op: 'move', from: 'talon', to: 'defausse', count: 1 }] }] });
cards('vingt-et-un', 'Vingt-et-un', 'Carte ! Carte ! Carte… Trop.', [2, 8], { zones: [T, { id: 'banque', name: 'La banque', layout: 'row' }, { id: 'tapis', name: 'Mon jeu', owner: 'player', layout: 'row' }, MAIN], counters: [jetons(50)], macros: [{ id: 'donne21', name: 'Donne : 2 cartes visibles chacun', group: SETUP, steps: [{ op: 'deal', from: 'talon', to: 'tapis', count: 2, faceUp: true }, { op: 'move', from: 'talon', to: 'banque', count: 1, faceUp: true }] }, { id: 'carte', name: 'Carte !', group: 'À mon tour', scope: 'me', steps: [{ op: 'move', from: 'talon', to: 'tapis', count: 1, faceUp: true }] }] });
cards('crapette', 'Crapette', 'Une réussite à deux, où l’on guette la moindre erreur de l’autre.', [2, 2], { packs: 2, zones: [T, TAPIS, { id: 'crapette', name: 'Ma crapette', owner: 'player', layout: 'stack' }, { id: 'main', name: 'Mon talon', owner: 'player', visibility: 'hidden', layout: 'stack' }, { id: 'pot', name: 'Mon pot', owner: 'player', layout: 'stack' }], counters: [], macros: [{ id: 'donneCrap', name: 'Donne : 13 en crapette, le reste en talon', group: SETUP, steps: [{ op: 'deal', from: 'talon', to: 'crapette', count: 13 }, { op: 'deal', from: 'talon', to: 'main', count: 'all' }] }] });
const cols = Array.from({ length: 7 }, (_, i) => ({ id: `col${i + 1}`, name: `Colonne ${i + 1}`, layout: 'row' }));
cards('reussite', 'Réussite', 'Sept colonnes, quatre as à monter. Seul, avec un café.', [1, 1], { zones: [T, DEFAUSSE, ...SUITS.map(([l, s]) => ({ id: `fond${l}`, name: `Base ${s}`, layout: 'stack' })), ...cols, MAIN], counters: [], macros: [{ id: 'etaler', name: 'Étaler les sept colonnes', group: SETUP, steps: cols.map((c, i) => ({ op: 'move', from: 'talon', to: c.id, count: i + 1, faceUp: true })) }, { id: 'tirer', name: 'Tirer une carte du talon', group: 'À mon tour', steps: [{ op: 'move', from: 'talon', to: 'defausse', count: 1, faceUp: true }] }, { id: 'recycler', name: 'Retourner la défausse en talon', group: 'À mon tour', steps: [{ op: 'move', from: 'defausse', to: 'talon', count: 'all', faceUp: false }] }] });
cards('scopa', 'Scopa', 'Quarante cartes, quatre au milieu, et on balaie la table.', [2, 4], { custom: french(['A', 2, 3, 4, 5, 6, 7, 'V', 'D', 'R']), back: GREEN, zones: [T, { id: 'tapis', name: 'La table', layout: 'row' }, MAIN, PLIS], macros: [deal('Donne 3 cartes', 3), toTable('quatre', 'Poser 4 cartes sur la table', 'tapis', 4)] });

// Nain jaune: the five-compartment board, a pack and chips.
const njCases = [['10', '♦', RED], ['V', '♣', BLACK], ['D', '♠', BLACK], ['R', '♥', RED], ['7', '♦', YELLOW]];
const njBoard = uri(500, 300, njCases.map(([r, s, c], i) => {
  const [x, y, w, h] = i < 4 ? [(i % 2) * 340, Math.floor(i / 2) * 150, 160, 150] : [160, 0, 180, 300];
  return rect(x, y, w, h, i === 4 ? YELLOW : PAPER, `stroke="${BLACK}" stroke-width="5"`) + label(x + w / 2, y + h / 2 + 22, `${r}${s}`, i === 4 ? 78 : 60, c === YELLOW ? BLACK : c);
}).join(''));
game({ id: 'nain-jaune', name: 'Nain jaune', category: 'Cartes traditionnelles', description: 'Cinq cases, des jetons à miser, et le sept de carreau que tout le monde attend.', players: [3, 8],
  decks: { plateau: { name: 'Le plateau', cards: [{ id: 'plateau', name: 'Plateau du nain jaune', shape: 'square', size: 4.4, ratio: 0.6, fixed: true, image: njBoard }] }, jeu: { name: 'Jeu de 52 cartes', preset: 'standard52', back: { color: '#7a1f2b', label: '❖' } } },
  zones: [{ id: 'plateau', name: 'Plateau', layout: 'free' }, T, { id: 'tapis', name: 'La suite', layout: 'row' }, MAIN], counters: [jetons(50), ...njCases.map(([r, s], i) => ({ id: `case${i}`, name: `Case ${r}${s}`, scope: 'table', initial: 0 }))],
  ui: { hand: 'main', draw: 'talon', play: 'tapis' }, setup: [{ op: 'spawn', deck: 'plateau', to: 'plateau' }, { op: 'spawn', deck: 'jeu', to: 'talon' }, { op: 'shuffle', zone: 'talon' }],
  macros: [dealN(12, 15), gather(), draw()] });

// ------------------------------------------------------------ 2. boards and pieces

const SIZE = 4.6;
const pawn = (id, name, color, count, size, art) => ({ id, name, shape: 'round', size, color, count, ...(art ? { art } : {}) });
const BOL = (id, name) => ({ id, name, layout: 'stack' });
const ROW = (id, name) => ({ id, name, layout: 'row' });
const PLATEAU = { id: 'plateau', name: 'Plateau', layout: 'free' };

function board(id, name, description, players, { image, ratio = 1, size = SIZE, pieces, reserves, counters = [], macros = [], quickstart, category = 'Plateaux et pions', extraZones = [], hand = false }) {
  // Each reserve holds the pieces whose id starts with its own.
  const decks = { plateau: { name: 'Le plateau', cards: [{ id: 'plateau', name: `Plateau : ${name}`, shape: 'square', size, ratio, fixed: true, image }] } };
  const setup = [{ op: 'spawn', deck: 'plateau', to: 'plateau' }];
  for (const zone of reserves) {
    const mine = pieces.filter((p) => p.id.startsWith(zone.id));
    if (!mine.length) continue;
    decks[zone.id] = { name: zone.name, back: { color: zone.back ?? '#4a463c', label: zone.label ?? '●' }, cards: mine };
    setup.push({ op: 'spawn', deck: zone.id, to: zone.id });
    if (zone.shuffle) setup.push({ op: 'shuffle', zone: zone.id });
    if (zone.faceUp) setup.push({ op: 'flip', zone: zone.id, faceUp: true });
  }
  const zones = [PLATEAU, ...reserves.map(({ id: zid, name: zname, layout, visibility }) => ({ id: zid, name: zname, layout, ...(visibility ? { visibility } : {}) })), ...extraZones, ...(hand ? [MAIN] : [])];
  game({ id, name, category, description, players, decks, zones, counters, quickstart, ui: { play: 'plateau', ...(hand ? { hand: 'main' } : {}) }, setup,
    macros: [...macros, { id: 'ranger', name: 'Tout remettre dans la boîte', group: SETUP, steps: reserves.filter((z) => decks[z.id]).length === 1 ? [{ op: 'gather', to: reserves.find((z) => decks[z.id]).id }] : [] }].filter((m) => m.steps.length) });
}

const checker = (n, a, b) => { let s = ''; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) s += rect(x * 60, y * 60, 60, 60, (x + y) % 2 ? b : a); return uri(n * 60, n * 60, s); };

board('dames', 'Dames', 'Cent cases, vingt pions chacun, et des rafles qui font mal.', [2, 2], { image: checker(10, PAPER, KRAFT), pieces: [pawn('noirs', 'Pion noir', BLACK, 20, 0.38), pawn('rouges', 'Pion rouge', RED, 20, 0.38)], reserves: [ROW('noirs', 'Pions noirs'), ROW('rouges', 'Pions rouges')] });

const chessSet = (prefix, camp, color) => [['R', 'Roi', 1], ['D', 'Dame', 1], ['T', 'Tour', 2], ['F', 'Fou', 2], ['C', 'Cavalier', 2], ['P', 'Pion', 8]].map(([l, n, c]) => pawn(`${prefix}-${l}`, `${n} ${camp}`, color, c, 0.48, l));
board('echecs', 'Échecs', 'Soixante-quatre cases et seize pièces chacun, marquées de leur initiale.', [2, 2], { image: checker(8, PAPER, KRAFT), pieces: [...chessSet('noirs', 'noir', BLACK), ...chessSet('rouges', 'rouge', RED)], reserves: [ROW('noirs', 'Pièces noires'), ROW('rouges', 'Pièces rouges')] });

let bg = rect(0, 0, 780, 600, PAPER) + rect(360, 0, 60, 600, BLACK);
for (let i = 0; i < 12; i++) {
  const x = (i < 6 ? i * 60 : 420 + (i - 6) * 60);
  bg += `<path d="M${x} 0 L${x + 60} 0 L${x + 30} 250 Z" fill="${i % 2 ? RED : BLACK}"/><path d="M${x} 600 L${x + 60} 600 L${x + 30} 350 Z" fill="${i % 2 ? BLACK : RED}"/>`;
}
board('backgammon', 'Backgammon', 'Vingt-quatre flèches, quinze pions chacun, deux dés. Le plus vieux jeu de course du monde.', [2, 2], { image: uri(780, 600, bg), ratio: 600 / 780, size: 5.4, pieces: [pawn('noirs', 'Pion noir', '#3a3933', 15, 0.36), pawn('jaunes', 'Pion jaune', YELLOW, 15, 0.36)], reserves: [ROW('noirs', 'Pions noirs'), ROW('jaunes', 'Pions jaunes')] });

board('morpion', 'Morpion', 'Trois cases sur trois. Trois alignés. Trois secondes de réflexion.', [2, 2], { size: 3, image: uri(300, 300, `<path d="M100 14V286M200 14V286M14 100H286M14 200H286" stroke="${BLACK}" stroke-width="8"/>`), pieces: [pawn('croix', 'Croix', BLACK, 5, 0.8, 'X'), pawn('ronds', 'Rond', RED, 5, 0.8, 'O')], reserves: [ROW('croix', 'Les croix'), ROW('ronds', 'Les ronds')] });

let mill = '';
for (const [i, m] of [[0, 40], [1, 130], [2, 220]]) mill += rect(m, m, 600 - 2 * m, 600 - 2 * m, 'none', `stroke="${BLACK}" stroke-width="7"`);
mill += `<path d="M300 40V220M300 380V560M40 300H220M380 300H560" stroke="${BLACK}" stroke-width="7"/>`;
for (const m of [40, 130, 220]) for (const [x, y] of [[m, m], [300, m], [600 - m, m], [m, 300], [600 - m, 300], [m, 600 - m], [300, 600 - m], [600 - m, 600 - m]]) mill += `<circle cx="${x}" cy="${y}" r="16" fill="${YELLOW}" stroke="${BLACK}" stroke-width="6"/>`;
board('moulin', 'Jeu du moulin', 'Neuf pions chacun, vingt-quatre points. Trois alignés : un moulin.', [2, 2], { image: uri(600, 600, mill), pieces: [pawn('noirs', 'Pion noir', BLACK, 9, 0.42), pawn('rouges', 'Pion rouge', RED, 9, 0.42)], reserves: [ROW('noirs', 'Pions noirs'), ROW('rouges', 'Pions rouges')] });

let goban = rect(0, 0, 540, 540, KRAFT);
for (let i = 0; i < 9; i++) goban += `<path d="M30 ${30 + i * 60}H510M${30 + i * 60} 30V510" stroke="${BLACK}" stroke-width="4"/>`;
for (const [x, y] of [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]]) goban += `<circle cx="${30 + x * 60}" cy="${30 + y * 60}" r="8" fill="${BLACK}"/>`;
board('go', 'Go 9 × 9', 'Des pierres noires, des pierres blanches, des intersections. Le petit plateau, pour des parties courtes.', [2, 2], { image: uri(540, 540, goban), pieces: [pawn('noires', 'Pierre noire', BLACK, 41, 0.44), pawn('blanches', 'Pierre blanche', '#fbf8ef', 40, 0.44)], reserves: [{ ...BOL('noires', 'Bol noir'), faceUp: true }, { ...BOL('blanches', 'Bol blanc'), faceUp: true }] });

let rv = rect(0, 0, 480, 480, '#bfdcc0');
for (let i = 1; i < 8; i++) rv += `<path d="M${i * 60} 0V480M0 ${i * 60}H480" stroke="${BLACK}" stroke-width="4"/>`;
board('reversi', 'Reversi', 'Des pions à deux faces : noir d’un côté, blanc de l’autre. On encadre, on retourne.', [2, 2], { image: uri(480, 480, rv), pieces: [pawn('pions', 'Pion (face noire)', BLACK, 64, 0.46)], reserves: [{ ...BOL('pions', 'Les 64 pions'), back: '#fbf8ef', label: '○', visibility: 'hidden' }] });

const HORSES = [['rouges', 'rouge', RED], ['jaunes', 'jaune', YELLOW], ['bleus', 'bleu', BLUE], ['verts', 'vert', GREEN]];
let ludo = '';
for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
  const h = y >= 6 && y <= 8, v = x >= 6 && x <= 8;
  const quad = HORSES[(y > 7 ? 2 : 0) + (x > 7 ? 1 : 0)][2];
  let fill = quad;
  if (h && v) fill = BLACK;
  else if (h || v) fill = (y === 7 && x > 0 && x < 14) ? HORSES[x < 7 ? 0 : 3][2] : (x === 7 && y > 0 && y < 14) ? HORSES[y < 7 ? 1 : 2][2] : PAPER;
  ludo += rect(x * 40, y * 40, 40, 40, fill, h || v ? `stroke="${BLACK}" stroke-width="2"` : '');
}
for (const [cx, cy] of [[120, 120], [480, 120], [120, 480], [480, 480]]) ludo += `<circle cx="${cx}" cy="${cy}" r="70" fill="${PAPER}" stroke="${BLACK}" stroke-width="6"/>`;
board('petits-chevaux', 'Petits chevaux', 'Quatre écuries, un dé, et il faut faire six pour sortir. Évidemment.', [2, 4], { image: uri(600, 600, ludo), size: 5, pieces: HORSES.map(([id, n, c]) => pawn(id, `Cheval ${n}`, c, 4, 0.28)), reserves: HORSES.map(([id, n]) => ROW(id, `Écurie ${n}`)) });

let oie = '';
const GEESE = [5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59], TRAPS = [6, 19, 31, 42, 52, 58];
for (let n = 0; n <= 63; n++) {
  const row = Math.floor(n / 8), col = row % 2 ? 7 - (n % 8) : n % 8;
  const fill = n === 0 ? BLACK : n === 63 ? RED : GEESE.includes(n) ? YELLOW : TRAPS.includes(n) ? '#3a3933' : n % 2 ? PAPER : '#e4ddcb';
  oie += rect(col * 80, row * 75, 80, 75, fill, `stroke="${BLACK}" stroke-width="3"`) + label(col * 80 + 40, row * 75 + 50, n === 0 ? 'DÉPART' : String(n), n === 0 ? 17 : 34, n === 0 || TRAPS.includes(n) ? PAPER : BLACK);
}
board('jeu-de-l-oie', "Jeu de l'oie", 'Soixante-trois cases, des oies qui font rejouer et des pièges où l’on reste coincé.', [2, 6], { image: uri(640, 600, oie), ratio: 600 / 640, size: 5.4, pieces: [RED, YELLOW, BLUE, GREEN, BLACK, '#f29bc0'].map((c, i) => pawn(`pions-${i + 1}`, `Pion ${i + 1}`, c, 1, 0.3, String(i + 1))), reserves: [ROW('pions', 'Les pions')] });

let aw = rect(0, 0, 720, 260, KRAFT);
for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) aw += `<circle cx="${60 + c * 120}" cy="${70 + r * 120}" r="50" fill="${PAPER}" stroke="${BLACK}" stroke-width="6"/>`;
board('awale', 'Awalé', 'Douze trous, quarante-huit graines : on sème, on récolte.', [2, 2], { image: uri(720, 260, aw), ratio: 260 / 720, size: 6, pieces: [pawn('graines', 'Graine', '#6b4a2f', 48, 0.2)], reserves: [{ ...BOL('graines', 'Sac de graines'), faceUp: true }], counters: [{ id: 'recolte', name: 'Récolte', scope: 'player', initial: 0 }] });

let pegBoard = '';
for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if ((x >= 2 && x <= 4) || (y >= 2 && y <= 4)) pegBoard += `<circle cx="${45 + x * 85}" cy="${45 + y * 85}" r="26" fill="${x === 3 && y === 3 ? YELLOW : KRAFT}" stroke="${BLACK}" stroke-width="6"/>`;
board('solitaire', 'Solitaire à pions', 'Trente-deux pions, un trou au milieu. On saute, on retire, il doit en rester un.', [1, 1], { image: uri(600, 600, pegBoard), pieces: [pawn('pions', 'Pion', RED, 32, 0.42)], reserves: [{ ...BOL('pions', 'Les pions'), faceUp: true }] });

// Dominoes: a double-six set, each tile drawn with its pips.
const PIPS = [[], [[1, 1]], [[0, 0], [2, 2]], [[0, 0], [1, 1], [2, 2]], [[0, 0], [2, 0], [0, 2], [2, 2]], [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]]];
const half = (n, oy) => PIPS[n].map(([x, y]) => `<circle cx="${25 + x * 25}" cy="${oy + 25 + y * 25}" r="9" fill="${BLACK}"/>`).join('');
const dominoes = [];
for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) dominoes.push({ id: `d${a}${b}`, name: `Domino ${a}-${b}`, shape: 'square', size: 0.5, ratio: 2, image: uri(100, 200, half(a, 0) + half(b, 100) + `<path d="M12 100H88" stroke="${BLACK}" stroke-width="5"/>`) });
game({ id: 'dominos', name: 'Dominos', category: 'Plateaux et pions', description: 'Vingt-huit dominos, du double blanc au double six.', players: [2, 4],
  decks: { dominos: { name: 'Les 28 dominos', back: { color: BLACK, label: '·' }, cards: dominoes } },
  zones: [{ id: 'talon', name: 'La pioche', visibility: 'hidden', layout: 'stack' }, TAPIS, MAIN], counters: [SCORE], ui: { hand: 'main', draw: 'talon', play: 'tapis' },
  setup: [{ op: 'spawn', deck: 'dominos', to: 'talon' }, { op: 'shuffle', zone: 'talon' }], macros: [dealN(7, 9), gather(), draw()] });

// Loto: ninety numbered tokens in a bag, and cards of fifteen numbers.
let seed = 20261116;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const cartons = Array.from({ length: 12 }, (_, k) => {
  let body = '';
  const used = new Set();
  for (let row = 0; row < 3; row++) {
    const colsHere = new Set();
    while (colsHere.size < 5) colsHere.add(rnd(9));
    for (let col = 0; col < 9; col++) {
      let n = null;
      if (colsHere.has(col)) do { n = col * 10 + rnd(10) + (col === 0 ? 1 : 0); if (col === 8 && rnd(11) === 0) n = 90; } while (used.has(n) || n > 90 || n < 1);
      if (n) used.add(n);
      body += rect(col * 60, row * 60, 60, 60, n ? PAPER : YELLOW, `stroke="${BLACK}" stroke-width="3"`) + (n ? label(col * 60 + 30, row * 60 + 42, String(n), 32) : '');
    }
  }
  return { id: `carton${k + 1}`, name: `Carton n° ${k + 1}`, shape: 'square', size: 2.6, ratio: 180 / 540, image: uri(540, 180, body) };
});
game({ id: 'loto', name: 'Loto', category: 'Plateaux et pions', description: 'Un sac de quatre-vingt-dix numéros, des cartons, des haricots. Quine !', players: [2, 8],
  decks: { sac: { name: 'Le sac de numéros', back: { color: RED, label: '?' }, cards: Array.from({ length: 90 }, (_, i) => ({ id: `n${i + 1}`, name: `Le ${i + 1}`, shape: 'round', size: 0.5, color: BLACK, art: String(i + 1) })) }, cartons: { name: 'Les cartons', back: { color: YELLOW, label: '▦' }, cards: cartons }, pions: { name: 'Les marqueurs', back: { color: BLACK, label: '●' }, cards: [pawn('marqueur', 'Marqueur', RED, 99, 0.26)] } },
  zones: [{ id: 'talon', name: 'Le sac', visibility: 'hidden', layout: 'stack' }, { id: 'tapis', name: 'Numéros sortis', layout: 'row' }, { id: 'cartons', name: 'Cartons', layout: 'stack' }, { id: 'marqueurs', name: 'Marqueurs', layout: 'stack' }, { id: 'main', name: 'Mes cartons', owner: 'player', layout: 'free' }],
  counters: [], ui: { hand: 'main', draw: 'talon', play: 'tapis' },
  setup: [{ op: 'spawn', deck: 'sac', to: 'talon' }, { op: 'shuffle', zone: 'talon' }, { op: 'spawn', deck: 'cartons', to: 'cartons' }, { op: 'shuffle', zone: 'cartons' }, { op: 'flip', zone: 'cartons', faceUp: true }, { op: 'spawn', deck: 'pions', to: 'marqueurs' }, { op: 'flip', zone: 'marqueurs', faceUp: true }],
  macros: [{ id: 'cartons', name: 'Distribuer les cartons…', group: SETUP, params: [{ id: 'n', name: 'Cartons par joueur', min: 1, max: 3, default: 1 }], steps: [{ op: 'deal', from: 'cartons', to: 'main', count: '$n', faceUp: true }] }, { id: 'tirer', name: 'Tirer un numéro', group: 'À mon tour', steps: [{ op: 'move', from: 'talon', to: 'tapis', count: 1, faceUp: true }] }] });

// Bataille navale: each player has a grid nobody else can see.
let sea = '';
for (let i = 0; i <= 10; i++) sea += `<path d="M${40 + i * 44} 40V480M40 ${40 + i * 44}H480" stroke="${BLACK}" stroke-width="3"/>`;
for (let i = 0; i < 10; i++) sea += label(62 + i * 44, 30, 'ABCDEFGHIJ'[i], 22) + label(20, 70 + i * 44, String(i + 1), 22);
const ship = (id, name, len, count) => ({ id, name, shape: 'square', size: 0.33 * len, ratio: 1 / len, color: '#3a3933', count });
game({ id: 'bataille-navale', name: 'Bataille navale', category: 'Plateaux et pions', description: 'Une grille cachée, cinq navires, et « B7 ? — À l’eau. »', players: [2, 2],
  decks: { flotte: { name: 'La flotte', back: { color: BLUE, label: '~' }, cards: [ship('porte-avions', 'Porte-avions (5 cases)', 5, 1), ship('croiseur', 'Croiseur (4 cases)', 4, 1), ship('contre-torpilleur', 'Contre-torpilleur (3 cases)', 3, 2), ship('torpilleur', 'Torpilleur (2 cases)', 2, 1)] }, pions: { name: 'Les pions de tir', back: { color: BLACK, label: '●' }, cards: [pawn('touche', 'Touché', RED, 34, 0.24), pawn('eau', "À l'eau", '#fbf8ef', 80, 0.24)] } },
  zones: [{ id: 'touches', name: 'Pions « touché »', layout: 'stack' }, { id: 'eaux', name: "Pions « à l'eau »", layout: 'stack' }, { id: 'grille', name: 'Ma grille (secrète)', owner: 'player', visibility: 'owner', layout: 'free', image: uri(520, 520, sea) }, { id: 'main', name: 'Mes navires', owner: 'player', visibility: 'owner', layout: 'row' }, { id: 'tirs', name: 'Mes tirs', owner: 'player', layout: 'free', image: uri(520, 520, sea) }],
  counters: [], ui: { hand: 'main', play: 'grille' },
  setup: [{ op: 'spawn', deck: 'flotte', to: 'main' }, { op: 'spawn', deck: 'pions', to: 'touches' }, { op: 'move', from: 'touches', to: 'eaux', count: 80 }, { op: 'flip', zone: 'touches', faceUp: true }, { op: 'flip', zone: 'eaux', faceUp: true }], macros: [] });

// ------------------------------------------------------------ 3. generic and home-made

const PAIRS = ['champignon', 'lune', 'flamme', 'goutte', 'main', 'ciseaux', 'fiole', 'tasse', 'oiseau', 'balai', 'chardon', 'sapin', 'diamant', 'eclair', 'crane', 'couronne'];
const TINTS = [RED, '#1f4e79', '#d9711c', '#14808a', '#7a5c9c', BLACK, GREEN, '#b8322a'];
const rows = [1, 2, 3, 4].map((i) => ({ id: `rang${i}`, name: `Rangée ${i}`, layout: 'row' }));
game({ id: 'paires', name: 'Jeu de paires', category: 'Créations Tapipi', description: 'Trente-deux cartes face cachée, seize paires à retrouver. La mémoire fait le reste.', players: [1, 6],
  decks: { paires: { name: 'Les 32 cartes', back: { color: BLACK, label: '?' }, cards: PAIRS.map((g, i) => ({ id: g, name: g[0].toUpperCase() + g.slice(1), art: `:${g}`, color: TINTS[i % TINTS.length], count: 2 })) } },
  zones: [{ id: 'talon', name: 'Paquet', visibility: 'hidden', layout: 'stack' }, ...rows, { id: 'main', name: 'Mes paires', owner: 'player', layout: 'stack' }], counters: [SCORE], ui: { hand: 'main', draw: 'talon' },
  setup: [{ op: 'spawn', deck: 'paires', to: 'talon' }, { op: 'shuffle', zone: 'talon' }, ...rows.flatMap((r) => [{ op: 'move', from: 'talon', to: r.id, count: 8, faceUp: false }])],
  quickstart: ['À votre tour, retournez deux cartes (cliquez dessus puis « Retourner »).', 'Une paire ? Glissez-la sur « Mes paires » et rejouez. Sinon, retournez-les face cachée.', 'Quand tout est ramassé, celui qui a le plus de paires gagne.'], macros: [] });

const FAMILIES = [['Tomate', 'tomate', RED], ['Chaussette', 'chaussette', '#1f4e79'], ['Chardon', 'chardon', GREEN], ['Crâne', 'crane', BLACK], ['Tasse', 'tasse', '#6b4a2f'], ['Balai', 'balai', '#d9711c'], ['Flamme', 'flamme', '#7a5c9c']];
const MEMBERS = ['Le grand-père', 'La grand-mère', 'Le père', 'La mère', 'Le fils', 'La fille'];
game({ id: 'sept-familles', name: 'Sept familles', category: 'Créations Tapipi', description: 'Sept familles pas très nettes, six membres chacune. « Dans la famille Chaussette, je voudrais… »', players: [2, 6],
  decks: { familles: { name: 'Les 42 cartes', back: { color: '#3b2a5c', label: '7' }, cards: FAMILIES.flatMap(([fam, g, c]) => MEMBERS.map((m, i) => ({ id: `${g}-${i + 1}`, name: `${m} ${fam}`, type: `Famille ${fam}`, cost: String(i + 1), art: `:${g}`, color: c }))) } },
  zones: [T, MAIN, { id: 'familles', name: 'Familles complètes', owner: 'player', layout: 'row' }], counters: [], ui: { hand: 'main', draw: 'talon' },
  setup: [{ op: 'spawn', deck: 'familles', to: 'talon' }, { op: 'shuffle', zone: 'talon' }], macros: [dealN(7, 8), gather(), draw()] });

const MIMES = ['Un chat sous la pluie', 'Monter un meuble sans notice', 'Le lundi matin', 'Un escargot pressé', 'Éplucher un oignon', 'Rater son train', 'Un pingouin en vacances', 'Chercher ses clés', 'Un robot fatigué', 'Marcher sur un jouet', 'La grasse matinée', 'Un pirate enrhumé', 'Changer une ampoule', 'Un fantôme timide', 'Faire la queue', 'Un café trop chaud', 'Un chef d’orchestre', 'Le hoquet', 'Un poisson rouge', 'Plier un drap-housse', 'Une statue qui s’ennuie', 'Un dentiste', 'Le mal de mer', 'Gonfler un matelas', 'Un chien qui a volé une chaussette', 'La sieste au bureau', 'Un jardinier', 'Perdre aux cartes', 'Un cactus', 'Tricher sans se faire prendre', 'Un facteur sous l’orage', 'Une mouette affamée', 'Le dernier biscuit', 'Un funambule', 'Renverser son café', 'Un photographe', 'Une valise trop pleine', 'Un vampire au soleil', 'Faire des crêpes', 'Un réveil qui sonne', 'Un astronaute', 'La vaisselle', 'Un épouvantail', 'Avoir froid aux pieds', 'Un arbitre', 'Un tapis volant', 'Mélanger des cartes', 'Un chardon'];
const MODES = [['Mime', ':main', RED], ['Dessin', ':parchemin', '#1f4e79'], ['Bouche cousue', ':crane', BLACK]];
game({ id: 'mimes', name: 'Mimes et devinettes', category: 'Créations Tapipi', description: 'Quarante-huit choses à faire deviner sans un mot, avec un crayon, ou en fredonnant.', players: [3, 8], duration: '20 min',
  decks: { cartes: { name: 'Les 48 cartes', back: { color: YELLOW, label: '!' }, cards: MIMES.map((text, i) => { const [type, art, color] = MODES[i % 3]; return { id: `m${i + 1}`, name: text, type, art, color, text: type === 'Mime' ? 'Faites-le deviner sans parler.' : type === 'Dessin' ? 'Dessinez-le, sans lettres ni chiffres.' : 'Faites-le deviner bouche fermée : bruits et fredonnements seulement.' }; }) } },
  zones: [T, DEFAUSSE, MAIN], counters: [SCORE], ui: { hand: 'main', draw: 'talon', play: 'defausse' },
  setup: [{ op: 'spawn', deck: 'cartes', to: 'talon' }, { op: 'shuffle', zone: 'talon' }],
  quickstart: ['À votre tour, piochez une carte : vous seul la voyez.', 'Faites deviner ce qui est écrit, selon le type de la carte (mime, dessin ou bouche cousue).', 'Un point pour vous et un pour celui qui trouve (boutons + à droite). Défaussez la carte.'], macros: [gather(), draw()] });

const LETTERS = { E: 15, A: 9, I: 8, S: 8, N: 7, T: 7, R: 7, U: 6, L: 6, O: 6, D: 4, C: 3, M: 3, P: 3, V: 2, G: 2, B: 2, F: 2, H: 2, Q: 1, J: 1, X: 1, Y: 1, Z: 1, K: 1, W: 1 };
game({ id: 'sac-de-lettres', name: 'Sac de lettres', category: 'Créations Tapipi', description: 'Cent dix tuiles-lettres dans un sac, sans plateau ni points : pour tous les jeux de mots que vous connaissez.', players: [1, 8],
  decks: { lettres: { name: 'Le sac de lettres', back: { color: KRAFT, label: 'A' }, cards: [...Object.entries(LETTERS).map(([l, count]) => ({ id: l, name: `Lettre ${l}`, shape: 'square', size: 0.5, color: BLACK, art: l, count })), { id: 'blanc', name: 'Tuile blanche', shape: 'square', size: 0.5, color: RED, count: 2 }] } },
  zones: [{ id: 'talon', name: 'Le sac', visibility: 'hidden', layout: 'stack' }, TAPIS, MAIN], counters: [SCORE], ui: { hand: 'main', draw: 'talon', play: 'tapis' },
  setup: [{ op: 'spawn', deck: 'lettres', to: 'talon' }, { op: 'shuffle', zone: 'talon' }], macros: [dealN(7, 12), gather(), draw()] });

// Bottom to top of the box: the top N cards are the roles for N players.
const ROLES = [['Collègue', 2, ':tasse', '#4a463c', 'Vous n’avez rien fait. Trouvez qui a fini le café.'], ['Complice', 1, ':main', '#d9711c', 'Vous savez qui est le coupable (il vous fait un clin d’œil pendant la nuit). Protégez-le.'], ['Collègue', 3, ':tasse', '#4a463c', 'Vous n’avez rien fait. Trouvez qui a fini le café.'], ['Témoin', 1, ':oeil', '#1f4e79', 'Pendant la nuit, vous ouvrez les yeux et voyez le coupable. Aidez les collègues sans vous faire repérer.'], ['Coupable', 1, ':goutte', RED, 'C’est vous qui avez fini le café sans en refaire. Ne vous faites pas accuser.']];
game({ id: 'qui-a-fini-le-cafe', name: 'Qui a fini le café ?', category: 'Créations Tapipi', description: 'Quelqu’un a vidé la cafetière sans en refaire. Un coupable, un témoin, des collègues à cran. Rôles cachés et mauvaise foi.', players: [4, 8], duration: '10 min',
  decks: { roles: { name: 'Les rôles', back: { color: '#6b4a2f', label: '?' }, cards: ROLES.map(([name, count, art, color, text], i) => ({ id: `role${i}`, name, type: 'Rôle secret', art, color, text, count })) } },
  zones: [{ id: 'boite', name: 'Boîte', visibility: 'hidden', layout: 'stack' }, { id: 'talon', name: 'Rôles en jeu', visibility: 'hidden', layout: 'stack' }, MAIN, { id: 'verdict', name: 'Accusé', owner: 'player', layout: 'row' }],
  counters: [{ id: 'votes', name: 'Votes contre', scope: 'player', initial: 0 }], ui: { hand: 'main' },
  setup: [{ op: 'spawn', deck: 'roles', to: 'boite' }],
  quickstart: ['L’hôte lance « Distribuer les rôles » avec le nombre de joueurs : chacun reçoit un rôle secret.', 'Tout le monde ferme les yeux ; le coupable les ouvre, puis le témoin (et le complice à 6 joueurs ou plus).', 'Trois minutes de discussion, puis chacun vote (bouton + sous le nom de l’accusé).', 'Le plus accusé retourne sa carte : si c’est le coupable, les collègues gagnent. Pour rejouer : « Nouvelle partie ».'],
  macros: [{ id: 'roles', name: 'Distribuer les rôles…', group: SETUP, params: [{ id: 'n', name: 'Nombre de joueurs', min: 4, max: 8, default: 5 }], steps: [{ op: 'move', from: 'boite', to: 'talon', count: '$n' }, { op: 'shuffle', zone: 'talon' }, { op: 'deal', from: 'talon', to: 'main', count: 1 }, { op: 'setCounter', counter: 'votes', value: 0 }] }] });

const LOTS = [['Lampe sans ampoule', 2, 'eclair'], ['Service à thé dépareillé', 3, 'tasse'], ['Balai de sorcière (authentique)', 7, 'balai'], ['Couronne en fer-blanc', 5, 'couronne'], ['Chaussette orpheline', 1, 'chaussette'], ['Grimoire illisible', 6, 'parchemin'], ['Crâne en plâtre', 4, 'crane'], ['Diamant (en verre)', 2, 'diamant'], ['Vrai diamant, oublié là', 12, 'diamant'], ['Oiseau empaillé', 5, 'oiseau'], ['Fiole suspecte', 3, 'fiole'], ['Sapin en plastique', 2, 'sapin'], ['Paire de ciseaux rouillés', 1, 'ciseaux'], ['Dé pipé', 4, 'de'], ['Rouleau de papier peint', 1, 'rouleau'], ['Champignon séché', 2, 'champignon'], ['Lanterne de marine', 8, 'flamme'], ['Étoile de shérif', 6, 'etoile'], ['Lune en papier mâché', 3, 'lune'], ['Bocal de pluie', 1, 'goutte'], ['Moule à tarte historique', 4, 'tarte'], ['Cœur en pain d’épices', 2, 'coeur'], ['Pansements d’époque', 1, 'pansement'], ['Bouquet de chardons', 3, 'chardon']];
game({ id: 'encheres-au-grenier', name: 'Enchères au grenier', category: 'Créations Tapipi', description: 'Vingt-quatre lots sortis d’un grenier, vingt sous en poche. Certains valent une fortune, la plupart rien du tout.', players: [3, 6], duration: '20 min',
  decks: { lots: { name: 'Les 24 lots', back: { color: '#6b4a2f', label: '?' }, cards: LOTS.map(([name, value, g], i) => ({ id: `lot${i + 1}`, name, type: 'Lot', stats: `${value} pts`, art: `:${g}`, color: TINTS[i % TINTS.length] })) } },
  zones: [T, { id: 'tapis', name: 'En vente', layout: 'row' }, { id: 'main', name: 'Mes lots', owner: 'player', visibility: 'owner', layout: 'row' }], counters: [{ id: 'sous', name: 'Sous', scope: 'player', initial: 20 }], ui: { hand: 'main', draw: 'talon', play: 'tapis' },
  setup: [{ op: 'spawn', deck: 'lots', to: 'talon' }, { op: 'shuffle', zone: 'talon' }],
  quickstart: ['« Mettre un lot en vente » pose une carte face cachée : personne ne sait ce qu’elle vaut.', 'Le joueur dont c’est le tour peut la regarder en secret (« Regarder ») avant de lancer les enchères à voix haute.', 'Le plus offrant paie en sous (bouton − à côté de son nom) et glisse le lot dans sa main.', 'Quand le talon est vide, on additionne les points des lots : le plus riche gagne.'],
  macros: [{ id: 'vente', name: 'Mettre un lot en vente', group: 'À mon tour', steps: [{ op: 'move', from: 'talon', to: 'tapis', count: 1, faceUp: false }] }, gather()] });

let track = '';
const SNAILS = [RED, YELLOW, BLUE, GREEN, BLACK, '#f29bc0'];
for (let lane = 0; lane < 6; lane++) for (let c = 0; c < 12; c++) track += rect(c * 60, lane * 60, 60, 60, c === 0 ? SNAILS[lane] : c === 11 ? (lane % 2 ? BLACK : PAPER) : c % 2 ? PAPER : '#e4ddcb', `stroke="${BLACK}" stroke-width="3"`) + (c === 0 ? label(30, lane * 60 + 42, String(lane + 1), 34, lane === 1 || lane === 5 ? BLACK : PAPER) : '');
board('course-d-escargots', "Course d'escargots", 'Six escargots numérotés, un dé, et un pari secret sur celui qui arrivera… un jour.', [2, 6], {
  category: 'Créations Tapipi', image: uri(720, 360, track), ratio: 0.5, size: 6, hand: true,
  pieces: [...SNAILS.map((c, i) => pawn(`escargots-${i + 1}`, `Escargot ${i + 1}`, c, 1, 0.36, String(i + 1))), ...SNAILS.map((c, i) => ({ id: `paris-${i + 1}`, name: `Pari sur l'escargot ${i + 1}`, type: 'Pari secret', art: String(i + 1), color: c }))],
  reserves: [ROW('escargots', 'Les escargots'), { ...BOL('paris', 'Les paris'), visibility: 'hidden', shuffle: true, back: '#6b4a2f', label: '?' }],
  macros: [{ id: 'parier', name: 'Distribuer les paris', group: SETUP, steps: [{ op: 'deal', from: 'paris', to: 'main', count: 1 }] }],
  quickstart: ['« Distribuer les paris » : chacun reçoit en secret le numéro d’un escargot.', 'Posez les six escargots sur leur case de départ numérotée.', 'À votre tour, lancez le dé (à droite) : l’escargot de ce numéro avance d’une case. C’est tout.', 'Quand un escargot franchit l’arrivée, on révèle les paris.'],
});

// ------------------------------------------------------------ write

for (const file of readdirSync(new URL('../games/', import.meta.url))) if (file.startsWith('c-')) unlinkSync(new URL(`../games/${file}`, import.meta.url));
for (const def of out) writeFileSync(new URL(`../games/c-${def.id}.json`, import.meta.url), JSON.stringify(def) + '\n');
console.log(`${out.length} jeux écrits`);
