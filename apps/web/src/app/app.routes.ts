import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.HomePage),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'me/servers',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/my-servers/my-servers').then((m) => m.MyServersPage),
  },
  {
    path: 'me/servers/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/server-settings/server-settings').then(
        (m) => m.ServerSettingsPage,
      ),
  },
  {
    path: 's/:slug',
    loadComponent: () =>
      import('./pages/server-shell/server-shell').then((m) => m.ServerShell),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/map-page/map-page').then((m) => m.MapPage),
      },
      {
        path: 'palbox',
        loadComponent: () =>
          import('./pages/palbox-page/palbox-page').then((m) => m.PalboxPage),
      },
      {
        path: 'palbox/p/:key',
        loadComponent: () =>
          import('./pages/box-page/box-page').then((m) => m.BoxPage),
      },
      {
        path: 'breeding',
        loadComponent: () =>
          import('./pages/breeding-page/breeding-page').then(
            (m) => m.BreedingPage,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
