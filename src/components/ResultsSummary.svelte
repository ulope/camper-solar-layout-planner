<script lang="ts">
  import {
    config,
    layoutsBySurface,
    selectedBySurface,
    selectedLayouts,
    selectSurfaceLayout,
    rankOptions,
  } from '../lib/stores';
  import { panelColor } from '../lib/colors';
  import { isPanelFlexible } from '../lib/panels';
  import { CRITERION_LABELS, layoutFieldStat, optionsById, type FieldStat } from '../lib/ranking';
  import { fmtArea, fmtPrice, fmtNum as fmtDec } from '../lib/format';
  import type { Layout } from '../lib/types';

  const byId = $derived(optionsById($config.panelOptions));

  const FIELD_NAMES = { weight: 'weight', price: 'price' } as const;

  /** Render one weight/price figure from its stat, keeping the "≥" / "—" semantics. */
  function renderStat(stat: FieldStat, field: 'weight' | 'price') {
    const { total, missing, models } = stat;
    const name = FIELD_NAMES[field];
    if (models === 0 || missing === models) {
      return { text: '—', partial: false, title: `No placed model has a ${name}.` };
    }
    const value = field === 'weight' ? `${fmtDec(total)} kg` : fmtPrice(total);
    if (missing === 0) return { text: value, partial: false, title: '' };
    return {
      text: `≥ ${value}`,
      partial: true,
      title: `${missing} of ${models} placed models have no ${name} — the total is a lower bound.`,
    };
  }

  /**
   * Weight / price total for one option. Always renders: an em dash when no placed model
   * carries the field, and a "≥" prefix when only some do, so a partial sum is never
   * shown as if it were exact.
   */
  function statFor(l: Layout, field: 'weight' | 'price') {
    return renderStat(layoutFieldStat(l, byId, field), field);
  }

  // ----- Combined totals across the surfaces' currently selected layouts -----

  const chosen = $derived(
    $config.surfaces.map((s) => $selectedLayouts[s.id]).filter((l): l is Layout => l !== null),
  );

  const combined = $derived({
    totalPower: chosen.reduce((s, l) => s + l.totalPower, 0),
    panelCount: chosen.reduce((s, l) => s + l.panelCount, 0),
    usedArea: chosen.reduce((s, l) => s + l.usedArea, 0),
  });

  /**
   * Weight / price summed across surfaces. Data-completeness counts are summed too, so a
   * gap on any surface still marks the combined figure as a lower bound.
   */
  function combinedStat(field: 'weight' | 'price') {
    const sum = chosen.reduce<FieldStat>(
      (acc, l) => {
        const s = layoutFieldStat(l, byId, field);
        return {
          total: acc.total + s.total,
          missing: acc.missing + s.missing,
          models: acc.models + s.models,
        };
      },
      { total: 0, missing: 0, models: 0 },
    );
    return renderStat(sum, field);
  }

  // ----- Per-surface presentation -----

  const anyPartial = $derived(
    Object.values($layoutsBySurface)
      .flat()
      .some((l) => statFor(l, 'weight').partial || statFor(l, 'price').partial),
  );

  /**
   * How far an option sits below its surface's power optimum, or null when it is the
   * optimum. rankLayouts guarantees the power optimum is among the returned options, so
   * the max over the list is the true optimum even when criteria reorder them.
   */
  function offsetFor(l: Layout, options: Layout[]) {
    const maxPower = options.reduce((m, o) => Math.max(m, o.totalPower), 0);
    if (!($rankOptions.criteria.length > 0 && options.length > 1)) return null;
    if (maxPower <= 0 || l.totalPower >= maxPower) return null;
    const absolute = maxPower - l.totalPower;
    return {
      pct: (absolute / maxPower) * 100,
      title: `${Math.round(absolute)} Wp less than the highest-Wp option (${maxPower} Wp).`,
    };
  }

  const showOffset = (options: Layout[]) =>
    $rankOptions.criteria.length > 0 && options.length > 1;

  // Per-model breakdown for a given layout, ordered by panel Wp (highest first).
  // Color is taken from the option's original index so it matches the canvas.
  function breakdownFor(l: Layout) {
    return $config.panelOptions
      .map((opt, i) => {
        const items = l.placements.filter((p) => p.optionId === opt.id);
        return {
          id: opt.id,
          name: opt.name,
          color: panelColor(i),
          count: items.length,
          power: items.reduce((s, p) => s + p.power, 0),
          wp: opt.power,
          flexible: isPanelFlexible(opt),
        };
      })
      .filter((b) => b.count > 0)
      .sort((a, b) => b.wp - a.wp);
  }

  // Series/parallel wiring figures for each model that has voltage + current set.
  // Series: voltages add, current constant. Parallel: currents add, voltage constant.
  function wiringFor(l: Layout) {
    return $config.panelOptions
      .map((opt) => {
        const count = l.placements.filter((p) => p.optionId === opt.id).length;
        if (count === 0 || !opt.voltage || !opt.current) return null;
        return {
          id: opt.id,
          name: opt.name,
          count,
          wp: opt.power,
          seriesV: opt.voltage * count,
          seriesA: opt.current,
          parallelV: opt.voltage,
          parallelA: opt.current * count,
        };
      })
      .filter((w): w is NonNullable<typeof w> => w !== null)
      .sort((a, b) => b.wp - a.wp);
  }

  const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  // With secondary criteria the top option is not necessarily the highest-Wp one, so
  // spell out why it leads.
  const criteriaNote = $derived(
    $rankOptions.criteria.length > 0
      ? `Ranked by ${$rankOptions.criteria.map((c) => CRITERION_LABELS[c].toLowerCase()).join(', then ')} among layouts within ${Math.round($rankOptions.tolerance * 100)}% of the best Wp.`
      : '',
  );

  const multi = $derived($config.surfaces.length > 1);
  const hasResults = $derived($config.surfaces.some((s) => ($layoutsBySurface[s.id]?.length ?? 0) > 0));
  const noFit = $derived(
    hasResults &&
      $config.surfaces.every((s) =>
        ($layoutsBySurface[s.id] ?? []).every((l) => l.placements.length === 0),
      ),
  );
</script>

<section class="card">
  <div class="head">
    <h2>Results</h2>
  </div>

  {#if !hasResults}
    <p class="empty">Click <strong>Optimize</strong> to compute layouts.</p>
  {:else if noFit}
    <p class="empty">
      No panels fit in the available area. Try smaller panels or a larger surface.
    </p>
  {:else}
    <p class="hint">Select an option to preview it on the canvas.</p>
    {#if criteriaNote}
      <p class="criteria-note">{criteriaNote}</p>
    {/if}
    {#if anyPartial}
      <p class="partial-note">Totals marked ≥ exclude models with no weight or price.</p>
    {/if}

    {#if multi}
      <div class="combined">
        <div class="orow">
          <span class="otitle">All surfaces</span>
          <span class="power">{combined.totalPower} <span class="wp">Wp</span></span>
        </div>
        <div class="meta">
          {combined.panelCount} panel{combined.panelCount === 1 ? '' : 's'} across
          {$config.surfaces.length} surfaces · {fmtArea(combined.usedArea)}
        </div>
        <div class="totals">
          {#each [{ field: 'weight', label: 'Weight' }, { field: 'price', label: 'Price' }] as const as s (s.field)}
            {@const stat = combinedStat(s.field)}
            <span class="tot">
              <span class="tlabel">{s.label}</span>
              <span class="tvalue" class:partial={stat.partial} title={stat.title}>{stat.text}</span>
            </span>
          {/each}
        </div>
      </div>
    {/if}

    {#each $config.surfaces as surface (surface.id)}
      {@const options = $layoutsBySurface[surface.id] ?? []}
      {#if multi}
        <div class="shead">
          <h3>{surface.name}</h3>
          {#if options.length > 0}
            <span class="count">{options.length} option{options.length > 1 ? 's' : ''}</span>
          {/if}
        </div>
      {:else if options.length > 0}
        <p class="count solo">{options.length} option{options.length > 1 ? 's' : ''}</p>
      {/if}

      {#if options.length === 0}
        <p class="empty">Not optimized yet.</p>
      {:else if options.every((l) => l.placements.length === 0)}
        <p class="empty">No panels fit on this surface.</p>
      {:else}
        {#each options as l, i (i)}
          <button
            class="option"
            class:active={($selectedBySurface[surface.id] ?? 0) === i}
            onclick={() => selectSurfaceLayout(surface.id, i)}
          >
            <div class="orow">
              <span class="otitle">
                Option {i + 1}
                {#if i === 0}<span class="badge">Best</span>{/if}
              </span>
              <span class="power">{l.totalPower} <span class="wp">Wp</span></span>
            </div>
            <div class="meta">
              {l.panelCount} panel{l.panelCount === 1 ? '' : 's'} · {Math.round(l.coverage * 100)}%
              coverage · {fmtArea(l.usedArea)}
              {#if showOffset(options)}
                {@const off = offsetFor(l, options)}
                {#if off}
                  <span class="offset" title={off.title}>· −{off.pct.toFixed(1)}% vs max Wp</span>
                {:else}
                  <span class="maxtag" title="Highest total Wp of the computed options."
                    >· max Wp</span
                  >
                {/if}
              {/if}
            </div>
            <div class="totals">
              {#each [{ field: 'weight', label: 'Weight' }, { field: 'price', label: 'Price' }] as const as s (s.field)}
                {@const stat = statFor(l, s.field)}
                <span class="tot">
                  <span class="tlabel">{s.label}</span>
                  <span class="tvalue" class:partial={stat.partial} title={stat.title}
                    >{stat.text}</span
                  >
                </span>
              {/each}
            </div>
            <div class="breakdown">
              {#each breakdownFor(l) as b (b.id)}
                <span class="chip">
                  <span class="swatch" style="background: {b.color}"></span>
                  {b.name} × {b.count}
                  {#if b.flexible}<span class="flex" title="Flexible panel">flex</span>{/if}
                </span>
              {/each}
            </div>
            {#if wiringFor(l).length > 0}
              <div class="wiring">
                <div class="whead">
                  <span></span><span>Series</span><span>Parallel</span>
                </div>
                {#each wiringFor(l) as w (w.id)}
                  <div class="wrow">
                    <span class="wname">{w.name} ×{w.count}</span>
                    <span>{fmtNum(w.seriesV)} V · {fmtNum(w.seriesA)} A</span>
                    <span>{fmtNum(w.parallelV)} V · {fmtNum(w.parallelA)} A</span>
                  </div>
                {/each}
              </div>
            {/if}
          </button>
        {/each}
      {/if}
    {/each}
  {/if}
</section>

<style>
  .card {
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 12px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
  }
  h2 {
    font-size: 14px;
  }
  .count {
    font-size: 12px;
    color: var(--text-dim);
  }
  .count.solo {
    margin: 0 0 8px;
  }
  .empty {
    color: var(--text-dim);
    font-size: 13px;
    margin: 0 0 8px;
  }
  .hint {
    color: var(--text-dim);
    font-size: 12px;
    margin: 0 0 10px;
  }
  .criteria-note {
    color: var(--accent);
    font-size: 11px;
    line-height: 1.4;
    margin: -4px 0 10px;
  }
  /* Surface heading: a divider that separates one surface's options from the next. */
  .shead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin: 14px 0 8px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .shead h3 {
    font-size: 13px;
    font-weight: 600;
  }
  /* The combined card is the sum of the selected options, not a selectable option
     itself, so it is accented rather than styled as a button. */
  .combined {
    background: rgba(245, 166, 35, 0.08);
    border: 1px solid var(--accent);
    border-radius: 7px;
    padding: 10px;
    margin-bottom: 8px;
  }
  .option {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--panel-bg-2);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 10px;
    margin-bottom: 8px;
    cursor: pointer;
    transition:
      border-color 0.12s,
      background 0.12s;
  }
  .option:hover {
    background: #28333f;
  }
  .option.active {
    border-color: var(--accent);
    background: rgba(245, 166, 35, 0.08);
  }
  .orow {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .otitle {
    font-weight: 600;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #1a1206;
    background: var(--accent);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .power {
    font-size: 20px;
    font-weight: 700;
    color: var(--accent);
  }
  .wp {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-dim);
  }
  .meta {
    font-size: 12px;
    color: var(--text-dim);
    margin-top: 3px;
  }
  .offset {
    white-space: nowrap;
  }
  .maxtag {
    color: var(--accent);
    white-space: nowrap;
  }
  /* Weight and price get their own row in a distinct color — as trailing meta text they
     were indistinguishable from coverage and area. */
  .totals {
    /* Side by side when they fit; the second drops to its own line rather than letting a
       value wrap mid-figure ("≥ 24.5 / kg") in a narrow panel. */
    display: flex;
    flex-wrap: wrap;
    gap: 3px 18px;
    margin-top: 7px;
    padding-top: 7px;
    border-top: 1px solid var(--border);
  }
  .tot {
    display: flex;
    align-items: baseline;
    gap: 5px;
    white-space: nowrap;
  }
  .tlabel {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-dim);
  }
  .tvalue {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent-2);
    font-variant-numeric: tabular-nums;
  }
  .tvalue.partial {
    font-weight: 500;
  }
  .partial-note {
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.4;
    margin: -4px 0 10px;
  }
  .breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 2px 8px;
  }
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  /* Rigid is the default, so only flexible models carry a marker. */
  .flex {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent-2);
  }
  .wiring {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .whead,
  .wrow {
    display: grid;
    grid-template-columns: 1.1fr 1fr 1fr;
    gap: 6px;
    align-items: baseline;
  }
  .whead {
    color: var(--text-dim);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 3px;
  }
  .wrow {
    padding: 1px 0;
  }
  .wname {
    color: var(--text-dim);
  }
</style>
