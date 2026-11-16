// First-time experience: a nickname so nobody faces an empty field, and a coach
// that teaches the table by watching the player actually do each gesture.

import { h, fill } from './dom.js';

const ANIMALS = ['Renard', 'Hibou', 'Blaireau', 'Hérisson', 'Lynx', 'Corbeau', 'Castor', 'Lézard', 'Sanglier', 'Héron', 'Pingouin', 'Crapaud'];
const TRAITS = ['malicieux', 'intrépide', 'rusé', 'flegmatique', 'audacieux', 'songeur', 'bluffeur', 'chanceux', 'taquin', 'stoïque'];

export function randomNickname() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  return `${pick(ANIMALS)} ${pick(TRAITS)}`;
}

/** The lessons that make sense for this game, derived from its `ui` hints. */
function lessons(S) {
  const { ui, zones } = S.def;
  const zone = (id) => zones.find((z) => z.id === id);
  const key = (id) => (zone(id).owner === 'player' ? `${id}@${S.you}` : id);
  const hand = (state) => state.view.zones[`${ui.hand}@${state.you}`]?.length ?? 0;
  return [
    ui.draw && ui.hand && {
      text: `Double-cliquez sur « ${zone(ui.draw).name} » pour piocher une carte.`,
      target: `[data-key="${key(ui.draw)}"]`,
      snapshot: hand,
      done: (state, before) => hand(state) > before,
    },
    ui.play && ui.hand && {
      text: `Glissez une carte de votre main vers « ${zone(ui.play).name} » — ou double-cliquez dessus.`,
      target: `[data-key="${key(ui.play)}"]`,
      snapshot: hand,
      done: (state, before) => hand(state) < before,
    },
    {
      text: 'Cliquez une fois sur une carte : une barre apparaît pour la retourner, l’incliner ou l’envoyer ailleurs.',
      target: null,
      snapshot: () => null,
      done: () => Boolean(document.querySelector('#table .card.selected')),
    },
    {
      text: 'Votre tour est fini ? Cliquez sur « Fin du tour ».',
      target: '#actions .primary',
      snapshot: (state) => state.view.turn,
      done: (state, before) => state.view.turn !== before,
    },
  ].filter(Boolean);
}

export function createCoach({ el, onFinish }) {
  let steps = null;
  let step = 0;
  let before = null;
  let last = null; // latest state seen

  function stop(finished) {
    steps = null;
    el.hidden = true;
    document.querySelector('.coach-target')?.classList.remove('coach-target');
    if (finished) onFinish();
  }

  function show() {
    for (const node of document.querySelectorAll('.coach-target')) node.classList.remove('coach-target');
    if (step >= steps.length) {
      fill(el, h('p', {}, h('b', {}, 'Vous savez jouer ! '), 'Le menu ⋯ de chaque zone permet aussi de mélanger, distribuer ou fouiller une pile.'),
        h('div', { class: 'coach-foot' }, h('button', { class: 'primary', onclick: () => stop(true) }, 'Terminer')));
      return;
    }
    const lesson = steps[step];
    if (lesson.target) document.querySelector(lesson.target)?.classList.add('coach-target');
    fill(el,
      h('p', {}, lesson.text),
      h('div', { class: 'coach-foot' },
        h('span', { class: 'dots' }, steps.map((_, i) => h('i', { class: i < step ? 'done' : i === step ? 'now' : '' }))),
        h('button', { onclick: () => advance() }, 'Passer'),
        h('button', { onclick: () => stop(true) }, 'Fermer')));
  }

  function advance() {
    step++;
    if (step < steps.length) before = steps[step].snapshot(last);
    show();
  }

  function check() {
    if (!steps || step >= steps.length || !last) return;
    if (steps[step].done(last, before)) advance();
    else show(); // the table was re-rendered: put the highlight back
  }

  // Selecting a card changes no server state, so also look after each click.
  addEventListener('pointerup', () => setTimeout(check, 0));

  return {
    start(state) {
      if (state.you < 0) return;
      last = state;
      steps = lessons(state);
      step = 0;
      before = steps[0].snapshot(state);
      el.hidden = false;
      show();
    },
    update(state) {
      last = state;
      check();
    },
    stop: () => stop(false),
  };
}
