<script lang="ts">
  import Modal from './Modal.svelte';
  import { config, addKeepOut, updateKeepOut, removeKeepOut } from '../lib/stores';
  import { surfaceOfKeepOut } from '../lib/surfaces';
  import { toNum } from '../lib/format';
  import { t } from '../lib/i18n';
  import type { KeepOut } from '../lib/types';

  // `keepOut === null` means "add one to `surfaceId`". Edits go to a local draft and are
  // written back only on Save, so Cancel / Esc discards them — as in PanelOptionModal.
  let {
    open = $bindable(false),
    keepOut = null,
    surfaceId,
  }: { open?: boolean; keepOut?: KeepOut | null; surfaceId: string } = $props();

  type Draft = { label: string } & Record<'x' | 'y' | 'w' | 'h', number | null>;

  function toDraft(k: KeepOut | null): Draft {
    if (!k) return { label: '', x: 10, y: 10, w: 40, h: 40 };
    return { label: k.label ?? '', x: k.x, y: k.y, w: k.w, h: k.h };
  }

  let draft = $state<Draft>(toDraft(null));

  $effect(() => {
    if (open) draft = toDraft(keepOut);
  });

  const x = $derived(toNum(draft.x));
  const y = $derived(toNum(draft.y));
  const w = $derived(toNum(draft.w));
  const h = $derived(toNum(draft.h));
  const valid = $derived(w > 0 && h > 0);

  // Edits are keyed by keep-out id alone, but the owning surface still decides which
  // rectangle the coordinates are measured against.
  const owner = $derived(
    (keepOut ? surfaceOfKeepOut($config, keepOut.id) : null) ??
      $config.surfaces.find((s) => s.id === surfaceId) ??
      null,
  );

  // Placing one past the edge is allowed — the optimizer simply clips it — but it is
  // almost always a typo, so say so.
  const outside = $derived(!!owner && (x + w > owner.width || y + h > owner.height));

  function save() {
    if (!valid) return;
    const label = draft.label.trim();
    const rect = { x, y, w, h };
    if (keepOut) updateKeepOut(keepOut.id, { ...rect, label: label || keepOut.label });
    else addKeepOut(label ? { ...rect, label } : rect, surfaceId);
    open = false;
  }

  function del() {
    if (!keepOut) return;
    removeKeepOut(keepOut.id);
    open = false;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  }
</script>

<Modal bind:open title={$t(keepOut ? 'keepOutModal.editTitle' : 'keepOutModal.addTitle')}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="fields" onkeydown={onKeyDown} role="form">
    <div class="full">
      <label for="km-label">{$t('keepOutModal.label')}</label>
      <input id="km-label" type="text" bind:value={draft.label} />
    </div>

    <p class="group">{$t('keepOutModal.positionGroup')}</p>
    <div class="grid two">
      <div>
        <label for="km-x">{$t('keepOuts.x')}</label>
        <input id="km-x" type="number" min="0" bind:value={draft.x} />
      </div>
      <div>
        <label for="km-y">{$t('keepOuts.y')}</label>
        <input id="km-y" type="number" min="0" bind:value={draft.y} />
      </div>
    </div>

    <p class="group">{$t('keepOutModal.sizeGroup')}</p>
    <div class="grid two">
      <div>
        <label for="km-w">{$t('keepOuts.length')}</label>
        <input id="km-w" type="number" min="0" bind:value={draft.w} />
      </div>
      <div>
        <label for="km-h">{$t('keepOuts.width')}</label>
        <input id="km-h" type="number" min="0" bind:value={draft.h} />
      </div>
    </div>

    {#if outside}
      <p class="warn">{$t('keepOutModal.outside')}</p>
    {/if}
    <p class="hint">
      {$t('keepOuts.hint')}
      {$t('keepOutModal.hint')}
      {#if owner}{$t('keepOutModal.onSurface', { name: owner.name })}{/if}
    </p>
  </div>

  {#snippet footer()}
    {#if keepOut}
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
  .full {
    margin-bottom: 2px;
  }
  .warn {
    color: var(--accent);
    font-size: 11px;
    line-height: 1.4;
    margin: 10px 0 0;
  }
  .hint {
    color: var(--text-dim);
    font-size: 12px;
    margin: 12px 0 0;
  }
  .spacer {
    flex: 1;
  }
</style>
