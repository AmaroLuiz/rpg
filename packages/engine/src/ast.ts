export type BinaryOp =
  | '+' | '-' | '*' | '/' | '%' | '^'
  | '==' | '!=' | '<' | '<=' | '>' | '>='
  | '&&' | '||';

export type UnaryOp = '-' | '+' | '!';

export type Comparison = '>' | '>=' | '<' | '<=' | '=';

export type DiceModifier =
  /** Mantém os N maiores (kh) ou menores (kl). */
  | { kind: 'keep'; which: 'high' | 'low'; count: number }
  /** Descarta os N maiores (dh) ou menores (dl). */
  | { kind: 'drop'; which: 'high' | 'low'; count: number }
  /** Explode: rola de novo e soma quando o dado satisfaz a comparação (padrão: valor máximo). */
  | { kind: 'explode'; cmp: Comparison; target: number | null }
  /** Rerrola uma vez quando o dado satisfaz a comparação. */
  | { kind: 'reroll'; cmp: Comparison; target: number }
  /** Conta sucessos (o grupo vale o número de dados que satisfazem a comparação). */
  | { kind: 'success'; cmp: Comparison; target: number };

export type Node =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'null' }
  | { type: 'ref'; path: string[] }
  | { type: 'unary'; op: UnaryOp; arg: Node }
  | { type: 'binary'; op: BinaryOp; left: Node; right: Node }
  | { type: 'cond'; test: Node; then: Node; else: Node }
  | { type: 'call'; name: string; args: Node[] }
  | { type: 'member'; object: Node; property: string }
  | { type: 'group'; expr: Node }
  | { type: 'dice'; count: Node; sides: number; mods: DiceModifier[] };

/** Percorre a árvore chamando `visit` em cada nó. */
export function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  switch (node.type) {
    case 'unary':
      walk(node.arg, visit);
      break;
    case 'binary':
      walk(node.left, visit);
      walk(node.right, visit);
      break;
    case 'cond':
      walk(node.test, visit);
      walk(node.then, visit);
      walk(node.else, visit);
      break;
    case 'call':
      node.args.forEach((a) => walk(a, visit));
      break;
    case 'member':
      walk(node.object, visit);
      break;
    case 'group':
      walk(node.expr, visit);
      break;
    case 'dice':
      walk(node.count, visit);
      break;
    default:
      break;
  }
}

export function containsDice(node: Node): boolean {
  let found = false;
  walk(node, (n) => {
    if (n.type === 'dice') found = true;
  });
  return found;
}
