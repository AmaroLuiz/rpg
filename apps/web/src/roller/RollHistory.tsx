import { EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRolls } from '../api/rolls';
import { Spinner } from '../components/ui';
import { RollResultView } from './RollResultView';

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Histórico da mesa, ao vivo. Secretas e "só para o mestre" só chegam a quem pode ver (RLS). */
export function RollHistory({ campaignId, limit = 50 }: { campaignId: string; limit?: number }) {
  const { t } = useTranslation();
  const rolls = useRolls(campaignId, limit);
  if (rolls.isPending) return <Spinner label={t('common.loading')} />;
  if (!rolls.data?.length) return <p className="text-muted">{t('roller.empty')}</p>;
  return (
    <ol className="flex flex-col divide-y divide-line" aria-label={t('roller.history')}>
      {rolls.data.map((r) => (
        <li key={r.id} className="flex flex-col gap-1 py-3">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              <strong className="font-medium">{r.author?.display_name ?? t('roller.someone')}</strong> · {r.label}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
              {r.visibility !== 'public' && (
                <span className="inline-flex items-center gap-1 text-accent">
                  <EyeOff className="size-3.5" aria-hidden />
                  {r.visibility === 'gm' ? t('roller.secret') : t('roller.toGm')}
                </span>
              )}
              <time dateTime={r.created_at}>{time(r.created_at)}</time>
            </span>
          </div>
          <RollResultView result={r.result} size="sm" />
        </li>
      ))}
    </ol>
  );
}
