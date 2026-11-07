import type { CompiledTemplate } from './compile.js';
import type { CharacterOp, CreationState } from './data.js';
import { EngineError } from './errors.js';
import { evaluate, objectContext } from './evaluator.js';
import type { Rng } from './rng.js';
import type { AttributeMethod, PointBuyMethod, RollMethod } from './template.js';
import { toNumber } from './values.js';

export interface PointBuyStatus {
  spent: number;
  budget: number;
  remaining: number;
  /** Atributos abaixo do valor de partida e o limite permitido. */
  belowBase: number;
  maxBelowBase: number | null;
  /** Problemas para mostrar (nunca bloqueiam). */
  issues: string[];
}

export function pointCost(m: PointBuyMethod, value: number): number | null {
  const c = m.cost[String(value)];
  return c === undefined ? null : c;
}

/** Quanto foi gasto numa compra de pontos e o que está fora da regra. */
export function pointBuyStatus(m: PointBuyMethod, values: Record<string, number>, fields: string[]): PointBuyStatus {
  let spent = 0;
  let belowBase = 0;
  const issues: string[] = [];
  for (const f of fields) {
    const v = values[f] ?? m.base;
    const c = pointCost(m, v);
    if (c === null) issues.push(`${f}: o valor ${v} não está na tabela de custo`);
    else spent += c;
    if (v < m.base) belowBase++;
  }
  const remaining = m.budget - spent;
  if (remaining < 0) issues.push(`Pontos demais: ${-remaining} acima do total de ${m.budget}`);
  const maxBelow = m.maxBelowBase ?? null;
  if (maxBelow !== null && belowBase > maxBelow) {
    issues.push(`Só ${maxBelow} atributo(s) pode(m) ficar abaixo de ${m.base}`);
  }
  return { spent, budget: m.budget, remaining, belowBase, maxBelowBase: maxBelow, issues };
}

/** Rola um atributo pelo método (ex.: 4d6kh3) e converte o total no valor da ficha. */
export function rollAttribute(m: RollMethod, rng: Rng): { total: number; value: number; text: string } {
  const r = evaluate(m.expr, objectContext({}, rng));
  const total = toNumber(r.value, 'rolagem de atributo');
  const value = m.convert ? toNumber(evaluate(m.convert, objectContext({ valor: total })).value, 'conversão') : total;
  return { total, value, text: r.text };
}

export function findMethod(c: CompiledTemplate, id: string | undefined): AttributeMethod | undefined {
  const methods = c.template.creation?.attributes?.methods ?? [];
  return methods.find((m) => m.id === id) ?? methods[0];
}

/**
 * Valor base de cada atributo segundo o método escolhido (antes dos ajustes).
 * Manual não tem base: o valor é o da ficha.
 */
export function creationBase(c: CompiledTemplate, state: CreationState): Record<string, number> | null {
  const attrs = c.template.creation?.attributes;
  const m = findMethod(c, state.method);
  if (!attrs || !m || m.kind === 'manual') return null;
  const out: Record<string, number> = {};
  for (const f of attrs.fields) {
    if (m.kind === 'pointBuy') out[f] = state.base?.[f] ?? m.base;
    else {
      const idx = state.assign?.[f];
      const roll = idx === undefined ? undefined : state.rolls?.[idx];
      out[f] = roll ? roll.value : 0;
    }
  }
  return out;
}

/**
 * Operações que gravam o estado de criação e os valores finais (base + ajuste) nos atributos.
 * Use a cada mudança no assistente: a ficha fica sempre coerente com as escolhas.
 */
export function creationOps(c: CompiledTemplate, next: CreationState): CharacterOp[] {
  const attrs = c.template.creation?.attributes;
  if (!attrs) throw new EngineError('bad-argument', 'Este template não tem distribuição de atributos');
  const ops: CharacterOp[] = [{ op: 'set', path: ['creation'], value: next }];
  const base = creationBase(c, next);
  if (base) {
    for (const f of attrs.fields) {
      const adj = attrs.adjustments ? (next.adjust?.[f] ?? 0) : 0;
      ops.push({ op: 'set', path: ['values', f], value: base[f]! + adj });
    }
  }
  return ops;
}
