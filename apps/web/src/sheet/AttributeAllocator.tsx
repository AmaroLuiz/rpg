import { creationBase, creationOps, cryptoRng, findMethod, pointBuyStatus, pointCost, rollAttribute, type CreationState } from '@rpg/engine';
import { Dices, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, cx } from '../components/ui';
import { useSheetCtx } from './context';
import { NumberInput } from './fields';
import { formatValue } from './format';

const rng = cryptoRng();

/** Distribuição de atributos pelos métodos do template: pontos, rolagem ou manual. */
export function AttributeAllocator() {
  const { t } = useTranslation();
  const { compiled, data, sheet, canEdit, change } = useSheetCtx();
  const attrs = compiled.template.creation?.attributes;
  if (!attrs) return null;
  const state: CreationState = data.creation ?? {};
  const method = findMethod(compiled, state.method)!;
  const labelOf = (id: string) => compiled.fields.get(id)?.label ?? id;
  const save = (next: CreationState) => change(creationOps(compiled, next));
  const base = creationBase(compiled, state);
  const adjust = (f: string) => (attrs.adjustments ? (state.adjust?.[f] ?? 0) : 0);

  const pick = (id: string) => {
    if (id === method.id) return;
    const next: CreationState = { ...state, method: id };
    save(next);
  };

  const setAdjust = (f: string, n: number) => save({ ...state, method: method.id, adjust: { ...state.adjust, [f]: n } });

  const methodTabs = attrs.methods.length > 1 && (
    <div role="radiogroup" aria-label={t('creation.method')} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${attrs.methods.length}, minmax(0, 1fr))` }}>
      {attrs.methods.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={m.id === method.id}
          disabled={!canEdit}
          onClick={() => pick(m.id)}
          className={cx('min-h-12 rounded-xl border px-2 text-sm', m.id === method.id ? 'border-accent bg-accent-soft font-medium' : 'border-line')}
        >
          {m.label}
        </button>
      ))}
    </div>
  );

  let header: React.ReactNode = null;
  if (method.kind === 'pointBuy') {
    const st = pointBuyStatus(method, base ?? {}, attrs.fields);
    header = (
      <div className={cx('rounded-xl px-3 py-2', st.issues.length ? 'bg-danger/10 text-danger' : 'bg-surface-2')} role="status">
        <p className="font-medium">{t('creation.pointsLeft', { left: st.remaining, total: st.budget })}</p>
        {st.issues.map((i) => (
          <p key={i} className="text-sm">
            {i.replace(/^(\w+):/, (_, f: string) => `${labelOf(f)}:`)}
          </p>
        ))}
      </div>
    );
  } else if (method.kind === 'roll') {
    const rolls = state.rolls ?? [];
    header = (
      <div className="flex flex-col gap-2">
        <Button
          variant={rolls.length ? 'secondary' : 'primary'}
          disabled={!canEdit}
          onClick={() => {
            if (rolls.length && !confirm(t('creation.rerollConfirm'))) return;
            const fresh = attrs.fields.map(() => rollAttribute(method, rng));
            const assign = Object.fromEntries(attrs.fields.map((f, i) => [f, i]));
            save({ ...state, method: method.id, rolls: fresh, assign });
          }}
        >
          <Dices className="size-5" aria-hidden />
          {rolls.length ? t('creation.reroll') : t('creation.roll')}
        </Button>
        {rolls.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label={t('creation.results')}>
            {rolls.map((r, i) => (
              <li key={i} className="rounded-lg bg-surface-2 px-2.5 py-1 text-sm tabular-nums" title={r.text}>
                {r.total} → <strong>{formatValue(r.value, 'signed')}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {methodTabs}
      {method.description && <p className="text-sm text-muted">{method.description}</p>}
      {header}
      <ul className="flex flex-col divide-y divide-line">
        {attrs.fields.map((f) => {
          const label = labelOf(f);
          const final = sheet.field(f).value;
          return (
            <li key={f} className="flex flex-col gap-1 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{label}</span>
                {method.kind === 'manual' ? (
                  <NumberInput
                    label={label}
                    value={Number(sheet.field(f).base ?? 0)}
                    disabled={!canEdit}
                    onSet={(n) => change([{ op: 'set', path: ['values', f], value: n }])}
                    onAdd={(n) => change([{ op: 'set', path: ['values', f], value: Number(sheet.field(f).base ?? 0) + n }])}
                  />
                ) : method.kind === 'pointBuy' ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="grid size-11 place-items-center rounded-xl bg-surface-2 disabled:opacity-40"
                      aria-label={t('sheet.decrease', { label })}
                      disabled={!canEdit || (base?.[f] ?? method.base) <= method.min}
                      onClick={() => save({ ...state, method: method.id, base: { ...base, [f]: (base?.[f] ?? method.base) - 1 } })}
                    >
                      <Minus className="size-5" aria-hidden />
                    </button>
                    <span className="w-10 text-center text-lg font-semibold tabular-nums" aria-label={`${label} ${t('creation.bought')}`}>
                      {formatValue(base?.[f] ?? method.base)}
                    </span>
                    <button
                      type="button"
                      className="grid size-11 place-items-center rounded-xl bg-surface-2 disabled:opacity-40"
                      aria-label={t('sheet.increase', { label })}
                      disabled={!canEdit || (base?.[f] ?? method.base) >= method.max}
                      onClick={() => save({ ...state, method: method.id, base: { ...base, [f]: (base?.[f] ?? method.base) + 1 } })}
                    >
                      <Plus className="size-5" aria-hidden />
                    </button>
                  </div>
                ) : (
                  <select
                    aria-label={`${label}: ${t('creation.result')}`}
                    disabled={!canEdit || !(state.rolls ?? []).length}
                    value={state.assign?.[f] ?? ''}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      const assign = { ...state.assign };
                      // Trocar: quem tinha este resultado fica com o resultado antigo deste atributo.
                      const other = Object.keys(assign).find((k) => assign[k] === idx && k !== f);
                      if (other !== undefined) {
                        if (assign[f] === undefined) delete assign[other];
                        else assign[other] = assign[f]!;
                      }
                      assign[f] = idx;
                      save({ ...state, method: method.id, assign });
                    }}
                    className="h-11 rounded-xl border border-line bg-surface px-2 tabular-nums"
                  >
                    <option value="">—</option>
                    {(state.rolls ?? []).map((r, i) => (
                      <option key={i} value={i}>
                        {formatValue(r.value, 'signed')} ({r.total})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {method.kind !== 'manual' && (
                <div className="flex items-center justify-end gap-3 text-sm text-muted">
                  {method.kind === 'pointBuy' && (
                    <span>{t('creation.cost', { cost: pointCost(method, base?.[f] ?? method.base) ?? '?' })}</span>
                  )}
                  {attrs.adjustments && (
                    <label className="flex items-center gap-2">
                      {attrs.adjustments.label}
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`${label}: ${attrs.adjustments.label}`}
                        disabled={!canEdit}
                        defaultValue={adjust(f) || ''}
                        key={`${f}-${adjust(f)}`}
                        onBlur={(e) => {
                          const n = Number(e.target.value.replace('−', '-') || 0);
                          if (Number.isFinite(n) && n !== adjust(f)) setAdjust(f, n);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        className="h-10 w-14 rounded-lg border border-line bg-surface text-center tabular-nums"
                      />
                    </label>
                  )}
                  <span className="text-ink">
                    {t('creation.final')} <strong className="tabular-nums">{formatValue(final)}</strong>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
