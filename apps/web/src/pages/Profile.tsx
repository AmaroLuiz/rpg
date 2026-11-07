import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useProfile, useUpdateProfile } from '../api/campaigns';
import { useUserId } from '../auth/AuthProvider';
import { Button, Card, ErrorNote, Field, Input, cx } from '../components/ui';
import { friendlyError } from '../lib/errors';
import { loadPrefs, savePrefs, type Prefs } from '../lib/prefs';
import { supabase } from '../lib/supabase';
import { forgetEverything, outbox } from '../sync';

function Choice<T extends string | number>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-muted">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <label
            key={String(o.value)}
            className={cx(
              'flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-center',
              value === o.value ? 'border-accent bg-accent-soft text-ink' : 'border-line',
            )}
          >
            <input type="radio" className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Profile() {
  const { t } = useTranslation();
  const userId = useUserId();
  const profile = useProfile(userId);
  const update = useUpdateProfile(userId);
  const [name, setName] = useState('');
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

  useEffect(() => {
    if (profile.data) setName(profile.data.display_name);
  }, [profile.data]);

  const changePrefs = (p: Prefs) => {
    setPrefs(p);
    savePrefs(p);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    await update.mutateAsync(name.trim()).catch(() => {});
  }

  return (
    <>
      <Link to="/" className="text-accent">
        ← {t('common.back')}
      </Link>
      <h1 className="font-display text-2xl font-semibold">{t('profile.title')}</h1>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label={t('profile.displayName')}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />}
          </Field>
          {update.error && <ErrorNote>{friendlyError(update.error)}</ErrorNote>}
          <Button type="submit" busy={update.isPending}>
            {update.isSuccess ? t('profile.saved') : t('common.save')}
          </Button>
        </form>
      </Card>
      <Card className="flex flex-col gap-5">
        <Choice
          legend={t('profile.theme')}
          value={prefs.theme}
          onChange={(theme) => changePrefs({ ...prefs, theme })}
          options={[
            { value: 'dark', label: t('profile.themeDark') },
            { value: 'light', label: t('profile.themeLight') },
            { value: 'system', label: t('profile.themeSystem') },
          ]}
        />
        <Choice
          legend={t('profile.fontSize')}
          value={prefs.fontScale}
          onChange={(fontScale) => changePrefs({ ...prefs, fontScale })}
          options={[
            { value: 1 as const, label: t('profile.fontNormal') },
            { value: 1.125 as const, label: t('profile.fontLarge') },
            { value: 1.25 as const, label: t('profile.fontLarger') },
          ]}
        />
      </Card>
      <Button
        variant="danger"
        className="mt-auto"
        onClick={async () => {
          await outbox.sealAll();
          const pending = outbox.status().pending;
          if (pending > 0 && !confirm(t('profile.pendingSignOut', { count: pending }))) return;
          await supabase.auth.signOut();
          await forgetEverything();
        }}
      >
        {t('auth.signOut')}
      </Button>
    </>
  );
}
