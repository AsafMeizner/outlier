// Add questions from a file or pasted text (check first, then import); export the bank; download a backup.
import { useState, type ChangeEvent } from 'react';
import type { ImportResult } from '../../../shared/api.ts';
import { useI18n } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { useToast } from '../ui/Toast.tsx';
import { Card, PageTitle, useAction } from './common.tsx';

const SAMPLE = 'C: Food & Drink\nQ: Name a citrus fruit\n1 Orange\n2 Lemon | lemons\n5 Yuzu';

export function ImportExport() {
  const { t } = useI18n();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState('pasted.txt');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'skip' | 'update'>('skip');
  const [result, setResult] = useState<{ r: ImportResult; dry: boolean } | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0];
    if (!f) return;
    setName(f.name);
    setContent(await f.text());
    setResult(null);
  };
  const run = async (dryRun: boolean): Promise<void> => {
    if (!content.trim()) { toast(t('admin.io.nothing'), 'bad'); return; }
    await act(() => api.post<ImportResult>('/api/admin/import', { name, content, mode, dryRun }), r => {
      setResult({ r, dry: dryRun });
      return dryRun ? undefined : t('admin.io.imported');
    });
  };

  return (
    <>
      <PageTitle k="admin.nav.import" />
      <Card title={t('admin.io.add')}>
        <p>{t('admin.io.formats')}</p>
        <pre className="adm-sample" dir="auto">{SAMPLE}</pre>
        <p className="faint">{t('admin.io.hebrew')}</p>
        <label className="field">
          <span>{t('admin.io.file')}</span>
          <input className="input" type="file" accept=".txt,.csv,.json,text/plain,text/csv,application/json" onChange={e => void onFile(e)} />
        </label>
        <label className="field">
          <span>{t('admin.io.orPaste')}</span>
          <textarea className="textarea" rows={8} value={content} onChange={e => { setContent(e.target.value); setName('pasted.txt'); setResult(null); }} dir="auto" />
        </label>
        <fieldset className="adm-radios">
          <legend>{t('admin.io.whenExists')}</legend>
          <label><input type="radio" name="mode" checked={mode === 'skip'} onChange={() => setMode('skip')} /> {t('admin.io.skip')}</label>
          <label><input type="radio" name="mode" checked={mode === 'update'} onChange={() => setMode('update')} /> {t('admin.io.update')}</label>
        </fieldset>
        <div className="row adm-actions">
          <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={() => void run(true)}>{t('admin.io.check')}</button>
          <button type="button" className="px-btn px-btn--small" onClick={() => void run(false)}>{t('admin.io.import')}</button>
        </div>
        {result ? (
          <div className="adm-result" role="status">
            <h3 className="adm-sub">{result.dry ? t('admin.io.checkResult') : t('admin.io.imported')}{result.r.title ? `: ${result.r.title}` : ''}</h3>
            <p>{t(result.dry ? 'admin.io.wouldSummary' : 'admin.io.summary', { t: result.r.total, a: result.r.added, u: result.r.updated, s: result.r.skipped })}</p>
            {result.r.errors.length ? (
              <>
                <p className="adm-alert">{t('admin.io.problems', { n: result.r.errors.length })}</p>
                <ul className="adm-errors">{result.r.errors.slice(0, 50).map(e => <li key={e}>{e}</li>)}</ul>
              </>
            ) : <p className="faint">{t('admin.io.noProblems')}</p>}
          </div>
        ) : null}
      </Card>

      <div className="adm-grid2">
        <Card title={t('admin.io.export')}>
          <p className="faint">{t('admin.io.exportNote')}</p>
          <div className="row">
            <a className="px-btn px-btn--small px-btn--navy" href="/api/admin/export?format=txt" download>{t('admin.io.text')}</a>
            <a className="px-btn px-btn--small px-btn--navy" href="/api/admin/export?format=csv" download>{t('admin.io.csv')}</a>
            <a className="px-btn px-btn--small px-btn--navy" href="/api/admin/export?format=json" download>{t('admin.io.json')}</a>
          </div>
        </Card>
        <Card title={t('admin.io.backup')}>
          <p className="faint">{t('admin.io.backupNote')}</p>
          <a className="px-btn px-btn--small" href="/api/admin/backup" download>{t('admin.io.downloadBackup')}</a>
        </Card>
      </div>
    </>
  );
}
