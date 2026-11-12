import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { SupabaseService } from '../services/supabase';
import { PermisosService, ClavePermiso } from '../services/permisos.service';

export type Rol = 'cliente' | 'admin' | 'empleado_cine' | 'empleado_candy';

/** Carga los permisos del usuario de la sesión; devuelve false si no hay sesión. */
async function cargarSesion(): Promise<boolean> {
  const supabase = inject(SupabaseService).client;
  const permisos = inject(PermisosService);
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id ?? null;
  await permisos.cargarPara(userId);
  return !!userId;
}

/**
 * Guard por sección del panel (roles configurables).
 * Ej: canActivate: [permisoGuard('reportes')]
 * Si no tiene ese permiso pero sí otros, lo manda a la primera sección que puede ver.
 */
export const permisoGuard = (...claves: ClavePermiso[]): CanActivateFn => async () => {
  const router = inject(Router);
  const permisos = inject(PermisosService);

  if (!(await cargarSesion())) return router.createUrlTree(['/login']);
  if (claves.some(c => permisos.puede(c))) return true;

  const primera = permisos.primeraRuta();
  return router.createUrlTree([primera ?? '/home']);
};

/** Entrada al panel: cualquier usuario con al menos un permiso. */
export const panelGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const permisos = inject(PermisosService);

  if (!(await cargarSesion())) return router.createUrlTree(['/login']);
  return permisos.tieneAccesoPanel() ? true : router.createUrlTree(['/home']);
};

/** Solo el rol base admin (se mantiene por compatibilidad). */
export const adminGuard: CanActivateFn = permisoGuard('roles');
