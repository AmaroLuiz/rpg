import type { CharacterOp } from '@rpg/engine';
import amaldicoados from './ordem-paranormal/amaldicoados.json' with { type: 'json' };
import classes from './ordem-paranormal/classes.json' with { type: 'json' };
import criaturas from './ordem-paranormal/criaturas.json' with { type: 'json' };
import equipamento from './ordem-paranormal/equipamento.json' with { type: 'json' };
import origens from './ordem-paranormal/origens.json' with { type: 'json' };
import paranormais from './ordem-paranormal/paranormais.json' with { type: 'json' };
import rituais1 from './ordem-paranormal/rituais-1.json' with { type: 'json' };
import rituais2 from './ordem-paranormal/rituais-2.json' with { type: 'json' };
import rituais3 from './ordem-paranormal/rituais-3.json' with { type: 'json' };

/**
 * Compêndio: o conteúdo do livro (rituais, poderes, armas...) organizado para consulta e para
 * entrar na ficha com um toque. Traz nomes, números e regras do livro com resumos próprios;
 * o texto integral fica no livro, na página indicada.
 */
export type CompendiumKind =
  | 'ritual'
  | 'poder'
  | 'trilha'
  | 'origem'
  | 'arma'
  | 'municao'
  | 'protecao'
  | 'equipamento'
  | 'modificacao'
  | 'maldicao'
  | 'item_amaldicoado'
  | 'criatura';

export interface CompendiumEntry {
  id: string;
  kind: CompendiumKind;
  name: string;
  /** Subcategoria mostrada como agrupamento (classe, "Armas simples", "Proteções"...). */
  group?: string;
  /** Página do livro. */
  page?: number;
  /** Números e regras curtas, na ordem em que aparecem no cartão. */
  stats: Record<string, string | number>;
  /** Resumo do efeito. */
  text: string;
  discente?: string;
  verdadeiro?: string;
  /** Efeito extra de poderes paranormais com afinidade. */
  affinity?: string;
  /** Habilidades de trilha por NEX. */
  abilities?: Array<{ nex: string; name: string; text: string }>;
  /** Origem: chaves das perícias treinadas e o poder da origem. */
  skills?: string[];
  power?: { name: string; text: string };
  /** Proteção: bônus de Defesa ao equipar. */
  defense?: number;
}

export interface CompendiumKindInfo {
  id: CompendiumKind;
  label: string;
  /** Filtros oferecidos: "group" ou a chave de uma estatística. */
  filters: string[];
}

export interface Compendium {
  templateId: string;
  source: string;
  kinds: CompendiumKindInfo[];
  entries: CompendiumEntry[];
  /** Listas da ficha que aceitam entradas do compêndio, e de quais tipos. */
  lists: Record<string, CompendiumKind[]>;
  /** Campos de texto da ficha que podem ser escolhidos do compêndio. */
  fields: Record<string, CompendiumKind[]>;
  /** Tipos que podem entrar no inventário. */
  inventory: CompendiumKind[];
}

const ordemParanormal: Compendium = {
  templateId: 'ordem_paranormal',
  source: 'Ordem Paranormal RPG — livro de regras (versão 0.2)',
  kinds: [
    { id: 'ritual', label: 'Rituais', filters: ['Elemento', 'Círculo'] },
    { id: 'poder', label: 'Poderes', filters: ['group', 'Elemento'] },
    { id: 'trilha', label: 'Trilhas', filters: ['group'] },
    { id: 'origem', label: 'Origens', filters: [] },
    { id: 'arma', label: 'Armas', filters: ['group', 'Tipo'] },
    { id: 'municao', label: 'Munições', filters: [] },
    { id: 'protecao', label: 'Proteções', filters: [] },
    { id: 'equipamento', label: 'Equipamentos', filters: ['group'] },
    { id: 'modificacao', label: 'Modificações', filters: ['group'] },
    { id: 'maldicao', label: 'Maldições', filters: ['group', 'Elemento'] },
    { id: 'item_amaldicoado', label: 'Itens amaldiçoados', filters: [] },
    { id: 'criatura', label: 'Criaturas', filters: [] },
  ],
  entries: [
    ...rituais1,
    ...rituais2,
    ...rituais3,
    ...classes,
    ...paranormais,
    ...origens,
    ...equipamento,
    ...amaldicoados,
    ...criaturas,
  ] as CompendiumEntry[],
  lists: { rituais: ['ritual'], poderes: ['poder'], ataques: ['arma'] },
  fields: { origem: ['origem'], trilha: ['trilha'] },
  inventory: ['arma', 'protecao', 'equipamento', 'municao', 'item_amaldicoado'],
};

const compendiums: Record<string, Compendium> = { ordem_paranormal: ordemParanormal };

/** Compêndio do sistema, ou null se o template não tiver um. */
export function compendiumFor(templateId: string): Compendium | null {
  return compendiums[templateId] ?? null;
}

const stat = (e: CompendiumEntry, ...keys: string[]) => {
  for (const k of keys) {
    const v = e.stats[k];
    if (v !== undefined && v !== '' && v !== '—') return String(v);
  }
  return '';
};

const pageNote = (e: CompendiumEntry) => (e.page ? `Livro, p. ${e.page}.` : '');

/** Texto completo da entrada para um campo de descrição (resumo + aprimoramentos + página). */
export function describeEntry(e: CompendiumEntry, opts: { stats?: string[] } = {}): string {
  const lines: string[] = [];
  const shown = (opts.stats ?? []).map((k) => (stat(e, k) ? `${k}: ${stat(e, k)}` : '')).filter(Boolean);
  if (shown.length) lines.push(shown.join(' · '));
  lines.push(e.text);
  if (e.discente) lines.push(`Discente: ${e.discente}`);
  if (e.verdadeiro) lines.push(`Verdadeiro: ${e.verdadeiro}`);
  if (e.affinity) lines.push(`Afinidade: ${e.affinity}`);
  for (const a of e.abilities ?? []) lines.push(`NEX ${a.nex} — ${a.name}: ${a.text}`);
  const p = pageNote(e);
  if (p) lines.push(p);
  return lines.join('\n');
}

const ELEMENTOS: Record<string, string> = {
  Sangue: 'sangue',
  Morte: 'morte',
  Conhecimento: 'conhecimento',
  Energia: 'energia',
  Medo: 'medo',
};

/** Primeira forma de dano jogável: "1d6/1d8" vira "1d6" (a outra empunhadura fica na descrição). */
function firstDamage(d: string) {
  return d.split('/')[0]!.trim();
}

function romanToNumber(v: string) {
  const map: Record<string, number> = { '0': 0, I: 1, II: 2, III: 3, IV: 4 };
  return map[v.trim()] ?? 0;
}

/** Valores de um item de lista da ficha a partir de uma entrada. */
export function listItemFrom(e: CompendiumEntry, listId: string): Record<string, unknown> {
  switch (listId) {
    case 'rituais':
      return {
        nome: e.name,
        elemento: ELEMENTOS[stat(e, 'Elemento')] ?? null,
        circulo: Number.parseInt(stat(e, 'Círculo'), 10) || 1,
        execucao: stat(e, 'Execução'),
        alcance: stat(e, 'Alcance'),
        alvo: stat(e, 'Alvo', 'Área', 'Efeito'),
        duracao: stat(e, 'Duração'),
        resistencia: stat(e, 'Resistência'),
        descricao: describeEntry(e),
      };
    case 'poderes':
      return { nome: e.name, descricao: describeEntry(e, { stats: ['Classe', 'Elemento', 'Custo', 'Pré-requisito', 'NEX'] }) };
    case 'ataques':
      return {
        nome: e.name,
        pericia: stat(e, 'Tipo') === 'Corpo a corpo' ? 'luta' : 'pontaria',
        bonusAtaque: 0,
        dano: firstDamage(stat(e, 'Dano')),
        critico: stat(e, 'Crítico'),
        tipoDano: stat(e, 'Dano tipo'),
        alcance: stat(e, 'Alcance'),
      };
    default:
      return { nome: e.name, descricao: describeEntry(e) };
  }
}

export interface CompendiumItem {
  name: string;
  description: string;
  quantity: number;
  data: Record<string, string | number | boolean | null>;
  modifiers: Array<{ target: string; op: 'add'; value: number }>;
}

/** Item de inventário a partir de uma entrada (arma, proteção, equipamento...). */
export function inventoryItemFrom(e: CompendiumEntry): CompendiumItem {
  const espacos = Number.parseInt(stat(e, 'Espaços'), 10);
  const statsLine: string[] = [];
  for (const k of ['Dano', 'Crítico', 'Alcance', 'Dano tipo', 'Empunhadura', 'Proficiência', 'Munição', 'Defesa', 'Resistência a dano', 'Área', 'Resistência', 'Duração', 'Uso', 'Elemento']) {
    const v = stat(e, k);
    if (v) statsLine.push(`${k}: ${v}`);
  }
  return {
    name: e.name,
    description: [statsLine.join(' · '), e.text, pageNote(e)].filter(Boolean).join('\n'),
    quantity: 1,
    data: { espacos: Number.isFinite(espacos) ? espacos : 0, categoria: romanToNumber(stat(e, 'Categoria') || '0') },
    modifiers: e.defense ? [{ target: 'defesa', op: 'add', value: e.defense }] : [],
  };
}

/** Leitura da ficha que as escolhas de campo precisam. */
export interface SheetReader {
  value(fieldId: string): unknown;
  listOrder(listId: string): string[];
  listValue(listId: string, key: string, sub: string): unknown;
  newKey(taken: string[]): string;
}

function addListItem(listId: string, values: Record<string, unknown>, order: string[], reader: SheetReader, ops: CharacterOp[]) {
  const key = reader.newKey(order);
  ops.push({ op: 'set', path: ['lists', listId, 'items', key], value: values });
  order.push(key);
  return key;
}

function hasNamed(listId: string, name: string, order: string[], reader: SheetReader) {
  return order.some((k) => String(reader.listValue(listId, k, 'nome') ?? '').trim().toLowerCase() === name.toLowerCase());
}

/**
 * Operações para escolher uma origem ou trilha num campo de texto. Origem: preenche o nome,
 * treina as duas perícias (sem baixar quem já é veterano) e adiciona o poder da origem.
 * Trilha: preenche o nome e adiciona as habilidades até o NEX atual.
 */
export function fieldOpsFrom(e: CompendiumEntry, fieldId: string, reader: SheetReader): CharacterOp[] {
  const ops: CharacterOp[] = [{ op: 'set', path: ['values', fieldId], value: e.name }];
  const poderes = [...reader.listOrder('poderes')];
  const start = poderes.length;
  if (e.kind === 'origem') {
    for (const skill of e.skills ?? []) {
      const grau = Number(reader.listValue('pericias', skill, 'grau') ?? 0);
      if (grau < 5) ops.push({ op: 'set', path: ['lists', 'pericias', 'items', skill, 'grau'], value: 5 });
    }
    if (e.power && !hasNamed('poderes', e.power.name, poderes, reader)) {
      addListItem('poderes', { nome: e.power.name, descricao: `Poder da origem ${e.name}. ${e.power.text}${e.page ? `\nLivro, p. ${e.page}.` : ''}` }, poderes, reader, ops);
    }
  }
  if (e.kind === 'trilha') {
    const nex = Number(reader.value('nex') ?? 0);
    for (const a of e.abilities ?? []) {
      if (Number.parseInt(a.nex, 10) > nex || hasNamed('poderes', a.name, poderes, reader)) continue;
      addListItem('poderes', { nome: a.name, descricao: `Trilha ${e.name}, NEX ${a.nex}. ${a.text}${e.page ? `\nLivro, p. ${e.page}.` : ''}` }, poderes, reader, ops);
    }
  }
  if (poderes.length > start) ops.push({ op: 'set', path: ['lists', 'poderes', 'order'], value: poderes });
  return ops;
}
