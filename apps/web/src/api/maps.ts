import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Json } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { freeSpots, resizeFog, type Cell, type Grid } from '../map/geometry';
import { forgetMapImage, rememberMapImage } from '../map/imageCache';
import type { Combatant } from './combat';
import { resizeImage } from './portraits';

export interface MapRow extends Grid {
  id: string;
  campaign_id: string;
  name: string;
  image_path: string | null;
  image_w: number;
  image_h: number;
  revealed: boolean;
  active: boolean;
  fog_enabled: boolean;
  fog: string;
  created_at: string;
  updated_at: string;
}

export type MapSummary = Omit<MapRow, 'fog'>;

export interface MapToken {
  id: string;
  map_id: string;
  campaign_id: string;
  character_id: string | null;
  combatant_id: string | null;
  label: string;
  x: number;
  y: number;
  size: number;
  color: string;
  hidden: boolean;
  updated_at: string;
}

export type MarkData =
  | { kind: 'draw'; data: { points: Array<[number, number]>; width: number } }
  | { kind: 'pin'; data: { x: number; y: number; text: string } }
  | { kind: 'area'; data: { shape: 'circle' | 'cone' | 'line'; origin: Cell; target: Cell; size_m: number } };

export type MapMark = MarkData & {
  id: string;
  map_id: string;
  campaign_id: string;
  author_id: string;
  color: string;
  gm_only: boolean;
  created_at: string;
};

export interface MapBoard extends MapRow {
  tokens: MapToken[];
  marks: MapMark[];
}

export const mapKeys = {
  all: (campaignId: string) => ['maps', campaignId] as const,
  one: (campaignId: string, mapId: string) => ['maps', campaignId, mapId] as const,
};

const SUMMARY = 'id, campaign_id, name, image_path, image_w, image_h, cell_px, offset_x, offset_y, cols, rows, cell_meters, diagonal, revealed, active, fog_enabled, created_at, updated_at';
const TOKEN = 'id, map_id, campaign_id, character_id, combatant_id, label, x, y, size, color, hidden, updated_at';

async function check<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

/** Mapas da mesa. Mestre recebe todos; jogador só os revelados (RLS). O "na mesa" vem primeiro. */
export function useMaps(campaignId: string) {
  return useQuery({
    queryKey: mapKeys.all(campaignId),
    queryFn: async () => {
      const rows = (await check(supabase.from('maps').select(SUMMARY).eq('campaign_id', campaignId).order('created_at', { ascending: false }))) as unknown as MapSummary[];
      return rows.map(normalize).sort((a, b) => Number(b.active) - Number(a.active));
    },
  });
}

/** Mapa com tokens e marcas, já filtrados pelo que quem lê pode ver. */
export function useMap(campaignId: string, mapId: string) {
  return useQuery({
    queryKey: mapKeys.one(campaignId, mapId),
    queryFn: async () => {
      const row = (await check(
        supabase.from('maps').select(`${SUMMARY}, fog, tokens:map_tokens(${TOKEN}), marks:map_marks(*)`).eq('id', mapId).maybeSingle(),
      )) as unknown as MapBoard | null;
      if (!row) return null;
      row.marks.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return normalize(row);
    },
  });
}

// numeric chega como número no supabase-js, mas garante (offsets podem vir como texto em algumas versões).
function normalize<T extends Partial<Grid>>(m: T): T {
  return { ...m, cell_px: Number(m.cell_px), offset_x: Number(m.offset_x), offset_y: Number(m.offset_y), cell_meters: Number(m.cell_meters) };
}

/** Evento do tempo real: a posição nova entra direto no cache, sem reler o mapa. */
export function acceptTokenRow(qc: QueryClient, campaignId: string, row: MapToken): boolean {
  const k = mapKeys.one(campaignId, row.map_id);
  const board = qc.getQueryData<MapBoard | null>(k);
  const prev = board?.tokens.find((t) => t.id === row.id);
  if (!board || !prev) return false;
  if (prev.updated_at > row.updated_at) return true;
  qc.setQueryData<MapBoard | null>(k, () => ({ ...board, tokens: board.tokens.map((t) => (t.id === row.id ? { ...t, ...row } : t)) }));
  return true;
}

function imageSize(blob: Blob): Promise<{ w: number; h: number }> {
  return createImageBitmap(blob).then((b) => {
    const s = { w: b.width, h: b.height };
    b.close();
    return s;
  });
}

async function uploadImage(campaignId: string, file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  const blob = await resizeImage(file, 3000);
  const { w, h } = await imageSize(blob);
  // Caminho começa pela mesa: é o que as regras do Storage conferem.
  const path = `${campaignId}/map-${Date.now()}.webp`;
  const { error } = await supabase.storage.from('maps').upload(path, blob, { contentType: 'image/webp' });
  if (error) throw error;
  await rememberMapImage(path, blob);
  return { path, w, h };
}

const clampCount = (n: number) => Math.max(1, Math.min(100, Math.floor(n)));

export type GridPatch = Partial<Pick<MapRow, 'cell_px' | 'offset_x' | 'offset_y' | 'cols' | 'rows' | 'cell_meters' | 'diagonal'>>;

export function useMapActions(campaignId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: mapKeys.all(campaignId) });
  const board = (mapId: string) => qc.getQueryData<MapBoard | null>(mapKeys.one(campaignId, mapId));
  const patchBoard = (mapId: string, fn: (b: MapBoard) => MapBoard) =>
    qc.setQueryData<MapBoard | null>(mapKeys.one(campaignId, mapId), (b) => (b ? fn(b) : b));
  const m = <V,>(fn: (v: V) => Promise<unknown>) => useMutation({ mutationFn: fn, onSettled: refresh });

  return {
    create: useMutation({
      mutationFn: async (v: { name: string; image?: File | null; cellPx?: number }) => {
        const cell_px = v.cellPx ?? 70;
        let image: { path: string; w: number; h: number } | null = null;
        if (v.image) image = await uploadImage(campaignId, v.image);
        const cols = image ? clampCount(image.w / cell_px) : 20;
        const rows = image ? clampCount(image.h / cell_px) : 15;
        return check(
          supabase
            .from('maps')
            .insert({
              campaign_id: campaignId,
              name: v.name,
              image_path: image?.path ?? null,
              image_w: image?.w ?? cols * cell_px,
              image_h: image?.h ?? rows * cell_px,
              cell_px,
              cols,
              rows,
            })
            .select('id')
            .single(),
        );
      },
      onSettled: refresh,
    }),
    rename: m((v: { id: string; name: string }) => check(supabase.from('maps').update({ name: v.name }).eq('id', v.id))),
    setRevealed: m((v: { id: string; on: boolean }) => check(supabase.from('maps').update({ revealed: v.on }).eq('id', v.id))),
    setActive: m((mapId: string | null) => check(supabase.rpc('set_active_map', { p_campaign: campaignId, p_map: mapId as string }))),
    remove: m(async (map: Pick<MapRow, 'id' | 'image_path'>) => {
      await check(supabase.from('maps').delete().eq('id', map.id));
      if (map.image_path) {
        await supabase.storage.from('maps').remove([map.image_path]);
        await forgetMapImage(map.image_path);
      }
    }),
    /** Troca (ou tira) a imagem de fundo; o grid se mantém. */
    setImage: m(async (v: { map: MapRow; image: File | null }) => {
      const old = v.map.image_path;
      if (v.image) {
        const img = await uploadImage(campaignId, v.image);
        await check(supabase.from('maps').update({ image_path: img.path, image_w: img.w, image_h: img.h }).eq('id', v.map.id));
      } else {
        await check(
          supabase.from('maps').update({ image_path: null, image_w: v.map.cols * v.map.cell_px, image_h: v.map.rows * v.map.cell_px }).eq('id', v.map.id),
        );
      }
      if (old) {
        await supabase.storage.from('maps').remove([old]);
        await forgetMapImage(old);
      }
    }),
    /**
     * Ajuste do grid. Mudando cols/rows, a névoa acompanha célula a célula e os tokens que
     * ficariam de fora voltam para dentro (o banco recusaria qualquer mudança neles depois).
     */
    setGrid: useMutation({
      mutationFn: async (v: { map: MapBoard; patch: GridPatch }) => {
        const next = { ...v.map, ...v.patch };
        next.cols = clampCount(next.cols);
        next.rows = clampCount(next.rows);
        const update: GridPatch & { cols: number; rows: number; fog?: string; image_w?: number; image_h?: number } = { ...v.patch, cols: next.cols, rows: next.rows };
        if (next.cols !== v.map.cols || next.rows !== v.map.rows) update.fog = resizeFog(v.map, next, v.map.fog);
        if (!v.map.image_path) {
          update.image_w = Math.round(next.cols * next.cell_px + next.offset_x);
          update.image_h = Math.round(next.rows * next.cell_px + next.offset_y);
        }
        const shrinking = next.cols < v.map.cols || next.rows < v.map.rows;
        // Primeiro os tokens (ainda no grid antigo, então qualquer posição nova dentro do menor vale).
        if (shrinking) {
          for (const t of v.map.tokens) {
            const size = Math.min(t.size, next.cols, next.rows);
            const x = Math.min(t.x, next.cols - size);
            const y = Math.min(t.y, next.rows - size);
            if (x !== t.x || y !== t.y || size !== t.size) await check(supabase.from('map_tokens').update({ x, y, size }).eq('id', t.id));
          }
        }
        await check(supabase.from('maps').update(update).eq('id', v.map.id));
      },
      onMutate: (v) => patchBoard(v.map.id, (b) => ({ ...b, ...v.patch })),
      onSettled: refresh,
    }),
    /** Névoa: a tela mostra na hora; quem chama decide quando gravar (com atraso enquanto pinta). */
    saveFog: useMutation({
      mutationKey: ['map-fog', campaignId],
      mutationFn: (v: { id: string; fog?: string; fog_enabled?: boolean }) =>
        check(supabase.from('maps').update({ ...(v.fog !== undefined ? { fog: v.fog } : {}), ...(v.fog_enabled !== undefined ? { fog_enabled: v.fog_enabled } : {}) }).eq('id', v.id)),
      onMutate: (v) =>
        patchBoard(v.id, (b) => ({ ...b, ...(v.fog !== undefined ? { fog: v.fog } : {}), ...(v.fog_enabled !== undefined ? { fog_enabled: v.fog_enabled } : {}) })),
      onSettled: () => {
        if (qc.isMutating({ mutationKey: ['map-fog', campaignId] }) <= 1) void refresh();
      },
    }),

    // ---------- tokens ----------

    placeToken: m((v: { mapId: string; label: string; x: number; y: number; size?: number; color?: string; characterId?: string | null; combatantId?: string | null; hidden?: boolean }) =>
      check(
        supabase.from('map_tokens').insert({
          map_id: v.mapId,
          campaign_id: campaignId,
          label: v.label.slice(0, 100),
          x: v.x,
          y: v.y,
          size: v.size ?? 1,
          ...(v.color ? { color: v.color } : {}),
          character_id: v.characterId ?? null,
          combatant_id: v.combatantId ?? null,
          hidden: v.hidden ?? false,
        }),
      ),
    ),
    /** Coloca no mapa os combatentes do combate que ainda não estão nele, em volta de `near`. */
    placeCombatants: m(async (v: { map: MapBoard; combatants: Combatant[]; near: Cell; colors: { pc: string; foe: string } }) => {
      const onMap = new Set(v.map.tokens.map((t) => t.combatant_id).filter(Boolean));
      const pcOnMap = new Set(v.map.tokens.filter((t) => !t.combatant_id).map((t) => t.character_id).filter(Boolean));
      const missing = v.combatants.filter((c) => !onMap.has(c.id) && !(c.character?.kind === 'pc' && c.character_id && pcOnMap.has(c.character_id)));
      const spots = freeSpots(v.map, v.map.tokens, missing.map(() => 1), v.near);
      if (!spots.length) return 0;
      await check(
        supabase.from('map_tokens').insert(
          spots.map((s, i) => {
            const c = missing[i]!;
            return {
              map_id: v.map.id,
              campaign_id: campaignId,
              label: c.label.slice(0, 100),
              x: s.x,
              y: s.y,
              character_id: c.character_id,
              combatant_id: c.id,
              color: c.character?.kind === 'pc' ? v.colors.pc : v.colors.foe,
              hidden: c.hidden,
            };
          }),
        ),
      );
      return spots.length;
    }),
    /** Mover é otimista: o token vai na hora; se o servidor recusar, volta. */
    moveToken: useMutation({
      mutationFn: (v: { mapId: string; id: string; x: number; y: number }) => check(supabase.from('map_tokens').update({ x: v.x, y: v.y }).eq('id', v.id)),
      onMutate: async (v) => {
        await qc.cancelQueries({ queryKey: mapKeys.one(campaignId, v.mapId) });
        const prev = board(v.mapId)?.tokens.find((t) => t.id === v.id);
        patchBoard(v.mapId, (b) => ({ ...b, tokens: b.tokens.map((t) => (t.id === v.id ? { ...t, x: v.x, y: v.y } : t)) }));
        return { prev };
      },
      onError: (_e, v, ctx) => {
        if (ctx?.prev) patchBoard(v.mapId, (b) => ({ ...b, tokens: b.tokens.map((t) => (t.id === v.id ? ctx.prev! : t)) }));
      },
    }),
    updateToken: useMutation({
      mutationFn: (v: { mapId: string; id: string; patch: Partial<Pick<MapToken, 'size' | 'hidden' | 'color' | 'label' | 'x' | 'y'>> }) =>
        check(supabase.from('map_tokens').update(v.patch).eq('id', v.id)),
      onMutate: (v) => patchBoard(v.mapId, (b) => ({ ...b, tokens: b.tokens.map((t) => (t.id === v.id ? { ...t, ...v.patch } : t)) })),
      onSettled: refresh,
    }),
    removeToken: useMutation({
      mutationFn: (v: { mapId: string; id: string }) => check(supabase.from('map_tokens').delete().eq('id', v.id)),
      onMutate: (v) => patchBoard(v.mapId, (b) => ({ ...b, tokens: b.tokens.filter((t) => t.id !== v.id) })),
      onSettled: refresh,
    }),

    // ---------- marcas ----------

    addMark: m(async (v: MarkData & { mapId: string; authorId: string; color: string; gmOnly?: boolean }) =>
      check(
        supabase.from('map_marks').insert({
          map_id: v.mapId,
          campaign_id: campaignId,
          author_id: v.authorId,
          kind: v.kind,
          data: v.data as unknown as NonNullable<Json>,
          color: v.color,
          gm_only: v.gmOnly ?? false,
        }),
      ),
    ),
    removeMark: useMutation({
      mutationFn: (v: { mapId: string; id: string }) => check(supabase.from('map_marks').delete().eq('id', v.id)),
      onMutate: (v) => patchBoard(v.mapId, (b) => ({ ...b, marks: b.marks.filter((x) => x.id !== v.id) })),
      onSettled: refresh,
    }),
    clearMarks: m((v: { mapId: string; ids: string[] }) => check(supabase.from('map_marks').delete().in('id', v.ids))),
  };
}
