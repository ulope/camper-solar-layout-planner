<script lang="ts">
  // Disclosure marker for the sidebar's two levels. Drawn rather than the ▸ glyph, whose
  // rendered size varies wildly across platform fonts and comes out spindly on most of
  // them; a stroked path keeps the same weight as the surrounding UI at any size.
  let { open = false, size = 14 }: { open?: boolean; size?: number } = $props();
</script>

<svg
  class="chevron"
  class:open
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M6 3.5 L11 8 L6 12.5" />
</svg>

<style>
  .chevron {
    display: block;
    flex: none;
    transition: transform 0.15s ease;
  }
  .chevron.open {
    transform: rotate(90deg);
  }
</style>
