<script lang="ts">
  import {
    config,
    layoutStale,
    runOptimize,
    cancelOptimize,
    setConfig,
    clearLayouts,
    optimizerEffort,
    optimizing,
    optimizeProgress,
  } from '../lib/stores';
  import { defaultConfig, exportConfig, importConfig } from '../lib/persistence';

  let fileInput: HTMLInputElement;

  const elapsedS = $derived(($optimizeProgress.elapsedMs / 1000).toFixed(1));

  function doExport() {
    const blob = new Blob([exportConfig($config)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'solar-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = importConfig(text);
    if (parsed) {
      setConfig(parsed);
      clearLayouts();
    } else {
      alert('That file is not a valid layout configuration.');
    }
    fileInput.value = '';
  }

  function reset() {
    if (confirm('Reset everything to the default example configuration?')) {
      setConfig(defaultConfig());
      clearLayouts();
    }
  }
</script>

<header class="bar">
  <div class="title">
    <span class="logo">☀</span>
    <h1>Camper Solar Layout Planner</h1>
  </div>
  <div class="actions">
    <button class="ghost" onclick={() => fileInput.click()}>Import</button>
    <button class="ghost" onclick={doExport}>Export</button>
    <button class="ghost" onclick={reset}>Reset</button>
    <div class="effort" role="group" aria-label="Optimizer effort">
      <button
        class="seg"
        class:on={$optimizerEffort === 'fast'}
        disabled={$optimizing}
        onclick={() => optimizerEffort.set('fast')}
        title="Instant heuristic">⚡ Fast</button
      >
      <button
        class="seg"
        class:on={$optimizerEffort === 'thorough'}
        disabled={$optimizing}
        onclick={() => optimizerEffort.set('thorough')}
        title="Deeper ~5s search">🔎 Thorough</button
      >
    </div>
    {#if $optimizing}
      <span class="progress" aria-live="polite">
        Optimizing… {elapsedS}s · {$optimizeProgress.bestPower} Wp
      </span>
      <button class="danger" onclick={cancelOptimize}>Cancel</button>
    {:else}
      <button class="primary" class:pulse={$layoutStale} onclick={runOptimize}>⚡ Optimize</button>
    {/if}
  </div>
  <input
    bind:this={fileInput}
    type="file"
    accept="application/json,.json"
    onchange={onFile}
    hidden
  />
</header>

<style>
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 18px;
    background: var(--panel-bg);
    border-bottom: 1px solid var(--border);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .logo {
    font-size: 20px;
    color: var(--accent);
  }
  h1 {
    font-size: 16px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .effort {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .seg {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .seg.on {
    background: var(--panel-bg-2, #28333f);
    color: var(--text);
  }
  .seg:disabled {
    cursor: default;
  }
  .progress {
    font-size: 12px;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .danger {
    background: rgba(229, 83, 75, 0.15);
    border: 1px solid #e5534b;
    color: #e5534b;
  }
  .pulse {
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(245, 166, 35, 0.5);
    }
    50% {
      box-shadow: 0 0 0 6px rgba(245, 166, 35, 0);
    }
  }
</style>
