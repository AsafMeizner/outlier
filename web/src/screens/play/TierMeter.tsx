// The rarity reveal: five rungs light up one by one until the answer's tier, then the tier name pops.
import { useEffect, useState } from 'react';
import { TIERS } from '../../../../shared/tiers.ts';
import { sfx } from '../../game/sfx.ts';
import { useI18n, type AnyKey } from '../../i18n/index.tsx';
import { fmtDistance } from '../../lib/format.ts';

const STEP_MS = 280;

interface Props {
  tier: number;
  points: number;
  answer: string;
  /** Called once the meter has reached the tier and held for a moment. */
  onDone: () => void;
}

export function TierMeter({ tier, points, answer, onDone }: Props) {
  const { t, locale } = useI18n();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [step, setStep] = useState(reduce ? tier : 0);

  useEffect(() => {
    if (step < tier) {
      const id = window.setTimeout(() => { setStep(s => s + 1); sfx.pop(); }, step === 0 ? 120 : STEP_MS);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(onDone, reduce ? 300 : 650);
    return () => window.clearTimeout(id);
  }, [step, tier, onDone, reduce]);

  const reached = step >= tier;
  return (
    <div className="meter" role="status" aria-live="polite">
      <p className="meter-answer" dir="auto">
        “{answer}”
      </p>
      <ol className="meter-rungs">
        {TIERS.map(x => (
          <li key={x.id} className={`meter-rung${x.id <= step ? ' is-on' : ''}${x.id === tier && reached ? ' is-hit' : ''}`} data-tier={x.id}>
            <span>{t(`tier.${x.id}` as AnyKey)}</span>
          </li>
        ))}
      </ol>
      <p className={`meter-result${reached ? ' is-shown' : ''}`} data-tier={tier} aria-hidden={!reached}>
        <span className="meter-tier">{t(`tier.${tier}` as AnyKey)}!</span>
        <span className="meter-dist num">+{fmtDistance(locale, points, t('common.metres'))}</span>
      </p>
    </div>
  );
}
