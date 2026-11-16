// Game editor. Edits the raw game file (the same JSON players load on a table)
// and validates it live with the very module the server uses.
//
// The draft lives in this browser's localStorage. Saving drafts to an account
// is the natural place for a cloud-backed (paid) storage service to plug in.

import { $, h, fill } from './dom.js';
import { cardEl } from './cards.js';
import { GLYPHS } from './glyphs.js';
import { normalizeDefinition } from '/shared/definition.js';

const DRAFT_KEY = 'tapis:draft';
document.body.append(h('datalist', { id: 'glyphList' }, Object.keys(GLYPHS).map((name) => h('option', { value: `:${name}` }))));
const TEMPLATE = '/games/01-chaudrons-et-chardons.json';

let game = null; // raw definition
let deckId = null;
let current = 0; // index of the selected card in the deck

const deck = () => game.decks[deckId];
const cards = () => (deck().cards ??= []);
const preview = (card, detailed) => cardEl({ protos: { x: card }, decks: {} }, { p: 'x', up: true }, { detailed });

function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  setTimeout(() => { $('toast').hidden = true; }, 4000);
}

function blankGame() {
  return {
    format: 'tapis/1', id: 'mon-jeu', name: 'Mon jeu', description: '', players: { min: 2, max: 4 }, rules: '',
    decks: { cartes: { back: { color: '#3b2a5c', label: '✦' }, cards: [{ name: 'Première carte', type: 'Créature', cost: '1', art: ':oiseau', color: '#b8322a', text: 'Décrivez ici son effet.' }] } },
    zones: [
      { id: 'pioche', name: 'Pioche', visibility: 'hidden', layout: 'stack' },
      { id: 'defausse', name: 'Défausse', visibility: 'public', layout: 'stack' },
      { id: 'tapis', name: 'Tapis', visibility: 'public', layout: 'free' },
      { id: 'main', name: 'Main', owner: 'player', visibility: 'owner', layout: 'row' },
    ],
    counters: [{ id: 'points', name: 'Points', scope: 'player', initial: 0 }],
    setup: [{ op: 'spawn', deck: 'cartes', to: 'pioche' }, { op: 'shuffle', zone: 'pioche' }, { op: 'deal', from: 'pioche', to: 'main', count: 5 }],
  };
}

// ------------------------------------------------------------------ persistence

function save() {
  // A slug of the name keeps ids valid without asking authors to think about them.
  game.id = game.name.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 40) || 'mon-jeu';
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(game));
  } catch {
    toast('Brouillon trop volumineux pour être gardé dans ce navigateur : exportez le fichier.');
  }
  try {
    const def = normalizeDefinition(game);
    const total = Object.values(def.decks).reduce((n, d) => n + d.list.length, 0);
    $('validity').textContent = `✓ Fichier valide · ${total} cartes`;
    $('validity').classList.remove('bad');
  } catch (error) {
    $('validity').textContent = `✗ ${error.message}`;
    $('validity').classList.add('bad');
  }
}

function open(raw) {
  if (!raw || typeof raw !== 'object' || !raw.decks || !Object.keys(raw.decks).length) throw new Error('no deck');
  game = raw;
  game.players ??= { min: 2, max: 4 };
  deckId = Object.keys(game.decks)[0];
  current = 0;
  renderAll();
}

// ------------------------------------------------------------------ rendering

function renderGame() {
  $('g-name').value = game.name ?? '';
  $('g-description').value = game.description ?? '';
  $('g-min').value = game.players.min ?? 1;
  $('g-max').value = game.players.max ?? 4;
  $('g-felt').value = game.table?.color ?? '#1f5c4a';
  $('g-rules').value = game.rules ?? '';
  $('g-unboxing').checked = game.unboxing !== false;
  fill($('deck'), ...Object.keys(game.decks).map((id) => h('option', { value: id, selected: id === deckId }, id)));
}

function renderCards() {
  const list = cards();
  fill($('cards'), 
    deck().preset && h('p', { class: 'hint left' }, `Ce paquet contient le jeu traditionnel « ${deck().preset} ». Vous pouvez y ajouter des cartes.`),
    ...list.map((card, i) => {
      const el = preview(card, false);
      el.classList.toggle('selected', i === current);
      el.addEventListener('click', () => { current = i; renderCards(); renderCard(); });
      if ((card.count ?? 1) > 1) el.append(h('span', { class: 'badge' }, `×${card.count}`));
      return el;
    }),
  );
}

function renderCard() {
  const card = cards()[current];
  $('cardPanel').style.visibility = card ? 'visible' : 'hidden';
  if (!card) return;
  const form = $('cardForm');
  for (const field of ['name', 'type', 'cost', 'art', 'stats', 'text']) form.elements[field].value = card[field] ?? '';
  form.elements.color.value = card.color ?? '#4a5562';
  form.elements.count.value = card.count ?? 1;
  form.elements.shape.value = card.shape ?? 'card';
  form.elements.size.value = card.size ?? 1;
  fill($('cardPreview'), preview(card, true));
}

function renderAll() {
  renderGame();
  renderCards();
  renderCard();
  renderScripts();
  save();
}

// ------------------------------------------------------------------ scripts
//
// A script is a list of steps. "Mise en place" runs at the start of every game;
// the others are buttons at the table, optionally asking for a number, applying
// to everyone or only to whoever clicks, and optionally firing at each turn.

const OPS = {
  spawn: { label: 'Poser un paquet sur la table', fields: ['deck', 'to'] },
  shuffle: { label: 'Mélanger', fields: ['zone'] },
  move: { label: 'Distribuer / déplacer', fields: ['from', 'to', 'count', 'by'] },
  gather: { label: 'Tout ramasser vers', fields: ['to'] },
  flip: { label: 'Retourner tout', fields: ['zone', 'faceUp'] },
  setCounter: { label: 'Régler un compteur', fields: ['counter', 'value'] },
};
const FIELD_LABELS = { deck: 'paquet', to: 'vers', from: 'depuis', zone: 'zone', count: 'combien', by: 'par paquets de', counter: 'compteur', value: 'valeur' };

function choices(field) {
  if (field === 'deck') return Object.keys(game.decks).map((id) => [id, game.decks[id].name ?? id]);
  if (field === 'counter') return (game.counters ?? []).map((c) => [c.id, c.name ?? c.id]);
  return (game.zones ?? []).map((z) => [z.id, `${z.name ?? z.id}${z.owner === 'player' ? ' (chaque joueur)' : ''}`]);
}

function fieldEl(step, field, script) {
  const set = (value) => { value === undefined ? delete step[field] : (step[field] = value); save(); };
  if (field === 'faceUp') {
    return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: step.faceUp !== false, onchange: (e) => set(e.target.checked) }), 'face visible');
  }
  if (field === 'count') {
    const param = script?.params?.[0];
    const parse = (text) => (/^\$/.test(text) ? text : /^\d+$/.test(text) ? Number(text) : 'all');
    return h('label', {}, param ? `combien (ou $${param.id})` : FIELD_LABELS.count,
      h('input', { type: 'text', placeholder: 'tout', value: step.count === 'all' || step.count == null ? '' : String(step.count), oninput: (e) => set(parse(e.target.value.trim())) }));
  }
  if (field === 'by' || field === 'value') {
    return h('label', {}, FIELD_LABELS[field], h('input', { type: 'number', min: field === 'by' ? 1 : undefined, value: step[field] ?? '', placeholder: field === 'by' ? '1' : '0',
      oninput: (e) => set(e.target.value === '' ? undefined : Number(e.target.value)) }));
  }
  const options = choices(field);
  if (!options.some(([id]) => id === step[field])) {
    // A sensible first guess: cards usually go from the table to the players.
    const toPlayers = field === 'to' && step.op === 'move' && (game.zones ?? []).find((z) => z.owner === 'player');
    step[field] = toPlayers ? toPlayers.id : options[0]?.[0];
  }
  return h('label', {}, FIELD_LABELS[field], h('select', { onchange: (e) => set(e.target.value) }, options.map(([id, name]) => h('option', { value: id, selected: id === step[field] }, name))));
}

function stepsEl(steps, script) {
  const setup = !script;
  const change = (mutate) => () => { mutate(); renderScripts(); save(); };
  return [
    steps.map((step, i) => {
      if (step.op === 'deal') step.op = 'move'; // two names for the same operation
      return h('div', { class: 'step' },
        h('b', {}, `${i + 1}.`),
        h('label', {}, 'action', h('select', { onchange: (e) => { steps[i] = { op: e.target.value, ...(e.target.value === 'move' ? { count: 1 } : {}) }; renderScripts(); save(); } },
          Object.entries(OPS).filter(([op]) => setup || op !== 'spawn').map(([op, { label }]) => h('option', { value: op, selected: op === step.op }, label)))),
        (OPS[step.op]?.fields ?? []).map((field) => fieldEl(step, field, script)),
        i > 0 && h('button', { class: 'x', type: 'button', title: 'Monter', onclick: change(() => steps.splice(i - 1, 2, steps[i], steps[i - 1])) }, '↑'),
        h('button', { class: i > 0 ? '' : 'x', type: 'button', title: 'Supprimer cette étape', onclick: change(() => steps.splice(i, 1)) }, '✕'));
    }),
    h('div', { class: 'foot' }, h('button', { type: 'button', onclick: change(() => steps.push({ op: 'move', count: 1 })) }, '+ Étape')),
  ];
}

function scriptEl(macro, i) {
  const param = macro.params?.[0];
  const input = (label, key, attrs = {}) => h('label', {}, label, h('input', { value: macro[key] ?? '', oninput: (e) => { macro[key] = e.target.value; save(); }, ...attrs }));
  const pick = (label, key, options) => h('label', {}, label, h('select', { onchange: (e) => { e.target.value ? (macro[key] = e.target.value) : delete macro[key]; save(); } },
    options.map(([value, text]) => h('option', { value, selected: (macro[key] ?? '') === value }, text))));
  return h('fieldset', { class: 'script' }, h('legend', {}, macro.name || 'Script'),
    h('div', { class: 'meta' },
      input('Nom du bouton', 'name', { maxLength: 40 }),
      input('Phase (regroupe les boutons)', 'group', { maxLength: 30, placeholder: 'Mise en place, À mon tour…', list: 'phases' }),
      pick('S’applique', 'scope', [['', 'à tous les joueurs'], ['me', 'au joueur qui le lance']]),
      pick('Se lance', 'on', [['', 'à la demande'], ['turnStart', 'aussi au début de chaque tour']])),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: Boolean(param), onchange: (e) => {
      e.target.checked ? (macro.params = [{ id: 'n', name: 'Combien ?', min: 1, max: 20, default: 1 }]) : delete macro.params;
      renderScripts(); save();
    } }), 'Demander un nombre au joueur (à utiliser dans « combien » avec $n)'),
    param && h('div', { class: 'meta' },
      h('label', {}, 'Question posée', h('input', { value: param.name ?? '', maxLength: 30, oninput: (e) => { param.name = e.target.value; save(); } })),
      h('label', {}, 'Valeur proposée', h('input', { type: 'number', min: 1, max: 20, value: param.default ?? 1, oninput: (e) => { param.default = Number(e.target.value) || 1; save(); } }))),
    stepsEl((macro.steps ??= []), macro),
    h('div', { class: 'foot' }, h('button', { type: 'button', onclick: () => { game.macros.splice(i, 1); renderScripts(); save(); } }, 'Supprimer ce script')));
}

function renderScripts() {
  game.setup ??= [];
  game.macros ??= [];
  fill($('scriptsView'),
    h('datalist', { id: 'phases' }, ['Mise en place', 'À mon tour', 'Fin de manche'].map((value) => h('option', { value }))),
    h('fieldset', { class: 'script' }, h('legend', {}, 'Mise en place — au début de chaque partie'), stepsEl(game.setup, null)),
    game.macros.map(scriptEl),
    h('button', { class: 'primary', type: 'button', onclick: () => {
      game.macros.push({ id: `script-${Date.now().toString(36)}`, name: 'Nouveau script', group: 'À mon tour', steps: [{ op: 'move', count: 1 }] });
      renderScripts(); save();
    } }, '+ Script'));
}

for (const [tab, view, other, otherView] of [['tabCards', 'cardsView', 'tabScripts', 'scriptsView'], ['tabScripts', 'scriptsView', 'tabCards', 'cardsView']]) {
  $(tab).addEventListener('click', () => {
    $(tab).classList.add('on'); $(other).classList.remove('on');
    $(view).hidden = false; $(otherView).hidden = true;
    if (view === 'scriptsView') renderScripts();
  });
}
$('g-unboxing').addEventListener('change', (event) => { event.target.checked ? delete game.unboxing : (game.unboxing = false); save(); });

// ------------------------------------------------------------------ editing

for (const [id, apply] of Object.entries({
  'g-name': (v) => { game.name = v; },
  'g-description': (v) => { game.description = v; },
  'g-min': (v) => { game.players.min = Number(v); },
  'g-max': (v) => { game.players.max = Number(v); },
  'g-felt': (v) => { game.table = { ...game.table, color: v }; },
  'g-rules': (v) => { game.rules = v; },
})) $(id).addEventListener('input', (event) => { apply(event.target.value); save(); });

$('deck').addEventListener('change', (event) => { deckId = event.target.value; current = 0; renderCards(); renderCard(); });

$('cardForm').addEventListener('input', (event) => {
  const card = cards()[current];
  const { name, value } = event.target;
  if (!card || !name) return;
  if (name === 'count') value > 1 ? (card.count = Number(value)) : delete card.count;
  else if (name === 'size') Number(value) !== 1 && value ? (card.size = Number(value)) : delete card.size;
  else if (name === 'shape') value === 'card' ? delete card.shape : (card.shape = value);
  else if (value === '') delete card[name];
  else card[name] = value;
  fill($('cardPreview'), preview(card, true));
  renderCards();
  save();
});

$('addBtn').addEventListener('click', () => {
  cards().push({ name: 'Nouvelle carte', color: cards()[current]?.color ?? '#4a5562' });
  current = cards().length - 1;
  renderAll();
  $('cardForm').elements.name.select();
});
$('dupBtn').addEventListener('click', () => {
  const copy = structuredClone(cards()[current]);
  delete copy.id;
  cards().splice(++current, 0, copy);
  renderAll();
});
$('delBtn').addEventListener('click', () => {
  cards().splice(current, 1);
  current = Math.max(0, current - 1);
  renderAll();
});

// Illustrations are embedded in the file, downscaled so that it stays small.
$('imageBtn').addEventListener('click', () => $('imageFile').click());
$('imageFile').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    cards()[current].image = canvas.toDataURL('image/jpeg', 0.8);
    renderAll();
  } catch {
    toast("Cette image n'a pas pu être lue.");
  }
});
$('imageClear').addEventListener('click', () => { delete cards()[current].image; renderAll(); });

// ------------------------------------------------------------------ files

$('newBtn').addEventListener('click', () => confirm('Remplacer le brouillon actuel par un jeu vide ?') && open(blankGame()));
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (event) => {
  try {
    open(JSON.parse(await event.target.files[0].text()));
  } catch {
    toast("Ce fichier n'est pas un fichier de jeu lisible.");
  }
  event.target.value = '';
});
$('exportBtn').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' }));
  h('a', { href: url, download: `${game.id}.json` }).click();
  URL.revokeObjectURL(url);
});

// ------------------------------------------------------------------ start

try {
  open(JSON.parse(localStorage.getItem(DRAFT_KEY)));
} catch {
  // First visit: start from the bundled original game, a complete worked example.
  try {
    const template = await (await fetch(TEMPLATE)).json();
    open({ ...template, name: `${template.name} (ma version)` });
  } catch {
    open(blankGame());
  }
}
