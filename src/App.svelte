<script lang="ts">
  import { onMount } from 'svelte';
  import Toolbar from './components/Toolbar.svelte';
  import SurfaceList from './components/SurfaceList.svelte';
  import PanelOptionsList from './components/PanelOptionsList.svelte';
  import SpacingForm from './components/SpacingForm.svelte';
  import LayoutCanvas from './components/LayoutCanvas.svelte';
  import ResultsSummary from './components/ResultsSummary.svelte';
  import ResizeHandle from './components/ResizeHandle.svelte';
  import { t } from './lib/i18n';
  import { PLAN_FRAGMENT_KEY } from './lib/share/fragment';

  // A plan scanned from a report's QR code arrives in the URL fragment. Handled once the
  // stores are hydrated, so the confirmation can say what it is about to replace. The
  // decoder is fetched only when there is something to decode — almost every visit has
  // no plan in its URL and should not pay for one.
  onMount(() => {
    const restoreIfPlan = () => {
      if (!location.hash.includes(`${PLAN_FRAGMENT_KEY}=`)) return;
      import('./lib/share/restore').then((m) => m.restorePlanFromUrl());
    };
    restoreIfPlan();
    // Opening a plan link while the app is already running changes only the fragment,
    // which is a same-document navigation and never re-runs any of the above.
    window.addEventListener('hashchange', restoreIfPlan);
    return () => window.removeEventListener('hashchange', restoreIfPlan);
  });

  const RW_KEY = 'camper-solar-layout:resultsW:v1';
  const MIN_W = 220;
  const MAX_W = 640;
  const clampW = (n: number) => Math.min(MAX_W, Math.max(MIN_W, Math.round(n)));

  function loadW(): number {
    try {
      const n = Number(localStorage.getItem(RW_KEY));
      return n >= MIN_W && n <= MAX_W ? n : 300;
    } catch {
      return 300;
    }
  }

  let resultsW = $state(loadW());

  function saveResultsW() {
    try {
      localStorage.setItem(RW_KEY, String(resultsW));
    } catch {
      // best-effort
    }
  }
</script>

<div class="app">
  <Toolbar />
  <div class="body" style="--results-w: {resultsW}px">
    <aside class="sidebar">
      <SurfaceList />
      <PanelOptionsList />
      <SpacingForm />
    </aside>
    <main class="stage">
      <LayoutCanvas />
    </main>
    <aside class="results">
      <ResizeHandle
        edge="left"
        width={resultsW}
        label={$t('app.resizeResults')}
        onresize={(w) => (resultsW = clampW(w))}
        oncommit={saveResultsW}
      />
      <ResultsSummary />
    </aside>
  </div>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .body {
    flex: 1;
    display: grid;
    grid-template-columns: 320px 1fr var(--results-w, 300px);
    min-height: 0;
  }
  .sidebar,
  .results {
    overflow-y: auto;
    padding: 14px;
    background: var(--bg);
  }
  .sidebar {
    border-right: 1px solid var(--border);
  }
  .results {
    position: relative;
    border-left: 1px solid var(--border);
  }
  .stage {
    min-width: 0;
    background: #0a0e13;
  }

  @media (max-width: 1000px) {
    .body {
      grid-template-columns: 1fr;
      grid-auto-rows: min-content;
      overflow-y: auto;
    }
    .stage {
      height: 60vh;
    }
  }
</style>
