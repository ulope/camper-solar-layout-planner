<script lang="ts">
  import Modal from './Modal.svelte';
  import { addPanelOption, updatePanelOption, removePanelOption } from '../lib/stores';
  import { CURRENCY, fmtNum, toNum, toOptNum } from '../lib/format';
  import type { PanelOption } from '../lib/types';

  // `option === null` means "add a new model". Edits happen on a local draft and are only
  // written back on Save, so Cancel / Esc discards them.
  let {
    open = $bindable(false),
    option = null,
  }: { open?: boolean; option?: PanelOption | null } = $props();

  // Number inputs bind to `number | null` (null while the field is empty).
  type Draft = { name: string } & Record<
    'width' | 'height' | 'power' | 'weight' | 'price' | 'voltage' | 'current',
    number | null
  >;

  function toDraft(o: PanelOption | null): Draft {
    if (!o) {
      return {
        name: 'New panel',
        width: 100,
        height: 50,
        power: 100,
        weight: null,
        price: null,
        voltage: null,
        current: null,
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
      areaM2 > 0 ? `${areaM2.toFixed(2)} m²` : null,
      areaM2 > 0 && power > 0 ? `${Math.round(power / areaM2)} Wp/m²` : null,
      weight ? `${fmtNum(weight)} kg` : null,
      price && power > 0 ? `${CURRENCY}${(price / power).toFixed(2)}/Wp` : null,
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
    };
    if (option) updatePanelOption(option.id, patch);
    else addPanelOption(patch);
    open = false;
  }

  function del() {
    if (!option) return;
    if (confirm(`Remove the panel model “${option.name}”?`)) {
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

<Modal bind:open title={option ? 'Edit panel model' : 'Add panel model'}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="fields" onkeydown={onKeyDown} role="form">
    <div class="full">
      <label for="pm-name">Name</label>
      <input id="pm-name" type="text" bind:value={draft.name} />
    </div>

    <p class="group">Size (cm)</p>
    <div class="grid two">
      <div>
        <label for="pm-w">Length</label>
        <input id="pm-w" type="number" min="0" bind:value={draft.width} />
      </div>
      <div>
        <label for="pm-h">Width (depth)</label>
        <input id="pm-h" type="number" min="0" bind:value={draft.height} />
      </div>
    </div>

    <p class="group">Electrical</p>
    <div class="grid three">
      <div>
        <label for="pm-p">Power (Wp)</label>
        <input id="pm-p" type="number" min="0" bind:value={draft.power} />
      </div>
      <div>
        <label for="pm-v">Voltage (V)</label>
        <input id="pm-v" type="number" min="0" placeholder="—" bind:value={draft.voltage} />
      </div>
      <div>
        <label for="pm-a">Current (A)</label>
        <input id="pm-a" type="number" min="0" placeholder="—" bind:value={draft.current} />
      </div>
    </div>

    <p class="group">Weight &amp; price</p>
    <div class="grid two">
      <div>
        <label for="pm-kg">Weight (kg)</label>
        <input id="pm-kg" type="number" min="0" step="0.1" placeholder="—" bind:value={draft.weight} />
      </div>
      <div>
        <label for="pm-price">Price ({CURRENCY})</label>
        <input id="pm-price" type="number" min="0" step="0.01" placeholder="—" bind:value={draft.price} />
      </div>
    </div>

    <p class="hint">
      Voltage, current, weight and price are optional. Weight and price feed the optional
      optimization criteria; missing values count as zero there.
    </p>
    {#if stats}
      <p class="stats">{stats}</p>
    {/if}
  </div>

  {#snippet footer()}
    {#if option}
      <button class="danger ghost" onclick={del}>Delete</button>
    {/if}
    <span class="spacer"></span>
    <button class="ghost" onclick={() => (open = false)}>Cancel</button>
    <button class="primary" disabled={!valid} onclick={save}>Save</button>
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
