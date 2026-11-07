import { useSheetCtx } from './context';
import { ConditionsField } from './Conditions';
import { NumberInput, Row, selectOptions, SelectInput, TextInput, Toggle, ValueWithBreakdown } from './fields';
import { InventoryField } from './Inventory';
import { ListField } from './ListField';
import { NotesField } from './Notes';
import { PortraitPicker } from './Portrait';
import { ResourceField } from './Resource';
import { RollButtons } from './RollButtons';

/** Desenha um item do layout do template: campo, lista ou bloco especial ($conditions, $inventory, $notes). */
export function FieldView({ id }: { id: string }) {
  const { compiled, sheet, data, canEdit, change, campaignId, characterId: ctxCharacterId } = useSheetCtx();

  if (id === '$conditions') return <ConditionsField />;
  if (id === '$inventory') return <InventoryField />;
  if (id === '$notes') return <NotesField campaignId={campaignId} />;
  if (id.startsWith('$rolls')) return <RollButtons category={id.split(':')[1] ?? ''} />;

  const list = compiled.lists.get(id);
  if (list) return <ListField list={list} />;

  const def = compiled.fields.get(id);
  if (!def) return null;
  const result = sheet.field(id);
  const setValue = (value: unknown) => change([{ op: 'set', path: ['values', id], value }]);

  switch (def.type) {
    case 'resource':
      return <ResourceField fieldId={id} />;
    case 'computed':
      return (
        <Row label={def.label}>
          <ValueWithBreakdown result={result} format={def.format} label={def.label} />
        </Row>
      );
    case 'number': {
      const base = typeof result.base === 'number' ? result.base : 0;
      const effective = typeof result.value === 'number' ? result.value : base;
      return (
        <Row
          label={def.label}
          sub={
            effective !== base ? (
              <div className="flex justify-end">
                <ValueWithBreakdown result={result} label={def.label} />
              </div>
            ) : undefined
          }
        >
          <NumberInput
            label={def.label}
            value={base}
            step={def.step ?? 1}
            disabled={!canEdit}
            onSet={setValue}
            // Atributos e números simples: soma no próprio valor guardado (sem "inc" porque o
            // ausente vale o padrão do template, não zero).
            onAdd={(n) => setValue(base + n)}
          />
        </Row>
      );
    }
    case 'text':
    case 'longtext':
      return <TextInput label={def.label} multiline={def.type === 'longtext'} value={String(data.values[id] ?? '')} disabled={!canEdit} onCommit={setValue} />;
    case 'select':
      return (
        <Row label={def.label}>
          <SelectInput label={def.label} value={result.value} options={selectOptions(def, compiled)} disabled={!canEdit} onChange={setValue} />
        </Row>
      );
    case 'checkbox':
      return (
        <Row label={def.label}>
          <Toggle label={def.label} checked={result.value === true} disabled={!canEdit} onChange={setValue} />
        </Row>
      );
    case 'image':
      return <PortraitPicker campaignId={campaignId} characterId={ctxCharacterId} canEdit={canEdit} />;
  }
}
