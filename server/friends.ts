// Friends: follow colleagues, see how they're doing today and this week, and compare head-to-head.
// Scores are already public on the leaderboards, so following needs no approval.
import type * as Api from '../shared/api.ts';
import { bad, str } from './http.ts';
import type { Kit } from './kit.ts';
import type { UserRow } from './rows.ts';
import { weekStartOf, addDays } from './time.ts';

type U = Pick<UserRow, 'id' | 'username' | 'display_name' | 'team' | 'look'>;
const COLS = 'u.id, u.username, u.display_name, u.team, u.look';

export function installFriends(k: Kit): void {
  const { db, route } = k;
  const live = "mode='live' AND finished_at IS NOT NULL";

  function friendRow(viewerId: number, u: U): Api.FriendRow {
    const t = k.today(), week = weekStartOf(t, k.settings().weekStart);
    return {
      ...k.playerRef(u),
      today: db.get<{ score: number }>(`SELECT score FROM runs WHERE user_id=? AND date=? AND ${live}`, u.id, t)?.score ?? null,
      streak: k.streakOf(u.id),
      week: k.count(`SELECT COALESCE(SUM(score),0) AS n FROM runs WHERE user_id=? AND date BETWEEN ? AND ? AND ${live}`, u.id, week, t),
      best: k.count(`SELECT COALESCE(MAX(score),0) AS n FROM runs WHERE user_id=? AND ${live}`, u.id),
      followsYou: k.count('SELECT COUNT(*) AS n FROM friends WHERE user_id=? AND friend_id=?', u.id, viewerId) > 0,
    };
  }
  const list = (userId: number): Api.FriendsResponse => ({
    friends: db.all<U>(`SELECT ${COLS} FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=? AND u.disabled=0 ORDER BY u.display_name COLLATE NOCASE`, userId)
      .map(u => friendRow(userId, u))
      .sort((a, b) => (b.today ?? -1) - (a.today ?? -1) || b.week - a.week),
  });

  route('GET', '/api/friends', 'user', ({ user }) => list(user.id));

  route('POST', '/api/friends', 'user', ({ user, body }) => {
    const name = str(body['username'], 40, 'Username');
    const u = db.get<U>(`SELECT ${COLS} FROM users u WHERE (u.username=? COLLATE NOCASE OR u.id=?) AND u.disabled=0`, name, Number(body['userId']) || -1) ?? bad('No player with that username.', 404);
    if (u.id === user.id) bad('That’s you!');
    db.run('INSERT OR IGNORE INTO friends(user_id,friend_id,created_at) VALUES(?,?,?)', user.id, u.id, k.now());
    return list(user.id);
  });

  route('DELETE', String.raw`/api/friends/(\d+)`, 'user', ({ user, m }) => {
    db.run('DELETE FROM friends WHERE user_id=? AND friend_id=?', user.id, Number(m[1]));
    return list(user.id);
  });

  route('GET', '/api/users/search', 'user', ({ user, query }): Api.UserSearchRow[] => {
    const q = (query.get('q') ?? '').trim().slice(0, 40);
    if (!q) return [];
    const like = `%${q.replace(/[%_\\]/g, c => `\\${c}`)}%`;
    return db.all<U & { fr: number }>(`SELECT ${COLS}, EXISTS(SELECT 1 FROM friends f WHERE f.user_id=? AND f.friend_id=u.id) AS fr FROM users u
        WHERE u.disabled=0 AND u.id<>? AND (u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\') ORDER BY u.display_name COLLATE NOCASE LIMIT 10`, user.id, user.id, like, like)
      .map(u => ({ ...k.playerRef(u), isFriend: !!u.fr }));
  });

  route('GET', String.raw`/api/friends/(\d+)/compare`, 'user', ({ user, m }): Api.CompareResponse => {
    const them = db.get<U>(`SELECT ${COLS} FROM users u WHERE u.id=?`, Number(m[1])) ?? bad('Player not found', 404);
    const me = db.get<U>(`SELECT ${COLS} FROM users u WHERE u.id=?`, user.id) ?? bad('Player not found', 404);
    const side = (u: U): Api.CompareSide => ({
      ...k.playerRef(u),
      total: k.count(`SELECT COALESCE(SUM(score),0) AS n FROM runs WHERE user_id=? AND ${live}`, u.id),
      games: k.count(`SELECT COUNT(*) AS n FROM runs WHERE user_id=? AND ${live}`, u.id),
      best: k.count(`SELECT COALESCE(MAX(score),0) AS n FROM runs WHERE user_id=? AND ${live}`, u.id),
      outliers: k.count("SELECT COUNT(*) AS n FROM rounds x JOIN runs r ON r.id=x.run_id WHERE r.user_id=? AND r.mode='live' AND x.tier=5", u.id),
      streak: k.streakOf(u.id),
    });
    const from = addDays(k.today(), -30);
    const scores = (id: number): Map<string, number> =>
      new Map(db.all<{ date: string; score: number }>(`SELECT date, score FROM runs WHERE user_id=? AND date>=? AND ${live}`, id, from).map(r => [r.date, r.score]));
    const mine = scores(me.id), theirs = scores(them.id);
    const dates = [...new Set([...mine.keys(), ...theirs.keys()])].sort().reverse();
    let wins = 0, losses = 0, ties = 0;
    const days = dates.map((date): Api.CompareDay => {
      const a = mine.get(date) ?? null, b = theirs.get(date) ?? null;
      if (a !== null && b !== null) { if (a > b) wins++; else if (a < b) losses++; else ties++; }
      return { date, mine: a, theirs: b };
    });
    return { me: side(me), them: side(them), days, wins, losses, ties };
  });
}
