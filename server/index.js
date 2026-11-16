// HTTP (static files) + WebSocket entry point. Thin on purpose: it parses
// messages, finds the room, and lets Room and the shared engine do the work.

import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DefinitionError, normalizeDefinition } from '../shared/definition.js';
import { Room } from './room.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const MAX_ROOMS = 500;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };

// ------------------------------------------------------------------ games

/** Bundled games, validated at startup so a broken file fails fast. */
async function loadBundledGames() {
  const games = new Map();
  for (const file of (await readdir(path.join(ROOT, 'games'))).filter((f) => f.endsWith('.json')).sort()) {
    const def = normalizeDefinition(JSON.parse(await readFile(path.join(ROOT, 'games', file), 'utf8')));
    games.set(def.id, { def, file });
  }
  return games;
}

const games = await loadBundledGames();

/** A message names a bundled game (`game`) or carries an uploaded definition (`def`). */
function resolveGame(message) {
  if (message.def) return normalizeDefinition(message.def);
  return games.get(message.game)?.def ?? (() => { throw new DefinitionError('Jeu inconnu.'); })();
}

// ------------------------------------------------------------------ http

async function serveFile(res, base, relative) {
  const file = path.join(base, path.normalize(relative));
  if (!file.startsWith(base + path.sep)) throw new Error('outside root');
  const body = await readFile(file);
  res.writeHead(200, {
    'content-type': `${MIME[path.extname(file)] ?? 'application/octet-stream'}; charset=utf-8`,
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/api/games') {
      const summary = [...games.values()].map(({ def, file }) => ({
        id: def.id, name: def.name, description: def.description, players: def.players, duration: def.duration, file: `/games/${file}`,
      }));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(summary));
    }
    // What an invitation link shows before the guest has typed anything.
    if (pathname.startsWith('/api/room/')) {
      const room = rooms.get(pathname.slice(10).toUpperCase());
      if (!room) throw new Error('no such room');
      const seated = room.seats.filter(Boolean);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ game: room.def.name, players: seated.filter((s) => s.connected).map((s) => s.name), free: room.seats.length - seated.length }));
    }
    if (pathname.startsWith('/games/')) return await serveFile(res, path.join(ROOT, 'games'), pathname.slice(7));
    // The browser imports the very same modules as the server (validation, zone keys).
    if (pathname.startsWith('/shared/')) return await serveFile(res, path.join(ROOT, 'shared'), pathname.slice(8));
    return await serveFile(res, path.join(ROOT, 'public'), pathname === '/' ? 'index.html' : pathname.slice(1));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Introuvable');
  }
});

// ------------------------------------------------------------------ rooms

const rooms = new Map();
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alikes

function newRoomCode() {
  for (;;) {
    const code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    if (!rooms.has(code)) return code;
  }
}

setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.emptySince && Date.now() - room.emptySince > ROOM_IDLE_MS) rooms.delete(code);
  }
}, 60_000).unref();

// ------------------------------------------------------------------ websocket

const wss = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024 });

function cleanName(value) {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 20) : '';
  return name || 'Anonyme';
}

wss.on('connection', (ws) => {
  const client = { seat: -1, name: '', room: null, send: (message) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(message)) };
  let budget = 60; // crude flood guard: 60 messages, refilled at 20 per second
  let refilled = Date.now();

  ws.on('message', (data) => {
    const now = Date.now();
    budget = Math.min(60, budget + ((now - refilled) / 1000) * 20);
    refilled = now;
    if (--budget < 0) return;

    try {
      const message = JSON.parse(data);
      if (!message || typeof message !== 'object') return;

      if (message.t === 'create' || message.t === 'join') {
        if (client.room) return;
        let room;
        if (message.t === 'create') {
          if (rooms.size >= MAX_ROOMS) return client.send({ t: 'error', text: 'Le serveur est plein, réessayez plus tard.' });
          room = new Room(newRoomCode(), resolveGame(message));
          rooms.set(room.code, room);
        } else {
          room = rooms.get(String(message.room ?? '').trim().toUpperCase());
          if (!room) return client.send({ t: 'error', text: "Cette table n'existe pas (ou plus).", lobby: true });
        }
        client.room = room;
        room.join(client, cleanName(message.name), typeof message.token === 'string' ? message.token : null);
        return;
      }
      client.room?.handle(client, message, resolveGame);
    } catch (error) {
      if (error instanceof DefinitionError) return client.send({ t: 'error', text: `Fichier de jeu invalide — ${error.message}` });
      if (error instanceof SyntaxError) return;
      console.error(error);
      client.send({ t: 'error', text: 'Erreur interne.' });
    }
  });

  ws.on('close', () => client.room?.leave(client));
  ws.on('error', () => {});
});

server.listen(PORT, () => console.log(`Tapipi — http://localhost:${PORT} (${games.size} jeux fournis)`));
