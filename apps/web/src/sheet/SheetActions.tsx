import { levelUp, nextProgression, rest, type ChangeSummary } from '@rpg/engine';
import { BedDouble, TrendingUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ErrorNote } from '../components/ui';
import { useSheetCtx } from './context';
import { formatValue } from './format';

interface Pending {
  title: string;
  description?: string;
  summary: ChangeSummary;
}

/** Evolução e descansos do template, sempre mostrando o que muda antes de aplicar. */
export function SheetActions() {
  const { t } = useTranslation();
  const { compiled, sheet, canEdit, change } = useSheetCtx();
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const prog = compiled.template.progression;
  const rests = compiled.template.rests;

  useEffect(() => {
    if (pending) dialog.current?.showModal();
  }, [pending]);

  if (!canEdit || (!prog && !rests.length)) return null;
  const next = prog ? nextProgression(sheet) : null;

  const prepare = (title: string, fn: () => ChangeSummary, description?: string) => {
    setError(null);
    try {
      setPending({ title, summary: fn(), ...(description ? { description } : {}) });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {prog && (
          <Button variant="secondary" className="min-h-11 text-sm" disabled={next === null} onClick={() => prepare(prog.label, () => levelUp(sheet))}>
            <TrendingUp className="size-4" aria-hidden />
            {next === null ? t('actions.maxed') : `${prog.label} (${formatValue(next)})`}
          </Button>
        )}
        {rests.map((r) => (
          <Button key={r.id} variant="secondary" className="min-h-11 text-sm" onClick={() => prepare(r.label, () => rest(sheet, r.id), r.description)}>
            <BedDouble className="size-4" aria-hidden />
            {r.label}
          </Button>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {pending && (
        <dialog
          ref={dialog}
          onClose={() => setPending(null)}
          className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-surface p-0 text-ink backdrop:bg-black/50 sm:m-auto sm:max-w-md sm:rounded-3xl"
          aria-label={pending.title}
        >
          <div className="flex flex-col gap-4 p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
            <h2 className="font-display text-xl font-semibold">{pending.title}</h2>
            {pending.description && <p className="text-sm text-muted">{pending.description}</p>}
            {pending.summary.changes.length === 0 ? (
              <p>{t('actions.nothing')}</p>
            ) : (
              <ul className="flex flex-col gap-1" aria-label={t('actions.changes')}>
                {pending.summary.changes.map(([label, before, after]) => (
                  <li key={label} className="flex justify-between gap-2">
                    <span>{label}</span>
                    <span className="tabular-nums">
                      {formatValue(before)} → <strong>{formatValue(after)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => dialog.current?.close()}>
                {t('common.cancel')}
              </Button>
              <Button
                disabled={!pending.summary.ops.length}
                onClick={() => {
                  change(pending.summary.ops);
                  dialog.current?.close();
                }}
              >
                {t('actions.confirm')}
              </Button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
