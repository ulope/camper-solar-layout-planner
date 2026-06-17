<script lang="ts">
  import Toolbar from './components/Toolbar.svelte';
  import DimensionsForm from './components/DimensionsForm.svelte';
  import PanelOptionsList from './components/PanelOptionsList.svelte';
  import KeepOutList from './components/KeepOutList.svelte';
  import LayoutCanvas from './components/LayoutCanvas.svelte';
  import ResultsSummary from './components/ResultsSummary.svelte';

  const RW_KEY = 'camper-solar-layout:resultsW:v1';
  const MIN_W = 220;
  const MAX_W = 640;
  const clampW = (n: number) => Math.min(MAX_W, Math.max(MIN_W, n));

  function loadW(): number {
    try {
      const n = Number(localStorage.getItem(RW_KEY));
      return n >= MIN_W && n <= MAX_W ? n : 300;
    } catch {
      return 300;
    }
  }

  let resultsW = $state(loadW());
  let dragging = false;
  let startX = 0;
  let startW = 0;

  function onHandleDown(e: PointerEvent) {
    dragging = true;
    startX = e.clientX;
    startW = resultsW;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onHandleMove(e: PointerEvent) {
    if (!dragging) return;
    resultsW = clampW(startW + (startX - e.clientX)); // drag left widens
  }
  function onHandleUp() {
    if (!dragging) return;
    dragging = false;
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
      <DimensionsForm />
      <PanelOptionsList />
      <KeepOutList />
    </aside>
    <main class="stage">
      <LayoutCanvas />
    </main>
    <aside class="results">
      <div
        class="resize-handle"
        class:dragging
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize results panel"
        onpointerdown={onHandleDown}
        onpointermove={onHandleMove}
        onpointerup={onHandleUp}
      ></div>
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
  .resize-handle {
    position: absolute;
    top: 0;
    left: -3px;
    width: 7px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
    touch-action: none;
  }
  .resize-handle::after {
    content: '';
    position: absolute;
    top: 0;
    left: 3px;
    width: 1px;
    height: 100%;
    background: transparent;
    transition: background 0.12s;
  }
  .resize-handle:hover::after,
  .resize-handle.dragging::after {
    background: var(--accent);
    width: 2px;
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
    .resize-handle {
      display: none;
    }
  }
</style>
