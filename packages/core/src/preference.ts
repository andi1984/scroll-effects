/**
 * When a decorative effect may show, and the visitor's own switch for it.
 *
 * Every effect in this family follows the same rules:
 *
 * - It needs room: the empty margins beside the text column (`spaceQuery`).
 * - Any system or browser setting that asks for a calmer page hides it
 *   completely — not a still version, nothing at all: reduced motion, more
 *   contrast, forced colors and reduced data (`QUIET_QUERY`).
 * - The visitor can switch it off; that choice is remembered in
 *   localStorage, and an event on `window` tells every mounted effect.
 */

/** Settings asking for a calmer page. An effect is not rendered under any. */
export const QUIET_QUERY =
  "(prefers-reduced-motion: reduce), (prefers-contrast: more), (forced-colors: active), (prefers-reduced-data: reduce)";

/**
 * Room for the default margin layout (`DEFAULT_LAYOUT`): at >= 1366px a
 * 1240px column leaves margins wide enough for an effect.
 */
export const MARGIN_SPACE_QUERY = "(min-width: 1366px) and (min-height: 480px)";

export interface EffectPreference {
  /** Short name, e.g. "vine". Used for the storage key and event name. */
  readonly name: string;
  readonly spaceQuery: string;
  readonly quietQuery: string;
  /** Fired on `window` (detail: hidden) when the visitor flips the switch. */
  readonly event: string;
  isHidden(): boolean;
  setHidden(hidden: boolean): void;
  /** Whether the effect can show here at all, the visitor's switch aside. */
  canShow(): boolean;
}

export interface EffectPreferenceOptions {
  name: string;
  spaceQuery?: string;
  quietQuery?: string;
  /** localStorage key for the visitor's switch. Default `<name>-hidden`. */
  storageKey?: string;
  /** Event name. Default `<name>-toggle`. */
  event?: string;
}

export function createEffectPreference({
  name,
  spaceQuery = MARGIN_SPACE_QUERY,
  quietQuery = QUIET_QUERY,
  storageKey = `${name}-hidden`,
  event = `${name}-toggle`,
}: EffectPreferenceOptions): EffectPreference {
  return {
    name,
    spaceQuery,
    quietQuery,
    event,
    isHidden() {
      try {
        return localStorage.getItem(storageKey) === "1";
      } catch {
        return false;
      }
    },
    setHidden(hidden: boolean) {
      try {
        if (hidden) localStorage.setItem(storageKey, "1");
        else localStorage.removeItem(storageKey);
      } catch {
        /* storage unavailable — the switch still works for this page */
      }
      window.dispatchEvent(new CustomEvent(event, { detail: hidden }));
    },
    canShow() {
      return (
        window.matchMedia(spaceQuery).matches &&
        !window.matchMedia(quietQuery).matches
      );
    },
  };
}
