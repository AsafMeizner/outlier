// Loading and error states shared by every screen.
import { useI18n } from '../i18n/index.tsx';
import { ApiError } from '../lib/api.ts';

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="status-line" role="status">
      <span className="px-loading" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="sr-only">{label ?? t('common.loading')}</span>
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, server } = useI18n();
  const msg = error instanceof ApiError ? server(error.message) : t('common.error');
  return (
    <div className="status-line status-line--error" role="alert">
      <p>{msg}</p>
      {onRetry ? (
        <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={onRetry}>
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  );
}
