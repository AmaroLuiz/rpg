import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { lazy, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthProvider, RequireAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import './i18n';
import './index.css';
import { persister, queryClient } from './sync';
import { Campaigns } from './pages/Campaigns';
import { Login } from './pages/Login';


// Cada tela vira um pedaço separado, baixado na primeira vez que é aberta.
const Campaign = lazy(() => import('./pages/Campaign').then((m) => ({ default: m.Campaign })));
const CharacterSheet = lazy(() => import('./pages/CharacterSheet').then((m) => ({ default: m.CharacterSheet })));
const CreateCharacter = lazy(() => import('./pages/CreateCharacter').then((m) => ({ default: m.CreateCharacter })));
const Join = lazy(() => import('./pages/Join').then((m) => ({ default: m.Join })));
const NewCampaign = lazy(() => import('./pages/NewCampaign').then((m) => ({ default: m.NewCampaign })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const Rolls = lazy(() => import('./pages/Rolls').then((m) => ({ default: m.Rolls })));
const Combat = lazy(() => import('./pages/Combat').then((m) => ({ default: m.Combat })));
const Handouts = lazy(() => import('./pages/Handouts').then((m) => ({ default: m.Handouts })));
const Items = lazy(() => import('./pages/Items').then((m) => ({ default: m.Items })));
const Maps = lazy(() => import('./pages/Maps').then((m) => ({ default: m.Maps })));
const MapBoard = lazy(() => import('./pages/MapBoard').then((m) => ({ default: m.MapBoard })));
const Journal = lazy(() => import('./pages/Journal').then((m) => ({ default: m.Journal })));

const router = createBrowserRouter([
  { path: '/entrar', element: <Login /> },
  {
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <Campaigns /> },
      { path: '/mesas/nova', element: <NewCampaign /> },
      { path: '/mesas/:id', element: <Campaign /> },
      { path: '/mesas/:id/personagens/:charId', element: <CharacterSheet /> },
      { path: '/mesas/:id/personagens/:charId/criar', element: <CreateCharacter /> },
      { path: '/mesas/:id/rolagens', element: <Rolls /> },
      { path: '/mesas/:id/combate', element: <Combat /> },
      { path: '/mesas/:id/itens', element: <Items /> },
      { path: '/mesas/:id/handouts', element: <Handouts /> },
      { path: '/mesas/:id/mapas', element: <Maps /> },
      { path: '/mesas/:id/mapas/:mapId', element: <MapBoard /> },
      { path: '/mesas/:id/diario', element: <Journal mode="session" /> },
      { path: '/mesas/:id/notas', element: <Journal mode="notes" /> },
      { path: '/convite/:code', element: <Join /> },
      { path: '/perfil', element: <Profile /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 7 * 24 * 3600 * 1000, buster: 'v2' }}
      // O cache do aparelho só serve para mostrar algo na hora; depois de restaurado, tudo é relido.
      onSuccess={() => void queryClient.invalidateQueries()}
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
