<script lang="ts">
  import Modal from './Modal.svelte';
  import { config, addSurface, updateSurface, removeSurface } from '../lib/stores';
  import { toNum } from '../lib/format';
  import { isPanelEnabled, isPanelFlexible } from '../lib/panels';
  import { fmt, t, type MessageKey } from '../lib/i18n';
  import type { AllowedPanels, Surface } from '../lib/types';

  // `surface === null` means "add a new one". As in PanelOptionModal, edits happen on a
  // local draft and are only written back on Save, so Cancel / Esc discards them.
  let {
    open = $bindable(false),
    surface = null,
  }: { open?: boolean; surface?: Surface | null } = $props();

  const ALLOWED: { value: AllowedPanels; label: MessageKey; title: MessageKey }[] = [
    { value: 'rigid', label: 'surfaces.allowed.rigid', title: 'surfaces.allowed.rigidTitle' },
    {
      value: 'flexible',
      label: 'surfaces.allowed.flexible',
      title: 'surfaces.allowed.flexibleTitle',
    },
    { value: 'both', label: 'surfaces.allowed.both', title: 'surfaces.allowed.bothTitle' },
  ];

  type Draft = {
    name: string;
    width: number | null;
    height: number | null;
    allowedPanels: AllowedPanels;
  };

  function toDraft(s: Surface | null): Draft {
    if (!s) return { name: '', width: 200, height: 100, allowedPanels: 'both' };
    return { name: s.name, width: s.width, height: s.height, allowedPanels: s.allowedPanels };
  }

  let draft = $state<Draft>(toDraft(null));

  // Re-seed the draft every time the dialog opens.
  $effect(() => {
    if (open) draft = toDraft(surface);
  });

  const width = $derived(toNum(draft.width));
  const height = $derived(toNum(draft.height));
  const valid = $derived(width > 0 && height > 0);
  const isLast = $derived($config.surfaces.length <= 1);

  /**
   * Whether the chosen allowance rules out every model the optimizer would consider — the
   * surface would come back empty for a reason that is easy to miss otherwise. 'both' can
   * never do this, so it never warns.
   */
  const starved = $derived.by(() => {
    if (draft.allowedPanels === 'both') return null;
    const wantFlexible = draft.allowedPanels === 'flexible';
    const any = $config.panelOptions.some(
      (o) => isPanelEnabled(o) && isPanelFlexible(o) === wantFlexible,
    );
    return any ? null : wantFlexible ? 'surfaces.starved.flexible' : 'surfaces.starved.rigid';
  });

  const stats = $derived(
    width > 0 && height > 0
      ? $t('surfaceModal.areaStat', {
          area: $fmt.area(width * height),
          keepOuts: $t('keepOuts.count', { count: surface?.keepOuts.length ?? 0 }),
        })
      : '',
  );

  function save() {
    if (!valid) return;
    // An empty name falls back to the generated default rather than leaving a blank row.
    const name = draft.name.trim();
    const patch = { width, height, allowedPanels: draft.allowedPanels };
    if (surface) updateSurface(surface.id, { ...patch, name: name || surface.name });
    else addSurface(name ? { ...patch, name } : patch);
    open = false;
  }

  function del() {
    if (!surface || isLast) return;
    removeSurface(surface.id);
    open = false;
  }

  // Enter anywhere in the form saves, matching the primary action.
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  }
</script>

<Modal bind:open title={$t(surface ? 'surfaceModal.editTitle' : 'surfaceModal.addTitle')}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="fields" onkeydown={onKeyDown} role="form">
    <div class="full">
      <label for="sm-name">{$t('surfaceModal.name')}</label>
      <input
        id="sm-name"
        type="text"
        placeholder={$t('surfaces.nameLabel')}
        bind:value={draft.name}
      />
    </div>

    <p class="group">{$t('surfaceModal.sizeGroup')}</p>
    <div class="grid two">
      <div>
        <label for="sm-w">{$t('surfaces.length')}</label>
        <input id="sm-w" type="number" min="0" bind:value={draft.width} />
      </div>
      <div>
        <label for="sm-h">{$t('surfaces.width')}</label>
        <input id="sm-h" type="number" min="0" bind:value={draft.height} />
      </div>
    </div>

    <p class="group">{$t('surfaceModal.panelsGroup')}</p>
    <div
      class="seg-group"
      role="group"
      aria-label={$t('surfaces.allowedAria', { name: draft.name })}
    >
      {#each ALLOWED as a (a.value)}
        <button
          class="seg"
          class:on={draft.allowedPanels === a.value}
          title={$t(a.title)}
          onclick={() => (draft.allowedPanels = a.value)}>{$t(a.label)}</button
        >
      {/each}
    </div>
    {#if starved}
      <p class="warn">{$t(starved)}</p>
    {/if}

    <p class="hint">{$t('surfaces.hint')}</p>
    {#if stats}
      <p class="stats">{stats}</p>
    {/if}
  </div>

  {#snippet footer()}
    {#if surface}
      <button
        class="danger ghost"
        disabled={isLast}
        title={isLast ? $t('surfaceModal.lastSurface') : $t('surfaces.removeTitle')}
        onclick={del}>{$t('common.delete')}</button
      >
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
    margin: 6px 0 0;
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
</style>
