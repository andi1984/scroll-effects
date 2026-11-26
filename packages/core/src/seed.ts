/**
 * Seeds: each visitor gets their own plant / pane, kept in localStorage.
 * `?<key>=…` in the URL forces one (and stores it).
 */
export function readOrCreateSeed(key: string, fallback: string = key): string {
  const param = new URLSearchParams(window.location.search).get(key);
  if (param && /^[\w-]{1,64}$/.test(param)) {
    // Store it, but a storage failure (private mode) must not lose the param.
    try {
      localStorage.setItem(key, param);
    } catch {
      /* storage unavailable — the param still wins for this visit */
    }
    return param;
  }
  try {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
    localStorage.setItem(key, seed);
    return seed;
  } catch {
    // Storage/crypto unavailable — fall back to a fixed seed.
    return fallback;
  }
}

/** xmur3 string hash → uint32 seed. */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32 PRNG — small, fast, deterministic. Returns [0, 1). */
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
