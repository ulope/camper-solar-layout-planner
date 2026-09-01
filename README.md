# Camper Solar Layout Planner

A browser-only web app for planning solar-panel placement on a camping vehicle.
Define one or more usable surfaces (roof, sidewalls, …), mark keep-out zones (hatches,
vents, antennas, etc), enter a catalog of candidate panel models, and the app computes and
visually displays an optimized selection and placement that
**maximizes total watt-peak (Wp)**.


https://ulope.github.io/camper-solar-layout-planner/


## Examples

- Simple

![](example-1.png)

- Complex

![](example-2.png)


## Usage Hints

- The more panel options (esp. different shapes and sizes) you provide the "better" the result will be.
  - The optimizer maximizes Wp achieved. If you also fill in **weight** and **price** per model
    you can add secondary criteria (see below) to break near-ties in favour of a lighter or
    cheaper build. The number of MPPT controllers required is still not considered.
  - On a 24 V or 48 V system, set the **minimum string voltage** in the optimizer dropdown
    and fill in each model's **voltage**, so low-voltage panels are only planned where
    enough of them fit to make a usable series string. The presets plan against what the
    bank charges to (28.7 V and 56.5 V), not its nominal name; the threshold field takes
    any other figure.
- The `Fast` optimizer usually gives good results on simple layout
- The `Thorough` one usually gives noticeably better results on complex layouts with many keep-out zones.
- If you have the option, try moving the keep out zones and see if this gives better results

## Features

- **Surfaces** — plan any number of surfaces at once (roof plus one or two sidewalls,
  say), each with its own name, length × width (cm) and keep-outs. They are drawn stacked
  vertically on one canvas and all are optimized together. Edge margin and inter-panel gap
  are configured once and apply to every surface.
- **Rigid / flexible panels** — each panel model is either rigid (framed) or flexible
  (bendable), and each surface declares which it accepts: **Rigid**, **Flexible** or
  **Both**. A curved or thin wall can then be planned with flexible models only while the
  roof keeps its framed ones. Surfaces default to Both, so nothing changes until you
  restrict one; if a surface allows a type you have no model selected for, it says so
  inline rather than silently coming back empty.
- **Keep-out areas** — belong to a surface; add by dragging on that surface in the canvas
  or via the list, **drag to move** and **drag edges/corners to resize**. Each shows its
  live size, and while dragging or resizing, golden guide lines mark the edge positions and
  the clearance to each edge of the surface it sits on.
- **Grid snapping** — optional snap (Off / 1 / 5 / 10 cm) for all canvas edits, with a
  grid overlay at the coarser steps.
- **Canvas** — all surfaces stacked vertically and labeled, with the one the sidebar
  edits highlighted. Rulers on both axes (the vertical one restarts at 0 per surface, so
  every reading is in that surface's own coordinates), a mouse-position crosshair with a
  live cm readout, and color-coded panels labeled with model name and Wp (long names wrap
  to the panel, and are truncated when even the wrapped label has no room).
- **Panel catalog** — any number of models (name, length, width, power in Wp), listed as
  compact one-line entries; click one to edit it in a dialog. Each model is marked **rigid**
  or **flexible**, which decides the surfaces it can go on. Optional **voltage** and
  **current** enable a series/parallel wiring readout, and optional **weight** and
  **price** feed the secondary optimization criteria.
- **Optimizer** — selects and places panels to maximize total Wp. Panels may be rotated
  90° and different models mixed. Effort and criteria live in the dropdown next to the
  Optimize button. Two effort levels:
  - **Fast** — an instant, deterministic heuristic sweep (the default).
  - **Thorough** — a deeper ~5-second search that runs in a Web Worker with live
    progress and a Cancel button; never returns a worse result than Fast.
- **Minimum string voltage** *(optional)* — a hard filter in the optimizer dropdown for
  24 V or 48 V systems, with one-click **Off / 24 V / 48 V** presets and an editable
  threshold. Panels of one model are wired as a series string, so a model whose Vmp is
  below the threshold is only placed when enough of them fit on the same surface to add
  up to it — a single 12 V panel is never planned for a 24 V system, but three of them
  are. The presets are named after the *nominal* system voltage but plan against what the
  bank actually charges to: **28.7 V** for a 24 V system and **56.5 V** for a 48 V one
  (see below). Models with no voltage recorded are never restricted, and the dropdown says
  how many those are. A **Details…** toggle expands the reasoning together with a list of
  every restricted model and the string it needs (e.g. `100 W mono · 2 × 18 V`), which
  scrolls rather than growing the panel when the catalog is large.
- **Secondary criteria** *(optional)* — rank near-equal layouts by **weight**, **price**
  and/or **number of distinct panel models used**, in a priority order you choose. Total
  Wp remains the primary objective, and the adjustable **tolerance** (default 10%) applies
  at every level: only layouts within it of the best Wp are reordered, and among those, a
  later criterion decides between layouts within the tolerance of the earlier criterion's
  best value. Models missing a weight or price count as zero for that criterion, and the
  picker says how many are missing.
- **Results** — with more than one surface, a **combined** card totals the Wp, panel
  count, weight and price of the options currently selected across all surfaces, and each
  surface then gets its own section whose option you pick independently. Per surface, up to
  5 distinct layout options (plus the highest-Wp layout as an extra
  entry when secondary criteria pushed it out of the top five), each showing total Wp, panel count,
  coverage, used area, **total weight and price**, and a per-model breakdown ordered
  by Wp. A total is shown as `—` when no placed model carries that field and prefixed with
  `≥` when only some do, so a partial sum is never presented as exact. With secondary
  criteria active each option also states its **offset from the highest-Wp layout**
  (e.g. `−7.4% vs max Wp`), and that layout is always among the options shown. When a
  model has voltage
  and current set, the box also lists the **series** and **parallel** voltage/current for
  that many identical panels.
- **Languages** — the interface is available in **English** and **German**, switched from
  the 🌐 button in the toolbar, which opens a list of flags and native names. On narrow
  screens it collapses into the ⋯ menu alongside the file actions. The starting language
  follows the browser's own, and the choice is remembered. Numbers, areas and prices follow the language too (`9,5 kg` and
  `89 €` in German, `9.5 kg` and `€89` in English), and the example configuration a fresh
  session starts from is created in it. Names you type — surfaces, keep-outs, panel
  models — are your data and are never rewritten by a language switch.
- **Autosave** — the full configuration is saved to the Browser's `localStorage` and restored on reload.
- **Import / Export** — share or back up a configuration as JSON. Files exported by
  earlier single-roof versions still import: the roof becomes the first surface, keeping
  its keep-outs.
- **PDF export** — the **PDF** button writes the plan as it stands on screen to a report:
  a title block with the combined Wp, panel count, panel area, weight and price, then
  every surface drawn to scale (edge margin, keep-outs, and the selected option's panels
  labeled with model and Wp) under a scale bar, and finally a **table of the modules** —
  one row per placed model with its size, Wp, quantity, total Wp, weight and price, and a
  totals row. With more than one surface each also gets its own module table under its
  drawing, and each caption says which of the computed options is shown. Everything is
  drawn as vector graphics and real text, so it stays sharp when printed and its figures
  can be selected and searched; the report follows the UI language and its number and
  currency formats.



## How the optimizer works

Each surface is packed independently — no placement constraint crosses a surface
boundary, so optimizing each on its own and summing gives the joint best total Wp. Each
surface is packed from only the models it accepts (rigid, flexible or both), on top of the
models you have selected in the catalog. Per surface, the usable area is the surface inset
by the edge margin, with each keep-out removed, producing a set of free rectangles. Panels are packed as gap-inclusive footprints and
centered within them (so a panel can sit flush against a boundary). A greedy MaxRects
packer fills the rectangles trying both orientations per placement.

**Fast** runs that packer across many priority orderings (by Wp-density, area, power,
each-option-last, single-model fills, and seeded shuffles), three fit rules, three
orientation modes, and a set of *tightened geometries* (slightly enlarged keep-outs /
margins), keeping the highest-Wp result. It is deterministic.

**Thorough** is seeded with the Fast result and then runs a time-budgeted
**GRASP + ruin-and-recreate local search**: randomized greedy constructions, repeatedly
removing panels from a random region and re-filling, plus a pass that upgrades panels to
higher-power models that still fit. It streams its best layouts so a cancel keeps the
best found so far.

Both effort levels keep the best layout of each distinct *panel composition* (the per-model
counts), so the candidate pool holds genuinely different builds rather than reshuffles of
the same one.

**The preset thresholds** are deliberately not the nominal system voltage, which no
system charges at. Each is **95% of the bank's charge-end voltage, plus 1 V**:

| System | Charges to | Threshold |
| --- | --- | --- |
| 24 V | 29.2 V | **28.7 V** |
| 48 V | 58.4 V | **56.5 V** |

The charge-end figure is 3.65 V per LiFePO4 cell over 8 or 16 cells, which is also where
the other common chemistries land (a 7S/14S Li-ion NMC pack tops out at 29.4 / 58.8 V,
AGM absorption at 28.8 / 57.6 V), so one figure per system voltage covers them all.

Sitting *below* the charge-end voltage — and below the ~5 V an MPPT wants on top of the
battery to start — is the point: a string that drops out over the last few percent of a
charge costs almost nothing, because the battery is nearly full by the time it does,
whereas demanding the full charge-end plus start-up margin would rule out panels that
carry all but the last minutes of the charge. Panel voltage also falls with cell
temperature, which the catalog does not record, so the headroom is left rather than
demanded. Type any other figure into the threshold field to plan against your own numbers.

**Minimum string voltage** is a constraint rather than a criterion, so it acts *during*
the search. Whether a sub-threshold model is admissible depends on how many of it a layout
places, which is not known until the panels are down, so every packing result passes
through a filter that drops the panels of any model short of its series count. The area
they held becomes free space again, so the thorough search's next refill can hand it to a
compliant model instead, and the fast sweep additionally packs orderings built only from
the models that clear the threshold unaided. When no model in the catalog is restricted
the filter is the identity function and both searches run exactly as before.

**Secondary criteria** are applied to that pool after the search, never during it: the
layouts within the tolerance band below the best total Wp are treated as equivalent and
sorted by the selected criteria in priority order (each lower-is-better), with total Wp as
the final tie-break. Layouts below the cutoff keep pure Wp order and always rank after the
band, so a criterion can never promote a layout that gives up more power than allowed.
Because each criterion depends only on a layout's composition, ranking the deduplicated
pool is exact.

The tolerance is what makes a *second* criterion reachable. Weight and price are
continuous, so demanding an exact tie before consulting the next criterion means it is
essentially never consulted — one real catalog produced 44 distinct weights across 56
candidate layouts. Instead each criterion peels off a tier: everything within the tolerance
of its best value is ranked by the next criterion, the remainder forms the following tier
under the same rule, and total Wp breaks the final tie. At tolerance 0 this reduces exactly
to lexicographic ordering. One consequence worth knowing: a single criterion no longer
guarantees the strict minimum — it guarantees "within the tolerance of the minimum, then
the most Wp".

See `src/lib/packing.ts`, `src/lib/optimize.ts`, `src/lib/optimizeThorough.ts`,
`src/lib/ranking.ts`, and `src/lib/optimizer.worker.ts`.


## Development

```bash
npm install
npm run dev        # dev server
npm run test       # unit tests (geometry, packing, optimizers)
npm run check      # type-check
npm run build      # static production build -> dist/
```

The build is fully static — `dist/` can be hosted on any static file server.


## Adding a language

Translations live in `src/lib/i18n/` with no runtime dependency: `en.ts` is the source
catalog, and every other locale is typed against its keys, so a missing or stale message
is a compile error rather than an English string leaking into the UI.

1. Copy `de.ts` to `<code>.ts`, keep the `Catalog` type annotation, and translate the values.
   A message is a plain string, or a `{ one, other }` pair where a count decides;
   `{name}` placeholders are filled at render time.
2. Register it in `src/lib/i18n/index.ts` — add it to `CATALOGS` and to `LOCALES` (the
   picker shows each language in its own words).
3. `npm run test` checks the catalogs against each other: same keys, same placeholders,
   same plural forms, nothing empty.

Components read the `t` store (`{$t('results.title')}`) and the locale-bound number and
currency formatters (`{$fmt.area(cm2)}`); plain modules use the non-reactive `msg()`.


## Tech

Svelte 5 + Vite + TypeScript. Canvas rendering. Web Worker for the thorough optimizer.
`Intl` for locale-aware numbers. jsPDF (with `jspdf-autotable`) for the PDF export, loaded
on demand so it stays out of the initial bundle. No backend, no i18n library.


## AI Disclaimer

This was largely built through the use of LLM coding agents. Do with that information what you will.
