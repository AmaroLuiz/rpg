import type { Node } from './ast.js';
import { interpolations, type CompiledTemplate } from './compile.js';
import type { CharacterData, InventoryItem, Primitive, ResourceValue } from './data.js';
import type { DiceGroupResult } from './dice.js';
import { EngineError } from './errors.js';
import { evaluateNode, type EvalContext, type Evaluation } from './evaluator.js';
import { parse } from './parser.js';
import type { Rng } from './rng.js';
import type { FieldDef, ListDef, Modifier, SubFieldDef } from './template.js';
import { format, isRecord, toNumber, truthy, type Value } from './values.js';

export interface ModifierSource {
  kind: 'item' | 'condition' | 'option';
  id: string;
  label: string;
}

export interface AppliedModifier {
  source: ModifierSource;
  op: Modifier['op'];
  value: number;
  label?: string;
}

export interface FieldResult {
  value: Value;
  /** Valor antes dos modificadores (digitado ou da fórmula). */
  base: Value;
  modifiers: AppliedModifier[];
  error?: string;
}

export interface ResourceResult {
  atual: number;
  max: number;
  min: number;
  temp: number;
  /** Modificadores aplicados ao máximo. */
  modifiers: AppliedModifier[];
  error?: string;
}

export interface SheetWarning {
  id: string;
  message: string;
  level: 'warning' | 'info';
}

export interface ComputedListItem {
  key: string;
  values: Record<string, FieldResult>;
}

export interface ComputedSheet {
  fields: Record<string, FieldResult>;
  resources: Record<string, ResourceResult>;
  lists: Record<string, ComputedListItem[]>;
  warnings: SheetWarning[];
  errors: Array<{ path: string; message: string }>;
}

export interface RollOptions {
  rng: Rng;
  /** Item da lista, para rolagens por item (ex.: perícia "luta"). */
  itemKey?: string;
  /** Dados extras ou a menos (+1d20 / −1d20), lidos pelo template em @rolagem.dados. */
  dados?: number;
  /** Bônus situacional decidido pela mesa; somado ao total. */
  bonus?: number;
}

export interface RollResult {
  rollId: string | null;
  itemKey?: string;
  label: string;
  expression: string;
  total: number;
  /** Ex.: "3d20kh1 [(7), 18, (2)] + 5 + 2 (situacional)". */
  text: string;
  dice: DiceGroupResult[];
  bonus: number;
}

interface ModInstance extends Modifier {
  source: ModifierSource;
}

interface Scope {
  self?: { list: ListDef; key: string };
  roll?: { dados: number; bonus: number };
}

type Memo<T> = { busy: true } | { busy: false; value: T };

const RESOURCE_KEYS = { atual: 'atual', max: 'max', temp: 'temp' } as const;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Ficha calculada sob demanda. Cada campo é calculado uma vez, quando alguém o lê,
 * e guardado; isso dá a ordem topológica de graça e acusa ciclos em tempo de execução.
 * Crie um Sheet novo a cada mudança nos dados (é barato).
 */
export class Sheet {
  private readonly memo = new Map<string, Memo<unknown>>();
  private readonly mods = new Map<string, ModInstance[]>();
  private readonly itemRecords: Array<Record<string, Value>>;

  constructor(
    readonly compiled: CompiledTemplate,
    readonly data: CharacterData,
    readonly items: InventoryItem[] = [],
  ) {
    this.collectModifiers();
    const invFields = compiled.template.inventory?.fields ?? [];
    this.itemRecords = items.map((it) => {
      const rec: Record<string, Value> = { id: it.id, nome: it.nome, quantidade: it.quantidade, equipado: it.equipado };
      for (const f of invFields) rec[f.id] = it.data?.[f.id] ?? defaultOf(f);
      return rec;
    });
  }

  // ---------- modificadores ----------

  private addMod(m: Modifier, source: ModifierSource) {
    const list = this.mods.get(m.target) ?? [];
    list.push({ ...m, source });
    this.mods.set(m.target, list);
  }

  private collectModifiers() {
    const { template, conditions, catalogs } = this.compiled;
    // Ordem de exibição: escolhas (classe, origem), depois itens, depois condições.
    for (const f of template.fields) {
      if (f.type !== 'select' || !f.catalog) continue;
      const chosen = this.data.values[f.id] ?? f.default;
      const opt = catalogs.get(f.catalog)?.options.find((o) => o.id === chosen);
      opt?.modifiers?.forEach((m) => this.addMod(m, { kind: 'option', id: opt.id, label: `${f.label}: ${opt.label}` }));
    }
    for (const it of this.items) {
      if (!it.equipado) continue;
      it.modifiers?.forEach((m) => this.addMod(m, { kind: 'item', id: it.id, label: it.nome }));
    }
    for (const id of this.data.conditions) {
      const cond = conditions.get(id);
      cond?.modifiers?.forEach((m) => this.addMod(m, { kind: 'condition', id, label: cond.label }));
    }
  }

  private applyMods(target: string, base: Value): FieldResult {
    const list = this.mods.get(target);
    if (!list?.length) return { value: base, base, modifiers: [] };
    const applied: AppliedModifier[] = [];
    for (const m of list) {
      if (m.when !== undefined && !truthy(this.eval(m.when).value)) continue;
      const v = typeof m.value === 'number' ? m.value : toNumber(this.eval(m.value).value, `modificador de ${target}`);
      applied.push({ source: m.source, op: m.op, value: v, ...(m.label ? { label: m.label } : {}) });
    }
    let value = toNumber(base, target);
    const sets = applied.filter((a) => a.op === 'set');
    if (sets.length) value = sets.at(-1)!.value;
    for (const a of applied) if (a.op === 'add') value += a.value;
    for (const a of applied) if (a.op === 'max') value = Math.max(value, a.value);
    for (const a of applied) if (a.op === 'min') value = Math.min(value, a.value);
    return { value, base, modifiers: applied };
  }

  /** Soma dos modificadores "add" de um alvo virtual (que não é campo), ex.: mod("ataque"). */
  mod(target: string): number {
    return this.cached(`m:${target}`, () => {
      let sum = 0;
      for (const m of this.mods.get(target) ?? []) {
        if (m.op !== 'add') continue;
        if (m.when !== undefined && !truthy(this.eval(m.when).value)) continue;
        sum += typeof m.value === 'number' ? m.value : toNumber(this.eval(m.value).value, `mod("${target}")`);
      }
      return sum;
    });
  }

  // ---------- memo e ciclos ----------

  private cached<T>(key: string, fn: () => T): T {
    const hit = this.memo.get(key) as Memo<T> | undefined;
    if (hit) {
      if (hit.busy) throw new EngineError('cycle', `Dependência circular envolvendo ${describeKey(key)}`, { key });
      return hit.value;
    }
    this.memo.set(key, { busy: true });
    try {
      const value = fn();
      this.memo.set(key, { busy: false, value });
      return value;
    } catch (e) {
      this.memo.delete(key);
      throw e;
    }
  }

  /** Como `cached`, mas um erro vira resultado com `error` em vez de propagar. */
  private safeField(key: string, fn: () => FieldResult): FieldResult {
    try {
      return this.cached(key, fn);
    } catch (e) {
      const result: FieldResult = { value: null, base: null, modifiers: [], error: errorMessage(e) };
      this.memo.set(key, { busy: false, value: result });
      return result;
    }
  }

  // ---------- campos ----------

  field(id: string): FieldResult {
    const def = this.compiled.fields.get(id);
    if (!def) throw new EngineError('unknown-ref', `Campo desconhecido @${id}`, { id });
    return this.safeField(`f:${id}`, () => this.computeField(def));
  }

  private computeField(def: FieldDef): FieldResult {
    const raw = this.data.values[def.id];
    switch (def.type) {
      case 'number':
        return this.applyMods(def.id, toNumber(asPrimitive(raw) ?? def.default ?? 0, def.label));
      case 'computed': {
        const base = this.eval(def.formula).value;
        return typeof base === 'number' || this.mods.has(def.id) ? this.applyMods(def.id, base) : { value: base, base, modifiers: [] };
      }
      case 'resource': {
        const r = this.resource(def.id);
        if (r.error) throw new EngineError('dependency', r.error);
        return { value: r.atual, base: r.atual, modifiers: [] };
      }
      default: {
        const v = asPrimitive(raw) ?? defaultOf(def);
        return { value: v, base: v, modifiers: [] };
      }
    }
  }

  resource(id: string): ResourceResult {
    const def = this.compiled.fields.get(id);
    if (!def || def.type !== 'resource') throw new EngineError('unknown-ref', `Recurso desconhecido @${id}`, { id });
    try {
      return this.cached(`r:${id}`, () => {
        const maxBase = typeof def.max === 'number' ? def.max : toNumber(this.eval(def.max).value, `${def.label} máximo`);
        const maxed = this.applyMods(id, maxBase);
        const max = toNumber(maxed.value);
        const min = def.min === undefined ? 0 : typeof def.min === 'number' ? def.min : toNumber(this.eval(def.min).value);
        const raw = this.data.values[id];
        const stored: ResourceValue = isRecord(raw as Value) ? (raw as ResourceValue) : typeof raw === 'number' ? { atual: raw } : {};
        return { atual: stored.atual ?? max, max, min, temp: stored.temp ?? 0, modifiers: maxed.modifiers };
      });
    } catch (e) {
      const r: ResourceResult = { atual: 0, max: 0, min: 0, temp: 0, modifiers: [], error: errorMessage(e) };
      this.memo.set(`r:${id}`, { busy: false, value: r });
      return r;
    }
  }

  // ---------- listas ----------

  listKeys(listId: string): string[] {
    const stored = this.data.lists[listId];
    if (stored) return stored.order.filter((k) => k in stored.items);
    return (this.compiled.lists.get(listId)?.defaultItems ?? []).map((i) => i.key);
  }

  private rawItem(listId: string, key: string): Record<string, Primitive> | undefined {
    const stored = this.data.lists[listId];
    if (stored) return stored.items[key];
    const d = this.compiled.lists.get(listId)?.defaultItems?.find((i) => i.key === key);
    if (!d) return undefined;
    const { key: _k, ...rest } = d;
    return rest;
  }

  subfield(listId: string, key: string, subId: string): FieldResult {
    const list = this.compiled.lists.get(listId);
    const def = list?.fields.find((f) => f.id === subId);
    if (!list || !def) throw new EngineError('unknown-ref', `Subcampo desconhecido @${listId}.${subId}`);
    const raw = this.rawItem(listId, key);
    if (!raw) throw new EngineError('unknown-ref', `Item "${key}" não existe na lista ${list.label}`);
    return this.safeField(`s:${listId}:${key}:${subId}`, () => {
      const target = `${listId}.${key}.${subId}`;
      if (def.type === 'computed') {
        const base = this.eval(def.formula, { self: { list, key } }).value;
        return typeof base === 'number' ? this.applyMods(target, base) : { value: base, base, modifiers: [] };
      }
      if (def.type === 'number') return this.applyMods(target, toNumber(raw[subId] ?? def.default ?? 0, def.label));
      const v = raw[subId] ?? defaultOf(def);
      return { value: v, base: v, modifiers: [] };
    });
  }

  private itemRecord(list: ListDef, key: string): Record<string, Value> {
    const rec: Record<string, Value> = { key };
    for (const f of list.fields) rec[f.id] = this.subValue(list.id, key, f.id);
    return rec;
  }

  private subValue(listId: string, key: string, subId: string): Value {
    const r = this.subfield(listId, key, subId);
    if (r.error) throw new EngineError('dependency', `Depende de @${listId}.${key}.${subId}, que tem erro: ${r.error}`);
    return r.value;
  }

  listItems(listId: string): ComputedListItem[] {
    const list = this.compiled.lists.get(listId);
    if (!list) throw new EngineError('unknown-ref', `Lista desconhecida ${listId}`);
    return this.listKeys(listId).map((key) => ({
      key,
      values: Object.fromEntries(list.fields.map((f) => [f.id, this.subfield(listId, key, f.id)])),
    }));
  }

  // ---------- avaliação ----------

  private fieldValue(id: string): Value {
    const r = this.field(id);
    if (r.error) throw new EngineError('dependency', `Depende de @${id}, que tem erro: ${r.error}`);
    return r.value;
  }

  private option(fieldId: string): Value {
    const def = this.compiled.fields.get(fieldId);
    if (!def || def.type !== 'select' || !def.catalog) {
      throw new EngineError('bad-argument', `option("${fieldId}"): o campo precisa ser uma seleção ligada a um catálogo`);
    }
    const chosen = this.fieldValue(fieldId);
    const opt = this.compiled.catalogs.get(def.catalog)?.options.find((o) => o.id === chosen);
    if (!opt) return null;
    return { id: opt.id, label: opt.label, ...(opt.values ?? {}) };
  }

  private resolve(path: string[], scope: Scope): Value {
    const [root, a, b] = path;
    const rest = (v: Value, from: number) => path.slice(from).reduce<Value>((cur, seg) => member(cur, seg, path), v);

    if (root === 'self') {
      if (!scope.self) throw new EngineError('unknown-ref', '@self só existe dentro de listas');
      const { list, key } = scope.self;
      if (a === undefined) return this.itemRecord(list, key);
      if (a === 'key') return key;
      return rest(this.subValue(list.id, key, a), 2);
    }
    if (root === 'rolagem') {
      if (!scope.roll) throw new EngineError('unknown-ref', '@rolagem só existe em rolagens');
      if (a !== 'dados' && a !== 'bonus') throw new EngineError('unknown-ref', `@rolagem.${a} não existe`);
      return scope.roll[a];
    }
    if (root === 'itens') return rest(this.itemRecords, 1);

    const def = this.compiled.fields.get(root!);
    if (def) {
      if (def.type === 'resource') {
        if (a === undefined) return this.fieldValue(root!);
        const r = this.resource(root!);
        if (r.error) throw new EngineError('dependency', `Depende de @${root}, que tem erro: ${r.error}`);
        const part = RESOURCE_KEYS[a as keyof typeof RESOURCE_KEYS];
        if (!part) throw new EngineError('unknown-ref', `@${path.join('.')}: recursos aceitam .atual, .max ou .temp`);
        return r[part];
      }
      if (a !== undefined && def.type === 'select' && def.catalog) {
        // Sem opção escolhida, qualquer dado da opção vale vazio (0 em contas).
        const opt = this.option(root!);
        return opt === null ? null : rest(opt, 1);
      }
      return rest(this.fieldValue(root!), 1);
    }

    const list = this.compiled.lists.get(root!);
    if (list) {
      const keys = this.listKeys(list.id);
      if (a === undefined) return keys.map((k) => this.itemRecord(list, k));
      if (list.fields.some((f) => f.id === a)) return rest(keys.map((k) => this.subValue(list.id, k, a)), 2);
      if (b === undefined) return this.itemRecord(list, a);
      return rest(this.subValue(list.id, a, b), 3);
    }
    throw new EngineError('unknown-ref', `Campo desconhecido @${path.join('.')}`, { path });
  }

  private context(scope: Scope, rng?: Rng): EvalContext {
    return {
      ...(rng ? { rng } : {}),
      ref: (path) => this.resolve(path, scope),
      call: (name, args) => {
        switch (name) {
          case 'mod':
            return this.mod(String(args[0]));
          case 'option':
            return this.option(String(args[0]));
          case 'field':
            return this.fieldValue(String(args[0]));
          case 'condition':
            return this.data.conditions.includes(String(args[0]));
          default:
            return undefined;
        }
      },
    };
  }

  private eval(source: string | Node, scope: Scope = {}, rng?: Rng): Evaluation {
    return evaluateNode(typeof source === 'string' ? parse(source) : source, this.context(scope, rng));
  }

  /** Avalia uma fórmula qualquer contra esta ficha (para a prévia do editor e o rolador livre). */
  evaluate(source: string, opts: { rng?: Rng; itemOf?: { list: string; key: string } } = {}): Evaluation {
    const scope: Scope = {};
    if (opts.itemOf) {
      const list = this.compiled.lists.get(opts.itemOf.list);
      if (!list) throw new EngineError('unknown-ref', `Lista desconhecida ${opts.itemOf.list}`);
      scope.self = { list, key: opts.itemOf.key };
    }
    return this.eval(source, scope, opts.rng);
  }

  /** Substitui "{fórmula}" num texto pelo valor calculado. */
  interpolate(text: string, scope: Scope = {}): string {
    let out = text;
    for (const src of interpolations(text)) {
      let v: string;
      try {
        v = format(this.eval(src, scope).value);
      } catch {
        v = '?';
      }
      out = out.replace(`{${src}}`, v);
    }
    return out;
  }

  // ---------- rolagens ----------

  roll(rollId: string, opts: RollOptions): RollResult {
    const def = this.compiled.rolls.get(rollId);
    if (!def) throw new EngineError('unknown-ref', `Rolagem desconhecida: ${rollId}`);
    const scope: Scope = { roll: { dados: opts.dados ?? 0, bonus: opts.bonus ?? 0 } };
    if (def.list) {
      const list = this.compiled.lists.get(def.list)!;
      if (!opts.itemKey) throw new EngineError('bad-argument', `A rolagem ${def.label} precisa de um item da lista ${list.label}`);
      if (!this.rawItem(def.list, opts.itemKey)) throw new EngineError('unknown-ref', `Item "${opts.itemKey}" não existe na lista ${list.label}`);
      scope.self = { list, key: opts.itemKey };
    }
    const label = this.interpolate(def.label, scope);
    return this.finishRoll(def.expr, scope, opts, rollId, label);
  }

  /** Rolagem livre digitada pelo jogador (ex.: "2d6+@for"), com acesso aos campos da ficha. */
  rollExpression(expr: string, opts: RollOptions & { label?: string }): RollResult {
    const scope: Scope = { roll: { dados: opts.dados ?? 0, bonus: opts.bonus ?? 0 } };
    return this.finishRoll(expr, scope, opts, null, opts.label ?? expr);
  }

  private finishRoll(expr: string, scope: Scope, opts: RollOptions, rollId: string | null, label: string): RollResult {
    const node = parse(expr);
    const ev = this.eval(node, scope, opts.rng);
    let total = toNumber(ev.value, 'resultado da rolagem');
    let text = ev.text;
    const bonus = opts.bonus ?? 0;
    if (bonus !== 0 && !expr.includes('@rolagem.bonus')) {
      total += bonus;
      text += ` ${bonus > 0 ? '+' : '−'} ${Math.abs(bonus)} (situacional)`;
    }
    return {
      rollId,
      ...(opts.itemKey ? { itemKey: opts.itemKey } : {}),
      label,
      expression: expr,
      total,
      text,
      dice: ev.dice,
      bonus,
    };
  }

  // ---------- validação e foto completa ----------

  warnings(): SheetWarning[] {
    const out: SheetWarning[] = [];
    for (const f of this.compiled.template.fields) {
      if (f.type === 'number' && (f.min !== undefined || f.max !== undefined)) {
        const r = this.field(f.id);
        if (r.error || typeof r.base !== 'number') continue;
        const lim = (x: string | number) => (typeof x === 'number' ? x : toNumber(this.eval(x).value));
        try {
          if (f.min !== undefined && r.base < lim(f.min)) out.push({ id: `${f.id}.min`, level: 'warning', message: `${f.label} está abaixo do mínimo (${lim(f.min)})` });
          if (f.max !== undefined && r.base > lim(f.max)) out.push({ id: `${f.id}.max`, level: 'warning', message: `${f.label} está acima do máximo (${lim(f.max)})` });
        } catch {
          /* limite com erro aparece em errors */
        }
      }
      if (f.type === 'resource') {
        const r = this.resource(f.id);
        if (!r.error && r.atual > r.max) out.push({ id: `${f.id}.max`, level: 'info', message: `${f.label} está acima do máximo (${r.max})` });
        if (!r.error && r.atual < r.min) out.push({ id: `${f.id}.min`, level: 'warning', message: `${f.label} está abaixo do mínimo (${r.min})` });
      }
    }
    for (const v of this.compiled.template.validations) {
      try {
        if (truthy(this.eval(v.when).value)) out.push({ id: v.id, level: v.level, message: this.interpolate(v.message) });
      } catch {
        /* validação que depende de campo com erro é ignorada */
      }
    }
    return out;
  }

  snapshot(): ComputedSheet {
    const fields: ComputedSheet['fields'] = {};
    const resources: ComputedSheet['resources'] = {};
    const lists: ComputedSheet['lists'] = {};
    const errors: ComputedSheet['errors'] = [];
    for (const f of this.compiled.template.fields) {
      fields[f.id] = this.field(f.id);
      if (fields[f.id]!.error) errors.push({ path: f.id, message: fields[f.id]!.error! });
      if (f.type === 'resource') resources[f.id] = this.resource(f.id);
    }
    for (const l of this.compiled.template.lists) {
      lists[l.id] = this.listItems(l.id);
      for (const item of lists[l.id]!) {
        for (const [sub, r] of Object.entries(item.values)) if (r.error) errors.push({ path: `${l.id}.${item.key}.${sub}`, message: r.error });
      }
    }
    return { fields, resources, lists, warnings: this.warnings(), errors };
  }
}

function member(obj: Value, prop: string, path: string[]): Value {
  if (Array.isArray(obj)) return obj.map((x) => member(x, prop, path));
  if (isRecord(obj) && prop in obj) return obj[prop]!;
  throw new EngineError('unknown-ref', `@${path.join('.')}: não existe ".${prop}"`, { path });
}

function asPrimitive(v: unknown): Primitive | undefined {
  if (v === undefined) return undefined;
  if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  return undefined;
}

function defaultOf(def: FieldDef | SubFieldDef): Primitive {
  if ('default' in def && def.default !== undefined) return def.default;
  if (def.type === 'checkbox') return false;
  if (def.type === 'number') return 0;
  return null;
}

function describeKey(key: string): string {
  const [kind, ...rest] = key.split(':');
  if (kind === 'm') return `mod("${rest.join(':')}")`;
  return `@${rest.join('.')}`;
}

/** Atalho: calcula a ficha inteira de uma vez. */
export function computeSheet(compiled: CompiledTemplate, data: CharacterData, items: InventoryItem[] = []): ComputedSheet {
  return new Sheet(compiled, data, items).snapshot();
}

/** Rolagem livre sem ficha (ex.: rolador da mesa). */
export function rollExpression(expr: string, rng: Rng, label?: string): RollResult {
  const ev = evaluateNode(parse(expr), {
    rng,
    ref: (path) => {
      throw new EngineError('unknown-ref', `@${path.join('.')}: rolagem livre não tem ficha`);
    },
  });
  return { rollId: null, label: label ?? expr, expression: expr, total: toNumber(ev.value, 'resultado'), text: ev.text, dice: ev.dice, bonus: 0 };
}
