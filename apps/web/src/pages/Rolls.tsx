import { Dices } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useCampaign } from '../api/campaigns';
import { useCampaignRealtime } from '../api/realtime';
import { useUserId } from '../auth/AuthProvider';
import { Button, Card, Field, Input } from '../components/ui';
import { RollHistory } from '../roller/RollHistory';
import { useRoller } from '../roller/RollerProvider';

const SHORTCUTS = [4, 6, 8, 10, 12, 20, 100];

export function Rolls() {
  const { id: campaignId = '' } = useParams();
  const { t } = useTranslation();
  const userId = useUserId();
  useCampaignRealtime(campaignId, userId);
  const campaign = useCampaign(campaignId);
  const open = useRoller();
  const [expr, setExpr] = useState('');
  const [label, setLabel] = useState('');
  const isGm = campaign.data?.members.some((m) => m.user_id === userId && m.role === 'gm') ?? false;

  const roll = (expression: string, title?: string) =>
    open({
      title: title || expression,
      isGm,
      request: { campaign_id: campaignId, expression, ...(title ? { label: title } : {}) },
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (expr.trim()) roll(expr.trim(), label.trim() || undefined);
  };

  return (
    <>
      <Link to={`/mesas/${campaignId}`} className="text-accent">
        ← {campaign.data?.name ?? t('common.back')}
      </Link>
      <h1 className="font-display text-2xl font-semibold">{t('roller.title')}</h1>
      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">{t('roller.free')}</h2>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {SHORTCUTS.map((s) => (
            <button key={s} type="button" onClick={() => roll(`1d${s}`)} className="min-h-12 rounded-xl border border-line bg-surface-2/60 font-semibold hover:border-accent">
              d{s}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label={t('roller.expression')} hint={t('roller.expressionHint')}>
            {(p) => <Input {...p} value={expr} onChange={(e) => setExpr(e.target.value)} className="font-mono" autoCapitalize="off" autoComplete="off" spellCheck={false} />}
          </Field>
          <Field label={t('roller.label')}>{(p) => <Input {...p} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />}</Field>
          <Button type="submit" disabled={!expr.trim()}>
            <Dices className="size-5" aria-hidden />
            {t('roller.roll')}
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="mb-1 font-medium">{t('roller.history')}</h2>
        <RollHistory campaignId={campaignId} />
      </Card>
    </>
  );
}
