import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermisosService } from '../services/permisos.service';

/**
 * Protege /admin (la ruta padre del panel).
 * Deja entrar a cualquier usuario con al menos un permiso (admin, empleados o rol configurable).
 * Después, cada ruta hija tiene su propio guard para su sección.
 */
export const panelGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const permisos = inject(PermisosService);

  const haySesion = await permisos.cargarSesionActual();
  if (!haySesion) return router.createUrlTree(['/login']);

  return permisos.tieneAccesoPanel() ? true : router.createUrlTree(['/home']);
};
