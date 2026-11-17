// A player's portrait, drawn by the active theme at 16x16 art pixels and scaled up with hard edges.
import { memo, useEffect, useRef } from 'react';
import type { Look } from '../../../shared/wardrobe.ts';
import { useStage } from '../app/stage-context.tsx';
import { Bmp } from '../game/pixel/bmp.ts';

const ART = 16;

export const Avatar = memo(function Avatar({ look, size = 32, className }: { look: Look; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { theme } = useStage();
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const b = new Bmp(ART, ART);
    theme.drawAvatar(b, look);
    ctx.putImageData(b.toImageData(), 0, 0);
  }, [look, theme]);
  return <canvas ref={ref} className={`avatar pixelated${className ? ` ${className}` : ''}`} width={ART} height={ART} style={{ width: size, height: size }} aria-hidden="true" />;
});
