import type { CharacterData, CharacterOp, CompiledTemplate, Sheet } from '@rpg/engine';
import { createContext, useContext } from 'react';

export interface SheetCtx {
  compiled: CompiledTemplate;
  sheet: Sheet;
  data: CharacterData;
  canEdit: boolean;
  change(ops: CharacterOp[]): void;
  characterId: string;
  campaignId: string;
}

export const SheetContext = createContext<SheetCtx | null>(null);

export function useSheetCtx(): SheetCtx {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useSheetCtx fora da ficha');
  return ctx;
}
