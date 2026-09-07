<script lang="ts">
  import {
    config,
    activeSurfaceId,
    selectedKeepOut,
  } from '../lib/stores';
  import { surfaceOfKeepOut } from '../lib/surfaces';
  import { sidebarPrefs, setSurfaceExpanded, toggleSurfaceExpanded } from '../lib/uiPrefs';
  import { isPanelEnabled, isPanelFlexible } from '../lib/panels';
  import { t, type MessageKey } from '../lib/i18n';
  import type { KeepOut, Surface } from '../lib/types';
  import SurfaceModal from './SurfaceModal.svelte';
  import KeepOutModal from './KeepOutModal.svelte';

  // The surfaces of the plan as a two-level tree: a one-line summary per surface, with its
  // keep-outs nested beneath it. Rows only select and disclose — every field is edited in
  // a dialog, so a plan with many surfaces stays scannable in a narrow column.

  let surfaceModalOpen = $state(false);
  let editingSurface = $state<Surface | null>(null);

  let keepOutModalOpen = $state(false);
  let editingKeepOut = $state<KeepOut | null>(null);
  let keepOutSurfaceId = $state('');

  // Keep-out rows, so a selection made on the canvas can be scrolled into view here.
  const rows = new Map<string, HTMLElement>();

  function track(node: HTMLElement, id: string) {
    rows.set(id, node);
    return { destroy: () => rows.delete(id) };
  }

  const ALLOWED_LABEL: Record<Surface['allowedPanels'], MessageKey> = {
    rigid: 'surfaces.allowed.rigid',
    flexible: 'surfaces.allowed.flexible',
    both: 'surfaces.allowed.both',
  };

  const expanded = $derived(new Set($sidebarPrefs.expandedSurfaces));

  /** Whether a surface's allowance rules out every model the optimizer would consider. */
  function starvedBy(s: Surface): MessageKey | null {
    if (s.allowedPanels === 'both') return null;
    const wantFlexible = s.allowedPanels === 'flexible';
    const any = $config.panelOptions.some(
      (o) => isPanelEnabled(o) && isPanelFlexible(o) === wantFlexible,
    );
    return any ? null : wantFlexible ? 'surfaces.starved.flexible' : 'surfaces.starved.rigid';
  }

  function openAddSurface() {
    editingSurface = null;
    surfaceModalOpen = true;
  }

  function openEditSurface(s: Surface) {
    editingSurface = s;
    surfaceModalOpen = true;
  }

  function openAddKeepOut(s: Surface) {
    activeSurfaceId.set(s.id);
    editingKeepOut = null;
    keepOutSurfaceId = s.id;
    keepOutModalOpen = true;
  }

  function openEditKeepOut(s: Surface, ko: KeepOut) {
    selectKeepOut(s, ko);
    editingKeepOut = ko;
    keepOutSurfaceId = s.id;
    keepOutModalOpen = true;
  }

  function selectKeepOut(s: Surface, ko: KeepOut) {
    activeSurfaceId.set(s.id);
    selectedKeepOut.set(ko.id);
  }

  // Drawing or clicking a keep-out on the canvas selects it; reveal it here rather than
  // leaving the selection hidden inside a collapsed surface.
  $effect(() => {
    const id = $selectedKeepOut;
    if (!id) return;
    const owner = surfaceOfKeepOut($config, id);
    if (owner) setSurfaceExpanded(owner.id, true);
    // After the row has been rendered by the expansion above.
    queueMicrotask(() => rows.get(id)?.scrollIntoView({ block: 'nearest' }));
  });
</script>

{#if $config.surfaces.length === 0}
  <p class="empty">{$t('surfaces.empty')}</p>
{/if}

<ul class="tree">
  {#each $config.surfaces as s (s.id)}
    {@const isExpanded = expanded.has(s.id)}
    {@const starved = starvedBy(s)}
    <li>
      <div
        class="row surface"
        class:active={$activeSurfaceId === s.id}
        role="button"
        tabindex="0"
        aria-label={$t('surfaces.select', { name: s.name })}
        onclick={() => activeSurfaceId.set(s.id)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activeSurfaceId.set(s.id);
          }
        }}
      >
        <button
          class="ghost caret"
          aria-expanded={isExpanded}
          aria-label={$t(isExpanded ? 'surfaces.hideKeepOuts' : 'surfaces.showKeepOuts', {
            name: s.name,
          })}
          onclick={(e) => {
            e.stopPropagation();
            toggleSurfaceExpanded(s.id);
          }}><span class:open={isExpanded} aria-hidden="true">▸</span></button
        >
        <span class="text">
          <span class="name" title={s.name}>{s.name}</span>
          <span class="meta">
            {$t('surfaces.meta', {
              size: $t('canvas.size', { width: s.width, height: s.height }),
              allowed: $t(ALLOWED_LABEL[s.allowedPanels]),
            })}
          </span>
        </span>
        {#if starved}
          <span class="warn" title={$t(starved)} aria-label={$t(starved)}>⚠</span>
        {/if}
        {#if s.keepOuts.length > 0}
          <span class="count" title={$t('keepOuts.count', { count: s.keepOuts.length })}
            >{s.keepOuts.length}</span
          >
        {/if}
        <button
          class="ghost edit"
          title={$t('surfaces.edit', { name: s.name })}
          aria-label={$t('surfaces.edit', { name: s.name })}
          onclick={(e) => {
            e.stopPropagation();
            openEditSurface(s);
          }}>✎</button
        >
      </div>

      {#if isExpanded}
        <ul class="kos">
          {#each s.keepOuts as ko (ko.id)}
            <li use:track={ko.id}>
              <div
                class="row ko"
                class:active={$selectedKeepOut === ko.id}
                role="button"
                tabindex="0"
                onclick={() => selectKeepOut(s, ko)}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectKeepOut(s, ko);
                  }
                }}
              >
                <span class="text">
                  <span class="name">{ko.label || $t('defaults.keepOut')}</span>
                  <span class="meta"
                    >{$t('keepOuts.rect', {
                      x: ko.x,
                      y: ko.y,
                      width: ko.w,
                      height: ko.h,
                    })}</span
                  >
                </span>
                <button
                  class="ghost edit"
                  title={$t('keepOuts.edit', { name: ko.label || $t('defaults.keepOut') })}
                  aria-label={$t('keepOuts.edit', { name: ko.label || $t('defaults.keepOut') })}
                  onclick={(e) => {
                    e.stopPropagation();
                    openEditKeepOut(s, ko);
                  }}>✎</button
                >
              </div>
            </li>
          {:else}
            <li class="empty ko-empty">{$t('keepOuts.empty')}</li>
          {/each}
          <li>
            <button
              class="ghost add-ko"
              aria-label={$t('keepOuts.addTo', { name: s.name })}
              onclick={() => openAddKeepOut(s)}>+ {$t('keepOuts.add')}</button
            >
          </li>
        </ul>
      {/if}
    </li>
  {/each}
</ul>

<button class="ghost add-surface" onclick={openAddSurface}>{$t('common.add')}</button>

<SurfaceModal bind:open={surfaceModalOpen} surface={editingSurface} />
<KeepOutModal
  bind:open={keepOutModalOpen}
  keepOut={editingKeepOut}
  surfaceId={keepOutSurfaceId}
/>

<style>
  .tree,
  .kos {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .kos {
    margin: 0 0 4px 20px;
    border-left: 1px solid var(--border);
    padding-left: 4px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 5px 6px;
    border-radius: 6px;
  }
  .row:hover {
    background: var(--panel-bg-2);
  }
  .row.active {
    background: rgba(74, 158, 255, 0.12);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ko .name {
    font-weight: 400;
  }
  .meta {
    font-size: 11px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .caret {
    flex: none;
    border: none;
    padding: 2px 4px;
    color: var(--text-dim);
    font-size: 10px;
    line-height: 1;
    background: transparent;
  }
  .caret span {
    display: inline-block;
    transition: transform 0.12s;
  }
  .caret span.open {
    transform: rotate(90deg);
  }
  .edit {
    flex: none;
    border-color: transparent;
    background: transparent;
    padding: 2px 6px;
    color: var(--text-dim);
    line-height: 1;
  }
  .row:hover .edit,
  .edit:focus-visible {
    color: var(--text);
    border-color: var(--border);
  }
  .count {
    flex: none;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
    background: var(--panel-bg-2);
    border-radius: 9px;
    padding: 1px 6px;
  }
  .warn {
    flex: none;
    color: var(--accent);
    font-size: 12px;
    cursor: help;
  }
  .empty {
    color: var(--text-dim);
    font-size: 12px;
    font-style: italic;
    margin: 2px 0;
  }
  .ko-empty {
    padding: 4px 6px;
  }
  .add-ko {
    border: none;
    padding: 4px 6px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .add-ko:hover {
    color: var(--text);
  }
  .add-surface {
    margin-top: 6px;
    width: 100%;
    font-size: 12px;
    padding: 5px 8px;
  }
</style>
