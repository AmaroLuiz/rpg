import { cryptoRng, parse } from '@rpg/engine';
import { Dices, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { newListKey } from '@rpg/engine';
import { useRoller } from '../roller/RollerProvider';
import { Button, ErrorNote, Field, Input } from '../components/ui';
import { useSheetCtx } from './context';

/** Rolagens salvas do personagem ("Ataque furioso: 1d20 + @for + 2"), roladas no servidor com a ficha. */
export function Macros() {
  const { t } = useTranslation();
  const { data, sheet, canEdit, change, characterId, campaignId, isGm } = useSheetCtx();
  const open = useRoller();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [label, setLabel] = useState('');
  const [expr, setExpr] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!canEdit) return null;
  const macros = Object.entries(data.macros ?? {}).sort((a, b) => a[1].order - b[1].order);

  const startEdit = (key: string | 'new') => {
    const m = key === 'new' ? undefined : data.macros?.[key];
    setLabel(m?.label ?? '');
    setExpr(m?.expr ?? '');
    setError(null);
    setEditing(key);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    try {
      parse(expr);
      // Confere se os campos existem nesta ficha (sem rolar de verdade).
      sheet.rollExpression(expr, { rng: () => 1 });
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    const key = editing === 'new' ? newListKey(Object.keys(data.macros ?? {})) : editing!;
    const order = editing === 'new' ? macros.length : (data.macros?.[key]?.order ?? 0);
    change([{ op: 'set', path: ['macros', key], value: { label: label.trim(), expr: expr.trim(), order } }]);
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{t('macros.title')}</h2>
        {editing !== 'new' && (
          <Button variant="ghost" className="text-sm text-accent" onClick={() => startEdit('new')}>
            <Plus className="size-4" aria-hidden />
            {t('macros.new')}
          </Button>
        )}
      </div>
      {editing && (
        <form onSubmit={save} className="flex flex-col gap-2 rounded-xl bg-surface-2/50 p-3">
          <Field label={t('macros.label')}>{(p) => <Input {...p} value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} />}</Field>
          <Field label={t('macros.expr')} hint={t('macros.exprHint')}>
            {(p) => <Input {...p} value={expr} onChange={(e) => setExpr(e.target.value)} required className="font-mono" autoCapitalize="off" spellCheck={false} />}
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      )}
      {macros.length === 0 && !editing && <p className="text-sm text-muted">{t('macros.empty')}</p>}
      <ul className="flex flex-col gap-2" aria-label={t('macros.title')}>
        {macros.map(([key, m]) => (
          <li key={key} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                open({
                  title: m.label,
                  isGm,
                  request: { campaign_id: campaignId, character_id: characterId, expression: m.expr, label: m.label },
                  local: ({ bonus }) => sheet.rollExpression(m.expr, { rng: cryptoRng(), bonus, label: m.label }),
                })
              }
              className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3 text-left hover:border-accent"
              aria-label={t('roller.rollThis', { label: m.label })}
            >
              <Dices className="size-5 shrink-0 text-accent" aria-hidden />
              <span className="flex-1 truncate font-medium">{m.label}</span>
              <span className="truncate font-mono text-xs text-muted">{m.expr}</span>
            </button>
            <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-surface-2" aria-label={t('macros.edit', { label: m.label })} onClick={() => startEdit(key)}>
              <Pencil className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className="grid size-10 place-items-center rounded-lg text-danger hover:bg-surface-2"
              aria-label={t('macros.delete', { label: m.label })}
              onClick={() => confirm(t('macros.deleteConfirm', { label: m.label })) && change([{ op: 'unset', path: ['macros', key] }])}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
