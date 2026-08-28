<script lang="ts">
  import { config, setConfig, clearLayouts } from '../lib/stores';
  import { defaultConfig, exportConfig, importConfig } from '../lib/persistence';
  import OptimizeButton from './OptimizeButton.svelte';
  import Popover from './Popover.svelte';
  import { LOCALES, locale, localeInfo, setLocale, t, type Locale } from '../lib/i18n';

  let fileInput: HTMLInputElement;
  let menuOpen = $state(false);
  let langOpen = $state(false);

  const current = $derived(localeInfo($locale));

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

  // Same actions, rendered inline on wide screens and inside the ⋯ menu on narrow ones;
  // the menu entries also close the menu.
  function fromMenu(action: () => void) {
    menuOpen = false;
    action();
  }

  function pickLanguage(code: Locale) {
    setLocale(code);
    langOpen = false;
    menuOpen = false;
  }
</script>

<!-- The language rows, shared by the standalone picker and the ⋯ menu. -->
{#snippet languageItems()}
  {#each LOCALES as l (l.code)}
    <button
      class="ghost item lang-item"
      class:on={$locale === l.code}
      aria-pressed={$locale === l.code}
      lang={l.htmlLang}
      onclick={() => pickLanguage(l.code)}
    >
      <span class="flag" aria-hidden="true">{l.flag}</span>
      <span class="lname">{l.label}</span>
      <span class="tick" aria-hidden="true">{$locale === l.code ? '✓' : ''}</span>
    </button>
  {/each}
{/snippet}

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
    <div class="lang-picker">
      <Popover bind:open={langOpen} label={$t('toolbar.language')}>
        {#snippet trigger(toggleOpen: () => void)}
          <button
            class="ghost globe"
            aria-label={$t('toolbar.languageCurrent', { name: current.label })}
            aria-expanded={langOpen}
            title={$t('toolbar.languageCurrent', { name: current.label })}
            onclick={toggleOpen}
          >
            <span class="icon" aria-hidden="true">🌐</span>
            <span class="caret" aria-hidden="true">▾</span>
          </button>
        {/snippet}
        <div class="menu">
          {@render languageItems()}
        </div>
      </Popover>
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
          <div class="section" role="group" aria-labelledby="lang-heading">
            <p class="group" id="lang-heading">{$t('toolbar.language')}</p>
            {@render languageItems()}
          </div>
        </div>
      </Popover>
    </div>
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
  /* Globe + caret, matching the Optimize split button's disclosure affordance. */
  .globe {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 5px 8px;
    line-height: 1;
  }
  .globe .icon {
    font-size: 15px;
  }
  .globe .caret {
    font-size: 10px;
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
    min-width: 160px;
  }
  .item {
    border: none;
    border-radius: 5px;
    text-align: left;
  }
  /* Language block inside the ⋯ menu, set off from the file actions above it. */
  .section {
    display: flex;
    flex-direction: column;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
  }
  .group {
    color: var(--text-dim);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 4px;
    padding: 0 8px;
  }
  .lang-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .lang-item.on {
    background: var(--panel-bg-2);
    color: var(--text);
  }
  .flag {
    /* Windows has no country-flag glyphs and falls back to a letter pair, so reserve a
       fixed box either way and let the label carry the meaning. */
    flex: none;
    width: 1.35em;
    text-align: center;
  }
  .lname {
    flex: 1;
  }
  .tick {
    flex: none;
    color: var(--accent);
  }

  @media (max-width: 900px) {
    .bar {
      padding: 8px 12px;
    }
    h1 {
      font-size: 14px;
    }
  }

  /* Collapse the file actions and the language picker into the ⋯ menu before the bar
     can overflow. The ⋯ trigger itself is language-neutral, so the languages stay
     reachable for a reader who cannot read the current one. */
  @media (max-width: 700px) {
    .file-actions,
    .lang-picker {
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
