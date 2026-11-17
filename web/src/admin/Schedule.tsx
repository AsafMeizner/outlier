// Schedule: a calendar of puzzle days. Pick a day to choose its prompts by hand, or let the game pick them.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { DayPrompt, ScheduleDay, SuggestResponse } from '../../../shared/api.ts';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { api, qs } from '../lib/api.ts';
import { fmtDate } from '../lib/format.ts';
import { useMe } from '../lib/queries.ts';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { Card, PageTitle, useAction, usePrompts, useSchedule } from './common.tsx';

type Picked = Pick<DayPrompt, 'id' | 'text' | 'category' | 'lang'>;

function addDays(ymd: string, n: number): string {
  const [y = 1970, m = 1, d = 1] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const weekday = (ymd: string): number => new Date(`${ymd}T00:00:00Z`).getUTCDay();

export function Schedule() {
  const { t, locale } = useI18n();
  const me = useMe().data;
  const today = me?.today ?? new Date().toISOString().slice(0, 10);
  const weekStart = me?.settings.weekStart ?? 0;
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [fillDays, setFillDays] = useState(14);
  const act = useAction();

  // Six weeks per page, starting on the configured first day of the week, one week before today.
  const from = useMemo(() => {
    const base = addDays(today, -7 + page * 42);
    return addDays(base, -((weekday(base) - weekStart + 7) % 7));
  }, [today, page, weekStart]);
  const to = addDays(from, 41);
  const q = useSchedule(from, to);

  return (
    <>
      <PageTitle k="admin.sch.title" />
      <Card>
        <p className="faint">{t('admin.sch.note')}</p>
        <div className="row">
          <span>{t('admin.sch.prefill')}</span>
          <input className="input adm-num" type="number" min={1} max={120} value={fillDays} onChange={e => setFillDays(Number(e.target.value))} aria-label={t('admin.sch.days')} />
          <span>{t('admin.sch.days')}</span>
          <button type="button" className="px-btn px-btn--small" onClick={() => void act(() => api.post<{ created: string[] }>('/api/admin/schedule/autofill', { days: fillDays }), r => (r.created.length ? t('admin.sch.filled', { n: r.created.length }) : t('admin.sch.nothingToFill')))}>
            {t('admin.sch.autofill')}
          </button>
        </div>
      </Card>
      <Card
        title={`${fmtDate(locale, from)} – ${fmtDate(locale, to)}`}
        actions={
          <div className="row">
            <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={() => setPage(p => p - 1)}>{t('admin.sch.prev')}</button>
            <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={() => setPage(p => p + 1)}>{t('admin.sch.next')}</button>
          </div>
        }
      >
        {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : (
          <Calendar from={from} today={today} days={q.data.days} active={q.data.activeWeekdays} selected={selected} onPick={setSelected} />
        )}
      </Card>
      {selected && q.data ? (
        <DayEditor key={selected} date={selected} today={today} day={q.data.days.find(d => d.date === selected)} perDay={q.data.promptsPerDay} offDay={!q.data.activeWeekdays.includes(weekday(selected))} />
      ) : null}
    </>
  );
}

function Calendar({ from, today, days, active, selected, onPick }: { from: string; today: string; days: ScheduleDay[]; active: number[]; selected: string | null; onPick: (d: string) => void }) {
  const { t, locale } = useI18n();
  const byDate = new Map(days.map(d => [d.date, d]));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  return (
    <div className="cal">
      {cells.slice(0, 7).map(d => <div key={`h${d}`} className="cal-head">{t(`admin.weekday.${weekday(d)}` as AnyKey)}</div>)}
      {cells.map(d => {
        const day = byDate.get(d), on = active.includes(weekday(d));
        const status = day ? (day.auto ? t('admin.sch.auto') : t('admin.sch.prompts', { n: day.prompts.length })) : on ? t('admin.sch.empty') : t('admin.sch.noPuzzle');
        return (
          <button
            key={d}
            type="button"
            className={`cal-day${d === today ? ' is-today' : ''}${d < today ? ' is-past' : ''}${day ? ' is-set' : ''}${!on ? ' is-off' : ''}${d === selected ? ' is-on' : ''}`}
            onClick={() => onPick(d)}
            aria-pressed={d === selected}
          >
            <span className="cal-date">{fmtDate(locale, d, { day: 'numeric', month: 'short' })}</span>
            <span className="cal-status">{status}</span>
            {day?.runs ? <span className="cal-runs">{t('admin.sch.played', { n: day.runs })}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function DayEditor({ date, today, day, perDay, offDay }: { date: string; today: string; day: ScheduleDay | undefined; perDay: number; offDay: boolean }) {
  const { t, locale } = useI18n();
  const act = useAction();
  const bank = usePrompts();
  const [picked, setPicked] = useState<Picked[]>(() => day?.prompts.map(p => ({ id: p.id, text: p.text, category: p.category, lang: p.lang })) ?? []);
  const [search, setSearch] = useState('');
  const [lang, setLang] = useState<'' | 'en' | 'he'>('');
  const locked = (day?.runs ?? 0) > 0;
  const past = date < today;
  const editable = !locked && !past;
  const full = picked.length >= 10;

  const results = useMemo(() => {
    const ids = new Set(picked.map(p => p.id)), s = search.trim().toLowerCase();
    return (bank.data?.prompts ?? [])
      .filter(p => !p.retired && p.answers > 0 && !ids.has(p.id) && (!lang || p.lang === lang) && (!s || p.text.toLowerCase().includes(s) || p.category.toLowerCase().includes(s)))
      .sort((a, b) => a.used - b.used)
      .slice(0, 40);
  }, [bank.data, picked, search, lang]);

  const move = (i: number, d: number): void => setPicked(list => { const a = [...list]; const [x] = a.splice(i, 1); if (x) a.splice(i + d, 0, x); return a; });
  const suggest = async (): Promise<void> => {
    const n = Math.max(1, perDay - picked.length);
    await act(() => api.get<SuggestResponse>(`/api/admin/schedule/suggest${qs({ date, n, exclude: picked.map(p => p.id).join(',') })}`), r => {
      setPicked(list => [...list, ...r.prompts.map(p => ({ id: p.id, text: p.text, category: p.category, lang: p.lang }))].slice(0, 10));
    });
  };

  return (
    <Card title={`${t('admin.sch.dayTitle')}: ${fmtDate(locale, date, { weekday: 'long', day: 'numeric', month: 'long' })}`}
      actions={day?.runs ? <Link className="px-btn px-btn--small px-btn--navy" to={`/results/${date}`}>{t('admin.sch.seeAnswers')}</Link> : undefined}>
      {offDay ? <p className="faint">{t('admin.sch.offDay')}</p> : null}
      {locked ? <p className="adm-alert">{t('admin.sch.locked', { n: day?.runs ?? 0 })}</p> : past ? <p className="faint">{t('admin.sch.past')}</p> : null}
      <h3 className="adm-sub">{t('admin.sch.picked', { a: picked.length, b: perDay })}</h3>
      {picked.length ? (
        <ol className="adm-picked">
          {picked.map((p, i) => (
            <li key={p.id}>
              <span dir="auto" className="adm-picked-text">{p.text}</span>
              <span className="faint">{p.category}</span>
              {editable ? (
                <span className="row">
                  <button type="button" className="adm-mini" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('admin.sch.moveUp')}>▲</button>
                  <button type="button" className="adm-mini" onClick={() => move(i, 1)} disabled={i === picked.length - 1} aria-label={t('admin.sch.moveDown')}>▼</button>
                  <button type="button" className="adm-mini" onClick={() => setPicked(l => l.filter(x => x.id !== p.id))} aria-label={t('admin.sch.remove')}>✕</button>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : <p className="faint">{t('admin.sch.pickedNone')}</p>}
      {editable ? (
        <>
          <div className="row adm-actions">
            <button type="button" className="px-btn px-btn--small" disabled={!picked.length} onClick={() => void act(() => api.put(`/api/admin/schedule/${date}`, { promptIds: picked.map(p => p.id) }), () => t('admin.sch.saved'))}>
              {t('admin.sch.save')}
            </button>
            <button type="button" className="px-btn px-btn--small px-btn--navy" disabled={full} onClick={() => void suggest()}>{t('admin.sch.suggest')}</button>
            {day ? (
              <button type="button" className="px-btn px-btn--small px-btn--danger" onClick={() => void act(() => api.del(`/api/admin/schedule/${date}`), () => { setPicked([]); return t('admin.sch.cleared'); })}>
                {t('admin.sch.clear')}
              </button>
            ) : null}
          </div>
          <div className="row adm-filters">
            <input className="input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('admin.sch.search')} aria-label={t('admin.sch.search')} />
            <select className="select" value={lang} onChange={e => setLang(e.target.value as '' | 'en' | 'he')} aria-label={t('admin.q.language')}>
              <option value="">{t('admin.q.allLanguages')}</option>
              <option value="en">{t('admin.lang.en')}</option>
              <option value="he">{t('admin.lang.he')}</option>
            </select>
          </div>
          {bank.isPending ? <Loading /> : (
            <ul className="adm-results">
              {results.map(p => (
                <li key={p.id}>
                  <button type="button" className="adm-mini" disabled={full} onClick={() => setPicked(l => [...l, { id: p.id, text: p.text, category: p.category, lang: p.lang }])} aria-label={t('admin.sch.add')}>+</button>
                  <span dir="auto">{p.text}</span>
                  <span className="faint">{p.category}</span>
                  <span className="faint num">{t('admin.sch.used', { n: p.used })}</span>
                </li>
              ))}
            </ul>
          )}
          {full ? <p className="faint">{t('admin.sch.full')}</p> : null}
        </>
      ) : null}
    </Card>
  );
}
