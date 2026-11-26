"use client";

import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  marginStripWidth,
  readOrCreateSeed,
} from "@andi1984/scroll-effects-core";
import type {
  EffectPreference,
  MarginLayout,
} from "@andi1984/scroll-effects-core";
import type {
  Vine as VineData,
  VineBox,
  VineCluster,
  VineLeaf,
  VineShoot,
} from "./generate";
import { vinePreference } from "./preference";
import {
  generateVine,
  LEAF_BLADE,
  LEAF_SHADE,
  LEAF_VEINS,
  pointAt,
  STEM_RATIO,
  stemOutline,
} from "./generate";

/**
 * The scroll-progress vine.
 *
 * A seeded, procedurally generated grapevine (generate.ts), trained like
 * a pergola: rooted below the bottom left corner of the screen, it climbs
 * the left edge, runs right along the rule under the site header, then
 * droops over and hangs down the left margin. It is drawn once as an SVG; scrolling
 * only moves a single number, the arc position of the growing tip, and
 * everything else follows from how long ago the tip passed each organ:
 *
 * - the stem is thin as a shoot at the tip and thickens with age;
 * - a leaf emerges folded and pale just behind the tip, then opens, droops
 *   into place and darkens over the next few internodes;
 * - tendrils extend and coil, fruit sets green and ripens further up the
 *   plant while the tip keeps growing, so the grapes are ripe at the bottom
 *   of the page.
 *
 * Behavior carried over from the first version:
 *
 * - Seed: generated once, stored in localStorage (`vine-seed`), so a visitor
 *   keeps their plant. `?vine-seed=…` forces a seed (and stores it); the seed
 *   is exposed as `data-seed`.
 * - On the first page of a visit the shoot climbs up from the bottom left
 *   corner, runs right under the header and droops over on its own (~3s);
 *   scrolling then grows the hanging part.
 * - Growth is one-way — plants don't shrink — and it is remembered for the
 *   visit (sessionStorage): navigating or reloading keeps the plant as it is,
 *   pruned leaves and harvested bunches included. It only grows further when
 *   a page is read further than any page before. A page too short to scroll grows the whole
 *   plant.
 * - Side shoots: one or two from the trunk early on, and some leaf axils
 *   (seeded) sprout a young shoot partway into the visit, each on its own
 *   clock, growing slowly alongside the stem. Hovering one breaks it off by
 *   hand, the way growers remove side shoots ("ausgeizen").
 * - Easter egg: hovering a leaf prunes it, hovering a ripe bunch harvests it
 *   (attachPruning).
 * - A11Y: decorative (`aria-hidden`; only leaves, berries and shoots take
 *   pointer events, and they sit in the empty margins). It isn't shown at
 *   all — nothing rendered, nothing running — under any setting asking for
 *   a calmer page (`preference.quietQuery`), or when the visitor has
 *   switched it off (`preference.setHidden`, e.g. from a footer button).
 * - Space: only rendered where the margins can hold it (`preference.spaceQuery`).
 * - The header scrolls away and the plant is fixed, so for the first stretch
 *   of scrolling the SVG moves up with the page (`--vine-lift`, a scroll
 *   timeline in globals.css) until the creeping part has left with the
 *   header; from then on only the hanging stem is on screen.
 *
 * Growth is driven from JS rather than a CSS scroll timeline because it is
 * one-way and eased, and because each organ ages on its own clock; the scroll
 * handler writes straight to the DOM, so React never re-renders on scroll.
 *
 * Renders null until mounted so server and client markup agree.
 */
const SEED_KEY = "vine-seed";

/** Tip travel, in px, over which a new leaf reaches full size. */
const LEAF_SPAN = 230;
/** Growth can't outrun the plant: at most this much progress per second. */
const MAX_SPEED = 0.55;

/*
 * The plant is remembered for the visit (sessionStorage): how far it has
 * grown and what has been pruned or harvested. Navigating or reloading keeps
 * it as it was; a new visit grows a new one from the bottom edge.
 */
const STATE_KEY = "vine-state";

interface Growth {
  seed: string;
  /** The first-visit climb along the edge and header, 0 → 1. */
  intro: number;
  /** The furthest anyone has read on any page this visit, 0 → 1. */
  shown: number;
  target: number;
  /** Ids of pruned leaves and harvested bunches. */
  cut: Set<string>;
  /**
   * Side shoots broken off, by id, with when (seconds into the visit). The
   * axil pushes out a new shoot some time later (`VineShoot.regrow`).
   */
  shootCuts: Record<string, number>;
  /** When the visit started (epoch ms): the side shoots' clock. */
  born: number;
  /** When the current page was entered, for the scroll latch. */
  since: number;
  path: string;
}

function loadGrowth(seed: string): Growth {
  const fresh: Growth = {
    seed,
    intro: 0,
    shown: 0,
    target: 0,
    cut: new Set(),
    shootCuts: {},
    born: Date.now(),
    since: performance.now(),
    path: "",
  };
  try {
    const saved = JSON.parse(sessionStorage.getItem(STATE_KEY) ?? "null");
    if (!saved || saved.seed !== seed) return fresh;
    const growth = clamp01(Number(saved.growth) || 0);
    return {
      ...fresh,
      intro: clamp01(Number(saved.intro) || 0),
      shown: growth,
      target: growth,
      cut: new Set(Array.isArray(saved.cut) ? saved.cut.map(String) : []),
      born: Number(saved.born) || Date.now(),
      shootCuts:
        saved.shootCuts && typeof saved.shootCuts === "object"
          ? Object.fromEntries(
              Object.entries(saved.shootCuts).map(([k, v]) => [
                k,
                Number(v) || 0,
              ]),
            )
          : {},
    };
  } catch {
    return fresh;
  }
}

function saveGrowth(state: Growth) {
  try {
    sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        seed: state.seed,
        intro: Math.round(state.intro * 1000) / 1000,
        growth: Math.round(state.target * 1000) / 1000,
        cut: [...state.cut],
        born: state.born,
        shootCuts: state.shootCuts,
      }),
    );
  } catch {
    /* storage unavailable — the plant just isn't remembered */
  }
}

interface Box extends VineBox {
  /** How far the SVG travels up with the page before it sticks. */
  lift: number;
}

/**
 * Where the plant goes. Each margin strip is the space beside the text
 * column less a 22px gap; the run crosses the whole page along the header's
 * bottom rule, and its leaves keep clear of the header's links.
 */
function measureBox(
  ledgeSelector: string,
  layout: Partial<MarginLayout> | undefined,
): Box {
  const span = document.documentElement.clientWidth;
  const width = marginStripWidth(span, layout);
  const header = ledgeSelector ? document.querySelector(ledgeSelector) : null;
  // Without a header there is no ledge: start the plant above the page.
  const ledge = header
    ? Math.round(header.getBoundingClientRect().bottom + window.scrollY) - 0.5
    : -24;
  const blocked = header
    ? Array.from(header.querySelectorAll("a, button"), (el) => {
        const rect = el.getBoundingClientRect();
        return [Math.round(rect.left), Math.round(rect.right)] as const;
      }).filter(([l, r]) => r > l)
    : [];
  const lift = Math.max(0, ledge + 10);
  return {
    width,
    span,
    height: window.innerHeight + lift,
    ledge,
    blocked,
    lift,
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Ease-out with a slight overshoot, for things that pop open. */
const spring = (t: number) =>
  1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A bunch's stalk: the stub that stays when it's harvested, and the rest. */
function BunchStalk({ c }: { c: VineCluster }) {
  const at = `translate(${r2(c.x)} ${r2(c.y)})`;
  return (
    <>
      <path
        className="vine-stalk vine-stub"
        data-stub={c.id}
        transform={at}
        d={c.stub}
        pathLength={1}
      />
      <path
        className="vine-stalk"
        data-stalk=""
        data-id={c.id}
        transform={at}
        d={c.stalk}
        pathLength={1}
      />
    </>
  );
}

/** A bunch's berries. */
function BunchFruit({ c }: { c: VineCluster }) {
  return (
    <g
      className="vine-cluster"
      data-cluster=""
      data-id={c.id}
      transform={`translate(${r2(c.x)} ${r2(c.y)})`}
    >
      {c.berries.map((b, j) => (
        <g key={j} transform={`translate(${b.cx} ${b.cy})`}>
          <g data-berry="">
            <circle className="vine-berry" r={b.r} />
            <circle
              className="vine-berry-shine"
              cx={r2(-b.r * 0.32)}
              cy={r2(-b.r * 0.36)}
              r={r2(b.r * 0.3)}
            />
          </g>
        </g>
      ))}
    </g>
  );
}

/**
 * One leaf: stalk and blade, in the frame its data describes. Painted by
 * `paintLeaf`; `data-shoot` marks the ones on side shoots, which have their
 * own clock.
 */
function Leaf({ leaf: l }: { leaf: VineLeaf }) {
  return (
    <g
      transform={`translate(${r2(l.x)} ${r2(l.y)}) rotate(${l.rot}) scale(${l.side} 1)`}
    >
      <g
        className={`vine-leaf vine-leaf--${l.tone}`}
        data-leaf=""
        data-id={l.id}
      >
        <path
          className="vine-petiole"
          d={`M0 0Q${r2(l.petiole * 0.5)} ${r2(-l.petiole * 0.2)} ${r2(l.petiole)} 0`}
        />
        <g
          transform={`translate(${r2(l.petiole)} 0) rotate(${r2(l.bladeAngle)})`}
        >
          <g data-blade="">
            <g
              className="vine-sway"
              style={
                {
                  "--sway": `${r2(l.sway)}deg`,
                  animationDelay: `${Math.round(l.delay)}ms`,
                } as CSSProperties
              }
            >
              <g transform={`scale(${r2(l.size / 100)})`}>
                <path className="vine-blade" d={LEAF_BLADE} />
                <path className="vine-blade-shade" d={LEAF_SHADE} />
                <path className="vine-vein" d={LEAF_VEINS} />
                <path className="vine-blade-edge" d={LEAF_BLADE} />
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

/** The growing tip of a shoot: a bud of two clasped leaflets. */
const BUD = (
  <>
    <path
      className="vine-bud-back"
      d="M1 0C3 -5 7 -6.5 9.5 -6C8.5 -3 5 -0.6 1 0Z"
    />
    <path className="vine-bud" d="M0 0C2 -3.4 8 -3.2 11.5 0C8 3.2 2 3.4 0 0Z" />
  </>
);

/**
 * One shoot — the main one or any side shoot, drawn the same way: tendrils,
 * bunch stalks, the stem, then leaves, bunches and the bud at its tip. The
 * painter shows how far it has grown. `children` goes right over the stem
 * (the main shoot's old wood). Side shoots get a wider invisible line along
 * the stem, so they can be grabbed and broken off.
 */
function Shoot({
  shoot,
  index,
  children,
}: {
  shoot: VineShoot;
  index: number;
  children?: ReactNode;
}) {
  return (
    <g data-shoot={shoot.id} data-index={index} data-parent={shoot.parent}>
      {shoot.tendrils.map((t, j) => (
        <path
          key={j}
          className="vine-tendril"
          data-grip=""
          d={t.d}
          pathLength={1}
        />
      ))}
      {shoot.clusters.map((c) => (
        <BunchStalk key={c.id} c={c} />
      ))}
      <path className="vine-stem" data-shoot-stem="" />
      {children}
      {index > 0 && <path className="vine-shoot-hit" data-shoot-hit="" />}
      {shoot.leaves.map((l) => (
        <Leaf key={l.id} leaf={l} />
      ))}
      {shoot.clusters.map((c) => (
        <BunchFruit key={c.id} c={c} />
      ))}
      <g data-shoot-tip="">{BUD}</g>
    </g>
  );
}

/**
 * The whole plant, fully grown. Memoized on the vine data: the painter below
 * mutates transforms on these nodes directly, and React has no reason to
 * touch them again until the seed or the strip size changes.
 */
const VinePlant = memo(function VinePlant({ vine }: { vine: VineData }) {
  const barkClip = useId();
  const barkFade = useId();
  const barkFadeGradient = useId();
  // The plant is laid out climbing the left edge; mirrored, it climbs the right.
  const mirror =
    vine.dir < 0 ? `translate(${vine.span} 0) scale(-1 1)` : undefined;
  return (
    <>
      <g transform={mirror}>
        <defs>
          {/* Trunk and bark: fading out upward; bark clipped to the trunk. */}
          <clipPath id={barkClip}>
            <path data-trunk-clip="" />
          </clipPath>
          <linearGradient
            id={barkFadeGradient}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={r2(vine.trunkFrom)}
            x2="0"
            y2={r2(vine.trunkTo)}
          >
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={barkFade} maskUnits="userSpaceOnUse">
            <rect
              x="0"
              y="0"
              width={vine.span}
              height={vine.height + 40}
              fill={`url(#${barkFadeGradient})`}
            />
          </mask>
        </defs>

        {vine.shoots.map((shoot, i) => (
          <Shoot key={shoot.id} shoot={shoot} index={i}>
            {i === 0 && (
              <>
                {/* Old wood at the root, fading out where it turns green. */}
                <path
                  className="vine-trunk"
                  data-trunk=""
                  mask={`url(#${barkFade})`}
                />
                <g clipPath={`url(#${barkClip})`} mask={`url(#${barkFade})`}>
                  <path className="vine-bark-ridge" d={vine.bark.ridges} />
                  <path className="vine-bark-groove" d={vine.bark.grooves} />
                  <path className="vine-bark-crack" d={vine.bark.cracks} />
                </g>
                {vine.knobs.map((knob, j) => (
                  <g
                    key={`knob-${j}`}
                    data-knob=""
                    transform={`translate(${r2(knob.x)} ${r2(knob.y)})`}
                  >
                    <ellipse
                      className="vine-knob"
                      rx={r2(knob.r)}
                      ry={r2(knob.r * 1.25)}
                    />
                    <ellipse
                      className="vine-knob-scar"
                      rx={r2(knob.r * 0.45)}
                      ry={r2(knob.r * 0.55)}
                    />
                  </g>
                ))}
              </>
            )}
          </Shoot>
        ))}

        {/* Pruned leaves and harvested bunches fall here (see attachPruning). */}
        <g className="vine-fallen" data-fallen="" />
      </g>
      {/* Splashes are placed from screen coordinates, so they aren't mirrored. */}
      <g className="vine-fallen" data-splash="" />
    </>
  );
});

/**
 * Binds the rendered SVG to the vine data and returns
 * `paint(intro, g, seconds)`, which shows every shoot at its current reach:
 * the main one from `intro` (its first climb when a visit starts) and `g`
 * (scroll progress), the others from `seconds` into the visit. It returns
 * whether any side shoot is still growing. Each call only writes what
 * changed.
 */
function createPainter(
  svg: SVGSVGElement,
  vine: VineData,
  growth: Pick<Growth, "cut" | "shootCuts">,
) {
  const { line } = vine;
  const { cut } = growth;
  const q = <T extends Element>(sel: string, root: ParentNode = svg) =>
    root.querySelector<T>(sel);
  const trunk = q<SVGPathElement>("[data-trunk]");
  const trunkClip = q<SVGPathElement>("[data-trunk-clip]");
  const knobs = Array.from(svg.querySelectorAll<SVGGElement>("[data-knob]"));
  const stemWidth = vine.width * STEM_RATIO;
  /** Stems thicken as they grow long; the main one is full width early on. */
  const widthFor = (reach: number) =>
    stemWidth * (0.42 + 0.58 * clamp01(reach / (6 * vine.width)));

  // Whatever was pruned or harvested earlier in the visit stays gone; a
  // harvested bunch leaves its dried stub behind.
  svg.querySelectorAll<SVGElement>("[data-id]").forEach((el) => {
    el.classList.toggle("is-cut", cut.has(el.dataset.id ?? ""));
  });
  svg.querySelectorAll<SVGElement>("[data-stub]").forEach((el) => {
    el.classList.toggle("is-harvested", cut.has(el.dataset.stub ?? ""));
  });

  // Last value written per element, so untouched ones cost one comparison.
  const seen = new Map<Element, number>();
  const changed = (el: Element, v: number) => {
    const n = Math.round(v * 500);
    if (seen.get(el) === n) return false;
    seen.set(el, n);
    return true;
  };

  const leafView = (el: SVGGElement | null) => ({
    el,
    blade: el?.querySelector<SVGGElement>("[data-blade]") ?? null,
  });
  // By id: everything is looked up by name, not by document order.
  const bunchView = (c: VineCluster) => {
    const el = q<SVGGElement>(`[data-cluster][data-id="${c.id}"]`);
    return {
      el,
      stub: q<SVGPathElement>(`[data-stub="${c.id}"]`),
      stalk: q<SVGPathElement>(`[data-stalk][data-id="${c.id}"]`),
      berries: Array.from(
        el?.querySelectorAll<SVGGElement>("[data-berry]") ?? [],
      ),
    };
  };
  const views = vine.shoots.map((shoot) => {
    const group = q<SVGGElement>(`[data-shoot="${shoot.id}"]`);
    return {
      group,
      stem: group && q<SVGPathElement>("[data-shoot-stem]", group),
      hit: group && q<SVGPathElement>("[data-shoot-hit]", group),
      tip: group && q<SVGGElement>("[data-shoot-tip]", group),
      leaves: shoot.leaves.map((l) =>
        leafView(q<SVGGElement>(`[data-leaf][data-id="${l.id}"]`)),
      ),
      bunches: shoot.clusters.map(bunchView),
      grips: Array.from(
        group?.querySelectorAll<SVGPathElement>(":scope > [data-grip]") ?? [],
      ),
    };
  });

  /** Shows a leaf at `age` (0 = a folded bud, 1 = open and dark). */
  const paintLeaf = (
    view: ReturnType<typeof leafView>,
    leaf: VineLeaf,
    age: number,
  ) => {
    const { el, blade } = view;
    if (!el || !changed(el, age)) return;
    if (age <= 0) {
      el.style.visibility = "hidden";
      return;
    }
    // It grows while still folded along the shoot, then opens into place.
    const size = Math.pow(easeOut(age), 0.9);
    const open = smooth(clamp01((age - 0.12) / 0.88));
    const closed = leaf.bud - leaf.bladeAngle;
    const angle = closed + (leaf.petioleAngle - closed) * spring(open);
    el.style.visibility = "visible";
    el.style.transform = `rotate(${r2(angle)}deg) scale(${r2(size)})`;
    el.style.setProperty("--age", String(r2(smooth(age))));
    if (blade) blade.style.transform = `scale(1, ${r2(0.38 + 0.62 * open)})`;
  };

  /**
   * Shows a bunch `past` px after its shoot grew past its node: the stalk
   * grows out (stub first), berries set one by one, then ripen (0–1).
   */
  const paintBunch = (
    view: ReturnType<typeof bunchView>,
    past: number,
    ripe: number,
  ) => {
    const stalkAge = clamp01((past - 60) / 90);
    const stubAge = clamp01(stalkAge / 0.36);
    const restAge = clamp01((stalkAge - 0.36) / 0.64);
    if (view.stub && changed(view.stub, stubAge)) {
      view.stub.style.visibility = stubAge > 0 ? "visible" : "hidden";
      view.stub.style.strokeDashoffset = String(r2(1 - stubAge));
    }
    if (view.stalk && changed(view.stalk, restAge)) {
      view.stalk.style.visibility = restAge > 0 ? "visible" : "hidden";
      view.stalk.style.strokeDashoffset = String(r2(1 - restAge));
    }
    if (!view.el) return;
    if (changed(view.el, ripe)) {
      view.el.style.setProperty("--ripe", String(r2(smooth(ripe))));
    }
    view.berries.forEach((berry, j) => {
      const age = clamp01((past - 130 - j * 9) / 150);
      if (!changed(berry, age)) return;
      berry.style.visibility = age > 0 ? "visible" : "hidden";
      berry.style.transform = `scale(${r2(spring(age))})`;
    });
  };

  return (intro: number, g: number, seconds: number) => {
    // The main shoot: grown by its first climb and then by scrolling.
    const at =
      vine.start +
      (vine.sprout - vine.start) * smooth(clamp01(intro)) +
      (line.length - vine.sprout) * clamp01(g);

    /*
     * Every other shoot: on the clock, a quick spurt and then on and on,
     * slowing — once its parent has grown well past its axil. A broken-off
     * shoot starts over from its axil after a while; its own side shoots
     * follow it.
     */
    const starts: number[] = [];
    const reaches: number[] = [];
    vine.shoots.forEach((shoot, i) => {
      if (i === 0) {
        starts[0] = 0;
        reaches[0] = at;
        return;
      }
      const parent = shoot.parent;
      let start = shoot.delay + starts[parent] - vine.shoots[parent].delay;
      const cutAt = growth.shootCuts[shoot.id];
      if (cutAt !== undefined) start = Math.max(start, cutAt + shoot.regrow);
      starts[i] = start;
      const gate = clamp01((reaches[parent] - shoot.s - 100) / 150);
      const t = Math.max(0, seconds - start);
      const spurt = shoot.first * easeOut(clamp01(t / shoot.duration));
      const after = Math.max(0, t - shoot.duration);
      const more =
        (shoot.line.length - shoot.first) * (1 - Math.exp(-after / shoot.tau));
      reaches[i] = (spurt + more) * gate;
    });

    let growing = false;
    vine.shoots.forEach((shoot, i) => {
      const view = views[i];
      const reach = reaches[i];
      if (i > 0 && reach < shoot.line.length * 0.999) growing = true;

      // Tendrils reach out once whatever they grab has grown that far, and
      // let go if it is broken off (its reach drops to 0).
      shoot.tendrils.forEach((grip, j) => {
        const el = view.grips[j];
        const ready =
          grip.target === -2 || reaches[grip.target] >= grip.targetS;
        const age = ready ? clamp01((reach - grip.s - 8) / 120) : 0;
        if (!el || !changed(el, age)) return;
        el.style.visibility = age > 0 ? "visible" : "hidden";
        el.style.strokeDashoffset = String(r2(1 - easeOut(age)));
      });

      // Quarter-pixel steps: slow growth stays smooth, and costs nothing
      // between steps.
      if (!view.group || !changed(view.group, reach / 125)) return;
      if (reach < 2) {
        view.group.style.visibility = "hidden";
        return;
      }
      view.group.style.visibility = "visible";
      view.group.classList.remove("is-cut");

      const width = widthFor(reach);
      view.stem?.setAttribute("d", stemOutline(shoot.line, reach, width));
      if (i === 0) {
        // The old wood at the base of the main shoot.
        const outline = stemOutline(line, reach, width, vine.trunk);
        trunk?.setAttribute("d", outline);
        trunkClip?.setAttribute("d", outline);
        vine.knobs.forEach((knob, j) => {
          const el = knobs[j];
          const shown = reach > knob.s + 20 ? 1 : 0;
          if (el && changed(el, shown))
            el.style.visibility = shown ? "visible" : "hidden";
        });
      }

      const end = pointAt(shoot.line, reach);
      if (view.hit) {
        let d = "";
        for (let j = 0; j <= end.index; j++) {
          d += `${j ? "L" : "M"}${r2(shoot.line.xs[j])} ${r2(shoot.line.ys[j])}`;
        }
        view.hit.setAttribute("d", `${d}L${r2(end.x)} ${r2(end.y)}`);
      }
      view.tip?.setAttribute(
        "transform",
        `translate(${r2(end.x)} ${r2(end.y)}) rotate(${r2(end.angle)}) scale(${r2((width / stemWidth) * (vine.width / 100))})`,
      );

      shoot.clusters.forEach((cluster, j) => {
        const past = reach - cluster.s;
        // Ripe a few hundred px on, or by the end of a short shoot.
        const span = Math.max(
          80,
          Math.min(330, shoot.line.length - cluster.s - 160),
        );
        paintBunch(view.bunches[j], past, clamp01((past - 160) / span));
      });
      shoot.leaves.forEach((leaf, j) => {
        paintLeaf(
          view.leaves[j],
          leaf,
          clamp01((reach - leaf.s - 3) / LEAF_SPAN),
        );
      });
    });

    return growing;
  };
}

/** Fall acceleration for harvested bunches, px/s². */
const GRAVITY = 2600;
/** Where a harvested bunch lands: this far above the bottom of the screen. */
const GROUND = 24;

/** A copy of `nodes` to animate, without the data hooks the painter looks for. */
function fallingCopy(layer: Element, nodes: Element[]): SVGGElement {
  const wrap = document.createElementNS("http://www.w3.org/2000/svg", "g");
  for (const node of nodes) wrap.appendChild(node.cloneNode(true));
  wrap.querySelectorAll("*").forEach((el) => {
    for (const name of el.getAttributeNames()) {
      if (name.startsWith("data-")) el.removeAttribute(name);
    }
  });
  layer.appendChild(wrap);
  return wrap;
}

/**
 * The vineyard easter egg. Hovering a leaf prunes it, as a grower thins the
 * canopy in spring to let light and air at the fruit: it snips off and
 * flutters down. Hovering a ripe bunch harvests it: it is cut a little way
 * out along its stalk, as growers do, leaving a stub on the vine to dry off
 * so disease can't get in through the cut. The bunch drops, and just above
 * the bottom of the screen it bursts into a splash of wine.
 *
 * Leaf blades and berries are the only parts with pointer events, and they
 * sit in the empty margin, so nothing on the page is covered. Cut parts stay
 * gone for the rest of the visit (`onCut` records them); a broken-off shoot
 * grows again from its axil after a while (`onShootCut`).
 */
function attachPruning(
  svg: SVGSVGElement,
  onCut: (id: string) => void,
  onShootCut: (ids: string[]) => void,
) {
  const layer = svg.querySelector("[data-fallen]");
  const splashLayer = svg.querySelector("[data-splash]");
  if (!layer || !splashLayer) return () => {};
  const running = new Set<Animation>();
  const track = (animation: Animation) => {
    running.add(animation);
    animation.finished.then(
      () => running.delete(animation),
      () => running.delete(animation),
    );
    return animation;
  };

  /** Bottom of the screen, in the SVG's own coordinates. */
  const floor = () => window.innerHeight - svg.getBoundingClientRect().top;

  const pruneLeaf = (leaf: SVGGElement) => {
    // Only grown leaves: the young ones at the tip stay.
    if (Number(leaf.style.getPropertyValue("--age") || 0) < 0.5) return;
    const holder = leaf.parentElement;
    if (!holder) return;
    // Measure before cutting: a hidden leaf has no box.
    const top =
      leaf.getBoundingClientRect().top - svg.getBoundingClientRect().top;
    leaf.classList.add("is-cut");
    onCut(leaf.dataset.id ?? "");

    const fallen = fallingCopy(layer, [holder]);
    fallen.querySelector(".is-cut")?.classList.remove("is-cut");
    const drop = Math.max(120, floor() - top + 40);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const sway = 14 + Math.random() * 12;
    const spin = 25 + Math.random() * 25;
    // A leaf doesn't drop, it sails: side to side, tipping as it goes.
    const steps = 10;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.sin(t * Math.PI * 2.6) * sway * Math.sqrt(t) - t * 10;
      const y = drop * Math.pow(t, 1.2);
      const r = dir * (Math.sin(t * Math.PI * 2.6 + 0.6) * spin + t * 50);
      frames.push({
        transform: `translate(${r2(x)}px, ${r2(y)}px) rotate(${r2(r)}deg)`,
        opacity: t < 0.82 ? 1 : 1 - (t - 0.82) / 0.18,
      });
    }
    const fall = track(
      fallen.animate(frames, {
        duration: Math.min(4400, Math.max(1800, drop * 4.2)),
        easing: "linear",
        fill: "forwards",
      }),
    );
    fall.finished.then(
      () => fallen.remove(),
      () => fallen.remove(),
    );
  };

  const splash = (x: number, y: number, color: string, size: number) => {
    const ns = "http://www.w3.org/2000/svg";
    const group = document.createElementNS(ns, "g");
    group.setAttribute("transform", `translate(${r2(x)} ${r2(y)})`);
    splashLayer.appendChild(group);

    // A puddle that spreads and soaks away…
    const puddle = document.createElementNS(ns, "ellipse");
    puddle.setAttribute("rx", String(r2(size * 1.4)));
    puddle.setAttribute("ry", String(r2(size * 0.32)));
    puddle.setAttribute("fill", color);
    group.appendChild(puddle);
    const animations = [
      track(
        puddle.animate(
          [
            { transform: "scale(0.2)", opacity: 0.85 },
            { transform: "scale(1)", opacity: 0.7, offset: 0.25 },
            { transform: "scale(1.25)", opacity: 0 },
          ],
          { duration: 1400, easing: "ease-out", fill: "forwards" },
        ),
      ),
    ];

    // …and droplets thrown up and out, falling back.
    for (let i = 0; i < 12; i++) {
      const drop = document.createElementNS(ns, "circle");
      drop.setAttribute("r", String(r2(size * (0.07 + Math.random() * 0.09))));
      drop.setAttribute("fill", color);
      group.appendChild(drop);
      const angle = (-90 + (Math.random() - 0.5) * 150) * (Math.PI / 180);
      const speed = size * (2.2 + Math.random() * 2.4);
      const frames: Keyframe[] = [];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6;
        frames.push({
          transform: `translate(${r2(Math.cos(angle) * speed * t)}px, ${r2(
            Math.sin(angle) * speed * t + size * 3.4 * t * t,
          )}px)`,
          opacity: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3,
        });
      }
      animations.push(
        track(
          drop.animate(frames, {
            duration: 560 + Math.random() * 260,
            easing: "linear",
            fill: "forwards",
          }),
        ),
      );
    }
    Promise.allSettled(animations.map((a) => a.finished)).then(() =>
      group.remove(),
    );
  };

  const harvest = (cluster: SVGGElement) => {
    // Only ripe fruit is picked.
    if (Number(cluster.style.getPropertyValue("--ripe") || 0) < 0.35) return;
    const id = cluster.dataset.id ?? "";
    // Cut a little way out: the stub stays on the vine and dries off.
    const stalk = svg.querySelector(`[data-stalk][data-id="${id}"]`);
    const stub = svg.querySelector(`[data-stub="${id}"]`);
    const berry = cluster.querySelector(".vine-berry");
    const color = berry ? getComputedStyle(berry).fill : "currentColor";
    const parts = stalk ? [stalk, cluster] : [cluster];
    // Measure before cutting: a hidden bunch has no box.
    const box = cluster.getBoundingClientRect();
    const svgBox = svg.getBoundingClientRect();
    parts.forEach((el) => el.classList.add("is-cut"));
    stub?.classList.add("is-harvested");
    onCut(cluster.dataset.id ?? "");

    const fallen = fallingCopy(layer, parts);
    fallen
      .querySelectorAll(".is-cut")
      .forEach((el) => el.classList.remove("is-cut"));
    const drop = Math.max(0, window.innerHeight - GROUND - box.bottom);
    const tilt = (Math.random() - 0.5) * 14;
    const fall = track(
      fallen.animate(
        [
          { transform: "translate(0, 0) rotate(0deg)" },
          { transform: `translate(0, ${r2(drop)}px) rotate(${r2(tilt)}deg)` },
        ],
        {
          duration: Math.max(240, Math.sqrt((2 * drop) / GRAVITY) * 1000),
          easing: "cubic-bezier(0.45, 0, 1, 0.55)",
          fill: "forwards",
        },
      ),
    );
    fall.finished.then(
      () => {
        // It lands, squashes, and the wine runs out.
        const squash = track(
          fallen.animate(
            [
              {
                transform: `translate(0, ${r2(drop)}px) rotate(${r2(tilt)}deg)`,
                opacity: 1,
              },
              {
                // Squashed flat onto the ground, not pushed through it.
                transform: `translate(0, ${r2(drop + box.height * 0.3)}px) rotate(${r2(tilt)}deg) scale(1.25, 0.4)`,
                opacity: 0,
              },
            ],
            { duration: 200, easing: "ease-out", fill: "forwards" },
          ),
        );
        squash.finished.then(
          () => fallen.remove(),
          () => fallen.remove(),
        );
        // Where it hit: under the bunch's middle, on the ground.
        splash(
          box.left + box.width / 2 - svgBox.left,
          box.bottom + drop - svgBox.top,
          color,
          Math.max(12, box.width * 0.5),
        );
      },
      () => fallen.remove(),
    );
  };

  /*
   * Ausgeizen: side shoots are broken off by hand, the whole shoot at once,
   * so the vine's strength goes into the main stem and the fruit.
   */
  const removeShoot = (shoot: SVGGElement) => {
    // The whole shoot comes away, with any side shoots growing from it.
    const groups = Array.from(
      svg.querySelectorAll<SVGGElement>("[data-shoot]"),
    );
    const parentOf = new Map(
      groups.map((g) => [g.dataset.index, g.dataset.parent] as const),
    );
    const within = (g: SVGGElement) => {
      for (
        let i: string | undefined = g.dataset.index;
        i && i !== "-1";
        i = parentOf.get(i)
      ) {
        if (i === shoot.dataset.index) return true;
      }
      return false;
    };
    const parts = groups.filter(
      (g) =>
        within(g) &&
        g.style.visibility !== "hidden" &&
        !g.classList.contains("is-cut"),
    );
    // Measure before cutting: a hidden shoot has no box.
    const box = shoot.getBoundingClientRect();
    const top = box.top - svg.getBoundingClientRect().top;
    parts.forEach((g) => g.classList.add("is-cut"));
    onShootCut(groups.filter(within).map((g) => g.dataset.shoot ?? ""));

    const fallen = fallingCopy(layer, parts);
    // What grows back is a new shoot: nothing on it pruned or harvested yet.
    for (const g of groups.filter(within)) {
      g.querySelectorAll(".is-cut").forEach((el) =>
        el.classList.remove("is-cut"),
      );
      g.querySelectorAll(".is-harvested").forEach((el) =>
        el.classList.remove("is-harvested"),
      );
    }
    // Show the copied shoots, but not what was already cut from them.
    Array.from(fallen.children).forEach((el) => el.classList.remove("is-cut"));
    const drop = Math.max(120, floor() - top + 60);
    const dir = Math.random() < 0.5 ? -1 : 1;
    // Heavier than a leaf: it tumbles rather than sails.
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      frames.push({
        transform: `translate(${r2(dir * 18 * t)}px, ${r2(drop * t * t)}px) rotate(${r2(dir * 160 * t)}deg)`,
        opacity: t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15,
      });
    }
    const fall = track(
      fallen.animate(frames, {
        duration: Math.min(1800, Math.max(700, Math.sqrt(drop) * 48)),
        easing: "linear",
        fill: "forwards",
      }),
    );
    fall.finished.then(
      () => fallen.remove(),
      () => fallen.remove(),
    );
  };

  const onOver = (event: PointerEvent) => {
    const target = event.target as Element | null;
    if (!target) return;
    // A bunch is harvested wherever it hangs, a shoot's bunches included.
    const cluster = target.closest<SVGGElement>("[data-cluster]");
    if (cluster) {
      if (!cluster.classList.contains("is-cut")) harvest(cluster);
      return;
    }
    // Leaves are pruned one by one, on any shoot.
    const leaf = target.closest<SVGGElement>("[data-leaf]");
    if (leaf) {
      if (!leaf.classList.contains("is-cut")) pruneLeaf(leaf);
      return;
    }
    // Side shoots are broken off by their stem; the main shoot never is.
    const shoot = target.closest<SVGGElement>("[data-shoot]");
    if (
      shoot &&
      shoot.dataset.index !== "0" &&
      !shoot.classList.contains("is-cut")
    ) {
      removeShoot(shoot);
    }
  };

  // Events from the few hit-testable parts bubble up to the SVG.
  svg.addEventListener("pointerover", onOver);
  return () => {
    svg.removeEventListener("pointerover", onOver);
    running.forEach((a) => a.cancel());
  };
}

export interface VineProps {
  /**
   * The current route. Pass your router's pathname (e.g. Next's
   * `usePathname()`) so a client-side navigation restarts the scroll latch
   * and re-reads `?vine-seed=`. Optional on sites without client routing.
   */
  pathname?: string;
  /**
   * The element whose bottom edge the plant creeps along before it hangs,
   * usually the site header; its links and buttons keep standing leaves away.
   * Without a match the plant starts above the page. Default `body > header`.
   */
  ledgeSelector?: string;
  /** Where the margins are; see `DEFAULT_LAYOUT`. */
  layout?: Partial<MarginLayout>;
  /**
   * When the vine may show and the visitor's switch. Default
   * `vinePreference`; pass your own (`createVinePreference`) to change the
   * space query to match a custom `layout`.
   */
  preference?: EffectPreference;
}

const Vine = ({
  pathname = "",
  ledgeSelector = "body > header",
  layout,
  preference = vinePreference,
}: VineProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [seed, setSeed] = useState<string | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  // Survives resizes and navigations; loaded from the visit's storage once.
  const progress = useRef<Growth | null>(null);

  // An inline `layout` object is a new one every render; compare by value.
  const layoutKey = JSON.stringify(layout ?? {});
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Re-read on navigation too, so a client-side jump to ?vine-seed=… applies.
  useEffect(() => {
    setSeed(readOrCreateSeed(SEED_KEY, "vine"));
  }, [pathname]);

  useEffect(() => {
    const space = window.matchMedia(preference.spaceQuery);
    const quiet = window.matchMedia(preference.quietQuery);
    let raf = 0;
    const measure = () => {
      raf = 0;
      // Not shown at all: no room, a calmer page asked for, or switched off.
      if (!space.matches || quiet.matches || preference.isHidden())
        return setBox(null);
      const next = measureBox(ledgeSelector, layoutRef.current);
      setBox((prev) =>
        prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("resize", queue);
    window.addEventListener(preference.event, queue);
    space.addEventListener("change", queue);
    quiet.addEventListener("change", queue);
    return () => {
      window.removeEventListener("resize", queue);
      window.removeEventListener(preference.event, queue);
      space.removeEventListener("change", queue);
      quiet.removeEventListener("change", queue);
      cancelAnimationFrame(raf);
    };
  }, [preference, ledgeSelector, layoutKey]);

  const vine = useMemo(
    () => (seed && box ? generateVine(seed, box) : null),
    [seed, box],
  );

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || !vine) return;
    if (!seed) return;
    if (progress.current?.seed !== seed) progress.current = loadGrowth(seed);
    const state = progress.current;
    const paint = createPainter(svg, vine, state);

    // A new page keeps the plant as it is; only the scroll latch restarts.
    if (state.path !== pathname) {
      state.path = pathname;
      state.since = performance.now();
    }
    const seconds = () => (Date.now() - state.born) / 1000;
    paint(state.intro, state.shown, seconds());

    // Side shoots grow on the clock, every frame while any is still growing.
    let shootRaf = 0;
    const shootFrame = () => {
      shootRaf = paint(state.intro, state.shown, seconds())
        ? requestAnimationFrame(shootFrame)
        : 0;
    };
    shootRaf = requestAnimationFrame(shootFrame);

    // First visit: the shoot climbs the edge and runs across the header, quickly.
    const introMs = Math.min(
      4800,
      Math.max(1800, ((vine.sprout - vine.start) / 620) * 1000),
    );
    let saveTimer = 0;
    const save = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveGrowth(state), 250);
    };

    let raf = 0;
    let last = 0;
    let rustledAt = state.target;
    let rustleTimer = 0;

    const read = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const settled = performance.now() - state.since > 1200;
      // A page that can't scroll has been read in full, but only say so once
      // it has had time to stream in, or every route would start fully grown.
      const p = max > 8 ? clamp01(window.scrollY / max) : settled ? 1 : 0;
      // Right after a navigation the old scroll position can still be in
      // place, so this page only counts once that has been reset.
      const latched = performance.now() - state.since > 300;
      if (latched && p > state.target) {
        state.target = p;
        save();
      }
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(64, Math.max(1, now - last));
      last = now;
      const growing = state.intro < 1;
      if (growing) state.intro = Math.min(1, state.intro + dt / introMs);
      const gap = state.target - state.shown;
      if (gap > 0.0005) {
        // Ease toward the target, but no faster than a plant could follow.
        const eased = Math.max(gap * (1 - Math.exp(-dt / 170)), 0.0006);
        state.shown += Math.min(gap, eased, (MAX_SPEED * dt) / 1000);
      } else {
        state.shown = state.target;
      }
      if (growing || gap > 0.0005) raf = requestAnimationFrame(frame);
      else save();
      paint(state.intro, state.shown, seconds());
    };

    const update = () => {
      read();
      // A growth spurt shakes the leaves once; scrolling back up doesn't.
      if (state.target - rustledAt > 0.004 && !rustleTimer) {
        rustledAt = state.target;
        svg.classList.add("is-rustling");
        rustleTimer = window.setTimeout(() => {
          svg.classList.remove("is-rustling");
          rustleTimer = 0;
        }, 1700);
      }
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    // First reading on the next frame, after Next has reset the scroll.
    const first = requestAnimationFrame(update);
    const settle = [350, 1300].map((ms) => window.setTimeout(update, ms));
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      cancelAnimationFrame(first);
      cancelAnimationFrame(raf);
      settle.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(rustleTimer);
      window.clearTimeout(saveTimer);
      cancelAnimationFrame(shootRaf);
      saveGrowth(state);
      svg.classList.remove("is-rustling");
    };
  }, [vine, seed, pathname]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !vine) return;
    return attachPruning(
      svg,
      (id) => {
        const state = progress.current;
        if (!state || !id) return;
        state.cut.add(id);
        saveGrowth(state);
      },
      (ids) => {
        const state = progress.current;
        if (!state) return;
        const now = (Date.now() - state.born) / 1000;
        for (const id of ids) {
          if (!id) continue;
          state.shootCuts[id] = now;
          // Its leaves and bunches go with it; the new one grows its own.
          for (const done of [...state.cut]) {
            if (done.startsWith(id) || done.startsWith(`g${id}`))
              state.cut.delete(done);
          }
        }
        saveGrowth(state);
      },
    );
  }, [vine]);

  /*
   * Browsers without scroll timelines get the same lift from a scroll
   * listener: this isn't an effect, it is what keeps the plant attached to
   * the header.
   */
  const lift = box?.lift ?? 0;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !vine || CSS.supports("animation-timeline: scroll()")) return;
    const follow = () => {
      svg.style.translate = `0 ${-Math.min(window.scrollY, lift)}px`;
    };
    follow();
    window.addEventListener("scroll", follow, { passive: true });
    return () => window.removeEventListener("scroll", follow);
  }, [vine, lift]);

  if (!vine) return null;

  const viewWidth = vine.span;

  return (
    <svg
      ref={svgRef}
      className={`vine vine--${vine.variety}`}
      data-seed={seed ?? undefined}
      aria-hidden="true"
      focusable="false"
      width={viewWidth}
      height={vine.height}
      viewBox={`0 0 ${viewWidth} ${vine.height}`}
      style={{ "--vine-lift": `${lift}px` } as CSSProperties}
    >
      <VinePlant vine={vine} />
    </svg>
  );
};

export default Vine;
