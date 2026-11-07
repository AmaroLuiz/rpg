import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Button, Card, ErrorNote, Field, Input } from '../components/ui';
import { friendlyError } from '../lib/errors';
import { supabase } from '../lib/supabase';

export function Login() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (session) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin + next },
        });
        if (error) throw error;
        if (!data.session) setInfo(t('auth.checkEmail', { email }));
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + next },
    });
    if (error) setError(friendlyError(error));
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/icon.svg" alt="" className="size-14" />
        <h1 className="font-display text-3xl font-semibold">{t('app.name')}</h1>
        <p className="text-muted">{t('app.tagline')}</p>
      </div>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === 'signUp' && (
            <Field label={t('auth.name')}>
              {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="nickname" />}
            </Field>
          )}
          <Field label={t('auth.email')}>
            {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />}
          </Field>
          <Field label={t('auth.password')} hint={mode === 'signUp' ? t('auth.passwordHint') : undefined}>
            {(p) => (
              <Input
                {...p}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              />
            )}
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          {info && <p className="text-sm text-ok">{info}</p>}
          <Button type="submit" busy={busy}>
            {mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
          </Button>
          <div className="flex items-center gap-3 text-sm text-muted" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-line" />
          </div>
          <Button type="button" variant="secondary" onClick={google}>
            {t('auth.google')}
          </Button>
        </form>
      </Card>
      <button
        type="button"
        className="min-h-12 text-accent underline-offset-4 hover:underline"
        onClick={() => {
          setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          setError(null);
        }}
      >
        {mode === 'signIn' ? t('auth.noAccount') : t('auth.haveAccount')}
      </button>
    </div>
  );
}
