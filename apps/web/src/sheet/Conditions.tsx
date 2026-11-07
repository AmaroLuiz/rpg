import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cx } from '../components/ui';
import { useSheetCtx } from './context';

/** Condições ativas como etiquetas; o mestre e o dono podem ligar e desligar. */
export function ConditionsField() {
  const { t } = useTranslation();
  const { compiled, data, canEdit, change } = useSheetCtx();
  const [editing, setEditing] = useState(false);
  const all = compiled.template.conditions;
  const active = new Set(data.conditions);
  const toggle = (id: string) => {
    const next = active.has(id) ? data.conditions.filter((c) => c !== id) : [...data.conditions, id];
    change([{ op: 'set', path: ['conditions'], value: next }]);
  };
  const shown = editing ? all : all.filter((c) => active.has(c.id));
  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{t('sheet.conditions')}</span>
        {canEdit && (
          <Button variant="ghost" className="text-sm text-accent" aria-expanded={editing} onClick={() => setEditing(!editing)}>
            {editing ? t('common.save') : t('sheet.editConditions')}
          </Button>
        )}
      </div>
      {shown.length === 0 && <p className="text-sm text-muted">{t('sheet.noConditions')}</p>}
      <div className="flex flex-wrap gap-2">
        {shown.map((c) => {
          const on = active.has(c.id);
          const effect = c.description ?? c.modifiers?.map((m) => `${m.value} em ${m.target}`).join(', ');
          return editing ? (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c.id)}
              className={cx('min-h-11 rounded-full border px-3.5 text-sm', on ? 'border-danger bg-danger/15 text-danger' : 'border-line')}
              title={effect}
            >
              {c.label}
            </button>
          ) : (
            <span key={c.id} className="rounded-full border border-danger/50 bg-danger/10 px-3 py-1.5 text-sm text-danger" title={effect}>
              {c.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
