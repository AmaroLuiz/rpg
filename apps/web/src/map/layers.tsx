import { memo, useMemo } from 'react';
import type { MapMark, MapToken } from '../api/maps';
import { usePortraitUrl } from '../api/portraits';
import { areaCells, CONE_ANGLE, toImageSpace, type AreaShape, type Cell, type Grid, type Point } from './geometry';

/** Camadas do quadro, desenhadas em pixels da imagem (o zoom é um transform no grupo de fora). */

export const STATUS_RING: Record<string, string> = {
  ileso: '#3fa34d',
  ferido: '#e8a33d',
  muito_ferido: '#d64545',
  caido: '#5a1d1a',
};

export const SWATCHES = ['#e8a33d', '#d64545', '#3b82c4', '#3fa34d', '#8e5cc4', '#f1ebe1', '#1d1a16'];

/** Linhas do grid num só path; a espessura não muda com o zoom. */
export const GridLayer = memo(function GridLayer({ g }: { g: Grid }) {
  const d = useMemo(() => {
    const w = g.cols * g.cell_px;
    const h = g.rows * g.cell_px;
    let s = '';
    for (let i = 0; i <= g.cols; i++) s += `M${g.offset_x + i * g.cell_px} ${g.offset_y}v${h}`;
    for (let j = 0; j <= g.rows; j++) s += `M${g.offset_x} ${g.offset_y + j * g.cell_px}h${w}`;
    return s;
  }, [g.cols, g.rows, g.cell_px, g.offset_x, g.offset_y]);
  return <path d={d} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />;
});

/**
 * Névoa: um retângulo que cobre tudo, com furos nas células reveladas (regra evenodd).
 * Para o jogador é opaca; o mestre vê através, para saber o que está escondido.
 */
export const FogLayer = memo(function FogLayer({ g, fog, bounds, opaque }: { g: Grid; fog: string; bounds: { w: number; h: number }; opaque: boolean }) {
  const d = useMemo(() => {
    const pad = Math.max(bounds.w, bounds.h);
    let s = `M${-pad} ${-pad}H${bounds.w + pad}V${bounds.h + pad}H${-pad}Z`;
    for (let y = 0; y < g.rows; y++) {
      let x = 0;
      while (x < g.cols) {
        if (fog[y * g.cols + x] !== '1') {
          x++;
          continue;
        }
        const start = x;
        while (x < g.cols && fog[y * g.cols + x] === '1') x++;
        const o = toImageSpace(g, { x: start, y });
        s += `M${o.x} ${o.y}h${(x - start) * g.cell_px}v${g.cell_px}h${-(x - start) * g.cell_px}Z`;
      }
    }
    return s;
  }, [g, fog, bounds.w, bounds.h]);
  return <path d={d} fillRule="evenodd" fill="#0b0a08" fillOpacity={opaque ? 1 : 0.5} pointerEvents="none" />;
});

/** Contorno de uma área (em pixels da imagem) a partir da origem e do alvo em espaço de célula. */
export function areaOutline(g: Grid, shape: AreaShape, origin: Point, target: Point, sizeM: number): string {
  const r = (sizeM / g.cell_meters) * g.cell_px;
  const o = toImageSpace(g, origin);
  const t = toImageSpace(g, target);
  const a = Math.atan2(t.y - o.y, t.x - o.x) || 0;
  if (shape === 'circle') return `M${o.x - r} ${o.y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  if (shape === 'cone') {
    const half = ((CONE_ANGLE / 2) * Math.PI) / 180;
    const p1 = { x: o.x + r * Math.cos(a - half), y: o.y + r * Math.sin(a - half) };
    const p2 = { x: o.x + r * Math.cos(a + half), y: o.y + r * Math.sin(a + half) };
    return `M${o.x} ${o.y}L${p1.x} ${p1.y}A${r} ${r} 0 0 1 ${p2.x} ${p2.y}Z`;
  }
  const hw = g.cell_px / 2;
  const nx = -Math.sin(a) * hw;
  const ny = Math.cos(a) * hw;
  const ex = o.x + Math.cos(a) * r;
  const ey = o.y + Math.sin(a) * r;
  return `M${o.x + nx} ${o.y + ny}L${ex + nx} ${ey + ny}L${ex - nx} ${ey - ny}L${o.x - nx} ${o.y - ny}Z`;
}

export function AreaShapeView({ g, shape, origin, target, sizeM, color, cells }: { g: Grid; shape: AreaShape; origin: Point; target: Point; sizeM: number; color: string; cells?: Cell[] }) {
  const hit = useMemo(() => cells ?? areaCells(g, shape, origin, target, sizeM), [cells, g, shape, origin, target, sizeM]);
  return (
    <g pointerEvents="none">
      {hit.map((c) => {
        const o = toImageSpace(g, c);
        return <rect key={`${c.x},${c.y}`} x={o.x} y={o.y} width={g.cell_px} height={g.cell_px} fill={color} fillOpacity={0.3} />;
      })}
      <path d={areaOutline(g, shape, origin, target, sizeM)} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/** Desenhos, alfinetes e áreas fixadas. Tocar numa marca seleciona (data-mark). */
export const MarksLayer = memo(function MarksLayer({ g, marks, selected, interactive }: { g: Grid; marks: MapMark[]; selected: string | null; interactive: boolean }) {
  const pinR = g.cell_px * 0.32;
  return (
    <g>
      {marks.map((m) => {
        const sel = m.id === selected;
        if (m.kind === 'draw') {
          const pts = m.data.points.map((p) => p.join(',')).join(' ');
          return (
            <g key={m.id} data-mark={m.id} pointerEvents={interactive ? 'visibleStroke' : 'none'}>
              {/* traço largo invisível: fica fácil de tocar com o dedo */}
              <polyline points={pts} fill="none" stroke="transparent" strokeWidth={Math.max(m.data.width * 4, g.cell_px * 0.4)} strokeLinecap="round" />
              <polyline points={pts} fill="none" stroke={m.color} strokeWidth={m.data.width} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={sel ? 1 : 0.9} strokeDasharray={sel ? `${m.data.width * 2} ${m.data.width}` : undefined} />
            </g>
          );
        }
        if (m.kind === 'pin') {
          return (
            <g key={m.id} data-mark={m.id} transform={`translate(${m.data.x},${m.data.y})`} pointerEvents={interactive ? 'all' : 'none'}>
              <path
                d={`M0 0L${-pinR * 0.6} ${-pinR * 1.2}A${pinR} ${pinR} 0 1 1 ${pinR * 0.6} ${-pinR * 1.2}Z`}
                fill={m.color}
                stroke={sel ? '#fff' : '#1d1a16'}
                strokeWidth={sel ? 3 : 1.5}
                vectorEffect="non-scaling-stroke"
              />
              <circle cy={-pinR * 1.75} r={pinR * 0.4} fill="#fff" fillOpacity={0.9} />
            </g>
          );
        }
        const cells = areaCells(g, m.data.shape, m.data.origin, m.data.target, m.data.size_m);
        return (
          <g key={m.id} data-mark={m.id} pointerEvents={interactive ? 'all' : 'none'} opacity={sel ? 1 : 0.85}>
            {cells.map((c) => {
              const o = toImageSpace(g, c);
              return <rect key={`${c.x},${c.y}`} x={o.x} y={o.y} width={g.cell_px} height={g.cell_px} fill={m.color} fillOpacity={0.25} />;
            })}
            <path
              d={areaOutline(g, m.data.shape, m.data.origin, m.data.target, m.data.size_m)}
              fill="none"
              stroke={m.color}
              strokeWidth={sel ? 3 : 2}
              strokeDasharray={sel ? '6 4' : undefined}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </g>
  );
});

const initials = (label: string) =>
  label
    .replace(/\s+\d+$/, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

export interface TokenLook {
  portraitPath: string | null;
  status: string | null;
  turn: boolean;
  mine: boolean;
}

/** Token: círculo com retrato recortado, anel de estado, destaque da vez e nome embaixo. */
export const TokenView = memo(function TokenView({ g, token, at, look, selected, dragging, zoom }: { g: Grid; token: MapToken; at: Cell; look: TokenLook; selected: boolean; dragging: boolean; zoom: number }) {
  const portrait = usePortraitUrl(look.portraitPath);
  const side = g.cell_px * token.size;
  const r = side / 2 - g.cell_px * 0.06;
  const o = toImageSpace(g, at);
  const ring = look.status ? STATUS_RING[look.status] : '#1d1a16';
  // Nome legível mesmo com o mapa afastado (~11px na tela), sem passar de meio quadrado.
  const font = Math.min(g.cell_px * 0.45, Math.max(g.cell_px * 0.2, 11 / zoom));
  return (
    <g
      data-token={token.id}
      transform={`translate(${o.x + side / 2},${o.y + side / 2})`}
      opacity={token.hidden ? 0.55 : dragging ? 0.8 : 1}
      style={{ cursor: 'pointer' }}
      role="img"
      aria-label={token.label}
    >
      {look.turn && <circle r={r + g.cell_px * 0.12} fill="none" stroke="#e8a33d" strokeWidth={g.cell_px * 0.1} className="animate-pulse" />}
      <circle r={r} fill={token.color} />
      {portrait.data ? (
        <image href={portrait.data} x={-r} y={-r} width={r * 2} height={r * 2} clipPath="url(#token-clip)" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <text textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={r * 0.8} fontWeight={600} style={{ userSelect: 'none' }}>
          {initials(token.label)}
        </text>
      )}
      <circle
        r={r}
        fill="none"
        stroke={ring}
        strokeWidth={Math.max(g.cell_px * 0.07, 2)}
        strokeDasharray={token.hidden ? `${g.cell_px * 0.12} ${g.cell_px * 0.08}` : undefined}
      />
      {selected && <circle r={r + g.cell_px * 0.05} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
      <text
        y={side / 2 + font * 0.2}
        textAnchor="middle"
        dominantBaseline="hanging"
        fontSize={font}
        fontWeight={look.mine ? 700 : 500}
        fill="#fff"
        stroke="#1d1a16"
        strokeWidth={font * 0.25}
        paintOrder="stroke"
        style={{ userSelect: 'none' }}
        pointerEvents="none"
      >
        {token.label}
      </text>
    </g>
  );
});

/** Recorte redondo compartilhado por todos os retratos (unidades relativas à imagem). */
export function SharedDefs() {
  return (
    <defs>
      <clipPath id="token-clip" clipPathUnits="objectBoundingBox">
        <circle cx={0.5} cy={0.5} r={0.5} />
      </clipPath>
    </defs>
  );
}
