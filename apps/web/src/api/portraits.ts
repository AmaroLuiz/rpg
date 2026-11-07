import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useUpdateCharacterMeta } from './characters';

const MAX = 512;

/** Reduz a foto no próprio aparelho (lado maior 512 px, WebP): sobe rápido mesmo com rede ruim. */
export async function resizeImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível ler a imagem'))), 'image/webp', 0.85),
  );
}

export function useUploadPortrait(campaignId: string, characterId: string) {
  const meta = useUpdateCharacterMeta(characterId);
  return useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
      const blob = await resizeImage(file);
      // Caminho começa pela mesa: é o que as regras do Storage conferem.
      const path = `${campaignId}/${characterId}-${Date.now()}.webp`;
      const { error } = await supabase.storage.from('portraits').upload(path, blob, { contentType: 'image/webp' });
      if (error) throw error;
      await meta.mutateAsync({ portrait_path: path });
      return path;
    },
  });
}

/** Link temporário (1 h) para mostrar o retrato; o bucket é privado. */
export function usePortraitUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['portrait-url', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('portraits').createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
