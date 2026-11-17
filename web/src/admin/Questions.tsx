// The question bank: search and filter every prompt, open one to edit it.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { fmtDate } from '../lib/format.ts';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { Card, PageTitle, usePrompts } from './common.tsx';

type Status = 'all' | 'unused' | 'retired';

export function Questions() {
  const { t, locale } = useI18n();
  const q = usePrompts();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [lang, setLang] = useState('');
  const [status, setStatus] = useState<Status>('all');

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.prompts ?? []).filter(p =>
      (!s || p.text.toLowerCase().includes(s)) && (!cat || p.category === cat) && (!lang || p.lang === lang) &&
      (status === 'all' ? !p.retired : status === 'unused' ? !p.retired && p.used === 0 : p.retired));
  }, [q.data, search, cat, lang, status]);

  return (
    <>
      <PageTitle k="admin.q.title">
        <Link to="/admin/questions/new" className="px-btn px-btn--small">{t('admin.q.new')}</Link>
      </PageTitle>
      <Card>
        <div className="row adm-filters">
          <input className="input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('admin.q.search')} aria-label={t('admin.q.search')} />
          <select className="select" value={cat} onChange={e => setCat(e.target.value)} aria-label={t('admin.q.category')}>
            <option value="">{t('admin.q.allCategories')}</option>
            {q.data?.categories.map(c => <option key={c.category} value={c.category}>{c.category} ({c.n})</option>)}
          </select>
          <select className="select" value={lang} onChange={e => setLang(e.target.value)} aria-label={t('admin.q.language')}>
            <option value="">{t('admin.q.allLanguages')}</option>
            <option value="en">{t('admin.lang.en')}</option>
            <option value="he">{t('admin.lang.he')}</option>
          </select>
          <select className="select" value={status} onChange={e => setStatus(e.target.value as Status)} aria-label={t('admin.q.used')}>
            <option value="all">{t('admin.q.status.all')}</option>
            <option value="unused">{t('admin.q.status.unused')}</option>
            <option value="retired">{t('admin.q.status.retired')}</option>
          </select>
          <span className="faint">{t('admin.q.shown', { n: rows.length })}</span>
        </div>
        {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : rows.length ? (
          <div className="adm-scroll">
            <table className="table">
              <thead>
                <tr><th>{t('admin.q.prompt')}</th><th>{t('admin.q.category')}</th><th>{t('admin.q.language')}</th><th className="n">{t('admin.q.answers')}</th><th className="n">{t('admin.q.used')}</th><th>{t('admin.q.lastUsed')}</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 400).map(p => (
                  <tr key={p.id} className={p.retired ? 'is-retired' : undefined}>
                    <td><Link to={`/admin/questions/${p.id}`} dir="auto">{p.text}</Link>{p.retired ? <span className="faint"> ({t('admin.q.retired')})</span> : null}</td>
                    <td dir="auto">{p.category}</td>
                    <td>{t(p.lang === 'he' ? 'admin.lang.he' : 'admin.lang.en')}</td>
                    <td className="n">{p.answers}</td>
                    <td className="n">{p.used}</td>
                    <td>{p.lastUsed ? fmtDate(locale, p.lastUsed) : t('admin.never')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="faint">{t('admin.q.nothing')}</p>}
      </Card>
    </>
  );
}
