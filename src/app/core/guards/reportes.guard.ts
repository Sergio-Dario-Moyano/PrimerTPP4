import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermisosService } from '../services/permisos.service';

/** Protege /admin/reportes: sección "Reportes". */
export const reportesGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const permisos = inject(PermisosService);

  const haySesion = await permisos.cargarSesionActual();
  if (!haySesion) return router.createUrlTree(['/login']);

  if (permisos.puede('reportes')) return true;

  // Sin permiso: lo mandamos a la primera sección del panel que sí puede ver
  return router.createUrlTree([permisos.primeraRuta() ?? '/home']);
};
