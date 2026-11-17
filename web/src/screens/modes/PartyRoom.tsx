// A party room: lobby, the turn-by-turn game, and the winner. Kept live with long-polling.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { PartyAnswerResponse, PartyLog, PartyPlayer, PartyState } from '../../../../shared/api.ts';
import { useStage } from '../../app/stage-context.tsx';
import { music, sfx } from '../../game/sfx.ts';
import { useI18n, type AnyKey } from '../../i18n/index.tsx';
import { api, ApiError } from '../../lib/api.ts';
import { copyText } from '../../lib/clipboard.ts';
import { Avatar } from '../../ui/Avatar.tsx';
import { PixelIcon } from '../../ui/PixelIcon.tsx';
import { Loading } from '../../ui/Status.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { Dial } from '../play/Dial.tsx';
import { AnswerBar } from '../play/parts.tsx';
import '../play/play.css';
import './modes.css';

const sleep = (ms: number): Promise<void> => new Promise(r => window.setTimeout(r, ms));

export function PartyRoom() {
  const { code = '' } = useParams();
  return <Room key={code} code={code.toUpperCase()} />;
}

function Room({ code }: { code: string }) {
  const { t, server } = useI18n();
  const toast = useToast();
  const [s, setS] = useState<PartyState | null>(null);
  const [skew, setSkew] = useState(0);
  const [gone, setGone] = useState(false);

  const take = useCallback((next: PartyState) => {
    setS(prev => (prev && prev.version > next.version ? prev : next));
    setSkew(next.serverNow - Date.now());
  }, []);

  // join (once) and then follow the room with long-polling
  useEffect(() => {
    let alive = true;
    void (async () => {
      let v = 0;
      try { const first = await api.post<PartyState>(`/api/party/${code}/join`); if (!alive) return; take(first); v = first.version; }
      catch (e) {
        if (e instanceof ApiError && e.status === 404) { if (alive) setGone(true); return; }
        if (e instanceof ApiError && alive) toast(server(e.message), 'info'); // started already: watch
      }
      while (alive) {
        try {
          const next = await api.get<PartyState>(`/api/party/${code}?v=${v}`);
          if (!alive) return;
          take(next); v = next.version;
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) { if (alive) setGone(true); return; }
          await sleep(2000);
        }
      }
    })();
    return () => { alive = false; };
  }, [code, take, toast, server]);

  useSounds(s);
  useEffect(() => {
    music.setMood(s?.status === 'playing' ? 'round' : 'calm');
    return () => music.setMood('calm');
  }, [s?.status]);

  if (gone) {
    return (
      <div className="party-center">
        <section className="party-panel px-window">
          <p>{t('party.gone')}</p>
          <Link to="/party" className="px-btn">{t('nav.party')}</Link>
        </section>
      </div>
    );
  }
  if (!s) return <Loading />;
  if (s.status === 'lobby') return <Lobby s={s} />;
  return <Game s={s} skew={skew} onState={take} />;
}

/** Sound cues for what just happened in the room. */
function useSounds(s: PartyState | null): void {
  const seen = useRef<number>(0);
  const myTurn = useRef(false);
  useEffect(() => {
    if (!s) return;
    const fresh = s.log.filter(l => l.at > seen.current);
    if (seen.current) {
      for (const l of fresh) {
        if (l.kind === 'pop') { sfx.thud(); sfx.buzz(); }
        else if (l.kind === 'life') sfx.unlock();
        else if (l.kind === 'answer') sfx.step(l.tier ?? 1);
        else if (l.kind === 'win') sfx.dayDone();
        else if (l.kind === 'join') sfx.open();
      }
    }
    seen.current = Math.max(seen.current, ...s.log.map(l => l.at), 1);
    const mine = s.status === 'playing' && s.turnUserId === s.you;
    if (mine && !myTurn.current) sfx.hmm();
    myTurn.current = mine;
  }, [s]);
}

function Lobby({ s }: { s: PartyState }) {
  const { t, server } = useI18n();
  const { theme } = useStage();
  const toast = useToast();
  const navigate = useNavigate();
  const link = `${window.location.origin}/party/${s.code}`;
  const host = s.players.find(p => p.userId === s.hostId);
  const start = async (): Promise<void> => {
    try { await api.post(`/api/party/${s.code}/start`); } catch (e) { toast(e instanceof Error ? server(e.message) : t('common.error'), 'bad'); }
  };
  const leave = async (): Promise<void> => { await api.post(`/api/party/${s.code}/leave`).catch(() => undefined); await navigate('/party'); };
  return (
    <div className="party-center">
      <section className="party-panel px-window" aria-labelledby="lobby-title">
        <h1 id="lobby-title" className="party-title">{t(theme.copy.party)}</h1>
        <p className="faint">{t('party.lobby')}</p>
        <div className="party-code">{s.code}</div>
        <div className="share px-box">
          <PixelIcon name="link" />
          <input className="input share-url" value={link} readOnly onFocus={e => e.currentTarget.select()} aria-label={t('party.share')} dir="ltr" />
          <button type="button" className="px-btn px-btn--small px-btn--sun" onClick={() => void copyText(link).then(ok => toast(ok ? t('common.copied') : link, ok ? 'good' : 'info'))}>{t('common.copyLink')}</button>
        </div>
        <p className="faint">{t('party.players', { n: s.players.length, m: s.maxPlayers })}</p>
        <ul className="lobby-players">
          {s.players.map(p => (
            <li key={p.userId}>
              <Avatar look={p.look} size={40} />
              <span>{p.name}</span>
              {p.userId === s.hostId ? <PixelIcon name="star" size={12} /> : null}
            </li>
          ))}
        </ul>
        <div className="row party-actions">
          {s.hostId === s.you ? (
            <button type="button" className="px-btn px-btn--big" disabled={s.players.length < 2} onClick={() => void start()}>{t('party.start')}</button>
          ) : <p>{t('party.waitHost', { name: host?.name ?? '' })}</p>}
          <button type="button" className="px-btn px-btn--navy" onClick={() => void leave()}>{t('party.leave')}</button>
        </div>
        {s.hostId === s.you && s.players.length < 2 ? <p className="faint">{t('party.needTwo')}</p> : null}
      </section>
    </div>
  );
}

function Game({ s, skew, onState }: { s: PartyState; skew: number; onState: (s: PartyState) => void }) {
  const { t, server } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<{ raw: string; n: number; reason?: 'used'; answer?: string } | null>(null);
  const [suggestion, setSuggestion] = useState<{ raw: string; answer: string } | null>(null);
  const turn = s.players.find(p => p.userId === s.turnUserId);
  const mine = s.status === 'playing' && s.turnUserId === s.you;
  const byId = new Map(s.players.map(p => [p.userId, p]));

  const answer = async (text: string): Promise<void> => {
    setBusy(true);
    try {
      const r = await api.post<PartyAnswerResponse>(`/api/party/${s.code}/answer`, { text, confirm: suggestion?.raw === text });
      setSuggestion(null);
      if (r.result === 'accepted') { setRejected(null); onState(r.state); }
      else if (r.result === 'confirm') { sfx.hmm(); setSuggestion({ raw: r.raw, answer: r.answer }); }
      else { sfx.buzz(); setRejected(prev => ({ raw: r.raw, n: (prev?.n ?? 0) + 1, reason: r.result === 'used' ? 'used' : undefined, answer: r.answer })); }
    } catch (e) { toast(e instanceof Error ? server(e.message) : t('common.error'), 'bad'); }
    setBusy(false);
  };
  const again = async (): Promise<void> => {
    try { await api.post(`/api/party/${s.code}/start`); } catch (e) { toast(e instanceof Error ? server(e.message) : t('common.error'), 'bad'); }
  };
  const leave = async (): Promise<void> => { await api.post(`/api/party/${s.code}/leave`).catch(() => undefined); await navigate('/party'); };

  return (
    <div className="party">
      {s.prompt ? (
        <section className="prompt px-window" aria-labelledby="party-prompt">
          <div className="prompt-top">
            <span className="prompt-count">{s.code}</span>
            {s.status === 'playing' && s.deadline ? (
              <Dial key={s.deadline} deadline={s.deadline - skew} totalMs={s.fuseMs} label={t('party.waiting', { name: turn?.name ?? '' })} />
            ) : null}
          </div>
          <p className="prompt-cat" lang={s.prompt.lang} dir="auto">{s.prompt.category}</p>
          <h1 id="party-prompt" className="prompt-text" lang={s.prompt.lang} dir="auto">{s.prompt.text}</h1>
        </section>
      ) : null}

      <ul className="pp-row" aria-label={t('party.lives')}>
        {s.players.map(p => <PlayerCard key={p.userId} p={p} turn={p.userId === s.turnUserId} you={p.userId === s.you} winner={s.winner === p.userId} />)}
      </ul>

      {s.used.length ? (
        <div className="pp-used">
          <span className="faint">{t('party.usedTitle')}:</span>
          {s.used.map(u => <span key={u.answer} className="px-tier" data-tier={u.tier} title={byId.get(u.by)?.name} dir="auto">{u.answer}</span>)}
        </div>
      ) : null}

      <ol className="pp-log" aria-live="polite">
        {s.log.slice(-4).map(l => <LogLine key={`${l.at}-${l.kind}-${l.userId}`} l={l} name={byId.get(l.userId)?.name ?? ''} />)}
      </ol>

      {s.status === 'over' ? (
        <section className="pp-over px-window">
          <h2 className="party-title">{s.winner === s.you ? t('party.youWin') : t('party.winner', { name: byId.get(s.winner ?? -1)?.name ?? '' })}</h2>
          <div className="row party-actions">
            {s.hostId === s.you ? <button type="button" className="px-btn px-btn--big" onClick={() => void again()}>{t('party.again')}</button> : null}
            <button type="button" className="px-btn px-btn--navy" onClick={() => void leave()}>{t('party.leave')}</button>
          </div>
        </section>
      ) : mine ? (
        <div className="pp-turn">
          <p className="pp-yourturn">{t('party.yourTurn')}</p>
          <AnswerBar key={s.prompt?.text} onGuess={text => void answer(text)} busy={busy} rejected={rejected} suggestion={suggestion} lang={s.prompt?.lang ?? 'en'} />
        </div>
      ) : (
        <p className="pp-wait">{turn ? t('party.waiting', { name: turn.name }) : ''}</p>
      )}
    </div>
  );
}

function PlayerCard({ p, turn, you, winner }: { p: PartyPlayer; turn: boolean; you: boolean; winner: boolean }) {
  const { t } = useI18n();
  return (
    <li className={`pp${turn ? ' is-turn' : ''}${p.out ? ' is-out' : ''}${you ? ' is-you' : ''}${winner ? ' is-winner' : ''}`}>
      {turn ? <span className="pp-meteor" aria-hidden="true"><PixelIcon name="meteor" size={48} /></span> : null}
      <Avatar look={p.look} size={48} />
      <span className="pp-name">{p.name}</span>
      <span className="pp-lives" aria-label={`${t('party.lives')}: ${p.lives}`}>
        {p.out ? t('party.out') : Array.from({ length: Math.max(p.lives, 0) }, (_, i) => <PixelIcon key={i} name="heart" size={12} />)}
      </span>
      <span className="pp-meter" title={t('party.meter')}><i style={{ width: `${Math.min(100, p.meter)}%` }} /></span>
    </li>
  );
}

function LogLine({ l, name }: { l: PartyLog; name: string }) {
  const { t } = useI18n();
  const key = `party.log.${l.kind}` as AnyKey;
  return <li className={`pp-log-${l.kind}`} dir="auto">{t(key, { name, a: l.text ?? '' })}</li>;
}
