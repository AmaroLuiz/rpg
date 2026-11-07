import { z } from 'zod';

/** Identificador de campo: letras (com acento), números e "_", começando por letra. */
export const Id = z
  .string()
  .regex(/^[A-Za-zÀ-ɏ][\wÀ-ɏ]*$/, 'Use letras, números e "_", começando por letra');

const Formula = z.string().min(1, 'Fórmula vazia');
const NumOrFormula = z.union([z.number(), Formula]);
const Primitive = z.union([z.number(), z.string(), z.boolean(), z.null()]);

export const ModifierSchema = z.object({
  /** Campo afetado: id de campo, "lista.chave.subcampo" ou alvo virtual lido com mod("alvo"). */
  target: z.string().min(1),
  op: z.enum(['add', 'set', 'max', 'min']).default('add'),
  value: NumOrFormula,
  /** Fórmula opcional: o modificador só vale quando ela é verdadeira. */
  when: Formula.optional(),
  label: z.string().optional(),
});

const base = {
  id: Id,
  label: z.string().min(1),
  description: z.string().optional(),
};

const NumberField = z.object({
  ...base,
  type: z.literal('number'),
  default: z.number().optional(),
  min: NumOrFormula.optional(),
  max: NumOrFormula.optional(),
  step: z.number().positive().optional(),
});

const TextField = z.object({
  ...base,
  type: z.enum(['text', 'longtext']),
  default: z.string().optional(),
});

const SelectField = z.object({
  ...base,
  type: z.literal('select'),
  options: z.array(z.object({ value: z.union([z.string(), z.number()]), label: z.string() })).optional(),
  /** Id de um catálogo: as opções vêm dele e o valor guardado é o id da opção. */
  catalog: Id.optional(),
  default: z.union([z.string(), z.number()]).optional(),
});

const CheckboxField = z.object({
  ...base,
  type: z.literal('checkbox'),
  default: z.boolean().optional(),
});

const ResourceField = z.object({
  ...base,
  type: z.literal('resource'),
  max: NumOrFormula,
  /** Valor mínimo do atual (padrão 0). Ordem Paranormal, por exemplo, não usa negativo; outros sistemas sim. */
  min: NumOrFormula.optional(),
  allowTemp: z.boolean().optional(),
  color: z.string().optional(),
});

const ComputedField = z.object({
  ...base,
  type: z.literal('computed'),
  formula: Formula,
  format: z.enum(['number', 'text', 'percent', 'signed']).optional(),
});

const ImageField = z.object({ ...base, type: z.literal('image') });

export const FieldSchema = z.discriminatedUnion('type', [
  NumberField,
  TextField,
  SelectField,
  CheckboxField,
  ResourceField,
  ComputedField,
  ImageField,
]);

/** Subcampos de lista não podem ser recurso nem imagem. */
const SubFieldSchema = z.discriminatedUnion('type', [NumberField, TextField, SelectField, CheckboxField, ComputedField]);

const ListItemSchema = z.object({ key: Id }).catchall(Primitive);

export const ListSchema = z.object({
  ...base,
  fields: z.array(SubFieldSchema).min(1),
  /** Itens que toda ficha nova já começa tendo (ex.: a lista de perícias). */
  defaultItems: z.array(ListItemSchema).optional(),
  /** Subcampo usado como nome do item na tela. */
  titleField: Id.optional(),
  /** Se o jogador pode adicionar e remover itens (padrão true). */
  editable: z.boolean().optional(),
});

export const CatalogSchema = z.object({
  ...base,
  options: z.array(
    z.object({
      id: Id,
      label: z.string().min(1),
      description: z.string().optional(),
      /** Dados expostos às fórmulas: @classe.pvInicial, option("classe").pvInicial. */
      values: z.record(z.string(), Primitive).optional(),
      modifiers: z.array(ModifierSchema).optional(),
    }),
  ),
});

export const RollSchema = z.object({
  id: Id,
  /** Rótulo; aceita fórmulas entre chaves, como "Teste de {@self.nome}". */
  label: z.string().min(1),
  expr: Formula,
  /** Rolagem por item de lista (uma por perícia, por ataque). Dentro dela, @self é o item. */
  list: Id.optional(),
  category: z.string().optional(),
});

export const ConditionSchema = z.object({
  ...base,
  modifiers: z.array(ModifierSchema).optional(),
});

export const ValidationSchema = z.object({
  id: Id,
  /** Quando esta fórmula é verdadeira, a ficha mostra a mensagem. Nunca bloqueia. */
  when: Formula,
  /** Mensagem; aceita fórmulas entre chaves. */
  message: z.string().min(1),
  level: z.enum(['warning', 'info']).default('warning'),
});

const SectionSchema = z.object({
  id: Id,
  label: z.string(),
  collapsible: z.boolean().optional(),
  /** Ids de campos ou listas, ou blocos especiais: "$inventory", "$conditions", "$rolls:<categoria>". */
  items: z.array(z.string()),
});

export const LayoutSchema = z.object({
  tabs: z.array(z.object({ id: Id, label: z.string(), sections: z.array(SectionSchema) })).min(1),
});

export const WizardSchema = z.object({
  steps: z.array(
    z.object({ id: Id, label: z.string(), description: z.string().optional(), items: z.array(z.string()).min(1) }),
  ),
});

export const InventorySchema = z.object({
  /** Subcampos extras de cada item (espaços, categoria, dano…). Base: nome, quantidade, equipado. */
  fields: z.array(SubFieldSchema).default([]),
  /** Campo calculado com a carga atual e campo com a capacidade, para a barra de carga. */
  loadField: Id.optional(),
  capacityField: Id.optional(),
});

export const TemplateSchema = z.object({
  id: Id,
  name: z.string().min(1),
  /** Versão do template; fichas guardam a versão com que foram criadas. */
  version: z.number().int().positive(),
  locale: z.string().default('pt-BR'),
  description: z.string().optional(),
  fields: z.array(FieldSchema).min(1),
  lists: z.array(ListSchema).default([]),
  catalogs: z.array(CatalogSchema).default([]),
  rolls: z.array(RollSchema).default([]),
  conditions: z.array(ConditionSchema).default([]),
  inventory: InventorySchema.optional(),
  validations: z.array(ValidationSchema).default([]),
  /** Id da rolagem usada como iniciativa no combate. */
  initiative: Id.optional(),
  layout: LayoutSchema,
  wizard: WizardSchema.optional(),
});

export type Modifier = z.infer<typeof ModifierSchema>;
export type FieldDef = z.infer<typeof FieldSchema>;
export type SubFieldDef = z.infer<typeof SubFieldSchema>;
export type ListDef = z.infer<typeof ListSchema>;
export type CatalogDef = z.infer<typeof CatalogSchema>;
export type CatalogOption = CatalogDef['options'][number];
export type RollDef = z.infer<typeof RollSchema>;
export type ConditionDef = z.infer<typeof ConditionSchema>;
export type ValidationDef = z.infer<typeof ValidationSchema>;
export type Template = z.infer<typeof TemplateSchema>;
export type TemplateInput = z.input<typeof TemplateSchema>;
