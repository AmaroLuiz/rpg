import { describe, expect, it } from 'vitest';
import {
  areaCells,
  cellAt,
  distanceCells,
  distanceMeters,
  fillFog,
  formatMeters,
  freeSpots,
  isRevealed,
  paintFog,
  simplifyStroke,
  snapToken,
  tokenVisible,
  tokensInCells,
  type Grid,
} from '../src/map/geometry';

const g: Grid = { cell_px: 50, offset_x: 10, offset_y: 20, cols: 10, rows: 8, cell_meters: 1.5, diagonal: 'alternate' };
const key = (cells: Array<{ x: number; y: number }>) => cells.map((c) => `${c.x},${c.y}`).sort();

describe('células', () => {
  it('acha a célula sob o ponto, respeitando o deslocamento do grid', () => {
    expect(cellAt(g, { x: 10, y: 20 })).toEqual({ x: 0, y: 0 });
    expect(cellAt(g, { x: 59, y: 69 })).toEqual({ x: 0, y: 0 });
    expect(cellAt(g, { x: 60, y: 70 })).toEqual({ x: 1, y: 1 });
    expect(cellAt(g, { x: 5, y: 30 })).toBeNull();
    expect(cellAt(g, { x: 10 + 50 * 10, y: 30 })).toBeNull();
  });

  it('token solto encaixa na célula e não sai do grid', () => {
    expect(snapToken(g, { x: 10 + 125, y: 20 + 75 }, 1)).toEqual({ x: 2, y: 1 });
    expect(snapToken(g, { x: 10 + 100, y: 20 + 100 }, 2)).toEqual({ x: 1, y: 1 });
    expect(snapToken(g, { x: 10000, y: -50 }, 3)).toEqual({ x: 7, y: 0 });
  });
});

describe('régua', () => {
  it('diagonal alternada conta 1, 2, 1, 2…', () => {
    expect(distanceCells({ x: 0, y: 0 }, { x: 1, y: 1 }, 'alternate')).toBe(1);
    expect(distanceCells({ x: 0, y: 0 }, { x: 2, y: 2 }, 'alternate')).toBe(3);
    expect(distanceCells({ x: 0, y: 0 }, { x: 4, y: 4 }, 'alternate')).toBe(6);
    expect(distanceCells({ x: 0, y: 0 }, { x: 5, y: 2 }, 'alternate')).toBe(6);
  });

  it('diagonal igual conta sempre 1', () => {
    expect(distanceCells({ x: 0, y: 0 }, { x: 4, y: 4 }, 'equal')).toBe(4);
    expect(distanceCells({ x: 3, y: 1 }, { x: 0, y: 0 }, 'equal')).toBe(3);
  });

  it('converte em metros', () => {
    expect(distanceMeters(g, { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(4.5);
    expect(formatMeters(4.5)).toBe('4,5 m');
    expect(formatMeters(9)).toBe('9 m');
  });
});

describe('áreas de efeito', () => {
  it('círculo de 1,5 m no centro de uma célula pega a cruz', () => {
    const cells = areaCells(g, 'circle', { x: 4.5, y: 4.5 }, { x: 4.5, y: 4.5 }, 1.5);
    expect(key(cells)).toEqual(key([{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 5, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 5 }]));
  });

  it('círculo na esquina pega o quadrado 2x2 em volta', () => {
    const cells = areaCells(g, 'circle', { x: 4, y: 4 }, { x: 4, y: 4 }, 1.5);
    expect(key(cells)).toEqual(key([{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }]));
  });

  it('linha vai na direção do alvo, com 1 de largura', () => {
    const cells = areaCells(g, 'line', { x: 0.5, y: 2.5 }, { x: 9, y: 2.5 }, 4.5);
    expect(key(cells)).toEqual(key([{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }]));
  });

  it('cone abre para o lado do alvo e não pega a própria célula', () => {
    const cells = areaCells(g, 'cone', { x: 0.5, y: 4.5 }, { x: 5, y: 4.5 }, 3);
    const k = key(cells);
    expect(k).toContain('1,4');
    expect(k).toContain('2,4');
    expect(k).toContain('1,3');
    expect(k).not.toContain('2,3'); // centro a mais de 2 quadrados (3 m)
    expect(k).not.toContain('0,4');
    expect(cells.every((c) => c.x >= 1)).toBe(true);
  });

  it('acha os tokens atingidos, inclusive os grandes', () => {
    const tokens = [
      { id: 'a', x: 0, y: 0, size: 1 },
      { id: 'b', x: 2, y: 2, size: 2 },
    ];
    expect(tokensInCells(tokens, [{ x: 3, y: 3 }]).map((t) => t.id)).toEqual(['b']);
    expect(tokensInCells(tokens, [{ x: 5, y: 5 }])).toEqual([]);
  });
});

describe('névoa', () => {
  const small = { cols: 4, rows: 3 };
  it('revela e cobre com pincel, completando a névoa curta', () => {
    let fog = paintFog(small, '', { x: 1, y: 1 }, true, 3);
    expect(fog).toBe('111011101110');
    fog = paintFog(small, fog, { x: 0, y: 0 }, false);
    expect(fog).toBe('011011101110');
    expect(isRevealed(small, fog, { x: 1, y: 0 })).toBe(true);
    expect(isRevealed(small, fog, { x: 3, y: 0 })).toBe(false);
    expect(fillFog(small, true)).toBe('111111111111');
  });

  it('token aparece se alguma célula dele está revelada (como no banco)', () => {
    const map = { ...small, fog_enabled: true, fog: '000000000001' };
    expect(tokenVisible(map, { x: 0, y: 0, size: 1 })).toBe(false);
    expect(tokenVisible(map, { x: 2, y: 1, size: 2 })).toBe(true);
    expect(tokenVisible({ ...map, fog_enabled: false }, { x: 0, y: 0, size: 1 })).toBe(true);
  });
});

describe('posições livres e traços', () => {
  it('coloca tokens em volta do ponto sem sobrepor', () => {
    const spots = freeSpots({ cols: 5, rows: 5 }, [{ x: 2, y: 2, size: 1 }], [1, 1, 2], { x: 2, y: 2 });
    expect(spots).toHaveLength(3);
    expect(spots[0]).not.toEqual({ x: 2, y: 2 });
    const all = new Set(spots.map((s) => `${s.x},${s.y}`));
    expect(all.size).toBe(3);
  });

  it('para quando o mapa enche', () => {
    expect(freeSpots({ cols: 2, rows: 1 }, [], [1, 1, 1], { x: 0, y: 0 })).toHaveLength(2);
  });

  it('simplifica traços', () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ x: i * 0.5, y: 0 }));
    const s = simplifyStroke(pts);
    expect(s.length).toBeLessThan(20);
    expect(simplifyStroke(Array.from({ length: 5000 }, (_, i) => ({ x: i * 10, y: 0 })), 3, 100)).toHaveLength(100);
  });
});
