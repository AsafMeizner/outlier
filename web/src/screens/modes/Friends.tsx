// Friends: follow colleagues, see today's and this week's scores, and compare head-to-head.
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CompareResponse, CompareSide, FriendRow, FriendsResponse, UserSearchRow } from '../../../../shared/api.ts';
import { useDistance } from '../../app/stage-context.tsx';
import { useI18n } from '../../i18n/index.tsx';
import { api, qs } from '../../lib/api.ts';
import { fmtDate } from '../../lib/format.ts';
import { keys, useCompare, useFriends } from '../../lib/queries.ts';
import { Avatar } from '../../ui/Avatar.tsx';
import { PixelIcon } from '../../ui/PixelIcon.tsx';
import { ErrorNote, Loading } from '../../ui/Status.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { Window } from '../../ui/Window.tsx';
import '../screens.css';
import './modes.css';

export function Friends() {
  const { t } = useI18n();
  const q = useFriends();
  const [compare, setCompare] = useState<number | null>(null);
  return (
    <Window title={t('friends.title')} size="lg">
      <p className="muted">{t('friends.note')}</p>
      <Search />
      {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : q.data.friends.length ? (
        <ul className="friends">
          {q.data.friends.map(f => <Friend key={f.userId} f={f} open={compare === f.userId} onCompare={() => setCompare(c => (c === f.userId ? null : f.userId))} />)}
        </ul>
      ) : <p className="empty">{t('friends.none')}</p>}
    </Window>
  );
}

function Search() {
  const { t, server } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<UserSearchRow[] | null>(null);
  useEffect(() => {
    const q = text.trim();
    if (!q) return;
    const ctl = new AbortController();
    const id = window.setTimeout(() => {
      api.get<UserSearchRow[]>(`/api/users/search${qs({ q })}`).then(r => { if (!ctl.signal.aborted) setRows(r); }, () => undefined);
    }, 200);
    return () => { ctl.abort(); window.clearTimeout(id); };
  }, [text]);
  const follow = async (u: UserSearchRow): Promise<void> => {
    try {
      const r = await api.post<FriendsResponse>('/api/friends', { userId: u.userId, username: u.username });
      qc.setQueryData(keys.friends, r);
      setRows(list => list?.map(x => (x.userId === u.userId ? { ...x, isFriend: true } : x)) ?? null);
    } catch (e) { toast(e instanceof Error ? server(e.message) : t('common.error'), 'bad'); }
  };
  const shown = text.trim() ? rows : null;
  return (
    <div className="friend-search">
      <label className="field">
        <span>{t('friends.search')}</span>
        <input className="input" type="search" value={text} onChange={e => setText(e.target.value)} autoComplete="off" />
      </label>
      {shown ? (
        shown.length ? (
          <ul className="friend-results">
            {shown.map(u => (
              <li key={u.userId}>
                <Avatar look={u.look} size={28} />
                <span className="friend-name">{u.name} <span className="faint">@{u.username}</span></span>
                {u.isFriend ? <span className="px-chip">{t('friends.following')}</span> : (
                  <button type="button" className="px-btn px-btn--small" onClick={() => void follow(u)}>{t('friends.follow')}</button>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="faint">{t('friends.noMatch')}</p>
      ) : null}
    </div>
  );
}

function Friend({ f, open, onCompare }: { f: FriendRow; open: boolean; onCompare: () => void }) {
  const { t } = useI18n();
  const dist = useDistance();
  const qc = useQueryClient();
  const unfollow = async (): Promise<void> => {
    qc.setQueryData(keys.friends, await api.del<FriendsResponse>(`/api/friends/${f.userId}`));
  };
  return (
    <li className="friend px-box">
      <div className="friend-row">
        <Avatar look={f.look} size={40} />
        <div className="friend-who">
          <strong>{f.name}</strong>
          <span className="faint">@{f.username}{f.team ? ` / ${f.team}` : ''}{f.followsYou ? ` / ${t('friends.followsYou')}` : ''}</span>
        </div>
        <dl className="friend-stats">
          <div><dt>{t('friends.today')}</dt><dd className="num">{f.today !== null ? dist(f.today) : t('friends.notYet')}</dd></div>
          <div><dt>{t('friends.week')}</dt><dd className="num">{dist(f.week)}</dd></div>
          <div><dt>{t('friends.streak')}</dt><dd className="num"><PixelIcon name="flame" size={12} /> {f.streak.current}</dd></div>
          <div><dt>{t('friends.best')}</dt><dd className="num">{dist(f.best)}</dd></div>
        </dl>
        <div className="row">
          <button type="button" className="px-btn px-btn--small" onClick={onCompare} aria-expanded={open}>{t('friends.compare')}</button>
          <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={() => void unfollow()}>{t('friends.unfollow')}</button>
        </div>
      </div>
      {open ? <Compare id={f.userId} /> : null}
    </li>
  );
}

function Compare({ id }: { id: number }) {
  const { t, locale } = useI18n();
  const dist = useDistance();
  const q = useCompare(id);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorNote error={q.error} />;
  const c: CompareResponse = q.data;
  const peak = Math.max(1, ...c.days.flatMap(d => [d.mine ?? 0, d.theirs ?? 0]));
  const side = (s: CompareSide, label: string) => (
    <div className="vs-side">
      <Avatar look={s.look} size={48} />
      <strong>{label}</strong>
      <span className="num">{dist(s.total)}</span>
      <span className="faint">{t('friends.days')}: {s.games}</span>
      <span className="faint">{t('friends.best')}: {dist(s.best)}</span>
      <span className="faint">{t('friends.outliers')}: {s.outliers}</span>
    </div>
  );
  return (
    <div className="vs">
      <div className="vs-head">
        {side(c.me, t('friends.you'))}
        <div className="vs-score">
          <span className="vs-big num">{c.wins}<span className="faint">:</span>{c.losses}</span>
          <span className="faint">{t('friends.wins')} / {t('friends.losses')}{c.ties ? ` / ${t('friends.ties')} ${c.ties}` : ''}</span>
        </div>
        {side(c.them, c.them.name)}
      </div>
      {c.days.length ? (
        <>
          <h3 className="section-title">{t('friends.recent')}</h3>
          <ol className="vs-days">
            {c.days.map(d => (
              <li key={d.date}>
                <span className="vs-date">{fmtDate(locale, d.date)}</span>
                <span className="vs-bar vs-bar--me"><i style={{ width: `${((d.mine ?? 0) / peak) * 100}%` }} /></span>
                <span className="vs-bar vs-bar--them"><i style={{ width: `${((d.theirs ?? 0) / peak) * 100}%` }} /></span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}
