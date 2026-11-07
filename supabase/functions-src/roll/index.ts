/**
 * Edge Function "roll" (Deno). Liga a regra de handler.ts ao Supabase.
 * Fonte; o arquivo que roda é supabase/functions/roll/index.js, gerado por `pnpm build:functions`.
 */
import { createClient } from '@supabase/supabase-js';
import { cryptoRng, type InventoryItem, type Modifier } from '@rpg/engine';
import { handleRoll, type RollStore } from './handler';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!;
const rng = cryptoRng();

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'Use POST' }, { status: 405, headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  // Cliente "como a pessoa": tudo que é lido passa pelo RLS dela.
  const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  // Cliente de serviço: só para gravar a rolagem (jogadores não inserem em rolls).
  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  const store: RollStore = {
    async userId() {
      const { data } = await asUser.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
      return data.user?.id ?? null;
    },
    async role(campaignId, uid) {
      const { data } = await asUser.from('campaign_members').select('role').eq('campaign_id', campaignId).eq('user_id', uid).maybeSingle();
      return (data?.role as 'gm' | 'player' | undefined) ?? null;
    },
    async character(id) {
      const { data } = await asUser.from('characters').select('id, campaign_id, owner_id, name, data, template_version_id').eq('id', id).maybeSingle();
      return data;
    },
    async templateSchema(versionId) {
      const { data, error } = await asUser.from('template_versions').select('schema').eq('id', versionId).single();
      if (error) throw error;
      return data.schema;
    },
    async items(characterId) {
      const { data } = await asUser.from('items').select('id, name, quantity, equipped, data, modifiers').eq('holder_type', 'character').eq('holder_id', characterId);
      return (data ?? []).map(
        (it): InventoryItem => ({ id: it.id, nome: it.name, quantidade: Number(it.quantity), equipado: it.equipped, data: it.data ?? {}, modifiers: (it.modifiers ?? []) as Modifier[] }),
      );
    },
    async insertRoll(row) {
      const { data, error } = await admin.from('rolls').insert(row).select('*').single();
      if (error) throw error;
      return data;
    },
  };

  try {
    const body = await req.json().catch(() => null);
    const res = await handleRoll(body, store, rng);
    return Response.json(res.body, { status: res.status, headers: cors });
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'Erro ao rolar' }, { status: 500, headers: cors });
  }
});
