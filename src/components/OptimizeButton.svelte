<script lang="ts">
  import Popover from './Popover.svelte';
  import {
    layoutStale,
    runOptimize,
    cancelOptimize,
    optimizerEffort,
    optimizing,
    optimizeProgress,
    rankOptions,
    panelDataGaps,
  } from '../lib/stores';
  import { ALL_CRITERIA, CRITERION_LABELS, type SecondaryCriterion } from '../lib/ranking';

  let optionsOpen = $state(false);

  const elapsedS = $derived(($optimizeProgress.elapsedMs / 1000).toFixed(1));
  const selected = $derived($rankOptions.criteria);
  const tolerancePct = $derived(Math.round($rankOptions.tolerance * 100));

  // Selected criteria first, in priority order; the rest keep their canonical order.
  const ordered = $derived([...selected, ...ALL_CRITERIA.filter((c) => !selected.includes(c))]);

  // Criteria that would silently score some models as zero.
  const warnings = $derived(
    selected
      .filter((c): c is 'weight' | 'price' => c === 'weight' || c === 'price')
      .map((c) => ({ c, missing: $panelDataGaps[c] }))
      .filter((w) => w.missing > 0),
  );

  function toggle(c: SecondaryCriterion) {
    rankOptions.update((r) => ({
      ...r,
      criteria: r.criteria.includes(c)
        ? r.criteria.filter((x) => x !== c)
        : [...r.criteria, c],
    }));
  }

  function move(c: SecondaryCriterion, dir: -1 | 1) {
    rankOptions.update((r) => {
      const list = [...r.criteria];
      const i = list.indexOf(c);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return r;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...r, criteria: list };
    });
  }

  function setTolerance(e: Event) {
    const pct = Number((e.target as HTMLInputElement).value);
    const clamped = Math.min(50, Math.max(0, Number.isFinite(pct) ? pct : 0));
    rankOptions.update((r) => ({ ...r, tolerance: clamped / 100 }));
  }
</script>

{#if $optimizing}
  <span class="progress" aria-live="polite">
    Optimizing… {elapsedS}s · {$optimizeProgress.bestPower} Wp
  </span>
  <button class="danger" onclick={cancelOptimize}>Cancel</button>
{:else}
  <Popover bind:open={optionsOpen} label="Optimizer options">
    {#snippet trigger(toggleOpen: () => void)}
      <div class="split" class:pulse={$layoutStale}>
        <button class="primary go" onclick={runOptimize}>⚡ Optimize</button>
        <button
          class="primary caret"
          aria-label="Optimizer options"
          aria-expanded={optionsOpen}
          title="Optimizer options"
          onclick={toggleOpen}>▾</button
        >
      </div>
    {/snippet}

    <div class="opts">
      <p class="group">Effort</p>
      <div class="effort" role="group" aria-label="Optimizer effort">
        <button
          class="seg"
          class:on={$optimizerEffort === 'fast'}
          onclick={() => optimizerEffort.set('fast')}
          title="Instant heuristic">⚡ Fast</button
        >
        <button
          class="seg"
          class:on={$optimizerEffort === 'thorough'}
          onclick={() => optimizerEffort.set('thorough')}
          title="Deeper ~5s search">🔎 Thorough</button
        >
      </div>

      <p class="group">Secondary criteria</p>
      <ul class="criteria">
        {#each ordered as c (c)}
          {@const rank = selected.indexOf(c)}
          <li>
            <label class="crit">
              <input type="checkbox" checked={rank >= 0} onchange={() => toggle(c)} />
              {#if rank >= 0}<span class="ord">{rank + 1}.</span>{/if}
              <span class="cname">{CRITERION_LABELS[c]}</span>
            </label>
            {#if rank >= 0}
              <span class="move">
                <button
                  class="ghost arrow"
                  title="Higher priority"
                  aria-label="Raise priority of {CRITERION_LABELS[c]}"
                  disabled={rank === 0}
                  onclick={() => move(c, -1)}>↑</button
                >
                <button
                  class="ghost arrow"
                  title="Lower priority"
                  aria-label="Lower priority of {CRITERION_LABELS[c]}"
                  disabled={rank === selected.length - 1}
                  onclick={() => move(c, 1)}>↓</button
                >
              </span>
            {/if}
          </li>
        {/each}
      </ul>

      <label class="tol" for="tolerance">
        Tolerance
        <span class="tolin">
          <input
            id="tolerance"
            type="number"
            min="0"
            max="50"
            step="1"
            value={tolerancePct}
            oninput={setTolerance}
          />
          <span class="pct">%</span>
        </span>
      </label>
      <p class="note">
        Total Wp still wins. The tolerance applies at every level: layouts within
        {tolerancePct}% of the best Wp are ranked by the first criterion, and those within
        {tolerancePct}% of <em>its</em> best value are decided by the next.
      </p>

      {#each warnings as w (w.c)}
        <p class="warn">
          {w.missing} of {$panelDataGaps.total} model{$panelDataGaps.total === 1 ? '' : 's'} have no
          {w.c === 'weight' ? 'weight' : 'price'} — counted as 0.
        </p>
      {/each}
    </div>
  </Popover>
{/if}

<style>
  .split {
    display: inline-flex;
    border-radius: 6px;
  }
  .go {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .caret {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 1px solid rgba(0, 0, 0, 0.25);
    padding: 6px 9px;
  }
  .progress {
    font-size: 12px;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .danger {
    background: rgba(229, 83, 75, 0.15);
    border: 1px solid #e5534b;
    color: #e5534b;
  }
  .pulse {
    border-radius: 6px;
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(245, 166, 35, 0.5);
    }
    50% {
      box-shadow: 0 0 0 6px rgba(245, 166, 35, 0);
    }
  }

  .opts {
    width: 258px;
    max-width: 100%;
  }
  .group {
    color: var(--text-dim);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 6px;
  }
  .group:not(:first-child) {
    margin-top: 14px;
  }
  .effort {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .seg {
    flex: 1;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .seg.on {
    background: var(--panel-bg-2);
    color: var(--text);
  }
  .criteria {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .criteria li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .crit {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 3px 0;
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
  }
  .crit input {
    width: auto;
    accent-color: var(--accent);
  }
  .ord {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .cname {
    white-space: nowrap;
  }
  .move {
    display: inline-flex;
    gap: 2px;
  }
  .arrow {
    padding: 0 6px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-dim);
  }
  .tol {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 14px 0 0;
    color: var(--text);
    font-size: 13px;
  }
  .tolin {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .tolin input {
    width: 64px;
  }
  .pct {
    color: var(--text-dim);
  }
  .note em {
    font-style: normal;
    color: var(--text);
  }
  .note,
  .warn {
    font-size: 11px;
    color: var(--text-dim);
    margin: 6px 0 0;
    line-height: 1.4;
  }
  .warn {
    color: var(--accent);
  }
</style>
