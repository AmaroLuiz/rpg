import { Check, CloudOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../components/ui';
import { outbox, useOutboxStatus } from '../sync';

export function SyncBadge() {
  const { t } = useTranslation();
  const s = useOutboxStatus();
  const state = s.offline ? 'offline' : s.pending > 0 ? 'saving' : 'saved';
  return (
    <div className="flex flex-col items-end gap-1">
      <span
        role="status"
        className={cx(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
          state === 'offline' ? 'bg-danger/15 text-danger' : 'text-muted',
        )}
      >
        {state === 'offline' && <CloudOff className="size-3.5" aria-hidden />}
        {state === 'saving' && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        {state === 'saved' && <Check className="size-3.5" aria-hidden />}
        {state === 'offline' ? t('sheet.offline', { count: s.pending }) : state === 'saving' ? t('sheet.saving') : t('sheet.saved')}
      </span>
      {s.lastRejection && (
        <button type="button" className="max-w-64 text-right text-xs text-danger underline" onClick={() => outbox.dismissRejection()}>
          {t('sheet.rejected', { message: s.lastRejection })}
        </button>
      )}
    </div>
  );
}
