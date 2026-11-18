// Midnight on the server's clock starts a new daily puzzle. Pages left open switch to it on their own:
// a timer fires when the day ends and every query is fetched again (today, archive, leaderboard, ...).
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToday } from '../lib/queries.ts';

/** Only render for a signed-in player (/api/today needs one). */
export function DayRollover() {
  const qc = useQueryClient();
  const today = useToday();
  const endsAt = today.data?.endsAt;
  const serverNow = today.data?.serverNow;
  const receivedAt = today.dataUpdatedAt;

  useEffect(() => {
    if (endsAt === undefined || serverNow === undefined) return;
    // Server time now = serverNow + time since the answer arrived. Fire a moment after the day ends; if the
    // server still reports the old day (clocks a little apart), the refetch re-runs this effect and it retries.
    const left = endsAt - (serverNow + (Date.now() - receivedAt));
    const id = window.setTimeout(() => void qc.invalidateQueries(), Math.max(left + 500, 2000));
    return () => window.clearTimeout(id);
  }, [qc, endsAt, serverNow, receivedAt]);

  return null;
}
