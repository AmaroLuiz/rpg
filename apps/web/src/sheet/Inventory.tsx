import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeleteItem, useItemActions, useItems, useSetEquipped } from '../api/items';
import { Button, cx } from '../components/ui';
import { ItemEditor } from '../items/ItemEditor';
import { ItemList } from '../items/ItemList';
import { useSheetCtx } from './context';
import { Toggle } from './fields';
import { formatValue } from './format';

/** Inventário do personagem: itens equipados aplicam bônus na ficha; carga contra a capacidade. */
export function InventoryField() {
  const { t } = useTranslation();
  const { characterId, campaignId, compiled, sheet, canEdit, isGm } = useSheetCtx();
  const items = useItems(campaignId, 'character', characterId);
  const equip = useSetEquipped();
  const del = useDeleteItem();
  const { identify } = useItemActions();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const inv = compiled.template.inventory;
  const load = inv?.loadField ? sheet.field(inv.loadField) : null;
  const cap = inv?.capacityField ? sheet.field(inv.capacityField) : null;
  const over = typeof load?.value === 'number' && typeof cap?.value === 'number' && load.value > cap.value;
  const pct = typeof load?.value === 'number' && typeof cap?.value === 'number' && cap.value > 0 ? Math.min(100, (load.value / cap.value) * 100) : 0;

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{t('sheet.inventory')}</span>
        {load && cap && (
          <span className={cx('text-sm tabular-nums', over ? 'text-danger' : 'text-muted')} aria-label={t('items.loadOf', { load: formatValue(load.value), cap: formatValue(cap.value) })}>
            {formatValue(load.value)} / {formatValue(cap.value)}
          </span>
        )}
      </div>
      {load && cap && (
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className={cx('h-full rounded-full', over ? 'bg-danger' : 'bg-accent')} style={{ width: `${pct}%` }} />
        </div>
      )}
      <ItemList
        label={t('sheet.inventory')}
        items={items.data ?? []}
        compiled={compiled}
        emptyText={t('sheet.inventoryEmpty')}
        trailing={(it) => (
          <label className="flex items-center gap-2 text-xs text-muted">
            {t('sheet.equipped')}
            <Toggle label={t('items.equipThis', { name: it.name })} checked={it.equipped} disabled={!canEdit} onChange={(v) => equip.mutate({ id: it.id, equipped: v })} />
          </label>
        )}
        actions={(it) =>
          canEdit ? (
            <>
              <Button variant="secondary" className="min-h-10 text-sm" onClick={() => setEditing(it.id)}>
                {t('notes.edit')}
              </Button>
              <Button variant="danger" className="min-h-10 text-sm" onClick={() => confirm(t('items.deleteConfirm', { name: it.name })) && del.mutate(it.id)}>
                {t('notes.delete')}
              </Button>
              {isGm && !it.identified && (
                <Button className="min-h-10 text-sm" busy={identify.isPending} onClick={() => identify.mutate(it.id)}>
                  {t('items.identify')}
                </Button>
              )}
            </>
          ) : null
        }
        editing={(it) => (editing === it.id ? <ItemEditor campaignId={campaignId} compiled={compiled} item={it} isGm={isGm} onDone={() => setEditing(null)} /> : null)}
      />
      {editing === 'new' && <ItemEditor campaignId={campaignId} compiled={compiled} holder={{ type: 'character', id: characterId }} isGm={isGm} onDone={() => setEditing(null)} />}
      {canEdit && editing !== 'new' && (
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden />
          {t('items.add')}
        </Button>
      )}
    </div>
  );
}
