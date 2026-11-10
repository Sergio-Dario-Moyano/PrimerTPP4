import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { SupabaseService } from '../services/supabase';

export type Rol = 'cliente' | 'admin' | 'empleado_cine' | 'empleado_candy';
export const ROLES_STAFF: Rol[] = ['admin', 'empleado_cine', 'empleado_candy'];

/**
 * Guard funcional parametrizable por rol.
 * Ej: canActivate: [rolGuard('admin')] o canActivate: [rolGuard(...ROLES_STAFF)]
 */
export const rolGuard = (...rolesPermitidos: Rol[]): CanActivateFn => async () => {
  const supabase = inject(SupabaseService).client;
  const router = inject(Router);

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return router.createUrlTree(['/login']);
  }

  try {
    const { data: perfil, error } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('id', sessionData.session.user.id)
      .single();

    if (error) throw error;

    const rol = perfil?.rol as Rol;
    if (rolesPermitidos.includes(rol)) return true;

    // Un empleado que intenta entrar a una sección de admin va directo al validador
    if (rol === 'empleado_cine' || rol === 'empleado_candy') {
      return router.createUrlTree(['/admin/validar']);
    }
  } catch (error) {
    console.error('Error verificando rol:', error);
  }

  return router.createUrlTree(['/home']);
};

/** Se mantiene por compatibilidad: solo administradores. */
export const adminGuard: CanActivateFn = rolGuard('admin');

















// import { inject } from '@angular/core';
// import { Router, CanActivateFn } from '@angular/router';
// import { SupabaseService } from '../services/supabase';

// export const adminGuard: CanActivateFn = async (route, state) => {
//   const supabase = inject(SupabaseService).client;
//   const router = inject(Router);

//   //Verificar si hay sesión activa
//   const { data: sessionData } = await supabase.auth.getSession();

//   if (!sessionData.session) {
//     return router.createUrlTree(['/login']); // Redirigir al login si no está logueado
//   }

//   //Verificar el rol en la tabla pública de perfiles
//   try {
//     const { data: perfil, error } = await supabase
//       .from('perfiles')
//       .select('rol')
//       .eq('id', sessionData.session.user.id)
//       .single();

//     if (error) throw error;

//     if (perfil && perfil.rol === 'admin') {
//       return true; // Es admin, permito el acceso
//     }
//   } catch (error) {
//     console.error('Error verificando rol de admin:', error);
//   }

//   // Si no es admin o hubo un error, se lo expulsa a la cartelera
//   return router.createUrlTree(['/home']);
// };
