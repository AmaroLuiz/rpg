import { UserRound } from 'lucide-react';
import { Suspense } from 'react';
import { Spinner } from './ui';
import { useUserId } from '../auth/AuthProvider';
import { RollerProvider } from '../roller/RollerProvider';
import { RollToasts } from '../roller/RollToasts';
import { Link, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';

export function Layout() {
  const { t } = useTranslation();
  const userId = useUserId();
  return (
    <RollerProvider>
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <header className="flex items-center justify-between py-4">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
          <img src="/icon.svg" alt="" className="size-8" />
          {t('app.name')}
        </Link>
        <Link to="/perfil" aria-label={t('profile.title')} className="grid size-12 place-items-center rounded-xl hover:bg-surface-2">
          <UserRound className="size-6" aria-hidden />
        </Link>
      </header>
      <main className="flex flex-1 flex-col gap-4">
        <Suspense fallback={<Spinner label={t('common.loading')} />}>
          <Outlet />
        </Suspense>
      </main>
      <RollToasts userId={userId} />
    </div>
    </RollerProvider>
  );
}
