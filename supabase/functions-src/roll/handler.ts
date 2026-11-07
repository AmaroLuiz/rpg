/**
 * Regra da rolagem no servidor, sem dependência de Deno nem do Supabase (testável no Node).
 * - Só membros da mesa rolam; rolar por um personagem exige ser o dono ou o mestre.
 * - Rolagem secreta ("gm") só o mestre faz; "self_gm" é do jogador para o mestre.
 * - O cálculo usa a ficha salva no servidor e o mesmo motor do app.
 */
import { EngineError, loadTemplate, rollExpression, Sheet, type CharacterData, type CompiledTemplate, type InventoryItem, type RollResult, type Rng } from '@rpg/engine';
import { z } from 'zod';

export const RollRequestSchema = z
  .object({
    campaign_id: z.string().uuid(),
    character_id: z.string().uuid().optional(),
    roll_id: z.string().min(1).max(64).optional(),
    item_key: z.string().min(1).max(64).optional(),
    expression: z.string().min(1).max(200).optional(),
    label: z.string().max(120).optional(),
    dados: z.number().int().min(-10).max(10).optional(),
    bonus: z.number().int().min(-100).max(100).optional(),
    visibility: z.enum(['public', 'gm', 'self_gm']).default('public'),
    offline: z.boolean().optional(),
    /** Rolagem feita no aparelho sem internet, enviada depois. Entra no histórico marcada como offline. */
    offline_result: z
      .object({
        label: z.string().max(200),
        expression: z.string().max(200),
        total: z.number().finite(),
        text: z.string().max(2000),
        bonus: z.number().finite().default(0),
        dice: z.array(z.unknown()).max(20),
        rollId: z.string().nullable().optional(),
        itemKey: z.string().optional(),
        rolled_at: z.string().max(40).optional(),
      })
      .optional(),
  })
  .refine((r) => r.roll_id || r.expression || r.offline_result, { message: 'Informe roll_id ou expression' })
  .refine((r) => !r.roll_id || r.character_id, { message: 'roll_id exige character_id' });

export type RollRequest = z.infer<typeof RollRequestSchema>;

export interface CharacterForRoll {
  id: string;
  campaign_id: string;
  owner_id: string;
  name: string;
  data: CharacterData;
  template_version_id: string;
}

export interface RollRow {
  id: string;
  campaign_id: string;
  user_id: string;
  character_id: string | null;
  label: string;
  expression: string;
  result: RollResult;
  total: number;
  visibility: 'public' | 'gm' | 'self_gm';
  offline: boolean;
  created_at: string;
}

export interface RollStore {
  userId(): Promise<string | null>;
  role(campaignId: string, userId: string): Promise<'gm' | 'player' | null>;
  character(id: string): Promise<CharacterForRoll | null>;
  templateSchema(versionId: string): Promise<unknown>;
  items(characterId: string): Promise<InventoryItem[]>;
  insertRoll(row: Omit<RollRow, 'id' | 'created_at'>): Promise<RollRow>;
}

export interface HandlerResult {
  status: number;
  body: RollRow | { error: string };
}

const compiled = new Map<string, CompiledTemplate>();

function fail(status: number, error: string): HandlerResult {
  return { status, body: { error } };
}

export async function handleRoll(input: unknown, store: RollStore, rng: Rng): Promise<HandlerResult> {
  const parsed = RollRequestSchema.safeParse(input);
  if (!parsed.success) return fail(400, parsed.error.issues.map((i) => i.message).join('; '));
  const req = parsed.data;

  const uid = await store.userId();
  if (!uid) return fail(401, 'É preciso entrar na conta');
  const role = await store.role(req.campaign_id, uid);
  if (!role) return fail(403, 'Você não é membro desta mesa');
  const isGm = role === 'gm';

  // Mestre não precisa de "só para o mestre": vira secreta. Jogador não faz secreta.
  let visibility = req.visibility;
  if (visibility === 'gm' && !isGm) return fail(403, 'Só o mestre faz rolagem secreta');
  if (visibility === 'self_gm' && isGm) visibility = 'gm';

  try {
    let result: RollResult;
    let characterId: string | null = null;
    if (req.offline_result) {
      // Sem como refazer a rolagem: grava o que o aparelho rolou, marcado como offline para todos verem.
      if (req.character_id) {
        const ch = await store.character(req.character_id);
        if (!ch || ch.campaign_id !== req.campaign_id) return fail(404, 'Personagem não encontrado');
        if (ch.owner_id !== uid && !isGm) return fail(403, 'Só o dono ou o mestre rola por este personagem');
        characterId = ch.id;
      }
      const o = req.offline_result;
      result = { rollId: o.rollId ?? null, label: o.label, expression: o.expression, total: o.total, text: o.text, bonus: o.bonus, dice: o.dice as RollResult['dice'], ...(o.itemKey ? { itemKey: o.itemKey } : {}) };
      const row = await store.insertRoll({
        campaign_id: req.campaign_id,
        user_id: uid,
        character_id: characterId,
        label: result.label.slice(0, 200),
        expression: result.expression,
        result,
        total: result.total,
        visibility,
        offline: true,
      });
      return { status: 200, body: row };
    }
    if (req.character_id) {
      const ch = await store.character(req.character_id);
      if (!ch || ch.campaign_id !== req.campaign_id) return fail(404, 'Personagem não encontrado');
      if (ch.owner_id !== uid && !isGm) return fail(403, 'Só o dono ou o mestre rola por este personagem');
      let tpl = compiled.get(ch.template_version_id);
      if (!tpl) {
        tpl = loadTemplate(await store.templateSchema(ch.template_version_id));
        compiled.set(ch.template_version_id, tpl);
      }
      const sheet = new Sheet(tpl, ch.data, await store.items(ch.id));
      const opts = { rng, dados: req.dados ?? 0, bonus: req.bonus ?? 0, ...(req.item_key ? { itemKey: req.item_key } : {}) };
      result = req.roll_id
        ? sheet.roll(req.roll_id, opts)
        : sheet.rollExpression(req.expression!, { ...opts, ...(req.label ? { label: req.label } : {}) });
      characterId = ch.id;
      const nome = typeof ch.data.values.nome === 'string' && ch.data.values.nome ? ch.data.values.nome : ch.name;
      if (nome) result = { ...result, label: `${nome}: ${result.label}` };
    } else {
      result = rollExpression(req.expression!, rng, req.label);
      if (req.bonus) {
        result = { ...result, total: result.total + req.bonus, bonus: req.bonus, text: `${result.text} ${req.bonus > 0 ? '+' : '−'} ${Math.abs(req.bonus)} (situacional)` };
      }
    }

    const row = await store.insertRoll({
      campaign_id: req.campaign_id,
      user_id: uid,
      character_id: characterId,
      label: result.label.slice(0, 200),
      expression: result.expression,
      result,
      total: result.total,
      visibility,
      offline: req.offline ?? false,
    });
    return { status: 200, body: row };
  } catch (e) {
    if (e instanceof EngineError) return fail(400, e.message);
    throw e;
  }
}
