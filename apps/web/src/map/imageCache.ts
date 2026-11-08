import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Imagens dos mapas guardadas no aparelho (Cache Storage), para o mapa abrir sem internet.
 * O caminho no Storage leva a data do envio, então nunca muda de conteúdo: dá para guardar para sempre.
 * Fica fora do React Query porque o cache dele vai para o IndexedDB, e um object URL não sobrevive a recarregar.
 */

const CACHE = 'map-images';
const keyFor = (path: string) => `https://map-images.local/${encodeURIComponent(path)}`;
const urls = new Map<string, Promise<string>>();

const hasCaches = () => typeof caches !== 'undefined';

async function load(path: string): Promise<string> {
  const cache = hasCaches() ? await caches.open(CACHE) : null;
  const hit = await cache?.match(keyFor(path));
  if (hit) return URL.createObjectURL(await hit.blob());
  const { data, error } = await supabase.storage.from('maps').createSignedUrl(path, 600);
  if (error) throw error;
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error(`Não foi possível baixar a imagem do mapa (${res.status})`);
  const blob = await res.blob();
  await cache?.put(keyFor(path), new Response(blob, { headers: { 'content-type': blob.type || 'image/webp' } }));
  return URL.createObjectURL(blob);
}

export function mapImageUrl(path: string): Promise<string> {
  let p = urls.get(path);
  if (!p) {
    p = load(path);
    // Falhou (sem rede e sem cópia): tenta de novo na próxima vez.
    p.catch(() => urls.delete(path));
    urls.set(path, p);
  }
  return p;
}

/** Guarda direto a imagem recém-enviada pelo mestre (não precisa baixar de volta). */
export async function rememberMapImage(path: string, blob: Blob) {
  if (hasCaches()) await (await caches.open(CACHE)).put(keyFor(path), new Response(blob, { headers: { 'content-type': blob.type } }));
  urls.set(path, Promise.resolve(URL.createObjectURL(blob)));
}

export async function forgetMapImage(path: string) {
  const p = urls.get(path);
  urls.delete(path);
  p?.then((u) => URL.revokeObjectURL(u), () => {});
  if (hasCaches()) await (await caches.open(CACHE)).delete(keyFor(path));
}

/** Ao sair da conta. */
export async function clearMapImages() {
  for (const p of urls.values()) p.then((u) => URL.revokeObjectURL(u), () => {});
  urls.clear();
  if (hasCaches()) await caches.delete(CACHE);
}

export function useMapImage(path: string | null | undefined): { url: string | null; error: unknown } {
  const [state, setState] = useState<{ path: string | null; url: string | null; error: unknown }>({ path: null, url: null, error: null });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    mapImageUrl(path).then(
      (url) => alive && setState({ path, url, error: null }),
      (error) => alive && setState({ path, url: null, error }),
    );
    return () => {
      alive = false;
    };
  }, [path]);
  return state.path === path ? state : { url: null, error: null };
}
