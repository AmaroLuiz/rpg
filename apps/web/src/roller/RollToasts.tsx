import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RollRow } from '../api/rolls';

type Listener = (r: RollRow) => void;
const listeners = new Set<Listener>();

/** Chamado pelo canal da mesa quando chega uma rolagem nova. */
export function announceRoll(r: RollRow) {
  listeners.forEach((l) => l(r));
}

/** Aviso curto no rodapé quando outra pessoa rola: dá para acompanhar sem abrir o histórico. */
export function RollToasts({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<RollRow[]>([]);
  useEffect(() => {
    const l: Listener = (r) => {
      if (r.user_id === userId) return;
      setItems((prev) => [...prev.slice(-2), r]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== r.id)), 5000);
    };
    listeners.add(l);
    return () => void listeners.delete(l);
  }, [userId]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
      {items.map((r) => (
        <div key={r.id} role="status" className="pointer-events-auto max-w-md rounded-2xl bg-ink px-4 py-3 text-sm text-bg shadow-lg">
          {t('roller.rolled', { name: r.author?.display_name ?? t('roller.someone'), label: r.label, total: r.total })}
        </div>
      ))}
    </div>
  );
}
