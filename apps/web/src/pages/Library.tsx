import { ChevronRight, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useCreateCharacter } from '../api/characters';
import { useLibrary } from '../api/combat';
import { Button, Card, ErrorNote, Input } from '../components/ui';
import { friendlyError } from '../lib/errors';
import { PortraitImage } from '../sheet/Portrait';

/** Biblioteca do mestre: NPCs e monstros reutilizáveis, invisíveis aos jogadores. */
export function LibraryCard({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation();
  const library = useLibrary(campaignId, true);
  const create = useCreateCharacter(campaignId);
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'monster' | 'npc'>('monster');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const row = await create.mutateAsync({ name: name.trim(), kind, visibility: 'gm', library: true }).catch(() => null);
    if (row) navigate(`/mesas/${campaignId}/personagens/${row.id}`);
  }

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">{t('library.title')}</h2>
        {!adding && (
          <Button variant="ghost" className="text-accent" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            {t('library.new')}
          </Button>
        )}
      </div>
      <p className="mb-2 text-sm text-muted">{t('library.hint')}</p>
      {adding && (
        <form onSubmit={submit} className="mb-3 flex flex-col gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('library.namePlaceholder')} aria-label={t('library.namePlaceholder')} required maxLength={100} autoFocus />
          <div role="radiogroup" aria-label={t('library.kind')} className="grid grid-cols-2 gap-2">
            {(['monster', 'npc'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={kind === k ? 'min-h-11 rounded-xl border border-accent bg-accent-soft text-sm font-medium' : 'min-h-11 rounded-xl border border-line text-sm'}
              >
                {k === 'monster' ? t('characters.monster') : t('characters.npc')}
              </button>
            ))}
          </div>
          {create.error && <ErrorNote>{friendlyError(create.error)}</ErrorNote>}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" busy={create.isPending}>
              {t('library.create')}
            </Button>
          </div>
        </form>
      )}
      {library.data?.length === 0 && !adding && <p className="text-muted">{t('library.empty')}</p>}
      <ul className="flex flex-col divide-y divide-line">
        {library.data?.map((m) => (
          <li key={m.id}>
            <Link to={`/mesas/${campaignId}/personagens/${m.id}`} className="flex min-h-14 items-center gap-3 py-2">
              <PortraitImage path={m.portrait_path} name={m.nome || m.name} className="size-11 rounded-xl" />
              <span className="min-w-0 flex-1 truncate">{m.nome || m.name}</span>
              <span className="text-sm text-muted">{m.kind === 'monster' ? t('characters.monster') : t('characters.npc')}</span>
              <ChevronRight className="size-5 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
