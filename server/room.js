// A room: one table, its seats, and the people connected to it.
//
// The room owns everything the engine deliberately ignores — who is who, who
// may restart or change the game, chat and the event log — and is independent
// of the transport: a "client" is anything with a `send(message)` method.

import { randomUUID, randomInt } from 'node:crypto';
import { applyAction, createGame, setup } from '../shared/engine.js';
import { viewFor } from '../shared/view.js';
import { exportDefinition } from '../shared/definition.js';

const LOG_SIZE = 200;

export class Room {
  constructor(code, def) {
    this.code = code;
    this.clients = new Set();
    this.seats = [];
    this.log = [];
    this.emptySince = Date.now();
    this.pause = null; // { phase: 'asked' | 'on', votes: [seats], since }
    this.load(def);
  }

  // -------------------------------------------------------------- game

  load(def) {
    // A private copy: play may alter the game itself (marked or added cards).
    this.def = def = structuredClone(def);
    this.state = createGame(def, randomInt(2 ** 32));
    // Seats beyond the new game's capacity become spectators.
    this.seats.length = def.players.max;
    for (let i = 0; i < this.seats.length; i++) this.seats[i] ??= null;
    for (const client of this.clients) if (client.seat >= def.players.max) client.seat = -1;
    this.restart();
  }

  restart() {
    this.syncSeats();
    // While the box is still sealed there is nothing to set up: unboxing does it.
    if (!this.state.box || this.state.box.done) setup(this.state);
    this.pristine = true;
  }

  syncSeats() {
    this.state.activeSeats = this.seats.flatMap((seat, i) => (seat ? [i] : []));
    this.state.seatNames = this.seats.map((seat) => seat?.name);
    if (!this.state.activeSeats.includes(this.state.turn)) this.state.turn = this.state.activeSeats[0] ?? 0;
  }

  /** The host is simply the first seated player who is connected. */
  get hostSeat() {
    return this.seats.findIndex((seat) => seat?.connected);
  }

  // -------------------------------------------------------------- people

  join(client, name, token) {
    client.name = name;
    let index = token ? this.seats.findIndex((seat) => seat?.token === token) : -1;
    let fresh = false;
    if (index < 0) {
      index = this.seats.findIndex((seat) => !seat);
      fresh = index >= 0;
      // Table full: a newcomer may take over the seat of someone who left.
      if (index < 0) index = this.seats.findIndex((seat) => !seat.connected);
      if (index >= 0) this.seats[index] = { token: randomUUID(), name, connected: true };
    }
    if (index >= 0) Object.assign(this.seats[index], { name, connected: true });
    client.seat = index;
    this.clients.add(client);
    this.emptySince = null;
    this.syncSeats();

    // Nobody has touched the table yet: deal the newcomer in.
    if (fresh && this.pristine) this.restart();

    client.send({ t: 'welcome', room: this.code, seat: index, token: index >= 0 ? this.seats[index].token : null });
    client.send({ t: 'def', def: this.def });
    client.send({ t: 'log', entries: this.log, replace: true });
    this.say(null, index >= 0 ? `${name} s'assoit à la table.` : `${name} regarde la partie.`);
    if (fresh && !this.pristine) this.say(null, `${name} arrive en cours de partie : l'hôte peut redistribuer avec « Nouvelle partie ».`);
    this.broadcast();
  }

  leave(client) {
    if (!this.clients.delete(client)) return;
    const seat = this.seats[client.seat];
    // Another tab of the same player may still be connected.
    if (seat && ![...this.clients].some((other) => other.seat === client.seat)) {
      seat.connected = false;
      this.say(null, `${seat.name} s'est déconnecté·e (sa place est gardée).`);
    }
    if (!this.clients.size) this.emptySince = Date.now();
    this.settlePause(); // nobody waits for someone who left
    this.broadcast();
  }

  // -------------------------------------------------------------- break

  /**
   * A break is agreed by everybody, twice: all connected players accept it,
   * then all of them say they are back. Meanwhile the table is hidden from
   * everyone and nothing can be played — no peeking while the others are away.
   */
  votePause(client) {
    if (!this.pause) {
      this.pause = { phase: 'asked', votes: [], since: Date.now() };
      this.say(client.seat, 'demande une pause pipi.', client.name);
    }
    if (!this.pause.votes.includes(client.seat)) this.pause.votes.push(client.seat);
    this.settlePause();
  }

  settlePause() {
    if (!this.pause) return;
    const present = this.seats.flatMap((seat, i) => (seat?.connected ? [i] : []));
    if (present.length && !present.every((seat) => this.pause.votes.includes(seat))) return;
    if (this.pause.phase === 'asked' && present.length) {
      this.pause = { phase: 'on', votes: [], since: Date.now() };
      this.say(null, 'Pause pipi ! La table est sous cloche.');
    } else {
      const seconds = Math.round((Date.now() - this.pause.since) / 1000);
      const lasted = this.pause.phase === 'on';
      this.pause = null;
      if (lasted) this.say(null, `Tout le monde est revenu : la partie reprend (pause de ${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')}).`);
    }
  }

  // -------------------------------------------------------------- messages

  handle(client, message, resolveGame) {
    switch (message.t) {
      case 'act': {
        if (client.seat < 0) return client.send({ t: 'error', text: 'Les spectateurs ne peuvent pas jouer.' });
        if (this.pause?.phase === 'on') return client.send({ t: 'error', text: 'Pause en cours : on ne touche à rien.' });
        const result = applyAction(this.state, client.seat, message.a);
        if (result.error) return client.send({ t: 'error', text: result.error });
        if (message.a?.type !== 'unbox') this.pristine = false; // unboxing is not playing yet
        break;
      }
      case 'chat': {
        const text = typeof message.text === 'string' ? message.text.trim().slice(0, 300) : '';
        if (!text) return;
        this.say(client.seat, text, client.name, 'chat');
        return;
      }
      case 'pause':
        if (client.seat < 0) return;
        if (message.cancel && this.pause?.phase === 'asked') {
          this.pause = null;
          this.say(client.seat, 'préfère continuer : pas de pause pour l’instant.', client.name);
        } else if (!message.cancel) this.votePause(client);
        break;
      case 'save':
        // The game as it is now, to keep as a file and reopen another day.
        return client.send({ t: 'saved', def: exportDefinition(this.def) });
      case 'restart':
        if (!this.requireHost(client)) return;
        this.restart();
        this.say(client.seat, 'relance une nouvelle partie.', client.name);
        break;
      case 'load': {
        if (!this.requireHost(client)) return;
        const def = resolveGame(message);
        this.load(def);
        for (const other of this.clients) {
          other.send({ t: 'welcome', room: this.code, seat: other.seat, token: this.seats[other.seat]?.token ?? null });
          other.send({ t: 'def', def: this.def });
        }
        this.say(client.seat, `installe le jeu « ${this.def.name} ».`, client.name);
        break;
      }
      default:
        return;
    }
    this.flushEvents();
    this.broadcast();
  }

  requireHost(client) {
    if (client.seat >= 0 && client.seat === this.hostSeat) return true;
    client.send({ t: 'error', text: "Seul l'hôte de la table peut faire ça." });
    return false;
  }

  // -------------------------------------------------------------- output

  say(seat, text, name = null, kind = 'event', fx = undefined) {
    const entry = { seat, name, text, kind, at: Date.now() };
    if (fx?.alert) entry.alert = true; // shouted in the log
    this.log.push(entry);
    if (this.log.length > LOG_SIZE) this.log.shift();
    // Effects are played once, live; they are not part of the stored history.
    for (const client of this.clients) client.send({ t: 'log', entries: [entry], fx });
  }

  flushEvents() {
    for (const event of this.state.events.splice(0)) {
      if (event.only === undefined) this.say(event.seat, event.text, this.seats[event.seat]?.name, 'event', event.fx);
      // A whisper reaches one seat and leaves no trace in the history.
      else for (const client of this.clients) if (client.seat === event.only) client.send({ t: 'log', entries: [{ seat: null, name: null, text: event.text, kind: 'whisper', at: Date.now() }] });
    }
  }

  broadcast() {
    const players = this.seats.map((seat, i) => seat && { seat: i, name: seat.name, connected: seat.connected });
    const host = this.hostSeat;
    for (const client of this.clients) {
      const view = viewFor(this.state, client.seat);
      // During a break nobody is sent any card, not even their own.
      if (this.pause?.phase === 'on') view.zones = Object.fromEntries(Object.keys(view.zones).map((key) => [key, []]));
      const pause = this.pause && { phase: this.pause.phase, votes: this.pause.votes, elapsed: Date.now() - this.pause.since };
      client.send({ t: 'state', view, players: players.filter(Boolean), host, you: client.seat, pause });
    }
  }
}
