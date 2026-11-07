import type { CharacterOp } from '@rpg/engine';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../components/ui';
import { useSheetCtx } from './context';
import { formatValue, parseResourceEntry } from './format';

/** Classes inteiras (o Tailwind só gera classes escritas por extenso). */
const BAR: Record<string, string> = {
  red: 'bg-red-600 dark:bg-red-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-600 dark:bg-violet-400',
  blue: 'bg-sky-600 dark:bg-sky-400',
  green: 'bg-emerald-600 dark:bg-emerald-400',
};

/** Mudanças num recurso. Sem valor guardado, o atual é o máximo: aí a primeira mudança grava o número. */
export function resourceOps(fieldId: string, stored: unknown, current: number, delta: number | null, set: number | null): CharacterOp[] {
  const path = ['values', fieldId, 'atual'];
  const hasStored = typeof stored === 'object' && stored !== null && typeof (stored as { atual?: unknown }).atual === 'number';
  if (set !== null) return [{ op: 'set', path, value: set }];
  if (delta === null || delta === 0) return [];
  // inc soma no servidor mesmo com dois danos ao mesmo tempo; só serve se já há número guardado.
  return hasStored ? [{ op: 'inc', path, by: delta }] : [{ op: 'set', path, value: current + delta }];
}

export function ResourceField({ fieldId, compact }: { fieldId: string; compact?: boolean }) {
  const { t } = useTranslation();
  const { compiled, sheet, data, canEdit, change } = useSheetCtx();
  const def = compiled.fields.get(fieldId);
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState('');
  if (!def || def.type !== 'resource') return null;
  const r = sheet.resource(fieldId);
  const stored = data.values[fieldId];
  const pct = r.max > 0 ? Math.max(0, Math.min(100, (r.atual / r.max) * 100)) : 0;
  const color = BAR[def.color ?? 'amber'] ?? BAR.amber!;

  const apply = (delta: number | null, set: number | null) => {
    // Botões não passam do máximo nem do mínimo; digitar um número passa (a mesa decide).
    const clampedDelta = delta === null ? null : Math.max(r.min, Math.min(r.max, r.atual + delta)) - r.atual;
    change(resourceOps(fieldId, stored, r.atual, clampedDelta, set));
  };

  const commitEntry = () => {
    setEditing(false);
    const e = parseResourceEntry(entry);
    if (!e) return;
    if (e.kind === 'set') change(resourceOps(fieldId, stored, r.atual, null, e.n));
    else change(resourceOps(fieldId, stored, r.atual, e.n, null));
  };

  return (
    <div className={cx('flex flex-col gap-1.5', compact ? 'py-1' : 'py-2')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cx(compact ? 'text-sm' : 'font-medium')}>{def.label}</span>
        {r.error ? (
          <span className="text-sm text-danger">{r.error}</span>
        ) : editing ? (
          <input
            autoFocus
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            onBlur={commitEntry}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label={t('sheet.editValue', { label: def.label })}
            placeholder={`${r.atual}`}
            inputMode="text"
            className="h-9 w-24 rounded-lg border border-accent bg-surface px-2 text-right text-lg font-semibold tabular-nums focus:outline-none"
          />
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              setEntry('');
              setEditing(true);
            }}
            aria-label={t('sheet.editValue', { label: def.label })}
            className="rounded-lg px-1 text-lg font-semibold tabular-nums disabled:cursor-default"
          >
            {formatValue(r.atual)}
            <span className="font-normal text-muted"> / {formatValue(r.max)}</span>
            {r.temp > 0 && <span className="ml-1 text-sm text-ok">+{r.temp} {t('sheet.temp')}</span>}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {canEdit && (
          <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 active:scale-95" aria-label={t('sheet.decrease', { label: def.label })} onClick={() => apply(-1, null)}>
            <Minus className="size-5" aria-hidden />
          </button>
        )}
        <div
          className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2"
          role="meter"
          aria-label={def.label}
          aria-valuemin={r.min}
          aria-valuemax={r.max}
          aria-valuenow={r.atual}
        >
          <div className={cx('h-full rounded-full transition-[width]', color)} style={{ width: `${pct}%` }} />
        </div>
        {canEdit && (
          <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 active:scale-95" aria-label={t('sheet.increase', { label: def.label })} onClick={() => apply(1, null)}>
            <Plus className="size-5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
