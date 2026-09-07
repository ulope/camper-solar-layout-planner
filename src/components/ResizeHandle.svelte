<script lang="ts">
  // The drag strip between a side panel and the canvas. `edge` says which edge of the
  // panel it sits on, which is also what decides the drag direction: a handle on a
  // panel's left edge widens it when dragged left, one on its right edge when dragged
  // right. Reports widths; the caller owns clamping and persistence.
  let {
    edge,
    width,
    label,
    onresize,
    oncommit,
  }: {
    edge: 'left' | 'right';
    width: number;
    label: string;
    onresize: (width: number) => void;
    oncommit?: (width: number) => void;
  } = $props();

  let dragging = $state(false);
  let startX = 0;
  let startW = 0;
  let current = 0;

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    startX = e.clientX;
    startW = width;
    current = width;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const delta = edge === 'left' ? startX - e.clientX : e.clientX - startX;
    current = startW + delta;
    onresize(current);
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    oncommit?.(current);
  }
</script>

<div
  class="handle {edge}"
  class:dragging
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
></div>

<style>
  .handle {
    position: absolute;
    top: 0;
    width: 7px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
    touch-action: none;
  }
  .handle.left {
    left: -3px;
  }
  .handle.right {
    right: -3px;
  }
  .handle::after {
    content: '';
    position: absolute;
    top: 0;
    left: 3px;
    width: 1px;
    height: 100%;
    background: transparent;
    transition: background 0.12s;
  }
  .handle:hover::after,
  .handle.dragging::after {
    background: var(--accent);
    width: 2px;
  }

  @media (max-width: 1000px) {
    .handle {
      display: none;
    }
  }
</style>
