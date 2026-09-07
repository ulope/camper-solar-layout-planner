<script lang="ts">
  import { config, panelColors, setPanelEnabled } from '../lib/stores';
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

  // Displayed alphabetically in the UI language; the stored order is what the color
  // assignment keys off, so the swatch matches the canvas and the results breakdown.
  const sorted = $derived(
    [...$config.panelOptions].sort((a, b) => $fmt.collator.compare(a.name, b.name)),
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

<div class="list">
  {#if $config.panelOptions.length === 0}
    <p class="empty">{$t('panels.empty')}</p>
  {:else if noneSelected}
    <p class="empty">{$t('panels.noneSelected')}</p>
  {/if}

  {#each sorted as opt (opt.id)}
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
        <span class="swatch" style="background: {$panelColors.get(opt.id) ?? panelColor(0)}"></span>
        <span class="text">
          <span class="name">{opt.name}</span>
          <span class="spec">{specOf(opt)}</span>
        </span>
      </button>
    </div>
  {/each}

  <button class="ghost add" onclick={openAdd}>{$t('panels.add')}</button>
</div>

<PanelOptionModal bind:open={modalOpen} option={editing} />

<style>
  .empty {
    color: var(--text-dim);
    font-size: 13px;
    font-style: italic;
  }
  .row {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 4px;
  }
  .row + .row {
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
    padding: 6px 6px 6px 4px;
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
  .add {
    margin-top: 6px;
    width: 100%;
    font-size: 12px;
    padding: 5px 8px;
  }
</style>
