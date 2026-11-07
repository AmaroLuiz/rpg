import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type NoteVisibility = 'private' | 'gm' | 'public';
export type NoteKind = 'note' | 'session' | 'npc' | 'location' | 'faction';

export interface Note {
  id: string;
  author_id: string;
  kind: NoteKind;
  title: string;
  body: string;
  tags: string[];
  visibility: NoteVisibility;
  session_date: string | null;
  updated_at: string;
  author: { display_name: string } | null;
}

export interface NoteFilter {
  kinds?: NoteKind[];
  search?: string;
  tag?: string | null;
}

const key = (campaignId: string, f: NoteFilter = {}) => ['notes', campaignId, f] as const;

/** Notas que a pessoa pode ver (as dela + públicas + "para o mestre" se for mestre), com busca em português. */
export function useNotes(campaignId: string, filter: NoteFilter = { kinds: ['note'] }) {
  return useQuery({
    queryKey: key(campaignId, filter),
    queryFn: async () => {
      let q = supabase
        .from('notes')
        .select('id, author_id, kind, title, body, tags, visibility, session_date, updated_at, author:profiles(display_name)')
        .eq('campaign_id', campaignId);
      if (filter.kinds?.length) q = q.in('kind', filter.kinds);
      if (filter.tag) q = q.contains('tags', [filter.tag]);
      if (filter.search?.trim()) q = q.textSearch('search', filter.search.trim(), { config: 'portuguese', type: 'websearch' });
      q = filter.kinds?.length === 1 && filter.kinds[0] === 'session'
        ? q.order('session_date', { ascending: false, nullsFirst: false }).order('updated_at', { ascending: false })
        : q.order('updated_at', { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Note[];
    },
  });
}

export type NoteDraft = { id?: string; title: string; body: string; visibility: NoteVisibility; kind?: NoteKind; tags?: string[]; session_date?: string | null };

export function useSaveNote(campaignId: string, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (n: NoteDraft) => {
      const fields = {
        title: n.title,
        body: n.body,
        visibility: n.visibility,
        ...(n.kind ? { kind: n.kind } : {}),
        ...(n.tags ? { tags: n.tags } : {}),
        ...(n.session_date !== undefined ? { session_date: n.session_date } : {}),
      };
      const q = n.id
        ? supabase.from('notes').update(fields).eq('id', n.id).select('id')
        : supabase.from('notes').insert({ ...fields, campaign_id: campaignId, author_id: userId }).select('id');
      const { data, error } = await q;
      if (error) throw error;
      if (!data.length) throw new Error('Sem permissão para editar esta nota.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', campaignId] }),
  });
}

export function useDeleteNote(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', campaignId] }),
  });
}
