// A player's head-and-shoulders portrait, drawn small and scaled up so it shares the scene's pixel grid.
import { memo, useEffect, useRef } from 'react';
import type { Look } from '../../../shared/wardrobe.ts';
import { drawAvatar } from '../game/draw.ts';

/** Art resolution of the portrait; the canvas is shown at `size` CSS pixels. */
const ART = 20;

export const Avatar = memo(function Avatar({ look, size = 32, className }: { look: Look; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawAvatar(ref.current, look, ART, 1);
  }, [look]);
  return <canvas ref={ref} className={`avatar pixelated${className ? ` ${className}` : ''}`} width={ART} height={ART} style={{ width: size, height: size }} aria-hidden="true" />;
});
