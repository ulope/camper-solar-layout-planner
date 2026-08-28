<script lang="ts">
  import { config, setConfig, clearLayouts } from '../lib/stores';
  import { defaultConfig, exportConfig, importConfig } from '../lib/persistence';
  import OptimizeButton from './OptimizeButton.svelte';
  import Popover from './Popover.svelte';
  import { LOCALES, locale, setLocale, t, type Locale } from '../lib/i18n';

  let fileInput: HTMLInputElement;
  let menuOpen = $state(false);

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
      alert($t('toolbar.importError'));
    }
    fileInput.value = '';
  }

  function reset() {
    if (confirm($t('toolbar.resetConfirm'))) {
      setConfig(defaultConfig());
      clearLayouts();
    }
  }

  function pickFile() {
    fileInput.click();
  }

  // Same three actions, rendered inline on wide screens and inside the ⋯ menu on narrow
  // ones; the menu entries also close the menu.
  function fromMenu(action: () => void) {
    menuOpen = false;
    action();
  }

  function onLanguage(e: Event) {
    setLocale((e.currentTarget as HTMLSelectElement).value as Locale);
  }
</script>

<header class="bar">
  <div class="title">
    <span class="logo" aria-hidden="true">☀</span>
    <h1>{$t('app.title')}</h1>
  </div>
  <div class="actions">
    <div class="file-actions">
      <button class="ghost" onclick={pickFile}>{$t('toolbar.import')}</button>
      <button class="ghost" onclick={doExport}>{$t('toolbar.export')}</button>
      <button class="ghost" onclick={reset}>{$t('toolbar.reset')}</button>
    </div>
    <div class="overflow">
      <Popover bind:open={menuOpen} label={$t('toolbar.moreActions')}>
        {#snippet trigger(toggleOpen: () => void)}
          <button
            class="ghost dots"
            aria-label={$t('toolbar.moreActions')}
            aria-expanded={menuOpen}
            onclick={toggleOpen}>⋯</button
          >
        {/snippet}
        <div class="menu">
          <button class="ghost item" onclick={() => fromMenu(pickFile)}>{$t('toolbar.import')}</button>
          <button class="ghost item" onclick={() => fromMenu(doExport)}>{$t('toolbar.export')}</button>
          <button class="ghost item" onclick={() => fromMenu(reset)}>{$t('toolbar.reset')}</button>
        </div>
      </Popover>
    </div>
    <select class="lang" aria-label={$t('toolbar.language')} value={$locale} onchange={onLanguage}>
      {#each LOCALES as l (l.code)}
        <option value={l.code} lang={l.htmlLang}>{l.label}</option>
      {/each}
    </select>
    <OptimizeButton />
  </div>
  <input bind:this={fileInput} type="file" accept="application/json,.json" onchange={onFile} hidden />
</header>

<style>
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    background: var(--panel-bg);
    border-bottom: 1px solid var(--border);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .logo {
    font-size: 20px;
    color: var(--accent);
    flex: none;
  }
  h1 {
    font-size: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .file-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .overflow {
    display: none;
  }
  /* The language picker stays visible at every width — it is how a reader who cannot
     read the current language gets out of it. */
  .lang {
    width: auto;
    padding: 5px 6px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .dots {
    font-size: 16px;
    line-height: 1;
    padding: 6px 10px;
  }
  .menu {
    display: flex;
    flex-direction: column;
    min-width: 140px;
  }
  .item {
    border: none;
    border-radius: 5px;
    text-align: left;
  }

  @media (max-width: 900px) {
    .bar {
      padding: 8px 12px;
    }
    h1 {
      font-size: 14px;
    }
  }

  /* Collapse the file actions into the ⋯ menu before the bar can overflow. */
  @media (max-width: 700px) {
    .file-actions {
      display: none;
    }
    .overflow {
      display: block;
    }
  }

  /* Phones: keep the sun mark, drop the (long) title text but keep it for screen readers. */
  @media (max-width: 560px) {
    h1 {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
</style>
