// The play screen. A small state machine around the server's run state:
//   intro (what's next) → round (clock running) → reveal (tier meter, then the flight) → result card → … → done
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { CurrentRound, GuessResponse, RoundSummary, RunState, WardrobeResponse } from '../../../../shared/api.ts';
import { useUser } from '../../app/guards.tsx';
import { useStage } from '../../app/stage-context.tsx';
import { music, sfx } from '../../game/sfx.ts';
import { useI18n } from '../../i18n/index.tsx';
import { api } from '../../lib/api.ts';
import { isDateKey, isGameKey } from '../../lib/format.ts';
import { keys } from '../../lib/queries.ts';
import { ErrorNote, Loading } from '../../ui/Status.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { Dial } from './Dial.tsx';
import { AnswerBar, DayDone, FlightHud, IntroCard, PromptPanel, ResultCard } from './parts.tsx';
import { TierMeter } from './TierMeter.tsx';
import './play.css';

/** The server settles a timed-out round this long after the deadline. */
const GRACE_MS = 1500;

type Phase =
  | { k: 'loading' }
  | { k: 'error'; error: unknown }
  | { k: 'intro' }
  | { k: 'round' }
  | { k: 'reveal'; tier: number; points: number; answer: string; same: number }
  | { k: 'flying'; same: number }
  | { k: 'result'; round: RoundSummary; same: number | null }
  | { k: 'done' };

const unlockedCount = (w: WardrobeResponse | undefined): number | null =>
  w ? Object.values(w.catalog).reduce((n, items) => n + items.filter(i => i.unlocked).length, 0) : null;

/** `kind` picks the API: the daily puzzle and friends' games (/api/play) or practice runs (/api/practice). */
export function Play({ kind = 'play' }: { kind?: 'play' | 'practice' }) {
  const { key: param } = useParams();
  const { me } = useUser();
  const key = param ?? me.today;
  const valid = kind === 'practice' ? /^p-[a-z0-9]{10}$/.test(key) : isDateKey(key) || isGameKey(key);
  if (!valid) return <Navigate to={kind === 'practice' ? '/practice' : '/'} replace />;
  return <PlayRun key={key} runKey={key} base={`/api/${kind}`} />;
}

function PlayRun({ runKey, base }: { runKey: string; base: string }) {
  const { t, lang, server } = useI18n();
  const scene = useStage();
  const qc = useQueryClient();
  const toast = useToast();
  const [run, setRun] = useState<RunState | null>(null);
  const [skew, setSkew] = useState(0);
  const [phase, setPhase] = useState<Phase>({ k: 'loading' });
  const [round, setRound] = useState<CurrentRound | null>(null);
  const [shownScore, setShownScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<{ raw: string; n: number } | null>(null);
  /** A typo-corrected match waiting for a second Enter. */
  const [suggestion, setSuggestion] = useState<{ raw: string; answer: string } | null>(null);
  const [newItems, setNewItems] = useState(false);
  /** One of a Kind answers in this run: each brings a saucer along. */
  const uniques = run ? run.rounds.filter(r => r.tier >= 6 && r.points > 0).length : null;
  const uniquesSeen = useRef<number | null>(null);
  useEffect(() => {
    if (uniques === null) return;
    scene.get()?.setCompanions(uniques, uniquesSeen.current !== null && uniques > uniquesSeen.current);
    uniquesSeen.current = uniques;
  }, [uniques, scene]);
  const unlocksBefore = useRef<number | null>(unlockedCount(qc.getQueryData<WardrobeResponse>(keys.wardrobe)));

  const apply = useCallback(
    (s: RunState): RunState => {
      setRun(s);
      setSkew(s.serverNow - Date.now());
      if (s.current) setRound(s.current);
      qc.setQueryData(keys.run(runKey), s);
      return s;
    },
    [qc, runKey],
  );

  const fail = useCallback((e: unknown) => {
    setBusy(false);
    toast(e instanceof Error ? server(e.message) : t('common.error'), 'bad');
  }, [toast, server, t]);

  // Start (or resume) the run.
  useEffect(() => {
    let live = true;
    const s0 = scene.get();
    s0?.setClock(null);
    // Remember how much of the wardrobe was open, to announce new unlocks at the end.
    if (unlocksBefore.current === null)
      void qc.fetchQuery({ queryKey: keys.wardrobe, queryFn: () => api.get<WardrobeResponse>('/api/wardrobe') }).then(w => { unlocksBefore.current ??= unlockedCount(w); }, () => undefined);
    api.post<RunState>(`${base}/${runKey}/start`).then(
      s => {
        if (!live) return;
        apply(s);
        setShownScore(s.score);
        scene.get()?.setPosition(s.score);
        setPhase(s.finished ? { k: 'done' } : s.current ? { k: 'round' } : { k: 'intro' });
      },
      (error: unknown) => live && setPhase({ k: 'error', error }),
    );
    return () => { live = false; scene.get()?.setClock(null); };
  }, [runKey, base, apply, scene, qc]);

  const lastRound = (s: RunState): RoundSummary | undefined => s.rounds[s.rounds.length - 1];

  const showMiss = useCallback(
    (s: RunState, kind: 'timeout' | 'pass') => {
      const r = lastRound(s);
      scene.get()?.setClock(null);
      scene.get()?.miss(kind);
      setPhase(r ? { k: 'result', round: r, same: null } : s.finished ? { k: 'done' } : { k: 'intro' });
    },
    [scene],
  );

  const openNext = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const s = apply(await api.post<RunState>(`${base}/${runKey}/next`));
      setRejected(null);
      setPhase(s.finished ? { k: 'done' } : s.current ? { k: 'round' } : { k: 'intro' });
    } catch (e) { fail(e); }
    setBusy(false);
  }, [busy, apply, runKey, base, fail]);

  const guess = useCallback(async (text: string) => {
    setBusy(true);
    try {
      const confirm = suggestion?.raw === text;
      const r = await api.post<GuessResponse>(`${base}/${runKey}/guess`, { text, confirm });
      setSuggestion(null);
      if (r.result === 'confirm') {
        sfx.hmm();
        setRejected(null);
        setSuggestion({ raw: r.raw, answer: r.answer });
      } else if (r.result === 'rejected') {
        scene.get()?.reject();
        setRejected(prev => ({ raw: r.raw, n: (prev?.n ?? 0) + 1 }));
      } else if (r.result === 'accepted') {
        apply(r.state);
        scene.get()?.setClock(null);
        scene.get()?.charge(true);
        setPhase({ k: 'reveal', tier: r.tier, points: r.points, answer: r.answer, same: r.same });
      } else if (r.result === 'expired') {
        showMiss(apply(r.state), 'timeout');
      } else {
        apply(r.state);
        setPhase({ k: 'done' });
      }
    } catch (e) { fail(e); }
    setBusy(false);
  }, [runKey, base, apply, scene, showMiss, fail, suggestion]);

  const pass = useCallback(async () => {
    setBusy(true);
    try { showMiss(apply(await api.post<RunState>(`${base}/${runKey}/skip`)), 'pass'); } catch (e) { fail(e); }
    setBusy(false);
  }, [runKey, base, apply, showMiss, fail]);

  // When the clock runs out, ask the server to settle the round (it waits a short grace period).
  useEffect(() => {
    if (phase.k !== 'round' || !run?.current) return;
    const position = run.current.position;
    let id = 0;
    const check = async (): Promise<void> => {
      try {
        const s = await api.get<RunState>(`${base}/${runKey}`);
        if (s.current?.position === position) { id = window.setTimeout(() => void check(), 1000); return; }
        showMiss(apply(s), 'timeout');
      } catch { id = window.setTimeout(() => void check(), 2000); }
    };
    const wait = run.current.deadline - skew - Date.now() + GRACE_MS + 250;
    id = window.setTimeout(() => void check(), Math.max(0, wait));
    return () => window.clearTimeout(id);
  }, [phase.k, run, skew, runKey, base, apply, showMiss]);

  // Reveal finished: fly.
  const launch = useCallback(() => {
    if (phase.k !== 'reveal' || !run) return;
    const { tier, points, same } = phase;
    const r = lastRound(run);
    setPhase({ k: 'flying', same });
    const s = scene.get();
    const land = (): void => {
      setShownScore(run.score);
      if (tier >= 6) window.setTimeout(() => toast(t('play.friendJoined'), 'good'), 1500);
      if (r) setPhase({ k: 'result', round: r, same });
    };
    if (!s) { land(); return; }
    s.charge(false);
    s.launch({ points, tier, onLand: land });
  }, [phase, run, scene, toast, t]);

  const afterResult = useCallback(() => {
    if (!run) return;
    if (run.finished) setPhase({ k: 'done' });
    else void openNext();
  }, [run, openNext]);

  // The music follows the game: drums while the clock runs, quiet during the flight.
  useEffect(() => {
    music.setMood(phase.k === 'round' ? 'round' : phase.k === 'reveal' || phase.k === 'flying' ? 'flight' : 'calm');
  }, [phase.k]);
  useEffect(() => () => music.setMood('calm'), []);

  // Day finished: refresh everything that depends on it and check for new wardrobe items.
  const finished = phase.k === 'done';
  useEffect(() => {
    if (!finished) return;
    for (const k of [keys.today, keys.stats, keys.archive, ['leaderboard'], keys.games, keys.reveal(runKey), keys.practice, keys.friends]) void qc.invalidateQueries({ queryKey: k });
    void qc.fetchQuery({ queryKey: keys.wardrobe, queryFn: () => api.get<WardrobeResponse>('/api/wardrobe'), staleTime: 0 }).then(
      w => { const n = unlockedCount(w); if (n !== null && unlocksBefore.current !== null && n > unlocksBefore.current) setNewItems(true); },
      () => undefined,
    );
  }, [finished, qc, runKey]);

  if (phase.k === 'loading') return <Loading />;
  if (phase.k === 'error' || !run) return <div className="play-error"><ErrorNote error={phase.k === 'error' ? phase.error : null} /></div>;

  const flying = phase.k === 'flying' || phase.k === 'reveal';
  const showPrompt = round && (phase.k === 'round' || phase.k === 'reveal' || phase.k === 'flying' || phase.k === 'result');
  return (
    <div className="play" data-phase={phase.k}>
      <FlightHud score={shownScore} flying={phase.k === 'flying'} />
      {showPrompt ? (
        <PromptPanel run={run} round={round}>
          {phase.k === 'round' && run.current ? (
            <Dial
              deadline={run.current.deadline - skew}
              totalMs={run.roundSeconds * 1000}
              label={t('common.seconds', { n: run.roundSeconds })}
              onFrame={left => scene.get()?.setClock(left)}
            />
          ) : null}
        </PromptPanel>
      ) : null}
      {phase.k === 'intro' ? <IntroCard run={run} onOpen={() => void openNext()} busy={busy} /> : null}
      {phase.k === 'round' ? <AnswerBar onGuess={text => void guess(text)} onPass={() => void pass()} busy={busy} rejected={rejected} suggestion={suggestion} lang={round?.lang ?? lang} /> : null}
      {phase.k === 'reveal' ? <TierMeter tier={phase.tier} points={phase.points} answer={phase.answer} onDone={launch} /> : null}
      {phase.k === 'result' ? <ResultCard round={phase.round} same={phase.same} finished={run.finished} onNext={afterResult} /> : null}
      {phase.k === 'done' ? <DayDone run={run} newItems={newItems} /> : null}
      {flying ? <span className="sr-only" role="status">{t('play.launch')}</span> : null}
    </div>
  );
}
