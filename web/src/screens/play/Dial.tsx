// Countdown dial: a ring of pixel blocks that go out one by one, with the seconds in the middle.
import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../game/sfx.ts';

const BLOCKS = 20;
const R = 15;
// Block positions on a 40x40 grid, snapped to whole pixels so the ring stays crisp.
const CELLS = Array.from({ length: BLOCKS }, (_, i) => {
  const a = (i / BLOCKS) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.round(20 + Math.cos(a) * R - 2), y: Math.round(20 + Math.sin(a) * R - 2) };
});

interface Props {
  /** Client-clock time the round ends. */
  deadline: number;
  totalMs: number;
  /** Called every frame with the fraction of time left (1 → 0). */
  onFrame?: (left: number) => void;
  label: string;
}

export function Dial({ deadline, totalMs, onFrame, label }: Props) {
  const [left, setLeft] = useState(() => Math.max(0, deadline - Date.now()));
  const lastSecond = useRef<number | null>(null);
  const onFrameRef = useRef(onFrame);
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);

  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      const ms = Math.max(0, deadline - Date.now());
      setLeft(ms);
      onFrameRef.current?.(ms / totalMs);
      const sec = Math.ceil(ms / 1000);
      if (sec !== lastSecond.current) {
        if (lastSecond.current !== null && sec <= 5 && sec > 0) sfx.tick();
        lastSecond.current = sec;
      }
      if (ms > 0) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [deadline, totalMs]);

  const frac = totalMs > 0 ? left / totalMs : 0;
  const lit = Math.ceil(frac * BLOCKS);
  const tone = frac > 0.5 ? 'ok' : frac > 0.25 ? 'warn' : 'low';
  const secs = Math.ceil(left / 1000);
  return (
    <div className={`dial dial--${tone}`} role="timer" aria-label={label}>
      <svg viewBox="0 0 40 40" shapeRendering="crispEdges" aria-hidden="true">
        <rect x="6" y="6" width="28" height="28" className="dial-face" />
        {CELLS.map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width="4" height="4" className={i < lit ? 'dial-on' : 'dial-off'} />
        ))}
      </svg>
      <span className="dial-num num" aria-live={secs <= 5 ? 'assertive' : 'off'}>
        {secs}
      </span>
    </div>
  );
}
