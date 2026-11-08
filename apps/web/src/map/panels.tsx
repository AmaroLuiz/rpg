import { Check, Eye, EyeOff, Minus, Plus, Trash2, Undo2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { CharacterListItem } from '../api/characters';
import { useCombatActions, type Combatant, type Encounter } from '../api/combat';
import { useMapActions, type GridPatch, type MapBoard, type MapMark, type MapToken } from '../api/maps';
import { NpcVitals, PcVitals } from '../combat/Vitals';
import { Button, ErrorNote, Input, Select, Textarea, cx } from '../components/ui';
import { friendlyError } from '../lib/errors';
import { PortraitImage } from '../sheet/Portrait';
import { Toggle } from '../sheet/fields';
import { formatMeters, type AreaShape, type Grid } from './geometry';
import { SWATCHES } from './layers';

export function Panel({ children, onClose, title, header }: { children: ReactNode; onClose?(): void; title?: string; header?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="max-h-[45dvh] overflow-y-auto border-t border-line bg-surface px-4 py-3" aria-label={title}>
      {(title || header || onClose) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {header ?? (title && <h2 className="truncate font-medium">{title}</h2>)}
          {onClose && (
            <button type="button" className="-mr-2 grid size-11 shrink-0 place-items-center rounded-lg hover:bg-surface-2" aria-label={t('maps.token.close')} onClick={onClose}>
              <X className="size-5" aria-hidden />
            </button>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange(v: T): void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('min-h-10 flex-1 rounded-lg px-2 text-sm font-medium', o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Swatches({ value, onChange }: { value: string; onChange(c: string): void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={t('maps.draw.color', { color: c })}
          aria-pressed={c === value}
          onClick={() => onChange(c)}
          className={cx('grid size-10 place-items-center rounded-full border-2', c === value ? 'border-accent' : 'border-line')}
          style={{ background: c }}
        >
          {c === value && <Check className="size-4" style={{ color: c === '#1d1a16' ? '#fff' : '#1d1a16' }} aria-hidden />}
        </button>
      ))}
    </div>
  );
}

function GmOnly({ value, onChange }: { value: boolean; onChange(v: boolean): void }) {
  const { t } = useTranslation();
  return (
    <label className="flex min-h-11 items-center justify-between gap-2 text-sm">
      {t('maps.gmOnly')}
      <Toggle label={t('maps.gmOnly')} checked={value} disabled={false} onChange={onChange} />
    </label>
  );
}

// ---------- token ----------

/** Combatente ligado ao token: o próprio, ou o PJ dono da ficha (PJ no combate não precisa de token novo). */
export function combatantFor(t: MapToken, enc: Encounter | null | undefined): Combatant | undefined {
  if (!enc) return undefined;
  if (t.combatant_id) return enc.combatants.find((c) => c.id === t.combatant_id);
  if (t.character_id) return enc.combatants.find((c) => c.character_id === t.character_id && c.character?.kind === 'pc');
  return undefined;
}

export function TokenPanel({
  campaignId,
  board,
  token,
  enc,
  character,
  portraitPath,
  isGm,
  isOwner,
  online,
  isTurn,
  underFog,
  onClose,
}: {
  campaignId: string;
  board: MapBoard;
  token: MapToken;
  enc: Encounter | null | undefined;
  character: CharacterListItem | undefined;
  portraitPath: string | null;
  isGm: boolean;
  isOwner: boolean;
  online: boolean;
  isTurn: boolean;
  underFog: boolean;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const actions = useMapActions(campaignId);
  const combat = useCombatActions(campaignId);
  const c = combatantFor(token, enc);
  const isPc = character?.kind === 'pc' || c?.character?.kind === 'pc';
  const canSeeSheet = !!token.character_id && (isGm || !!character);
  const update = (patch: Partial<MapToken>) => actions.updateToken.mutate({ mapId: board.id, id: token.id, patch });
  const resize = (size: number) => {
    const s = Math.min(size, board.cols, board.rows);
    update({ size: s, x: Math.min(token.x, board.cols - s), y: Math.min(token.y, board.rows - s) });
  };
  const error = actions.updateToken.error ?? actions.removeToken.error;

  return (
    <Panel
      onClose={onClose}
      header={
      <div className="flex min-w-0 items-center gap-3">
        <PortraitImage path={portraitPath} name={token.label} className="size-14 rounded-full" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold">{token.label}</p>
          <p className="flex flex-wrap gap-x-2 text-xs text-muted">
            {isTurn && <span className="font-medium text-accent">{t('maps.token.turn')}</span>}
            {token.hidden && <span>{t('maps.token.hidden')}</span>}
            {underFog && isGm && <span>{t('maps.token.underFog')}</span>}
          </p>
        </div>
      </div>
      }
    >
      {isPc && token.character_id ? (
        <PcVitals c={{ ...(c ?? {}), character_id: token.character_id, label: token.label } as Combatant} canEdit={online && (isGm || isOwner)} />
      ) : c ? (
        <NpcVitals c={c} isGm={isGm && online} onDelta={(resource, delta) => combat.adjust.mutate({ id: c.id, resource, delta })} />
      ) : null}
      {canSeeSheet && (
        <Link to={`/mesas/${campaignId}/personagens/${token.character_id}`} className="flex min-h-11 items-center text-sm font-medium text-accent">
          {t('maps.token.sheet')} →
        </Link>
      )}
      {isGm && online && (
        <>
          <Segmented
            label={t('maps.token.size')}
            value={token.size}
            onChange={resize}
            options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${t(`maps.token.size${n}`)} ${n}×${n}` }))}
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted">{t('maps.token.color')}</span>
            <Swatches value={token.color} onChange={(color) => update({ color })} />
          </div>
          <label className="flex min-h-11 items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              {token.hidden ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              {t('maps.token.hide')}
            </span>
            <Toggle label={t('maps.token.hide')} checked={token.hidden} disabled={false} onChange={(hidden) => update({ hidden })} />
          </label>
          <Button
            variant="danger"
            onClick={() => {
              if (!confirm(t('maps.token.removeConfirm', { name: token.label }))) return;
              actions.removeToken.mutate({ mapId: board.id, id: token.id });
              onClose();
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            {t('maps.token.remove')}
          </Button>
        </>
      )}
      {error && <ErrorNote>{friendlyError(error)}</ErrorNote>}
    </Panel>
  );
}

// ---------- colocar tokens ----------

export interface Placing {
  label: string;
  characterId: string | null;
  combatantId: string | null;
  color: string;
  hidden: boolean;
}

export const TOKEN_COLORS = { pc: '#3b82c4', npc: '#8e5cc4', foe: '#d64545', free: '#9a5a0c' };

export function PlacePanel({
  board,
  characters,
  enc,
  onPick,
  onPlaceAll,
  placeAllBusy,
  message,
  onClose,
}: {
  board: MapBoard;
  characters: CharacterListItem[];
  enc: Encounter | null | undefined;
  onPick(p: Placing): void;
  onPlaceAll(): void;
  placeAllBusy: boolean;
  message: string | null;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const [free, setFree] = useState('');
  const onMapChars = new Set(board.tokens.map((x) => x.character_id).filter(Boolean));
  const onMapCombatants = new Set(board.tokens.map((x) => x.combatant_id).filter(Boolean));
  const list = characters.filter((c) => c.status !== 'draft');
  const combatants = enc?.combatants ?? [];
  const row = (key: string, label: string, sub: string | null, placed: boolean, pick: () => void) => (
    <li key={key}>
      <button type="button" onClick={pick} className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-3 text-left hover:bg-surface-2">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 text-xs text-muted">{placed ? t('maps.place.onMap') : sub}</span>
      </button>
    </li>
  );
  return (
    <Panel title={t('maps.place.title')} onClose={onClose}>
      <Hint>{t('maps.place.hint')}</Hint>
      {combatants.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium text-muted">
            {t('maps.place.combat')} · {enc!.name}
          </h3>
          <Button variant="secondary" className="mb-1 w-full" busy={placeAllBusy} onClick={onPlaceAll}>
            {t('maps.place.allCombat')}
          </Button>
          {message && <p className="text-sm text-muted" role="status">{message}</p>}
          <ul className="flex flex-col">
            {combatants.map((c) =>
              row(c.id, c.label, c.hidden ? t('combat.hidden') : null, onMapCombatants.has(c.id) || (c.character?.kind === 'pc' && onMapChars.has(c.character_id)), () =>
                onPick({
                  label: c.label,
                  characterId: c.character_id,
                  combatantId: c.id,
                  color: c.character?.kind === 'pc' ? TOKEN_COLORS.pc : TOKEN_COLORS.foe,
                  hidden: c.hidden,
                }),
              ),
            )}
          </ul>
        </div>
      )}
      <div>
        <h3 className="mb-1 text-sm font-medium text-muted">{t('maps.place.characters')}</h3>
        {list.length === 0 && <Hint>{t('maps.place.empty')}</Hint>}
        <ul className="flex flex-col">
          {list.map((c) => {
            const label = c.nome || c.name;
            return row(c.id, label, c.kind === 'pc' ? (c.owner?.display_name ?? null) : t(`characters.${c.kind}`), onMapChars.has(c.id), () =>
              onPick({ label, characterId: c.id, combatantId: null, color: c.kind === 'pc' ? TOKEN_COLORS.pc : TOKEN_COLORS.npc, hidden: c.visibility === 'gm' }),
            );
          })}
        </ul>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (free.trim()) onPick({ label: free.trim(), characterId: null, combatantId: null, color: TOKEN_COLORS.free, hidden: false });
        }}
      >
        <Input aria-label={t('maps.place.freeLabel')} placeholder={t('maps.place.free')} value={free} onChange={(e) => setFree(e.target.value)} maxLength={100} />
        <Button type="submit" variant="secondary" disabled={!free.trim()}>
          {t('maps.place.freeAdd')}
        </Button>
      </form>
    </Panel>
  );
}

// ---------- grid ----------

function NumberRow({ label, value, step, min, max, onChange }: { label: string; value: number; step: number; min: number; max: number; onChange(v: number): void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const set = (v: number) => onChange(Math.max(min, Math.min(max, Math.round(v * 100) / 100)));
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      <button type="button" className="grid size-11 place-items-center rounded-lg bg-surface-2" aria-label={t('maps.grid.less', { label })} onClick={() => set(value - step)}>
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        inputMode="decimal"
        aria-label={label}
        className="h-11 w-16 rounded-lg border border-line bg-surface text-center tabular-nums"
        value={draft ?? String(value).replace('.', ',')}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === null) return;
          const n = Number(draft.replace(',', '.'));
          setDraft(null);
          if (Number.isFinite(n)) set(n);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <button type="button" className="grid size-11 place-items-center rounded-lg bg-surface-2" aria-label={t('maps.grid.more', { label })} onClick={() => set(value + step)}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export function GridPanel({
  campaignId,
  board,
  grid,
  dirty,
  onChange,
  onSaved,
  onDiscard,
  onClose,
}: {
  campaignId: string;
  board: MapBoard;
  grid: Grid;
  dirty: boolean;
  onChange(p: GridPatch): void;
  onSaved(): void;
  onDiscard(): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const actions = useMapActions(campaignId);
  const [file, setFile] = useState<HTMLInputElement | null>(null);
  const patch = (): GridPatch => {
    const out: GridPatch = {};
    for (const k of ['cell_px', 'offset_x', 'offset_y', 'cols', 'rows', 'cell_meters', 'diagonal'] as const) {
      if (grid[k] !== board[k]) (out as Record<string, unknown>)[k] = grid[k];
    }
    return out;
  };
  const fitImage = () =>
    onChange({
      cols: Math.max(1, Math.min(100, Math.floor((board.image_w - grid.offset_x) / grid.cell_px))),
      rows: Math.max(1, Math.min(100, Math.floor((board.image_h - grid.offset_y) / grid.cell_px))),
    });
  const error = actions.setGrid.error ?? actions.setImage.error;
  return (
    <Panel title={t('maps.tool.grid')} onClose={onClose}>
      <Hint>{t('maps.grid.hint')}</Hint>
      <NumberRow label={t('maps.grid.cell')} value={grid.cell_px} step={1} min={8} max={1000} onChange={(cell_px) => onChange({ cell_px })} />
      <NumberRow label={t('maps.grid.offsetX')} value={grid.offset_x} step={1} min={-1000} max={1000} onChange={(offset_x) => onChange({ offset_x })} />
      <NumberRow label={t('maps.grid.offsetY')} value={grid.offset_y} step={1} min={-1000} max={1000} onChange={(offset_y) => onChange({ offset_y })} />
      <NumberRow label={t('maps.grid.cols')} value={grid.cols} step={1} min={1} max={100} onChange={(cols) => onChange({ cols: Math.round(cols) })} />
      <NumberRow label={t('maps.grid.rows')} value={grid.rows} step={1} min={1} max={100} onChange={(rows) => onChange({ rows: Math.round(rows) })} />
      {board.image_path && (
        <Button variant="secondary" onClick={fitImage}>
          {t('maps.grid.fitImage')}
        </Button>
      )}
      <NumberRow label={t('maps.grid.meters')} value={grid.cell_meters} step={0.5} min={0.1} max={100} onChange={(cell_meters) => onChange({ cell_meters })} />
      <label className="flex flex-col gap-1.5 text-sm">
        {t('maps.grid.diagonal')}
        <Select value={grid.diagonal} onChange={(e) => onChange({ diagonal: e.target.value as Grid['diagonal'] })}>
          <option value="alternate">{t('maps.grid.alternate')}</option>
          <option value="equal">{t('maps.grid.equal')}</option>
        </Select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" disabled={!dirty} onClick={onDiscard}>
          <Undo2 className="size-4" aria-hidden />
          {t('maps.grid.discard')}
        </Button>
        <Button disabled={!dirty} busy={actions.setGrid.isPending} onClick={() => actions.setGrid.mutate({ map: board, patch: patch() }, { onSuccess: onSaved })}>
          {t('maps.grid.save')}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
        <input
          ref={setFile}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={t('maps.changeImage')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) actions.setImage.mutate({ map: board, image: f });
            e.target.value = '';
          }}
        />
        <Button variant="secondary" busy={actions.setImage.isPending} onClick={() => file?.click()}>
          {board.image_path ? t('maps.changeImage') : t('maps.chooseImage')}
        </Button>
        {board.image_path && (
          <Button variant="ghost" onClick={() => confirm(t('maps.removeImageConfirm')) && actions.setImage.mutate({ map: board, image: null })}>
            {t('maps.removeImage')}
          </Button>
        )}
      </div>
      {error && <ErrorNote>{friendlyError(error)}</ErrorNote>}
    </Panel>
  );
}

// ---------- névoa ----------

export function FogPanel({
  board,
  mode,
  brush,
  onMode,
  onBrush,
  onEnabled,
  onFill,
  onClose,
}: {
  board: MapBoard;
  mode: 'reveal' | 'cover';
  brush: number;
  onMode(m: 'reveal' | 'cover'): void;
  onBrush(n: number): void;
  onEnabled(on: boolean): void;
  onFill(on: boolean): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  return (
    <Panel title={t('maps.tool.fog')} onClose={onClose}>
      <label className="flex min-h-11 items-center justify-between gap-2 font-medium">
        {t('maps.fog.enabled')}
        <Toggle label={t('maps.fog.enabled')} checked={board.fog_enabled} disabled={false} onChange={onEnabled} />
      </label>
      <Hint>{t('maps.fog.hint')}</Hint>
      <Segmented
        label={t('maps.tool.fog')}
        value={mode}
        onChange={onMode}
        options={[
          { value: 'reveal', label: t('maps.fog.reveal') },
          { value: 'cover', label: t('maps.fog.cover') },
        ]}
      />
      <Segmented label={t('maps.fog.brush')} value={brush} onChange={onBrush} options={[1, 3, 5].map((n) => ({ value: n, label: t('maps.fog.brushSize', { n }) }))} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onFill(true)}>
          {t('maps.fog.revealAll')}
        </Button>
        <Button variant="secondary" onClick={() => onFill(false)}>
          {t('maps.fog.coverAll')}
        </Button>
      </div>
    </Panel>
  );
}

// ---------- área ----------

export function AreaPanel({
  shape,
  sizeM,
  color,
  hits,
  cells,
  canPin,
  isGm,
  gmOnly,
  busy,
  onShape,
  onSize,
  onColor,
  onGmOnly,
  onPin,
  onClose,
}: {
  shape: AreaShape;
  sizeM: number;
  color: string;
  hits: string[] | null;
  cells: number;
  canPin: boolean;
  isGm: boolean;
  gmOnly: boolean;
  busy: boolean;
  onShape(s: AreaShape): void;
  onSize(m: number): void;
  onColor(c: string): void;
  onGmOnly(v: boolean): void;
  onPin(): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  return (
    <Panel title={t('maps.tool.area')} onClose={onClose}>
      <Segmented
        label={t('maps.area.shape')}
        value={shape}
        onChange={onShape}
        options={(['circle', 'cone', 'line'] as const).map((s) => ({ value: s, label: t(`maps.area.${s}`) }))}
      />
      <NumberRow label={t('maps.area.size')} value={sizeM} step={1.5} min={0.5} max={300} onChange={onSize} />
      <Swatches value={color} onChange={onColor} />
      {hits === null ? (
        <Hint>{t('maps.area.hint')}</Hint>
      ) : (
        <p className="text-sm" role="status">
          {t('maps.area.cells', { count: cells })} · {hits.length ? t('maps.area.hits', { names: hits.join(', ') }) : t('maps.area.hitsNone')}
        </p>
      )}
      {hits !== null && canPin && (
        <>
          {isGm && <GmOnly value={gmOnly} onChange={onGmOnly} />}
          <Button busy={busy} onClick={onPin}>
            {t('maps.area.pin')}
          </Button>
        </>
      )}
    </Panel>
  );
}

// ---------- desenho ----------

export function DrawPanel({
  color,
  onColor,
  isGm,
  gmOnly,
  onGmOnly,
  canUndo,
  onUndo,
  canClear,
  onClear,
  onClose,
}: {
  color: string;
  onColor(c: string): void;
  isGm: boolean;
  gmOnly: boolean;
  onGmOnly(v: boolean): void;
  canUndo: boolean;
  onUndo(): void;
  canClear: boolean;
  onClear(): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  return (
    <Panel title={t('maps.tool.draw')} onClose={onClose}>
      <Hint>{t('maps.draw.hint')}</Hint>
      <Swatches value={color} onChange={onColor} />
      {isGm && <GmOnly value={gmOnly} onChange={onGmOnly} />}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="size-4" aria-hidden />
          {t('maps.draw.undo')}
        </Button>
        {isGm && (
          <Button variant="danger" disabled={!canClear} onClick={() => confirm(t('maps.draw.clearConfirm')) && onClear()}>
            {t('maps.draw.clear')}
          </Button>
        )}
      </div>
    </Panel>
  );
}

// ---------- alfinete ----------

export function PinPanel({
  pending,
  isGm,
  color,
  onColor,
  busy,
  onSave,
  onCancel,
  onClose,
}: {
  pending: boolean;
  isGm: boolean;
  color: string;
  onColor(c: string): void;
  busy: boolean;
  onSave(text: string, gmOnly: boolean): void;
  onCancel(): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [gmOnly, setGmOnly] = useState(false);
  return (
    <Panel title={t('maps.tool.pin')} onClose={onClose}>
      {!pending ? (
        <Hint>{t('maps.pin.hint')}</Hint>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(text.trim(), gmOnly);
            setText('');
          }}
        >
          <Textarea aria-label={t('maps.pin.text')} placeholder={t('maps.pin.text')} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={500} autoFocus required />
          <Swatches value={color} onChange={onColor} />
          {isGm && <GmOnly value={gmOnly} onChange={setGmOnly} />}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" busy={busy}>
              {t('maps.pin.save')}
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

// ---------- marca selecionada ----------

export function MarkPanel({ mark, author, canDelete, onDelete, onClose }: { mark: MapMark; author: string | null; canDelete: boolean; onDelete(): void; onClose(): void }) {
  const { t } = useTranslation();
  const title =
    mark.kind === 'area'
      ? t('maps.area.sizeOf', { meters: formatMeters(mark.data.size_m), shape: t(`maps.area.${mark.data.shape}`).toLowerCase() })
      : t(`maps.mark.${mark.kind}`);
  return (
    <Panel title={title} onClose={onClose}>
      {mark.kind === 'pin' && <p className="whitespace-pre-line">{mark.data.text}</p>}
      <p className="text-xs text-muted">
        {author && t('maps.mark.by', { name: author })}
        {mark.gm_only && ` · ${t('maps.mark.gmOnly')}`}
      </p>
      {canDelete && (
        <Button variant="danger" onClick={onDelete}>
          <Trash2 className="size-4" aria-hidden />
          {t('maps.mark.delete')}
        </Button>
      )}
    </Panel>
  );
}
