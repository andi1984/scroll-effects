import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { marginStripWidth, readOrCreateSeed } from "@andi1984/scroll-effects-core";
import type { EffectPreference, MarginLayout } from "@andi1984/scroll-effects-core";
import { generateFrost } from "./generate";
import type { Frost as FrostData, FrostBox, FrostCrystal } from "./generate";
import { frostPreference } from "./preference";

/**
 * The scroll-progress frost.
 *
 * The screen is a cold window pane. A seeded set of hexagonal ice crystals
 * (generate.ts) forms on it as you read, crowded along the frame and thinning
 * toward the text — the bottom first, the top of the pane last; by the end of
 * a page both margins are frosted over. The frost belongs to the pane, not
 * the page, so it stays put while the text scrolls past.
 *
 * Scrolling only moves one number, `--p` on the SVG. Each crystal turns it
 * into how far it has formed and CSS grows it from its center (styles.css),
 * so a frame costs one style write.
 *
 * - Seed: generated once and kept in localStorage (`frost-seed`);
 *   `?frost-seed=…` forces one. Exposed as `data-seed`.
 * - On the first page of a visit a little frost forms on its own at the
 *   bottom of the pane (~2.5s); reading grows the rest.
 * - Growth is one-way and remembered for the visit (sessionStorage):
 *   navigating or reloading keeps the pane as it is. It only grows when a
 *   page is read further than any page before. A page too short to scroll
 *   counts as read.
 * - Easter egg: hovering a crystal melts it and its neighbours, as if you'd
 *   breathed on the glass; a drop runs down the pane. It freezes over again
 *   a while later.
 * - A11Y: decorative (`aria-hidden`; only the crystals take pointer events,
 *   and they sit in the empty margins). Not shown at all — nothing rendered,
 *   nothing running — under any setting asking for a calmer page
 *   (`preference.quietQuery`) or when the visitor has switched it off
 *   (`preference.setHidden`), and only where the margins have room
 *   (`preference.spaceQuery`).
 *
 * Renders null until mounted so server and client markup agree.
 */
const SEED_KEY = "frost-seed";
const STATE_KEY = "frost-state";

/** Progress the first page of a visit grows on its own. */
const INTRO_P = 0.1;
const INTRO_MS = 2600;
/** Growth can't outrun the cold: at most this much progress per second. */
const MAX_SPEED = 0.5;
/** A melted crystal freezes over again after this many seconds. */
const REFREEZE_S = 40;
/** A crystal must have formed this much (0–1) before it can be melted. */
const MELTABLE = 0.4;
/** A breath on the glass reaches this far (px) past a crystal's radius. */
const BREATH = 18;

interface FrostState {
  seed: string;
  intro: number;
  /** Shown progress, easing toward `target`. */
  shown: number;
  /** The furthest anyone has read on any page this visit, 0 → 1. */
  target: number;
  /** Melted crystals, by id, with when (seconds into the visit). */
  melted: Record<string, number>;
  /** When the visit started (ms since epoch). */
  born: number;
  /** Runtime only: the route the scroll latch belongs to, and since when. */
  path?: string;
  since: number;
}

function loadState(seed: string): FrostState {
  const fresh: FrostState = {
    seed,
    intro: 0,
    shown: 0,
    target: 0,
    melted: {},
    born: Date.now(),
    since: performance.now(),
  };
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return fresh;
    const s = JSON.parse(raw) as Partial<FrostState>;
    if (s.seed !== seed) return fresh;
    const num = (v: unknown, d: number) =>
      typeof v === "number" && Number.isFinite(v) ? v : d;
    return {
      ...fresh,
      intro: Math.min(1, num(s.intro, 0)),
      shown: Math.min(1, num(s.shown, 0)),
      target: Math.min(1, num(s.target, 0)),
      melted: s.melted && typeof s.melted === "object" ? s.melted : {},
      born: num(s.born, fresh.born),
    };
  } catch {
    return fresh;
  }
}

function saveState(s: FrostState) {
  try {
    const { seed, intro, shown, target, melted, born } = s;
    sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify({ seed, intro, shown, target, melted, born }),
    );
  } catch {
    /* storage unavailable — the pane just isn't remembered */
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const r3 = (v: number) => String(Math.round(v * 1000) / 1000);

/** The progress the pane shows: the intro's bit of frost, or what's been read. */
const displayed = (s: FrostState) => Math.max(INTRO_P * easeOut(s.intro), s.shown);

const GLINT = "M0 -1V1M-1 0H1M-.45 -.45L.45 .45M-.45 .45L.45 -.45";

const Crystal = memo(function Crystal({ c }: { c: FrostCrystal }) {
  return (
    <g
      className={`frost-crystal frost-crystal--${c.habit}`}
      data-crystal={c.id}
      transform={`translate(${r3(c.x)} ${r3(c.y)})`}
      style={{ "--t0": r3(c.t0), "--dur": r3(c.dur) } as CSSProperties}
    >
      <g className="frost-grow">
        {c.face && <path className="frost-face" d={c.face} />}
        <path className="frost-arms" d={c.arms} />
        {c.detail && <path className="frost-detail" d={c.detail} />}
        {c.glints.map((g, i) => (
          <g
            key={i}
            className="frost-glint-at"
            transform={`translate(${r3(g.x)} ${r3(g.y)}) scale(${r3(g.r)})`}
          >
            <path
              className="frost-glint"
              d={GLINT}
              style={{ "--d": `${r3(g.delay)}s` } as CSSProperties}
            />
          </g>
        ))}
      </g>
      <circle className="frost-hit" r={r3(c.r * 0.9)} />
    </g>
  );
});

const Pane = memo(function Pane({ frost, haze }: { frost: FrostData; haze: string }) {
  const { width, height, span } = frost;
  const side = (s: 1 | -1) => (
    <g
      className="frost-strip"
      transform={s === 1 ? undefined : `translate(${span} 0) scale(-1 1)`}
    >
      <rect className="frost-haze" width={width} height={height} fill={`url(#${haze})`} />
      {frost.crystals
        .filter((c) => c.side === s)
        .map((c) => (
          <Crystal key={c.id} c={c} />
        ))}
    </g>
  );
  return (
    <>
      <defs>
        <linearGradient id={haze} x1="0" x2="1" y1="0" y2="0">
          <stop className="frost-haze-stop" offset="0" />
          <stop className="frost-haze-stop frost-haze-stop--clear" offset="1" />
        </linearGradient>
      </defs>
      {side(1)}
      {side(-1)}
      <g className="frost-drops" data-drops="" />
    </>
  );
});

/**
 * Hovering a crystal melts it and its neighbours, as if you'd breathed on
 * the glass: they thaw away and a drop runs down the pane from where the
 * pointer touched it. `onMelt` records each.
 */
function attachMelting(
  svg: SVGSVGElement,
  /** Ids of the grown crystals within reach of a breath at (x, y). */
  thawable: (x: number, y: number) => string[],
  onMelt: (id: string) => void,
) {
  const running = new Set<Animation>();
  const layer = svg.querySelector<SVGGElement>("[data-drops]");

  const drip = (x: number, y: number) => {
    if (!layer || typeof Element.prototype.animate !== "function") return;
    const ns = "http://www.w3.org/2000/svg";
    const fall = Math.max(40, svg.viewBox.baseVal.height - y - 6);
    const ms = 900 + fall * 2.4;
    const trail = document.createElementNS(ns, "path");
    trail.setAttribute("class", "frost-trail");
    trail.setAttribute("d", `M${x} ${y}V${y + fall}`);
    trail.setAttribute("pathLength", "1");
    const drop = document.createElementNS(ns, "ellipse");
    drop.setAttribute("class", "frost-drop");
    drop.setAttribute("cx", String(x));
    drop.setAttribute("cy", String(y));
    drop.setAttribute("rx", "1.9");
    drop.setAttribute("ry", "2.4");
    layer.append(trail, drop);
    // Drops on glass hesitate, then run.
    const easing = "cubic-bezier(.6,0,.85,.55)";
    const a = drop.animate(
      [
        { transform: "translateY(0)", opacity: 1 },
        { transform: `translateY(${fall * 0.9}px)`, opacity: 1, offset: 0.92 },
        { transform: `translateY(${fall}px)`, opacity: 0 },
      ],
      { duration: ms, easing, fill: "forwards" },
    );
    const t = trail.animate(
      [
        { strokeDashoffset: 1, opacity: 0.9 },
        { strokeDashoffset: 0.1, opacity: 0.7, offset: 0.92 },
        { strokeDashoffset: 0, opacity: 0 },
      ],
      { duration: ms + 2200, easing, fill: "forwards" },
    );
    for (const anim of [a, t]) {
      running.add(anim);
      anim.onfinish = () => {
        running.delete(anim);
        (anim === a ? drop : trail).remove();
      };
    }
  };

  const onOver = (event: PointerEvent) => {
    const target = event.target as Element | null;
    if (!target?.classList?.contains("frost-hit")) return;
    // A breath on the glass thaws everything close by, not one crystal.
    let thawed = 0;
    for (const id of thawable(event.clientX, event.clientY)) {
      const el = svg.querySelector(`[data-crystal="${id}"]`);
      if (!el || el.classList.contains("is-melted")) continue;
      el.classList.add("is-melted");
      onMelt(id);
      thawed++;
    }
    if (thawed) drip(event.clientX, event.clientY);
  };

  svg.addEventListener("pointerover", onOver);
  return () => {
    svg.removeEventListener("pointerover", onOver);
    running.forEach((a) => a.cancel());
  };
}

export interface FrostProps {
  /**
   * The current route. Pass your router's pathname (e.g. Next's
   * `usePathname()`) so a client-side navigation restarts the scroll latch
   * and re-reads `?frost-seed=`. Optional on sites without client routing.
   */
  pathname?: string;
  /** Where the margins are; see `DEFAULT_LAYOUT`. */
  layout?: Partial<MarginLayout>;
  /**
   * When the frost may show and the visitor's switch. Default
   * `frostPreference`; pass your own (`createFrostPreference`) to change the
   * space query to match a custom `layout`.
   */
  preference?: EffectPreference;
}

const Frost = ({ pathname = "", layout, preference = frostPreference }: FrostProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const haze = `frost-haze-${useId().replace(/[^\w-]/g, "")}`;
  const [seed, setSeed] = useState<string | null>(null);
  const [box, setBox] = useState<FrostBox | null>(null);
  const state = useRef<FrostState | null>(null);

  // An inline `layout` object is a new one every render; compare by value.
  const layoutKey = JSON.stringify(layout ?? {});
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Re-read on navigation too, so a client-side jump to ?frost-seed=… applies.
  useEffect(() => {
    setSeed(readOrCreateSeed(SEED_KEY, "frost"));
  }, [pathname]);

  useEffect(() => {
    const space = window.matchMedia(preference.spaceQuery);
    const quiet = window.matchMedia(preference.quietQuery);
    let raf = 0;
    const measure = () => {
      raf = 0;
      // Not shown at all: no room, a calmer page asked for, or switched off.
      if (!space.matches || quiet.matches || preference.isHidden()) return setBox(null);
      const span = document.documentElement.clientWidth;
      const next: FrostBox = {
        span,
        width: marginStripWidth(span, layoutRef.current),
        height: window.innerHeight,
      };
      setBox((prev) =>
        prev && prev.span === next.span && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
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
  }, [preference, layoutKey]);

  const frost = useMemo(() => (seed && box ? generateFrost(seed, box) : null), [seed, box]);

  // Growth: scroll → target (one-way) → eased shown progress → `--p`.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || !frost || !seed) return;
    if (state.current?.seed !== seed) state.current = loadState(seed);
    const s = state.current;
    const paint = () => svg.style.setProperty("--p", displayed(s).toFixed(4));

    // A new page keeps the pane as it is; only the scroll latch restarts.
    if (s.path !== pathname) {
      s.path = pathname;
      s.since = performance.now();
    }
    paint();

    let saveTimer = 0;
    const save = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => saveState(s), 250);
    };

    let raf = 0;
    let last = 0;

    const read = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const settled = performance.now() - s.since > 1200;
      // A page that can't scroll has been read in full, but only say so once
      // it has had time to stream in, or every route would start frosted over.
      const p = max > 8 ? clamp01(window.scrollY / max) : settled ? 1 : 0;
      // Right after a navigation the old scroll position can still be in
      // place, so this page only counts once that has been reset.
      const latched = performance.now() - s.since > 300;
      if (latched && p > s.target) {
        s.target = p;
        save();
      }
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(64, Math.max(1, now - last));
      last = now;
      const intro = s.intro < 1;
      if (intro) s.intro = Math.min(1, s.intro + dt / INTRO_MS);
      const gap = s.target - s.shown;
      if (gap > 0.0005) {
        // Ease toward the target, but no faster than ice could follow.
        const eased = Math.max(gap * (1 - Math.exp(-dt / 220)), 0.0006);
        s.shown += Math.min(gap, eased, (MAX_SPEED * dt) / 1000);
      } else {
        s.shown = s.target;
      }
      if (intro || gap > 0.0005) raf = requestAnimationFrame(frame);
      else save();
      paint();
    };

    const update = () => {
      read();
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    // First reading on the next frame, after the router has reset the scroll.
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
      window.clearTimeout(saveTimer);
      saveState(s);
    };
  }, [frost, seed, pathname]);

  // Melting, and freezing over again.
  useEffect(() => {
    const svg = svgRef.current;
    const s = state.current;
    if (!svg || !frost || !s) return;
    const seconds = () => (Date.now() - s.born) / 1000;
    const timers = new Map<string, number>();

    const refreeze = (id: string, inSeconds: number) => {
      window.clearTimeout(timers.get(id));
      timers.set(
        id,
        window.setTimeout(
          () => {
            timers.delete(id);
            delete s.melted[id];
            saveState(s);
            svg.querySelector(`[data-crystal="${id}"]`)?.classList.remove("is-melted");
          },
          Math.max(0, inSeconds) * 1000,
        ),
      );
    };

    // Melted earlier this visit: still melted, until its time is up.
    for (const [id, at] of Object.entries(s.melted)) {
      const left = REFREEZE_S - (seconds() - at);
      const el = svg.querySelector(`[data-crystal="${id}"]`);
      if (left <= 0 || !el) {
        delete s.melted[id];
        continue;
      }
      el.classList.add("is-melted");
      refreeze(id, left);
    }

    const detach = attachMelting(
      svg,
      (x, y) => {
        const p = displayed(s);
        return frost.crystals
          .filter((c) => {
            if ((p - c.t0) / c.dur < MELTABLE) return false;
            const cx = c.side === 1 ? c.x : frost.span - c.x;
            return Math.hypot(cx - x, c.y - y) < BREATH + c.r;
          })
          .map((c) => c.id);
      },
      (id) => {
        s.melted[id] = seconds();
        saveState(s);
        refreeze(id, REFREEZE_S);
      },
    );
    return () => {
      detach();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [frost]);

  if (!frost) return null;

  return (
    <svg
      ref={svgRef}
      className="frost"
      data-seed={seed ?? undefined}
      aria-hidden="true"
      focusable="false"
      width={frost.span}
      height={frost.height}
      viewBox={`0 0 ${frost.span} ${frost.height}`}
    >
      <Pane frost={frost} haze={haze} />
    </svg>
  );
};

export default Frost;
