import { createBrowserRouter, Navigate, useRouteError } from 'react-router';
import { ErrorNote } from '../ui/Status.tsx';
import { GuestOnly, RequireUser } from './guards.tsx';
import { Shell } from './Shell.tsx';
import { Home } from '../screens/Home.tsx';
import { Play } from '../screens/play/Play.tsx';
import { Results } from '../screens/Results.tsx';
import { Leaderboard } from '../screens/Leaderboard.tsx';
import { Archive } from '../screens/Archive.tsx';
import { Stats } from '../screens/Stats.tsx';
import { Wardrobe } from '../screens/Wardrobe.tsx';
import { Games } from '../screens/games/Games.tsx';
import { GamePage } from '../screens/games/GamePage.tsx';
import { GameEditor } from '../screens/games/GameEditor.tsx';
import { How } from '../screens/How.tsx';
import { Login } from '../screens/auth/Login.tsx';
import { Register } from '../screens/auth/Register.tsx';
import { Setup } from '../screens/auth/Setup.tsx';
import { Password } from '../screens/auth/Password.tsx';

function RouteError() {
  const error = useRouteError();
  return (
    <div className="route-error">
      <ErrorNote error={error} onRetry={() => window.location.reload()} />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    // The admin pages are a separate, plain layout and a separate download.
    path: '/admin/*',
    lazy: async () => ({ Component: (await import('../admin/AdminApp.tsx')).AdminApp }),
    errorElement: <RouteError />,
  },
  {
    element: <Shell />,
    errorElement: <RouteError />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: 'login', element: <Login /> },
          { path: 'register', element: <Register /> },
          { path: 'setup/:token?', element: <Setup /> },
        ],
      },
      {
        element: <RequireUser />,
        children: [
          { index: true, element: <Home /> },
          { path: 'play', element: <Play /> },
          { path: 'play/:key', element: <Play /> },
          { path: 'results/:key', element: <Results /> },
          { path: 'leaderboard', element: <Leaderboard /> },
          { path: 'archive', element: <Archive /> },
          { path: 'stats', element: <Stats /> },
          { path: 'wardrobe', element: <Wardrobe /> },
          { path: 'games', element: <Games /> },
          { path: 'games/new', element: <GameEditor /> },
          { path: 'g/:slug', element: <GamePage /> },
          { path: 'g/:slug/edit', element: <GameEditor /> },
          { path: 'how', element: <How /> },
          { path: 'password', element: <Password /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
