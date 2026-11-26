/**
 * Seeded vine generator for the scroll-progress plant (Vine.tsx).
 *
 * The plant is pure data derived from a seed string and the size of the strip
 * it grows in: same seed → same plant, so the seed stored in localStorage (or
 * passed as ?vine-seed=) recreates it, fruit and all. Everything is in CSS
 * pixels of the strip, so leaves keep their proportions at any viewport size;
 * a taller viewport simply gets a longer vine with more nodes.
 *
 * Botany, loosely a grapevine trained on a pergola. It is rooted below a
 * bottom corner of the screen (the seed picks which), climbs that edge,
 * turns just under a ledge (the rule under the site header) and creeps along
 * it across the whole page, leaves standing up wherever the header has no
 * links, grows too long to hold itself up at the far side, droops over and
 * hangs in that margin: a stem that zigzags from node to node, one lobed
 * leaf on the outside of each bend, and opposite the leaf either nothing, a
 * tendril, or a fruit cluster (in a real vine those two are the same organ,
 * which is why they never share a node).
 *
 * No DOM, no React: this file only does arithmetic.
 */

import { hashSeed, mulberry32 } from "@andi1984/scroll-effects-core";

export { hashSeed };

export type VineSide = 1 | -1;
export type VineVariety = "blue" | "red" | "white";

export interface VineLine {
  /** Sample points along the stem's centerline, top to bottom. */
  xs: number[];
  ys: number[];
  /** Unit normals at each sample. */
  nx: number[];
  ny: number[];
  /** Arc length from the first sample to each sample. */
  ss: number[];
  /** Width multiplier per sample: stems swell slightly at the nodes. */
  swell: number[];
  /** Total arc length. */
  length: number;
}

export interface VineLeaf {
  /** Stable name, so a pruned leaf stays pruned across pages and resizes. */
  id: string;
  x: number;
  y: number;
  /** Arc position of the node the leaf grows from. */
  s: number;
  /** Which side of the stem it grows on (1 = right). */
  side: VineSide;
  /**
   * Rotation of the leaf's frame, degrees: 0 for a leaf hanging off the
   * vertical stem (x points away from the stem), -90 for one standing on the
   * creeping stem (x points up).
   */
  rot: number;
  /** Direction the folded young leaf points in that frame: along the shoot. */
  bud: number;
  /** Petiole (leaf stalk) length, and its angle below horizontal, degrees. */
  petiole: number;
  petioleAngle: number;
  /** Blade angle relative to the petiole, degrees. */
  bladeAngle: number;
  /** Blade length from the notch to the tip. */
  size: number;
  /** Which of the three leaf greens it uses. */
  tone: 0 | 1 | 2;
  /** Signed amplitude of the rustle after a growth spurt, degrees. */
  sway: number;
  /** Rustle delay in ms, so the leaves don't move in unison. */
  delay: number;
}

export interface VineTendril {
  x: number;
  y: number;
  s: number;
  side: VineSide;
  /** Spiral path, relative to the node, x pointing away from the stem. */
  d: string;
}

export interface VineBerry {
  cx: number;
  cy: number;
  r: number;
}

export interface VineCluster {
  /** Stable name, so a harvested bunch stays harvested. */
  id: string;
  x: number;
  y: number;
  s: number;
  /**
   * The bunch's stalk, relative to the node, in two pieces: the stub nearest
   * the vine, which stays on the plant when the bunch is harvested (growers
   * cut a few centimetres out, so the stub can dry off and keep disease out
   * of the vine), and the rest, which goes with the bunch.
   */
  stub: string;
  stalk: string;
  berries: VineBerry[];
}

/** Where the plant grows, in CSS pixels from the top left of the page. */
export interface VineBox {
  /**
   * Width of a margin strip: the empty space beside the text column, less a
   * gap. The hanging stem and its foliage stay inside the far one.
   */
  width: number;
  /** Full width of the page: the run crosses all of it. */
  span: number;
  /**
   * Horizontal ranges, in page pixels, where something clickable sits just
   * above the ledge (the header's links). Leaves don't stand up there.
   */
  blocked: ReadonlyArray<readonly [number, number]>;
  /** Height the plant spans, from the top of the page. */
  height: number;
  /** Y of the horizontal line the plant creeps along before it hangs. */
  ledge: number;
  /**
   * How far the SVG moves up with the page before it sticks: the plant's
   * root starts this far below the bottom of the screen.
   */
  lift: number;
}

/**
 * A side shoot from a leaf axil: a thin young vine of its own that appears
 * some time into the visit and grows slowly on the clock, not with scrolling.
 */
export interface VineShoot {
  id: string;
  /**
   * What it grows from: the index of an earlier shoot (0 = the main shoot);
   * -1 for the main shoot itself, which grows out of the trunk.
   */
  parent: number;
  /** Arc position of its axil on the parent: it waits until that has grown. */
  s: number;
  line: VineLine;
  /** Its leaves; their `s` is the arc position along the shoot. */
  leaves: VineLeaf[];
  /**
   * Its bunches, low on the shoot opposite a leaf (`s` is the arc position
   * along the shoot). They ripen as the shoot grows on past them.
   */
  clusters: VineCluster[];
  /** Leaf indices that have a bunch opposite them instead of a tendril. */
  fruitAt: Set<number>;
  /** Tendrils reaching from the shoot to grab a nearby stem. */
  tendrils: VineGrip[];
  /**
   * Seconds into the visit before it starts, and how long its first spurt
   * takes, to `first` px. Left alone it keeps growing toward the full length
   * of its line, slowing as it goes (time constant `tau`, seconds): an uncut
   * side shoot becomes a major shoot of its own.
   */
  delay: number;
  duration: number;
  first: number;
  tau: number;
  /** Seconds after being broken off before the axil pushes out a new one. */
  regrow: number;
}

/**
 * A shoot's tendril: it reaches from the shoot to the nearest stem (the main
 * one or another shoot) and coils round it.
 */
export interface VineGrip {
  /** Arc position along its own shoot where it starts. */
  s: number;
  /** Path in plant coordinates: the reach, then a coil round the target. */
  d: string;
  /**
   * What it holds on to: the index of a shoot (0 = the main shoot), or -2:
   * nothing in reach, so it just curls up in the air.
   */
  target: number;
  /** Arc position on the target it grabs; it waits until that has grown. */
  targetS: number;
}

export interface Vine {
  width: number;
  height: number;
  span: number;
  /**
   * Which edge it climbs: 1 = the left edge (it runs right and hangs in the
   * right margin), -1 = the right edge. Everything in this object is laid
   * out for 1; for -1 the component mirrors the whole drawing.
   */
  dir: VineSide;
  /** The main shoot's centerline (also `shoots[0].line`). */
  line: VineLine;
  /**
   * Every stem on the plant, as one kind of thing. `shoots[0]` is the main
   * shoot: the scroll indicator, out of the trunk, grown by scrolling and
   * never broken off. The rest grow from axils on the clock. Parents always
   * come before their side shoots.
   */
  shoots: VineShoot[];
  /**
   * The old wood at the base: the stem is brown from the root up to arc
   * position `trunk`, fading to green over its upper part, between
   * `trunkFrom` (fully brown below) and `trunkTo` (green above) in y.
   */
  trunk: number;
  trunkFrom: number;
  trunkTo: number;
  /**
   * Old bark on the trunk, in plant coordinates: long vertical grooves, the
   * cracks between bark plates, and paler ridges. Clipped to the trunk.
   */
  bark: { grooves: string; cracks: string; ridges: string };
  /** Bud knobs on the side of the trunk, where water sprouts broke out. */
  knobs: Array<{ x: number; y: number; r: number; s: number }>;
  variety: VineVariety;
  /** Arc position of the tip on a first visit: just up from the bottom edge. */
  start: number;
  /**
   * Arc position where the hanging part begins. The shoot grows from `start`
   * to here on its own when a page opens; scrolling grows the rest.
   */
  sprout: number;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Full-grown stem width, as a share of the strip width. */
export const STEM_RATIO = 0.07;

/** Gap kept between any foliage and the edges of the strip. */
const EDGE = 3;
/** Stem that must follow a fruit cluster for it to ripen, in px. */
const FRUIT_RUNWAY = 340;

/*
 * The leaf blade, drawn once in a 100-unit box: the stalk attaches at the
 * origin and the tip of the middle lobe is at (100, 0).
 *
 * It follows the build ampelographers measure on a grapevine leaf: a midvein
 * (L1), two distal veins (L2) and two proximal veins (L3) fanning out from
 * the stalk at roughly 50 degree steps, each ending in a lobe, and a short
 * petiolar vein (L4) branching off each proximal vein. The vein lengths are
 * typical ratios to the midvein (L2 about 0.85, L3 about 0.6, L4 about 0.35),
 * so the leaf is about as broad as long and the lobes get smaller toward the
 * stalk. Behind the stalk the blade is cut back in an open V, the petiolar
 * sinus.
 *
 * The outline is `radius(angle)` around the stalk, with a tooth every
 * 9 degrees on top.
 */
const LOBE_STOPS: ReadonlyArray<readonly [angle: number, radius: number]> = [
  [0, 100], // middle lobe, at the tip of L1
  [27, 66], // upper lateral sinus
  [54, 85], // distal lobe (L2)
  [81, 52], // lower lateral sinus
  [108, 60], // proximal lobe (L3)
  [153, 35], // petiolar lobe (L4), where the petiolar sinus opens
];
const SINUS_ANGLE = LOBE_STOPS[LOBE_STOPS.length - 1][0];

function bladeRadius(angle: number): number {
  const a = Math.min(Math.abs(angle), SINUS_ANGLE);
  let i = 0;
  while (i < LOBE_STOPS.length - 2 && a > LOBE_STOPS[i + 1][0]) i++;
  const [a0, r0] = LOBE_STOPS[i];
  const [a1, r1] = LOBE_STOPS[i + 1];
  const t = (a - a0) / (a1 - a0);
  let r: number;
  if (i === LOBE_STOPS.length - 2) {
    // The edge runs straight back from the proximal lobe to the sinus.
    r = r0 + (r1 - r0) * t;
  } else if (i % 2 === 0) {
    // Tip → sinus: pointed at the tip, rounded in the sinus.
    r = r1 + (r0 - r1) * Math.pow(1 - t, 1.45);
  } else {
    r = r0 + (r1 - r0) * Math.pow(t, 1.45);
  }
  // Teeth: a point on every 9th degree, a notch halfway between.
  const tooth = Math.round(a / 4.5) % 2 === 0 ? 3.6 : -1.6;
  return r + (tooth * r) / 100;
}

function bladePoints(from: number, to: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let a = from; a <= to + 0.01; a += 4.5) {
    const r = bladeRadius(a);
    pts.push([r1(r * Math.cos(rad(a))), r1(r * Math.sin(rad(a)))]);
  }
  return pts;
}

/** Closed back to the stalk at the origin, which cuts the petiolar sinus. */
const toPath = (pts: Array<[number, number]>) =>
  "M0 0" + pts.map(([x, y]) => `L${x} ${y}`).join("") + "Z";

const BLADE_POINTS = bladePoints(-SINUS_ANGLE, SINUS_ANGLE);

/** Outline of the whole blade. */
export const LEAF_BLADE = toPath(BLADE_POINTS);
/** The half below the midrib, which is drawn a shade darker. */
export const LEAF_SHADE = toPath(bladePoints(0, SINUS_ANGLE));

const polar = (angle: number, d: number, off = 0): string =>
  `${r1(d * Math.cos(rad(angle)) - off * Math.sin(rad(angle)))} ` +
  `${r1(d * Math.sin(rad(angle)) + off * Math.cos(rad(angle)))}`;

/** L1, L2 and L3 from the stalk, each with a few side veins, and L4 off L3. */
export const LEAF_VEINS = [0, 54, -54, 108, -108]
  .map((angle) => {
    const reach = bladeRadius(angle) * 0.86;
    // Each vein bows slightly toward the tip of the leaf.
    const bow = angle === 0 ? 0 : Math.sign(angle) * -4;
    let d = `M${polar(angle, 2)}Q${polar(angle, reach * 0.5, bow)} ${polar(angle, reach)}`;
    for (const f of Math.abs(angle) > 90 ? [0.55] : [0.4, 0.66]) {
      const from = reach * f;
      const len = reach * (0.34 - f * 0.18);
      for (const dir of [1, -1]) {
        d += `M${polar(angle, from, bow * 0.8)}L${polar(angle, from + len * 0.8, dir * len)}`;
      }
    }
    if (Math.abs(angle) > 90) {
      const petiolar = Math.sign(angle) * SINUS_ANGLE;
      d += `M${polar(angle, reach * 0.2)}L${polar(petiolar, bladeRadius(petiolar) * 0.8)}`;
    }
    return d;
  })
  .join("");

interface Node {
  x: number;
  y: number;
  side: VineSide;
  /** Index of the node's sample in the line, filled in while sampling. */
  at: number;
  /** Carries a fruit cluster opposite its leaf. */
  fruit: boolean;
}

export function generateVine(seed: string, box: VineBox): Vine {
  const { width, height, span } = box;
  const base = hashSeed(seed);
  const rng = mulberry32(base);
  /*
   * Each node draws from its own stream, so node 5 looks the same whether the
   * viewport is tall enough for 9 nodes or 14.
   */
  const nodeRng = (i: number, salt: number) =>
    mulberry32(
      base ^ Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b),
    );

  // Its own stream, so the choice doesn't reshuffle the rest of the plant.
  const dir: VineSide = mulberry32(base ^ 0x5bd1e995)() < 0.5 ? 1 : -1;
  // Laid out climbing the left edge; mirror what was measured for -1.
  const blocked = box.blocked.map(([l, r]) =>
    dir > 0 ? [l, r] : [span - r, span - l],
  );

  const k = width / 100;
  /** The climbing stem, up the middle of the near margin strip. */
  const climbX = width / 2;
  /** The hanging part's strip, in the far margin. */
  const x0 = span - width;
  const cx = x0 + width / 2;

  const driftPhase = rng() * Math.PI * 2;
  const driftLength = 260 + rng() * 140;
  const drift = (y: number) =>
    Math.sin((y / driftLength) * Math.PI * 2 + driftPhase) * width * 0.035;
  const firstSide: VineSide = rng() < 0.5 ? 1 : -1;
  const bearsFruit = rng() < 0.85;
  // How freely this plant sets fruit, from its own stream so it doesn't
  // reshuffle the rest of the plant.
  const fruitiness = 0.14 + mulberry32(base ^ 0x27d4eb2f)() * 0.3;
  const varietyRoll = rng();
  const variety: VineVariety =
    varietyRoll < 0.5 ? "blue" : varietyRoll < 0.78 ? "red" : "white";

  // Up the edge, along the ledge to the right, then over and down.
  const ledgeY = box.ledge - 2;
  const bend = 0.16 * width;
  const runFrom = climbX + bend;
  const turn = 0.22 * width;
  const hangX = cx + drift(ledgeY + turn);
  // It creeps on past the hanging point, rolls over, and swings back to it.
  const roll = Math.max(10, 0.17 * width);
  const creepEnd = Math.min(span - EDGE - roll - 6, hangX + 0.42 * width);
  // The end of the run rolls over the edge, turning to head down and back.
  const ROLL_END = rad(38);
  const rollCx = creepEnd;
  const rollCy = ledgeY + roll;
  const rollX = rollCx + roll * Math.cos(ROLL_END);
  const rollY = rollCy + roll * Math.sin(ROLL_END);
  // A longer run falls further before it hangs straight.
  const hangY = rollY + turn + Math.max(0, rollX - hangX) * 0.9;
  // The tip stops just short of the bottom edge.
  const endY = height - 12 * k;

  /*
   * The trunk: the lower part of the climb is old wood, bare of leaves, fruit
   * and shoots; fully brown below `trunkFrom`, green again above `trunkTo`.
   */
  const climbTop = ledgeY + bend;
  const trunkTo = climbTop + (height - climbTop) * 0.45;
  const trunkFrom = trunkTo + (height - trunkTo) * 0.45;
  const trunkness = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - trunkTo) / (trunkFrom - trunkTo)));
    return t * t * (3 - 2 * t);
  };
  const gnarl = mulberry32(base ^ 0x4f1bbcdc);
  const gnarlPhase = [gnarl(), gnarl(), gnarl()].map((v) => v * Math.PI * 2);

  const xs: number[] = [];
  const ys: number[] = [];

  // --- Climb: from the root below the screen, up the near margin ----------
  const climbers: Array<{ at: number; x: number; y: number; side: VineSide }> =
    [];
  {
    const r = nodeRng(0, 7);
    const rootY = height + 12;
    const wobblePhase = r() * Math.PI * 2;
    let side: VineSide = r() < 0.5 ? 1 : -1;
    let next = rootY - 60 - r() * 30;
    for (let y = rootY; y > ledgeY + bend; y -= 4) {
      // It sways gently from side to side; the sway dies out at the bend.
      const fade = Math.min(1, (y - ledgeY - bend) / 60);
      // Old wood is gnarled: a twist with a shorter, rougher wobble on top.
      const old = trunkness(y);
      const x =
        climbX +
        Math.sin(y / 80 + wobblePhase) * 0.045 * width * fade +
        old *
          (Math.sin(y / 37 + gnarlPhase[0]) * 1.8 +
            Math.sin(y / 11 + gnarlPhase[1]) * 0.5);
      // No leaves on the trunk: they start where it turns green.
      if (y <= next && y > ledgeY + bend + 40 && y < trunkTo - 16) {
        climbers.push({ at: xs.length, x, y, side });
        side = -side as VineSide;
        next = y - (62 + r() * 26) * Math.pow(k, 0.6);
      }
      xs.push(x);
      ys.push(y);
    }
    // A quarter turn from heading up to heading right, just under the ledge.
    const steps = Math.ceil((bend * Math.PI) / 2 / 4);
    for (let j = 0; j < steps; j++) {
      const a = Math.PI + (j / steps) * (Math.PI / 2);
      xs.push(climbX + bend + bend * Math.cos(a));
      ys.push(ledgeY + bend + bend * Math.sin(a));
    }
  }

  // --- Creeping run along the ledge, with leaves standing up ----------------
  const creepers: Array<{ at: number; x: number }> = [];
  let fallFrom = 0;
  {
    const r = nodeRng(0, 5);
    let next = runFrom + 10 + r() * 14;
    for (let x = runFrom; x < creepEnd; x += 4) {
      if (x >= next && x < creepEnd - 14) {
        creepers.push({ at: xs.length, x });
        next = x + (50 + r() * 22) * Math.pow(k, 0.6);
      }
      xs.push(x);
      ys.push(ledgeY);
    }
    /*
     * The droop: the run rolls over its own end, falls slanting back toward
     * the strip, and straightens until it hangs vertically.
     */
    const rollSteps = Math.ceil(((Math.PI / 2 + ROLL_END) * roll) / 4);
    for (let j = 0; j < rollSteps; j++) {
      const a = -Math.PI / 2 + (j / rollSteps) * (Math.PI / 2 + ROLL_END);
      xs.push(rollCx + roll * Math.cos(a));
      ys.push(rollCy + roll * Math.sin(a));
    }
    const hx = -Math.sin(ROLL_END);
    const hy = Math.cos(ROLL_END);
    const dist = Math.hypot(rollX - hangX, hangY - rollY);
    const p0 = { x: rollX, y: rollY };
    const p1 = { x: rollX + hx * dist * 0.38, y: rollY + hy * dist * 0.38 };
    const p2 = { x: hangX, y: hangY - (hangY - rollY) * 0.42 };
    const p3 = { x: hangX, y: hangY };
    const steps = Math.ceil((dist * 1.2) / 4);
    fallFrom = xs.length;
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const u = 1 - t;
      xs.push(
        u * u * u * p0.x +
          3 * u * u * t * p1.x +
          3 * u * t * t * p2.x +
          t * t * t * p3.x,
      );
      ys.push(
        u * u * u * p0.y +
          3 * u * u * t * p1.y +
          3 * u * t * t * p2.y +
          t * t * t * p3.y,
      );
    }
  }

  const hangAt = xs.length;

  // --- Hanging nodes: the stem bends away at each one, leaf on the outside --
  const nodes: Node[] = [];
  let y = hangY + 26 + rng() * 14;
  let fruits = 0;
  let lastFruit = -9;
  for (let i = 0; y < endY - 44 * k; i++) {
    const r = nodeRng(i, 1);
    const side = (i % 2 === 0 ? firstSide : -firstSide) as VineSide;
    const amp = (0.035 + r() * 0.03) * width;
    const gap = (60 + r() * 24) * Math.pow(k, 0.6);
    /*
     * Fruit needs the tip to travel on for a while before it is ripe, so it
     * only sets where enough stem follows. A fruiting plant that has reached
     * the middle without a cluster gets one there.
     */
    const canFruit =
      bearsFruit &&
      i >= 1 &&
      i - lastFruit >= 2 &&
      fruits < 6 &&
      y <= endY - FRUIT_RUNWAY;
    const fruit =
      canFruit && (r() < fruitiness || (fruits === 0 && y > endY * 0.42));
    if (fruit) {
      fruits++;
      lastFruit = i;
    }
    nodes.push({ x: cx + side * amp + drift(y), y, side, at: 0, fruit });
    // The bunch hangs where the next leaf would be: give it a longer internode.
    y += gap + (fruit ? 0.3 * width : 0);
  }

  // --- Hanging stem: Catmull-Rom through the nodes, sampled every ~4px ------
  const lastSide = nodes.length ? nodes[nodes.length - 1].side : firstSide;
  const ctrl = [
    // Not drawn: it only makes the stem leave the turn heading straight down.
    { x: hangX, y: hangY - 40 },
    { x: hangX, y: hangY },
    ...nodes,
    {
      x: cx + drift(endY) - lastSide * width * 0.03,
      y: Math.max(endY, hangY + 30),
    },
  ];
  for (let i = 1; i < ctrl.length - 1; i++) {
    const p0 = ctrl[i - 1];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    if (i > 1) nodes[i - 2].at = xs.length;
    const steps = Math.max(
      2,
      Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 4),
    );
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      xs.push(
        0.5 *
          (2 * p1.x +
            (p2.x - p0.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
      );
      ys.push(
        0.5 *
          (2 * p1.y +
            (p2.y - p0.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3),
      );
    }
  }
  xs.push(ctrl[ctrl.length - 1].x);
  ys.push(ctrl[ctrl.length - 1].y);

  const count = xs.length;
  const ss: number[] = [0];
  for (let i = 1; i < count; i++) {
    ss.push(ss[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
  }
  const nx: number[] = [];
  const ny: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(count - 1, i + 1);
    const tx = xs[b] - xs[a];
    const ty = ys[b] - ys[a];
    const len = Math.hypot(tx, ty) || 1;
    nx.push(-ty / len);
    ny.push(tx / len);
  }
  const length = ss[count - 1];

  // The trunk flares out toward the root, and old wood is lumpy.
  const swell = ss.map(
    (d, i) =>
      (1 + 0.7 * Math.exp(-d / 220)) *
      (1 +
        trunkness(ys[i]) *
          (0.07 * Math.sin(d / 17 + gnarlPhase[2]) + 0.05 * Math.sin(d / 41))),
  );
  for (const at of [
    ...climbers.map((c) => c.at),
    ...creepers.map((c) => c.at),
    ...nodes.map((n) => n.at),
  ]) {
    for (let i = Math.max(0, at - 3); i <= Math.min(count - 1, at + 3); i++) {
      const d = (ss[i] - ss[at]) / 5;
      swell[i] = Math.max(swell[i], 1 + 0.22 * Math.exp(-d * d));
    }
  }

  // --- Organs ---------------------------------------------------------------
  const leaves: VineLeaf[] = [];
  const tendrils: VineTendril[] = [];
  const clusters: VineCluster[] = [];

  /*
   * Leaves on the creeping stem. Above the ledge they stand up into the
   * header band, wherever it has no links. In the two margins every other
   * leaf hangs down below the ledge instead; never over the text column,
   * where the page's own links start just under the header.
   *
   * Both are drawn in a frame rotated off the run and sized by the blade
   * outline: x points away from the stem (up or down), y along the run.
   */
  const inMargin = (x: number) => x < width - 6 || x > x0 + 6;
  creepers.forEach((c, i) => {
    const r = nodeRng(i, 6);
    const below = i % 2 === 1 && inMargin(c.x);
    if (!below && blocked.some(([l, rr]) => c.x > l - 6 && c.x < rr + 6))
      return;
    const petiole = (0.08 + r() * 0.04) * width;
    // Alternate leaves lean back and forward, so the row doesn't stand to attention.
    const tilt = i % 2 === 0 ? 1 : -1;
    const petioleAngle = tilt * (6 + r() * 20);
    const lean = petioleAngle + tilt * (4 + r() * 18);
    const cos = Math.cos(rad(lean));
    const sin = Math.sin(rad(lean));
    const out = petiole * Math.cos(rad(petioleAngle));
    const along = petiole * Math.sin(rad(petioleAngle));
    // Room along the run: the nearest link or margin edge on either side.
    let left: number;
    let right: number;
    if (below) {
      [left, right] = c.x < width ? [EDGE, width] : [x0, span - EDGE];
    } else {
      right = Math.min(
        span - EDGE,
        ...blocked.filter(([l]) => l >= c.x).map(([l]) => l - 6),
      );
      left = Math.max(
        EDGE,
        ...blocked.filter(([, rr]) => rr <= c.x).map(([, rr]) => rr + 6),
      );
    }
    // Rotated down instead of up, the frame's y points back along the run.
    const flip = below ? -1 : 1;
    let size = 0.3 * width * (0.66 + r() * 0.4);
    for (const [u, v] of BLADE_POINTS) {
      const bx = (u * cos - v * sin) / 100; // away from the stem, per unit of blade
      const by = ((u * sin + v * cos) / 100) * flip; // along the run, to the right
      const base = along * flip;
      if (bx > 0) size = Math.min(size, ((below ? 70 : ledgeY - 4) - out) / bx);
      if (by > 0) size = Math.min(size, (right - c.x - base) / by);
      if (by < 0) size = Math.min(size, (c.x + base - left) / -by);
    }
    if (size < 14) return;
    leaves.push({
      id: `c${i}`,
      x: c.x,
      y: ledgeY,
      s: ss[c.at],
      side: 1,
      rot: below ? 90 : -90,
      // Folded, a young leaf points along the shoot: to the right.
      bud: below ? -90 : 90,
      petiole,
      petioleAngle,
      bladeAngle: lean - petioleAngle,
      size,
      tone: Math.floor(r() * 3) as 0 | 1 | 2,
      sway: (r() < 0.5 ? -1 : 1) * (2.5 + r() * 3),
      delay: r() * 240,
    });
  });

  /** Room between a node and the edge of its strip on one side. */
  const roomOn = (node: Node, side: VineSide) =>
    side > 0 ? span - EDGE - node.x : node.x - x0;

  /** A leaf hanging off the stem, sized to fit `room` on its side. */
  const hangingLeaf = (
    id: string,
    x: number,
    y: number,
    s: number,
    side: VineSide,
    room: number,
    r: () => number,
    bud = 90,
  ): VineLeaf => {
    const petiole = (0.09 + r() * 0.04) * width;
    const petioleAngle = -10 + r() * 24;
    const droop = 32 + r() * 30;
    const wanted = 0.37 * width * (0.84 + r() * 0.26);
    const cos = Math.cos(rad(droop));
    const sin = Math.sin(rad(droop));
    // Furthest the blade reaches sideways, per unit of blade length.
    const reachOut = Math.max(
      ...BLADE_POINTS.map(([u, v]) => (u * cos - v * sin) / 100),
    );
    const fits = (room - 3 - petiole * Math.cos(rad(petioleAngle))) / reachOut;
    return {
      id,
      x,
      y,
      s,
      side,
      rot: 0,
      bud,
      petiole,
      petioleAngle,
      bladeAngle: droop - petioleAngle,
      size: Math.max(12, Math.min(wanted, fits)),
      tone: Math.floor(r() * 3) as 0 | 1 | 2,
      sway: (r() < 0.5 ? -1 : 1) * (2.5 + r() * 3),
      delay: r() * 240,
    };
  };

  /*
   * The climbing stem's leaves alternate sides and stay inside the near
   * strip. They point up when young, the way the shoot grew.
   */
  /*
   * Fruit on the climbing stem, opposite a leaf. A bunch hangs where the
   * leaf of the node below would be, so that leaf isn't grown. Only where it
   * is on screen at the top of a page, and has room in the strip.
   */
  const skipClimbLeaf = new Set<number>();
  const climbFruit = new Set<number>();
  let lastClimbFruit = -9;
  climbers.forEach((c, i) => {
    const r = nodeRng(i, 9);
    if (!bearsFruit || r() > fruitiness || i - lastClimbFruit < 2) return;
    if (c.y > height - box.lift - 110) return;
    const side = -c.side as VineSide;
    const room = side > 0 ? width - c.x : c.x - EDGE;
    if (room < 30) return;
    lastClimbFruit = i;
    climbFruit.add(i);
    skipClimbLeaf.add(i - 1);
    clusters.push({
      id: `gk${i}`,
      ...makeCluster(c, ss[c.at], side, room, width, r),
    });
  });

  climbers.forEach((c, i) => {
    if (skipClimbLeaf.has(i)) return;
    const room = c.side > 0 ? width - c.x : c.x - EDGE;
    leaves.push(
      hangingLeaf(
        `k${i}`,
        c.x,
        c.y,
        ss[c.at],
        c.side,
        room,
        nodeRng(i, 8),
        -90,
      ),
    );
    // Opposite the leaf, unless a bunch hangs there: a tendril at two nodes
    // out of three.
    if (climbFruit.has(i) || i % 3 === 2) return;
    const side = -c.side as VineSide;
    const tendrilRoom = side > 0 ? width - EDGE - c.x : c.x - EDGE;
    if (tendrilRoom < 12) return;
    tendrils.push({
      x: c.x,
      y: c.y,
      s: ss[c.at],
      side,
      d: tendrilPath(tendrilRoom, width, nodeRng(i, 11)),
    });
  });

  // The fall carries a leaf or two, so it isn't a bare wire.
  if (hangAt > fallFrom) {
    const fallLength = ss[hangAt - 1] - ss[fallFrom];
    const spots: Array<[number, VineSide]> =
      fallLength > 220
        ? [
            [0.4, 1],
            [0.78, -1],
          ]
        : fallLength > 100
          ? [[0.5, 1]]
          : [];
    spots.forEach(([f, side], j) => {
      const at = Math.round(fallFrom + (hangAt - 1 - fallFrom) * f);
      const x = xs[at];
      const room = side > 0 ? span - EDGE - x : x - x0;
      leaves.push(
        hangingLeaf(
          `f${j}`,
          x,
          ys[at],
          ss[at],
          side,
          room,
          nodeRng(100 + j, 2),
        ),
      );
      for (let i = Math.max(0, at - 3); i <= Math.min(count - 1, at + 3); i++) {
        const d = (ss[i] - ss[at]) / 5;
        swell[i] = Math.max(swell[i], 1 + 0.22 * Math.exp(-d * d));
      }
    });
  }

  // Sometimes a bunch on the fall, hanging off its outer side.
  if (hangAt > fallFrom && bearsFruit) {
    const r = nodeRng(0, 10);
    const at = Math.round(fallFrom + (hangAt - 1 - fallFrom) * 0.6);
    const x = xs[at];
    const room = span - EDGE - x;
    const fallLength = ss[hangAt - 1] - ss[fallFrom];
    if (fallLength > 80 && room >= 30 && r() < fruitiness * 1.5) {
      clusters.push({
        id: "gf0",
        ...makeCluster({ x, y: ys[at] }, ss[at], 1, room, width, r),
      });
    }
  }

  nodes.forEach((node, i) => {
    const s = ss[node.at];

    // Leaf: on the outside of the bend, drooping under its own weight.
    leaves.push(
      hangingLeaf(
        `h${i}`,
        node.x,
        node.y,
        s,
        node.side,
        roomOn(node, node.side),
        nodeRng(i, 2),
      ),
    );

    // Opposite the leaf: fruit, a tendril, or nothing.
    const o = nodeRng(i, 3);
    const roll = o();
    const side = -node.side as VineSide;
    const room = roomOn(node, side);
    if (node.fruit) {
      clusters.push({
        // Bunches have their own ids: `cut` holds leaves and bunches alike.
        id: `gh${i}`,
        ...makeCluster(node, s, side, room, width, o),
      });
    } else if (i % 3 !== 2 && roll >= 0) {
      // A tendril at two nodes out of three, as on a real vine.
      tendrils.push({
        x: node.x,
        y: node.y,
        s,
        side,
        d: tendrilPath(room, width, o),
      });
    }
  });

  /*
   * Side shoots. The main stem is the scroll indicator; everything else
   * grows on the clock, fast, and as much as it likes: left alone for a
   * while, the plant gets crowded, the way an unpruned vine does over a
   * summer.
   *
   * - A seeded few axils (a per-plant rate) sprout early, in the first
   *   ~2.5 minutes; nearly all the others follow over the next ~10.
   * - One or two water sprouts break out of the side of the trunk at once.
   * - Shoots branch: their own axils sprout a while after the shoot has
   *   grown past them.
   *
   * Every shoot leaves its axil at 10–85° toward its leaf, bends to grow
   * alongside its parent, and turns along the edges of its margin strip
   * rather than leaving it. A budget on shoots and leaves keeps a crowded
   * plant cheap to draw.
   */
  const shoots: VineShoot[] = [];
  const MAX_SHOOTS = 64;
  let leafBudget = 600;
  // Bunches are the heaviest thing to draw: a plant-wide cap on shoots.
  let bunchBudget = 14;
  const shootRng = mulberry32(base ^ 0x165667b1);
  const shootRate = 0.18 + shootRng() * 0.27;
  const mainLine: VineLine = { xs, ys, nx, ny, ss, swell, length };

  /** Half the full-grown stem width at sample `i`. */
  const halfWidth = (i: number) => (width * STEM_RATIO * swell[i]) / 2;

  interface Axil {
    id: string;
    /** The stem it sits on, the sample there, and the shoot's index (-1 = main). */
    line: VineLine;
    at: number;
    parent: number;
    depth: number;
    side: VineSide;
    lo: number;
    hi: number;
    up: boolean;
  }
  interface Bud {
    axil: Axil;
    r: () => number;
    delay: number;
    opts?: Partial<ShootOptions>;
  }
  interface ShootOptions {
    duration: number;
    first: number;
    length: number;
    /** Where it breaks out, if not on the stem's centerline. */
    origin: { x: number; y: number };
    /** Its angle off the stem, degrees, if not 10–85. */
    angle: number;
  }

  /** When a shoot reaches arc `d` along itself, in seconds into the visit. */
  const reachTime = (shoot: VineShoot, d: number) => {
    if (d <= shoot.first) {
      // The first spurt follows an ease-out cubic (see the painter).
      return (
        shoot.delay + shoot.duration * (1 - Math.cbrt(1 - d / shoot.first))
      );
    }
    const rest = Math.max(1, shoot.line.length - shoot.first);
    const f = Math.min(0.995, (d - shoot.first) / rest);
    return shoot.delay + shoot.duration - shoot.tau * Math.log(1 - f);
  };

  const buds: Bud[] = [];

  // Axils on the main stem: early ones by the plant's rate, then nearly all.
  const sproutBefore = length - 360;
  [
    ...climbers
      .map((c, i) => ({ c, i }))
      .filter(({ i }) => !skipClimbLeaf.has(i))
      .map(({ c, i }) => ({
        id: `k${i}`,
        at: c.at,
        side: c.side,
        lo: EDGE,
        hi: width - EDGE,
        up: true,
      })),
    ...nodes.map((node, i) => ({
      id: `h${i}`,
      at: node.at,
      side: node.side,
      lo: x0 + EDGE,
      hi: span - EDGE,
      up: false,
    })),
  ].forEach((a, n) => {
    if (ss[a.at] > sproutBefore) return;
    const r = mulberry32(base ^ Math.imul(n + 1, 0x2c1b3c6d) ^ 0x297a2d39);
    const early = r() < shootRate;
    const late = r() < 0.88;
    const when = r();
    if (!early && !late) return;
    buds.push({
      axil: { ...a, line: mainLine, parent: -1, depth: 0 },
      r,
      delay: early ? 5 + when * 140 : 150 + when * 520,
    });
  });

  /*
   * Water sprouts: one or two (seeded) early shoots from latent buds in the
   * old trunk. They break out of a bud knob on the side of the trunk, head
   * outward at first and turn upright, the way vigorous sprouts do.
   */
  const knobs: Array<{ x: number; y: number; r: number; s: number }> = [];
  {
    const r = mulberry32(base ^ 0x7feb352d);
    const visibleBottom = height - box.lift;
    const count = r() < 0.5 ? 1 : 2;
    let side: VineSide = r() < 0.5 ? 1 : -1;
    for (let j = 0; j < count; j++) {
      const y = Math.max(
        trunkTo + 20,
        visibleBottom - 40 - j * (46 + r() * 34) - r() * 20,
      );
      const at = ys.findIndex((yy) => yy <= y);
      if (at <= 0) continue;
      const hw = halfWidth(at);
      knobs.push({
        x: xs[at] + side * hw * 0.55,
        y: ys[at],
        r: hw * 0.5,
        s: ss[at],
      });
      const sr = mulberry32(base ^ Math.imul(j + 1, 0x7feb352d));
      buds.push({
        axil: {
          id: `b${j}`,
          line: mainLine,
          at,
          parent: -1,
          depth: 0,
          side,
          lo: EDGE,
          hi: width - EDGE,
          up: true,
        },
        r: sr,
        delay: 1.5 + j * (2 + sr() * 3),
        opts: {
          duration: 10 + sr() * 8,
          first: width * (0.9 + sr() * 0.7),
          length: width * (6 + sr() * 4),
          origin: { x: xs[at] + side * hw * 0.8, y: ys[at] },
          angle: 55 + sr() * 25,
        },
      });
      side = -side as VineSide;
    }
  }

  /*
   * Sprout in order of time: every axil on the main stem first (they are
   * what makes an unpruned vine crowded), then the shoots' own side shoots
   * with what the budget has left.
   */
  const branches: Bud[] = [];
  const sproutAll = (queue: Bud[], keep: number) => {
    queue.sort((a, b) => a.delay - b.delay);
    for (const bud of queue) {
      if (shoots.length >= MAX_SHOOTS || leafBudget <= keep) break;
      const shoot = makeShoot(bud);
      if (!shoot) continue;
      const index = shoots.length;
      shoots.push(shoot);
      leafBudget -= shoot.leaves.length;
      if (bud.axil.depth >= 1) continue;
      // Its own axils sprout a while after it has grown past them.
      shoot.leaves.forEach((leaf, j) => {
        const r = mulberry32(
          base ^
            Math.imul(index + 1, 0x5f356495) ^
            Math.imul(j + 1, 0x2545f491),
        );
        if (r() > 0.32) return;
        let at = 0;
        while (at < shoot.line.ss.length - 1 && shoot.line.ss[at] < leaf.s)
          at++;
        branches.push({
          axil: {
            ...bud.axil,
            id: `${shoot.id}${j}`,
            line: shoot.line,
            at,
            parent: index,
            depth: bud.axil.depth + 1,
            side: leaf.side,
          },
          r,
          delay: reachTime(shoot, leaf.s + 30) + 15 + r() * 120,
        });
      });
    }
  };
  // Main-stem shoots keep back a share of the budget for side shoots.
  sproutAll(buds, 200);
  sproutAll(branches, 0);

  function makeShoot({ axil, r, delay, opts }: Bud): VineShoot | null {
    const { line: from, at } = axil;
    // The parent's direction of growth at the axil.
    const tx = from.ny[at];
    const ty = -from.nx[at];
    // Turn toward the leaf's side by 10–85°.
    const theta = rad(opts?.angle ?? 10 + r() * 75);
    const turn = (sign: number) => {
      const c = Math.cos(theta * sign);
      const sn = Math.sin(theta * sign);
      return [tx * c - ty * sn, tx * sn + ty * c] as const;
    };
    const [ax, ay] = turn(1);
    const [bx, by] = turn(-1);
    let [hx, hy] = ax * axil.side > bx * axil.side ? [ax, ay] : [bx, by];

    // Its first spurt, and how far it can go if nobody cuts it.
    const first = opts?.first ?? width * (0.6 + r() * 0.7);
    const total =
      opts?.length ??
      (axil.depth === 0 ? width * (4 + r() * 6) : width * (1.5 + r() * 3));
    let x = opts?.origin?.x ?? from.xs[at];
    let y = opts?.origin?.y ?? from.ys[at];
    const sxs = [x];
    const sys = [y];
    const yMin = ledgeY + 26;
    const yMax = height - 16;
    const step = 3;
    /*
     * It grows along its parent: at every step it heads the way the parent
     * runs at the nearest point ahead, keeping a little way off to its own
     * side. It stops where it would leave its strip — so where the parent
     * turns onto the run across the page, or reaches an edge, the shoot ends
     * instead of circling about in a corner.
     */
    const P = from;
    const offset = 8 + r() * 10;
    const ownSide = axil.side;
    let pi = at;
    for (let len = 0; len < total; len += step) {
      // The nearest point on the parent, searching a little way ahead.
      let best = Infinity;
      for (let j = pi; j < Math.min(P.xs.length, pi + 24); j++) {
        const dd = (P.xs[j] - x) ** 2 + (P.ys[j] - y) ** 2;
        if (dd < best) {
          best = dd;
          pi = j;
        }
      }
      const ahead = Math.min(P.xs.length - 1, pi + 4);
      // Past the end of its parent it keeps on in the same direction.
      const atEnd = pi >= P.xs.length - 2;
      const px = atEnd ? hx : P.ny[ahead];
      const py = atEnd ? hy : -P.nx[ahead];
      hx += (px - hx) * 0.06 * step * (len < 18 ? 0.25 : 1);
      hy += (py - hy) * 0.06 * step * (len < 18 ? 0.25 : 1);
      // Keep its distance: away from the parent if too close, back if far.
      if (!atEnd && len > 12) {
        const gap = Math.sqrt(best);
        const nxs = P.nx[pi] * ownSide;
        const nys = P.ny[pi] * ownSide;
        // Which way is "its side" of the parent here (normal toward it).
        const toward =
          Math.sign((x - P.xs[pi]) * nxs + (y - P.ys[pi]) * nys) || 1;
        const push = Math.max(-0.08, Math.min(0.08, (offset - gap) * 0.02));
        hx += nxs * toward * push;
        hy += nys * toward * push;
      }
      const wander = (r() - 0.5) * 0.05;
      [hx, hy] = [
        hx * Math.cos(wander) - hy * Math.sin(wander),
        hx * Math.sin(wander) + hy * Math.cos(wander),
      ];
      const len2 = Math.hypot(hx, hy) || 1;
      hx /= len2;
      hy /= len2;
      const nextX = x + hx * step;
      const nextY = y + hy * step;
      if (
        nextX < axil.lo + 4 ||
        nextX > axil.hi - 4 ||
        nextY < yMin ||
        nextY > yMax
      )
        break;
      x = nextX;
      y = nextY;
      sxs.push(x);
      sys.push(y);
    }
    if (sxs.length < 12) return null;

    const line = toLine(sxs, sys);
    const shootLeaves: VineLeaf[] = [];
    let side = -axil.side as VineSide;
    for (
      let d = 16 + r() * 8;
      d < line.length - 10 && shootLeaves.length < Math.min(26, leafBudget);
      d += (26 + r() * 12) * Math.pow(k, 0.5)
    ) {
      let i = 0;
      while (i < line.ss.length - 1 && line.ss[i] < d) i++;
      const lx = line.xs[i];
      const room = side > 0 ? axil.hi - lx : lx - axil.lo;
      const leaf = hangingLeaf(
        `${axil.id}s${shootLeaves.length}`,
        lx,
        line.ys[i],
        line.ss[i],
        side,
        room,
        r,
        axil.up ? -90 : 90,
      );
      // Young growth near the base has small leaves; further out, as the
      // shoot grows into a major one, they get bigger.
      leaf.size *= Math.min(
        0.95,
        0.5 + 0.42 * Math.min(1, d / (2.5 * width)) + r() * 0.06,
      );
      leaf.petiole *= 0.6;
      // Then make sure it really fits beside the shoot: shoots can run close
      // to the edge of their strip.
      const pa = rad(leaf.petioleAngle);
      const ba = rad(leaf.petioleAngle + leaf.bladeAngle);
      const base = leaf.petiole * Math.cos(pa);
      const out = Math.max(
        ...BLADE_POINTS.map(
          ([u, v]) => (u * Math.cos(ba) - v * Math.sin(ba)) / 100,
        ),
      );
      const back = Math.min(
        0,
        ...BLADE_POINTS.map(
          ([u, v]) => (u * Math.cos(ba) - v * Math.sin(ba)) / 100,
        ),
      );
      const roomOut = (side > 0 ? axil.hi - lx : lx - axil.lo) - base;
      const roomBack = side > 0 ? lx - axil.lo : axil.hi - lx;
      leaf.size = Math.min(
        leaf.size,
        roomOut / out,
        back < 0 ? (roomBack + base) / -back : Infinity,
      );
      if (leaf.size >= 8) shootLeaves.push(leaf);
      side = -side as VineSide;
    }

    /*
     * Fruit: a fruitful shoot carries one or two bunches low down, around
     * its third to sixth node, opposite a leaf — where a tendril would be
     * otherwise (on a vine the two are the same organ). Water sprouts from
     * old wood are rarely fruitful; side shoots less so than main ones.
     */
    const shootClusters: VineCluster[] = [];
    const fruitAt = new Set<number>();
    if (bearsFruit) {
      const chance =
        Math.min(0.6, fruitiness * 1.6) *
        (axil.id.startsWith("b") ? 0.3 : axil.depth > 0 ? 0.6 : 1);
      for (let j = 2; j <= 5 && j < shootLeaves.length; j++) {
        if (shootClusters.length >= 2 || bunchBudget <= 0 || r() > chance)
          continue;
        const leaf = shootLeaves[j];
        const fside = -leaf.side as VineSide;
        const room = fside > 0 ? axil.hi - leaf.x : leaf.x - axil.lo;
        if (room < 26 || leaf.y > yMax - 80) continue;
        fruitAt.add(j);
        bunchBudget--;
        shootClusters.push({
          id: `g${axil.id}s${j}`,
          ...makeCluster(
            { x: leaf.x, y: leaf.y },
            leaf.s,
            fside,
            room,
            width,
            r,
          ),
        });
        j++; // never two neighbouring nodes
      }
    }

    return {
      id: `${axil.id}s`,
      parent: axil.parent,
      s: from.ss[at],
      line,
      leaves: shootLeaves,
      clusters: shootClusters,
      fruitAt,
      tendrils: [],
      delay,
      // Side shoots grow fast: much faster than the main stem.
      duration: opts?.duration ?? 8 + r() * 14,
      first: Math.min(first, line.length),
      tau: 40 + r() * 60,
      regrow: 20 + r() * 60,
    };
  }

  /*
   * Tendrils on the shoots. As on a real vine, a shoot carries one opposite
   * its leaf at two nodes out of every three. If a stem is in reach on that
   * side — the main stem or another shoot, not its own base — it reaches for
   * it and coils round; otherwise it curls up in the air.
   */
  shoots.forEach((shoot, si) => {
    const r = mulberry32(base ^ Math.imul(si + 1, 0x68e31da4) ^ 0x1b873593);
    const reachMax = 0.42 * width;
    const coil = Math.max(2.5, 0.035 * width);
    const lines: Array<{ target: number; line: VineLine; skip: number }> = [
      {
        target: -1,
        line: { xs, ys, nx, ny, ss, swell, length },
        skip: shoot.s,
      },
      ...shoots.map((other, oi) => ({
        target: oi,
        line: other.line,
        skip: -1,
      })),
    ];
    shoot.leaves.forEach((leaf, j) => {
      if (j % 3 === 2 || shoot.fruitAt.has(j)) return;
      const side = -leaf.side as VineSide;
      let best: {
        d: number;
        x: number;
        y: number;
        target: number;
        s: number;
      } | null = null;
      for (const { target, line: L, skip } of lines) {
        if (target === si) continue;
        for (let i = 0; i < L.xs.length; i += 2) {
          if (skip >= 0 && Math.abs(L.ss[i] - skip) < 50) continue;
          const dx = L.xs[i] - leaf.x;
          const dy = L.ys[i] - leaf.y;
          if (dx * side < 6) continue;
          const dist = Math.hypot(dx, dy);
          if (dist < 12 || dist > reachMax) continue;
          // Not round a stem so near its strip's edge that the coil spills over.
          const [slo, shi] = L.xs[i] < span / 2 ? [0, width] : [x0, span];
          if (L.xs[i] < slo + coil + 4 || L.xs[i] > shi - coil - 4) continue;
          if (!best || dist < best.d)
            best = { d: dist, x: L.xs[i], y: L.ys[i], target, s: L.ss[i] };
        }
      }
      if (!best) {
        // Nothing to hold: a free curl, like the main vine's.
        const [lo, hi] =
          leaf.x < span / 2 ? [EDGE, width - EDGE] : [x0 + EDGE, span - EDGE];
        const room = side > 0 ? hi - leaf.x : leaf.x - lo;
        if (room < 10) return;
        const curl = tendrilPath(room, width * 0.75, r).replace(
          /([ML])(-?[\d.]+) (-?[\d.]+)/g,
          (_, cmd, px, py) =>
            `${cmd}${r1(leaf.x + side * Number(px))} ${r1(leaf.y + Number(py))}`,
        );
        shoot.tendrils.push({ s: leaf.s, d: curl, target: -2, targetS: 0 });
        return;
      }
      // A curved reach, then one and a half turns round the stem it found.
      const mx = (leaf.x + best.x) / 2;
      const my = (leaf.y + best.y) / 2 - best.d * (0.15 + r() * 0.2);
      let d = `M${r1(leaf.x)} ${r1(leaf.y)}Q${r1(mx)} ${r1(my)} ${r1(best.x)} ${r1(best.y)}`;
      const start = Math.atan2(best.y - my, best.x - mx) + Math.PI / 2;
      for (let t = 0; t <= 1; t += 1 / 18) {
        const a = start + side * t * Math.PI * 3;
        const rr = coil * (1 - 0.35 * t);
        d += `L${r1(best.x + Math.cos(a) * rr)} ${r1(best.y + Math.sin(a) * rr)}`;
      }
      shoot.tendrils.push({
        s: leaf.s,
        d,
        target: best.target,
        targetS: best.s,
      });
    });
  });

  // Where the brown stops, along the stem.
  let trunkAt = 0;
  while (trunkAt < count - 1 && ys[trunkAt] > trunkTo) trunkAt++;
  const trunk = ss[trunkAt];

  /*
   * Old bark: vine bark is fibrous and comes away in long vertical strips,
   * so the trunk gets long, broken grooves running along it, short cracks
   * across between them where plates have split, and paler ridges between.
   * Offsets are shares of the full-grown half width; the component clips
   * all of it to the trunk as it is now.
   */
  const bark = { grooves: "", cracks: "", ridges: "" };
  {
    const r = mulberry32(base ^ 0x3c6ef372);
    const along = (offset: number, i: number) => {
      const h = halfWidth(i) * offset;
      return `${r1(xs[i] + nx[i] * h)} ${r1(ys[i] + ny[i] * h)}`;
    };
    const strand = (
      offset: number,
      minLen: number,
      maxLen: number,
      gap: number,
    ) => {
      let d = "";
      let i = 0;
      const phase = r() * Math.PI * 2;
      while (i < trunkAt) {
        const len = Math.round((minLen + r() * (maxLen - minLen)) / 4);
        const end = Math.min(trunkAt, i + len);
        d += `M${along(offset + 0.06 * Math.sin(ss[i] / 31 + phase), i)}`;
        for (let j = i + 1; j <= end; j++) {
          d += `L${along(offset + 0.06 * Math.sin(ss[j] / 31 + phase), j)}`;
        }
        i = end + Math.max(1, Math.round((gap * (0.5 + r())) / 4));
      }
      return d;
    };
    for (const offset of [-0.74, -0.4, -0.06, 0.28, 0.62]) {
      bark.grooves += strand(offset + (r() - 0.5) * 0.08, 18, 64, 8);
    }
    for (const offset of [-0.57, -0.23, 0.45]) {
      bark.ridges += strand(offset, 10, 34, 16);
    }
    for (
      let i = 4;
      i < trunkAt;
      i += Math.max(4, Math.round((22 + r() * 22) / 4))
    ) {
      const a = -0.74 + Math.floor(r() * 4) * 0.34;
      bark.cracks += `M${along(a, i)}L${along(a + 0.34, Math.min(trunkAt, i + 1))}`;
    }
  }

  // On a first visit the shoot pokes up from the bottom edge of the screen.
  const visibleBottom = height - box.lift;
  let first = 0;
  while (first < count - 1 && ys[first] > visibleBottom - 14) first++;
  const start = ss[first];
  const sprout = Math.min(length, ss[Math.min(hangAt, count - 1)] + 30);

  /*
   * The main shoot joins the others as `shoots[0]`, so every stem is drawn
   * and grown by the same code; only the main one's growth comes from the
   * scroll position. Indices move up by one to make room for it, and the
   * main stem's tendrils take the same form as the shoots'.
   */
  const main: VineShoot = {
    id: "main",
    parent: -1,
    s: 0,
    line: mainLine,
    leaves,
    clusters,
    fruitAt: new Set(),
    tendrils: tendrils.map((t) => ({
      s: t.s,
      d: t.d.replace(
        /([ML])(-?[\d.]+) (-?[\d.]+)/g,
        (_, cmd, px, py) =>
          `${cmd}${r1(t.x + t.side * Number(px))} ${r1(t.y + Number(py))}`,
      ),
      target: -2,
      targetS: 0,
    })),
    delay: 0,
    duration: 1,
    first: length,
    tau: 1,
    regrow: 0,
  };
  const allShoots = [
    main,
    ...shoots.map((shoot) => ({
      ...shoot,
      parent: shoot.parent + 1,
      tendrils: shoot.tendrils.map((t) => ({
        ...t,
        target: t.target === -2 ? -2 : t.target + 1,
      })),
    })),
  ];

  return {
    width,
    height,
    span,
    dir,
    line: mainLine,
    shoots: allShoots,
    trunk,
    trunkFrom,
    trunkTo,
    bark,
    knobs,
    variety,
    start,
    sprout,
  };
}

/**
 * A tendril as an Euler spiral: nearly straight where it leaves the stem, then
 * curling tighter and tighter. Drawn with x pointing away from the stem.
 */
function tendrilPath(room: number, width: number, rng: () => number): string {
  const k = width / 100;
  const total = (0.5 + rng() * 0.28) * width;
  const curl = rng() < 0.62 ? 1 : -1;
  let heading = rad(curl > 0 ? -(22 + rng() * 30) : 8 + rng() * 24);
  const tight = 0.5 + rng() * 0.2;

  const pts: Array<[number, number]> = [[0, 0]];
  let x = 0;
  let y = 0;
  let maxX = 0;
  const step = 1.5;
  for (let s = 0; s < total; s += step) {
    const u = s / total;
    heading += ((curl * (0.006 + tight * u * u * u)) / k) * step;
    x += Math.cos(heading) * step;
    y += Math.sin(heading) * step;
    maxX = Math.max(maxX, x);
    pts.push([x, y]);
  }
  const fit = Math.min(1, (room - 2) / Math.max(1, maxX));
  return pts
    .map(([px, py], i) => `${i ? "L" : "M"}${r1(px * fit)} ${r1(py * fit)}`)
    .join("");
}

/** A hanging bunch: rows of berries narrowing to a point. */
function makeCluster(
  node: { x: number; y: number },
  s: number,
  side: VineSide,
  room: number,
  width: number,
  rng: () => number,
): Omit<VineCluster, "id"> {
  const shapes = [
    [2, 3, 3, 3, 2, 1],
    [3, 3, 3, 2, 2, 1],
    [2, 3, 3, 2, 1],
    [2, 3, 3, 3, 2, 2, 1],
  ];
  const rows = shapes[Math.floor(rng() * shapes.length)];
  // The widest row is three berries: keep it clear of the stem and the edge.
  const r = Math.min((0.055 + rng() * 0.008) * width, (room - 6) / 6.2);
  const out = Math.min((0.27 + rng() * 0.04) * width, room - 2 - 2.75 * r);
  const drop = (0.1 + rng() * 0.04) * width;
  const ox = side * out;

  const berries: VineBerry[] = [];
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      berries.push({
        cx: r1(ox + (i - (n - 1) / 2) * r * 1.72 + (rng() - 0.5) * r * 0.3),
        cy: r1(drop + r * 0.9 + row * r * 1.5 + (rng() - 0.5) * r * 0.3),
        r: r1(r * (0.9 + rng() * 0.2)),
      });
    }
  });

  /*
   * The stalk is one quadratic curve, split where a grower would cut: about
   * a third of the way out, which on a real vine is the few centimetres
   * they leave on.
   */
  const p1 = { x: ox * 0.95, y: -width * 0.03 };
  const p2 = { x: ox, y: drop };
  const t = 0.36;
  const q0 = { x: p1.x * t, y: p1.y * t };
  const q1 = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
  const cut = { x: q0.x + (q1.x - q0.x) * t, y: q0.y + (q1.y - q0.y) * t };
  return {
    x: node.x,
    y: node.y,
    s,
    stub: `M0 0Q${r1(q0.x)} ${r1(q0.y)} ${r1(cut.x)} ${r1(cut.y)}`,
    stalk: `M${r1(cut.x)} ${r1(cut.y)}Q${r1(q1.x)} ${r1(q1.y)} ${r1(p2.x)} ${r1(p2.y)}`,
    berries,
  };
}

/** Arc lengths and normals for a sampled centerline. */
function toLine(xs: number[], ys: number[]): VineLine {
  const count = xs.length;
  const ss = [0];
  for (let i = 1; i < count; i++) {
    ss.push(ss[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
  }
  const nx: number[] = [];
  const ny: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(count - 1, i + 1);
    const len = Math.hypot(xs[b] - xs[a], ys[b] - ys[a]) || 1;
    nx.push(-(ys[b] - ys[a]) / len);
    ny.push((xs[b] - xs[a]) / len);
  }
  return {
    xs,
    ys,
    nx,
    ny,
    ss,
    swell: new Array<number>(count).fill(1),
    length: ss[count - 1],
  };
}

/** Point and heading (degrees) on the stem at arc position `s`. */
export function pointAt(line: VineLine, s: number) {
  const { xs, ys, ss } = line;
  const last = ss.length - 1;
  const target = clamp(s, 0, line.length);
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ss[mid] <= target) lo = mid;
    else hi = mid;
  }
  const span = ss[hi] - ss[lo] || 1;
  const t = (target - ss[lo]) / span;
  return {
    index: lo,
    t,
    x: xs[lo] + (xs[hi] - xs[lo]) * t,
    y: ys[lo] + (ys[hi] - ys[lo]) * t,
    angle: (Math.atan2(ys[hi] - ys[lo], xs[hi] - xs[lo]) * 180) / Math.PI,
  };
}

/**
 * Outline of the stem from the top down to arc position `tip`, as a closed
 * path. The stem is as thin as a shoot at the tip and thickens with age, so
 * the top of the plant keeps getting sturdier while the tip keeps growing.
 */
export function stemOutline(
  line: VineLine,
  tip: number,
  maxWidth: number,
  /** Draw only up to here (widths still follow `tip`): for the trunk overlay. */
  until = tip,
) {
  const { xs, ys, nx, ny, ss, swell, length } = line;
  const end = pointAt(line, Math.min(tip, until));
  const span = length * 0.85;
  const half = (i: number) => {
    const age = clamp((tip - ss[i]) / span, 0, 1);
    return ((1.3 + (maxWidth - 1.3) * Math.pow(age, 0.72)) * swell[i]) / 2;
  };

  let left = "";
  let right = "";
  for (let i = 0; i <= end.index; i++) {
    const h = half(i);
    left += `${i ? "L" : "M"}${r1(xs[i] + nx[i] * h)} ${r1(ys[i] + ny[i] * h)}`;
    right = `L${r1(xs[i] - nx[i] * h)} ${r1(ys[i] - ny[i] * h)}` + right;
  }
  return `${left}L${r1(end.x)} ${r1(end.y)}${right}Z`;
}
