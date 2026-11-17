// Game settings, including the visual theme for everyone.
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Settings, SettingsResponse } from '../../../shared/api.ts';
import { THEME_IDS } from '../../../shared/themes.ts';
import { THEMES } from '../game/themes/index.ts';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { keys } from '../lib/queries.ts';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { Card, PageTitle, useAction, useSettings } from './common.tsx';

export function SettingsPage() {
  const q = useSettings();
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorNote error={q.error} />;
  return <Form initial={q.data.settings} />;
}

const zones = (): string[] => { try { return Intl.supportedValuesOf('timeZone'); } catch { return []; } };

function Form({ initial }: { initial: Settings }) {
  const { t } = useI18n();
  const act = useAction();
  const qc = useQueryClient();
  const [s, setS] = useState<Settings>(initial);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]): void => setS(x => ({ ...x, [k]: v }));
  const toggleDay = (d: number): void => set('activeWeekdays', s.activeWeekdays.includes(d) ? s.activeWeekdays.filter(x => x !== d) : [...s.activeWeekdays, d].sort());

  const save = (e: FormEvent): void => {
    e.preventDefault();
    void act(() => api.put<SettingsResponse>('/api/admin/settings', s), r => {
      setS(r.settings);
      void qc.invalidateQueries({ queryKey: keys.me });
      return t('admin.s.saved');
    });
  };

  return (
    <form onSubmit={save}>
      <PageTitle k="admin.s.title">
        <button type="submit" className="px-btn px-btn--small">{t('admin.s.save')}</button>
      </PageTitle>
      <div className="adm-grid2">
        <Card title={t('admin.s.game')}>
          <label className="field"><span>{t('admin.s.theme')}</span>
            <select className="select" value={s.theme} onChange={e => set('theme', e.target.value as Settings['theme'])}>
              {THEME_IDS.map(id => <option key={id} value={id}>{t(THEMES[id].name)}</option>)}
            </select>
          </label>
          <label className="field"><span>{t('admin.s.siteName')}</span><input className="input" value={s.siteName} onChange={e => set('siteName', e.target.value)} maxLength={40} /></label>
          <label className="field"><span>{t('admin.s.tagline')}</span><input className="input" value={s.tagline} onChange={e => set('tagline', e.target.value)} maxLength={120} /></label>
          <div className="row">
            <label className="field adm-inline"><span>{t('admin.s.promptsPerDay')}</span><input className="input adm-num" type="number" min={1} max={10} value={s.promptsPerDay} onChange={e => set('promptsPerDay', Number(e.target.value))} /></label>
            <label className="field adm-inline"><span>{t('admin.s.roundSeconds')}</span><input className="input adm-num" type="number" min={10} max={120} value={s.roundSeconds} onChange={e => set('roundSeconds', Number(e.target.value))} /></label>
          </div>
          <label className="field"><span>{t('admin.s.puzzleLanguage')}</span>
            <select className="select" value={s.puzzleLanguage} onChange={e => set('puzzleLanguage', e.target.value as Settings['puzzleLanguage'])}>
              {(['alternate', 'en', 'he', 'any'] as const).map(v => <option key={v} value={v}>{t(`admin.s.lang.${v}` as AnyKey)}</option>)}
            </select>
          </label>
          <label className="adm-check"><input type="checkbox" checked={s.typoTolerance} onChange={e => set('typoTolerance', e.target.checked)} /> {t('admin.s.typo')}</label>
          <label className="adm-check"><input type="checkbox" checked={s.archivePlay} onChange={e => set('archivePlay', e.target.checked)} /> {t('admin.s.archive')}</label>
        </Card>
        <div>
          <Card title={t('admin.s.calendar')}>
            <label className="field"><span>{t('admin.s.timeZone')}</span>
              <input className="input" value={s.timeZone} onChange={e => set('timeZone', e.target.value)} list="adm-zones" />
              <datalist id="adm-zones">{zones().map(z => <option key={z} value={z} />)}</datalist>
            </label>
            <div className="row">
              <label className="field adm-inline"><span>{t('admin.s.dayStart')}</span><input className="input adm-num" type="number" min={0} max={23} value={s.dayStartHour} onChange={e => set('dayStartHour', Number(e.target.value))} /></label>
              <label className="field adm-inline"><span>{t('admin.s.weekStart')}</span>
                <select className="select" value={s.weekStart} onChange={e => set('weekStart', Number(e.target.value))}>
                  {[0, 1, 2, 3, 4, 5, 6].map(d => <option key={d} value={d}>{t(`admin.weekday.${d}` as AnyKey)}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="adm-days">
              <legend>{t('admin.s.days')}</legend>
              {[0, 1, 2, 3, 4, 5, 6].map(d => (
                <label key={d}><input type="checkbox" checked={s.activeWeekdays.includes(d)} onChange={() => toggleDay(d)} /> {t(`admin.weekday.${d}` as AnyKey)}</label>
              ))}
            </fieldset>
            <label className="adm-check"><input type="checkbox" checked={s.autoSchedule} onChange={e => set('autoSchedule', e.target.checked)} /> {t('admin.s.auto')}</label>
          </Card>
          <Card title={t('admin.s.accounts')}>
            <label className="field"><span>{t('admin.s.registration')}</span>
              <select className="select" value={s.registration} onChange={e => set('registration', e.target.value as Settings['registration'])}>
                {(['open', 'code', 'closed'] as const).map(v => <option key={v} value={v}>{t(`admin.s.reg.${v}` as AnyKey)}</option>)}
              </select>
            </label>
            {s.registration === 'code' ? (
              <label className="field"><span>{t('admin.s.invite')}</span><input className="input" value={s.inviteCode} onChange={e => set('inviteCode', e.target.value)} maxLength={60} /></label>
            ) : null}
          </Card>
        </div>
      </div>
    </form>
  );
}
