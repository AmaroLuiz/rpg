import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useJoinCampaign } from '../api/campaigns';
import { ErrorNote, Spinner } from '../components/ui';
import { friendlyError } from '../lib/errors';

/** /convite/:code — entra na mesa assim que a pessoa estiver logada. */
export function Join() {
  const { code = '' } = useParams();
  const { t } = useTranslation();
  const join = useJoinCampaign();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    join.mutateAsync(code).then((id) => navigate(`/mesas/${id}`, { replace: true }), () => {});
  }, [code, join, navigate]);

  if (join.error)
    return (
      <>
        <h1 className="font-display text-2xl font-semibold">{t('join.title')}</h1>
        <ErrorNote>
          {t('join.failed')} {friendlyError(join.error)}
        </ErrorNote>
        <Link to="/" className="text-accent">
          ← {t('common.back')}
        </Link>
      </>
    );
  return <Spinner label={t('join.joining')} />;
}
