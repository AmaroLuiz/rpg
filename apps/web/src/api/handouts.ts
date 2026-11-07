import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { resizeImage } from './portraits';

export interface Handout {
  id: string;
  campaign_id: string;
  title: string;
  body: string;
  image_path: string | null;
  revealed_to_all: boolean;
  revealed_at: string | null;
  updated_at: string;
  recipients: Array<{ user_id: string }>;
}

const key = (campaignId: string) => ['handouts', campaignId] as const;

async function check<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

/** Mestre recebe todos; jogador só os revelados para ele (RLS). */
export function useHandouts(campaignId: string) {
  return useQuery({
    queryKey: key(campaignId),
    queryFn: async () =>
      (await check(
        supabase
          .from('handouts')
          .select('id, campaign_id, title, body, image_path, revealed_to_all, revealed_at, updated_at, recipients:handout_recipients(user_id)')
          .eq('campaign_id', campaignId)
          .order('revealed_at', { ascending: false, nullsFirst: true })
          .order('updated_at', { ascending: false }),
      )) as unknown as Handout[],
  });
}

export function useHandoutImage(path: string | null) {
  return useQuery({
    queryKey: ['handout-image', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => (await check(supabase.storage.from('handouts').createSignedUrl(path!, 3600)))!.signedUrl,
  });
}

export function useHandoutActions(campaignId: string) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: key(campaignId) });
  return {
    save: useMutation({
      mutationFn: async (v: { id?: string; title: string; body: string; image?: File | null }) => {
        let image_path: string | undefined;
        if (v.image) {
          const blob = await resizeImage(v.image, 1600);
          image_path = `${campaignId}/handout-${Date.now()}.webp`;
          const { error } = await supabase.storage.from('handouts').upload(image_path, blob, { contentType: 'image/webp' });
          if (error) throw error;
        }
        const patch = { title: v.title, body: v.body, ...(image_path ? { image_path } : {}) };
        return v.id
          ? check(supabase.from('handouts').update(patch).eq('id', v.id).select('id').single())
          : check(supabase.from('handouts').insert({ ...patch, campaign_id: campaignId }).select('id').single());
      },
      onSuccess: done,
    }),
    revealAll: useMutation({
      mutationFn: (v: { id: string; on: boolean }) =>
        check(supabase.from('handouts').update({ revealed_to_all: v.on, ...(v.on ? { revealed_at: new Date().toISOString() } : {}) }).eq('id', v.id)),
      onSuccess: done,
    }),
    setRecipient: useMutation({
      mutationFn: async (v: { id: string; userId: string; on: boolean }) => {
        if (v.on) {
          await check(supabase.from('handout_recipients').insert({ handout_id: v.id, user_id: v.userId, campaign_id: campaignId }));
          await check(supabase.from('handouts').update({ revealed_at: new Date().toISOString() }).eq('id', v.id).is('revealed_at', null));
        } else {
          await check(supabase.from('handout_recipients').delete().eq('handout_id', v.id).eq('user_id', v.userId));
        }
      },
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: string) => check(supabase.from('handouts').delete().eq('id', id)), onSuccess: done }),
  };
}
