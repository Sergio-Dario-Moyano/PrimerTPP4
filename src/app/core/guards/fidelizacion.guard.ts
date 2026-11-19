import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermisosService } from '../services/permisos.service';

/** Protege /admin/fidelizacion: sección "Puntos y Canjes". */
export const fidelizacionGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const permisos = inject(PermisosService);

  const haySesion = await permisos.cargarSesionActual();
  if (!haySesion) return router.createUrlTree(['/login']);

  if (permisos.puede('fidelizacion')) return true;

  // Sin permiso: lo mandamos a la primera sección del panel que sí puede ver
  return router.createUrlTree([permisos.primeraRuta() ?? '/home']);
};
