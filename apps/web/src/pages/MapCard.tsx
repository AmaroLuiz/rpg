import { Map as MapIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMaps } from '../api/maps';

/** Atalho para o mapa "na mesa" na página da mesa, no estilo do cartão de combate. */
export function MapCard({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation();
  const maps = useMaps(campaignId);
  const active = maps.data?.find((m) => m.active);
  if (!active) return null;
  return (
    <Link
      to={`/mesas/${campaignId}/mapas/${active.id}`}
      className="flex min-h-16 items-center gap-3 rounded-2xl border border-accent bg-accent-soft/60 px-4 py-3"
    >
      <MapIcon className="size-6 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{active.name}</p>
        <p className="text-sm text-muted">
          {t('maps.active')} · {t('maps.size', { cols: active.cols, rows: active.rows })}
        </p>
      </div>
    </Link>
  );
}
