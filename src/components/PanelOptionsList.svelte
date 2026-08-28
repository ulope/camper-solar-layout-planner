<script lang="ts">
  import { config, removePanelOption, setPanelEnabled } from '../lib/stores';
  import { panelColor } from '../lib/colors';
  import { isPanelEnabled, isPanelFlexible } from '../lib/panels';
  import { fmt, t } from '../lib/i18n';
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
    if (confirm($t('panels.removeConfirm', { name: opt.name }))) removePanelOption(opt.id);
  }

  // Displayed alphabetically in the UI language, but each row keeps its option's index
  // in the stored list so the swatch matches the canvas and the results breakdown.
  const sorted = $derived(
    $config.panelOptions
      .map((opt, i) => ({ opt, i }))
      .sort((a, b) => $fmt.collator.compare(a.opt.name, b.opt.name)),
  );

  // Condensed one-line spec; optional fields are simply left out when unset.
  function specOf(o: PanelOption): string {
    return [
      $t('panels.size', { width: $fmt.num(o.width), height: $fmt.num(o.height) }),
      $t('canvas.power', { power: $fmt.num(o.power) }),
      o.weight ? $fmt.weight(o.weight) : null,
      o.price ? $fmt.price(o.price) : null,
      // Rigid is the default, so only the exception is worth a word.
      isPanelFlexible(o) ? $t('panels.flexible') : null,
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
    <h2>{$t('panels.title')}</h2>
    <button class="ghost" onclick={openAdd}>{$t('common.add')}</button>
  </div>
  <p class="hint">{$t('panels.hint')}</p>

  {#if $config.panelOptions.length === 0}
    <p class="empty">{$t('panels.empty')}</p>
  {:else if noneSelected}
    <p class="empty">{$t('panels.noneSelected')}</p>
  {/if}

  {#each sorted as { opt, i } (opt.id)}
    <div class="row" class:off={!isPanelEnabled(opt)}>
      <input
        type="checkbox"
        class="pick"
        checked={isPanelEnabled(opt)}
        title={$t('panels.use', { name: opt.name })}
        aria-label={$t('panels.use', { name: opt.name })}
        onchange={(e) => setPanelEnabled(opt.id, e.currentTarget.checked)}
      />
      <button class="main" onclick={() => openEdit(opt)} title={$t('panels.edit', { name: opt.name })}>
        <span class="swatch" style="background: {panelColor(i)}"></span>
        <span class="text">
          <span class="name">{opt.name}</span>
          <span class="spec">{specOf(opt)}</span>
        </span>
      </button>
      <button
        class="danger ghost del"
        title={$t('panels.remove', { name: opt.name })}
        aria-label={$t('panels.remove', { name: opt.name })}
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
    gap: 8px;
  }
  /* Translations make the action wider than English does; let the heading wrap instead
     of breaking the button across two lines. */
  .head button {
    flex: none;
    white-space: nowrap;
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
