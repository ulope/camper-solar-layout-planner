<script lang="ts">
  import Modal from './Modal.svelte';
  import { addPanelOption, updatePanelOption, removePanelOption } from '../lib/stores';
  import { toNum, toOptNum } from '../lib/format';
  import { isPanelFlexible } from '../lib/panels';
  import { fmt, t } from '../lib/i18n';
  import type { PanelOption } from '../lib/types';

  // `option === null` means "add a new model". Edits happen on a local draft and are only
  // written back on Save, so Cancel / Esc discards them.
  let {
    open = $bindable(false),
    option = null,
  }: { open?: boolean; option?: PanelOption | null } = $props();

  // Number inputs bind to `number | null` (null while the field is empty).
  type Draft = { name: string; flexible: boolean } & Record<
    'width' | 'height' | 'power' | 'weight' | 'price' | 'voltage' | 'current',
    number | null
  >;

  function toDraft(o: PanelOption | null): Draft {
    if (!o) {
      return {
        name: $t('panelModal.defaultName'),
        width: 100,
        height: 50,
        power: 100,
        weight: null,
        price: null,
        voltage: null,
        current: null,
        flexible: false,
      };
    }
    return {
      name: o.name,
      width: o.width,
      height: o.height,
      power: o.power,
      weight: o.weight ?? null,
      price: o.price ?? null,
      voltage: o.voltage ?? null,
      current: o.current ?? null,
      flexible: isPanelFlexible(o),
    };
  }

  let draft = $state<Draft>(toDraft(null));

  // Re-seed the draft every time the modal opens.
  $effect(() => {
    if (open) draft = toDraft(option);
  });

  const width = $derived(toNum(draft.width));
  const height = $derived(toNum(draft.height));
  const power = $derived(toNum(draft.power));
  const weight = $derived(toOptNum(draft.weight));
  const price = $derived(toOptNum(draft.price));
  const areaM2 = $derived((width * height) / 10000);
  const valid = $derived(draft.name.trim() !== '' && width > 0 && height > 0 && power > 0);

  const stats = $derived(
    [
      areaM2 > 0 ? $fmt.area(width * height) : null,
      areaM2 > 0 && power > 0
        ? $t('panelModal.densityStat', { value: $fmt.num(Math.round(power / areaM2)) })
        : null,
      weight ? $fmt.weight(weight) : null,
      price && power > 0
        ? $t('panelModal.priceStat', { value: $fmt.priceExact(price / power) })
        : null,
    ]
      .filter(Boolean)
      .join(' · '),
  );

  function save() {
    if (!valid) return;
    const patch = {
      name: draft.name.trim(),
      width,
      height,
      power,
      weight,
      price,
      voltage: toOptNum(draft.voltage),
      current: toOptNum(draft.current),
      flexible: draft.flexible,
    };
    if (option) updatePanelOption(option.id, patch);
    else addPanelOption(patch);
    open = false;
  }

  function del() {
    if (!option) return;
    if (confirm($t('panels.removeConfirm', { name: option.name }))) {
      removePanelOption(option.id);
      open = false;
    }
  }

  // Enter anywhere in the form saves, matching the primary action.
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  }
</script>

<Modal bind:open title={$t(option ? 'panelModal.editTitle' : 'panelModal.addTitle')}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="fields" onkeydown={onKeyDown} role="form">
    <div class="full">
      <label for="pm-name">{$t('panelModal.name')}</label>
      <input id="pm-name" type="text" bind:value={draft.name} />
    </div>

    <p class="group">{$t('panelModal.sizeGroup')}</p>
    <div class="grid two">
      <div>
        <label for="pm-w">{$t('panelModal.length')}</label>
        <input id="pm-w" type="number" min="0" bind:value={draft.width} />
      </div>
      <div>
        <label for="pm-h">{$t('panelModal.width')}</label>
        <input id="pm-h" type="number" min="0" bind:value={draft.height} />
      </div>
    </div>

    <p class="group">{$t('panelModal.electricalGroup')}</p>
    <div class="grid three">
      <div>
        <label for="pm-p">{$t('panelModal.power')}</label>
        <input id="pm-p" type="number" min="0" bind:value={draft.power} />
      </div>
      <div>
        <label for="pm-v">{$t('panelModal.voltage')}</label>
        <input id="pm-v" type="number" min="0" placeholder="—" bind:value={draft.voltage} />
      </div>
      <div>
        <label for="pm-a">{$t('panelModal.current')}</label>
        <input id="pm-a" type="number" min="0" placeholder="—" bind:value={draft.current} />
      </div>
    </div>

    <p class="group">{$t('panelModal.weightPriceGroup')}</p>
    <div class="grid two">
      <div>
        <label for="pm-kg">{$t('panelModal.weight')}</label>
        <input id="pm-kg" type="number" min="0" step="0.1" placeholder="—" bind:value={draft.weight} />
      </div>
      <div>
        <label for="pm-price">{$t('panelModal.price', { currency: $fmt.currency })}</label>
        <input id="pm-price" type="number" min="0" step="0.01" placeholder="—" bind:value={draft.price} />
      </div>
    </div>

    <p class="group">{$t('panelModal.mountingGroup')}</p>
    <div class="seg-group" role="group" aria-label={$t('panelModal.mountingAria')}>
      <button
        class="seg"
        class:on={!draft.flexible}
        onclick={() => (draft.flexible = false)}
        title={$t('panelModal.rigidTitle')}>{$t('panelModal.rigid')}</button
      >
      <button
        class="seg"
        class:on={draft.flexible}
        onclick={() => (draft.flexible = true)}
        title={$t('panelModal.flexibleTitle')}>{$t('panelModal.flexible')}</button
      >
    </div>

    <p class="hint">{$t('panelModal.hint')}</p>
    {#if stats}
      <p class="stats">{stats}</p>
    {/if}
  </div>

  {#snippet footer()}
    {#if option}
      <button class="danger ghost" onclick={del}>{$t('common.delete')}</button>
    {/if}
    <span class="spacer"></span>
    <button class="ghost" onclick={() => (open = false)}>{$t('common.cancel')}</button>
    <button class="primary" disabled={!valid} onclick={save}>{$t('common.save')}</button>
  {/snippet}
</Modal>

<style>
  .fields {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .group {
    color: var(--text-dim);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 10px 0 2px;
  }
  .grid {
    display: grid;
    gap: 10px;
  }
  .two {
    grid-template-columns: 1fr 1fr;
  }
  .three {
    grid-template-columns: 1fr 1fr 1fr;
  }
  .full {
    margin-bottom: 2px;
  }
  .hint {
    color: var(--text-dim);
    font-size: 12px;
    margin: 12px 0 0;
  }
  .stats {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .spacer {
    flex: 1;
  }

  @media (max-width: 420px) {
    .three {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
