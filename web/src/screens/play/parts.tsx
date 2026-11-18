// The pieces of the play screen that sit over the scene.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { CurrentRound, RoundSummary, RunState, SlugResponse } from '../../../../shared/api.ts';
import { api } from '../../lib/api.ts';
import { useDistance, useFlight, useZoneName } from '../../app/stage-context.tsx';
import { useI18n, type AnyKey } from '../../i18n/index.tsx';
import { sfx } from '../../game/sfx.ts';
import { PixelIcon } from '../../ui/PixelIcon.tsx';

/** Top-centre distance readout. Follows the hero live while it flies; shows landmarks as it passes them. */
export function FlightHud({ score, flying }: { score: number; flying: boolean }) {
  const { t } = useI18n();
  const flight = useFlight();
  const dist = useDistance();
  const zoneName = useZoneName();
  const points = flying ? flight.dist : score;
  return (
    <div className={`flighthud${flying ? ' is-flying' : ''}`} aria-hidden={flying}>
      <div className="flighthud-m num">{dist(Math.floor(points))}</div>
      <div className="flighthud-zone">{zoneName(points)}</div>
      {flying && flight.landmark ? (
        <div className="flighthud-caption" key={flight.landmarkAt}>
          {t(flight.landmark)}
        </div>
      ) : null}
    </div>
  );
}

/** Progress pips: one block per prompt, coloured by the tier it scored. */
export function Pips({ run }: { run: RunState }) {
  const { t } = useI18n();
  return (
    <ol className="pips" aria-label={t('play.prompt', { a: Math.min(run.position + 1, run.total), b: run.total })}>
      {Array.from({ length: run.total }, (_, i) => {
        const r = run.rounds.find(x => x.position === i);
        return <li key={i} className={`pip${i === run.position && !run.finished ? ' is-now' : ''}`} data-tier={r ? r.tier : undefined} />;
      })}
    </ol>
  );
}

/** The prompt, centred over the scene like a sign hanging in the sky. */
export function PromptPanel({ run, round, children }: { run: RunState; round: Pick<CurrentRound, 'text' | 'category' | 'lang' | 'position'>; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <section className="prompt px-window px-window--paper" aria-labelledby="prompt-text">
      <div className="prompt-top">
        <span className="prompt-count">{run.total ? t('play.prompt', { a: round.position + 1, b: run.total }) : `#${round.position + 1}`}</span>
        {run.practice ? <PracticeTag run={run} /> : null}
        <Pips run={run} />
        {children}
      </div>
      <p className="prompt-cat" lang={round.lang} dir="auto">
        {round.category}
      </p>
      <h1 id="prompt-text" className="prompt-text" lang={round.lang} dir="auto">
        {round.text}
      </h1>
      {run.mode === 'archive' ? <p className="prompt-note">{t('play.archiveNote')}</p> : null}
      {run.mode === 'custom' && run.game ? <p className="prompt-note">{run.game.title}</p> : null}
    </section>
  );
}

/** Bottom bar: the answer box, the Launch button and Pass. */
export function AnswerBar({ onGuess, onPass, busy, rejected, suggestion, lang }: { onGuess: (text: string) => void; onPass?: () => void; busy: boolean; rejected: { raw: string; n: number; reason?: 'used'; answer?: string } | null; suggestion: { raw: string; answer: string } | null; lang: string }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  // After a miss, keep the text but select it so typing replaces it.
  useEffect(() => {
    if (rejected) { input.current?.focus(); input.current?.select(); }
  }, [rejected]);
  // The suggestion only stands while the text is what the player sent.
  const pending = suggestion && suggestion.raw === text.trim() ? suggestion : null;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const v = text.trim();
    if (v && !busy) onGuess(v);
  };
  return (
    <form className={`answerbar${rejected ? ' is-rejected' : ''}${pending ? ' is-confirm' : ''}`} onSubmit={submit}>
      {pending ? (
        <div className="answerbar-confirm" role="alert">
          <span className="answerbar-typed"><small>{t('play.typed')}</small> <s dir="auto">{pending.raw}</s></span>
          <span className="answerbar-arrow" aria-hidden="true">▶</span>
          <span className="answerbar-fixed"><small>{t('play.countsAs')}</small> <b dir="auto">{pending.answer}</b></span>
          <span className="answerbar-again">{t('play.enterAgain')}</span>
        </div>
      ) : null}
      <div className="answerbar-row" key={rejected?.n ?? 0}>
        <label className="sr-only" htmlFor="answer">
          {t('play.yourAnswer')}
        </label>
        <input
          ref={input}
          id="answer"
          className="answerbar-input"
          value={text}
          onChange={e => { if (e.target.value.length > text.length) sfx.type(); setText(e.target.value); }}
          placeholder={t('play.placeholder')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={100}
          dir="auto"
          lang={lang}
          enterKeyHint="go"
        />
        <button type="submit" className="px-btn answerbar-go" disabled={busy || !text.trim()}>
          {pending ? t('play.confirmLaunch') : t('play.launch')}
          <span className="px-key">{t('common.enter')}</span>
        </button>
      </div>
      <div className="answerbar-under">
        <p className="answerbar-msg" role="alert">
          {rejected ? (rejected.reason === 'used' ? t('party.used', { a: rejected.answer ?? rejected.raw }) : t('play.notOnList', { a: rejected.raw })) : ' '}
        </p>
        {onPass ? (
          <button type="button" className="answerbar-pass" onClick={onPass} disabled={busy}>
            {t('play.pass')}
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** Before each prompt: what comes next, and the button that starts the clock. */
export function IntroCard({ run, onOpen, busy }: { run: RunState; onOpen: () => void; busy: boolean }) {
  const { t } = useI18n();
  const dist = useDistance();
  const next = run.upNext;
  useEnterKey(onOpen, !busy);
  if (!next) return null;
  return (
    <section className="intro px-window px-window--paper" aria-labelledby="intro-title">
      <div className="prompt-top">
        <span className="prompt-count">{run.total ? t('play.prompt', { a: next.position + 1, b: run.total }) : `#${next.position + 1}`}</span>
        {run.practice ? <PracticeTag run={run} /> : null}
        <Pips run={run} />
      </div>
      <h1 id="intro-title" className="intro-cat">
        {run.position === 0 ? t('play.readyFirst') : t('play.readyNext')}
      </h1>
      <p className="intro-note">{t('play.clockNote', { s: run.roundSeconds })}</p>
      {run.position > 0 ? <p className="intro-total num">{t('play.total', { d: dist(run.score) })}</p> : null}
      <button type="button" className="px-btn px-btn--big px-btn--block" onClick={onOpen} disabled={busy} autoFocus>
        {run.position === 0 ? t('play.first') : t('play.next')}
        <span className="px-key">{t('common.enter')}</span>
      </button>
    </section>
  );
}

/** After a round: the tier and distance, or what went wrong, then on to the next prompt. */
export function ResultCard({ round, same, finished, onNext }: { round: RoundSummary; same: number | null; finished: boolean; onNext: () => void }) {
  const { t } = useI18n();
  const dist = useDistance();
  useEnterKey(onNext, true);
  const scored = round.points > 0;
  return (
    <section className={`result px-window${scored ? '' : ' is-miss'}`} data-tier={round.tier} aria-live="polite">
      <div className="result-main">
        {scored ? (
          <>
            <span className="px-tier result-tier" data-tier={round.tier}>
              {t(`tier.${round.tier}` as AnyKey)}
            </span>
            <span className="result-dist num">+{dist(round.points)}</span>
          </>
        ) : (
          <span className="result-miss">{round.outcome === 'timeout' ? t('play.timeUp') : t('play.passed')}</span>
        )}
      </div>
      <div className="result-detail">
        {scored ? (
          <>
            <p className="result-answer" dir="auto">
              {round.answer}
            </p>
            {round.fuzzy && round.answer ? <p className="faint">{t('play.closeEnough', { a: round.answer })}</p> : null}
            <p className="muted">{same === null ? null : same > 0 ? t('play.colleagues', { n: same }) : t('play.nobodyElse')}</p>
          </>
        ) : (
          <>
            <p className="muted">{t('play.noDistance')}</p>
            {round.example ? (
              <p className="result-example" dir="auto">
                {t('play.example', { a: round.example })}
              </p>
            ) : null}
          </>
        )}
      </div>
      <button type="button" className="px-btn px-btn--sun result-next" onClick={onNext} autoFocus>
        {finished ? t('play.finish') : t('play.next')}
        <span className="px-key">{t('common.enter')}</span>
      </button>
    </section>
  );
}

/** End of the day's prompts. */
/** Practice runs: the pack (or Unlimited) and, in Unlimited, the misses left as hearts. */
function PracticeTag({ run }: { run: RunState }) {
  const { t } = useI18n();
  const p = run.practice;
  if (!p) return null;
  return (
    <span className="practice-tag">
      <span dir="auto">{p.kind === 'pack' ? p.pack : t('practice.unlimited')}</span>
      {p.kind === 'unlimited' ? (
        <span className="practice-hearts" aria-label={`${t('practice.misses')}: ${p.maxStrikes - p.strikes}`}>
          {Array.from({ length: p.maxStrikes }, (_, i) => <PixelIcon key={i} name="heart" size={12} className={i < p.maxStrikes - p.strikes ? 'is-on' : 'is-off'} />)}
        </span>
      ) : null}
    </span>
  );
}

/** End of a practice run: the score, the personal best, play again. */
function PracticeDone({ run }: { run: RunState }) {
  const { t } = useI18n();
  const dist = useDistance();
  const navigate = useNavigate();
  const p = run.practice;
  useEffect(() => { if (p?.newBest) sfx.unlock(); else sfx.dayDone(); }, [p?.newBest]);
  if (!p) return null;
  const again = async (): Promise<void> => {
    const r = await api.post<SlugResponse>('/api/practice', { kind: p.kind, pack: p.pack, lang: p.lang });
    await navigate(`/practice/${r.slug}`);
  };
  return (
    <section className="daydone px-window" aria-labelledby="daydone-title">
      <h1 id="daydone-title" className="daydone-title">{t('practice.runDone')}</h1>
      <p className="daydone-place" dir="auto">{p.kind === 'pack' ? p.pack : t('practice.unlimited')}</p>
      <p className="daydone-big num">{t('play.youFlew', { d: dist(run.score) })}</p>
      {p.newBest ? <p className="daydone-unlock">{t('practice.newBest')}</p> : p.best ? <p className="faint">{t('practice.best', { d: dist(p.best) })}</p> : null}
      <ol className="daydone-rounds">
        {run.rounds.map(r => (
          <li key={r.position}>
            <span className="px-tier" data-tier={r.tier}>{r.points ? t(`tier.${r.tier}` as AnyKey) : r.outcome === 'timeout' ? t('play.timeUp') : t('play.passed')}</span>
            <span className="daydone-cat" dir="auto">{r.text}</span>
            <span className="daydone-ans" dir="auto">{r.answer ?? r.example ?? '—'}</span>
          </li>
        ))}
      </ol>
      <div className="daydone-actions">
        <button type="button" className="px-btn px-btn--big" onClick={() => void again()} autoFocus>{t('practice.again')}</button>
        <Link to="/practice" className="px-btn px-btn--sun">{t('practice.allPacks')}</Link>
      </div>
    </section>
  );
}

export function DayDone({ run, newItems }: { run: RunState; newItems: boolean }) {
  if (run.practice) return <PracticeDone run={run} />;
  return <DailyDone run={run} newItems={newItems} />;
}

function DailyDone({ run, newItems }: { run: RunState; newItems: boolean }) {
  const { t } = useI18n();
  useEffect(() => { sfx.dayDone(); }, []);
  useEffect(() => { if (newItems) window.setTimeout(() => sfx.unlock(), 900); }, [newItems]);
  const dist = useDistance();
  const place = useZoneName()(run.score);
  return (
    <section className="daydone px-window px-window--paper" aria-labelledby="daydone-title">
      <h1 id="daydone-title" className="daydone-title">
        {t('play.dayDone')}
      </h1>
      <p className="daydone-big num">{t('play.youFlew', { d: dist(run.score) })}</p>
      <p className="daydone-place">{t('play.youReached', { place })}</p>
      <ol className="daydone-rounds">
        {run.rounds.map(r => (
          <li key={r.position}>
            <span className="px-tier" data-tier={r.tier}>
              {r.points ? t(`tier.${r.tier}` as AnyKey) : r.outcome === 'timeout' ? t('play.timeUp') : t('play.passed')}
            </span>
            <span className="daydone-cat" dir="auto">
              {r.category}
            </span>
            <span className="daydone-ans" dir="auto">
              {r.answer ?? '—'}
            </span>
          </li>
        ))}
      </ol>
      {newItems ? (
        <Link to="/wardrobe" className="daydone-unlock">
          <PixelIcon name="shirt" />
          {t('results.newItems')}
        </Link>
      ) : null}
      <div className="daydone-actions">
        {run.mode === 'live' ? (
          <p className="daydone-note">{t('results.tomorrow')}</p>
        ) : (
          <Link to={`/results/${run.date}`} className="px-btn px-btn--big" autoFocus>
            {t('archive.results')}
          </Link>
        )}
        {run.mode === 'live' ? (
          <Link to="/leaderboard" className="px-btn px-btn--sun">
            <PixelIcon name="trophy" />
            {t('nav.leaderboard')}
          </Link>
        ) : null}
        {run.mode === 'custom' && run.game ? (
          <Link to={`/g/${run.game.slug}`} className="px-btn px-btn--sun">
            {t('games.board')}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** Enter anywhere (outside text boxes) runs `fn`. */
function useEnterKey(fn: () => void, enabled: boolean): void {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; }, [fn]);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' || e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return; // the focused control handles it
      e.preventDefault();
      ref.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
