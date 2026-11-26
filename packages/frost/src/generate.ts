/**
 * Seeded frost generator for the scroll-progress window pane (Frost.tsx).
 *
 * The page is a cold window: as you read, ice crystals form on the pane,
 * in the empty margins beside the text, never over it. The frost is pure
 * data derived from a seed and the size of the margin strips: same seed →
 * same pane.
 *
 * Physics, loosely. Frost nucleates where the pane is coldest — the frame —
 * so crystals crowd along the screen edge and the bottom and thin out toward
 * the text, and the bottom forms first: crystals near the bottom frame
 * appear early in the read, the top of the pane late. Every crystal is
 * hexagonal (ice is), in one of a few habits snow crystals really grow in:
 *
 * - stellar dendrite: six arms with side branches at 60°, the big ones with
 *   twigs on their branches;
 * - sector plate: six broad, ribbed paddles;
 * - hexagonal plate: a flat hexagon with an inner rim and ridges;
 * - needle star: six arms ending in barbed tips.
 *
 * Mostly small ones, a few large. Each crystal grows from its center while
 * the reading progress passes its window [t0, t0 + dur].
 *
 * No DOM, no React: this file only does arithmetic. Coordinates are CSS px
 * of one strip, x = 0 at the screen edge; the component mirrors the right
 * strip. Crystal shapes are in their own coordinates around (0, 0).
 */

import { hashSeed, mulberry32 } from "@andi1984/scroll-effects-core";

export type FrostSide = 1 | -1;

export interface FrostBox {
  /** Width of one margin strip: the empty space beside the text, less a gap. */
  width: number;
  /** Full width of the screen; the right strip ends here. */
  span: number;
  /** Height of the screen. The frost is on the pane: it doesn't scroll. */
  height: number;
}

export type FrostHabit = "dendrite" | "sector" | "plate" | "needle";

/** A sparkle on a tip, in the crystal's coordinates. */
export interface FrostGlint {
  x: number;
  y: number;
  r: number;
  /** Twinkle phase, seconds. */
  delay: number;
}

export interface FrostCrystal {
  id: string;
  side: FrostSide;
  habit: FrostHabit;
  /** Center, in strip px. */
  x: number;
  y: number;
  /** Radius (center to arm tip). */
  r: number;
  /** Reading progress (0–1) at which it starts forming… */
  t0: number;
  /** …and how much progress it takes to form in full. */
  dur: number;
  /** The main arms (or the plate's outline). */
  arms: string;
  /** Side branches, ribs, ridges: they come in after the arms. */
  detail: string;
  /** A filled face (plates and sector paddles), or "" for none. */
  face: string;
  glints: FrostGlint[];
}

export interface Frost {
  seed: string;
  width: number;
  span: number;
  height: number;
  crystals: FrostCrystal[];
}

type Rng = () => number;
type Pt = readonly [number, number];

const HEX = Math.PI / 3;
const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const between = (rng: Rng, min: number, max: number) =>
  min + rng() * (max - min);

const at = (s: number, ang: number): Pt => [Math.cos(ang) * s, Math.sin(ang) * s];
const add = (p: Pt, q: Pt): Pt => [p[0] + q[0], p[1] + q[1]];
const seg = (p: Pt, q: Pt) => `M${r1(p[0])} ${r1(p[1])}L${r1(q[0])} ${r1(q[1])}`;
const poly = (pts: readonly Pt[], close = false) =>
  pts.map((p, i) => `${i ? "L" : "M"}${r1(p[0])} ${r1(p[1])}`).join("") +
  (close ? "Z" : "");

/** The six arm directions of a crystal turned by `turn`. */
const sixfold = (turn: number) =>
  Array.from({ length: 6 }, (_, k) => turn + k * HEX);

interface Shape {
  arms: string;
  detail: string;
  face: string;
  tips: Pt[];
}

/** Six arms; side branches at 60°, longest near the center; twigs on big ones. */
function dendrite(rng: Rng, R: number, turn: number): Shape {
  const branches: { s: number; len: number }[] = [];
  if (R >= 7) {
    const step = R * between(rng, 0.15, 0.22);
    for (let s = R * between(rng, 0.22, 0.32); s < R * 0.86; s += step) {
      branches.push({ s, len: (1 - s / R) * R * between(rng, 0.42, 0.62) });
    }
  }
  const twigs = R >= 20;
  const arms: string[] = [];
  const detail: string[] = [];
  const tips: Pt[] = [];
  for (const ang of sixfold(turn)) {
    arms.push(seg([0, 0], at(R, ang)));
    tips.push(at(R, ang));
    for (const b of branches) {
      const from = at(b.s, ang);
      for (const sg of [1, -1]) {
        const bang = ang + sg * HEX;
        const to = add(from, at(b.len, bang));
        detail.push(seg(from, to));
        // A twig off the branch, parallel to the arm, like the real thing.
        if (twigs && b.len > R * 0.22) {
          const mid = add(from, at(b.len * 0.5, bang));
          detail.push(seg(mid, add(mid, at(b.len * 0.35, ang))));
        }
      }
    }
  }
  return { arms: arms.join(""), detail: detail.join(""), face: "", tips };
}

/** Six broad paddles, each with a midrib and cross ribs. */
function sector(rng: Rng, R: number, turn: number): Shape {
  const spread = between(rng, 0.2, 0.3);
  const root = R * between(rng, 0.12, 0.2);
  const shoulder = R * between(rng, 0.72, 0.84);
  const arms: string[] = [];
  const detail: string[] = [];
  const tips: Pt[] = [];
  for (const ang of sixfold(turn)) {
    const outline = [
      at(root, ang),
      at(shoulder, ang + spread),
      at(R, ang),
      at(shoulder, ang - spread),
    ];
    arms.push(poly(outline, true));
    tips.push(at(R, ang));
    detail.push(seg([0, 0], at(R * 0.96, ang)));
    if (R >= 9) {
      for (let s = R * 0.38; s < shoulder; s += R * between(rng, 0.13, 0.18)) {
        const half = Math.tan(spread) * s * ((s - root) / (shoulder - root)) * 0.9;
        const c = at(s, ang);
        const n = at(half, ang + Math.PI / 2);
        detail.push(seg(add(c, n), add(c, [-n[0], -n[1]])));
      }
    }
  }
  const outline = arms.join("");
  return { arms: outline, detail: detail.join(""), face: outline, tips };
}

/** A flat hexagon: outer rim, inner rim, ridges from corner to corner. */
function plate(rng: Rng, R: number, turn: number): Shape {
  const outer = sixfold(turn).map((a) => at(R, a));
  const inner = sixfold(turn).map((a) => at(R * between(rng, 0.5, 0.62), a));
  const detail: string[] = [poly(inner, true)];
  for (let k = 0; k < 6; k++) detail.push(seg(inner[k], outer[k]));
  // Big plates sprout little arms at their corners: the start of a star.
  const arms = [poly(outer, true)];
  if (R >= 12) {
    for (const ang of sixfold(turn)) arms.push(seg(at(R, ang), at(R * 1.28, ang)));
  }
  return {
    arms: arms.join(""),
    detail: detail.join(""),
    face: poly(outer, true),
    tips: outer,
  };
}

/** Six arms with barbed tips and one pair of side spikes. */
function needle(rng: Rng, R: number, turn: number): Shape {
  const barb = R * between(rng, 0.16, 0.24);
  const spikeAt = R * between(rng, 0.45, 0.65);
  const spike = R * between(rng, 0.18, 0.3);
  const arms: string[] = [];
  const detail: string[] = [];
  const tips: Pt[] = [];
  for (const ang of sixfold(turn)) {
    const tip = at(R, ang);
    arms.push(seg([0, 0], tip));
    tips.push(tip);
    for (const sg of [1, -1]) {
      detail.push(seg(tip, add(tip, at(barb, ang + Math.PI - sg * 0.7))));
      const from = at(spikeAt, ang);
      detail.push(seg(from, add(from, at(spike, ang + sg * HEX))));
    }
  }
  return { arms: arms.join(""), detail: detail.join(""), face: "", tips };
}

const HABITS: Record<FrostHabit, (rng: Rng, R: number, turn: number) => Shape> = {
  dendrite,
  sector,
  plate,
  needle,
};

function pickHabit(rng: Rng, R: number): FrostHabit {
  const v = rng();
  // Small crystals are mostly plates and simple stars; big ones dendrites.
  if (R < 8) return v < 0.45 ? "plate" : v < 0.8 ? "needle" : "dendrite";
  return v < 0.5 ? "dendrite" : v < 0.72 ? "sector" : v < 0.86 ? "needle" : "plate";
}

/** How likely frost is at (x, y): highest on the frame, the bottom most. */
function density(x: number, y: number, w: number, h: number) {
  const edge = Math.exp(-Math.max(0, x) / (w * 0.38));
  const bottom = Math.exp(-(h - y) / (h * 0.22));
  return clamp(0.1 + 0.75 * edge + 0.5 * bottom, 0, 1);
}

/** One strip's frost. */
function strip(seed: string, side: FrostSide, w: number, h: number): FrostCrystal[] {
  const tag = side === 1 ? "l" : "r";
  const rng = mulberry32(hashSeed(`${seed}:${tag}`));
  const placed: FrostCrystal[] = [];
  // At most roughly one crystal per this many square px of strip.
  const cap = Math.round((w * h) / 1500);
  const tries = cap * 14;
  const maxR = Math.max(6, Math.min(30, w / 2 - 8));

  for (let i = 0; i < tries && placed.length < cap; i++) {
    // Mostly small: the radius skews hard toward the low end.
    const R = 4 + Math.pow(rng(), 2.2) * (maxR - 4);
    // Crystals may run off the screen edge (they nucleate on the frame), but
    // never reach toward the text.
    const x = between(rng, -R * 0.4, w - R * 1.3 - 3);
    const y = between(rng, R * 0.2, h - R * 0.2);
    if (rng() > density(x, y, w, h)) continue;
    // Neighbours may touch and overlap a little, the way frost packs.
    if (placed.some((c) => Math.hypot(c.x - x, c.y - y) < (c.r + R) * 0.82)) continue;

    const habit = pickHabit(rng, R);
    const turn = rng() * HEX;
    const shape = HABITS[habit](rng, R, turn);
    // Bottom of the pane first, then up; the frame before the open glass.
    const up = 1 - y / h;
    const t0 = clamp(
      0.62 * Math.pow(up, 1.15) + 0.18 * (Math.max(0, x) / w) + (rng() - 0.5) * 0.08,
      0,
      0.9,
    );
    const glints: FrostGlint[] = [];
    if (R > 11) {
      for (const tip of shape.tips) {
        if (rng() < 0.18)
          glints.push({ x: tip[0], y: tip[1], r: between(rng, 2, 3.2), delay: rng() * 4 });
      }
    }
    placed.push({
      id: `${tag}${placed.length}`,
      side,
      habit,
      x,
      y,
      r: R,
      t0,
      dur: between(rng, 0.05, 0.1) + R / 300,
      arms: shape.arms,
      detail: shape.detail,
      face: shape.face,
      glints,
    });
  }
  return placed;
}

export function generateFrost(seed: string, box: FrostBox): Frost {
  const { width, span, height } = box;
  return {
    seed,
    width,
    span,
    height,
    crystals: [...strip(seed, 1, width, height), ...strip(seed, -1, width, height)],
  };
}
