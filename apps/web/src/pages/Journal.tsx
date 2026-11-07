import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useCampaign } from '../api/campaigns';
import { useDeleteNote, useNotes, useSaveNote, type Note, type NoteKind, type NoteVisibility } from '../api/notes';
import { useCampaignRealtime } from '../api/realtime';
import { useUserId } from '../auth/AuthProvider';
import { Button, Card, ErrorNote, Field, Input, Select, Spinner, Textarea, cx } from '../components/ui';
import { friendlyError } from '../lib/errors';

const NOTE_KINDS: NoteKind[] = ['note', 'npc', 'location', 'faction'];

function NoteForm({ campaignId, note, mode, isGm, onDone }: { campaignId: string; note?: Note; mode: 'session' | 'notes'; isGm: boolean; onDone(): void }) {
  const { t } = useTranslation();
  const userId = useUserId();
  const save = useSaveNote(campaignId, userId);
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? (mode === 'session' ? 'session' : 'note'));
  const [tags, setTags] = useState((note?.tags ?? []).join(', '));
  const [date, setDate] = useState(note?.session_date ?? new Date().toISOString().slice(0, 10));
  const [visibility, setVisibility] = useState<NoteVisibility>(note?.visibility ?? (mode === 'session' ? 'public' : 'private'));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await save
      .mutateAsync({
        id: note?.id,
        title: title.trim(),
        body,
        visibility,
        kind,
        tags: tags.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
        ...(mode === 'session' ? { session_date: date || null } : {}),
      })
      .then(onDone, () => {});
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label={t('notes.titleField')}>{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />}</Field>
      {mode === 'session' ? (
        <Field label={t('journal.date')}>{(p) => <Input {...p} type="date" value={date ?? ''} onChange={(e) => setDate(e.target.value)} />}</Field>
      ) : (
        <Field label={t('journal.kind')}>
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
              {NOTE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`journal.kinds.${k}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field label={t('notes.body')}>{(p) => <Textarea {...p} value={body} onChange={(e) => setBody(e.target.value)} rows={6} />}</Field>
      <Field label={t('journal.tags')} hint={t('journal.tagsHint')}>{(p) => <Input {...p} value={tags} onChange={(e) => setTags(e.target.value)} />}</Field>
      <Field label={t('notes.visibility')}>
        {(p) => (
          <Select {...p} value={visibility} onChange={(e) => setVisibility(e.target.value as NoteVisibility)}>
            <option value="public">{t('notes.public')}</option>
            <option value="gm">{isGm ? t('journal.onlyMe') : t('notes.gm')}</option>
            {!isGm && <option value="private">{t('notes.private')}</option>}
            {isGm && mode === 'notes' && <option value="private">{t('notes.private')}</option>}
          </Select>
        )}
      </Field>
      {save.error && <ErrorNote>{friendlyError(save.error)}</ErrorNote>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" busy={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

/** Diário de sessões (mode="session") ou notas da campanha com busca e etiquetas (mode="notes"). */
export function Journal({ mode }: { mode: 'session' | 'notes' }) {
  const { id: campaignId = '' } = useParams();
  const { t } = useTranslation();
  const userId = useUserId();
  useCampaignRealtime(campaignId, userId);
  const campaign = useCampaign(campaignId);
  const isGm = campaign.data?.members.some((m) => m.user_id === userId && m.role === 'gm') ?? false;
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const deferred = useDeferredValue(search);
  const notes = useNotes(campaignId, { kinds: mode === 'session' ? ['session'] : NOTE_KINDS, search: deferred, tag });
  const del = useDeleteNote(campaignId);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const canWrite = mode === 'notes' || isGm;
  const allTags = [...new Set((notes.data ?? []).flatMap((n) => n.tags))].sort();
  const visLabel: Record<NoteVisibility, string> = { private: t('notes.private'), gm: t('notes.gm'), public: t('notes.public') };

  return (
    <>
      <Link to={`/mesas/${campaignId}`} className="text-accent">
        ← {campaign.data?.name ?? t('common.back')}
      </Link>
      <h1 className="font-display text-2xl font-semibold">{mode === 'session' ? t('journal.diary') : t('journal.notes')}</h1>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('journal.search')} aria-label={t('journal.search')} className="pl-10" />
      </label>
      {(allTags.length > 0 || tag) && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('journal.tags')}>
          {[...new Set([...(tag ? [tag] : []), ...allTags])].map((tg) => (
            <button
              key={tg}
              type="button"
              aria-pressed={tag === tg}
              onClick={() => setTag(tag === tg ? null : tg)}
              className={cx('min-h-9 rounded-full border px-3 text-sm', tag === tg ? 'border-accent bg-accent-soft' : 'border-line')}
            >
              #{tg}
            </button>
          ))}
        </div>
      )}
      {canWrite &&
        (editing === 'new' ? (
          <Card>
            <NoteForm campaignId={campaignId} mode={mode} isGm={isGm} onDone={() => setEditing(null)} />
          </Card>
        ) : (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            {mode === 'session' ? t('journal.newSession') : t('journal.newNote')}
          </Button>
        ))}
      {notes.isPending && <Spinner label={t('common.loading')} />}
      {notes.error && <ErrorNote>{friendlyError(notes.error)}</ErrorNote>}
      {notes.data?.length === 0 && <p className="text-muted">{deferred || tag ? t('journal.noResults') : mode === 'session' ? t('journal.emptyDiary') : t('notes.empty')}</p>}
      <ul className="flex flex-col gap-3" aria-label={mode === 'session' ? t('journal.diary') : t('journal.notes')}>
        {notes.data?.map((n) => (
          <li key={n.id}>
            <Card>
              {editing === n.id ? (
                <NoteForm campaignId={campaignId} note={n} mode={mode} isGm={isGm} onDone={() => setEditing(null)} />
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-lg font-semibold">{n.title || '—'}</h2>
                      <p className="text-xs text-muted">
                        {[
                          n.session_date && new Date(`${n.session_date}T12:00:00`).toLocaleDateString('pt-BR'),
                          mode === 'notes' && t(`journal.kinds.${n.kind}`),
                          n.author_id !== userId && n.author?.display_name,
                          visLabel[n.visibility],
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    {n.author_id === userId && (
                      <>
                        <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-surface-2" aria-label={t('notes.edit')} onClick={() => setEditing(n.id)}>
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button type="button" className="grid size-10 place-items-center rounded-lg text-danger hover:bg-surface-2" aria-label={t('notes.delete')} onClick={() => confirm(t('notes.deleteConfirm')) && del.mutate(n.id)}>
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </>
                    )}
                  </div>
                  {n.body && <p className="mt-2 whitespace-pre-line">{n.body}</p>}
                  {n.tags.length > 0 && <p className="mt-2 text-sm text-accent">{n.tags.map((tg) => `#${tg}`).join(' ')}</p>}
                </>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
