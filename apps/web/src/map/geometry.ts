/**
 * Contas do mapa (grid quadrado), sem React: células, régua, áreas de efeito, névoa e posições livres.
 * Coordenadas "de imagem" são pixels da imagem de fundo; "de célula" são colunas/linhas (podem ter fração).
 */

export interface Grid {
  cell_px: number;
  offset_x: number;
  offset_y: number;
  cols: number;
  rows: number;
  cell_meters: number;
  diagonal: 'alternate' | 'equal';
}

export interface Cell {
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export type AreaShape = 'circle' | 'cone' | 'line';

/** Abertura do cone, em graus (um quarto de círculo). */
export const CONE_ANGLE = 90;

export const inGrid = (g: Pick<Grid, 'cols' | 'rows'>, c: Cell) => c.x >= 0 && c.y >= 0 && c.x < g.cols && c.y < g.rows;

/** Ponto da imagem → posição em células (com fração). */
export const toCellSpace = (g: Grid, p: Point): Point => ({ x: (p.x - g.offset_x) / g.cell_px, y: (p.y - g.offset_y) / g.cell_px });

/** Posição em células → ponto da imagem. */
export const toImageSpace = (g: Grid, p: Point): Point => ({ x: g.offset_x + p.x * g.cell_px, y: g.offset_y + p.y * g.cell_px });

/** Célula sob um ponto da imagem, ou null se fora do grid. */
export function cellAt(g: Grid, p: Point): Cell | null {
  const c = toCellSpace(g, p);
  const cell = { x: Math.floor(c.x), y: Math.floor(c.y) };
  return inGrid(g, cell) ? cell : null;
}

/** Retângulo (na imagem) de um token/célula de tamanho `size`. */
export function cellRect(g: Grid, c: Cell, size = 1) {
  const o = toImageSpace(g, c);
  return { x: o.x, y: o.y, w: g.cell_px * size, h: g.cell_px * size };
}

/** Canto superior esquerdo para um token de tamanho `size` solto em `p`, sempre dentro do grid. */
export function snapToken(g: Grid, p: Point, size: number): Cell {
  const c = toCellSpace(g, p);
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  return { x: clamp(Math.round(c.x - size / 2), g.cols - size), y: clamp(Math.round(c.y - size / 2), g.rows - size) };
}

/** Distância em quadrados entre duas células, pela regra de diagonal do mapa. */
export function distanceCells(a: Cell, b: Cell, rule: Grid['diagonal']): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const diag = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diag;
  // alternate: a cada duas diagonais, uma conta em dobro (1, 2, 1, 2…)
  return rule === 'equal' ? diag + straight : diag + Math.floor(diag / 2) + straight;
}

export const distanceMeters = (g: Grid, a: Cell, b: Cell) => distanceCells(a, b, g.diagonal) * g.cell_meters;

/** Formata metros como na mesa: "4,5 m". */
export const formatMeters = (m: number) => `${(Math.round(m * 10) / 10).toLocaleString('pt-BR')} m`;

/**
 * Células atingidas por uma área. `origin` e `target` em espaço de célula.
 * - circle: centro em `origin`, raio `sizeM`;
 * - cone: do `origin` na direção de `target`, comprimento `sizeM`, abertura CONE_ANGLE;
 * - line: do `origin` na direção de `target`, comprimento `sizeM`, 1 quadrado de largura.
 * Uma célula conta se o centro dela está dentro da forma.
 */
export function areaCells(g: Grid, shape: AreaShape, origin: Point, target: Point, sizeM: number): Cell[] {
  const r = sizeM / g.cell_meters;
  const dirX = target.x - origin.x;
  const dirY = target.y - origin.y;
  const len = Math.hypot(dirX, dirY);
  const ux = len > 0 ? dirX / len : 1;
  const uy = len > 0 ? dirY / len : 0;
  const cosHalf = Math.cos(((CONE_ANGLE / 2) * Math.PI) / 180);
  const eps = 1e-9;
  const out: Cell[] = [];
  const x0 = Math.max(0, Math.floor(origin.x - r - 1));
  const x1 = Math.min(g.cols - 1, Math.ceil(origin.x + r + 1));
  const y0 = Math.max(0, Math.floor(origin.y - r - 1));
  const y1 = Math.min(g.rows - 1, Math.ceil(origin.y + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const vx = x + 0.5 - origin.x;
      const vy = y + 0.5 - origin.y;
      const d = Math.hypot(vx, vy);
      let hit = false;
      if (shape === 'circle') hit = d <= r + eps;
      else if (shape === 'cone') hit = d > eps && d <= r + eps && (vx * ux + vy * uy) / d >= cosHalf - eps;
      else {
        const along = vx * ux + vy * uy;
        const across = Math.abs(vx * uy - vy * ux);
        hit = along >= -eps && along <= r + eps && across <= 0.5 + eps;
      }
      if (hit) out.push({ x, y });
    }
  }
  return out;
}

/** Tokens que encostam em alguma das células. */
export function tokensInCells<T extends { x: number; y: number; size: number }>(tokens: T[], cells: Cell[]): T[] {
  const set = new Set(cells.map((c) => `${c.x},${c.y}`));
  return tokens.filter((t) => {
    for (let dy = 0; dy < t.size; dy++) for (let dx = 0; dx < t.size; dx++) if (set.has(`${t.x + dx},${t.y + dy}`)) return true;
    return false;
  });
}

// ---------- névoa: texto com um '0'/'1' por célula, linha a linha ----------

export const fogIndex = (g: Pick<Grid, 'cols'>, c: Cell) => c.y * g.cols + c.x;

export const isRevealed = (g: Pick<Grid, 'cols'>, fog: string, c: Cell) => fog[fogIndex(g, c)] === '1';

/** Revela (`on`) ou cobre um quadrado de `brush` células centrado em `c`. Devolve a névoa nova. */
export function paintFog(g: Pick<Grid, 'cols' | 'rows'>, fog: string, c: Cell, on: boolean, brush = 1): string {
  const total = g.cols * g.rows;
  const chars = fog.padEnd(total, '0').slice(0, total).split('');
  const half = Math.floor((brush - 1) / 2);
  for (let y = c.y - half; y < c.y - half + brush; y++) {
    for (let x = c.x - half; x < c.x - half + brush; x++) {
      if (inGrid(g, { x, y })) chars[y * g.cols + x] = on ? '1' : '0';
    }
  }
  return chars.join('');
}

export const fillFog = (g: Pick<Grid, 'cols' | 'rows'>, on: boolean) => (on ? '1' : '0').repeat(g.cols * g.rows);

/** Igual ao private.token_visible do banco: névoa desligada ou alguma célula do token revelada. */
export function tokenVisible(g: Pick<Grid, 'cols' | 'rows'> & { fog_enabled: boolean; fog: string }, t: { x: number; y: number; size: number }): boolean {
  if (!g.fog_enabled) return true;
  for (let dy = 0; dy < t.size; dy++) {
    for (let dx = 0; dx < t.size; dx++) {
      if (t.x + dx < g.cols && isRevealed(g, g.fog, { x: t.x + dx, y: t.y + dy })) return true;
    }
  }
  return false;
}

/**
 * Posições livres para `sizes.length` tokens, procurando em espiral a partir de `near`.
 * Usado em "colocar todos do combate". Devolve menos posições se o mapa encher.
 */
export function freeSpots(g: Pick<Grid, 'cols' | 'rows'>, occupied: Array<{ x: number; y: number; size: number }>, sizes: number[], near: Cell): Cell[] {
  const taken = new Set<string>();
  const mark = (t: { x: number; y: number; size: number }) => {
    for (let dy = 0; dy < t.size; dy++) for (let dx = 0; dx < t.size; dx++) taken.add(`${t.x + dx},${t.y + dy}`);
  };
  occupied.forEach(mark);
  const fits = (x: number, y: number, size: number) => {
    if (x < 0 || y < 0 || x + size > g.cols || y + size > g.rows) return false;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (taken.has(`${x + dx},${y + dy}`)) return false;
    return true;
  };
  const out: Cell[] = [];
  const maxR = Math.max(g.cols, g.rows);
  for (const size of sizes) {
    let found: Cell | null = null;
    for (let r = 0; r <= maxR && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (fits(near.x + dx, near.y + dy, size)) found = { x: near.x + dx, y: near.y + dy };
        }
      }
    }
    if (!found) break;
    mark({ ...found, size });
    out.push(found);
  }
  return out;
}

/** Tira pontos quase repetidos de um traço e limita o total (o banco aceita até ~64 KB por marca). */
export function simplifyStroke(points: Point[], minDist = 3, max = 2000): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let last: Point | null = null;
  for (const p of points) {
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < minDist) continue;
    out.push([Math.round(p.x), Math.round(p.y)]);
    last = p;
  }
  if (out.length <= max) return out;
  const step = out.length / max;
  return Array.from({ length: max }, (_, i) => out[Math.floor(i * step)]!);
}
