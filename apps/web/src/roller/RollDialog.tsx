import { Dices, Minus, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRollMutation, type RollRow, type RollVisibility } from '../api/rolls';
import { Button, ErrorNote, cx } from '../components/ui';
import { friendlyError } from '../lib/errors';
import type { RollSpec } from './RollerProvider';
import { RollResultView } from './RollResultView';

function Stepper({ label, value, onChange }: { label: string; value: number; onChange(n: number): void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="grid size-11 place-items-center rounded-xl bg-surface-2" aria-label={t('sheet.decrease', { label })} onClick={() => onChange(value - 1)}>
          <Minus className="size-5" aria-hidden />
        </button>
        <span className="w-10 text-center text-lg font-semibold tabular-nums" aria-label={label}>
          {value > 0 ? `+${value}` : value}
        </span>
        <button type="button" className="grid size-11 place-items-center rounded-xl bg-surface-2" aria-label={t('sheet.increase', { label })} onClick={() => onChange(value + 1)}>
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Folha de rolagem: bônus, dados extras e quem vê; depois mostra o resultado vindo do servidor. */
export function RollDialog({ spec, onClose }: { spec: RollSpec; onClose(): void }) {
  const { t } = useTranslation();
  const roll = useRollMutation();
  const [bonus, setBonus] = useState(0);
  const [dados, setDados] = useState(0);
  const [visibility, setVisibility] = useState<RollVisibility>('public');
  const [last, setLast] = useState<RollRow | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const go = async () => {
    const row = await roll
      .mutateAsync({ req: { ...spec.request, bonus, ...(spec.extraDice ? { dados } : {}), visibility }, ...(spec.local ? { local: spec.local } : {}) })
      .catch(() => null);
    if (row) setLast(row);
  };

  const visOptions: Array<{ v: RollVisibility; label: string }> = spec.isGm
    ? [
        { v: 'public', label: t('roller.public') },
        { v: 'gm', label: t('roller.secret') },
      ]
    : [
        { v: 'public', label: t('roller.public') },
        { v: 'self_gm', label: t('roller.toGm') },
      ];

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-surface p-0 text-ink backdrop:bg-black/50 sm:m-auto sm:max-w-md sm:rounded-3xl"
      aria-label={spec.title}
    >
      <div className="flex flex-col gap-4 p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{spec.title}</h2>
          <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-surface-2" aria-label={t('roller.close')} onClick={() => dialog.current?.close()}>
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {last && (
          <div role="status" aria-live="polite" className="rounded-2xl bg-surface-2/60 p-4">
            <RollResultView result={last.result} />
            {last.visibility !== 'public' && <p className="mt-1 text-xs text-accent">{last.visibility === 'gm' ? t('roller.secret') : t('roller.toGm')}</p>}
            {last.pending && <p className="mt-1 text-xs text-accent">{t('roller.offlinePending')}</p>}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Stepper label={t('roller.bonus')} value={bonus} onChange={setBonus} />
          {spec.extraDice && <Stepper label={t('roller.extraDice')} value={dados} onChange={setDados} />}
        </div>

        <div role="radiogroup" aria-label={t('roller.whoSees')} className="grid grid-cols-2 gap-2">
          {visOptions.map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={visibility === o.v}
              onClick={() => setVisibility(o.v)}
              className={cx('min-h-11 rounded-xl border text-sm', visibility === o.v ? 'border-accent bg-accent-soft font-medium' : 'border-line')}
            >
              {o.label}
            </button>
          ))}
        </div>

        {roll.error && <ErrorNote>{friendlyError(roll.error)}</ErrorNote>}

        <Button className="min-h-14 text-lg" busy={roll.isPending} onClick={go}>
          <Dices className="size-6" aria-hidden />
          {last ? t('roller.again') : t('roller.roll')}
        </Button>
      </div>
    </dialog>
  );
}
