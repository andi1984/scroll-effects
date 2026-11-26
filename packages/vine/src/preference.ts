import {
  createEffectPreference,
  MARGIN_SPACE_QUERY,
} from "@andi1984/scroll-effects-core";
import type { EffectPreference } from "@andi1984/scroll-effects-core";

/**
 * Room for the vine with the default layout: at >= 1366px the text starts at
 * least 119px in. Keep in sync with the media query on `.vine` in styles.css.
 */
export const VINE_SPACE_QUERY = MARGIN_SPACE_QUERY;

/**
 * The vine's preference. Storage key `vine-hidden`, event `vine-toggle`.
 * Use `createVinePreference` for a different space query.
 */
export const vinePreference: EffectPreference = createEffectPreference({
  name: "vine",
});

export const createVinePreference = (spaceQuery: string): EffectPreference =>
  createEffectPreference({ name: "vine", spaceQuery });
