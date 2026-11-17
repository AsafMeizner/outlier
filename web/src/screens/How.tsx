import { TIERS } from '../../../shared/tiers.ts';
import { useUser } from '../app/guards.tsx';
import { useDistance, useStage } from '../app/stage-context.tsx';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { Window } from '../ui/Window.tsx';
import './screens.css';

export function How() {
  const { t } = useI18n();
  const dist = useDistance();
  const { theme } = useStage();
  const { me } = useUser();
  const s = me.settings;
  return (
    <Window title={t('how.title')} size="md" tone="paper">
      <div className="how">
        <p>{t('how.p1', { n: s.promptsPerDay, s: s.roundSeconds })}</p>
        <p>{t(theme.copy.how)}</p>
        <table className="table how-tiers">
          <tbody>
            {TIERS.map(x => (
              <tr key={x.id}>
                <td><span className="px-tier" data-tier={x.id}>{t(`tier.${x.id}` as AnyKey)}</span></td>
                <td>{t(`tierBlurb.${x.id}` as AnyKey)}</td>
                <td className="n strong">{dist(x.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{t('how.p3')}</p>
        <p>{t('how.p4')}</p>
        <p>{t('how.p5')}</p>
      </div>
    </Window>
  );
}
