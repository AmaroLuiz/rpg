import { applyOps, compileTemplate, fixedRng, newCharacterData, Sheet, type CharacterData, type InventoryItem } from '@rpg/engine';
import { describe, expect, it } from 'vitest';
import { builtinTemplate, builtinTemplates } from '../src/index.js';

function character(id: 'ordem_paranormal' | 'tormenta20', values: CharacterData['values'], extra: Partial<CharacterData> = {}) {
  const tpl = builtinTemplate(id);
  const base = newCharacterData(tpl);
  return { tpl, data: { ...base, ...extra, values: { ...base.values, ...values } } };
}

describe.each(Object.keys(builtinTemplates) as Array<keyof typeof builtinTemplates>)('template %s', (id) => {
  it('é válido', () => {
    expect(compileTemplate(builtinTemplates[id]).issues).toEqual([]);
  });

  it('ficha nova calcula sem erros', () => {
    const tpl = builtinTemplate(id);
    const snap = new Sheet(tpl, newCharacterData(tpl)).snapshot();
    expect(snap.errors).toEqual([]);
    expect(snap.warnings.map((w) => w.id)).toContain('sem_classe');
  });
});

describe('Ordem Paranormal: Combatente NEX 15%', () => {
  // Personagem de referência feito à mão: AGI 2, FOR 3, INT 1, PRE 1, VIG 2.
  const { tpl, data } = character('ordem_paranormal', { classe: 'combatente', nex: 15, agi: 2, for: 3, int: 1, pre: 1, vig: 2 });
  const treinado = applyOps(data, [{ op: 'set', path: ['lists', 'pericias', 'items', 'luta', 'grau'], value: 5 }]);

  it('recursos e derivados', () => {
    const s = new Sheet(tpl, treinado);
    expect(s.field('nivelNex').value).toBe(3);
    expect(s.resource('pv').max).toBe(34); // 20 + 2 + 2 × (4 + 2)
    expect(s.resource('pe').max).toBe(9); // 2 + 1 + 2 × (2 + 1)
    expect(s.resource('san').max).toBe(18); // 12 + 2 × 3
    expect(s.field('defesa').value).toBe(12);
    expect(s.field('limitePE').value).toBe(3);
    expect(s.field('dtRitual').value).toBe(14);
    expect(s.field('capacidade').value).toBe(15);
    expect(s.warnings().map((w) => w.id)).toEqual([]);
  });

  it('teste de Luta rola 3d20, fica com o maior e soma o treino', () => {
    const r = new Sheet(tpl, treinado).roll('pericia', { rng: fixedRng([4, 17, 9]), itemKey: 'luta' });
    expect(r.label).toBe('Luta');
    expect(r.total).toBe(22);
    expect(r.text).toBe('3d20kh1 [(4), 17, (9)] + 5');
  });

  it('atributo 0 rola 2d20 e fica com o menor', () => {
    const { tpl: t, data: d } = character('ordem_paranormal', { classe: 'combatente', int: 0, agi: 3, for: 3, pre: 1, vig: 2 });
    const r = new Sheet(t, d).roll('pericia', { rng: fixedRng([15, 6]), itemKey: 'ciencias' });
    expect(r.total).toBe(6);
    expect(r.dice[0]!.notation).toBe('2d20kl1');
  });

  it('dados extras e condições mudam a quantidade de dados', () => {
    const extra = new Sheet(tpl, treinado).roll('pericia', { rng: fixedRng([1, 2, 3, 20]), itemKey: 'luta', dados: 1 });
    expect(extra.dice[0]!.notation).toBe('4d20kh1');
    const abalado = new Sheet(tpl, { ...treinado, conditions: ['abalado'] });
    expect(abalado.roll('pericia', { rng: fixedRng([5, 9]), itemKey: 'luta' }).dice[0]!.notation).toBe('2d20kh1');
    const desprevenido = new Sheet(tpl, { ...treinado, conditions: ['desprevenido'] });
    expect(desprevenido.field('defesa').value).toBe(7);
    expect(desprevenido.subfield('pericias', 'reflexos', 'dados').value).toBe(1);
  });

  it('proteção equipada soma na Defesa e ocupa espaço', () => {
    const items: InventoryItem[] = [
      { id: 'a', nome: 'Proteção leve', quantidade: 1, equipado: true, data: { espacos: 2 }, modifiers: [{ target: 'defesa', op: 'add', value: 5 }] },
      { id: 'b', nome: 'Pistola', quantidade: 1, equipado: true, data: { espacos: 1 } },
    ];
    const s = new Sheet(tpl, treinado, items);
    expect(s.field('defesa').value).toBe(17);
    expect(s.field('carga').value).toBe(3);
  });

  it('ataque e dano a partir da arma', () => {
    const armado = applyOps(treinado, [
      { op: 'set', path: ['lists', 'ataques'], value: { order: ['faca'], items: { faca: { nome: 'Faca', pericia: 'luta', bonusAtaque: 0, dano: '1d4 + @for' } } } },
    ]);
    const s = new Sheet(tpl, armado);
    expect(s.roll('ataque', { rng: fixedRng([2, 11, 8]), itemKey: 'faca' }).total).toBe(16);
    const dano = s.roll('dano', { rng: fixedRng([3]), itemKey: 'faca' });
    expect(dano.total).toBe(6);
    expect(dano.text).toBe('1d4 [3] + 3');
  });

  it('avisa na criação, sem bloquear', () => {
    const { tpl: t, data: d } = character('ordem_paranormal', { classe: 'ocultista', agi: 4, for: 1, int: 1, pre: 1, vig: 1 });
    const ids = new Sheet(t, d).warnings().map((w) => w.message);
    expect(ids).toContain('Na criação (NEX 5%), nenhum atributo passa de 3.');
    expect(ids).toContain('Na criação, os atributos somam 9 (todos em 1 mais 4 pontos); agora somam 8.');
  });
});

describe('Tormenta20: Guerreiro nível 5', () => {
  // FOR 3, DES 2, CON 2, INT 0, SAB 1, CAR −1. Luta treinada.
  const { tpl, data } = character('tormenta20', { classe: 'guerreiro', nivel: 5, for: 3, des: 2, con: 2, int: 0, sab: 1, car: -1 });
  const d = applyOps(data, [{ op: 'set', path: ['lists', 'pericias', 'items', 'luta', 'treinado'], value: true }]);

  it('recursos e perícias', () => {
    const s = new Sheet(tpl, d);
    expect(s.resource('pv').max).toBe(50); // 20 + 2 + 4 × (5 + 2)
    expect(s.resource('pm').max).toBe(15); // 3 × 5
    expect(s.field('defesa').value).toBe(12);
    expect(s.subfield('pericias', 'luta', 'bonus').value).toBe(7); // 2 + 3 + 2
    expect(s.subfield('pericias', 'reflexos', 'bonus').value).toBe(4); // 2 + 2
    expect(s.field('capacidade').value).toBe(16);
  });

  it('treino sobe para +4 no nível 7', () => {
    const s = new Sheet(tpl, applyOps(d, [{ op: 'set', path: ['values', 'nivel'], value: 7 }]));
    expect(s.subfield('pericias', 'luta', 'bonus').value).toBe(10); // 3 + 3 + 4
  });

  it('desprevenido e abalado', () => {
    const s = new Sheet(tpl, { ...d, conditions: ['desprevenido', 'abalado'] });
    expect(s.field('defesa').value).toBe(7);
    expect(s.subfield('pericias', 'reflexos', 'bonus').value).toBe(-1);
    const r = s.roll('pericia', { rng: fixedRng([10]), itemKey: 'luta' });
    expect(r.total).toBe(10 + 7 - 2);
  });

  it('dano sofrido via operação inc e PV negativo até −10 sem aviso', () => {
    const ferido = applyOps(d, [{ op: 'set', path: ['values', 'pv'], value: { atual: 50 } }, { op: 'inc', path: ['values', 'pv', 'atual'], by: -55 }]);
    const s = new Sheet(tpl, ferido);
    expect(s.resource('pv').atual).toBe(-5);
    expect(s.warnings().filter((w) => w.id.startsWith('pv'))).toEqual([]);
  });
});
