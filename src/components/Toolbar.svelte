<script lang="ts">
  import {
    config,
    setConfig,
    clearLayouts,
    setImportedLayouts,
    layoutsBySurface,
    selectedBySurface,
    selectedLayouts,
  } from '../lib/stores';
  import { defaultConfig, exportConfig, importConfig } from '../lib/persistence';
  import OptimizeButton from './OptimizeButton.svelte';
  import Popover from './Popover.svelte';
  import { fmt, LOCALES, locale, localeInfo, setLocale, t, type Locale } from '../lib/i18n';

  let fileInput: HTMLInputElement;
  let menuOpen = $state(false);
  let langOpen = $state(false);

  const current = $derived(localeInfo($locale));

  /**
   * The configuration as a JSON file, carrying the layout shown for each surface when
   * there is one — so a saved plan comes back as the plan, not just the inputs it was
   * found from.
   */
  function doExport() {
    const blob = new Blob([exportConfig($config, $selectedLayouts)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'solar-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * The PDF report of what is currently on screen: each surface's selected option drawn
   * to scale, plus the bill of materials. Which alternative that is travels with it, so
   * a printed plan says which of the computed options it shows.
   *
   * The report module is imported on demand: it pulls in jsPDF, which is larger than the
   * rest of the app put together and is of no use until someone asks for a PDF.
   */
  let exporting = $state(false);

  async function doExportPdf() {
    if (exporting) return;
    exporting = true;
    try {
      const { buildLayoutPdf } = await import('../lib/pdf/report');
      const selection = Object.fromEntries(
        $config.surfaces.map((s) => [
          s.id,
          { index: $selectedBySurface[s.id] ?? 0, count: ($layoutsBySurface[s.id] ?? []).length },
        ]),
      );
      buildLayoutPdf({
        config: $config,
        selected: $selectedLayouts,
        selection,
        t: $t,
        fmt: $fmt,
        // Where this app is served from, so the QR code on the report comes back to the
        // copy that printed it rather than to a hard-coded address.
        shareUrlBase: location.origin + location.pathname,
      }).save('solar-layout.pdf');
    } finally {
      exporting = false;
    }
  }

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = importConfig(text);
    if (parsed) {
      // Order matters: setting the config marks the layouts stale, so the imported ones
      // are adopted after it, not before.
      setConfig(parsed.config);
      setImportedLayouts(parsed.layouts);
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
      <button
        class="ghost"
        onclick={doExportPdf}
        disabled={exporting}
        title={$t('toolbar.pdfTitle')}>{$t('toolbar.pdf')}</button
      >
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
            <!-- Drawn rather than the 🌐 emoji, which platform fonts force to a fixed
                 blue that clashes with any toolbar it lands on. Stroked in currentColor,
                 so it takes the button's own text color on light or dark. -->
            <svg
              class="icon"
              viewBox="0 0 16 16"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="6.3" />
              <ellipse cx="8" cy="8" rx="2.75" ry="6.3" />
              <path d="M2.1 5.8h11.8M2.1 10.2h11.8" />
            </svg>
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
          <button class="ghost item" onclick={() => fromMenu(doExportPdf)}>{$t('toolbar.pdf')}</button>
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
    display: block;
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
