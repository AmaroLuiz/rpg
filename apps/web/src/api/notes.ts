import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type NoteVisibility = 'private' | 'gm' | 'public';

export interface Note {
  id: string;
  author_id: string;
  title: string;
  body: string;
  visibility: NoteVisibility;
  updated_at: string;
  author: { display_name: string } | null;
}

const key = (campaignId: string) => ['notes', campaignId] as const;

/** Notas que a pessoa pode ver na mesa (as dela + públicas + "para o mestre" se for mestre). */
export function useNotes(campaignId: string) {
  return useQuery({
    queryKey: key(campaignId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('id, author_id, title, body, visibility, updated_at, author:profiles(display_name)')
        .eq('campaign_id', campaignId)
        .eq('kind', 'note')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as unknown as Note[];
    },
  });
}

export function useSaveNote(campaignId: string, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (n: { id?: string; title: string; body: string; visibility: NoteVisibility }) => {
      const q = n.id
        ? supabase.from('notes').update({ title: n.title, body: n.body, visibility: n.visibility }).eq('id', n.id).select('id')
        : supabase.from('notes').insert({ campaign_id: campaignId, author_id: userId, title: n.title, body: n.body, visibility: n.visibility }).select('id');
      const { data, error } = await q;
      if (error) throw error;
      if (!data.length) throw new Error('Sem permissão para editar esta nota.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(campaignId) }),
  });
}

export function useDeleteNote(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(campaignId) }),
  });
}
