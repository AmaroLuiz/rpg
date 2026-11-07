import { Sheet } from '@rpg/engine';
import { Minus, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Combatant } from '../api/combat';
import { useCharacter, useCharacterData, useCharacterItems, useTemplateVersion } from '../api/characters';
import { cx } from '../components/ui';
import { resourceOps } from '../sheet/Resource';
import { outbox } from '../sync';

const STATUS_STYLE: Record<string, string> = {
  ileso: 'bg-ok/15 text-ok',
  ferido: 'bg-accent-soft text-accent',
  muito_ferido: 'bg-danger/15 text-danger',
  caido: 'bg-danger text-bg',
};

function Bar({ atual, max }: { atual: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (atual / max) * 100)) : 0;
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
      <div className={cx('h-full rounded-full', pct > 50 ? 'bg-ok' : pct > 0 ? 'bg-accent' : 'bg-danger')} style={{ width: `${pct}%` }} />
    </div>
  );
}

function PvControls({ label, atual, max, onDelta }: { label: string; atual: number; max: number; onDelta(n: number): void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="grid size-10 place-items-center rounded-lg bg-surface-2" aria-label={t('sheet.decrease', { label })} onClick={() => onDelta(-1)}>
        <Minus className="size-4" aria-hidden />
      </button>
      <Bar atual={atual} max={max} />
      <span className="w-16 text-right text-sm tabular-nums" aria-label={`${label}: ${atual} / ${max}`}>
        {atual}/{max}
      </span>
      <button type="button" className="grid size-10 place-items-center rounded-lg bg-surface-2" aria-label={t('sheet.increase', { label })} onClick={() => onDelta(1)}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** PV de personagem jogador: vem da ficha; mestre e dono mexem pela mesma fila da ficha. */
export function PcVitals({ c, canEdit }: { c: Combatant; canEdit: boolean }) {
  const { t } = useTranslation();
  const character = useCharacter(c.character_id!);
  const template = useTemplateVersion(character.data?.template_version_id);
  const items = useCharacterItems(c.character_id!);
  const data = useCharacterData(character.data);
  const sheet = useMemo(() => (template.data && data ? new Sheet(template.data, data, items.data ?? []) : null), [template.data, data, items.data]);
  if (!sheet || !data || !template.data) return null;
  const pvDef = template.data.template.fields.find((f) => f.type === 'resource');
  if (!pvDef) return null;
  const r = sheet.resource(pvDef.id);
  const label = `${pvDef.label} ${c.label}`;
  const conditions = data.conditions.map((id) => template.data!.conditions.get(id)?.label ?? id);
  return (
    <div className="flex flex-col gap-1">
      {canEdit ? (
        <PvControls label={label} atual={r.atual} max={r.max} onDelta={(n) => outbox.enqueue(c.character_id!, resourceOps(pvDef.id, data.values[pvDef.id], r.atual, n, null))} />
      ) : (
        <div className="flex items-center gap-2">
          <Bar atual={r.atual} max={r.max} />
          <span className="w-16 text-right text-sm tabular-nums">
            {r.atual}/{r.max}
          </span>
        </div>
      )}
      {conditions.length > 0 && (
        <p className="text-xs text-danger" aria-label={t('sheet.conditions')}>
          {conditions.join(' · ')}
        </p>
      )}
    </div>
  );
}

/** PV de inimigo: o mestre vê e mexe no número; jogadores só veem o estado. */
export function NpcVitals({ c, isGm, onDelta }: { c: Combatant; isGm: boolean; onDelta(resource: string, n: number): void }) {
  const { t } = useTranslation();
  const pv = c.secret?.resources?.pv;
  if (isGm && pv) {
    return <PvControls label={`PV ${c.label}`} atual={pv.atual} max={pv.max} onDelta={(n) => onDelta('pv', n)} />;
  }
  if (!c.public_status) return null;
  return <span className={cx('self-start rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLE[c.public_status])}>{t(`combat.status.${c.public_status}`)}</span>;
}
