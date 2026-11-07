import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useCampaign } from '../api/campaigns';
import { useCampaignTemplate, useCharacters } from '../api/characters';
import { useDeleteItem, useItemActions, useItems, useLootPools, usePoolActions, type ItemRow, type LootPool } from '../api/items';
import { useCampaignRealtime } from '../api/realtime';
import { useUserId } from '../auth/AuthProvider';
import { Button, Card, ErrorNote, Input, Select, Spinner, cx } from '../components/ui';
import { ItemEditor } from '../items/ItemEditor';
import { ItemList } from '../items/ItemList';
import { friendlyError } from '../lib/errors';

/** Escolha de destino ("Dar a…"/"Pegar para…") com o botão de confirmar. */
function TargetPicker({ label, options, onPick, busy }: { label: string; options: Array<{ id: string; name: string }>; onPick(id: string): void; busy?: boolean }) {
  const [sel, setSel] = useState(options[0]?.id ?? '');
  if (!options.length) return null;
  return (
    <div className="flex items-center gap-2">
      <Select aria-label={label} value={sel} onChange={(e) => setSel(e.target.value)} className="min-h-10 text-sm">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
      <Button variant="secondary" className="min-h-10 shrink-0 text-sm" busy={busy} onClick={() => sel && onPick(sel)}>
        {label}
      </Button>
    </div>
  );
}

function Pool({ pool, campaignId, isGm, userId }: { pool: LootPool; campaignId: string; isGm: boolean; userId: string }) {
  const { t } = useTranslation();
  const tpl = useCampaignTemplate(campaignId);
  const items = useItems(campaignId, 'loot', pool.id);
  const characters = useCharacters(campaignId);
  const actions = usePoolActions(campaignId);
  const { take } = useItemActions();
  const del = useDeleteItem();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const pcs = (characters.data ?? []).filter((c) => c.kind === 'pc').map((c) => ({ id: c.id, name: c.nome || c.name, owner: c.owner_id }));
  const mine = pcs.filter((c) => c.owner === userId);
  if (!tpl.data) return null;
  const canTake = !isGm && pool.mode === 'free_pick' && mine.length > 0;

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{pool.name}</h3>
        {isGm ? (
          <Button
            variant={pool.revealed ? 'secondary' : 'primary'}
            className="min-h-10 text-sm"
            onClick={() => actions.update.mutate({ id: pool.id, revealed: !pool.revealed })}
          >
            {pool.revealed ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            {pool.revealed ? t('loot.hide') : t('loot.reveal')}
          </Button>
        ) : (
          <span className="text-xs text-muted">{pool.mode === 'free_pick' ? t('loot.freePick') : t('loot.distribute')}</span>
        )}
      </div>
      {isGm && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">{t('loot.mode')}</span>
          <Select aria-label={t('loot.mode')} value={pool.mode} onChange={(e) => actions.update.mutate({ id: pool.id, mode: e.target.value as LootPool['mode'] })} className="min-h-10 text-sm">
            <option value="distribute">{t('loot.distribute')}</option>
            <option value="free_pick">{t('loot.freePick')}</option>
          </Select>
          <span className={cx('ml-auto text-xs', pool.revealed ? 'text-ok' : 'text-muted')}>{pool.revealed ? t('loot.visible') : t('loot.hidden')}</span>
        </div>
      )}
      {take.error && <ErrorNote>{friendlyError(take.error)}</ErrorNote>}
      <ItemList
        label={pool.name}
        items={items.data ?? []}
        compiled={tpl.data}
        emptyText={t('loot.empty')}
        actions={(it) => (
          <>
            {isGm && (
              <>
                <TargetPicker label={t('loot.give')} options={pcs} busy={take.isPending} onPick={(ch) => take.mutate({ id: it.id, characterId: ch })} />
                <Button variant="secondary" className="min-h-10 text-sm" onClick={() => setEditing(it.id)}>
                  {t('notes.edit')}
                </Button>
                <Button variant="danger" className="min-h-10 text-sm" onClick={() => del.mutate(it.id)}>
                  {t('notes.delete')}
                </Button>
              </>
            )}
            {canTake && <TargetPicker label={t('loot.take')} options={mine} busy={take.isPending} onPick={(ch) => take.mutate({ id: it.id, characterId: ch })} />}
          </>
        )}
        editing={(it) => (editing === it.id ? <ItemEditor campaignId={campaignId} compiled={tpl.data!} item={it} isGm onDone={() => setEditing(null)} /> : null)}
      />
      {isGm && editing === 'new' && <ItemEditor campaignId={campaignId} compiled={tpl.data} holder={{ type: 'loot', id: pool.id }} isGm onDone={() => setEditing(null)} />}
      {isGm && editing !== 'new' && (
        <div className="flex gap-2">
          <Button variant="ghost" className="text-sm text-accent" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            {t('items.add')}
          </Button>
          <Button variant="ghost" className="ml-auto text-sm text-danger" onClick={() => confirm(t('loot.deleteConfirm', { name: pool.name })) && actions.remove.mutate(pool.id)}>
            <Trash2 className="size-4" aria-hidden />
            {t('loot.delete')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function Library({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation();
  const tpl = useCampaignTemplate(campaignId);
  const items = useItems(campaignId, 'library');
  const pools = useLootPools(campaignId);
  const characters = useCharacters(campaignId);
  const { copy } = useItemActions();
  const del = useDeleteItem();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  if (!tpl.data) return <Spinner label={t('common.loading')} />;
  const pcs = (characters.data ?? []).filter((c) => c.kind === 'pc').map((c) => ({ id: c.id, name: c.nome || c.name }));
  const chests = (pools.data ?? []).map((p) => ({ id: p.id, name: p.name }));
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-medium">{t('items.library')}</h2>
      <p className="text-sm text-muted">{t('items.libraryHint')}</p>
      {copy.error && <ErrorNote>{friendlyError(copy.error)}</ErrorNote>}
      <ItemList
        label={t('items.library')}
        items={items.data ?? []}
        compiled={tpl.data}
        emptyText={t('items.libraryEmpty')}
        actions={(it: ItemRow) => (
          <>
            <TargetPicker label={t('items.giveTo')} options={pcs} busy={copy.isPending} onPick={(id) => copy.mutate({ id: it.id, to: 'character', holderId: id })} />
            <TargetPicker label={t('items.putIn')} options={chests} busy={copy.isPending} onPick={(id) => copy.mutate({ id: it.id, to: 'loot', holderId: id })} />
            <Button variant="secondary" className="min-h-10 text-sm" onClick={() => setEditing(it.id)}>
              {t('notes.edit')}
            </Button>
            <Button variant="danger" className="min-h-10 text-sm" onClick={() => confirm(t('items.deleteConfirm', { name: it.name })) && del.mutate(it.id)}>
              {t('notes.delete')}
            </Button>
          </>
        )}
        editing={(it) => (editing === it.id ? <ItemEditor campaignId={campaignId} compiled={tpl.data!} item={it} isGm onDone={() => setEditing(null)} /> : null)}
      />
      {editing === 'new' ? (
        <ItemEditor campaignId={campaignId} compiled={tpl.data} holder={{ type: 'library' }} isGm onDone={() => setEditing(null)} />
      ) : (
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden />
          {t('items.newLibrary')}
        </Button>
      )}
    </Card>
  );
}

export function Items() {
  const { id: campaignId = '' } = useParams();
  const { t } = useTranslation();
  const userId = useUserId();
  useCampaignRealtime(campaignId, userId);
  const campaign = useCampaign(campaignId);
  const pools = useLootPools(campaignId);
  const actions = usePoolActions(campaignId);
  const [name, setName] = useState('');
  const isGm = campaign.data?.members.some((m) => m.user_id === userId && m.role === 'gm') ?? false;

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) actions.create.mutate({ name: name.trim(), mode: 'distribute' }, { onSuccess: () => setName('') });
  };

  return (
    <>
      <Link to={`/mesas/${campaignId}`} className="text-accent">
        ← {campaign.data?.name ?? t('common.back')}
      </Link>
      <h1 className="font-display text-2xl font-semibold">{t('items.title')}</h1>
      <h2 className="font-display text-lg font-semibold">{t('loot.title')}</h2>
      {pools.data?.length === 0 && <p className="text-muted">{isGm ? t('loot.noneGm') : t('loot.none')}</p>}
      {pools.data?.map((p) => <Pool key={p.id} pool={p} campaignId={campaignId} isGm={isGm} userId={userId} />)}
      {isGm && (
        <form onSubmit={create} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('loot.namePlaceholder')} aria-label={t('loot.name')} maxLength={80} />
          <Button type="submit" variant="secondary" className="shrink-0" busy={actions.create.isPending}>
            {t('loot.new')}
          </Button>
        </form>
      )}
      {isGm && <Library campaignId={campaignId} />}
    </>
  );
}
