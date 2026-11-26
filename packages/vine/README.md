# @andi1984/scroll-vine

A seeded grapevine that grows in the page margin as you read. Rooted below a
bottom corner, it climbs the edge, creeps along the bottom of your header,
then droops over and hangs down the other margin. Leaves unfold and darken,
tendrils coil, grapes set and ripen; side shoots sprout on their own clock.
Hover a leaf to prune it, a ripe bunch to harvest it, a side shoot to break
it off.

```tsx
"use client";
import { usePathname } from "next/navigation";
import { Vine } from "@andi1984/scroll-vine";
import "@andi1984/scroll-vine/styles.css";

export const SiteVine = () => <Vine pathname={usePathname()} />;
```

## Props

| Prop | Default | |
| --- | --- | --- |
| `pathname` | `""` | Current route; restarts the scroll latch on client navigation. |
| `ledgeSelector` | `"body > header"` | Element whose bottom edge the vine creeps along. Its links keep standing leaves away. |
| `layout` | `DEFAULT_LAYOUT` | `{ column, inset, gap, min, max }` — where the margins are. |
| `preference` | `vinePreference` | When it may show + the visitor's switch. Use `createVinePreference(spaceQuery)` for a custom layout. |

Colors are `--vine-*` custom properties on `.vine` (see `styles.css`). Hidden
under reduced motion / more contrast / forced colors / reduced data, and below
1366px wide.

MIT
