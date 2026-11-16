// Per-player projection of the game state.
//
// Hidden information never leaves the server: a card a player may not see is
// sent without its identity (only the deck it belongs to, for the card back).

import { parseKey } from './zones.js';

/** `seat` is the viewer's seat, or -1 for a spectator. */
export function viewFor(state, seat) {
  const zones = {};
  for (const [key, ids] of Object.entries(state.zones)) {
    const { zone, seat: owner } = parseKey(state.def, key);
    zones[key] = ids.map((id) => {
      const card = state.cards[id];
      const visible = card.faceUp || (zone.visibility === 'owner' && owner === seat) || card.peek.includes(seat);
      const out = { id, up: card.faceUp };
      if (visible) out.p = card.proto;
      else out.d = card.deck;
      if (card.tapped) out.tap = true;
      if (card.tokens) out.tok = card.tokens;
      if (card.x !== undefined) {
        out.x = card.x;
        out.y = card.y;
        if (card.rot) out.rot = card.rot;
      }
      return out;
    });
  }
  return { zones, counters: state.counters, turn: state.turn, stains: state.stains };
}
