import {
  createEffectPreference,
  MARGIN_SPACE_QUERY,
} from "@andi1984/scroll-effects-core";
import type { EffectPreference } from "@andi1984/scroll-effects-core";

/**
 * Room for the frost with the default layout. Keep in sync with the media
 * query on `.frost` in styles.css.
 */
export const FROST_SPACE_QUERY = MARGIN_SPACE_QUERY;

/**
 * The frost's preference. Storage key `frost-hidden`, event `frost-toggle`.
 * Use `createFrostPreference` for a different space query.
 */
export const frostPreference: EffectPreference = createEffectPreference({
  name: "frost",
});

export const createFrostPreference = (spaceQuery: string): EffectPreference =>
  createEffectPreference({ name: "frost", spaceQuery });
