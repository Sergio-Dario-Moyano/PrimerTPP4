import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { permisoGuard, panelGuard } from './core/guards/admin-guard-guard';

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
    path: 'proximamente',
    loadComponent: () => import('./features/public/proximamente/proximamente.component').then(m => m.ProximamenteComponent)
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
    // Candy suelto: comprar productos sin entradas (pestaña "Candy Bar" del navbar)
    path: 'candy',
    loadComponent: () => import('./features/public/candy/candy.component').then(m => m.CandyComponent)
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
        path: 'espera',
        loadComponent: () => import('./features/profile/listas-espera/listas-espera.component').then(m => m.ListasEsperaComponent)
      },
      {
        path: 'propuesta',
        loadComponent: () => import('./features/profile/mi-propuesta/mi-propuesta.component').then(m => m.MiPropuestaComponent)
      },
      {
        path: 'cupones',
        loadComponent: () => import('./features/profile/cupon-bienvenida/cupon-bienvenida.component').then(m => m.CuponBienvenidaComponent)
      }
    ]
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin/admin.component').then(m => m.AdminComponent),
    // Admin y empleados entran al panel; cada sección define quién puede verla
    canActivate: [authGuard, panelGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'peliculas' },
      {
        path: 'peliculas',
        canActivate: [permisoGuard('peliculas')],
        loadComponent: () => import('./features/admin/admin/admin-peliculas/admin-peliculas.component').then(m => m.AdminPeliculasComponent)
      },
      {
        path: 'funciones',
        canActivate: [permisoGuard('funciones')],
        loadComponent: () => import('./features/admin/admin/admin-funciones/admin-funciones.component').then(m => m.AdminFuncionesComponent)
      },
      {
        path: 'candy',
        canActivate: [permisoGuard('candy')],
        loadComponent: () => import('./features/admin/admin/admin-candy/admin-candy.component').then(m => m.AdminCandyComponent)
      },
      {
        path: 'cupones',
        canActivate: [permisoGuard('cupones')],
        loadComponent: () => import('./features/admin/admin/admin-cupones/admin-cupones.component').then(m => m.AdminCuponesComponent)
      },
      {
        path: 'fidelizacion',
        canActivate: [permisoGuard('fidelizacion')],
        loadComponent: () => import('./features/admin/admin/admin-fidelizacion/admin-fidelizacion.component').then(m => m.AdminFidelizacionComponent)
      },
      {
        path: 'propuestas',
        canActivate: [permisoGuard('propuestas')],
        loadComponent: () => import('./features/admin/admin/admin-propuestas/admin-propuestas.component').then(m => m.AdminPropuestasComponent)
      },
      {
        path: 'reportes',
        canActivate: [permisoGuard('reportes')],
        loadComponent: () => import('./features/admin/admin/admin-reportes/admin-reportes.component').then(m => m.AdminReportesComponent)
      },
      {
        path: 'log',
        canActivate: [permisoGuard('log')],
        loadComponent: () => import('./features/admin/admin/admin-log/admin-log.component').then(m => m.AdminLogComponent)
      },
      {
        path: 'roles',
        canActivate: [permisoGuard('roles')],
        loadComponent: () => import('./features/admin/admin/admin-roles/admin-roles.component').then(m => m.AdminRolesComponent)
      },
      {
        path: 'validar',
        canActivate: [permisoGuard('validar_sala', 'validar_candy')],
        loadComponent: () => import('./features/admin/admin/validar-qr/validar-qr.component').then(m => m.ValidarQrComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'home'
  }
];
