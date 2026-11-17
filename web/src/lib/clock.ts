// Time helpers that follow the server's clock, so countdowns are right even when a PC clock is off.
import { useEffect, useState } from 'react';

/** Re-renders every `ms` and returns Date.now(). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Offset to add to Date.now() to get server time, from a response's serverNow and when it arrived. */
export const skewOf = (serverNow: number, receivedAt: number): number => serverNow - receivedAt;
