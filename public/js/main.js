// Application shell: lobby, session, sidebar, and the glue between the network
// and the table.

import { $, h, fill, SEAT_COLORS } from './dom.js';
import { cardEl } from './cards.js';
import { createConnection } from './net.js';
import { createTable } from './table.js';
import { createCoach, randomNickname } from './onboarding.js';

const S = { def: null, view: null, players: [], you: -1, host: -1 };
let session = JSON.parse(sessionStorage.getItem('tapis:session') ?? 'null'); // { room, token }
let iOpenedThisTable = false;
let welcomePending = false;

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
      document.body.classList.toggle('is-host', S.you >= 0 && S.you === S.host);
      table.update(S);
      renderSidebar();
      renderGuests();
      coach.update(S);
      if (welcomePending) {
        welcomePending = false;
        openWelcome(true);
      }
      break;
    case 'log':
      if (message.replace) fill($('log'));
      for (const entry of message.entries) appendLog(entry);
      if (message.fx) playEffect(message.fx);
      break;
    case 'error':
      toast(message.text);
      if (message.lobby) leave();
      break;
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
$('wShare').addEventListener('click', () => navigator.share({ title: 'Tapis', text: `Viens jouer à ${S.def.name} !`, url: location.href }).catch(() => {}));
$('wRules').addEventListener('click', () => $('rulesDlg').showModal());
$('wGo').addEventListener('click', () => $('welcomeDlg').close());
$('welcomeDlg').addEventListener('close', () => { if (!store.get('tapis:coached')) coach.start(S); });

// ------------------------------------------------------------------ top bar

$('share').addEventListener('click', () => openWelcome(false));
$('helpBtn').addEventListener('click', () => coach.start(S));
$('rulesBtn').addEventListener('click', () => $('rulesDlg').showModal());
$('restartBtn').addEventListener('click', () => confirm('Ramasser toutes les cartes et recommencer ?') && connection.send({ t: 'restart' }));
$('changeBtn').addEventListener('click', () => {
  gamePicker($('picker2'), (choice) => { $('changeDlg').close(); connection.send({ t: 'load', ...choice }); });
  $('changeDlg').showModal();
});
$('quitBtn').addEventListener('click', () => { sessionStorage.removeItem('tapis:session'); location.href = location.pathname; });

/** The felt colour: the player's own choice wins over the game's suggestion. */
function applyFelt() {
  const color = store.get('tapis:felt') ?? S.def?.table?.color ?? '#1f5c4a';
  $('felt').value = color;
  $('table').style.setProperty('--felt', color);
  $('table').style.backgroundImage = S.def?.table?.image ? `url("${S.def.table.image}")` : '';
}
$('felt').addEventListener('input', (event) => { store.set('tapis:felt', event.target.value); applyFelt(); });

// ------------------------------------------------------------------ sidebar

function counterEl(counter, seat) {
  const value = seat === null ? S.view.counters.table[counter.id] : S.view.counters.players[seat][counter.id];
  const change = (delta) => () => act({ type: 'counter', id: counter.id, seat, delta });
  return h('span', { class: 'counter' }, counter.name,
    S.you >= 0 && h('button', { onclick: change(-1), 'aria-label': `${counter.name} −1` }, '−'),
    h('b', {}, String(value)),
    S.you >= 0 && h('button', { onclick: change(1), 'aria-label': `${counter.name} +1` }, '+'));
}

function renderSidebar() {
  const perPlayer = S.def.counters.filter((c) => c.scope === 'player');
  const shared = S.def.counters.filter((c) => c.scope === 'table');
  const playing = S.you >= 0;

  fill($('players'),
    S.players.map((p) => h('div', { class: `player ${p.connected ? '' : 'away'} ${S.view.turn === p.seat ? 'turn' : ''}`, style: `--seat:${SEAT_COLORS[p.seat]}` },
      h('span', { class: 'who' }, h('i', { class: 'dot' }), p.name, p.seat === S.you && ' (vous)', p.seat === S.host && h('span', { title: 'Hôte de la table' }, ' ♛')),
      perPlayer.map((c) => counterEl(c, p.seat)),
      playing && p.seat !== S.you && h('button', { class: 'throw', title: `Lancer quelque chose sur ${p.name}`, onclick: () => act({ type: 'throw', seat: p.seat }) }, '🍅'))),
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
    S.def.macros.length && h('div', { class: 'group' }, h('span', { class: 'label' }, 'Actions de table'),
      S.def.macros.map((m) => button(m.name, { type: 'macro', id: m.id }))),
    h('div', { class: 'group' }, h('span', { class: 'label' }, 'Mauvais joueur'),
      button('Renverser la table', { type: 'flipTable' }),
      button('Renverser son café', { type: 'spill' }),
      (S.view.stains ?? []).length > 0 && button('Éponger', { type: 'clean' })),
  );
}

function appendLog(entry) {
  const log = $('log');
  const line = h('p', { class: entry.kind });
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
  if (fx.kind === 'throw') {
    const center = (seat) => {
      const rect = (document.querySelector(`.area[data-seat="${seat}"]`) ?? $('table')).getBoundingClientRect();
      return [rect.left + rect.width / 2, rect.top + rect.height / 2];
    };
    const [x0, y0] = center(fx.from);
    const [x1, y1] = center(fx.to);
    const item = h('div', { class: 'projectile' }, fx.item);
    document.body.append(item);
    item.animate([
      { translate: `${x0}px ${y0}px`, rotate: '0deg', scale: 1 },
      { translate: `${(x0 + x1) / 2}px ${Math.min(y0, y1) - 120}px`, rotate: '360deg', scale: 1.6, offset: 0.5 },
      { translate: `${x1}px ${y1}px`, rotate: '720deg', scale: 1, offset: 0.85 },
      { translate: `${x1}px ${y1}px`, rotate: '720deg', scale: 2.6, opacity: 0 },
    ], { duration: 1000, easing: 'ease-in-out' }).finished.then(() => item.remove());
  }
}
