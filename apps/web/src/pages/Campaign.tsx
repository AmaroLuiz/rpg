import { Check, Copy, Crown, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useCampaign, useDeleteCampaign, useRegenerateInvite, useRemoveMember } from '../api/campaigns';
import { useCampaignRealtime } from '../api/realtime';
import { useUserId } from '../auth/AuthProvider';
import { Button, Card, ErrorNote, Spinner, cx } from '../components/ui';
import { friendlyError } from '../lib/errors';

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };
  return { copied, copy };
}

export function Campaign() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const userId = useUserId();
  const navigate = useNavigate();
  const campaign = useCampaign(id);
  const online = useCampaignRealtime(id, userId);
  const regenerate = useRegenerateInvite(id);
  const remove = useRemoveMember(id);
  const del = useDeleteCampaign();
  const { copied, copy } = useCopy();

  if (campaign.isPending) return <Spinner label={t('common.loading')} />;
  if (campaign.error || !campaign.data)
    return (
      <>
        <ErrorNote>{campaign.error ? friendlyError(campaign.error) : t('errors.notFound')}</ErrorNote>
        <Link to="/" className="text-accent">
          ← {t('common.back')}
        </Link>
      </>
    );

  const c = campaign.data;
  const isGm = c.members.some((m) => m.user_id === userId && m.role === 'gm');
  const link = `${window.location.origin}/convite/${c.invite_code}`;
  const members = [...c.members].sort((a, b) => (a.role === b.role ? a.joined_at.localeCompare(b.joined_at) : a.role === 'gm' ? -1 : 1));
  const actionError = remove.error ?? del.error ?? regenerate.error;

  return (
    <>
      <Link to="/" className="text-accent">
        ← {t('common.back')}
      </Link>
      <div>
        <h1 className="font-display text-2xl font-semibold">{c.name}</h1>
        <p className="text-muted">
          {t('campaign.system')}: {c.template?.name}
        </p>
        {c.description && <p className="mt-2 whitespace-pre-line">{c.description}</p>}
      </div>

      {actionError && <ErrorNote>{friendlyError(actionError)}</ErrorNote>}

      <Card>
        <h2 className="mb-3 font-medium">{t('campaign.members')}</h2>
        <ul className="flex flex-col divide-y divide-line">
          {members.map((m) => {
            const isOnline = online.has(m.user_id);
            const name = m.profile?.display_name ?? '—';
            return (
              <li key={m.user_id} className="flex min-h-14 items-center gap-3 py-2">
                <span
                  className={cx('size-2.5 shrink-0 rounded-full', isOnline ? 'bg-ok' : 'bg-line')}
                  role="img"
                  aria-label={isOnline ? t('campaign.online') : undefined}
                  title={isOnline ? t('campaign.online') : undefined}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {name}
                    {m.user_id === userId && <span className="text-muted"> ({t('campaign.you')})</span>}
                  </p>
                  <p className="flex items-center gap-1 text-sm text-muted">
                    {m.role === 'gm' && <Crown className="size-3.5 text-accent" aria-hidden />}
                    {m.role === 'gm' ? t('campaigns.gm') : t('campaigns.player')}
                  </p>
                </div>
                {isGm && m.role !== 'gm' && (
                  <Button
                    variant="ghost"
                    className="text-sm text-danger"
                    busy={remove.isPending && remove.variables === m.user_id}
                    onClick={() => confirm(t('campaign.removeConfirm', { name })) && remove.mutate(m.user_id)}
                  >
                    {t('campaign.remove')}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {isGm && (
        <Card>
          <h2 className="font-medium">{t('campaign.invite')}</h2>
          <p className="mb-3 text-sm text-muted">{t('campaign.inviteHint')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-xl bg-surface-2 px-4 py-3 text-center font-mono text-2xl tracking-[0.3em]" aria-label={t('campaigns.codeLabel')}>
              {c.invite_code}
            </code>
            <Button variant="secondary" aria-label={t('common.copy')} onClick={() => copy('code', c.invite_code)}>
              {copied === 'code' ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => copy('link', link)}>
              {copied === 'link' ? t('common.copied') : t('campaign.copyLink')}
            </Button>
            <Button
              variant="ghost"
              busy={regenerate.isPending}
              onClick={() => confirm(t('campaign.newCodeConfirm')) && regenerate.mutate()}
            >
              <RefreshCw className="size-4" aria-hidden />
              {t('campaign.newCode')}
            </Button>
          </div>
        </Card>
      )}

      <p className="text-center text-sm text-muted">{t('campaign.comingSoon')}</p>

      <div className="mt-auto pt-4">
        {isGm ? (
          <Button
            variant="danger"
            className="w-full"
            busy={del.isPending}
            onClick={async () => {
              if (!confirm(t('campaign.deleteConfirm', { name: c.name }))) return;
              await del.mutateAsync(c.id).then(() => navigate('/', { replace: true })).catch(() => {});
            }}
          >
            {t('campaign.delete')}
          </Button>
        ) : (
          <Button
            variant="danger"
            className="w-full"
            busy={remove.isPending}
            onClick={async () => {
              if (!confirm(t('campaign.leaveConfirm'))) return;
              await remove.mutateAsync(userId).then(() => navigate('/', { replace: true })).catch(() => {});
            }}
          >
            {t('campaign.leave')}
          </Button>
        )}
      </div>
    </>
  );
}
