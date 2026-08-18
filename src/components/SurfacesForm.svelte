<script lang="ts">
  import {
    config,
    activeSurfaceId,
    addSurface,
    updateSurface,
    removeSurface,
  } from '../lib/stores';
  import { num } from '../lib/format';
  import { isPanelEnabled, isPanelFlexible } from '../lib/panels';
  import type { AllowedPanels } from '../lib/types';

  const ALLOWED: { value: AllowedPanels; label: string; title: string }[] = [
    { value: 'rigid', label: 'Rigid', title: 'Only framed panels may be placed here' },
    { value: 'flexible', label: 'Flexible', title: 'Only bendable panels may be placed here' },
    { value: 'both', label: 'Both', title: 'Any panel may be placed here' },
  ];

  /**
   * Whether a surface's allowance rules out every model the optimizer would consider —
   * the surface would come back empty for a reason that is easy to miss otherwise.
   * 'both' can never do this, so it never warns.
   */
  function starvedBy(allows: AllowedPanels): boolean {
    if (allows === 'both') return false;
    const wantFlexible = allows === 'flexible';
    return !$config.panelOptions.some(
      (o) => isPanelEnabled(o) && isPanelFlexible(o) === wantFlexible,
    );
  }
</script>

<section class="card">
  <div class="head">
    <h2>Surfaces</h2>
    <button class="ghost" onclick={() => addSurface()}>+ Add</button>
  </div>
  <p class="hint">Roof, sidewalls, … All measurements in centimeters.</p>

  {#each $config.surfaces as s (s.id)}
    <div
      class="row"
      class:selected={$activeSurfaceId === s.id}
      onclick={() => activeSurfaceId.set(s.id)}
      onkeydown={(e) => e.key === 'Enter' && activeSurfaceId.set(s.id)}
      role="button"
      tabindex="0"
    >
      <input
        class="name"
        type="text"
        aria-label="Surface name"
        value={s.name}
        oninput={(e) => updateSurface(s.id, { name: (e.target as HTMLInputElement).value })}
      />
      {#if $config.surfaces.length > 1}
        <button
          class="danger ghost del"
          title="Remove surface"
          aria-label="Remove {s.name}"
          onclick={(e) => {
            e.stopPropagation();
            removeSurface(s.id);
          }}>×</button
        >
      {/if}
      <div class="dims">
        <label>
          Length
          <input
            type="number"
            min="0"
            value={s.width}
            oninput={(e) => updateSurface(s.id, { width: num(e) })}
          />
        </label>
        <label>
          Width (depth)
          <input
            type="number"
            min="0"
            value={s.height}
            oninput={(e) => updateSurface(s.id, { height: num(e) })}
          />
        </label>
      </div>
      <div class="allow">
        <span class="alabel">Panels</span>
        <div class="seg-group" role="group" aria-label="Panel types allowed on {s.name}">
          {#each ALLOWED as a (a.value)}
            <button
              class="seg"
              class:on={s.allowedPanels === a.value}
              title={a.title}
              onclick={(e) => {
                e.stopPropagation();
                updateSurface(s.id, { allowedPanels: a.value });
              }}>{a.label}</button
            >
          {/each}
        </div>
        {#if starvedBy(s.allowedPanels)}
          <p class="warn">
            No {s.allowedPanels} models are selected — nothing can be placed here.
          </p>
        {/if}
      </div>
    </div>
  {/each}
</section>

<section class="card">
  <h2>Spacing</h2>
  <p class="hint">Applies to every surface.</p>
  <div class="grid">
    <div>
      <label for="margin">Edge margin</label>
      <input
        id="margin"
        type="number"
        min="0"
        value={$config.edgeMargin}
        oninput={(e) => config.update((c) => ({ ...c, edgeMargin: num(e) }))}
      />
    </div>
    <div>
      <label for="gap">Panel gap</label>
      <input
        id="gap"
        type="number"
        min="0"
        value={$config.panelGap}
        oninput={(e) => config.update((c) => ({ ...c, panelGap: num(e) }))}
      />
    </div>
    <div>
      <label for="snap">Grid snap</label>
      <select
        id="snap"
        value={String($config.gridSnap)}
        onchange={(e) =>
          config.update((c) => ({ ...c, gridSnap: Number((e.target as HTMLSelectElement).value) }))}
      >
        <option value="0">Off</option>
        <option value="1">1 cm</option>
        <option value="5">5 cm</option>
        <option value="10">10 cm</option>
      </select>
    </div>
  </div>
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
    align-items: center;
  }
  h2 {
    font-size: 14px;
    margin-bottom: 4px;
  }
  .hint {
    color: var(--text-dim);
    font-size: 12px;
    margin: 0 0 10px;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 10px 8px;
    margin: 0 -8px;
    border-top: 1px solid var(--border);
    border-radius: 6px;
  }
  .row.selected {
    background: rgba(74, 158, 255, 0.12);
  }
  .name {
    font-weight: 500;
  }
  .del {
    font-size: 18px;
    line-height: 1;
    padding: 2px 8px;
  }
  .dims {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .dims label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 0;
  }
  .allow {
    grid-column: 1 / -1;
    margin-top: 8px;
  }
  .alabel {
    display: block;
    color: var(--text-dim);
    font-size: 12px;
    margin-bottom: 2px;
  }
  /* Segmented picker, matching the optimizer's effort control. */
  .seg-group {
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
    padding: 5px 8px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .seg.on {
    background: var(--panel-bg-2);
    color: var(--text);
  }
  .warn {
    color: var(--accent);
    font-size: 11px;
    line-height: 1.4;
    margin: 6px 0 0;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
</style>
