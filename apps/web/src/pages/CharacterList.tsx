import { ChevronRight, EyeOff, FileUp, Plus } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { importCharacter } from '../api/exporting';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useCharacters, useCreateCharacter } from '../api/characters';
import { Button, Card, ErrorNote, Input } from '../components/ui';
import { friendlyError } from '../lib/errors';
import { PortraitImage } from '../sheet/Portrait';

export function CharacterList({ campaignId, userId, isGm }: { campaignId: string; userId: string; isGm: boolean }) {
  const { t } = useTranslation();
  const characters = useCharacters(campaignId);
  const create = useCreateCharacter(campaignId);
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [asNpc, setAsNpc] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const onImport = async (f: File) => {
    setImportError(null);
    setImporting(true);
    try {
      const id = await importCharacter(campaignId, f);
      void qc.invalidateQueries({ queryKey: ['characters', campaignId] });
      navigate(`/mesas/${campaignId}/personagens/${id}`);
    } catch (e) {
      setImportError(friendlyError(e));
    } finally {
      setImporting(false);
    }
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const row = await create
      .mutateAsync({ name: name.trim(), ...(asNpc ? { kind: 'npc' as const, visibility: 'gm' as const } : {}) })
      .catch(() => null);
    // Fichas novas abrem no assistente; dá para pular para a ficha a qualquer momento.
    if (row) navigate(`/mesas/${campaignId}/personagens/${row.id}/criar`);
  }

  const list = [...(characters.data ?? [])].sort((a, b) => Number(b.owner_id === userId) - Number(a.owner_id === userId));

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">{t('characters.title')}</h2>
        {!adding && (
          <Button variant="ghost" className="text-accent" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden />
            {t('characters.new')}
          </Button>
        )}
      </div>
      {adding && (
        <form onSubmit={submit} className="mb-3 flex flex-col gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('characters.namePlaceholder')} aria-label={t('characters.namePlaceholder')} required maxLength={100} autoFocus />
          {isGm && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={asNpc} onChange={(e) => setAsNpc(e.target.checked)} />
              {t('characters.asNpc')}
            </label>
          )}
          {create.error && <ErrorNote>{friendlyError(create.error)}</ErrorNote>}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" busy={create.isPending}>
              {t('characters.create')}
            </Button>
          </div>
        </form>
      )}
      {characters.data?.length === 0 && !adding && <p className="text-muted">{t('characters.empty')}</p>}
      {importError && <ErrorNote>{importError}</ErrorNote>}
      <ul className="flex flex-col divide-y divide-line">
        {list.map((c) => (
          <li key={c.id}>
            <Link
              to={`/mesas/${campaignId}/personagens/${c.id}${c.status === 'draft' && (c.owner_id === userId || isGm) ? '/criar' : ''}`}
              className="flex min-h-14 items-center gap-3 py-2"
            >
              <PortraitImage path={c.portrait_path} name={c.nome || c.name} className="size-11 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.nome || c.name || '—'}</p>
                <p className="flex items-center gap-1 truncate text-sm text-muted">
                  {c.status === 'draft' && <span className="rounded bg-accent-soft px-1.5 text-xs text-accent">{t('creation.draft')}</span>}
                  {c.kind !== 'pc' && <span>{c.kind === 'npc' ? t('characters.npc') : t('characters.monster')} ·</span>}
                  {c.visibility === 'gm' && (
                    <>
                      <EyeOff className="size-3.5" aria-hidden />
                      <span>{t('characters.hidden')} ·</span>
                    </>
                  )}
                  {c.owner_id === userId ? t('campaign.you') : t('characters.by', { name: c.owner?.display_name ?? '' })}
                </p>
              </div>
              <ChevronRight className="size-5 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label={t('exporting.importCharacter')}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImport(f);
          e.target.value = '';
        }}
      />
      <Button variant="ghost" className="mt-1 w-full text-sm text-muted" busy={importing} onClick={() => file.current?.click()}>
        <FileUp className="size-4" aria-hidden />
        {t('exporting.importCharacter')}
      </Button>
    </Card>
  );
}
