import type { CompiledTemplate } from './compile.js';
import type { Modifier } from './template.js';

export type Primitive = number | string | boolean | null;

/** Valor guardado de um recurso (PV, PE, Sanidade). Sem `atual`, vale o máximo. */
export interface ResourceValue {
  atual?: number;
  temp?: number;
}

/**
 * Lista guardada por chave, não por posição. Assim cada subcampo tem um caminho estável
 * ("lists.pericias.items.luta.grau") e duas edições em itens diferentes não conflitam.
 */
export interface StoredList {
  order: string[];
  items: Record<string, Record<string, Primitive>>;
}

/** Escolhas feitas no assistente de criação, para poder voltar e refazer. */
export interface CreationState {
  method?: string;
  /** Valor comprado (pontos) por atributo. */
  base?: Record<string, number>;
  /** Ajustes de raça/origem por atributo. */
  adjust?: Record<string, number>;
  /** Rolagens feitas, na ordem, e qual atributo recebeu cada uma (índice). */
  rolls?: Array<{ total: number; value: number; text: string }>;
  assign?: Record<string, number>;
  /** Passo do assistente em que a pessoa parou. */
  step?: string;
}

/** O que a ficha guarda (coluna `characters.data`). Só valores digitados; nada calculado. */
export interface CharacterData {
  values: Record<string, Primitive | ResourceValue>;
  lists: Record<string, StoredList>;
  conditions: string[];
  creation?: CreationState;
}

/** Item do inventário (tabela `items`), no formato que o motor consome. */
export interface InventoryItem {
  id: string;
  nome: string;
  quantidade: number;
  equipado: boolean;
  data?: Record<string, Primitive>;
  modifiers?: Modifier[];
}

/** Ficha nova com os valores padrão do template e as listas pré-preenchidas. */
export function newCharacterData(c: CompiledTemplate): CharacterData {
  const values: CharacterData['values'] = {};
  for (const f of c.template.fields) {
    if ('default' in f && f.default !== undefined) values[f.id] = f.default;
  }
  const lists: CharacterData['lists'] = {};
  for (const l of c.template.lists) {
    const items: StoredList['items'] = {};
    for (const { key, ...rest } of l.defaultItems ?? []) items[key] = { ...rest };
    lists[l.id] = { order: (l.defaultItems ?? []).map((i) => i.key), items };
  }
  return { values, lists, conditions: [] };
}

/**
 * Operação de escrita. É a unidade enviada pela fila local e aplicada no servidor:
 * "última edição vence" por caminho, e `inc` soma em vez de sobrescrever.
 */
export type CharacterOp =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'inc'; path: string[]; by: number }
  | { op: 'unset'; path: string[] };

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Aplica operações sem alterar o objeto original. Caminhos inexistentes são criados. */
export function applyOps(data: CharacterData, ops: CharacterOp[]): CharacterData {
  const root = structuredClone(data) as unknown as Json;
  for (const o of ops) {
    if (o.path.length === 0) throw new Error('Operação sem caminho');
    const parents = o.path.slice(0, -1);
    const last = o.path.at(-1)!;
    let cur: Json = root;
    for (const seg of parents) {
      if (!isObject(cur[seg])) cur[seg] = {};
      cur = cur[seg] as Json;
    }
    if (o.op === 'set') cur[last] = structuredClone(o.value);
    else if (o.op === 'unset') delete cur[last];
    else cur[last] = (typeof cur[last] === 'number' ? (cur[last] as number) : 0) + o.by;
  }
  return root as unknown as CharacterData;
}

/** Gera uma chave nova para item de lista adicionado pelo jogador. */
export function newListKey(existing: Iterable<string>): string {
  const taken = new Set(existing);
  for (;;) {
    const key = `i${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(key)) return key;
  }
}
