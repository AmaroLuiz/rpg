import { Camera, UserRound } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCharacter } from '../api/characters';
import { usePortraitUrl, useUploadPortrait } from '../api/portraits';
import { Button, ErrorNote, cx } from '../components/ui';
import { friendlyError } from '../lib/errors';

export function PortraitImage({ path, name, className }: { path: string | null | undefined; name: string; className?: string }) {
  const url = usePortraitUrl(path);
  return (
    <div className={cx('grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-2 text-muted', className)}>
      {url.data ? <img src={url.data} alt={name} className="size-full object-cover" /> : <UserRound className="size-1/2" aria-hidden />}
    </div>
  );
}

/** Retrato com botão de trocar (câmera ou galeria no celular). */
export function PortraitPicker({ campaignId, characterId, canEdit }: { campaignId: string; characterId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const character = useCharacter(characterId);
  const upload = useUploadPortrait(campaignId, characterId);
  const input = useRef<HTMLInputElement>(null);
  const row = character.data;
  return (
    <div className="flex flex-col items-center gap-3 py-3">
      <PortraitImage path={row?.portrait_path} name={t('portrait.alt')} className="size-36" />
      {canEdit && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={t('portrait.choose')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = '';
            }}
          />
          <Button variant="secondary" busy={upload.isPending} onClick={() => input.current?.click()}>
            <Camera className="size-4" aria-hidden />
            {row?.portrait_path ? t('portrait.change') : t('portrait.choose')}
          </Button>
          {upload.error && <ErrorNote>{friendlyError(upload.error)}</ErrorNote>}
        </>
      )}
    </div>
  );
}
