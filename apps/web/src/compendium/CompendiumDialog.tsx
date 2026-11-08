import type { Compendium, CompendiumEntry, CompendiumKind } from '@rpg/templates/compendium';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CompendiumBrowser } from './CompendiumBrowser';

/** O livro numa folha por cima da ficha: escolhe uma ou várias entradas sem sair da tela. */
export function CompendiumDialog({
  compendium,
  kinds,
  title,
  pickLabel,
  onPick,
  onClose,
  closeOnPick,
}: {
  compendium: Compendium;
  kinds: CompendiumKind[];
  title: string;
  pickLabel?: string;
  onPick(e: CompendiumEntry): void;
  onClose(): void;
  /** Fecha ao escolher (campos de valor único, como origem). */
  closeOnPick?: boolean;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={title}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-3xl bg-surface p-0 text-ink backdrop:bg-black/50 sm:m-auto sm:max-h-[85dvh] sm:max-w-2xl sm:rounded-3xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface px-5 py-3">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <button type="button" onClick={() => dialog.current?.close()} className="grid size-11 place-items-center rounded-xl hover:bg-surface-2" aria-label={t('compendium.close')}>
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
        <CompendiumBrowser
          compendium={compendium}
          kinds={kinds}
          pickLabel={pickLabel}
          onPick={(e) => {
            onPick(e);
            if (closeOnPick) dialog.current?.close();
          }}
        />
      </div>
    </dialog>
  );
}
