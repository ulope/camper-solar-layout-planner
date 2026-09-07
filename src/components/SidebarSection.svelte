<script lang="ts">
  import type { Snippet } from 'svelte';
  import { sidebarPrefs, toggleSection, type SectionId } from '../lib/uiPrefs';
  import Chevron from './Chevron.svelte';

  // One collapsible card in the sidebar. Owns the card chrome every sidebar panel used to
  // repeat, and reads its own open state from the persisted prefs so a reload comes back
  // to the same shape.
  let {
    id,
    title,
    badge,
    hint,
    children,
  }: {
    id: SectionId;
    title: string;
    /** Short count shown next to the title, e.g. "4" or "3 / 5". */
    badge?: string;
    hint?: string;
    children: Snippet;
  } = $props();

  const open = $derived($sidebarPrefs.open[id]);
  const bodyId = $derived(`sidebar-section-${id}`);
</script>

<section class="card" id="sidebar-{id}">
  <div class="head">
    <button
      class="ghost disclose"
      aria-expanded={open}
      aria-controls={bodyId}
      onclick={() => toggleSection(id)}
    >
      <Chevron {open} />
      <h2>{title}</h2>
      {#if badge}<span class="badge">{badge}</span>{/if}
    </button>
  </div>
  <div class="body" id={bodyId} hidden={!open}>
    {#if hint}<p class="hint">{hint}</p>{/if}
    {@render children()}
  </div>
</section>

<style>
  .card {
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px 10px;
    margin-bottom: 10px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  /* The whole title row toggles, so the hit target is the full width rather than a caret. */
  .disclose {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 5px 6px 5px 4px;
    border: none;
    border-radius: 6px;
    text-align: left;
  }
  .disclose:hover {
    background: var(--panel-bg-2);
  }
  h2 {
    font-size: 13px;
    letter-spacing: 0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    flex: none;
    color: var(--text-dim);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    padding: 1px 6px;
    border-radius: 9px;
    background: var(--panel-bg-2);
  }
  .body {
    padding-top: 4px;
  }
  .hint {
    color: var(--text-dim);
    font-size: 12px;
    margin: 2px 0 8px;
  }
</style>
