import { describe, expect, it } from 'vitest';
import {
  applyOps,
  compileTemplate,
  creationBase,
  creationOps,
  fixedRng,
  loadTemplate,
  newCharacterData,
  pointBuyStatus,
  rollAttribute,
  type PointBuyMethod,
  type RollMethod,
  type TemplateInput,
} from '../src/index.js';

const tpl: TemplateInput = {
  id: 'mini',
  name: 'Mini',
  version: 1,
  fields: [
    { id: 'for', label: 'Força', type: 'number', default: 0 },
    { id: 'des', label: 'Destreza', type: 'number', default: 0 },
    { id: 'con', label: 'Constituição', type: 'number', default: 0 },
  ],
  layout: { tabs: [{ id: 't', label: 'T', sections: [{ id: 's', label: 'S', items: ['for', 'des', 'con'] }] }] },
  creation: {
    attributes: {
      fields: ['for', 'des', 'con'],
      adjustments: { label: 'Raça' },
      methods: [
        { id: 'pontos', label: 'Pontos', kind: 'pointBuy', base: 0, budget: 10, min: -1, max: 4, cost: { '-1': -1, '0': 0, '1': 1, '2': 2, '3': 4, '4': 7 }, maxBelowBase: 1 },
        { id: 'rolar', label: 'Rolar', kind: 'roll', expr: '4d6kh3', convert: 'lookup(@valor, 3, -2, 8, -1, 10, 0, 12, 1, 14, 2, 16, 3, 18, 4)' },
        { id: 'manual', label: 'Manual', kind: 'manual' },
      ],
    },
  },
};
const c = loadTemplate(tpl);
const pts = c.template.creation!.attributes!.methods[0] as PointBuyMethod;
const roll = c.template.creation!.attributes!.methods[1] as RollMethod;
const fields = ['for', 'des', 'con'];

describe('compra de pontos', () => {
  it('soma o custo pela tabela', () => {
    expect(pointBuyStatus(pts, { for: 4, des: 2, con: 1 }, fields)).toMatchObject({ spent: 10, remaining: 0, issues: [] });
  });

  it('avisa quando passa do total ou da regra de atributos baixos, sem bloquear', () => {
    const s = pointBuyStatus(pts, { for: 4, des: 4, con: -1 }, fields);
    expect(s.remaining).toBe(-3);
    expect(s.issues).toEqual(['Pontos demais: 3 acima do total de 10']);
    expect(pointBuyStatus(pts, { for: -1, des: -1, con: 4 }, fields).issues).toEqual(['Só 1 atributo(s) pode(m) ficar abaixo de 0']);
    expect(pointBuyStatus(pts, { for: 9 }, fields).issues[0]).toMatch(/não está na tabela/);
  });
});

describe('rolagem de atributos', () => {
  it('rola 4d6, descarta o menor e converte pela tabela', () => {
    const r = rollAttribute(roll, fixedRng([6, 5, 4, 1]));
    expect(r).toEqual({ total: 15, value: 2, text: '4d6kh3 [6, 5, 4, (1)]' });
  });
});

describe('estado de criação', () => {
  it('grava estado e valores finais (base + ajuste de raça)', () => {
    const ops = creationOps(c, { method: 'pontos', base: { for: 3, des: 2 }, adjust: { for: 1, con: 2 } });
    const data = applyOps(newCharacterData(c), ops);
    expect(data.values).toEqual({ for: 4, des: 2, con: 2 });
    expect(data.creation?.method).toBe('pontos');
  });

  it('rolagens vão para o atributo escolhido; sem rolagem atribuída vale 0', () => {
    const state = { method: 'rolar', rolls: [{ total: 15, value: 2, text: '' }, { total: 9, value: -1, text: '' }], assign: { des: 0, for: 1 } };
    expect(creationBase(c, state)).toEqual({ for: -1, des: 2, con: 0 });
  });

  it('manual não mexe nos valores, só guarda o método', () => {
    const ops = creationOps(c, { method: 'manual' });
    expect(ops).toEqual([{ op: 'set', path: ['creation'], value: { method: 'manual' } }]);
  });

  it('valida o bloco de criação do template', () => {
    const bad = structuredClone(tpl) as typeof tpl;
    bad.creation!.attributes!.fields.push('naoexiste');
    (bad.creation!.attributes!.methods[0] as { cost: Record<string, number> }).cost = { '0': 0 };
    (bad.creation!.attributes!.methods[1] as { convert: string }).convert = '@for + 1';
    const msgs = compileTemplate(bad).issues.map((i) => i.message);
    expect(msgs).toContain('naoexiste precisa ser um campo numérico');
    expect(msgs).toContain('Falta o custo do valor 4');
    expect(msgs).toContain('A conversão só pode usar @valor');
  });
});
