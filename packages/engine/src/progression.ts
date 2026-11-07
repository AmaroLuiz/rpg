import type { CharacterOp, ResourceValue } from './data.js';
import { applyOps } from './data.js';
import { EngineError } from './errors.js';
import { Sheet } from './sheet.js';
import { toNumber } from './values.js';

export interface ChangeSummary {
  ops: CharacterOp[];
  /** O que muda, para mostrar antes de confirmar: [rótulo, antes, depois]. */
  changes: Array<[string, number, number]>;
}

function storedAtual(sheet: Sheet, id: string): number | undefined {
  const v = sheet.data.values[id] as ResourceValue | undefined;
  return typeof v === 'object' && v !== null && typeof v.atual === 'number' ? v.atual : undefined;
}

/** Próximo valor da progressão (nível + 1, ou o próximo NEX da lista); null se já está no fim. */
export function nextProgression(sheet: Sheet): number | null {
  const p = sheet.compiled.template.progression;
  if (!p) return null;
  const cur = toNumber(sheet.field(p.field).base ?? 0);
  let next: number | undefined;
  if (p.values?.length) next = p.values.find((v) => v > cur);
  else next = cur + p.step;
  if (next === undefined || (p.max !== undefined && next > p.max)) return null;
  return next;
}

/**
 * Subir de nível: grava o novo valor e soma ao atual de cada recurso o quanto o máximo cresceu
 * (quem estava com 10/20 e passa a ter máximo 26 fica com 16/26). Recurso sem valor guardado já está cheio.
 */
export function levelUp(sheet: Sheet): ChangeSummary {
  const p = sheet.compiled.template.progression;
  if (!p) throw new EngineError('bad-argument', 'Este template não tem evolução');
  const next = nextProgression(sheet);
  if (next === null) throw new EngineError('bad-argument', 'Já está no valor máximo');
  const label = sheet.compiled.fields.get(p.field)!.label;
  const before = toNumber(sheet.field(p.field).base ?? 0);
  const ops: CharacterOp[] = [{ op: 'set', path: ['values', p.field], value: next }];
  const changes: ChangeSummary['changes'] = [[label, before, next]];
  const after = new Sheet(sheet.compiled, applyOps(sheet.data, ops), sheet.items);
  for (const f of sheet.compiled.template.fields) {
    if (f.type !== 'resource') continue;
    const a = sheet.resource(f.id);
    const b = after.resource(f.id);
    if (a.error || b.error || a.max === b.max) continue;
    changes.push([`${f.label} (máx.)`, a.max, b.max]);
    const atual = storedAtual(sheet, f.id);
    if (atual !== undefined) ops.push({ op: 'set', path: ['values', f.id, 'atual'], value: atual + (b.max - a.max) });
  }
  return { ops, changes };
}

/** Descanso: recupera os recursos pela regra do template, sem passar do máximo. */
export function rest(sheet: Sheet, restId: string): ChangeSummary {
  const r = sheet.compiled.template.rests.find((x) => x.id === restId);
  if (!r) throw new EngineError('unknown-ref', `Descanso desconhecido: ${restId}`);
  const ops: CharacterOp[] = [];
  const changes: ChangeSummary['changes'] = [];
  for (const x of r.restore) {
    const res = sheet.resource(x.resource);
    if (res.error) continue;
    const gain = x.amount === 'full' ? res.max - res.atual : typeof x.amount === 'number' ? x.amount : toNumber(sheet.evaluate(x.amount).value);
    const target = Math.max(res.atual, Math.min(res.max, res.atual + gain));
    if (target === res.atual) continue;
    ops.push({ op: 'set', path: ['values', x.resource, 'atual'], value: target });
    changes.push([sheet.compiled.fields.get(x.resource)!.label, res.atual, target]);
  }
  return { ops, changes };
}
