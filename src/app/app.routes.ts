import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { adminGuard } from './core/guards/admin-guard-guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'home',
    loadComponent: () => import('./features/public/cartelera/cartelera.component').then(m => m.CarteleraComponent)
  },
  {
    path: 'pelicula/:id',
    loadComponent: () => import('./features/public/detalle-pelicula/detalle-pelicula.component').then(m => m.DetallePeliculaComponent)
  },
  {
    path: 'sala/:id',
    loadComponent: () => import('./features/public/book-seats/book-seats.component').then(m => m.BookSeatsComponent)
  },
  {
    path: 'confiteria/:id',
    loadComponent: () => import('./features/public/candy/candy.component').then(m => m.CandyComponent)
  },
  {
    path: 'checkout',
    loadComponent: () => import('./features/public/checkout/checkout.component').then(m => m.CheckoutComponent)
  },
  {
    path: 'ticket/:id',
    loadComponent: () => import('./features/public/ticket/ticket.component').then(m => m.TicketComponent)
  },
  {
    path: 'perfil',
    loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/profile/mis-entradas/mis-entradas.component').then(m => m.MisEntradasComponent)
      },
      {
        path: 'puntos',
        loadComponent: () => import('./features/profile/puntos/puntos.component').then(m => m.PuntosComponent)
      },
      {
        path: 'canjes',
        loadComponent: () => import('./features/profile/historial-canjes/historial-canjes.component').then(m => m.HistorialCanjesComponent)
      },
      {
        path: 'peliculas',
        loadComponent: () => import('./features/profile/mis-peliculas/mis-peliculas.component').then(m => m.MisPeliculasComponent)
      },
      {
        path: 'cupones',
        loadComponent: () => import('./features/profile/cupon-bienvenida/cupon-bienvenida.component').then(m => m.CuponBienvenidaComponent)
      }
    ]
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin/admin.component').then(m => m.AdminComponent), // <--- CORREGIDO: Carga el contenedor con la barra lateral
    canActivate: [authGuard, adminGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/admin/admin/admin-gestion/admin-gestion.component').then(m => m.AdminGestionComponent)
      },
      {
        path: 'validar',
        loadComponent: () => import('./features/admin/admin/validar-qr/validar-qr.component').then(m => m.ValidarQrComponent)
      },
      {
        path: 'reportes',
        loadComponent: () => import('./features/admin/admin/admin-reportes/admin-reportes.component').then(m => m.AdminReportesComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'home'
  }
];
