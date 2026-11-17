// Route guards. The Shell only renders its outlet once /api/me has loaded, so these read settled data.
import { Navigate, Outlet, useLocation } from 'react-router';
import type { MeResponse, UserView } from '../../../shared/api.ts';
import { useMe } from '../lib/queries.ts';

/** Signed-in player routes. Sends people to setup, sign-in or the forced password change as needed. */
export function RequireUser() {
  const me = useMe().data;
  const loc = useLocation();
  if (!me) return null;
  if (me.needsSetup) return <Navigate to="/setup" replace />;
  if (!me.user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (me.user.mustChange && loc.pathname !== '/password') return <Navigate to="/password" replace />;
  return <Outlet />;
}

/** Sign-in pages: a signed-in player has nothing to do here. */
export function GuestOnly() {
  const me = useMe().data;
  const loc = useLocation();
  if (!me) return null;
  if (me.user) return <Navigate to={safeNext(loc.search)} replace />;
  if (me.needsSetup && !loc.pathname.startsWith('/setup')) return <Navigate to="/setup" replace />;
  return <Outlet />;
}

/** The signed-in user; only call below RequireUser. */
export function useUser(): { user: UserView; me: MeResponse } {
  const me = useMe().data;
  if (!me?.user) throw new Error('useUser outside RequireUser');
  return { user: me.user, me };
}

/** The ?next= path after signing in, limited to this site's own paths. */
export function safeNext(search: string): string {
  const next = new URLSearchParams(search).get('next') ?? '/';
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}
