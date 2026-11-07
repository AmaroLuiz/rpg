import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RollRow } from '../api/rolls';

type Toast = { id: string; text: string };
type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();
let ownId = '';

/** Chamado pelo canal da mesa quando chega uma rolagem nova. */
export function announceRoll(r: RollRow) {
  if (r.user_id === ownId) return;
  listeners.forEach((l) => l({ id: r.id, text: `roll:${r.author?.display_name ?? ''}|${r.label}|${r.total}` }));
}

/** Aviso genérico ("handout:Título"). */
export function announceInfo(text: string) {
  listeners.forEach((l) => l({ id: `${text}-${Date.now()}`, text }));
}

/** Aviso curto no rodapé quando outra pessoa rola: dá para acompanhar sem abrir o histórico. */
export function RollToasts({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    ownId = userId;
    const l: Listener = (r) => {
      setItems((prev) => [...prev.slice(-2), r]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== r.id)), 5000);
    };
    listeners.add(l);
    return () => void listeners.delete(l);
  }, [userId]);
  const render = (text: string) => {
    if (text.startsWith('roll:')) {
      const [name, label, total] = text.slice(5).split('|');
      return t('roller.rolled', { name: name || t('roller.someone'), label, total });
    }
    if (text.startsWith('handout:')) return t('handouts.arrived', { title: text.slice(8) });
    return text;
  };
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
      {items.map((r) => (
        <div key={r.id} role="status" className="pointer-events-auto max-w-md rounded-2xl bg-ink px-4 py-3 text-sm text-bg shadow-lg">
          {render(r.text)}
        </div>
      ))}
    </div>
  );
}
