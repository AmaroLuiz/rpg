import { AlertTriangle, ChevronDown, Download, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Button, Card, ErrorNote, Spinner, cx } from '../components/ui';
import { exportCharacter } from '../api/exporting';
import { friendlyError } from '../lib/errors';
import { SheetContext } from '../sheet/context';
import { useSheetSetup } from '../sheet/useSheetSetup';
import { FieldView } from '../sheet/FieldView';
import { Macros } from '../sheet/Macros';
import { SheetActions } from '../sheet/SheetActions';
import { PortraitImage } from '../sheet/Portrait';
import { ResourceField } from '../sheet/Resource';
import { SyncBadge } from '../sheet/SyncBadge';

function Section({ label, collapsible, children }: { label: string; collapsible?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="py-2 sm:py-3">
      {collapsible ? (
        <button type="button" className="flex min-h-11 w-full items-center justify-between font-display text-lg font-semibold" aria-expanded={open} onClick={() => setOpen(!open)}>
          {label}
          <ChevronDown className={cx('size-5 text-muted transition', open && 'rotate-180')} aria-hidden />
        </button>
      ) : (
        <h2 className="flex min-h-11 items-center font-display text-lg font-semibold">{label}</h2>
      )}
      {open && <div className="flex flex-col divide-y divide-line">{children}</div>}
    </Card>
  );
}

export function CharacterSheet() {
  const { id: campaignId = '', charId = '' } = useParams();
  const { t } = useTranslation();
  const { ctx, row, loading, error, campaign } = useSheetSetup(campaignId, charId);
  const [tab, setTab] = useState(0);
  const [showWarnings, setShowWarnings] = useState(false);
  const warnings = useMemo(() => ctx?.sheet.warnings() ?? [], [ctx?.sheet]);

  if (loading) return <Spinner label={t('common.loading')} />;
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

  const { compiled, sheet, data } = ctx;
  const template = { data: compiled };
  const tabs = template.data.template.layout.tabs;
  const current = tabs[Math.min(tab, tabs.length - 1)]!;
  const name = (typeof data.values.nome === 'string' && data.values.nome) || row.name || '—';
  const resources = template.data.template.fields.filter((f) => f.type === 'resource');
  const resourceIds = new Set(resources.map((f) => f.id));
  const summary = template.data.template.fields
    .filter((f) => f.type === 'select' && f.catalog)
    .map((f) => sheet.evaluate(`@${f.id} == null ? "" : @${f.id}.label`).value)
    .filter(Boolean)
    .join(' · ');

  return (
    <SheetContext.Provider value={ctx}>
      <div className="flex items-center justify-between gap-2">
        <Link to={`/mesas/${campaignId}`} className="text-accent">
          ← {campaign?.name ?? t('common.back')}
        </Link>
        <SyncBadge />
      </div>

      <header className="flex items-center gap-3">
        <PortraitImage path={row.portrait_path} name={name} className="size-16" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold">{name}</h1>
          <p className="text-sm text-muted">
            {[summary, template.data.template.name].filter(Boolean).join(' · ')}
            {!ctx.canEdit && <span> · {t('sheet.readOnly')}</span>}
          </p>
          {row.status === 'draft' && ctx.canEdit && (
            <Link to={`/mesas/${campaignId}/personagens/${charId}/criar`} className="text-sm text-accent underline">
              {t('creation.continue')}
            </Link>
          )}
        </div>
      </header>

      {resources.length > 0 && (
        <Card className="py-1 sm:py-2">
          {resources.map((f) => (
            <ResourceField key={f.id} fieldId={f.id} compact />
          ))}
        </Card>
      )}

      {ctx.canEdit && (
        <Card className="flex flex-col gap-3">
          <Macros />
          {/* Usados de vez em quando: ficam recolhidos para a ficha chegar logo às abas. */}
          <details className="group rounded-xl border border-line">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium">
              {t('actions.more')}
              <ChevronDown className="size-4 text-muted transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="flex flex-col gap-3 px-3 pb-3">
              <SheetActions />
              <Button variant="ghost" className="self-start text-sm text-muted" onClick={() => void exportCharacter(charId).catch((e) => alert(friendlyError(e)))}>
                <Download className="size-4" aria-hidden />
                {t('exporting.character')}
              </Button>
            </div>
          </details>
        </Card>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-accent/40 bg-accent-soft/40">
          <button type="button" className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm" aria-expanded={showWarnings} onClick={() => setShowWarnings(!showWarnings)}>
            <AlertTriangle className="size-4 text-accent" aria-hidden />
            <span className="flex-1">{t('sheet.warnings', { count: warnings.length })}</span>
            <ChevronDown className={cx('size-4 text-muted transition', showWarnings && 'rotate-180')} aria-hidden />
          </button>
          {showWarnings && (
            <ul className="flex flex-col gap-1.5 px-3 pb-3 text-sm">
              {warnings.map((w) => (
                <li key={w.id} className="flex gap-2">
                  {w.level === 'info' ? <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />}
                  {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <nav className="sticky top-0 z-10 -mx-4 bg-bg/95 px-4 py-2 backdrop-blur" aria-label={t('characters.title')}>
        <div role="tablist" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((tb, i) => (
            <button
              key={tb.id}
              role="tab"
              type="button"
              aria-selected={tb === current}
              onClick={() => setTab(i)}
              className={cx('min-h-11 shrink-0 rounded-xl px-4 font-medium', tb === current ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-surface-2')}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </nav>

      <div role="tabpanel" aria-label={current.label} className="flex flex-col gap-3">
        {current.sections.map((s) => {
          // Recursos já ficam fixos no topo da ficha; não repetir dentro das abas.
          const shown = s.items.filter((itemId) => !resourceIds.has(itemId));
          if (!shown.length) return null;
          return (
            <Section key={s.id} label={s.label} collapsible={s.collapsible}>
              {shown.map((itemId) => (
                <FieldView key={itemId} id={itemId} />
              ))}
            </Section>
          );
        })}
      </div>
    </SheetContext.Provider>
  );
}
