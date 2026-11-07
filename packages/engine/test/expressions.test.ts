import { describe, expect, it } from 'vitest';
import { EngineError } from '../src/errors.js';
import { evaluate, objectContext } from '../src/evaluator.js';
import { parse } from '../src/parser.js';
import { fixedRng, seededRng } from '../src/rng.js';
import type { Value } from '../src/values.js';

const ctx = (data: Record<string, Value> = {}, rng?: (s: number) => number) => objectContext(data, rng);
const val = (src: string, data: Record<string, Value> = {}) => evaluate(src, ctx(data)).value;

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
  return undefined;
}

describe('fórmulas', () => {
  it('respeita precedência e associatividade', () => {
    expect(val('1 + 2 * 3')).toBe(7);
    expect(val('(1 + 2) * 3')).toBe(9);
    expect(val('2 ^ 3 ^ 2')).toBe(512);
    expect(val('-2 ^ 2')).toBe(-4);
    expect(val('10 - 4 - 3')).toBe(3);
    expect(val('7 % 4')).toBe(3);
  });

  it('calcula modificador estilo d20', () => {
    expect(val('floor((@for - 10) / 2)', { for: 15 })).toBe(2);
    expect(val('floor((@for - 10) / 2)', { for: 7 })).toBe(-2);
  });

  it('lê referências aninhadas e projeta listas', () => {
    const data = { pericias: { luta: { bonus: 5 } }, itens: [{ peso: 2, qtd: 3 }, { peso: 1, qtd: 1 }] };
    expect(val('@pericias.luta.bonus', data)).toBe(5);
    expect(val('sum(@itens.peso * @itens.qtd)', data)).toBe(7);
  });

  it('comparação, lógica e condicional', () => {
    expect(val('@agi == 0 ? 2 : @agi', { agi: 0 })).toBe(2);
    expect(val('@agi == 0 ? 2 : @agi', { agi: 3 })).toBe(3);
    expect(val('@a > 1 && @b < 1', { a: 2, b: 0 })).toBe(true);
    expect(val('@x == "agi"', { x: 'agi' })).toBe(true);
    expect(val('!@ok || false', { ok: true })).toBe(false);
    expect(val('if(@n >= 7, 4, 2)', { n: 7 })).toBe(4);
  });

  it('funções embutidas', () => {
    expect(val('max(1, @a, 3)', { a: 9 })).toBe(9);
    expect(val('min(@l)', { l: [4, 2, 8] })).toBe(2);
    expect(val('clamp(12, 0, 10)')).toBe(10);
    expect(val('lookup(@nivel, 1, 2, 7, 4, 15, 6)', { nivel: 1 })).toBe(2);
    expect(val('lookup(@nivel, 1, 2, 7, 4, 15, 6)', { nivel: 10 })).toBe(4);
    expect(val('lookup(@nivel, 1, 2, 7, 4, 15, 6)', { nivel: 20 })).toBe(6);
    expect(val('count(@l)', { l: [true, false, true] })).toBe(2);
    expect(val('has(@l, "x")', { l: ['x', 'y'] })).toBe(true);
    expect(val('"PV: " + 12')).toBe('PV: 12');
  });

  it('acentos em nomes de campo', () => {
    expect(val('@ocultação + 1', { ocultação: 2 })).toBe(3);
  });

  it('erros com código', () => {
    expect(errorCode(() => parse('1 +'))).toBe('syntax');
    expect(errorCode(() => parse('agi + 1'))).toBe('syntax');
    expect(errorCode(() => parse('2d6x'))).toBe('syntax');
    expect(errorCode(() => val('@nada'))).toBe('unknown-ref');
    expect(errorCode(() => val('foo(1)'))).toBe('unknown-function');
    expect(errorCode(() => val('1 / 0'))).toBe('type');
    expect(errorCode(() => val('"a" * 2'))).toBe('type');
  });

  it('campos calculados não rolam dados', () => {
    expect(errorCode(() => val('1d20 + 2'))).toBe('dice-not-allowed');
  });
});

describe('dados', () => {
  const roll = (src: string, values: number[], data: Record<string, Value> = {}) =>
    evaluate(src, ctx(data, fixedRng(values)));

  it('soma simples com modificador', () => {
    const r = roll('2d6 + 3', [4, 5]);
    expect(r.value).toBe(12);
    expect(r.text).toBe('2d6 [4, 5] + 3');
    expect(r.dice).toHaveLength(1);
  });

  it('d20 sem quantidade e d%', () => {
    expect(roll('d20', [13]).value).toBe(13);
    expect(roll('1d%', [77]).value).toBe(77);
  });

  it('mantém maiores e menores', () => {
    expect(roll('4d6kh3', [1, 6, 3, 4]).value).toBe(13);
    expect(roll('2d20kl1', [15, 3]).value).toBe(3);
    expect(roll('4d6dl1', [1, 6, 3, 4]).value).toBe(13);
    expect(roll('3d6dh1', [6, 2, 5]).value).toBe(7);
    expect(roll('4d6kh3', [1, 6, 3, 4]).text).toBe('4d6kh3 [(1), 6, 3, 4]');
  });

  it('quantidade vinda de fórmula (pool de Ordem Paranormal)', () => {
    const r = roll('(@agi)d20kh1 + @bonus', [7, 18, 2], { agi: 3, bonus: 5 });
    expect(r.value).toBe(23);
    expect(r.text).toBe('3d20kh1 [(7), 18, (2)] + 5');
  });

  it('condicional escolhe a rolagem (atributo 0 em Ordem Paranormal)', () => {
    const src = '(@agi == 0 ? 2d20kl1 : (@agi)d20kh1) + 5';
    const zero = roll(src, [15, 4], { agi: 0 });
    expect(zero.value).toBe(9);
    expect(zero.dice).toHaveLength(1);
    expect(zero.dice[0]!.notation).toBe('2d20kl1');
  });

  it('explode, rerrola e conta sucessos', () => {
    expect(roll('1d6!', [6, 6, 2]).value).toBe(14);
    expect(roll('1d20r1', [1, 12]).value).toBe(12);
    const r = roll('1d20r1', [1, 12]);
    expect(r.dice[0]!.dice[0]!.rerolled).toEqual([1]);
    const pool = roll('5d10cs>=8', [8, 3, 10, 7, 9]);
    expect(pool.value).toBe(3);
    expect(pool.dice[0]!.isPool).toBe(true);
  });

  it('explosão tem limite e "!=" continua sendo operador', () => {
    expect(roll('1d6!', [6]).dice[0]!.dice[0]!.rolls).toHaveLength(21);
    expect(roll('1d6 != 3', [3]).value).toBe(false);
  });

  it('limites de quantidade', () => {
    expect(errorCode(() => roll('101d6', [1]))).toBe('dice-limit');
    expect(errorCode(() => roll('1d1001', [1]))).toBe('dice-limit');
  });

  it('gerador com semente é reproduzível', () => {
    const a = evaluate('10d20', ctx({}, seededRng(42))).value;
    const b = evaluate('10d20', ctx({}, seededRng(42))).value;
    expect(a).toBe(b);
  });

  it('distribuição do d20 é uniforme o bastante', () => {
    const rng = seededRng(7);
    const counts = new Array(21).fill(0);
    for (let i = 0; i < 20000; i++) counts[rng(20)]++;
    for (let f = 1; f <= 20; f++) expect(counts[f]).toBeGreaterThan(850);
  });
});
