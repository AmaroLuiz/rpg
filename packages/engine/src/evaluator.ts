import type { Node } from './ast.js';
import { describeGroup, rollGroup, type DiceGroupResult } from './dice.js';
import { EngineError } from './errors.js';
import { parse } from './parser.js';
import type { Rng } from './rng.js';
import { equals, format, isRecord, toNumber, truthy, type Value } from './values.js';

export interface EvalContext {
  /** Resolve uma referência `@a.b.c`. Deve lançar EngineError('unknown-ref') se não existir. */
  ref(path: string[]): Value;
  /** Funções extras do contexto (mod, option, field). Devolve `undefined` se não conhecer a função. */
  call?(name: string, args: Value[]): Value | undefined;
  /** Gerador de dados. Sem ele, dados na expressão são erro (fórmulas de campo nunca rolam). */
  rng?: Rng;
}

export interface Evaluation {
  value: Value;
  /** Expressão com refs substituídas por valores e dados pelos resultados, para mostrar ao jogador. */
  text: string;
  dice: DiceGroupResult[];
}

type Out = { v: Value; s: string };

const ARITH = new Set(['+', '-', '*', '/', '%', '^']);

function arith(op: string, a: Value, b: Value): Value {
  if (Array.isArray(a) || Array.isArray(b)) {
    const la = Array.isArray(a) ? a.length : -1;
    const lb = Array.isArray(b) ? b.length : -1;
    if (la >= 0 && lb >= 0 && la !== lb) {
      throw new EngineError('type', `Listas de tamanhos diferentes (${la} e ${lb}) em "${op}"`);
    }
    const n = Math.max(la, lb);
    return Array.from({ length: n }, (_, i) =>
      arith(op, Array.isArray(a) ? (a[i] ?? null) : a, Array.isArray(b) ? (b[i] ?? null) : b),
    );
  }
  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) {
    return `${a === null ? '' : format(a)}${b === null ? '' : format(b)}`;
  }
  const x = toNumber(a, `"${op}"`);
  const y = toNumber(b, `"${op}"`);
  switch (op) {
    case '+':
      return x + y;
    case '-':
      return x - y;
    case '*':
      return x * y;
    case '/':
      if (y === 0) throw new EngineError('type', 'Divisão por zero');
      return x / y;
    case '%':
      if (y === 0) throw new EngineError('type', 'Divisão por zero');
      return x % y;
    default:
      return x ** y;
  }
}

function flatten(args: Value[]): Value[] {
  return args.flatMap((a) => (Array.isArray(a) ? flatten(a) : [a]));
}

function numbers(args: Value[], fn: string): number[] {
  return flatten(args).map((a) => toNumber(a, `${fn}()`));
}

function arity(name: string, args: Value[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    const expected = min === max ? `${min}` : `${min} a ${max}`;
    throw new EngineError('bad-argument', `${name}() espera ${expected} argumento(s), recebeu ${args.length}`);
  }
}

const BUILTINS: Record<string, (args: Value[]) => Value> = {
  floor: (a) => (arity('floor', a, 1), Math.floor(toNumber(a[0]!, 'floor()'))),
  ceil: (a) => (arity('ceil', a, 1), Math.ceil(toNumber(a[0]!, 'ceil()'))),
  round: (a) => (arity('round', a, 1), Math.round(toNumber(a[0]!, 'round()'))),
  trunc: (a) => (arity('trunc', a, 1), Math.trunc(toNumber(a[0]!, 'trunc()'))),
  abs: (a) => (arity('abs', a, 1), Math.abs(toNumber(a[0]!, 'abs()'))),
  min: (a) => {
    const n = numbers(a, 'min');
    return n.length ? Math.min(...n) : 0;
  },
  max: (a) => {
    const n = numbers(a, 'max');
    return n.length ? Math.max(...n) : 0;
  },
  clamp: (a) => {
    arity('clamp', a, 3);
    const [x, lo, hi] = a.map((v) => toNumber(v, 'clamp()')) as [number, number, number];
    return Math.min(hi, Math.max(lo, x));
  },
  sum: (a) => numbers(a, 'sum').reduce((s, n) => s + n, 0),
  count: (a) => {
    arity('count', a, 1, 2);
    const list = Array.isArray(a[0]) ? a[0] : [a[0]!];
    return a.length === 2 ? list.filter((v) => equals(v, a[1]!)).length : list.filter(truthy).length;
  },
  len: (a) => {
    arity('len', a, 1);
    const v = a[0]!;
    return Array.isArray(v) || typeof v === 'string' ? v.length : 0;
  },
  has: (a) => {
    arity('has', a, 2);
    return Array.isArray(a[0]) ? a[0].some((v) => equals(v, a[1]!)) : equals(a[0]!, a[1]!);
  },
  /** lookup(x, limite1, valor1, limite2, valor2, …): valor do maior limite que x alcança. */
  lookup: (a) => {
    if (a.length < 3 || a.length % 2 === 0) {
      throw new EngineError('bad-argument', 'lookup() espera um valor e pares limite, resultado');
    }
    const x = toNumber(a[0]!, 'lookup()');
    let result: Value = 0;
    for (let i = 1; i < a.length; i += 2) {
      if (x >= toNumber(a[i]!, 'lookup()')) result = a[i + 1]!;
    }
    return result;
  },
};

export const BUILTIN_FUNCTIONS = [...Object.keys(BUILTINS), 'if', 'roll'];

class Evaluator {
  readonly dice: DiceGroupResult[] = [];
  private depth = 0;
  constructor(private readonly ctx: EvalContext) {}

  run(node: Node): Out {
    switch (node.type) {
      case 'num':
        return { v: node.value, s: format(node.value) };
      case 'str':
        return { v: node.value, s: JSON.stringify(node.value) };
      case 'bool':
        return { v: node.value, s: String(node.value) };
      case 'ref': {
        const v = this.ctx.ref(node.path);
        return { v, s: format(v) };
      }
      case 'group': {
        const inner = this.run(node.expr);
        return { v: inner.v, s: `(${inner.s})` };
      }
      case 'unary': {
        const arg = this.run(node.arg);
        if (node.op === '!') return { v: !truthy(arg.v), s: `!${arg.s}` };
        const n = toNumber(arg.v, `"${node.op}"`);
        return { v: node.op === '-' ? -n : n, s: `${node.op}${arg.s}` };
      }
      case 'binary': {
        if (node.op === '&&' || node.op === '||') {
          const left = this.run(node.left);
          const short = node.op === '&&' ? !truthy(left.v) : truthy(left.v);
          if (short) return { v: node.op === '||', s: left.s };
          const right = this.run(node.right);
          return { v: truthy(right.v), s: `${left.s} ${node.op} ${right.s}` };
        }
        const left = this.run(node.left);
        const right = this.run(node.right);
        const s = `${left.s} ${node.op} ${right.s}`;
        if (ARITH.has(node.op)) return { v: arith(node.op, left.v, right.v), s };
        switch (node.op) {
          case '==':
            return { v: equals(left.v, right.v), s };
          case '!=':
            return { v: !equals(left.v, right.v), s };
          default: {
            const a = toNumber(left.v, `"${node.op}"`);
            const b = toNumber(right.v, `"${node.op}"`);
            const v = node.op === '<' ? a < b : node.op === '<=' ? a <= b : node.op === '>' ? a > b : a >= b;
            return { v, s };
          }
        }
      }
      case 'cond': {
        const test = this.run(node.test);
        return this.run(truthy(test.v) ? node.then : node.else);
      }
      case 'member': {
        const obj = this.run(node.object);
        return { v: member(obj.v, node.property), s: `${obj.s}.${node.property}` };
      }
      case 'call': {
        if (node.name === 'roll') {
          // roll("1d8+2"): rola uma expressão guardada como texto (ex.: o dano de uma arma).
          if (node.args.length !== 1) throw new EngineError('bad-argument', 'roll() espera 1 argumento');
          if (!this.ctx.rng) throw new EngineError('dice-not-allowed', 'roll() só pode ser usado em rolagens');
          const src = this.run(node.args[0]!).v;
          if (typeof src !== 'string' || !src.trim()) return { v: 0, s: '0' };
          if (++this.depth > 3) throw new EngineError('bad-argument', 'roll() aninhado demais');
          const inner = this.run(parse(src));
          this.depth--;
          return inner;
        }
        if (node.name === 'if') {
          if (node.args.length !== 3) throw new EngineError('bad-argument', 'if() espera 3 argumentos');
          const test = this.run(node.args[0]!);
          return this.run(truthy(test.v) ? node.args[1]! : node.args[2]!);
        }
        const args = node.args.map((a) => this.run(a));
        const values = args.map((a) => a.v);
        const builtin = BUILTINS[node.name];
        let v: Value | undefined;
        if (builtin) v = builtin(values);
        else v = this.ctx.call?.(node.name, values);
        if (v === undefined) throw new EngineError('unknown-function', `Função desconhecida "${node.name}"`, { name: node.name });
        const literalArgs = node.args.every((a) => a.type === 'num' || a.type === 'str');
        return { v, s: literalArgs && !builtin ? format(v) : `${node.name}(${args.map((a) => a.s).join(', ')})` };
      }
      case 'dice': {
        if (!this.ctx.rng) {
          throw new EngineError('dice-not-allowed', 'Dados só podem ser usados em rolagens, não em campos calculados');
        }
        const count = this.run(node.count);
        const group = rollGroup(toNumber(count.v, 'quantidade de dados'), node.sides, node.mods, this.ctx.rng);
        this.dice.push(group);
        return { v: group.value, s: describeGroup(group) };
      }
    }
  }
}

function member(obj: Value, prop: string): Value {
  if (Array.isArray(obj)) return obj.map((item) => member(item, prop));
  if (isRecord(obj)) {
    if (!(prop in obj)) throw new EngineError('unknown-ref', `Não existe ".${prop}" neste registro`, { prop });
    return obj[prop]!;
  }
  throw new EngineError('type', `Não dá para ler ".${prop}" de ${format(obj)}`);
}

export function evaluateNode(node: Node, ctx: EvalContext): Evaluation {
  const ev = new Evaluator(ctx);
  const out = ev.run(node);
  return { value: out.v, text: out.s, dice: ev.dice };
}

export function evaluate(source: string, ctx: EvalContext): Evaluation {
  return evaluateNode(parse(source), ctx);
}

/** Contexto simples a partir de um objeto, útil para o rolador livre e para testes. */
export function objectContext(data: Record<string, Value>, rng?: Rng): EvalContext {
  return {
    rng,
    ref(path) {
      let cur: Value = data;
      for (const seg of path) {
        if (Array.isArray(cur)) {
          cur = cur.map((x) => member(x, seg));
        } else if (isRecord(cur) && seg in cur) {
          cur = cur[seg]!;
        } else {
          throw new EngineError('unknown-ref', `Campo desconhecido @${path.join('.')}`, { path });
        }
      }
      return cur;
    },
  };
}
