<script lang="ts">
  import type { SectionId } from '../lib/uiPrefs';

  // The rail's icons. Drawn for the same reason as the chevron and the toolbar's globe:
  // the box-drawing glyphs these replaced (▭ ▤ ⇔) come out at a different weight in every
  // platform font, and mostly too faint to read at rail size.
  let { id, size = 17 }: { id: SectionId; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.3"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if id === 'overview'}
    <!-- Totals: three bars of differing length. -->
    <path d="M2.5 4h11M2.5 8h7.5M2.5 12h4.5" />
  {:else if id === 'surfaces'}
    <!-- A surface with a keep-out cut out of it. -->
    <rect x="1.9" y="3.4" width="12.2" height="9.2" rx="1.4" />
    <rect x="8.6" y="6.1" width="3.8" height="3.8" rx="0.7" />
  {:else if id === 'panels'}
    <!-- An array of modules. -->
    <rect x="1.9" y="2.9" width="5" height="4.6" rx="0.8" />
    <rect x="9.1" y="2.9" width="5" height="4.6" rx="0.8" />
    <rect x="1.9" y="9.5" width="5" height="4.6" rx="0.8" />
    <rect x="9.1" y="9.5" width="5" height="4.6" rx="0.8" />
  {:else}
    <!-- Spacing: a measured gap between two edges. -->
    <path d="M2.4 3v10M13.6 3v10M5 8h6M5 8l1.8-1.8M5 8l1.8 1.8M11 8 9.2 6.2M11 8l-1.8 1.8" />
  {/if}
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
