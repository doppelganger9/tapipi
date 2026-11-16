// Application shell: lobby, session, sidebar, and the glue between the network
// and the table.

import { $, h, fill, SEAT_COLORS } from './dom.js';
import { cardEl } from './cards.js';
import { glyphEl, GLYPHS } from './glyphs.js';
import { createConnection } from './net.js';
import { createTable } from './table.js';
import { createCoach, randomNickname } from './onboarding.js';

const S = { def: null, view: null, players: [], you: -1, host: -1 };
let session = JSON.parse(sessionStorage.getItem('tapis:session') ?? 'null'); // { room, token }
let iOpenedThisTable = false;
let welcomePending = false;
let coachWanted = false; // start the tutorial as soon as there is a table to learn on
let queuedFx = null; // an effect that must play on the state that follows it

const store = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};

// ------------------------------------------------------------------ network

const connection = createConnection({
  onStatus: (online) => { $('status').hidden = online; },
  onOpen: () => { if (session) connection.send({ t: 'join', room: session.room, token: session.token, name: playerName() }); },
  onMessage: receive,
});

const table = createTable({
  root: $('table'), bar: $('bar'), menu: $('menu'),
  send: (message) => connection.send(message),
  onHover: (card) => fill($('preview'), cardEl(S.def, { p: card.p, up: true }, { detailed: true })),
  onDeal: openDeal,
  onNote: (done) => {
    $('noteForm').reset();
    $('noteDlg').onclose = () => { if ($('noteDlg').returnValue === 'ok') done($('noteForm').elements.note.value); };
    $('noteDlg').showModal();
  },
});

const coach = createCoach({ el: $('coach'), onFinish: () => store.set('tapis:coached', '1') });

const act = (action) => connection.send({ t: 'act', a: action });

function receive(message) {
  switch (message.t) {
    case 'welcome':
      session = { room: message.room, token: message.token };
      sessionStorage.setItem('tapis:session', JSON.stringify(session));
      history.replaceState(null, '', `#${message.room}`);
      $('lobby').hidden = true;
      $('game').hidden = false;
      break;
    case 'def': {
      S.def = message.def;
      $('gameName').textContent = S.def.name;
      $('rulesTitle').textContent = S.def.name;
      $('rulesText').textContent = S.def.rules || 'Ce jeu ne fournit pas de règles : à vous de jouer.';
      fill($('preview'), h('p', { class: 'hint' }, 'Survolez une carte pour la lire en grand.'));
      applyFelt();
      coach.stop();
      // Greet once per table and per game, not on every reconnection.
      const greeted = `${session.room}:${S.def.id}`;
      welcomePending = sessionStorage.getItem('tapis:greeted') !== greeted;
      sessionStorage.setItem('tapis:greeted', greeted);
      break;
    }
    case 'state':
      Object.assign(S, { view: message.view, players: message.players, you: message.you, host: message.host });
      applyLegacy(message.view.legacy);
      document.body.classList.toggle('is-host', S.you >= 0 && S.you === S.host);
      table.update(S, queuedFx);
      queuedFx = null;
      renderSidebar();
      renderGuests();
      if (coachWanted && !(S.view.box && !S.view.box.done) && !$('welcomeDlg').open) {
        coachWanted = false;
        coach.start(S);
      } else coach.update(S);
      if (welcomePending) {
        welcomePending = false;
        openWelcome(true);
      }
      break;
    case 'log':
      if (message.replace) fill($('log'));
      for (const entry of message.entries) appendLog(entry);
      // Shuffles and unboxing animate the new table, which arrives right after.
      if (message.fx?.kind === 'shuffle' || message.fx?.kind === 'unbox') queuedFx = message.fx;
      else if (message.fx) playEffect(message.fx);
      break;
    case 'saved': {
      // The game as it lives on this table, as a file to reopen another day.
      const url = URL.createObjectURL(new Blob([JSON.stringify(message.def, null, 1)], { type: 'application/json' }));
      h('a', { href: url, download: `${message.def.id}-${new Date().toISOString().slice(0, 10)}.json` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
    case 'error':
      toast(message.text);
      if (message.lobby) leave();
      break;
  }
}

/** Cards written or altered during play are part of the game from then on. */
function applyLegacy(legacy) {
  if (!legacy || !S.def) return;
  for (const [key, proto] of Object.entries(legacy.added)) {
    if (!S.def.protos[key]) S.def.decks[proto.deck]?.list.push(key);
    S.def.protos[key] = proto;
  }
  for (const [key, proto] of Object.entries(S.def.protos)) {
    if (legacy.marks[key]) proto.marks = legacy.marks[key];
    else delete proto.marks;
  }
}

function leave() {
  session = null;
  sessionStorage.removeItem('tapis:session');
  history.replaceState(null, '', location.pathname);
  if (!$('game').hidden) location.reload();
  else showLobby(null);
}

function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}

// ------------------------------------------------------------------ lobby

function playerName() {
  const name = $('name').value.trim() || randomNickname();
  store.set('tapis:name', name);
  return name;
}

/** Lists the games one can put on a table: bundled ones, a draft from the editor, or a file. */
async function gamePicker(container, onPick) {
  const games = await (await fetch('/api/games')).json();
  const pickFile = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (event) => {
    try {
      onPick({ def: JSON.parse(await event.target.files[0].text()) });
    } catch {
      toast("Ce fichier n'est pas un JSON valide.");
    }
    event.target.value = '';
  } });
  let draft = null;
  try { draft = JSON.parse(store.get('tapis:draft')); } catch { /* no draft */ }
  const seats = (p) => (p.min === p.max ? `${p.max} joueurs` : `${p.min}–${p.max} joueurs`);

  fill(container,
    games.map((game, i) => h('button', { class: `game ${i === 0 ? 'featured' : ''}`, onclick: () => onPick({ game: game.id }) },
      h('strong', {}, game.name),
      h('span', { class: 'meta' }, [seats(game.players), game.duration].filter(Boolean).join(' · ')),
      h('span', {}, game.description))),
    draft?.name && h('button', { class: 'game draft', onclick: () => onPick({ def: draft }) },
      h('strong', {}, draft.name), h('span', { class: 'meta' }, 'votre brouillon'), h('span', {}, "Le jeu en cours de création dans l'éditeur.")),
    h('div', { class: 'own' },
      h('button', { onclick: () => pickFile.click() }, 'Charger un fichier de jeu (.json)'), pickFile,
      h('a', { class: 'button', href: '/editor.html' }, 'Créer mon jeu dans l’éditeur')),
  );
}

/** With an invitation, the lobby is one question and one button. */
function showLobby(invitation) {
  $('invite').hidden = !invitation;
  $('sitBtn').hidden = !invitation;
  $('create').hidden = Boolean(invitation);
  $('codeBox').hidden = Boolean(invitation);
  if (!invitation) return;
  const names = invitation.players;
  $('inviteTitle').textContent = !names.length ? 'Une table vous attend'
    : names.length === 1 ? `${names[0]} vous attend à sa table`
      : `${names.slice(0, -1).join(', ')} et ${names.at(-1)} vous attendent`;
  $('inviteGame').textContent = `On joue à « ${invitation.game} ».${invitation.free ? '' : ' La table est complète : vous pourrez regarder.'}`;
  $('name').select();
}

function join(code) {
  connection.send({ t: 'join', room: code, name: playerName() });
}

$('name').value = store.get('tapis:name') ?? randomNickname();
$('reroll').prepend(glyphEl('de'));
$('reroll').addEventListener('click', () => { $('name').value = randomNickname(); });
$('name').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !$('sitBtn').hidden) $('sitBtn').click(); });
$('sitBtn').addEventListener('click', () => join(location.hash.slice(1)));
$('joinForm').addEventListener('submit', (event) => { event.preventDefault(); join($('code').value); });

gamePicker($('picker'), (choice) => {
  iOpenedThisTable = true;
  connection.send({ t: 'create', name: playerName(), ...choice });
});

const invitedTo = location.hash.slice(1).toUpperCase();
if (session && invitedTo !== session.room) session = null; // a link to another table wins
if (invitedTo && !session) {
  fetch(`/api/room/${encodeURIComponent(invitedTo)}`).then(async (response) => {
    if (response.ok) return showLobby(await response.json());
    history.replaceState(null, '', location.pathname);
    toast("Cette table n'existe plus. Ouvrez-en une nouvelle !");
  });
}

// ------------------------------------------------------------------ welcome

function renderGuests() {
  const names = S.players.filter((p) => p.connected).map((p) => (p.seat === S.you ? `${p.name} (vous)` : p.name));
  const free = S.def.players.max - S.players.length;
  fill($('wWho'), h('b', {}, 'À table : '), names.join(', '), free > 0 && ` · ${free} place${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}`);
}

function openWelcome(first) {
  const host = S.players.find((p) => p.seat === S.host);
  const mine = iOpenedThisTable || S.you === S.host;
  $('wKicker').textContent = !first ? 'Inviter des joueurs' : mine ? 'Votre table est prête' : `Bienvenue à la table de ${host?.name ?? 'vos amis'}`;
  $('wTitle').textContent = S.def.name;
  $('wInviteText').textContent = mine ? 'Envoyez ce lien à vos amis : ils arrivent directement à votre table, sans rien installer.' : 'Il manque quelqu’un ? Ce lien mène droit à cette table.';
  $('wLink').value = location.href;
  $('wShare').hidden = !navigator.share;
  $('wHow').hidden = !S.def.quickstart.length;
  fill($('wSteps'), S.def.quickstart.map((line) => h('li', {}, line)));
  $('wGo').textContent = first ? "C'est parti" : 'Retour à la table';
  if (!$('welcomeDlg').open) $('welcomeDlg').showModal();
  (mine ? $('wCopy') : $('wGo')).focus();
}

$('wCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    $('wCopy').textContent = 'Lien copié ✓';
  } catch {
    $('wLink').select();
  }
  setTimeout(() => { $('wCopy').textContent = 'Copier le lien'; }, 2500);
});
$('wShare').addEventListener('click', () => navigator.share({ title: 'Tapipi', text: `Viens jouer à ${S.def.name} !`, url: location.href }).catch(() => {}));
$('wRules').addEventListener('click', () => $('rulesDlg').showModal());
$('wGo').addEventListener('click', () => $('welcomeDlg').close());
function startCoach() {
  if (S.view.box && !S.view.box.done) coachWanted = true; // nothing to learn on until the box is open
  else coach.start(S);
}
$('welcomeDlg').addEventListener('close', () => { if (!store.get('tapis:coached')) startCoach(); });

// ------------------------------------------------------------------ top bar

$('share').addEventListener('click', () => openWelcome(false));
$('helpBtn').addEventListener('click', startCoach);
$('rulesBtn').addEventListener('click', () => $('rulesDlg').showModal());
$('restartBtn').addEventListener('click', () => confirm('Ramasser toutes les cartes et recommencer ?') && connection.send({ t: 'restart' }));
$('changeBtn').addEventListener('click', () => {
  gamePicker($('picker2'), (choice) => { $('changeDlg').close(); connection.send({ t: 'load', ...choice }); });
  $('changeDlg').showModal();
});
$('quitBtn').addEventListener('click', () => { sessionStorage.removeItem('tapis:session'); location.href = location.pathname; });

/** The felt colour: the player's own choice wins over the game's suggestion. */
function applyFelt() {
  const light = (hex) => { // a game may suggest a colour, as long as black ink stays readable on it
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex ?? '');
    return m && (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) > 150;
  };
  const stock = Object.hasOwn(PAPERS, store.get('tapis:felt')) ? store.get('tapis:felt') : '';
  $('felt').value = stock;
  const suggested = S.def?.table?.color;
  $('table').style.setProperty('--felt', stock ? PAPERS[stock] : light(suggested) ? suggested : PAPERS.papier);
  const image = S.def?.table?.image;
  $('table').style.backgroundImage = image ? `url("${image}")` : '';
  $('table').style.backgroundSize = image ? 'cover' : '';
}
/** The table is a sheet of paper: one picks its stock, not a felt colour. */
const PAPERS = { papier: '#f1ecdf', kraft: '#d9b98a', journal: '#e3dcc0', buvard: '#f4c9c2', billard: '#bfdcc0', ciel: '#c4dceb', carton: '#cfcbc2', poussin: '#f7ee8a' };
fill($('felt'), h('option', { value: '' }, 'du jeu'), Object.keys(PAPERS).map((name) => h('option', { value: name }, name)));
$('felt').addEventListener('change', (event) => { store.set('tapis:felt', event.target.value); applyFelt(); });
// Pictogram names offered wherever a card's symbol is typed.
document.body.append(h('datalist', { id: 'glyphList' }, Object.keys(GLYPHS).map((name) => h('option', { value: `:${name}` }))));

// ------------------------------------------------------------------ sidebar

function counterEl(counter, seat) {
  const value = seat === null ? S.view.counters.table[counter.id] : S.view.counters.players[seat][counter.id];
  const change = (delta) => () => act({ type: 'counter', id: counter.id, seat, delta });
  return h('span', { class: 'counter' }, counter.name,
    S.you >= 0 && h('button', { onclick: change(-1), 'aria-label': `${counter.name} −1` }, '−'),
    h('b', {}, String(value)),
    S.you >= 0 && h('button', { onclick: change(1), 'aria-label': `${counter.name} +1` }, '+'));
}

const groupOf = (macro) => macro.group || 'Actions de table';

function renderSidebar() {
  const perPlayer = S.def.counters.filter((c) => c.scope === 'player');
  const shared = S.def.counters.filter((c) => c.scope === 'table');
  const playing = S.you >= 0;

  fill($('players'),
    S.players.map((p) => h('div', { class: `player ${p.connected ? '' : 'away'} ${S.view.turn === p.seat ? 'turn' : ''}`, style: `--seat:${SEAT_COLORS[p.seat]}` },
      h('span', { class: 'who' }, h('i', { class: 'dot' }), p.name, p.seat === S.you && ' (vous)', p.seat === S.host && h('small', { title: 'Hôte de la table' }, 'hôte')),
      perPlayer.map((c) => counterEl(c, p.seat)),
      playing && p.seat !== S.you && h('button', { class: 'throw', title: `Lancer quelque chose sur ${p.name}`, 'aria-label': `Lancer quelque chose sur ${p.name}`, onclick: () => act({ type: 'throw', seat: p.seat }) }, glyphEl('tomate')))),
    shared.length && h('div', { class: 'player' }, shared.map((c) => counterEl(c, null))),
    S.players.length < 2 && h('button', { class: 'lonely', onclick: () => openWelcome(false) }, 'Vous êtes seul·e à table — inviter des joueurs'),
  );

  if (!playing) return fill($('actions'));
  const button = (label, action, cls) => h('button', { class: cls, onclick: () => act(action) }, label);
  fill($('actions'),
    h('div', { class: 'group' },
      button('Fin du tour', { type: 'turn' }, 'primary'),
      button('Dé à 6 faces', { type: 'roll', sides: 6 }),
      button('Pile ou face', { type: 'roll', sides: 2 })),
    // Scripts, gathered by the phase their author filed them under.
    [...new Set(S.def.macros.map(groupOf))].map((group) => [group, S.def.macros.filter((m) => groupOf(m) === group)]).map(([group, macros]) => h('div', { class: 'group' },
      h('span', { class: 'label' }, group),
      macros.map((m) => h('button', { title: m.on ? 'Se lance aussi tout seul au début de chaque tour' : '', onclick: () => runMacro(m) }, m.name, m.on && ' ⟳')))),
    h('div', { class: 'group' }, h('span', { class: 'label' }, 'Le jeu évolue'),
      h('button', { title: 'Écrire une carte qui restera dans le jeu', onclick: openAddCard }, 'Ajouter une carte…'),
      h('button', { title: 'Télécharger le jeu tel qu’il est devenu (cartes marquées et ajoutées), pour le rouvrir plus tard', onclick: () => connection.send({ t: 'save' }) }, 'Sauvegarder la boîte')),
    h('div', { class: 'group bad' }, h('span', { class: 'label' }, 'Mauvais joueur'),
      button('Renverser la table', { type: 'flipTable' }),
      button('Renverser son café', { type: 'spill' }),
      (S.view.stains ?? []).length > 0 && button('Éponger', { type: 'clean' })),
  );
}

/** A new card, written by hand, that joins the game for good. */
function openAddCard() {
  const form = $('cardForm');
  form.reset();
  fill(form.elements.deck, Object.entries(S.def.decks).map(([id, deck]) => h('option', { value: id }, deck.name)));
  const hand = S.def.ui.hand && `${S.def.ui.hand}@${S.you}`;
  fill(form.elements.to, S.def.zones.flatMap((zone) => {
    const key = zone.owner === 'player' ? `${zone.id}@${S.you}` : zone.id;
    return h('option', { value: key, selected: key === hand }, zone.name);
  }));
  $('cardDlg').onclose = () => {
    if ($('cardDlg').returnValue !== 'ok') return;
    const { name, type, art, text, deck, to } = form.elements;
    act({ type: 'addCard', deck: deck.value, to: to.value, card: { name: name.value, type: type.value, art: art.value, text: text.value } });
  };
  $('cardDlg').showModal();
}

/** A script with parameters asks for them first. */
function runMacro(macro) {
  if (!macro.params.length) return act({ type: 'macro', id: macro.id });
  $('paramTitle').textContent = macro.name.replace(/…$/, '');
  fill($('paramFields'), macro.params.map((p) => h('label', {}, p.name,
    h('input', { name: p.id, type: 'number', min: p.min, max: p.max, value: p.default, required: true }))));
  $('paramDlg').onclose = () => {
    if ($('paramDlg').returnValue !== 'ok') return;
    const args = Object.fromEntries(macro.params.map((p) => [p.id, Number($('paramForm').elements[p.id].value)]));
    act({ type: 'macro', id: macro.id, args });
  };
  $('paramDlg').showModal();
  $('paramForm').elements[macro.params[0].id].select();
}

/** Dealing from any zone: how many, to whom, where, and how many at a time. */
function openDeal(from, title, available) {
  const form = $('dealForm');
  $('dealFrom').textContent = `Depuis « ${title} » (${available} carte${available > 1 ? 's' : ''}).`;
  fill(form.elements.who,
    h('option', { value: 'all' }, 'À chaque joueur'),
    h('option', { value: String(S.you) }, 'À moi'),
    S.players.filter((p) => p.seat !== S.you).map((p) => h('option', { value: String(p.seat) }, `À ${p.name}`)));
  fill(form.elements.zone, S.def.zones.filter((z) => z.owner === 'player').map((z) => h('option', { value: z.id, selected: z.id === S.def.ui.hand }, z.name)));
  $('dealDlg').onclose = () => {
    if ($('dealDlg').returnValue !== 'ok') return;
    const who = form.elements.who.value;
    act({
      type: 'deal', from, to: form.elements.zone.value, count: Number(form.elements.count.value), by: Number(form.elements.by.value) || 1,
      seats: who === 'all' ? undefined : [Number(who)],
    });
  };
  $('dealDlg').showModal();
  form.elements.count.select();
}

function appendLog(entry) {
  const log = $('log');
  const line = h('p', { class: `${entry.kind} ${entry.alert ? 'alert' : ''}` });
  if (entry.name) line.append(h('b', { style: entry.seat >= 0 ? `color:${SEAT_COLORS[entry.seat]}` : '' }, entry.name), entry.kind === 'chat' ? ' : ' : ' ');
  line.append(entry.text);
  log.append(line);
  while (log.childElementCount > 200) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
}

$('chat').addEventListener('submit', (event) => {
  event.preventDefault();
  connection.send({ t: 'chat', text: $('chatInput').value });
  $('chatInput').value = '';
});

// ------------------------------------------------------------------ effects

function playEffect(fx) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (fx.kind === 'flip') {
    $('table').animate([
      { transform: 'perspective(1200px) rotateX(0) translateY(0)' },
      { transform: 'perspective(1200px) rotateX(70deg) translateY(-18%) scale(.85)', offset: 0.35 },
      { transform: 'perspective(1200px) rotateX(360deg) translateY(0)' },
    ], { duration: 900, easing: 'cubic-bezier(.3,.1,.3,1.2)' });
  }
  if (fx.kind === 'caught') {
    // Everybody turns to the cheat.
    const area = document.querySelector(`.area[data-seat="${fx.from}"]`) ?? $('table');
    const rect = area.getBoundingClientRect();
    const flag = h('div', { class: 'caught' }, 'Tricheur !');
    flag.style.left = `${rect.left + rect.width / 2}px`;
    flag.style.top = `${rect.top + rect.height / 2}px`;
    document.body.append(flag);
    area.animate([{ translate: '-6px 0' }, { translate: '6px 0' }, { translate: '-4px 0' }, { translate: '0 0' }], { duration: 350 });
    setTimeout(() => flag.remove(), 1800);
  }
  if (fx.kind === 'throw') {
    const center = (seat) => {
      const rect = (document.querySelector(`.area[data-seat="${seat}"]`) ?? $('table')).getBoundingClientRect();
      return [rect.left + rect.width / 2, rect.top + rect.height / 2];
    };
    const [x0, y0] = center(fx.from);
    const [x1, y1] = center(fx.to);
    const item = h('div', { class: 'projectile' }, glyphEl(fx.item) ?? fx.item);
    document.body.append(item);
    item.animate([
      { translate: `${x0}px ${y0}px`, rotate: '0deg', scale: 1 },
      { translate: `${(x0 + x1) / 2}px ${Math.min(y0, y1) - 120}px`, rotate: '360deg', scale: 1.6, offset: 0.5 },
      { translate: `${x1}px ${y1}px`, rotate: '720deg', scale: 1, offset: 0.85 },
      { translate: `${x1}px ${y1}px`, rotate: '720deg', scale: 2.6, opacity: 0 },
    ], { duration: 1000, easing: 'ease-in-out' }).finished.then(() => item.remove());
  }
}
