// Zone addressing. A zone *definition* ("hand") becomes one concrete zone per
// seat when it is player-owned ("hand@0", "hand@1"…) and a single one otherwise.

export function zoneKey(zone, seat) {
  return zone.owner === 'player' ? `${zone.id}@${seat}` : zone.id;
}

export function findZone(def, zoneId) {
  return def.zones.find((z) => z.id === zoneId) ?? null;
}

/** Resolves a concrete key to `{ zone, seat }`, or null if it does not exist. */
export function parseKey(def, key) {
  if (typeof key !== 'string') return null;
  const [id, seatPart, extra] = key.split('@');
  if (extra !== undefined) return null;
  const zone = findZone(def, id);
  if (!zone) return null;
  if (zone.owner !== 'player') return seatPart === undefined ? { zone, seat: null } : null;
  const seat = Number(seatPart);
  if (!/^\d+$/.test(seatPart ?? '') || seat >= def.players.max) return null;
  return { zone, seat };
}

/** Every concrete key of a zone definition, for the given seats. */
export function keysFor(zone, seats) {
  return zone.owner === 'player' ? seats.map((s) => zoneKey(zone, s)) : [zone.id];
}
