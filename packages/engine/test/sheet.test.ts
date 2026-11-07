import { describe, expect, it } from 'vitest';
import {
  applyOps,
  compileTemplate,
  fixedRng,
  loadTemplate,
  newCharacterData,
  Sheet,
  type CharacterData,
  type InventoryItem,
  type TemplateInput,
} from '../src/index.js';

/** Template mínimo de d20 usado para testar o motor sem depender dos templates reais. */
const mini: TemplateInput = {
  id: 'mini',
  name: 'Mini d20',
  version: 1,
  fields: [
    { id: 'nivel', label: 'Nível', type: 'number', default: 1, min: 1, max: 20 },
    { id: 'for', label: 'Força', type: 'number', default: 10 },
    { id: 'des', label: 'Destreza', type: 'number', default: 10 },
    { id: 'mod_for', label: 'Mod. Força', type: 'computed', formula: 'floor((@for - 10) / 2)' },
    { id: 'mod_des', label: 'Mod. Destreza', type: 'computed', formula: 'floor((@des - 10) / 2)' },
    { id: 'classe', label: 'Classe', type: 'select', catalog: 'classes' },
    { id: 'defesa', label: 'Defesa', type: 'computed', formula: '10 + @mod_des' },
    { id: 'pv', label: 'PV', type: 'resource', max: '@classe.pv + @mod_for * @nivel' },
    { id: 'carga', label: 'Carga', type: 'computed', formula: 'sum(@itens.peso * @itens.quantidade)' },
    { id: 'capacidade', label: 'Capacidade', type: 'computed', formula: '10 + 2 * @for' },
  ],
  lists: [
    {
      id: 'pericias',
      label: 'Perícias',
      titleField: 'nome',
      fields: [
        { id: 'nome', label: 'Nome', type: 'text' },
        { id: 'atributo', label: 'Atributo', type: 'select', options: [{ value: 'mod_for', label: 'FOR' }, { value: 'mod_des', label: 'DES' }] },
        { id: 'treinado', label: 'Treinado', type: 'checkbox' },
        { id: 'bonus', label: 'Bônus', type: 'computed', formula: 'field(@self.atributo) + (@self.treinado ? 2 : 0)' },
      ],
      defaultItems: [
        { key: 'luta', nome: 'Luta', atributo: 'mod_for', treinado: true },
        { key: 'furtividade', nome: 'Furtividade', atributo: 'mod_des', treinado: false },
      ],
    },
  ],
  catalogs: [
    {
      id: 'classes',
      label: 'Classes',
      options: [
        { id: 'guerreiro', label: 'Guerreiro', values: { pv: 20 }, modifiers: [{ target: 'defesa', value: 1, label: 'Guarda' }] },
        { id: 'mago', label: 'Mago', values: { pv: 8 } },
      ],
    },
  ],
  conditions: [
    { id: 'desprevenido', label: 'Desprevenido', modifiers: [{ target: 'defesa', value: -5 }] },
    { id: 'abalado', label: 'Abalado', modifiers: [{ target: 'teste', value: -2 }] },
  ],
  rolls: [
    { id: 'pericia', label: 'Teste de {@self.nome}', list: 'pericias', expr: '1d20 + @self.bonus + mod("teste")' },
    { id: 'iniciativa', label: 'Iniciativa', expr: '1d20 + @mod_des' },
  ],
  inventory: {
    fields: [{ id: 'peso', label: 'Peso', type: 'number', default: 1 }],
    loadField: 'carga',
    capacityField: 'capacidade',
  },
  validations: [{ id: 'sobrecarga', when: '@carga > @capacidade', message: 'Sobrecarregado: {@carga} de {@capacidade}' }],
  initiative: 'iniciativa',
  layout: { tabs: [{ id: 'principal', label: 'Principal', sections: [{ id: 's', label: 'Tudo', items: ['nivel', 'for', 'des', 'defesa', 'pv', 'pericias', '$inventory'] }] }] },
};

const tpl = loadTemplate(mini);

function sheet(values: CharacterData['values'] = {}, extra: Partial<CharacterData> = {}, items: InventoryItem[] = []) {
  const base = newCharacterData(tpl);
  return new Sheet(tpl, { ...base, ...extra, values: { ...base.values, ...values } }, items);
}

describe('validação de template', () => {
  it('aceita o template de teste', () => {
    expect(compileTemplate(mini).issues).toEqual([]);
  });

  it('acusa referência desconhecida, função inexistente e dados em campo', () => {
    const bad = structuredClone(mini) as typeof mini;
    bad.fields = [
      ...bad.fields,
      { id: 'x', label: 'X', type: 'computed', formula: '@naoexiste + foo(1)' },
      { id: 'y', label: 'Y', type: 'computed', formula: '1d6' },
    ];
    const msgs = compileTemplate(bad).issues.map((i) => i.message);
    expect(msgs).toContain('@naoexiste: campo desconhecido');
    expect(msgs).toContain('Função desconhecida "foo"');
    expect(msgs).toContain('Dados só podem aparecer em rolagens');
  });

  it('acusa ciclo com o caminho', () => {
    const bad = structuredClone(mini) as typeof mini;
    bad.fields = [
      ...bad.fields,
      { id: 'a', label: 'A', type: 'computed', formula: '@b + 1' },
      { id: 'b', label: 'B', type: 'computed', formula: '@a + 1' },
    ];
    const msgs = compileTemplate(bad).issues.map((i) => i.message);
    expect(msgs.some((m) => m.includes('Dependência circular') && m.includes('a → b → a'))).toBe(true);
  });

  it('acusa erros de esquema e ids repetidos', () => {
    const bad = structuredClone(mini) as typeof mini;
    bad.fields = [...bad.fields, { id: 'for', label: 'Dup', type: 'number' }];
    expect(compileTemplate(bad).issues.map((i) => i.message)).toContain('Id repetido: for');
    expect(compileTemplate({ id: 'x' }).issues.length).toBeGreaterThan(0);
    expect(() => loadTemplate({ id: 'x' })).toThrow(/Template inválido/);
  });
});

describe('cálculo da ficha', () => {
  it('calcula campos derivados e recursos', () => {
    const s = sheet({ for: 14, des: 16, nivel: 3, classe: 'guerreiro' });
    expect(s.field('mod_for').value).toBe(2);
    expect(s.field('defesa').value).toBe(14); // 10 + 3 + 1 (Guarda)
    const pv = s.resource('pv');
    expect(pv.max).toBe(26); // 20 + 2 * 3
    expect(pv.atual).toBe(26); // sem valor guardado, começa cheio
  });

  it('mostra a origem de cada modificador', () => {
    const s = sheet({ des: 12, classe: 'guerreiro' }, { conditions: ['desprevenido'] });
    const def = s.field('defesa');
    expect(def.base).toBe(11);
    expect(def.value).toBe(7);
    expect(def.modifiers.map((m) => `${m.source.kind}:${m.source.label}:${m.value}`)).toEqual([
      'option:Classe: Guerreiro:1',
      'condition:Desprevenido:-5',
    ]);
  });

  it('itens equipados aplicam modificadores e entram na carga', () => {
    const items: InventoryItem[] = [
      { id: 'i1', nome: 'Armadura de couro', quantidade: 1, equipado: true, data: { peso: 4 }, modifiers: [{ target: 'defesa', op: 'add', value: 2 }] },
      { id: 'i2', nome: 'Escudo guardado', quantidade: 1, equipado: false, data: { peso: 3 }, modifiers: [{ target: 'defesa', op: 'add', value: 1 }] },
      { id: 'i3', nome: 'Flechas', quantidade: 20, equipado: false, data: { peso: 0.1 } },
    ];
    const s = sheet({ des: 10 }, {}, items);
    expect(s.field('defesa').value).toBe(12);
    expect(s.field('carga').value).toBeCloseTo(9);
  });

  it('listas: subcampos calculados, projeção e referência por chave', () => {
    const s = sheet({ for: 16, des: 8 });
    expect(s.subfield('pericias', 'luta', 'bonus').value).toBe(5);
    expect(s.subfield('pericias', 'furtividade', 'bonus').value).toBe(-1);
    expect(s.evaluate('@pericias.luta.bonus').value).toBe(5);
    expect(s.evaluate('sum(@pericias.bonus)').value).toBe(4);
  });

  it('avisa sem bloquear', () => {
    const items: InventoryItem[] = [{ id: 'p', nome: 'Pedra', quantidade: 50, equipado: false, data: { peso: 1 } }];
    const w = sheet({ nivel: 25, for: 10 }, {}, items).warnings();
    expect(w.map((x) => x.message)).toEqual(['Nível está acima do máximo (20)', 'Sobrecarregado: 50 de 30']);
  });

  it('erro numa fórmula fica no campo e nos dependentes, não derruba a ficha', () => {
    const t = loadTemplate({
      ...mini,
      fields: [...mini.fields, { id: 'divide', label: 'D', type: 'computed', formula: '10 / (@for - 10)' }, { id: 'usa', label: 'U', type: 'computed', formula: '@divide + 1' }],
    });
    const snap = new Sheet(t, newCharacterData(t)).snapshot();
    expect(snap.fields.divide!.error).toBe('Divisão por zero');
    expect(snap.fields.usa!.error).toMatch(/Depende de @divide/);
    expect(snap.fields.defesa!.value).toBe(10);
  });

  it('ciclo criado por item em tempo de execução vira erro no campo', () => {
    const items: InventoryItem[] = [{ id: 'x', nome: 'Amuleto estranho', quantidade: 1, equipado: true, modifiers: [{ target: 'mod_des', op: 'add', value: '@defesa' }] }];
    const s = sheet({}, {}, items);
    expect(s.field('defesa').error).toMatch(/circular|Depende/);
  });
});

describe('rolagens a partir da ficha', () => {
  it('rola perícia com rótulo, bônus, condição e situacional', () => {
    const s = sheet({ for: 16 }, { conditions: ['abalado'] });
    const r = s.roll('pericia', { rng: fixedRng([12]), itemKey: 'luta', bonus: 2 });
    expect(r.label).toBe('Teste de Luta');
    expect(r.total).toBe(12 + 5 - 2 + 2);
    expect(r.text).toBe('1d20 [12] + 5 + -2 + 2 (situacional)');
  });

  it('exige item em rolagem por lista', () => {
    expect(() => sheet().roll('pericia', { rng: fixedRng([1]) })).toThrow(/precisa de um item/);
  });

  it('rolagem livre usa os campos da ficha', () => {
    const r = sheet({ for: 18 }).rollExpression('2d6 + @mod_for', { rng: fixedRng([3, 4]) });
    expect(r.total).toBe(11);
  });
});

describe('operações de escrita', () => {
  it('set, inc e unset por caminho, sem alterar o original', () => {
    const d0 = newCharacterData(tpl);
    const d1 = applyOps(d0, [
      { op: 'set', path: ['values', 'pv'], value: { atual: 10 } },
      { op: 'inc', path: ['values', 'pv', 'atual'], by: -3 },
      { op: 'set', path: ['lists', 'pericias', 'items', 'luta', 'treinado'], value: false },
      { op: 'unset', path: ['values', 'nivel'] },
    ]);
    expect(d1.values.pv).toEqual({ atual: 7 });
    expect(d1.lists.pericias!.items.luta!.treinado).toBe(false);
    expect('nivel' in d1.values).toBe(false);
    expect(d0.values.pv).toBeUndefined();
    expect(new Sheet(tpl, d1).resource('pv').atual).toBe(7);
  });
});
