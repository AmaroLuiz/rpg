import { Dices, Eye, EyeOff, ListOrdered, Minus, Plus, SkipBack, SkipForward, Swords, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useCampaign } from '../api/campaigns';
import { useCharacters } from '../api/characters';
import { initialResources, rollInitiative, useCombatActions, useCurrentEncounter, useLibrary, type Combatant } from '../api/combat';
import { useCampaignRealtime } from '../api/realtime';
import { useUserId } from '../auth/AuthProvider';
import { NpcVitals, PcVitals } from '../combat/Vitals';
import { Button, Card, ErrorNote, Input, Spinner, cx } from '../components/ui';
import { friendlyError } from '../lib/errors';

function InitiativeInput({ c, onSave }: { c: Combatant; onSave(v: number | null): void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      inputMode="numeric"
      aria-label={t('combat.initiativeOf', { name: c.label })}
      value={draft ?? (c.initiative ?? '').toString()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return;
        const n = draft.trim() === '' ? null : Number(draft.replace(',', '.'));
        setDraft(null);
        if (n === null || Number.isFinite(n)) onSave(n);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="h-11 w-12 rounded-lg border border-line bg-surface text-center font-semibold tabular-nums"
    />
  );
}

export function Combat() {
  const { id: campaignId = '' } = useParams();
  const { t } = useTranslation();
  const userId = useUserId();
  useCampaignRealtime(campaignId, userId);
  const campaign = useCampaign(campaignId);
  const isGm = campaign.data?.members.some((m) => m.user_id === userId && m.role === 'gm') ?? false;
  const encounter = useCurrentEncounter(campaignId);
  const actions = useCombatActions(campaignId);
  const characters = useCharacters(campaignId);
  const library = useLibrary(campaignId, isGm);
  const [name, setName] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  if (encounter.isPending || campaign.isPending) return <Spinner label={t('common.loading')} />;
  if (encounter.error) return <ErrorNote>{friendlyError(encounter.error)}</ErrorNote>;
  const enc = encounter.data;
  const back = (
    <Link to={`/mesas/${campaignId}`} className="text-accent">
      ← {campaign.data?.name ?? t('common.back')}
    </Link>
  );

  if (!enc) {
    return (
      <>
        {back}
        <h1 className="font-display text-2xl font-semibold">{t('combat.title')}</h1>
        {isGm ? (
          <Card>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run('create', () => actions.create.mutateAsync(name.trim() || t('combat.defaultName')));
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('combat.namePlaceholder')} aria-label={t('combat.name')} maxLength={80} />
              <Button type="submit" busy={busy === 'create'}>
                <Swords className="size-5" aria-hidden />
                {t('combat.new')}
              </Button>
            </form>
          </Card>
        ) : (
          <p className="text-muted">{t('combat.none')}</p>
        )}
        {error != null && <ErrorNote>{friendlyError(error)}</ErrorNote>}
      </>
    );
  }

  const inCombat = new Set(enc.combatants.map((c) => c.character_id));
  const current = enc.status === 'active' ? enc.combatants.find((c) => c.id === enc.current_combatant_id) : undefined;
  const pcs = (characters.data ?? []).filter((c) => c.kind === 'pc');
  const missingInit = enc.combatants.filter((c) => c.initiative === null && c.character_id);

  return (
    <>
      {back}
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{enc.name}</h1>
          <p className="text-muted" role="status">
            {enc.status === 'active' ? t('combat.round', { n: enc.round }) : t('combat.prep')}
            {current && ` · ${t('combat.turnOf', { name: current.label })}`}
          </p>
        </div>
      </header>

      {error != null && <ErrorNote>{friendlyError(error)}</ErrorNote>}

      {isGm && (
        <div className="grid grid-cols-2 gap-2">
          {enc.status === 'active' ? (
            <>
              <Button variant="secondary" busy={busy === 'prev'} onClick={() => run('prev', () => actions.turn.mutateAsync({ encounterId: enc.id, step: -1 }))}>
                <SkipBack className="size-5" aria-hidden />
                {t('combat.prev')}
              </Button>
              <Button busy={busy === 'next'} onClick={() => run('next', () => actions.turn.mutateAsync({ encounterId: enc.id, step: 1 }))}>
                {t('combat.next')}
                <SkipForward className="size-5" aria-hidden />
              </Button>
            </>
          ) : (
            <Button className="col-span-2" disabled={!enc.combatants.length} busy={busy === 'start'} onClick={() => run('start', () => actions.turn.mutateAsync({ encounterId: enc.id, step: 1 }))}>
              <Swords className="size-5" aria-hidden />
              {t('combat.start')}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={!missingInit.length}
            busy={busy === 'init'}
            onClick={() =>
              run('init', async () => {
                for (const c of missingInit) await rollInitiative(campaignId, c);
                await actions.sort.mutateAsync(enc.id);
              })
            }
          >
            <Dices className="size-5" aria-hidden />
            {t('combat.rollInit')}
          </Button>
          <Button variant="secondary" busy={busy === 'sort'} onClick={() => run('sort', () => actions.sort.mutateAsync(enc.id))}>
            <ListOrdered className="size-5" aria-hidden />
            {t('combat.sort')}
          </Button>
        </div>
      )}

      <Card className="py-1">
        {enc.combatants.length === 0 && <p className="py-3 text-muted">{t('combat.empty')}</p>}
        <ol className="flex flex-col divide-y divide-line" aria-label={t('combat.order')}>
          {enc.combatants.map((c) => {
            const isCurrent = c.id === enc.current_combatant_id && enc.status === 'active';
            const isPc = c.character?.kind === 'pc';
            const mine = c.character?.owner_id === userId;
            return (
              <li key={c.id} aria-current={isCurrent ? 'true' : undefined} className={cx('-mx-4 flex flex-col gap-2 px-4 py-3', isCurrent && 'bg-accent-soft/60')}>
                <div className="flex items-center gap-3">
                  {isGm ? (
                    <InitiativeInput c={c} onSave={(v) => void run('ini', () => actions.setInitiative.mutateAsync({ id: c.id, value: v }))} />
                  ) : (
                    <span className="w-12 text-center font-semibold tabular-nums">{c.initiative ?? '—'}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cx('truncate', isCurrent && 'font-semibold')}>
                      {c.label}
                      {mine && isPc && <span className="text-muted"> ({t('campaign.you')})</span>}
                    </p>
                    {c.hidden && <p className="text-xs text-accent">{t('combat.hidden')}</p>}
                  </div>
                  {isGm && (
                    <>
                      <button
                        type="button"
                        className="grid size-10 place-items-center rounded-lg hover:bg-surface-2"
                        aria-label={c.hidden ? t('combat.show', { name: c.label }) : t('combat.hide', { name: c.label })}
                        onClick={() => run('hide', () => actions.setHidden.mutateAsync({ id: c.id, hidden: !c.hidden }))}
                      >
                        {c.hidden ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      </button>
                      <button
                        type="button"
                        className="grid size-10 place-items-center rounded-lg text-danger hover:bg-surface-2"
                        aria-label={t('combat.remove', { name: c.label })}
                        onClick={() => confirm(t('combat.removeConfirm', { name: c.label })) && run('rm', () => actions.remove.mutateAsync(c.id))}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </>
                  )}
                </div>
                <div className="pl-15">
                  {isPc ? (
                    <PcVitals c={c} canEdit={isGm || mine} />
                  ) : (
                    <NpcVitals c={c} isGm={isGm} onDelta={(resource, n) => actions.adjust.mutate({ id: c.id, resource, delta: n }, { onError: setError })} />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {isGm && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium">{t('combat.add')}</h2>
          {pcs.length > 0 && (
            <ul className="flex flex-col divide-y divide-line">
              {pcs.map((p) => (
                <li key={p.id} className="flex min-h-12 items-center justify-between gap-2">
                  <span className="truncate">{p.nome || p.name}</span>
                  <Button
                    variant="secondary"
                    className="text-sm"
                    disabled={inCombat.has(p.id)}
                    busy={busy === `pc-${p.id}`}
                    onClick={() => run(`pc-${p.id}`, () => actions.add.mutateAsync({ encounterId: enc.id, characterId: p.id, count: 1, resources: {} }))}
                  >
                    {inCombat.has(p.id) ? t('combat.inCombat') : t('combat.addOne')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <h3 className="text-sm text-muted">{t('library.title')}</h3>
          {library.data?.length === 0 && <p className="text-sm text-muted">{t('library.emptyForCombat')}</p>}
          <ul className="flex flex-col divide-y divide-line">
            {library.data?.map((m) => {
              const n = counts[m.id] ?? 1;
              return (
                <li key={m.id} className="flex min-h-12 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{m.nome || m.name}</span>
                  <button type="button" className="grid size-10 place-items-center rounded-lg bg-surface-2" aria-label={t('combat.fewer', { name: m.nome || m.name })} onClick={() => setCounts({ ...counts, [m.id]: Math.max(1, n - 1) })}>
                    <Minus className="size-4" aria-hidden />
                  </button>
                  <span className="w-6 text-center tabular-nums" aria-label={t('combat.howMany', { name: m.nome || m.name })}>
                    {n}
                  </span>
                  <button type="button" className="grid size-10 place-items-center rounded-lg bg-surface-2" aria-label={t('combat.more', { name: m.nome || m.name })} onClick={() => setCounts({ ...counts, [m.id]: Math.min(30, n + 1) })}>
                    <Plus className="size-4" aria-hidden />
                  </button>
                  <Button
                    variant="secondary"
                    className="text-sm"
                    busy={busy === `m-${m.id}`}
                    onClick={() =>
                      run(`m-${m.id}`, async () =>
                        actions.add.mutateAsync({ encounterId: enc.id, characterId: m.id, count: n, resources: await initialResources(m.id) }),
                      )
                    }
                  >
                    {t('combat.addOne')}
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button variant="danger" busy={busy === 'end'} onClick={() => confirm(t('combat.endConfirm')) && run('end', () => actions.end.mutateAsync(enc.id))}>
            {t('combat.end')}
          </Button>
        </Card>
      )}
    </>
  );
}
