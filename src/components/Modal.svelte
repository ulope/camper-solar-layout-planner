<script lang="ts">
  import type { Snippet } from 'svelte';

  // Thin wrapper over the native <dialog>: showModal() gives focus trapping, Esc and an
  // inert background for free, so there is no focus-trap code to maintain here.
  let {
    open = $bindable(false),
    title,
    children,
    footer,
  }: {
    open?: boolean;
    title: string;
    children: Snippet;
    footer?: Snippet;
  } = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  // Clicks that land on the dialog element itself (i.e. the backdrop) dismiss it.
  function onBackdropClick(e: MouseEvent) {
    if (e.target === dialog) open = false;
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} onclick={onBackdropClick}>
  <div class="sheet">
    <header>
      <h2>{title}</h2>
      <button class="ghost close" title="Close" aria-label="Close" onclick={() => (open = false)}
        >×</button
      >
    </header>
    <div class="body">
      {@render children()}
    </div>
    {#if footer}
      <footer>
        {@render footer()}
      </footer>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--panel-bg);
    color: var(--text);
    width: min(460px, calc(100vw - 24px));
    max-height: calc(100dvh - 32px);
    overflow: visible;
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.55);
  }
  .sheet {
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 34px);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    font-size: 14px;
  }
  .close {
    font-size: 20px;
    line-height: 1;
    padding: 0 8px;
    color: var(--text-dim);
  }
  .body {
    padding: 14px;
    overflow-y: auto;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-top: 1px solid var(--border);
  }
</style>
