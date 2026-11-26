/**
 * Where the margins are. Effects live in the empty strips beside a centered
 * text column and never reach over it.
 */
export interface MarginLayout {
  /** Max width of the centered column, in px. */
  column: number;
  /** Horizontal padding inside that column (text starts this far in). */
  inset: number;
  /** Clearance kept between an effect's strip and the text. */
  gap: number;
  /** Strip width bounds. */
  min: number;
  max: number;
}

export const DEFAULT_LAYOUT: MarginLayout = {
  column: 1240,
  inset: 64,
  gap: 22,
  min: 92,
  max: 136,
};

/** Width of one margin strip for a page `span` px wide. */
export function marginStripWidth(
  span: number,
  layout: Partial<MarginLayout> = {},
): number {
  const { column, inset, gap, min, max } = { ...DEFAULT_LAYOUT, ...layout };
  const margin = (span - column) / 2 + inset;
  return Math.round(Math.min(max, Math.max(min, margin - gap)));
}
