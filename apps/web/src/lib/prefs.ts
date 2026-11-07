export type Theme = 'dark' | 'light' | 'system';
export interface Prefs {
  theme: Theme;
  fontScale: 1 | 1.125 | 1.25;
}

const KEY = 'rpg.prefs';

export function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    return { theme: p.theme ?? 'system', fontScale: p.fontScale ?? 1 };
  } catch {
    return { theme: 'system', fontScale: 1 };
  }
}

/** Grava e aplica na hora: classe .dark no <html> e tamanho base da fonte. */
export function savePrefs(p: Prefs) {
  localStorage.setItem(KEY, JSON.stringify(p));
  const dark = p.theme === 'system' ? !window.matchMedia('(prefers-color-scheme: light)').matches : p.theme === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.fontSize = `${p.fontScale * 100}%`;
}
