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





















// import { inject } from '@angular/core';
// import { Router, CanActivateFn } from '@angular/router';
// import { SupabaseService } from '../services/supabase';

// export type Rol = 'cliente' | 'admin' | 'empleado_cine' | 'empleado_candy';
// export const ROLES_STAFF: Rol[] = ['admin', 'empleado_cine', 'empleado_candy'];

// /**
//  * Guard funcional parametrizable por rol.
//  * Ej: canActivate: [rolGuard('admin')] o canActivate: [rolGuard(...ROLES_STAFF)]
//  */
// export const rolGuard = (...rolesPermitidos: Rol[]): CanActivateFn => async () => {
//   const supabase = inject(SupabaseService).client;
//   const router = inject(Router);

//   const { data: sessionData } = await supabase.auth.getSession();
//   if (!sessionData.session) {
//     return router.createUrlTree(['/login']);
//   }

//   try {
//     const { data: perfil, error } = await supabase
//       .from('perfiles')
//       .select('rol')
//       .eq('id', sessionData.session.user.id)
//       .single();

//     if (error) throw error;

//     const rol = perfil?.rol as Rol;
//     if (rolesPermitidos.includes(rol)) return true;

//     // Un empleado que intenta entrar a una sección de admin va directo al validador
//     if (rol === 'empleado_cine' || rol === 'empleado_candy') {
//       return router.createUrlTree(['/admin/validar']);
//     }
//   } catch (error) {
//     console.error('Error verificando rol:', error);
//   }

//   return router.createUrlTree(['/home']);
// };

// /** Se mantiene por compatibilidad: solo administradores. */
// export const adminGuard: CanActivateFn = rolGuard('admin');





