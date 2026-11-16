// Generates games/01-chaudrons-et-chardons.json, the original showcase game.
// Run: node tools/make-chaudrons.js
import { writeFileSync } from 'node:fs';

const families = [
  { id: 'amanite', name: 'Amanite', art: '🍄', color: '#b8322a' },
  { id: 'selenite', name: 'Sélénite', art: '🌙', color: '#4f46b8' },
  { id: 'braise', name: 'Braise', art: '🔥', color: '#d9711c' },
  { id: 'rosee', name: 'Rosée', art: '💧', color: '#14808a' },
];

const spells = [
  ['bourrasque', 'Bourrasque', '💨', 2, 'Chaque joueur passe une carte de sa main, face cachée, à son voisin de gauche.'],
  ['main-leste', 'Main leste', '🤏', 2, "Prenez une carte au hasard dans la main d'un adversaire."],
  ['secateur', 'Sécateur', '✂️', 2, "Défaussez un Chardon de n'importe quel chaudron, puis piochez une carte."],
  ['troc', 'Troc', '🔄', 2, "Échangez un ingrédient de votre chaudron contre un ingrédient du chaudron d'un adversaire."],
  ['double-dose', 'Double dose', '⚗️', 2, 'Jouez immédiatement deux autres cartes.'],
  ['tisane', 'Tisane', '🍵', 2, 'Piochez deux cartes.'],
  ['pie-voleuse', 'Pie voleuse', '🐦', 1, "Prenez l'ingrédient de votre choix dans la défausse et ajoutez-le à votre main."],
  ['grand-menage', 'Grand ménage', '🧹', 1, 'Tous les chaudrons sont vidés dans la défausse, Chardons compris.'],
];

const cards = [];
for (const f of families) {
  for (let value = 1; value <= 9; value++) {
    cards.push({ id: `${f.id}-${value}`, name: `${f.name} ${value}`, type: `Ingrédient · ${f.name}`, cost: String(value), art: f.art, color: f.color });
  }
}
for (const [id, name, art, count, text] of spells) {
  cards.push({ id, name, type: 'Sortilège', art, color: '#6b3fa0', text, count });
}
cards.push({
  id: 'chardon', name: 'Chardon', type: 'Nuisance', art: '🌵', color: '#4b6b2f', count: 6,
  text: "Posez-le dans le chaudron d'un adversaire : il occupe une place et empêche toute potion tant qu'il y reste.",
});

const rules = `CHAUDRONS & CHARDONS — 2 à 5 apprentis herboristes, 15 minutes.

BUT
Être le premier à brasser 7 potions.

MISE EN PLACE
Chacun reçoit 5 cartes. Le reste forme la pioche.

À VOTRE TOUR
1. Piochez une carte (double-clic sur la pioche).
2. Jouez UNE carte de votre main :
   • un Ingrédient, face visible dans votre chaudron (5 cartes maximum) ;
   • un Sortilège : appliquez son effet, puis défaussez-le ;
   • un Chardon, dans le chaudron d'un adversaire ;
   • ou défaussez une carte si vous ne pouvez ou ne voulez rien jouer.
3. Brassez si vous le pouvez, puis cliquez sur « Fin du tour ».
   Vous ne gardez jamais plus de 7 cartes en main.

BRASSER
Défaussez trois ingrédients de votre chaudron pour marquer :
   • trois valeurs qui se suivent (4-5-6), familles mélangées : 1 potion ;
   • trois ingrédients de la même famille : 2 potions ;
   • trois qui se suivent ET de la même famille : 4 potions.
Un chaudron qui contient un Chardon ne peut pas brasser.

SE DÉBARRASSER D'UN CHARDON
Au lieu de jouer une carte, défaussez le Chardon avec un ingrédient de votre main de valeur 7 ou plus. Ou utilisez un Sécateur.

PIOCHE VIDE
Utilisez l'action de table « Recycler la défausse ».`;

const def = {
  format: 'tapis/1',
  id: 'chaudrons-et-chardons',
  name: 'Chaudrons & Chardons',
  description: "Un jeu original fourni avec Tapis : brassez des potions avant vos rivaux et semez des chardons dans leurs chaudrons. Sert aussi de modèle pour créer votre propre jeu.",
  author: 'Tapis',
  license: 'CC-BY-4.0',
  players: { min: 2, max: 5 },
  duration: '15 min',
  quickstart: [
    'À votre tour : piochez une carte (double-clic sur la pioche).',
    'Jouez une carte : un ingrédient dans votre chaudron, un sortilège, ou un chardon chez un rival.',
    'Trois ingrédients qui se suivent ou de la même famille ? Défaussez-les et marquez vos potions.',
    'Premier à 7 potions : gagné. Terminez chaque tour avec « Fin du tour ».',
  ],
  rules,
  decks: { grimoire: { name: 'Le grimoire', back: { color: '#3b2a5c', label: '✦' }, cards } },
  zones: [
    { id: 'pioche', name: 'Pioche', visibility: 'hidden', layout: 'stack' },
    { id: 'defausse', name: 'Défausse', visibility: 'public', layout: 'stack' },
    { id: 'chaudron', name: 'Chaudron', owner: 'player', visibility: 'public', layout: 'row' },
    { id: 'main', name: 'Main', owner: 'player', visibility: 'owner', layout: 'row' },
  ],
  counters: [{ id: 'potions', name: 'Potions', scope: 'player', initial: 0 }],
  ui: { hand: 'main', draw: 'pioche', play: 'chaudron' },
  setup: [
    { op: 'spawn', deck: 'grimoire', to: 'pioche' },
    { op: 'shuffle', zone: 'pioche' },
    { op: 'deal', from: 'pioche', to: 'main', count: 5 },
  ],
  macros: [
    { id: 'piocher', name: 'Piocher…', group: 'À mon tour', scope: 'me', params: [{ id: 'n', name: 'Cartes à piocher', min: 1, max: 5, default: 1 }], steps: [{ op: 'move', from: 'pioche', to: 'main', count: '$n' }] },
    { id: 'recycler', name: 'Recycler la défausse', group: 'Entretien', steps: [{ op: 'move', from: 'defausse', to: 'pioche', count: 'all' }, { op: 'shuffle', zone: 'pioche' }] },
  ],
};

writeFileSync(new URL('../games/01-chaudrons-et-chardons.json', import.meta.url), JSON.stringify(def, null, 2) + '\n');
console.log(`${cards.reduce((n, c) => n + (c.count ?? 1), 0)} cartes`);
