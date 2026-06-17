<script lang="ts">
  import { config, updateKeepOut, removeKeepOut, addKeepOut, selectedKeepOut } from '../lib/stores';

  function num(e: Event): number {
    return Math.round(Number((e.target as HTMLInputElement).value) || 0);
  }
</script>

<section class="card">
  <div class="head">
    <h2>Keep-out areas</h2>
    <button class="ghost" onclick={() => addKeepOut({ x: 10, y: 10, w: 40, h: 40 })}>+ Add</button
    >
  </div>
  <p class="hint">Hatches, vents, antennas. Drag on the canvas to draw one.</p>

  {#if $config.keepOuts.length === 0}
    <p class="empty">No keep-out areas.</p>
  {/if}

  {#each $config.keepOuts as ko (ko.id)}
    <div
      class="row"
      class:selected={$selectedKeepOut === ko.id}
      onclick={() => selectedKeepOut.set(ko.id)}
      onkeydown={(e) => e.key === 'Enter' && selectedKeepOut.set(ko.id)}
      role="button"
      tabindex="0"
    >
      <input
        class="label"
        type="text"
        value={ko.label ?? ''}
        oninput={(e) => updateKeepOut(ko.id, { label: (e.target as HTMLInputElement).value })}
      />
      <button
        class="danger ghost del"
        title="Remove"
        onclick={(e) => {
          e.stopPropagation();
          removeKeepOut(ko.id);
        }}>×</button
      >
      <div class="dims">
        <label>
          X
          <input type="number" value={ko.x} oninput={(e) => updateKeepOut(ko.id, { x: num(e) })} />
        </label>
        <label>
          Y
          <input type="number" value={ko.y} oninput={(e) => updateKeepOut(ko.id, { y: num(e) })} />
        </label>
        <label>
          L
          <input type="number" value={ko.w} oninput={(e) => updateKeepOut(ko.id, { w: num(e) })} />
        </label>
        <label>
          W
          <input type="number" value={ko.h} oninput={(e) => updateKeepOut(ko.id, { h: num(e) })} />
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
  .label {
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
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .dims label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 0;
  }
</style>
