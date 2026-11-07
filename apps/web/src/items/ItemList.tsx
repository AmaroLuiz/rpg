import type { CompiledTemplate } from '@rpg/engine';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ItemRow } from '../api/items';
import { cx } from '../components/ui';
import { formatValue } from '../sheet/format';
import { describeModifiers } from './ItemEditor';

/** Lista de itens: nome, quantidade e selos; tocar abre detalhes e as ações que a tela oferecer. */
export function ItemList({
  items,
  compiled,
  emptyText,
  trailing,
  actions,
  editing,
  label,
}: {
  items: ItemRow[];
  compiled: CompiledTemplate;
  emptyText: string;
  trailing?(it: ItemRow): ReactNode;
  actions?(it: ItemRow): ReactNode;
  editing?(it: ItemRow): ReactNode | null;
  label: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const invFields = compiled.template.inventory?.fields ?? [];
  if (!items.length) return <p className="py-2 text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line" aria-label={label}>
      {items.map((it) => {
        const edit = editing?.(it);
        if (edit) return <li key={it.id} className="py-2">{edit}</li>;
        const isOpen = open === it.id;
        const extras = invFields.filter((f) => it.data[f.id] !== undefined && it.data[f.id] !== null && it.data[f.id] !== '' && f.type !== 'longtext');
        return (
          <li key={it.id} className="py-2">
            <div className="flex items-center gap-2">
              <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-1 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : it.id)}>
                <ChevronDown className={cx('size-4 shrink-0 text-muted transition', isOpen && 'rotate-180')} aria-hidden />
                <span className="truncate">{it.name}</span>
                {it.quantity !== 1 && <span className="shrink-0 text-sm tabular-nums text-muted">×{formatValue(it.quantity)}</span>}
                {!it.identified && (
                  <span className="ml-1 inline-flex shrink-0 items-center gap-0.5 rounded bg-accent-soft px-1.5 text-xs text-accent">
                    <HelpCircle className="size-3" aria-hidden />
                    {t('items.unidentified')}
                  </span>
                )}
              </button>
              {trailing?.(it)}
            </div>
            {isOpen && (
              <div className="mt-1 flex flex-col gap-2 pl-5 text-sm">
                {it.description && <p className="whitespace-pre-line">{it.description}</p>}
                {extras.length > 0 && (
                  <p className="text-muted">{extras.map((f) => `${f.label}: ${f.type === 'select' ? (f.options?.find((o) => o.value === it.data[f.id])?.label ?? it.data[f.id]) : formatValue(it.data[f.id] ?? null)}`).join(' · ')}</p>
                )}
                {it.modifiers.length > 0 && <p className="text-ok">{describeModifiers(it.modifiers, compiled)}</p>}
                {actions && <div className="flex flex-wrap gap-2">{actions(it)}</div>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
