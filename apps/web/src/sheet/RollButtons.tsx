import type { RollDef } from '@rpg/engine';
import { Dices } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRoller } from '../roller/RollerProvider';
import { useSheetCtx } from './context';

/** Rótulo curto do botão: "Ataque: {@self.nome}" → "Ataque"; rótulo só com fórmula → ícone. */
export function shortLabel(r: RollDef): string | null {
  const head = r.label.split(':')[0]!.trim();
  return head.startsWith('{') ? null : head;
}

export function useRollAction() {
  const { sheet, characterId, campaignId, isGm, canEdit } = useSheetCtx();
  const open = useRoller();
  return {
    canRoll: canEdit,
    roll(r: RollDef, itemKey?: string) {
      const title = sheet.interpolate(r.label, itemKey && r.list ? ({ self: { list: sheet.compiled.lists.get(r.list)!, key: itemKey } } as never) : {});
      open({
        title,
        isGm,
        extraDice: r.expr.includes('@rolagem.dados'),
        request: { campaign_id: campaignId, character_id: characterId, roll_id: r.id, ...(itemKey ? { item_key: itemKey } : {}) },
      });
    },
  };
}

/** Botões das rolagens de uma categoria do template ($rolls:atributos, $rolls:combate). */
export function RollButtons({ category }: { category: string }) {
  const { t } = useTranslation();
  const { compiled } = useSheetCtx();
  const { canRoll, roll } = useRollAction();
  const rolls = compiled.template.rolls.filter((r) => !r.list && (r.category ?? '') === category);
  if (!canRoll || !rolls.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 py-3 sm:grid-cols-3">
      {rolls.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => roll(r)}
          aria-label={t('roller.rollThis', { label: r.label })}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface-2/60 px-2 text-sm font-medium hover:border-accent"
        >
          <Dices className="size-4 text-accent" aria-hidden />
          {r.label}
        </button>
      ))}
    </div>
  );
}
