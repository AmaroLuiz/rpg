import { Grid3x3, ImagePlus, Map as MapIcon, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useCampaign } from '../api/campaigns';
import { useMapActions, useMaps, type MapSummary } from '../api/maps';
import { useCampaignRealtime } from '../api/realtime';
import { useUserId } from '../auth/AuthProvider';
import { Button, Card, ErrorNote, Field, Input, Spinner, cx } from '../components/ui';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/useOnline';
import { useMapImage } from '../map/imageCache';
import { Toggle } from '../sheet/fields';

function Thumb({ map }: { map: MapSummary }) {
  const img = useMapImage(map.image_path);
  return (
    <div className="grid aspect-[4/3] w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-2 text-muted">
      {img.url ? <img src={img.url} alt="" className="size-full object-cover" /> : map.image_path ? <MapIcon className="size-6 animate-pulse" aria-hidden /> : <Grid3x3 className="size-6" aria-hidden />}
    </div>
  );
}

function CreateMap({ campaignId, onCancel }: { campaignId: string; onCancel(): void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { create } = useMapActions(campaignId);
  const [name, setName] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const row = await create.mutateAsync({ name: name.trim(), image }).catch(() => null);
    // Mapa novo abre direto no ajuste do grid.
    if (row) navigate(`/mesas/${campaignId}/mapas/${row.id}?ajustar=1`);
  };
  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label={t('maps.name')}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('maps.namePlaceholder')} required maxLength={100} />}
        </Field>
        <Field label={t('maps.image')} hint={t('maps.imageHint')}>
          {(p) => (
            <>
              <input ref={file} type="file" accept="image/*" className="sr-only" aria-label={t('maps.image')} onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
              <Button {...p} type="button" variant="secondary" onClick={() => file.current?.click()}>
                <ImagePlus className="size-4" aria-hidden />
                <span className="truncate">{image ? image.name : t('maps.chooseImage')}</span>
              </Button>
            </>
          )}
        </Field>
        {create.error && <ErrorNote>{friendlyError(create.error)}</ErrorNote>}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" busy={create.isPending}>
            {t('maps.create')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function Maps() {
  const { id: campaignId = '' } = useParams();
  const { t } = useTranslation();
  const userId = useUserId();
  useCampaignRealtime(campaignId, userId);
  const online = useOnline();
  const campaign = useCampaign(campaignId);
  const maps = useMaps(campaignId);
  const actions = useMapActions(campaignId);
  const [creating, setCreating] = useState(false);
  const isGm = campaign.data?.members.some((m) => m.user_id === userId && m.role === 'gm') ?? false;
  const error = actions.setActive.error ?? actions.setRevealed.error ?? actions.remove.error;

  return (
    <>
      <Link to={`/mesas/${campaignId}`} className="text-accent">
        ← {campaign.data?.name ?? t('common.back')}
      </Link>
      <h1 className="font-display text-2xl font-semibold">{t('maps.title')}</h1>
      {!online && <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-muted">{t('maps.readOnly')}</p>}
      {isGm && online && (creating ? <CreateMap campaignId={campaignId} onCancel={() => setCreating(false)} /> : <Button onClick={() => setCreating(true)}>{t('maps.new')}</Button>)}
      {error && <ErrorNote>{friendlyError(error)}</ErrorNote>}
      {maps.isPending && <Spinner label={t('common.loading')} />}
      {maps.error && <ErrorNote>{friendlyError(maps.error)}</ErrorNote>}
      {maps.data?.length === 0 && <p className="text-muted">{isGm ? t('maps.emptyGm') : t('maps.empty')}</p>}
      <ul className="flex flex-col gap-3">
        {maps.data?.map((m) => (
          <li key={m.id}>
            <Card className={cx('flex flex-col gap-3', m.active && 'border-accent')}>
              <Link to={`/mesas/${campaignId}/mapas/${m.id}`} className="flex items-center gap-3" aria-label={t('maps.open', { name: m.name })}>
                <Thumb map={m} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-semibold">{m.name}</p>
                  <p className="text-sm text-muted">{t('maps.size', { cols: m.cols, rows: m.rows })}</p>
                  {(m.active || isGm) && (
                    <span
                      className={cx(
                        'mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium',
                        m.active ? 'bg-accent text-accent-ink' : m.revealed ? 'bg-ok/15 text-ok' : 'bg-surface-2 text-muted',
                      )}
                    >
                      {m.active ? t('maps.active') : m.revealed ? t('maps.revealed') : t('maps.prep')}
                    </span>
                  )}
                </div>
              </Link>
              {isGm && (
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Button
                    variant={m.active ? 'secondary' : 'primary'}
                    className="flex-1"
                    disabled={!online}
                    busy={actions.setActive.isPending && actions.setActive.variables === (m.active ? null : m.id)}
                    onClick={() => actions.setActive.mutate(m.active ? null : m.id)}
                  >
                    {m.active ? t('maps.takeOffTable') : t('maps.putOnTable')}
                  </Button>
                  <label className="flex min-h-12 items-center gap-2 text-sm">
                    <span className="sr-only sm:not-sr-only">{t('maps.revealed')}</span>
                    <Toggle label={t('maps.revealOf', { name: m.name })} checked={m.revealed} disabled={!online} onChange={(on) => actions.setRevealed.mutate({ id: m.id, on })} />
                  </label>
                  <button
                    type="button"
                    className="grid size-12 place-items-center rounded-xl text-danger hover:bg-surface-2 disabled:opacity-50"
                    aria-label={t('maps.delete')}
                    disabled={!online}
                    onClick={() => confirm(t('maps.deleteConfirm', { name: m.name })) && actions.remove.mutate(m)}
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
