<script lang="ts">
  import {
    config,
    activeSurfaceId,
    addSurface,
    updateSurface,
    removeSurface,
  } from '../lib/stores';
  import { num } from '../lib/format';
  import { isPanelEnabled, isPanelFlexible } from '../lib/panels';
  import { t, type MessageKey } from '../lib/i18n';
  import type { AllowedPanels } from '../lib/types';

  const ALLOWED: { value: AllowedPanels; label: MessageKey; title: MessageKey }[] = [
    { value: 'rigid', label: 'surfaces.allowed.rigid', title: 'surfaces.allowed.rigidTitle' },
    {
      value: 'flexible',
      label: 'surfaces.allowed.flexible',
      title: 'surfaces.allowed.flexibleTitle',
    },
    { value: 'both', label: 'surfaces.allowed.both', title: 'surfaces.allowed.bothTitle' },
  ];

  const SNAPS = [0, 1, 5, 10];

  /**
   * Whether a surface's allowance rules out every model the optimizer would consider —
   * the surface would come back empty for a reason that is easy to miss otherwise.
   * 'both' can never do this, so it never warns.
   */
  function starvedBy(allows: AllowedPanels): boolean {
    if (allows === 'both') return false;
    const wantFlexible = allows === 'flexible';
    return !$config.panelOptions.some(
      (o) => isPanelEnabled(o) && isPanelFlexible(o) === wantFlexible,
    );
  }
</script>

<section class="card">
  <div class="head">
    <h2>{$t('surfaces.title')}</h2>
    <button class="ghost" onclick={() => addSurface()}>{$t('common.add')}</button>
  </div>
  <p class="hint">{$t('surfaces.hint')}</p>

  {#each $config.surfaces as s (s.id)}
    <div
      class="row"
      class:selected={$activeSurfaceId === s.id}
      onclick={() => activeSurfaceId.set(s.id)}
      onkeydown={(e) => e.key === 'Enter' && activeSurfaceId.set(s.id)}
      role="button"
      tabindex="0"
    >
      <input
        class="name"
        type="text"
        aria-label={$t('surfaces.nameLabel')}
        value={s.name}
        oninput={(e) => updateSurface(s.id, { name: (e.target as HTMLInputElement).value })}
      />
      {#if $config.surfaces.length > 1}
        <button
          class="danger ghost del"
          title={$t('surfaces.removeTitle')}
          aria-label={$t('surfaces.remove', { name: s.name })}
          onclick={(e) => {
            e.stopPropagation();
            removeSurface(s.id);
          }}>×</button
        >
      {/if}
      <div class="dims">
        <label>
          {$t('surfaces.length')}
          <input
            type="number"
            min="0"
            value={s.width}
            oninput={(e) => updateSurface(s.id, { width: num(e) })}
          />
        </label>
        <label>
          {$t('surfaces.width')}
          <input
            type="number"
            min="0"
            value={s.height}
            oninput={(e) => updateSurface(s.id, { height: num(e) })}
          />
        </label>
      </div>
      <div class="allow">
        <span class="alabel">{$t('surfaces.panels')}</span>
        <div
          class="seg-group"
          role="group"
          aria-label={$t('surfaces.allowedAria', { name: s.name })}
        >
          {#each ALLOWED as a (a.value)}
            <button
              class="seg"
              class:on={s.allowedPanels === a.value}
              title={$t(a.title)}
              onclick={(e) => {
                e.stopPropagation();
                updateSurface(s.id, { allowedPanels: a.value });
              }}>{$t(a.label)}</button
            >
          {/each}
        </div>
        {#if starvedBy(s.allowedPanels)}
          <p class="warn">
            {$t(
              s.allowedPanels === 'rigid'
                ? 'surfaces.starved.rigid'
                : 'surfaces.starved.flexible',
            )}
          </p>
        {/if}
      </div>
    </div>
  {/each}
</section>

<section class="card">
  <h2>{$t('spacing.title')}</h2>
  <p class="hint">{$t('spacing.hint')}</p>
  <div class="grid">
    <div>
      <label for="margin">{$t('spacing.edgeMargin')}</label>
      <input
        id="margin"
        type="number"
        min="0"
        value={$config.edgeMargin}
        oninput={(e) => config.update((c) => ({ ...c, edgeMargin: num(e) }))}
      />
    </div>
    <div>
      <label for="gap">{$t('spacing.panelGap')}</label>
      <input
        id="gap"
        type="number"
        min="0"
        value={$config.panelGap}
        oninput={(e) => config.update((c) => ({ ...c, panelGap: num(e) }))}
      />
    </div>
    <div>
      <label for="snap">{$t('spacing.gridSnap')}</label>
      <select
        id="snap"
        value={String($config.gridSnap)}
        onchange={(e) =>
          config.update((c) => ({ ...c, gridSnap: Number((e.target as HTMLSelectElement).value) }))}
      >
        {#each SNAPS as cm (cm)}
          <option value={String(cm)}>
            {cm === 0 ? $t('spacing.snapOff') : $t('spacing.snapCm', { cm })}
          </option>
        {/each}
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
    margin-bottom: 4px;
  }
  .hint {
    color: var(--text-dim);
    font-size: 12px;
    margin: 0 0 10px;
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
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .dims label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 0;
  }
  .allow {
    grid-column: 1 / -1;
    margin-top: 8px;
  }
  .alabel {
    display: block;
    color: var(--text-dim);
    font-size: 12px;
    margin-bottom: 2px;
  }
  /* Segmented picker, matching the optimizer's effort control. */
  .seg-group {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .seg {
    flex: 1;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 5px 8px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .seg.on {
    background: var(--panel-bg-2);
    color: var(--text);
  }
  .warn {
    color: var(--accent);
    font-size: 11px;
    line-height: 1.4;
    margin: 6px 0 0;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
</style>
