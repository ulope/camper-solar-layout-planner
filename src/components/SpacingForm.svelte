<script lang="ts">
  import { config } from '../lib/stores';
  import { num } from '../lib/format';
  import { t } from '../lib/i18n';

  const SNAPS = [0, 1, 5, 10];
</script>

<div class="grid">
  <div>
    <label for="margin">{$t('spacing.edgeMargin')}</label>
    <input
      id="margin"
      type="number"
      min="0"
      value={$config.edgeMargin}
      oninput={(e) => config.update((c) => ({ ...c, edgeMargin: num(e) }))}
    />
  </div>
  <div>
    <label for="gap">{$t('spacing.panelGap')}</label>
    <input
      id="gap"
      type="number"
      min="0"
      value={$config.panelGap}
      oninput={(e) => config.update((c) => ({ ...c, panelGap: num(e) }))}
    />
  </div>
  <div>
    <label for="snap">{$t('spacing.gridSnap')}</label>
    <select
      id="snap"
      value={String($config.gridSnap)}
      onchange={(e) =>
        config.update((c) => ({ ...c, gridSnap: Number((e.target as HTMLSelectElement).value) }))}
    >
      {#each SNAPS as cm (cm)}
        <option value={String(cm)}>
          {cm === 0 ? $t('spacing.snapOff') : $t('spacing.snapCm', { cm })}
        </option>
      {/each}
    </select>
  </div>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
</style>
