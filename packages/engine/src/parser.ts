import type { BinaryOp, Comparison, DiceModifier, Node } from './ast.js';
import { EngineError } from './errors.js';

type Token =
  | { t: 'num'; value: number; pos: number }
  | { t: 'str'; value: string; pos: number }
  | { t: 'ident'; value: string; pos: number }
  | { t: 'ref'; path: string[]; pos: number }
  | { t: 'dice'; count: number | null; sides: number; mods: DiceModifier[]; pos: number }
  | { t: 'op'; value: string; pos: number }
  | { t: 'eof'; pos: number };

const OPERATORS = ['==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '^', '<', '>', '!', '?', ':', '(', ')', ',', '.'];

const CMP = '(>=|<=|>|<|=)?';
const DICE_HEAD = /^(\d+)?d(\d+|%)/;
const MOD_PATTERNS: Array<[RegExp, (m: RegExpExecArray) => DiceModifier]> = [
  [/^(kh|kl|k)(\d+)?/, (m) => ({ kind: 'keep', which: m[1] === 'kl' ? 'low' : 'high', count: m[2] ? Number(m[2]) : 1 })],
  [/^(dh|dl)(\d+)?/, (m) => ({ kind: 'drop', which: m[1] === 'dh' ? 'high' : 'low', count: m[2] ? Number(m[2]) : 1 })],
  [new RegExp(`^!(?!=)${CMP}(\\d+)?`), (m) => ({ kind: 'explode', cmp: (m[1] ?? (m[2] ? '=' : '>=')) as Comparison, target: m[2] ? Number(m[2]) : null })],
  [new RegExp(`^r${CMP}(\\d+)`), (m) => ({ kind: 'reroll', cmp: (m[1] ?? '=') as Comparison, target: Number(m[2]) })],
  [new RegExp(`^cs${CMP}(\\d+)`), (m) => ({ kind: 'success', cmp: (m[1] ?? '>=') as Comparison, target: Number(m[2]) })],
];

const isIdentStart = (c: string) => /[A-Za-z_À-ɏ]/.test(c);
const isIdentChar = (c: string) => /[A-Za-z0-9_À-ɏ]/.test(c);

function syntax(message: string, pos: number, source: string): EngineError {
  return new EngineError('syntax', `${message} (posição ${pos + 1} em "${source}")`, { pos, source });
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const rest = source.slice(i);
    const prev = tokens.at(-1);

    // Dados: "2d6", "d20" ou "d20" logo após ")" (quantidade vinda de um grupo).
    const dice = DICE_HEAD.exec(rest);
    const afterGroup = prev?.t === 'op' && prev.value === ')';
    if (dice && (dice[1] !== undefined || !prev || prev.t === 'op')) {
      let j = dice[0].length;
      const mods: DiceModifier[] = [];
      let matched = true;
      while (matched) {
        matched = false;
        for (const [re, build] of MOD_PATTERNS) {
          const m = re.exec(source.slice(i + j));
          if (m) {
            mods.push(build(m));
            j += m[0].length;
            matched = true;
            break;
          }
        }
      }
      const next = source[i + j];
      if (next !== undefined && isIdentChar(next)) {
        throw syntax(`Modificador de dado desconhecido "${source.slice(i + dice[0].length).match(/^\w+/)?.[0]}"`, i, source);
      }
      const sides = dice[2] === '%' ? 100 : Number(dice[2]);
      const count = dice[1] !== undefined ? Number(dice[1]) : afterGroup ? null : 1;
      tokens.push({ t: 'dice', count, sides, mods, pos: i });
      i += j;
      continue;
    }

    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const m = /^(\d+(\.\d+)?|\.\d+)/.exec(rest)!;
      tokens.push({ t: 'num', value: Number(m[0]), pos: i });
      i += m[0].length;
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      let value = '';
      while (j < source.length && source[j] !== c) {
        if (source[j] === '\\' && j + 1 < source.length) {
          value += source[j + 1];
          j += 2;
        } else {
          value += source[j];
          j++;
        }
      }
      if (j >= source.length) throw syntax('Texto sem aspas de fechamento', i, source);
      tokens.push({ t: 'str', value, pos: i });
      i = j + 1;
      continue;
    }

    if (c === '@') {
      const m = /^@([A-Za-z_À-ɏ][\wÀ-ɏ]*(?:\.[\wÀ-ɏ]+)*)/.exec(rest);
      if (!m) throw syntax('Referência inválida depois de "@"', i, source);
      tokens.push({ t: 'ref', path: m[1]!.split('.'), pos: i });
      i += m[0].length;
      continue;
    }

    if (isIdentStart(c)) {
      let j = i;
      while (j < source.length && isIdentChar(source[j]!)) j++;
      tokens.push({ t: 'ident', value: source.slice(i, j), pos: i });
      i = j;
      continue;
    }

    const op = OPERATORS.find((o) => rest.startsWith(o));
    if (op) {
      tokens.push({ t: 'op', value: op, pos: i });
      i += op.length;
      continue;
    }
    throw syntax(`Caractere inesperado "${c}"`, i, source);
  }
  tokens.push({ t: 'eof', pos: source.length });
  return tokens;
}

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[], private readonly source: string) {}

  private peek(): Token {
    return this.tokens[this.i]!;
  }

  private next(): Token {
    return this.tokens[this.i++]!;
  }

  private isOp(value: string): boolean {
    const t = this.peek();
    return t.t === 'op' && t.value === value;
  }

  private expectOp(value: string): void {
    const t = this.next();
    if (t.t !== 'op' || t.value !== value) throw syntax(`Esperava "${value}"`, t.pos, this.source);
  }

  parse(): Node {
    const node = this.conditional();
    const t = this.peek();
    if (t.t !== 'eof') throw syntax('Sobrou texto no fim da expressão', t.pos, this.source);
    return node;
  }

  private conditional(): Node {
    const test = this.binary(0);
    if (this.isOp('?')) {
      this.next();
      const then = this.conditional();
      this.expectOp(':');
      const otherwise = this.conditional();
      return { type: 'cond', test, then, else: otherwise };
    }
    return test;
  }

  private static readonly LEVELS: BinaryOp[][] = [
    ['||'],
    ['&&'],
    ['==', '!='],
    ['<', '<=', '>', '>='],
    ['+', '-'],
    ['*', '/', '%'],
  ];

  private binary(level: number): Node {
    if (level >= Parser.LEVELS.length) return this.unary();
    let left = this.binary(level + 1);
    const ops = Parser.LEVELS[level]!;
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && (ops as string[]).includes(t.value)) {
        this.next();
        const right = this.binary(level + 1);
        left = { type: 'binary', op: t.value as BinaryOp, left, right };
      } else {
        return left;
      }
    }
  }

  private unary(): Node {
    const t = this.peek();
    if (t.t === 'op' && (t.value === '-' || t.value === '+' || t.value === '!')) {
      this.next();
      return { type: 'unary', op: t.value, arg: this.unary() };
    }
    return this.power();
  }

  private power(): Node {
    const base = this.postfix();
    if (this.isOp('^')) {
      this.next();
      return { type: 'binary', op: '^', left: base, right: this.unary() };
    }
    return base;
  }

  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && t.value === '.') {
        this.next();
        const name = this.next();
        if (name.t !== 'ident' && name.t !== 'num') throw syntax('Esperava um nome depois de "."', name.pos, this.source);
        node = { type: 'member', object: node, property: String(name.value) };
      } else if (t.t === 'dice' && t.count === null) {
        if (node.type !== 'group' && node.type !== 'call') {
          throw syntax('A quantidade de dados precisa estar entre parênteses, como (@agi)d20', t.pos, this.source);
        }
        this.next();
        node = { type: 'dice', count: node, sides: t.sides, mods: t.mods };
      } else {
        return node;
      }
    }
  }

  private primary(): Node {
    const t = this.next();
    switch (t.t) {
      case 'num':
        return { type: 'num', value: t.value };
      case 'str':
        return { type: 'str', value: t.value };
      case 'ref':
        return { type: 'ref', path: t.path };
      case 'dice':
        if (t.count === null) throw syntax('Dado sem quantidade', t.pos, this.source);
        return { type: 'dice', count: { type: 'num', value: t.count }, sides: t.sides, mods: t.mods };
      case 'ident': {
        if (t.value === 'true' || t.value === 'false') return { type: 'bool', value: t.value === 'true' };
        if (this.isOp('(')) {
          this.next();
          const args: Node[] = [];
          if (!this.isOp(')')) {
            args.push(this.conditional());
            while (this.isOp(',')) {
              this.next();
              args.push(this.conditional());
            }
          }
          this.expectOp(')');
          return { type: 'call', name: t.value, args };
        }
        throw syntax(`Nome solto "${t.value}": campos usam "@", como @${t.value}`, t.pos, this.source);
      }
      case 'op':
        if (t.value === '(') {
          const expr = this.conditional();
          this.expectOp(')');
          return { type: 'group', expr };
        }
        throw syntax(`Operador inesperado "${t.value}"`, t.pos, this.source);
      case 'eof':
        throw syntax('Expressão terminou antes do esperado', t.pos, this.source);
    }
  }
}

const cache = new Map<string, Node>();

/** Converte o texto de uma fórmula ou rolagem em árvore sintática (com cache). */
export function parse(source: string): Node {
  const hit = cache.get(source);
  if (hit) return hit;
  const node = new Parser(tokenize(source), source).parse();
  if (cache.size > 5000) cache.clear();
  cache.set(source, node);
  return node;
}
