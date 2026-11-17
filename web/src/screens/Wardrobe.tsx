// Customise the hero. The active theme provides the slots, the items and the pixel previews;
// items unlock from distance flown, days played, Outlier answers and streaks.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CatalogWithUnlocks, LookResponse, MeResponse, WardrobeResponse } from '../../../shared/api.ts';
import type { Look, UnlockRule, WardrobeItem } from '../../../shared/wardrobe.ts';
import { useDistance, useStage } from '../app/stage-context.tsx';
import { Bmp } from '../game/pixel/bmp.ts';
import type { ThemeModule } from '../game/themes/types.ts';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { keys, useWardrobe } from '../lib/queries.ts';
import { PixelIcon } from '../ui/PixelIcon.tsx';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { useToast } from '../ui/Toast.tsx';
import { Window } from '../ui/Window.tsx';
import './screens.css';

export function Wardrobe() {
  const { t } = useI18n();
  const q = useWardrobe();
  return (
    <Window title={t('wardrobe.title')} size="lg">
      {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : <Closet data={q.data} />}
    </Window>
  );
}

const itemName = (t: (k: AnyKey) => string, slot: string, id: string, isColor: boolean): string => t((isColor ? `color.${id}` : `item.${slot}.${id}`) as AnyKey);

function Closet({ data }: { data: WardrobeResponse }) {
  const { t, server } = useI18n();
  const { theme } = useStage();
  const dist = useDistance();
  const qc = useQueryClient();
  const toast = useToast();
  const [look, setLook] = useState<Look>(data.look);
  const [slot, setSlot] = useState<string>(data.slots[0] ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = data.slots.some(s => look[s] !== data.look[s]);
  const all = Object.values(data.catalog).flat();
  const st = data.stats;
  const isColor = data.colorSlots.includes(slot);

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await api.post<LookResponse>('/api/wardrobe', { look });
      qc.setQueryData<MeResponse>(keys.me, m => (m?.user ? { ...m, user: { ...m.user, look: r.look } } : m));
      qc.setQueryData<WardrobeResponse>(keys.wardrobe, w => (w ? { ...w, look: r.look } : w));
      void qc.invalidateQueries({ queryKey: ['leaderboard'] });
      toast(t('wardrobe.saved'), 'good');
    } catch (e) {
      toast(e instanceof Error ? server(e.message) : t('common.error'), 'bad');
    }
    setBusy(false);
  };

  return (
    <div className="closet">
      <div className="closet-stage">
        <LivePreview theme={theme} look={look} />
        <p className="faint closet-stats">{t('wardrobe.stats', { m: dist(st.points), g: st.games, o: st.outliers, s: st.streak })}</p>
        <p className="closet-count">{t('wardrobe.unlocked', { n: all.filter(i => i.unlocked).length, m: all.length })}</p>
        <button type="button" className="px-btn px-btn--block" onClick={() => void save()} disabled={!dirty || busy}>
          {t('wardrobe.save')}
        </button>
      </div>
      <div className="closet-pick">
        <p className="muted">{t(theme.copy.wardrobeNote)}</p>
        <div className="tabs tabs--wrap" role="tablist">
          {data.slots.map(s => (
            <button key={s} type="button" role="tab" aria-selected={s === slot} className="tab" onClick={() => setSlot(s)}>
              {t(`wardrobe.slot.${s}` as AnyKey)}
            </button>
          ))}
        </div>
        <ItemGrid catalog={data.catalog} slot={slot} isColor={isColor} look={look} theme={theme} onPick={id => setLook(l => ({ ...l, [slot]: id }))} />
      </div>
    </div>
  );
}

function ItemGrid({ catalog, slot, isColor, look, theme, onPick }: { catalog: CatalogWithUnlocks; slot: string; isColor: boolean; look: Look; theme: ThemeModule; onPick: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <ul className="items" role="tabpanel" aria-label={t(`wardrobe.slot.${slot}` as AnyKey)}>
      {(catalog[slot] ?? []).map(item => (
        <li key={item.id}>
          <ItemTile slot={slot} item={item} isColor={isColor} look={look} theme={theme} selected={look[slot] === item.id} onPick={() => onPick(item.id)} />
        </li>
      ))}
    </ul>
  );
}

function ItemTile({ slot, item, isColor, look, theme, selected, onPick }: { slot: string; item: WardrobeItem & { unlocked: boolean }; isColor: boolean; look: Look; theme: ThemeModule; selected: boolean; onPick: () => void }) {
  const { t } = useI18n();
  const dist = useDistance();
  const need = requirement(t, dist, item.unlock);
  const name = itemName(t, slot, item.id, isColor);
  const tryLook = useMemo(() => ({ ...look, [slot]: item.id }), [look, slot, item.id]);
  return (
    <button
      type="button"
      className={`item${selected ? ' is-on' : ''}${item.unlocked ? '' : ' is-locked'}`}
      onClick={onPick}
      disabled={!item.unlocked}
      aria-pressed={selected}
      aria-label={item.unlocked ? name : `${name}: ${t('wardrobe.locked')}. ${need}`}
      title={item.unlocked ? name : need}
    >
      {isColor ? <span className="item-swatch" style={{ background: item.color }} /> : <StillPreview theme={theme} look={tryLook} portrait={slot === 'pilot'} />}
      <span className="item-name">{name}</span>
      {!item.unlocked ? (
        <span className="item-lock">
          <PixelIcon name="lock" size={24} />
          <span className="item-need">{need}</span>
        </span>
      ) : null}
    </button>
  );
}

function requirement(t: (k: AnyKey, v?: Record<string, string | number>) => string, dist: (p: number) => string, rule: UnlockRule): string {
  if (!rule) return '';
  const parts: string[] = [];
  if (rule.points) parts.push(t('wardrobe.needPoints', { d: dist(rule.points) }));
  if (rule.games) parts.push(t('wardrobe.needGames', { n: rule.games }));
  if (rule.outliers) parts.push(t('wardrobe.needOutliers', { n: rule.outliers }));
  if (rule.streak) parts.push(t('wardrobe.needStreak', { n: rule.streak }));
  return parts.join(', ');
}

/** The hero in its little scene, animated. */
function LivePreview({ theme, look }: { theme: ThemeModule; look: Look }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef(look);
  useEffect(() => { lookRef.current = look; }, [look]);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const b = new Bmp(64, 64);
    let raf = 0;
    const start = performance.now();
    const loop = (now: number): void => {
      theme.drawPreview(b, lookRef.current, now - start);
      ctx.putImageData(b.toImageData(), 0, 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [theme]);
  return <canvas ref={ref} width={64} height={64} className="closet-preview pixelated" aria-hidden="true" />;
}

function StillPreview({ theme, look, portrait }: { theme: ThemeModule; look: Look; portrait: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = portrait ? 16 : 64;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const b = new Bmp(size, size);
    if (portrait) theme.drawAvatar(b, look);
    else theme.drawPreview(b, look, 0);
    ctx.putImageData(b.toImageData(), 0, 0);
  }, [theme, look, portrait, size]);
  return <canvas ref={ref} width={size} height={size} className={`item-preview pixelated${portrait ? ' item-preview--portrait' : ''}`} aria-hidden="true" />;
}
