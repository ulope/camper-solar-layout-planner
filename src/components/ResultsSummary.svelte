<script lang="ts">
  import { config, layouts, selectedLayout } from '../lib/stores';
  import { panelColor } from '../lib/colors';
  import type { Layout } from '../lib/types';

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

  const fmtArea = (cm2: number) => `${(cm2 / 10000).toFixed(2)} m²`;
  const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  let hasResults = $derived($layouts.length > 0);
  let noFit = $derived($layouts.length > 0 && $layouts.every((l) => l.placements.length === 0));
</script>

<section class="card">
  <div class="head">
    <h2>Results</h2>
    {#if hasResults && !noFit}
      <span class="count">{$layouts.length} option{$layouts.length > 1 ? 's' : ''}</span>
    {/if}
  </div>

  {#if !hasResults}
    <p class="empty">Click <strong>Optimize</strong> to compute layouts.</p>
  {:else if noFit}
    <p class="empty">No panels fit in the available area. Try smaller panels or a larger roof.</p>
  {:else}
    <p class="hint">Select an option to preview it on the roof.</p>
    {#each $layouts as l, i (i)}
      <button
        class="option"
        class:active={$selectedLayout === i}
        onclick={() => selectedLayout.set(i)}
      >
        <div class="orow">
          <span class="otitle">
            Option {i + 1}
            {#if i === 0}<span class="badge">Best</span>{/if}
          </span>
          <span class="power">{l.totalPower} <span class="wp">Wp</span></span>
        </div>
        <div class="meta">
          {l.panelCount} panel{l.panelCount === 1 ? '' : 's'} · {Math.round(l.coverage * 100)}% coverage
          · {fmtArea(l.usedArea)}
        </div>
        <div class="breakdown">
          {#each breakdownFor(l) as b (b.id)}
            <span class="chip">
              <span class="swatch" style="background: {b.color}"></span>
              {b.name} × {b.count}
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
  .empty {
    color: var(--text-dim);
    font-size: 13px;
    margin: 0;
  }
  .hint {
    color: var(--text-dim);
    font-size: 12px;
    margin: 0 0 10px;
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
