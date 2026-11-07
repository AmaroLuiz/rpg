import type { Value } from '@rpg/engine';

export function formatValue(v: Value, format?: 'number' | 'text' | 'percent' | 'signed'): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') {
    const n = Number.isInteger(v) ? v : Math.round(v * 100) / 100;
    const txt = String(n).replace('.', ',').replace('-', '−');
    if (format === 'signed') return n >= 0 ? `+${txt}` : txt;
    if (format === 'percent') return `${txt}%`;
    return txt;
  }
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return '…';
  return v;
}

export function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.').replace('−', '-');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Para recursos: "12" define; "+3" cura; "−3" ou "-3" causa dano. */
export function parseResourceEntry(text: string): { kind: 'set' | 'add'; n: number } | null {
  const n = parseNumber(text);
  if (n === null) return null;
  return { kind: /^\s*[+\-−]/.test(text) ? 'add' : 'set', n };
}
