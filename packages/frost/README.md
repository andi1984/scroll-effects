# @andi1984/scroll-frost

Frost on the window pane, as you read. Seeded hexagonal ice crystals —
stellar dendrites, sector plates, hexagonal plates, needle stars — form in the
page margins, crowded along the screen edge and the bottom and thinning
toward the text. The bottom of the pane frosts first, the top last; by the
end of a page both margins are frosted over. Hover to breathe on the glass:
nearby crystals melt and a drop runs down; they freeze over again later.

```tsx
"use client";
import { usePathname } from "next/navigation";
import { Frost } from "@andi1984/scroll-frost";
import "@andi1984/scroll-frost/styles.css";

export const SiteFrost = () => <Frost pathname={usePathname()} />;
```

## Props

| Prop | Default | |
| --- | --- | --- |
| `pathname` | `""` | Current route; restarts the scroll latch on client navigation. |
| `layout` | `DEFAULT_LAYOUT` | `{ column, inset, gap, min, max }` — where the margins are. |
| `preference` | `frostPreference` | When it may show + the visitor's switch. Use `createFrostPreference(spaceQuery)` for a custom layout. |

## Theming

Colors are `--frost-*` custom properties on `.frost`. Dark values apply under
`.dark` / `[data-theme="dark"]` on an ancestor, or with
`prefers-color-scheme: dark` unless the root says `.light` /
`[data-theme="light"]`.

Hidden under reduced motion / more contrast / forced colors / reduced data,
and below 1366px wide.

MIT
