import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthProvider, RequireAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import './i18n';
import './index.css';
import { Campaign } from './pages/Campaign';
import { Campaigns } from './pages/Campaigns';
import { Join } from './pages/Join';
import { Login } from './pages/Login';
import { NewCampaign } from './pages/NewCampaign';
import { Profile } from './pages/Profile';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 10_000 } },
});

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
      { path: '/convite/:code', element: <Join /> },
      { path: '/perfil', element: <Profile /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
