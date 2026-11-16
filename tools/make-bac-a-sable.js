// Generates games/05-bac-a-sable.json: a sandbox showing components of every
// size — a board fixed to the table, pawns, square tiles, small and large cards.
// Run: node tools/make-bac-a-sable.js
import { writeFileSync } from 'node:fs';

const N = 8;
let squares = '';
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  squares += `<rect x="${x * 50}" y="${y * 50}" width="50" height="50" fill="${(x + y) % 2 ? '#c9b48a' : '#f1e6c8'}"/>`;
}
const board = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 420 420"><rect x="-10" y="-10" width="420" height="420" fill="#6b4a2f"/>${squares}</svg>`;

const pawns = [['Rouge', '#c0392b'], ['Bleu', '#2f6fb3'], ['Vert', '#2e8b57'], ['Jaune', '#d4a017']];
const boardDeck = [
  { id: 'plateau', name: 'Plateau', shape: 'square', size: 4.6, fixed: true, image: `data:image/svg+xml;base64,${Buffer.from(board).toString('base64')}` },
];
const cards = [
  ...pawns.map(([name, color]) => ({ id: `pion-${name.toLowerCase()}`, name: `Pion ${name.toLowerCase()}`, shape: 'round', size: 0.5, color, count: 8 })),
  { id: 'tuile-foret', name: 'Tuile forêt', shape: 'square', size: 0.74, color: '#2e6b3f', art: '🌲', count: 6 },
  { id: 'tuile-eau', name: 'Tuile eau', shape: 'square', size: 0.74, color: '#2a6f97', art: '🌊', count: 6 },
  { id: 'mini', name: 'Mini-carte', type: 'Ressource', size: 0.6, color: '#7a5c9c', art: '💎', count: 6 },
  { id: 'evenement', name: 'Événement', type: 'Carte', color: '#b8322a', art: '⚡', text: 'Une carte de taille standard.', count: 4 },
  { id: 'aide', name: 'Aide de jeu', type: 'Grande carte', size: 1.6, ratio: 0.7, color: '#4a5562', art: '📜', text: 'Une grande carte, au format paysage.', count: 1 },
];

const def = {
  format: 'tapis/1',
  id: 'bac-a-sable',
  name: 'Bac à sable : plateau et pions',
  description: 'Un plateau, des pions empilables, des tuiles carrées et des cartes de toutes tailles. Pour inventer un jeu ou jouer aux dames.',
  author: 'Tapis',
  license: 'CC0-1.0',
  players: { min: 1, max: 6 },
  quickstart: [
    'Glissez les pions de la réserve vers le plateau : ils s’empilent librement.',
    'Cliquez sur un pion ou une tuile pour le retourner, l’incliner ou y poser un jeton.',
    'Le plateau est fixé : rien ne le déplace, même si quelqu’un renverse la table.',
  ],
  rules: "Aucune règle : ce jeu montre ce que le format permet.\n\nDans le fichier, chaque composant a une forme (shape : card, square, round), une taille (size : 1 = une carte standard, 4.6 = ce plateau) et un format (ratio = hauteur / largeur). « fixed » le visse à la table.",
  table: { color: '#3d3226' },
  decks: { plateau: { cards: boardDeck }, materiel: { back: { color: '#4a5562', label: '◆' }, cards } },
  zones: [
    { id: 'plateau', name: 'Plateau', layout: 'free' },
    { id: 'reserve', name: 'Réserve', layout: 'row' },
    { id: 'main', name: 'Main', owner: 'player', visibility: 'owner', layout: 'row' },
  ],
  counters: [{ id: 'points', name: 'Points', scope: 'player', initial: 0 }],
  ui: { hand: 'main', play: 'plateau' },
  setup: [{ op: 'spawn', deck: 'plateau', to: 'plateau' }, { op: 'spawn', deck: 'materiel', to: 'reserve' }],
  macros: [{ id: 'ranger', name: 'Tout ranger dans la réserve', steps: [{ op: 'gather', to: 'reserve' }] }],
};
writeFileSync(new URL('../games/05-bac-a-sable.json', import.meta.url), JSON.stringify(def, null, 2) + '\n');
