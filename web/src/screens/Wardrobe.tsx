// Character customisation. Items unlock from distance flown, days played, Outlier answers and streaks.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LookResponse, MeResponse, WardrobeResponse } from '../../../shared/api.ts';
import { SLOTS, type Look, type Slot, type UnlockRule, type WardrobeItem } from '../../../shared/wardrobe.ts';
import { drawPreview } from '../game/draw.ts';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { fmtNumber } from '../lib/format.ts';
import { keys, useWardrobe } from '../lib/queries.ts';
import { PixelIcon } from '../ui/PixelIcon.tsx';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { useToast } from '../ui/Toast.tsx';
import { Window } from '../ui/Window.tsx';
import './screens.css';

/** Slots whose items are plain colours, shown as swatches instead of little portraits. */
const SWATCH: ReadonlySet<Slot> = new Set(['skin', 'hair']);

export function Wardrobe() {
  const { t } = useI18n();
  const q = useWardrobe();
  return (
    <Window title={t('wardrobe.title')} size="lg">
      {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : <Closet data={q.data} />}
    </Window>
  );
}

function Closet({ data }: { data: WardrobeResponse }) {
  const { t, locale, server } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [look, setLook] = useState<Look>(data.look);
  const [slot, setSlot] = useState<Slot>('shirt');
  const [busy, setBusy] = useState(false);
  const dirty = SLOTS.some(s => look[s] !== data.look[s]);
  const all = Object.values(data.catalog).flat();
  const st = data.stats;

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
        <LivePreview look={look} />
        <p className="faint closet-stats">
          {t('wardrobe.stats', { m: t('common.metres', { n: fmtNumber(locale, st.meters) }), g: st.games, o: st.outliers, s: st.streak })}
        </p>
        <p className="closet-count">{t('wardrobe.unlocked', { n: all.filter(i => i.unlocked).length, m: all.length })}</p>
        <button type="button" className="px-btn px-btn--block" onClick={() => void save()} disabled={!dirty || busy}>
          {t('wardrobe.save')}
        </button>
      </div>
      <div className="closet-pick">
        <p className="muted">{t('wardrobe.note')}</p>
        <div className="tabs tabs--wrap" role="tablist">
          {SLOTS.map(s => (
            <button key={s} type="button" role="tab" aria-selected={s === slot} className="tab" onClick={() => setSlot(s)}>
              {t(`wardrobe.slot.${s}` as AnyKey)}
            </button>
          ))}
        </div>
        <ul className="items" role="tabpanel" aria-label={t(`wardrobe.slot.${slot}` as AnyKey)}>
          {data.catalog[slot].map((item, i) => (
            <li key={item.id}>
              <ItemTile
                slot={slot}
                item={item}
                index={i}
                look={look}
                selected={look[slot] === item.id}
                onPick={() => setLook(l => ({ ...l, [slot]: item.id }))}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ItemTile({ slot, item, index, look, selected, onPick }: { slot: Slot; item: WardrobeItem & { unlocked: boolean }; index: number; look: Look; selected: boolean; onPick: () => void }) {
  const { t } = useI18n();
  const need = requirement(t, item.unlock);
  const name = slot === 'trail' ? t(`wardrobe.trail.${item.id}` as AnyKey) : `${t(`wardrobe.slot.${slot}` as AnyKey)} ${index + 1}`;
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
      {SWATCH.has(slot) ? (
        <span className="item-swatch" style={item.color ? { background: item.color } : undefined} />
      ) : slot === 'trail' ? (
        <span className={`item-trail item-trail--${item.id}`} aria-hidden="true" />
      ) : (
        <StillPreview look={tryLook} />
      )}
      {slot === 'trail' ? <span className="item-name">{name}</span> : null}
      {!item.unlocked ? (
        <span className="item-lock">
          <PixelIcon name="lock" size={24} />
          <span className="item-need">{need}</span>
        </span>
      ) : null}
    </button>
  );
}

function requirement(t: (k: AnyKey, v?: Record<string, string | number>) => string, rule: UnlockRule): string {
  if (!rule) return '';
  const parts: string[] = [];
  if (rule.meters) parts.push(t('wardrobe.needMeters', { n: rule.meters }));
  if (rule.games) parts.push(t('wardrobe.needGames', { n: rule.games }));
  if (rule.outliers) parts.push(t('wardrobe.needOutliers', { n: rule.outliers }));
  if (rule.streak) parts.push(t('wardrobe.needStreak', { n: rule.streak }));
  return parts.join(', ');
}

/** The big animated preview: the worker on their chair, idling. */
function LivePreview({ look }: { look: Look }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef(look);
  useEffect(() => { lookRef.current = look; }, [look]);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (now: number): void => {
      if (ref.current) drawPreview(ref.current, lookRef.current, now - start, 4);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="closet-preview pixelated" aria-hidden="true" />;
}

function StillPreview({ look }: { look: Look }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawPreview(ref.current, look, 0, 3);
  }, [look]);
  return <canvas ref={ref} className="item-preview pixelated" aria-hidden="true" />;
}
