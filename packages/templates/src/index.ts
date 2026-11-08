import { loadTemplate, type CompiledTemplate, type TemplateInput } from '@rpg/engine';
import ordemParanormalJson from './ordem-paranormal.json' with { type: 'json' };
import tormenta20Json from './tormenta20.json' with { type: 'json' };

/** Templates embutidos, no formato JSON que a mesa pode copiar e editar. */
export const builtinTemplates = {
  ordem_paranormal: ordemParanormalJson as TemplateInput,
  tormenta20: tormenta20Json as TemplateInput,
} as const;

export type BuiltinTemplateId = keyof typeof builtinTemplates;

const compiled = new Map<BuiltinTemplateId, CompiledTemplate>();

/** Template embutido já validado. Lança se o JSON tiver qualquer problema. */
export function builtinTemplate(id: BuiltinTemplateId): CompiledTemplate {
  let c = compiled.get(id);
  if (!c) {
    c = loadTemplate(builtinTemplates[id]);
    compiled.set(id, c);
  }
  return c;
}

export * from './compendium/index.js';
