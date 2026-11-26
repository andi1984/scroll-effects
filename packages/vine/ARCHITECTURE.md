# How the vine works

Notes carried over from andi1984.dev, where the vine was first built. Paths
refer to that repo: `vine.tsx` is now `src/Vine.tsx`, `src/lib/vine.ts` is
`src/generate.ts`, `src/lib/vine-preference.ts` is `src/preference.ts` plus
`@andi1984/scroll-effects-core`, and the styles are `styles.css`.

- `vine.tsx` + `src/lib/vine.ts` — the seeded scroll-progress grapevine:
  one fixed, full-width SVG, drawn in CSS pixels. Trained like a pergola:
  rooted below a bottom corner, it climbs that margin, runs across the
  whole page along the header's bottom rule, rolls over and hangs down the
  far margin.
  - **Seed**: stored in `localStorage` (`vine-seed`; `?vine-seed=` forces
    one). Same seed → same plant, including which side it climbs (`dir`;
    for -1 the component mirrors the drawing). Each node draws from its own
    random stream, so a taller viewport adds nodes without reshuffling.
  - **Growth is age, not a reveal.** One number moves, the arc position of
    the tip; `createPainter` derives everything from how far the tip has
    passed each organ: the stem thickens, leaves emerge folded and pale and
    then open, tendrils coil, fruit sets green and ripens. It writes
    straight to the DOM — no React render per frame.
  - **First visit**: the shoot climbs and crosses the header on its own
    (`intro`, up to ~5s); scrolling grows the hanging part.
  - **Remembered for the visit** (`sessionStorage`, `vine-state`): growth,
    intro and pruned/harvested organ ids. Navigating or reloading keeps the
    plant as it is; it only grows when a page is read further than before.
  - **Space rules** (enforced by the generator): hanging foliage stays in
    the far margin strip (margin less 22px), climbing foliage in the near
    one; leaves standing above the header rule avoid the header's links
    (`blocked`, measured from the DOM); leaves below the rule only hang in
    the margins, never over the text column.
  - **Leaf outline** (`LEAF_BLADE`) is generated from grape-leaf vein
    proportions (`LOBE_STOPS`); change the shape there.
  - The header scrolls away but the SVG is fixed, so for the first
    `--vine-lift` px of scroll the SVG moves up with the page (a CSS scroll
    timeline, with a scroll-listener fallback in the component).
  - **Fruit**: each plant has its own `fruitiness`; bunches set on the
    climbing stem, the fall and the hanging nodes wherever there's room in
    the margin and enough growth after them to ripen (0 to ~9 per plant).
    Bunch ids start with `g`, because `cut` holds leaf and bunch ids alike.
  - **Trunk**: the lower part of the climb is old wood: bare of leaves,
    fruit and shoots, gnarled, flared at the root, with long vertical bark
    grooves, plate cracks and pale ridges (`vine.bark`, clipped to the
    trunk outline and faded out with a mask toward `trunkTo`).
  - **One kind of stem**: `vine.shoots[0]` is the main shoot and every
    other stem is a `VineShoot` too — same data (line, leaves, bunches,
    tendrils), same markup (`Shoot`) and the same painting. Only the main
    shoot's growth driver (scroll + first climb), its path, its old wood
    (trunk, bark, knobs) and its permanence are special. Parents come
    before their side shoots; `parent` and tendril `target` are indices
    into `shoots`.
  - **Shoots** (`vine.shoots`): the main shoot is the scroll indicator;
    every other shoot grows on the clock (`born` in the session state, rAF
    while any grows), fast and as much as it likes, so an unpruned plant
    gets crowded within ~15 minutes. All share one look and the same leaf
    unfolding; only speed and angle differ.
    - Water sprouts: one or two break out of a bud knob on the side of the
      trunk (latent buds) seconds into the visit and turn upright.
    - Main-stem axils: a seeded few sprout early (first ~2.5 min), nearly
      all the rest over the next ~10. Shoots branch from their own axils.
      Main-stem axils get the budget first (64 shoots, 600 shoot leaves).
    - Each leaves its axil at 10–85° toward its leaf, then follows its
      parent at a seeded 8–18px to its side (heading the way the parent
      runs at the nearest point ahead) and stops where it would leave its
      margin strip — never steered along walls, which made shoots circle
      in corners. A quick first spurt, then on toward its full length
      (time constant `tau`); long shoots thicken and grow bigger leaves.
    - **Tendrils**: like a real vine, a tendril opposite the leaf at two
      nodes out of three, on the main stem (climb and hanging part, where
      no bunch hangs) and on every shoot. A shoot's tendril coils round
      the nearest stem in reach once that has grown there (never one so
      near the strip edge the coil spills over), else curls freely
      (`target: -2`).
    - Fruitful shoots carry one or two bunches around their third to
      sixth node, opposite a leaf in place of a tendril (water sprouts
      rarely); at most 14 shoot bunches per plant.
    - Hovering a leaf prunes it, on any shoot; hovering a side shoot's
      stem breaks it off with its side shoots ("ausgeizen"). `shootCuts`
      records when, and the axil regrows a fresh shoot after `regrow`
      seconds (its old pruned leaves and harvested bunches are cleared).
      The main shoot can't be broken off.
  - Easter egg (`attachPruning`): hovering a grown leaf prunes it (it
    flutters down); hovering a ripe bunch harvests it. Like a grower, it is
    cut a little way out: the stalk is two paths, and the stub (`data-stub`)
    stays on the vine and dries brown (`.is-harvested`) while the rest drops
    with the bunch and bursts into a wine splash just above the bottom of
    the screen. Only `.vine-blade` and `.vine-berry` take pointer events.
  - Same plant and colors in light and dark mode.
  - **Not shown at all** (nothing rendered, nothing running) under any
    setting asking for a calmer page — reduced motion, more contrast,
    forced colors, reduced data (`VINE_QUIET_QUERY` in
    `src/lib/vine-preference.ts`, with a CSS backstop) — or when the
    visitor switched it off with the footer's "Hide the vine"
    (`src/components/vine-toggle.tsx`, `localStorage["vine-hidden"]`). The
    switch is only offered where the vine can show.
  - Only rendered at ≥1366px wide / ≥480px tall (`VINE_SPACE_QUERY`).
    Styles and the `--vine-*` tokens (scoped to `.vine`) are at the end of
    `globals.css`.
