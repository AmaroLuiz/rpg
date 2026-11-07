import type { CompiledTemplate, Modifier } from '@rpg/engine';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useItemSecret, useSaveItem, type HolderType, type ItemRow } from '../api/items';
import { Button, ErrorNote, Field, Input, Select, Textarea } from '../components/ui';
import { friendlyError } from '../lib/errors';

type Data = ItemRow['data'];

export function modifierTargets(c: CompiledTemplate) {
  return c.template.fields.filter((f) => f.type === 'number' || f.type === 'computed' || f.type === 'resource').map((f) => ({ id: f.id, label: f.label }));
}

export function describeModifiers(mods: Modifier[], c: CompiledTemplate): string {
  return mods
    .map((m) => {
      const v = typeof m.value === 'number' ? (m.value >= 0 ? `+${m.value}` : `${m.value}`.replace('-', '−')) : m.value;
      return `${v} ${c.fields.get(m.target)?.label ?? m.target}`;
    })
    .join(', ');
}

function ModifiersEditor({ value, onChange, compiled, label }: { value: Modifier[]; onChange(m: Modifier[]): void; compiled: CompiledTemplate; label: string }) {
  const { t } = useTranslation();
  const targets = modifierTargets(compiled);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-muted">{label}</legend>
      {value.map((m, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            inputMode="numeric"
            aria-label={t('items.modValue')}
            value={String(m.value)}
            onChange={(e) => {
              const n = Number(e.target.value.replace('−', '-'));
              onChange(value.map((x, j) => (j === i ? { ...x, value: Number.isFinite(n) ? n : 0 } : x)));
            }}
            className="h-11 w-16 rounded-xl border border-line bg-surface text-center tabular-nums"
          />
          <Select aria-label={t('items.modTarget')} value={m.target} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}>
            {targets.map((tg) => (
              <option key={tg.id} value={tg.id}>
                {tg.label}
              </option>
            ))}
          </Select>
          <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl text-danger hover:bg-surface-2" aria-label={t('items.modRemove')} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      ))}
      <Button type="button" variant="ghost" className="self-start text-sm text-accent" onClick={() => onChange([...value, { target: targets[0]?.id ?? '', op: 'add', value: 1 }])}>
        <Plus className="size-4" aria-hidden />
        {t('items.modAdd')}
      </Button>
    </fieldset>
  );
}

/** Formulário de item: nome, quantidade, campos de item do template e bônus. O mestre pode torná-lo misterioso. */
export function ItemEditor({
  campaignId,
  compiled,
  item,
  holder,
  isGm,
  onDone,
}: {
  campaignId: string;
  compiled: CompiledTemplate;
  item?: ItemRow;
  holder?: { type: HolderType; id?: string | null };
  isGm: boolean;
  onDone(): void;
}) {
  const { t } = useTranslation();
  const save = useSaveItem(campaignId);
  const secret = useItemSecret(item?.id, isGm && item?.identified === false);
  const invFields = compiled.template.inventory?.fields ?? [];
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [data, setData] = useState<Data>(() => {
    const d: Data = { ...(item?.data ?? {}) };
    for (const f of invFields) if (d[f.id] === undefined && 'default' in f && f.default !== undefined) d[f.id] = f.default as Data[string];
    return d;
  });
  const [mods, setMods] = useState<Modifier[]>(item?.modifiers ?? []);
  const [mysterious, setMysterious] = useState(item ? !item.identified : false);
  const [real, setReal] = useState<{ name: string; description: string; mods: Modifier[] } | null>(null);
  const realValue = real ?? (secret.data ? { name: secret.data.real_name, description: secret.data.real_description, mods: secret.data.real_modifiers } : { name: '', description: '', mods: [] });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = Number(quantity.replace(',', '.'));
    await save
      .mutateAsync({
        ...(item ? { id: item.id } : { holder_type: holder!.type, holder_id: holder!.id ?? null }),
        name: name.trim(),
        description,
        quantity: Number.isFinite(q) && q >= 0 ? q : 1,
        data,
        modifiers: mods,
        ...(isGm
          ? {
              identified: !mysterious,
              secret: mysterious ? { real_name: realValue.name.trim() || name.trim(), real_description: realValue.description, real_modifiers: realValue.mods } : item && !item.identified ? null : undefined,
            }
          : {}),
      })
      .then(onDone, () => {});
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl bg-surface-2/50 p-3">
      <Field label={mysterious ? t('items.fakeName') : t('items.name')}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('items.quantity')}>{(p) => <Input {...p} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
        {invFields
          .filter((f) => f.type === 'number')
          .map((f) => (
            <Field key={f.id} label={f.label}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={String(data[f.id] ?? '')}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(',', '.'));
                    setData({ ...data, [f.id]: e.target.value === '' ? null : Number.isFinite(n) ? n : (data[f.id] ?? null) });
                  }}
                />
              )}
            </Field>
          ))}
        {invFields
          .filter((f) => f.type === 'select')
          .map((f) => (
            <Field key={f.id} label={f.label}>
              {(p) => (
                <Select
                  {...p}
                  value={String(data[f.id] ?? '')}
                  onChange={(e) => {
                    const opt = f.type === 'select' ? f.options?.find((o) => String(o.value) === e.target.value) : undefined;
                    setData({ ...data, [f.id]: opt ? opt.value : null });
                  }}
                >
                  <option value="">—</option>
                  {f.type === 'select' &&
                    f.options?.map((o) => (
                      <option key={String(o.value)} value={String(o.value)}>
                        {o.label}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          ))}
      </div>
      <Field label={mysterious ? t('items.fakeDescription') : t('items.description')}>{(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />}</Field>
      <ModifiersEditor value={mods} onChange={setMods} compiled={compiled} label={mysterious ? t('items.fakeModifiers') : t('items.modifiers')} />

      {isGm && (
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={mysterious} onChange={(e) => setMysterious(e.target.checked)} />
          {t('items.mysterious')}
        </label>
      )}
      {isGm && mysterious && (
        <div className="flex flex-col gap-3 rounded-xl border border-accent/40 p-3">
          <p className="text-sm text-muted">{t('items.mysteriousHint')}</p>
          <Field label={t('items.realName')}>{(p) => <Input {...p} value={realValue.name} onChange={(e) => setReal({ ...realValue, name: e.target.value })} maxLength={120} />}</Field>
          <Field label={t('items.realDescription')}>{(p) => <Textarea {...p} value={realValue.description} onChange={(e) => setReal({ ...realValue, description: e.target.value })} rows={3} />}</Field>
          <ModifiersEditor value={realValue.mods} onChange={(m) => setReal({ ...realValue, mods: m })} compiled={compiled} label={t('items.realModifiers')} />
        </div>
      )}

      {save.error && <ErrorNote>{friendlyError(save.error)}</ErrorNote>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" busy={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
