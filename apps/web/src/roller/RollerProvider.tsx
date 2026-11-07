import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { RollRequest } from '../api/rolls';
import { RollDialog } from './RollDialog';

export interface RollSpec {
  title: string;
  request: Omit<RollRequest, 'bonus' | 'dados' | 'visibility'>;
  /** O template usa @rolagem.dados nesta rolagem (ex.: Ordem Paranormal). */
  extraDice?: boolean;
  isGm: boolean;
}

const RollerContext = createContext<(spec: RollSpec) => void>(() => {});

/** Um diálogo de rolagem para o app todo; qualquer botão "rolar" chama open(spec). */
export function RollerProvider({ children }: { children: ReactNode }) {
  const [spec, setSpec] = useState<RollSpec | null>(null);
  const open = useCallback((s: RollSpec) => setSpec(s), []);
  return (
    <RollerContext.Provider value={open}>
      {children}
      {spec && <RollDialog spec={spec} onClose={() => setSpec(null)} />}
    </RollerContext.Provider>
  );
}

export const useRoller = () => useContext(RollerContext);
