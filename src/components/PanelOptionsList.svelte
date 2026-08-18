<script lang="ts">
  import { config, removePanelOption, setPanelEnabled } from '../lib/stores';
  import { panelColor } from '../lib/colors';
  import { isPanelEnabled, isPanelFlexible } from '../lib/panels';
  import { fmtNum, fmtPrice } from '../lib/format';
  import type { PanelOption } from '../lib/types';
  import PanelOptionModal from './PanelOptionModal.svelte';

  let modalOpen = $state(false);
  let editing = $state<PanelOption | null>(null);

  function openAdd() {
    editing = null;
    modalOpen = true;
  }

  function openEdit(opt: PanelOption) {
    editing = opt;
    modalOpen = true;
  }

  function remove(opt: PanelOption) {
    if (confirm(`Remove the panel model “${opt.name}”?`)) removePanelOption(opt.id);
  }

  // Displayed alphabetically, but each row keeps its option's index in the stored
  // list so the swatch matches the canvas and the results breakdown. Numeric-aware
  // so "Model 2" sorts before "Model 10".
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const sorted = $derived(
    $config.panelOptions
      .map((opt, i) => ({ opt, i }))
      .sort((a, b) => collator.compare(a.opt.name, b.opt.name)),
  );

  // Condensed one-line spec; optional fields are simply left out when unset.
  function specOf(o: PanelOption): string {
    return [
      `${fmtNum(o.width)}×${fmtNum(o.height)} cm`,
      `${fmtNum(o.power)} Wp`,
      o.weight ? `${fmtNum(o.weight)} kg` : null,
      o.price ? fmtPrice(o.price) : null,
      // Rigid is the default, so only the exception is worth a word.
      isPanelFlexible(o) ? 'flexible' : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  const noneSelected = $derived(
    $config.panelOptions.length > 0 && !$config.panelOptions.some(isPanelEnabled),
  );
</script>

<section class="card">
  <div class="head">
    <h2>Panel options</h2>
    <button class="ghost" onclick={openAdd}>+ Add</button>
  </div>
  <p class="hint">
    Candidate models the optimizer can choose from. Untick one to leave it out; click one to
    edit it.
  </p>

  {#if $config.panelOptions.length === 0}
    <p class="empty">No panel models yet. Add at least one.</p>
  {:else if noneSelected}
    <p class="empty">All models are deselected — tick at least one to optimize.</p>
  {/if}

  {#each sorted as { opt, i } (opt.id)}
    <div class="row" class:off={!isPanelEnabled(opt)}>
      <input
        type="checkbox"
        class="pick"
        checked={isPanelEnabled(opt)}
        title="Use {opt.name} when optimizing"
        aria-label="Use {opt.name} when optimizing"
        onchange={(e) => setPanelEnabled(opt.id, e.currentTarget.checked)}
      />
      <button class="main" onclick={() => openEdit(opt)} title="Edit {opt.name}">
        <span class="swatch" style="background: {panelColor(i)}"></span>
        <span class="text">
          <span class="name">{opt.name}</span>
          <span class="spec">{specOf(opt)}</span>
        </span>
      </button>
      <button
        class="danger ghost del"
        title="Remove {opt.name}"
        aria-label="Remove {opt.name}"
        onclick={() => remove(opt)}>×</button
      >
    </div>
  {/each}
</section>

<PanelOptionModal bind:open={modalOpen} option={editing} />

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
    gap: 4px;
    border-top: 1px solid var(--border);
  }
  /* Deselected models stay readable but visibly out of the running. */
  .row.off .main {
    opacity: 0.45;
  }
  .pick {
    width: auto;
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .main {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-width: 0;
    padding: 8px 8px 8px 6px;
    margin: 0 -8px 0 -2px;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: 6px;
  }
  .main:hover {
    background: var(--panel-bg-2);
  }
  .swatch {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .spec {
    font-size: 11px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .del {
    font-size: 18px;
    line-height: 1;
    padding: 2px 8px;
    border-color: transparent;
  }
</style>
