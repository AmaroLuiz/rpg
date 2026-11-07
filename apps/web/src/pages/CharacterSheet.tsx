import { Sheet, type CharacterOp } from '@rpg/engine';
import { AlertTriangle, ChevronDown, Info } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useCampaign } from '../api/campaigns';
import { useCharacter, useCharacterData, useCharacterItems, useTemplateVersion } from '../api/characters';
import { useCampaignRealtime } from '../api/realtime';
import { useUserId } from '../auth/AuthProvider';
import { Card, ErrorNote, Spinner, cx } from '../components/ui';
import { friendlyError } from '../lib/errors';
import { SheetContext, type SheetCtx } from '../sheet/context';
import { FieldView } from '../sheet/FieldView';
import { ResourceField } from '../sheet/Resource';
import { SyncBadge } from '../sheet/SyncBadge';
import { outbox } from '../sync';

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
  const userId = useUserId();
  useCampaignRealtime(campaignId, userId);
  const campaign = useCampaign(campaignId);
  const character = useCharacter(charId);
  const template = useTemplateVersion(character.data?.template_version_id);
  const items = useCharacterItems(charId);
  const data = useCharacterData(character.data);
  const [tab, setTab] = useState(0);
  const [showWarnings, setShowWarnings] = useState(false);

  const change = useCallback((ops: CharacterOp[]) => outbox.enqueue(charId, ops), [charId]);
  const sheet = useMemo(
    () => (template.data && data ? new Sheet(template.data, data, items.data ?? []) : null),
    [template.data, data, items.data],
  );
  const warnings = useMemo(() => sheet?.warnings() ?? [], [sheet]);

  if (character.isPending || template.isPending || (character.data && !sheet && !template.error)) return <Spinner label={t('common.loading')} />;
  const error = character.error ?? template.error;
  if (error || !character.data || !sheet || !template.data || !data) {
    return (
      <>
        <ErrorNote>{error ? friendlyError(error) : t('errors.notFound')}</ErrorNote>
        <Link to={`/mesas/${campaignId}`} className="text-accent">
          ← {t('common.back')}
        </Link>
      </>
    );
  }

  const row = character.data;
  const isGm = campaign.data?.members.some((m) => m.user_id === userId && m.role === 'gm') ?? false;
  const ctx: SheetCtx = {
    compiled: template.data,
    sheet,
    data,
    canEdit: row.owner_id === userId || isGm,
    change,
    characterId: charId,
    campaignId,
  };
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
          ← {campaign.data?.name ?? t('common.back')}
        </Link>
        <SyncBadge />
      </div>

      <header>
        <h1 className="font-display text-2xl font-semibold">{name}</h1>
        <p className="text-sm text-muted">
          {[summary, template.data.template.name].filter(Boolean).join(' · ')}
          {!ctx.canEdit && <span> · {t('sheet.readOnly')}</span>}
        </p>
      </header>

      {resources.length > 0 && (
        <Card className="py-1 sm:py-2">
          {resources.map((f) => (
            <ResourceField key={f.id} fieldId={f.id} compact />
          ))}
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
          const shown = s.items.filter((itemId) => !resourceIds.has(itemId) && !itemId.startsWith('$rolls'));
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
