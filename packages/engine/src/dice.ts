import type { Comparison, DiceModifier } from './ast.js';
import { EngineError } from './errors.js';
import type { Rng } from './rng.js';

export const DICE_LIMITS = { maxCount: 100, maxSides: 1000, maxExplosions: 20 } as const;

export interface DieResult {
  /** Valor final do dado (soma das explosões, se houver). */
  value: number;
  /** Cada resultado rolado para este dado, em ordem (explosões incluídas). */
  rolls: number[];
  /** Resultados descartados por rerrolagem. */
  rerolled: number[];
  /** Se o dado conta no total (false quando descartado por kh/kl/dh/dl). */
  kept: boolean;
  /** Só em pools de sucesso: se este dado é um sucesso. */
  success?: boolean;
}

export interface DiceGroupResult {
  notation: string;
  count: number;
  sides: number;
  dice: DieResult[];
  /** Soma dos dados mantidos, ou número de sucessos num pool. */
  value: number;
  /** true quando o grupo conta sucessos em vez de somar. */
  isPool: boolean;
}

export function compare(value: number, cmp: Comparison, target: number): boolean {
  switch (cmp) {
    case '>':
      return value > target;
    case '>=':
      return value >= target;
    case '<':
      return value < target;
    case '<=':
      return value <= target;
    case '=':
      return value === target;
  }
}

export function notation(count: number, sides: number, mods: DiceModifier[]): string {
  const m = mods
    .map((mod) => {
      switch (mod.kind) {
        case 'keep':
          return `k${mod.which === 'high' ? 'h' : 'l'}${mod.count}`;
        case 'drop':
          return `d${mod.which === 'high' ? 'h' : 'l'}${mod.count}`;
        case 'explode':
          return mod.target === null ? '!' : `!${mod.cmp === '=' ? '' : mod.cmp}${mod.target}`;
        case 'reroll':
          return `r${mod.cmp === '=' ? '' : mod.cmp}${mod.target}`;
        case 'success':
          return `cs${mod.cmp}${mod.target}`;
      }
    })
    .join('');
  return `${count}d${sides === 100 ? '%' : sides}${m}`;
}

export function rollGroup(countRaw: number, sides: number, mods: DiceModifier[], rng: Rng): DiceGroupResult {
  const count = Math.max(0, Math.trunc(countRaw));
  if (count > DICE_LIMITS.maxCount) {
    throw new EngineError('dice-limit', `No máximo ${DICE_LIMITS.maxCount} dados por grupo (pediu ${count})`);
  }
  if (sides < 1 || sides > DICE_LIMITS.maxSides) {
    throw new EngineError('dice-limit', `Dados precisam ter de 1 a ${DICE_LIMITS.maxSides} lados (pediu ${sides})`);
  }

  const reroll = mods.find((m) => m.kind === 'reroll');
  const explode = mods.find((m) => m.kind === 'explode');
  const success = mods.find((m) => m.kind === 'success');
  if (explode && sides === 1) throw new EngineError('dice-limit', 'Um d1 não pode explodir');

  const dice: DieResult[] = [];
  for (let i = 0; i < count; i++) {
    let first = rng(sides);
    const rerolled: number[] = [];
    if (reroll && compare(first, reroll.cmp, reroll.target)) {
      rerolled.push(first);
      first = rng(sides);
    }
    const rolls = [first];
    if (explode) {
      const target = explode.target ?? sides;
      const cmp = explode.target === null ? '>=' : explode.cmp;
      let last = first;
      let n = 0;
      while (compare(last, cmp, target) && n < DICE_LIMITS.maxExplosions) {
        last = rng(sides);
        rolls.push(last);
        n++;
      }
    }
    dice.push({ value: rolls.reduce((a, b) => a + b, 0), rolls, rerolled, kept: true });
  }

  for (const mod of mods) {
    if (mod.kind !== 'keep' && mod.kind !== 'drop') continue;
    const active = dice.filter((d) => d.kept);
    const sorted = [...active].sort((a, b) => a.value - b.value);
    const n = Math.min(mod.count, active.length);
    let toDrop: DieResult[];
    if (mod.kind === 'keep') {
      toDrop = mod.which === 'high' ? sorted.slice(0, active.length - n) : sorted.slice(n);
    } else {
      toDrop = mod.which === 'high' ? sorted.slice(active.length - n) : sorted.slice(0, n);
    }
    toDrop.forEach((d) => (d.kept = false));
  }

  let value: number;
  if (success) {
    value = 0;
    for (const d of dice) {
      d.success = d.kept && compare(d.value, success.cmp, success.target);
      if (d.success) value++;
    }
  } else {
    value = dice.filter((d) => d.kept).reduce((a, d) => a + d.value, 0);
  }

  return { notation: notation(count, sides, mods), count, sides, dice, value, isPool: Boolean(success) };
}

/** Texto curto de um grupo: "2d20kh1 [18, (7)]". Parênteses marcam dados descartados. */
export function describeGroup(g: DiceGroupResult): string {
  const parts = g.dice.map((d) => {
    const txt = d.rolls.length > 1 ? d.rolls.join('+') : String(d.value);
    const marked = g.isPool && d.success ? `${txt}*` : txt;
    return d.kept ? marked : `(${marked})`;
  });
  return `${g.notation} [${parts.join(', ')}]`;
}
