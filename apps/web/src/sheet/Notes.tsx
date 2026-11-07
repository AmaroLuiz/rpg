import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeleteNote, useNotes, useSaveNote, type Note, type NoteVisibility } from '../api/notes';
import { useUserId } from '../auth/AuthProvider';
import { Button, ErrorNote, Field, Input, Select, Textarea } from '../components/ui';
import { friendlyError } from '../lib/errors';

function Editor({ note, campaignId, onDone }: { note?: Note; campaignId: string; onDone(): void }) {
  const { t } = useTranslation();
  const userId = useUserId();
  const save = useSaveNote(campaignId, userId);
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [visibility, setVisibility] = useState<NoteVisibility>(note?.visibility ?? 'private');
  return (
    <form
      className="flex flex-col gap-3 rounded-xl bg-surface-2/50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await save.mutateAsync({ id: note?.id, title: title.trim(), body, visibility }).then(onDone, () => {});
      }}
    >
      <Field label={t('notes.titleField')}>{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />}</Field>
      <Field label={t('notes.body')}>{(p) => <Textarea {...p} value={body} onChange={(e) => setBody(e.target.value)} rows={5} />}</Field>
      <Field label={t('notes.visibility')}>
        {(p) => (
          <Select {...p} value={visibility} onChange={(e) => setVisibility(e.target.value as NoteVisibility)}>
            <option value="private">{t('notes.private')}</option>
            <option value="gm">{t('notes.gm')}</option>
            <option value="public">{t('notes.public')}</option>
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

/** Notas da mesa: as minhas (privadas ou não) e as públicas dos outros. */
export function NotesField({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation();
  const userId = useUserId();
  const notes = useNotes(campaignId);
  const del = useDeleteNote(campaignId);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const visLabel: Record<NoteVisibility, string> = { private: t('notes.private'), gm: t('notes.gm'), public: t('notes.public') };

  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{t('notes.title')}</span>
        {editing !== 'new' && (
          <Button variant="ghost" className="text-sm text-accent" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            {t('notes.new')}
          </Button>
        )}
      </div>
      {editing === 'new' && <Editor campaignId={campaignId} onDone={() => setEditing(null)} />}
      {notes.data?.length === 0 && editing !== 'new' && <p className="text-sm text-muted">{t('notes.empty')}</p>}
      <ul className="flex flex-col gap-2">
        {notes.data?.map((n) =>
          editing === n.id ? (
            <li key={n.id}>
              <Editor note={n} campaignId={campaignId} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={n.id} className="rounded-xl border border-line p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.title || '—'}</p>
                  <p className="text-xs text-muted">
                    {n.author_id === userId ? visLabel[n.visibility] : `${n.author?.display_name ?? ''} · ${visLabel[n.visibility]}`}
                  </p>
                </div>
                {n.author_id === userId && (
                  <>
                    <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-surface-2" aria-label={t('notes.edit')} onClick={() => setEditing(n.id)}>
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="grid size-10 place-items-center rounded-lg text-danger hover:bg-surface-2"
                      aria-label={t('notes.delete')}
                      onClick={() => confirm(t('notes.deleteConfirm')) && del.mutate(n.id)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </>
                )}
              </div>
              {n.body && <p className="mt-2 whitespace-pre-line text-sm">{n.body}</p>}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
