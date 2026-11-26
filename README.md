# scroll-effects

Seeded, decorative scroll-progress effects for reading pages. Each one lives
in the empty margins beside the text, grows as the visitor reads, and is
remembered for the visit.

| Package | What it is |
| --- | --- |
| [`@andi1984/scroll-vine`](packages/vine) | A grapevine that climbs the margin, creeps along the header and hangs down as you read. Hover a leaf to prune it, a ripe bunch to harvest it. |
| [`@andi1984/scroll-frost`](packages/frost) | Hexagonal ice crystals form on the window pane, along the frame first, as you read. Hover to breathe on the glass and melt them. |
| [`@andi1984/scroll-effects-core`](packages/core) | Shared helpers: visitor preference / "hide" switch, seeds, margin layout. |

Every effect follows the same rules:

- **Decorative only.** `aria-hidden`, only takes pointer events in the empty
  margins, never over text.
- **Calm by default.** Not rendered at all — nothing drawn, nothing running —
  under `prefers-reduced-motion: reduce`, `prefers-contrast: more`,
  `forced-colors: active` or `prefers-reduced-data: reduce`, and only where the
  margins have room (≥ 1366px wide by default).
- **The visitor can switch it off**; the choice is remembered.
- **Seeded.** Each visitor gets their own plant / pane (localStorage);
  `?vine-seed=…` / `?frost-seed=…` forces one.

## Usage (React / Next.js)

```tsx
"use client";
import { usePathname } from "next/navigation";
import { Frost } from "@andi1984/scroll-frost";
import "@andi1984/scroll-frost/styles.css";

export function SiteFrost() {
  return <Frost pathname={usePathname()} />;
}
```

A switch for the footer:

```tsx
"use client";
import { useEffectToggle } from "@andi1984/scroll-effects-core";
import { frostPreference } from "@andi1984/scroll-frost";

export function FrostToggle() {
  const { available, hidden, toggle } = useEffectToggle(frostPreference);
  if (!available) return null;
  return <button onClick={toggle}>{hidden ? "Show the frost" : "Hide the frost"}</button>;
}
```

## Development

```bash
npm install
npm run dev        # builds the packages, starts the demo (Vite)
npm run build      # builds all packages
npm run typecheck
```

The demo (`demo/`) switches between effects, light/dark, and "new visit"
(clears the session state).

## Publishing

Packages are versioned independently. Build first, then publish from each
package folder (core first, the effects depend on it):

```bash
npm run build
npm publish -w packages/core
npm publish -w packages/vine -w packages/frost
```

`publishConfig.access` is `public`, so the scoped packages publish publicly.

## License

MIT
