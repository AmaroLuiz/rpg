import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type Role = 'gm' | 'player';

export interface CampaignSummary {
  id: string;
  name: string;
  description: string;
  template: { name: string; slug: string } | null;
  members: Array<{ user_id: string; role: Role }>;
}

export interface Member {
  user_id: string;
  role: Role;
  joined_at: string;
  profile: { id: string; display_name: string } | null;
}

export interface CampaignDetail extends Omit<CampaignSummary, 'members'> {
  invite_code: string;
  gm_id: string;
  created_at: string;
  members: Member[];
}

const keys = {
  all: ['campaigns'] as const,
  one: (id: string) => ['campaigns', id] as const,
  templates: ['templates'] as const,
};

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

export function useTemplates() {
  return useQuery({
    queryKey: keys.templates,
    staleTime: Infinity,
    queryFn: () => unwrap(supabase.from('templates').select('id, slug, name').order('name')),
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: keys.all,
    queryFn: () =>
      unwrap(
        supabase
          .from('campaigns')
          .select('id, name, description, template:templates(name, slug), members:campaign_members(user_id, role)')
          .order('updated_at', { ascending: false }),
      ) as Promise<CampaignSummary[]>,
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: keys.one(id),
    queryFn: () =>
      unwrap(
        supabase
          .from('campaigns')
          .select(
            'id, name, description, invite_code, gm_id, created_at, template:templates(name, slug), members:campaign_members(user_id, role, joined_at, profile:profiles(id, display_name))',
          )
          .eq('id', id)
          // Sem linha = mesa apagada ou sem acesso: vira null, não erro.
          .maybeSingle(),
      ) as Promise<CampaignDetail | null>,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; templateSlug: string; description: string }) =>
      unwrap(supabase.rpc('create_campaign', { p_name: v.name, p_template_slug: v.templateSlug, p_description: v.description })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useJoinCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => unwrap(supabase.rpc('join_campaign', { p_code: code })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useRegenerateInvite(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(supabase.rpc('regenerate_invite_code', { p_campaign: id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.one(id) }),
  });
}

export function useRemoveMember(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const rows = await unwrap(
        supabase.from('campaign_members').delete().eq('campaign_id', campaignId).eq('user_id', userId).select('user_id'),
      );
      if (!rows.length) throw new Error('Sem permissão para remover esta pessoa.');
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.all, exact: true });
      void qc.invalidateQueries({ queryKey: keys.one(campaignId) });
    },
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const rows = await unwrap(supabase.from('campaigns').delete().eq('id', id).select('id'));
      if (!rows.length) throw new Error('Só o mestre apaga a mesa.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all, exact: true }),
  });
}

export function useProfile(userId: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: () =>
      unwrap(supabase.from('profiles').select('id, display_name').eq('id', userId).single()) as Promise<{ id: string; display_name: string }>,
  });
}

export function useUpdateProfile(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) =>
      unwrap(supabase.from('profiles').update({ display_name: displayName }).eq('id', userId).select('id').single()),
    onSuccess: () => qc.invalidateQueries(),
  });
}
