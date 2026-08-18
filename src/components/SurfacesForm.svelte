<script lang="ts">
  import {
    config,
    activeSurfaceId,
    addSurface,
    updateSurface,
    removeSurface,
  } from '../lib/stores';
  import { num } from '../lib/format';
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
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
</style>
