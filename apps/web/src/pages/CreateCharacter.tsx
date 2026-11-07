import { AlertTriangle, Info } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useUpdateCharacterMeta } from '../api/characters';
import { Button, Card, ErrorNote, Spinner, cx } from '../components/ui';
import { friendlyError } from '../lib/errors';
import { AttributeAllocator } from '../sheet/AttributeAllocator';
import { SheetContext } from '../sheet/context';
import { FieldView } from '../sheet/FieldView';
import { formatValue } from '../sheet/format';
import { PortraitImage, PortraitPicker } from '../sheet/Portrait';
import { SyncBadge } from '../sheet/SyncBadge';
import { useSheetSetup } from '../sheet/useSheetSetup';

/** Assistente de criação: passos definidos pelo template + revisão. Tudo é salvo a cada mudança (rascunho). */
export function CreateCharacter() {
  const { id: campaignId = '', charId = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ctx, row, loading, error, syncing } = useSheetSetup(campaignId, charId);
  const meta = useUpdateCharacterMeta(charId);
  const [stepIdx, setStepIdx] = useState<number | null>(null);

  const steps = useMemo(() => ctx?.compiled.template.wizard?.steps ?? [], [ctx?.compiled]);
  const total = steps.length + 1; // + revisão

  // Retoma no passo em que a pessoa parou (esperando o servidor, não a cópia antiga do aparelho).
  useEffect(() => {
    if (stepIdx !== null || !ctx || syncing) return;
    const saved = ctx.data.creation?.step;
    const i = saved === '$revisao' ? steps.length : steps.findIndex((s) => s.id === saved);
    setStepIdx(i >= 0 ? i : 0);
  }, [ctx, steps, stepIdx, syncing]);

  if (loading || (ctx && stepIdx === null)) return <Spinner label={t('common.loading')} />;
  if (error || !ctx || !row) {
    return (
      <>
        <ErrorNote>{error ? friendlyError(error) : t('errors.notFound')}</ErrorNote>
        <Link to={`/mesas/${campaignId}`} className="text-accent">
          ← {t('common.back')}
        </Link>
      </>
    );
  }

  const { compiled, sheet, data, change, canEdit } = ctx;
  const idx = Math.min(stepIdx ?? 0, steps.length);
  const step = steps[idx];
  const attrFields = new Set(compiled.template.creation?.attributes?.fields ?? []);
  const sheetUrl = `/mesas/${campaignId}/personagens/${charId}`;

  const go = (i: number) => {
    setStepIdx(i);
    const id = i >= steps.length ? '$revisao' : steps[i]!.id;
    if (canEdit) change([{ op: 'set', path: ['creation', 'step'], value: id }]);
    window.scrollTo({ top: 0 });
  };

  const finish = async () => {
    await meta.mutateAsync({ status: 'active' }).catch(() => {});
    navigate(sheetUrl, { replace: true });
  };

  // Itens do passo: atributos viram o distribuidor (uma vez); imagem vira o retrato.
  const renderItems = (items: string[]) => {
    let allocatorShown = false;
    return items.map((id) => {
      if (attrFields.has(id)) {
        if (allocatorShown) return null;
        allocatorShown = true;
        return <AttributeAllocator key="$attrs" />;
      }
      if (compiled.fields.get(id)?.type === 'image') return <PortraitPicker key={id} campaignId={campaignId} characterId={charId} canEdit={canEdit} />;
      return <FieldView key={id} id={id} />;
    });
  };

  const warnings = sheet.warnings();
  const name = (typeof data.values.nome === 'string' && data.values.nome) || row.name;

  return (
    <SheetContext.Provider value={ctx}>
      <div className="flex items-center justify-between gap-2">
        <Link to={`/mesas/${campaignId}`} className="text-accent">
          ← {t('common.back')}
        </Link>
        <SyncBadge />
      </div>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          {t('creation.title', { name })} · {t('creation.stepOf', { n: idx + 1, total })}
        </p>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cx('h-1.5 flex-1 rounded-full', i <= idx ? 'bg-accent' : 'bg-line')} />
          ))}
        </div>
        <h1 className="font-display text-2xl font-semibold">{step ? step.label : t('creation.review')}</h1>
        {step?.description && <p className="text-muted">{step.description}</p>}
      </header>

      {step ? (
        <Card className="py-2">
          <div className="flex flex-col divide-y divide-line">{renderItems(step.items)}</div>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-1">
            <div className="mb-2 flex items-center gap-3">
              <PortraitImage path={row.portrait_path} name={name} className="size-16" />
              <p className="font-display text-xl font-semibold">{name}</p>
            </div>
            {compiled.template.fields
              .filter((f) => f.type === 'resource')
              .map((f) => {
                const r = sheet.resource(f.id);
                return (
                  <p key={f.id} className="flex justify-between">
                    <span>{f.label}</span>
                    <strong className="tabular-nums">{r.error ? '—' : formatValue(r.max)}</strong>
                  </p>
                );
              })}
            {[...attrFields].map((f) => (
              <p key={f} className="flex justify-between">
                <span>{compiled.fields.get(f)?.label}</span>
                <strong className="tabular-nums">{formatValue(sheet.field(f).value)}</strong>
              </p>
            ))}
          </Card>
          {warnings.length > 0 ? (
            <Card>
              <h2 className="mb-2 font-medium">{t('creation.checkThis')}</h2>
              <ul className="flex flex-col gap-1.5 text-sm">
                {warnings.map((w) => (
                  <li key={w.id} className="flex gap-2">
                    {w.level === 'info' ? <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />}
                    {w.message}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">{t('creation.warningsHint')}</p>
            </Card>
          ) : (
            <p className="text-center text-ok">{t('creation.allGood')}</p>
          )}
        </>
      )}

      {meta.error && <ErrorNote>{friendlyError(meta.error)}</ErrorNote>}

      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 bg-bg/95 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 backdrop-blur">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={idx === 0} onClick={() => go(idx - 1)}>
            {t('creation.prev')}
          </Button>
          {step ? (
            <Button onClick={() => go(idx + 1)}>{t('creation.next')}</Button>
          ) : (
            <Button busy={meta.isPending} disabled={!canEdit} onClick={finish}>
              {t('creation.finish')}
            </Button>
          )}
        </div>
        {step && canEdit && (
          <button type="button" className="min-h-11 text-sm text-accent underline-offset-4 hover:underline" onClick={finish}>
            {t('creation.freeMode')}
          </button>
        )}
      </div>
    </SheetContext.Provider>
  );
}
