// Practice: Unlimited mode and themed packs. Neither counts for the leaderboard; both avoid daily-puzzle prompts.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Lang, PackInfo, PracticeKind, SlugResponse } from '../../../../shared/api.ts';
import { useDistance } from '../../app/stage-context.tsx';
import { useI18n } from '../../i18n/index.tsx';
import { api } from '../../lib/api.ts';
import { usePracticeHome } from '../../lib/queries.ts';
import { PixelIcon } from '../../ui/PixelIcon.tsx';
import { ErrorNote, Loading } from '../../ui/Status.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { Window } from '../../ui/Window.tsx';
import '../screens.css';
import './modes.css';

export function Practice() {
  const { t, lang: uiLang, server } = useI18n();
  const q = usePracticeHome();
  const dist = useDistance();
  const navigate = useNavigate();
  const toast = useToast();
  const [lang, setLang] = useState<Lang>(uiLang);
  const [busy, setBusy] = useState(false);

  const start = async (kind: PracticeKind, pack = ''): Promise<void> => {
    setBusy(true);
    try {
      const r = await api.post<SlugResponse>('/api/practice', { kind, pack, lang });
      await navigate(`/practice/${r.slug}`);
    } catch (e) {
      toast(e instanceof Error ? server(e.message) : t('common.error'), 'bad');
      setBusy(false);
    }
  };

  const packs: PackInfo[] = q.data?.packs.filter(p => p.lang === lang) ?? [];
  const best = q.data?.unlimited[lang] ?? null;
  return (
    <Window title={t('practice.title')} size="lg">
      <p className="muted">{t('practice.note')}</p>
      <div className="tabs" role="tablist" aria-label={t('party.lang')}>
        {(['en', 'he'] as const).map(l => (
          <button key={l} type="button" role="tab" className="tab" aria-selected={lang === l} onClick={() => setLang(l)}>
            {t(l === 'en' ? 'admin.lang.en' : 'admin.lang.he')}
          </button>
        ))}
      </div>
      {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : (
        <>
          <section className="mode-hero px-box">
            <PixelIcon name="bolt" size={48} />
            <div>
              <h2 className="section-title">{t('practice.unlimited')}</h2>
              <p>{t('practice.unlimitedNote')}</p>
              <p className="faint">{best !== null ? t('practice.best', { d: dist(best) }) : t('practice.noBest')}</p>
            </div>
            <button type="button" className="px-btn px-btn--big" disabled={busy} onClick={() => void start('unlimited')}>{t('games.play')}</button>
          </section>
          <h2 className="section-title">{t('practice.packs')}</h2>
          <p className="faint">{t('practice.packsNote')}</p>
          {packs.length ? (
            <ul className="packs">
              {packs.map(p => (
                <li key={p.category}>
                  <button type="button" className="pack" disabled={busy} onClick={() => void start('pack', p.category)}>
                    <span className="pack-name" dir="auto">{p.category}</span>
                    <span className="pack-meta faint">{t('games.prompts', { n: Math.min(10, p.prompts) })}</span>
                    <span className="pack-best">{p.best !== null ? t('practice.best', { d: dist(p.best) }) : t('practice.noBest')}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="empty">{t('practice.none')}</p>}
        </>
      )}
    </Window>
  );
}
