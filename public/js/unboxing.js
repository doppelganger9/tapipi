// The unboxing scene, shown while the game's box is still sealed.
//
// Everybody at the table watches the same box: opening the lid or tearing a
// pack is an engine action, so the ceremony is shared. `fx` says what was just
// opened, which is what gets animated; everything else is drawn in its final
// state (so a reconnecting player sees no replay).

import { h } from './dom.js';
import { cardEl } from './cards.js';

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** A deck made mostly of pawns and tiles comes as a punchboard, not a pack. */
function describe(def, deckId) {
  const deck = def.decks[deckId];
  const protos = [...new Set(deck.list)];
  const pieces = protos.filter((key) => def.protos[key].shape);
  return { deck, protos, punchboard: pieces.length * 2 > protos.length, count: deck.list.length };
}

function packEl(def, deckId, { opened, tearing, act, canAct }) {
  const { deck, protos, punchboard, count } = describe(def, deckId);
  const open = () => act({ type: 'unbox', deck: deckId });
  const caption = h('span', { class: 'pack-name' }, h('b', {}, deck.name), ` · ${plural(count, punchboard ? 'pièce' : 'carte')}`);
  const classes = `${opened ? 'opened' : ''} ${tearing ? 'tearing' : ''}`;

  if (punchboard) {
    // A cardboard sheet: pieces sit in their holes until punched out.
    const shown = protos.slice(0, 15);
    const piece = (key, i) => { const el = cardEl(def, { p: key, up: true }); el.style.setProperty('--i', i); return el; };
    const sheet = h('span', { class: 'holes' }, shown.map((key, i) => h('span', { class: 'hole' }, !opened && piece(key, i))));
    const loose = opened && h('span', { class: 'loose' }, shown.map(piece));
    return h(opened ? 'div' : 'button', { class: `sheet ${classes}`, onclick: !opened && canAct && open, disabled: !opened && !canAct }, sheet, loose, caption);
  }

  // A foil pack: a wrapper that tears in two, and the cards fanning out of it.
  const back = { d: deckId, up: false };
  const fan = h('span', { class: 'fan' }, [0, 1, 2, 3, 4].slice(0, Math.min(5, count)).map((i) => { const el = cardEl(def, back); el.style.setProperty('--i', i - 2); return el; }));
  const foil = (side) => h('span', { class: `foil ${side}` }, h('i', {}, deck.back.label));
  const wrapper = h('span', { class: 'wrapper', style: `--accent:${deck.back.color}` }, (!opened || tearing) && [foil('left'), foil('right')], opened && fan);
  return h(opened ? 'div' : 'button', { class: `pack ${classes}`, onclick: !opened && canAct && open, disabled: !opened && !canAct }, wrapper, caption);
}

export function boxScene(S, act, fx) {
  const { def } = S;
  const { box } = S.view;
  const canAct = S.you >= 0;
  const seats = def.players.min === def.players.max ? `${def.players.max} joueurs` : `${def.players.min} à ${def.players.max} joueurs`;

  if (!box.open) {
    return h('div', { class: 'unbox' },
      h('button', { class: 'gamebox', disabled: !canAct, onclick: () => act({ type: 'unbox' }), 'aria-label': `Ouvrir la boîte de ${def.name}` },
        h('span', { class: 'ribbon' }, 'Neuf · scellé'),
        h('strong', {}, def.name),
        h('em', {}, [seats, def.duration].filter(Boolean).join(' · '))),
      h('p', { class: 'unbox-hint' }, canAct ? 'Cliquez sur la boîte pour l’ouvrir.' : 'La boîte n’est pas encore ouverte.'));
  }

  const left = Object.values(box.packs).filter((status) => status === 'sealed').length;
  return h('div', { class: `unbox ${fx?.lid ? 'lifting' : ''}` },
    h('p', { class: 'kicker' }, `Dans la boîte de ${def.name}`),
    h('div', { class: 'packs' }, Object.keys(def.decks).map((deckId) => packEl(def, deckId, {
      opened: box.packs[deckId] === 'open', tearing: fx?.deck === deckId, act, canAct,
    }))),
    h('p', { class: 'unbox-hint' }, canAct ? `Déchirez les emballages et détachez les pièces : encore ${left} à ouvrir.` : 'Vos amis déballent le jeu…'),
    canAct && h('button', { class: 'skip', onclick: () => act({ type: 'unbox', all: true }) }, 'Tout déballer d’un coup'));
}
