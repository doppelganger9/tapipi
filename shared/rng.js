// Deterministic PRNG (mulberry32). The generator state is a plain integer kept
// inside the game state, so a game can be replayed from its seed.

export function nextRandom(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state, n) {
  return Math.floor(nextRandom(state) * n);
}

export function shuffleInPlace(state, array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(state, i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
