// The table: renders a player's view and turns gestures into engine actions.
//
// Rendering is a plain rebuild on every state update; cards are then animated
// from where they were to where they are (FLIP), which is what makes a card
// visibly travel from the draw pile to a hand.

import { h, fill, SEAT_COLORS } from './dom.js';
import { cardEl } from './cards.js';
import { glyphEl } from './glyphs.js';
import { boxScene } from './unboxing.js';
import { parseKey, zoneKey } from '/shared/zones.js';

const DOUBLE_CLICK_MS = 350;
const DRAG_THRESHOLD = 6;

const STICKERS = ['etoile', 'coeur', 'crane', 'flamme', 'couronne', 'pansement', 'croix', 'coche'];

export function createTable({ root, bar, menu, send, onHover, onDeal, onNote }) {
  let S = null; // { def, view, players, you }
  let index = new Map(); // card id -> { card, key }
  let piles = new Map(); // id of a pile's top card -> ids of the whole pile, bottom first
  let drag = null;
  let lasso = null;
  let lastClick = { id: null, at: 0 };
  const selection = new Set();
  const expanded = new Set(); // stacks the viewer chose to spread out

  const act = (action) => send({ t: 'act', a: action });
  const playerName = (seat) => S.players.find((p) => p.seat === seat)?.name ?? `Joueur ${seat + 1}`;
  const handKey = () => (S.you >= 0 && S.def.ui.hand ? `${S.def.ui.hand}@${S.you}` : null);
  const sealed = () => Boolean(S?.view.box && !S.view.box.done);
  const isFixed = (card) => Boolean(S.def.protos[card.p]?.fixed);

  function zoneTitle(key) {
    const { zone, seat } = parseKey(S.def, key);
    return seat === null || seat === S.you ? zone.name : `${zone.name} · ${playerName(seat)}`;
  }

  function allZoneKeys() {
    return S.def.zones.flatMap((zone) => (zone.owner === 'player' ? S.players.map((p) => zoneKey(zone, p.seat)) : [zone.id]));
  }

  // ---------------------------------------------------------------- render

  function zoneEl(zone, seat) {
    const key = zoneKey(zone, seat);
    const cards = S.view.zones[key] ?? [];
    for (const card of cards) index.set(card.id, { card, key });

    const stacked = zone.layout === 'stack' && !expanded.has(key);
    const layout = stacked ? 'stack' : zone.layout === 'free' ? 'free' : 'row';
    const mine = zone.visibility === 'owner' && seat === S.you;

    const body = h('div', { class: `zcards ${layout}` });
    if (zone.image) body.style.backgroundImage = `url("${zone.image}")`;
    if (zone.color) body.style.backgroundColor = zone.color;
    if (zone.layout === 'stack' && !stacked) body.classList.add('wrap');
    if (stacked) body.style.setProperty('--depth', Math.min(cards.length, 30));

    // On a free zone, cards lying exactly on top of each other are a pile.
    const groups = new Map();
    if (layout === 'free') {
      // Make room for the tallest component (a board can be many cards high).
      const tallest = Math.max(0, ...cards.map((c) => { const p = S.def.protos[c.p]; return p ? (p.size ?? 1) * (p.ratio ?? (p.shape ? 1 : 1.4)) : 1.4; }));
      if (tallest > 2.9) body.style.minHeight = `calc(var(--cw) * ${(tallest + 0.4).toFixed(2)})`;
      for (const card of cards) {
        if (isFixed(card)) continue;
        const spot = `${card.x.toFixed(4)}|${card.y.toFixed(4)}`;
        if (!groups.has(spot)) groups.set(spot, []);
        groups.get(spot).push(card.id);
        card.pile = groups.get(spot);
      }
    }

    for (const card of stacked ? cards.slice(-1) : cards) {
      const el = cardEl(S.def, card);
      if (card.p && !card.up && !mine) el.classList.add('peeked'); // only I can see this one
      if (mine && card.up) el.classList.add('revealed'); // everyone can see this one
      const angle = (card.rot ?? 0) + (card.tap ? 90 : 0);
      if (angle) el.style.rotate = `${angle}deg`;
      if (layout === 'free') {
        el.style.setProperty('--x', card.x);
        el.style.setProperty('--y', card.y);
        const pile = card.pile;
        if (pile?.length > 1) {
          const depth = Math.min(pile.indexOf(card.id), 12) * 1.5; // thickness
          el.style.margin = `${-depth}px 0 0 ${depth}px`;
          if (pile.at(-1) === card.id) {
            piles.set(card.id, pile);
            el.append(h('span', { class: 'pilecount', title: 'Paquet : glissez la pastille pour le déplacer, cliquez pour le sélectionner' }, String(pile.length)));
          }
        }
        body.append(el);
      } else if (layout === 'row') {
        const slot = h('div', { class: 'slot' }, el);
        const size = S.def.protos[card.p]?.size;
        if (size) slot.style.setProperty('--s', size); // small pieces take a small place in the row
        body.append(slot);
      } else body.append(el);
    }
    if (!cards.length && layout !== 'free') body.append(h('div', { class: 'empty' }));

    return h('div', { class: `zone z-${layout}`, 'data-key': key },
      h('div', { class: 'zhead' },
        h('span', { class: 'zname' }, zone.name),
        h('span', { class: 'zcount' }, String(cards.length)),
        // Somebody else's hand: one may always try a glance…
        S.you >= 0 && S.def.cheating && zone.visibility === 'owner' && seat !== S.you && cards.some((c) => !c.up && !c.p)
          && h('button', { class: 'spy', title: 'Lorgner ce jeu : une carte de plus à chaque essai… ou vous vous faites prendre', 'aria-label': `Lorgner : ${zone.name}`, onclick: () => act({ type: 'spy', zone: key }) }, glyphEl('oeil'), 'Lorgner'),
        S.you >= 0 && h('button', { class: 'zmenu', title: 'Actions sur cette zone', 'aria-label': `Actions : ${zone.name}` }, '⋯')),
      body);
  }

  function render(fx) {
    if (!S) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (sealed()) {
      index = new Map();
      selection.clear();
      bar.hidden = true;
      return fill(root, boxScene(S, act, reduced ? null : fx));
    }

    const before = new Map();
    for (const el of root.querySelectorAll('.card[data-id]')) before.set(el.dataset.id, el.getBoundingClientRect());
    index = new Map();
    piles = new Map();

    const tableZones = S.def.zones.filter((z) => z.owner === 'table');
    const playerZones = S.def.zones.filter((z) => z.owner === 'player');
    // Opponents are laid out in turn order, starting from the player after me.
    const others = S.players.filter((p) => p.seat !== S.you).sort((a, b) => ((a.seat - S.you + 99) % 99) - ((b.seat - S.you + 99) % 99));

    fill(root,
      h('div', { class: 'opponents' }, others.map((p) => h('div', { class: `area ${p.connected ? '' : 'away'}`, 'data-seat': p.seat, style: `--seat:${SEAT_COLORS[p.seat]}` },
        h('div', { class: 'area-name' }, p.name, S.view.turn === p.seat && ' ●', !p.connected && ' (absent·e)'),
        h('div', { class: 'zones' }, playerZones.map((z) => zoneEl(z, p.seat)))))),
      h('div', { class: 'center zones' }, tableZones.map((z) => zoneEl(z, null))),
      S.you >= 0
        ? h('div', { class: 'area mine', 'data-seat': S.you, style: `--seat:${SEAT_COLORS[S.you]}` }, h('div', { class: 'zones' }, playerZones.map((z) => zoneEl(z, S.you))))
        : h('div', { class: 'spectator' }, 'Vous regardez la partie en spectateur : toutes les places sont prises.'),
      (S.view.stains ?? []).map((s) => h('div', { class: 'stain', style: `left:${10 + s.x * 80}%;top:${15 + s.y * 60}%;rotate:${s.r}deg` })),
    );

    for (const id of [...selection]) if (!index.has(id)) selection.delete(id);
    syncSelection();
    if (reduced) return;

    if (before.size) {
      for (const el of root.querySelectorAll('.card[data-id]')) {
        const old = before.get(el.dataset.id);
        if (!old) {
          el.animate([{ opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1 }], { duration: 180 });
          continue;
        }
        const now = el.getBoundingClientRect();
        const dx = old.left - now.left;
        const dy = old.top - now.top;
        if (Math.abs(dx) + Math.abs(dy) > 2) {
          el.animate([{ translate: `${dx}px ${dy}px`, zIndex: 50 }, { translate: '0 0', zIndex: 50 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1)' });
        }
      }
    }
    if (fx?.kind === 'shuffle') animateShuffle(fx);
  }

  /** A riffle for a stacked pile, a scramble for cards one can see. */
  function animateShuffle(fx) {
    let cards;
    if (fx.cards) cards = fx.cards.map((id) => root.querySelector(`.card[data-id="${id}"]`)).filter(Boolean);
    else {
      const body = [...root.querySelectorAll('.zone')].find((zone) => zone.dataset.key === fx.zone)?.querySelector('.zcards');
      if (!body) return;
      cards = [...body.querySelectorAll('.card:not(.fixed)')];
      if (body.classList.contains('stack') && cards[0]) {
        for (const side of [-1, 1]) {
          const half = cards[0].cloneNode(true);
          half.classList.add('phantom');
          half.removeAttribute('data-id');
          body.append(half);
          const out = { translate: `${side * 48}% -5%`, rotate: `${side * 9}deg` };
          half.animate([{ translate: '0 0' }, out, { translate: '0 0' }, out, { translate: '0 0' }, out, { translate: '0 0' }], { duration: 850, easing: 'ease-in-out' })
            .finished.then(() => half.remove());
        }
        return;
      }
    }
    cards.forEach((el, i) => {
      const side = i % 2 ? 1 : -1;
      el.animate([
        { translate: '0 0' },
        { translate: `${side * (28 + (i % 5) * 7)}% ${-10 - (i % 3) * 7}%`, rotate: `${side * 11}deg` },
        { translate: `${-side * 22}% 5%`, rotate: `${-side * 7}deg` },
        { translate: '0 0' },
      ], { duration: 650, delay: Math.min(i * 14, 220), easing: 'ease-in-out' });
    });
  }

  // ---------------------------------------------------------------- selection

  function syncSelection() {
    for (const el of root.querySelectorAll('.card[data-id]')) {
      el.classList.toggle('selected', selection.has(el.dataset.id));
      el.classList.toggle('dragging', Boolean(drag?.ids?.includes(el.dataset.id)));
    }
    const ids = [...selection];
    bar.hidden = !ids.length;
    if (!ids.length) return;
    const many = ids.length > 1;
    const first = index.get(ids[0]);
    const onFree = first && parseKey(S.def, first.key).zone.layout === 'free';
    const button = (label, title, action) => h('button', { title, onclick: () => act({ ...action, cards: [...selection] }) }, label);
    fill(bar,
      h('span', { class: 'count' }, `${ids.length} sélectionnée${many ? 's' : ''}`),
      many && onFree && button('Empiler', 'Rassembler en un paquet', { type: 'move', to: first.key, x: first.card.x, y: first.card.y, stack: true }),
      many && button('Mélanger', 'Mélanger ce paquet', { type: 'shuffleCards' }),
      button('Retourner', 'Face visible / face cachée', { type: 'flip' }),
      button('Incliner', 'Pivoter de 90°', { type: 'tap' }),
      button('Regarder', 'Regarder en secret (les autres en sont informés)', { type: 'peek' }),
      button('+ jeton', 'Ajouter un jeton', { type: 'token', delta: 1 }),
      button('− jeton', 'Retirer un jeton', { type: 'token', delta: -1 }),
      h('select', { 'aria-label': 'Envoyer vers', onchange: (e) => { act({ type: 'move', cards: [...selection], to: e.target.value, stack: true }); clearSelection(); } },
        h('option', { value: '', disabled: true, selected: true }, 'Envoyer vers…'),
        allZoneKeys().map((key) => h('option', { value: key }, zoneTitle(key)))),
      // Lasting changes: they stay on the card from one game to the next.
      h('select', { 'aria-label': 'Marquer la carte', title: 'Modifier la carte pour de bon (face visible uniquement)', onchange: (e) => {
        const [kind, value] = e.target.value.split(':');
        const cards = [...selection];
        e.target.selectedIndex = 0;
        if (kind === 'note') onNote((note) => act({ type: 'mark', cards, note }));
        else act({ type: 'mark', cards, [kind]: value ?? true });
      } },
        h('option', { value: '', disabled: true, selected: true }, 'Marquer…'),
        h('option', { value: 'note' }, 'Écrire dessus…'),
        h('option', { value: 'scribble' }, 'Griffonner / effacer le gribouillis'),
        h('option', { value: 'torn' }, 'Déchirer'),
        STICKERS.map((s) => h('option', { value: `sticker:${s}` }, `Coller : ${s}`)),
        h('option', { value: 'erase' }, 'Remettre à neuf')),
      h('button', { class: 'ghost-btn', title: 'Désélectionner', onclick: clearSelection }, '✕'),
    );
    const last = index.get(ids.at(-1))?.card;
    if (last?.p) onHover(last);
  }

  function clearSelection() {
    selection.clear();
    syncSelection();
  }

  // ---------------------------------------------------------------- zone menu

  function openMenu(button, key) {
    const { zone } = parseKey(S.def, key);
    const ids = (S.view.zones[key] ?? []).filter((c) => !isFixed(c)).map((c) => c.id);
    const hand = handKey();
    const show = (items) => {
      fill(menu, items.filter(Boolean).map(([label, run, keepOpen]) => h('button', { onclick: () => { if (!keepOpen) menu.hidden = true; run(); } }, label)));
      menu.hidden = false;
      const rect = button.getBoundingClientRect();
      menu.style.left = `${Math.min(rect.left, innerWidth - menu.offsetWidth - 8)}px`;
      menu.style.top = `${Math.min(rect.bottom + 4, innerHeight - menu.offsetHeight - 8)}px`;
    };
    show([
      hand && key !== hand && ids.length && ['Piocher 1 carte', () => act({ type: 'take', from: key, to: hand, count: 1 })],
      S.def.ui.hand && ids.length && ['Distribuer ou piocher…', () => onDeal(key, zoneTitle(key), ids.length)],
      ids.length > 1 && ['Mélanger', () => act({ type: 'shuffle', zone: key })],
      ids.length && ['Tout sélectionner', () => { for (const id of ids) selection.add(id); if (zone.layout === 'stack') expanded.add(key); render(); }],
      zone.layout === 'stack' && [expanded.has(key) ? 'Empiler' : 'Étaler pour fouiller', () => { expanded.has(key) ? expanded.delete(key) : expanded.add(key); render(); }],
      ids.length && ['Regarder tout en secret', () => act({ type: 'peek', cards: ids })],
      ids.length && ['Tout mettre face visible', () => act({ type: 'flip', cards: ids, faceUp: true })],
      ids.length && ['Tout mettre face cachée', () => act({ type: 'flip', cards: ids, faceUp: false })],
      zone.layout === 'free' && ['Balayer d’un revers de main', () => act({ type: 'sweep', zone: key })],
      ids.length && ['Tout déplacer vers… ›', () => show(allZoneKeys().filter((k) => k !== key).map((k) => [zoneTitle(k), () => act({ type: 'move', cards: ids, to: k, stack: true })])), true],
    ]);
  }

  // ---------------------------------------------------------------- gestures

  function doubleClick(id) {
    const entry = index.get(id);
    if (!entry) return;
    const { zone } = parseKey(S.def, entry.key);
    const hand = handKey();
    selection.clear();
    if (zone.layout === 'stack' && !expanded.has(entry.key) && hand && entry.key !== hand) {
      act({ type: 'take', from: entry.key, to: hand, count: 1 }); // draw
    } else if (entry.key === hand && S.def.ui.play) {
      const play = S.def.zones.find((z) => z.id === S.def.ui.play);
      act({ type: 'move', cards: [id], to: zoneKey(play, S.you) }); // play
    } else act({ type: 'tap', cards: [id] });
    syncSelection();
  }

  function click(d) {
    if (d.pile) { // the pile's badge: select the whole pile
      if (!d.additive) selection.clear();
      for (const id of d.pile) selection.add(id);
      return syncSelection();
    }
    const now = performance.now();
    if (lastClick.id === d.id && now - lastClick.at < DOUBLE_CLICK_MS) {
      lastClick = { id: null, at: 0 };
      return doubleClick(d.id);
    }
    lastClick = { id: d.id, at: now };
    if (d.additive) selection.has(d.id) ? selection.delete(d.id) : selection.add(d.id);
    else {
      const wasOnly = selection.size === 1 && selection.has(d.id);
      selection.clear();
      if (!wasOnly) selection.add(d.id);
    }
    syncSelection();
  }

  function beginDrag(d) {
    d.ids = d.pile ?? (selection.has(d.id) ? [...selection] : [d.id]);
    d.ghost = d.source.cloneNode(true);
    d.ghost.classList.add('ghost');
    d.ghost.classList.remove('selected');
    d.ghost.querySelector('.pilecount')?.remove();
    Object.assign(d.ghost.style, { width: `${d.source.offsetWidth}px`, height: `${d.source.offsetHeight}px`, fontSize: getComputedStyle(d.source).fontSize, margin: '0' });
    if (d.ids.length > 1) d.ghost.append(h('span', { class: 'badge' }, String(d.ids.length)));
    document.body.append(d.ghost);
    syncSelection();
  }

  function drop(d, event) {
    d.ghost.remove();
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const target = under?.closest('.zone') ?? null;
    root.querySelector('.zone.over')?.classList.remove('over');
    syncSelection();
    if (!target) return;
    const action = { type: 'move', cards: d.ids, to: target.dataset.key };
    const body = target.querySelector('.zcards');
    const rect = body.getBoundingClientRect();
    if (body.classList.contains('free')) {
      // Dropped onto another card: join its pile. Otherwise land where released.
      const onto = index.get(under.closest('.card')?.dataset.id);
      if (onto && onto.key === action.to && !d.ids.includes(onto.card.id)) Object.assign(action, { x: onto.card.x, y: onto.card.y, stack: true });
      else {
        action.x = (event.clientX - d.offsetX - rect.left) / Math.max(1, rect.width - d.width);
        action.y = (event.clientY - d.offsetY - rect.top) / Math.max(1, rect.height - d.height);
        action.stack = Boolean(d.pile); // a pile moved by its badge stays a pile
      }
    } else if (body.classList.contains('row')) {
      // Insert where the card was dropped, so a hand can be sorted by dragging.
      action.index = [...body.querySelectorAll('.card')].filter((el) => {
        const r = el.getBoundingClientRect();
        return !d.ids.includes(el.dataset.id) && r.left + r.width / 2 < event.clientX;
      }).length;
    }
    act(action);
    selection.clear();
  }

  /** Rubber band: every card the rectangle touches gets selected. */
  function finishLasso(l) {
    const box = l.el.getBoundingClientRect();
    l.el.remove();
    if (!l.additive) selection.clear();
    for (const el of root.querySelectorAll('.card[data-id]:not(.fixed)')) {
      const r = el.getBoundingClientRect();
      if (r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top) selection.add(el.dataset.id);
    }
    syncSelection();
  }

  root.addEventListener('pointerdown', (event) => {
    if (event.button || !S || sealed()) return;
    const menuButton = event.target.closest('.zmenu');
    if (menuButton) return openMenu(menuButton, menuButton.closest('.zone').dataset.key);
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    const el = event.target.closest('.card[data-id]');
    if (!el) {
      if (S.you >= 0 && event.target.closest('.zcards') && event.pointerType !== 'touch') lasso = { x: event.clientX, y: event.clientY, el: null, additive };
      else clearSelection();
      return;
    }
    if (S.you < 0) return;
    event.preventDefault();
    const rect = el.getBoundingClientRect();
    drag = {
      id: el.dataset.id, source: el, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: el.offsetWidth, height: el.offsetHeight,
      pile: event.target.closest('.pilecount') ? piles.get(el.dataset.id) : null,
      additive, ghost: null, ids: null,
    };
  });

  addEventListener('pointermove', (event) => {
    if (lasso) {
      if (!lasso.el) {
        if (Math.hypot(event.clientX - lasso.x, event.clientY - lasso.y) < DRAG_THRESHOLD) return;
        lasso.el = h('div', { class: 'lasso' });
        document.body.append(lasso.el);
      }
      Object.assign(lasso.el.style, {
        left: `${Math.min(lasso.x, event.clientX)}px`, top: `${Math.min(lasso.y, event.clientY)}px`,
        width: `${Math.abs(event.clientX - lasso.x)}px`, height: `${Math.abs(event.clientY - lasso.y)}px`,
      });
      return;
    }
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      beginDrag(drag);
    }
    drag.ghost.style.left = `${event.clientX - drag.offsetX}px`;
    drag.ghost.style.top = `${event.clientY - drag.offsetY}px`;
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest('.zone') ?? null;
    for (const zone of root.querySelectorAll('.zone.over')) if (zone !== over) zone.classList.remove('over');
    over?.classList.add('over');
  });

  addEventListener('pointerup', (event) => {
    if (lasso) {
      const l = lasso;
      lasso = null;
      return l.el ? finishLasso(l) : clearSelection();
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.ghost) drop(d, event);
    else click(d);
  });

  addEventListener('pointercancel', () => {
    drag?.ghost?.remove();
    lasso?.el?.remove();
    drag = null;
    lasso = null;
    if (S) syncSelection();
  });

  addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !menu.contains(event.target) && !event.target.closest('.zmenu')) menu.hidden = true;
  });

  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selection.size) clearSelection();
  });

  root.addEventListener('pointerover', (event) => {
    const id = event.target.closest('.card')?.dataset.id;
    const card = id && index.get(id)?.card;
    if (card?.p) onHover(card);
  });

  return {
    /** `fx`: the effect (shuffle, unboxing) that came with this state, if any. */
    update(state, fx) {
      S = state;
      render(fx);
    },
  };
}
