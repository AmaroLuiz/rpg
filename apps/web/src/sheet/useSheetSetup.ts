import { Sheet, type CharacterOp } from '@rpg/engine';
import { useCallback, useMemo } from 'react';
import { useCampaign } from '../api/campaigns';
import { useCharacter, useCharacterData, useCharacterItems, useTemplateVersion, type CharacterRow } from '../api/characters';
import { useCampaignRealtime } from '../api/realtime';
import { useUserId } from '../auth/AuthProvider';
import { outbox } from '../sync';
import type { SheetCtx } from './context';

/** Tudo que a ficha e o assistente precisam: personagem, template, itens, permissões e escrita pela fila. */
export function useSheetSetup(campaignId: string, charId: string) {
  const userId = useUserId();
  useCampaignRealtime(campaignId, userId);
  const campaign = useCampaign(campaignId);
  const character = useCharacter(charId);
  const template = useTemplateVersion(character.data?.template_version_id);
  const items = useCharacterItems(charId);
  const data = useCharacterData(character.data);
  const change = useCallback((ops: CharacterOp[]) => outbox.enqueue(charId, ops), [charId]);
  const sheet = useMemo(() => (template.data && data ? new Sheet(template.data, data, items.data ?? []) : null), [template.data, data, items.data]);

  const loading = character.isPending || (!!character.data && template.isPending);
  const error = character.error ?? template.error ?? null;
  const row: CharacterRow | null | undefined = character.data;
  const isGm = campaign.data?.members.some((m) => m.user_id === userId && m.role === 'gm') ?? false;

  const ctx: SheetCtx | null =
    row && sheet && template.data && data
      ? { compiled: template.data, sheet, data, canEdit: row.owner_id === userId || isGm, change, characterId: charId, campaignId }
      : null;

  return { ctx, row, loading, error, campaign: campaign.data ?? null, isGm, userId };
}
