<script lang="ts">
  import { config, addPanelOption, updatePanelOption, removePanelOption } from '../lib/stores';
  import { panelColor } from '../lib/colors';

  function num(e: Event): number {
    return Math.max(0, Number((e.target as HTMLInputElement).value) || 0);
  }

  // Optional numeric field: empty clears it (undefined), otherwise a non-negative number.
  function optNum(e: Event): number | undefined {
    const raw = (e.target as HTMLInputElement).value.trim();
    if (raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }
</script>

<section class="card">
  <div class="head">
    <h2>Panel options</h2>
    <button class="ghost" onclick={addPanelOption}>+ Add</button>
  </div>
  <p class="hint">Candidate models the optimizer can choose from. V &amp; A are optional — fill both for series/parallel wiring figures.</p>

  {#if $config.panelOptions.length === 0}
    <p class="empty">No panel models yet. Add at least one.</p>
  {/if}

  {#each $config.panelOptions as opt, i (opt.id)}
    <div class="row">
      <span class="swatch" style="background: {panelColor(i)}"></span>
      <input
        class="name"
        type="text"
        value={opt.name}
        oninput={(e) => updatePanelOption(opt.id, { name: (e.target as HTMLInputElement).value })}
      />
      <button class="danger ghost del" title="Remove" onclick={() => removePanelOption(opt.id)}
        >×</button
      >
      <div class="dims">
        <label>
          L
          <input
            type="number"
            min="0"
            value={opt.width}
            oninput={(e) => updatePanelOption(opt.id, { width: num(e) })}
          />
        </label>
        <label>
          W
          <input
            type="number"
            min="0"
            value={opt.height}
            oninput={(e) => updatePanelOption(opt.id, { height: num(e) })}
          />
        </label>
        <label>
          Wp
          <input
            type="number"
            min="0"
            value={opt.power}
            oninput={(e) => updatePanelOption(opt.id, { power: num(e) })}
          />
        </label>
        <label>
          V
          <input
            type="number"
            min="0"
            placeholder="—"
            title="Voltage (optional, e.g. Vmp)"
            value={opt.voltage ?? ''}
            oninput={(e) => updatePanelOption(opt.id, { voltage: optNum(e) })}
          />
        </label>
        <label>
          A
          <input
            type="number"
            min="0"
            placeholder="—"
            title="Current (optional, e.g. Imp)"
            value={opt.current ?? ''}
            oninput={(e) => updatePanelOption(opt.id, { current: optNum(e) })}
          />
        </label>
      </div>
    </div>
  {/each}
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
  }
  .hint {
    color: var(--text-dim);
    font-size: 12px;
    margin: 4px 0 10px;
  }
  .empty {
    color: var(--text-dim);
    font-size: 13px;
    font-style: italic;
  }
  .row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 10px 0;
    border-top: 1px solid var(--border);
  }
  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    display: inline-block;
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
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
  }
  .dims label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 0;
  }
</style>
