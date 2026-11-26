# @andi1984/scroll-effects-core

Shared helpers for [`@andi1984/scroll-vine`](https://www.npmjs.com/package/@andi1984/scroll-vine),
[`@andi1984/scroll-frost`](https://www.npmjs.com/package/@andi1984/scroll-frost) and friends.

- `createEffectPreference({ name, spaceQuery?, quietQuery? })` — when an effect
  may show (room in the margins, no "calmer page" setting) and the visitor's
  remembered on/off switch (`<name>-hidden` in localStorage, `<name>-toggle`
  event on `window`).
- `useEffectToggle(preference)` — `{ available, hidden, toggle }` for a
  "Hide the …" button.
- `QUIET_QUERY`, `MARGIN_SPACE_QUERY` — the media queries.
- `readOrCreateSeed(key)`, `hashSeed`, `mulberry32` — seeds and a small PRNG.
- `marginStripWidth(span, layout?)`, `DEFAULT_LAYOUT` — the width of the empty
  strip beside a centered text column.

MIT
