import type { CharacterData } from '@rpg/engine';
import type { Json } from '../lib/database.types';
import { supabase } from '../lib/supabase';

/**
 * Exportação em JSON para guardar anos de campanha fora do servidor.
 * Lê com as permissões de quem exporta: o mestre leva tudo, inclusive segredos.
 */

async function rows<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

function download(name: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'mesa';

const today = () => new Date().toISOString().slice(0, 10);

export async function exportCampaign(campaignId: string) {
  const byCampaign = <T,>(table: string, cols = '*') => rows<T[]>(supabase.from(table as never).select(cols).eq('campaign_id', campaignId));
  const campaign = await rows<{ name: string; template_id: string } & Record<string, unknown>>(supabase.from('campaigns').select('*').eq('id', campaignId).single());
  const [members, characters, items, itemSecrets, pools, handouts, recipients, notes, rolls, encounters, combatants, combatantSecrets, folders] = await Promise.all([
    rows(supabase.from('campaign_members').select('user_id, role, joined_at, profile:profiles(display_name)').eq('campaign_id', campaignId)),
    byCampaign('characters'),
    byCampaign('items'),
    byCampaign('item_secrets'),
    byCampaign('loot_pools'),
    byCampaign('handouts'),
    byCampaign('handout_recipients'),
    byCampaign('notes', 'id, author_id, folder_id, kind, title, body, tags, visibility, session_date, created_at, updated_at'),
    rows(supabase.from('rolls').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(2000)),
    byCampaign('encounters'),
    byCampaign('combatants'),
    byCampaign('combatant_secrets'),
    byCampaign('folders'),
  ]);
  const versionIds = [...new Set((characters as Array<{ template_version_id: string }>).map((c) => c.template_version_id))];
  const templates = versionIds.length
    ? await rows(supabase.from('template_versions').select('id, version, schema, template:templates(slug, name)').in('id', versionIds))
    : [];
  download(`mesa-${slugify(campaign.name)}-${today()}.json`, {
    format: 'rpg-mesa',
    version: 1,
    exported_at: new Date().toISOString(),
    campaign,
    members,
    templates,
    characters,
    items,
    item_secrets: itemSecrets,
    loot_pools: pools,
    handouts,
    handout_recipients: recipients,
    notes,
    rolls,
    encounters,
    combatants,
    combatant_secrets: combatantSecrets,
    folders,
  });
}

export interface CharacterExport {
  format: 'rpg-ficha';
  version: 1;
  exported_at: string;
  template: { slug: string; version: number };
  character: { name: string; kind: string; data: CharacterData };
  items: Array<{ name: string; description: string; quantity: number; equipped: boolean; data: unknown; modifiers: unknown }>;
}

export async function exportCharacter(characterId: string) {
  const ch = await rows<{ name: string; kind: string; data: CharacterData; template_version_id: string }>(
    supabase.from('characters').select('name, kind, data, template_version_id').eq('id', characterId).single(),
  );
  const tv = await rows<{ version: number; template: { slug: string } }>(
    supabase.from('template_versions').select('version, template:templates(slug)').eq('id', ch.template_version_id).single(),
  );
  const items = await rows<CharacterExport['items']>(
    supabase.from('items').select('name, description, quantity, equipped, data, modifiers').eq('holder_type', 'character').eq('holder_id', characterId),
  );
  const name = (typeof ch.data.values?.nome === 'string' && ch.data.values.nome) || ch.name;
  const payload: CharacterExport = {
    format: 'rpg-ficha',
    version: 1,
    exported_at: new Date().toISOString(),
    template: { slug: tv.template.slug, version: tv.version },
    character: { name, kind: ch.kind, data: ch.data },
    items,
  };
  download(`ficha-${slugify(name)}-${today()}.json`, payload);
}

/** Importa uma ficha exportada para esta mesa. O sistema precisa ser o mesmo. Devolve o id da ficha nova. */
export async function importCharacter(campaignId: string, file: File): Promise<string> {
  let parsed: CharacterExport;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Arquivo inválido: não é um JSON.');
  }
  if (parsed?.format !== 'rpg-ficha' || !parsed.character?.data) throw new Error('Este arquivo não é uma ficha exportada pelo app.');
  const camp = await rows<{ template: { slug: string; name: string } }>(supabase.from('campaigns').select('template:templates(slug, name)').eq('id', campaignId).single());
  if (camp.template.slug !== parsed.template.slug) {
    throw new Error(`A ficha é de outro sistema (${parsed.template.slug}); esta mesa usa ${camp.template.name}.`);
  }
  const { creation: _c, ...data } = parsed.character.data;
  const row = await rows<{ id: string }>(
    supabase.rpc('create_character', {
      p_campaign: campaignId,
      p_name: parsed.character.name,
      p_data: data as unknown as Json,
    }),
  );
  await rows(supabase.from('characters').update({ status: 'active' }).eq('id', row.id));
  if (parsed.items?.length) {
    await rows(
      supabase.from('items').insert(
        parsed.items.map((it) => ({
          campaign_id: campaignId,
          holder_type: 'character' as const,
          holder_id: row.id,
          name: it.name,
          description: it.description ?? '',
          quantity: it.quantity ?? 1,
          equipped: !!it.equipped,
          data: (it.data ?? {}) as NonNullable<Json>,
          modifiers: (it.modifiers ?? []) as NonNullable<Json>,
        })),
      ),
    );
  }
  return row.id;
}
