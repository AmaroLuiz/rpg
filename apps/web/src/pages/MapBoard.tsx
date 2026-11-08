import { ArrowLeft, CloudFog, Grid3x3, Hand, MapPin, Maximize, Pencil, Ruler, Target, UsersRound, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { useCampaign } from '../api/campaigns';
import { useCharacters } from '../api/characters';
import { useCurrentEncounter, useLibrary } from '../api/combat';
import { useMap, useMapActions, type GridPatch, type MapBoard as Board, type MapToken } from '../api/maps';
import { useCampaignRealtime } from '../api/realtime';
import { useUserId } from '../auth/AuthProvider';
import { ErrorNote, Spinner, cx } from '../components/ui';
import { friendlyError } from '../lib/errors';
import { useOnline } from '../lib/useOnline';
import {
  areaCells,
  cellAt,
  distanceCells,
  fillFog,
  formatMeters,
  paintFog,
  simplifyStroke,
  snapToken,
  toCellSpace,
  toImageSpace,
  tokensInCells,
  tokenVisible,
  type AreaShape,
  type Cell,
  type Grid,
  type Point,
} from '../map/geometry';
import { useMapImage } from '../map/imageCache';
import { AreaShapeView, FogLayer, GridLayer, MarksLayer, SharedDefs, TokenView, type TokenLook } from '../map/layers';
import { AreaPanel, combatantFor, DrawPanel, FogPanel, GridPanel, Hint, MarkPanel, Panel, PinPanel, PlacePanel, TokenPanel, type Placing } from '../map/panels';

type Tool = 'move' | 'ruler' | 'area' | 'draw' | 'pin' | 'fog' | 'grid' | 'tokens';
interface View {
  x: number;
  y: number;
  k: number;
}
type Target = { token?: string; mark?: string };
type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; view: View; sx: number; sy: number; moved: boolean; target: Target }
  | { kind: 'pinch'; view: View; dist: number; mid: Point }
  | { kind: 'token'; id: string; sx: number; sy: number; moved: boolean; grab: Point }
  | { kind: 'tool'; sx: number; sy: number; moved: boolean; offset?: Point };

const TAP = 6;
const snapHalf = (p: Point): Point => ({ x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 });

function targetOf(el: EventTarget | null): Target {
  const node = el instanceof Element ? el : null;
  const token = node?.closest('[data-token]')?.getAttribute('data-token');
  if (token) return { token };
  const mark = node?.closest('[data-mark]')?.getAttribute('data-mark');
  return mark ? { mark } : {};
}

export function MapBoard() {
  const { id: campaignId = '', mapId = '' } = useParams();
  const { t } = useTranslation();
  const userId = useUserId();
  useCampaignRealtime(campaignId, userId);
  const campaign = useCampaign(campaignId);
  const isGm = campaign.data?.members.some((m) => m.user_id === userId && m.role === 'gm') ?? false;
  const map = useMap(campaignId, mapId);

  if (map.isPending || campaign.isPending) return <Spinner label={t('common.loading')} />;
  if (map.error || !map.data)
    return (
      <>
        <Link to={`/mesas/${campaignId}/mapas`} className="text-accent">
          ← {t('maps.title')}
        </Link>
        <ErrorNote>{map.error ? friendlyError(map.error) : t('errors.notFound')}</ErrorNote>
      </>
    );
  return <BoardView campaignId={campaignId} board={map.data} isGm={isGm} userId={userId} />;
}

function BoardView({ campaignId, board, isGm, userId }: { campaignId: string; board: Board; isGm: boolean; userId: string }) {
  const { t } = useTranslation();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const campaign = useCampaign(campaignId);
  const characters = useCharacters(campaignId);
  const library = useLibrary(campaignId, isGm);
  const encounter = useCurrentEncounter(campaignId);
  const actions = useMapActions(campaignId);
  const image = useMapImage(board.image_path);
  const enc = encounter.data?.status === 'ended' ? null : encounter.data;

  const [tool, setTool] = useState<Tool>(() => (params.get('ajustar') && isGm ? 'grid' : 'move'));
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [selectedMark, setSelectedMark] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [placeMessage, setPlaceMessage] = useState<string | null>(null);
  const [drag, setDragState] = useState<{ id: string; cell: Cell } | null>(null);
  const dragRef = useRef(drag);
  const setDrag = (d: { id: string; cell: Cell } | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const [ruler, setRuler] = useState<{ a: Cell; b: Cell } | null>(null);
  const [area, setArea] = useState<{ origin: Point; target: Point } | null>(null);
  const [areaShape, setAreaShape] = useState<AreaShape>('circle');
  const [areaSize, setAreaSize] = useState(4.5);
  const [color, setColor] = useState('#e8a33d');
  const [gmOnly, setGmOnly] = useState(false);
  const [stroke, setStroke] = useState<Point[] | null>(null);
  const [pendingPin, setPendingPin] = useState<Point | null>(null);
  const [fogMode, setFogMode] = useState<'reveal' | 'cover'>('reveal');
  const [brush, setBrush] = useState(1);
  const [fogDraft, setFogDraft] = useState<string | null>(null);
  const [gridDraft, setGridDraft] = useState<GridPatch | null>(null);

  // Ferramentas de edição somem sem rede ou para quem não pode usá-las.
  const editable = online;
  useEffect(() => {
    if (!online && !['move', 'ruler', 'area'].includes(tool)) setTool('move');
  }, [online, tool]);
  useEffect(() => {
    if (!isGm && ['fog', 'grid', 'tokens'].includes(tool)) setTool('move');
  }, [isGm, tool]);

  const grid: Grid = useMemo(() => ({ ...board, ...gridDraft }), [board, gridDraft]);
  const fog = fogDraft ?? board.fog;
  const bounds = useMemo(
    () => ({
      w: Math.max(board.image_path ? board.image_w : 0, grid.offset_x + grid.cols * grid.cell_px),
      h: Math.max(board.image_path ? board.image_h : 0, grid.offset_y + grid.rows * grid.cell_px),
    }),
    [board.image_path, board.image_w, board.image_h, grid],
  );

  // ---------- quem é quem ----------

  const charById = useMemo(() => new Map((characters.data ?? []).map((c) => [c.id, c])), [characters.data]);
  const portraitOf = useCallback(
    (tk: MapToken) => (tk.character_id ? (charById.get(tk.character_id)?.portrait_path ?? library.data?.find((l) => l.id === tk.character_id)?.portrait_path ?? null) : null),
    [charById, library.data],
  );
  const current = enc?.status === 'active' ? enc.combatants.find((c) => c.id === enc.current_combatant_id) : undefined;
  const isTurn = useCallback(
    (tk: MapToken) => !!current && (tk.combatant_id === current.id || (!tk.combatant_id && !!tk.character_id && current.character?.kind === 'pc' && current.character_id === tk.character_id)),
    [current],
  );
  const isMine = useCallback((tk: MapToken) => !!tk.character_id && charById.get(tk.character_id)?.owner_id === userId && charById.get(tk.character_id)?.kind === 'pc', [charById, userId]);
  const canMove = (tk: MapToken) => editable && (isGm || isMine(tk));
  const looks = useMemo(() => {
    const out = new Map<string, TokenLook>();
    for (const tk of board.tokens) {
      const c = combatantFor(tk, enc);
      out.set(tk.id, { portraitPath: portraitOf(tk), status: c?.public_status ?? null, turn: isTurn(tk), mine: isMine(tk) });
    }
    return out;
  }, [board.tokens, enc, portraitOf, isTurn, isMine]);

  // ---------- pan e zoom ----------

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef(size);
  const [view, setViewState] = useState<View>({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  const setView = (v: View) => {
    viewRef.current = v;
    setViewState(v);
  };
  const fitScale = size.w && size.h ? Math.min(size.w / bounds.w, size.h / bounds.h) : 1;
  const clampK = (k: number) => Math.max(fitScale * 0.5, Math.min(Math.max(4, fitScale * 10), k));
  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    const k = Math.min(size.w / bounds.w, size.h / bounds.h) * 0.95;
    setView({ k, x: (size.w - bounds.w * k) / 2, y: (size.h - bounds.h * k) / 2 });
  }, [size.w, size.h, bounds.w, bounds.h]);
  const fitted = useRef(false);
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    // Painel abrindo ou fechando muda a área do mapa: mantém no centro o que estava no centro.
    const ro = new ResizeObserver(([e]) => {
      const w = e!.contentRect.width;
      const h = e!.contentRect.height;
      const prev = sizeRef.current;
      if (prev.w && prev.h && (prev.w !== w || prev.h !== h)) {
        const v = viewRef.current;
        setView({ ...v, x: v.x + (w - prev.w) / 2, y: v.y + (h - prev.h) / 2 });
      }
      sizeRef.current = { w, h };
      setSize({ w, h });
    });
    ro.observe(el);
    // O observador só avisa no próximo quadro (e nunca em aba em segundo plano): lê o tamanho já.
    const r = el.getBoundingClientRect();
    sizeRef.current = { w: r.width, h: r.height };
    setSize(sizeRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!fitted.current && size.w && size.h) {
      fitted.current = true;
      fit();
    }
  }, [size.w, size.h, fit]);
  const zoomAt = (sx: number, sy: number, factor: number) => {
    const v = viewRef.current;
    const k = clampK(v.k * factor);
    const ix = (sx - v.x) / v.k;
    const iy = (sy - v.y) / v.k;
    setView({ k, x: sx - ix * k, y: sy - iy * k });
  };
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toImage = (s: Point): Point => {
    const v = viewRef.current;
    return { x: (s.x - v.x) / v.k, y: (s.y - v.y) / v.k };
  };

  // ---------- névoa: mostra na hora, grava com atraso enquanto pinta ----------

  const fogWork = useRef<string | null>(null);
  const fogTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastFogCell = useRef<string | null>(null);
  const saveFogNow = useCallback(
    (value: string) => {
      clearTimeout(fogTimer.current);
      actions.saveFog.mutate(
        { id: board.id, fog: value },
        { onSuccess: () => setFogDraft((d) => (d === value ? null : d)), onError: () => setFogDraft(null) },
      );
    },
    [actions.saveFog, board.id],
  );
  const paintAt = (img: Point) => {
    const c = cellAt(grid, img);
    if (!c) return;
    const k = `${c.x},${c.y}`;
    if (k === lastFogCell.current) return;
    lastFogCell.current = k;
    fogWork.current = paintFog(grid, fogWork.current ?? fog, c, fogMode === 'reveal', brush);
    setFogDraft(fogWork.current);
    clearTimeout(fogTimer.current);
    const value = fogWork.current;
    fogTimer.current = setTimeout(() => saveFogNow(value), 500);
  };
  useEffect(() => () => clearTimeout(fogTimer.current), []);

  // ---------- gestos ----------

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>({ kind: 'none' });
  const strokeRef = useRef<Point[]>([]);

  const abortTool = () => {
    if (gesture.current.kind === 'token') setDrag(null);
    if (gesture.current.kind === 'tool' && tool === 'draw') setStroke(null);
  };

  const tap = (target: Target, img: Point) => {
    if (placing) {
      const tk = snapToken(grid, img, 1);
      if (!cellAt(grid, img)) return;
      actions.placeToken.mutate({ mapId: board.id, label: placing.label, x: tk.x, y: tk.y, characterId: placing.characterId, combatantId: placing.combatantId, color: placing.color, hidden: placing.hidden });
      setPlacing(null);
      return;
    }
    if (tool === 'pin' && editable && !target.mark && !target.token) {
      setPendingPin(img);
      return;
    }
    setSelectedToken(target.token ?? null);
    setSelectedMark(target.token ? null : (target.mark ?? null));
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    svgRef.current!.setPointerCapture(e.pointerId);
    const s = local(e);
    pointers.current.set(e.pointerId, s);
    if (pointers.current.size === 2) {
      abortTool();
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      gesture.current = { kind: 'pinch', view: viewRef.current, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    if (pointers.current.size > 2) return;
    const img = toImage(s);
    const target = targetOf(e.target);
    const pan = (): Gesture => ({ kind: 'pan', view: viewRef.current, sx: s.x, sy: s.y, moved: false, target });
    if (placing || tool === 'move' || tool === 'tokens' || tool === 'pin' || (!editable && tool !== 'ruler' && tool !== 'area')) {
      const tk = target.token ? board.tokens.find((x) => x.id === target.token) : undefined;
      if (tk && !placing && (tool === 'move' || tool === 'tokens') && canMove(tk)) {
        const center = toImageSpace(grid, { x: tk.x + tk.size / 2, y: tk.y + tk.size / 2 });
        gesture.current = { kind: 'token', id: tk.id, sx: s.x, sy: s.y, moved: false, grab: { x: img.x - center.x, y: img.y - center.y } };
      } else gesture.current = pan();
      return;
    }
    gesture.current = { kind: 'tool', sx: s.x, sy: s.y, moved: false };
    if (tool === 'ruler') {
      const c = cellAt(grid, img);
      setRuler(c ? { a: c, b: c } : null);
    } else if (tool === 'area') {
      const o = snapHalf(toCellSpace(grid, img));
      setArea({ origin: o, target: o });
    } else if (tool === 'draw') {
      strokeRef.current = [img];
      setStroke([img]);
    } else if (tool === 'fog') {
      fogWork.current = fog;
      lastFogCell.current = null;
      paintAt(img);
    } else if (tool === 'grid') {
      gesture.current = { kind: 'tool', sx: s.x, sy: s.y, moved: false, offset: { x: grid.offset_x, y: grid.offset_y } };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const s = local(e);
    pointers.current.set(e.pointerId, s);
    const g = gesture.current;
    if (g.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      const k = clampK(g.view.k * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ix = (g.mid.x - g.view.x) / g.view.k;
      const iy = (g.mid.y - g.view.y) / g.view.k;
      setView({ k, x: mid.x - ix * k, y: mid.y - iy * k });
      return;
    }
    if (g.kind === 'none') return;
    const far = Math.hypot(s.x - g.sx, s.y - g.sy) > TAP;
    if (far) g.moved = true;
    const img = toImage(s);
    if (g.kind === 'pan') {
      if (g.moved) setView({ ...g.view, x: g.view.x + s.x - g.sx, y: g.view.y + s.y - g.sy });
    } else if (g.kind === 'token') {
      if (!g.moved) return;
      const tk = board.tokens.find((x) => x.id === g.id);
      if (tk) setDrag({ id: tk.id, cell: snapToken(grid, { x: img.x - g.grab.x, y: img.y - g.grab.y }, tk.size) });
    } else if (tool === 'ruler') {
      const c = cellAt(grid, img);
      if (c) setRuler((r) => (r ? { ...r, b: c } : { a: c, b: c }));
    } else if (tool === 'area') {
      setArea((a) => (a ? { ...a, target: toCellSpace(grid, img) } : a));
    } else if (tool === 'draw') {
      strokeRef.current.push(img);
      setStroke([...strokeRef.current]);
    } else if (tool === 'fog') {
      paintAt(img);
    } else if (tool === 'grid' && g.offset) {
      const k = viewRef.current.k;
      const norm = (v: number) => Math.round((((v % grid.cell_px) + grid.cell_px) % grid.cell_px) * 10) / 10;
      setGridDraft((d) => ({ ...d, offset_x: norm(g.offset!.x + (s.x - g.sx) / k), offset_y: norm(g.offset!.y + (s.y - g.sy) / k) }));
    }
  };

  const finish = (e: ReactPointerEvent<SVGSVGElement>, cancelled: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    const s = local(e);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.kind === 'pinch') {
      // Sobrou um dedo: continua arrastando o mapa, sem contar como toque.
      const rest = [...pointers.current.values()][0];
      gesture.current = rest ? { kind: 'pan', view: viewRef.current, sx: rest.x, sy: rest.y, moved: true, target: {} } : { kind: 'none' };
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = { kind: 'none' };
    if (cancelled) {
      if (g.kind === 'token') setDrag(null);
      if (g.kind === 'tool' && tool === 'draw') setStroke(null);
      return;
    }
    const img = toImage(s);
    if (g.kind === 'pan') {
      if (!g.moved) tap(g.target, img);
    } else if (g.kind === 'token') {
      const tk = board.tokens.find((x) => x.id === g.id);
      if (!g.moved) tap({ token: g.id }, img);
      else {
        const d = dragRef.current;
        if (tk && d && d.id === tk.id && (d.cell.x !== tk.x || d.cell.y !== tk.y)) actions.moveToken.mutate({ mapId: board.id, id: tk.id, x: d.cell.x, y: d.cell.y });
      }
      setDrag(null);
    } else if (tool === 'draw') {
      const pts = simplifyStroke(strokeRef.current);
      setStroke(null);
      if (pts.length >= 2) {
        actions.addMark.mutate({ mapId: board.id, authorId: userId, kind: 'draw', data: { points: pts, width: Math.max(2, Math.round(grid.cell_px / 14)) }, color, gmOnly: isGm && gmOnly });
      }
    } else if (tool === 'fog' && fogWork.current) {
      saveFogNow(fogWork.current);
      fogWork.current = null;
    } else if (g.kind === 'tool' && tool === 'ruler' && !g.moved) {
      setRuler(null);
    }
  };

  // ---------- derivados das ferramentas ----------

  const visibleTokens = board.tokens;
  const areaHit = useMemo(() => (area ? areaCells(grid, areaShape, area.origin, area.target, areaSize) : null), [grid, area, areaShape, areaSize]);
  const areaNames = useMemo(() => (areaHit ? tokensInCells(visibleTokens, areaHit).map((x) => x.label) : null), [areaHit, visibleTokens]);
  const rulerCells = ruler ? distanceCells(ruler.a, ruler.b, grid.diagonal) : 0;
  const myLastDraw = [...board.marks].reverse().find((m) => m.kind === 'draw' && m.author_id === userId);
  const draws = board.marks.filter((m) => m.kind === 'draw');
  const tokenSel = selectedToken ? board.tokens.find((x) => x.id === selectedToken) : undefined;
  const markSel = selectedMark ? board.marks.find((x) => x.id === selectedMark) : undefined;
  const memberName = (id: string) => campaign.data?.members.find((m) => m.user_id === id)?.profile?.display_name ?? null;
  const anyMine = board.tokens.some(isMine);

  const pickTool = (next: Tool) => {
    setTool((cur) => (cur === next && next !== 'move' ? 'move' : next));
    setPlacing(null);
    setPendingPin(null);
    setSelectedToken(null);
    setSelectedMark(null);
    if (next !== 'ruler') setRuler(null);
    if (next !== 'area') setArea(null);
  };

  const tools: Array<{ id: Tool; icon: LucideIcon; gm?: boolean; edits?: boolean }> = [
    { id: 'move', icon: Hand },
    { id: 'ruler', icon: Ruler },
    { id: 'area', icon: Target },
    { id: 'draw', icon: Pencil, edits: true },
    { id: 'pin', icon: MapPin, edits: true },
    { id: 'tokens', icon: UsersRound, gm: true, edits: true },
    { id: 'fog', icon: CloudFog, gm: true, edits: true },
    { id: 'grid', icon: Grid3x3, gm: true, edits: true },
  ];

  // ---------- painel de baixo ----------

  let panel: ReactNode = null;
  if (placing) {
    panel = (
      <Panel title={t('maps.place.placing', { name: placing.label })} onClose={() => setPlacing(null)}>
        {null}
      </Panel>
    );
  } else if (tokenSel) {
    const ch = tokenSel.character_id ? charById.get(tokenSel.character_id) : undefined;
    panel = (
      <TokenPanel
        campaignId={campaignId}
        board={board}
        token={tokenSel}
        enc={enc}
        character={ch}
        portraitPath={portraitOf(tokenSel)}
        isGm={isGm}
        isOwner={isMine(tokenSel)}
        online={online}
        isTurn={isTurn(tokenSel)}
        underFog={!tokenVisible({ ...grid, fog_enabled: board.fog_enabled, fog }, tokenSel)}
        onClose={() => setSelectedToken(null)}
      />
    );
  } else if (markSel) {
    panel = (
      <MarkPanel
        mark={markSel}
        author={memberName(markSel.author_id)}
        canDelete={editable && (isGm || markSel.author_id === userId)}
        onDelete={() => {
          actions.removeMark.mutate({ mapId: board.id, id: markSel.id });
          setSelectedMark(null);
        }}
        onClose={() => setSelectedMark(null)}
      />
    );
  } else if (tool === 'tokens') {
    panel = (
      <PlacePanel
        board={board}
        characters={characters.data ?? []}
        enc={enc}
        onPick={(p) => {
          setPlacing(p);
          setPlaceMessage(null);
        }}
        placeAllBusy={actions.placeCombatants.isPending}
        message={placeMessage}
        onPlaceAll={() => {
          if (!enc) return;
          const centerCell = cellAt(grid, toImage({ x: size.w / 2, y: size.h / 2 })) ?? { x: Math.floor(grid.cols / 2), y: Math.floor(grid.rows / 2) };
          actions.placeCombatants.mutate(
            { map: board, combatants: enc.combatants, near: centerCell, colors: { pc: '#3b82c4', foe: '#d64545' } },
            {
              onSuccess: (n) => {
                const missing = enc.combatants.length > 0 && n === 0;
                setPlaceMessage(n ? t('maps.place.placed', { count: n as number }) : missing ? t('maps.place.allDone') : t('maps.place.full'));
              },
            },
          );
        }}
        onClose={() => pickTool('move')}
      />
    );
  } else if (tool === 'grid') {
    panel = (
      <GridPanel
        campaignId={campaignId}
        board={board}
        grid={grid}
        dirty={!!gridDraft && Object.entries(gridDraft).some(([k, v]) => board[k as keyof Grid] !== v)}
        onChange={(p) => setGridDraft((d) => ({ ...d, ...p }))}
        onSaved={() => {
          setGridDraft(null);
          if (params.get('ajustar')) setParams({}, { replace: true });
        }}
        onDiscard={() => setGridDraft(null)}
        onClose={() => pickTool('move')}
      />
    );
  } else if (tool === 'fog') {
    panel = (
      <FogPanel
        board={board}
        mode={fogMode}
        brush={brush}
        onMode={setFogMode}
        onBrush={setBrush}
        onEnabled={(on) => actions.saveFog.mutate({ id: board.id, fog_enabled: on })}
        onFill={(on) => {
          setFogDraft(null);
          actions.saveFog.mutate({ id: board.id, fog: fillFog(grid, on) });
        }}
        onClose={() => pickTool('move')}
      />
    );
  } else if (tool === 'area') {
    panel = (
      <AreaPanel
        shape={areaShape}
        sizeM={areaSize}
        color={color}
        hits={areaNames}
        cells={areaHit?.length ?? 0}
        canPin={editable}
        isGm={isGm}
        gmOnly={gmOnly}
        busy={actions.addMark.isPending}
        onShape={setAreaShape}
        onSize={setAreaSize}
        onColor={setColor}
        onGmOnly={setGmOnly}
        onPin={() => {
          if (!area) return;
          const round = (p: Point) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
          actions.addMark.mutate(
            { mapId: board.id, authorId: userId, kind: 'area', data: { shape: areaShape, origin: round(area.origin), target: round(area.target), size_m: areaSize }, color, gmOnly: isGm && gmOnly },
            { onSuccess: () => setArea(null) },
          );
        }}
        onClose={() => pickTool('move')}
      />
    );
  } else if (tool === 'draw') {
    panel = (
      <DrawPanel
        color={color}
        onColor={setColor}
        isGm={isGm}
        gmOnly={gmOnly}
        onGmOnly={setGmOnly}
        canUndo={!!myLastDraw}
        onUndo={() => myLastDraw && actions.removeMark.mutate({ mapId: board.id, id: myLastDraw.id })}
        canClear={draws.length > 0}
        onClear={() => actions.clearMarks.mutate({ mapId: board.id, ids: draws.map((m) => m.id) })}
        onClose={() => pickTool('move')}
      />
    );
  } else if (tool === 'pin') {
    panel = (
      <PinPanel
        pending={!!pendingPin}
        isGm={isGm}
        color={color}
        onColor={setColor}
        busy={actions.addMark.isPending}
        onSave={(text, only) => {
          if (!pendingPin) return;
          actions.addMark.mutate(
            { mapId: board.id, authorId: userId, kind: 'pin', data: { x: Math.round(pendingPin.x), y: Math.round(pendingPin.y), text }, color, gmOnly: isGm && only },
            { onSuccess: () => setPendingPin(null) },
          );
        }}
        onCancel={() => setPendingPin(null)}
        onClose={() => pickTool('move')}
      />
    );
  } else if (tool === 'ruler') {
    panel = (
      <Panel title={t('maps.tool.ruler')} onClose={() => pickTool('move')}>
        {ruler ? (
          <p className="font-medium" role="status">
            {t('maps.ruler.result', { count: rulerCells, meters: formatMeters(rulerCells * grid.cell_meters) })}
          </p>
        ) : (
          <Hint>{t('maps.ruler.hint')}</Hint>
        )}
      </Panel>
    );
  }

  const actionError = actions.moveToken.error ?? actions.placeToken.error ?? actions.addMark.error ?? actions.saveFog.error ?? actions.placeCombatants.error;
  const cursor = placing || ['ruler', 'area', 'draw', 'pin', 'fog'].includes(tool) ? 'crosshair' : tool === 'grid' ? 'move' : 'grab';
  const rulerA = ruler ? toImageSpace(grid, { x: ruler.a.x + 0.5, y: ruler.a.y + 0.5 }) : null;
  const rulerB = ruler ? toImageSpace(grid, { x: ruler.b.x + 0.5, y: ruler.b.y + 0.5 }) : null;
  const label = 14 / view.k;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg">
      <header className="flex items-center gap-1 border-b border-line bg-surface px-2 pt-[env(safe-area-inset-top)]">
        <Link to={`/mesas/${campaignId}/mapas`} aria-label={t('maps.title')} className="grid size-12 shrink-0 place-items-center rounded-xl hover:bg-surface-2">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-semibold leading-tight">{board.name}</h1>
          <p className="truncate text-xs text-muted">
            {board.active ? t('maps.active') : isGm ? (board.revealed ? t('maps.revealed') : t('maps.prep')) : ''}
            {current && ` · ${t('combat.turnOf', { name: current.label })}`}
          </p>
        </div>
        <button type="button" className="grid size-12 place-items-center rounded-xl hover:bg-surface-2" aria-label={t('maps.zoomOut')} onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.3)}>
          <ZoomOut className="size-5" aria-hidden />
        </button>
        <button type="button" className="grid size-12 place-items-center rounded-xl hover:bg-surface-2" aria-label={t('maps.zoomIn')} onClick={() => zoomAt(size.w / 2, size.h / 2, 1.3)}>
          <ZoomIn className="size-5" aria-hidden />
        </button>
        <button type="button" className="grid size-12 place-items-center rounded-xl hover:bg-surface-2" aria-label={t('maps.fit')} onClick={fit}>
          <Maximize className="size-5" aria-hidden />
        </button>
      </header>

      {!online && <p className="bg-surface-2 px-4 py-2 text-sm text-muted">{t('maps.readOnly')}</p>}
      {actionError && (
        <div className="px-3 pt-2">
          <ErrorNote>{friendlyError(actionError)}</ErrorNote>
        </div>
      )}
      {image.error ? <p className="px-4 py-2 text-sm text-danger">{t('maps.noImage')}</p> : null}

      <div className="relative min-h-0 flex-1 bg-surface-2">
        <svg
          ref={svgRef}
          className="absolute inset-0 size-full select-none"
          style={{ touchAction: 'none', cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finish(e, false)}
          onPointerCancel={(e) => finish(e, true)}
          onContextMenu={(e) => e.preventDefault()}
          role="application"
          aria-label={board.name}
        >
          <SharedDefs />
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {board.image_path ? (
              image.url ? (
                <image href={image.url} x={0} y={0} width={board.image_w} height={board.image_h} preserveAspectRatio="none" />
              ) : (
                <rect width={board.image_w} height={board.image_h} fill="var(--surface)" className="animate-pulse" />
              )
            ) : (
              <rect width={bounds.w} height={bounds.h} fill="#d9cfbd" />
            )}
            <GridLayer g={grid} />
            <MarksLayer g={grid} marks={board.marks} selected={selectedMark} interactive={tool === 'move' || tool === 'pin'} />
            {board.fog_enabled && <FogLayer g={grid} fog={fog} bounds={bounds} opaque={!isGm} />}
            {!board.fog_enabled && isGm && tool === 'fog' && <FogLayer g={grid} fog={fog} bounds={bounds} opaque={false} />}
            {visibleTokens.map((tk) => (
              <TokenView
                key={tk.id}
                g={grid}
                token={tk}
                at={drag?.id === tk.id ? drag.cell : tk}
                look={looks.get(tk.id)!}
                selected={tk.id === selectedToken}
                dragging={drag?.id === tk.id}
                zoom={view.k}
              />
            ))}
            {area && tool === 'area' && <AreaShapeView g={grid} shape={areaShape} origin={area.origin} target={area.target} sizeM={areaSize} color={color} cells={areaHit ?? undefined} />}
            {stroke && stroke.length > 1 && (
              <polyline points={stroke.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={Math.max(2, Math.round(grid.cell_px / 14))} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
            )}
            {pendingPin && <circle cx={pendingPin.x} cy={pendingPin.y} r={grid.cell_px * 0.25} fill={color} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            {rulerA && rulerB && (
              <g pointerEvents="none">
                <line x1={rulerA.x} y1={rulerA.y} x2={rulerB.x} y2={rulerB.y} stroke="#e8a33d" strokeWidth={3} strokeDasharray="8 5" vectorEffect="non-scaling-stroke" />
                <circle cx={rulerA.x} cy={rulerA.y} r={5 / view.k} fill="#e8a33d" />
                <circle cx={rulerB.x} cy={rulerB.y} r={5 / view.k} fill="#e8a33d" />
                <text
                  x={(rulerA.x + rulerB.x) / 2}
                  y={(rulerA.y + rulerB.y) / 2 - label}
                  textAnchor="middle"
                  fontSize={label * 1.2}
                  fontWeight={700}
                  fill="#fff"
                  stroke="#1d1a16"
                  strokeWidth={label * 0.3}
                  paintOrder="stroke"
                >
                  {formatMeters(rulerCells * grid.cell_meters)}
                </text>
              </g>
            )}
          </g>
        </svg>
        {tool === 'move' && !panel && (
          <p className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-bg/80 to-transparent px-4 py-2 text-center text-xs text-muted">
            {(isGm || anyMine) && editable ? t('maps.moveHintToken') : t('maps.moveHint')}
          </p>
        )}
      </div>

      {panel}

      <nav aria-label={t('maps.tools')} className="flex justify-around gap-px overflow-x-auto border-t border-line bg-surface px-0.5 pb-[env(safe-area-inset-bottom)]">
        {tools
          .filter((x) => (!x.gm || isGm) && (!x.edits || editable))
          .map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={tool === id}
              onClick={() => pickTool(id)}
              className={cx(
                'flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[0.65rem] font-medium tracking-tight',
                tool === id ? 'bg-accent-soft/60 text-accent' : 'text-muted hover:text-ink',
              )}
            >
              <Icon className="size-5" aria-hidden />
              {t(`maps.tool.${id}`)}
            </button>
          ))}
      </nav>
    </div>
  );
}
