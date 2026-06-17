<script lang="ts">
  import { config, updateRoof } from '../lib/stores';

  function num(e: Event): number {
    return Math.max(0, Number((e.target as HTMLInputElement).value) || 0);
  }
</script>

<section class="card">
  <h2>Roof area</h2>
  <p class="hint">All measurements in centimeters.</p>
  <div class="grid">
    <div>
      <label for="roof-w">Length</label>
      <input
        id="roof-w"
        type="number"
        min="0"
        value={$config.roof.width}
        oninput={(e) => updateRoof({ width: num(e) })}
      />
    </div>
    <div>
      <label for="roof-h">Width (depth)</label>
      <input
        id="roof-h"
        type="number"
        min="0"
        value={$config.roof.height}
        oninput={(e) => updateRoof({ height: num(e) })}
      />
    </div>
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
  h2 {
    font-size: 14px;
    margin-bottom: 4px;
  }
  .hint {
    color: var(--text-dim);
    font-size: 12px;
    margin: 0 0 10px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
</style>
