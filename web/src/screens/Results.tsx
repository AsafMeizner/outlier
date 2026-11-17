// What everyone answered, prompt by prompt, from most to least given, with your own answer marked.
import { useParams } from 'react-router';
import type { RevealPrompt, RevealResponse } from '../../../shared/api.ts';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { copyText } from '../lib/clipboard.ts';
import { fmtDistance, fmtNumber } from '../lib/format.ts';
import { useReveal } from '../lib/queries.ts';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { useToast } from '../ui/Toast.tsx';
import { Window } from '../ui/Window.tsx';
import './screens.css';

const SQUARES = ['⬛', '⬜', '🟩', '🟦', '🟪', '🟧'];

export function Results() {
  const { key = '' } = useParams();
  const { t } = useI18n();
  const q = useReveal(key);
  const title = q.data?.dayNumber ? `${t('results.title')} · #${q.data.dayNumber}` : q.data?.game ? q.data.game.title : t('results.title');
  return (
    <Window title={title} size="lg">
      {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : <ResultsBody data={q.data} />}
    </Window>
  );
}

function ResultsBody({ data }: { data: RevealResponse }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const unit = t('common.metres');
  const total = data.prompts.reduce((n, p) => n + (p.mine?.points ?? 0), 0);
  const played = data.prompts.some(p => p.mine);

  const copy = async (): Promise<void> => {
    const head = data.dayNumber ? `Outlier #${data.dayNumber}` : `Outlier: ${data.game?.title ?? ''}`;
    const line = data.prompts.map(p => SQUARES[p.mine?.points ? p.mine.tier : 0]).join('');
    const ok = await copyText(`${head}\n${line}\n${fmtDistance(locale, total, unit)}`);
    toast(ok ? t('results.copied') : t('common.error'), ok ? 'good' : 'bad');
  };

  return (
    <div className="results">
      <div className="results-head">
        {played ? (
          <div className="results-total">
            <span className="faint">{t('results.total')}</span>
            <strong className="num">{fmtDistance(locale, total, unit)}</strong>
          </div>
        ) : null}
        <p className="muted">{t('results.players', { n: data.players })}</p>
        {played ? (
          <button type="button" className="px-btn px-btn--sun px-btn--small" onClick={() => void copy()}>
            {t('results.copy')}
          </button>
        ) : null}
      </div>
      <ol className="results-list">
        {data.prompts.map(p => (
          <PromptResult key={p.position} p={p} players={data.players} />
        ))}
      </ol>
    </div>
  );
}

function PromptResult({ p, players }: { p: RevealPrompt; players: number }) {
  const { t, locale } = useI18n();
  const given = p.answers.filter(a => a.count > 0);
  const top = Math.max(1, ...given.map(a => a.count));
  const mine = p.mine;
  return (
    <li className="rp px-box">
      <header className="rp-head">
        <span className="rp-cat" lang={p.lang} dir="auto">
          {p.category}
        </span>
        <h2 className="rp-text" lang={p.lang} dir="auto">
          {p.text}
        </h2>
      </header>
      {mine ? (
        <div className="rp-mine" data-tier={mine.points ? mine.tier : 0}>
          <span className="px-tier" data-tier={mine.points ? mine.tier : 0}>
            {mine.points ? t(`tier.${mine.tier}` as AnyKey) : t('results.noAnswer')}
          </span>
          <span dir="auto">{mine.answer ? t('results.youSaid', { a: mine.answer }) : mine.raw ? `“${mine.raw}”` : t('results.noAnswer')}</span>
          {mine.points ? <span className="num rp-points">+{fmtDistance(locale, mine.points, t('common.metres'))}</span> : null}
          {mine.outcome === 'awarded' ? <span className="faint">{t('results.awarded')}</span> : null}
          {mine.answer ? <span className="faint">{mine.same > 0 ? t('results.same', { n: mine.same }) : t('results.alone')}</span> : null}
        </div>
      ) : null}
      <ul className="rp-answers">
        {given.map(a => (
          <li key={a.answer} className={`rp-a${mine?.answer === a.answer ? ' is-mine' : ''}`} data-tier={a.tier}>
            <span className="rp-a-name" dir="auto">
              {a.answer}
            </span>
            <span className="rp-a-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(4, (a.count / top) * 100)}%` }} />
            </span>
            <span className="rp-a-n num">{fmtNumber(locale, a.count)}</span>
          </li>
        ))}
        {p.missed > 0 ? (
          <li className="rp-a rp-a--missed" data-tier={0}>
            <span className="rp-a-name">{t('results.noAnswer')}</span>
            <span className="rp-a-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(4, (p.missed / Math.max(top, players)) * 100)}%` }} />
            </span>
            <span className="rp-a-n num">{fmtNumber(locale, p.missed)}</span>
          </li>
        ) : null}
      </ul>
      <details className="rp-all">
        <summary>{t('results.allAnswers', { n: p.answers.length })}</summary>
        <ul>
          {p.answers.map(a => (
            <li key={a.answer} data-tier={a.tier}>
              <span className="px-tier" data-tier={a.tier}>
                {a.tier}
              </span>{' '}
              <span dir="auto">{a.answer}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}
