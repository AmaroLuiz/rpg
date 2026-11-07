import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useCreateCampaign, useTemplates } from '../api/campaigns';
import { Button, Card, ErrorNote, Field, Input, Select, Textarea } from '../components/ui';
import { friendlyError } from '../lib/errors';

export function NewCampaign() {
  const { t } = useTranslation();
  const templates = useTemplates();
  const create = useCreateCampaign();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!slug && templates.data?.[0]) setSlug(templates.data[0].slug);
  }, [templates.data, slug]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const c = await create.mutateAsync({ name: name.trim(), templateSlug: slug, description: description.trim() }).catch(() => null);
    if (c) navigate(`/mesas/${c.id}`, { replace: true });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Link to="/" className="text-accent">
          ← {t('common.back')}
        </Link>
      </div>
      <h1 className="font-display text-2xl font-semibold">{t('newCampaign.title')}</h1>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t('newCampaign.name')}>
            {(p) => (
              <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('newCampaign.namePlaceholder')} required maxLength={100} />
            )}
          </Field>
          <Field label={t('newCampaign.system')}>
            {(p) => (
              <Select {...p} value={slug} onChange={(e) => setSlug(e.target.value)} required>
                {templates.data?.map((tpl) => (
                  <option key={tpl.slug} value={tpl.slug}>
                    {tpl.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('newCampaign.description')}>
            {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />}
          </Field>
          {create.error && <ErrorNote>{friendlyError(create.error)}</ErrorNote>}
          <Button type="submit" busy={create.isPending} disabled={!slug}>
            {t('newCampaign.submit')}
          </Button>
        </form>
      </Card>
    </>
  );
}
