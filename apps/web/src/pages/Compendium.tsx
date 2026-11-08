import { compendiumFor } from '@rpg/templates/compendium';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useCampaign } from '../api/campaigns';
import { CompendiumBrowser } from '../compendium/CompendiumBrowser';
import { Card, Spinner } from '../components/ui';

/** Consulta do livro do sistema da mesa: rituais, poderes, origens, armas, equipamentos... */
export function Compendium() {
  const { id: campaignId = '' } = useParams();
  const { t } = useTranslation();
  const campaign = useCampaign(campaignId);
  const slug = campaign.data?.template?.slug;
  const compendium = slug ? compendiumFor(slug) : null;

  return (
    <>
      <Link to={`/mesas/${campaignId}`} className="text-accent">
        ← {campaign.data?.name ?? t('common.back')}
      </Link>
      <h1 className="font-display text-2xl font-semibold">{t('compendium.title')}</h1>
      {campaign.isPending ? (
        <Spinner label={t('common.loading')} />
      ) : compendium ? (
        <Card>
          <CompendiumBrowser compendium={compendium} />
        </Card>
      ) : (
        <p className="text-muted">{t('compendium.unavailable')}</p>
      )}
    </>
  );
}
