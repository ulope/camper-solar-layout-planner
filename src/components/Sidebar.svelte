<script lang="ts">
  import { config, layoutStale, selectedLayouts } from '../lib/stores';
  import { planInputStats, planResultStats } from '../lib/summary';
  import {
    sidebarPrefs,
    setSidebarWidth,
    revealSection,
    type SectionId,
  } from '../lib/uiPrefs';
  import { fmt, t, type MessageKey } from '../lib/i18n';
  import SectionIcon from './SectionIcon.svelte';
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

  const RAIL: { id: SectionId; label: MessageKey }[] = [
    { id: 'overview', label: 'overview.title' },
    { id: 'surfaces', label: 'surfaces.title' },
    { id: 'panels', label: 'panels.title' },
    { id: 'spacing', label: 'spacing.title' },
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

<aside id="sidebar" class="sidebar" class:collapsed aria-label={$t('sidebar.label')}>
  {#if collapsed}
    <div class="rail">
      {#each RAIL as r (r.id)}
        <button
          class="ghost icon"
          aria-label={$t(r.label)}
          title={$t(r.label)}
          onclick={() => reveal(r.id)}
        >
          <SectionIcon id={r.id} />
          {#if badges[r.id]}<span class="rbadge" aria-hidden="true">{badges[r.id]}</span>{/if}
        </button>
      {/each}
    </div>
  {:else}
    <SidebarSection id="overview" title={$t('overview.title')}>
      {#if result}
        {@const pct = Math.round(result.coverage * 100)}
        <div class="result" class:stale={$layoutStale}>
          <p class="power">
            <span class="pvalue">{$fmt.num(result.totalPower, 0)}</span>
            <span class="wp">Wp</span>
          </p>
          <p class="rmeta">
            {$t('overview.resultMeta', {
              panels: $t('results.panelCount', { count: result.panelCount }),
              surfaces: $t('results.surfaceCount', { count: inputs.surfaceCount }),
            })}
          </p>
          <div class="meter" title={$t('overview.coverageLabel')}>
            <div
              class="track"
              role="meter"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={pct}
              aria-label={$t('overview.coverageLabel')}
            >
              <div class="fill" style="width: {Math.min(100, pct)}%"></div>
            </div>
            <span class="mlabel">{$t('overview.coverage', { coverage: $fmt.num(pct, 0) })}</span>
          </div>
          {#if $layoutStale}
            <p class="stale-note">{$t('canvas.stale')}</p>
          {/if}
        </div>
      {:else}
        <p class="empty">{$t('results.notOptimized')}</p>
      {/if}

      <dl class="tiles">
        <div class="tile">
          <dt>{$t('overview.surfacesLabel')}</dt>
          <dd>{$fmt.num(inputs.surfaceCount, 0)}</dd>
        </div>
        <div class="tile">
          <dt>{$t('overview.areaLabel')}</dt>
          <dd>{$fmt.area(inputs.totalArea)}</dd>
        </div>
        <div class="tile">
          <dt>{$t('overview.keepOutsLabel')}</dt>
          <dd>{$fmt.num(inputs.keepOutCount, 0)}</dd>
        </div>
        <div
          class="tile"
          title={$t('overview.modelsTitle', {
            enabled: inputs.panelModelsEnabled,
            count: inputs.panelModels,
          })}
        >
          <dt>{$t('overview.modelsLabel')}</dt>
          <dd>
            {$t('overview.modelsValue', {
              enabled: $fmt.num(inputs.panelModelsEnabled, 0),
              count: $fmt.num(inputs.panelModels, 0),
            })}
          </dd>
        </div>
      </dl>
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
    padding: 7px 4px;
  }
  .rbadge {
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }
  /* The figures still describe the layout on screen, but the inputs have moved on. */
  .result.stale .power,
  .result.stale .rmeta,
  .result.stale .meter {
    opacity: 0.55;
  }
  .power {
    display: flex;
    align-items: baseline;
    gap: 5px;
    margin: 0;
  }
  .pvalue {
    font-size: 27px;
    font-weight: 600;
    line-height: 1.05;
    color: var(--accent);
    /* Proportional: this is a headline figure, not a column of them. */
    font-variant-numeric: normal;
  }
  .wp {
    font-size: 12px;
    color: var(--text-dim);
  }
  .rmeta {
    margin: 3px 0 0;
    font-size: 12px;
    color: var(--text-dim);
  }
  /* Coverage against the usable area: one ratio against a limit, so a meter rather
     than a chart. The track is the fill's own hue at low alpha, so the whole bar reads
     as one scale instead of a fill sitting on unrelated gray. */
  .meter {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 9px;
  }
  .track {
    flex: 1;
    min-width: 0;
    height: 6px;
    border-radius: 3px;
    background: rgba(74, 158, 255, 0.18);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 3px;
    background: var(--accent-2);
    transition: width 0.2s ease;
  }
  .mlabel {
    flex: none;
    font-size: 11px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .stale-note {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--accent);
  }
  .empty {
    margin: 0;
    color: var(--text-dim);
    font-size: 12px;
    font-style: italic;
  }
  /* What the plan is made of. Two columns so the four figures stay readable even at the
     narrowest sidebar width. */
  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    margin: 12px 0 0;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .tile {
    min-width: 0;
    padding: 5px 8px 5px 0;
  }
  .tiles dt {
    margin: 0;
    font-size: 11px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tiles dd {
    margin: 1px 0 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
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
