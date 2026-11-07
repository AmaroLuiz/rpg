import { containsDice, walk, type Node } from './ast.js';
import { EngineError } from './errors.js';
import { BUILTIN_FUNCTIONS } from './evaluator.js';
import { parse } from './parser.js';
import {
  TemplateSchema,
  type CatalogDef,
  type ConditionDef,
  type FieldDef,
  type ListDef,
  type Modifier,
  type RollDef,
  type SubFieldDef,
  type Template,
} from './template.js';

export interface TemplateIssue {
  /** Onde está o problema, ex.: "fields.defesa.formula". */
  path: string;
  message: string;
}

export interface CompiledTemplate {
  template: Template;
  fields: Map<string, FieldDef>;
  lists: Map<string, ListDef>;
  catalogs: Map<string, CatalogDef>;
  rolls: Map<string, RollDef>;
  conditions: Map<string, ConditionDef>;
  inventoryFields: Map<string, SubFieldDef>;
}

/** Funções que o contexto da ficha fornece além das embutidas. */
export const SHEET_FUNCTIONS = ['mod', 'option', 'field', 'condition'] as const;
export const RESERVED_IDS = ['self', 'itens', 'rolagem', 'key'] as const;
export const RESOURCE_PARTS = ['atual', 'max', 'temp'] as const;
export const ITEM_BASE_FIELDS = ['id', 'nome', 'quantidade', 'equipado'] as const;
export const ROLL_OPTIONS = ['dados', 'bonus'] as const;

const KNOWN_FUNCTIONS = new Set<string>([...BUILTIN_FUNCTIONS, ...SHEET_FUNCTIONS]);

/** Fórmulas entre chaves dentro de um texto: "Teste de {@self.nome}". */
export function interpolations(text: string): string[] {
  return [...text.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]!);
}

interface Scope {
  /** Lista ligada a @self, quando a fórmula está dentro de um item de lista. */
  self?: ListDef;
  /** Se @rolagem e dados são permitidos (só em rolagens). */
  roll?: boolean;
}

interface Analysis {
  roots: Set<string>;
}

class Compiler {
  readonly issues: TemplateIssue[] = [];
  /** Arestas do grafo de dependências: nó -> nós de que depende. */
  readonly deps = new Map<string, Set<string>>();

  constructor(readonly c: CompiledTemplate) {}

  issue(path: string, message: string) {
    this.issues.push({ path, message });
  }

  edge(from: string, to: Iterable<string>) {
    let set = this.deps.get(from);
    if (!set) this.deps.set(from, (set = new Set()));
    for (const t of to) set.add(t);
  }

  /** Analisa uma fórmula: sintaxe, dados, funções e referências. Devolve as raízes referenciadas. */
  formula(source: string | number | undefined, path: string, scope: Scope = {}): Analysis {
    const roots = new Set<string>();
    if (source === undefined || typeof source === 'number') return { roots };
    let node: Node;
    try {
      node = parse(source);
    } catch (e) {
      this.issue(path, e instanceof EngineError ? e.message : String(e));
      return { roots };
    }
    if (!scope.roll && containsDice(node)) {
      this.issue(path, 'Dados só podem aparecer em rolagens');
    }
    walk(node, (n) => {
      if (n.type === 'call') {
        if (!KNOWN_FUNCTIONS.has(n.name)) this.issue(path, `Função desconhecida "${n.name}"`);
        if (n.name === 'roll' && !scope.roll) this.issue(path, 'roll() só pode aparecer em rolagens');
        const first = n.args[0];
        if ((n.name === 'option' || n.name === 'field') && first?.type === 'str') {
          if (!this.c.fields.has(first.value)) this.issue(path, `${n.name}("${first.value}"): campo inexistente`);
          else roots.add(first.value);
        }
        if (n.name === 'option' && first?.type === 'str') {
          const f = this.c.fields.get(first.value);
          if (f && (f.type !== 'select' || !f.catalog)) {
            this.issue(path, `option("${first.value}"): o campo precisa ser uma seleção ligada a um catálogo`);
          }
        }
        if (n.name === 'condition' && first?.type === 'str' && !this.c.conditions.has(first.value)) {
          this.issue(path, `condition("${first.value}"): condição inexistente`);
        }
        if (n.name === 'mod' && first?.type === 'str' && this.c.fields.has(first.value)) {
          this.issue(path, `mod("${first.value}"): modificadores em campos já são aplicados sozinhos; use @${first.value}`);
        }
      }
      if (n.type === 'ref') this.ref(n.path, path, scope, roots);
    });
    return { roots };
  }

  private ref(p: string[], path: string, scope: Scope, roots: Set<string>) {
    const [root, a, b] = p;
    const name = `@${p.join('.')}`;
    if (root === 'self') {
      if (!scope.self) return this.issue(path, `${name}: @self só existe dentro de listas`);
      if (a === undefined || a === 'key') return;
      if (!scope.self.fields.some((f) => f.id === a)) this.issue(path, `${name}: "${a}" não é subcampo da lista ${scope.self.id}`);
      return;
    }
    if (root === 'rolagem') {
      if (!scope.roll) return this.issue(path, `${name}: @rolagem só existe em rolagens`);
      if (a === undefined || !(ROLL_OPTIONS as readonly string[]).includes(a)) {
        this.issue(path, `${name}: use @rolagem.dados ou @rolagem.bonus`);
      }
      return;
    }
    if (root === 'itens') {
      if (!this.c.template.inventory) return this.issue(path, `${name}: o template não tem inventário`);
      if (a !== undefined && !(ITEM_BASE_FIELDS as readonly string[]).includes(a) && !this.c.inventoryFields.has(a)) {
        this.issue(path, `${name}: "${a}" não é campo de item`);
      }
      roots.add('itens');
      return;
    }
    const field = this.c.fields.get(root!);
    if (field) {
      roots.add(root!);
      if (a === undefined) return;
      if (field.type === 'resource') {
        if (!(RESOURCE_PARTS as readonly string[]).includes(a) || b !== undefined) {
          this.issue(path, `${name}: recursos aceitam .atual, .max ou .temp`);
        }
        return;
      }
      if (field.type === 'select' && field.catalog) {
        const cat = this.c.catalogs.get(field.catalog);
        const known = new Set(['id', 'label', ...(cat?.options.flatMap((o) => Object.keys(o.values ?? {})) ?? [])]);
        if (!known.has(a)) this.issue(path, `${name}: nenhuma opção do catálogo ${field.catalog} tem "${a}"`);
        return;
      }
      return this.issue(path, `${name}: o campo ${root} não tem partes`);
    }
    const list = this.c.lists.get(root!);
    if (list) {
      roots.add(root!);
      if (a === undefined) return;
      const isSub = list.fields.some((f) => f.id === a);
      if (isSub) return;
      if (b !== undefined && !list.fields.some((f) => f.id === b)) {
        this.issue(path, `${name}: "${b}" não é subcampo da lista ${root}`);
      }
      if (b === undefined) this.issue(path, `${name}: "${a}" não é subcampo da lista ${root}`);
      return;
    }
    this.issue(path, `${name}: campo desconhecido`);
  }

  modifiers(mods: Modifier[] | undefined, path: string, extraDeps: string[] = []) {
    (mods ?? []).forEach((m, i) => {
      const p = `${path}.modifiers[${i}]`;
      const deps = [...this.formula(m.value, `${p}.value`).roots, ...(m.when ? this.formula(m.when, `${p}.when`).roots : [])];
      const targetRoot = m.target.split('.')[0]!;
      if (this.c.fields.has(targetRoot) || this.c.lists.has(targetRoot)) this.edge(targetRoot, [...deps, ...extraDeps]);
    });
  }

  /** Procura ciclos no grafo e reporta o caminho de cada um. */
  cycles() {
    const state = new Map<string, 1 | 2>();
    const stack: string[] = [];
    const visit = (n: string) => {
      state.set(n, 1);
      stack.push(n);
      for (const d of this.deps.get(n) ?? []) {
        if (d === n && this.c.lists.has(n)) continue; // lista lendo outro item dela mesma: permitido
        const s = state.get(d);
        if (s === 1) {
          const cycle = [...stack.slice(stack.indexOf(d)), d];
          this.issue(`dependencias`, `Dependência circular: ${cycle.join(' → ')}`);
        } else if (s === undefined) {
          visit(d);
        }
      }
      stack.pop();
      state.set(n, 2);
    };
    for (const n of this.deps.keys()) if (!state.has(n)) visit(n);
  }
}

function uniqueIds(ids: string[], path: string, issue: (p: string, m: string) => void) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) issue(path, `Id repetido: ${id}`);
    seen.add(id);
  }
}

/** Valida e indexa um template. Nunca lança: devolve a lista de problemas. */
export function compileTemplate(input: unknown): { compiled?: CompiledTemplate; issues: TemplateIssue[] } {
  const parsed = TemplateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  const t = parsed.data;
  const c: CompiledTemplate = {
    template: t,
    fields: new Map(t.fields.map((f) => [f.id, f])),
    lists: new Map(t.lists.map((l) => [l.id, l])),
    catalogs: new Map(t.catalogs.map((x) => [x.id, x])),
    rolls: new Map(t.rolls.map((r) => [r.id, r])),
    conditions: new Map(t.conditions.map((x) => [x.id, x])),
    inventoryFields: new Map((t.inventory?.fields ?? []).map((f) => [f.id, f])),
  };
  const k = new Compiler(c);
  const issue = k.issue.bind(k);

  // Ids únicos e reservados.
  uniqueIds([...t.fields.map((f) => f.id), ...t.lists.map((l) => l.id)], 'fields', issue);
  for (const id of [...c.fields.keys(), ...c.lists.keys()]) {
    if ((RESERVED_IDS as readonly string[]).includes(id)) issue(`fields.${id}`, `"${id}" é um nome reservado`);
  }
  uniqueIds(t.catalogs.map((x) => x.id), 'catalogs', issue);
  uniqueIds(t.rolls.map((x) => x.id), 'rolls', issue);
  uniqueIds(t.conditions.map((x) => x.id), 'conditions', issue);
  uniqueIds(t.validations.map((x) => x.id), 'validations', issue);
  for (const ifield of c.inventoryFields.keys()) {
    if ((ITEM_BASE_FIELDS as readonly string[]).includes(ifield)) issue(`inventory.fields.${ifield}`, `"${ifield}" já é campo base do item`);
  }

  // Campos.
  for (const f of t.fields) {
    const p = `fields.${f.id}`;
    switch (f.type) {
      case 'computed':
        k.edge(f.id, k.formula(f.formula, `${p}.formula`).roots);
        break;
      case 'number':
        k.edge(f.id, [...k.formula(f.min, `${p}.min`).roots, ...k.formula(f.max, `${p}.max`).roots]);
        break;
      case 'resource':
        k.edge(f.id, [...k.formula(f.max, `${p}.max`).roots, ...k.formula(f.min, `${p}.min`).roots]);
        break;
      case 'select':
        if (f.catalog && !c.catalogs.has(f.catalog)) issue(`${p}.catalog`, `Catálogo inexistente: ${f.catalog}`);
        if (!f.catalog && !f.options?.length) issue(p, 'Seleção sem opções nem catálogo');
        break;
      default:
        break;
    }
  }

  // Listas.
  for (const l of t.lists) {
    const p = `lists.${l.id}`;
    uniqueIds(l.fields.map((f) => f.id), `${p}.fields`, issue);
    uniqueIds((l.defaultItems ?? []).map((x) => x.key), `${p}.defaultItems`, issue);
    for (const item of l.defaultItems ?? []) {
      if (l.fields.some((f) => f.id === item.key)) issue(`${p}.defaultItems.${item.key}`, 'A chave de um item não pode ser igual a um subcampo');
    }
    if (l.titleField && !l.fields.some((f) => f.id === l.titleField)) issue(`${p}.titleField`, `Subcampo inexistente: ${l.titleField}`);
    for (const f of l.fields) {
      if (f.type === 'computed') k.edge(l.id, k.formula(f.formula, `${p}.${f.id}.formula`, { self: l }).roots);
      if (f.type === 'select' && f.catalog && !c.catalogs.has(f.catalog)) issue(`${p}.${f.id}.catalog`, `Catálogo inexistente: ${f.catalog}`);
    }
  }

  // Inventário.
  if (t.inventory) {
    for (const f of t.inventory.fields) {
      if (f.type === 'computed') issue(`inventory.fields.${f.id}`, 'Campos de item não podem ser calculados');
    }
    for (const key of ['loadField', 'capacityField'] as const) {
      const id = t.inventory[key];
      if (id && !c.fields.has(id)) issue(`inventory.${key}`, `Campo inexistente: ${id}`);
    }
  }

  // Catálogos e condições: modificadores.
  const catalogFields = new Map<string, string[]>();
  for (const f of t.fields) {
    if (f.type === 'select' && f.catalog) catalogFields.set(f.catalog, [...(catalogFields.get(f.catalog) ?? []), f.id]);
  }
  for (const cat of t.catalogs) {
    uniqueIds(cat.options.map((o) => o.id), `catalogs.${cat.id}.options`, issue);
    for (const o of cat.options) k.modifiers(o.modifiers, `catalogs.${cat.id}.${o.id}`, catalogFields.get(cat.id) ?? []);
  }
  for (const cond of t.conditions) k.modifiers(cond.modifiers, `conditions.${cond.id}`);

  // Rolagens.
  for (const r of t.rolls) {
    const p = `rolls.${r.id}`;
    const list = r.list ? c.lists.get(r.list) : undefined;
    if (r.list && !list) issue(`${p}.list`, `Lista inexistente: ${r.list}`);
    const scope: Scope = { roll: true, ...(list ? { self: list } : {}) };
    k.formula(r.expr, `${p}.expr`, scope);
    interpolations(r.label).forEach((src) => k.formula(src, `${p}.label`, { ...scope, roll: false }));
  }
  if (t.initiative && !c.rolls.has(t.initiative)) issue('initiative', `Rolagem inexistente: ${t.initiative}`);

  // Validações.
  for (const v of t.validations) {
    k.formula(v.when, `validations.${v.id}.when`);
    interpolations(v.message).forEach((src) => k.formula(src, `validations.${v.id}.message`));
  }

  // Layout e assistente.
  const placeable = (id: string) =>
    c.fields.has(id) || c.lists.has(id) || id === '$inventory' || id === '$conditions' || id === '$notes' || id.startsWith('$rolls');
  t.layout.tabs.forEach((tab) =>
    tab.sections.forEach((s) =>
      s.items.forEach((id) => {
        if (!placeable(id)) issue(`layout.${tab.id}.${s.id}`, `Item inexistente no layout: ${id}`);
      }),
    ),
  );
  t.wizard?.steps.forEach((s) =>
    s.items.forEach((id) => {
      if (!placeable(id)) issue(`wizard.${s.id}`, `Item inexistente no assistente: ${id}`);
    }),
  );

  // Criação: atributos existem e são números; rolagens e conversões são válidas.
  const attrs = t.creation?.attributes;
  if (attrs) {
    for (const f of attrs.fields) {
      const def = c.fields.get(f);
      if (!def || def.type !== 'number') issue(`creation.attributes.fields`, `${f} precisa ser um campo numérico`);
    }
    uniqueIds(attrs.methods.map((m) => m.id), 'creation.attributes.methods', issue);
    for (const m of attrs.methods) {
      const p = `creation.attributes.methods.${m.id}`;
      if (m.kind === 'pointBuy') {
        if (m.min > m.max) issue(p, 'min maior que max');
        for (let v = m.min; v <= m.max; v++) if (!(String(v) in m.cost)) issue(`${p}.cost`, `Falta o custo do valor ${v}`);
        if (!(String(m.base) in m.cost)) issue(`${p}.cost`, `Falta o custo do valor de partida ${m.base}`);
      }
      if (m.kind === 'roll') {
        try {
          parse(m.expr);
        } catch (e) {
          issue(`${p}.expr`, (e as Error).message);
        }
        if (m.convert) {
          try {
            walk(parse(m.convert), (n) => {
              if (n.type === 'ref' && (n.path.length !== 1 || n.path[0] !== 'valor')) issue(`${p}.convert`, 'A conversão só pode usar @valor');
              if (n.type === 'dice') issue(`${p}.convert`, 'A conversão não rola dados');
            });
          } catch (e) {
            issue(`${p}.convert`, (e as Error).message);
          }
        }
      }
    }
  }

  k.cycles();
  return { compiled: c, issues: k.issues };
}

/** Como compileTemplate, mas lança EngineError('template-invalid') se houver qualquer problema. */
export function loadTemplate(input: unknown): CompiledTemplate {
  const { compiled, issues } = compileTemplate(input);
  if (!compiled || issues.length) {
    const summary = issues.slice(0, 5).map((i) => `${i.path}: ${i.message}`).join('; ');
    throw new EngineError('template-invalid', `Template inválido (${issues.length} problema(s)): ${summary}`, { issues });
  }
  return compiled;
}
