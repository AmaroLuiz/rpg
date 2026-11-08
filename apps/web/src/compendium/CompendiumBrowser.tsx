import type { Compendium, CompendiumEntry, CompendiumKind } from '@rpg/templates/compendium';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx, Input } from '../components/ui';

/** Cor de cada Elemento, legível nos dois temas. */
const ELEMENT_COLORS: Record<string, string> = {
  Sangue: '#c2412d',
  Morte: '#7d7d86',
  Conhecimento: '#c99a1e',
  Energia: '#9b59c9',
  Medo: '#5b8fc7',
};

/** Estatísticas que aparecem na linha resumida de cada tipo. */
const META: Record<CompendiumKind, string[]> = {
  ritual: ['Círculo', 'Execução', 'Alcance'],
  poder: ['Classe', 'Elemento', 'Custo'],
  trilha: ['Classe'],
  origem: ['Perícias'],
  arma: ['Dano', 'Crítico', 'Alcance', 'Categoria'],
  municao: ['Categoria', 'Duração'],
  protecao: ['Defesa', 'Categoria', 'Espaços'],
  equipamento: ['Categoria', 'Espaços'],
  modificacao: ['Efeito'],
  maldicao: ['Elemento'],
  item_amaldicoado: ['Elemento', 'Uso'],
  criatura: ['VD', 'Tipo'],
};

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function filterValue(e: CompendiumEntry, key: string): string | undefined {
  const v = key === 'group' ? e.group : e.stats[key];
  return v === undefined || v === '' ? undefined : String(v);
}

function elementOf(e: CompendiumEntry) {
  const el = String(e.stats.Elemento ?? '');
  return Object.keys(ELEMENT_COLORS).find((k) => el.startsWith(k));
}

function Chip({ active, onClick, children, color }: { active: boolean; onClick(): void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition',
        active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:border-muted',
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
      {children}
    </button>
  );
}

function EntryDetails({ e }: { e: CompendiumEntry }) {
  const { t } = useTranslation();
  const stats = Object.entries(e.stats);
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl bg-surface-2/50 p-3 text-sm">
      {stats.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {stats.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="whitespace-pre-line">{e.text}</p>
      {e.power && (
        <p>
          <strong>{e.power.name}.</strong> {e.power.text}
        </p>
      )}
      {e.abilities && (
        <ul className="flex flex-col gap-1.5">
          {e.abilities.map((a) => (
            <li key={a.name}>
              <span className="font-medium">
                NEX {a.nex} — {a.name}.
              </span>{' '}
              {a.text}
            </li>
          ))}
        </ul>
      )}
      {e.discente && (
        <p>
          <span className="font-medium text-accent">{t('compendium.discente')}</span> {e.discente}
        </p>
      )}
      {e.verdadeiro && (
        <p>
          <span className="font-medium text-accent">{t('compendium.verdadeiro')}</span> {e.verdadeiro}
        </p>
      )}
      {e.affinity && (
        <p>
          <span className="font-medium text-accent">{t('compendium.affinity')}</span> {e.affinity}
        </p>
      )}
      {e.page && <p className="text-xs text-muted">{t('compendium.page', { page: e.page })}</p>}
    </div>
  );
}

/**
 * Consulta do livro: busca, abas por tipo e filtros (elemento, círculo, classe...). Com onPick,
 * cada entrada ganha um botão para ir para a ficha.
 */
export function CompendiumBrowser({
  compendium,
  kinds,
  onPick,
  pickLabel,
}: {
  compendium: Compendium;
  /** Restringe aos tipos indicados (ex.: só rituais ao adicionar na lista de rituais). */
  kinds?: CompendiumKind[];
  onPick?(e: CompendiumEntry): void;
  pickLabel?: string;
}) {
  const { t } = useTranslation();
  const available = compendium.kinds.filter((k) => !kinds || kinds.includes(k.id));
  const [kind, setKind] = useState<CompendiumKind>(available[0]!.id);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const info = available.find((k) => k.id === kind) ?? available[0]!;

  const ofKind = useMemo(() => compendium.entries.filter((e) => e.kind === info.id), [compendium, info.id]);
  const options = useMemo(
    () =>
      info.filters.map((key) => ({
        key,
        values: [...new Set(ofKind.map((e) => filterValue(e, key)).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
      })),
    [info, ofKind],
  );
  const q = norm(query.trim());
  const results = useMemo(
    () =>
      // Com busca, procura em todos os tipos visíveis; sem busca, mostra a aba atual com filtros.
      (q ? compendium.entries.filter((e) => available.some((k) => k.id === e.kind)) : ofKind)
        .filter((e) => q || Object.entries(filters).every(([k, v]) => filterValue(e, k) === v))
        .filter((e) => !q || norm(`${e.name} ${e.group ?? ''} ${e.text}`).includes(q))
        .sort((a, b) => (q && norm(a.name).startsWith(q) !== norm(b.name).startsWith(q) ? (norm(a.name).startsWith(q) ? -1 : 1) : a.name.localeCompare(b.name, 'pt-BR'))),
    [q, compendium, available, ofKind, filters],
  );

  const pick = (e: CompendiumEntry) => {
    onPick?.(e);
    setPicked((s) => new Set(s).add(e.id));
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">{t('compendium.search')}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input type="search" value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder={t('compendium.searchPlaceholder')} className="pl-10" />
      </label>

      {available.length > 1 && !q && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible" role="tablist" aria-label={t('compendium.kinds')}>
          {available.map((k) => (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={k.id === info.id}
              onClick={() => {
                setKind(k.id);
                setFilters({});
                setOpen(null);
              }}
              className={cx(
                'min-h-10 shrink-0 rounded-xl px-3 text-sm font-medium transition',
                k.id === info.id ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink hover:brightness-95',
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      {!q &&
        options
          .filter((o) => o.values.length > 1)
          .map((o) => (
            <div key={o.key} className="-mx-1 flex gap-2 overflow-x-auto px-1 sm:flex-wrap sm:overflow-visible" role="group" aria-label={o.key === 'group' ? t('compendium.group') : o.key}>
              <Chip active={!filters[o.key]} onClick={() => setFilters(({ [o.key]: _, ...rest }) => rest)}>
                {t('compendium.all')}
              </Chip>
              {o.values.map((v) => (
                <Chip key={v} active={filters[o.key] === v} color={o.key === 'Elemento' ? ELEMENT_COLORS[v] : undefined} onClick={() => setFilters((f) => ({ ...f, [o.key]: v }))}>
                  {v}
                </Chip>
              ))}
            </div>
          ))}

      <p className="text-sm text-muted" aria-live="polite">
        {t('compendium.count', { count: results.length })}
      </p>

      <ul className="flex flex-col divide-y divide-line">
        {results.map((e) => {
          const isOpen = open === e.id;
          const el = elementOf(e);
          const meta = META[e.kind]
            .map((k) => e.stats[k])
            .filter((v) => v !== undefined && v !== '' && v !== '—' && v !== e.group)
            .join(' · ');
          const done = picked.has(e.id);
          return (
            <li key={e.id} className="py-2">
              <div className="flex items-center gap-2">
                <button type="button" className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>
                  <ChevronDown className={cx('size-4 shrink-0 text-muted transition', isOpen && 'rotate-180')} aria-hidden />
                  {el && <span className="size-2.5 shrink-0 rounded-full" style={{ background: ELEMENT_COLORS[el] }} title={String(e.stats.Elemento)} aria-hidden />}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {q && `${compendium.kinds.find((k) => k.id === e.kind)?.label} · `}
                      {[e.kind === 'ritual' ? e.stats.Elemento : e.group, meta].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
                {onPick && (
                  <button
                    type="button"
                    onClick={() => pick(e)}
                    aria-label={`${pickLabel ?? t('compendium.add')}: ${e.name}`}
                    className={cx(
                      'flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-xl px-2.5 text-sm font-medium',
                      done ? 'bg-ok/15 text-ok' : 'bg-accent-soft text-accent',
                    )}
                  >
                    {done ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                    <span className="hidden sm:inline">{done ? t('compendium.added') : (pickLabel ?? t('compendium.add'))}</span>
                  </button>
                )}
              </div>
              {isOpen && <EntryDetails e={e} />}
            </li>
          );
        })}
      </ul>
      {results.length === 0 && <p className="py-4 text-center text-muted">{t('compendium.empty')}</p>}
      <p className="text-xs text-muted">{t('compendium.source', { source: compendium.source })}</p>
    </div>
  );
}
