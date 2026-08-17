<script lang="ts">
  import type { Snippet } from 'svelte';

  // Anchored dropdown panel. Closes on outside pointerdown and on Escape; on narrow
  // viewports it pins to the screen edges instead of the trigger so it never overflows.
  let {
    open = $bindable(false),
    label,
    align = 'right',
    trigger,
    children,
  }: {
    open?: boolean;
    label: string;
    align?: 'left' | 'right';
    trigger: Snippet<[() => void]>;
    children: Snippet;
  } = $props();

  let wrapper = $state<HTMLDivElement | null>(null);
  let panel = $state<HTMLDivElement | null>(null);
  let shift = $state(0);

  const toggle = () => (open = !open);

  // Nudge the panel back inside the viewport when anchoring to the trigger would push it
  // off an edge (narrow screens, triggers near the right edge). offsetWidth and the
  // wrapper rect are both unaffected by the shift, so this is stable across re-runs.
  $effect(() => {
    if (!open || !panel || !wrapper) return;
    const margin = 8;
    const width = panel.offsetWidth;
    const anchor = wrapper.getBoundingClientRect();
    const left = align === 'left' ? anchor.left : anchor.right - width;
    const right = left + width;
    if (left < margin) shift = margin - left;
    else if (right > window.innerWidth - margin) shift = window.innerWidth - margin - right;
    else shift = 0;
  });

  $effect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapper && !wrapper.contains(e.target as Node)) open = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false;
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  });
</script>

<div class="pop" bind:this={wrapper}>
  {@render trigger(toggle)}
  {#if open}
    <div
      class="panel"
      class:left={align === 'left'}
      bind:this={panel}
      style="transform: translateX({shift}px)"
      role="group"
      aria-label={label}
    >
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .pop {
    position: relative;
    display: inline-flex;
  }
  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 30;
    min-width: 240px;
    padding: 12px;
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  }
  .panel.left {
    right: auto;
    left: 0;
  }

  /* Phones: never wider than the viewport, and scroll internally if tall. */
  @media (max-width: 600px) {
    .panel,
    .panel.left {
      min-width: 0;
      max-width: calc(100vw - 16px);
      max-height: 70dvh;
      overflow-y: auto;
    }
  }
</style>
