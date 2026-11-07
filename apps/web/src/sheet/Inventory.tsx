import { useTranslation } from 'react-i18next';
import { useCharacterItems } from '../api/characters';
import { useSheetCtx } from './context';
import { formatValue } from './format';

/** Inventário só leitura por enquanto: itens já aplicam modificadores e entram na carga. */
export function InventoryField() {
  const { t } = useTranslation();
  const { characterId, compiled, sheet } = useSheetCtx();
  const items = useCharacterItems(characterId);
  const inv = compiled.template.inventory;
  const load = inv?.loadField ? sheet.field(inv.loadField) : null;
  const cap = inv?.capacityField ? sheet.field(inv.capacityField) : null;
  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{t('sheet.inventory')}</span>
        {load && cap && (
          <span className="text-sm tabular-nums text-muted">
            {formatValue(load.value)} / {formatValue(cap.value)}
          </span>
        )}
      </div>
      {items.data?.length === 0 && <p className="text-sm text-muted">{t('sheet.inventoryEmpty')}</p>}
      <ul className="flex flex-col divide-y divide-line">
        {items.data?.map((it) => (
          <li key={it.id} className="flex min-h-11 items-center justify-between gap-2">
            <span>
              {it.nome}
              {it.equipado && <span className="ml-2 text-xs text-ok">{t('sheet.equipped')}</span>}
            </span>
            <span className="tabular-nums text-muted">×{formatValue(it.quantidade)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{t('sheet.inventorySoon')}</p>
    </div>
  );
}
