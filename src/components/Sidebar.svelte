<script lang="ts">
  import { config, layoutStale, selectedLayouts } from '../lib/stores';
  import { planInputStats, planResultStats } from '../lib/summary';
  import {
    sidebarPrefs,
    toggleSidebar,
    setSidebarWidth,
    revealSection,
    type SectionId,
  } from '../lib/uiPrefs';
  import { fmt, t, type MessageKey } from '../lib/i18n';
  import SidebarSection from './SidebarSection.svelte';
  import SurfaceList from './SurfaceList.svelte';
  import PanelOptionsList from './PanelOptionsList.svelte';
  import SpacingForm from './SpacingForm.svelte';
  import ResizeHandle from './ResizeHandle.svelte';

  // The plan's navigator: statistics first, then one collapsible section per kind of
  // thing the plan is made of. Collapsed, it becomes a rail of icons that give the canvas
  // back its width without hiding what the plan contains.

  const inputs = $derived(planInputStats($config));
  const result = $derived(planResultStats($config.surfaces, $selectedLayouts));

  const collapsed = $derived($sidebarPrefs.collapsed);

  const RAIL: { id: SectionId; icon: string; label: MessageKey }[] = [
    { id: 'overview', icon: '∑', label: 'overview.title' },
    { id: 'surfaces', icon: '▭', label: 'surfaces.title' },
    { id: 'panels', icon: '▤', label: 'panels.title' },
    { id: 'spacing', icon: '⇔', label: 'spacing.title' },
  ];

  const badges = $derived<Partial<Record<SectionId, string>>>({
    surfaces: $fmt.num(inputs.surfaceCount, 0),
    panels: `${$fmt.num(inputs.panelModelsEnabled, 0)} / ${$fmt.num(inputs.panelModels, 0)}`,
  });

  function reveal(id: SectionId) {
    revealSection(id);
    // After the section has been rendered open by the store update above.
    queueMicrotask(() => {
      document.getElementById(`sidebar-${id}`)?.scrollIntoView({ block: 'nearest' });
    });
  }
</script>

<aside class="sidebar" class:collapsed aria-label={$t('sidebar.label')}>
  {#if collapsed}
    <div class="rail">
      <button
        class="ghost icon"
        aria-label={$t('sidebar.expand')}
        title={$t('sidebar.expand')}
        aria-expanded="false"
        onclick={toggleSidebar}>»</button
      >
      {#each RAIL as r (r.id)}
        <button
          class="ghost icon"
          aria-label={$t(r.label)}
          title={$t(r.label)}
          onclick={() => reveal(r.id)}
        >
          <span aria-hidden="true">{r.icon}</span>
          {#if badges[r.id]}<span class="rbadge" aria-hidden="true">{badges[r.id]}</span>{/if}
        </button>
      {/each}
    </div>
  {:else}
    <div class="head">
      <button
        class="ghost icon"
        aria-label={$t('sidebar.collapse')}
        title={$t('sidebar.collapse')}
        aria-expanded="true"
        onclick={toggleSidebar}>«</button
      >
    </div>

    <SidebarSection id="overview" title={$t('overview.title')}>
      <p class="stat">
        {$t('overview.inputs', {
          surfaces: $t('results.surfaceCount', { count: inputs.surfaceCount }),
          area: $fmt.area(inputs.totalArea),
        })}
      </p>
      <p class="stat">
        {$t('overview.catalog', {
          keepOuts: $t('keepOuts.count', { count: inputs.keepOutCount }),
          models: $t('overview.models', {
            enabled: inputs.panelModelsEnabled,
            count: inputs.panelModels,
          }),
        })}
      </p>
      {#if result}
        <div class="result" class:stale={$layoutStale}>
          <p class="power">
            {$fmt.num(result.totalPower, 0)} <span class="wp">Wp</span>
          </p>
          <p class="rmeta">
            {$t('overview.resultMeta', {
              panels: $t('results.panelCount', { count: result.panelCount }),
              coverage: $fmt.num(result.coverage * 100, 0),
            })}
          </p>
          {#if $layoutStale}
            <p class="stale-note">{$t('canvas.stale')}</p>
          {/if}
        </div>
      {:else}
        <p class="empty">{$t('results.notOptimized')}</p>
      {/if}
    </SidebarSection>

    <SidebarSection
      id="surfaces"
      title={$t('surfaces.title')}
      badge={badges.surfaces}
      hint={$t('surfaces.hint')}
    >
      <SurfaceList />
    </SidebarSection>

    <SidebarSection
      id="panels"
      title={$t('panels.title')}
      badge={badges.panels}
      hint={$t('panels.hint')}
    >
      <PanelOptionsList />
    </SidebarSection>

    <SidebarSection id="spacing" title={$t('spacing.title')} hint={$t('spacing.hint')}>
      <SpacingForm />
    </SidebarSection>

    <ResizeHandle
      edge="right"
      width={$sidebarPrefs.width}
      label={$t('sidebar.resize')}
      onresize={setSidebarWidth}
    />
  {/if}
</aside>

<style>
  .sidebar {
    position: relative;
    overflow-y: auto;
    padding: 10px;
    background: var(--bg);
    border-right: 1px solid var(--border);
  }
  .sidebar.collapsed {
    padding: 8px 4px;
    overflow: hidden;
  }
  .head {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 2px;
  }
  .head .icon {
    padding: 2px 7px;
  }
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .icon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    line-height: 1;
    padding: 6px 8px;
    color: var(--text-dim);
  }
  .icon:hover {
    color: var(--text);
  }
  .rail .icon {
    width: 100%;
    font-size: 16px;
    padding: 7px 4px;
  }
  .rbadge {
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }
  .stat {
    margin: 0 0 4px;
    font-size: 12px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .result {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }
  /* The figures still describe the layout on screen, but the inputs have moved on. */
  .result.stale .power,
  .result.stale .rmeta {
    opacity: 0.6;
  }
  .power {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .wp {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-dim);
  }
  .rmeta {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .stale-note {
    margin: 6px 0 0;
    font-size: 11px;
    color: var(--accent);
  }
  .empty {
    margin: 8px 0 0;
    color: var(--text-dim);
    font-size: 12px;
    font-style: italic;
  }

  /* Single-column layout: the sidebar spans the full width, so there is nothing to
     reclaim — collapsing just folds the sections away and the rail would only get in
     the way. */
  @media (max-width: 1000px) {
    .sidebar.collapsed {
      padding: 10px;
      overflow-y: auto;
    }
    .rail {
      flex-direction: row;
      justify-content: flex-start;
      flex-wrap: wrap;
    }
    .rail .icon {
      width: auto;
      flex-direction: row;
      gap: 6px;
    }
  }
</style>
