import { newListKey, type FieldResult, type ListDef, type SubFieldDef } from '@rpg/engine';
import { ChevronDown, Dices, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cx } from '../components/ui';
import { useSheetCtx } from './context';
import { NumberInput, selectOptions, SelectInput, TextInput, Toggle, ValueWithBreakdown } from './fields';
import { formatValue } from './format';
import { shortLabel, useRollAction } from './RollButtons';

function defaultOf(f: SubFieldDef) {
  if ('default' in f && f.default !== undefined) return f.default;
  if (f.type === 'checkbox') return false;
  if (f.type === 'number') return 0;
  return f.type === 'computed' ? undefined : '';
}

/** Lista da ficha: cada item numa linha; seleções e marcadores editáveis na própria linha; o resto ao abrir. */
export function ListField({ list }: { list: ListDef }) {
  const { t } = useTranslation();
  const { compiled, sheet, data, canEdit, change } = useSheetCtx();
  const [open, setOpen] = useState<string | null>(null);
  const items = sheet.listItems(list.id);
  const stored = data.lists[list.id] ?? { order: [], items: {} };
  const editable = canEdit && list.editable !== false;
  const computed = list.fields.filter((f) => f.type === 'computed');
  const primary = computed.at(-1);
  const inline = list.fields.filter((f) => f.type === 'select' || f.type === 'checkbox');
  const detail = list.fields.filter((f) => f.type !== 'computed' && f.type !== 'select' && f.type !== 'checkbox' && f.id !== list.titleField);
  const path = (key: string, sub: string) => ['lists', list.id, 'items', key, sub];
  const rollAction = useRollAction();
  const listRolls = compiled.template.rolls.filter((r) => r.list === list.id);
  const set = (key: string, sub: string, value: unknown) => change([{ op: 'set', path: path(key, sub), value }]);

  const add = () => {
    const key = newListKey(stored.order);
    const item: Record<string, unknown> = {};
    for (const f of list.fields) {
      const d = defaultOf(f);
      if (d !== undefined) item[f.id] = d;
    }
    if (list.titleField) item[list.titleField] = t('sheet.newItem');
    change([
      { op: 'set', path: ['lists', list.id, 'items', key], value: item },
      { op: 'set', path: ['lists', list.id, 'order'], value: [...stored.order, key] },
    ]);
    setOpen(key);
  };

  const remove = (key: string, name: string) => {
    if (!confirm(t('sheet.removeItemConfirm', { name }))) return;
    change([
      { op: 'set', path: ['lists', list.id, 'order'], value: stored.order.filter((k) => k !== key) },
      { op: 'unset', path: ['lists', list.id, 'items', key] },
    ]);
  };

  return (
    <div className="flex flex-col">
      {items.length === 0 && <p className="py-2 text-muted">—</p>}
      <ul className="flex flex-col divide-y divide-line">
        {items.map((item) => {
          const title = list.titleField ? formatValue(item.values[list.titleField]?.value ?? null) : item.key;
          const isOpen = open === item.key;
          return (
            <li key={item.key} className="py-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-1 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : item.key)}
                >
                  <ChevronDown className={cx('size-4 shrink-0 text-muted transition', isOpen && 'rotate-180')} aria-hidden />
                  <span className="truncate">{title}</span>
                </button>
                {primary && <ValueWithBreakdown result={item.values[primary.id] as FieldResult} format={primary.type === 'computed' ? primary.format : undefined} label={`${title} ${primary.label}`} />}
                {rollAction.canRoll &&
                  listRolls.map((r) => {
                    const short = shortLabel(r);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => rollAction.roll(r, item.key)}
                        aria-label={t('roller.rollThis', { label: short ? `${short}: ${title}` : title })}
                        className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl bg-accent-soft px-2.5 text-sm font-medium text-accent"
                      >
                        <Dices className="size-5" aria-hidden />
                        {short && <span>{short}</span>}
                      </button>
                    );
                  })}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-5 text-sm text-muted">
                {inline.map((f) =>
                  f.type === 'checkbox' ? (
                    <label key={f.id} className="flex items-center gap-2">
                      {f.label}
                      <Toggle label={`${title}: ${f.label}`} checked={item.values[f.id]?.value === true} disabled={!canEdit} onChange={(v) => set(item.key, f.id, v)} />
                    </label>
                  ) : (
                    <SelectInput
                      key={f.id}
                      compact
                      label={`${title}: ${f.label}`}
                      value={item.values[f.id]?.value}
                      options={selectOptions(f, compiled)}
                      disabled={!canEdit}
                      onChange={(v) => set(item.key, f.id, v)}
                    />
                  ),
                )}
                {computed
                  .filter((f) => f !== primary)
                  .map((f) => (
                    <span key={f.id}>
                      {f.label} {formatValue(item.values[f.id]?.value ?? null, f.type === 'computed' ? f.format : undefined)}
                    </span>
                  ))}
              </div>
              {isOpen && (
                <div className="mt-2 flex flex-col rounded-xl bg-surface-2/50 px-3">
                  {list.titleField && (
                    <TextInput label={list.fields.find((f) => f.id === list.titleField)!.label} value={String(item.values[list.titleField]?.value ?? '')} disabled={!canEdit} onCommit={(v) => set(item.key, list.titleField!, v)} />
                  )}
                  {detail.map((f) =>
                    f.type === 'number' ? (
                      <div key={f.id} className="flex min-h-14 items-center justify-between gap-2">
                        <span>{f.label}</span>
                        <NumberInput
                          label={`${title}: ${f.label}`}
                          value={Number(item.values[f.id]?.base ?? 0)}
                          step={f.step ?? 1}
                          disabled={!canEdit}
                          onSet={(n) => set(item.key, f.id, n)}
                          onAdd={(n) => set(item.key, f.id, Number(item.values[f.id]?.base ?? 0) + n)}
                        />
                      </div>
                    ) : (
                      <TextInput
                        key={f.id}
                        label={f.label}
                        multiline={f.type === 'longtext'}
                        value={String(item.values[f.id]?.value ?? '')}
                        disabled={!canEdit}
                        onCommit={(v) => set(item.key, f.id, v)}
                      />
                    ),
                  )}
                  {editable && (
                    <Button variant="danger" className="my-2" onClick={() => remove(item.key, title)}>
                      <Trash2 className="size-4" aria-hidden />
                      {t('sheet.removeItem')}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {editable && (
        <Button variant="secondary" className="mt-2" onClick={add}>
          <Plus className="size-4" aria-hidden />
          {t('sheet.addItem')}
        </Button>
      )}
    </div>
  );
}
