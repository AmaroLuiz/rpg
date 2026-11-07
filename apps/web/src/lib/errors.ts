import i18n from '../i18n';

/** Converte erros do Supabase (auth, PostgREST, funções do banco) em texto para a pessoa. */
export function friendlyError(e: unknown): string {
  const err = e as { message?: string; code?: string; status?: number; name?: string } | null;
  const msg = err?.message ?? '';
  const t = (k: string) => i18n.t(k);
  if (/Invalid login credentials/i.test(msg)) return t('errors.invalidLogin');
  if (/already registered|already been registered|user_already_exists/i.test(msg)) return t('errors.userExists');
  if (/Password should be at least|weak_password/i.test(msg)) return t('errors.weakPassword');
  if (/Email not confirmed/i.test(msg)) return t('errors.emailNotConfirmed');
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) return t('errors.network');
  if (err?.code === 'PGRST116') return t('errors.notFound');
  // Funções do banco já levantam mensagens em português (PT404, 42501, 22023…).
  if (msg) return msg;
  return t('common.error');
}
