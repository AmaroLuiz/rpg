import { ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useCampaign } from '../api/campaigns';
import { useHandoutActions, useHandoutImage, useHandouts, type Handout } from '../api/handouts';
import { useCampaignRealtime } from '../api/realtime';
import { useUserId } from '../auth/AuthProvider';
import { Button, Card, ErrorNote, Field, Input, Spinner, Textarea } from '../components/ui';
import { friendlyError } from '../lib/errors';
import { Toggle } from '../sheet/fields';

function HandoutImage({ path, alt }: { path: string | null; alt: string }) {
  const url = useHandoutImage(path);
  if (!path) return null;
  return url.data ? <img src={url.data} alt={alt} className="w-full rounded-xl border border-line object-contain" /> : <div className="h-40 animate-pulse rounded-xl bg-surface-2" />;
}

function Editor({ campaignId, handout, onDone }: { campaignId: string; handout?: Handout; onDone(): void }) {
  const { t } = useTranslation();
  const { save } = useHandoutActions(campaignId);
  const [title, setTitle] = useState(handout?.title ?? '');
  const [body, setBody] = useState(handout?.body ?? '');
  const [image, setImage] = useState<File | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await save.mutateAsync({ id: handout?.id, title: title.trim(), body, image }).then(onDone, () => {});
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label={t('handouts.titleField')}>{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />}</Field>
      <Field label={t('handouts.body')}>{(p) => <Textarea {...p} value={body} onChange={(e) => setBody(e.target.value)} rows={5} />}</Field>
      <input ref={file} type="file" accept="image/*" className="sr-only" aria-label={t('handouts.image')} onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
      <Button type="button" variant="secondary" onClick={() => file.current?.click()}>
        <ImagePlus className="size-4" aria-hidden />
        {image ? image.name : handout?.image_path ? t('handouts.changeImage') : t('handouts.image')}
      </Button>
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

export function Handouts() {
  const { id: campaignId = '' } = useParams();
  const { t } = useTranslation();
  const userId = useUserId();
  useCampaignRealtime(campaignId, userId);
  const campaign = useCampaign(campaignId);
  const handouts = useHandouts(campaignId);
  const actions = useHandoutActions(campaignId);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const isGm = campaign.data?.members.some((m) => m.user_id === userId && m.role === 'gm') ?? false;
  const players = (campaign.data?.members ?? []).filter((m) => m.role === 'player');

  return (
    <>
      <Link to={`/mesas/${campaignId}`} className="text-accent">
        ← {campaign.data?.name ?? t('common.back')}
      </Link>
      <h1 className="font-display text-2xl font-semibold">{t('handouts.title')}</h1>
      {isGm && (editing === 'new' ? (
        <Card>
          <Editor campaignId={campaignId} onDone={() => setEditing(null)} />
        </Card>
      ) : (
        <Button onClick={() => setEditing('new')}>{t('handouts.new')}</Button>
      ))}
      {handouts.isPending && <Spinner label={t('common.loading')} />}
      {handouts.data?.length === 0 && <p className="text-muted">{isGm ? t('handouts.emptyGm') : t('handouts.empty')}</p>}
      {handouts.data?.map((h) => {
        const shownTo = h.revealed_to_all ? t('handouts.toAll') : h.recipients.length ? t('handouts.toSome', { count: h.recipients.length }) : t('handouts.notRevealed');
        return (
          <Card key={h.id} className="flex flex-col gap-3">
            {editing === h.id ? (
              <Editor campaignId={campaignId} handout={h} onDone={() => setEditing(null)} />
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-xl font-semibold">{h.title}</h2>
                    {isGm && <p className="text-xs text-muted">{shownTo}</p>}
                  </div>
                  {isGm && (
                    <div className="flex">
                      <button type="button" className="grid size-10 place-items-center rounded-lg hover:bg-surface-2" aria-label={t('notes.edit')} onClick={() => setEditing(h.id)}>
                        <Pencil className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="grid size-10 place-items-center rounded-lg text-danger hover:bg-surface-2"
                        aria-label={t('notes.delete')}
                        onClick={() => confirm(t('handouts.deleteConfirm')) && actions.remove.mutate(h.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  )}
                </div>
                <HandoutImage path={h.image_path} alt={h.title} />
                {h.body && <p className="whitespace-pre-line">{h.body}</p>}
                {isGm && (
                  <fieldset className="flex flex-col gap-1 rounded-xl bg-surface-2/50 p-3">
                    <legend className="sr-only">{t('handouts.revealTo')}</legend>
                    <label className="flex min-h-11 items-center justify-between gap-2 font-medium">
                      {t('handouts.revealAll')}
                      <Toggle label={t('handouts.revealAllOf', { title: h.title })} checked={h.revealed_to_all} disabled={false} onChange={(on) => actions.revealAll.mutate({ id: h.id, on })} />
                    </label>
                    {!h.revealed_to_all &&
                      players.map((p) => {
                        const on = h.recipients.some((r) => r.user_id === p.user_id);
                        return (
                          <label key={p.user_id} className="flex min-h-11 items-center justify-between gap-2 text-sm">
                            {p.profile?.display_name}
                            <Toggle
                              label={t('handouts.revealToOne', { title: h.title, name: p.profile?.display_name ?? '' })}
                              checked={on}
                              disabled={false}
                              onChange={(v) => actions.setRecipient.mutate({ id: h.id, userId: p.user_id, on: v })}
                            />
                          </label>
                        );
                      })}
                  </fieldset>
                )}
              </>
            )}
          </Card>
        );
      })}
    </>
  );
}
