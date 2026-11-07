import { ChevronRight, Crown, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useCampaigns, useJoinCampaign } from '../api/campaigns';
import { useUserId } from '../auth/AuthProvider';
import { Button, Card, ErrorNote, Field, Input, Spinner } from '../components/ui';
import { friendlyError } from '../lib/errors';

export function Campaigns() {
  const { t } = useTranslation();
  const userId = useUserId();
  const campaigns = useCampaigns();
  const join = useJoinCampaign();
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  async function submitJoin(e: FormEvent) {
    e.preventDefault();
    const id = await join.mutateAsync(code).catch(() => null);
    if (id) navigate(`/mesas/${id}`);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">{t('campaigns.title')}</h1>
        <Link to="/mesas/nova" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-4 font-medium text-accent-ink">
          <Plus className="size-5" aria-hidden />
          {t('campaigns.create')}
        </Link>
      </div>

      {campaigns.isPending && <Spinner label={t('common.loading')} />}
      {campaigns.error && <ErrorNote>{friendlyError(campaigns.error)}</ErrorNote>}

      {campaigns.data?.length === 0 && (
        <Card className="text-center">
          <p className="font-medium">{t('campaigns.empty')}</p>
          <p className="mt-1 text-muted">{t('campaigns.emptyHint')}</p>
        </Card>
      )}

      {!!campaigns.data?.length && (
        <ul className="flex flex-col gap-2">
          {campaigns.data.map((c) => {
            const isGm = c.members.some((m) => m.user_id === userId && m.role === 'gm');
            return (
              <li key={c.id}>
                <Link
                  to={`/mesas/${c.id}`}
                  className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:border-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-sm text-muted">
                      {c.template?.name} · {t('campaigns.members', { count: c.members.length })}
                    </p>
                  </div>
                  {isGm && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                      <Crown className="size-3.5" aria-hidden />
                      {t('campaigns.gm')}
                    </span>
                  )}
                  <ChevronRight className="size-5 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <form onSubmit={submitJoin} className="flex flex-col gap-3">
          <Field label={t('campaigns.codeLabel')} error={join.error ? friendlyError(join.error) : null}>
            {(p) => (
              <Input
                {...p}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t('campaigns.codePlaceholder')}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-lg tracking-[0.2em]"
                maxLength={12}
                required
              />
            )}
          </Field>
          <Button type="submit" variant="secondary" busy={join.isPending}>
            {t('campaigns.join')}
          </Button>
        </form>
      </Card>
    </>
  );
}
