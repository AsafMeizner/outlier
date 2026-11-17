// Party: create a room, join one by code, or pick an open room.
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { Lang, PartyState } from '../../../../shared/api.ts';
import { useStage } from '../../app/stage-context.tsx';
import { useI18n } from '../../i18n/index.tsx';
import { api } from '../../lib/api.ts';
import { useParties } from '../../lib/queries.ts';
import { PixelIcon } from '../../ui/PixelIcon.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { Window } from '../../ui/Window.tsx';
import '../screens.css';
import './modes.css';

export function PartyHome() {
  const { t, lang: uiLang, server } = useI18n();
  const { theme } = useStage();
  const navigate = useNavigate();
  const toast = useToast();
  const rooms = useParties();
  const [lang, setLang] = useState<Lang>(uiLang);
  const [code, setCode] = useState('');

  const create = async (): Promise<void> => {
    try {
      const s = await api.post<PartyState>('/api/party', { lang });
      await navigate(`/party/${s.code}`);
    } catch (e) { toast(e instanceof Error ? server(e.message) : t('common.error'), 'bad'); }
  };
  const join = (e: FormEvent): void => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (/^[A-Z]{4}$/.test(c)) void navigate(`/party/${c}`);
  };

  return (
    <Window title={t(theme.copy.party)} size="md">
      <section className="mode-hero px-box">
        <PixelIcon name="meteor" size={48} />
        <div>
          <h2 className="section-title">{t(theme.copy.partyTagline)}</h2>
          <p>{t('party.how')}</p>
        </div>
      </section>
      <div className="party-start">
        <div className="party-create">
          <div className="tabs" role="tablist" aria-label={t('party.lang')}>
            {(['en', 'he'] as const).map(l => (
              <button key={l} type="button" role="tab" className="tab" aria-selected={lang === l} onClick={() => setLang(l)}>
                {t(l === 'en' ? 'admin.lang.en' : 'admin.lang.he')}
              </button>
            ))}
          </div>
          <button type="button" className="px-btn px-btn--big px-btn--block" onClick={() => void create()}>{t('party.create')}</button>
        </div>
        <form className="party-join" onSubmit={join}>
          <label className="field">
            <span>{t('party.code')}</span>
            <input className="input party-code-input" value={code} onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))} placeholder="ABCD" autoComplete="off" dir="ltr" />
          </label>
          <button type="submit" className="px-btn px-btn--sun" disabled={code.trim().length !== 4}>{t('party.join')}</button>
        </form>
      </div>
      <h2 className="section-title">{t('party.open')}</h2>
      {rooms.data?.rooms.length ? (
        <ul className="party-rooms">
          {rooms.data.rooms.map(r => (
            <li key={r.code}>
              <span className="party-room-code">{r.code}</span>
              <span>{r.host}</span>
              <span className="faint">{t('party.players', { n: r.players, m: r.maxPlayers })}</span>
              <span className="faint">{t(r.lang === 'he' ? 'admin.lang.he' : 'admin.lang.en')}</span>
              <span className="faint">{t(r.status === 'lobby' ? 'party.inLobby' : 'party.playing')}</span>
              <button type="button" className="px-btn px-btn--small" onClick={() => void navigate(`/party/${r.code}`)}>{t('party.join')}</button>
            </li>
          ))}
        </ul>
      ) : <p className="empty">{t('party.noRooms')}</p>}
    </Window>
  );
}
