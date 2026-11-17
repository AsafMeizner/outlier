// Users: add people one at a time or in bulk (with temporary passwords), and manage each account.
import { useState, type FormEvent } from 'react';
import type { AdminUserRow, CreateUsersResponse, CreatedUser } from '../../../shared/api.ts';
import { useI18n } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { fmtDate } from '../lib/format.ts';
import { useMe } from '../lib/queries.ts';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { Card, PageTitle, useAction, useAdminDistance, useAgo, useUserRuns, useUsers } from './common.tsx';

export function Users() {
  const { t } = useI18n();
  const q = useUsers();
  const [created, setCreated] = useState<{ users: CreatedUser[]; errors: string[] } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const dist = useAdminDistance();
  const ago = useAgo();

  return (
    <>
      <PageTitle k="admin.u.title" />
      <div className="adm-grid2">
        <AddOne onCreated={r => setCreated({ users: r.created, errors: r.errors })} />
        <AddMany onCreated={r => setCreated({ users: r.created, errors: r.errors })} />
      </div>
      {created ? (
        <Card title={t('admin.u.created', { n: created.users.length })}>
          <p className="adm-alert">{t('admin.u.passwordsNote')}</p>
          <table className="table">
            <thead><tr><th>{t('auth.username')}</th><th>{t('admin.u.name')}</th><th>{t('admin.u.temp')}</th></tr></thead>
            <tbody>{created.users.map(u => <tr key={u.username}><td>{u.username}</td><td>{u.displayName}</td><td className="adm-code">{u.password}</td></tr>)}</tbody>
          </table>
          {created.errors.length ? <ul className="adm-errors">{created.errors.map(e => <li key={e}>{e}</li>)}</ul> : null}
        </Card>
      ) : null}
      <Card title={t('admin.u.everyone', { n: q.data?.users.length ?? 0 })}>
        {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : (
          <div className="adm-scroll">
            <table className="table">
              <thead><tr><th>{t('admin.u.name')}</th><th>{t('auth.username')}</th><th>{t('admin.u.team')}</th><th>{t('admin.u.role')}</th><th className="n">{t('admin.u.games')}</th><th className="n">{t('stats.total')}</th><th>{t('admin.u.lastSeen')}</th><th /></tr></thead>
              <tbody>
                {q.data.users.map(u => (
                  <UserRow key={u.id} u={u} open={open === u.id} onToggle={() => setOpen(o => (o === u.id ? null : u.id))} dist={dist} ago={ago} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function AddOne({ onCreated }: { onCreated: (r: CreateUsersResponse) => void }) {
  const { t } = useI18n();
  const act = useAction();
  const [f, setF] = useState({ username: '', displayName: '', team: '', role: 'player' });
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    void act(() => api.post<CreateUsersResponse>('/api/admin/users', f), r => { onCreated(r); setF({ username: '', displayName: '', team: '', role: 'player' }); return t('admin.u.created', { n: r.created.length }); });
  };
  return (
    <Card title={t('admin.u.addOne')}>
      <form onSubmit={submit}>
        <label className="field"><span>{t('auth.username')}</span><input className="input" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} required autoCapitalize="none" /></label>
        <label className="field"><span>{t('admin.u.name')}</span><input className="input" value={f.displayName} onChange={e => setF({ ...f, displayName: e.target.value })} /></label>
        <label className="field"><span>{t('admin.u.team')}</span><input className="input" value={f.team} onChange={e => setF({ ...f, team: e.target.value })} /></label>
        <label className="field"><span>{t('admin.u.role')}</span>
          <select className="select" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
            <option value="player">{t('admin.u.role.player')}</option>
            <option value="admin">{t('admin.u.role.admin')}</option>
          </select>
        </label>
        <button type="submit" className="px-btn px-btn--small">{t('admin.u.createOne')}</button>
      </form>
    </Card>
  );
}

function AddMany({ onCreated }: { onCreated: (r: CreateUsersResponse) => void }) {
  const { t } = useI18n();
  const act = useAction();
  const [bulk, setBulk] = useState('');
  return (
    <Card title={t('admin.u.addMany')}>
      <p className="faint">{t('admin.u.manyHelp')}</p>
      <textarea className="textarea" rows={8} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={'dana, Dana Levi, Design\nomer, Omer Cohen, R&D'} />
      <button type="button" className="px-btn px-btn--small" disabled={!bulk.trim()} onClick={() => void act(() => api.post<CreateUsersResponse>('/api/admin/users', { bulk }), r => { onCreated(r); setBulk(''); return t('admin.u.created', { n: r.created.length }); })}>
        {t('admin.u.create')}
      </button>
    </Card>
  );
}

function UserRow({ u, open, onToggle, dist, ago }: { u: AdminUserRow; open: boolean; onToggle: () => void; dist: (p: number) => string; ago: (ms: number | null) => string }) {
  const { t } = useI18n();
  return (
    <>
      <tr className={u.disabled ? 'is-retired' : undefined}>
        <td>{u.displayName}</td>
        <td>{u.username}</td>
        <td>{u.team}</td>
        <td>
          {t(u.role === 'admin' ? 'admin.u.role.admin' : 'admin.u.role.player')}
          {u.disabled ? <span className="faint"> ({t('admin.u.disabled')})</span> : null}
          {u.mustChange ? <span className="faint"> ({t('admin.u.temp')})</span> : null}
        </td>
        <td className="n">{u.games}</td>
        <td className="n">{dist(u.points)}</td>
        <td>{ago(u.lastSeen)}</td>
        <td><button type="button" className="px-btn px-btn--small px-btn--navy" onClick={onToggle} aria-expanded={open}>{t('admin.u.manage')}</button></td>
      </tr>
      {open ? (
        <tr className="adm-manage-row"><td colSpan={8}><Manage u={u} /></td></tr>
      ) : null}
    </>
  );
}

function Manage({ u }: { u: AdminUserRow }) {
  const { t, locale } = useI18n();
  const act = useAction();
  const me = useMe().data?.user;
  const runs = useUserRuns(u.id);
  const [name, setName] = useState(u.displayName);
  const [team, setTeam] = useState(u.team);
  const [temp, setTemp] = useState('');
  const self = me?.id === u.id;
  return (
    <div className="adm-manage">
      <div className="row">
        <label className="field adm-inline"><span>{t('admin.u.name')}</span><input className="input" value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="field adm-inline"><span>{t('admin.u.team')}</span><input className="input" value={team} onChange={e => setTeam(e.target.value)} /></label>
        <button type="button" className="px-btn px-btn--small" onClick={() => void act(() => api.put(`/api/admin/users/${u.id}`, { displayName: name, team }), () => t('admin.u.saved'))}>{t('admin.u.save')}</button>
      </div>
      <div className="row adm-actions">
        {!self ? (
          <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={() => void act(() => api.put(`/api/admin/users/${u.id}`, { role: u.role === 'admin' ? 'player' : 'admin' }), () => t('admin.u.saved'))}>
            {t(u.role === 'admin' ? 'admin.u.role.player' : 'admin.u.role.admin')}
          </button>
        ) : null}
        <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={() => void act(() => api.post<{ password: string }>(`/api/admin/users/${u.id}/reset`), r => { setTemp(r.password); return undefined; })}>{t('admin.u.reset')}</button>
        {!self ? (
          <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={() => void act(() => api.put(`/api/admin/users/${u.id}`, { disabled: !u.disabled }), () => t('admin.u.saved'))}>
            {t(u.disabled ? 'admin.u.enable' : 'admin.u.disable')}
          </button>
        ) : null}
        {!self ? (
          <button type="button" className="px-btn px-btn--small px-btn--danger" onClick={() => { if (window.confirm(t('admin.u.deleteAsk', { u: u.displayName }))) void act(() => api.del(`/api/admin/users/${u.id}`), () => t('admin.u.deleted')); }}>
            {t('admin.u.delete')}
          </button>
        ) : null}
      </div>
      {temp ? <p className="adm-alert" role="status">{t('admin.u.resetDone', { u: u.username, p: temp })}</p> : null}
      <h3 className="adm-sub">{t('admin.u.played')}</h3>
      {runs.isPending ? <Loading /> : runs.data?.runs.length ? (
        <ul className="adm-runs">
          {runs.data.runs.map(r => (
            <li key={r.date + r.mode}>
              <span>{r.date.startsWith('g-') ? r.date : fmtDate(locale, r.date)}</span>
              <span className="faint">{r.mode}</span>
              <span className="num">{r.finished ? r.score : t('admin.u.round', { n: r.position + 1 })}</span>
              <button type="button" className="adm-mini" title={t('admin.u.replay')} aria-label={t('admin.u.replay')} onClick={() => { if (window.confirm(t('admin.u.replayAsk', { u: u.displayName, d: r.date }))) void act(() => api.del(`/api/admin/users/${u.id}/runs/${r.date}`), () => t('admin.u.replayDone')); }}>↺</button>
            </li>
          ))}
        </ul>
      ) : <p className="faint">{t('admin.u.noGames')}</p>}
    </div>
  );
}
