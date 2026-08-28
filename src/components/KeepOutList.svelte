<script lang="ts">
  import { activeSurface, updateKeepOut, removeKeepOut, addKeepOut, selectedKeepOut } from '../lib/stores';
  import { t } from '../lib/i18n';

  function num(e: Event): number {
    return Math.round(Number((e.target as HTMLInputElement).value) || 0);
  }
</script>

<section class="card">
  <div class="head">
    <h2>{$t('keepOuts.title')} <span class="scope">{$activeSurface.name}</span></h2>
    <button class="ghost" onclick={() => addKeepOut({ x: 10, y: 10, w: 40, h: 40 })}
      >{$t('common.add')}</button
    >
  </div>
  <p class="hint">{$t('keepOuts.hint')}</p>

  {#if $activeSurface.keepOuts.length === 0}
    <p class="empty">{$t('keepOuts.empty')}</p>
  {/if}

  {#each $activeSurface.keepOuts as ko (ko.id)}
    <div
      class="row"
      class:selected={$selectedKeepOut === ko.id}
      onclick={() => selectedKeepOut.set(ko.id)}
      onkeydown={(e) => e.key === 'Enter' && selectedKeepOut.set(ko.id)}
      role="button"
      tabindex="0"
    >
      <input
        class="label"
        type="text"
        value={ko.label ?? ''}
        oninput={(e) => updateKeepOut(ko.id, { label: (e.target as HTMLInputElement).value })}
      />
      <button
        class="danger ghost del"
        title={$t('keepOuts.remove')}
        onclick={(e) => {
          e.stopPropagation();
          removeKeepOut(ko.id);
        }}>×</button
      >
      <div class="dims">
        <label>
          {$t('keepOuts.x')}
          <input type="number" value={ko.x} oninput={(e) => updateKeepOut(ko.id, { x: num(e) })} />
        </label>
        <label>
          {$t('keepOuts.y')}
          <input type="number" value={ko.y} oninput={(e) => updateKeepOut(ko.id, { y: num(e) })} />
        </label>
        <label>
          {$t('keepOuts.length')}
          <input type="number" value={ko.w} oninput={(e) => updateKeepOut(ko.id, { w: num(e) })} />
        </label>
        <label>
          {$t('keepOuts.width')}
          <input type="number" value={ko.h} oninput={(e) => updateKeepOut(ko.id, { h: num(e) })} />
        </label>
      </div>
    </div>
  {/each}
</section>

<style>
  .card {
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 12px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  /* Translations make the action wider than English does; let the heading wrap instead
     of breaking the button across two lines. */
  .head button {
    flex: none;
    white-space: nowrap;
  }
  h2 {
    font-size: 14px;
  }
  .scope {
    font-weight: 400;
    font-size: 12px;
    color: var(--text-dim);
  }
  .scope::before {
    content: '· ';
  }
  .hint {
    color: var(--text-dim);
    font-size: 12px;
    margin: 4px 0 10px;
  }
  .empty {
    color: var(--text-dim);
    font-size: 13px;
    font-style: italic;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 10px 8px;
    margin: 0 -8px;
    border-top: 1px solid var(--border);
    border-radius: 6px;
  }
  .row.selected {
    background: rgba(74, 158, 255, 0.12);
  }
  .label {
    font-weight: 500;
  }
  .del {
    font-size: 18px;
    line-height: 1;
    padding: 2px 8px;
  }
  .dims {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .dims label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 0;
  }
</style>
