import { applyOps, newCharacterData, newListKey, Sheet, type CharacterData } from '@rpg/engine';
import { describe, expect, it } from 'vitest';
import { builtinTemplate, compendiumFor, fieldOpsFrom, inventoryItemFrom, listItemFrom, type SheetReader } from '../src/index.js';

const comp = compendiumFor('ordem_paranormal')!;
const tpl = builtinTemplate('ordem_paranormal');

function reader(data: CharacterData): SheetReader {
  const sheet = new Sheet(tpl, data);
  return {
    value: (id) => sheet.field(id).value,
    listOrder: (id) => data.lists[id]?.order ?? [],
    listValue: (list, key, sub) => (data.lists[list]?.items[key] as Record<string, unknown> | undefined)?.[sub],
    newKey: (taken) => newListKey(taken),
  };
}

describe('compêndio de Ordem Paranormal', () => {
  it('tem ids únicos e só tipos conhecidos', () => {
    const ids = comp.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const kinds = new Set(comp.kinds.map((k) => k.id));
    for (const e of comp.entries) {
      expect(kinds.has(e.kind), e.id).toBe(true);
      expect(e.name.trim(), e.id).not.toBe('');
      expect(e.text.trim(), e.id).not.toBe('');
    }
  });

  it('traz o conteúdo do livro', () => {
    const count = (k: string) => comp.entries.filter((e) => e.kind === k).length;
    expect(count('ritual')).toBe(80);
    expect(count('origem')).toBe(24);
    expect(count('trilha')).toBe(15);
    expect(count('arma')).toBe(34);
  });

  it('rituais viram itens válidos da lista de rituais', () => {
    const list = tpl.lists.get('rituais')!;
    const elementos = (list.fields.find((f) => f.id === 'elemento') as { options: Array<{ value: unknown }> }).options.map((o) => o.value);
    for (const e of comp.entries.filter((x) => x.kind === 'ritual')) {
      const item = listItemFrom(e, 'rituais');
      expect(elementos, e.id).toContain(item.elemento);
      expect([1, 2, 3, 4], e.id).toContain(item.circulo);
      expect(item.execucao, e.id).not.toBe('');
    }
  });

  it('armas viram ataques com dano rolável', () => {
    for (const e of comp.entries.filter((x) => x.kind === 'arma')) {
      const atk = listItemFrom(e, 'ataques');
      expect(atk.dano, e.id).toMatch(/^\d+d\d+$/);
      expect(['luta', 'pontaria']).toContain(atk.pericia);
    }
  });

  it('proteção entra no inventário somando Defesa', () => {
    const leve = inventoryItemFrom(comp.entries.find((e) => e.id === 'protecao-leve')!);
    expect(leve.data).toEqual({ espacos: 2, categoria: 1 });
    expect(leve.modifiers).toEqual([{ target: 'defesa', op: 'add', value: 5 }]);
  });

  it('origens apontam para perícias que existem na ficha', () => {
    const pericias = new Set(tpl.lists.get('pericias')!.defaultItems!.map((i) => i.key));
    for (const e of comp.entries.filter((x) => x.kind === 'origem')) {
      for (const s of e.skills ?? []) expect(pericias.has(s), `${e.id}: ${s}`).toBe(true);
    }
  });

  it('escolher a origem treina as perícias e adiciona o poder', () => {
    const data = newCharacterData(tpl);
    const origem = comp.entries.find((e) => e.id === 'origem-militar')!;
    const next = applyOps(data, fieldOpsFrom(origem, 'origem', reader(data)));
    const sheet = new Sheet(tpl, next);
    expect(next.values.origem).toBe('Militar');
    expect(sheet.subfield('pericias', 'pontaria', 'grau').value).toBe(5);
    expect(sheet.subfield('pericias', 'tatica', 'grau').value).toBe(5);
    expect(sheet.listItems('poderes').map((i) => i.values.nome?.value)).toEqual(['Para Bellum']);
    expect(sheet.snapshot().errors).toEqual([]);
    // Escolher de novo não duplica o poder.
    const again = applyOps(next, fieldOpsFrom(origem, 'origem', reader(next)));
    expect(new Sheet(tpl, again).listItems('poderes')).toHaveLength(1);
  });

  it('trilha adiciona só as habilidades até o NEX atual', () => {
    const data = applyOps(newCharacterData(tpl), [{ op: 'set', path: ['values', 'nex'], value: 40 }]);
    const trilha = comp.entries.find((e) => e.id === 'trilha-aniquilador')!;
    const next = applyOps(data, fieldOpsFrom(trilha, 'trilha', reader(data)));
    expect(new Sheet(tpl, next).listItems('poderes').map((i) => i.values.nome?.value)).toEqual(['A Favorita', 'Técnica Secreta']);
  });
});
