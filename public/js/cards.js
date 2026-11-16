// Turns a card (or tile, or pawn) into DOM. Everything is drawn from the game
// file's data — the platform ships no artwork of its own.

import { h, fill } from './dom.js';
import { artGlyph, glyphEl } from './glyphs.js';

const COLOR = /^#[0-9a-fA-F]{3,8}$/;
const IMAGE = /^(https:\/\/|data:image\/(png|jpeg|webp|gif|svg\+xml);base64,)/;

function artEl(proto) {
  if (proto.image && IMAGE.test(proto.image)) return h('img', { class: 'art', src: proto.image, alt: '', draggable: false, referrerPolicy: 'no-referrer' });
  const art = proto.art ?? '';
  const glyph = artGlyph(art);
  return h('div', { class: `art ${!glyph && [...art].length > 2 ? 'long' : ''}` }, glyph ?? art);
}

function faceEl(proto, detailed) {
  const face = h('div', { class: 'face' });
  if (proto.color && COLOR.test(proto.color)) face.style.setProperty('--accent', proto.color);

  if (proto.rank && proto.suit) {
    face.classList.add('classic');
    const corner = () => h('div', { class: 'corner' }, h('span', {}, proto.rank), h('span', {}, proto.suit));
    face.append(corner(), h('div', { class: 'pip' }, proto.suit), h('div', { class: 'corner flip' }, ...corner().childNodes));
    return face;
  }
  if (proto.shape === 'round' || proto.shape === 'square') {
    face.classList.add('piece');
    face.append(artEl(proto));
    return face;
  }
  face.classList.add('custom');
  fill(face,
    h('div', { class: 'head' }, h('span', { class: 'name' }, proto.name), proto.cost && h('span', { class: 'cost' }, proto.cost)),
    artEl(proto),
    proto.type && h('div', { class: 'type' }, proto.type),
    detailed && proto.text && h('div', { class: 'text' }, proto.text),
    proto.stats && h('div', { class: 'stats' }, proto.stats),
  );
  return face;
}

/** What players did to the card over the games, drawn on top of its face. */
function marksEl(marks) {
  const layer = h('div', { class: `marks ${marks.torn ? 'torn' : ''}` });
  if (marks.scribble) layer.append(h('span', { class: 'scribble' }));
  if (marks.note) layer.append(h('span', { class: 'note' }, marks.note));
  if (marks.stickers) layer.append(h('span', { class: 'stickers' }, marks.stickers.map((s) => h('i', {}, glyphEl(s) ?? s))));
  return layer;
}

/**
 * `card` is a view card: `{ id, up, p? (prototype key, when visible), d? (deck) }`.
 * `detailed` renders the rules text too (used for the large preview).
 */
export function cardEl(def, card, { detailed = false } = {}) {
  const proto = card.p ? def.protos[card.p] : null;
  const el = h('div', { class: 'card' });
  if (card.id) el.dataset.id = card.id;
  if (proto) {
    if (proto.shape) el.classList.add(proto.shape);
    if (proto.size) el.style.setProperty('--s', proto.size);
    if (proto.ratio) el.style.setProperty('--r', proto.ratio);
    if (proto.fixed) el.classList.add('fixed');
    if (proto.marks?.torn) el.classList.add('torn');
    el.title = proto.name;
    el.append(faceEl(proto, detailed));
    if (proto.marks) el.append(marksEl(proto.marks));
  } else {
    const back = def.decks[card.d]?.back ?? { color: '#1d3557', label: '✦' };
    const backEl = h('div', { class: 'back' }, h('span', {}, back.label));
    if (COLOR.test(back.color)) backEl.style.setProperty('--accent', back.color);
    el.append(backEl);
  }
  if (card.tok) el.append(h('span', { class: 'tokens' }, String(card.tok)));
  return el;
}
