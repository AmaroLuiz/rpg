import { EngineError } from './errors.js';

export type Value = number | string | boolean | null | Value[] | { [key: string]: Value };

export function isRecord(v: Value | undefined): v is { [key: string]: Value } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function toNumber(v: Value, where = 'valor'): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === '') return 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    if (!Number.isNaN(n)) return n;
  }
  throw new EngineError('type', `Esperava um número em ${where}, recebeu ${describe(v)}`, { value: v });
}

export function truthy(v: Value): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (isRecord(v)) return true;
  return Boolean(v);
}

export function equals(a: Value, b: Value): boolean {
  if (typeof a === typeof b && (typeof a !== 'object' || a === null || b === null)) return a === b;
  if ((typeof a === 'boolean' && typeof b === 'number') || (typeof a === 'number' && typeof b === 'boolean')) {
    return Number(a) === Number(b);
  }
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

export function describe(v: Value): string {
  if (v === null) return 'vazio';
  if (Array.isArray(v)) return 'uma lista';
  if (typeof v === 'object') return 'um registro';
  if (typeof v === 'string') return `o texto "${v}"`;
  return String(v);
}

export function format(v: Value): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  if (v === null) return '—';
  if (Array.isArray(v)) return `[${v.map(format).join(', ')}]`;
  if (typeof v === 'object') return '{…}';
  return String(v);
}
