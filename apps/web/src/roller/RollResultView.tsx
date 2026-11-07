import type { RollResult } from '@rpg/engine';
import { useTranslation } from 'react-i18next';
import { cx } from '../components/ui';
import { formatValue } from '../sheet/format';

/** Total grande e, embaixo, cada dado (descartados riscados), bônus e situacional. */
export function RollResultView({ result, size = 'lg' }: { result: RollResult; size?: 'lg' | 'sm' }) {
  const { t } = useTranslation();
  const natural = result.dice.length === 1 && result.dice[0]!.sides === 20 ? result.dice[0]!.dice.find((d) => d.kept)?.value : undefined;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-3">
        <span className={cx('font-display font-semibold tabular-nums', size === 'lg' ? 'text-5xl' : 'text-2xl')}>{formatValue(result.total)}</span>
        {natural === 20 && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs font-medium text-ok">{t('roller.nat20')}</span>}
        {natural === 1 && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">{t('roller.nat1')}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
        {result.dice.map((g, gi) => (
          <span key={gi} className="flex flex-wrap items-center gap-1">
            <span className="mr-0.5">{g.notation}</span>
            {g.dice.map((d, di) => (
              <span
                key={di}
                className={cx(
                  'inline-grid min-w-7 place-items-center rounded-md border px-1 tabular-nums',
                  d.kept ? 'border-line bg-surface-2 text-ink' : 'border-transparent text-muted line-through',
                  g.isPool && d.success && 'border-ok text-ok',
                )}
                title={d.rolls.length > 1 ? d.rolls.join(' + ') : undefined}
              >
                {d.value}
              </span>
            ))}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted">{result.text}</p>
    </div>
  );
}
