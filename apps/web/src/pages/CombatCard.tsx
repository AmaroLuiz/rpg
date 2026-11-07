import { Swords } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCurrentEncounter } from '../api/combat';

/** Atalho para o combate na página da mesa, com rodada e de quem é a vez. */
export function CombatCard({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation();
  const enc = useCurrentEncounter(campaignId);
  const e = enc.data;
  const current = e?.status === 'active' ? e.combatants.find((c) => c.id === e.current_combatant_id) : undefined;
  return (
    <Link
      to={`/mesas/${campaignId}/combate`}
      className={
        e?.status === 'active'
          ? 'flex min-h-16 items-center gap-3 rounded-2xl border border-accent bg-accent-soft/60 px-4 py-3'
          : 'flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3'
      }
    >
      <Swords className="size-6 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{e ? e.name : t('combat.title')}</p>
        <p className="truncate text-sm text-muted">
          {!e ? t('combat.noneShort') : e.status === 'active' ? `${t('combat.round', { n: e.round })}${current ? ` · ${t('combat.turnOf', { name: current.label })}` : ''}` : t('combat.prep')}
        </p>
      </div>
    </Link>
  );
}
