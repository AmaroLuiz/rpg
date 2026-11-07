import type { AppliedModifier, FieldDef, FieldResult, SubFieldDef } from '@rpg/engine';
import { AlertTriangle, Minus, Plus } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../components/ui';
import { useSheetCtx } from './context';
import { formatValue, parseNumber } from './format';

const control =
  'rounded-xl border border-line bg-surface text-ink focus:border-accent focus:outline-none disabled:border-transparent disabled:bg-transparent disabled:opacity-100';

/** Texto que só grava ao sair do campo (ou Enter), e acompanha mudanças de fora quando não está em edição. */
function useCommitted(value: string, commit: (v: string) => void) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  return {
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onFocus: () => setEditing(true),
    onBlur: () => {
      setEditing(false);
      if (draft !== value) commit(draft);
    },
  };
}

export function Row({ label, htmlFor, children, sub }: { label: string; htmlFor?: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-h-14 flex-col justify-center gap-1 py-2">
      <div className="flex items-center gap-3">
        <label htmlFor={htmlFor} className="min-w-0 flex-1 truncate">
          {label}
        </label>
        {children}
      </div>
      {sub}
    </div>
  );
}

function sourceLabel(m: AppliedModifier): string {
  return m.label ? `${m.source.label} (${m.label})` : m.source.label;
}

/** Valor calculado; tocar mostra de onde veio cada parte. */
export function ValueWithBreakdown({ result, format, label }: { result: FieldResult; format?: 'number' | 'text' | 'percent' | 'signed'; label: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (result.error) {
    return (
      <span className="inline-flex items-center gap-1 text-danger" title={result.error}>
        <AlertTriangle className="size-4" aria-hidden />
        <span className="sr-only">{t('sheet.formulaError')}: </span>
        {result.error}
      </span>
    );
  }
  const hasMods = result.modifiers.length > 0;
  return (
    <span className="relative inline-flex flex-col items-end">
      <button
        type="button"
        className={cx('min-h-10 min-w-12 rounded-lg px-2 text-right font-semibold tabular-nums text-lg', hasMods && 'underline decoration-dotted underline-offset-4')}
        aria-expanded={hasMods ? open : undefined}
        aria-controls={hasMods ? id : undefined}
        aria-label={`${label}: ${formatValue(result.value, format)}`}
        onClick={() => hasMods && setOpen(!open)}
      >
        {formatValue(result.value, format)}
      </button>
      {hasMods && open && (
        <span id={id} className="mt-1 rounded-lg bg-surface-2 px-3 py-2 text-left text-sm text-muted">
          <span className="block">
            {t('sheet.base')}: {formatValue(result.base, format)}
          </span>
          {result.modifiers.map((m, i) => (
            <span key={i} className="block">
              {m.op === 'add' ? formatValue(m.value, 'signed') : `${m.op} ${formatValue(m.value)}`} · {sourceLabel(m)}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export function NumberInput({
  label,
  value,
  step = 1,
  disabled,
  onSet,
  onAdd,
}: {
  label: string;
  value: number;
  step?: number;
  disabled: boolean;
  onSet(n: number): void;
  onAdd(n: number): void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const input = useCommitted(String(value), (txt) => {
    const n = parseNumber(txt);
    if (n !== null) onSet(n);
  });
  return (
    <div className="flex items-center gap-1">
      {!disabled && (
        <button type="button" className="grid size-11 place-items-center rounded-xl bg-surface-2 active:scale-95" aria-label={t('sheet.decrease', { label })} onClick={() => onAdd(-step)}>
          <Minus className="size-5" aria-hidden />
        </button>
      )}
      <input
        id={id}
        {...input}
        aria-label={label}
        inputMode="text"
        disabled={disabled}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={cx(control, 'h-11 w-16 text-center text-lg font-semibold tabular-nums')}
      />
      {!disabled && (
        <button type="button" className="grid size-11 place-items-center rounded-xl bg-surface-2 active:scale-95" aria-label={t('sheet.increase', { label })} onClick={() => onAdd(step)}>
          <Plus className="size-5" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function TextInput({ label, value, multiline, disabled, onCommit }: { label: string; value: string; multiline?: boolean; disabled: boolean; onCommit(v: string): void }) {
  const id = useId();
  const input = useCommitted(value, onCommit);
  return (
    <div className="flex flex-col gap-1.5 py-2">
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      {multiline ? (
        <textarea id={id} {...input} disabled={disabled} rows={4} className={cx(control, 'min-h-24 px-3 py-2')} />
      ) : (
        <input
          id={id}
          {...input}
          disabled={disabled}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className={cx(control, 'min-h-12 px-3')}
        />
      )}
    </div>
  );
}

export function selectOptions(def: FieldDef | SubFieldDef, compiled: ReturnType<typeof useSheetCtx>['compiled']) {
  if (def.type !== 'select') return [];
  if (def.catalog) return (compiled.catalogs.get(def.catalog)?.options ?? []).map((o) => ({ value: o.id as string | number, label: o.label }));
  return def.options ?? [];
}

export function SelectInput({
  label,
  value,
  options,
  disabled,
  compact,
  onChange,
}: {
  label: string;
  value: unknown;
  options: Array<{ value: string | number; label: string }>;
  disabled: boolean;
  compact?: boolean;
  onChange(v: string | number | null): void;
}) {
  const current = options.findIndex((o) => o.value === value);
  if (disabled) return <span className={cx(compact ? 'text-sm' : 'font-medium')}>{current >= 0 ? options[current]!.label : '—'}</span>;
  return (
    <select
      aria-label={label}
      value={current >= 0 ? String(current) : ''}
      onChange={(e) => onChange(e.target.value === '' ? null : options[Number(e.target.value)]!.value)}
      className={cx(control, compact ? 'h-10 px-2 text-sm' : 'min-h-12 max-w-[60%] px-3')}
    >
      <option value="">—</option>
      {options.map((o, i) => (
        <option key={String(o.value)} value={String(i)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange(v: boolean): void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative h-8 w-14 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-line', disabled && 'opacity-70')}
    >
      <span className={cx('absolute top-1 size-6 rounded-full bg-surface shadow transition-all', checked ? 'left-7' : 'left-1')} />
    </button>
  );
}
