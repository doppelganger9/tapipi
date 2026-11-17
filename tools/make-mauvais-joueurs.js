// Generates games/00-mauvais-joueurs.json: Tapipi's own duelling card game.
//
// A game about the people one plays games with. Everything here is original:
// the cards, their texts and the rules. Run: node tools/make-mauvais-joueurs.js
import { writeFileSync } from 'node:fs';

const RED = '#c4260a', BLACK = '#0b0b0b', BLUE = '#1f4e79';

// [id, name, cost, culot/sang-froid, pictogram, copies, text]
const players = [
  ['debutant', 'Le Débutant', 0, '1/1', 'coche', 3, '« Et là, je fais quoi ? » Gratuit, plein de bonne volonté, vite vexé.'],
  ['bavard', 'Le Bavard', 1, '1/2', 'vent', 2, 'Tant qu’il est sur votre table, l’adversaire doit annoncer à voix haute tout ce qu’il fait. S’il oublie : −1 Moral.'],
  ['analyste', 'L’Analyste', 1, '0/5', 'lune', 2, 'Ne fait jamais de remarque : il réfléchit. Tant qu’il est là, vos autres Joueurs ne peuvent pas être vexés par un Coup bas.'],
  ['grignoteur', 'Le Grignoteur', 1, '1/3', 'tarte', 2, 'Quand il arrive : posez un jeton gras sur un Joueur adverse. Il a −1 Culot tant qu’il garde le jeton.'],
  ['tricheur', 'Le Tricheur', 2, '3/1', 'oeil', 2, 'Quand il arrive : utilisez une fois le bouton « Lorgner » sur la main adverse. Si vous vous faites prendre, défaussez le Tricheur.'],
  ['lecteur', 'Le Lecteur de règles', 2, '1/4', 'parchemin', 2, '« Attendez, je vérifie. » Tant qu’il est là, les Coups bas de l’adversaire coûtent 1 de plus.'],
  ['chanceuse', 'La Chanceuse', 2, '?/2', 'de', 2, 'Quand elle fait une remarque, lancez le dé : son Culot vaut la moitié du résultat, arrondie au-dessus.'],
  ['retardataire', 'Le Retardataire', 2, '4/3', 'chaussette', 2, 'Arrive incliné : il ne fait pas de remarque le tour où il est posé.'],
  ['perdante', 'La Mauvaise Perdante', 3, '2/4', 'flamme', 2, 'Quand elle est vexée, elle ne part pas sans rien dire : l’adversaire perd 1 Moral.'],
  ['optimisateur', 'L’Optimisateur', 3, '3/2', 'diamant', 2, 'Quand il arrive : piochez une carte. Il avait tout calculé.'],
  ['capitaine', 'La Capitaine de soirée', 3, '2/3', 'etoile', 1, 'Vos autres Joueurs ont +1 Culot. C’est elle qui a apporté le jeu, après tout.'],
  ['maitre', 'Le Maître du jeu', 3, '4/5', 'couronne', 1, 'Il ne peut y en avoir qu’un sur votre table. « C’est moi qui explique. »'],
];
const tricks = [
  ['tomate', 'Tomate bien mûre', 1, 'tomate', 2, 'Vexez un Joueur adverse dont le Sang-froid est de 2 ou moins. Lancez quelque chose sur votre adversaire, pour la forme.'],
  ['cafe', 'Café renversé', 1, 'tasse', 2, 'Un Joueur adverse a −2 Sang-froid jusqu’à la fin du tour. Renversez votre café : il faut ce qu’il faut.'],
  ['pause', 'Pause pipi', 1, 'rouleau', 2, 'Inclinez un Joueur adverse : il ne fera pas de remarque à son prochain tour.'],
  ['manche', 'Carte dans la manche', 1, 'main', 2, 'Piochez deux cartes.'],
  ['regles', '« C’est pas dans les règles ! »', 2, 'croix', 2, 'À jouer pendant le tour adverse : annulez le Coup bas qu’il vient de jouer. Il le défausse quand même.'],
  ['mauvaise-foi', 'Mauvaise foi', 2, 'eclair', 2, 'Un de vos Joueurs a +3 Culot jusqu’à la fin du tour.'],
  ['relecture', 'Relecture des règles', 2, 'pansement', 1, 'Regagnez 3 Moral (sans dépasser 12). Tout le monde souffle un peu.'],
  ['table', 'Renverser la table', 3, 'crane', 1, 'Tous les Joueurs de toutes les tables sont défaussés. Cliquez sur le bouton, vous en mourez d’envie.'],
];
const props = [
  ['chips', 'Bol de chips', 1, 'chips', 2, 'Reste sur votre table. Au début de votre tour, piochez une carte de plus.'],
  ['tapis', 'Tapis de jeu', 2, 'sapin', 1, 'Reste sur votre table. Vos Joueurs ont +1 Sang-froid.'],
  ['de-pipe', 'Dé pipé', 1, 'de', 1, 'Reste sur votre table. Une fois par tour, relancez un dé que vous venez de lancer.'],
  ['chrono', 'Chronomètre', 2, 'chrono', 1, 'Reste sur votre table. L’adversaire a trente secondes par tour. S’il dépasse : −1 Moral. Comptez à voix haute, c’est plus pénible.'],
];

const cards = [
  ...players.map(([id, name, cost, stats, art, count, text]) => ({ id, name, type: 'Joueur', cost: String(cost), stats, art: `:${art}`, color: RED, count, text })),
  ...tricks.map(([id, name, cost, art, count, text]) => ({ id, name, type: 'Coup bas', cost: String(cost), art: `:${art}`, color: BLACK, count, text })),
  ...props.map(([id, name, cost, art, count, text]) => ({ id, name, type: 'Accessoire', cost: String(cost), art: `:${art}`, color: BLUE, count, text })),
];
const total = cards.reduce((n, c) => n + c.count, 0);

const rules = `MAUVAIS JOUEURS — le jeu de cartes des gens pénibles autour d'une table.

Deux à quatre joueurs. Chacun a le même paquet de ${total} cartes et 12 points de Moral. Le dernier à qui il reste du Moral a gagné : les autres ont quitté la table en claquant la porte.

LES CARTES
• Joueur (rouge) : reste sur votre table. En bas à droite, son Culot / son Sang-froid.
• Coup bas (noir) : fait ce qui est écrit, puis va à la défausse.
• Accessoire (bleu) : reste sur votre table et agit tant qu'il y est.
Le chiffre en haut à droite est le coût.

PAYER
Pour jouer une carte, défaussez de votre main autant d'autres cartes que son coût. Une carte de coût 0 est gratuite.

UN TOUR
1. Redressez vos cartes inclinées et piochez deux cartes (c'est automatique quand le tour précédent se termine).
2. Jouez autant de cartes que vous voulez et pouvez payer.
3. Chacun de vos Joueurs peut faire une remarque désobligeante, une fois : inclinez-le.
   — Contre un Joueur adverse : si le Culot du vôtre atteint ou dépasse le Sang-froid de l'autre, celui-ci est vexé et va à la défausse. Sinon, il ne se passe rien, à part un silence gêné.
   — Contre l'adversaire lui-même, seulement si sa table n'a aucun Joueur : il perd autant de Moral que le Culot du vôtre.
4. « Fin du tour ».

DÉTAILS
• Un Joueur peut faire une remarque dès le tour où il arrive, sauf mention contraire.
• Personne ne fait de remarque au tout premier tour de la partie.
• Pioche vide ? Mélangez votre défausse pour en refaire une (« Recycler ma défausse ») et perdez 1 Moral : la soirée s'éternise.
• Les jetons servent à noter les bonus et les malus qui durent.
• Les cartes qui vous demandent de lorgner, de lancer une tomate ou de renverser votre café sont à prendre au pied de la lettre.
• En cas de désaccord sur une règle, celui qui a le plus de Moral a raison.`;

const def = {
  format: 'tapis/1',
  id: 'mauvais-joueurs',
  name: 'Mauvais Joueurs',
  category: 'Créations Tapipi',
  description: 'Le jeu de cartes des gens pénibles autour d’une table : le Tricheur, la Mauvaise Perdante, l’Analyste… Faites craquer le Moral de l’adversaire avant qu’il ne renverse la table.',
  author: 'Tapipi',
  license: 'CC-BY-4.0',
  duration: '20 min',
  players: { min: 2, max: 4 },
  quickstart: [
    'Chacun a son paquet, 5 cartes en main et 12 de Moral. À zéro, on quitte la table : le dernier a gagné.',
    'Pour jouer une carte, défaussez de votre main autant de cartes que son coût (en haut à droite).',
    'Vos Joueurs (rouges) font chacun une remarque par tour : inclinez-les par un double-clic.',
    'Culot de l’attaquant ≥ Sang-froid du défenseur : il est vexé, à la défausse. Table adverse vide : il perd du Moral.',
    '« Fin du tour » : le suivant pioche deux cartes tout seul. Les règles complètes sont dans « Règles ».',
  ],
  rules,
  decks: { paquet: { name: `Paquet de départ (${total} cartes)`, back: { color: '#c4260a', label: '!' }, cards } },
  zones: [
    { id: 'pioche', name: 'Ma pioche', owner: 'player', visibility: 'hidden', layout: 'stack' },
    { id: 'table', name: 'Ma table', owner: 'player', layout: 'row' },
    { id: 'defausse', name: 'Ma défausse', owner: 'player', layout: 'stack' },
    { id: 'main', name: 'Main', owner: 'player', visibility: 'owner', layout: 'row' },
  ],
  counters: [{ id: 'moral', name: 'Moral', scope: 'player', initial: 12 }],
  ui: { hand: 'main', draw: 'pioche', play: 'table' },
  setup: [
    { op: 'spawn', deck: 'paquet', to: 'pioche' },
    { op: 'shuffle', zone: 'pioche' },
    { op: 'move', from: 'pioche', to: 'main', count: 5 },
  ],
  macros: [
    { id: 'debut', name: 'Début de tour : piocher 2', group: 'À mon tour', scope: 'me', on: 'turnStart', steps: [{ op: 'move', from: 'pioche', to: 'main', count: 2 }] },
    { id: 'piocher', name: 'Piocher…', group: 'À mon tour', scope: 'me', params: [{ id: 'n', name: 'Cartes à piocher', min: 1, max: 5, default: 1 }], steps: [{ op: 'move', from: 'pioche', to: 'main', count: '$n' }] },
    { id: 'recycler', name: 'Recycler ma défausse', group: 'À mon tour', scope: 'me', steps: [{ op: 'move', from: 'defausse', to: 'pioche', count: 'all', faceUp: false }, { op: 'shuffle', zone: 'pioche' }] },
  ],
};

writeFileSync(new URL('../games/00-mauvais-joueurs.json', import.meta.url), JSON.stringify(def, null, 2) + '\n');
console.log(`${total} cartes par joueur`);
